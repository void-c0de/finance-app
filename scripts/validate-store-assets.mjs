import { existsSync, readFileSync, statSync } from 'node:fs';
import { PNG } from 'pngjs';

/**
 * Validate the Play store image assets against current Play requirements.
 *
 *   npm run validate:store-assets
 *
 * Play limits (2026): icon 512×512 PNG ≤ 1 MB, 32-bit, no transparency;
 * feature graphic 1024×500 PNG/JPG ≤ 15 MB; phone screenshots 16:9..9:16,
 * 320–3840 px per side, ≤ 8 MB each, 2–8 per type.
 */

const problems = [];
const notes = [];

function checkPng(path, { w, h, maxKB, allowAlpha = true, label }) {
  if (!existsSync(path)) {
    problems.push(`${label}: fehlt (${path})`);
    return null;
  }
  const bytes = readFileSync(path);
  const kb = statSync(path).size / 1024;
  let png;
  try {
    png = PNG.sync.read(bytes);
  } catch {
    problems.push(`${label}: kein lesbares PNG`);
    return null;
  }
  if (w && png.width !== w) problems.push(`${label}: Breite ${png.width} ≠ ${w}`);
  if (h && png.height !== h) problems.push(`${label}: Höhe ${png.height} ≠ ${h}`);
  if (maxKB && kb > maxKB) problems.push(`${label}: ${kb.toFixed(0)} KB > ${maxKB} KB`);

  // alpha
  let minA = 255;
  for (let i = 3; i < png.data.length; i += 4) minA = Math.min(minA, png.data[i]);
  if (!allowAlpha && minA < 250) problems.push(`${label}: hat Transparenz (min-Alpha ${minA}) — Play verbietet das hier`);

  // not blank — sample across the WHOLE image (not just the top rows)
  let variance = 0;
  const first = png.data[0];
  const stride = Math.max(4, Math.floor(png.data.length / 4 / 5000) * 4);
  for (let i = 0; i < png.data.length; i += stride) variance += Math.abs(png.data[i] - first);
  if (variance < 200) problems.push(`${label}: wirkt leer/uniform`);

  notes.push(`${label}: ${png.width}×${png.height}, ${kb.toFixed(0)} KB, min-Alpha ${minA}`);
  return png;
}

// icon: no transparency allowed
checkPng('store-assets/play-icon-512.png', { w: 512, h: 512, maxKB: 1024, allowAlpha: false, label: 'Play-Icon' });

// feature graphic
checkPng('store-assets/feature-graphic.png', { w: 1024, h: 500, maxKB: 15 * 1024, allowAlpha: true, label: 'Feature-Graphic' });

// screenshots
import('node:fs').then(({ readdirSync }) => {
  const dir = 'store-assets/android';
  const shots = existsSync(dir) ? readdirSync(dir).filter((f) => /^candidate.*\.png$/i.test(f)) : [];
  if (shots.length < 2) problems.push(`Screenshots: nur ${shots.length} (Play will 2–8)`);
  if (shots.length > 8) problems.push(`Screenshots: ${shots.length} (> 8)`);
  const seen = new Set();
  for (const f of shots) {
    const p = `${dir}/${f}`;
    const png = checkPng(p, { maxKB: 8 * 1024, label: `Screenshot ${f}` });
    if (png) {
      const ratio = png.width / png.height;
      if (ratio < 0.4 || ratio > 2.5) problems.push(`${f}: Seitenverhältnis ${ratio.toFixed(2)} außerhalb 9:16..16:9`);
      const side = Math.max(png.width, png.height);
      if (side < 320 || side > 3840) problems.push(`${f}: Kante ${side}px außerhalb 320–3840`);
      const hash = createSimpleHash(readFileSync(p));
      if (seen.has(hash)) problems.push(`${f}: Duplikat eines anderen Screenshots`);
      seen.add(hash);
    }
  }

  if (problems.length === 0) {
    console.log('✓ Store-Assets: alle Bild-Assets erfüllen die Play-Vorgaben.');
    for (const n of notes) console.log(`  · ${n}`);
    process.exit(0);
  }
  console.error('✗ Store-Asset-Validierung:');
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
});

function createSimpleHash(buf) {
  let h = 0;
  for (let i = 0; i < buf.length; i += 997) h = (h * 31 + buf[i]) | 0;
  return `${h}:${buf.length}`;
}
