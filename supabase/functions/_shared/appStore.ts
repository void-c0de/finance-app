// Apple App Store Server API subscription verification (StoreKit 2).
//
// The client sends the signed transaction JWS (expo-iap `purchaseToken` on iOS).
// Verification:
//   1. Cryptographically verify the JWS against Apple Root CA - G3 (appleJws.ts).
//      This alone proves the transaction is genuine and un-tampered.
//   2. If App Store Server API credentials are configured, call
//      getAllSubscriptionStatuses(originalTransactionId) for the AUTHORITATIVE
//      current status (renewal, revocation, grace period) — a JWS can be stale.
//   3. Normalize to VerifiedStoreSubscription.
//
// Config (Supabase Function secrets — never Git, never client, never logged):
//   APP_STORE_ISSUER_ID    App Store Connect API issuer id
//   APP_STORE_KEY_ID       key id of the .p8
//   APP_STORE_PRIVATE_KEY  the .p8 contents (PKCS#8 PEM)
//   APP_STORE_BUNDLE_ID    e.g. com.nocta-xz.financeapp
//
// Absent config → { ok:false, reason:'not_configured' }. Never a fake success.

import { signEs256 } from './jwt.ts';
import { verifyAppleJws } from './appleJws.ts';
import {
  mapAppleLifecycle,
  appleRevocationReasonLabel,
  type AppleSubscriptionStatus,
  type StoreVerifyResult,
  type VerifiedStoreSubscription,
} from './storeSubscription.ts';

const PROD_BASE = 'https://api.storekit.itunes.apple.com';
const SANDBOX_BASE = 'https://api.storekit-sandbox.itunes.apple.com';
const HTTP_TIMEOUT_MS = 10_000;

export type AppStoreConfig = {
  issuerId: string;
  keyId: string;
  privateKey: string;
  bundleId: string;
};

export function readAppStoreConfig(env: Record<string, string | undefined>): AppStoreConfig | null {
  const issuerId = (env.APP_STORE_ISSUER_ID ?? '').trim();
  const keyId = (env.APP_STORE_KEY_ID ?? '').trim();
  let privateKey = (env.APP_STORE_PRIVATE_KEY ?? '').trim().replace(/\\n/g, '\n');
  const bundleId = (env.APP_STORE_BUNDLE_ID ?? '').trim();
  if (!issuerId || !keyId || !privateKey || !bundleId) return null;
  if (!privateKey.includes('BEGIN')) privateKey = `-----BEGIN PRIVATE KEY-----\n${privateKey}\n-----END PRIVATE KEY-----`;
  return { issuerId, keyId, privateKey, bundleId };
}

let cachedBearer: { value: string; expiresAtMs: number } | null = null;

export async function buildAppStoreBearerToken(config: AppStoreConfig, now: Date = new Date()): Promise<string> {
  if (cachedBearer && cachedBearer.expiresAtMs - 60_000 > now.getTime()) return cachedBearer.value;
  const iat = Math.floor(now.getTime() / 1000);
  const token = await signEs256(
    { alg: 'ES256', kid: config.keyId, typ: 'JWT' },
    { iss: config.issuerId, iat, exp: iat + 1200, aud: 'appstoreconnect-v1', bid: config.bundleId },
    config.privateKey,
  );
  cachedBearer = { value: token, expiresAtMs: now.getTime() + 1200 * 1000 };
  return token;
}

export function resetAppStoreCachesForTests(): void {
  cachedBearer = null;
}

// --- decoded JWS payload shapes ---------------------------------------

export type AppleTransactionPayload = {
  transactionId?: string;
  originalTransactionId?: string;
  bundleId?: string;
  productId?: string;
  purchaseDate?: number;
  originalPurchaseDate?: number;
  expiresDate?: number;
  type?: string;
  inAppOwnershipType?: string;
  environment?: string;
  revocationDate?: number;
  revocationReason?: number;
};

export type AppleRenewalPayload = {
  autoRenewStatus?: number; // 0 off, 1 on
  productId?: string;
  originalTransactionId?: string;
  gracePeriodExpiresDate?: number;
  environment?: string;
};

// --- pure normalization ---------------------------------------------

export function normalizeAppleSubscription(input: {
  transaction: AppleTransactionPayload;
  renewal: AppleRenewalPayload | null;
  statusInt: AppleSubscriptionStatus | null;
  internalProductId: string;
  expectedStoreProductIds: string[];
  expectedBundleId: string;
}): StoreVerifyResult {
  const t = input.transaction;
  if (t.bundleId && t.bundleId !== input.expectedBundleId) {
    return { ok: false, reason: 'bundle_mismatch', detail: t.bundleId };
  }
  if (t.productId && input.expectedStoreProductIds.length > 0 && !input.expectedStoreProductIds.includes(t.productId)) {
    return { ok: false, reason: 'unknown_product', detail: t.productId };
  }

  const autoRenew = input.renewal ? input.renewal.autoRenewStatus === 1 : true;
  // If we have an authoritative status int, use it; otherwise derive from expiresDate.
  const nowMs = Date.now();
  const statusInt: AppleSubscriptionStatus =
    input.statusInt ?? (t.revocationDate ? 5 : (t.expiresDate ?? 0) > nowMs ? 1 : 2);

  const lifecycle = mapAppleLifecycle(statusInt, autoRenew, t.revocationDate ?? null);

  const graceExpiry = input.renewal?.gracePeriodExpiresDate;
  const expiresAt =
    lifecycle === 'grace_period' && graceExpiry
      ? new Date(graceExpiry).toISOString()
      : t.expiresDate
        ? new Date(t.expiresDate).toISOString()
        : null;

  const subscription: VerifiedStoreSubscription = {
    provider: 'app_store',
    productId: input.internalProductId,
    providerTransactionId: t.transactionId ?? t.originalTransactionId ?? '',
    providerOriginalTransactionId: t.originalTransactionId ?? null,
    lifecycle,
    autoRenew,
    environment: (t.environment ?? input.renewal?.environment ?? 'Production').toLowerCase() === 'sandbox' ? 'sandbox' : 'production',
    startedAt: t.originalPurchaseDate ? new Date(t.originalPurchaseDate).toISOString() : null,
    expiresAt,
    cancellationReason: t.revocationDate ? appleRevocationReasonLabel(t.revocationReason) : autoRenew ? null : 'auto_renew_off',
  };
  return { ok: true, subscription };
}

// --- I/O verification ----------------------------------------------

export async function verifyAppStorePurchase(input: {
  env: Record<string, string | undefined>;
  internalProductId: string;
  expectedStoreProductIds: string[];
  /** iOS: the signed transaction JWS from expo-iap. */
  purchaseToken: string;
  fetchImpl?: typeof fetch;
  now?: Date;
  /** test seam: skip the live Server API call, use only the JWS */
  skipServerApi?: boolean;
}): Promise<StoreVerifyResult> {
  const config = readAppStoreConfig(input.env);
  if (!config) return { ok: false, reason: 'not_configured' };
  if (!input.purchaseToken || input.purchaseToken.split('.').length !== 3) {
    return { ok: false, reason: 'invalid_token' };
  }

  // 1. Verify the client-supplied signed transaction JWS.
  const jwsResult = await verifyAppleJws<AppleTransactionPayload>(input.purchaseToken, { now: input.now });
  if (!jwsResult.ok) {
    return {
      ok: false,
      reason: jwsResult.reason === 'signature_invalid' || jwsResult.reason === 'chain_invalid' || jwsResult.reason === 'root_untrusted'
        ? 'signature_invalid'
        : 'malformed_response',
      detail: jwsResult.reason,
    };
  }
  const clientTx = jwsResult.payload;
  const originalTransactionId = clientTx.originalTransactionId ?? clientTx.transactionId;
  if (!originalTransactionId) return { ok: false, reason: 'malformed_response', detail: 'no_original_transaction_id' };

  if (input.skipServerApi) {
    return normalizeAppleSubscription({
      transaction: clientTx,
      renewal: null,
      statusInt: null,
      internalProductId: input.internalProductId,
      expectedStoreProductIds: input.expectedStoreProductIds,
      expectedBundleId: config.bundleId,
    });
  }

  // 2. Authoritative status from the App Store Server API.
  const doFetch = input.fetchImpl ?? fetch;
  let bearer: string;
  try {
    bearer = await buildAppStoreBearerToken(config, input.now ?? new Date());
  } catch {
    return { ok: false, reason: 'provider_auth_failed', detail: 'bearer' };
  }

  const env = (clientTx.environment ?? 'Production').toLowerCase() === 'sandbox' ? 'sandbox' : 'production';
  const base = env === 'sandbox' ? SANDBOX_BASE : PROD_BASE;
  const url = `${base}/inApps/v1/subscriptions/${encodeURIComponent(originalTransactionId)}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS);
  let statusData: AppleStatusResponse;
  try {
    const res = await doFetch(url, { headers: { Authorization: `Bearer ${bearer}` }, signal: controller.signal });
    if (res.status === 404) return { ok: false, reason: 'provider_not_found' };
    if (res.status === 401) return { ok: false, reason: 'provider_auth_failed' };
    if (res.status === 429) return { ok: false, reason: 'provider_rate_limited' };
    if (res.status >= 500) return { ok: false, reason: 'provider_unavailable' };
    if (!res.ok) return { ok: false, reason: 'malformed_response', detail: `status_${res.status}` };
    statusData = (await res.json()) as AppleStatusResponse;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return { ok: false, reason: 'timeout' };
    return { ok: false, reason: 'provider_unavailable' };
  } finally {
    clearTimeout(timer);
  }

  // 3. Find the lastTransaction for our originalTransactionId, verify its JWS too.
  const groups = Array.isArray(statusData.data) ? statusData.data : [];
  let statusInt: AppleSubscriptionStatus | null = null;
  let renewal: AppleRenewalPayload | null = null;
  let serverTx: AppleTransactionPayload | null = null;
  for (const group of groups) {
    for (const last of group.lastTransactions ?? []) {
      if (last.originalTransactionId !== originalTransactionId) continue;
      statusInt = (last.status as AppleSubscriptionStatus) ?? null;
      if (last.signedTransactionInfo) {
        // eslint-disable-next-line no-await-in-loop
        const txVerified = await verifyAppleJws<AppleTransactionPayload>(last.signedTransactionInfo, { now: input.now });
        if (!txVerified.ok) return { ok: false, reason: 'signature_invalid', detail: 'server_tx_jws' };
        serverTx = txVerified.payload;
      }
      if (last.signedRenewalInfo) {
        // eslint-disable-next-line no-await-in-loop
        const rnVerified = await verifyAppleJws<AppleRenewalPayload>(last.signedRenewalInfo, { now: input.now });
        if (!rnVerified.ok) return { ok: false, reason: 'signature_invalid', detail: 'server_renewal_jws' };
        renewal = rnVerified.payload;
      }
    }
  }

  return normalizeAppleSubscription({
    transaction: serverTx ?? clientTx,
    renewal,
    statusInt,
    internalProductId: input.internalProductId,
    expectedStoreProductIds: input.expectedStoreProductIds,
    expectedBundleId: config.bundleId,
  });
}

type AppleStatusResponse = {
  environment?: string;
  data?: Array<{
    subscriptionGroupIdentifier?: string;
    lastTransactions?: Array<{
      originalTransactionId?: string;
      status?: number;
      signedTransactionInfo?: string;
      signedRenewalInfo?: string;
    }>;
  }>;
};
