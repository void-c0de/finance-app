import { existsSync } from 'node:fs';

/**
 * Play upload-signing configuration gate.
 *
 * Run before a production AAB build. Behaviour:
 *   0 of 4 FINANCE_UPLOAD_* set  → NOT CONFIGURED (exit 0). Build will be
 *                                  debug-signed (internal only).
 *   1–3 of 4 set                 → PARTIAL → exit 1. A half-configured signing
 *                                  setup silently produces a debug-signed
 *                                  "release" AAB — refuse loudly instead.
 *   4 of 4 set                   → validate: keystore file exists, values are
 *                                  non-trivial. exit 0 → the build's `release`
 *                                  buildType will use signingConfigs.upload.
 *
 *   node scripts/check-upload-signing.mjs [--expect-production]
 *
 * Never prints any password or keystore path content.
 */

const EXPECT_PRODUCTION = process.argv.includes('--expect-production');

const VARS = [
  'FINANCE_UPLOAD_STORE_FILE',
  'FINANCE_UPLOAD_STORE_PASSWORD',
  'FINANCE_UPLOAD_KEY_ALIAS',
  'FINANCE_UPLOAD_KEY_PASSWORD',
];

function present(name) {
  const v = process.env[name];
  return typeof v === 'string' && v.trim() !== '';
}

const set = VARS.filter(present);
const missing = VARS.filter((v) => !present(v));

if (set.length === 0) {
  console.log('· Upload-Signing NICHT KONFIGURIERT — der Release-Build wird debug-signiert (nur interne Verteilung).');
  console.log('  Für Play: FINANCE_UPLOAD_STORE_FILE / _STORE_PASSWORD / _KEY_ALIAS / _KEY_PASSWORD setzen (Env oder ~/.gradle/gradle.properties).');
  if (EXPECT_PRODUCTION) {
    console.error('\n✗ --expect-production: es ist kein Upload-Keystore konfiguriert.');
    process.exit(1);
  }
  process.exit(0);
}

if (set.length < VARS.length) {
  console.error('✗ Upload-Signing TEILWEISE konfiguriert — Build wird abgelehnt.');
  console.error(`  gesetzt:  ${set.join(', ')}`);
  console.error(`  fehlt:    ${missing.join(', ')}`);
  console.error('  Ein halb konfiguriertes Signing erzeugt still ein debug-signiertes "release"-AAB. Alle vier Werte setzen oder alle entfernen.');
  process.exit(1);
}

// all four present — validate what we safely can
const problems = [];
const storeFile = process.env.FINANCE_UPLOAD_STORE_FILE.trim();
if (!existsSync(storeFile)) {
  problems.push(`Keystore-Datei nicht gefunden (FINANCE_UPLOAD_STORE_FILE zeigt auf einen nicht existierenden Pfad)`);
}
if (/\.jks$|\.keystore$/i.test(storeFile) === false) {
  problems.push('FINANCE_UPLOAD_STORE_FILE endet nicht auf .jks/.keystore — bitte prüfen');
}
if (process.env.FINANCE_UPLOAD_KEY_ALIAS.trim().toLowerCase() === 'androiddebugkey') {
  problems.push('FINANCE_UPLOAD_KEY_ALIAS ist "androiddebugkey" — das ist der Debug-Key, kein Upload-Key');
}
for (const pw of ['FINANCE_UPLOAD_STORE_PASSWORD', 'FINANCE_UPLOAD_KEY_PASSWORD']) {
  if (process.env[pw].trim().length < 6) problems.push(`${pw} ist verdächtig kurz (< 6 Zeichen)`);
}

if (problems.length > 0) {
  console.error('✗ Upload-Signing konfiguriert, aber die Werte wirken nicht stimmig:');
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}

console.log('✓ Upload-Signing vollständig konfiguriert. Der Release-Build nutzt signingConfigs.upload.');
console.log('  Nach dem Build: `npm run verify:release-signing <aab> --expect-production` muss grün sein.');
process.exit(0);
