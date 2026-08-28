import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * RC5 — Tests für die iOS-Geräte-Brücken-Tools (keine Hardware nötig).
 */
const { iosDeviceDiagnosis } = await import('./ios-device-doctor.mjs');

const base = {
  ipa_present: { ok: true },
  amds_running: { ok: true },
  bonjour_running: { ok: true },
  private_network: { ok: true },
};

// --- Diagnose-Entscheidung ---------------------------------------
{
  const d = iosDeviceDiagnosis({ ...base });
  assert.equal(d.diagnosis[0], 'NEVER_CONNECTED_USB_PAIRING_REQUIRED');
  assert.match(d.hint, /EINMALIGE USB-Verbindung/);
}
{
  const d = iosDeviceDiagnosis({ ...base, usb_enum_history: { ok: true } });
  assert.equal(d.diagnosis[0], 'PAIRED_BEFORE_NOW_UNPAIRED');
}
{
  const d = iosDeviceDiagnosis({ ...base, pairing_record: { ok: true } });
  assert.equal(d.diagnosis[0], 'PAIRING_RECORD_EXISTS_DEVICE_OFFLINE');
}
{
  const d = iosDeviceDiagnosis({ ...base, usb_device_now: { ok: true }, pairing_record: { ok: true } });
  assert.equal(d.diagnosis[0], 'USB_DEVICE_CONNECTED', 'aktiver USB schlägt Pairing-Record');
}
{
  const d = iosDeviceDiagnosis({ ...base, wlan_ios_device: { ok: true } });
  assert.equal(d.diagnosis[0], 'WIRELESS_DEVICE_VISIBLE', 'WLAN-Sichtbarkeit gewinnt');
}
{
  const d = iosDeviceDiagnosis({ ...base, pmd_remote: { ok: true } });
  assert.equal(d.diagnosis[0], 'WIRELESS_DEVICE_VISIBLE');
}
// Zusatz-Flags
{
  const d = iosDeviceDiagnosis({ ipa_present: { ok: false } });
  assert.ok(d.diagnosis.includes('APPLE_MOBILE_DEVICE_SERVICE_DOWN'));
  assert.ok(d.diagnosis.includes('BONJOUR_DOWN'));
  assert.ok(d.diagnosis.includes('NETWORK_NOT_PRIVATE'));
  assert.ok(d.diagnosis.includes('IPA_NOT_PREPARED'));
}
// leere / kaputte Eingabe
assert.doesNotThrow(() => iosDeviceDiagnosis(null));
assert.doesNotThrow(() => iosDeviceDiagnosis(undefined));
assert.doesNotThrow(() => iosDeviceDiagnosis({}));

// --- LAN-Server: nur die drei vorgesehenen Routen, kein Directory-Listing --
{
  const src = readFileSync(new URL('./ios-ipa-serve.mjs', import.meta.url), 'utf8');
  // exakte Pfad-Vergleiche, keine Pfad-Konkatenation aus req.url
  assert.match(src, /url === '\/' \|\| url === '\/index\.html'/);
  assert.match(src, /url === '\/source\.json'/);
  assert.match(src, /url === '\/FinanceApp\.ipa'/);
  assert.match(src, /return send\(404/, '404 als Default');
  assert.ok(!/createReadStream\(\s*(?:req|url|`)/.test(src), 'kein Stream aus benutzerkontrolliertem Pfad');
  assert.ok(!/readFileSync\(\s*(?:req|url)/.test(src), 'kein Read aus req.url');
  assert.match(src, /'0\.0\.0\.0'/, 'bindet bewusst ans LAN');
  assert.match(src, /Download .+ NICHT installieren|Download ≠ Installation/, 'Klartext: Download ≠ Installation');
}

// --- Device-Bridge: keine Credential-Automatisierung, kein Face-ID-Bypass --
{
  for (const f of ['./ios-device.mjs', './ios-device-doctor.mjs', './ios-ipa-serve.mjs']) {
    const src = readFileSync(new URL(f, import.meta.url), 'utf8');
    // keine Passwort-/2FA-Eingabe, kein anisette-Handling, keine Credential-Env
    assert.ok(!/readline|prompt\(|question\(|stdin/i.test(src), `${f}: keine interaktive Eingabe`);
    assert.ok(!/anisette|adi\.pb|APPLE_ID_PASSWORD|APPLE_PASSWORD|appleId.*password/i.test(src), `${f}: kein Credential-Handling`);
    assert.ok(!/faceid.*bypass|skip.*biometric|disable.*biometric/i.test(src), `${f}: kein Face-ID-Bypass`);
    // kein automatisches Pairing/Unpairing, kein Erase/Restore
    assert.ok(!/'unpair'|"unpair"|'erase'|"erase"|restore.*--erase/i.test(src), `${f}: kein Unpair/Erase`);
  }
}

// --- Pairing-Record-Redaktion: der Doctor gibt nie Plist-Inhalt aus ------
{
  const src = readFileSync(new URL('./ios-device-doctor.mjs', import.meta.url), 'utf8');
  assert.match(src, /Inhalt wird nie ausgegeben/);
  assert.ok(!/Get-Content.*Lockdown.*plist/i.test(src), 'liest keine Pairing-Plist als Inhalt');
  assert.match(src, /Measure-Object\)\.Count/, 'zählt nur, liest nicht');
}

console.log('iOS tooling: Diagnose-Entscheidung, LAN-Server-Isolation, Pairing-Redaktion — grün');
