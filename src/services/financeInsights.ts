import {
    calculateCashflowMinor,
    calculateExpensesMinor,
    calculateIncomeMinor,
    filterTransactionsForMonth,
} from '@/core/finance';

import {
    sumMinorUnits,
} from '@/core/money';

import {
    normalizeMerchantName,
} from '@/services/merchantNormalization';

import type {
    Budget,
    Category,
    Transaction,
} from '@/types/finance';

export type CategorySpendingInsight = {
  categoryId:
    string;

  name:
    string;

  icon?:
    string;

  amountMinor:
    number;

  transactionCount:
    number;

  share:
    number;
};

export type RecurringExpenseInsight = {
  key:
    string;

  title:
    string;

  amountMinor:
    number;

  currency:
    string;

  transactionId:
    string;
};

export type BudgetInsight = {
  budget:
    Budget;

  categoryName:
    string;

  spentMinor:
    number;

  remainingMinor:
    number;

  progress:
    number;
};

export type UpcomingRecurringInsight = {
  key: string;
  title: string;
  amountMinor: number;
  currency: string;
  nextDate: string;
  driftPercent?: number;
};

export type FinanceInsights = {
  monthTransactions:
    Transaction[];

  incomeMinor:
    number;

  expensesMinor:
    number;

  cashflowMinor:
    number;

  recurringExpenseMinor:
    number;

  projectedRecurringMinor:
    number;

  upcomingRecurring:
    UpcomingRecurringInsight[];

  categorySpending:
    CategorySpendingInsight[];

  recurringExpenses:
    RecurringExpenseInsight[];

  budgetInsights:
    BudgetInsight[];

  uncategorizedExpenseCount:
    number;

  classificationRate:
    number;

  topExpense:
    Transaction | null;
};

function clamp01(
  value:
    number
): number {
  return Math.max(
    0,

    Math.min(
      1,
      value
    )
  );
}

export function buildFinanceInsights(
  input: {
    transactions:
      readonly Transaction[];

    categories:
      readonly Category[];

    budgets:
      readonly Budget[];

    referenceDate?:
      Date;
  }
): FinanceInsights {
  const monthTransactions =
    filterTransactionsForMonth(
      input.transactions,

      input.referenceDate ??
        new Date()
    );

  const incomeMinor =
    calculateIncomeMinor(
      monthTransactions
    );

  const expensesMinor =
    calculateExpensesMinor(
      monthTransactions
    );

  const cashflowMinor =
    calculateCashflowMinor(
      monthTransactions
    );

  const categoryMap =
    new Map(
      input.categories.map(
        (
          category
        ) => [
          category.id,
          category,
        ]
      )
    );

  const spendingMap =
    new Map<
      string,
      {
        amountMinor:
          number;

        count:
          number;
      }
    >();

  const recurringExpenses:
    RecurringExpenseInsight[] =
      [];

  let uncategorizedExpenseCount =
    0;

  let categorizedExpenseCount =
    0;

  let totalExpenseCount =
    0;

  let topExpense:
    Transaction | null =
      null;

  for (
    const transaction
    of monthTransactions
  ) {
    if (
      transaction.bookingStatus ===
        'pending' ||

      transaction.isInternalTransfer ||

      transaction.direction !==
      'expense'
    ) {
      continue;
    }

    totalExpenseCount +=
      1;

    if (
      transaction.categoryId
    ) {
      categorizedExpenseCount +=
        1;
    } else {
      uncategorizedExpenseCount +=
        1;
    }

    const categoryId =
      transaction.categoryId ??
      'uncategorized';

    const current =
      spendingMap.get(
        categoryId
      ) ?? {
        amountMinor:
          0,

        count:
          0,
      };

    current.amountMinor +=
      transaction.amountMinor;

    current.count +=
      1;

    spendingMap.set(
      categoryId,
      current
    );

    if (
      transaction.isRecurring
    ) {
      recurringExpenses.push({
        key:
          transaction
            .externalTransactionId ??
          transaction.id,

        title:
          transaction
            .counterpartyName ??
          transaction
            .description,

        amountMinor:
          transaction.amountMinor,

        currency:
          transaction.currency,

        transactionId:
          transaction.id,
      });
    }

    if (
      !topExpense ||

      transaction.amountMinor >
        topExpense.amountMinor
    ) {
      topExpense =
        transaction;
    }
  }

  const categorySpending =
    Array.from(
      spendingMap.entries()
    )
      .map(
        (
          [
            categoryId,
            data,
          ]
        ) => {
          const category =
            categoryMap.get(
              categoryId
            );

          return {
            categoryId,

            name:
              category?.name ??
              'Nicht kategorisiert',

            icon:
              category?.icon,

            amountMinor:
              data.amountMinor,

            transactionCount:
              data.count,

            share:
              expensesMinor >
              0
                ? data.amountMinor /
                  expensesMinor
                : 0,
          };
        }
      )
      .sort(
        (
          left,
          right
        ) =>
          right.amountMinor -
          left.amountMinor
      );

  recurringExpenses.sort(
    (
      left,
      right
    ) =>
      right.amountMinor -
      left.amountMinor
  );

  const recurringExpenseMinor =
    sumMinorUnits(
      recurringExpenses.map(
        (
          item
        ) =>
          item.amountMinor
      )
    );

  const recurringGroups =
    new Map<string, Transaction[]>();

  for (const transaction of input.transactions) {
    if (
      !transaction.isRecurring ||
      transaction.isInternalTransfer ||
      transaction.direction !== 'expense' ||
      transaction.bookingStatus === 'pending'
    ) {
      continue;
    }

    const title = normalizeMerchantName(
      transaction.counterpartyName ?? transaction.description,
    );

    const key = `${transaction.accountId}|${transaction.currency}|${title}`;
    const group = recurringGroups.get(key) ?? [];
    group.push(transaction);
    recurringGroups.set(key, group);
  }

  let projectedRecurringMinor = 0;
  const upcomingRecurring: UpcomingRecurringInsight[] = [];
  const now = input.referenceDate ?? new Date();

  for (const [key, group] of recurringGroups) {
    group.sort(
      (left, right) => Date.parse(left.bookingDate) - Date.parse(right.bookingDate),
    );

    const latest = group[group.length - 1];
    const previous = group[group.length - 2];

    if (!latest || !previous) {
      continue;
    }

    const intervalDays = Math.max(
      1,
      (Date.parse(latest.bookingDate) - Date.parse(previous.bookingDate)) /
        (24 * 60 * 60 * 1000),
    );

    const monthlyMultiplier = Math.min(5, Math.max(1 / 12, 30 / intervalDays));
    projectedRecurringMinor += Math.round(latest.amountMinor * monthlyMultiplier);

    let nextTimestamp = Date.parse(latest.bookingDate) + intervalDays * 24 * 60 * 60 * 1000;

    while (nextTimestamp < now.getTime()) {
      nextTimestamp += intervalDays * 24 * 60 * 60 * 1000;
    }

    if (nextTimestamp <= now.getTime() + 45 * 24 * 60 * 60 * 1000) {
      const difference = latest.amountMinor - previous.amountMinor;
      const driftPercent = previous.amountMinor > 0
        ? difference / previous.amountMinor
        : 0;

      upcomingRecurring.push({
        key,
        title: normalizeMerchantName(
          latest.counterpartyName ?? latest.description,
        ),
        amountMinor: latest.amountMinor,
        currency: latest.currency,
        nextDate: new Date(nextTimestamp).toISOString().slice(0, 10),
        driftPercent:
          Math.abs(difference) >= 100 && Math.abs(driftPercent) >= 0.1
            ? driftPercent
            : undefined,
      });
    }
  }

  upcomingRecurring.sort(
    (left, right) => left.nextDate.localeCompare(right.nextDate),
  );

  const spendingByCategory =
    new Map(
      categorySpending.map(
        (
          item
        ) => [
          item.categoryId,
          item.amountMinor,
        ]
      )
    );

  const budgetInsights =
    input.budgets
      .filter(
        (
          budget
        ) =>
          budget.period ===
          'monthly'
      )
      .map(
        (
          budget
        ) => {
          const spentMinor =
            budget.categoryId
              ? spendingByCategory.get(
                  budget.categoryId
                ) ??
                0
              : 0;

          const categoryName =
            budget.categoryId
              ? categoryMap.get(
                  budget.categoryId
                )?.name ??
                budget.name
              : budget.name;

          return {
            budget,

            categoryName,

            spentMinor,

            remainingMinor:
              budget.amountMinor -
              spentMinor,

            progress:
              budget.amountMinor >
              0
                ? clamp01(
                    spentMinor /
                      budget.amountMinor
                  )
                : 0,
          };
        }
      )
      .sort(
        (
          left,
          right
        ) =>
          right.progress -
          left.progress
      );

  const classificationRate =
    totalExpenseCount >
    0
      ? categorizedExpenseCount /
        totalExpenseCount
      : 1;

  return {
    monthTransactions,

    incomeMinor,

    expensesMinor,

    cashflowMinor,

    recurringExpenseMinor,

    projectedRecurringMinor,

    upcomingRecurring,

    categorySpending,

    recurringExpenses,

    budgetInsights,

    uncategorizedExpenseCount,

    classificationRate,

    topExpense,
  };
}
