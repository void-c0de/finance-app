# Billing server contract (readiness, not billing)

The client never grants itself Premium. A purchase claim becomes an entitlement
only after the **server** verifies it. This file defines the contract so the
verification layer can be added later without touching the client's capability
model.

Status (2026-08-28, RC7): **server verification is now a real implementation**
(Google Play Developer API + Apple App Store Server API / JWS), returning
`not_configured` (501) until provider credentials are set — never a fake success.
Native client + purchase state machine IMPLEMENTED. No store products created,
**no real purchase tested** (needs Play Console / App Store Connect access).
`billingCore.ts` holds the pure client shapes; `supabase/functions/_shared/` the
server verification domain.

### RC7 — real server verification (IMPLEMENTED, not credential-configured)

- `supabase/functions/_shared/googlePlay.ts` — RS256 JWT-bearer OAuth2
  (`scope androidpublisher`) → `purchases.subscriptionsv2.tokens.get` → normalized
  `VerifiedStoreSubscription`. `AbortController` timeouts, one token mint per
  invocation, full provider-error classification (401/403/404/410/429/5xx/timeout/
  malformed). `test:google-verify` (state + error matrix vs a mock fetch).
- `supabase/functions/_shared/appStore.ts` + `appleJws.ts` + `x509.ts` — verify
  the client's signed transaction JWS against **Apple Root CA - G3** (real x5c
  chain: leaf signs payload, chain links, pinned root fingerprint, validity
  windows — no decode-and-trust), then call `getAllSubscriptionStatuses` for the
  authoritative status and verify those JWS too. ES256 `appstoreconnect-v1`
  bearer. `test:apple-verify` builds a real openssl chain and proves every
  tamper is rejected.
- `supabase/functions/_shared/storeSubscription.ts` / `subscriptionLifecycle.ts`
  — provider-neutral lifecycle (`active` / `grace_period` / `billing_retry` /
  `paused` / `cancelled_active` / `expired` / `revoked` / `pending`), the
  entitlement rule (`lifecycleGrantsPremium`), the DB-status mapping, and
  documented Google↔Apple differences. `test:store-verification`,
  `test:subscription-lifecycle`.
- `supabase/functions/_shared/googleOidc.ts` — verify Google-issued Pub/Sub OIDC
  identity tokens (RS256 vs JWKS, iss/aud/email/exp) for RTDN authentication.
  `test:webhook-auth`.
- `supabase/functions/_shared/observability.ts` — structured billing logs that
  redact tokens / receipts / JWS / keys / PII.

### RC7 — webhook / notification architecture

- `billing-webhook` rewritten (deployed, `verify_jwt=false`):
  - **Apple** App Store Server Notifications V2 — `signedPayload` JWS verified,
    then `signedTransactionInfo` / `signedRenewalInfo` verified, user looked up by
    `provider_original_transaction_id`.
  - **Google** RTDN — authenticated by a Google OIDC bearer token *or* a
    `?token=` shared secret; the notification is a **trigger** → the server
    re-verifies with `verifyGooglePlayPurchase` and only then applies state.
  - **RevenueCat** — shared-secret header.
  - Every event is deduplicated in `billing_webhook_events`
    (`record_billing_event`, `UNIQUE(provider, event_id)`); an out-of-order event
    never overwrites newer state.
- Live-tested: Apple bogus JWS → 401 `signature_invalid`; Google no-auth → 401/200
  `unauthenticated`; RevenueCat no secret → 200 `not_configured`; bad JSON → 400.

### RC7 — DB (migrations 20260828180000 + repair + 20260828182000)

- `billing_subscriptions` gains `provider_transaction_id`,
  `provider_original_transaction_id` (+ partial index), `environment`
  (`production|sandbox`), `cancellation_reason`, `last_event_at`. Additive.
- `billing_webhook_events` idempotency ledger + `record_billing_event()`
  (service-role only).
- `apply_verified_subscription` — new signature (drops the RC4 8-arg version),
  adds a **first-verified-account-wins** replay guard (a second Finance account
  cannot claim a token / original-transaction owned by the first →
  `subscription_owned_by_other_account`, surfaced as HTTP 409) and an
  out-of-order guard.
- `db lint` clean; `db advisors --type security` — the RC7 functions are NOT in
  the "signed-in users can execute" list (correctly `REVOKE`d). 17/17 migration
  parity. `supabase/tests/billing.sql` exercises the replay + idempotency guards
  (rollback-only, run against the live DB).

### Legacy status (RC4-RC6, still true)

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

### Still needed (external only — all code is done)

1. ~~Fill in `verifyWithGooglePlay()`~~ — **DONE (RC7)**: real OAuth2 + API call
   in `_shared/googlePlay.ts`.
2. ~~Fill in `verifyWithAppStore()`~~ — **DONE (RC7)**: real JWS chain + App Store
   Server API in `_shared/appStore.ts` + `appleJws.ts` + `x509.ts`.
3. ~~Add a v8+ Play Billing client~~ — **DONE (RC6)**: `expo-iap` (Play Billing
   9.1.0 via `openiap-google`).
4. **Google:** a Play Console subscription with `premium.monthly` / `premium.yearly`
   base plans; a Google Cloud service account (View financial data + Play Developer
   API); a Pub/Sub topic for RTDN. Set the Function secrets
   `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` + `GOOGLE_PLAY_PACKAGE_NAME`,
   `GOOGLE_PUBSUB_SA_EMAIL` (or `PLAY_RTDN_VERIFICATION_TOKEN`).
5. **Apple:** the paid Apple Developer Program; an App Store Connect API key
   (`.p8`). Set `APP_STORE_ISSUER_ID` / `APP_STORE_KEY_ID` / `APP_STORE_PRIVATE_KEY`
   / `APP_STORE_BUNDLE_ID`, and configure App Store Server Notifications V2 to POST
   to `billing-webhook`.
6. Set `EXPO_PUBLIC_PREMIUM_MONTHLY_ID` / `EXPO_PUBLIC_PREMIUM_YEARLY_ID` in the
   build env to the real store product IDs.

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
