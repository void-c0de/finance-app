# Finance App — status and plan

High-level, reality-based status. Detailed internal notes are kept privately;
this file only tracks what is shipped, partial, blocked or next. Product rules
live in [`PRODUCT.md`](./PRODUCT.md); the release contract in [`RELEASE.md`](./RELEASE.md).

Legend: **DONE** shipped and validated · **PARTIAL** usable but incomplete ·
**BLOCKED** waiting on an external dependency · **NEXT** planned.

## Foundation

- **DONE** Offline-first SQLCipher database, migrations, write-lock.
- **DONE** Supabase auth + per-user cloud sync (LWW, tombstones, cursors).
  Merge semantics are a pure, tested core (`syncMergeCore`).
- **DONE** Standalone Android release; embedded update; OTA gateway with strict
  runtime-version matching. Native generation **1.5.0 / versionCode 6** (RC1),
  targetSdk 36 (Android 16).
- **DONE** Server-authoritative Standard / Premium / Superuser, capability
  registry, coupons, admin center, release publishing, redacted diagnostics.
- **DONE** Password security (zxcvbn-ts score ≥ 3, HIBP k-anonymity, fail-closed).
- **DONE** Error boundary, structured error codes, debug-log redaction.

## Finance intelligence

- **DONE** Canonical finance math (`core/finance`) — balances, month cashflow,
  category spend; pending and own-transfers excluded consistently.
- **DONE** Pending→booked reconciliation; high-confidence internal-transfer detection.
- **DONE** Real monthly category budgets (offline-first, tombstoned, derived spend),
  dashboard remaining/over-budget summary.
- **DONE** Recurring-payment intelligence: detection + confidence-aware
  classification (subscription / bill / income / uncertain), monthly committed
  cost, next-due projection, price-drift. Dashboard + planning surfaces.
- **DONE** Persisted recurring-series domain model (`recurring_series` /
  `finance_recurring_series`, owner-scoped RLS, deterministic key = id):
  confirm / re-type / mute corrections survive restart, offline, sync and
  new-device recovery; a muted series is suppressed everywhere.
- **DONE** Financial commitments engine (confirmed / likely / uncertain
  buckets; income kept separate) and a conservative, certainty-labelled
  cashflow forecast core.
- **DONE** Attention center (`attentionCore`): one prioritized model over bank
  health, over-budget, failed sync, uncategorized, uncertain recurring.
  Dashboard "Braucht Aufmerksamkeit" card with deep links.
- **DONE** Premium forward forecast: 30/60/90-day cashflow card gated on
  `premium_analytics`; Standard keeps every recurring number.
- **DONE** Savings goals: one authoritative progress source per mode; account
  balance is the only truth for `account_balance` goals (no double count for
  own-transfers); shared display helpers; full lifecycle regression tests.
- **DONE** Dashboard 2.0 — attention card near the top, premium forecast card,
  fixed-cost / next-payment / budget / savings cards; the standalone
  "Zu prüfen" card folded into the attention center.
- **DONE** Analytics 2.0 (`analyticsCore`): month-over-month comparison
  (income / expenses / cashflow, no-baseline aware), top category changes,
  6-month category trends with slope. Premium `/analytics` screen; Standard
  keeps its current-month numbers.
- **DONE** Commitment price-change detection (strict for subscriptions, loose
  for utilities, one-off spikes ignored) and "expected payment did not appear"
  detection — grace window from the cadence, and **no alert when the bank data
  itself is stale**. Surfaced in the attention center and `/analytics`.
- **DONE** CSV export (`exportCore`): transactions (Standard), budgets /
  savings goals / recurring (Premium). Integer money, RFC-4180 escaping,
  Excel-friendly BOM/CRLF. Real file via `expo-sharing`.
- **DONE** Versioned `finance-app-backup` v2 + strict import / atomic LWW
  restore (`backupImportCore`, `backupRestoreService`). See Data portability.
- **NEXT** Month-range picker for `/analytics`; backup import conflict UI is not
  needed (deterministic merge covers it).

## Banking

- **DONE** Provider-neutral architecture; mock provider isolated from external.
- **DONE** Tink hosted-link authorization; server-side code exchange; one-shot
  account/transaction read; idempotent import; typed provider errors.
- **DONE** Re-authorization recovery UX — a consent failure marks the connection
  `requires_action` and offers reconnect without touching local history.
- **BLOCKED** Tink continuous access / server-side refresh-token lifecycle and
  consent-expiry webhooks — needs a Tink production agreement and secure server
  token storage. Sandbox is not presented as production.

## Offline & recovery

- **DONE** Offline create/update/delete for budgets, goals, contributions,
  categories, rules, connections, recurring-series corrections; reconnect is
  idempotent (tombstone revive).
- **DONE** New-device pull rebuilds accounts, transactions, categories, rules,
  budgets, goals, contributions, recurring-series and entitlements from the
  cloud. Analytics carry **no** local-only source of truth — every number
  (comparisons, trends, commitments, forecast, price changes, missed payments)
  is derived from the synced base data at read time, so nothing extra needs to
  sync and nothing derived can be lost.
- **DONE** Offline-merge proof matrix (`test-offline-matrix.mjs`): two-device +
  server simulation over the real primitives covering every create/update/
  delete/reconnect/merge scenario, plus a parent-before-child table-order guard
  for recovery.
- **DONE** Real SQL behaviour test (`test-sqlite-repo.mjs`, `node:sqlite`):
  the exact `recurring_series` (v13) and `goal_contributions` (v9) DDL, proving
  insert/update triggers, `ON CONFLICT(id)` upsert without duplication,
  tombstone + `updated_at` advance, resurrection via re-upsert, active-row
  filtering, the partial-unique idempotency index, and that a parent tombstone
  never hard-deletes children. Limitation: plain SQLite, not SQLCipher — SQL
  semantics are identical, encryption itself is not exercised here.

## Data portability

These are distinct operations with distinct safety models:

| Operation | Effect | Status |
| --- | --- | --- |
| **Logout** (`Cloud-Konto`) | ends the Supabase session; local SQLCipher data untouched; sync stops | DONE |
| **Export my data** (`Daten exportieren`) | real file (CSV/JSON) via the share sheet; nothing deleted, nothing uploaded | DONE (transactions Standard, rest Premium) |
| **Backup + restore** (`Daten & Datenschutz`) | versioned `finance-app-backup` JSON; import = strict validation → preview → atomic LWW merge (never blind replace, never resurrects a newer tombstone) | DONE |
| **Local device reset** | wipes the on-device SQLCipher rows + sync cursors only; cloud copy remains and re-syncs | DONE — typed confirmation + unsynced-change warning |
| **Delete cloud finance data** | `request_data_deletion('finance_data')` → 3-day cancellable grace → `finalize_my_due_deletion()` purges only the caller's `finance_*` rows (FK-safe), sync engine wipes local | DONE (server-authoritative, audited, lazy finalisation — no scheduler) |
| **Delete account** | as above + `finalize-account-deletion` Edge Function deletes the caller's auth user (service role) | RPC + grace + Edge Function code DONE; **Edge Function deploy is an external blocker** |
| **New-device restore** | fresh login → full pull rebuilds every synced domain in dependency order; analytics re-derived at read time | DONE |

Rule: every destructive operation is server-authoritative where it touches the
cloud, self-scoped (`auth.uid()`, no target-user argument), audited, and behind
a cancellable grace window. Nothing is deleted inside the grace window.

## Billing readiness (not billing)

- The entitlement model already carries `source: 'google_play' | 'revenuecat' |
  'store' | 'coupon' | 'admin' | 'migration' | 'superuser'` and a single
  `user_subscriptions`-shaped write path. Any future verified purchase grants
  the **same** central Premium entitlement through `hasCapability`.
- Required future flow: client purchase UI → Google Play Billing / RevenueCat →
  **server-side** receipt/webhook verification → server writes the entitlement.
  Premium is never granted because the client claims a purchase succeeded.
- Not integrated now: no safe billing test infrastructure exists and coupon /
  admin grants already deliver the product value. No fake "coming soon" UI
  beyond the one honest line on the Premium screen.
- **DONE (readiness):** `billingCore` — pure purchase-verification shapes,
  `PREMIUM_PRODUCTS` (monthly/yearly), configurable `PREMIUM_PRICING` (currently
  `null`), and `resolveEntitlement` (superuser wins; latest expiry wins;
  permanent beats dates; coupon/admin extend, never shorten). Tested. No
  dependency, no checkout.

## Freemium model

- **DONE** Stronger freemium (see PRODUCT.md). Standard: 2 budgets, 2 manual
  goals, current-month analytics, transactions CSV, four free themes.
  Premium: unlimited budgets/goals, merchant & savings automation, full
  analytics + forecast, advanced + full-backup export, six Premium themes.
- **DONE** `PRODUCT_QUOTAS` + `quotaState` (one source of truth,
  remote-config-ready), `PREMIUM_PILLARS` + `PREMIUM_GATE_COPY` (centralized,
  no dark-pattern wording — enforced by `test-product-access`).
- **DONE** Contextual gates: `PremiumSheet`, `PremiumPreviewCard`,
  `PremiumBadge`; wired into planning quick-create, budget-new, goal-new,
  themes, uncategorized, export and the dashboard (one preview card only).
- **DONE** Grandfathering + expiry: existing objects above a new limit are
  kept; no Premium capability deletes user data on expiry (rules keep
  applying, goals keep recomputing, themes fall back and restore).
- **DONE** `premiumTelemetry` — in-memory-only anonymous event model, no upload.

## Theming

- **DONE** Six Premium palettes (Ozean, Smaragd, Rosé, Violett, Graphit,
  Mitternacht) as full semantic-token maps; free System/Hell/Dunkel/AMOLED
  unchanged. `useThemeStore` keeps the preference + `lastFreeTheme`;
  `useFinanceTheme` falls back and auto-restores. Dedicated `/themes` screen
  under `Mehr → Themes` with miniature previews. `test-themes` enforces token
  completeness, finance-colour stability and WCAG contrast.
- **NEXT** Premium accent-only sub-presets; not a marketplace.

## Release

- **DONE** 1.5.0 / versionCode 6 / runtime 1.5.0 — **Release Candidate 1**.
  Native boundary = manifest hardening (`SYSTEM_ALERT_WINDOW` removed,
  `allowBackup=false`, real app label). targetSdk **already 36** — the 31 Aug
  2026 Play deadline is met with no SDK change.
- **DONE** `finalize-account-deletion` Edge Function **deployed** (server creds
  auto-provided by the Supabase Edge runtime — the earlier "manual key" blocker
  was wrong). Live-tested.
- **DONE** Web account-deletion + privacy portal live on GitHub Pages
  (`docs/` → `void-c0de.github.io/finance-app/`).
- **DONE** Play readiness docs (`RELEASE_CHECKLIST.md` et al.); CI quality gate
  (`.github/workflows/ci.yml`).
- **DONE** Signing safety gate (`verify:release-signing --expect-production`).
- **PARTIAL** Native artifacts — debug-signed APK/AAB build locally and
  cold-start clean on device; development/internal only.
- **BLOCKED** Play upload — needs a protected upload key (`FINANCE_UPLOAD_*`) or
  EAS-managed credentials, held by the maintainer, never committed.
- **BLOCKED** Play Console actions (Data Safety, Financial Features, closed test,
  IARC) — need the console.

## Not started

- Paid billing (Google Play Billing v8+ / RevenueCat receipt verification). The
  entitlement model, Premium Center and `billingCore` are architecture-ready;
  `BILLING_SERVER_CONTRACT.md` specs the Edge Functions. The client never grants
  itself Premium. No obsolete billing library is present.
- iOS.
- Multi-currency goals and budgets.
