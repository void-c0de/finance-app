import { execSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';

/**
 * Release readiness overview. Reads only local state — no secrets, no network
 * beyond an optional `git` call. Every check reports one of:
 *
 *   PASS             ready
 *   WARNING          usable, worth a look
 *   NOT CONFIGURED   an internal switch is off (product IDs, env, …)
 *   EXTERNAL BLOCKER  needs something only the maintainer / a store can provide
 *   FAIL             something is wrong and should be fixed
 *
 *   npm run release:doctor            (human readable, runs tests/tsc/lint)
 *   npm run release:doctor -- --json  (machine readable)
 *   npm run release:doctor -- --fast  (skip the slow test/tsc/lint/doctor runs)
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

// --- version / runtime ------------------------------------------------
add('VERSION', pkg.version === app.version ? 'PASS' : 'FAIL', `pkg ${pkg.version} · app ${app.version} · vc ${app.android?.versionCode} · iOS build ${app.ios?.buildNumber}`);
add('RUNTIME', app.runtimeVersion?.policy === 'appVersion' ? 'PASS' : 'WARNING', `runtimeVersion.policy=${app.runtimeVersion?.policy}`);
add('TARGET SDK', String(app.android?.targetSdkVersion ?? '') === '' ? 'WARNING' : 'PASS', `android.targetSdkVersion in app.json: ${app.android?.targetSdkVersion ?? '(plugin-managed)'}`);

// --- git ------------------------------------------------------------
const dirty = sh('git status --porcelain');
add('GIT CLEAN', dirty ? 'WARNING' : 'PASS', dirty ? `${dirty.split('\n').length} uncommitted path(s)` : 'working tree clean');
const ahead = sh('git rev-list --count origin/master..HEAD');
add('GIT PUSHED', ahead && ahead !== '0' ? 'WARNING' : 'PASS', ahead && ahead !== '0' ? `${ahead} commit(s) ahead of origin/master` : 'in sync with origin/master');

// --- tests / typecheck / lint --------------------------------------
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

// --- android signing ----------------------------------------------
const aab = 'android/app/build/outputs/bundle/release/app-release.aab';
if (existsSync(aab) && !FAST) {
  const prod = tryRun(`node scripts/verify-release-signing.mjs ${aab} --expect-production`);
  add('ANDROID SIGNING', prod ? 'PASS' : 'EXTERNAL BLOCKER', prod ? 'AAB is production-signed' : 'AAB is debug-signed — needs FINANCE_UPLOAD_* upload keystore');
} else if (existsSync(aab)) {
  add('ANDROID SIGNING', 'WARNING', 'AAB present; signing check skipped (--fast)');
} else {
  add('ANDROID SIGNING', 'NOT CONFIGURED', 'no AAB built yet (npm run release:android:aab)');
}
add('UPLOAD KEY', process.env.FINANCE_UPLOAD_STORE_FILE ? 'PASS' : 'EXTERNAL BLOCKER', process.env.FINANCE_UPLOAD_STORE_FILE ? 'FINANCE_UPLOAD_* present in env' : 'FINANCE_UPLOAD_* not set (maintainer-held)');

// --- legal --------------------------------------------------------
add('LEGAL', tryRun('node scripts/check-legal.mjs') ? 'PASS' : 'EXTERNAL BLOCKER', 'legal/legal.config.json + docs placeholders (see: npm run check:legal)');

// --- screenshots / feature graphic -------------------------------
const shots = existsSync('store-assets/android') ? readdirSync('store-assets/android').filter((f) => /\.(png|jpg|jpeg)$/i.test(f)) : [];
add('SCREENSHOTS', shots.length >= 4 ? 'PASS' : 'WARNING', `${shots.length} candidate screenshot(s) in store-assets/android`);
const featureGraphic = ['store-assets/android/feature-graphic.png', 'store-assets/feature-graphic.png'].find(existsSync);
add('FEATURE GRAPHIC', featureGraphic ? 'PASS' : 'NOT CONFIGURED', featureGraphic ?? '1024×500 feature graphic not present (see SCREENSHOT_PLAN.md)');
const iconPath = (app.icon ?? '').replace(/^\.\//, '');
add('PLAY ICON', iconPath && existsSync(iconPath) ? 'PASS' : 'WARNING', iconPath && existsSync(iconPath) ? `${iconPath} (Play needs a 512² export)` : 'app.icon not found');

// --- product / provider config ---------------------------------
const hasProductIds = Boolean(process.env.EXPO_PUBLIC_PREMIUM_MONTHLY_ID && process.env.EXPO_PUBLIC_PREMIUM_YEARLY_ID);
add('PLAY PRODUCT IDS', hasProductIds ? 'PASS' : 'NOT CONFIGURED', hasProductIds ? 'EXPO_PUBLIC_PREMIUM_*_ID set' : 'EXPO_PUBLIC_PREMIUM_MONTHLY_ID / _YEARLY_ID unset → billing shows "Preise folgen"');
add('GOOGLE SERVER VERIFY', 'EXTERNAL BLOCKER', 'GOOGLE_PLAY_SERVICE_ACCOUNT_JSON + GOOGLE_PLAY_PACKAGE_NAME are Supabase Function secrets (verify-purchase returns not_configured until set)');
add('APPLE SERVER VERIFY', 'EXTERNAL BLOCKER', 'APP_STORE_ISSUER_ID / _KEY_ID / _PRIVATE_KEY / _BUNDLE_ID are Supabase Function secrets (needs the paid Apple Developer Program)');
add('TINK PRODUCTION', 'EXTERNAL BLOCKER', 'Tink runs in Sandbox; production access needs a Tink agreement');

// --- iphone physical QA ---------------------------------------
add('IPHONE PHYSICAL QA', 'EXTERNAL BLOCKER', 'one-time USB trust pairing pending (frozen — see IOS_WINDOWS_WLAN_BRIDGE.md)');

// --- supabase migration parity -------------------------------
const localMigrations = readdirSync('supabase/migrations').filter((f) => f.endsWith('.sql')).length;
add('SUPABASE MIGRATIONS', 'PASS', `${localMigrations} local migration file(s) — run \`npx supabase migration list\` to confirm remote parity`);

// --- output -----------------------------------------------------
if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ generatedFor: sh('git rev-parse --short HEAD'), version: app.version, rows }, null, 2));
} else {
  const pad = Math.max(...rows.map((r) => r.name.length));
  const order = { FAIL: 0, 'EXTERNAL BLOCKER': 1, 'NOT CONFIGURED': 2, WARNING: 3, PASS: 4 };
  for (const r of [...rows].sort((a, b) => order[a.status] - order[b.status])) {
    console.log(`  ${r.name.padEnd(pad)}  ${r.status.padEnd(16)}  ${r.detail}`);
  }
  const fails = rows.filter((r) => r.status === 'FAIL').length;
  const blockers = rows.filter((r) => r.status === 'EXTERNAL BLOCKER').length;
  console.log(`\n  ${rows.filter((r) => r.status === 'PASS').length} PASS · ${fails} FAIL · ${blockers} EXTERNAL BLOCKER · ${rows.filter((r) => r.status === 'NOT CONFIGURED').length} NOT CONFIGURED · ${rows.filter((r) => r.status === 'WARNING').length} WARNING`);
  process.exit(fails > 0 ? 1 : 0);
}
