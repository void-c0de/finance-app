// billing-webhook — Real-time developer notifications (Google Play) / RevenueCat
// webhooks. Keeps public.billing_subscriptions + entitlement in sync with the
// store when a subscription renews, expires, is cancelled, refunded or revoked.
//
// verify_jwt is FALSE for this function (the store cannot present a Supabase
// JWT). Authentication is by the platform's own mechanism instead:
//   - Google: a Pub/Sub push with a verification query token.
//   - RevenueCat: an Authorization header shared secret.
//
// Secrets (Supabase Function secrets):
//   PLAY_RTDN_VERIFICATION_TOKEN   arbitrary string in the Pub/Sub push URL
//   GOOGLE_PLAY_SERVICE_ACCOUNT_JSON / GOOGLE_PLAY_PACKAGE_NAME  (to fetch details)
//   REVENUECAT_WEBHOOK_SECRET      (RevenueCat path)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.95.3';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const j = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

// Google RTDN subscriptionNotification.notificationType → our status.
const RTDN_STATUS: Record<number, string> = {
  1: 'active', // RECOVERED
  2: 'active', // RENEWED
  3: 'cancelled', // CANCELED (still active until period end)
  4: 'active', // PURCHASED
  5: 'on_hold', // ON_HOLD
  6: 'in_grace', // IN_GRACE_PERIOD
  7: 'active', // RESTARTED
  8: 'active', // PRICE_CHANGE_CONFIRMED
  9: 'active', // DEFERRED
  10: 'paused', // PAUSED
  11: 'active', // PAUSE_SCHEDULE_CHANGED
  12: 'revoked', // REVOKED
  13: 'expired', // EXPIRED
};

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return j(405, { error: 'method_not_allowed' });
  if (!SUPABASE_URL || !SERVICE_KEY) return j(200, { ok: false, reason: 'not_configured' });

  // --- authenticate the webhook source ---------------------------------
  const url = new URL(req.url);
  const rtdnToken = Deno.env.get('PLAY_RTDN_VERIFICATION_TOKEN');
  const rcSecret = Deno.env.get('REVENUECAT_WEBHOOK_SECRET');
  const isGoogle = rtdnToken && url.searchParams.get('token') === rtdnToken;
  const isRevenueCat = rcSecret && (req.headers.get('Authorization') ?? '') === `Bearer ${rcSecret}`;
  if (!isGoogle && !isRevenueCat) {
    // Without configured secrets we cannot trust anything — ack so the store
    // stops retrying, but do nothing.
    return j(200, { ok: false, reason: 'not_configured' });
  }

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return j(400, { error: 'bad_json' });
  }

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    if (isGoogle) {
      // Pub/Sub push envelope: { message: { data: base64(JSON) } }
      const env = payload as { message?: { data?: string } };
      const raw = env.message?.data ? atob(env.message.data) : '{}';
      const note = JSON.parse(raw) as {
        subscriptionNotification?: { notificationType?: number; purchaseToken?: string; subscriptionId?: string };
      };
      const sn = note.subscriptionNotification;
      if (!sn?.purchaseToken) return j(200, { ok: true, ignored: 'no_subscription_notification' });

      const status = RTDN_STATUS[sn.notificationType ?? -1] ?? 'expired';
      const tokenHash = await sha256(`google_play:${sn.purchaseToken}`);

      // Look up which user this token belongs to (set during verify-purchase).
      const { data: row } = await admin
        .from('billing_subscriptions')
        .select('user_id, product_id')
        .eq('provider', 'google_play')
        .eq('purchase_token_sha256', tokenHash)
        .maybeSingle();
      if (!row) return j(200, { ok: true, ignored: 'unknown_token' });

      // NOTE: current_period_end / auto_renewing require a subscriptionsv2.get
      // call with the service account — left null here; verify-purchase already
      // set a period end and the entitlement merge keeps the longer term.
      await admin.rpc('apply_verified_subscription', {
        p_user_id: row.user_id,
        p_provider: 'google_play',
        p_product_id: sn.subscriptionId ?? row.product_id,
        p_token_sha256: tokenHash,
        p_status: status,
        p_auto_renewing: status === 'active',
        p_period_end: null,
        p_notification_type: `rtdn_${sn.notificationType}`,
      });
      return j(200, { ok: true, status });
    }

    // RevenueCat: { event: { type, app_user_id, product_id, expiration_at_ms } }
    const rc = payload as { event?: { type?: string; app_user_id?: string; product_id?: string; expiration_at_ms?: number } };
    const ev = rc.event;
    if (!ev?.app_user_id) return j(200, { ok: true, ignored: 'no_event' });
    const rcStatus =
      ev.type === 'CANCELLATION' ? 'cancelled'
      : ev.type === 'EXPIRATION' ? 'expired'
      : ev.type === 'BILLING_ISSUE' ? 'in_grace'
      : 'active';
    await admin.rpc('apply_verified_subscription', {
      p_user_id: ev.app_user_id,
      p_provider: 'revenuecat',
      p_product_id: ev.product_id ?? 'unknown',
      p_token_sha256: await sha256(`revenuecat:${ev.app_user_id}:${ev.product_id ?? ''}`),
      p_status: rcStatus,
      p_auto_renewing: rcStatus === 'active',
      p_period_end: ev.expiration_at_ms ? new Date(ev.expiration_at_ms).toISOString() : null,
      p_notification_type: `rc_${ev.type ?? 'unknown'}`,
    });
    return j(200, { ok: true, status: rcStatus });
  } catch (error) {
    return j(500, { error: 'webhook_failed', detail: String(error) });
  }
});

async function sha256(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
