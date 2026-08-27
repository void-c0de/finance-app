# Closed test checklist — Google Play

Last verified against current Play policy: 2026-08-27.

## Does the 12-testers / 14-days rule apply to you?

| Developer account | Requirement |
| --- | --- |
| **Personal account created after 13 Nov 2023** | Run a **closed test** with **≥ 12 testers opted in continuously for ≥ 14 days**, and Google checks they *actually used* the app, before you can request production access. |
| Personal account created on/before 13 Nov 2023, or an **organisation** account | Exempt — can publish straight to production (still must pass review + Data Safety + Financial Features). |

→ **ACTION (you): confirm which type `void-c0de`'s Play developer account is.**
Everything below assumes the stricter path; skip the tester count if exempt.

## Pre-upload gates (all must be true)

- [x] `targetSdk 36` (Android 16) — verified in the merged manifest and APK. Meets the 31 Aug 2026 deadline.
- [x] AAB, not APK, for the Play upload (build with `bundleRelease`).
- [ ] **Upload key** configured (`FINANCE_UPLOAD_*`) so the AAB is upload-signed, not debug-signed. `npm run verify:release-signing` must pass on the AAB. → external (you hold the keystore).
- [x] Account deletion: in-app **and** web (`.../konto-loeschen.html`).
- [x] Privacy policy URL reachable over HTTPS (`.../datenschutz.html`).
- [x] Data Safety answers prepared (`PLAY_DATA_SAFETY.md`).
- [x] Financial Features answers prepared (`PLAY_FINANCIAL_FEATURES.md`).
- [x] No unnecessary permissions (SYSTEM_ALERT_WINDOW removed; see `RELEASE_CHECKLIST.md`).
- [x] No Google Play Billing Library present → the "PBL v8 by 31 Aug 2026" deadline does not apply until billing is added.
- [ ] Store listing text + screenshots + feature graphic + icon uploaded (`STORE_LISTING.md`, `SCREENSHOT_PLAN.md`).
- [ ] Content rating (IARC) questionnaire completed.
- [ ] App access instructions for the review team: provide a **coupon code** that grants Premium, plus a note that a bank connection uses the Tink sandbox (test bank credentials from Tink's sandbox docs).

## Closed test setup

1. Create a **Closed testing** track. Upload the upload-signed AAB.
2. Create an email list of **≥ 12 testers** (Google account emails). Real people
   who will open the app a few times over 14 days — installed-once-and-gone
   counts as inactive and fails the review.
3. Share the opt-in link. Confirm each tester is opted in.
4. Keep the track live and the testers opted in for **14 continuous days**.
5. Then use **"Apply for production"** in Play Console.

## What testers should exercise (14 days)

Sign up · sign in · biometric lock · offline cold start · add manual account +
transactions · categorise + create a rule · create a budget · hit the 3rd-budget
Premium quota gate · create a savings goal · switch a theme · open Analytics
(Standard preview + Premium) · redeem a coupon → Premium · export CSV · create a
backup · import that backup · request account deletion → cancel it · sign out →
sign back in.

## Feedback capture

Use `REAL_USER_QA.md` as the tester script. Collect: what confused you in the
first 3 minutes, anything that felt broken, any place a keyboard covered a field,
any crash (with device + Android version).
