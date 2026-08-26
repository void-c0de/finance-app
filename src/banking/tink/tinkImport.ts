import type {
  TinkAmount,
  TinkTransaction,
} from './tinkClient';

import type {
  TransactionBookingStatus,
} from '@/types/finance';

export function mapTinkBookingStatus(
  status: TinkTransaction['status'],
): TransactionBookingStatus {
  if (status === 'PENDING') {
    return 'pending';
  }

  if (status === 'BOOKED') {
    return 'booked';
  }

  return 'unknown';
}

export type ParsedTinkAmount = {
  unscaledValue?: string;

  scale?: string;

  currencyCode?: string;
};

/** Akzeptiert Data-v2- und Legacy-Betragsformen. */
export function readTinkAmount(
  value: unknown,
): ParsedTinkAmount | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const record =
    value as Record<string, unknown>;

  const direct =
    typeof record.unscaledValue === 'string'
      ? record as unknown as TinkAmount
      : undefined;

  const nestedRecord =
    record.value && typeof record.value === 'object'
      ? record.value as Record<string, unknown>
      : undefined;

  const nested =
    typeof nestedRecord?.unscaledValue === 'string'
      ? nestedRecord as unknown as TinkAmount
      : undefined;

  const resolved = direct ?? nested;

  if (!resolved) {
    return null;
  }

  return {
    unscaledValue: resolved.unscaledValue,
    scale: resolved.scale,
    currencyCode:
      typeof record.currencyCode === 'string'
        ? record.currencyCode
        : resolved.currencyCode,
  };
}

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
