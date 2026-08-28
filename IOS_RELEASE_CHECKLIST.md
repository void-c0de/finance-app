# iOS release checklist — Finance App

Navigation page for the iOS track. Two distinct goals — don't confuse them:

| Goal | Cost | Document |
| --- | --- | --- |
| **Run the real app on my own iPhone** | **0 €** | [`IOS_FREE_DEVICE_INSTALL.md`](./IOS_FREE_DEVICE_INSTALL.md) ← this is the active goal |
| Publish on the App Store / TestFlight | 99 USD/yr | this file + the docs below |

## Free personal-device path — status

**PARTIALLY working today.** The app compiles for iOS (unsigned Release build
green on the GitHub `macos-latest` runner, Xcode 26.6 / Swift 6.3.3 → 18.2 MB
`FinanceApp-unsigned.ipa` artifact). Signing + install to a physical iPhone runs
on Windows via AltStore with a free Apple ID. The only non-Windows step is the
compile, which needs a Mac **or** the free GitHub runner. Full walkthrough:
[`IOS_FREE_DEVICE_INSTALL.md`](./IOS_FREE_DEVICE_INSTALL.md).

## Engineering readiness (done — no account needed)

| Item | Status |
| --- | --- |
| `expo prebuild --platform ios` succeeds (on macOS/CI) | ✅ |
| Bundle identifier `com.nocta-xz.financeapp` (Apple-valid, no `_`) | ✅ |
| Deployment target (Expo SDK 57 default = iOS 15.1) | ✅ |
| SQLCipher on iOS (`useSQLCipher` top-level prop) | ✅ verified in the CI pod install + build |
| Keychain / SecureStore survives 7-day re-sign (same Team → same access group) | ✅ documented + backup-first fallback |
| Face ID `Info.plist` string (German) | ✅ |
| Privacy manifest `PrivacyInfo.xcprivacy` (`ios.privacyManifests`) | ✅ [`APPLE_APP_PRIVACY.md`](./APPLE_APP_PRIVACY.md) |
| Export compliance flag | ✅ [`APPLE_EXPORT_COMPLIANCE.md`](./APPLE_EXPORT_COMPLIANCE.md) |
| No ATT / IDFA | ✅ |
| Keyboard: no focused input hidden (iOS) | ✅ audited |
| Safe area: notch / Dynamic Island / home indicator | ✅ `react-native-safe-area-context` |
| Deep links `financeapp://` (Supabase auth, Tink callback) | ✅ scheme set; Safari→app return designed |
| Central entitlement resolver (google_play / app_store / coupon / admin / superuser) | ✅ one resolver |
| Unsigned iOS build workflow (no Apple creds in CI) | ✅ `.github/workflows/ios-unsigned.yml` |
| `npm run test:ios-config` | ✅ |

## App Store submission (blocked only by the paid program)

| Item | Doc |
| --- | --- |
| Listing text + assets | [`APP_STORE_LISTING.md`](./APP_STORE_LISTING.md) |
| App Privacy questionnaire | [`APPLE_APP_PRIVACY.md`](./APPLE_APP_PRIVACY.md) |
| Review notes + demo/reviewer access | [`APPLE_REVIEW_CHECKLIST.md`](./APPLE_REVIEW_CHECKLIST.md) |
| TestFlight beta | [`TESTFLIGHT_CHECKLIST.md`](./TESTFLIGHT_CHECKLIST.md) |
| Export compliance | [`APPLE_EXPORT_COMPLIANCE.md`](./APPLE_EXPORT_COMPLIANCE.md) |
| StoreKit product setup | [`BILLING_SERVER_CONTRACT.md`](./BILLING_SERVER_CONTRACT.md) |

## External blockers (iOS)

1. **A Mac or the GitHub macOS runner** for the compile step — the runner is
   already wired; the maintainer just runs the "iOS unsigned build" workflow
   once per app-code change.
2. **A free Apple ID** for signing (the maintainer's own; never committed,
   never sent to third parties).
3. **Apple Developer Program (99 USD/yr)** — only for App Store / TestFlight,
   **not** for personal-device install.
4. **Tink iOS SDK privacy manifest** — verify the pinned pod version bundles
   one when the iOS Tink integration is wired.
