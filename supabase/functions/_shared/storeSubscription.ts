// Normalized, provider-neutral subscription domain.
//
// Google Play (SubscriptionPurchaseV2) and Apple (JWSTransaction + status int)
// have very different response shapes. Everything downstream — the DB merge, the
// entitlement decision, the webhook reconciler — consumes ONLY the normalized
// `VerifiedStoreSubscription` produced here. Raw provider shapes never leak past
// the adapter boundary.
//
// Pure module: no I/O, no Deno/Node globals. Tested by scripts/test-store-verification.mjs.

export type StoreProvider = 'google_play' | 'app_store' | 'revenuecat';

/** Fine-grained lifecycle. `apply_verified_subscription` only cares whether it grants Premium. */
export type SubscriptionLifecycle =
  | 'active'
  | 'grace_period' // payment failed, provider still entitles the user
  | 'billing_retry' // payment failed, provider is retrying, entitlement paused (Apple) / on-hold (Google)
  | 'paused' // user paused an active subscription (Google)
  | 'cancelled_active' // auto-renew off but still inside the paid period
  | 'expired'
  | 'revoked' // refunded / family-sharing revoked / compliance
  | 'pending'; // deferred / slow payment not yet completed

/** The single shape the rest of the server works with. */
export type VerifiedStoreSubscription = {
  provider: StoreProvider;
  /** internal product key: premium_monthly | premium_yearly */
  productId: string;
  /** provider transaction id for THIS purchase (Google purchaseToken hash upstream; Apple transactionId) */
  providerTransactionId: string;
  /** stable identity of the subscription across renewals (Apple originalTransactionId; Google linkedPurchaseToken root) */
  providerOriginalTransactionId: string | null;
  lifecycle: SubscriptionLifecycle;
  autoRenew: boolean;
  environment: 'production' | 'sandbox';
  startedAt: string | null;
  expiresAt: string | null;
  cancellationReason: string | null;
};

export type StoreVerifyResult =
  | { ok: true; subscription: VerifiedStoreSubscription }
  | { ok: false; reason: StoreVerifyFailure; detail?: string };

export type StoreVerifyFailure =
  | 'not_configured'
  | 'invalid_token'
  | 'unknown_product'
  | 'package_mismatch'
  | 'bundle_mismatch'
  | 'signature_invalid'
  | 'provider_auth_failed'
  | 'provider_rate_limited'
  | 'provider_unavailable'
  | 'provider_not_found'
  | 'malformed_response'
  | 'timeout';

/** Does this lifecycle state entitle the user to Premium right now? */
export function lifecycleGrantsPremium(lifecycle: SubscriptionLifecycle, expiresAt: string | null, now: Date = new Date()): boolean {
  switch (lifecycle) {
    case 'active':
    case 'grace_period':
    case 'cancelled_active':
      // still inside the provider-valid period
      return expiresAt == null || Date.parse(expiresAt) > now.getTime();
    case 'billing_retry':
    case 'paused':
    case 'expired':
    case 'revoked':
    case 'pending':
      return false;
    default:
      return false;
  }
}

/** Map a normalized lifecycle to the coarse status the DB merge expects. */
export function lifecycleToDbStatus(lifecycle: SubscriptionLifecycle): 'active' | 'in_grace' | 'on_hold' | 'paused' | 'cancelled' | 'expired' | 'revoked' | 'pending' {
  switch (lifecycle) {
    case 'active':
      return 'active';
    case 'cancelled_active':
      return 'active'; // Premium stays until expiresAt; auto_renew=false carries the "cancelled" nuance
    case 'grace_period':
      return 'in_grace';
    case 'billing_retry':
      return 'on_hold';
    case 'paused':
      return 'paused';
    case 'expired':
      return 'expired';
    case 'revoked':
      return 'revoked';
    case 'pending':
      return 'pending';
    default:
      return 'expired';
  }
}

// --- Google Play mapping --------------------------------------------------

// SubscriptionPurchaseV2.subscriptionState
export type GoogleSubscriptionState =
  | 'SUBSCRIPTION_STATE_UNSPECIFIED'
  | 'SUBSCRIPTION_STATE_PENDING'
  | 'SUBSCRIPTION_STATE_ACTIVE'
  | 'SUBSCRIPTION_STATE_PAUSED'
  | 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD'
  | 'SUBSCRIPTION_STATE_ON_HOLD'
  | 'SUBSCRIPTION_STATE_CANCELED'
  | 'SUBSCRIPTION_STATE_EXPIRED'
  | 'SUBSCRIPTION_STATE_PENDING_PURCHASE_CANCELED';

export function mapGooglePlayLifecycle(state: GoogleSubscriptionState, autoRenewEnabled: boolean): SubscriptionLifecycle {
  switch (state) {
    case 'SUBSCRIPTION_STATE_ACTIVE':
      return autoRenewEnabled ? 'active' : 'cancelled_active';
    case 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD':
      return 'grace_period';
    case 'SUBSCRIPTION_STATE_ON_HOLD':
      return 'billing_retry';
    case 'SUBSCRIPTION_STATE_PAUSED':
      return 'paused';
    case 'SUBSCRIPTION_STATE_CANCELED':
      // "Canceled" in v2 means auto-renew turned off; entitlement continues to expiry.
      return 'cancelled_active';
    case 'SUBSCRIPTION_STATE_EXPIRED':
      return 'expired';
    case 'SUBSCRIPTION_STATE_PENDING':
      return 'pending';
    case 'SUBSCRIPTION_STATE_PENDING_PURCHASE_CANCELED':
      return 'expired';
    default:
      return 'expired';
  }
}

// Google RTDN subscriptionNotification.notificationType → lifecycle hint (still re-verified against the API)
export const GOOGLE_RTDN_TYPE: Record<number, string> = {
  1: 'SUBSCRIPTION_RECOVERED',
  2: 'SUBSCRIPTION_RENEWED',
  3: 'SUBSCRIPTION_CANCELED',
  4: 'SUBSCRIPTION_PURCHASED',
  5: 'SUBSCRIPTION_ON_HOLD',
  6: 'SUBSCRIPTION_IN_GRACE_PERIOD',
  7: 'SUBSCRIPTION_RESTARTED',
  8: 'SUBSCRIPTION_PRICE_CHANGE_CONFIRMED',
  9: 'SUBSCRIPTION_DEFERRED',
  10: 'SUBSCRIPTION_PAUSED',
  11: 'SUBSCRIPTION_PAUSE_SCHEDULE_CHANGED',
  12: 'SUBSCRIPTION_REVOKED',
  13: 'SUBSCRIPTION_EXPIRED',
  20: 'SUBSCRIPTION_PENDING_PURCHASE_CANCELED',
};

// --- Apple mapping -------------------------------------------------------

// getAllSubscriptionStatuses lastTransactions[].status
export type AppleSubscriptionStatus = 1 | 2 | 3 | 4 | 5;

/**
 * Apple status int + the decoded renewal info give the lifecycle.
 * status: 1 active · 2 expired · 3 billing retry · 4 grace period · 5 revoked
 */
export function mapAppleLifecycle(
  status: AppleSubscriptionStatus,
  autoRenewStatus: boolean,
  revocationDate: number | null | undefined,
): SubscriptionLifecycle {
  if (revocationDate) return 'revoked';
  switch (status) {
    case 1:
      return autoRenewStatus ? 'active' : 'cancelled_active';
    case 2:
      return 'expired';
    case 3:
      return 'billing_retry';
    case 4:
      return 'grace_period';
    case 5:
      return 'revoked';
    default:
      return 'expired';
  }
}

// App Store Server Notifications V2 notificationType → whether it should trigger re-verification.
export const APPLE_NOTIFICATION_TYPES = new Set([
  'SUBSCRIBED',
  'DID_RENEW',
  'DID_CHANGE_RENEWAL_STATUS',
  'DID_CHANGE_RENEWAL_PREF',
  'EXPIRED',
  'GRACE_PERIOD_EXPIRED',
  'DID_FAIL_TO_RENEW',
  'REFUND',
  'REFUND_DECLINED',
  'REFUND_REVERSED',
  'REVOKE',
  'PRICE_INCREASE',
  'RENEWAL_EXTENDED',
  'RENEWAL_EXTENSION',
  'OFFER_REDEEMED',
]);

export function appleRevocationReasonLabel(reason: number | null | undefined): string | null {
  if (reason === 1) return 'refund_other';
  if (reason === 0) return 'refund_issue';
  return reason == null ? null : `revocation_${reason}`;
}
