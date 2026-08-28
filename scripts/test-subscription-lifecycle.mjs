import assert from 'node:assert/strict';

/** Subscription lifecycle semantics + provider-difference documentation. */

const m = await import('../supabase/functions/_shared/subscriptionLifecycle.ts');

const future = new Date(Date.now() + 10 * 86400_000).toISOString();

// --- entitlement per state -----------------------------------------
assert.equal(m.describeLifecycle('active', 'google_play', future).grantsPremium, true);
assert.equal(m.describeLifecycle('cancelled_active', 'app_store', future).grantsPremium, true);
assert.equal(m.describeLifecycle('grace_period', 'google_play', future).grantsPremium, true);
assert.equal(m.describeLifecycle('billing_retry', 'app_store', future).grantsPremium, false);
assert.equal(m.describeLifecycle('paused', 'google_play', future).grantsPremium, false);
assert.equal(m.describeLifecycle('expired', 'google_play', future).grantsPremium, false);
assert.equal(m.describeLifecycle('revoked', 'app_store', future).grantsPremium, false);

// --- terminal / actionable flags ---------------------------------
assert.equal(m.describeLifecycle('expired', 'google_play').terminal, true);
assert.equal(m.describeLifecycle('revoked', 'app_store').terminal, true);
assert.equal(m.describeLifecycle('active', 'google_play').terminal, false);
assert.equal(m.describeLifecycle('billing_retry', 'app_store').userActionable, true);
assert.equal(m.describeLifecycle('grace_period', 'google_play').userActionable, true);
assert.equal(m.describeLifecycle('active', 'google_play').userActionable, false);

// --- provider-difference documentation is present --------------
assert.match(m.describeLifecycle('billing_retry', 'google_play').note, /account hold|PAUSED/i);
assert.match(m.describeLifecycle('billing_retry', 'app_store').note, /status 3|NO grace/i);
assert.match(m.describeLifecycle('paused', 'app_store').note, /[Nn]ot applicable/);
assert.match(m.describeLifecycle('grace_period', 'app_store').note, /status 4|gracePeriodExpiresDate/);

// --- transitions -----------------------------------------------
assert.equal(m.lifecycleTransition('expired', 'active'), 'granted');
assert.equal(m.lifecycleTransition('active', 'cancelled_active'), 'kept');
assert.equal(m.lifecycleTransition('active', 'grace_period'), 'kept');
assert.equal(m.lifecycleTransition('active', 'billing_retry'), 'paused');
assert.equal(m.lifecycleTransition('grace_period', 'expired'), 'lost');
assert.equal(m.lifecycleTransition('active', 'revoked'), 'lost');
assert.equal(m.lifecycleTransition('expired', 'expired'), 'none');
assert.equal(m.lifecycleTransition('billing_retry', 'active'), 'granted');

console.log('Subscription lifecycle: state→entitlement, terminal/actionable, provider differences, transitions — verified');
