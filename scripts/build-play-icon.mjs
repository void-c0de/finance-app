import { readFileSync, writeFileSync } from 'node:fs';
import { PNG } from 'pngjs';

/**
 * Google Play store listing icon: exactly 512×512, 32-bit PNG.
 *
 * Source: assets/images/icon.png — the real production app icon (1024×1024,
 * full-bleed, opaque). 1024→512 is an exact 2:1 reduction, so a 2×2 box average
 * is a clean, artefact-free downscale (no interpolation guessing).
 *
 * Output: store-assets/play-icon-512.png
 *
 *   npm run build:play-icon
 */

const SRC = 'assets/images/icon.png';
const OUT = 'store-assets/play-icon-512.png';
const TARGET = 512;

const src = PNG.sync.read(readFileSync(SRC));
if (src.width !== src.height) {
  console.error(`✗ ${SRC} ist nicht quadratisch (${src.width}×${src.height}).`);
  process.exit(1);
}
if (src.width % TARGET !== 0) {
  console.error(`✗ ${SRC} (${src.width}px) ist kein ganzzahliges Vielfaches von ${TARGET}px — Box-Downscale nicht sauber.`);
  process.exit(1);
}

const factor = src.width / TARGET;
const out = new PNG({ width: TARGET, height: TARGET });

for (let y = 0; y < TARGET; y += 1) {
  for (let x = 0; x < TARGET; x += 1) {
    let r = 0, g = 0, b = 0, a = 0;
    for (let dy = 0; dy < factor; dy += 1) {
      for (let dx = 0; dx < factor; dx += 1) {
        const si = ((y * factor + dy) * src.width + (x * factor + dx)) * 4;
        r += src.data[si];
        g += src.data[si + 1];
        b += src.data[si + 2];
        a += src.data[si + 3];
      }
    }
    const n = factor * factor;
    const di = (y * TARGET + x) * 4;
    out.data[di] = Math.round(r / n);
    out.data[di + 1] = Math.round(g / n);
    out.data[di + 2] = Math.round(b / n);
    out.data[di + 3] = Math.round(a / n);
  }
}

const buf = PNG.sync.write(out);
writeFileSync(OUT, buf);

// verify
const check = PNG.sync.read(readFileSync(OUT));
let minA = 255;
for (let i = 3; i < check.data.length; i += 4) minA = Math.min(minA, check.data[i]);
console.log(`✓ ${OUT} — ${check.width}×${check.height}, ${(buf.length / 1024).toFixed(0)} KB, min-alpha ${minA} (${minA >= 250 ? 'effektiv deckend' : 'hat Transparenz'})`);
console.log('  Quelle: ' + SRC + ' (' + src.width + '×' + src.height + '). Play zeigt das Icon maskiert mit abgerundeten Ecken.');
