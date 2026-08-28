import { execSync } from 'node:child_process';

/**
 * release:go-no-go — the single verdict command. Runs release:preflight and
 * prints GO / NO-GO for each delivery track with the blocking reasons.
 *
 *   npm run release:go-no-go              full check (runs the CI test suite)
 *   npm run release:go-no-go -- --fast    skip the CI suite (trust last run)
 *   npm run release:go-no-go -- --json
 *
 * Exit code: 0 if the ENGINEERING CLOSED TEST track is GO, else 1.
 * (The REAL and PRODUCTION tracks are expected NO-GO until the maintainer
 *  supplies external credentials — that must not fail CI.)
 */

const FAST = process.argv.includes('--fast');
const JSON_OUT = process.argv.includes('--json');

function shJson(cmd) {
  try {
    const out = execSync(cmd, { stdio: ['ignore', 'pipe', 'ignore'], timeout: 600_000 }).toString();
    return JSON.parse(out.slice(out.indexOf('{')));
  } catch (e) {
    const out = e.stdout?.toString() ?? '';
    try { return JSON.parse(out.slice(out.indexOf('{'))); } catch { return null; }
  }
}

const pf = shJson('node scripts/release-preflight.mjs --json');
if (!pf) {
  console.error('release:go-no-go: preflight did not produce JSON');
  process.exit(1);
}

let ciPass = null;
if (!FAST) {
  try { execSync('npm run --silent test:all', { stdio: 'ignore', timeout: 600_000 }); ciPass = true; }
  catch { ciPass = false; }
}

const reasons = { engineeringClosedTest: [], realClosedTest: [], production: [] };

// --- ENGINEERING CLOSED TEST -------------------------------------------------
if (ciPass === false) reasons.engineeringClosedTest.push('CI test suite is red');
if (!pf.gates.secretGuard) reasons.engineeringClosedTest.push('secret guard failing');
if (!pf.gates.otaManifest) reasons.engineeringClosedTest.push('OTA manifest not client-loadable');
if (!pf.gates.brandAssets) reasons.engineeringClosedTest.push('store image assets invalid');
if (!pf.submissionBundle.complete) reasons.engineeringClosedTest.push('submission bundle incomplete');
// On CI we are always on an already-committed, pushed SHA; a "dirty" tree there
// only means the read-only checks regenerated a build artefact.
if (pf.git.dirty && !process.env.CI) reasons.engineeringClosedTest.push('working tree dirty (commit first)');

// --- REAL CLOSED TEST ------------------------------------------------------
if (!pf.evidence.playAppExists) reasons.realClosedTest.push('Play Console app does not exist yet (maintainer)');
if (!pf.evidence.uploadKeyConfigured) reasons.realClosedTest.push('upload keystore not configured (FINANCE_UPLOAD_* — maintainer)');
if (!pf.gates.legal) reasons.realClosedTest.push('legal facts unfilled (legal/legal.config.json — maintainer)');

// --- PRODUCTION ----------------------------------------------------------
if (!pf.evidence.closedTestUploaded) reasons.production.push('no AAB on a real closed-test track');
if (!pf.evidence.anyRealGoogle) reasons.production.push('no real Google Play verification has happened');
if (!pf.evidence.anyRealApple) reasons.production.push('no real Apple verification (needs paid Apple Developer Program)');
if (pf.evidence.tinkProduction === false) reasons.production.push('Tink is sandbox-only (banking would be demo in production)');

const verdict = (t) => (reasons[t].length === 0 ? 'GO' : 'NO-GO');
const out = {
  schema: 'finance-app/release-go-no-go@1',
  sha: pf.generatedForSha,
  version: pf.version,
  versionCode: pf.versionCode,
  ciSuite: ciPass === null ? 'skipped (--fast)' : ciPass ? 'green' : 'RED',
  tracks: {
    engineeringClosedTest: { verdict: verdict('engineeringClosedTest'), blockers: reasons.engineeringClosedTest },
    realClosedTest: { verdict: verdict('realClosedTest'), blockers: reasons.realClosedTest },
    production: { verdict: verdict('production'), blockers: reasons.production },
  },
};

if (JSON_OUT) {
  console.log(JSON.stringify(out, null, 2));
} else {
  console.log(`\n  finance-app  v${out.version} (vc ${out.versionCode})  @ ${out.sha}   CI: ${out.ciSuite}\n`);
  for (const [track, r] of Object.entries(out.tracks)) {
    const label = { engineeringClosedTest: 'ENGINEERING CLOSED TEST', realClosedTest: 'REAL CLOSED TEST', production: 'PRODUCTION' }[track];
    console.log(`  ${label.padEnd(24)} ${r.verdict}`);
    for (const b of r.blockers) console.log(`      – ${b}`);
  }
  console.log('');
}

process.exit(verdict('engineeringClosedTest') === 'GO' ? 0 : 1);
