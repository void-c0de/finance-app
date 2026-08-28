# Dependency audit — 2026-08-28 (Finance App 1.6.0, Expo SDK 57)

## Runtime production dependencies

`npx expo install --check` → **"Dependencies are up to date"**. Every runtime
package is on the version Expo SDK 57 expects (React 19.2.3, RN 0.86.3, Hermes,
`@supabase/supabase-js` 2.95.3, the `expo-*` set at ~57.x).

No third-party analytics / advertising / attribution / crash SDK (verified by
name scan of `package.json` + `node_modules`). No `react-native-firebase`,
Sentry, Amplitude, Segment, AppsFlyer, etc. One native billing library since
RC6 — `expo-iap` (first-party store billing only, no analytics; see below).

## `npm audit --omit=dev` → 12 moderate, **build-tooling only**

All 12 trace to one chain:

```
@expo/config-plugins → xcode → uuid   (uuid v3/v5/v6: missing buffer-bounds
                                        check when a Buffer is passed to v5/v6)
```

- **Where it runs:** `@expo/cli`, `@expo/config`, `@expo/prebuild-config`,
  `@expo/metro-config`, `@expo/inline-modules` — i.e. the **prebuild / dev-server
  toolchain**, on the developer machine and the CI runner. `expo-sharing` /
  `expo-splash-screen` appear only because their *config plugins* import
  `@expo/config-plugins`; their shipped native code is unaffected.
- **Runtime exposure:** none. `uuid` here is used by the Xcode-project generator
  (`xcode` npm package) with internally-generated values, never with
  attacker-controlled Buffers, and never in the app bundle.
- **Fix path:** `npm audit fix --force` proposes **canary** downgrades of
  `expo-sharing` / `expo-splash-screen` and would desync from Expo SDK 57.
  **Rejected** — per policy (no destructive force-fix, no SDK downgrade). The
  clean fix is Expo shipping an `@expo/config-plugins` with `uuid` ≥ 11, which
  will arrive via a normal SDK patch.

**Assessment: acceptable for closed test and production.** These are not
runtime dependencies and there is no realistic exploitation path.

## Android native dependencies (SDK 36)

- `compileSdk` / `targetSdk` = **36**, `minSdk` = 24 — current.
- Native modules present in the AAB: Hermes, RN 0.86, Reanimated 4.5, Fresco
  image pipeline, `react-native-screens` 4.26, `react-native-safe-area-context`
  5.7, `expo-sqlite` (SQLCipher), `expo-updates`, `expo-secure-store`,
  `expo-sharing`, `expo-file-system`, `expo-document-picker`,
  `expo-local-authentication` — all at the SDK-57-pinned versions.
- No deprecated-API build warnings that block SDK 36 (the Gradle 10
  deprecation notice is Gradle-internal, not app code).
- `edgeToEdgeEnabled=true` (Android 16 requirement) — verified on device.

## iOS native dependencies

`pod install` **resolves cleanly** on the CI macOS runner; the unsigned Release
build **compiles** with Xcode 26.6 (macOS-26 runner). SQLCipher is compiled in — `_exsqlite3_key_v2` symbols verified in the arm64 binary (the
top-level `useSQLCipher` prop covers iOS). No entitlement-gated module.

## Expo SDK 57 patch convergence — DONE (RC6, 2026-08-28)

`npx expo install --fix` applied as part of the `1.6.0` native boundary:

| package | 1.5.0 | 1.6.0 |
| --- | --- | --- |
| `expo` | 57.0.17 | 57.0.18 |
| `expo-constants` | 57.0.15 | 57.0.16 |
| `expo-font` | 57.0.1 | 57.0.2 |
| `expo-updates` | 57.0.18 | 57.0.19 |

Patch-level, same minor. `npx expo install --check` → "Dependencies are up to
date". These were deferred from RC5 precisely because `expo` / `expo-updates`
changes belong to a native binary, not an OTA — RC6 rebuilds Android + iOS, so
this is the right boundary.

## Native billing dependency — expo-iap 5.4.0 (RC6, new)

`expo-iap` (OpenIAP spec; `openiap-apple` = StoreKit 2, `openiap-google` = Play
Billing — **9.1.0 linked in the built AAB**, verified via
`com.google.android.play.billingclient.version`; well clear of the v7-blocked
deadline of 31 Aug 2026). Chosen over `react-native-purchases` (RevenueCat) — no third-party
middleman, matches the server-authoritative `verify-purchase` model — and over
`react-native-iap` (bare-RN focused). Officially listed by Expo for IAP in 2026.

- Expo module + config plugin → works with prebuild/CNG, no eject.
- `devDependencies.expo: ^57.0.12` — developed against SDK 57.
- `deps: none`; peer `expo`/`react`/`react-native`. iOS platform min 13.4 (we
  ship 16.4); Android `minSdk` 23 (we ship 24), `compileSdk`/`targetSdk` 36.
- Config plugin adds `com.android.vending.BILLING` to the Android manifest
  (already on the `test:android-permissions` allowlist) and `OpenIAP` pod on
  iOS. No iOS entitlement / Info.plist string; StoreKit.framework is OS-provided
  → compiles unsigned in CI without any App Store Connect credential.
- The adapter is only loaded/registered when `EXPO_PUBLIC_PREMIUM_*_ID` are set
  (`registerBilling.ts` dynamic import). A no-store build never touches it.

## Action

Re-check the 12 build-tooling npm-audit entries (`@expo/config-plugins → xcode →
uuid`) after each Expo SDK patch; a future `@expo/config-plugins` bump clears
them. They remain build-tooling only, no runtime exposure.
