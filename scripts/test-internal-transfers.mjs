import assert from 'node:assert/strict';
import { detectInternalTransferIds } from '../src/services/internalTransferDetection.ts';

const accounts = [
  { id: 'checking', iban: 'DE11111111111111111111' },
  { id: 'savings', iban: 'DE22222222222222222222' },
];
const transactions = [
  { id: 'out', accountId: 'checking', amountMinor: 50000, currency: 'EUR', direction: 'expense', bookingDate: '2026-08-10', bookingStatus: 'booked', description: 'Umbuchung', counterpartyIBAN: 'DE22222222222222222222' },
  { id: 'in', accountId: 'savings', amountMinor: 50000, currency: 'EUR', direction: 'income', bookingDate: '2026-08-11', bookingStatus: 'booked', description: 'Umbuchung', counterpartyIBAN: 'DE11111111111111111111' },
  { id: 'rent', accountId: 'checking', amountMinor: 50000, currency: 'EUR', direction: 'expense', bookingDate: '2026-08-10', bookingStatus: 'booked', description: 'Miete', counterpartyIBAN: 'DE99999999999999999999' },
];

assert.deepEqual([...detectInternalTransferIds(transactions, accounts)].sort(), ['in', 'out']);
console.log('Internal transfer detection: OK');
