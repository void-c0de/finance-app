import type { BankAccount, Transaction } from '@/types/finance';

function normalizeIban(value?: string): string {
  return (value ?? '').replace(/\s+/g, '').toUpperCase();
}

export function detectInternalTransferIds(
  transactions: readonly Transaction[],
  accounts: readonly BankAccount[],
): Set<string> {
  const ibanByAccount = new Map(
    accounts
      .map((account) => [account.id, normalizeIban(account.iban)] as const)
      .filter((entry) => entry[1].length >= 15),
  );
  const booked = transactions.filter(
    (transaction) => transaction.bookingStatus !== 'pending',
  );
  const detected = new Set<string>();

  for (const expense of booked) {
    if (expense.direction !== 'expense' || detected.has(expense.id)) continue;

    const destinationIban = normalizeIban(expense.counterpartyIBAN);
    const candidates = booked.filter((income) => {
      if (
        income.direction !== 'income' || income.accountId === expense.accountId ||
        income.amountMinor !== expense.amountMinor || income.currency !== expense.currency
      ) return false;

      const proximityDays = Math.abs(
        Date.parse(income.bookingDate) - Date.parse(expense.bookingDate),
      ) / (24 * 60 * 60 * 1000);
      if (proximityDays > 3) return false;

      const sourceIban = normalizeIban(income.counterpartyIBAN);
      if (destinationIban) {
        return destinationIban === ibanByAccount.get(income.accountId);
      }

      return Boolean(
        sourceIban && sourceIban === ibanByAccount.get(expense.accountId),
      );
    });

    if (candidates.length === 1) {
      detected.add(expense.id);
      detected.add(candidates[0].id);
    }
  }

  return detected;
}
