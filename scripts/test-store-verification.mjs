import assert from 'node:assert/strict';

/**
 * Pure store-verification domain: lifecycle → entitlement, lifecycle → DB status,
 * provider notification-type maps. No I/O.
 */

const m = await import('../supabase/functions/_shared/storeSubscription.ts');

// --- lifecycleGrantsPremium --------------------------------------------
const future = new Date(Date.now() + 10 * 86400_000).toISOString();
const past = new Date(Date.now() - 1000).toISOString();

assert.equal(m.lifecycleGrantsPremium('active', future), true);
assert.equal(m.lifecycleGrantsPremium('active', null), true, 'active with no expiry still grants');
assert.equal(m.lifecycleGrantsPremium('active', past), false, 'active but past expiry does not grant');
assert.equal(m.lifecycleGrantsPremium('grace_period', future), true, 'grace period grants (provider still entitles)');
assert.equal(m.lifecycleGrantsPremium('cancelled_active', future), true, 'cancelled but still inside paid period grants');
assert.equal(m.lifecycleGrantsPremium('cancelled_active', past), false);
assert.equal(m.lifecycleGrantsPremium('billing_retry', future), false, 'billing retry does NOT grant');
assert.equal(m.lifecycleGrantsPremium('paused', future), false, 'paused does NOT grant');
assert.equal(m.lifecycleGrantsPremium('expired', future), false);
assert.equal(m.lifecycleGrantsPremium('revoked', future), false, 'revoked never grants, even before nominal expiry');
assert.equal(m.lifecycleGrantsPremium('pending', future), false, 'pending (slow payment) never grants');

// --- lifecycleToDbStatus ---------------------------------------------
assert.equal(m.lifecycleToDbStatus('active'), 'active');
assert.equal(m.lifecycleToDbStatus('cancelled_active'), 'active', 'still active until expiry');
assert.equal(m.lifecycleToDbStatus('grace_period'), 'in_grace');
assert.equal(m.lifecycleToDbStatus('billing_retry'), 'on_hold');
assert.equal(m.lifecycleToDbStatus('paused'), 'paused');
assert.equal(m.lifecycleToDbStatus('expired'), 'expired');
assert.equal(m.lifecycleToDbStatus('revoked'), 'revoked');
assert.equal(m.lifecycleToDbStatus('pending'), 'pending');

// --- Google lifecycle mapping --------------------------------------
assert.equal(m.mapGooglePlayLifecycle('SUBSCRIPTION_STATE_ACTIVE', true), 'active');
assert.equal(m.mapGooglePlayLifecycle('SUBSCRIPTION_STATE_ACTIVE', false), 'cancelled_active');
assert.equal(m.mapGooglePlayLifecycle('SUBSCRIPTION_STATE_CANCELED', false), 'cancelled_active', 'canceled = auto-renew off, entitlement continues');
assert.equal(m.mapGooglePlayLifecycle('SUBSCRIPTION_STATE_ON_HOLD', true), 'billing_retry');
assert.equal(m.mapGooglePlayLifecycle('SUBSCRIPTION_STATE_IN_GRACE_PERIOD', true), 'grace_period');
assert.equal(m.mapGooglePlayLifecycle('SUBSCRIPTION_STATE_PAUSED', true), 'paused');
assert.equal(m.mapGooglePlayLifecycle('SUBSCRIPTION_STATE_EXPIRED', false), 'expired');
assert.equal(m.mapGooglePlayLifecycle('SUBSCRIPTION_STATE_PENDING', false), 'pending');
assert.equal(m.mapGooglePlayLifecycle('SUBSCRIPTION_STATE_PENDING_PURCHASE_CANCELED', false), 'expired');

// --- Apple lifecycle mapping -------------------------------------
assert.equal(m.mapAppleLifecycle(1, true, null), 'active');
assert.equal(m.mapAppleLifecycle(1, false, null), 'cancelled_active');
assert.equal(m.mapAppleLifecycle(2, false, null), 'expired');
assert.equal(m.mapAppleLifecycle(3, true, null), 'billing_retry');
assert.equal(m.mapAppleLifecycle(4, true, null), 'grace_period');
assert.equal(m.mapAppleLifecycle(5, true, null), 'revoked');
assert.equal(m.mapAppleLifecycle(1, true, 1730000000000), 'revoked', 'revocationDate always wins');

// --- notification-type maps -----------------------------------
assert.equal(m.GOOGLE_RTDN_TYPE[2], 'SUBSCRIPTION_RENEWED');
assert.equal(m.GOOGLE_RTDN_TYPE[12], 'SUBSCRIPTION_REVOKED');
assert.equal(m.GOOGLE_RTDN_TYPE[13], 'SUBSCRIPTION_EXPIRED');
assert.ok(m.APPLE_NOTIFICATION_TYPES.has('DID_RENEW'));
assert.ok(m.APPLE_NOTIFICATION_TYPES.has('REFUND'));
assert.ok(m.APPLE_NOTIFICATION_TYPES.has('GRACE_PERIOD_EXPIRED'));
assert.ok(!m.APPLE_NOTIFICATION_TYPES.has('MADE_UP_TYPE'));

// --- revocation reason label --------------------------------
assert.equal(m.appleRevocationReasonLabel(1), 'refund_other');
assert.equal(m.appleRevocationReasonLabel(0), 'refund_issue');
assert.equal(m.appleRevocationReasonLabel(null), null);
assert.equal(m.appleRevocationReasonLabel(7), 'revocation_7');

console.log('Store verification domain: entitlement, DB status, provider maps — verified');
