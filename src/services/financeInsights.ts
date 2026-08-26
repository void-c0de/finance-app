import {
    calculateCashflowMinor,
    calculateExpensesMinor,
    calculateIncomeMinor,
    filterTransactionsForMonth,
} from '@/core/finance';

import {
    sumMinorUnits,
} from '@/core/money';

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

    categorySpending,

    recurringExpenses,

    budgetInsights,

    uncategorizedExpenseCount,

    classificationRate,

    topExpense,
  };
}
