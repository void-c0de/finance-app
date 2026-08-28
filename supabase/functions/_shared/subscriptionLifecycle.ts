// Subscription lifecycle semantics — the single reference for how each state
// maps to a Premium entitlement, and where Google Play and Apple differ.
//
// Sources: Google Play "Subscription lifecycle" + SubscriptionPurchaseV2 docs;
// Apple "Get All Subscription Statuses" status codes + auto-renew semantics.
//
// Pure module. Tested by scripts/test-subscription-lifecycle.mjs.

import { lifecycleGrantsPremium, lifecycleToDbStatus, type SubscriptionLifecycle, type StoreProvider } from './storeSubscription.ts';

export type LifecycleFacts = {
  /** Does the user get Premium in this state (assuming the period has not elapsed)? */
  grantsPremium: boolean;
  /** Coarse status persisted on billing_subscriptions. */
  dbStatus: string;
  /** Should the app surface a "fix your payment" style prompt? */
  userActionable: boolean;
  /** Is this a terminal state (no automatic return to active without a new purchase)? */
  terminal: boolean;
  /** Short provider-specific note. */
  note: string;
};

const PROVIDER_NOTES: Partial<Record<SubscriptionLifecycle, Partial<Record<StoreProvider, string>>>> = {
  grace_period: {
    google_play: 'Play grace period: entitlement continues while Google retries payment (up to the developer-set window).',
    app_store: 'Apple status 4: billing grace period; entitlement continues until gracePeriodExpiresDate.',
  },
  billing_retry: {
    google_play: 'Play account hold: entitlement is PAUSED; restored automatically if the user fixes payment.',
    app_store: 'Apple status 3: billing retry with NO grace; entitlement is lost until payment recovers.',
  },
  paused: {
    google_play: 'Play pause: user-initiated; auto-resumes on the scheduled date. No Apple equivalent.',
    app_store: 'Not applicable on the App Store.',
  },
  cancelled_active: {
    google_play: 'Auto-renew off (SUBSCRIPTION_STATE_CANCELED or ACTIVE+autoRenewEnabled=false); Premium until expiryTime.',
    app_store: 'autoRenewStatus=0 while status=1; Premium until expiresDate.',
  },
  revoked: {
    google_play: 'SUBSCRIPTION_STATE_EXPIRED after REVOKE, or a refund: entitlement ends immediately.',
    app_store: 'revocationDate present (refund / family-sharing removal): entitlement ends immediately.',
  },
};

export function describeLifecycle(lifecycle: SubscriptionLifecycle, provider: StoreProvider, expiresAt: string | null = null, now: Date = new Date()): LifecycleFacts {
  return {
    grantsPremium: lifecycleGrantsPremium(lifecycle, expiresAt, now),
    dbStatus: lifecycleToDbStatus(lifecycle),
    userActionable: lifecycle === 'billing_retry' || lifecycle === 'grace_period',
    terminal: lifecycle === 'expired' || lifecycle === 'revoked',
    note: PROVIDER_NOTES[lifecycle]?.[provider] ?? '',
  };
}

/**
 * Given a previous and a next lifecycle, describe the entitlement transition —
 * used by tests and the client to explain state changes.
 */
export function lifecycleTransition(prev: SubscriptionLifecycle, next: SubscriptionLifecycle): 'granted' | 'kept' | 'paused' | 'lost' | 'none' {
  const wasP = lifecycleGrantsPremium(prev, null);
  const isP = lifecycleGrantsPremium(next, null);
  if (!wasP && isP) return 'granted';
  if (wasP && isP) return 'kept';
  if (wasP && !isP) return next === 'billing_retry' || next === 'paused' ? 'paused' : 'lost';
  return 'none';
}
