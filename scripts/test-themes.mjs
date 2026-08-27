import assert from 'node:assert/strict';

import {
  financeColors,
  FINANCE_THEMES,
  FREE_THEME_NAMES,
  isFinanceThemeName,
  isPremiumTheme,
  PREMIUM_THEME_NAMES,
  resolvePaletteName,
} from '../src/theme/finance-theme.ts';

// --- free vs premium ------------------------------------------------
assert.deepEqual([...FREE_THEME_NAMES].sort(), ['amoled', 'dark', 'light', 'system'].sort());
assert.ok(PREMIUM_THEME_NAMES.length >= 5, 'mindestens 5 Premium-Themes');
assert.equal(isPremiumTheme('amoled'), false, 'AMOLED bleibt kostenlos');
assert.equal(isPremiumTheme('system'), false);
assert.equal(isPremiumTheme('ocean'), true);

assert.equal(isFinanceThemeName('violet'), true);
assert.equal(isFinanceThemeName('nope'), false);
assert.equal(isFinanceThemeName(null), false);

// --- system resolves to light/dark -------------------------------
assert.equal(resolvePaletteName('system', true), 'dark');
assert.equal(resolvePaletteName('system', false), 'light');
assert.equal(resolvePaletteName('ocean', true), 'ocean');

// --- every theme palette has the full semantic token set --------
const requiredTokens = Object.keys(financeColors.light);
for (const theme of FINANCE_THEMES) {
  if (!theme.palette) continue;
  const palette = financeColors[theme.palette];
  assert.ok(palette, `Palette für ${theme.id} existiert`);
  for (const token of requiredTokens) {
    assert.ok(token in palette, `${theme.id} hat Token ${token}`);
    assert.match(String(palette[token]), /^#|^rgba/, `${theme.id}.${token} ist eine Farbe`);
  }
}

// --- finance semantics stay stable: positive is greenish, negative reddish ---
function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
}
for (const theme of FINANCE_THEMES) {
  if (!theme.palette) continue;
  const p = financeColors[theme.palette];
  const [pr, pg, pb] = hexToRgb(p.positive);
  assert.ok(pg > pr && pg > pb, `${theme.id}: positive ist grünlich (nicht als Ausgabe missverständlich)`);
  const [nr, ng, nb] = hexToRgb(p.negative);
  assert.ok(nr > ng && nr > nb, `${theme.id}: negative ist rötlich`);
}

// --- accessibility: text vs background has real contrast --------
function luminance([r, g, b]) {
  const a = [r, g, b].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2];
}
function contrast(fg, bg) {
  const l1 = luminance(hexToRgb(fg));
  const l2 = luminance(hexToRgb(bg));
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}
for (const theme of FINANCE_THEMES) {
  if (!theme.palette) continue;
  const p = financeColors[theme.palette];
  assert.ok(contrast(p.text, p.background) >= 7, `${theme.id}: Haupttext klar lesbar (${contrast(p.text, p.background).toFixed(1)}:1)`);
  assert.ok(contrast(p.textSecondary, p.background) >= 3, `${theme.id}: Sekundärtext lesbar`);
  assert.ok(contrast(p.primary, p.background) >= 2.5, `${theme.id}: Akzent hebt sich ab`);
}

console.log('Themes: all tests passed');
