import {
  sumMinorUnits,
} from './money';

import type {
  BankAccount,
  Transaction,
} from '@/types/finance';

export function calculateIncomeMinor(
  transactions:
    readonly Transaction[]
): number {
  return sumMinorUnits(
    transactions
      .filter(
        (transaction) =>
          transaction.bookingStatus !==
            'pending' &&
          !transaction.isInternalTransfer &&
          transaction.direction ===
          'income'
      )
      .map(
        (transaction) =>
          transaction.amountMinor
      )
  );
}

export function calculateExpensesMinor(
  transactions:
    readonly Transaction[]
): number {
  return sumMinorUnits(
    transactions
      .filter(
        (transaction) =>
          transaction.bookingStatus !==
            'pending' &&
          !transaction.isInternalTransfer &&
          transaction.direction ===
          'expense'
      )
      .map(
        (transaction) =>
          transaction.amountMinor
      )
  );
}

export function calculateCashflowMinor(
  transactions:
    readonly Transaction[]
): number {
  const incomeMinor =
    calculateIncomeMinor(
      transactions
    );

  const expensesMinor =
    calculateExpensesMinor(
      transactions
    );

  return (
    incomeMinor -
    expensesMinor
  );
}

export function calculateTotalBalanceMinor(
  accounts:
    readonly BankAccount[],
  currency = 'EUR'
): number {
  const normalizedCurrency =
    currency.toUpperCase();

  return sumMinorUnits(
    accounts
      .filter(
        (account) =>
          account.currency.toUpperCase() ===
          normalizedCurrency
      )
      .map(
        (account) =>
          account.balanceMinor
      )
  );
}

function getMonthKey(
  date: Date
): string {
  const year =
    date.getFullYear();

  const month =
    String(
      date.getMonth() + 1
    ).padStart(
      2,
      '0'
    );

  return `${year}-${month}`;
}

export function filterTransactionsForMonth(
  transactions:
    readonly Transaction[],
  referenceDate =
    new Date()
): Transaction[] {
  const monthKey =
    getMonthKey(
      referenceDate
    );

  return transactions.filter(
    (transaction) =>
      transaction.bookingDate.startsWith(
        monthKey
      )
  );
}

export function sortTransactionsNewestFirst(
  transactions:
    readonly Transaction[]
): Transaction[] {
  return [
    ...transactions,
  ].sort(
    (
      left,
      right
    ) => {
      const dateComparison =
        right.bookingDate.localeCompare(
          left.bookingDate
        );

      if (
        dateComparison !== 0
      ) {
        return dateComparison;
      }

      return right.createdAt.localeCompare(
        left.createdAt
      );
    }
  );
}

export const calculateIncome =
  calculateIncomeMinor;

export const calculateExpenses =
  calculateExpensesMinor;

export const calculateCashflow =
  calculateCashflowMinor;
