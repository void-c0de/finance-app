import assert from 'node:assert/strict';

import {
  buildCategoryTrends,
  buildMonthlyComparison,
  monthKeyOf,
  shiftMonthKey,
} from '../src/services/analyticsCore.ts';

function tx(over) {
  return {
    id: over.id,
    accountId: over.accountId ?? 'acc',
    amountMinor: over.amountMinor,
    currency: 'EUR',
    direction: over.direction ?? 'expense',
    bookingDate: over.bookingDate,
    bookingStatus: over.bookingStatus ?? 'booked',
    description: over.description ?? '',
    counterpartyName: over.merchant,
    categoryId: over.categoryId ?? null,
    isInternalTransfer: over.isInternalTransfer ?? false,
    createdAt: over.bookingDate,
  };
}

// --- month key helpers -------------------------------------------------
assert.equal(monthKeyOf(new Date('2026-08-15T00:00:00Z')), '2026-08');
assert.equal(shiftMonthKey('2026-08', -1), '2026-07');
assert.equal(shiftMonthKey('2026-01', -1), '2025-12');
assert.equal(shiftMonthKey('2026-12', 1), '2027-01');

const categories = [
  { id: 'food', name: 'Lebensmittel' },
  { id: 'fun', name: 'Freizeit' },
];
const reference = new Date('2026-08-20T12:00:00Z');

const transactions = [
  // July (previous)
  tx({ id: 'j1', bookingDate: '2026-07-05', amountMinor: 10_000, categoryId: 'food' }),
  tx({ id: 'j2', bookingDate: '2026-07-20', amountMinor: 3_000, categoryId: 'fun' }),
  tx({ id: 'j3', bookingDate: '2026-07-28', amountMinor: 250_000, direction: 'income' }),
  // August (current)
  tx({ id: 'a1', bookingDate: '2026-08-04', amountMinor: 12_000, categoryId: 'food' }),
  tx({ id: 'a2', bookingDate: '2026-08-06', amountMinor: 6_000, categoryId: 'food' }),
  tx({ id: 'a3', bookingDate: '2026-08-10', amountMinor: -2_000, categoryId: 'food' }), // Erstattung
  tx({ id: 'a4', bookingDate: '2026-08-15', amountMinor: 250_000, direction: 'income' }),
  // noise that must be ignored
  tx({ id: 'p1', bookingDate: '2026-08-16', amountMinor: 9_999, categoryId: 'fun', bookingStatus: 'pending' }),
  tx({ id: 't1', bookingDate: '2026-08-17', amountMinor: 50_000, categoryId: 'fun', isInternalTransfer: true }),
];

const cmp = buildMonthlyComparison({ transactions, categories, referenceDate: reference });
assert.equal(cmp.currentKey, '2026-08');
assert.equal(cmp.previousKey, '2026-07');
assert.equal(cmp.hasEnoughData, true);

// food: July 10_000 -> August 12_000 + 6_000 - 2_000 = 16_000
assert.equal(cmp.expenses.previousMinor, 13_000, 'Vormonat Ausgaben (food+fun)');
assert.equal(cmp.expenses.currentMinor, 16_000, 'Erstattung senkt die aktuelle Ausgabe; pending/transfer ignoriert');
assert.equal(cmp.expenses.deltaMinor, 3_000);
assert.equal(Math.round(cmp.expenses.deltaPercent * 100), 23);
assert.equal(cmp.expenses.direction, 'up');

assert.equal(cmp.income.currentMinor, 250_000);
assert.equal(cmp.income.previousMinor, 250_000);
assert.equal(cmp.income.deltaMinor, 0);
assert.equal(cmp.income.direction, 'flat');

const foodDelta = cmp.categoryDeltas.find((entry) => entry.categoryId === 'food');
assert.equal(foodDelta.deltaMinor, 6_000, 'food +6.000');
const funDelta = cmp.categoryDeltas.find((entry) => entry.categoryId === 'fun');
assert.equal(funDelta.deltaMinor, -3_000, 'fun -3.000 (pending/transfer zählen nicht)');
assert.equal(cmp.topIncrease.categoryId, 'food');
assert.equal(cmp.topDecrease.categoryId, 'fun');

// --- no baseline: previous month empty -> deltaPercent null, hasEnoughData false
const soloAugust = buildMonthlyComparison({
  transactions: transactions.filter((entry) => entry.bookingDate.startsWith('2026-08')),
  categories,
  referenceDate: reference,
});
assert.equal(soloAugust.hasEnoughData, false, 'ohne Vormonat kein belastbarer Vergleich');
assert.equal(soloAugust.expenses.deltaPercent, null, 'kein Prozentwert ohne Basis');
assert.equal(soloAugust.expenses.hasBaseline, false);

// --- category trends -------------------------------------------------
const trendTx = [];
for (let month = 3; month <= 8; month += 1) {
  const mm = String(month).padStart(2, '0');
  trendTx.push(tx({ id: `f${month}`, bookingDate: `2026-${mm}-10`, amountMinor: 5_000 + month * 1_000, categoryId: 'food' }));
  trendTx.push(tx({ id: `g${month}`, bookingDate: `2026-${mm}-12`, amountMinor: 4_000, categoryId: 'fun' }));
}
const report = buildCategoryTrends({ transactions: trendTx, categories, referenceDate: reference, months: 6 });
assert.equal(report.monthKeys.length, 6);
assert.equal(report.monthKeys[0], '2026-03');
assert.equal(report.monthKeys[5], '2026-08');
const foodTrend = report.trends.find((entry) => entry.categoryId === 'food');
assert.equal(foodTrend.points.length, 6);
assert.equal(foodTrend.currentMinor, 13_000);
assert.equal(foodTrend.slope, 'rising', 'food steigt monatlich');
const funTrend = report.trends.find((entry) => entry.categoryId === 'fun');
assert.equal(funTrend.slope, 'stable', 'fun konstant');
assert.ok(foodTrend.sharePercent > 0 && foodTrend.sharePercent <= 1);

console.log('Analytics 2.0: all tests passed');
