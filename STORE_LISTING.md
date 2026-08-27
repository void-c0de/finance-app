# Play Store listing — draft (accurate, no exaggeration)

Draft copy for the Google Play listing. German (primary) + English. Only claims
that are factually true for Finance App 1.5.0.

---

## App name
**Finance App**
(Play allows up to 30 chars. If a more distinctive name is wanted later, decide
before first production submission — the package `com.nocta_xz.financeapp` is
fixed.)

## Short description (DE, ≤ 80 chars)
> Budgets, Sparziele, Analysen & Backups – lokal verschlüsselt, offline-first.

## Short description (EN)
> Budgets, savings goals, analytics & backups — locally encrypted, offline-first.

## Full description (DE)

Finance App bringt deine Finanzen an einem Ort zusammen – privat, offline-fähig
und ohne Werbung oder Tracking.

**Überblick behalten**
• Konten und Umsätze zusammenführen – manuell oder per Open-Banking-Anbindung (nur Lesezugriff)
• Automatische Kategorisierung mit eigenen Regeln
• Monats-Dashboard mit dem, was gerade wichtig ist

**Planen**
• Monatsbudgets pro Kategorie mit Rest-/Überschreitungsanzeige
• Sparziele – manuell oder mit einem Sparkonto verknüpft
• Wiederkehrende Zahlungen und Fixkosten erkennen

**Verstehen** (Premium)
• Monatsvergleiche, Kategorie-Trends, Abo-Preisänderungen
• Hinweise auf ausgebliebene wiederkehrende Zahlungen
• 30-/60-/90-Tage-Cashflow-Prognose (nach Sicherheit gekennzeichnet, keine Garantie)

**Deine Daten gehören dir**
• Lokale Datenbank mit SQLCipher verschlüsselt, App-Sperre per Biometrie
• Optionale Cloud-Synchronisierung für mehrere Geräte und Wiederherstellung
• Echtes Datei-Backup (JSON) und CSV-Export – nichts wird automatisch hochgeladen
• Backup wieder importieren mit strenger Prüfung und sicherem Zusammenführen
• Konto- und Datenlöschung in der App und im Browser, mit 3-Tage-Kulanzfenster

**Fair statt aufdringlich**
• Kostenlos nutzbar: bis zu 2 Budgets und 2 Sparziele, aktueller Monat, Umsätze-CSV, 4 Designs
• Premium schaltet Automatisierung, tiefere Analysen und weitere Designs frei
• Bestehende Daten bleiben immer erhalten – auch wenn Premium endet

**Wichtig:** Finance App ist keine Bank und kein Zahlungsdienst. Es werden keine
Zahlungen ausgeführt und kein Geld verwahrt. Die optionale Bankanbindung dient
nur dem Lesen von Kontoinformationen über einen lizenzierten Open-Banking-Anbieter.
Aktuell wird dessen Testumgebung verwendet.

Datenschutz: https://void-c0de.github.io/finance-app/datenschutz.html

## Full description (EN) — condensed
(Mirror of the German text; produce a full translation before an English-market
launch. Keep the banking disclaimer verbatim.)

## Feature bullets (for the graphic/asset team)
1. Offline-first, locally encrypted
2. Budgets & savings goals
3. Recurring-payment intelligence
4. Premium analytics & forecast (certainty-labelled)
5. Real backup / restore + CSV export
6. In-app **and** web account deletion
7. No ads, no third-party tracking

## Privacy / security highlights
- SQLCipher local DB; key in Android Keystore-backed SecureStore; biometric lock.
- Passwords checked against Have I Been Pwned via k-anonymity (only a 5-char hash prefix leaves the device).
- Optional cloud sync with per-user row-level security.
- No analytics/advertising/crash SDKs. No advertising ID.

## Premium explanation (for the listing + review notes)
- Premium is unlocked today via coupon codes or a Superuser grant. There is **no
  in-app purchase flow yet** and the app never grants itself Premium — entitlement
  is server state only. Pricing shown in-app is honest ("prices follow with the
  store release").

## Banking disclaimer (must appear in listing + first-run + review notes)
> Finance App ist keine Bank und kein Zahlungsdienst. / Finance App is not a bank
> or payment service. It does not execute payments or hold funds. The optional
> bank connection is read-only account information via a licensed Open Banking
> provider, currently in sandbox.

## Claims NOT to make
- ❌ "Alle deutschen Banken" / "all German banks" (coverage depends on Tink + is sandbox now)
- ❌ "sichere Bank" / "secure bank" (we are not a bank)
- ❌ "KI-Finanzberater" / "AI financial advisor" (no AI, no advice)
- ❌ "garantierte Prognose" / "guaranteed forecast" (forecasts are certainty-labelled projections)
- ❌ "Produktiv mit deiner echten Bank" (Tink is sandbox until a production agreement exists)

## Content rating
Expected: **Everyone / PEGI 3**. No user-generated content, no ads, no violence.
Complete the IARC questionnaire honestly (finance category, no gambling).

## Category
Finance.

## Contact / support
- Support URL: https://void-c0de.github.io/finance-app/support.html
- Support email: [BITTE ERGÄNZEN]
