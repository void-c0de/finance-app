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
  runtime-version matching. Native generation **1.2.0 / versionCode 3**.
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
  Excel-friendly BOM/CRLF. Delivered via the Android share sheet.
- **NEXT** File-attachment export (needs `expo-sharing`, a native-boundary
  addition for the next native build); month-range picker for `/analytics`.

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
| **Export my data** (`Daten exportieren`) | read-only CSV of user-owned data via the share sheet; nothing deleted, nothing uploaded by the app | DONE (transactions Standard, rest Premium) |
| **Local device reset** | wipes the on-device SQLCipher DB only; cloud copy remains and re-syncs on next login | exists in `Daten & Datenschutz`; **kept behind a destructive confirmation** |
| **Delete cloud finance data** | server-side tombstone/removal of `finance_*` rows for the owner | **NOT built** — needs a mature, audited server RPC and a strong confirmation flow |
| **Delete account** | Supabase auth user removal (cascades `finance_*` via `ON DELETE CASCADE`) | **NOT built** — irreversible; belongs to a dedicated account-deletion milestone |
| **New-device restore** | fresh login → full pull rebuilds every synced domain in dependency order | DONE |

Rule: destructive cloud/account deletion is not implemented until its safety
model (confirmation, audit, undo window where possible) is mature. Basic
portability (export, restore) is real now.

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

## Theming

- Palettes (`system` / `light` / `dark` / `amoled`) are token maps in
  `src/theme/finance-theme.ts` selected by `useThemeStore`; screens read
  semantic tokens only. Adding a preset = adding one token map + one enum
  value; no screen changes. Accessibility-oriented basics (light/dark/AMOLED)
  are and stay free. Premium accent presets are a possible later addition and
  need no architectural work. Not building a theme marketplace.

## Release

- **DONE** 1.2.0 / versionCode 3 native metadata; runtime-boundary test guards
  against advertising a newer bundle to an older runtime.
- **PARTIAL** Native artifacts — 1.2.0 / versionCode 3 APK (~137 MB) and AAB
  (~101 MB) build locally and cold-start clean on device; both debug-signed,
  so development/internal only.
- **BLOCKED** Play upload — needs a protected upload key (`FINANCE_UPLOAD_*`) or
  EAS-managed credentials, held by the maintainer, never committed.

## Not started

- Paid billing (Google Play Billing / RevenueCat receipt verification).
- iOS.
- Multi-currency goals and budgets.
