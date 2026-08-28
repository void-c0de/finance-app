/**
 * iOS-Gerät ansprechen — das Nächste an `adb` für iPhone.
 * Funktioniert NUR, wenn ein iPhone gepairt und erreichbar ist (USB oder WLAN).
 *
 *   npm run ios:device:status   – iOS-Version, Modus, Developer Mode, App installiert?
 *   npm run ios:device:logs     – Syslog des Finance-App-Prozesses (wie `adb logcat`)
 *   npm run ios:device:open     – Finance App auf dem iPhone starten
 *
 * Kein Signieren, kein Face-ID-Bypass, keine Apple-ID. Nur lesende/harmlose Aktionen.
 */
import { execFileSync, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const PMD = resolve('.tools/idevice-venv/Scripts/pymobiledevice3.exe');
const BUNDLE_ID = 'com.nocta-xz.financeapp';
const mode = process.argv[2] ?? 'status';

if (!existsSync(PMD)) {
  console.error('pymobiledevice3 fehlt. Setup:  py -3.12 -m venv .tools/idevice-venv && .tools/idevice-venv/Scripts/pip install pymobiledevice3');
  process.exitCode = 1;
} else {
  const pmd = (args, opts = {}) =>
    execFileSync(PMD, args, { encoding: 'utf8', timeout: opts.timeout ?? 15_000, stdio: opts.stdio });

  // Gerät da?
  let target = null;
  try {
    const usb = JSON.parse(pmd(['usbmux', 'list']));
    if (Array.isArray(usb) && usb.length) target = { via: 'usb', udid: usb[0].Identifier ?? usb[0].UniqueDeviceID };
  } catch {
    /* ignore */
  }
  if (!target) {
    try {
      const bonj = JSON.parse(pmd(['bonjour', 'mobdev2', '--timeout', '5'], { timeout: 12_000 }));
      if (Array.isArray(bonj) && bonj.length) target = { via: 'wlan', udid: bonj[0]?.identifier };
    } catch {
      /* ignore */
    }
  }

  if (!target) {
    console.log('Kein iPhone erreichbar (weder USB noch WLAN).');
    console.log('→ npm run ios:device:doctor  für die Diagnose.');
    process.exitCode = 2;
  } else if (mode === 'status') {
    console.log(`Gerät via ${target.via.toUpperCase()}\n`);
    try {
      const info = JSON.parse(pmd(['lockdown', 'info', '--color', 'false']));
      const pick = (k) => info[k] ?? '?';
      console.log(`Name            : ${pick('DeviceName')}`);
      console.log(`iOS             : ${pick('ProductVersion')} (${pick('BuildVersion')})`);
      console.log(`Modell          : ${pick('ProductType')} · ${pick('HardwareModel')}`);
      console.log(`Wi-Fi-Sync      : ${target.via === 'wlan' ? 'aktiv' : 'nur USB'}`);
    } catch (e) {
      console.log('lockdown info nicht verfügbar: ' + String(e.message).split('\n')[0]);
    }
    try {
      const dm = pmd(['amfi', 'developer-mode-status']);
      console.log(`Developer Mode  : ${dm.trim()}`);
    } catch {
      console.log('Developer Mode  : nicht abfragbar (Pairing/Trust nötig)');
    }
    try {
      const apps = JSON.parse(pmd(['apps', 'list', '--no-color'], { timeout: 25_000 }));
      const installed = Object.keys(apps).includes(BUNDLE_ID) || Object.values(apps).some((a) => a?.CFBundleIdentifier === BUNDLE_ID);
      console.log(`Finance App     : ${installed ? 'installiert' : 'NICHT installiert'}`);
    } catch {
      console.log('Finance App     : App-Liste nicht abfragbar');
    }
  } else if (mode === 'logs') {
    console.log(`Syslog-Stream (${BUNDLE_ID}) — wie \`adb logcat\`. Strg+C zum Beenden.\n`);
    const p = spawn(PMD, ['syslog', 'live', '--match', 'FinanceApp'], { stdio: 'inherit' });
    p.on('exit', (code) => (process.exitCode = code ?? 0));
  } else if (mode === 'open') {
    try {
      pmd(['springboard', 'launch', BUNDLE_ID]);
      console.log(`Finance App gestartet (${BUNDLE_ID}).`);
    } catch (e) {
      console.log('Start fehlgeschlagen: ' + String(e.message).split('\n')[0]);
      console.log('(App muss installiert sein; Developer Mode/Trust nötig.)');
      process.exitCode = 1;
    }
  } else {
    console.log('Unbekannt. Nutze: status | logs | open');
    process.exitCode = 1;
  }
}
