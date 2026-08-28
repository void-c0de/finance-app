# Play submission pack — copy/paste when configuring the Console

Everything you paste or select manually in Play Console, in one place. **No
secrets.** Cross-checked against the repo on 2026-08-28.

## App identity

| Field | Value |
| --- | --- |
| Package name | `com.nocta_xz.financeapp` |
| App name | Finance App *(decide before first production submit — see `LEGAL_PLACEHOLDERS.md` #8)* |
| Default language | Deutsch (de-DE) |
| Category | Finance |
| Content rating | complete IARC: Finance, **no** ads, **no** gambling, **no** UGC → expect *Everyone / USK 0 / PEGI 3* |

## Current build

| Field | Value |
| --- | --- |
| versionName | `1.6.0` |
| versionCode | `7` |
| targetSdkVersion | `36` (Android 16) — meets the 31 Aug 2026 requirement |
| minSdkVersion | `24` |
| Format | AAB (`npm run release:android:aab`) |
| Signing | Play App Signing + your upload key (`FINANCE_UPLOAD_*`). `npm run verify:release-signing <aab> --expect-production` **must pass** before upload. |
| Permissions | INTERNET, ACCESS_NETWORK_STATE, USE_BIOMETRIC, USE_FINGERPRINT, VIBRATE, READ/WRITE_EXTERNAL_STORAGE (maxSdk 32), **`com.android.vending.BILLING`** (added by the `expo-iap` plugin — required by Play Billing). No SYSTEM_ALERT_WINDOW. |

## URLs (live on GitHub Pages)

| Field | Value |
| --- | --- |
| Privacy policy | `https://void-c0de.github.io/finance-app/datenschutz.html` |
| Account deletion (Data Safety form) | `https://void-c0de.github.io/finance-app/konto-loeschen.html` |
| Support | `https://void-c0de.github.io/finance-app/support.html` |
| Support email | see `LEGAL_PLACEHOLDERS.md` #3 |

## Data Safety form

Transcribe from **`PLAY_DATA_SAFETY.md`**. Summary:

- **No** third-party analytics / advertising / crash SDK. **No** advertising ID.
- Collected only with a cloud account, all optional, all encrypted in transit,
  deletion available: email, financial info (transactions / balances / account
  metadata), purchase & entitlement data, redacted app diagnostics.
- Not collected: location, contacts, photos, device IDs, messages, health.

## Financial Features declaration

Transcribe from **`PLAY_FINANCIAL_FEATURES.md`**. Summary:

- Personal finance management + **read-only account aggregation via Tink**
  (currently **sandbox**).
- **No** to: banking, payments/transfers, lending/BNPL, investing, crypto, FX,
  insurance, tax. The app holds no funds and initiates no payments.

## Billing readiness (RC6)

| Item | State |
| --- | --- |
| Play Billing client | **IMPLEMENTED** — `expo-iap@5.4.0` (Play Billing Library 9.1.0 via `openiap-google`), clears the v7-blocked deadline |
| Purchase state machine | **IMPLEMENTED + TESTED** — `test:purchase-state-machine`; `verified` only after server confirmation; pending never unlocks; cancel ≠ error |
| Server verification | **IMPLEMENTED + DEPLOYED, NOT CONFIGURED** (RC7) — real Google Play Developer API (`subscriptionsv2`) call; returns `not_configured` (501) until `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` + `GOOGLE_PLAY_PACKAGE_NAME` are set. `test:google-verify`. |
| RTDN webhook | **IMPLEMENTED + DEPLOYED** (RC7) — Google OIDC-token or `?token=` auth; re-verifies with the API; idempotent. Set `GOOGLE_PUBSUB_SA_EMAIL` (or `PLAY_RTDN_VERIFICATION_TOKEN`) + a Pub/Sub topic. |
| Replay / account-switch safety | **IMPLEMENTED + TESTED** (RC7) — first Finance account to verify a purchase token owns it; a second account is rejected (HTTP 409). |
| Store products | **NOT CREATED** — no `premium.monthly` / `premium.yearly` subscription in the Console yet |
| Product IDs in build | **NOT CONFIGURED** — `EXPO_PUBLIC_PREMIUM_MONTHLY_ID` / `_YEARLY_ID` unset → adapter not registered → UI shows the honest "Preise folgen" state, no fake checkout |
| Real purchase tested | **NO** — not physically verified against Google Play (needs Play Console access) |

External steps remaining: create the subscription + base plans in the Console;
create a Google Cloud service account (View financial data + Play Developer API),
set its JSON as the Function secret; create the Pub/Sub topic for RTDN; set the
three build-env / Function secrets. No code change required for any of these.

## App access (instructions for Google's review team)

> Die App ist offline nutzbar; ein Konto ist optional.
>
> Premium-Prüfung: Coupon-Code **[erzeuge einen unter Mehr → Administration →
> Premium-Coupons, z. B. GOOGLEREVIEW mit 90 Tagen]** unter *Mehr → Abos &
> Premium* einlösen. Der native Store-Kauf ist implementiert, aber bis zur
> Freigabe der Store-Produkte bewusst deaktiviert (Zustand "Preise folgen").
>
> Beispieldaten ohne Bank: *Bankkonto hinzufügen → Demo-Verbindung*. Erzeugt
> synthetische Konten/Umsätze; keine echten Bankdaten.
>
> Bankanbindung (Tink) läuft in der **Sandbox**. Test-Zugangsdaten aus der
> Tink-Sandbox-Dokumentation (z. B. Institut "Demo Bank", Nutzer `u12345`,
> beliebiges Passwort — bitte Tink-Sandbox-Doku prüfen).
>
> Kontolöschung testbar in der App (*Mehr → Daten & Datenschutz → Konto löschen*,
> 3-Tage-Kulanzfenster, stornierbar) und im Browser
> (`.../konto-loeschen.html`).

## Reviewer access strategy

- Use a **normal Premium coupon** (product mechanism) — not a hardcoded backdoor.
- Optionally create a dedicated review Google account, opt it into the closed
  test, and redeem the coupon there.
- Demo data via the in-app **Demo-Verbindung** (mock provider) — no Tink needed
  for most screens.

## Store listing text

Full DE/EN copy in **`STORE_LISTING.md`**. Includes the mandatory banking
disclaimer and the "claims not to make" list.

## Screenshots

Follow **`SCREENSHOT_PLAN.md`**: synthetic demo account only (in-app Demo-Daten
or Demo-Verbindung), never real finance data, no biometric bypass.

## Closed test

Follow **`CLOSED_TEST_CHECKLIST.md`**. First confirm whether the developer
account is subject to the **12 testers / 14 days** rule (personal account created
after 13 Nov 2023).
