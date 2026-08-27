import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Berechtigungs-Regression.
 *
 *  1. Der Release-Härtungs-Plugin MUSS SYSTEM_ALERT_WINDOW entfernen und
 *     allowBackup=false setzen.
 *  2. Falls eine gebaute APK vorliegt: ihre Berechtigungen müssen exakt der
 *     freigegebenen Allowlist entsprechen – nichts Neues schleicht sich ein.
 */

// --- Allowlist -------------------------------------------------------
const ALLOWED = new Set([
  'android.permission.INTERNET', // Supabase, Tink, OTA
  'android.permission.ACCESS_NETWORK_STATE', // Offline-Erkennung (Merge-Manifest)
  'android.permission.USE_BIOMETRIC', // App-Sperre
  'android.permission.USE_FINGERPRINT', // App-Sperre (Legacy)
  'android.permission.VIBRATE', // Haptik
  'android.permission.READ_EXTERNAL_STORAGE', // Legacy, maxSdkVersion=32
  'android.permission.WRITE_EXTERNAL_STORAGE', // Legacy, maxSdkVersion=32
  'com.nocta_xz.financeapp.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION', // RN, self-scoped
]);

const FORBIDDEN = [
  'android.permission.SYSTEM_ALERT_WINDOW',
  'android.permission.QUERY_ALL_PACKAGES',
  'android.permission.REQUEST_INSTALL_PACKAGES',
  'android.permission.PACKAGE_USAGE_STATS',
  'android.permission.READ_CONTACTS',
  'android.permission.ACCESS_FINE_LOCATION',
  'android.permission.ACCESS_COARSE_LOCATION',
  'android.permission.CAMERA',
  'com.android.vending.BILLING',
  'android.permission.RECEIVE_BOOT_COMPLETED',
];

// --- 1. Plugin-Quelle ----------------------------------------------
{
  const plugin = readFileSync('plugins/withReleaseHardening.js', 'utf8');
  assert.match(plugin, /SYSTEM_ALERT_WINDOW/, 'Plugin adressiert SYSTEM_ALERT_WINDOW');
  assert.match(plugin, /filter\(/, 'Plugin filtert die Berechtigung heraus');
  assert.match(plugin, /allowBackup.*['"]false['"]/, 'Plugin setzt allowBackup=false');

  const appJson = JSON.parse(readFileSync('app.json', 'utf8'));
  assert.ok(
    (appJson.expo.plugins ?? []).includes('./plugins/withReleaseHardening'),
    'withReleaseHardening ist in app.json aktiviert',
  );
}

// --- 2. Gebaute APK (falls vorhanden) -----------------------------
function findAapt() {
  const root = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
  if (!root) return null;
  const bt = path.join(root, 'build-tools');
  if (!existsSync(bt)) return null;
  for (const v of readdirSync(bt).sort().reverse()) {
    for (const name of ['aapt2.exe', 'aapt2', 'aapt.exe', 'aapt']) {
      const p = path.join(bt, v, name);
      if (existsSync(p)) return { bin: p, isAapt2: name.startsWith('aapt2') };
    }
  }
  return null;
}

const apk = 'android/app/build/outputs/apk/release/app-release.apk';
const aapt = findAapt();

if (existsSync(apk) && aapt) {
  let out = '';
  try {
    const args = aapt.isAapt2 ? ['dump', 'permissions', apk] : ['dump', 'permissions', apk];
    out = execFileSync(aapt.bin, args, { encoding: 'utf8', shell: process.platform === 'win32' });
  } catch (error) {
    out = (error.stdout ?? '').toString();
  }
  const perms = [...out.matchAll(/uses-permission: name='([^']+)'/g)].map((m) => m[1]);
  assert.ok(perms.length > 0, 'APK-Berechtigungen konnten gelesen werden');

  for (const perm of perms) {
    assert.ok(!FORBIDDEN.includes(perm), `Verbotene Berechtigung in der APK: ${perm}`);
    assert.ok(ALLOWED.has(perm), `Nicht freigegebene Berechtigung in der APK: ${perm} (Allowlist aktualisieren oder entfernen)`);
  }
  console.log(`Android permissions: APK geprüft – ${perms.length} Berechtigungen, alle auf der Allowlist`);
} else {
  console.log('Android permissions: Plugin-Quelle geprüft (keine gebaute APK gefunden – APK-Prüfung übersprungen)');
}
