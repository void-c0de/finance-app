import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';

/**
 * Signing-Sicherheitsgate.
 *
 * Verhindert, dass ein DEBUG-signiertes Artefakt versehentlich als
 * produktionsbereiter Play-Upload behandelt wird.
 *
 *   node scripts/verify-release-signing.mjs <pfad-zur-apk-oder-aab> [--expect-production]
 *
 * Ohne --expect-production: Bericht (Exit 0), meldet aber deutlich, wenn debug.
 * Mit --expect-production: Exit 1, falls debug-signiert ODER die Signatur nicht
 * zweifelsfrei bestimmt werden kann. Für einen echten Store-Upload MUSS dieser
 * Modus grün sein.
 *
 * APK: apksigner (liest v2/v3). AAB: keytool -printcert (JAR-Signatur).
 */

const args = process.argv.slice(2);
const artifact = args.find((a) => !a.startsWith('--'));
const expectProduction = args.includes('--expect-production');
const fail = (msg) => {
  console.error(msg);
  process.exit(expectProduction ? 1 : 2);
};

if (!artifact) fail('Usage: node scripts/verify-release-signing.mjs <apk|aab> [--expect-production]');
if (!existsSync(artifact)) fail(`Artefakt nicht gefunden: ${artifact}`);

const isAab = artifact.toLowerCase().endsWith('.aab');

function findApksigner() {
  const root = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
  if (root) {
    const bt = path.join(root, 'build-tools');
    if (existsSync(bt)) {
      const versions = readdirSync(bt).sort().reverse();
      for (const v of versions) {
        for (const name of ['apksigner.bat', 'apksigner']) {
          const p = path.join(bt, v, name);
          if (existsSync(p)) return p;
        }
      }
    }
  }
  return 'apksigner';
}

function findKeytool() {
  const home = process.env.JAVA_HOME;
  const candidates = [
    home && path.join(home, 'bin', process.platform === 'win32' ? 'keytool.exe' : 'keytool'),
    'keytool',
  ].filter(Boolean);
  for (const bin of candidates) {
    try {
      execFileSync(bin, ['-help'], { stdio: 'ignore' });
      return bin;
    } catch {
      /* next */
    }
  }
  return null;
}

let owner = '(unbekannt)';
let sha256 = '(unbekannt)';
let determined = false;

if (isAab) {
  const keytoolBin = findKeytool();
  if (!keytoolBin) fail('keytool nicht gefunden (JAVA_HOME setzen).');
  let out = '';
  try {
    out = execFileSync(keytoolBin, ['-printcert', '-jarfile', artifact], { encoding: 'utf8' });
  } catch (error) {
    fail(`AAB-Zertifikat konnte nicht gelesen werden: ${error.message}`);
  }
  owner = (out.match(/Owner:\s*(.+)/) ?? [])[1]?.trim() ?? '(unbekannt)';
  sha256 = (out.match(/SHA-?256:\s*([0-9A-Fa-f:]+)/) ?? [])[1] ?? '(unbekannt)';
  determined = /Owner:/.test(out);
} else {
  const apksignerBin = findApksigner();
  const useShell = apksignerBin.endsWith('.bat') || process.platform === 'win32';
  let out = '';
  try {
    out = execFileSync(apksignerBin, ['verify', '--print-certs', artifact], {
      encoding: 'utf8',
      shell: useShell,
    });
  } catch (error) {
    // apksigner exits non-zero on an unsigned artifact but still prints certs.
    out = `${(error.stdout ?? '').toString()}${(error.stderr ?? '').toString()}`;
    if (!/certificate DN:/.test(out)) fail(`APK-Signatur konnte nicht gelesen werden: ${error.message}`);
  }
  owner = (out.match(/certificate DN:\s*(.+)/) ?? [])[1]?.trim() ?? '(unbekannt)';
  sha256 = (out.match(/certificate SHA-256 digest:\s*([0-9A-Fa-f]+)/) ?? [])[1] ?? '(unbekannt)';
  determined = /certificate DN:/.test(out);
}

const isDebug = /CN=Android Debug/i.test(owner);

console.log(`Artefakt:  ${artifact}`);
console.log(`Signierer: ${owner}`);
console.log(`SHA-256:   ${sha256}`);
console.log(
  `Typ:       ${
    !determined ? 'UNBESTIMMT' : isDebug ? 'DEBUG-SIGNIERT (Entwicklungsartefakt)' : 'Nicht-Debug (Upload-/Release-Key)'
  }`,
);

if (expectProduction && (!determined || isDebug)) {
  console.error(
    `\n✗ FEHLER: production-Modus erwartet, aber die Signatur ist ${isDebug ? 'debug' : 'nicht bestimmbar'}.` +
      '\n  Setze FINANCE_UPLOAD_STORE_FILE/_STORE_PASSWORD/_KEY_ALIAS/_KEY_PASSWORD und baue neu.',
  );
  process.exit(1);
}
if (isDebug) {
  console.log('\n⚠ debug-signiert. Nur für Entwicklung/interne Verteilung – NICHT bei Play hochladen.');
} else if (determined) {
  console.log('\n✓ Signatur-Prüfung bestanden (kein Debug-Zertifikat).');
}
