import assert from 'node:assert/strict';

import {
  classifyCadence,
  classifyRecurring,
  isAmountStable,
} from '../src/services/recurringInsightsCore.ts';

// Cadence
assert.equal(classifyCadence(30), 'monthly');
assert.equal(classifyCadence(7), 'weekly');
assert.equal(classifyCadence(91), 'quarterly');
assert.equal(classifyCadence(365), 'yearly');
assert.equal(classifyCadence(50), 'irregular');
assert.equal(classifyCadence(null), 'unknown');

// Stability tolerance
assert.equal(isAmountStable([1000, 1000, 1000]), true);
assert.equal(isAmountStable([1000, 1200, 1000]), false, '20 % Abweichung ist nicht mehr stabil');
assert.equal(isAmountStable([999, 1001, 1000]), true, 'Cent-Rauschen bleibt stabil');

// Subscription by merchant name
const netflix = classifyRecurring({
  direction: 'expense', merchant: 'NETFLIX.COM', amountsMinor: [1799, 1799, 1799],
  intervalDaysMedian: 30, occurrences: 3,
});
assert.equal(netflix.kind, 'subscription');
assert.equal(netflix.confidence, 'high');

// Bill by keyword, unstable amount -> medium
const strom = classifyRecurring({
  direction: 'expense', merchant: 'Stadtwerke München Strom', amountsMinor: [8000, 12000, 9000],
  intervalDaysMedian: 30, occurrences: 3,
});
assert.equal(strom.kind, 'bill');
assert.equal(strom.confidence, 'medium');

// Salary
const salary = classifyRecurring({
  direction: 'income', merchant: 'Muster GmbH Gehalt', amountsMinor: [320000, 320000],
  intervalDaysMedian: 30, occurrences: 2,
});
assert.equal(salary.kind, 'income');
assert.equal(salary.confidence, 'high');

// Unknown recurring expense with stable monthly amount -> uncertain, not subscription
const mystery = classifyRecurring({
  direction: 'expense', merchant: 'PayPal Europe', amountsMinor: [999, 999, 999, 999],
  intervalDaysMedian: 30, occurrences: 4,
});
assert.equal(mystery.kind, 'uncertain');
assert.equal(mystery.confidence, 'medium');

// One-off / irregular -> low confidence uncertain
const oneOff = classifyRecurring({
  direction: 'expense', merchant: 'Random Shop', amountsMinor: [4500],
  intervalDaysMedian: null, occurrences: 1,
});
assert.equal(oneOff.kind, 'uncertain');
assert.equal(oneOff.confidence, 'low');

// Manual override always wins
const overridden = classifyRecurring({
  direction: 'expense', merchant: 'NETFLIX.COM', amountsMinor: [1799, 1799],
  intervalDaysMedian: 30, occurrences: 2, manualKind: 'bill',
});
assert.equal(overridden.kind, 'bill');
assert.equal(overridden.confidence, 'high');
assert.equal(overridden.reason, 'Manuell zugeordnet');

console.log('Recurring classification: all tests passed');
