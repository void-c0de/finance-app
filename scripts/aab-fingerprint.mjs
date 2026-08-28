import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

/**
 * Semantic fingerprint of an Android App Bundle (or APK — both are ZIPs).
 *
 *   npm run aab:fingerprint -- <path/to/app-release.aab> [--write]
 *
 * Two builds of the same source should produce the SAME semantic fingerprint
 * even though their raw file hashes differ (signature blocks, zip ordering,
 * embedded timestamps, and the build stamp all vary run to run).
 *
 * Method: walk the ZIP central directory (no decompression needed — the CRC-32
 * and sizes are stored there), drop entries that are signatures or known
 * non-deterministic metadata, sort by name, and hash the
 * `name\0crc32\0uncompressedSize` triples.
 *
 * This is an ANALYSIS aid, not a reproducible-build guarantee. Gradle + R8 are
 * not bit-reproducible here; the fingerprint tells you whether the parts that
 * matter (dex, resources, assets, native libs, the JS bundle) changed.
 */

const args = process.argv.slice(2);
const WRITE = args.includes('--write');
const file = args.find((a) => !a.startsWith('--'));

if (!file || !existsSync(file)) {
  console.error('usage: node scripts/aab-fingerprint.mjs <app-release.aab|.apk> [--write]');
  process.exit(2);
}

const buf = readFileSync(file);

// ---- locate End Of Central Directory ---------------------------------------
function findEocd(b) {
  // EOCD signature 0x06054b50, scan backwards over the (max 64k) comment
  for (let i = b.length - 22; i >= Math.max(0, b.length - 22 - 0xffff); i--) {
    if (b.readUInt32LE(i) === 0x06054b50) return i;
  }
  throw new Error('not a ZIP (no EOCD) — is this really an AAB/APK?');
}
const eocd = findEocd(buf);
let cdCount = buf.readUInt16LE(eocd + 10);
let cdSize = buf.readUInt32LE(eocd + 12);
let cdOffset = buf.readUInt32LE(eocd + 16);

// ZIP64 (large bundles)
if (cdOffset === 0xffffffff || cdCount === 0xffff) {
  const locator = eocd - 20;
  if (buf.readUInt32LE(locator) === 0x07064b50) {
    const z64 = Number(buf.readBigUInt64LE(locator + 8));
    if (buf.readUInt32LE(z64) === 0x06064b50) {
      cdCount = Number(buf.readBigUInt64LE(z64 + 32));
      cdSize = Number(buf.readBigUInt64LE(z64 + 40));
      cdOffset = Number(buf.readBigUInt64LE(z64 + 48));
    }
  }
}

// ---- walk the central directory ------------------------------------------
const entries = [];
let p = cdOffset;
for (let n = 0; n < cdCount; n++) {
  if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error(`bad central directory header at ${p}`);
  const crc = buf.readUInt32LE(p + 16);
  const compSize = buf.readUInt32LE(p + 20);
  const uncompSize = buf.readUInt32LE(p + 24);
  const nameLen = buf.readUInt16LE(p + 28);
  const extraLen = buf.readUInt16LE(p + 30);
  const commentLen = buf.readUInt16LE(p + 32);
  const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
  entries.push({ name, crc, compSize, uncompSize });
  p += 46 + nameLen + extraLen + commentLen;
}

// ---- classify -----------------------------------------------------------
const IGNORE = [
  /^META-INF\/[^/]+\.(RSA|DSA|EC|SF)$/i, // signature blocks
  /^META-INF\/MANIFEST\.MF$/, // contains per-file digests + tool version
  /^META-INF\/com\/android\/build\/gradle\/app-metadata\.properties$/, // agp/gradle versions + timestamp
  /^stamp-cert-sha256$/,
  /^BUNDLE-METADATA\/com\.android\.tools\.build\.libraries\/dependencies\.pb$/, // dep graph blob, ordering varies
  /^BUNDLE-METADATA\/com\.android\.tools\.build\.gradle\/app-metadata\.properties$/,
];
const isIgnored = (name) => IGNORE.some((re) => re.test(name));

const semantic = entries
  .filter((e) => !e.name.endsWith('/') && !isIgnored(e.name))
  .map((e) => ({ name: e.name, crc: e.crc >>> 0, size: e.uncompSize }))
  .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

const digest = createHash('sha256');
for (const e of semantic) digest.update(`${e.name}\0${e.crc}\0${e.size}\n`);
const semanticFingerprint = digest.digest('hex');

// group summary — which functional areas the entries belong to
const groups = {};
for (const e of semantic) {
  const area =
    /\.dex$/.test(e.name) ? 'dex'
    : /^base\/lib\/|^lib\/|\.so$/.test(e.name) ? 'native-libs'
    : /assets\/.*(\.hbc|\.bundle)$/.test(e.name) || /index\.android\.bundle$/.test(e.name) ? 'js-bundle'
    : /^base\/res\/|^res\/|resources\.(arsc|pb)$/.test(e.name) ? 'resources'
    : /^base\/assets\/|^assets\//.test(e.name) ? 'assets'
    : /^base\/root\//.test(e.name) ? 'root'
    : /AndroidManifest/.test(e.name) ? 'manifest'
    : 'other';
  groups[area] ??= { count: 0, bytes: 0, crc: createHash('sha256') };
  groups[area].count++;
  groups[area].bytes += e.size;
  groups[area].crc.update(`${e.name}\0${e.crc}\n`);
}
const groupOut = {};
for (const [k, v] of Object.entries(groups)) groupOut[k] = { entries: v.count, bytes: v.bytes, fingerprint: v.crc.digest('hex').slice(0, 16) };

const rawSha = createHash('sha256').update(buf).digest('hex');

const result = {
  schema: 'finance-app/aab-fingerprint@1',
  file,
  bytes: buf.length,
  rawSha256: rawSha,
  entryCount: entries.length,
  semanticEntryCount: semantic.length,
  ignoredEntryCount: entries.filter((e) => isIgnored(e.name)).length,
  semanticFingerprint,
  groups: groupOut,
};

console.log(JSON.stringify(result, null, 2));

if (WRITE) {
  const out = 'store-assets/aab-fingerprint.json';
  let history = [];
  if (existsSync(out)) {
    try { history = JSON.parse(readFileSync(out, 'utf8')).history ?? []; } catch { /* reset */ }
  }
  const prev = history[0];
  if (prev && prev.semanticFingerprint === semanticFingerprint) {
    console.error(`\n✓ semantic fingerprint UNCHANGED vs previous recorded build (${prev.semanticFingerprint.slice(0, 12)}…)`);
  } else if (prev) {
    console.error(`\n⚠ semantic fingerprint CHANGED: ${prev.semanticFingerprint.slice(0, 12)}… → ${semanticFingerprint.slice(0, 12)}…`);
    for (const area of Object.keys(groupOut)) {
      if (prev.groups?.[area]?.fingerprint !== groupOut[area].fingerprint) console.error(`    · ${area} differs`);
    }
  }
  history.unshift({ ...result, recordedFor: process.env.GIT_SHA ?? null });
  writeFileSync(out, JSON.stringify({ schema: result.schema, history: history.slice(0, 10) }, null, 2) + '\n');
  console.error(`\nrecorded → ${out}`);
}
