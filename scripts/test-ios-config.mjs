import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

/**
 * iOS-Baubereitschaft: Konfiguration prüfen, ohne macOS.
 * Der echte Compile läuft in .github/workflows/ios-unsigned.yml (macOS-Runner).
 */

const appJson = JSON.parse(readFileSync('app.json', 'utf8')).expo;
const ios = appJson.ios ?? {};

// --- Bundle Identifier: Apple-Regeln (nur A-Za-z0-9-.) ---------------
assert.ok(ios.bundleIdentifier, 'ios.bundleIdentifier ist gesetzt');
assert.match(ios.bundleIdentifier, /^[A-Za-z0-9.-]+$/, 'iOS-Bundle-ID nur alphanumerisch, - und .');
assert.ok(!ios.bundleIdentifier.includes('_'), 'kein Unterstrich in der iOS-Bundle-ID (Apple lehnt das ab)');
assert.equal(ios.bundleIdentifier, 'com.nocta-xz.financeapp');

// --- Android-Package bleibt unverändert (Unterstrich dort ok) -------
assert.equal(appJson.android.package, 'com.nocta_xz.financeapp', 'Android-Package unverändert');

// --- Face ID / Biometrie: Info.plist-Beschreibung nötig -------------
const faceId =
  ios.infoPlist?.NSFaceIDUsageDescription ??
  (appJson.plugins ?? [])
    .filter((p) => Array.isArray(p) && p[0] === 'expo-local-authentication')
    .map((p) => p[1]?.faceIDPermission)[0];
assert.ok(faceId && /Face ID/.test(faceId), 'NSFaceIDUsageDescription gesetzt und erwähnt Face ID');

// --- Krypto-Exportkennzeichnung (spart die jährliche Selbstauskunft) --
assert.equal(ios.infoPlist?.ITSAppUsesNonExemptEncryption, false);

// --- Deep-Link-Schema für Supabase-Auth / Tink-Callback -------------
assert.equal(appJson.scheme, 'financeapp', 'benutzerdefiniertes Schema für iOS-Deep-Links');

// --- Apple Privacy Manifest: kein Tracking, ehrliche Datentypen ----
const pm = ios.privacyManifests;
assert.ok(pm, 'ios.privacyManifests ist gesetzt (PrivacyInfo.xcprivacy)');
assert.equal(pm.NSPrivacyTracking, false, 'App trackt nicht');
assert.deepEqual(pm.NSPrivacyTrackingDomains, [], 'keine Tracking-Domains');
const dataTypes = (pm.NSPrivacyCollectedDataTypes ?? []).map((d) => d.NSPrivacyCollectedDataType);
assert.ok(dataTypes.includes('NSPrivacyCollectedDataTypeEmailAddress'), 'E-Mail als erfasster Datentyp deklariert');
assert.ok(
  dataTypes.includes('NSPrivacyCollectedDataTypeOtherFinancialInfo'),
  'Finanzinfo als erfasster Datentyp deklariert',
);
for (const d of pm.NSPrivacyCollectedDataTypes ?? []) {
  assert.equal(d.NSPrivacyCollectedDataTypeTracking, false, `${d.NSPrivacyCollectedDataType}: kein Tracking`);
  assert.deepEqual(
    d.NSPrivacyCollectedDataTypePurposes,
    ['NSPrivacyCollectedDataTypePurposeAppFunctionality'],
    `${d.NSPrivacyCollectedDataType}: nur App-Funktionalität`,
  );
}
const apiReasons = (pm.NSPrivacyAccessedAPITypes ?? []).map((a) => a.NSPrivacyAccessedAPIType);
for (const cat of [
  'NSPrivacyAccessedAPICategoryFileTimestamp',
  'NSPrivacyAccessedAPICategoryDiskSpace',
  'NSPrivacyAccessedAPICategorySystemBootTime',
  'NSPrivacyAccessedAPICategoryUserDefaults',
]) {
  assert.ok(apiReasons.includes(cat), `Required-Reason-API deklariert: ${cat}`);
}
for (const a of pm.NSPrivacyAccessedAPITypes ?? []) {
  assert.ok(
    Array.isArray(a.NSPrivacyAccessedAPITypeReasons) && a.NSPrivacyAccessedAPITypeReasons.length > 0,
    `${a.NSPrivacyAccessedAPIType}: mindestens ein Grund-Code`,
  );
}

// --- ATT: keine Tracking-Berechtigung, keine IDFA-Nutzung ---------
assert.ok(
  !ios.infoPlist?.NSUserTrackingUsageDescription,
  'keine NSUserTrackingUsageDescription (App trackt nicht, kein ATT-Prompt)',
);

// --- SQLCipher gilt auch für iOS -----------------------------------
const sqlitePlugin = (appJson.plugins ?? []).find((p) => Array.isArray(p) && p[0] === 'expo-sqlite');
assert.ok(sqlitePlugin, 'expo-sqlite Plugin vorhanden');
const cipher = sqlitePlugin[1]?.useSQLCipher ?? sqlitePlugin[1]?.ios?.useSQLCipher;
assert.equal(cipher, true, 'useSQLCipher greift auch für iOS (Top-Level-Prop)');

// --- Config-Plugins dürfen iOS-Prebuild nicht sprengen -------------
for (const rel of ['./plugins/withReleaseHardening', './plugins/withFinanceUploadSigning']) {
  const file = `${rel.replace('./', '')}.js`;
  assert.ok(existsSync(file), `${file} existiert`);
  const src = readFileSync(file, 'utf8');
  // Beide fassen nur Android an (withAndroidManifest / withAppBuildGradle):
  assert.ok(/withAndroidManifest|withAppBuildGradle/.test(src), `${file} ist Android-spezifisch (iOS = no-op)`);
}

// --- expo config bewertet die iOS-Sektion ohne Fehler --------------
const cfg = JSON.parse(execSync('npx expo config --type public --json', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }));
assert.equal(cfg.ios.bundleIdentifier, 'com.nocta-xz.financeapp');
assert.equal(cfg.ios.buildNumber, '6');

// --- iOS-Build-Workflow ist vorhanden & unsigniert ----------------
const wf = readFileSync('.github/workflows/ios-unsigned.yml', 'utf8');
assert.match(wf, /runs-on: macos-/, 'läuft auf einem macOS-Runner');
assert.match(wf, /CODE_SIGNING_ALLOWED=NO/);
assert.match(wf, /workflow_dispatch/, 'nur manuell (macOS-Minuten)');
assert.ok(!/APPLE_ID|APP_STORE_CONNECT|CERTIFICATE|P12|provisioning/i.test(wf), 'keine Apple-Credentials im Workflow');

// --- Banking-Deep-Link: hosted Tink-Link-Flow braucht das App-Schema --
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
for (const dep of ['expo-web-browser', 'expo-crypto', 'expo-secure-store', 'expo-linking']) {
  assert.ok(pkg.dependencies[dep], `${dep} ist Dependency (iOS-Tink-Rückkanal / state-Nonce)`);
}
const callbackCore = readFileSync('src/banking/tink/tinkCallbackCore.ts', 'utf8');
assert.match(callbackCore, /financeapp:\/\/bank\/tink/, 'Tink-Redirect nutzt das App-Schema');
assert.ok(
  callbackCore.includes(`'${appJson.scheme}://bank/tink'`) ||
    callbackCore.includes(`${appJson.scheme}://bank/tink`),
  'Tink-Redirect-Schema == app.json scheme',
);
assert.match(callbackCore, /state/, 'Tink-Link bindet einen state-Nonce');

// --- Info.plist: keine unnötigen Berechtigungs-Strings -----------
const forbiddenPlist = [
  'NSCameraUsageDescription',
  'NSLocationWhenInUseUsageDescription',
  'NSLocationAlwaysAndWhenInUseUsageDescription',
  'NSContactsUsageDescription',
  'NSMicrophoneUsageDescription',
  'NSPhotoLibraryUsageDescription',
  'NSPhotoLibraryAddUsageDescription',
  'NSUserTrackingUsageDescription',
];
for (const key of forbiddenPlist) {
  assert.ok(!(key in (ios.infoPlist ?? {})), `keine ${key} in ios.infoPlist (nicht genutzt)`);
}

console.log(
  'iOS config: bundle id, Face ID, SQLCipher, deep-link scheme, privacy manifest, Tink callback, unsigned build — ready',
);
