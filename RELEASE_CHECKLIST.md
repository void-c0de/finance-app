# Release checklist — Finance App → Google Play

**This is the navigation page for the release process.** Concrete gap list from
current (Aug 2026) Play requirements. ✅ done · ⏳ ready, needs one external
action · ❌ not started.

## Document map

| Doc | Purpose |
| --- | --- |
| [`PLAY_SUBMISSION_PACK.md`](./PLAY_SUBMISSION_PACK.md) | Copy/paste values for the Play Console (identity, URLs, review notes) |
| [`PLAY_DATA_SAFETY.md`](./PLAY_DATA_SAFETY.md) | Source of truth for the Data Safety form |
| [`PLAY_FINANCIAL_FEATURES.md`](./PLAY_FINANCIAL_FEATURES.md) | Source of truth for the Financial Features declaration |
| [`STORE_LISTING.md`](./STORE_LISTING.md) | DE/EN listing copy + banking disclaimer + "claims not to make" |
| [`SCREENSHOT_PLAN.md`](./SCREENSHOT_PLAN.md) · [`store-assets/`](./store-assets/) | Synthetic-data screenshot plan + `npm run screenshots:android` |
| [`RELEASE_ARTIFACTS.md`](./RELEASE_ARTIFACTS.md) | APK / AAB / iOS unsigned IPA index |
| [`IOS_PHYSICAL_QA.md`](./IOS_PHYSICAL_QA.md) | First-run + re-sign-survival checklist for the iPhone |
| [`CLOSED_TEST_CHECKLIST.md`](./CLOSED_TEST_CHECKLIST.md) | 12-testers / 14-days closed test |
| [`REAL_USER_QA.md`](./REAL_USER_QA.md) | Tester script |
| [`PRIVACY_DATA_MAP.md`](./PRIVACY_DATA_MAP.md) | Engineering data-flow reference |
| [`THREAT_MODEL.md`](./THREAT_MODEL.md) | Per-threat mitigation / residual risk |
| [`LEGAL_PLACEHOLDERS.md`](./LEGAL_PLACEHOLDERS.md) | The facts only the maintainer can supply |
| [`BILLING_SERVER_CONTRACT.md`](./BILLING_SERVER_CONTRACT.md) | Purchase-verification architecture — google_play / app_store / revenuecat (built + what's left) |
| [`IOS_FREE_DEVICE_INSTALL.md`](./IOS_FREE_DEVICE_INSTALL.md) | Install on a real iPhone for 0 € |
| [`IOS_WINDOWS_WLAN_BRIDGE.md`](./IOS_WINDOWS_WLAN_BRIDGE.md) | Windows↔iPhone connection: measured state + minimal one-time-USB path (`npm run ios:device:doctor`) |
| [`IOS_RELEASE_CHECKLIST.md`](./IOS_RELEASE_CHECKLIST.md) | iOS track navigation (free path + App Store) |
| [`APPLE_APP_PRIVACY.md`](./APPLE_APP_PRIVACY.md) | App Privacy label + `PrivacyInfo.xcprivacy` source of truth |
| [`APPLE_EXPORT_COMPLIANCE.md`](./APPLE_EXPORT_COMPLIANCE.md) · [`APPLE_REVIEW_CHECKLIST.md`](./APPLE_REVIEW_CHECKLIST.md) · [`APP_STORE_LISTING.md`](./APP_STORE_LISTING.md) · [`TESTFLIGHT_CHECKLIST.md`](./TESTFLIGHT_CHECKLIST.md) | Future App Store submission (paid program) |
| [`RELEASE.md`](./RELEASE.md) | Native release contract + per-version history |
| [`PRODUCT.md`](./PRODUCT.md) · [`PLAN.md`](./PLAN.md) | Product rules · status |

## Policy / compliance

| Item | Status | Notes |
| --- | --- | --- |
| targetSdk 36 (Android 16) — new-app/update deadline 31 Aug 2026 | ✅ | Verified in merged manifest + APK aapt. No SDK bump needed. |
| AAB upload format | ✅ | `npm run release:android:aab` (bundleRelease). |
| App signing by Google Play (upload key) | ⏳ | Needs `FINANCE_UPLOAD_*` keystore (maintainer). `npm run verify:release-signing` fails the build path if a "production" build is debug-signed. |
| In-app account deletion | ✅ | `Mehr → Daten & Datenschutz → Konto löschen`. |
| Web account deletion (no login wall to view, HTTPS, direct link) | ✅ | `https://void-c0de.github.io/finance-app/konto-loeschen.html` — live, tested. |
| Data actually deleted (not deactivated) | ✅ | `purge_owner_finance_data` + Edge Function; 3-day grace only. |
| Privacy policy URL (HTTPS) | ✅ (content ⏳) | `.../datenschutz.html` live; `[BITTE ERGÄNZEN]` legal fields remain. |
| Data Safety form answers | ✅ prepared | `PLAY_DATA_SAFETY.md`. Transcribe into console. |
| Financial Features declaration | ✅ prepared | `PLAY_FINANCIAL_FEATURES.md`. Account aggregation = Yes; everything regulated = No. |
| Google Play Billing Library v8+ (deadline 31 Aug 2026) | ✅ | `expo-iap@5.4.0` → Play Billing **9.1.0** linked in the AAB (`com.google.android.play.billingclient.version`). Clears the v7 deadline. Store products / credentials still external. |
| Permissions minimised | ✅ | `SYSTEM_ALERT_WINDOW` removed; INTERNET, ACCESS_NETWORK_STATE, USE_BIOMETRIC/USE_FINGERPRINT, VIBRATE, legacy storage (maxSdk 32), `com.android.vending.BILLING` (Play Billing, added by expo-iap). `test:android-permissions` allowlist enforced against the built APK. |
| Content rating (IARC) | ❌ | Complete questionnaire (Finance, no ads, no gambling → Everyone/PEGI 3). |
| Store listing (text, screenshots, feature graphic, icon 512²) | ⏳ | Text ready (`STORE_LISTING.md`); `npm run screenshots:android` captures the 6 demo surfaces once the device is unlocked with demo data loaded — `store-assets/`. Feature graphic + icon still to draw. |
| App access (review-team instructions) | ⏳ | Provide a Premium coupon + Tink sandbox note. |
| Closed test: 12 testers / 14 days (if new personal account) | ❌ | See `CLOSED_TEST_CHECKLIST.md`. Confirm account type first. |

## Build / technical

| Item | Status |
| --- | --- |
| `npx tsc --noEmit` / `npm run lint` / `npx expo-doctor` clean | ✅ |
| All `npm run test:*` green (41 suites) + CI green on origin/master | ✅ |
| Purchase state machine + product config (pure, tested) | ✅ (`test:purchase-state-machine`, `test:product-config`) |
| Supabase migration parity + `db lint` | ✅ (14 migrations) |
| Live rollback authz tests (deletion, billing) | ✅ (`supabase/tests/*.sql`) |
| Edge Functions deployed + live-tested | ✅ `finalize-account-deletion`, `verify-purchase`, `billing-webhook` |
| Runtime boundary test (1.6.0 / vc7) | ✅ |
| APK + AAB built (`--rerun-tasks`), aapt-verified: pkg / vc7 / targetSdk 36 / SQLCipher / Billing 9.1.0 / allowBackup=false | ✅ |
| Cold start on a physical Android 16 device, no Metro | ✅ |
| Windowed transaction list (no freeze at 10k+) | ✅ |
| Synthetic large-dataset perf test | ✅ (`test:perf-scale`) |
| Debug-log retention (14 days) | ✅ (`prune_my_debug_logs`) |
| Admin: deletion panel + audit-log viewer | ✅ |
| Analytics month-range (3/6/12/24) | ✅ |
| Multi-currency: EUR base, foreign partitioned + labelled | ✅ |
| Demo data mode (screenshots/QA) | ✅ (`/demo`, Superuser/dev) |
| Support diagnostic bundle (redacted) | ✅ |

## iOS — free personal-device path

| Item | Status | Notes |
| --- | --- | --- |
| App compiles for iOS (unsigned, device SDK) | ✅ | GitHub `macos-latest`, Xcode 26. `npm run ios:unsigned`. |
| Unsigned re-signable IPA artifact | ✅ | `FinanceApp-ios-unsigned.ipa`, uploaded by the workflow (7-day retention). |
| Bundle verification in CI (arch / encryption / SQLCipher / privacy manifest) | ✅ | "Verify the app bundle" step. |
| Sign + install to a physical iPhone | ⏳ | Maintainer: AltStore/Sideloadly on Windows + a free Apple ID. See [`IOS_FREE_DEVICE_INSTALL.md`](./IOS_FREE_DEVICE_INSTALL.md). |
| App Store / TestFlight | ❌ | Needs the paid Apple Developer Program. [`IOS_RELEASE_CHECKLIST.md`](./IOS_RELEASE_CHECKLIST.md). |

## RC6 — what changed since RC5

**Native boundary → 1.6.0 / versionCode 7 / runtime 1.6.0.** Added the `expo-iap`
native billing module (Play Billing 9.1.0 / StoreKit 2), a pure purchase state
machine, env-driven product config (no fake IDs), and the `expoIapAdapter`
client. Converged the Expo SDK 57 patch drift (`expo` 57.0.18, `expo-updates`
57.0.19, etc.) in the same rebuild. Server verification layer unchanged — still
`not_configured` until credentials are set. No real store purchase was tested.
Android APK + AAB rebuilt with `--rerun-tasks`; iOS unsigned CI re-run.

## Version

- Native generation **1.6.0 / versionCode 7 / runtime 1.6.0**.
- OTA: the 1.6.0 channel starts empty; devices run the embedded bundle. An OTA
  can be published when the release process authorizes it (`npm run publish:ota`).

## The only external blockers

1. **Play upload keystore** (`FINANCE_UPLOAD_*`) — to produce a Play-signable AAB.
2. **Google Play Console access** — to transcribe Data Safety / Financial
   Features, upload the AAB, set up the closed test, complete IARC.
3. **Legal fields** — see [`LEGAL_PLACEHOLDERS.md`](./LEGAL_PLACEHOLDERS.md).
4. **Google Play billing credentials** (Play Console products + a Google Cloud
   service-account key + Pub/Sub + the `EXPO_PUBLIC_PREMIUM_*_ID` build env) —
   only to turn on real purchases. The client (Play Billing 9.1.0) and the
   verification server are implemented; without config the app stays in the
   honest "Preise folgen" state. Coupons / admin grants deliver Premium
   meanwhile. See `BILLING_SERVER_CONTRACT.md`.
5. **Tink production agreement** — only to leave sandbox; not a store blocker.
6. **iOS**: a Mac *or* the GitHub macOS runner with Xcode 26 for the final
   compile step — see [`IOS_FREE_DEVICE_INSTALL.md`](./IOS_FREE_DEVICE_INSTALL.md).
   Not an Android/Play blocker.
