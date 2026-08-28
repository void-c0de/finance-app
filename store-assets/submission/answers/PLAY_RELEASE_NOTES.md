# Play release notes (German)

Paste into Play Console → the release's "Release notes" field. Max 500 chars per
language. User-visible changes only — no architecture, no security-fix detail.

---

## First Closed Test release — 1.6.0 (versionCode 7)

```
Erste Testversion von Finance App.

• Konten & Umsätze (manuell oder Sandbox-Bankanbindung, nur Lesen)
• Automatische Kategorisierung, Budgets, Sparziele, wiederkehrende Zahlungen
• Analysen & Cashflow-Prognose (Premium)
• Lokal verschlüsselt (SQLCipher), App-Sperre per Biometrie
• Backup/Export als Datei, optionale Cloud-Synchronisierung
• Konto- & Datenlöschung in App und Browser

Bitte meldet Abstürze und alles, was sich falsch anfühlt – mit Gerät und Android-Version.
```

<!-- ≤ 500 chars (Play limit). Verified by `npm run build:submission`. -->


## Ongoing changelog (for later releases)

Keep entries short, user-facing, in German. Example categories:

- **Stabilität** – Abstürze/ANRs behoben, schnellerer Start
- **Premium** – Vorbereitung des Store-Kaufs (aktuell noch „Preise folgen")
- **Backup/Restore** – …
- **Synchronisierung** – …
- **Datenschutz** – …

### Since the embedded build (delivered as an OTA to 1.6.0)

```
• Kauf-Wiederherstellung robuster: ein durch App-Beenden/Netzausfall
  unterbrochener Kauf wird beim nächsten Start still nachgeprüft
• Konto-Wechsel: keine Premium-/Kaufreste eines vorherigen Kontos mehr
• Bankverbindung: klarere Zustände bei abgelaufener Freigabe; deine Konten
  und Umsätze bleiben dabei immer erhalten
```

## What NOT to write in release notes

- No "fixed a signing bug" / "fixed a verification bypass" style wording.
- No internal component names, no Supabase/Edge Function references.
- No claims about production banking (Tink is sandbox).
- No Premium pricing (none is set).
