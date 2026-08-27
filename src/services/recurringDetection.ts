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
  recurringSeriesKey,
} from '@/services/recurringInsightsCore';

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

function seriesKeyFor(transaction: Transaction): string {
  return recurringSeriesKey(
    transaction.accountId,
    transaction.currency,
    transaction.direction,
    normalizeMerchantName(transaction.counterpartyName ?? transaction.description),
  );
}

/**
 * Setzt `is_recurring` gemäß der Heuristik – respektiert dabei aber vom Nutzer
 * gemutete Serien: für „ist keine wiederkehrende Zahlung"-Serien wird die
 * Markierung nie gesetzt und eine bestehende sogar zurückgenommen, damit die
 * Heuristik den Vorschlag nicht wiederbelebt.
 */
export async function detectAndPersistRecurringTransactions(
  transactions:
    readonly Transaction[],
  options?: { mutedSeriesKeys?: ReadonlySet<string> },
): Promise<number> {
  const muted = options?.mutedSeriesKeys ?? new Set<string>();
  const detected = detectRecurringTransactionIds(transactions);

  const idsById = new Map(transactions.map((transaction) => [transaction.id, transaction]));

  const toMark: string[] = [];
  for (const id of detected) {
    const transaction = idsById.get(id);
    if (transaction && !muted.has(seriesKeyFor(transaction))) {
      toMark.push(id);
    }
  }

  const toUnmark = muted.size
    ? transactions
        .filter(
          (transaction) =>
            transaction.isRecurring && muted.has(seriesKeyFor(transaction)),
        )
        .map((transaction) => transaction.id)
    : [];

  if (toMark.length === 0 && toUnmark.length === 0) {
    return 0;
  }

  const db =
    await getDatabase();

  const now =
    new Date().toISOString();

  let changes = 0;

  if (toMark.length > 0) {
    const placeholders = toMark.map(() => '?').join(', ');
    const result = await db.runAsync(
      `UPDATE transactions
       SET is_recurring = 1,
           updated_at = ?
       WHERE deleted_at IS NULL
         AND is_recurring = 0
         AND id IN (${placeholders})`,
      now,
      ...toMark,
    );
    changes += result.changes;
  }

  if (toUnmark.length > 0) {
    const placeholders = toUnmark.map(() => '?').join(', ');
    const result = await db.runAsync(
      `UPDATE transactions
       SET is_recurring = 0,
           updated_at = ?
       WHERE deleted_at IS NULL
         AND is_recurring = 1
         AND id IN (${placeholders})`,
      now,
      ...toUnmark,
    );
    changes += result.changes;
  }

  return changes;
}
