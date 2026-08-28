import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

/**
 * release:candidate — one command that turns the current commit into a
 * fully-recorded release candidate.
 *
 *   npm run release:candidate -- --engineering   (default)
 *   npm run release:candidate -- --production
 *   npm run release:candidate -- --engineering --skip-build   (docs/evidence only)
 *
 * ENGINEERING: builds a debug-signed APK + AAB for on-device / internal QA.
 *              Banking runs in Tink sandbox, billing runs against fixtures.
 *              This is the artefact for the ENGINEERING closed test.
 *
 * PRODUCTION:  REQUIRES the real upload keystore (FINANCE_UPLOAD_STORE_FILE +
 *              _STORE_PASSWORD + _KEY_ALIAS + _KEY_PASSWORD). If any is missing
 *              the run ABORTS — it never silently substitutes the debug key.
 *              Produces an upload-signed AAB and verifies it.
 *
 * Every run: preflight snapshot, gradle build, semantic AAB fingerprint,
 * release manifest, and an immutable archive under
 * `.artifacts/releases/<version>-vc<code>/<mode>-<shortSha>/`.
 */

const argv = process.argv.slice(2);
const MODE = argv.includes('--production') ? 'production' : 'engineering';
const SKIP_BUILD = argv.includes('--skip-build');

const app = JSON.parse(readFileSync('app.json', 'utf8')).expo;
const version = app.version;
const versionCode = app.android?.versionCode;

function run(cmd, opts = {}) {
  console.log(`\n$ ${cmd}`);
  execSync(cmd, { stdio: 'inherit', ...opts });
}
function capture(cmd) {
  try { return execSync(cmd, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { return ''; }
}
function sha256(path) {
  return existsSync(path) ? createHash('sha256').update(readFileSync(path)).digest('hex') : null;
}

const shortSha = capture('git rev-parse --short HEAD');
const dirty = capture('git status --porcelain') !== '';
console.log(`release:candidate  mode=${MODE}  v${version} vc${versionCode}  git ${shortSha}${dirty ? ' (DIRTY)' : ''}`);

// ---- 1. gate: production requires a real upload key -----------------------
const UPLOAD_VARS = ['FINANCE_UPLOAD_STORE_FILE', 'FINANCE_UPLOAD_STORE_PASSWORD', 'FINANCE_UPLOAD_KEY_ALIAS', 'FINANCE_UPLOAD_KEY_PASSWORD'];
if (MODE === 'production') {
  const missing = UPLOAD_VARS.filter((v) => !process.env[v] || process.env[v].trim() === '');
  if (missing.length) {
    console.error(`\n✗ ABORT: --production needs a real upload keystore. Missing: ${missing.join(', ')}`);
    console.error('  Configure the upload keystore, or run --engineering for an internal build.');
    console.error('  (This tool never falls back to the debug key for a production artefact.)');
    process.exit(1);
  }
  run('node scripts/check-upload-signing.mjs');
}

// ---- 2. preflight --------------------------------------------------------
run('node scripts/release-preflight.mjs');

// ---- 3. quality gate ----------------------------------------------------
if (!argv.includes('--skip-ci')) {
  run('npm run ci');
}

// ---- 4. build ---------------------------------------------------------
const apk = 'android/app/build/outputs/apk/release/app-release.apk';
const aab = 'android/app/build/outputs/bundle/release/app-release.aab';

if (!SKIP_BUILD) {
  const gradle = process.platform === 'win32' ? 'gradlew.bat' : './gradlew';
  run(`cd android && ${gradle} clean`);
  run(`cd android && ${gradle} assembleRelease bundleRelease --rerun-tasks`);
} else {
  console.log('\n(--skip-build: using whatever is already in android/app/build/outputs)');
}

// ---- 5. verify signing --------------------------------------------------
let signing = 'unknown';
if (existsSync(aab)) {
  const expectFlag = MODE === 'production' ? ' --expect-production' : '';
  try {
    execSync(`node scripts/verify-release-signing.mjs ${aab}${expectFlag}`, { stdio: 'inherit' });
    signing = MODE === 'production' ? 'production' : (/DEBUG/i.test(capture(`node scripts/verify-release-signing.mjs ${aab}`)) ? 'debug' : 'production');
  } catch {
    if (MODE === 'production') { console.error('\n✗ ABORT: production AAB is not upload-signed'); process.exit(1); }
    signing = 'debug';
  }
}

// ---- 6. fingerprint + manifest ---------------------------------------
if (existsSync(aab)) run(`node scripts/aab-fingerprint.mjs ${aab} --write`, { env: { ...process.env, GIT_SHA: shortSha } });
else if (existsSync(apk)) run(`node scripts/aab-fingerprint.mjs ${apk} --write`, { env: { ...process.env, GIT_SHA: shortSha } });
run('node scripts/build-release-manifest.mjs');
run('node scripts/update-release-evidence.mjs || true');

// ---- 7. archive -----------------------------------------------------
const archiveDir = `.artifacts/releases/${version}-vc${versionCode}/${MODE}-${shortSha}`;
mkdirSync(archiveDir, { recursive: true });
const archived = [];
for (const f of [apk, aab, 'store-assets/release-manifest.json', 'store-assets/aab-fingerprint.json', 'store-assets/release-evidence.json', 'store-assets/aab-validation.json']) {
  if (existsSync(f)) {
    const dest = `${archiveDir}/${f.split('/').pop()}`;
    cpSync(f, dest);
    archived.push({ file: dest, sha256: sha256(dest) });
  }
}
const summary = {
  schema: 'finance-app/release-candidate@1',
  mode: MODE,
  builtAt: capture('git log -1 --format=%cI'),
  git: { shortSha, sha: capture('git rev-parse HEAD'), dirty },
  app: { version, versionCode, androidPackage: app.android?.package, runtimeVersionPolicy: app.runtimeVersion?.policy },
  androidSigning: signing,
  artefacts: archived,
  warning: MODE === 'engineering'
    ? 'ENGINEERING build — debug-signed, Tink sandbox, billing fixtures. NOT for the production track.'
    : 'PRODUCTION build — upload-signed. Verify against RELEASE_ACCEPTANCE.md before submitting.',
};
writeFileSync(`${archiveDir}/candidate.json`, JSON.stringify(summary, null, 2) + '\n');

console.log(`\n✓ release candidate archived → ${archiveDir}`);
for (const a of archived) console.log(`    ${a.file}  ${a.sha256?.slice(0, 16)}…`);
console.log(`\nNext: npm run release:go-no-go`);
