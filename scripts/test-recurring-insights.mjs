import assert from 'node:assert/strict';

import { buildRecurringInsights } from '../src/services/recurringInsightsCore.ts';

function tx(over) {
  return {
    id: over.id,
    accountId: over.accountId ?? 'acc-giro',
    amountMinor: over.amountMinor,
    currency: 'EUR',
    direction: over.direction ?? 'expense',
    bookingDate: over.bookingDate,
    bookingStatus: over.bookingStatus ?? 'booked',
    description: over.description ?? over.merchant ?? '',
    counterpartyName: over.merchant,
    isRecurring: over.isRecurring ?? true,
    isInternalTransfer: over.isInternalTransfer ?? false,
    createdAt: over.bookingDate,
  };
}

const reference = new Date('2026-08-27T00:00:00.000Z');

const transactions = [
  // Netflix — three months, stable
  tx({ id: 'n1', merchant: 'NETFLIX.COM', amountMinor: 1799, bookingDate: '2026-06-04' }),
  tx({ id: 'n2', merchant: 'NETFLIX.COM', amountMinor: 1799, bookingDate: '2026-07-04' }),
  tx({ id: 'n3', merchant: 'NETFLIX.COM', amountMinor: 1799, bookingDate: '2026-08-04' }),
  // Stadtwerke electricity — bill, varying amount
  tx({ id: 's1', merchant: 'Stadtwerke Strom', amountMinor: 8000, bookingDate: '2026-06-15' }),
  tx({ id: 's2', merchant: 'Stadtwerke Strom', amountMinor: 8000, bookingDate: '2026-07-15' }),
  tx({ id: 's3', merchant: 'Stadtwerke Strom', amountMinor: 8000, bookingDate: '2026-08-15' }),
  // Salary — recurring income
  tx({ id: 'g1', merchant: 'Firma X Gehalt', amountMinor: 320000, direction: 'income', bookingDate: '2026-06-27' }),
  tx({ id: 'g2', merchant: 'Firma X Gehalt', amountMinor: 320000, direction: 'income', bookingDate: '2026-07-27' }),
  // Internal transfer flagged recurring — must be ignored entirely
  tx({ id: 't1', merchant: 'Sparen', amountMinor: 20000, bookingDate: '2026-07-01', isInternalTransfer: true }),
  tx({ id: 't2', merchant: 'Sparen', amountMinor: 20000, bookingDate: '2026-08-01', isInternalTransfer: true }),
];

const result = buildRecurringInsights(transactions, { referenceDate: reference });

const netflix = result.items.find((item) => item.title.toLowerCase().includes('netflix'));
assert.ok(netflix, 'Netflix-Position existiert');
assert.equal(netflix.kind, 'subscription');
assert.equal(netflix.cadence, 'monthly');
assert.equal(netflix.monthlyEstimateMinor, 1799);

const strom = result.items.find((item) => item.title.toLowerCase().includes('stadtwerke'));
assert.equal(strom.kind, 'bill');

const gehalt = result.items.find((item) => item.direction === 'income');
assert.equal(gehalt.kind, 'income');

assert.equal(
  result.items.some((item) => item.title.toLowerCase().includes('sparen')),
  false,
  'Interne Überweisungen erzeugen keine wiederkehrende Position',
);

assert.equal(result.summary.subscriptionCount, 1);
assert.equal(result.summary.billCount, 1);
assert.equal(result.summary.incomeCount, 1);
assert.equal(result.summary.monthlyCommittedMinor, 1799 + 8000);
assert.equal(result.summary.monthlyRecurringIncomeMinor, 320000);

// upcoming: only expenses, within horizon, sorted ascending by nextDate
assert.ok(result.upcoming.length >= 2);
assert.equal(result.upcoming.every((item) => item.direction === 'expense'), true);
for (let index = 1; index < result.upcoming.length; index += 1) {
  assert.ok(result.upcoming[index - 1].nextDate <= result.upcoming[index].nextDate);
}

console.log('Recurring insights: all tests passed');
