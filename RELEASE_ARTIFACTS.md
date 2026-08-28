# Release artifacts — Finance App

Developer-facing index of the three build artifacts. No credentials here.
Native generation is **1.6.0 / versionCode 7 / runtime 1.6.0** for all three
(RC6 native boundary — `expo-iap` native module + Expo SDK 57 patch convergence).

| | Android APK | Android AAB | iOS unsigned IPA |
| --- | --- | --- | --- |
| Purpose | dev / internal install | Play upload | re-sign + sideload to a personal iPhone |
| Filename | `app-release.apk` | `app-release.aab` | `FinanceApp-ios-unsigned.ipa` |
| Version / build | 1.6.0 / 7 | 1.6.0 / 7 | `CFBundleShortVersionString 1.6.0` / `CFBundleVersion 7` |
| Target / min OS | targetSdk 36 / minSdk 24 | targetSdk 36 / minSdk 24 | `MinimumOSVersion 16.4` |
| Arch | arm64-v8a + armeabi-v7a (per-split) | all (bundle) | `arm64` (device slice) |
| Signing | debug keystore (dev) | **not production-signed** — blocked on the upload keystore | **none** (`LC_ENCRYPTION_INFO_64 cryptid 0`) |
| How generated | `npm run release:android` (`gradlew.bat assembleRelease --rerun-tasks`) | `npm run release:android:aab` (`bundleRelease --rerun-tasks`) | `.github/workflows/ios-unsigned.yml` on `macos-latest` (Xcode 26) |
| Billing module | `openiap-google` (Play Billing 8.x) linked; `com.android.vending.BILLING` in manifest | same | `OpenIAP` pod + `StoreKit.framework` (OS-provided); no App Store Connect credential needed |
| How to get it | local `android/app/build/outputs/apk/release/` | local `android/app/build/outputs/bundle/release/` | `npm run ios:unsigned:download` → `.artifacts/ios/` |
| How verified | `aapt dump badging`, `apksigner verify`, `npm run test:android-permissions` | `java -jar bundletool.jar validate`, `bundletool build-apks` size check | CI "Verify the app bundle" step + `ios:unsigned:download` (SHA-256, `Payload/*.app`, `Info.plist`, Mach-O) |
| Uploadable / installable | `adb install -r` on a dev device | Play Console upload (needs the upload keystore) | not installable as-is; AltStore/Sideloadly re-signs it with a free Apple ID |

## Signing safety gate

`npm run verify:release-signing -- --expect-production` exits non-zero if a build
that is supposed to be production is debug-signed or undetermined. It must fail
on the current debug-signed APK/AAB — that is the intended behaviour until the
maintainer supplies `FINANCE_UPLOAD_*`.

## iOS artifact — last verified

| | |
| --- | --- |
| Workflow run | `33178550618` on `ec6a624` (macos-26 / Xcode 26.6 / iPhoneOS 26.5 SDK) — RC6, all steps green |
| SHA-256 | `ec3036cae71f8f9151a9bfc77fa32ad2a8dad3f60daff59066d8ffbaeb555cf6` (changes every build) |
| Size | 20 MB (zip), 123 files |
| Bundle id / version | `com.nocta-xz.financeapp` · 1.6.0 (7) · min iOS 16.4 |
| Arch / signing | `arm64` · unsigned (`LC_ENCRYPTION_INFO_64 cryptid 0`) |
| SQLCipher | `_exsqlite3_key_v2 T` present in the app binary (statically linked) |
| StoreKit / billing | `openiap` pod 3.3.0 integrated (`openiap-versions.json` in the bundle); `StoreKit.framework` OS-provided; no entitlement, no ASC key |
| Privacy manifest | `PrivacyInfo.xcprivacy` at the app root + aggregated module manifests |

Retention is 7 days — re-run `npm run ios:unsigned` (or `:prepare`) when it expires.

## What is NOT an artifact

- Screenshots (synthetic, see `SCREENSHOT_PLAN.md` / `store-assets/`) — assets, not builds.
- OTA bundles — the 1.6.0 channel is intentionally empty; `npm run publish:ota` when authorised.
