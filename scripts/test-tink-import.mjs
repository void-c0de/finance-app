import assert from 'node:assert/strict';

import {
  groupTinkTransactionsByLocalAccount,
  readTinkAmount,
} from '../src/banking/tink/tinkImport.ts';

const accountMap = new Map([
  ['external-a', 'local-a'],
  ['external-b', 'local-b'],
]);

const result = groupTinkTransactionsByLocalAccount(
  [
    { accountId: 'external-a', id: 'transaction-a' },
    { accountId: 'external-b', id: 'transaction-b' },
    { accountId: 'unknown', id: 'transaction-unknown' },
    { id: 'transaction-without-account' },
  ],
  accountMap,
  (transaction) => transaction.id ?? null,
);

assert.deepEqual(result.grouped.get('local-a'), ['transaction-a']);
assert.deepEqual(result.grouped.get('local-b'), ['transaction-b']);
assert.equal(result.assignedCount, 2);
assert.equal(result.unmatchedCount, 2);
assert.equal(result.grouped.size, 2);

assert.deepEqual(
  readTinkAmount({
    currencyCode: 'EUR',
    value: {
      unscaledValue: '-1234',
      scale: '-2',
    },
  }),
  {
    currencyCode: 'EUR',
    unscaledValue: '-1234',
    scale: '-2',
  },
);

assert.deepEqual(
  readTinkAmount({
    currencyCode: 'SEK',
    unscaledValue: '500',
    scale: '-2',
  }),
  {
    currencyCode: 'SEK',
    unscaledValue: '500',
    scale: '-2',
  },
);

console.log('Tink account grouping: OK');
