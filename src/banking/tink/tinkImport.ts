import type {
  TinkTransaction,
} from './tinkClient';

export type GroupedTinkImport<T> = {
  grouped: Map<string, T[]>;

  assignedCount: number;

  unmatchedCount: number;
};

/**
 * Ordnet jede Provider-Transaktion genau dem
 * lokalen Konto zu, dessen externe ID Tink
 * geliefert hat. Fehlende/ungueltige Zuordnung
 * wird niemals durch ein beliebiges Konto ersetzt.
 */
export function groupTinkTransactionsByLocalAccount<T>(
  transactions: readonly TinkTransaction[],
  accountIdMap: ReadonlyMap<string, string>,
  mapTransaction: (transaction: TinkTransaction) => T | null,
): GroupedTinkImport<T> {
  const grouped =
    new Map<string, T[]>();

  let assignedCount = 0;
  let unmatchedCount = 0;

  for (const transaction of transactions) {
    const localAccountId =
      transaction.accountId
        ? accountIdMap.get(transaction.accountId)
        : undefined;

    const mapped =
      mapTransaction(transaction);

    if (!localAccountId || !mapped) {
      unmatchedCount += 1;
      continue;
    }

    const accountTransactions =
      grouped.get(localAccountId) ?? [];

    accountTransactions.push(mapped);
    grouped.set(localAccountId, accountTransactions);
    assignedCount += 1;
  }

  return {
    grouped,
    assignedCount,
    unmatchedCount,
  };
}
