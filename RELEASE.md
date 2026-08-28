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
