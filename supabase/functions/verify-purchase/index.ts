// verify-purchase — server-authoritative store purchase verification.
//
// The client sends { platform, productId, purchaseToken } after a store
// purchase. This function:
//   1. identifies the caller from the platform-verified JWT (no body identity),
//   2. validates the request shape,
//   3. verifies the purchase with the STORE:
//        google_play → Google Play Developer API (purchases.subscriptionsv2)
//        app_store   → the signed transaction JWS (Apple Root CA - G3) +,
//                      when configured, the App Store Server API for the
//                      authoritative current status
//      Both return "not_configured" until their server credentials are set —
//      never a fake success.
//   4. writes the normalized verified state via apply_verified_subscription
//      (service role), which also enforces first-account-wins replay safety,
//   5. returns a fresh product-access snapshot.
//
// A client purchase claim is NEVER trusted on its own. Premium comes only from
// the DB row this function writes.
//
// Secrets (Supabase Function secrets, never Git, never client, never logged):
//   GOOGLE_PLAY_PACKAGE_NAME
//   GOOGLE_PLAY_SERVICE_ACCOUNT_JSON   (or GOOGLE_PLAY_CLIENT_EMAIL + GOOGLE_PLAY_PRIVATE_KEY)
//   APP_STORE_ISSUER_ID / APP_STORE_KEY_ID / APP_STORE_PRIVATE_KEY / APP_STORE_BUNDLE_ID

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.95.3';

import { verifyGooglePlayPurchase } from '../_shared/googlePlay.ts';
import { verifyAppStorePurchase } from '../_shared/appStore.ts';
import { lifecycleToDbStatus, lifecycleGrantsPremium, type StoreVerifyResult } from '../_shared/storeSubscription.ts';
import { billingLog } from '../_shared/observability.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const j = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...CORS } });

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

// Internal product keys the client may claim.
const INTERNAL_PRODUCT_IDS = new Set(['premium_monthly', 'premium_yearly', 'premium.monthly', 'premium.yearly']);

/** Store product ids we accept from the provider response. Configurable, non-secret. */
function expectedStoreProductIds(): string[] {
  const fromEnv = (Deno.env.get('STORE_PRODUCT_IDS') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (fromEnv.length > 0) return fromEnv;
  return ['premium.monthly', 'premium.yearly', 'premium_monthly', 'premium_yearly'];
}

function internalProductKey(claimed: string): string {
  return claimed === 'premium.monthly'
    ? 'premium_monthly'
    : claimed === 'premium.yearly'
      ? 'premium_yearly'
      : claimed;
}

function jwtSub(token: string): string | null {
  try {
    let b64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    b64 += '='.repeat((4 - (b64.length % 4)) % 4);
    const p = JSON.parse(atob(b64));
    return (p.role === 'authenticated' || p.aud === 'authenticated') && typeof p.sub === 'string' ? p.sub : null;
  } catch {
    return null;
  }
}

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const FAILURE_STATUS: Record<string, number> = {
  not_configured: 501,
  invalid_token: 400,
  unknown_product: 400,
  package_mismatch: 400,
  bundle_mismatch: 400,
  signature_invalid: 400,
  malformed_response: 502,
  provider_auth_failed: 502,
  provider_rate_limited: 503,
  provider_unavailable: 503,
  provider_not_found: 404,
  timeout: 504,
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return j(405, { error: 'method_not_allowed' });
  if (!SUPABASE_URL || !SERVICE_KEY) return j(500, { error: 'not_configured' });

  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  const callerId = token ? jwtSub(token) : null;
  if (!callerId) return j(401, { error: 'authentication_required' });

  let body: { platform?: string; productId?: string; purchaseToken?: string };
  try {
    body = await req.json();
  } catch {
    return j(400, { error: 'bad_request' });
  }
  const platform = body.platform;
  const claimedProduct = String(body.productId ?? '');
  const purchaseToken = String(body.purchaseToken ?? '');

  if (platform !== 'google_play' && platform !== 'app_store') {
    return j(400, { error: 'bad_platform' });
  }
  if (!INTERNAL_PRODUCT_IDS.has(claimedProduct)) return j(400, { error: 'unknown_product' });
  if (purchaseToken.trim().length < 8) return j(400, { error: 'bad_token' });

  const internalProductId = internalProductKey(claimedProduct);
  const env = Deno.env.toObject();
  const started = Date.now();

  let store: StoreVerifyResult;
  if (platform === 'google_play') {
    store = await verifyGooglePlayPurchase({
      env,
      internalProductId,
      expectedStoreProductIds: expectedStoreProductIds(),
      purchaseToken,
    });
  } else {
    store = await verifyAppStorePurchase({
      env,
      internalProductId,
      expectedStoreProductIds: expectedStoreProductIds(),
      purchaseToken,
    });
  }

  if (!store.ok) {
    billingLog('verify-purchase', {
      provider: platform,
      result: 'failed',
      reason: store.reason,
      ms: Date.now() - started,
      caller: await sha256Hex(callerId).then((h) => h.slice(0, 12)),
    });
    return j(FAILURE_STATUS[store.reason] ?? 400, { error: store.reason });
  }

  const sub = store.subscription;
  const dbStatus = lifecycleToDbStatus(sub.lifecycle);
  const grants = lifecycleGrantsPremium(sub.lifecycle, sub.expiresAt);

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const tokenHash = await sha256Hex(`${platform}:${purchaseToken}`);

  const { data, error } = await admin.rpc('apply_verified_subscription', {
    p_user_id: callerId,
    p_provider: platform,
    p_product_id: internalProductId,
    p_token_sha256: tokenHash,
    p_status: grants ? dbStatus : dbStatus === 'active' ? 'expired' : dbStatus,
    p_auto_renewing: sub.autoRenew,
    p_period_end: sub.expiresAt,
    p_notification_type: 'verify_purchase',
    p_provider_transaction_id: sub.providerTransactionId || null,
    p_original_transaction_id: sub.providerOriginalTransactionId,
    p_environment: sub.environment,
    p_cancellation_reason: sub.cancellationReason,
    p_event_at: new Date().toISOString(),
  });

  if (error) {
    if ((error.message ?? '').includes('subscription_owned_by_other_account')) {
      billingLog('verify-purchase', { provider: platform, result: 'rejected', reason: 'account_switch' });
      return j(409, { error: 'subscription_owned_by_other_account' });
    }
    billingLog('verify-purchase', { provider: platform, result: 'error', reason: 'apply_failed' });
    return j(500, { error: 'apply_failed', detail: error.message });
  }

  billingLog('verify-purchase', {
    provider: platform,
    result: 'verified',
    lifecycle: sub.lifecycle,
    environment: sub.environment,
    ms: Date.now() - started,
  });
  return j(200, { ok: true, access: data });
});
