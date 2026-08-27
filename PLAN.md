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
- **DONE** Savings goals: one authoritative progress source per mode; account
  balance is the only truth for `account_balance` goals (no double count for
  own-transfers); shared display helpers; full lifecycle regression tests.
- **PARTIAL** Dashboard intelligence — balance, cashflow, budgets, savings,
  recurring, uncategorized review are live. NEXT: bank-attention card,
  progressive disclosure pass.
- **NEXT** Premium-only recurring depth (multi-month forecast, subscription
  export) behind `premium_analytics`; basic visibility stays free.

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
  categories, rules, connections; reconnect is idempotent (tombstone revive).
- **DONE** New-device pull rebuilds accounts, transactions, categories, rules,
  budgets, goals, contributions and entitlements from the cloud.
- **PARTIAL** Systematic offline-merge test matrix — merge core and pending
  reconciliation are covered; a full per-entity offline simulation is NEXT.

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
