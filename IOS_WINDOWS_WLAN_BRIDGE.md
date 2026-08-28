# iPhone ↔ Windows — die WLAN-Brücke (statt ADB)

Was auf **diesem** PC (`npm run ios:device:doctor`, 2026-08-28) tatsächlich
gemessen wurde, und der kürzeste Weg von hier zur installierten App.

## Kurzfassung

| Frage | Antwort auf diesem PC |
| --- | --- |
| Hat das iPhone eine ADB-Entsprechung? | Nein. iOS = Pairing/Lockdown + (ab iOS 17) CoreDevice/RemoteXPC. |
| Apple-Software-Stack gesund? | **Ja** — Apple Mobile Device Service *läuft*, Bonjour *läuft*, AltServer 1.7.4, iTunes/Apple Application Support installiert. |
| PC & iPhone im selben Netz? | **Ja** — PC `192.168.178.21/24` (FRITZ!Box), Netzwerkprofil *privat*, mDNS erlaubt. Das Android-Handy ist im selben Netz per `_adb-tls-connect._tcp` sichtbar. |
| Apple-USB-Treiber (`usbaapl64.sys`)? | **Nein** — installiert sich automatisch beim ersten Anstecken (liegt in Apple Mobile Device Support 19.4 bereit). |
| Jemals ein Apple-Gerät per USB erkannt? | **Nie** — `setupapi.dev.log` hat null `VID_05AC`-Einträge. |
| Bestehender Pairing-Record? | **Nein** — `C:\ProgramData\Apple\Lockdown` enthält nur `SystemConfiguration.plist` (die Host-BUID), keine `<UDID>.plist`. |
| iPhone über WLAN sichtbar (Bonjour `_apple-mobdev2._tcp`)? | **Nein**. |
| `pymobiledevice3` (11.1.6, isolierte venv) sieht ein Gerät? | **Nein** — `usbmux list` = leer, `remote browse` = `{usb:[],wifi:[]}`. |
| **Diagnose** | `NEVER_CONNECTED_USB_PAIRING_REQUIRED` |

## Kabellose Erstinstallation — geht das hier JETZT?

**NEIN — nicht ohne genau eine Kabelverbindung.**

Begründung, ehrlich:

- Apples Trust-Modell: kein Werkzeug (AltServer, Sideloadly, `pymobiledevice3`,
  SideStore) redet mit dem iPhone ohne einen **Pairing-Record**. Der entsteht,
  wenn man das iPhone **einmal per Kabel** ansteckt und **„Diesem Computer
  vertrauen"** tippt.
- Auf diesem PC gibt es **keinen** Pairing-Record und **keine** USB-Historie —
  also kann kein WLAN-Weg „wiederbelebt" werden. Es gibt nichts zu reaktivieren.
- **AltStore/Sideloadly-„WLAN-Refresh"** setzt genau dieses Erst-Pairing voraus.
  Die versteckte Funktion „Sideload .ipa…" (Shift-Klick auf AltServer) spielt
  über WLAN aufs Gerät — **aber nur, wenn es schon gepairt und sichtbar ist**.
- **iOS 27**: Apple bietet drahtloses Erst-Pairing über den „Device Hub" —
  **offiziell nur in Xcode auf dem Mac**. Open-Source-Nachbauten
  (`jkcoxson/idevice`) beginnen gerade damit; auf Windows ist das **experimentell
  und hier nicht getestet/nicht bewiesen**.

## Der eine unvermeidbare Schritt (ohne iTunes-Oberfläche)

Du brauchst **einmal** ein USB-Kabel an diesen (oder irgendeinen) PC/Mac/Linux.
Nicht die iTunes-App, nicht iCloud — nur die Verbindung:

1. iPhone entsperren, per Kabel anstecken.
2. Windows installiert automatisch den Apple-USB-Treiber (`usbaapl64.sys`),
   weil Apple Mobile Device Support schon da ist. Kein Download nötig.
3. Am iPhone erscheint **„Diesem Computer vertrauen?"** → **Vertrauen** +
   Gerätecode. Damit liegt der Pairing-Record in `C:\ProgramData\Apple\Lockdown`.
4. Prüfen: `npm run ios:device:doctor` → sollte jetzt `USB_DEVICE_CONNECTED`
   (mit Kabel) bzw. später `WIRELESS_DEVICE_VISIBLE` zeigen.
5. **Kabel abziehen.**

Danach ist iTunes nie wieder nötig.

## Danach: komplett WLAN

Ab dem Pairing-Record läuft alles kabellos, solange PC und iPhone im selben
WLAN sind:

| Aufgabe | Weg |
| --- | --- |
| App installieren | AltServer: **Shift-Klick aufs Tray-Icon → „Sideload .ipa…"** → `.artifacts/ios/FinanceApp-ios-unsigned.ipa` → deine kostenlose Apple-ID (nur im AltServer-Dialog). |
| Wöchentlicher Re-Sign | AltStore auf dem iPhone + AltServer läuft im Hintergrund → Auto-Refresh über WLAN. |
| Noch unabhängiger | **SideStore** + LocalDevVPN: nach Ersteinrichtung signiert/refresht das iPhone sich praktisch selbst, ohne dauerhaft laufenden PC. |
| Neue App-Version | lokale AltStore-Quelle: `npm run ios:ipa:serve` → in AltStore `http://<PC-IP>:8788/source.json` als Quelle → AltStore erkennt neue Builds. |
| IPA aufs iPhone laden (ohne AltServer-Dialog) | `npm run ios:ipa:serve` → am iPhone in Safari `http://<PC-IP>:8788/` → „FinanceApp.ipa" → in „Dateien" → in AltStore/SideStore öffnen. **Laden ≠ Installieren.** |
| Geräte-Status / Logs | `npm run ios:device:status` / `npm run ios:device:logs` (`pymobiledevice3` über WLAN, sobald gepairt). |

## Wenn dieser PC gar kein Kabel annehmen kann

Der PC ist ein physischer Desktop (MSI-Board), auf den du auch per Virtual
Desktop streamst. Falls du physisch **nicht** rankommst:

- Das Erst-Pairing kann auf **jedem** Rechner passieren — ein zweiter Windows-PC,
  ein Linux-Rechner (`usbmuxd` + `libimobiledevice`, ohne iTunes), ein
  geliehener Mac. Es geht nur darum, dass das iPhone **einmal** „Vertrauen" sagt.
- **Achtung:** Der Pairing-Record enthält einen host-spezifischen Schlüssel +
  die `SystemBUID` dieses Hosts. Ihn 1:1 auf einen anderen Host zu kopieren ist
  laut aktueller Tool-Doku **nicht zuverlässig portabel** (SideStore/`pymobiledevice3`
  akzeptieren fremde Pairing-Files nur, wenn die BUID passt). Der saubere Weg:
  das Erst-Pairing auf **dem** Rechner machen, der dauerhaft die Brücke sein soll.
  SideStore ist die Ausnahme — es bringt sein Pairing-File auf dem iPhone selbst
  mit (`iLoader` erzeugt `ALTPairingFile.mobiledevicepairing`).

## Sicherheit

- Pairing-Records / Signier-Material werden **nie** committet — `.gitignore` +
  `guard:secrets` blocken `*.mobiledevicepairing`, `*.mobileprovision`,
  `*.p12/.p8`, `ALTPairingFile*`, `Lockdown/*.plist`, `anisette*`, `adi.pb`.
- Der Device Doctor **zählt** Pairing-Dateien, liest ihren Inhalt nie.
- Keine Apple-ID im Code, in Logs oder in Skripten. Die Apple-ID gibst nur **du**
  im AltServer-/Sideloadly-Dialog ein — sie geht von dort nur an Apple.
