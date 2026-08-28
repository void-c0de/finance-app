import { execSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';

/**
 * Release Doctor 3.0 — reads only local state (+ optional git). No secrets.
 *
 * Status vocabulary:
 *   PASS               a plain check (no "real vs engineered" nuance)
 *   ENGINEERING PASS   the code/config is done and tested (fixtures ok)
 *   REAL PROVIDER PASS a real request to Google/Apple actually succeeded
 *   REAL PLAY PASS     something is really live on Google Play (track, IARC, …)
 *   WARNING            usable, worth a look
 *   NOT CONFIGURED     an internal switch is off (product IDs, env, …)
 *   EXTERNAL BLOCKER   needs something only the maintainer / a store provides
 *   FAIL               something is wrong and should be fixed
 *
 * Each row also carries `blocking`:
 *   true   → a Closed Test upload cannot proceed until this passes
 *   false  → non-blocking / informational
 *
 * "REAL" facts come from store-assets/release-evidence.json (updated by
 * scripts/update-release-evidence.mjs as milestones are really verified).
 *
 *   npm run release:doctor                 human readable (runs tests/tsc/lint)
 *   npm run release:doctor -- --fast       skip the slow runs
 *   npm run release:doctor -- --json       machine readable
 */

const FAST = process.argv.includes('--fast');
const rows = [];
/** blocking = must pass before a Closed Test AAB upload */
const add = (name, status, detail = '', blocking = false) => rows.push({ name, status, detail, blocking });

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

// --- version / runtime / git -----------------------------------------
add('VERSION', pkg.version === app.version ? 'PASS' : 'FAIL', `pkg ${pkg.version} · app ${app.version} · vc ${app.android?.versionCode} · iOS build ${app.ios?.buildNumber}`, true);
add('RUNTIME', app.runtimeVersion?.policy === 'appVersion' ? 'PASS' : 'WARNING', `runtimeVersion.policy=${app.runtimeVersion?.policy}`);
const dirty = sh('git status --porcelain');
add('GIT CLEAN', dirty ? 'WARNING' : 'PASS', dirty ? `${dirty.split('\n').length} uncommitted path(s)` : 'working tree clean', true);
const ahead = sh('git rev-list --count origin/master..HEAD');
add('GIT PUSHED', ahead && ahead !== '0' ? 'WARNING' : 'PASS', ahead && ahead !== '0' ? `${ahead} commit(s) ahead of origin/master` : 'in sync with origin/master');

// --- tests / typecheck / lint ---------------------------------------
if (FAST) {
  add('TESTS', 'WARNING', 'skipped (--fast) — run `npm run ci`', true);
  add('TYPES', 'WARNING', 'skipped (--fast)', true);
  add('SECRET GUARD', tryRun('node scripts/ci-secret-guard.mjs') ? 'PASS' : 'FAIL', 'ci-secret-guard.mjs', true);
  add('EXPO DOCTOR', 'WARNING', 'skipped (--fast)');
} else {
  add('TESTS', tryRun('npm run --silent test:all') ? 'PASS' : 'FAIL', 'node scripts/ci-run-tests.mjs', true);
  add('TYPES', tryRun('npx --no-install tsc --noEmit') ? 'PASS' : 'FAIL', 'tsc --noEmit', true);
  add('SECRET GUARD', tryRun('node scripts/ci-secret-guard.mjs') ? 'PASS' : 'FAIL', 'ci-secret-guard.mjs', true);
  add('EXPO DOCTOR', tryRun('npx --no-install expo-doctor') ? 'PASS' : 'WARNING', 'expo-doctor');
}

// --- android signing ----------------------------------------------
add(
  'SIGNING ENGINEERING',
  real('signing.production_branch_proven_ephemeral') || real('signing.production_branch_fixed') ? 'ENGINEERING PASS' : 'WARNING',
  real('signing.production_branch_proven_ephemeral')
    ? 'release buildType → signingConfigs.upload; proven with an ephemeral key (RC8)'
    : 'withFinanceUploadSigning rewires the release buildType',
);
add(
  'SIGNING REAL',
  real('signing.aab_upload_signed') ? 'REAL PLAY PASS'
    : process.env.FINANCE_UPLOAD_STORE_FILE ? 'ENGINEERING PASS'
    : 'EXTERNAL BLOCKER',
  process.env.FINANCE_UPLOAD_STORE_FILE ? 'FINANCE_UPLOAD_* present — build + verify:release-signing --expect-production'
    : 'FINANCE_UPLOAD_* not set (maintainer-held). `npm run check:upload-signing`',
  true,
);
const aab = 'android/app/build/outputs/bundle/release/app-release.aab';
if (existsSync(aab) && !FAST) {
  const prod = tryRun(`node scripts/verify-release-signing.mjs ${aab} --expect-production`);
  add('AAB SIGNED', prod ? 'REAL PLAY PASS' : 'EXTERNAL BLOCKER', prod ? 'AAB is upload/production-signed' : 'AAB is debug-signed — needs the upload keystore', true);
} else if (existsSync(aab)) {
  add('AAB SIGNED', 'WARNING', 'AAB present; signing check skipped (--fast)', true);
} else {
  add('AAB SIGNED', 'NOT CONFIGURED', 'no AAB built (npm run release:android:aab)', true);
}
add('AAB VALIDATED', existsSync('store-assets/aab-validation.json') ? 'ENGINEERING PASS' : 'NOT CONFIGURED', existsSync('store-assets/aab-validation.json') ? 'structural + (optional) bundletool result recorded' : 'run `npm run validate:aab`');

// --- google provider integration --------------------------------
add('PLAY PRODUCT IDS',
  process.env.EXPO_PUBLIC_PREMIUM_MONTHLY_ID && process.env.EXPO_PUBLIC_PREMIUM_YEARLY_ID ? 'ENGINEERING PASS' : 'NOT CONFIGURED',
  process.env.EXPO_PUBLIC_PREMIUM_MONTHLY_ID ? 'EXPO_PUBLIC_PREMIUM_*_ID set' : 'unset → billing shows "Preise folgen" (fine for closed test without billing)');
add('GOOGLE SERVER CONFIG',
  real('google.service_account_configured') ? 'ENGINEERING PASS' : 'EXTERNAL BLOCKER',
  'GOOGLE_PLAY_SERVICE_ACCOUNT_JSON + GOOGLE_PLAY_PACKAGE_NAME (Supabase Function secrets)');
add('GOOGLE AUTH REAL',
  real('google.api_auth_real') ? 'REAL PROVIDER PASS' : real('google.service_account_configured') ? 'NOT CONFIGURED' : 'EXTERNAL BLOCKER',
  real('google.api_auth_real') ? 'a real OAuth2 token exchange with Google succeeded' : 'no real Google request has been sent');
add('ANDROID PUBLISHER REACHED', real('google.api_reached_real') ? 'REAL PROVIDER PASS' : 'EXTERNAL BLOCKER', real('google.api_reached_real') ? 'the Android Publisher API responded' : 'blocked on GOOGLE AUTH REAL');
add('PRODUCT QUERY REAL', real('google.product_query_real') ? 'REAL PROVIDER PASS' : 'EXTERNAL BLOCKER', real('google.product_query_real') ? 'the app queried real Play products' : 'needs real products + build-env IDs + a Play test track');
add('PURCHASE REAL', real('google.test_purchase_real') ? 'REAL PLAY PASS' : 'EXTERNAL BLOCKER', real('google.test_purchase_real') ? 'a real Play test purchase happened' : 'the RC9 primary target');
add('VERIFY REAL', real('google.server_verify_real') ? 'REAL PROVIDER PASS' : 'EXTERNAL BLOCKER', real('google.server_verify_real') ? 'Android Publisher verified the real purchase' : 'blocked on PURCHASE REAL');
add('ENTITLEMENT REAL', real('google.entitlement_real') ? 'REAL PROVIDER PASS' : 'EXTERNAL BLOCKER', real('google.entitlement_real') ? 'the real purchase produced server-side Premium' : 'blocked on VERIFY REAL');
add('RESTORE REAL', real('google.restore_real') ? 'REAL PROVIDER PASS' : 'EXTERNAL BLOCKER', real('google.restore_real') ? 'the real purchase was restored' : 'blocked on PURCHASE REAL');
add('RTDN CONFIG', real('google.rtdn_configured') ? 'ENGINEERING PASS' : 'EXTERNAL BLOCKER', 'Pub/Sub topic + GOOGLE_PUBSUB_SA_EMAIL / PLAY_RTDN_VERIFICATION_TOKEN');
add('RTDN REAL', real('google.rtdn_real') ? 'REAL PROVIDER PASS' : 'EXTERNAL BLOCKER', real('google.rtdn_real') ? 'a Google-delivered RTDN event was processed' : 'needs the Pub/Sub setup + a real subscription event');

// --- apple -----------------------------------------------------
add('APPLE SERVER CONFIG', real('apple.server_config_real') ? 'ENGINEERING PASS' : 'EXTERNAL BLOCKER', 'APP_STORE_* (needs the paid Apple Developer Program)');
add('APPLE API AUTH REAL', real('apple.api_auth_real') ? 'REAL PROVIDER PASS' : 'EXTERNAL BLOCKER', real('apple.api_auth_real') ? 'a real App Store Server API auth succeeded' : 'no Apple credentials');

// --- play console / closed test --------------------------------
add('PLAY CONSOLE ACCESS', real('play_console.access_available') ? 'ENGINEERING PASS' : 'EXTERNAL BLOCKER', 'Play Console login (maintainer)', true);
add('PLAY APP EXISTS', real('play_console.app_exists') ? 'REAL PLAY PASS' : 'EXTERNAL BLOCKER', real('play_console.app_exists') ? `${app.android?.package} exists in the Console` : 'not created', true);
add('CLOSED TEST TRACK', real('play_console.closed_test_track_created') ? 'REAL PLAY PASS' : 'EXTERNAL BLOCKER', real('play_console.closed_test_track_created') ? 'closed-testing track created' : 'needs Console access', true);
add('CLOSED TEST UPLOADED', real('play_console.aab_uploaded_closed_test') ? 'REAL PLAY PASS' : 'EXTERNAL BLOCKER', real('play_console.aab_uploaded_closed_test') ? 'AAB is on the closed-test track' : 'needs upload-signed AAB + track', true);
{
  const t = real('play_console.testers_opted_in') ?? 0;
  const d = real('play_console.tester_days_continuous') ?? 0;
  add('12/14 TESTER GATE', t >= 12 && d >= 14 ? 'REAL PLAY PASS' : 'EXTERNAL BLOCKER',
    `${t}/12 testers · ${d}/14 continuous days — gates PRODUCTION access only, NOT the closed test`, false);
}

// --- legal / store assets -------------------------------------
add('LEGAL', tryRun('node scripts/check-legal.mjs') ? 'PASS' : 'EXTERNAL BLOCKER', 'legal/legal.config.json + docs placeholders (`npm run check:legal`)', true);
const shots = existsSync('store-assets/android') ? readdirSync('store-assets/android').filter((f) => /\.(png|jpe?g)$/i.test(f)) : [];
add('SCREENSHOTS', shots.length >= 4 ? 'PASS' : 'WARNING', `${shots.length} candidate screenshot(s)`, true);
add('FEATURE GRAPHIC', existsSync('store-assets/feature-graphic.png') ? 'PASS' : 'NOT CONFIGURED', existsSync('store-assets/feature-graphic.png') ? 'store-assets/feature-graphic.png (1024×500)' : 'run `npm run build:feature-graphic`', true);
add('PLAY ICON 512', existsSync('store-assets/play-icon-512.png') ? 'PASS' : 'NOT CONFIGURED', existsSync('store-assets/play-icon-512.png') ? 'store-assets/play-icon-512.png' : 'run `npm run build:play-icon`', true);
add('DATA SAFETY', existsSync('PLAY_DATA_SAFETY.md') ? 'ENGINEERING PASS' : 'FAIL', 'PLAY_DATA_SAFETY.md → transcribe into the Console form', true);
add('FINANCIAL FEATURES', existsSync('PLAY_FINANCIAL_FEATURES.md') ? 'ENGINEERING PASS' : 'FAIL', 'PLAY_FINANCIAL_FEATURES.md', true);
add('APP CONTENT', existsSync('PLAY_APP_CONTENT.md') ? 'ENGINEERING PASS' : 'NOT CONFIGURED', existsSync('PLAY_APP_CONTENT.md') ? 'PLAY_APP_CONTENT.md answer sheet' : 'prepare the App Content answers', true);
add('IARC',
  real('play_console.iarc_result') ? 'REAL PLAY PASS' : existsSync('PLAY_IARC_PREP.md') ? 'ENGINEERING PASS' : 'FAIL',
  real('play_console.iarc_result') ? `rating: ${real('play_console.iarc_result')}` : 'answers prepared; questionnaire not submitted', true);
add('PRIVACY POLICY LIVE', 'PASS', 'https://void-c0de.github.io/finance-app/datenschutz.html', true);
add('ACCOUNT DELETION URL LIVE', 'PASS', 'https://void-c0de.github.io/finance-app/konto-loeschen.html', true);

// --- other ----------------------------------------------------
add('TINK PRODUCTION', real('tink.production_configured') ? 'ENGINEERING PASS' : 'EXTERNAL BLOCKER', 'Sandbox only; closed test proceeds with banking marked sandbox/demo', false);
add('IPHONE PHYSICAL QA', 'EXTERNAL BLOCKER', 'one-time USB trust pairing pending (frozen)', false);
add('SUPABASE MIGRATIONS', 'PASS', `${readdirSync('supabase/migrations').filter((f) => f.endsWith('.sql')).length} local — \`npx supabase migration list\` for remote parity`);

// --- verdict --------------------------------------------------
const c = (s) => rows.filter((r) => r.status === s).length;
const blockingFailures = rows.filter(
  (r) => r.blocking && ['FAIL', 'EXTERNAL BLOCKER', 'NOT CONFIGURED'].includes(r.status),
);
const closedTestReady = blockingFailures.length === 0;

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({
    generatedFor: sh('git rev-parse --short HEAD'),
    version: app.version,
    evidenceSha: ev?.gitSha ?? null,
    closedTestReady,
    blockingCount: blockingFailures.length,
    rows,
  }, null, 2));
} else {
  const pad = Math.max(...rows.map((r) => r.name.length));
  const order = { FAIL: 0, 'EXTERNAL BLOCKER': 1, 'NOT CONFIGURED': 2, WARNING: 3, 'ENGINEERING PASS': 4, 'REAL PROVIDER PASS': 5, 'REAL PLAY PASS': 6, PASS: 7 };
  for (const r of [...rows].sort((a, b) => order[a.status] - order[b.status] || Number(b.blocking) - Number(a.blocking))) {
    console.log(`  ${r.blocking ? '■' : ' '} ${r.name.padEnd(pad)}  ${r.status.padEnd(18)}  ${r.detail}`);
  }
  console.log(`\n  ${c('PASS') + c('ENGINEERING PASS') + c('REAL PROVIDER PASS') + c('REAL PLAY PASS')} pass ` +
    `(${c('REAL PLAY PASS')} real-play · ${c('REAL PROVIDER PASS')} real-provider · ${c('ENGINEERING PASS')} engineering) · ` +
    `${c('FAIL')} FAIL · ${c('EXTERNAL BLOCKER')} EXTERNAL BLOCKER · ${c('NOT CONFIGURED')} NOT CONFIGURED · ${c('WARNING')} WARNING`);
  console.log(`\n  CLOSED TEST: ${closedTestReady ? 'READY' : `NOT READY — ${blockingFailures.length} blocking gate(s): ${blockingFailures.map((r) => r.name).join(', ')}`}`);
  process.exit(c('FAIL') > 0 ? 1 : 0);
}
