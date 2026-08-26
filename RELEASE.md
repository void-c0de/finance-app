# Finance App release contract

## Runtime and OTA compatibility

- `expo.version` is the native compatibility boundary through `runtimeVersion.policy = appVersion`.
- Every native release must increment both `expo.version` and `android.versionCode`.
- JavaScript-only OTA releases keep the same app/runtime version and may target only that runtime.
- Native dependency, Expo SDK, config-plugin or native configuration changes require a new native version/runtime.
- The embedded update stays enabled as the anti-bricking fallback.
- Startup never waits for the update server. Update checks are manual and happen only after local startup.
- Do not publish an OTA built from native dependencies that differ from its target binary.

## Environments

- Mobile configuration may contain only public identifiers and publishable keys.
- Provider client secrets, Supabase service-role keys, bank credentials, signing material and tokens stay server-side or outside Git.
- Tink production access requires a provider agreement and server-side token/consent lifecycle. Sandbox/demo capability must never be presented as production connectivity.

## Android builds

Internal universal APK:

```powershell
cd android
.\gradlew.bat assembleRelease
```

Play-distribution candidate:

```powershell
cd android
.\gradlew.bat bundleRelease
```

The current local `release` build type is signed with the debug keystore and is suitable only for internal testing. A dedicated protected upload key or EAS-managed production credential is required before external distribution. Never commit keystores or passwords.

Before distributing any build, run TypeScript, lint, all domain tests, Expo Doctor, `npm run test:release-config`, a cold start without Metro, and a data-preserving update test.
