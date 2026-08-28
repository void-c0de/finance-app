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

const SHOTS = [
  ['01-dashboard', `${SCHEME}://`, '/(tabs)'],
  ['02-planning', `${SCHEME}://planung`, '/(tabs)/planning'],
  ['03-analytics', `${SCHEME}://analytics`, '/analytics'],
  ['04-themes', `${SCHEME}://themes`, '/themes'],
  ['05-transactions', `${SCHEME}://umsaetze`, '/(tabs)/transactions'],
  ['06-data-privacy', `${SCHEME}://data-privacy`, '/data-privacy'],
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

    for (const [name, uri, _route] of SHOTS) {
      try {
        adb(['shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', uri, PKG], {
          stdio: 'ignore',
        });
      } catch {
        /* Deep-Link evtl. nicht registriert — App bleibt auf letzter Seite */
      }
      // kurze, feste Wartezeit für Render (keine Sleep-Schleife)
      execFileSync(process.execPath, ['-e', 'setTimeout(()=>{}, 1500)']);

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
  }
}
