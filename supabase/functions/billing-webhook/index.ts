// billing-webhook — store lifecycle notifications:
//   • Google Play  Real-time Developer Notifications (Pub/Sub push)
//   • Apple        App Store Server Notifications V2 (signed payload)
//   • RevenueCat   (shared-secret webhook)
//
// verify_jwt is FALSE (a store cannot present a Supabase JWT). Each source is
// authenticated by its own mechanism:
//   Google : an OIDC identity token (Authorization: Bearer …) signed by Google,
//            or a ?token= shared secret as a fallback.
//   Apple  : the signedPayload JWS is verified against Apple Root CA - G3.
//   RC     : an Authorization: Bearer <shared secret> header.
//
// A notification is a TRIGGER, never a source of truth: we re-verify with the
// provider API (google_play) / re-check the signed transaction (app_store) and
// only then touch the entitlement. Every event is deduplicated in
// billing_webhook_events; an older event never overwrites newer state.
//
// Secrets (Supabase Function secrets):
//   GOOGLE_PLAY_PACKAGE_NAME / GOOGLE_PLAY_SERVICE_ACCOUNT_JSON (re-verify + OIDC audience)
//   GOOGLE_PUBSUB_SA_EMAIL         the push subscription's service-account email
//   GOOGLE_PUBSUB_AUDIENCE         optional explicit OIDC audience (else the request URL)
//   PLAY_RTDN_VERIFICATION_TOKEN   optional ?token= fallback
//   APP_STORE_BUNDLE_ID            expected bundle id for Apple notifications
//   REVENUECAT_WEBHOOK_SECRET      RevenueCat shared secret

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.95.3';

import { verifyGooglePlayPurchase } from '../_shared/googlePlay.ts';
import { verifyAppleJws } from '../_shared/appleJws.ts';
import { verifyGoogleOidcToken } from '../_shared/googleOidc.ts';
import {
  GOOGLE_RTDN_TYPE,
  lifecycleToDbStatus,
  mapAppleLifecycle,
  appleRevocationReasonLabel,
  type AppleSubscriptionStatus,
} from '../_shared/storeSubscription.ts';
import { billingLog } from '../_shared/observability.ts';
import type { AppleRenewalPayload, AppleTransactionPayload } from '../_shared/appStore.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const j = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

async function sha256(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function admin() {
  return createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return j(405, { error: 'method_not_allowed' });
  if (!SUPABASE_URL || !SERVICE_KEY) return j(200, { ok: false, reason: 'not_configured' });

  let bodyText: string;
  try {
    bodyText = await req.text();
  } catch {
    return j(400, { error: 'bad_body' });
  }
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(bodyText) as Record<string, unknown>;
  } catch {
    return j(400, { error: 'bad_json' });
  }

  try {
    if (typeof payload.signedPayload === 'string') {
      return await handleApple(payload.signedPayload, bodyText);
    }
    if (payload.message && typeof (payload.message as { data?: string }).data === 'string') {
      return await handleGoogle(req, payload as { message: { data: string; messageId?: string; message_id?: string } }, bodyText);
    }
    if (payload.event && typeof payload.event === 'object') {
      return await handleRevenueCat(req, payload as { event: Record<string, unknown> }, bodyText);
    }
    return j(200, { ok: true, ignored: 'unrecognized_payload' });
  } catch (error) {
    billingLog('billing-webhook', { result: 'error', reason: String(error).slice(0, 120) });
    return j(500, { error: 'webhook_failed' });
  }
});

// --- Google Play RTDN --------------------------------------------------

async function handleGoogle(
  req: Request,
  payload: { message: { data: string; messageId?: string; message_id?: string }; subscription?: string },
  bodyText: string,
): Promise<Response> {
  // authenticate
  const bearer = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  const saEmail = Deno.env.get('GOOGLE_PUBSUB_SA_EMAIL');
  const sharedToken = Deno.env.get('PLAY_RTDN_VERIFICATION_TOKEN');
  const url = new URL(req.url);

  let authed = false;
  if (bearer && saEmail) {
    const audiences = [Deno.env.get('GOOGLE_PUBSUB_AUDIENCE') ?? `${url.origin}${url.pathname}`, `${url.origin}${url.pathname}`];
    const oidc = await verifyGoogleOidcToken(bearer, { expectedAudiences: audiences, expectedEmail: saEmail });
    authed = oidc.ok;
    if (!oidc.ok) billingLog('billing-webhook', { provider: 'google_play', result: 'auth_rejected', reason: oidc.reason });
  }
  if (!authed && sharedToken && url.searchParams.get('token') === sharedToken) authed = true;
  if (!authed) return j(sharedToken || saEmail ? 401 : 200, { ok: false, reason: 'unauthenticated' });

  const note = JSON.parse(atob(payload.message.data)) as {
    subscriptionNotification?: { notificationType?: number; purchaseToken?: string; subscriptionId?: string };
    testNotification?: { version?: string };
    voidedPurchaseNotification?: { purchaseToken?: string };
    eventTimeMillis?: string;
  };

  if (note.testNotification) return j(200, { ok: true, test: true });
  const sn = note.subscriptionNotification;
  const purchaseToken = sn?.purchaseToken ?? note.voidedPurchaseNotification?.purchaseToken;
  if (!purchaseToken) return j(200, { ok: true, ignored: 'no_subscription_notification' });

  const eventId = payload.message.messageId ?? payload.message.message_id ?? (await sha256(bodyText));
  const eventAt = note.eventTimeMillis ? new Date(Number(note.eventTimeMillis)).toISOString() : new Date().toISOString();
  const db = admin();

  const { data: first } = await db.rpc('record_billing_event', {
    p_provider: 'google_play',
    p_event_id: eventId,
    p_event_type: GOOGLE_RTDN_TYPE[sn?.notificationType ?? -1] ?? 'VOIDED_PURCHASE',
    p_event_at: eventAt,
    p_payload_sha256: await sha256(bodyText),
  });
  if (first === false) return j(200, { ok: true, duplicate: true });

  const tokenHash = await sha256(`google_play:${purchaseToken}`);
  const { data: row } = await db
    .from('billing_subscriptions')
    .select('user_id, product_id')
    .eq('provider', 'google_play')
    .eq('purchase_token_sha256', tokenHash)
    .maybeSingle();
  if (!row) return j(200, { ok: true, ignored: 'unknown_token' });

  // Re-verify with the provider — the notification is only a trigger.
  const store = await verifyGooglePlayPurchase({
    env: Deno.env.toObject(),
    internalProductId: row.product_id,
    expectedStoreProductIds: (Deno.env.get('STORE_PRODUCT_IDS') ?? 'premium.monthly,premium.yearly,premium_monthly,premium_yearly').split(','),
    purchaseToken,
  });

  if (!store.ok) {
    // Provider says revoked/expired/not-found → downgrade path via a terminal status.
    if (store.reason === 'provider_not_found') {
      await db.rpc('apply_verified_subscription', {
        p_user_id: row.user_id, p_provider: 'google_play', p_product_id: row.product_id,
        p_token_sha256: tokenHash, p_status: 'expired', p_auto_renewing: false, p_period_end: null,
        p_notification_type: `rtdn_${sn?.notificationType}`, p_event_at: eventAt,
      });
      return j(200, { ok: true, status: 'expired' });
    }
    billingLog('billing-webhook', { provider: 'google_play', result: 'reverify_failed', reason: store.reason });
    return j(200, { ok: false, reason: store.reason }); // ack; do not overwrite state on transient errors
  }

  const sub = store.subscription;
  await db.rpc('apply_verified_subscription', {
    p_user_id: row.user_id,
    p_provider: 'google_play',
    p_product_id: sub.productId,
    p_token_sha256: tokenHash,
    p_status: lifecycleToDbStatus(sub.lifecycle),
    p_auto_renewing: sub.autoRenew,
    p_period_end: sub.expiresAt,
    p_notification_type: `rtdn_${sn?.notificationType}`,
    p_provider_transaction_id: sub.providerTransactionId || null,
    p_original_transaction_id: sub.providerOriginalTransactionId,
    p_environment: sub.environment,
    p_cancellation_reason: sub.cancellationReason,
    p_event_at: eventAt,
  });
  billingLog('billing-webhook', { provider: 'google_play', result: 'applied', lifecycle: sub.lifecycle });
  return j(200, { ok: true, lifecycle: sub.lifecycle });
}

// --- Apple App Store Server Notifications V2 -------------------------

async function handleApple(signedPayload: string, bodyText: string): Promise<Response> {
  const outer = await verifyAppleJws<{
    notificationType?: string;
    subtype?: string;
    notificationUUID?: string;
    signedDate?: number;
    data?: { bundleId?: string; environment?: string; status?: number; signedTransactionInfo?: string; signedRenewalInfo?: string };
  }>(signedPayload);
  if (!outer.ok) {
    billingLog('billing-webhook', { provider: 'app_store', result: 'auth_rejected', reason: outer.reason });
    return j(401, { ok: false, reason: 'signature_invalid' });
  }
  const note = outer.payload;
  const expectedBundle = Deno.env.get('APP_STORE_BUNDLE_ID');
  if (expectedBundle && note.data?.bundleId && note.data.bundleId !== expectedBundle) {
    return j(200, { ok: true, ignored: 'bundle_mismatch' });
  }

  const eventId = note.notificationUUID ?? (await sha256(bodyText));
  const eventAt = note.signedDate ? new Date(note.signedDate).toISOString() : new Date().toISOString();
  const db = admin();

  const { data: first } = await db.rpc('record_billing_event', {
    p_provider: 'app_store',
    p_event_id: eventId,
    p_event_type: `${note.notificationType ?? 'UNKNOWN'}${note.subtype ? `.${note.subtype}` : ''}`,
    p_event_at: eventAt,
    p_payload_sha256: await sha256(bodyText),
  });
  if (first === false) return j(200, { ok: true, duplicate: true });

  const txJws = note.data?.signedTransactionInfo;
  if (!txJws) return j(200, { ok: true, ignored: 'no_transaction' });
  const tx = await verifyAppleJws<AppleTransactionPayload>(txJws);
  if (!tx.ok) return j(401, { ok: false, reason: 'tx_signature_invalid' });

  let renewal: AppleRenewalPayload | null = null;
  if (note.data?.signedRenewalInfo) {
    const rn = await verifyAppleJws<AppleRenewalPayload>(note.data.signedRenewalInfo);
    if (!rn.ok) return j(401, { ok: false, reason: 'renewal_signature_invalid' });
    renewal = rn.payload;
  }

  const originalTxId = tx.payload.originalTransactionId ?? tx.payload.transactionId;
  if (!originalTxId) return j(200, { ok: true, ignored: 'no_original_transaction_id' });

  const { data: row } = await db
    .from('billing_subscriptions')
    .select('user_id, product_id, purchase_token_sha256')
    .eq('provider', 'app_store')
    .eq('provider_original_transaction_id', originalTxId)
    .maybeSingle();
  if (!row) return j(200, { ok: true, ignored: 'unknown_original_transaction' });

  const autoRenew = renewal ? renewal.autoRenewStatus === 1 : true;
  const statusInt = (note.data?.status as AppleSubscriptionStatus) ?? (tx.payload.revocationDate ? 5 : (tx.payload.expiresDate ?? 0) > Date.now() ? 1 : 2);
  const lifecycle = mapAppleLifecycle(statusInt, autoRenew, tx.payload.revocationDate ?? null);
  const expiresAt = lifecycle === 'grace_period' && renewal?.gracePeriodExpiresDate
    ? new Date(renewal.gracePeriodExpiresDate).toISOString()
    : tx.payload.expiresDate
      ? new Date(tx.payload.expiresDate).toISOString()
      : null;

  await db.rpc('apply_verified_subscription', {
    p_user_id: row.user_id,
    p_provider: 'app_store',
    p_product_id: row.product_id,
    p_token_sha256: row.purchase_token_sha256,
    p_status: lifecycleToDbStatus(lifecycle),
    p_auto_renewing: autoRenew,
    p_period_end: expiresAt,
    p_notification_type: `assn_${note.notificationType ?? 'unknown'}`,
    p_provider_transaction_id: tx.payload.transactionId ?? null,
    p_original_transaction_id: originalTxId,
    p_environment: (tx.payload.environment ?? 'Production').toLowerCase() === 'sandbox' ? 'sandbox' : 'production',
    p_cancellation_reason: tx.payload.revocationDate ? appleRevocationReasonLabel(tx.payload.revocationReason) : autoRenew ? null : 'auto_renew_off',
    p_event_at: eventAt,
  });
  billingLog('billing-webhook', { provider: 'app_store', result: 'applied', lifecycle, type: note.notificationType });
  return j(200, { ok: true, lifecycle });
}

// --- RevenueCat -----------------------------------------------------

async function handleRevenueCat(req: Request, payload: { event: Record<string, unknown> }, bodyText: string): Promise<Response> {
  const secret = Deno.env.get('REVENUECAT_WEBHOOK_SECRET');
  if (!secret) return j(200, { ok: false, reason: 'not_configured' });
  if ((req.headers.get('Authorization') ?? '') !== `Bearer ${secret}`) return j(401, { ok: false, reason: 'unauthenticated' });

  const ev = payload.event as { id?: string; type?: string; app_user_id?: string; product_id?: string; expiration_at_ms?: number; event_timestamp_ms?: number };
  if (!ev.app_user_id) return j(200, { ok: true, ignored: 'no_event' });

  const db = admin();
  const eventId = ev.id ?? (await sha256(bodyText));
  const eventAt = ev.event_timestamp_ms ? new Date(ev.event_timestamp_ms).toISOString() : new Date().toISOString();
  const { data: first } = await db.rpc('record_billing_event', {
    p_provider: 'revenuecat', p_event_id: eventId, p_event_type: ev.type ?? 'unknown',
    p_event_at: eventAt, p_payload_sha256: await sha256(bodyText),
  });
  if (first === false) return j(200, { ok: true, duplicate: true });

  const status =
    ev.type === 'CANCELLATION' ? 'cancelled'
    : ev.type === 'EXPIRATION' ? 'expired'
    : ev.type === 'BILLING_ISSUE' ? 'in_grace'
    : 'active';
  await db.rpc('apply_verified_subscription', {
    p_user_id: ev.app_user_id,
    p_provider: 'revenuecat',
    p_product_id: ev.product_id ?? 'unknown',
    p_token_sha256: await sha256(`revenuecat:${ev.app_user_id}:${ev.product_id ?? ''}`),
    p_status: status,
    p_auto_renewing: status === 'active',
    p_period_end: ev.expiration_at_ms ? new Date(ev.expiration_at_ms).toISOString() : null,
    p_notification_type: `rc_${ev.type ?? 'unknown'}`,
    p_environment: 'production',
    p_event_at: eventAt,
  });
  return j(200, { ok: true, status });
}
