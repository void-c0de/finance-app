# Billing server contract (readiness, not billing)

The client never grants itself Premium. A purchase claim becomes an entitlement
only after the **server** verifies it. This file defines the contract so the
verification layer can be added later without touching the client's capability
model.

Status (2026-08-28, RC6): **server architecture built and deployed; native store
client (`expo-iap`) IMPLEMENTED; store calls stubbed pending credentials; no store
products created, no real purchase tested.** `billingCore.ts` holds the pure shapes
and precedence rules; the server side below is real code; the client adapter below
is real code that is only registered when `EXPO_PUBLIC_PREMIUM_*_ID` are set.

### RC6 — native client adapter (IMPLEMENTED, NOT store-tested)

- `expo-iap@5.4.0` (OpenIAP: `openiap-google` = Play Billing 8.x, `openiap-apple`
  = StoreKit 2). Config plugin, native boundary → app 1.6.0 / versionCode 7.
- `src/services/billing/expoIapAdapter.ts` — `BillingClient` impl. Purchase flow:
  native `purchaseUpdatedListener` → `tokenOf(purchase)` (unified `purchaseToken`)
  → `handoffToServer({ platform, productId, purchaseToken })` → **only** on
  `{ ok: true }` does it `finishTransaction()` and only then does
  `usePurchaseStore` refetch entitlements. `purchaseState === 'pending'` returns
  `{ kind: 'pending' }` and unlocks nothing. User cancel → `{ kind: 'cancelled' }`,
  never surfaced as an error.
- `src/services/billing/productConfig.ts` — env-driven, **no hard-coded store IDs**.
  Missing config → `[]` → `isBillingConfigured()` false → adapter not registered →
  UI keeps the honest "Preise folgen" state.
- `src/services/billing/purchaseStateMachine.ts` — pure reducer, 12 phases;
  `verified` is reachable **only** via `VERIFY_OK` (server confirmation).
  Tests: `test:purchase-state-machine`, `test:product-config`, plus new static
  guards in `test:billing-server`.
- `src/services/billing/registerBilling.ts` — dynamic `import()` of the adapter,
  only when configured; never blocks boot; failure degrades to null client.

### Built and live

- **Migration `20260828140000`**: `user_subscriptions.source` now allows
  `google_play` / `revenuecat`. New `billing_subscriptions` table stores provider
  state — **purchase tokens only as SHA-256** (`UNIQUE(provider, token_sha256)`
  for idempotency), never in the clear. `apply_verified_subscription(...)`
  (SECURITY DEFINER, service-role only, not a client API) is the single merge
  point → `user_subscriptions` → `get_my_product_access`. Deterministic
  precedence: a store term never shortens a longer coupon/admin term; `permanent`
  wins; superuser untouched. Audited as `billing.verified` (no token in metadata).
  `admin_list_billing_subscriptions()` for the superuser (metadata only).
- **Edge Function `verify-purchase`** (deployed, `verify_jwt=true`): JWT identity,
  product whitelist, token-shape check, then `verifyWithGooglePlay()` — an
  **isolated** function that returns `not_configured` (HTTP 501) until
  `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` + `GOOGLE_PLAY_PACKAGE_NAME` are set. On a
  real verification it calls `apply_verified_subscription` and returns a fresh
  access snapshot. Live-tested: unauth→401, bad product→400, valid shape→501.
- **Edge Function `billing-webhook`** (deployed, `verify_jwt=false`): Google
  RTDN (Pub/Sub push token) or RevenueCat (shared secret) auth; RTDN
  `notificationType` → status map incl. `revoked` / `expired`; calls
  `apply_verified_subscription`. Returns `not_configured` (200 ack) until a
  secret is set. Live-tested.
- **Client** `src/services/billing.ts`: `verifyPurchase(input)` → invokes the
  Edge Function, normalises the returned access, **never grants Premium locally**.
- Tests: `scripts/test-billing-server.mjs` (static guards) +
  `supabase/tests/billing.sql` (rollback-only: precedence, idempotency,
  non-superuser denial).

### Still needed (external)

1. Fill in `verifyWithGooglePlay()` (the OAuth2 service-account token + the
   `purchases.subscriptionsv2.tokens.get` call) — the shape and the DB write are
   done, only the ~30 lines that talk to Google remain.
2. ~~Add a v8+ Play Billing client~~ — **DONE (RC6)**: `expo-iap` (Play Billing
   8.x via `openiap-google`).
3. Play Console products + Google Cloud service account + Pub/Sub topic + the
   Function secrets. Set `EXPO_PUBLIC_PREMIUM_MONTHLY_ID` /
   `EXPO_PUBLIC_PREMIUM_YEARLY_ID` to the real product IDs in the build env.

## Components

```
Client (Play Billing v8+ / RevenueCat)
  └─ purchaseToken ──▶ Edge Function: verify-purchase
                          ├─ Google Play Developer API  (purchases.subscriptionsv2.get)
                          │   or RevenueCat REST v2
                          ├─ validate: package, product, purchase state, expiry
                          └─ upsert public.user_subscriptions (source='google_play')
Google/RevenueCat RTDN / webhook ──▶ Edge Function: billing-webhook
                          └─ renew / expire / revoke / refund → user_subscriptions
Client ──▶ RPC get_my_product_access()  (unchanged, already authoritative)
```

## `user_subscriptions` already supports this

The table (migration `20260826234500`) has `plan`, `status`
(`active|trial|expired|cancelled|granted|inactive`), `source`
(`none|coupon|admin|store|migration`; add `google_play`, `revenuecat` via a
one-line CHECK migration), `premium_started_at`, `premium_expires_at`,
`permanent`. `get_my_product_access()` reads it as-is. No client change.

## Edge Function: `verify-purchase` (to build)

Input (POST, `verify_jwt=true`): `{ platform, productId, purchaseToken }`.
Steps:
1. `jwtSub(token)` → caller id (same pattern as `finalize-account-deletion`).
2. `isWellFormedPurchaseRequest` (from `billingCore`) — reject early.
3. Call the store API with a **server-held service account** (see secrets below).
4. Verify: package == `com.nocta_xz.financeapp`, product ∈ `PREMIUM_PRODUCTS`,
   `purchaseState == purchased`, not `paused/on_hold`, `expiryTime` in future.
5. `mergePurchaseExpiry(existingExpiry, ...)` — never shorten a running term.
6. `upsert user_subscriptions` (`source='google_play'`, `status` from store).
7. Return `get_my_product_access()`.

Idempotent on `purchaseToken` (store one `linkedPurchaseToken` per user to
detect upgrades/downgrades).

## Edge Function: `billing-webhook` (to build)

- Google: Pub/Sub push (Real-time developer notifications). Verify the message,
  fetch the subscription, apply `SUBSCRIPTION_RENEWED/EXPIRED/REVOKED/CANCELED`.
- RevenueCat: signed webhook → apply `INITIAL_PURCHASE/RENEWAL/CANCELLATION/EXPIRATION/BILLING_ISSUE`.
- `verify_jwt=false` for this function; authenticate by the platform's own
  signature/shared secret instead.

## Secrets (server only — never Git, never client)

| Name | Where | Used by |
| --- | --- | --- |
| `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` | Supabase Function secret | `verify-purchase`, `billing-webhook` |
| `PLAY_RTDN_PUBSUB_VERIFICATION_TOKEN` | Supabase Function secret | `billing-webhook` |
| (`REVENUECAT_WEBHOOK_SECRET`, `REVENUECAT_API_KEY`) | optional | RevenueCat path |

`SUPABASE_SERVICE_ROLE_KEY` is already auto-provided to Edge Functions.

## External blockers (all outside code)

1. Google Play Console: create the app, a subscription with monthly + yearly
   base plans, product IDs `premium.monthly` / `premium.yearly`
   (must match `PREMIUM_PRODUCTS`).
2. Google Cloud: a service account with "View financial data" + Play Developer
   API access; download its JSON key → set as the Function secret.
3. Enable Real-time developer notifications (Pub/Sub topic) in Play Console.
4. ~~Add a Play Billing Library v8+ client~~ — **DONE (RC6)**: `expo-iap@5.4.0`
   ships Play Billing 8.x (`openiap-google`), which clears the v7-blocked-from
   31 Aug 2026 deadline. `expo-in-app-purchases` was explicitly **not** used.

## App Store (RC4 — added)

- `verify-purchase` accepts `platform: 'app_store'`; `verifyWithAppStore()` is an
  isolated branch that returns `not_configured` (501) until
  `APP_STORE_ISSUER_ID` / `APP_STORE_KEY_ID` / `APP_STORE_PRIVATE_KEY` (App Store
  Server API key) are set. Real impl outline is in the function comment.
- Migration `20260828160000` widened `user_subscriptions.source`,
  `billing_subscriptions.provider` and the `apply_verified_subscription` guard to
  include `app_store` — additive, `db lint` clean, parity 14/14.
- Same `apply_verified_subscription` merge → same central entitlement. A verified
  purchase on either platform produces account-level Premium.

## Client interface (RC4 — added)

`src/services/billingClient.ts` — provider-neutral `BillingClient`
(`queryProducts` / localized prices / `purchase` / `restorePurchases`). Ships as
`nullBillingClient` (honest "not available"). **RC6:** the `expo-iap` adapter
(`expoIapAdapter.ts`, Play Billing 8.x + StoreKit 2) registers via
`registerBillingClient()` when `EXPO_PUBLIC_PREMIUM_*_ID` are set; otherwise the
null client stays and the UI is unchanged. `handoffToServer()` is the only path
to Premium — the adapter never touches `productAccess`.

## Client-side rule (enforced today)

`resolveEntitlement` (billingCore): superuser wins; else the candidate with the
latest expiry wins; `permanent` beats any date. So a store purchase, a coupon
and an admin grant coexist deterministically and the longest one always wins.
It is **source-agnostic** — `google_play`, `app_store`, `revenuecat`, `coupon`,
`admin` all flow through the same function. `scripts/test-billing-readiness.mjs`
covers this.
