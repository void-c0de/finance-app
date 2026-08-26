import type {
  Transaction,
} from '../types/finance';

const DAY_MS = 24 * 60 * 60 * 1000;

type Candidate = {
  transaction: Transaction;
  timestamp: number;
};

function median(values: readonly number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);

  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

function hasStableAmount(candidates: readonly Candidate[]): boolean {
  const amounts = candidates.map(({ transaction }) => transaction.amountMinor);
  const typical = median(amounts);
  const tolerance = Math.max(100, typical * 0.15);

  return amounts.every(
    (amount) => Math.abs(amount - typical) <= tolerance,
  );
}

function hasRecurringCadence(candidates: readonly Candidate[]): boolean {
  if (candidates.length < 2) {
    return false;
  }

  const intervals: number[] = [];

  for (let index = 1; index < candidates.length; index += 1) {
    intervals.push(
      (candidates[index].timestamp - candidates[index - 1].timestamp) / DAY_MS,
    );
  }

  const matching = intervals.filter(
    (days) =>
      (days >= 6 && days <= 9) ||
      (days >= 25 && days <= 36) ||
      (days >= 80 && days <= 100) ||
      (days >= 350 && days <= 380),
  ).length;

  return matching >= Math.max(1, intervals.length - 1);
}

export function detectRecurringTransactionIds(
  transactions: readonly Transaction[],
  normalizeMerchant: (
    value: string | null | undefined,
  ) => string = (value) =>
    (value ?? '')
      .replace(/\b\d{6,}\b/g, ' ')
      .replace(/\s+/g, ' ')
      .trim(),
): Set<string> {
  const groups = new Map<string, Candidate[]>();

  for (const transaction of transactions) {
    if (
      transaction.direction !== 'expense' ||
      transaction.bookingStatus === 'pending' ||
      transaction.amountMinor <= 0
    ) {
      continue;
    }

    const timestamp = Date.parse(transaction.bookingDate);
    const merchant = normalizeMerchant(
      transaction.counterpartyName ?? transaction.description,
    ).toLocaleLowerCase('de-DE');

    if (!merchant || Number.isNaN(timestamp)) {
      continue;
    }

    const key = `${transaction.accountId}|${transaction.currency}|${merchant}`;
    const group = groups.get(key) ?? [];

    group.push({ transaction, timestamp });
    groups.set(key, group);
  }

  const detected = new Set<string>();

  for (const group of groups.values()) {
    group.sort((left, right) => left.timestamp - right.timestamp);

    if (hasRecurringCadence(group) && hasStableAmount(group)) {
      for (const { transaction } of group) {
        detected.add(transaction.id);
      }
    }
  }

  return detected;
}
