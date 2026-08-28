import assert from 'node:assert/strict';

/**
 * Deterministic test matrix for the Google Play subscription verifier.
 * A synthetic RSA key (generated here) signs the OAuth assertion; a mock fetch
 * stands in for oauth2.googleapis.com and the Android Publisher API. No real
 * service account, no real purchase token.
 */

const gp = await import('../supabase/functions/_shared/googlePlay.ts');
const sub = await import('../supabase/functions/_shared/storeSubscription.ts');

// --- synthetic service-account key --------------------------------------
const kp = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
const pk8 = new Uint8Array(await crypto.subtle.exportKey('pkcs8', kp.privateKey));
const pem = `-----BEGIN PRIVATE KEY-----\n${Buffer.from(pk8).toString('base64').match(/.{1,64}/g).join('\n')}\n-----END PRIVATE KEY-----\n`;

const ENV_JSON = {
  GOOGLE_PLAY_PACKAGE_NAME: 'com.nocta_xz.financeapp',
  GOOGLE_PLAY_SERVICE_ACCOUNT_JSON: JSON.stringify({ client_email: 'sa@finance.iam.gserviceaccount.com', private_key: pem }),
};
const ENV_SPLIT = {
  GOOGLE_PLAY_PACKAGE_NAME: 'com.nocta_xz.financeapp',
  GOOGLE_PLAY_CLIENT_EMAIL: 'sa@finance.iam.gserviceaccount.com',
  GOOGLE_PLAY_PRIVATE_KEY: pem.replace(/\n/g, '\\n'),
};

// --- config reader ----------------------------------------------------
assert.equal(gp.readGooglePlayConfig({}), null, 'no config → null');
assert.equal(gp.readGooglePlayConfig({ GOOGLE_PLAY_PACKAGE_NAME: 'x' }), null, 'partial config → null');
assert.ok(gp.readGooglePlayConfig(ENV_JSON), 'JSON config parses');
assert.ok(gp.readGooglePlayConfig(ENV_SPLIT), 'split config parses');
assert.equal(gp.readGooglePlayConfig({ ...ENV_JSON, GOOGLE_PLAY_SERVICE_ACCOUNT_JSON: '{not json' }), null, 'bad JSON → null');

// --- mock fetch factory --------------------------------------------
const OAUTH_URL = 'https://oauth2.googleapis.com/token';
function mockFetch(routes) {
  const calls = [];
  const impl = async (url, init) => {
    const u = String(url);
    calls.push(u);
    if (u === OAUTH_URL) {
      if (routes.oauthStatus && routes.oauthStatus !== 200) return new Response('err', { status: routes.oauthStatus });
      return new Response(JSON.stringify({ access_token: 'ya29.mock', expires_in: 3600 }), { status: 200 });
    }
    // subscriptionsv2 endpoint
    if (routes.apiThrow) throw routes.apiThrow;
    const status = routes.apiStatus ?? 200;
    const body = routes.apiBody === undefined ? JSON.stringify(routes.apiJson ?? {}) : routes.apiBody;
    return new Response(body, { status });
  };
  impl.calls = calls;
  return impl;
}

const activeV2 = {
  subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE',
  startTime: new Date(Date.now() - 5 * 86400_000).toISOString(),
  latestOrderId: 'GPA.1234',
  lineItems: [
    {
      productId: 'premium.monthly',
      expiryTime: new Date(Date.now() + 25 * 86400_000).toISOString(),
      autoRenewingPlan: { autoRenewEnabled: true },
      offerDetails: { basePlanId: 'premium-monthly' },
    },
  ],
};

async function verify(routes, overrides = {}) {
  gp.resetGoogleTokenCacheForTests();
  return gp.verifyGooglePlayPurchase({
    env: ENV_JSON,
    internalProductId: 'premium_monthly',
    expectedStoreProductIds: ['premium.monthly', 'premium.yearly'],
    purchaseToken: 'token_abcdefghijklmnop',
    fetchImpl: mockFetch(routes),
    now: new Date(),
    ...overrides,
  });
}

// --- happy path ---------------------------------------------------
{
  const r = await verify({ apiJson: activeV2 });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.subscription.lifecycle, 'active');
  assert.equal(r.subscription.provider, 'google_play');
  assert.equal(r.subscription.autoRenew, true);
  assert.equal(r.subscription.environment, 'production');
  assert.ok(sub.lifecycleGrantsPremium(r.subscription.lifecycle, r.subscription.expiresAt));
}

// --- lifecycle mapping matrix ----------------------------------
const STATE_CASES = [
  ['SUBSCRIPTION_STATE_ACTIVE', true, 'active'],
  ['SUBSCRIPTION_STATE_ACTIVE', false, 'cancelled_active'],
  ['SUBSCRIPTION_STATE_IN_GRACE_PERIOD', true, 'grace_period'],
  ['SUBSCRIPTION_STATE_ON_HOLD', true, 'billing_retry'],
  ['SUBSCRIPTION_STATE_PAUSED', true, 'paused'],
  ['SUBSCRIPTION_STATE_CANCELED', false, 'cancelled_active'],
  ['SUBSCRIPTION_STATE_EXPIRED', false, 'expired'],
  ['SUBSCRIPTION_STATE_PENDING', false, 'pending'],
];
for (const [state, autoRenew, expected] of STATE_CASES) {
  const r = await verify({
    apiJson: { ...activeV2, subscriptionState: state, lineItems: [{ ...activeV2.lineItems[0], autoRenewingPlan: { autoRenewEnabled: autoRenew } }] },
  });
  assert.equal(r.ok, true, `${state} should normalize`);
  assert.equal(r.subscription.lifecycle, expected, `${state}/${autoRenew} → ${expected}`);
}

// grace period grants premium; on-hold / paused / expired do not
assert.equal(sub.lifecycleGrantsPremium('grace_period', new Date(Date.now() + 1e9).toISOString()), true);
assert.equal(sub.lifecycleGrantsPremium('billing_retry', null), false);
assert.equal(sub.lifecycleGrantsPremium('paused', null), false);
assert.equal(sub.lifecycleGrantsPremium('expired', null), false);

// --- provider error matrix -----------------------------------
const ERR_CASES = [
  [{ apiStatus: 401 }, 'provider_auth_failed'],
  [{ apiStatus: 403 }, 'provider_auth_failed'],
  [{ apiStatus: 404 }, 'provider_not_found'],
  [{ apiStatus: 410 }, 'provider_not_found'],
  [{ apiStatus: 429 }, 'provider_rate_limited'],
  [{ apiStatus: 500 }, 'provider_unavailable'],
  [{ apiStatus: 503 }, 'provider_unavailable'],
  [{ apiStatus: 200, apiBody: 'not json{' }, 'malformed_response'],
  [{ apiStatus: 200, apiJson: { subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE', lineItems: [] } }, 'malformed_response'],
  [{ apiStatus: 200, apiJson: { subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE', lineItems: [{ productId: 'other.product' }] } }, 'unknown_product'],
];
for (const [routes, reason] of ERR_CASES) {
  const r = await verify(routes);
  assert.equal(r.ok, false, `${reason} case should fail`);
  assert.equal(r.reason, reason, `expected ${reason}, got ${r.reason}`);
}

// --- oauth failure ------------------------------------------
{
  const r = await verify({ oauthStatus: 429 });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'provider_rate_limited');
}
{
  const r = await verify({ oauthStatus: 500 });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'provider_unavailable');
}

// --- timeout (AbortError) --------------------------------
{
  const r = await verify({ apiThrow: Object.assign(new DOMException('aborted', 'AbortError')) });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'timeout');
}

// --- not configured -------------------------------------
{
  const r = await gp.verifyGooglePlayPurchase({
    env: {},
    internalProductId: 'premium_monthly',
    expectedStoreProductIds: ['premium.monthly'],
    purchaseToken: 'token_abcdefghijklmnop',
    fetchImpl: mockFetch({}),
  });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'not_configured');
}

// --- invalid token -------------------------------------
{
  const r = await verify({ apiJson: activeV2 }, { purchaseToken: 'short' });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'invalid_token');
}

// --- test purchase → sandbox env -----------------------
{
  const r = await verify({ apiJson: { ...activeV2, testPurchase: {} } });
  assert.equal(r.ok, true);
  assert.equal(r.subscription.environment, 'sandbox');
}

// --- canceled context → cancellation reason -----------
{
  const r = await verify({ apiJson: { ...activeV2, subscriptionState: 'SUBSCRIPTION_STATE_CANCELED', canceledStateContext: { userInitiatedCancellation: {} }, lineItems: [{ ...activeV2.lineItems[0], autoRenewingPlan: { autoRenewEnabled: false } }] } });
  assert.equal(r.subscription.cancellationReason, 'user_cancelled');
}

console.log('Google verify: config, OAuth assertion, state matrix, error matrix, timeout, not_configured — verified');
