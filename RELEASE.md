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

### Financial-intelligence milestone — OTA-compatible with runtime 1.2.0 (2026-08-27)

The recurring-series domain model, commitments engine, conservative cashflow
forecast, attention center and dashboard 2.0 change only JavaScript/TypeScript
and add a **local** SQLite migration (schema v13, `recurring_series`) plus one
**forward** Supabase migration (`20260827120000_add_recurring_series.sql`,
owner-scoped RLS, applied to the linked project; `supabase db lint` clean).

- No native module, config plugin or native configuration changed. `expo-sqlite`
  is unchanged; the on-device migration runner applies v13 on first launch.
- Therefore this milestone is deliverable as an **OTA update to runtime 1.2.0**
  after validation — no `1.3.0` and no `versionCode 4`.
- The new sync table is additive; older installs simply ignore
  `finance_recurring_series` until they run this JavaScript.
- Prepared OTA patch-note copy:
  - Wiederkehrende Zahlungen bestätigen, umbenennen oder als „keine Wiederkehr" markieren – bleibt erhalten
  - „Braucht Aufmerksamkeit" bündelt Bank-, Budget- und Kategorisierungshinweise
  - Premium: 30-/60-/90-Tage-Cashflow-Prognose aus deinen Fixkosten
  - Gebundene Fixkosten sauber getrennt von unbestätigten Kandidaten

### Analytics 2.0 & Export milestone — OTA-compatible with runtime 1.2.0 (2026-08-27)

Pure JavaScript/TypeScript — no schema change, no server migration, no native
module. `analyticsCore`, `exportCore`, the price-change / missed-payment
detectors and the `/analytics` + `/export` screens run on the existing 1.2.0
binary. CSV export uses the React Native core `Share` API (already in the
binary); a file-attachment export would need `expo-sharing` and is deferred to
the next native build. Deliverable as an OTA to runtime 1.2.0. No `1.3.0`.

Prepared OTA patch-note copy:

- Analysen (Premium): Monatsvergleich, Kategorie-Trends, Abo-Preisänderungen
- „Erwartete Zahlung bisher nicht erkannt" – ohne frische Bankdaten kein Fehlalarm
- Daten exportieren: Umsätze als CSV (Standard), Budgets/Sparziele/Abos (Premium)

Signing status for 1.2.0 is unchanged: without `FINANCE_UPLOAD_*` the release
build falls back to the debug keystore (development artifact only). A protected
upload key or EAS-managed credential is still required before Play upload.

### 1.2.0 build results (2026-08-27, local, Windows)

- `npx expo prebuild --platform android` regenerated `android/` at
  `versionName 1.2.0` / `versionCode 3` with the signing plugin applied.
- `gradlew assembleRelease --rerun-tasks` → `app-release.apk` (~137 MB, universal).
- `gradlew bundleRelease --rerun-tasks` → `app-release.aab` (~101 MB), manifest `1.2.0`.
- Both artifacts are signed with the Android **debug** key
  (SHA-1 `5e:8f:16:06:2e:a3:cd:2c:4a:0d:54:78:76:ba:a6:f3:8c:ab:f6:25`) →
  **development / internal testing only. Not a Play upload.**
- The Windows file-lock on `expo-modules-core/.../classes.jar` recurs between
  consecutive `--rerun-tasks` builds. Fix: `gradlew --stop`, delete
  `node_modules/expo-modules-core/android/build`, rebuild once. Do not
  `clean assembleRelease` (RN codegen JNI race).
- Device install (`adb install -r`, data preserved) + cold start without Metro:
  Hermes and all native modules load, `expo-updates` reaches `EndStartup` with
  no OTA (correct — the 1.2.0 OTA channel is empty, embedded bundle runs),
  `ReactNativeJS: Running "main"`, no `FATAL` / native crash. UI verification
  behind the biometric app-lock is a manual step for the maintainer.

## 1.3.0 / versionCode 4 — native boundary (2026-08-27)

Deliberate native generation. It adds two native modules — **`expo-sharing`
(~57.0.16)** and **`expo-file-system` (~57.0.6, promoted to a direct
dependency)** — so real files can be written and shared. That is a true native
compatibility change, so:

- `expo.version` → `1.3.0`, `android.versionCode` → `4`, `package.json` → `1.3.0`.
- `runtimeVersion.policy` stays `appVersion`; the runtime is therefore `1.3.0`.
- The premium/themes/quota product rework, the Premium Center, the contextual
  gates and the analytics/dashboard previews are pure JS/TS and would have been
  OTA-safe for `1.2.0`, but they ship together with the native file-export in
  the `1.3.0` binary.
- A `1.2.0` device must **not** receive `1.3.0` JS: the `expo-updates` edge
  function enforces exact `expo-runtime-version` matching, and
  `npm run test:runtime-boundary` now asserts `appVersion === 1.3.0` /
  `versionCode === 4` and that `requiresNativeUpgrade('1.2.0', '1.3.0')` is
  true. Publishing an `app_releases` row with `minimum_native_version = "1.3.0"`
  shows the blocking upgrade prompt on `1.2.0`.
- The `1.3.0` OTA channel starts empty; `1.3.0` devices run the embedded bundle
  until a `1.3.0` OTA is published from a JS build made against the `1.3.0`
  binary.

Prepared German patch notes for 1.3.0:

- Premium neu gedacht: fünf klare Vorteile – Automatisieren, Verstehen, Planen, Personalisieren, Daten
- Sechs Premium-Designs (Ozean, Smaragd, Rosé, Violett, Graphit, Mitternacht); System/Hell/Dunkel/AMOLED bleiben kostenlos
- Neuer Bildschirm „Mehr → Themes" mit Vorschau
- Standard: bis zu zwei Budgets und zwei Sparziele; bestehende bleiben erhalten
- Daten exportieren als echte Datei (CSV) inklusive vollständigem Backup (Premium)
- Kontextuelle Premium-Hinweise mit echtem Bezug zu deinen Daten – ohne aufdringliche Werbung

Signing is unchanged: without `FINANCE_UPLOAD_*` the release build is
debug-signed (development artifact only).

## 1.4.0 / versionCode 5 — native boundary (2026-08-27)

Deliberate native generation. It adds one native module — **`expo-document-picker`
(~57.0.1)** — so a user can select a backup file to import. Restore is a core
trust feature (WS41 "make a deliberate next-version decision and document why"),
so:

- `expo.version` → `1.4.0`, `android.versionCode` → `5`, `package.json` → `1.4.0`.
- `runtimeVersion.policy` stays `appVersion`; the runtime is therefore `1.4.0`.
- Everything else in this milestone (backup import/restore core, Data & Privacy
  center, cloud/account deletion RPCs, billing readiness, `localDataReset`,
  `pendingSyncStatus`, the sync-engine deletion hook) is pure JS/TS and would
  have been OTA-safe for `1.3.0`, but ships in the `1.4.0` binary alongside the
  document picker.
- A `1.3.0` device must **not** receive `1.4.0` JS: `npm run test:runtime-boundary`
  now asserts `appVersion === 1.4.0` / `versionCode === 5` and that
  `requiresNativeUpgrade('1.3.0', '1.4.0')` is true. The `expo-updates` edge
  function enforces exact `expo-runtime-version` matching.
- The `1.4.0` OTA channel starts empty; `1.4.0` devices run the embedded bundle
  until a `1.4.0` OTA is published from a JS build made against the `1.4.0`
  binary.

Supabase migration `20260827160000_add_data_lifecycle.sql` was applied to the
linked project (`db push`, `db lint` clean, `migration list` parity). It only
creates functions/table; deletions run solely on explicit user action.

Update-system safety (audited, unchanged — documented here):
- Local SQLCipher startup (`runInitialBoot`) completes before any update check.
  The background update check runs only `if (phase === 'unlocked')`, so an
  unreachable update server never blocks the app opening its local data.
- `useEmbeddedUpdate: true` + `fallbackToCacheTimeout: 0` → the embedded bundle
  is always the safe fallback; a failed OTA fetch is silent and non-blocking.
- Patch notes: one `Neu in Finance <version>` dialog after a matching native
  version transition, remembered in SecureStore. Not a changelog wall.

Prepared German patch notes for 1.4.0:

- Finanz-Backup wiederherstellen: Datei prüfen, Vorschau ansehen, sicher zusammenführen
- Neuer Bereich „Mehr → Daten & Datenschutz": Backup, Import, Cloud-Sync, Reset, Löschung – klar getrennt
- Cloud-Finanzdaten oder Konto löschen – mit 3-Tage-Kulanzfenster und jederzeitiger Stornierung
- Lokaler Reset warnt jetzt, wenn Änderungen noch nicht synchronisiert sind
- Import überschreibt nie neuere Daten und stellt bewusst Gelöschtes nicht wieder her

External blockers:
- Play upload key (`FINANCE_UPLOAD_*`) — build stays debug-signed without it.
- `finalize-account-deletion` Edge Function deploy (`supabase functions deploy`
  + `SUPABASE_SERVICE_ROLE_KEY` secret). Cloud finance-data deletion is fully
  functional without it; only the auth-user row removal waits on the deploy.
