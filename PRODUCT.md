# Product access and administration

## Product philosophy

The free tier is a genuinely good entry-level finance app. Premium is the
version that **automates, analyses, personalises and scales** for people who
actively manage their money. Premium *enhances*; it does not hold the user's own
financial truth hostage.

The executable source of truth is `PRODUCT_CAPABILITIES` and `PRODUCT_QUOTAS` in
`src/services/entitlementCore.ts`. Every screen calls `hasCapability` /
`quotaState`; nothing authorises by email, plan label or an ad-hoc local
boolean.

### Standard

| Area | Standard scope |
| --- | --- |
| Banking | Connected accounts, transactions, balances, background sync |
| Transactions | Full history, search, **manual categorization and corrections** |
| Dashboard | Current-month income / expenses / cashflow, balances, attention center |
| Budgets | Up to **2** active budgets |
| Savings goals | Up to **2** active manual goals |
| Recurring | Detected recurring items, the committed fixed-cost total, the next expected payment, **and persistent manual corrections** |
| Analytics | Current-month summary and category breakdown |
| Export | Transactions CSV |
| Themes | System, Light, Dark, AMOLED — free forever |
| Security | Everything: SQLCipher, biometric lock, HIBP, zxcvbn, redaction, RLS |
| Sync / recovery | Full cloud sync and new-device recovery |

### Premium (`premium_analytics`, `advanced_planning`, `advanced_category_rules`, `advanced_exports`, `full_finance_export`, `premium_themes`)

| Pillar | Premium value |
| --- | --- |
| **Automatisieren** | Reusable merchant/category rules; account-linked and transaction-rule savings automation |
| **Verstehen** | Month-over-month comparison, multi-month category & commitment trends, abo price-change detection, the full missed-payment analysis on `/analytics`, 30/60/90-day cashflow forecast |
| **Planen** | Unlimited budgets and savings goals; advanced automated planning |
| **Personalisieren** | Six Premium themes (Ozean, Smaragd, Rosé, Violett, Graphit, Mitternacht) |
| **Daten** | Budgets / savings / recurring CSV; a versioned full finance-backup JSON |

Superuser inherits every Premium capability from the role and never needs an
artificial expiry. Superuser *operational* functionality (admin, coupons,
entitlements, releases, diagnostics) is never behind a Premium check.

### Quotas — one source of truth

`PRODUCT_QUOTAS` holds `{ standard, premium }` limits (`Infinity` = unlimited).
`quotaState(access, key, used)` returns `{ limit, used, remaining, reached,
unlimited, grandfathered }`. Screens show `used / limit` early (never a silent
disabled button) and open a contextual `PremiumSheet` at the limit. The shape is
deliberately remote-config-ready; nothing hardcodes a number in a component.

### Grandfathering existing users

A Standard user who already has **more** budgets or goals than the new limit
keeps every one of them — `quotaState` reports `grandfathered: true`. Existing
objects stay fully accessible and editable; only creating *additional*
premium-limited objects needs Premium. No object is ever chosen for deletion.

### Premium expiry — nothing is deleted

| Capability | On expiry |
| --- | --- |
| Merchant rules | Stay stored **and keep applying**; the rules screen stays usable for viewing / toggling / deleting; new rules need Premium |
| Account-linked / rule savings goals | Configuration and progress persist; the goal keeps recomputing |
| Advanced analytics | Underlying transaction data stays; the `/analytics` screen locks to the preview |
| Advanced / full export | Data stays; the export actions lock |
| Premium themes | The preference is **kept**; the app falls back to the user's last free theme and restores the Premium theme automatically when Premium returns |

Financial history and user decisions are never removed on downgrade.

### Monetization ethics (actually enforced)

- **Contextual, not spammy.** Premium surfaces appear only where a real limit is hit or a feature is opened. The persistent `Mehr → Abos & Premium` is the one deliberate destination. `test-product-access` asserts no gate copy contains urgency/scarcity/shaming wording.
- **Value before price.** `PREMIUM_GATE_COPY` and `PREMIUM_PILLARS` lead with what Premium *does* for this user. There is no price-first messaging and no purchase button until Play billing can be verified server-side.
- **Personalised previews use real local data only** (e.g. "your largest change vs. last month is <category>"), and never reveal the full paid result.
- **No dark patterns:** no fake countdowns, discounts, scarcity, confirm-shaming, hidden cancellation, misleading financial warnings, fake savings numbers, fake AI, preselected purchases or hard-to-dismiss upsells.
- **Security is never an upsell.** Every security and privacy feature is Standard.

A future billing provider (`google_play` / `revenuecat`) must verify the receipt
server-side and write the same central entitlement; the client never grants
itself Premium.

## Savings-goal tracking

There is exactly one authoritative progress source per tracking mode. The
account balance and the contribution ledger are never summed:

| Mode | Authoritative progress | Availability |
| --- | --- | --- |
| `manual` | `starting_amount + Σ active contributions` | Standard |
| `transaction_rule` | `starting_amount + Σ active contributions` (auto-created, idempotent on `source_transaction_id`) | Premium |
| `account_balance` | active linked account `balance_minor`, clamped at 0 | Premium |

- Standard users can create up to two active manual goals (`activeManualGoals` quota), add corrections and see progress on the dashboard. Existing goals above a new limit are grandfathered.
- Premium users get unlimited goals and can additionally link a goal to a real imported account or configure transaction automation.
- In `account_balance` mode the active linked account balance is the only authoritative progress value. Manual and automatic contribution rows are ignored for progress (the goal detail screen also hides the contribution actions), so no money is ever double-counted.
- **Own-transfer savings ("Notgroschen on Sparkonto"):** this is deliberately solved by `account_balance` authority, not a second ledger. A Giro→Sparkonto transfer is flagged `isInternalTransfer` and excluded from spending and income analytics; the Sparkonto balance rises by exactly the transferred amount, and an `account_balance` goal linked to that account follows the balance. Re-import or reconnect is idempotent because the balance — not a derived event — is the source. Transfer-triggered contribution rows are intentionally not created.
- `transaction_rule` matches only booked, non-transfer **incoming** transactions by keyword; a self-transfer never creates a rule contribution.
- If a linked account is unavailable or tombstoned, the last known amount remains visible (`source: 'last_known'`) and the configuration is not silently changed.
- Negative linked balances resolve to zero savings progress; balances above the target remain numerically visible above 100% while the progress bar stays bounded. `goalProgressPercent` / `goalProgressBarPercent` are the single shared display helpers used by dashboard, planning and goal detail.
- Advanced configurations remain stored after a downgrade. Existing financial history is never destroyed; creating or changing Premium automation requires Premium.
- Superuser inherits every Premium capability from the role and never needs an artificial subscription expiry.

Future paid sources (`google_play`, `revenuecat`) are supported by the client model but are not sold or simulated. Their eventual server ingestion must validate store receipts before writing the same entitlement model.

## Planning and monthly budgets

- The Planning header owns one extensible quick-create entry point. It currently exposes only complete flows: savings goals and monthly category budgets.
- A monthly budget is stored offline first and synchronized through the existing `finance_budgets` tombstone/LWW path.
- Spending is derived from the same monthly finance truth used by dashboard and planning insights: booked expenses in the selected category. Pending transactions and detected own-account transfers are excluded.
- Manual category corrections and merchant rules automatically affect the derived budget because no parallel spending ledger is stored.
- Progress is intentionally allowed above 100%; the bar remains visually bounded while the percentage and negative remaining amount preserve the real over-budget state.
- Removing a budget creates a tombstone instead of hard-deleting synchronized state.
- The dashboard budget card summarizes all monthly budgets: total remaining this month, or the number of exceeded budgets when spending is over. It reuses the same derived spending, so it never disagrees with the Planning detail view.

## Recurring payments and subscriptions

- `recurringInsightsCore` is a single pure leaf module: it detects, groups, classifies and forecasts recurring transactions and is the only source of recurring numbers for dashboard and planning.
- Every recurring group is classified as `subscription`, `bill`, `income` or `uncertain`, each with a `high` / `medium` / `low` confidence and a cadence. Data that is only "regular and stable" but has no recognisable name stays `uncertain` — it is never reported as a certain subscription.
- Internal transfers and pending transactions are always excluded; a self-transfer is never a subscription.

### Persisted user corrections

- `recurring_series` (local) / `finance_recurring_series` (owner-scoped RLS) stores the user's DECISION about a series — confirmed kind, changed kind, or "this is not a recurring payment" (`muted`). It never duplicates transaction truth.
- The row's primary id **is** the deterministic `recurringSeriesKey(accountId, currency, direction, merchant)`. Two devices correcting the same series therefore produce one row; the sync conflict resolves via `ON CONFLICT(id)` + last-writer-wins, and the correction survives restart, offline use, reconnect and new-device recovery like every other tombstoned entity.
- A manual correction always overrides the heuristic: a `muted` series disappears from every recurring surface **and** `is_recurring` stops being re-flagged on its transactions (an existing flag is cleared). A confirmed series is treated as `high` confidence regardless of the heuristic.
- Corrections are quick actions in the Planning "Wiederkehrende Kosten" list (confirm / re-type / not recurring / let the heuristic decide). Uncertain candidates stay visually distinct from confirmed truth. All of this is a Standard capability.

### Commitments and forecast

- `buildMonthlyCommitments` splits recurring expenses into `confirmed`, `likely` (high-confidence subscription/bill) and `uncertain`. "Committed" = confirmed + likely; uncertain candidates are shown but never counted as committed. Recurring income is tracked separately and never nets against fixed costs.
- `buildCashflowForecast` is deliberately conservative: it projects only future recurring occurrences inside the horizon, labels each `known` / `likely` / `uncertain`, and never estimates discretionary spending. It exposes `projectedAfterKnown` and `projectedAfterLikely` (uncertain excluded). The dashboard states plainly that this is not a guaranteed month-end balance.
- The forward 30/60/90-day forecast card is Premium (`premium_analytics`, Superuser inherits). Standard keeps every recurring number, the committed-cost total and the next due payment. If Premium expires, only the projection card disappears; the persisted `recurring_series` corrections and all history remain.

### Price changes and missed payments

- `detectCommitmentPriceChanges` compares the latest amount against the **median of prior amounts** (not just the previous one, so one-off spikes are ignored). Thresholds are confidence-aware: a small stable step counts for a subscription; only large, clear shifts count for a bill or utility, where amount variability is normal. Never presented as certain when the evidence is a single jump.
- `detectMissedRecurring` flags a series whose expected next payment is past its grace window (derived from the historical cadence) with no matching charge. It requires ≥ 3 occurrences and a still-active series, and it produces **no signal at all when the bank data itself is stale** (newest booked transaction older than the freshness limit) — a bank that has not synced is never mistaken for a cancelled subscription. The wording is always "erwartete Zahlung bisher nicht erkannt", never "gekündigt".

## Analytics

- `analyticsCore` is a pure leaf: month-over-month comparison and multi-month category trends. All rules match the rest of the app — booked only, internal transfers excluded, refunds (negative expenses) reduce the sum, integer minor units, manual categorisation and recurring overrides respected.
- "No data" is distinct from "zero": `hasBaseline` / `hasEnoughData` gate every comparison, and no percentage is produced when the previous month was zero.
- Standard keeps the current-month truth it already has (dashboard, planning). The `/analytics` screen — historical comparison, trends, price changes, missed payments — is Premium (`premium_analytics`). Premium expiry hides the screen; no user data or correction is deleted.

## Export and data portability

- `exportCore` produces CSV from **user-owned data only**: transactions, budgets, savings goals, recurring series. No tokens, sessions, provider credentials, secret IDs, raw provider payloads or debug data. Integer-only money formatting; RFC-4180 escaping; UTF-8 BOM + CRLF so Excel reads umlauts.
- Transactions CSV is a Standard capability (basic portability of your own data is never paywalled). Budgets / savings goals / recurring export is `advanced_exports` (Premium).
- Delivery is a real file written to the app cache plus the Android share sheet (`expo-sharing`). The app never uploads an export anywhere; the privacy note on the screen says so. The temp file is best-effort deleted after sharing.

## Backup, restore and deletion

Four operations, four distinct safety models. They are never conflated in the UI (`Mehr → Daten & Datenschutz`).

- **Backup erstellen** — `full_finance_export` (Premium). A versioned `finance-app-backup` JSON (**v2**: accounts, transactions, categories, category rules, budgets, savings goals, goal contributions, recurring series, bank-connection *metadata*, plus per-row sync timestamps). Contains **no** passwords, sessions, JWTs, refresh/Tink/provider tokens, Supabase secrets, SQLCipher keys or SecureStore contents. v1 files stay importable.
- **Backup importieren** — free. `backupImportCore.inspectBackup` treats the file as untrusted: byte-size cap, JSON parse guard, format/version check, per-row field validation (id pattern, enum, ISO timestamp, **safe-integer money only**, string-length cap), duplicate-id rejection, required-FK integrity (broken → reject, never partial), optional-FK sanitised to null, prototype-pollution rejection. Then a preview (counts) before any write.
- **Restore semantics** — a **merge**, never a blind replace. `backupRestoreService.applyRestore` runs one `withExclusiveTransactionAsync`; any failure rolls the whole thing back. Per row it applies last-writer-wins against the local state (`shouldApplyIncomingRow` semantics): an older backup row never overwrites a newer local row, and **never resurrects a newer local tombstone**. Restored rows keep their original backup `created_at`/`updated_at` so LWW stays correct against the cloud on the next sync. Bank connections are restored as `status = 'requires_action'` metadata only — an import never restores a bank authorisation.
- **Lokale Daten zurücksetzen** — clears only the on-device SQLCipher rows and sync cursors. Cloud copy and account are untouched; a configured sync rebuilds the device on next run. `countUnsyncedChanges()` (mirrors the push predicate exactly) is shown first and **warns before unsynced local changes are lost**.
- **Cloud-Finanzdaten löschen** / **Konto löschen** — server-authoritative, available **in app and on the web** (`void-c0de.github.io/finance-app/konto-loeschen.html` — publicly viewable, HTTPS, authenticated action). `request_data_deletion()` opens a **3-day cancellable grace window**; nothing is deleted during it. After it lapses, `finalize_my_due_deletion()` (called opportunistically at sync start — no scheduler, free-tier only) purges only the caller's `finance_*` rows in FK-safe order and the sync engine then wipes the local DB so the same run cannot re-upload deleted data. An `account` request is finalised **only** by the deployed `finalize-account-deletion` Edge Function (`p_allow_account` guard), which also removes the `auth.users` row via the auto-provided service credential — no manual secret. Every function is `SECURITY DEFINER`, `search_path` pinned, `anon` revoked, and accepts **no target-user argument**. Typed `LÖSCHEN` / `ZURÜCKSETZEN` confirmation — safety friction, not confirm-shaming.
- New-device recovery derives every analytic (comparisons, trends, commitments, forecast, price changes, missed payments, budget/goal progress) at read time from synced base data — nothing derived needs to sync and nothing derived can be lost.

## Attention center

- `attentionCore` is one pure, deterministic model over the independent "needs attention" concepts: bank-connection health, over-budget categories, a failed cloud sync, uncategorized expenses and uncertain recurring candidates.
- Items are prioritized `critical` → `action_required` → `review` → `informational`. Transient harmless states (`temporarily_unavailable`) never escalate past `informational`; a `revoked` bank connection is `critical`.
- The dashboard surfaces the top three near the top of the feed with a priority-coloured accent; each item deep-links to its recovery screen. Connection health never hides or deletes historical transactions.
- Action-critical alerts (bank revoked / consent expired / reconnect, over-budget, failed sync, uncategorized) are **always Standard** — safety is never paywalled. A missed-recurring nudge ("erwartete Zahlung bisher nicht erkannt") is also Standard because it is a review-level "did you forget to check something" prompt, not deep analysis. The full price-change / missed-payment / trend analysis lives on the Premium `/analytics` screen and never blocks a critical alert.

## Themes

- Palettes live in `src/theme/finance-theme.ts` as complete semantic-token maps; `FINANCE_THEMES` carries the metadata (`tier`, label, description, preview). Components read tokens only — no `theme === 'x'` branching.
- Free forever: **System, Hell, Dunkel, AMOLED**. AMOLED and accessibility are never behind Premium.
- Premium: **Ozean, Smaragd, Rosé, Violett, Graphit, Mitternacht** — genuinely distinct dark palettes, not just an accent swap. Finance colours (`positive` green, `negative` red, `warning` amber) stay stable and readable in every theme; `test-themes` enforces this plus WCAG contrast (main text ≥ 7:1, secondary ≥ 3:1).
- Dedicated `Mehr → Themes` screen (`/themes`) with per-theme miniature previews. A Standard user tapping a Premium theme gets a contextual `PremiumSheet`.
- `useThemeStore` keeps the real preference *and* `lastFreeTheme`. `useFinanceTheme` renders `lastFreeTheme` when a Premium theme is selected without Premium and restores the Premium theme automatically when the entitlement returns — the preference is never deleted.

## Local product metrics

- `premiumTelemetry` is an **in-memory-only** anonymous event counter model (`premium_preview_opened`, `premium_gate_opened`, `theme_premium_tapped`, …). Nothing is uploaded and no personal behaviour leaves the device. It exists so a future privacy-reviewed telemetry layer has a defined event vocabulary; today it is only the model.

## Offline and sync guarantees

- Every synchronized entity — categories, rules, accounts, bank connections, budgets, savings goals, contributions, recurring-series corrections and transactions — uses the same rules: explicit id-conflict upsert (never `INSERT OR REPLACE` in a sync path), last-writer-wins on the server `updated_at`, and tombstones instead of hard deletes.
- The engine's conflict rule is: **the last device to synchronize wins**, deterministically. Pull applies last-writer-wins on `updated_at`; `deleted_at` is an ordinary column subject to the same rule, so a later update legitimately un-deletes a row and a later tombstone legitimately wins.
- `scripts/test-offline-matrix.mjs` proves create/update/delete offline, remote-update-while-offline, local-delete-vs-remote-update (both orders), tombstone-behind-cursor propagation, pull idempotency and new-device reconstruction without resurrecting deleted rows. It also guards the parent-before-child table order used during recovery.

## Server authority

- `profiles.role` is the durable role. The legacy `is_superuser` value was used only to migrate the existing authorized account.
- Mobile role caching exists only for offline UX. Every admin mutation is checked again inside a `SECURITY DEFINER` PostgreSQL function.
- Direct client writes to profiles, subscriptions, coupons, redemptions, releases and audit records are not allowed.
- RLS limits reads to the current user or Superuser where appropriate.
- Admin actions create safe `admin_audit_log` entries without secrets.

## Password security on the free tier

- Supabase Auth remains the authentication provider.
- New passwords must contain at least 12 characters and reach zxcvbn-ts score 3 or 4. Long passphrases are explicitly supported; arbitrary uppercase/number/symbol recipes are not required.
- Before signup or password change, the app computes SHA-1 locally and queries the free HIBP Pwned Passwords range endpoint with only the first five hexadecimal hash characters.
- The returned suffix list is compared locally. Raw passwords, full hashes and suffixes are never sent to HIBP, stored or logged.
- HIBP requests use response padding. A temporary HIBP/network failure fails closed for signup and password changes with a retry message; existing sign-in remains available.
- `validatePasswordSecurity` is the single entry point used by signup and password changes. Future authentication UI must use the same service.

This protects every official app authentication flow. Supabase's paid leaked-password feature would additionally enforce policy against a malicious client calling Auth directly; the free-tier app cannot install that hosted Auth hook. This limitation is documented rather than hidden.

## Coupon semantics

- Codes are normalized to uppercase and constrained to 4–32 safe characters.
- Redemption is atomic and locks the coupon row before checking usage.
- A user cannot redeem the same coupon twice.
- Disabled, expired and exhausted coupons are rejected server-side.
- Active Premium is extended from `max(now, current expiry)` and is never shortened.
- Superuser Premium is an authorization override and does not use an artificial far-future expiry.

## Billing readiness (not billing)

- `billingCore` is the pure, dependency-free contract for a future purchase flow. No billing library is integrated and there is **no checkout** — `PREMIUM_PRICING` is `null` and the Premium screen shows an honest "prices follow with the store release" line.
- `resolveEntitlement` is the deterministic precedence rule across every source (`superuser`, `coupon`, `admin`, `google_play`, `revenuecat`, `store`, `migration`): the Superuser role wins outright; otherwise the candidate with the **latest** expiry wins and `permanent` beats any date — so a coupon or admin grant can only ever extend a running paid term, never shorten it. `mergePurchaseExpiry` mirrors the server-side coupon rule.
- The authoritative rule is unchanged: a client purchase claim is not an entitlement. Only a server-verified `user_subscriptions` row grants Premium. `PurchaseVerificationRequest`/`Result` and `PREMIUM_PRODUCTS` (monthly/yearly) are shaped so a future Play Billing / RevenueCat → Edge-Function verification path drops in without an architecture change.
- `scripts/test-billing-readiness.mjs` covers the precedence combinations (coupon→paid, paid→coupon, admin↔coupon order-independence, permanent, superuser, expired/revoked) and purchase-request validation.

## Store readiness (Play)

- **targetSdk 36** (Android 16) — verified in the merged manifest and the APK.
  Meets the 31 Aug 2026 Play requirement with no SDK change.
- **Permissions minimised**: INTERNET, ACCESS_NETWORK_STATE, USE_BIOMETRIC /
  USE_FINGERPRINT, VIBRATE, and legacy storage capped at `maxSdkVersion 32`.
  `SYSTEM_ALERT_WINDOW` is stripped by the `withReleaseHardening` plugin;
  `test:android-permissions` enforces the allowlist against the built APK.
- **`allowBackup=false`**: the encrypted DB is useless without the device-bound
  key, so Auto Backup / device transfer would only move a broken state. The
  app's own backup + cloud sync is the path.
- **No third-party analytics / advertising / crash SDK** (dependency-scanned).
  No advertising ID.
- **Account deletion**: in app **and** on the web, data actually deleted (not
  deactivated), 3-day cancellable grace only. Deletion URL and privacy URL are
  live on GitHub Pages.
- **Data Safety** and **Financial Features** answers are prepared as
  source-of-truth docs (`PLAY_DATA_SAFETY.md`, `PLAY_FINANCIAL_FEATURES.md`):
  account aggregation (read-only, via Tink) = yes; banking / payments / lending
  / investing / crypto = no.
- **No billing library** → the PBL v8 deadline does not apply yet. `billingCore`
  + `BILLING_SERVER_CONTRACT.md` make the future path drop-in; the client never
  grants itself Premium.
- **Signing**: `verify:release-signing --expect-production` blocks a debug-signed
  candidate. Remaining external blockers: the upload keystore and Play Console
  access.

## Update product flow

- Local SQLCipher startup never waits for update infrastructure.
- After unlock, the app performs one background check; repeated checks are limited to a six-hour interval.
- Compatible OTA updates are fetched and offered for reload.
- Native minimum-version rules and store/download URLs are separate from OTA compatibility.
- Release metadata and patch notes come from `app_releases` and are published only through a Superuser RPC.
- Patch notes for the installed native release are shown once and remembered in SecureStore.
- Network failure is silent and never blocks cached finance data.

## Verification

`supabase/tests/product_entitlements.sql` is a rollback-only live integration test covering duplicate use, expiry, disabled coupons, maximum uses and Premium extension. It leaves no test rows behind.

The same rollback suite also proves that a normal authenticated user cannot create coupons, grant Premium, publish releases, read the admin audit log, change their role or insert their own subscription. The real Superuser account is never downgraded for testing.

`supabase/tests/data_lifecycle.sql` is the equivalent rollback-only test for deletion: it proves the grace window is ~3 days, that finalisation is a no-op during the window, that a user cannot see or cancel another user's request (RLS), that a non-superuser cannot sweep or list requests, and that a backdated (due) request finalises to `completed` with no `finance_*` rows left for that owner. It always rolls back.
