import { readFileSync, writeFileSync } from 'node:fs';
import { PNG } from 'pngjs';

/**
 * Google Play feature graphic: exactly 1024×500, 32-bit PNG, no alpha needed.
 *
 * Composition (deliberately text-free — the listing renders "Finance App" as the
 * title right above it, and a programmatic wordmark without a real font looks
 * unprofessional):
 *
 *   - a diagonal brand-blue gradient (colours sampled from the real app icon)
 *   - the real app icon (assets/images/icon.png), box-downscaled and placed
 *     centre-left with a soft rounded-corner mask
 *
 * No fake ratings / awards / bank logos / screenshots. On-brand, honest.
 *
 *   npm run build:feature-graphic
 */

const W = 1024;
const H = 500;
const OUT = 'store-assets/feature-graphic.png';

// brand blue sampled from assets/images/icon.png (~62,162,255) with a darker corner
const TL = [78, 170, 255]; // top-left, lighter
const BR = [40, 108, 214]; // bottom-right, deeper

const out = new PNG({ width: W, height: H });

// 1. diagonal gradient
for (let y = 0; y < H; y += 1) {
  for (let x = 0; x < W; x += 1) {
    const t = (x / W + y / H) / 2; // 0 at top-left → 1 at bottom-right
    const di = (y * W + x) * 4;
    out.data[di] = Math.round(TL[0] + (BR[0] - TL[0]) * t);
    out.data[di + 1] = Math.round(TL[1] + (BR[1] - TL[1]) * t);
    out.data[di + 2] = Math.round(TL[2] + (BR[2] - TL[2]) * t);
    out.data[di + 3] = 255;
  }
}

// subtle vignette so the icon reads
for (let y = 0; y < H; y += 1) {
  for (let x = 0; x < W; x += 1) {
    const dx = (x - W / 2) / (W / 2);
    const dy = (y - H / 2) / (H / 2);
    const v = Math.max(0, 1 - (dx * dx + dy * dy) * 0.18);
    const di = (y * W + x) * 4;
    for (let c = 0; c < 3; c += 1) out.data[di + c] = Math.round(out.data[di + c] * (0.92 + 0.08 * v));
  }
}

// 2. the real icon, area-averaged downscale (handles a non-integer factor)
const icon = PNG.sync.read(readFileSync('assets/images/icon.png'));
const ICON = 340;
const factor = icon.width / ICON;
const ox = 96; // left padding
const oy = Math.round((H - ICON) / 2);
const radius = 64; // rounded-corner mask

for (let y = 0; y < ICON; y += 1) {
  for (let x = 0; x < ICON; x += 1) {
    // rounded-corner alpha
    let a = 1;
    const cx = x < radius ? radius - x : x >= ICON - radius ? x - (ICON - radius - 1) : 0;
    const cy = y < radius ? radius - y : y >= ICON - radius ? y - (ICON - radius - 1) : 0;
    if (cx > 0 && cy > 0) {
      const d = Math.sqrt(cx * cx + cy * cy);
      a = d > radius ? 0 : d > radius - 1.5 ? radius - d : 1;
    }
    if (a <= 0) continue;

    // area-average the covered source block
    const sx0 = Math.floor(x * factor);
    const sy0 = Math.floor(y * factor);
    const sx1 = Math.min(icon.width, Math.ceil((x + 1) * factor));
    const sy1 = Math.min(icon.height, Math.ceil((y + 1) * factor));
    let r = 0, g = 0, b = 0, n = 0;
    for (let sy = sy0; sy < sy1; sy += 1) {
      for (let sx = sx0; sx < sx1; sx += 1) {
        const si = (sy * icon.width + sx) * 4;
        r += icon.data[si];
        g += icon.data[si + 1];
        b += icon.data[si + 2];
        n += 1;
      }
    }
    r /= n; g /= n; b /= n;

    const dx2 = ox + x;
    const dy2 = oy + y;
    const di = (dy2 * W + dx2) * 4;
    out.data[di] = Math.round(out.data[di] * (1 - a) + r * a);
    out.data[di + 1] = Math.round(out.data[di + 1] * (1 - a) + g * a);
    out.data[di + 2] = Math.round(out.data[di + 2] * (1 - a) + b * a);
  }
}

const buf = PNG.sync.write(out);
writeFileSync(OUT, buf);

const check = PNG.sync.read(readFileSync(OUT));
console.log(`✓ ${OUT} — ${check.width}×${check.height}, ${(buf.length / 1024).toFixed(0)} KB`);
console.log('  brand-blue gradient + the real app icon (rounded), no text, no fake badges.');
if (check.width !== 1024 || check.height !== 500) {
  console.error('✗ wrong dimensions');
  process.exit(1);
}
