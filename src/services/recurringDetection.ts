import {
  getDatabase,
} from '@/db/database';

import type {
  Transaction,
} from '@/types/finance';

import {
  normalizeMerchantName,
} from '@/services/merchantNormalization';

import {
  detectRecurringTransactionIds as detectRecurringIds,
} from './recurringDetectionCore';

export function detectRecurringTransactionIds(
  transactions: readonly Transaction[],
): Set<string> {
  return detectRecurringIds(
    transactions,
    normalizeMerchantName,
  );
}

export async function detectAndPersistRecurringTransactions(
  transactions:
    readonly Transaction[],
): Promise<number> {
  const detected =
    detectRecurringTransactionIds(transactions);

  if (detected.size === 0) {
    return 0;
  }

  const db =
    await getDatabase();

  const ids =
    [...detected];

  const placeholders =
    ids.map(() => '?').join(', ');

  const now =
    new Date().toISOString();

  const result =
    await db.runAsync(
      `UPDATE transactions
       SET is_recurring = 1,
           updated_at = ?
       WHERE deleted_at IS NULL
         AND is_recurring = 0
         AND id IN (${placeholders})`,
      now,
      ...ids,
    );

  return result.changes;
}
