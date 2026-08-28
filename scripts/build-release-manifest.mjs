import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';

/**
 * Machine-readable release artifact manifest → store-assets/release-manifest.json.
 *
 * Safe metadata only: versions, ids, SDK levels, artifact paths + SHA-256,
 * signing classification, timestamps, git sha, test state. No secret paths,
 * no passwords.
 *
 *   npm run build:release-manifest [-- --stamp 2026-08-28T12:00:00Z]
 */

function sh(cmd) {
  try {
    return execSync(cmd, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return null;
  }
}

function sha256(path) {
  if (!existsSync(path)) return null;
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function fileInfo(path) {
  if (!existsSync(path)) return { path, present: false };
  return { path, present: true, bytes: statSync(path).size, sha256: sha256(path) };
}

const stampArg = process.argv.indexOf('--stamp');
const stamp = stampArg >= 0 ? process.argv[stampArg + 1] : (sh('git log -1 --format=%cI') ?? null);

const app = JSON.parse(readFileSync('app.json', 'utf8')).expo;
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));

const apk = 'android/app/build/outputs/apk/release/app-release.apk';
const aab = 'android/app/build/outputs/bundle/release/app-release.aab';

let androidSigning = 'unknown';
if (existsSync(aab)) {
  const sig = sh(`node scripts/verify-release-signing.mjs ${aab}`) ?? '';
  androidSigning = /DEBUG/i.test(sig) ? 'debug' : /production|upload/i.test(sig) ? 'production' : 'unknown';
}

const manifest = {
  schema: 'finance-app/release-manifest@1',
  generatedAt: stamp,
  git: { sha: sh('git rev-parse HEAD'), shortSha: sh('git rev-parse --short HEAD'), branch: sh('git rev-parse --abbrev-ref HEAD'), clean: sh('git status --porcelain') === '' },
  app: {
    name: pkg.name,
    version: app.version,
    androidVersionCode: app.android?.versionCode ?? null,
    iosBuildNumber: app.ios?.buildNumber ?? null,
    runtimeVersionPolicy: app.runtimeVersion?.policy ?? null,
    androidPackage: app.android?.package ?? null,
    iosBundleId: app.ios?.bundleIdentifier ?? null,
  },
  android: {
    apk: { ...fileInfo(apk), signing: androidSigning === 'unknown' ? null : androidSigning },
    aab: { ...fileInfo(aab), signing: androidSigning === 'unknown' ? null : androidSigning },
    signingClassification: androidSigning,
    productionUploadKeyConfigured: Boolean(process.env.FINANCE_UPLOAD_STORE_FILE),
  },
  ios: {
    unsignedCiWorkflow: '.github/workflows/ios-unsigned.yml',
    note: 'unsigned Release build; IPA SHA-256 is in the CI "Package unsigned IPA" step (changes every build)',
  },
  billing: {
    playBillingClient: '9.1.0 (expo-iap / openiap-google)',
    storeKit: 'openiap-apple (StoreKit 2)',
    serverVerification: 'deployed; not_configured until provider credentials set',
    productIdsConfigured: Boolean(process.env.EXPO_PUBLIC_PREMIUM_MONTHLY_ID && process.env.EXPO_PUBLIC_PREMIUM_YEARLY_ID),
  },
  supabase: {
    migrations: sh('git ls-files supabase/migrations/*.sql')?.split('\n').filter(Boolean).length ?? null,
  },
  tests: { lastKnown: '48 suites (see CI on the recorded git sha)' },
};

writeFileSync('store-assets/release-manifest.json', JSON.stringify(manifest, null, 2) + '\n');
console.log('✓ store-assets/release-manifest.json');
console.log(`  ${manifest.app.version} / vc ${manifest.app.androidVersionCode} · git ${manifest.git.shortSha} · android ${androidSigning}-signed`);
