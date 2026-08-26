import assert from 'node:assert/strict';

import {
  findReplacedPendingId,
} from '../src/services/pendingReconciliationCore.ts';

const booked = {
  externalTransactionId: 'booked-2',
  amountMinor: 1299,
  currency: 'EUR',
  direction: 'expense',
  bookingDate: '2026-08-05',
  description: 'NETFLIX 987654',
  counterpartyName: 'Netflix',
};

assert.equal(
  findReplacedPendingId(booked, [
    {
      id: 'pending-local',
      externalTransactionId: 'pending-1',
      amountMinor: 1299,
      currency: 'EUR',
      direction: 'expense',
      bookingDate: '2026-08-03',
      description: 'Netflix reserviert',
      counterpartyName: 'Netflix',
    },
  ]),
  'pending-local',
);

assert.equal(
  findReplacedPendingId(booked, [
    {
      id: 'wrong-amount',
      amountMinor: 1599,
      currency: 'EUR',
      direction: 'expense',
      bookingDate: '2026-08-03',
      description: 'Netflix',
      counterpartyName: 'Netflix',
    },
  ]),
  null,
);

assert.equal(
  findReplacedPendingId(booked, [
    {
      id: 'ambiguous-a',
      amountMinor: 1299,
      currency: 'EUR',
      direction: 'expense',
      bookingDate: '2026-08-03',
      description: 'Netflix',
      counterpartyName: 'Netflix',
    },
    {
      id: 'ambiguous-b',
      amountMinor: 1299,
      currency: 'EUR',
      direction: 'expense',
      bookingDate: '2026-08-04',
      description: 'Netflix',
      counterpartyName: 'Netflix',
    },
  ]),
  null,
);

assert.equal(
  findReplacedPendingId(booked, [
    {
      id: 'late-booking',
      amountMinor: 1299,
      currency: 'EUR',
      direction: 'expense',
      bookingDate: '2026-07-20',
      description: 'Netflix',
      counterpartyName: 'Netflix',
    },
  ]),
  null,
);

assert.equal(
  findReplacedPendingId(booked, [
    {
      id: 'different-merchant',
      amountMinor: 1299,
      currency: 'EUR',
      direction: 'expense',
      bookingDate: '2026-08-03',
      description: 'Spotify',
      counterpartyName: 'Spotify',
    },
  ]),
  null,
);

assert.equal(
  findReplacedPendingId(booked, [
    {
      id: 'same-provider-id',
      externalTransactionId: 'booked-2',
      amountMinor: 1299,
      currency: 'EUR',
      direction: 'expense',
      bookingDate: '2026-08-03',
      description: 'Netflix',
      counterpartyName: 'Netflix',
    },
  ]),
  null,
);

console.log('Pending/booked reconciliation: OK');
