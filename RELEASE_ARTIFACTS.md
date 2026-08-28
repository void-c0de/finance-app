# Release artifacts — Finance App

Developer-facing index of the three build artifacts. No credentials here.
Native generation is **1.5.0 / versionCode 6 / runtime 1.5.0** for all three.

| | Android APK | Android AAB | iOS unsigned IPA |
| --- | --- | --- | --- |
| Purpose | dev / internal install | Play upload | re-sign + sideload to a personal iPhone |
| Filename | `app-release.apk` | `app-release.aab` | `FinanceApp-ios-unsigned.ipa` |
| Version / build | 1.5.0 / 6 | 1.5.0 / 6 | `CFBundleShortVersionString 1.5.0` / `CFBundleVersion 6` |
| Target / min OS | targetSdk 36 / minSdk 24 | targetSdk 36 / minSdk 24 | `MinimumOSVersion 16.4` |
| Arch | arm64-v8a + armeabi-v7a (per-split) | all (bundle) | `arm64` (device slice) |
| Signing | debug keystore (dev) | **not production-signed** — blocked on the upload keystore | **none** (`LC_ENCRYPTION_INFO_64 cryptid 0`) |
| How generated | `npm run release:android` (`gradlew.bat assembleRelease --rerun-tasks`) | `npm run release:android:aab` (`bundleRelease --rerun-tasks`) | `.github/workflows/ios-unsigned.yml` on `macos-latest` (Xcode 26) |
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
| Workflow run | `33172312802` on `7c2b59b` (macos-26 / Xcode 26.6 / iPhoneOS 26.5 SDK) |
| SHA-256 | `4f57b2560d1fcb415936f59035a5a6ef44b8f4cc6ff6c020af2ae49acbb3157c` (changes every build) |
| Size | 18.3 MB (zip), 122 files |
| Bundle id / version | `com.nocta-xz.financeapp` · 1.5.0 (6) · min iOS 16.4 |
| Arch / signing | `arm64` · unsigned (`cryptid 0`) |
| SQLCipher | `_exsqlite3_key_v2 T` present in the app binary (statically linked) |
| Privacy manifest | `PrivacyInfo.xcprivacy` at the app root + aggregated module manifests |

Retention is 7 days — re-run `npm run ios:unsigned` (or `:prepare`) when it expires.

## What is NOT an artifact

- Screenshots (synthetic, see `SCREENSHOT_PLAN.md` / `store-assets/`) — assets, not builds.
- OTA bundles — the 1.5.0 channel is intentionally empty; `npm run publish:ota` when authorised.
