# finance-app

Personal, local-first Android finance app built with Expo / React Native.

- Offline-first with encrypted on-device storage (SQLCipher)
- Biometric app lock
- Swappable banking-provider architecture with explicit demo isolation
- Tink sandbox integration through an authenticated Supabase Edge Function
- Optional per-user cloud sync with strict row-level security
- Redacted remote diagnostics for support (`app_debug_logs`)

> This public repository contains the application source only.
> Internal development documentation is maintained privately.

## Tech stack

Expo SDK 57 · React Native 0.86 · TypeScript · Expo Router · SQLite (SQLCipher) · Zustand · Supabase (optional sync)

## Development

```bash
npm install
npx expo start --dev-client
```

Android-first. See `app.json` for configuration.

## Standalone Android builds

Release builds embed the JavaScript bundle and do not require Metro, ADB, or a
development computer at runtime. `expo-updates` is enabled for compatible
JavaScript and asset updates; native changes always require a new binary. The
runtime version follows the app version, so `expo.version` must be incremented
whenever native compatibility changes.

The manifest is served through the Expo-protocol gateway in
`supabase/functions/expo-updates`; immutable bundles and assets remain on
GitHub Pages. If the service is unavailable, the embedded bundle still starts.
Update checks run only after local unlock, are rate-limited, and can also be
triggered from settings. An unreachable update service never delays or blocks
a cold start.

Product access, Superuser authorization, Premium coupons and release metadata
are documented in [`PRODUCT.md`](./PRODUCT.md). The repeatable standalone and
OTA release contract is documented in [`RELEASE.md`](./RELEASE.md). A
reality-based status and roadmap is in [`PLAN.md`](./PLAN.md).

### Release path (one command per step)

```bash
npm run release:preflight        # read-only readiness snapshot
npm run release:candidate -- --engineering   # debug-signed APK+AAB for internal QA
npm run release:candidate -- --production     # upload-signed AAB (needs FINANCE_UPLOAD_*)
npm run release:go-no-go         # GO / NO-GO per track (engineering | real closed test | production)
```

Supporting: `release:doctor` (gate detail), `providers:doctor` (external
provider config, names only), `aab:fingerprint` (semantic build diff),
`build:sbom`, `build:submission` (Play bundle + char-limit check). The change
policy while a candidate is frozen is [`RELEASE_FREEZE.md`](./RELEASE_FREEZE.md);
the acceptance matrix is [`RELEASE_ACCEPTANCE.md`](./RELEASE_ACCEPTANCE.md);
rollback is [`RELEASE_ROLLBACK.md`](./RELEASE_ROLLBACK.md) /
[`OTA_ROLLBACK.md`](./OTA_ROLLBACK.md); failure drills are
[`DISASTER_RECOVERY.md`](./DISASTER_RECOVERY.md); the pre-ship security gate is
[`SECURITY_RELEASE_CHECKLIST.md`](./SECURITY_RELEASE_CHECKLIST.md).

The currently used local APK is development-distribution only because it is
debug-signed. Public distribution requires a private upload key and an Android
App Bundle; never commit signing credentials or keystores.

## Banking security boundary

The Android bundle contains only public client configuration. Confidential Tink
operations run in `supabase/functions/tink-banking` and require a valid Supabase
Auth JWT. Provider secrets and provider access tokens must never be returned to
or embedded in the mobile application.

`EXPO_PUBLIC_TINK_ENVIRONMENT` defaults to `sandbox`. Set it to `production`
only after Tink has activated production Account Aggregation for the matching
client ID and the Edge Function uses the corresponding server-side secrets.

## License

MIT
