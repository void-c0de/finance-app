// verify-purchase — server-authoritative Play/RevenueCat purchase verification.
//
// The client sends { platform, productId, purchaseToken } after a store
// purchase. This function:
//   1. identifies the caller from the platform-verified JWT (no body identity),
//   2. validates the request shape,
//   3. verifies the purchase with the STORE (Google Play Developer API /
//      RevenueCat) — this step needs external credentials and returns
//      "not_configured" until they are set,
//   4. writes the verified state via apply_verified_subscription (service role),
//   5. returns a fresh product-access snapshot.
//
// A client purchase claim is NEVER trusted on its own. Premium comes only from
// the DB row this function writes.
//
// Secrets (Supabase Function secrets, never Git, never client):
//   GOOGLE_PLAY_PACKAGE_NAME          e.g. com.nocta_xz.financeapp
//   GOOGLE_PLAY_SERVICE_ACCOUNT_JSON  a Play Developer API service account key
//   (REVENUECAT_API_KEY               optional, RevenueCat path)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.95.3';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const j = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...CORS } });

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const PRODUCT_IDS = new Set(['premium.monthly', 'premium.yearly', 'premium_monthly', 'premium_yearly']);

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

type StoreResult =
  | {
      ok: true;
      status: 'active' | 'in_grace' | 'on_hold' | 'paused' | 'cancelled' | 'expired' | 'revoked';
      autoRenewing: boolean;
      periodEnd: string | null;
    }
  | { ok: false; reason: 'not_configured' | 'invalid_token' | 'store_error' };

/**
 * Verifies a Google Play subscription purchase. Isolated so the rest of the
 * function is fully testable without Google credentials.
 */
async function verifyWithGooglePlay(productId: string, purchaseToken: string): Promise<StoreResult> {
  const packageName = Deno.env.get('GOOGLE_PLAY_PACKAGE_NAME');
  const saJson = Deno.env.get('GOOGLE_PLAY_SERVICE_ACCOUNT_JSON');
  if (!packageName || !saJson) return { ok: false, reason: 'not_configured' };

  // Real implementation (enable once the secret is set):
  //   1. Build a Google OAuth2 access token from the service account (JWT grant,
  //      scope https://www.googleapis.com/auth/androidpublisher).
  //   2. GET https://androidpublisher.googleapis.com/androidpublisher/v3/applications/
  //        {packageName}/purchases/subscriptionsv2/tokens/{purchaseToken}
  //   3. Map subscriptionState + lineItems[].expiryTime → StoreResult.
  //   4. Validate the productId matches a lineItem offer.
  // Until then, do not pretend to verify.
  void productId;
  void purchaseToken;
  return { ok: false, reason: 'not_configured' };
}

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
  const productId = String(body.productId ?? '');
  const purchaseToken = String(body.purchaseToken ?? '');

  if (platform !== 'google_play' && platform !== 'revenuecat') return j(400, { error: 'bad_platform' });
  if (!PRODUCT_IDS.has(productId)) return j(400, { error: 'unknown_product' });
  if (purchaseToken.trim().length < 8) return j(400, { error: 'bad_token' });

  const store = platform === 'google_play'
    ? await verifyWithGooglePlay(productId, purchaseToken)
    : ({ ok: false, reason: 'not_configured' } as StoreResult);

  if (!store.ok) {
    return j(store.reason === 'not_configured' ? 501 : 400, { error: store.reason });
  }

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const tokenHash = await sha256Hex(`${platform}:${purchaseToken}`);
  const { data, error } = await admin.rpc('apply_verified_subscription', {
    p_user_id: callerId,
    p_provider: platform,
    p_product_id: productId,
    p_token_sha256: tokenHash,
    p_status: store.status,
    p_auto_renewing: store.autoRenewing,
    p_period_end: store.periodEnd,
    p_notification_type: 'verify_purchase',
  });
  if (error) return j(500, { error: 'apply_failed', detail: error.message });

  return j(200, { ok: true, access: data });
});
