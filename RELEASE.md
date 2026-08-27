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

## Tink banking lifecycle (2026-08-27 audit)

The mobile bundle contains only the public Tink client ID for the hosted Tink
Link flow. All confidential steps run in `supabase/functions/tink-banking`
behind a Supabase Auth JWT.

Production-ready today:

- Hosted Tink Link authorization (`link.tink.com`), redirect to `financeapp://bank/tink`.
- Server-side `authorization_code` → access-token exchange; token never returned to the app.
- One-shot read of `/data/v2/accounts` and `/data/v2/transactions`.
- Idempotent import: accounts and transactions upsert on their natural keys and
  a re-import after a tombstone revives the row (`deleted_at = NULL`); manual
  categories and merchant rules are never overwritten.
- Pending→booked reconciliation and own-transfer exclusion run on the imported data.
- Provider errors are surfaced as stable codes (`provider_authorization_failed`,
  `provider_data_failed`, …) with an optional whitelisted Tink code and request id.
- An authorization/consent failure now sets the connection to `requires_action`
  and offers "Erneut verbinden"; local accounts and transactions are preserved.

Sandbox-only / blocked on an external dependency:

- **Continuous access / token refresh** — the Edge Function does not persist a
  refresh token, so every data refresh is a fresh hosted-link authorization.
  Server-side refresh-token storage plus a `refresh:finished` webhook needs a
  Tink production agreement and a secure server token store. *Blocked: provider
  agreement + server secret storage.*
- **Server consent-expiry tracking** — there is no server record of consent
  validity; the client models health heuristically and on failed re-import.
- **Delegated `authorization-grant`** — returns 403 without console enablement;
  the hosted link is the supported mobile path and does not need it.
- `EXPO_PUBLIC_TINK_ENVIRONMENT` defaults to `sandbox`; set `production` only
  after Tink activates production Account Aggregation for the client ID and the
  Edge Function holds the corresponding production secret.

`TINK_CLIENT_SECRET` and Tink user tokens must never appear in the mobile
bundle; `scripts/publish-ota.mjs` fails the release if it finds them.

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

Without external credentials, the local `release` build type deliberately falls back to the debug keystore and is suitable only for internal testing. A dedicated protected upload key or EAS-managed production credential is required before external distribution. Never commit keystores or passwords.

For a locally protected Play upload build, keep the keystore outside the repository and provide all four values through the process environment or the untracked user-level `~/.gradle/gradle.properties` file:

- `FINANCE_UPLOAD_STORE_FILE` — absolute path to the upload keystore
- `FINANCE_UPLOAD_STORE_PASSWORD`
- `FINANCE_UPLOAD_KEY_ALIAS`
- `FINANCE_UPLOAD_KEY_PASSWORD`

Gradle switches to the upload signing config only when every value is present; partial configuration cannot silently produce a falsely production-signed build. The Play App Signing key should remain managed by Google, while this upload key remains user-held and backed up securely. Before Play submission, verify the produced AAB certificate fingerprint independently.

`./plugins/withFinanceUploadSigning` edits `app/build.gradle` during prebuild. It is a build-time config-plugin change with no runtime JavaScript effect, but by the rules above it belongs to the next native binary and must not be packaged into an OTA that claims `1.1.0` compatibility. The pure JavaScript work in the same milestone (quick-create planning, monthly budgets, dashboard budget summary) stays OTA-compatible with `1.1.0`; the signing plugin only takes effect once a native `1.2.0` (versionCode 3) is built.

Before distributing any build, run TypeScript, lint, all domain tests, Expo Doctor, `npm run test:release-config`, a cold start without Metro, and a data-preserving update test.

## 2026-08-27 milestone decision

The Abos & Premium, account-linked goal, dashboard, error-boundary and diagnostics milestone changes JavaScript/TypeScript and reuses existing SQLite/Supabase columns. It adds no native module, config plugin or native configuration. It is therefore compatible with the existing `1.1.0` runtime and may be delivered as an OTA update to that runtime after validation. A native `1.2.0` should be reserved for the next native/config/signing boundary rather than created solely for semantic marketing.

Prepared patch-note copy for the compatible milestone:

- Abos & Premium als eigener Produktbereich
- Konto-verknüpfte Sparziele ohne Doppelzählung
- Echte Sparzielanzeige im Dashboard
- Verbesserte Kategorisierung, Recovery und Support-Diagnose
- Schneller Planungs-Start über das neue Plus-Menü
- Echte Monatsbudgets mit automatischem Ausgabenfortschritt und Überschreitungswarnung

An AAB produced by `bundleRelease` is only a technical Play-delivery candidate while the release build uses the debug keystore. Public distribution requires a protected upload key or EAS-managed credentials. Keystores, aliases and passwords remain outside Git.

Release metadata is published from **Mehr → Administration → Release-Steuerung**. This action is authorized server-side and audited. Paid billing and public store distribution remain separate milestones.

## 1.2.0 / versionCode 3 — native boundary (2026-08-27)

This is a deliberate native generation, not a marketing bump. It carries the
`./plugins/withFinanceUploadSigning` config plugin (a `build.gradle` prebuild
mod) plus recurring-payment intelligence, dashboard intelligence cards and the
savings-goal lifecycle formalisation.

Runtime boundary rules for 1.2.0:

- `expo.version` is `1.2.0`; `android.versionCode` is `3`; `package.json`
  version matches. `runtimeVersion.policy` stays `appVersion`, so the runtime is
  `1.2.0`.
- A `1.1.0` device must **not** receive any of this as an OTA. The
  `expo-updates` edge function already enforces exact `expo-runtime-version`
  header matching; `npm run test:runtime-boundary` additionally asserts that the
  published `docs/api/manifest.json` never advertises a runtime newer than the
  app and that its asset URLs carry the manifest's own runtime segment.
- The OTA channel for `1.2.0` starts empty. `1.2.0` devices run the embedded
  bundle until a `1.2.0` OTA is published with `npm run publish:ota` from a JS
  build produced against the `1.2.0` binary.
- The stale `docs/updates/1.0.0` manifest stays in place; it can only ever be
  served to a hypothetical `1.0.0` client and is fail-closed for everyone else.
- If a required native upgrade must be signalled to older installs, publish an
  `app_releases` row for `android` with `minimum_native_version = "1.2.0"`;
  `requiresNativeUpgrade` then shows the blocking prompt on `1.1.0`.

Prepared German patch notes for 1.2.0:

- Abo-Erkennung: Netflix, Strom, Versicherung & Co. werden als Abo, Rechnung, Einkommen oder „unbestätigt" eingeordnet
- Fixkosten-Vorschau: nächste fällige wiederkehrende Zahlung und monatlich gebundene Kosten im Dashboard
- Konto-verknüpfte Sparziele: Kontostand ist die einzige Fortschrittsquelle, keine Doppelzählung bei Eigenüberweisungen
- Dashboard beantwortet klarer „Was passiert mit meinem Geld?" (Budgetrest, unkategorisierte Umsätze, wiederkehrende Kosten)
- Schnellerer Planungs-Start und echte Monatsbudgets aus 1.1.x bleiben erhalten

Signing status for 1.2.0 is unchanged: without `FINANCE_UPLOAD_*` the release
build falls back to the debug keystore (development artifact only). A protected
upload key or EAS-managed credential is still required before Play upload.
