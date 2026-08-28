import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * RC5 — Screenshot-Modus ist ein Build-Flag, kein Runtime-Bypass, und die
 * Store-Builds dürfen es nie setzen.
 */
const { canAccessDemo, isScreenshotMode } = await import('../src/services/screenshotMode.ts');

// --- Zugriffslogik ------------------------------------------------
const prev = process.env.EXPO_PUBLIC_SCREENSHOT_MODE;
delete process.env.EXPO_PUBLIC_SCREENSHOT_MODE;

assert.equal(isScreenshotMode(), false, 'Standard: aus');
assert.equal(canAccessDemo({ isDev: false, isSuperuser: false }), false, 'normaler Release: kein Demo');
assert.equal(canAccessDemo({ isDev: true, isSuperuser: false }), true, 'Debug-Build: Demo ok');
assert.equal(canAccessDemo({ isDev: false, isSuperuser: true }), true, 'Superuser: Demo ok');

process.env.EXPO_PUBLIC_SCREENSHOT_MODE = '1';
assert.equal(isScreenshotMode(), true);
assert.equal(canAccessDemo({ isDev: false, isSuperuser: false }), true, 'Screenshot-Build: Demo ok');

process.env.EXPO_PUBLIC_SCREENSHOT_MODE = 'true';
assert.equal(isScreenshotMode(), false, 'nur exakt "1" zählt');

if (prev === undefined) delete process.env.EXPO_PUBLIC_SCREENSHOT_MODE;
else process.env.EXPO_PUBLIC_SCREENSHOT_MODE = prev;

// --- Kein Store-Build setzt das Flag -----------------------------
const eas = JSON.parse(readFileSync('eas.json', 'utf8'));
for (const [name, profile] of Object.entries(eas.build ?? {})) {
  const env = profile.env ?? {};
  assert.notEqual(
    env.EXPO_PUBLIC_SCREENSHOT_MODE,
    '1',
    `eas.json Profil "${name}" darf EXPO_PUBLIC_SCREENSHOT_MODE nicht auf 1 setzen`,
  );
}

const appJson = JSON.parse(readFileSync('app.json', 'utf8'));
const extra = JSON.stringify(appJson.expo?.extra ?? {});
assert.ok(!/SCREENSHOT_MODE/.test(extra), 'app.json extra setzt kein Screenshot-Flag');

// --- Die Gates nutzen wirklich canAccessDemo --------------------
for (const f of ['src/app/demo.tsx', 'src/app/(tabs)/more.tsx']) {
  const src = readFileSync(f, 'utf8');
  assert.match(src, /canAccessDemo\(/, `${f} nutzt canAccessDemo`);
  assert.ok(!/!__DEV__ && !access\.isSuperuser/.test(src), `${f}: alter Direkt-Check ist ersetzt`);
}

// --- demoDataCore: weiterhin rein synthetisch -------------------
const demoCore = readFileSync('src/services/demoDataCore.ts', 'utf8');
assert.match(demoCore, /DE00 0000/, 'Platzhalter-IBANs');
assert.ok(!/@gmail|@outlook|durakahat/i.test(demoCore), 'keine echte E-Mail im Demo-Datensatz');

console.log('screenshot-mode: Build-Flag, kein Bypass; kein Store-Profil setzt es; Gates verdrahtet');
