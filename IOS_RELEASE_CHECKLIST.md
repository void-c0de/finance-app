# iOS release checklist — Finance App

Navigation page for the iOS track. Two distinct goals — don't confuse them:

| Goal | Cost | Document |
| --- | --- | --- |
| **Run the real app on my own iPhone** | **0 €** | [`IOS_FREE_DEVICE_INSTALL.md`](./IOS_FREE_DEVICE_INSTALL.md) ← this is the active goal |
| Publish on the App Store / TestFlight | 99 USD/yr | this file + the docs below |

## Free personal-device path — status

**PARTIALLY working today — the artifact exists.** The `iOS unsigned build`
workflow runs green on the GitHub `macos-26` runner (Xcode 26.6, iPhoneOS 26.5
SDK) and produces the re-signable artifact:

| Fact (verified in the compiled bundle) | Value |
| --- | --- |
| Artifact | `FinanceApp-ios-unsigned.ipa` — 18.3 MB (zip), 19 MB on disk, 122 files (run `33164472562`) |
| SHA-256 | `9f3b4c37eda7417a4ae01adfed4f220a3d15bbb252cd430fee9773c9788b3b75` (per-build) |
| `CFBundleIdentifier` | `com.nocta-xz.financeapp` |
| Version | `CFBundleShortVersionString 1.5.0` / `CFBundleVersion 6` |
| Architecture | `arm64` (device slice) |
| `MinimumOSVersion` | `16.4` |
| Signing | none — `LC_ENCRYPTION_INFO_64 cryptid 0`, ready to re-sign |
| SQLCipher | `_exsqlite3_key_v2` / `_exsqlite3_keyword_check` symbols present in the binary — **encryption compiled in** |
| Privacy manifest | `PrivacyInfo.xcprivacy` at the app root + aggregated module manifests |
| Face ID string | present, German |

Signing + install to a physical iPhone runs on **Windows** via AltStore /
Sideloadly with a **free Apple ID**. The only non-Windows step is the compile,
which needs a Mac **or** the free GitHub runner. Full walkthrough:
[`IOS_FREE_DEVICE_INSTALL.md`](./IOS_FREE_DEVICE_INSTALL.md).

Kick it off from Windows: `npm run ios:unsigned` (streams progress);
`npm run ios:unsigned:info` shows the last run + artifact.

## Engineering readiness (done — no account needed)

| Item | Status |
| --- | --- |
| `expo prebuild --platform ios` succeeds (on macOS/CI) | ✅ |
| Bundle identifier `com.nocta-xz.financeapp` (Apple-valid, no `_`) | ✅ |
| Deployment target `MinimumOSVersion = 16.4` (verified in the compiled bundle) | ✅ |
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
