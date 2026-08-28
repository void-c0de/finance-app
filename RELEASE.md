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
- `finalize-account-deletion` Edge Function deploy — **RESOLVED in 1.5.0** (see below).

## 1.5.0 / versionCode 6 — Release Candidate 1 (2026-08-27)

Deliberate native generation. No new native module — the boundary is **native
manifest hardening** that cannot be delivered by OTA to a 1.4.0 device:

- `withReleaseHardening` config plugin removes **`SYSTEM_ALERT_WINDOW`** (Google
  Play flags the "display over other apps" permission; the app never needs it —
  it was only in the Expo template for the dev LogBox overlay) and sets
  **`android:allowBackup="false"`** (the SQLCipher DB is unreadable without the
  device-bound SecureStore key, which is never backed up — Android Auto Backup /
  device transfer would only move a useless encrypted file; the app's own backup
  + cloud sync is the sanctioned path).
- App display label is now **"Finance App"** (was the `finance-app` placeholder).
- `expo.version` → `1.5.0`, `android.versionCode` → `6`, `package.json` → `1.5.0`,
  runtime `1.5.0`. `test:runtime-boundary` asserts this and
  `requiresNativeUpgrade('1.4.0','1.5.0') === true`.

### targetSdk / Android 16 (API 36)

Verified — Finance App **already targets API 36** (merged manifest
`targetSdkVersion="36"`, APK `aapt` `targetSdk=36`, `compileSdkVersion 36`). The
31 Aug 2026 Play deadline is met with **no SDK change**. `edgeToEdgeEnabled=true`
in `gradle.properties` (Android 16 enforces edge-to-edge); `react-native-safe-area-context`
handles insets. `windowSoftInputMode=adjustResize` + `softwareKeyboardLayoutMode:resize`
preserve the "no focused textbox covered by the keyboard" invariant. Android 16
ignores `screenOrientation` locks on large screens for SDK-36 apps — acceptable,
the app is phone-first.

### Account-deletion Edge Function — deployed

`supabase functions deploy finalize-account-deletion` → **live**, `verify_jwt=true`.
Server credentials (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` / `SUPABASE_SECRET_KEYS`)
are **auto-provided by the Supabase hosted Edge runtime** — nothing manual,
nothing in Git. Caller identity from the platform-verified JWT `sub`; no request
body, no target-user argument. Live-tested: unauth → 401, wrong method → 405,
authed + no due request → 409 `not_due` (deletes nothing). The
`p_allow_account` guard (migration `20260827180000`) means only the Edge
Function finalises an `account` request; the opportunistic sync-time call
handles `finance_data` only.

### Web account deletion — live

`https://void-c0de.github.io/finance-app/konto-loeschen.html` (GitHub Pages, from
`docs/`). Publicly viewable (no login wall to see it), HTTPS, direct link.
Email/password sign-in then `request_data_deletion` / `cancel_data_deletion` via
the **publishable** key only. Verified in a real browser at the github.io origin:
module loads through the CSP, cross-origin auth works, RPC round-trips, mobile
375px layout has no horizontal scroll. Also: `datenschutz.html`, `support.html`,
`passwort-neu.html`, `index.html`.

### Signing

`npm run verify:release-signing <artifact> --expect-production` fails (exit 1) if
a candidate is debug-signed or the signature can't be read. `npm run release:android:aab`
builds the AAB. Without `FINANCE_UPLOAD_*` the artifacts stay debug-signed
(development only) — the gate makes that impossible to miss.

### Play readiness docs

`RELEASE_CHECKLIST.md`, `PLAY_DATA_SAFETY.md`, `PLAY_FINANCIAL_FEATURES.md`,
`STORE_LISTING.md`, `CLOSED_TEST_CHECKLIST.md`, `PRIVACY_DATA_MAP.md`,
`SCREENSHOT_PLAN.md`, `REAL_USER_QA.md`, `BILLING_SERVER_CONTRACT.md`.

### Billing

No Google Play Billing Library present → the "PBL v8 by 31 Aug 2026" deadline
does **not** apply. `billingCore` holds the verification shapes + precedence;
`BILLING_SERVER_CONTRACT.md` specifies the future Edge Functions. Premium Center
shows `formatPriceLine(PREMIUM_PRICING)` — honest "prices follow" until configured.

Prepared German patch notes for 1.5.0:

- Konto- und Datenlöschung jetzt auch im Browser: void-c0de.github.io/finance-app
- „Über anderen Apps anzeigen"-Berechtigung entfernt – die App braucht sie nicht
- Auto-Backup deaktiviert: dein Gerätespeicher bleibt privat, Wiederherstellung läuft über Cloud-Sync und das App-Backup
- Superuser: Übersicht offener Löschanträge
- Kleinere Verbesserungen an Erststart-Hinweisen

External blockers (only these):
1. Play upload keystore (`FINANCE_UPLOAD_*`) → for a Play-signable AAB.
2. Play Console access → Data Safety / Financial Features transcription, AAB
   upload, closed-test setup, IARC rating.
3. Legal fields in `docs/datenschutz.html` (`[BITTE ERGÄNZEN]`).
4. Tink production agreement → only to leave sandbox; not a store blocker.

## RC2 — 1.5.0 / versionCode 6 (unchanged), pure JS/server/web/CI (2026-08-28)

**No native boundary.** `versionName`, `versionCode` and `runtimeVersion` stay
`1.5.0` / `6` / `1.5.0`. Everything below is OTA-compatible with a 1.5.0 device;
an RC2 OTA is prepared but not published.

- **Demo data mode** (`/demo`, `__DEV__ || Superuser`): deterministic synthetic
  dataset (3 accounts, ~128 tx / 6 months, budgets, goals, price-change) written
  via `applyRestore`; `clearDemoData` tombstones only `demo-` rows.
- **`app_debug_logs` retention: 14 days** — `prune_my_debug_logs` (self-scoped,
  lazy at sync) + `admin_prune_debug_logs`. Migration `20260828120000`.
- **Admin**: deletion-request panel + **audit-log viewer** (metadata only,
  action-prefix filters).
- **Analytics month range** 3 / 6 / 12 / 24 (Premium); trend-correctness edge
  cases tested (empty months, deleted category, huge integers).
- **Multi-currency**: `FINANCE_BASE_CURRENCY = EUR`; foreign-currency
  transactions no longer pollute income/expense/cashflow; foreign accounts
  partitioned and labelled on the dashboard. No FX conversion.
- **Billing server** (deployed): migration `20260828140000`
  (`billing_subscriptions`, token stored SHA-256 only, `apply_verified_subscription`
  merge with never-shorten precedence), Edge Functions `verify-purchase`
  (`not_configured` 501 until Google creds) + `billing-webhook`. `src/services/billing.ts`
  wrapper — never grants Premium locally. No billing client library added.
- **Support diagnostic bundle**: `Mehr → Daten & Datenschutz → Diagnose für
  Support erstellen` — redacted text, safety-checked, shared as a file.
- **Transaction list windowed** (40 rows + "Weitere anzeigen") — no freeze at
  10k+. `test:perf-scale` proves the pure cores stay <20 ms at 40k tx.
- **Core resilience**: `test:resilience` + an `isUsable()` guard in `analyticsCore`.
- **iOS build readiness**: `ios.bundleIdentifier` `com.nocta-xz.financeapp`,
  Face ID Info.plist string, SQLCipher confirmed on iOS, `eas.json` simulator
  profile, `.github/workflows/ios-unsigned.yml` (macOS-26 runner). See the RC3
  section below for the verified IPA artifact.
- **iOS privacy manifest** (`app.json → ios.privacyManifests`): `NSPrivacyTracking`
  false, no tracking domains; collected data types = email / other financial
  info / other diagnostic data (all linked, none tracking, App-Functionality
  only); Required-Reason APIs `C617.1` / `E174.1` / `35F9.1` / `CA92.1`. No ATT
  prompt, no IDFA. `test:ios-config` asserts all of it. Source of truth:
  `APPLE_APP_PRIVACY.md`. Future App Store prep: `IOS_RELEASE_CHECKLIST.md`,
  `APPLE_EXPORT_COMPLIANCE.md`, `APPLE_REVIEW_CHECKLIST.md`, `APP_STORE_LISTING.md`,
  `TESTFLIGHT_CHECKLIST.md`.

## RC3 — 1.5.0 / versionCode 6 (unchanged), release convergence (2026-08-28)

**No native boundary.** CI + docs + tooling only. `versionName` / `versionCode` /
`runtimeVersion` stay `1.5.0` / `6` / `1.5.0`.

- **iOS unsigned build workflow** (`.github/workflows/ios-unsigned.yml`) hardened
  with a deep verification step that logs, on the real compiled `.app`:
  `CFBundleIdentifier` (`com.nocta-xz.financeapp`), architectures (`arm64`),
  `LC_ENCRYPTION_INFO` cryptid, `PrivacyInfo.xcprivacy` presence, SQLCipher
  symbols (`sqlite3_key` / codec) in the `expo-sqlite` module, embedded
  frameworks. Artifact: **`FinanceApp-ios-unsigned.ipa`** (was
  `FinanceApp-unsigned.ipa`), 7-day retention, **no Apple credentials in CI**.
- **`npm run ios:unsigned`** — dispatches that workflow and streams progress;
  **`npm run ios:unsigned:info`** — shows the last run + artifact. Token comes
  from the local git credential helper; nothing Apple-related is transmitted.
- **Verified IPA artifact** (run 33159727525): `FinanceApp-ios-unsigned.ipa`,
  18.2 MB, `arm64`, `CFBundleIdentifier com.nocta-xz.financeapp`, `1.5.0 (6)`,
  `MinimumOSVersion 16.4`, unsigned (`LC_ENCRYPTION_INFO_64 cryptid 0` → ready to
  re-sign), **SQLCipher compiled in** (`_exsqlite3_key_v2` symbol in the binary),
  `PrivacyInfo.xcprivacy` at the app root with aggregated module manifests, Face
  ID string present. SHA-256 `c833342e…dce80b7c` (per build).
- **Blocker burn-down**: full `src/` scan — zero `TODO`/`FIXME`/`HACK`/
  `NOT_IMPLEMENTED`/stub markers. `MockBankProvider` is the deliberate sandbox
  provider (Tink production is contract-blocked). No dead navigation.
- Android device re-verified (SM-S938B / Android 16), 35/35 suites, tsc, lint,
  expo-doctor 21/21, secret guard clean.
- **CI unchanged** (green). `DEPENDENCY_AUDIT.md`: 12 moderate npm-audit entries
  are build-tooling only (`@expo/config-plugins → xcode → uuid`), no runtime
  exposure, no safe fix without an SDK downgrade.

3 migrations pushed this milestone (`20260828120000`, `20260828140000`), db lint
clean, parity 13/13. 3 Edge Functions deployed/updated.

## RC4 — 1.5.0 / versionCode 6 (unchanged), dual-platform convergence (2026-08-28)

**No native boundary.** JS + one additive migration + one Edge Function redeploy
+ CI/docs. `versionName` / `versionCode` / `runtimeVersion` stay `1.5.0` / `6` /
`1.5.0`.

- **iOS Tink banking** — the hosted `link.tink.com` browser flow is the correct
  architecture (no native SDK). New `tinkCallbackCore.ts` (pure, `test:tink-callback`):
  mandatory `state` nonce in the authorize URL, `WebBrowser.openAuthSessionAsync`
  (iOS `ASWebAuthenticationSession`) with the deep-link route as cold-start
  fallback, callback classification (`exchange` / `cancelled` / `error` /
  `state_mismatch` / `idle`), one-shot SecureStore nonce (replay protection),
  provider errors → bank-connection health status. Cancel leaves no broken record.
- **Currency-safe budgets & goals (no FX)** — `buildMonthlyCategorySpending`
  takes a `baseCurrency`; a foreign-currency transaction can't consume a EUR
  budget. `savingsRuleCore.ts`: rule-based goal contributions require a currency
  match. Linking a EUR goal to a non-EUR account is blocked (`canLinkAccountToGoal`).
  No schema change — Budget is implicitly base-currency, `SavingsGoal.currency`
  already existed.
- **`app_store` billing provider** — migration `20260828160000` (additive: widen
  the `source` / `provider` CHECKs + the `apply_verified_subscription` guard).
  `verify-purchase` redeployed with an isolated `verifyWithAppStore` →
  `not_configured` (501) until `APP_STORE_ISSUER_ID` / `_KEY_ID` / `_PRIVATE_KEY`
  are set. New `billingClient.ts`: provider-neutral `BillingClient` interface +
  `nullBillingClient` (no native adapter yet, honest "not available"). One
  entitlement resolver, no per-platform Premium.
- **IPA Windows handoff** — `npm run ios:unsigned:download` / `:prepare` pull and
  verify the artifact (SHA-256, `Payload/*.app`, `Info.plist`, Mach-O) into
  `.artifacts/ios/` (gitignored); detect AltServer / Sideloadly / iTunes.
- New docs: `RELEASE_ARTIFACTS.md`, `IOS_PHYSICAL_QA.md`, `store-assets/` +
  `npm run screenshots:android` (deep-link capture; refuses on a real email/IBAN
  in the UI; never bypasses the OS lockscreen).
- `Platform.OS` audit: no silent iOS no-op. 37/37 suites, tsc, lint, expo-doctor
  21/21, secret guard clean. 1 migration pushed (`20260828160000`), db lint
  clean, parity **14/14**. `verify-purchase` redeployed.

## RC5 — 1.5.0 / versionCode 6 (unchanged), physical-device bridge (2026-08-28)

**No native boundary.** Local dev tooling + docs + tests only.

- **Windows↔iPhone diagnosis** (`npm run ios:device:doctor`, read-only): Apple
  Mobile Device Service + Bonjour healthy, AltServer 1.7.4, PC and phone on one
  `192.168.178.0/24` — but **no `usbaapl64.sys`, zero Apple USB enumeration ever
  (`setupapi.dev.log`), no lockdown pairing record, nothing on `_apple-mobdev2._tcp`,
  `pymobiledevice3` sees no device**. Verdict `NEVER_CONNECTED_USB_PAIRING_REQUIRED`.
  Cableless first-pairing on iOS ≤ 26 is **not possible**; one USB "Trust" is
  required (no iTunes UI), then everything is Wi-Fi. `IOS_WINDOWS_WLAN_BRIDGE.md`.
- **`npm run ios:ipa:serve`** — LAN HTTP: info page, `/source.json` (private
  AltStore source), `/FinanceApp.ipa`. Exact-path routing, 404 default, no repo
  root; "download ≠ install" stated in the UI.
- **`npm run ios:device:status | logs | open`** — `pymobiledevice3` wrappers
  (iOS version / Developer Mode / app installed; syslog like `adb logcat`;
  SpringBoard launch). Degrade cleanly with no device. No Apple-ID, no signing.
- `.tools/` isolated venv (`pymobiledevice3` 11.1.6), gitignored. `.gitignore` +
  `guard:secrets` now block Apple trust/signing material.
- **Store screenshots**: Android emulator (`Medium_Phone_API_36.0`, API 36)
  boots and runs the release APK — SQLCipher migrations 6→13 apply on x86_64,
  no crash. Clean data-free surfaces captured to `store-assets/android/raw/`
  (Dashboard empty-state, Themes, Data & Privacy, Premium). Data-rich surfaces
  need a debug build (`__DEV__` opens `/demo`).
- 38/38 test suites (new `test:ios-tooling`), tsc, lint, expo-doctor 21/21,
  secret guard clean. No Supabase change. No Android/iOS native change.

## RC6 — 1.6.0 / versionCode 7 / runtime 1.6.0 — NATIVE BOUNDARY (2026-08-28)

**Deliberate native generation.** New native module `expo-iap@5.4.0` (OpenIAP:
Google Play Billing **9.1.0** / StoreKit 2 — verified in the built AAB via
`com.google.android.play.billingclient.version`) + Expo SDK 57 patch convergence
(`expo` 57.0.18, `expo-constants` 57.0.16, `expo-font` 57.0.2, `expo-updates`
57.0.19). `expo.version` 1.5.0 → 1.6.0, `android.versionCode` 6 → 7,
`ios.buildNumber` "7", `runtimeVersion.policy = appVersion` → runtime 1.6.0.
Not OTA-deliverable to a 1.5.0 device.

### Billing client

- `src/services/billing/purchaseStateMachine.ts` — pure, 12 phases. `verified`
  is reachable **only** via `VERIFY_OK` (= server-confirmed). Cancel ≠ error.
  `pending` unlocks nothing. `verification_failed` → retry / restore path.
  `test:purchase-state-machine`.
- `src/services/billing/productConfig.ts` — store product IDs from
  `EXPO_PUBLIC_PREMIUM_MONTHLY_ID` / `EXPO_PUBLIC_PREMIUM_YEARLY_ID`. **No fake
  IDs.** Both unset → `not_configured` (no crash, keeps "Preise folgen").
  `test:product-config`.
- `src/services/billing/expoIapAdapter.ts` — `BillingClient` over `expo-iap`.
  Flow: native purchase → unified token (iOS JWS / Android purchaseToken) →
  `handoffToServer` (`verify-purchase`) → `apply_verified_subscription`
  (service role) → entitlement refetch → **only then** UI Premium.
  `finishTransaction` (Play acknowledge) runs **only after** a successful server
  verify. Never touches `productAccess`. `deferred-payment`/`pending` → not premium.
- `src/services/billing/registerBilling.ts` — registers the adapter at boot
  **only if** product IDs are configured; otherwise `nullBillingClient` stays.
  `expo-iap` is dynamically imported so a no-store build never touches it.
- `src/stores/usePurchaseStore.ts` — drives the machine (`loadProducts` / `buy`
  / `restore` / `retryVerification`).
- `premium.tsx` — real subscribe card with store-localized prices + "Käufe
  wiederherstellen" when configured; the honest "Preise folgen" + coupon path
  otherwise. No fake countdowns / discounts / scarcity.

### Server (unchanged, already correct)

`verify-purchase` v2 (deployed, `verify_jwt=true`): JWT-derived caller identity,
platform + product whitelist, `sha256('${platform}:${token}')` stored (no raw
token), `verifyWithGooglePlay` / `verifyWithAppStore` isolated and returning
`not_configured` (501) until Google/Apple server credentials exist. No RC6
schema change — `billing_subscriptions` + `apply_verified_subscription` already
handle `google_play` / `app_store` / `revenuecat`.

### Manifest

`expo-iap` adds `com.android.vending.BILLING` to the Android manifest (required
for Play Billing; moved from the `test:android-permissions` FORBIDDEN list to the
ALLOWED list in RC6, enforced against the built APK). No iOS capability or
Info.plist entry needed; StoreKit.framework is OS-provided.

### Verified builds

- **Android** (local, `assembleRelease bundleRelease --rerun-tasks`): APK + AAB,
  `com.nocta_xz.financeapp`, versionName 1.6.0 / versionCode 7, targetSdk 36 /
  minSdk 24, `allowBackup=false`, SQLCipher (`sqlcipher_*` in
  `libexpo-sqlite.so`), Play Billing 9.1.0, deep links (`https` App Links +
  `financeapp://`). `test:android-permissions` green against the APK.
  `verify:release-signing --expect-production` correctly **fails** (debug-signed —
  intended until `FINANCE_UPLOAD_*`).
- **iOS** (CI `ios-unsigned.yml` run `33178550618`, all steps green): `arm64`,
  `LC_ENCRYPTION_INFO_64 cryptid 0` (unsigned), `com.nocta-xz.financeapp`,
  CFBundleShortVersionString 1.6.0 / CFBundleVersion 7, MinimumOSVersion 16.4,
  `_exsqlite3_key_v2 T` in the app binary, `PrivacyInfo.xcprivacy` at the app
  root, `openiap` pod 3.3.0 (`openiap-versions.json` in the bundle), no Apple
  credentials in the workflow. IPA SHA-256
  `ec3036cae71f8f9151a9bfc77fa32ad2a8dad3f60daff59066d8ffbaeb555cf6`.

### External blockers (unchanged, precisely bounded)

Real Play/App Store products + Google service-account key + App Store Server API
key (`.p8`) are still external. Until then billing is `not_configured` and
Premium continues via coupon / admin. **No real store purchase was tested** —
that needs Play Console / App Store Connect access.

## RC7 — 1.6.0 / versionCode 7 / runtime 1.6.0 (UNCHANGED) — server + JS only

**No native boundary.** RC7 is Edge Functions + JS + tests + docs + SQL
migrations — all compatible with the shipped 1.6.0 native runtime. `expo-iap`,
`app.json`, `package.json` deps unchanged. No Android/iOS rebuild, no OTA
published. Version deliberately **not** bumped (RC number ≠ app version).

### Server purchase verification — now real

- `verify-purchase` rewired onto real verifiers in `supabase/functions/_shared/`:
  - **Google Play** — RS256 JWT-bearer OAuth2 → `purchases.subscriptionsv2.tokens.get`
    → normalized subscription. Timeouts / AbortController / full error taxonomy.
  - **App Store** — verify the signed transaction JWS against **Apple Root CA - G3**
    (real x5c chain check, pinned root, validity windows) + App Store Server API
    `getAllSubscriptionStatuses` for authoritative status.
  - Both return `not_configured` (501) until their Function secrets are set —
    never a fake success. Deployed + live-tested (401 / 400 / 501, no leakage).
- `billing-webhook` rewritten: Apple App Store Server Notifications V2
  (JWS-verified), Google RTDN (OIDC- or shared-token-authenticated, re-verifies
  with the provider API — a notification is a trigger, not truth), RevenueCat.
  Idempotent via `billing_webhook_events`.

### DB (migrations 15-17, additive, `db lint` clean, 17/17 parity)

`billing_subscriptions` provider-identity + environment columns;
`billing_webhook_events` + `record_billing_event()`; `apply_verified_subscription`
gains a **first-verified-account-wins** replay guard and an out-of-order guard.
`deletion_grace_interval()` search_path pinned (db-advisor 0011 cleared). RC7
functions are correctly `REVOKE`d from `authenticated` (not in the advisor list).

### Client

`usePurchaseStore.resetForAccountChange()` on sign-out (no stale purchase UI /
entitlement across accounts) + `reconcileSilently()` — one silent boot-time pass
that recovers an interrupted verification. No dialog, no loop.

### Tink

`tinkConnectionLifecycle.ts` formalises the connection state machine and the hard
invariant: **only an explicit user disconnect may tombstone imported data** — no
provider / consent / error event ever deletes accounts or transactions.
Production Tink remains an external blocker (Sandbox only).

### Release engineering

`npm run release:doctor` (PASS / WARNING / NOT CONFIGURED / EXTERNAL BLOCKER /
FAIL overview), `npm run check:legal` (production-submission gate — closed while
any `[BITTE ERGÄNZEN]` remains), `legal/legal.config.json` + `npm run build:legal`
(fill-once → rendered pages), `npm run build:release-manifest`
(`store-assets/release-manifest.json`). New: `PLAY_IARC_PREP.md`.

### Tests: 41 → 49 suites

`test:google-verify`, `test:apple-verify`, `test:store-verification`,
`test:subscription-lifecycle`, `test:webhook-auth`, `test:tink-lifecycle`,
`test:legal-metadata`, `test:release-doctor`. `test:billing-server` rewritten.

## RC8 — 1.6.0 / versionCode 7 / runtime 1.6.0 (UNCHANGED) — signing + release enablement

**No native module change, no runtime boundary.** RC8 is a config-plugin fix +
release tooling + docs + a JS-only OTA of the accumulated client delta. Version
deliberately **not** bumped — versionCode 7 has never been uploaded to Play, so
it stays 7 for the first upload (Phase 5).

### Production signing — fixed and proven

`plugins/withFinanceUploadSigning.js` previously matched only
`signingConfig signingConfigs.debug` (space form). RN 0.86 writes
`signingConfig = signingConfigs.debug` (`=` form), so the regex **silently did
not apply** — even with all four `FINANCE_UPLOAD_*` set, the release AAB would
have been debug-signed. **Fixed:** both syntaxes handled; the plugin now
`throw`s if it cannot find the anchor. Verified with an **ephemeral throwaway
keystore** (generated in a gitignored temp path, random password, deleted after):
`assembleRelease` with `FINANCE_UPLOAD_*` set → APK signed by a non-debug cert,
`verify:release-signing --expect-production` **passed**; same build with the vars
unset → debug-signed. `npm run check:upload-signing` refuses a partial (1–3 of 4)
config loudly instead of falling through to debug.

### Release tooling

- `npm run release:doctor` (2.0) — distinguishes **ENGINEERING PASS** from
  **REAL PROVIDER PASS**; reads `store-assets/release-evidence.json` for the
  "real" facts. `--fast` / `--json`.
- `npm run release:evidence` — flips booleans in `release-evidence.json` as
  milestones are really verified; refuses secret-looking values.
- `npm run validate:aab` — structural AAB validation (zip members, ABIs,
  SQLCipher) + optional bundletool; writes `store-assets/aab-validation.json`.
- `npm run build:play-icon` — exact 2:1 box downscale of `assets/images/icon.png`
  → `store-assets/play-icon-512.png` (512², verified).
- `npm run check:upload-signing` — the pre-build signing gate.
- Docs: `ANDROID_RELEASE_READINESS.md` (crash/ANR/pre-launch audit),
  `store-assets/SPEC-feature-graphic.md` (1024×500 design task),
  `store-assets/SPEC-bundletool.md`. `CLOSED_TEST_CHECKLIST.md` +
  `REAL_USER_QA.md` updated (12/14 rule gates production only, not the closed
  test; billing test steps).

### Tests: 49 → 51 suites

`test:signing-gate`, `test:release-evidence`. `test:release-doctor` rewritten.

### External state (unchanged from RC7 — nothing configured)

No Google service account, no Play Console access, no product IDs, no upload
keystore, no Apple credentials, no Tink production, no EAS token. Every
"REAL PROVIDER PASS" is `false`. RC8 completed all **engineering** around the
first real Google Play roundtrip; the roundtrip itself is credential-blocked.

### OTA

The RC7 client delta (billing recovery + account-switch reset + Tink lifecycle)
is JS-only and native-compatible with the shipped 1.6.0 binary → published as an
OTA to the `1.6.0` runtime channel (`docs/api/manifest.json` +
`docs/updates/1.6.0/`, served by the `expo-updates` Edge Function). The config-
plugin fix is **not** in the OTA (build-time only). The embedded RC6 bundle
remains the anti-brick fallback.
