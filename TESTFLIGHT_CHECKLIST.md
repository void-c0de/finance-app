# TestFlight checklist — Finance App (future, needs paid Apple program)

**TestFlight is not free.** It requires the Apple Developer Program (99 USD/yr).
For zero-cost personal-device testing use
[`IOS_FREE_DEVICE_INSTALL.md`](./IOS_FREE_DEVICE_INSTALL.md) instead — this file
is only for the eventual public beta.

## Prerequisites

| Item | Status |
| --- | --- |
| Apple Developer Program membership | ❌ external (maintainer) |
| App record in App Store Connect (bundle id `com.nocta-xz.financeapp`) | ❌ needs the program |
| Distribution certificate + App Store provisioning profile | ❌ needs the program (EAS can manage these) |
| `eas.json` production/preview profile for iOS | ⏳ `ios-simulator` profile exists; an App Store profile is one block away |
| App Privacy answers | ✅ [`APPLE_APP_PRIVACY.md`](./APPLE_APP_PRIVACY.md) |
| Export compliance | ✅ `ITSAppUsesNonExemptEncryption=false` |
| Beta App Description + feedback email | ⏳ reuse [`APP_STORE_LISTING.md`](./APP_STORE_LISTING.md) |
| Demo data + reviewer notes (also used for Beta App Review) | ✅ `/demo` + coupon, see [`APPLE_REVIEW_CHECKLIST.md`](./APPLE_REVIEW_CHECKLIST.md) |

## Build → upload flow (once the program exists)

```bash
# option 1 — EAS manages signing
eas build --platform ios --profile production
eas submit --platform ios --latest

# option 2 — local, needs a Mac
npx expo prebuild --platform ios
# archive in Xcode → Distribute → App Store Connect → TestFlight
```

## Internal vs external testing

| | Internal | External |
| --- | --- | --- |
| Testers | up to 100 App Store Connect users | up to 10 000 via public link / email |
| Review | none | Beta App Review (lightweight) on first build of a version |
| Use for Finance App | maintainer devices | closed beta parallel to the Google closed test |

## Things to verify on the first TestFlight build

- SQLCipher DB opens (no plaintext fallback) — `test:ios-config` covers the
  config; confirm at runtime with a fresh install.
- Keychain item survives an app **update** (not just reinstall).
- Face ID prompt string is the German one.
- Deep links: `financeapp://` open from Safari (Supabase auth redirect, Tink
  callback).
- Backup export → Share sheet → "Save to Files" works.
- No `NSPrivacyAccessedAPI` build warning from `xcodebuild`.
