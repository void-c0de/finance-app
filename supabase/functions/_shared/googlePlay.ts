// Google Play Developer API subscription verification.
//
// Flow:
//   1. Build an RS256 "JWT bearer" assertion from the service-account key.
//   2. Exchange it for a short-lived OAuth2 access token
//      (scope https://www.googleapis.com/auth/androidpublisher).
//   3. GET purchases/subscriptionsv2/tokens/{purchaseToken}
//      → SubscriptionPurchaseV2 (the source of truth).
//   4. Normalize to VerifiedStoreSubscription.
//
// Config (Supabase Function secrets — never Git, never client, never logged):
//   GOOGLE_PLAY_PACKAGE_NAME          e.g. com.nocta_xz.financeapp
//   GOOGLE_PLAY_SERVICE_ACCOUNT_JSON  full service-account JSON  (preferred)
//     — or —
//   GOOGLE_PLAY_CLIENT_EMAIL + GOOGLE_PLAY_PRIVATE_KEY
//
// Absent config → { ok:false, reason:'not_configured' }. Never a fake success.

import { signRs256 } from './jwt.ts';
import {
  mapGooglePlayLifecycle,
  type GoogleSubscriptionState,
  type StoreVerifyResult,
  type VerifiedStoreSubscription,
} from './storeSubscription.ts';

const OAUTH_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const ANDROID_PUBLISHER_SCOPE = 'https://www.googleapis.com/auth/androidpublisher';
const API_BASE = 'https://androidpublisher.googleapis.com/androidpublisher/v3';
const HTTP_TIMEOUT_MS = 10_000;

export type GooglePlayConfig = {
  packageName: string;
  clientEmail: string;
  privateKey: string;
};

export function readGooglePlayConfig(env: Record<string, string | undefined>): GooglePlayConfig | null {
  const packageName = (env.GOOGLE_PLAY_PACKAGE_NAME ?? '').trim();
  let clientEmail = (env.GOOGLE_PLAY_CLIENT_EMAIL ?? '').trim();
  let privateKey = (env.GOOGLE_PLAY_PRIVATE_KEY ?? '').trim();

  const rawJson = (env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON ?? '').trim();
  if (rawJson) {
    try {
      const parsed = JSON.parse(rawJson) as { client_email?: string; private_key?: string };
      clientEmail = clientEmail || (parsed.client_email ?? '');
      privateKey = privateKey || (parsed.private_key ?? '');
    } catch {
      return null;
    }
  }
  // stored secrets often escape newlines
  privateKey = privateKey.replace(/\\n/g, '\n');
  if (!packageName || !clientEmail || !privateKey) return null;
  return { packageName, clientEmail, privateKey };
}

// Simple per-invocation token cache so one request never mints two assertions.
let cachedToken: { value: string; expiresAtMs: number } | null = null;

export class GoogleApiError extends Error {
  status: number;
  where: string;
  constructor(status: number, where: string) {
    super(`google_api_${where}_${status}`);
    this.status = status;
    this.where = where;
  }
}

export function resetGoogleTokenCacheForTests(): void {
  cachedToken = null;
}

// --- pure normalization -------------------------------------------------

type SubscriptionPurchaseV2 = {
  subscriptionState?: string;
  startTime?: string;
  linkedPurchaseToken?: string;
  latestOrderId?: string;
  testPurchase?: Record<string, unknown>;
  canceledStateContext?: { userInitiatedCancellation?: unknown; systemInitiatedCancellation?: unknown; developerInitiatedCancellation?: unknown; replacementCancellation?: unknown };
  lineItems?: Array<{
    productId?: string;
    expiryTime?: string;
    autoRenewingPlan?: { autoRenewEnabled?: boolean };
    offerDetails?: { basePlanId?: string; offerId?: string };
  }>;
};

/**
 * Normalize a SubscriptionPurchaseV2 body. `internalProductId` is the caller's
 * claimed product; it must match a lineItem productId / basePlanId.
 */
export function normalizeGooglePlayResponse(
  body: SubscriptionPurchaseV2,
  ctx: { purchaseToken: string; expectedStoreProductIds: string[]; internalProductId: string },
): StoreVerifyResult {
  const state = (body.subscriptionState ?? 'SUBSCRIPTION_STATE_UNSPECIFIED') as GoogleSubscriptionState;
  const items = Array.isArray(body.lineItems) ? body.lineItems : [];
  if (items.length === 0) return { ok: false, reason: 'malformed_response', detail: 'no_line_items' };

  // Pick the line item that matches the claimed product (by productId or basePlanId).
  const match = items.find(
    (li) =>
      (li.productId && ctx.expectedStoreProductIds.includes(li.productId)) ||
      (li.offerDetails?.basePlanId && ctx.expectedStoreProductIds.includes(li.offerDetails.basePlanId)),
  );
  if (!match) return { ok: false, reason: 'unknown_product', detail: 'line_item_product_mismatch' };

  const autoRenew = match.autoRenewingPlan?.autoRenewEnabled === true;
  const lifecycle = mapGooglePlayLifecycle(state, autoRenew);

  let cancellationReason: string | null = null;
  const csc = body.canceledStateContext;
  if (csc?.userInitiatedCancellation) cancellationReason = 'user_cancelled';
  else if (csc?.systemInitiatedCancellation) cancellationReason = 'system_cancelled';
  else if (csc?.developerInitiatedCancellation) cancellationReason = 'developer_cancelled';
  else if (csc?.replacementCancellation) cancellationReason = 'replaced';

  const subscription: VerifiedStoreSubscription = {
    provider: 'google_play',
    productId: ctx.internalProductId,
    providerTransactionId: body.latestOrderId ?? ctx.purchaseToken.slice(0, 24),
    providerOriginalTransactionId: body.linkedPurchaseToken ?? null,
    lifecycle,
    autoRenew,
    environment: body.testPurchase ? 'sandbox' : 'production',
    startedAt: body.startTime ?? null,
    expiresAt: match.expiryTime ?? null,
    cancellationReason,
  };
  return { ok: true, subscription };
}

// --- I/O verification --------------------------------------------------

export async function verifyGooglePlayPurchase(input: {
  env: Record<string, string | undefined>;
  internalProductId: string;
  expectedStoreProductIds: string[];
  purchaseToken: string;
  fetchImpl?: typeof fetch;
  now?: Date;
}): Promise<StoreVerifyResult> {
  const config = readGooglePlayConfig(input.env);
  if (!config) return { ok: false, reason: 'not_configured' };
  if (!input.purchaseToken || input.purchaseToken.length < 8) return { ok: false, reason: 'invalid_token' };

  const doFetch = input.fetchImpl ?? fetch;
  let accessToken: string;
  try {
    accessToken = await getGoogleAccessTokenWith(config, doFetch, input.now ?? new Date());
  } catch (error) {
    return classifyGoogleError(error, 'auth');
  }

  const url = `${API_BASE}/applications/${encodeURIComponent(config.packageName)}/purchases/subscriptionsv2/tokens/${encodeURIComponent(input.purchaseToken)}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS);
  try {
    const res = await doFetch(url, { headers: { Authorization: `Bearer ${accessToken}` }, signal: controller.signal });
    if (res.status === 404 || res.status === 410) return { ok: false, reason: 'provider_not_found' };
    if (res.status === 401 || res.status === 403) return { ok: false, reason: 'provider_auth_failed' };
    if (res.status === 429) return { ok: false, reason: 'provider_rate_limited' };
    if (res.status >= 500) return { ok: false, reason: 'provider_unavailable' };
    if (!res.ok) return { ok: false, reason: 'malformed_response', detail: `status_${res.status}` };
    let body: SubscriptionPurchaseV2;
    try {
      body = (await res.json()) as SubscriptionPurchaseV2;
    } catch {
      return { ok: false, reason: 'malformed_response', detail: 'invalid_json' };
    }
    return normalizeGooglePlayResponse(body, {
      purchaseToken: input.purchaseToken,
      expectedStoreProductIds: input.expectedStoreProductIds,
      internalProductId: input.internalProductId,
    });
  } catch (error) {
    return classifyGoogleError(error, 'data');
  } finally {
    clearTimeout(timer);
  }
}

// token acquisition with an injectable fetch (for tests)
export async function getGoogleAccessTokenWith(config: GooglePlayConfig, doFetch: typeof fetch, now: Date): Promise<string> {
  if (cachedToken && cachedToken.expiresAtMs - 60_000 > now.getTime()) return cachedToken.value;
  const iat = Math.floor(now.getTime() / 1000);
  const assertion = await signRs256(
    { alg: 'RS256', typ: 'JWT' },
    { iss: config.clientEmail, scope: ANDROID_PUBLISHER_SCOPE, aud: OAUTH_TOKEN_URL, iat, exp: iat + 3600 },
    config.privateKey,
  );
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS);
  try {
    const res = await doFetch(OAUTH_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
      signal: controller.signal,
    });
    if (res.status === 429) throw new GoogleApiError(429, 'oauth');
    if (!res.ok) throw new GoogleApiError(res.status, 'oauth');
    const body = (await res.json()) as { access_token?: string; expires_in?: number };
    if (!body.access_token) throw new GoogleApiError(500, 'oauth_no_token');
    cachedToken = { value: body.access_token, expiresAtMs: now.getTime() + (body.expires_in ?? 3600) * 1000 };
    return body.access_token;
  } finally {
    clearTimeout(timer);
  }
}

function classifyGoogleError(error: unknown, where: 'auth' | 'data'): StoreVerifyResult {
  if (error instanceof DOMException && error.name === 'AbortError') return { ok: false, reason: 'timeout' };
  if (error instanceof GoogleApiError) {
    if (error.status === 429) return { ok: false, reason: 'provider_rate_limited' };
    if (error.status === 401 || error.status === 403) return { ok: false, reason: 'provider_auth_failed' };
    if (error.status >= 500) return { ok: false, reason: 'provider_unavailable' };
  }
  return { ok: false, reason: where === 'auth' ? 'provider_auth_failed' : 'provider_unavailable' };
}
