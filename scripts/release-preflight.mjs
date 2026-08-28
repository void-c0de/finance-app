import { execSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';

/**
 * release:preflight — one machine-readable snapshot of everything that decides
 * whether a release can proceed. Fast (no gradle, no expo export). Pure read.
 *
 *   npm run release:preflight            human summary
 *   npm run release:preflight -- --json  full JSON (for CI / release:candidate)
 *
 * Never prints a secret value. Aggregates:
 *   - version / runtime / git coordinates
 *   - release:doctor --json (blocking-gate view)
 *   - providers:doctor --json (external provider config, names only)
 *   - release-evidence.json (what is REAL vs engineered)
 *   - presence of the store submission artefacts
 */

const JSON_OUT = process.argv.includes('--json');

function sh(cmd) {
  try { return execSync(cmd, { stdio: ['ignore', 'pipe', 'ignore'], timeout: 120_000 }).toString().trim(); }
  catch (e) { return (e.stdout?.toString() ?? '').trim(); }
}
function shJson(cmd) {
  const out = sh(cmd);
  const s = out.indexOf('{');
  try { return s >= 0 ? JSON.parse(out.slice(s)) : null; } catch { return null; }
}

const app = JSON.parse(readFileSync('app.json', 'utf8')).expo;
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const ev = existsSync('store-assets/release-evidence.json')
  ? JSON.parse(readFileSync('store-assets/release-evidence.json', 'utf8')) : null;

const doctor = shJson('node scripts/release-doctor.mjs --fast --json');
const providers = shJson('node scripts/providers-doctor.mjs --json');

const submissionFiles = [
  'store-assets/play-icon-512.png',
  'store-assets/feature-graphic.png',
  'STORE_LISTING.md',
  'PLAY_DATA_SAFETY.md',
  'PLAY_FINANCIAL_FEATURES.md',
  'PLAY_APP_CONTENT.md',
  'PLAY_IARC_PREP.md',
  'PLAY_RELEASE_NOTES.md',
];
const screenshots = existsSync('store-assets/android')
  ? readdirSync('store-assets/android').filter((f) => /^candidate.*\.(png|jpe?g)$/i.test(f)) : [];

const gates = {
  ci: null, // filled by release:candidate; preflight leaves null (fast mode)
  secretGuard: (() => { try { execSync('node scripts/ci-secret-guard.mjs', { stdio: 'ignore' }); return true; } catch { return false; } })(),
  otaManifest: (() => { try { execSync('node scripts/test-ota-manifest.mjs', { stdio: 'ignore' }); return true; } catch { return false; } })(),
  legal: (() => { try { execSync('node scripts/check-legal.mjs', { stdio: 'ignore' }); return true; } catch { return false; } })(),
  brandAssets: (() => { try { execSync('node scripts/validate-store-assets.mjs', { stdio: 'ignore' }); return true; } catch { return false; } })(),
};

const gitSha = sh('git rev-parse --short HEAD');
const gitDirty = sh('git status --porcelain').length > 0;
const gitAhead = Number(sh('git rev-list --count origin/master..HEAD') || '0');

const snapshot = {
  schema: 'finance-app/release-preflight@1',
  generatedForSha: gitSha,
  version: app.version,
  versionCode: app.android?.versionCode,
  iosBuildNumber: app.ios?.buildNumber,
  runtimeVersionPolicy: app.runtimeVersion?.policy,
  git: { sha: gitSha, dirty: gitDirty, aheadOfOrigin: gitAhead, clean: !gitDirty && gitAhead === 0 },
  gates,
  doctor: doctor
    ? { closedTestReady: doctor.closedTestReady, blockingCount: doctor.blockingCount, blockingGates: (doctor.rows ?? []).filter((r) => r.blocking && ['FAIL', 'EXTERNAL BLOCKER', 'NOT CONFIGURED'].includes(r.status)).map((r) => r.name) }
    : { error: 'release:doctor did not return JSON' },
  providers: providers?.checks ?? { error: 'providers:doctor did not return JSON' },
  evidence: ev ? {
    sha: ev.gitSha,
    signingProvenEphemeral: ev.signing?.production_branch_proven_ephemeral ?? false,
    uploadKeyConfigured: ev.signing?.upload_key_configured ?? false,
    anyRealGoogle: Object.entries(ev.google ?? {}).some(([k, v]) => k.endsWith('_real') && v === true),
    anyRealApple: Object.entries(ev.apple ?? {}).some(([k, v]) => k.endsWith('_real') && v === true),
    playAppExists: ev.play_console?.app_exists ?? false,
    closedTestUploaded: ev.play_console?.aab_uploaded_closed_test ?? false,
    tinkProduction: ev.tink?.production_configured ?? false,
  } : { error: 'no release-evidence.json' },
  submissionBundle: {
    files: Object.fromEntries(submissionFiles.map((f) => [f, existsSync(f)])),
    screenshotCount: screenshots.length,
    complete: submissionFiles.every(existsSync) && screenshots.length >= 4,
  },
  tests: { total: Object.keys(pkg.scripts).filter((k) => k.startsWith('test:')).length },
};

// verdicts per delivery track — a plain roll-up, the human wording lives in release:go-no-go
snapshot.verdicts = {
  engineeringClosedTest:
    snapshot.gates.secretGuard && snapshot.gates.otaManifest && snapshot.gates.brandAssets && snapshot.submissionBundle.complete
      ? 'GO (engineering build; banking + billing run in sandbox/fixture mode)'
      : 'NO-GO (a local gate is failing)',
  realClosedTest:
    snapshot.evidence.playAppExists && snapshot.evidence.uploadKeyConfigured && snapshot.gates.legal
      ? 'GO'
      : 'NO-GO (needs: Play Console app + upload keystore + filled legal facts — maintainer-held)',
  production:
    snapshot.evidence.closedTestUploaded && snapshot.evidence.anyRealGoogle
      ? 'GO'
      : 'NO-GO (needs a completed real closed test + real Google verification)',
};

if (JSON_OUT) {
  console.log(JSON.stringify(snapshot, null, 2));
} else {
  const g = snapshot.gates;
  console.log(`finance-app preflight @ ${gitSha}  v${app.version} (vc ${app.android?.versionCode})`);
  console.log(`  git:            ${snapshot.git.clean ? 'clean + pushed' : `${gitDirty ? 'DIRTY ' : ''}${gitAhead ? `${gitAhead} ahead` : ''}`}`);
  console.log(`  local gates:    secret-guard ${g.secretGuard ? '✓' : '✗'}  ota-manifest ${g.otaManifest ? '✓' : '✗'}  legal ${g.legal ? '✓' : '✗'}  brand-assets ${g.brandAssets ? '✓' : '✗'}`);
  console.log(`  release:doctor: ${snapshot.doctor.closedTestReady ? 'closed test READY' : `${snapshot.doctor.blockingCount} blocking gate(s)`}`);
  console.log(`  providers:      ${Object.entries(snapshot.providers).map(([k, v]) => `${k}=${String(v).split(' ')[0]}`).join('  ')}`);
  console.log(`  submission:     ${snapshot.submissionBundle.complete ? 'complete' : 'incomplete'} (${snapshot.submissionBundle.screenshotCount} screenshots)`);
  console.log('');
  for (const [track, verdict] of Object.entries(snapshot.verdicts)) console.log(`  ${track.padEnd(22)} ${verdict}`);
}
