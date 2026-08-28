# Play Console — "App content" answer sheet

Every declaration under **Policy → App content** in Play Console, mapped to what
the app actually does. Transcribe these; confirm each in the Console UI (wording
changes over time). Derived from source, not memory — 2026-08-28 (RC9), Finance
App 1.6.0 / versionCode 7.

## Privacy policy
- URL: `https://void-c0de.github.io/finance-app/datenschutz.html` (live, HTTPS,
  reachable without a login). Content is complete **except** the controller /
  address / contact / supervisory-authority fields — see `legal/legal.config.json`
  and `npm run check:legal`. **Must be complete before submission.**

## Ads
- **This app does not contain ads.** No ad SDK, no ad inventory, no advertising
  ID (dependency scan clean; `PLAY_DATA_SAFETY.md`).

## App access
- All functionality is available without special access. The app works fully
  offline with no account.
- **Premium features** are gated but reachable for review: the reviewer redeems a
  **Premium coupon** (create one under *Mehr → Administration → Premium-Coupons*,
  e.g. `PLAYREVIEW` / 90 days) under *Mehr → Abos & Premium*. There is no
  hard-coded backdoor and no login wall.
- **Bank connection** (optional): *Bankkonto hinzufügen → Demo-Verbindung*
  produces synthetic accounts. The real Tink flow runs against **Tink's sandbox**
  (test credentials from Tink's sandbox docs, e.g. `tink` / `tink-1234`).
- Provide these instructions in the "All or some functionality is restricted"
  section with the coupon code and the sandbox note.

## Content ratings (IARC)
- Not yet submitted. Prepared answers: `PLAY_IARC_PREP.md`. Category **Finance**,
  no violence / sex / language / gambling / UGC / user-to-user interaction,
  **in-app purchases: Yes** (subscriptions, currently inactive). Expected outcome
  Everyone / PEGI 3 / USK 0 — **confirm after IARC returns it**.

## Target audience and content
- **Target age groups:** 18+ (or 13+ / general — a personal-finance tool, not
  designed for or marketed to children). Do **not** select any children's age
  band.
- **Appeals to children:** No. No child-oriented themes, characters, or
  incentives.
- **Ads / IAP shown to children:** N/A (no ads; not a children's app).
- Result: the app is **not** in the Designed for Families / Teacher Approved
  programs.

## News apps
- **Not a news app.** No.

## COVID-19 contact tracing / status apps
- No.

## Data safety
- Full mapping: `PLAY_DATA_SAFETY.md`. Summary for the form:
  - **Collected** (only with an optional cloud account, all encrypted in transit,
    deletion available): email address; financial info (transactions / balances /
    account metadata / budgets / goals); purchase & subscription info (plan,
    source, provider, environment — the store token is transient and stored only
    as a SHA-256 hash); app diagnostics (redacted); account-deletion requests.
  - **Not collected:** location, contacts, photos/media, messages, calendar,
    health, device or advertising IDs.
  - **Shared with third parties for their own use:** none.
  - **Security:** data encrypted in transit; local DB encrypted at rest
    (SQLCipher); users can request deletion in-app and on the web.

## Government apps
- No.

## Financial features
- Full mapping: `PLAY_FINANCIAL_FEATURES.md`. Declare: **personal finance
  management** = Yes; **read-only account aggregation** (via a licensed Open
  Banking provider, currently sandbox) = Yes. **Everything regulated**
  (payments / lending / investing / crypto / FX / insurance / tax) = **No**.
- The Premium **subscription** is an in-app purchase for the app's own features —
  declared under monetisation / IAP, **not** as a regulated financial feature.

## Health apps / Health Connect
- No health data. Health Connect not used.

## Advertising ID permission (`com.google.android.gms.permission.AD_ID`)
- **Not declared / not present.** The manifest does not request `AD_ID`
  (verified by `test:android-permissions` against the built APK).

## Play Billing
- Google Play Billing Library **9.1.0** is linked (`expo-iap`). No store products
  are configured yet, so no purchase can be made — the Premium screen shows
  "Preise folgen". Server-authoritative verification is implemented and returns
  `not_configured` until credentials are set. No web checkout, no alternative
  billing.
