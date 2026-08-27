# Finance App release contract

## Runtime and OTA compatibility

- `expo.version` is the native compatibility boundary through `runtimeVersion.policy = appVersion`.
- Every native release must increment both `expo.version` and `android.versionCode`.
- JavaScript-only OTA releases keep the same app/runtime version and may target only that runtime.
- Native dependency, Expo SDK, config-plugin or native configuration changes require a new native version/runtime.
- The embedded update stays enabled as the anti-bricking fallback.
- Startup never waits for the update server. Product-level checks happen only after local unlock and are limited to one attempt per six hours.
- `app_releases` carries server-managed patch notes, update urgency, native minimum version and an optional store/download URL.
- Compatible OTA updates and required native upgrades are always treated as separate paths.
- Do not publish an OTA built from native dependencies that differ from its target binary.

## Environments

- Mobile configuration may contain only public identifiers and publishable keys.
- Provider client secrets, Supabase service-role keys, bank credentials, signing material and tokens stay server-side or outside Git.
- Tink production access requires a provider agreement and server-side token/consent lifecycle. Sandbox/demo capability must never be presented as production connectivity.
- Password screening uses only the free HIBP k-anonymity range API. No API key or additional secret is required; raw passwords and complete hashes must never be added to logs, analytics or support diagnostics.

## Android builds

Internal universal APK:

```powershell
cd android
.\gradlew.bat assembleRelease --rerun-tasks
```

Play-distribution candidate:

```powershell
cd android
.\gradlew.bat bundleRelease --rerun-tasks
```

`--rerun-tasks` is intentional: it forces regeneration of the embedded `expo-updates` manifest and prevents a stale update ID/commit time from being packaged beside a newly generated JavaScript bundle. A combined Gradle `clean assembleRelease` is avoided because React Native's native clean task can run after generated codegen JNI directories have disappeared.

The current local `release` build type is signed with the debug keystore and is suitable only for internal testing. A dedicated protected upload key or EAS-managed production credential is required before external distribution. Never commit keystores or passwords.

Before distributing any build, run TypeScript, lint, all domain tests, Expo Doctor, `npm run test:release-config`, a cold start without Metro, and a data-preserving update test.

## 2026-08-27 milestone decision

The Abos & Premium, account-linked goal, dashboard, error-boundary and diagnostics milestone changes JavaScript/TypeScript and reuses existing SQLite/Supabase columns. It adds no native module, config plugin or native configuration. It is therefore compatible with the existing `1.1.0` runtime and may be delivered as an OTA update to that runtime after validation. A native `1.2.0` should be reserved for the next native/config/signing boundary rather than created solely for semantic marketing.

Prepared patch-note copy for the compatible milestone:

- Abos & Premium als eigener Produktbereich
- Konto-verknüpfte Sparziele ohne Doppelzählung
- Echte Sparzielanzeige im Dashboard
- Verbesserte Kategorisierung, Recovery und Support-Diagnose

An AAB produced by `bundleRelease` is only a technical Play-delivery candidate while the release build uses the debug keystore. Public distribution requires a protected upload key or EAS-managed credentials. Keystores, aliases and passwords remain outside Git.

Release metadata is published from **Mehr → Administration → Release-Steuerung**. This action is authorized server-side and audited. Paid billing and public store distribution remain separate milestones.
