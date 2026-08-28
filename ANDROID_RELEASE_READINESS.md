# Android release readiness — crash / ANR / pre-launch audit

RC8 audit against the current 1.6.0 / versionCode 7 build. No analytics or
crash-reporting SDK is added (by design — `PLAY_DATA_SAFETY.md`). Findings are
from a source audit; Play's own pre-launch report will add device coverage after
the first upload.

## Startup path (cold start, no network)

| Concern | State |
| --- | --- |
| Boot blocks on the network | **No.** `prepareApplication()` = `Promise.all([hydrateTheme, initializeDatabase])` then `void initBilling()`. No `fetch`, no Supabase call in the blocking path. |
| Boot blocks on the OTA server | **No.** `app.json` `updates.checkAutomatically: "NEVER"`, `fallbackToCacheTimeout: 0`, `useEmbeddedUpdate: true`. `checkProductUpdate({ background: true })` runs as `void … .then()` after the first frame and is rate-limited. |
| Synchronous DB on the main thread | **None found** (`getAllSync` / `runSync` / `withTransactionSync` absent from `src/`). `expo-sqlite` async API throughout. |
| SQLCipher key retrieval | `expo-secure-store` (Android Keystore), lazy, try/catch. A missing key surfaces as a handled error, not a crash. |
| First-run empty state | Dashboard renders an empty state; no null-deref on missing accounts/transactions (analytics cores are no-baseline-aware). |

## Error handling

| Concern | State |
| --- | --- |
| Render errors | Expo Router `ErrorBoundary` in `src/app/_layout.tsx` — shows a retry screen, not a white screen. |
| Uncaught errors + promise rejections | **RC9: a minimal global handler is installed** (`src/core/globalErrorHandler.ts`, called first in `prepareApplication()`). It wraps `ErrorUtils.setGlobalHandler` and the `promise` rejection tracker, logs each one **once** through the redacted `debugLog`, then **calls the previous RN handler** — nothing is swallowed, the dev red-box and the release default are preserved. No SDK, no upload. `test:global-error` covers the pure `describeUncaught` (single-line, 300/600-char caps, circular-safe) and asserts the install glue keeps the previous handler. Async work is still wrapped in `try/catch` + `debugLog` throughout. |
| Purchase callbacks | `expoIapAdapter` wraps every listener in `catch` / `void (async () => …)` / `.catch(() => …)`. A `requestPurchase` that throws synchronously settles the pending promise with `{ kind: 'unavailable' }`. A 120 s timeout guards a stuck purchase. |
| Deep links (`financeapp://bank/tink?…`) | `parseTinkCallback` / `classifyTinkCallback` are pure and defensive — malformed URL, missing `code`, wrong `state`, cancel tokens all map to a safe decision (`test:tink-callback`). No crash on a hostile callback URL. |
| Process death during a purchase / sync | `usePurchaseStore.reconcileSilently()` runs once on the next boot; sync resumes from its cursor; transaction import is idempotent (`ON CONFLICT`). |

## ANR risk

| Concern | State |
| --- | --- |
| Large transaction list | Windowed list; `test:perf-scale` shows insight builds < 15 ms at 40k transactions. |
| Backup import | Runs off the main interaction; strict-validate → preview → atomic merge. Large backups show progress. |
| Analytics recompute | Pure cores, memoised; < 15 ms at 40k. |
| Billing bootstrap | `initBilling()` + `reconcileSilently()` are `void`-dispatched after boot; a slow/absent store never blocks the UI. |

## Pre-launch report readiness (after the first Console upload)

- **No dev-only gate:** `__DEV__` opens `/demo`; a release build has no such route active. `EXPO_PUBLIC_SCREENSHOT_MODE` is a build flag, never set by a store profile (`test:screenshot-mode`).
- **No Metro dependency:** cold start verified without Metro on a physical Android 16 device (RC5).
- **No hardcoded test password / backdoor:** review-team access is a normal Premium **coupon** (`admin_create_coupon`), not a code path. `guard:secrets` + `test:demo-data` enforce this.
- **Demo mode cannot become a production bypass:** the mock bank provider is isolated behind `isExternalManagedProvider` / the demo route; it does not touch real Tink or grant entitlements.
- **Critical screens without cloud access:** the app is offline-first; every core screen renders from the local SQLCipher DB with no account. The Premium screen shows "Preise folgen"; Analytics shows the Standard preview.
- **Reviewer bypass:** none. There is no insecure shortcut for reviewers — they use the coupon like any user.

## Android 16 / targetSdk 36 (RC9 audit)

| Area | State |
| --- | --- |
| Edge-to-edge | `edgeToEdgeEnabled=true` (Android 16 requirement) — verified on device (RC-series). |
| Predictive back | Expo Router / RN 0.86 handles the OnBackInvokedCallback path; no custom back interception that would break it. |
| 16 KB page size | RN 0.86 + the SDK-57 native module set ship 16 KB-aligned `.so` files; no bespoke prebuilt libs. |
| Notification permission | Not requested — the app posts no notifications. |
| Package visibility | No `QUERY_ALL_PACKAGES` (forbidden by `test:android-permissions`); `expo-web-browser` / share-sheet use implicit intents. |
| Scoped storage | Legacy `READ/WRITE_EXTERNAL_STORAGE` capped at `maxSdkVersion=32`; exports go through the system share sheet (`expo-sharing`). |
| Biometric | `USE_BIOMETRIC` + legacy `USE_FINGERPRINT`; `expo-local-authentication` handles the API-level differences. |
| Foreground/background limits | No foreground service, no background location/work; sync runs only while the app is active. |

## Open items

- Add the app to Play Console and run the pre-launch report on the first
  closed-test upload; triage any device-specific crash then.
- Watch the closed-test crash/ANR feed and the `app_debug_logs` for the new
  `UncaughtError` / `UnhandledRejection` lines.
