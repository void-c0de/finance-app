import assert from 'node:assert/strict';
import {
  extendPremiumUntil,
  canConfigureGoalTracking,
  hasCapability,
  normalizeProductAccess,
  PRODUCT_CAPABILITIES,
  STANDARD_ACCESS,
} from '../src/services/entitlementCore.ts';

const now = new Date('2026-08-26T12:00:00.000Z');
assert.equal(hasCapability(STANDARD_ACCESS, 'core_finance'), true);
assert.equal(hasCapability(STANDARD_ACCESS, 'manual_categorization'), true);
assert.equal(hasCapability(STANDARD_ACCESS, 'basic_planning'), true);
assert.equal(hasCapability(STANDARD_ACCESS, 'premium_analytics'), false);
assert.equal(hasCapability(STANDARD_ACCESS, 'advanced_planning'), false);
assert.equal(hasCapability(STANDARD_ACCESS, 'advanced_category_rules'), false);
assert.equal(hasCapability(STANDARD_ACCESS, 'coupon_admin'), false);
assert.equal(canConfigureGoalTracking(STANDARD_ACCESS, 'manual'), true);
assert.equal(canConfigureGoalTracking(STANDARD_ACCESS, 'account_balance'), false);
assert.equal(canConfigureGoalTracking(STANDARD_ACCESS, 'transaction_rule'), false);
const premium = normalizeProductAccess({ isPremium: true, premiumExpiresAt: '2026-09-01T00:00:00Z', source: 'coupon' }, now);
assert.equal(hasCapability(premium, 'advanced_planning'), true);
assert.equal(hasCapability(premium, 'coupon_admin'), false);
assert.equal(canConfigureGoalTracking(premium, 'account_balance'), true);
const expired = normalizeProductAccess({ isPremium: true, premiumExpiresAt: '2026-08-01T00:00:00Z', source: 'coupon' }, now);
assert.equal(expired.isPremium, false);
const admin = normalizeProductAccess({ role: 'superuser' }, now);
assert.equal(canConfigureGoalTracking(admin, 'transaction_rule'), true);
assert.equal(canConfigureGoalTracking(admin, 'manual'), true);
assert.equal(hasCapability(admin, 'coupon_admin'), true);
assert.equal(hasCapability(admin, 'premium_analytics'), true);
for (const capability of PRODUCT_CAPABILITIES) {
  assert.equal(hasCapability(admin, capability.id), true, `Superuser must inherit ${capability.id}`);
  if (capability.availability === 'standard') assert.equal(hasCapability(STANDARD_ACCESS, capability.id), true);
  if (capability.availability === 'premium') assert.equal(hasCapability(STANDARD_ACCESS, capability.id), false);
  if (capability.availability === 'superuser') assert.equal(hasCapability(premium, capability.id), false);
}
const futureStore = normalizeProductAccess({ isPremium: true, source: 'google_play' }, now);
assert.equal(futureStore.source, 'google_play');
assert.equal(extendPremiumUntil('2026-09-05T12:00:00.000Z', 30, now), '2026-10-05T12:00:00.000Z');
assert.equal(extendPremiumUntil('2026-08-01T12:00:00.000Z', 7, now), '2026-09-02T12:00:00.000Z');
console.log('Product entitlements: OK');
