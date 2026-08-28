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
    baseCurrencyTransactions,
    FINANCE_BASE_CURRENCY,
} from '@/services/currencyScope';

import {
    normalizeMerchantName,
} from '@/services/merchantNormalization';

import {
    buildBudgetProgress,
    buildMonthlyCategorySpending,
} from '@/services/budgetInsightsCore';
import {
    buildRecurringInsights,
    type RecurringItem,
    type RecurringOverride,
    type RecurringSummary,
} from '@/services/recurringInsightsCore';

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
  kind: RecurringItem['kind'];
  confidence: RecurringItem['confidence'];
  reason: string;
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

  recurringItems:
    RecurringItem[];

  recurringSummary:
    RecurringSummary;

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

    recurringOverrides?:
      ReadonlyMap<string, RecurringOverride>;
  }
): FinanceInsights {
  const monthTransactions =
    // Summen nur in der Basiswährung – Fremdwährungsumsätze verfälschen sonst
    // Einnahmen/Ausgaben/Cashflow.
    baseCurrencyTransactions(
      filterTransactionsForMonth(
        input.transactions,

        input.referenceDate ??
          new Date()
      )
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

  const recurring = buildRecurringInsights(input.transactions, {
    normalizeMerchant: normalizeMerchantName,
    referenceDate: input.referenceDate,
    overridesByKey: input.recurringOverrides,
  });

  const projectedRecurringMinor = recurring.summary.monthlyCommittedMinor;

  const upcomingRecurring: UpcomingRecurringInsight[] = recurring.upcoming.map(
    (item) => ({
      key: item.key,
      title: item.title,
      amountMinor: item.amountMinor,
      currency: item.currency,
      nextDate: item.nextDate,
      driftPercent: item.driftPercent,
      kind: item.kind,
      confidence: item.confidence,
      reason: item.reason,
    }),
  );

  /*
   * Budgets nutzen dieselbe kanonische Monatswahrheit wie das Dashboard:
   * eine einzige Funktion, keine parallele Implementierung.
   */
  const budgetInsights = buildBudgetProgress({
    budgets: input.budgets,
    categories: input.categories,
    spendingByCategory: buildMonthlyCategorySpending(
      input.transactions,
      input.referenceDate,
      FINANCE_BASE_CURRENCY,
    ),
  });

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

    recurringItems:
      recurring.items,

    recurringSummary:
      recurring.summary,

    categorySpending,

    recurringExpenses,

    budgetInsights,

    uncategorizedExpenseCount,

    classificationRate,

    topExpense,
  };
}
