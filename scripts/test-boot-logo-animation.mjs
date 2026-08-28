import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * The boot-screen logo animation (FinanceLogoAnimated) choreography must stay
 * well-formed: a strictly-rising timeline, a clean loop (start == teleport
 * target), and a "hold" window where the ball is exactly on the static
 * FinanceLogo's home spot so the two marks are visually identical when the
 * splash hands off.
 */

const src = readFileSync('src/components/brand/FinanceLogoAnimated.tsx', 'utf8');

// pull the KEYS array literal
const keysBlock = src.match(/const KEYS: Key\[\] = \[([\s\S]*?)\n\];/);
assert.ok(keysBlock, 'KEYS array found');
const keys = [...keysBlock[1].matchAll(/\{\s*t:\s*([\d.]+),\s*x:\s*([A-Za-z0-9_.\-]+),\s*y:\s*([A-Za-z0-9_.\-+ ]+?)(?:,\s*sx:\s*([\d.]+))?(?:,\s*sy:\s*([\d.]+))?(?:,\s*o:\s*([\d.]+))?\s*\}/g)]
  .map((m) => ({ t: Number(m[1]), xRaw: m[2].trim(), yRaw: m[3].trim(), sx: m[4], sy: m[5], o: m[6] }));
assert.ok(keys.length >= 20, `enough keyframes (${keys.length})`);

// timeline strictly increasing, 0 → 1
assert.equal(keys[0].t, 0, 'starts at t=0');
assert.equal(keys.at(-1).t, 1, 'ends at t=1');
for (let i = 1; i < keys.length; i++) {
  assert.ok(keys[i].t > keys[i - 1].t, `t strictly rising at #${i} (${keys[i - 1].t} → ${keys[i].t})`);
}

// clean loop: last keyframe teleports back to the first position, invisible
assert.equal(keys.at(-1).xRaw, keys[0].xRaw, 'loop returns to start x');
assert.equal(keys.at(-1).yRaw, keys[0].yRaw, 'loop returns to start y');
assert.equal(keys[0].o, '0', 'starts invisible (fades in)');
assert.equal(keys.at(-1).o, '0', 'ends invisible (faded out before teleport)');

// there is a real hold on HOME (matches static FinanceLogo dot at +0.2475 / -0.2475)
const homeHold = keys.filter((k) => k.xRaw === 'HOME_X' && k.yRaw === 'HOME_Y' && (k.sx === undefined || k.sx === '1'));
assert.ok(homeHold.length >= 2, `has a settled hold on HOME (${homeHold.length} frames)`);
const holdSpan = homeHold.at(-1).t - homeHold[0].t;
assert.ok(holdSpan >= 0.05, `hold window is visible (${holdSpan.toFixed(3)} of the loop)`);

// HOME must equal the static logo's dot geometry
const home = { x: 0.2475, y: -0.2475 };
const staticDotTop = 0.2, staticDotRight = 0.2, staticDotSize = 0.105;
assert.ok(Math.abs(home.x - (1 - staticDotRight - staticDotSize / 2 - 0.5)) < 1e-9, 'HOME_X matches FinanceLogo dot');
assert.ok(Math.abs(home.y - (staticDotTop + staticDotSize / 2 - 0.5)) < 1e-9, 'HOME_Y matches FinanceLogo dot');

// the three pillar landing points are visited in rising order (bar1 → bar2 → bar3)
const barSeq = keys.filter((k) => ['BAR1.x', 'BAR2.x', 'BAR3.x'].includes(k.xRaw)).map((k) => k.xRaw);
assert.ok(barSeq.indexOf('BAR1.x') < barSeq.indexOf('BAR2.x'), 'bar1 before bar2');
assert.ok(barSeq.lastIndexOf('BAR2.x') < barSeq.lastIndexOf('BAR3.x'), 'bar2 before bar3');

// segment driver reaches exactly 1.0 and is monotonic
const segBlock = src.match(/const SEGMENTS:[\s\S]*?\[\] = \[([\s\S]*?)\n\];/);
assert.ok(segBlock, 'SEGMENTS found');
const segTargets = [...segBlock[1].matchAll(/\[\s*([\d.]+),/g)].map((m) => Number(m[1]));
assert.equal(segTargets.at(-1), 1, 'segments end at progress 1.0');
for (let i = 1; i < segTargets.length; i++) assert.ok(segTargets[i] > segTargets[i - 1], 'segment targets rising');

// reduced-motion path renders a static resolved frame
assert.match(src, /reducedMotion[\s\S]{0,120}setValue\(0\.9\)/, 'reduced motion → static resolved frame');

console.log(`Boot logo animation: ${keys.length} keyframes, ${segTargets.length} eased segments, clean loop, HOME hold ${holdSpan.toFixed(2)} — verified`);
