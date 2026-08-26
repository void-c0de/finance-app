import assert from 'node:assert/strict';
import {
  extendPremiumUntil,
  hasCapability,
  normalizeProductAccess,
  STANDARD_ACCESS,
} from '../src/services/entitlementCore.ts';

const now = new Date('2026-08-26T12:00:00.000Z');
assert.equal(hasCapability(STANDARD_ACCESS, 'core_finance'), true);
assert.equal(hasCapability(STANDARD_ACCESS, 'premium_analytics'), false);
const premium = normalizeProductAccess({ isPremium: true, premiumExpiresAt: '2026-09-01T00:00:00Z', source: 'coupon' }, now);
assert.equal(hasCapability(premium, 'advanced_planning'), true);
const expired = normalizeProductAccess({ isPremium: true, premiumExpiresAt: '2026-08-01T00:00:00Z', source: 'coupon' }, now);
assert.equal(expired.isPremium, false);
const admin = normalizeProductAccess({ role: 'superuser' }, now);
assert.equal(hasCapability(admin, 'coupon_admin'), true);
assert.equal(hasCapability(admin, 'premium_analytics'), true);
assert.equal(extendPremiumUntil('2026-09-05T12:00:00.000Z', 30, now), '2026-10-05T12:00:00.000Z');
assert.equal(extendPremiumUntil('2026-08-01T12:00:00.000Z', 7, now), '2026-09-02T12:00:00.000Z');
console.log('Product entitlements: OK');
