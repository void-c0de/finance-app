import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { PNG } from 'pngjs';

/**
 * The parametric brand generator is deterministic and produces every required
 * asset at the right size. Also: the "Droped" marketing image is gone and the
 * splash config points at a real file.
 */

// regenerate and confirm nothing drifts
const before = {};
const FILES = [
  'assets/images/icon.png',
  'assets/images/adaptive-foreground.png',
  'assets/images/adaptive-background.png',
  'assets/images/adaptive-monochrome.png',
  'assets/images/splash.png',
  'assets/images/favicon.png',
  'store-assets/play-icon-512.png',
  'store-assets/feature-graphic.png',
];
for (const f of FILES) {
  assert.ok(existsSync(f), `${f} exists`);
  before[f] = readFileSync(f);
}
execFileSync('node', ['scripts/build-brand.mjs'], { stdio: 'pipe' });
for (const f of FILES) {
  assert.deepEqual(readFileSync(f), before[f], `${f} is deterministic (build:brand produced identical bytes)`);
}

// dimensions
const dim = (f) => {
  const p = PNG.sync.read(readFileSync(f));
  return [p.width, p.height];
};
assert.deepEqual(dim('assets/images/icon.png'), [1024, 1024]);
assert.deepEqual(dim('store-assets/play-icon-512.png'), [512, 512]);
assert.deepEqual(dim('store-assets/feature-graphic.png'), [1024, 500]);
assert.deepEqual(dim('assets/images/favicon.png'), [48, 48]);
assert.deepEqual(dim('assets/images/adaptive-foreground.png'), [1024, 1024]);

// icon is fully opaque (Play requirement)
{
  const p = PNG.sync.read(readFileSync('store-assets/play-icon-512.png'));
  let minA = 255;
  for (let i = 3; i < p.data.length; i += 4) minA = Math.min(minA, p.data[i]);
  assert.ok(minA >= 250, `play icon effectively opaque (min alpha ${minA})`);
}
// adaptive foreground + monochrome are transparent (mark only)
for (const f of ['assets/images/adaptive-foreground.png', 'assets/images/adaptive-monochrome.png', 'assets/images/splash.png']) {
  const p = PNG.sync.read(readFileSync(f));
  let anyTransparent = false;
  for (let i = 3; i < p.data.length; i += 4) if (p.data[i] < 5) { anyTransparent = true; break; }
  assert.ok(anyTransparent, `${f} has a transparent background`);
}

// the "Droped" marketing image is gone; no dangling refs
assert.ok(!existsSync('assets/images/finance-mark.png'), 'finance-mark.png (foreign "Droped" mock) removed');
assert.ok(!existsSync('assets/images/splash-icon.png'), 'broken splash-icon.png removed');
const appJson = JSON.parse(readFileSync('app.json', 'utf8')).expo;
const splash = appJson.plugins.find((p) => Array.isArray(p) && p[0] === 'expo-splash-screen')[1];
assert.match(splash.image, /splash\.png$/, 'splash uses assets/images/splash.png');
assert.ok(existsSync(splash.image.replace('./', '')), 'splash image file exists');
assert.equal(splash.backgroundColor, '#246BFD', 'splash background is the theme primary');
assert.equal(appJson.android.adaptiveIcon.backgroundColor, '#246BFD', 'adaptive icon bg is the theme primary');
for (const layer of ['foregroundImage', 'backgroundImage', 'monochromeImage']) {
  assert.ok(existsSync(appJson.android.adaptiveIcon[layer].replace('./', '')), `adaptive ${layer} exists`);
}

// the store-asset validator passes
execFileSync('node', ['scripts/validate-store-assets.mjs'], { stdio: 'pipe' });

console.log('Brand assets: deterministic generator, correct sizes/alpha, splash fixed, no foreign marketing image — verified');
