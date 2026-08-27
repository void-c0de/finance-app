# Product access and administration

## Plans and capabilities

The app resolves access centrally through `ProductAccess` and `hasCapability`; screens must not authorize by email or by an ad-hoc local boolean.

| Capability | Standard | Premium | Superuser |
| --- | --- | --- | --- |
| Accounts, transactions, balances, sync and security | Yes | Yes | Yes |
| Manual categories and basic planning/goals | Yes | Yes | Yes |
| Advanced category-rule automation | Preview | Yes | Yes |
| Advanced planning, analytics and exports | No | Yes | Yes |
| Coupon, entitlement and release administration | No | No | Yes |

The executable source of truth is `PRODUCT_CAPABILITIES` in `src/services/entitlementCore.ts`. Product surfaces call `hasCapability`; they do not infer authorization from plan labels.

Standard keeps every part of the user's own financial truth: accounts, transactions, manual categorization, the intelligent dashboard, basic monthly budgets, manual savings goals, and **basic visibility of confidently detected recurring payments** (classification and the next due payment). Premium (`premium_analytics`, `advanced_planning`, `advanced_category_rules`, `advanced_exports`) enhances rather than unlocks: reusable merchant rules, account-linked / rule-based savings goals, advanced recurring forecasting and comparisons, and exports. Superuser inherits every Premium capability from the role. A capability is never authorized client-side only, and never by a hardcoded identity.

Premium is currently a real entitlement granted by coupon, administrator or the Superuser override. Paid recurring billing is deliberately not presented until a legitimate Play Billing/RevenueCat integration exists. A future billing provider must write into the same `user_subscriptions` model.

Manual categorization of individual transactions remains a Standard capability. Premium users can turn a reviewed assignment into a reusable merchant rule for future transactions. Existing rules and manual assignments remain active after Premium expires; only creating and managing additional rules is locked. Financial history and user decisions are therefore never removed on downgrade.

## Savings-goal tracking

There is exactly one authoritative progress source per tracking mode. The
account balance and the contribution ledger are never summed:

| Mode | Authoritative progress | Availability |
| --- | --- | --- |
| `manual` | `starting_amount + Σ active contributions` | Standard |
| `transaction_rule` | `starting_amount + Σ active contributions` (auto-created, idempotent on `source_transaction_id`) | Premium |
| `account_balance` | active linked account `balance_minor`, clamped at 0 | Premium |

- Standard users can create manual goals, add corrections and see progress on the dashboard.
- Premium users can additionally link a goal to a real imported account or configure transaction automation.
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

- `recurringInsightsCore` is a single pure leaf module: it detects, groups and classifies recurring transactions and is the only source of recurring numbers for dashboard and planning.
- Every recurring group is classified as `subscription`, `bill`, `income` or `uncertain`, each with a `high` / `medium` / `low` confidence and a cadence. Data that is only "regular and stable" but has no recognisable name stays `uncertain` — it is never reported as a certain subscription.
- Internal transfers and pending transactions are always excluded; a self-transfer is never a subscription.
- A future manual correction (`manualKindByKey`) always overrides the heuristic. Basic visibility of confidently detected recurring items stays a Standard capability; advanced forecasting is Premium (`premium_analytics`).
- The dashboard shows the monthly committed recurring spend and the next due recurring payment (with an "unbestätigt" hint for low confidence). Planning lists the upcoming recurring expenses with their classification and price-drift.

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
