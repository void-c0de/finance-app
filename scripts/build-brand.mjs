import { mkdirSync, writeFileSync } from 'node:fs';
import { PNG } from 'pngjs';

/**
 * Parametric brand-asset generator — one source of truth for every icon / splash
 * / store image. Theme-aligned (primary #246BFD), deterministic, no design tool.
 *
 * The mark: an upward chevron (growth / rising trend), white, rounded caps, with
 * the lower legs stepped to read as a rising baseline. It is the same glyph used
 * in-app.
 *
 *   npm run build:brand
 *
 * Outputs (all regenerated):
 *   assets/images/icon.png                       1024  full icon (mark on gradient)
 *   assets/images/adaptive-foreground.png        1024  mark only, transparent, in the adaptive safe zone
 *   assets/images/adaptive-background.png        1024  the gradient
 *   assets/images/adaptive-monochrome.png        1024  white mark on transparent (themed icons)
 *   assets/images/splash.png                     1024  mark on the deep-brand ground (used with backgroundColor)
 *   assets/images/favicon.png                      48
 *   store-assets/play-icon-512.png                512
 *   store-assets/feature-graphic.png       1024x500
 */

// --- palette (from src/theme/finance-theme.ts) -----------------------
const PRIMARY = [0x24, 0x6b, 0xfd]; // #246BFD
const PRIMARY_DEEP = [0x14, 0x3f, 0xc8]; // deeper corner
const GROUND_TOP = [0x1c, 0x53, 0xe8];
const GROUND_BOT = [0x10, 0x33, 0xa6]; // splash ground, calmer than the icon

function lerp(a, b, t) {
  return [Math.round(a[0] + (b[0] - a[0]) * t), Math.round(a[1] + (b[1] - a[1]) * t), Math.round(a[2] + (b[2] - a[2]) * t)];
}

// --- signed-distance mark -------------------------------------------
// Coordinates are normalised to the unit square [0,1]. The mark occupies a
// centred box; `inset` shrinks it (adaptive safe zone).
function markAlpha(u, v, inset = 0) {
  // remap to a padded box
  const pad = 0.16 + inset;
  const x = (u - pad) / (1 - 2 * pad);
  const y = (v - pad) / (1 - 2 * pad);
  if (x < -0.2 || x > 1.2 || y < -0.2 || y > 1.2) return 0;

  // chevron: two thick capsules from the bottom corners up to the apex,
  // plus a short stepped tail on each leg (rising-baseline hint).
  const apex = [0.5, 0.12];
  const legL = [0.12, 0.74];
  const legR = [0.88, 0.74];
  const stepL = [0.06, 0.9];
  const stepR = [0.94, 0.9];
  const thick = 0.135;

  const d = Math.min(
    capsule(x, y, apex, legL, thick),
    capsule(x, y, apex, legR, thick),
    capsule(x, y, legL, stepL, thick * 0.82),
    capsule(x, y, legR, stepR, thick * 0.82),
  );
  // soft edge ~1.2px at 1024 → 0.0012 in unit space
  const aa = 0.006;
  return clamp01((thick - d) / aa + 0.5) === undefined ? 0 : smooth(d, thick, aa);
}

function smooth(d, r, aa) {
  if (d <= r - aa) return 1;
  if (d >= r + aa) return 0;
  const t = (r + aa - d) / (2 * aa);
  return t * t * (3 - 2 * t);
}
function capsule(px, py, a, b, r) {
  const pax = px - a[0], pay = py - a[1];
  const bax = b[0] - a[0], bay = b[1] - a[1];
  const h = clamp01((pax * bax + pay * bay) / (bax * bax + bay * bay));
  const dx = pax - bax * h, dy = pay - bay * h;
  return Math.sqrt(dx * dx + dy * dy) - r * 0; // r handled by caller via smooth()
}
function clamp01(x) {
  return Math.max(0, Math.min(1, x));
}

// --- renderers -----------------------------------------------------
function drawIcon(size, { ground = 'icon', markInset = 0, markColor = 'white', bgAlpha = 1 } = {}) {
  const png = new PNG({ width: size, height: size });
  for (let py = 0; py < size; py += 1) {
    for (let px = 0; px < size; px += 1) {
      const u = (px + 0.5) / size;
      const v = (py + 0.5) / size;
      const di = (py * size + px) * 4;

      let r = 0, g = 0, b = 0, a = 0;
      if (ground === 'icon' || ground === 'splash' || ground === 'background') {
        const t = ground === 'icon' ? (u * 0.55 + v * 0.85) / 1.4 : v;
        const [c0, c1] = ground === 'icon' ? [PRIMARY, PRIMARY_DEEP] : [GROUND_TOP, GROUND_BOT];
        [r, g, b] = lerp(c0, c1, clamp01(t));
        // soft top-left highlight
        const hx = u - 0.28, hy = v - 0.24;
        const hl = Math.max(0, 1 - (hx * hx + hy * hy) * 2.4);
        r = Math.min(255, r + hl * 26); g = Math.min(255, g + hl * 26); b = Math.min(255, b + hl * 22);
        a = Math.round(255 * bgAlpha);
      }

      // the mark
      const m = markAlphaAA(u, v, markInset, size);
      if (m > 0) {
        let mr = 255, mg = 255, mb = 255;
        if (markColor !== 'white') { [mr, mg, mb] = markColor; }
        // subtle vertical sheen on the mark
        const sheen = 1 - v * 0.10;
        mr = Math.round(mr * sheen); mg = Math.round(mg * sheen); mb = Math.round(mb * sheen);
        if (a === 0) { // transparent ground → mark defines alpha
          r = mr; g = mg; b = mb; a = Math.round(255 * m);
        } else {
          r = Math.round(r * (1 - m) + mr * m);
          g = Math.round(g * (1 - m) + mg * m);
          b = Math.round(b * (1 - m) + mb * m);
        }
      }
      png.data[di] = r; png.data[di + 1] = g; png.data[di + 2] = b; png.data[di + 3] = a;
    }
  }
  return png;
}

// supersampled mark alpha (3x3) for clean edges
function markAlphaAA(u, v, inset, size) {
  const step = 1 / (size * 3);
  let acc = 0;
  for (let sy = -1; sy <= 1; sy += 1) {
    for (let sx = -1; sx <= 1; sx += 1) {
      acc += rawMark(u + sx * step, v + sy * step, inset);
    }
  }
  return acc / 9;
}
function rawMark(u, v, inset) {
  // Wider padding so the stroke + its rounded caps stay clear of the tile edge
  // and the OS adaptive-icon / circle mask (user report: "geht bisschen über
  // den Rand heraus").
  const pad = 0.17 + inset;
  const x = (u - pad) / (1 - 2 * pad);
  const y = (v - pad) / (1 - 2 * pad);

  // Upward trend arrow: a confident chevron whose right leg rises above the
  // apex (reads as "up and to the right" = growth). Rounded caps. Endpoints
  // pulled inside the unit box so cap + half-thickness never cross it.
  const apex = [0.44, 0.2];
  const footL = [0.12, 0.82];
  const tipR = [0.86, 0.12];
  const kneeR = [0.6, 0.5]; // slight bend so the right stroke has energy
  const T = 0.128;

  const d = Math.min(
    segDist(x, y, apex, footL),
    segDist(x, y, apex, kneeR),
    segDist(x, y, kneeR, tipR),
  );
  return d <= T ? 1 : 0;
}
function segDist(px, py, a, b) {
  const pax = px - a[0], pay = py - a[1];
  const bax = b[0] - a[0], bay = b[1] - a[1];
  const h = clamp01((pax * bax + pay * bay) / (bax * bax + bay * bay));
  const dx = pax - bax * h, dy = pay - bay * h;
  return Math.sqrt(dx * dx + dy * dy);
}

function boxDownscale(src, target) {
  const factor = src.width / target;
  const out = new PNG({ width: target, height: target });
  for (let y = 0; y < target; y += 1) {
    for (let x = 0; x < target; x += 1) {
      const sx0 = Math.floor(x * factor), sy0 = Math.floor(y * factor);
      const sx1 = Math.min(src.width, Math.ceil((x + 1) * factor));
      const sy1 = Math.min(src.height, Math.ceil((y + 1) * factor));
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      for (let sy = sy0; sy < sy1; sy += 1) for (let sx = sx0; sx < sx1; sx += 1) {
        const si = (sy * src.width + sx) * 4;
        r += src.data[si]; g += src.data[si + 1]; b += src.data[si + 2]; a += src.data[si + 3]; n += 1;
      }
      const di = (y * target + x) * 4;
      out.data[di] = Math.round(r / n); out.data[di + 1] = Math.round(g / n);
      out.data[di + 2] = Math.round(b / n); out.data[di + 3] = Math.round(a / n);
    }
  }
  return out;
}

function save(png, path) {
  writeFileSync(path, PNG.sync.write(png));
  console.log(`  ${path}  ${png.width}×${png.height}`);
}

// --- build -------------------------------------------------------
mkdirSync('store-assets', { recursive: true });
console.log('brand assets (primary #246BFD):');

// full app icon @ 1024
const icon = drawIcon(1024, { ground: 'icon' });
save(icon, 'assets/images/icon.png');
save(boxDownscale(icon, 512), 'store-assets/play-icon-512.png');
save(boxDownscale(icon, 48), 'assets/images/favicon.png');

// adaptive layers — foreground mark sits in the inner ~66% safe zone
save(drawIcon(1024, { ground: 'transparent', markInset: 0.12 }), 'assets/images/adaptive-foreground.png');
save(drawIcon(1024, { ground: 'background' }), 'assets/images/adaptive-background.png');
save(drawIcon(1024, { ground: 'transparent', markInset: 0.12, markColor: [255, 255, 255] }), 'assets/images/adaptive-monochrome.png');

// splash — transparent mark only; expo-splash-screen composites it on
// `backgroundColor`. Slightly inset so `imageWidth` renders it at a sensible size.
save(drawIcon(1024, { ground: 'transparent', markInset: 0.06 }), 'assets/images/splash.png');

// feature graphic 1024x500 — gradient + the icon, centre-left
{
  const W = 1024, H = 500;
  const fg = new PNG({ width: W, height: H });
  for (let y = 0; y < H; y += 1) for (let x = 0; x < W; x += 1) {
    const t = (x / W + y / H) / 2;
    const [r, g, b] = lerp(GROUND_TOP, GROUND_BOT, t);
    const hx = x / W - 0.25, hy = y / H - 0.3;
    const hl = Math.max(0, 1 - (hx * hx + hy * hy) * 2.2) * 22;
    const di = (y * W + x) * 4;
    fg.data[di] = Math.min(255, r + hl); fg.data[di + 1] = Math.min(255, g + hl);
    fg.data[di + 2] = Math.min(255, b + hl); fg.data[di + 3] = 255;
  }
  const badge = 300;
  const bi = boxDownscale(icon, badge);
  const ox = 96, oy = Math.round((H - badge) / 2), rad = 56;
  for (let y = 0; y < badge; y += 1) for (let x = 0; x < badge; x += 1) {
    let m = 1;
    const cx = x < rad ? rad - x : x >= badge - rad ? x - (badge - rad - 1) : 0;
    const cy = y < rad ? rad - y : y >= badge - rad ? y - (badge - rad - 1) : 0;
    if (cx > 0 && cy > 0) { const d = Math.hypot(cx, cy); m = d > rad ? 0 : d > rad - 1.5 ? rad - d : 1; }
    if (m <= 0) continue;
    const si = (y * badge + x) * 4;
    const di = ((oy + y) * W + (ox + x)) * 4;
    for (let c = 0; c < 3; c += 1) fg.data[di + c] = Math.round(fg.data[di + c] * (1 - m) + bi.data[si + c] * m);
  }
  save(fg, 'store-assets/feature-graphic.png');
}

console.log('done. Next: `npx expo prebuild -p android --no-install` to regenerate the native icons.');
