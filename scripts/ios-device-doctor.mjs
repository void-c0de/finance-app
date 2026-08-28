/**
 * iOS Device Doctor — read-only Diagnose der Windows↔iPhone-Brücke.
 *
 *   npm run ios:device:doctor
 *
 * Prüft: Apple-Dienste, Bonjour, USB-Treiber & -Enumeration, Pairing-Records
 * (nur Metadaten), WLAN-Discovery, pymobiledevice3, sichtbares iOS-Gerät.
 *
 * Ändert NICHTS. Fragt NIE nach Apple-ID. Signiert nichts. Löscht nichts.
 * Gibt am Ende eine deterministische Diagnose aus.
 */
import { execFileSync, execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const IS_WIN = process.platform === 'win32';
const PMD = resolve('.tools/idevice-venv/Scripts/pymobiledevice3.exe');
const IPA = resolve('.artifacts/ios/FinanceApp-ios-unsigned.ipa');

const out = { checks: {}, diagnosis: [], hint: '' };
const ok = (k, v, detail) => { out.checks[k] = { ok: v, detail }; return v; };

function ps(script) {
  try {
    return execFileSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', script], {
      encoding: 'utf8',
      timeout: 30_000,
    }).trim();
  } catch (e) {
    return (e.stdout || '').toString().trim();
  }
}

function pmd(args, timeoutMs = 20_000) {
  try {
    return execFileSync(PMD, args, { encoding: 'utf8', timeout: timeoutMs }).trim();
  } catch (e) {
    return (e.stdout || '').toString().trim() || `ERR:${e.message?.split('\n')[0] ?? e}`;
  }
}

if (import.meta.main) runDoctor();

function runDoctor() {
console.log('iOS Device Doctor — read-only\n');

// --- 1. Plattform ------------------------------------------------
if (!IS_WIN) {
  console.log('Nicht-Windows-Host — dieser Doctor ist für die Windows↔iPhone-Brücke gedacht.');
  process.exitCode = 0;
} else {
  const osv = ps('(Get-CimInstance Win32_OperatingSystem).Caption + " " + (Get-CimInstance Win32_OperatingSystem).Version');
  console.log(`Windows: ${osv}`);

  // --- 2. IPA vorhanden? ---------------------------------------
  const hasIpa = ok('ipa_present', existsSync(IPA), IPA);
  console.log(`IPA vorbereitet: ${hasIpa ? 'ja  (' + IPA + ')' : 'nein — npm run ios:unsigned:prepare'}`);

  // --- 3. Apple-Dienste ---------------------------------------
  const amds = ps("(Get-Service 'Apple Mobile Device Service' -EA SilentlyContinue).Status");
  const bonjour = ps("(Get-Service 'Bonjour Service' -EA SilentlyContinue).Status");
  ok('amds_running', amds === 'Running', `Apple Mobile Device Service: ${amds || 'nicht installiert'}`);
  ok('bonjour_running', bonjour === 'Running', `Bonjour Service: ${bonjour || 'nicht installiert'}`);
  console.log(`Apple Mobile Device Service: ${amds || 'FEHLT'}`);
  console.log(`Bonjour Service: ${bonjour || 'FEHLT'}`);

  // --- 4. Sideload-Tools -------------------------------------
  const tools = ps(
    "$k='HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*','HKLM:\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*';" +
      "(Get-ItemProperty $k -EA SilentlyContinue | ? { $_.DisplayName -match 'AltServer|Sideloadly|SideStore|iLoader|iTunes|Apple Application Support' } | Select -Expand DisplayName -Unique) -join ', '",
  );
  ok('altserver', /AltServer/.test(tools), tools);
  console.log(`Erkannte Tools: ${tools || '(keine)'}`);

  // --- 5. Apple-USB-Treiber ---------------------------------
  const driver = ps("Test-Path \"$env:SystemRoot\\System32\\drivers\\usbaapl64.sys\"");
  ok('apple_usb_driver', driver === 'True', `usbaapl64.sys: ${driver}`);
  console.log(`Apple-USB-Treiber (usbaapl64.sys): ${driver === 'True' ? 'installiert' : 'NICHT installiert (kommt automatisch beim ersten Anstecken)'}`);

  // --- 6. USB-Enumerations-Historie -------------------------
  const enumHist = ps(
    "$l=\"$env:SystemRoot\\INF\\setupapi.dev.log\"; if(Test-Path $l){ if(Select-String -Path $l -Pattern 'VID_05AC|Apple Mobile|iPhone' -Quiet){'YES'}else{'NO'} } else {'NOLOG'}",
  );
  ok('usb_enum_history', enumHist === 'YES', `setupapi.dev.log Apple-Eintrag: ${enumHist}`);
  console.log(`USB-Enumeration jemals (Apple): ${enumHist === 'YES' ? 'ja' : enumHist === 'NO' ? 'nie' : 'Log fehlt'}`);

  // --- 7. iPhone aktuell per USB? ---------------------------
  const usbNow = ps(
    "(Get-PnpDevice -PresentOnly -EA SilentlyContinue | ? { $_.InstanceId -match 'VID_05AC' -or $_.FriendlyName -match 'iPhone|iPad|Apple Mobile' } | Select -Expand FriendlyName) -join '; '",
  );
  ok('usb_device_now', usbNow.length > 0, usbNow);
  console.log(`iPhone jetzt per USB: ${usbNow || 'nein'}`);

  // --- 8. Pairing-Records (nur Metadaten!) ------------------
  const lockdownDir = 'C:\\ProgramData\\Apple\\Lockdown';
  const pairing = ps(
    `if(Test-Path '${lockdownDir}'){ (Get-ChildItem '${lockdownDir}' -Filter '*.plist' -EA SilentlyContinue | ? { $_.BaseName -match '^[0-9A-Fa-f-]{25,}$' } | Measure-Object).Count } else { 'NODIR' }`,
  );
  const hasPairing = pairing !== '0' && pairing !== 'NODIR';
  ok('pairing_record', hasPairing, `Lockdown-Pairing-Dateien: ${pairing}`);
  console.log(`Bestehende Pairing-Records: ${hasPairing ? pairing : 'keine'}  (Inhalt wird nie ausgegeben)`);

  // --- 9. WLAN-Discovery: iOS-Gerät im LAN? -----------------
  let bonjourDev = '[]';
  if (existsSync(PMD)) bonjourDev = pmd(['bonjour', 'mobdev2', '--timeout', '6'], 15_000);
  const wlanVisible = bonjourDev.trim() !== '[]' && !bonjourDev.startsWith('ERR');
  ok('wlan_ios_device', wlanVisible, wlanVisible ? bonjourDev.slice(0, 200) : 'kein _apple-mobdev2._tcp im LAN');
  console.log(`iOS-Gerät im WLAN sichtbar (Bonjour): ${wlanVisible ? 'ja' : 'nein'}`);

  // --- 10. pymobiledevice3 ----------------------------------
  const pmdPresent = existsSync(PMD);
  ok('pymobiledevice3', pmdPresent, pmdPresent ? pmd(['version']) : 'nicht installiert (.tools/idevice-venv)');
  if (pmdPresent) {
    const usbmux = pmd(['usbmux', 'list'], 10_000);
    const remote = pmd(['remote', 'browse', '--timeout', '5'], 15_000);
    ok('pmd_usb', usbmux.trim() !== '[]' && !usbmux.startsWith('ERR'), usbmux.slice(0, 120));
    ok('pmd_remote', /"(usb|wifi)":\s*\[[^\]]/.test(remote), remote.slice(0, 160));
    console.log(`pymobiledevice3: ${pmd(['version'])}  ·  usbmux=${usbmux.trim() === '[]' ? 'leer' : 'Gerät'}  ·  remote(RSD)=${/\[\s*\]/.test(remote) ? 'leer' : 'Gerät?'}`);
  }

  // --- 11. Netzwerkprofil ----------------------------------
  const netcat = ps("(Get-NetConnectionProfile -EA SilentlyContinue | Select -First 1 -Expand NetworkCategory)");
  ok('private_network', netcat === 'Private' || netcat === 'DomainAuthenticated', `NetworkCategory: ${netcat}`);
  console.log(`Netzwerkprofil: ${netcat}`);

  // --- Diagnose --------------------------------------------
  console.log('\n──────────── DIAGNOSE ────────────');
  const { diagnosis, hint } = iosDeviceDiagnosis(out.checks);
  out.diagnosis = diagnosis;
  out.hint = hint;
  console.log('Zustand : ' + diagnosis.join(', '));
  console.log('Nächster Schritt: ' + hint);
  console.log('\n(JSON: ' + JSON.stringify(diagnosis) + ')');
}
}

/**
 * Reine Entscheidungsfunktion — `checks` = { key: { ok: boolean } }.
 * Testbar ohne Hardware (`scripts/test-ios-tooling.mjs`).
 */
export function iosDeviceDiagnosis(checks) {
  const c = checks ?? {};
  const on = (k) => c[k]?.ok === true;
  const diagnosis = [];
  let hint;

  if (on('wlan_ios_device') || on('pmd_remote')) {
    diagnosis.push('WIRELESS_DEVICE_VISIBLE');
    hint =
      'Ein iOS-Gerät ist über WLAN erreichbar — AltServer "Sideload .ipa…" (Shift-Klick) oder pymobiledevice3 können direkt arbeiten. Apple-ID nur im Tool eingeben.';
  } else if (on('usb_device_now')) {
    diagnosis.push('USB_DEVICE_CONNECTED');
    hint =
      'iPhone hängt am USB. Am iPhone "Diesem Computer vertrauen" tippen — das Pairing erzeugt sich dann selbst. Danach AltServer/Sideloadly.';
  } else if (on('pairing_record')) {
    diagnosis.push('PAIRING_RECORD_EXISTS_DEVICE_OFFLINE');
    hint =
      'Ein Pairing existiert, aber kein Gerät ist gerade erreichbar. iPhone ins selbe WLAN bringen + einmal entsperren; dann erneut prüfen.';
  } else if (on('usb_enum_history')) {
    diagnosis.push('PAIRED_BEFORE_NOW_UNPAIRED');
    hint =
      'Ein Apple-Gerät wurde früher schon per USB erkannt, aber es gibt kein aktives Pairing mehr. Einmal per Kabel neu vertrauen.';
  } else {
    diagnosis.push('NEVER_CONNECTED_USB_PAIRING_REQUIRED');
    hint =
      'Dieses iPhone hat diesen PC noch nie berührt (keine USB-Enumeration, kein Pairing, keine WLAN-Sichtbarkeit). ' +
      'Bei iOS 26 oder älter ist eine EINMALIGE USB-Verbindung + "Vertrauen" nötig — ohne iTunes-Oberfläche. ' +
      'Danach läuft alles über WLAN (AltStore-Refresh / SideStore+LocalDevVPN). ' +
      'Bei iOS 27 gibt es drahtloses Erst-Pairing offiziell nur über Xcode/Mac; Windows-Support ist experimentell.';
  }

  if (!on('amds_running')) diagnosis.push('APPLE_MOBILE_DEVICE_SERVICE_DOWN');
  if (!on('bonjour_running')) diagnosis.push('BONJOUR_DOWN');
  if (!on('private_network')) diagnosis.push('NETWORK_NOT_PRIVATE');
  if (!on('ipa_present')) diagnosis.push('IPA_NOT_PREPARED');

  return { diagnosis, hint };
}
