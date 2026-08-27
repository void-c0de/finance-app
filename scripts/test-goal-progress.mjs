import assert from 'node:assert/strict';
import { resolveGoalProgress } from '../src/services/goalProgressCore.ts';

const manual = resolveGoalProgress({
  trackingMode: 'manual', startingAmountMinor: 10000,
  contributionAmountsMinor: [2500, -500], linkedAccountBalanceMinor: 75000,
  lastKnownAmountMinor: 0,
});
assert.deepEqual(manual, { amountMinor: 12000, source: 'contributions', linkedAccountAvailable: true });

const linked = resolveGoalProgress({
  trackingMode: 'account_balance', startingAmountMinor: 10000,
  contributionAmountsMinor: [25000], linkedAccountBalanceMinor: 75000,
  lastKnownAmountMinor: 50000,
});
assert.deepEqual(linked, { amountMinor: 75000, source: 'account_balance', linkedAccountAvailable: true });
assert.equal(Math.round((linked.amountMinor / 300000) * 100), 25);

const changed = resolveGoalProgress({
  trackingMode: 'account_balance', startingAmountMinor: 0,
  contributionAmountsMinor: [], linkedAccountBalanceMinor: 90000,
  lastKnownAmountMinor: 75000,
});
assert.equal(changed.amountMinor, 90000);

const unavailable = resolveGoalProgress({
  trackingMode: 'account_balance', startingAmountMinor: 0,
  contributionAmountsMinor: [99999], linkedAccountBalanceMinor: null,
  lastKnownAmountMinor: 75000,
});
assert.deepEqual(unavailable, { amountMinor: 75000, source: 'last_known', linkedAccountAvailable: false });

console.log('Savings goal progress modes: OK');
