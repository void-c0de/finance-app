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

Premium is currently a real entitlement granted by coupon, administrator or the Superuser override. Paid recurring billing is deliberately not presented until a legitimate Play Billing/RevenueCat integration exists. A future billing provider must write into the same `user_subscriptions` model.

## Server authority

- `profiles.role` is the durable role. The legacy `is_superuser` value was used only to migrate the existing authorized account.
- Mobile role caching exists only for offline UX. Every admin mutation is checked again inside a `SECURITY DEFINER` PostgreSQL function.
- Direct client writes to profiles, subscriptions, coupons, redemptions, releases and audit records are not allowed.
- RLS limits reads to the current user or Superuser where appropriate.
- Admin actions create safe `admin_audit_log` entries without secrets.

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
