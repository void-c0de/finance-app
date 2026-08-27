# Privacy data map — where every piece of data lives

Engineering reference for the data lifecycle. Pairs with `PLAY_DATA_SAFETY.md`
(Play form) and `docs/datenschutz.html` (user-facing).

## On-device only (no cloud account)

| Store | Contents | Encryption | Cleared by |
| --- | --- | --- | --- |
| SQLCipher DB `finance.db` | all finance domain rows | SQLCipher (AES), key from SecureStore | `wipeLocalFinanceData()` / uninstall |
| SecureStore (`expo-secure-store`) | DB key, Supabase session, product-access cache, theme preference, seen-release marker | Android Keystore-backed | uninstall / OS |
| SharedPreferences | Expo/RN runtime prefs (non-sensitive) | none | uninstall. **Excluded from Auto Backup**; `allowBackup=false`. |
| App cache | transient export/backup files | none | best-effort delete after share; OS cache eviction |

## Cloud (only when a Supabase account is connected)

| Table / service | Contents | Scope | Deleted by |
| --- | --- | --- | --- |
| `auth.users` | email, hashed password, timestamps | the user | `finalize-account-deletion` Edge Function |
| `profiles` | role (`user`/`superuser`) | the user | cascade on `auth.users` delete |
| `finance_accounts/transactions/categories/category_rules/budgets/savings_goals/goal_contributions/recurring_series` | synced finance data | `owner_id = auth.uid()` (RLS) | `purge_owner_finance_data()` |
| `finance_bank_connections` | institution id/name, status, is_demo — **no tokens** | owner | `purge_owner_finance_data()` |
| `user_subscriptions` | Premium plan/source/expiry | the user | purge + finalize |
| `coupon_redemptions` | which coupon, when, resulting window | the user | cascade on `auth.users` delete (kept during finance-only deletion as anonymised history) |
| `app_debug_logs` | redacted technical log lines | owner | `purge_owner_finance_data()` |
| `finance_deletion_requests` | request kind, timestamps, status | the user | cascade on `auth.users` delete |
| `admin_audit_log` | operational events (`deletion.requested/finalized`, coupon ops) — **no finance content**, actor + target uuid only | superuser-readable | retained as an audit trail |

## Third parties

| Party | Data | Direction | Notes |
| --- | --- | --- | --- |
| Tink AB | bank account + transaction data, consent | bank → Tink → app (server-side code exchange) | read-only (AIS). **Sandbox** now. No credentials/tokens on device. |
| Have I Been Pwned | first 5 hex chars of SHA-1(password) | app → HIBP | k-anonymity; password never sent |
| GitHub (Pages) | HTTP request logs for the website | browser → GitHub | standard web server logs, GitHub-controlled |
| Supabase | everything in the "Cloud" table above | app ⇄ Supabase | processor; EEA region [confirm] |

## Never collected

Advertising ID · device fingerprint · location · contacts · photos/media library
· SMS/call log · installed-apps list · biometric templates (handled by the OS;
the app only gets a yes/no) · any third-party analytics event.

## Retention

- Local: until deletion or uninstall.
- Cloud finance data: until deletion request + 3-day grace, then purged.
- `admin_audit_log`: retained (no finance content). [Set an explicit max age if desired.]
- `app_debug_logs`: [set an explicit TTL, e.g. 30 days, via a scheduled purge or a `created_at` filter — currently unbounded].

## Open items

- [ ] Confirm Supabase project region and, if outside the EEA, the transfer basis.
- [ ] Add a TTL/cleanup for `app_debug_logs`.
- [ ] Fill the `[BITTE ERGÄNZEN]` fields in `docs/datenschutz.html`.
