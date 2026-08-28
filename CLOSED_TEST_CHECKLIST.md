# Closed test checklist — Google Play

Last verified against current Play policy: 2026-08-28 (RC8).

## The 12-testers / 14-days rule — what it actually gates

**Confirmed (Aug 2026):** the rule gates **production access only**, *not* running
a closed test. You can create a Closed testing track and upload an AAB with **no
minimum tester count**. The 12/14 requirement is checked when you click
**"Apply for production"**.

| Developer account | Requirement to reach *production* |
| --- | --- |
| **Personal account created after 13 Nov 2023** | ≥ **12 testers opted in continuously for ≥ 14 days**, and (since 2026) Google checks they *actually used* the app. Then a 3-section production-access application; review ≤ ~7 days. |
| Personal account created on/before 13 Nov 2023, or an **organisation** account | Exempt — can publish straight to production (still: review + Data Safety + Financial Features + IARC). |

→ **MUST CONFIRM IN PLAY CONSOLE: which type `void-c0de`'s developer account is.**
The closed-test steps below are the same either way; only the production gate differs.

Sources: Play Console Help "App testing requirements for new personal developer
accounts" (support.google.com/googleplay/android-developer/answer/14151465).

## Pre-upload gates (all must be true)

- [x] `targetSdk 36` (Android 16) — verified in the merged manifest and APK. Meets the 31 Aug 2026 deadline.
- [x] AAB, not APK, for the Play upload (build with `bundleRelease`).
- [ ] **Upload key** configured (`FINANCE_UPLOAD_*`) so the AAB is upload-signed, not debug-signed. `npm run check:upload-signing --expect-production` then `npm run verify:release-signing <aab> --expect-production` must both pass. → external (you hold the keystore). **RC8: the Gradle production-signing branch is fixed and proven** (see below). Only the keystore itself is missing.
- [x] Account deletion: in-app **and** web (`.../konto-loeschen.html`).
- [x] Privacy policy URL reachable over HTTPS (`.../datenschutz.html`).
- [x] Data Safety answers prepared (`PLAY_DATA_SAFETY.md`) — RC8: purchase token transient + hashed.
- [x] Financial Features answers prepared (`PLAY_FINANCIAL_FEATURES.md`).
- [x] No unnecessary permissions (SYSTEM_ALERT_WINDOW removed; `com.android.vending.BILLING` added by expo-iap, on the allowlist).
- [x] **Google Play Billing Library 9.1.0** linked (`expo-iap`) — clears the v7-blocked-from-31-Aug-2026 deadline. Server verification implemented; `not_configured` until credentials. `PLAY_SUBMISSION_PACK.md` "Billing readiness".
- [ ] Store listing text ready (`STORE_LISTING.md`); screenshots present (`store-assets/android/`, 6× 1080×2400); **icon 512² export + feature graphic 1024×500 still to produce** (`store-assets/SPEC-icon-512.md`, `SPEC-feature-graphic.md`).
- [ ] Content rating (IARC) questionnaire — answers prepared in `PLAY_IARC_PREP.md` (IAP = **Yes** since RC7).
- [ ] App access instructions for the review team: a **coupon code** that grants Premium, plus the Tink-sandbox note. The store-purchase path is implemented but disabled (no products) → "Preise folgen".

### RC8 signing verification (2026-08-28)

The `withFinanceUploadSigning` config plugin previously failed to rewrite the
`release` buildType because the RN 0.86 template writes `signingConfig =
signingConfigs.debug` (with `=`) and the plugin only matched the space form — so
even with all four `FINANCE_UPLOAD_*` set, the AAB would still have been
debug-signed. **Fixed in RC8** (both syntaxes handled; the plugin now *throws*
if it can't find the anchor). Proven with an **ephemeral throwaway keystore**
(generated in a gitignored temp path, random password, deleted after the test):
`assembleRelease` with `FINANCE_UPLOAD_*` set → APK signed by the ephemeral key,
`verify:release-signing --expect-production` **passed**; the same build with the
vars unset → debug-signed. `npm run check:upload-signing` refuses a partial
(1–3 of 4) configuration loudly instead of silently falling back to debug.

## Closed test setup

1. Create a **Closed testing** track (`Testing → Closed testing → Create track`).
   Upload the **upload-signed** AAB. *(No minimum tester count to start the track.)*
2. Add testers: an **email list** (`Testers` tab → create a list of Google-account
   emails) or a **Google Group**. For the production gate you need **≥ 12** real
   people who **install and use** the app — invited-but-not-installed does not count.
3. Share the opt-in URL. Each tester: open the link → "Become a tester" → install
   from Play. Confirm each shows as opted in.
4. Keep the track live and ≥ 12 testers opted in for **14 continuous days**, with
   genuine usage (the tester script below).
5. Then **"Apply for production"** — the 3-section form asks about the closed test,
   the target audience, the value proposition, install estimate, changes made from
   testing, and production readiness. Review ≤ ~7 days.

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
