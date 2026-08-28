# Apple App Review checklist — Finance App (future)

Guideline references: App Store Review Guidelines (2026). Only relevant for a
real App Store submission (paid program). The free personal-device path never
touches App Review.

## Likely-scrutinised guidelines

| # | Guideline | Status |
| --- | --- | --- |
| 2.1 | App completeness — reviewer must reach every feature | ✅ Provide the `/demo` dataset + a Premium coupon. See "Demo account" below. |
| 3.1.1 | In-app purchase — digital content must use IAP | ✅ Premium is unlocked only through StoreKit → server verification. No external payment link. Coupons are a **support/testing** grant, not a paid-content workaround. |
| 3.1.2 | Subscriptions — functional content, clear terms | ✅ Standard tier stays fully functional (financial truth, accounts, transactions, basic planning). Premium adds automation/insight/personalisation. Price + period shown before purchase (StoreKit sheet). |
| 4.0 | Design — no broken UI, keyboard, safe area | ✅ Audited: no focused input hidden by the keyboard; Dynamic Island / home-indicator insets handled (`react-native-safe-area-context`). |
| 5.1.1 | Data collection & storage — privacy policy, deletion | ✅ In-app + web account deletion; privacy policy URL live. |
| 5.1.1(v) | Account deletion in-app | ✅ Mehr → Daten & Datenschutz → Konto löschen. |
| 5.1.2 | Data use & sharing — no undisclosed tracking | ✅ No tracking, no ATT prompt, no ad/analytics SDK. |
| 5.1.5 | Location services | ✅ Not used. |
| 5.6 | Developer code of conduct | ✅ No dark patterns, no fake reviews, no fake scarcity (see [`STORE_LISTING.md`](./STORE_LISTING.md) "claims not to make"). |
| 1.4.1 | Financial/medical safety | ✅ Explicit "not a bank / not investment advice" disclaimer. No personalised financial advice. |

## Financial-app specifics (Guideline 3.2.1 / 1.4)

- **Not** a regulated financial institution. Account aggregation is performed by
  **Tink** (licensed AISP); the app is a client. State this in the review notes.
- No trading, no payments, no money movement, no crypto.
- Read-only bank data; user consents through Tink's own flow.

## Demo account for the reviewer

```
Modus:      lokal (kein Login nötig, um die App zu bewerten)
Demo-Daten: In der App unter „Mehr → Demo-Daten" (im Review-Build sichtbar
            machen ODER dem Reviewer einen Superuser-/Premium-Coupon geben)
Premium:    Coupon-Code <REVIEW_COUPON>  (Mehr → Premium → Code einlösen)
Banking:    Tink-Sandbox — echte Banken werden nicht kontaktiert
```

`<REVIEW_COUPON>` is generated in the admin panel per submission and revoked
after review. **No hardcoded reviewer backdoor, no universal Premium bypass.**

## Export compliance

`ITSAppUsesNonExemptEncryption = false` — see
[`APPLE_EXPORT_COMPLIANCE.md`](./APPLE_EXPORT_COMPLIANCE.md).

## Rejection-risk pre-empts

| Risk | Mitigation |
| --- | --- |
| "IAP not required, app is free" | Premium is genuinely digital content/feature unlock → IAP is correct. |
| "Account sign-in required to review" | App is usable with **no** account; only cloud sync needs one. |
| "Privacy label mismatch" | [`APPLE_APP_PRIVACY.md`](./APPLE_APP_PRIVACY.md) is the single source; label + manifest generated from it. |
| "Where is bank licensing?" | Tink is the licensed party; app is a client. Provide Tink partner reference. |
