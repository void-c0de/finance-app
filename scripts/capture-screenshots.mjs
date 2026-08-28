/**
 * Store-Screenshots vom verbundenen Android-Gerät — nur synthetische Demo-Daten.
 *
 *   npm run screenshots:android
 *
 * Voraussetzungen:
 *  - Gerät per adb verbunden UND entsperrt (der OS-Sperrbildschirm wird NIE umgangen)
 *  - In der App: Mehr → Demo-Daten → Laden
 *  - Für den Analytics/Premium-Shot: ein Premium-Coupon eingelöst
 *
 * Schreibt PNGs nach store-assets/android/raw/. Prüft, dass keine offensichtlich
 * echten Strings (E-Mail, IBAN) im UI-Dump stehen, bevor ein Shot gespeichert wird.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const OUT = resolve('store-assets/android/raw');
const PKG = 'com.nocta_xz.financeapp';
const SCHEME = 'financeapp';

// `via`: 'deep' opens a financeapp:// URL; 'tab' taps the bottom tab bar
// (the (tabs) routes have no working custom-scheme deep link).
const TAB_Y = 0.97; // Anteil der Bildschirmhöhe
const SHOTS = [
  ['01-dashboard', { via: 'deep', url: `${SCHEME}://` }],
  ['02-transactions', { via: 'tab', frac: 0.38 }],
  ['03-planning', { via: 'tab', frac: 0.62 }],
  ['04-analytics', { via: 'deep', url: `${SCHEME}://analytics` }],
  ['05-themes', { via: 'deep', url: `${SCHEME}://themes` }],
  ['06-data-privacy', { via: 'deep', url: `${SCHEME}://data-privacy` }],
];

function adb(args, opts = {}) {
  return execFileSync('adb', args, { encoding: 'buffer', ...opts });
}
function adbText(args) {
  return adb(args, { encoding: 'utf8' });
}

// Gerät da?
const devices = adbText(['devices']).trim().split('\n').slice(1).filter((l) => /\tdevice$/.test(l));
if (devices.length === 0) {
  console.error('Kein entsperrtes adb-Gerät. Gerät verbinden und entsperren.');
  process.exitCode = 1;
} else {
  // Sperrbildschirm? -> abbrechen, nicht umgehen.
  const win = adbText(['shell', 'dumpsys', 'window']);
  if (/mDreamingLockscreen=true|mShowingLockscreen=true|isKeyguardShowing=true/.test(win)) {
    console.error('Gerät ist gesperrt. Bitte am Gerät entsperren und erneut ausführen.');
    process.exitCode = 1;
  } else {
    mkdirSync(OUT, { recursive: true });
    const FORBIDDEN = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b|DE\d{20}/;
    const size = adbText(['shell', 'wm', 'size']).match(/(\d+)x(\d+)/);
    const [w, h] = size ? [Number(size[1]), Number(size[2])] : [1080, 2400];
    const pause = (ms) => execFileSync(process.execPath, ['-e', `setTimeout(()=>{}, ${ms})`]);

    for (const [name, step] of SHOTS) {
      try {
        if (step.via === 'deep') {
          adb(['shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', step.url, PKG], { stdio: 'ignore' });
        } else {
          adb(['shell', 'input', 'tap', String(Math.round(w * step.frac)), String(Math.round(h * TAB_Y))], { stdio: 'ignore' });
        }
      } catch {
        /* App bleibt auf der letzten Seite */
      }
      pause(2500);

      const dump = (() => {
        try {
          adb(['shell', 'uiautomator', 'dump', '/sdcard/ui.xml'], { stdio: 'ignore' });
          return adbText(['shell', 'cat', '/sdcard/ui.xml']);
        } catch {
          return '';
        }
      })();
      if (FORBIDDEN.test(dump)) {
        console.error(`  ${name}: ABGEBROCHEN — echte E-Mail/IBAN im UI. Demo-Daten prüfen.`);
        continue;
      }

      const png = adb(['exec-out', 'screencap', '-p']);
      const path = resolve(OUT, `${name}.png`);
      writeFileSync(path, png);
      console.log(`  ${name}.png (${(png.length / 1024).toFixed(0)} KB)`);
    }
    console.log(`\nRohbilder in ${OUT}. Zuschneiden/normalisieren, dann nach store-assets/android/ übernehmen.`);
    console.log('Für Store-Qualität (kein Dev-Overlay): Release-APK mit EXPO_PUBLIC_SCREENSHOT_MODE=1 bauen,');
    console.log('in der App „Mehr → Demo-Daten → Laden", dann dieses Script.');
  }
}
