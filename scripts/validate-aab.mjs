import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, statSync } from 'node:fs';

/**
 * Validate the Play AAB. Two layers:
 *
 *  1. Structural (always): an AAB is a zip. Check the required members exist —
 *     BundleConfig.pb, base/manifest/AndroidManifest.xml, base/dex/, base
 *     resources, native libs — using the system `unzip -l`.
 *  2. bundletool (optional): if a bundletool jar is available (env
 *     BUNDLETOOL_JAR, or ./tools/bundletool*.jar), run `bundletool validate`
 *     and `build-apks --connected-device=false` size estimate.
 *
 * Writes store-assets/aab-validation.json.
 *
 *   npm run validate:aab [path/to/app-release.aab]
 */

const AAB = process.argv.find((a) => a.endsWith('.aab')) || 'android/app/build/outputs/bundle/release/app-release.aab';
const OUT = 'store-assets/aab-validation.json';

if (!existsSync(AAB)) {
  console.error(`✗ AAB nicht gefunden: ${AAB}  (npm run release:android:aab)`);
  process.exit(1);
}

const bytes = readFileSync(AAB);
const sha256 = createHash('sha256').update(bytes).digest('hex');
const sizeMB = (bytes.length / 1024 / 1024).toFixed(1);

// --- 1. structural ---------------------------------------------------
let entries = [];
try {
  entries = execFileSync('unzip', ['-Z1', AAB], { encoding: 'utf8' }).split('\n').filter(Boolean);
} catch {
  try {
    entries = execFileSync('unzip', ['-l', AAB], { encoding: 'utf8' })
      .split('\n')
      .map((l) => l.trim().split(/\s+/).pop())
      .filter((n) => n && n.includes('/'));
  } catch {
    console.error('✗ konnte den AAB-Inhalt nicht lesen (unzip fehlt).');
    process.exit(1);
  }
}

const REQUIRED = [
  { name: 'BundleConfig.pb', re: /^BundleConfig\.pb$/ },
  { name: 'base manifest', re: /^base\/manifest\/AndroidManifest\.xml$/ },
  { name: 'base dex', re: /^base\/dex\/.*\.dex$/ },
  { name: 'base resources.pb', re: /^base\/resources\.pb$/ },
  { name: 'base native libs', re: /^base\/lib\/(arm64-v8a|armeabi-v7a)\/.*\.so$/ },
  { name: 'base assets', re: /^base\/assets\// },
];
const structural = REQUIRED.map((r) => ({ requirement: r.name, present: entries.some((e) => r.re.test(e)) }));
const structuralOk = structural.every((s) => s.present);

const nativeLibs = [...new Set(entries.filter((e) => /^base\/lib\/[^/]+\//.test(e)).map((e) => e.split('/')[2]))];
const hasSqlcipher = entries.some((e) => /libexpo-sqlite\.so$/.test(e));
const hasBilling = entries.some((e) => /billing|openiap/i.test(e)); // kotlin AAR → in dex, so this is a weak check

// --- 2. bundletool (optional) --------------------------------------
function findBundletool() {
  if (process.env.BUNDLETOOL_JAR && existsSync(process.env.BUNDLETOOL_JAR)) return process.env.BUNDLETOOL_JAR;
  for (const p of ['tools/bundletool.jar', 'tools/bundletool-all.jar']) if (existsSync(p)) return p;
  try {
    const glob = execFileSync('bash', ['-c', 'ls tools/bundletool*.jar 2>/dev/null | head -1'], { encoding: 'utf8' }).trim();
    if (glob && existsSync(glob)) return glob;
  } catch {
    /* none */
  }
  return null;
}

const bt = findBundletool();
let bundletool = { available: false, validated: null, downloadSizeBytes: null, note: 'bundletool jar not present — see store-assets/SPEC-bundletool.md' };
if (bt) {
  bundletool = { available: true, jar: bt.replace(/.*[/\\]/, ''), validated: null, downloadSizeBytes: null, note: null };
  try {
    execFileSync('java', ['-jar', bt, 'validate', '--bundle', AAB], { stdio: 'pipe' });
    bundletool.validated = true;
  } catch (e) {
    bundletool.validated = false;
    bundletool.note = `bundletool validate failed: ${String(e.stderr || e.message).slice(0, 160)}`;
  }
  // rough download-size estimate for a generic device
  try {
    const tmp = `${process.env.TEMP || '/tmp'}/rc8-aab-${Date.now()}.apks`;
    execFileSync('java', ['-jar', bt, 'build-apks', '--bundle', AAB, '--output', tmp, '--mode=default', '--connected-device=false'], { stdio: 'pipe' });
    const sz = execFileSync('bash', ['-c', `unzip -l "${tmp}" | awk '/splits\\/|standalones\\//{s+=$1} END{print s}'`], { encoding: 'utf8' }).trim();
    if (sz) bundletool.downloadSizeBytes = Number(sz);
    execFileSync('bash', ['-c', `rm -f "${tmp}"`]);
  } catch {
    /* size estimate optional */
  }
}

// --- report -------------------------------------------------------
const app = JSON.parse(readFileSync('app.json', 'utf8')).expo;
let gitSha = null;
try {
  gitSha = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim();
} catch {
  /* not a repo */
}

const result = {
  schema: 'finance-app/aab-validation@1',
  aab: AAB,
  sizeMB: Number(sizeMB),
  uploadSizeBytes: bytes.length,
  sha256,
  gitSha,
  app: { version: app.version, versionCode: app.android?.versionCode, package: app.android?.package },
  structural: { ok: structuralOk, checks: structural },
  nativeAbis: nativeLibs,
  sqlcipherLinked: hasSqlcipher,
  bundletool,
  distinction: 'sizeMB / uploadSizeBytes = the .aab you upload. bundletool.downloadSizeBytes ≈ what a device downloads (per-device split). They are NOT the same.',
};

writeFileSync(OUT, JSON.stringify(result, null, 2) + '\n');

console.log(`AAB: ${AAB}`);
console.log(`  Upload-Größe: ${sizeMB} MB   SHA-256: ${sha256.slice(0, 16)}…`);
console.log(`  Version: ${app.version} / vc ${app.android?.versionCode}   Package: ${app.android?.package}`);
console.log(`  Struktur: ${structuralOk ? 'OK' : 'UNVOLLSTÄNDIG'}   ABIs: ${nativeLibs.join(', ')}   SQLCipher: ${hasSqlcipher ? 'ja' : 'NEIN'}`);
if (bundletool.available) {
  console.log(`  bundletool: validate=${bundletool.validated}${bundletool.downloadSizeBytes ? `  ~Download ${(bundletool.downloadSizeBytes / 1024 / 1024).toFixed(1)} MB` : ''}`);
} else {
  console.log('  bundletool: nicht vorhanden (optional — siehe store-assets/SPEC-bundletool.md)');
}
console.log(`  → ${OUT}`);

if (!structuralOk) process.exit(1);
if (bundletool.available && bundletool.validated === false) process.exit(1);
