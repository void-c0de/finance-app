import { execSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';

/**
 * Release Doctor 2.0 — reads only local state (+ optional git). No secrets.
 *
 * Status vocabulary:
 *   ENGINEERING PASS  the code/config is done and tested (fixtures ok)
 *   REAL PROVIDER PASS a real request to Google/Apple/Play actually succeeded
 *   PASS              a plain check that has no "real vs engineered" nuance
 *   WARNING           usable, worth a look
 *   NOT CONFIGURED    an internal switch is off (product IDs, env, …)
 *   EXTERNAL BLOCKER  needs something only the maintainer / a store provides
 *   FAIL              something is wrong and should be fixed
 *
 * "REAL" facts come from store-assets/release-evidence.json (updated by
 * scripts/update-release-evidence.mjs as milestones are verified).
 *
 *   npm run release:doctor                 human readable (runs tests/tsc/lint)
 *   npm run release:doctor -- --fast       skip the slow runs
 *   npm run release:doctor -- --json       machine readable
 */

const FAST = process.argv.includes('--fast');
const rows = [];
const add = (name, status, detail = '') => rows.push({ name, status, detail });

function sh(cmd) {
  try {
    return execSync(cmd, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return '';
  }
}
function tryRun(cmd) {
  try {
    execSync(cmd, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const app = JSON.parse(readFileSync('app.json', 'utf8')).expo;
const ev = existsSync('store-assets/release-evidence.json')
  ? JSON.parse(readFileSync('store-assets/release-evidence.json', 'utf8'))
  : null;
const real = (path) => {
  if (!ev) return null;
  return path.split('.').reduce((n, k) => (n && typeof n === 'object' ? n[k] : undefined), ev);
};

// --- version / runtime / git ---------------------------------------
add('VERSION', pkg.version === app.version ? 'PASS' : 'FAIL', `pkg ${pkg.version} · app ${app.version} · vc ${app.android?.versionCode} · iOS build ${app.ios?.buildNumber}`);
add('RUNTIME', app.runtimeVersion?.policy === 'appVersion' ? 'PASS' : 'WARNING', `runtimeVersion.policy=${app.runtimeVersion?.policy}`);
const dirty = sh('git status --porcelain');
add('GIT CLEAN', dirty ? 'WARNING' : 'PASS', dirty ? `${dirty.split('\n').length} uncommitted path(s)` : 'working tree clean');
const ahead = sh('git rev-list --count origin/master..HEAD');
add('GIT PUSHED', ahead && ahead !== '0' ? 'WARNING' : 'PASS', ahead && ahead !== '0' ? `${ahead} commit(s) ahead of origin/master` : 'in sync with origin/master');

// --- tests / typecheck / lint ------------------------------------
if (FAST) {
  add('TESTS', 'WARNING', 'skipped (--fast) — run `npm run ci`');
  add('TYPES', 'WARNING', 'skipped (--fast)');
  add('SECRET GUARD', tryRun('node scripts/ci-secret-guard.mjs') ? 'PASS' : 'FAIL', 'ci-secret-guard.mjs');
  add('EXPO DOCTOR', 'WARNING', 'skipped (--fast)');
} else {
  add('TESTS', tryRun('npm run --silent test:all') ? 'PASS' : 'FAIL', 'node scripts/ci-run-tests.mjs');
  add('TYPES', tryRun('npx --no-install tsc --noEmit') ? 'PASS' : 'FAIL', 'tsc --noEmit');
  add('SECRET GUARD', tryRun('node scripts/ci-secret-guard.mjs') ? 'PASS' : 'FAIL', 'ci-secret-guard.mjs');
  add('EXPO DOCTOR', tryRun('npx --no-install expo-doctor') ? 'PASS' : 'WARNING', 'expo-doctor');
}

// --- android signing --------------------------------------------
add(
  'SIGNING BRANCH',
  real('signing.production_branch_proven_ephemeral') ? 'ENGINEERING PASS'
    : real('signing.production_branch_fixed') ? 'ENGINEERING PASS'
    : 'WARNING',
  real('signing.production_branch_proven_ephemeral')
    ? 'release buildType → signingConfigs.upload; proven with an ephemeral key'
    : 'withFinanceUploadSigning rewires the release buildType (fixed RC8)',
);
add(
  'UPLOAD KEY',
  process.env.FINANCE_UPLOAD_STORE_FILE ? 'ENGINEERING PASS' : 'EXTERNAL BLOCKER',
  process.env.FINANCE_UPLOAD_STORE_FILE ? 'FINANCE_UPLOAD_* present' : 'FINANCE_UPLOAD_* not set (maintainer-held). `npm run check:upload-signing`',
);
const aab = 'android/app/build/outputs/bundle/release/app-release.aab';
if (existsSync(aab) && !FAST) {
  const prod = tryRun(`node scripts/verify-release-signing.mjs ${aab} --expect-production`);
  add('AAB SIGNED', prod ? 'REAL PROVIDER PASS' : 'EXTERNAL BLOCKER', prod ? 'AAB is upload/production-signed' : 'AAB is debug-signed — needs the upload keystore');
} else if (existsSync(aab)) {
  add('AAB SIGNED', 'WARNING', 'AAB present; signing check skipped (--fast)');
} else {
  add('AAB SIGNED', 'NOT CONFIGURED', 'no AAB built (npm run release:android:aab)');
}
add('AAB VALIDATED', existsSync('store-assets/aab-validation.json') ? 'ENGINEERING PASS' : 'NOT CONFIGURED', existsSync('store-assets/aab-validation.json') ? 'bundletool validate result recorded' : 'run `npm run validate:aab`');

// --- google provider ------------------------------------------
add('PLAY PRODUCT IDS',
  process.env.EXPO_PUBLIC_PREMIUM_MONTHLY_ID && process.env.EXPO_PUBLIC_PREMIUM_YEARLY_ID ? 'ENGINEERING PASS' : 'NOT CONFIGURED',
  process.env.EXPO_PUBLIC_PREMIUM_MONTHLY_ID ? 'EXPO_PUBLIC_PREMIUM_*_ID set' : 'EXPO_PUBLIC_PREMIUM_MONTHLY_ID / _YEARLY_ID unset → billing shows "Preise folgen"');
add('GOOGLE SERVER CONFIG',
  real('google.service_account_configured') ? 'ENGINEERING PASS' : 'EXTERNAL BLOCKER',
  'GOOGLE_PLAY_SERVICE_ACCOUNT_JSON + GOOGLE_PLAY_PACKAGE_NAME (Supabase Function secrets)');
add('GOOGLE API AUTH (REAL)',
  real('google.api_auth_real') ? 'REAL PROVIDER PASS' : real('google.service_account_configured') ? 'NOT CONFIGURED' : 'EXTERNAL BLOCKER',
  real('google.api_auth_real') ? 'a real OAuth2 token exchange with Google succeeded' : 'no real Google auth performed yet');
add('PLAY PRODUCT QUERY (REAL)', real('google.product_query_real') ? 'REAL PROVIDER PASS' : 'EXTERNAL BLOCKER', real('google.product_query_real') ? 'the app queried real Play products' : 'needs real products + build-env IDs');
add('REAL PLAY PURCHASE E2E', real('google.test_purchase_real') ? 'REAL PROVIDER PASS' : 'EXTERNAL BLOCKER', real('google.test_purchase_real') ? 'a real Play test purchase verified end-to-end' : 'the RC8 primary target — blocked on the above');
add('RTDN (REAL)', real('google.rtdn_real') ? 'REAL PROVIDER PASS' : 'EXTERNAL BLOCKER', real('google.rtdn_real') ? 'a real RTDN event was processed' : 'needs a Pub/Sub topic + a real subscription event');

// --- apple ---------------------------------------------------
add('APPLE SERVER CONFIG', real('apple.server_config_real') ? 'ENGINEERING PASS' : 'EXTERNAL BLOCKER', 'APP_STORE_* (needs the paid Apple Developer Program)');
add('APPLE API AUTH (REAL)', real('apple.api_auth_real') ? 'REAL PROVIDER PASS' : 'EXTERNAL BLOCKER', real('apple.api_auth_real') ? 'a real App Store Server API auth succeeded' : 'no Apple credentials');

// --- play console / closed test -----------------------------
add('PLAY CONSOLE ACCESS', real('play_console.access_available') ? 'ENGINEERING PASS' : 'EXTERNAL BLOCKER', 'Play Console login (maintainer)');
add('CLOSED TEST UPLOADED', real('play_console.aab_uploaded_closed_test') ? 'REAL PROVIDER PASS' : 'EXTERNAL BLOCKER', real('play_console.aab_uploaded_closed_test') ? 'AAB is on the closed-test track' : 'needs upload-signed AAB + Console access');
{
  const t = real('play_console.testers_opted_in') ?? 0;
  const d = real('play_console.tester_days_continuous') ?? 0;
  add('12/14 TESTER GATE', t >= 12 && d >= 14 ? 'REAL PROVIDER PASS' : 'EXTERNAL BLOCKER', `${t}/12 testers · ${d}/14 continuous days (production-access gate; not needed to run the closed test)`);
}

// --- legal / assets ----------------------------------------
add('LEGAL', tryRun('node scripts/check-legal.mjs') ? 'PASS' : 'EXTERNAL BLOCKER', 'legal/legal.config.json + docs placeholders (`npm run check:legal`)');
const shots = existsSync('store-assets/android') ? readdirSync('store-assets/android').filter((f) => /\.(png|jpe?g)$/i.test(f)) : [];
add('SCREENSHOTS', shots.length >= 4 ? 'PASS' : 'WARNING', `${shots.length} candidate screenshot(s)`);
const featureGraphic = ['store-assets/feature-graphic.png', 'store-assets/android/feature-graphic.png'].find(existsSync);
add('FEATURE GRAPHIC', featureGraphic ? 'PASS' : 'NOT CONFIGURED', featureGraphic ?? '1024×500 not produced — see store-assets/SPEC-feature-graphic.md');
const icon512 = ['store-assets/icon-512.png', 'store-assets/play-icon-512.png'].find(existsSync);
add('PLAY ICON 512', icon512 ? 'PASS' : 'NOT CONFIGURED', icon512 ?? 'run `npm run build:play-icon`');
add('DATA SAFETY', existsSync('PLAY_DATA_SAFETY.md') ? 'ENGINEERING PASS' : 'FAIL', 'PLAY_DATA_SAFETY.md (transcribe into Console)');
add('FINANCIAL FEATURES', existsSync('PLAY_FINANCIAL_FEATURES.md') ? 'ENGINEERING PASS' : 'FAIL', 'PLAY_FINANCIAL_FEATURES.md');
add('IARC',
  real('play_console.iarc_result') ? 'REAL PROVIDER PASS' : existsSync('PLAY_IARC_PREP.md') ? 'ENGINEERING PASS' : 'FAIL',
  real('play_console.iarc_result') ? `rating: ${real('play_console.iarc_result')}` : 'answers prepared (PLAY_IARC_PREP.md); questionnaire not submitted');

// --- other -------------------------------------------------
add('TINK PRODUCTION', real('tink.production_configured') ? 'ENGINEERING PASS' : 'EXTERNAL BLOCKER', 'Sandbox only; production needs a Tink agreement');
add('IPHONE PHYSICAL QA', 'EXTERNAL BLOCKER', 'one-time USB trust pairing pending (frozen)');
add('SUPABASE MIGRATIONS', 'PASS', `${readdirSync('supabase/migrations').filter((f) => f.endsWith('.sql')).length} local — \`npx supabase migration list\` for remote parity`);

// --- output ------------------------------------------------
if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ generatedFor: sh('git rev-parse --short HEAD'), version: app.version, evidenceSha: ev?.gitSha ?? null, rows }, null, 2));
} else {
  const pad = Math.max(...rows.map((r) => r.name.length));
  const order = { FAIL: 0, 'EXTERNAL BLOCKER': 1, 'NOT CONFIGURED': 2, WARNING: 3, 'ENGINEERING PASS': 4, 'REAL PROVIDER PASS': 5, PASS: 6 };
  for (const r of [...rows].sort((a, b) => order[a.status] - order[b.status])) {
    console.log(`  ${r.name.padEnd(pad)}  ${r.status.padEnd(18)}  ${r.detail}`);
  }
  const c = (s) => rows.filter((r) => r.status === s).length;
  console.log(`\n  ${c('PASS') + c('ENGINEERING PASS') + c('REAL PROVIDER PASS')} pass (${c('REAL PROVIDER PASS')} real-provider · ${c('ENGINEERING PASS')} engineering) · ${c('FAIL')} FAIL · ${c('EXTERNAL BLOCKER')} EXTERNAL BLOCKER · ${c('NOT CONFIGURED')} NOT CONFIGURED · ${c('WARNING')} WARNING`);
  process.exit(c('FAIL') > 0 ? 1 : 0);
}
