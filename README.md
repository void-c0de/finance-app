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
Update checks are user-triggered from the app settings so an unreachable update
service can never delay or block a cold start.

The currently used local APK is development-distribution only because it is
debug-signed. Public distribution requires a private upload key and an Android
App Bundle; never commit signing credentials or keystores.

## Banking security boundary

The Android bundle contains only public client configuration. Confidential Tink
operations run in `supabase/functions/tink-banking` and require a valid Supabase
Auth JWT. Provider secrets and provider access tokens must never be returned to
or embedded in the mobile application.

## License

MIT
