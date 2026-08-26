import assert from 'node:assert/strict';

import {
  detectRecurringTransactionIds,
} from '../src/services/recurringDetectionCore.ts';

function transaction(id, date, amount, merchant, overrides = {}) {
  return {
    id,
    accountId: 'account-a',
    amountMinor: amount,
    currency: 'EUR',
    direction: 'expense',
    bookingDate: date,
    bookingStatus: 'booked',
    description: merchant,
    counterpartyName: merchant,
    createdAt: date,
    ...overrides,
  };
}

const detected = detectRecurringTransactionIds([
  transaction('netflix-1', '2026-05-02', 1299, 'NETFLIX 123456'),
  transaction('netflix-2', '2026-06-02', 1299, 'Netflix 654321'),
  transaction('netflix-3', '2026-07-02', 1399, 'Netflix 777777'),
  transaction('shop-1', '2026-06-01', 2599, 'Shop'),
  transaction('shop-2', '2026-06-04', 2599, 'Shop'),
  transaction('pending-1', '2026-06-02', 999, 'Pending Service', {
    bookingStatus: 'pending',
  }),
  transaction('pending-2', '2026-07-02', 999, 'Pending Service', {
    bookingStatus: 'pending',
  }),
  transaction('transfer-1', '2026-06-05', 50000, 'Eigenes Sparkonto', {
    isInternalTransfer: true,
  }),
  transaction('transfer-2', '2026-07-05', 50000, 'Eigenes Sparkonto', {
    isInternalTransfer: true,
  }),
]);

assert.deepEqual(
  [...detected].sort(),
  ['netflix-1', 'netflix-2', 'netflix-3'],
);

console.log('Recurring transaction detection: OK');
