import assert from 'node:assert/strict';

import {
  canCreateWithinQuota,
  canConfigureGoalTracking,
  hasCapability,
  normalizeProductAccess,
  PREMIUM_GATE_COPY,
  PREMIUM_PILLARS,
  PRODUCT_CAPABILITIES,
  quotaState,
  STANDARD_ACCESS,
} from '../src/services/entitlementCore.ts';

const now = new Date('2026-08-27T00:00:00Z');
const premium = normalizeProductAccess({ isPremium: true, premiumExpiresAt: '2026-12-01T00:00:00Z', source: 'coupon' }, now);
const expired = normalizeProductAccess({ isPremium: true, premiumExpiresAt: '2026-01-01T00:00:00Z', source: 'coupon' }, now);
const superuser = normalizeProductAccess({ role: 'superuser' }, now);

// --- capabilities: core financial truth is always free -----------------
for (const capability of ['core_finance', 'manual_categorization', 'basic_planning']) {
  assert.equal(hasCapability(STANDARD_ACCESS, capability), true, `${capability} ist immer frei`);
  assert.equal(hasCapability(expired, capability), true, `${capability} bleibt nach Ablauf frei`);
}

// --- premium capabilities -------------------------------------------
for (const capability of ['advanced_planning', 'advanced_category_rules', 'premium_analytics', 'advanced_exports', 'full_finance_export', 'premium_themes']) {
  assert.equal(hasCapability(STANDARD_ACCESS, capability), false, `Standard hat ${capability} nicht`);
  assert.equal(hasCapability(premium, capability), true, `Premium hat ${capability}`);
  assert.equal(hasCapability(superuser, capability), true, `Superuser erbt ${capability}`);
  assert.equal(hasCapability(expired, capability), false, `abgelaufenes Premium verliert ${capability}`);
}

// --- superuser keeps admin, premium user does not -------------------
for (const capability of ['coupon_admin', 'user_entitlement_admin', 'release_admin', 'support_diagnostics']) {
  assert.equal(hasCapability(superuser, capability), true);
  assert.equal(hasCapability(premium, capability), false, `Premium ist kein Admin: ${capability}`);
}

// --- registry consistency -----------------------------------------
for (const entry of PRODUCT_CAPABILITIES) {
  if (entry.availability === 'standard') assert.equal(hasCapability(STANDARD_ACCESS, entry.id), true);
  if (entry.availability === 'premium') assert.equal(hasCapability(premium, entry.id), true);
  if (entry.availability === 'superuser') assert.equal(hasCapability(superuser, entry.id), true);
  assert.equal(hasCapability(superuser, entry.id), true, `Superuser bekommt alles: ${entry.id}`);
}

// --- goal tracking gate --------------------------------------------
assert.equal(canConfigureGoalTracking(STANDARD_ACCESS, 'manual'), true, 'manuelle Ziele bleiben frei');
assert.equal(canConfigureGoalTracking(STANDARD_ACCESS, 'account_balance'), false);
assert.equal(canConfigureGoalTracking(premium, 'account_balance'), true);
assert.equal(canConfigureGoalTracking(superuser, 'transaction_rule'), true);

// --- quotas: budgets ----------------------------------------------
{
  const below = quotaState(STANDARD_ACCESS, 'activeBudgets', 1);
  assert.equal(below.limit, 2);
  assert.equal(below.remaining, 1);
  assert.equal(below.reached, false);
  assert.equal(canCreateWithinQuota(STANDARD_ACCESS, 'activeBudgets', 1), true);

  const atLimit = quotaState(STANDARD_ACCESS, 'activeBudgets', 2);
  assert.equal(atLimit.reached, true);
  assert.equal(atLimit.remaining, 0);
  assert.equal(canCreateWithinQuota(STANDARD_ACCESS, 'activeBudgets', 2), false);

  // grandfathering: existing standard user already over the new limit
  const over = quotaState(STANDARD_ACCESS, 'activeBudgets', 5);
  assert.equal(over.reached, true, 'kein weiteres Budget');
  assert.equal(over.grandfathered, true, 'bestehende 5 Budgets bleiben');
  assert.equal(over.used, 5);

  // premium is unlimited
  const prem = quotaState(premium, 'activeBudgets', 42);
  assert.equal(prem.unlimited, true);
  assert.equal(prem.reached, false);
  assert.equal(canCreateWithinQuota(premium, 'activeBudgets', 999), true);

  // superuser is unlimited
  assert.equal(quotaState(superuser, 'activeBudgets', 999).unlimited, true);

  // premium expiry: an object count over the free limit is grandfathered, not deleted
  const afterExpiry = quotaState(expired, 'activeBudgets', 7);
  assert.equal(afterExpiry.grandfathered, true);
  assert.equal(afterExpiry.reached, true);
}

// --- quotas: manual goals ---------------------------------------
{
  assert.equal(canCreateWithinQuota(STANDARD_ACCESS, 'activeManualGoals', 1), true);
  assert.equal(canCreateWithinQuota(STANDARD_ACCESS, 'activeManualGoals', 2), false);
  assert.equal(canCreateWithinQuota(premium, 'activeManualGoals', 50), true);
  assert.equal(quotaState(superuser, 'activeManualGoals', 50).unlimited, true);
}

// --- gate copy: every context has value-first, non-manipulative copy ---
const contexts = Object.keys(PREMIUM_GATE_COPY);
assert.ok(contexts.length >= 8);
const banned = /nur heute|letzte chance|verpass|jetzt kaufen|97 personen|!!!/i;
for (const context of contexts) {
  const copy = PREMIUM_GATE_COPY[context];
  assert.ok(copy.title && copy.body && copy.cta && copy.pillar, `${context} vollständig`);
  assert.equal(banned.test(`${copy.title} ${copy.body} ${copy.cta}`), false, `${context} ohne Dark Pattern`);
  assert.ok(PREMIUM_PILLARS.some((pillar) => pillar.id === copy.pillar), `${context} zeigt auf eine echte Säule`);
}

console.log('Product access model: all tests passed');
