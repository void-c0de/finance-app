import type { Budget, Category, Transaction } from '../types/finance';

function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Gebuchte, eigene, kategorisierte Ausgaben des Referenzmonats je Kategorie.
 * Spiegelt exakt die Regeln aus `buildFinanceInsights`: vorgemerkte Umsätze,
 * erkannte Eigenüberweisungen und nicht kategorisierte Ausgaben zählen nicht.
 */
export function buildMonthlyCategorySpending(
  transactions: readonly Transaction[],
  referenceDate = new Date(),
): Map<string, number> {
  const key = monthKey(referenceDate);
  const spending = new Map<string, number>();

  for (const transaction of transactions) {
    if (
      !transaction.bookingDate.startsWith(key) ||
      transaction.bookingStatus === 'pending' ||
      transaction.isInternalTransfer ||
      transaction.direction !== 'expense' ||
      !transaction.categoryId
    ) {
      continue;
    }

    spending.set(
      transaction.categoryId,
      (spending.get(transaction.categoryId) ?? 0) + transaction.amountMinor,
    );
  }

  return spending;
}

export type BudgetProgress = {
  budget: Budget;
  categoryName: string;
  spentMinor: number;
  remainingMinor: number;
  progress: number;
};

export type BudgetSummary = {
  count: number;
  totalBudgetMinor: number;
  totalSpentMinor: number;
  totalRemainingMinor: number;
  overBudgetCount: number;
};

export function summarizeBudgetProgress(
  items: readonly BudgetProgress[],
): BudgetSummary {
  return items.reduce<BudgetSummary>(
    (summary, item) => ({
      count: summary.count + 1,
      totalBudgetMinor: summary.totalBudgetMinor + item.budget.amountMinor,
      totalSpentMinor: summary.totalSpentMinor + item.spentMinor,
      totalRemainingMinor: summary.totalRemainingMinor + item.remainingMinor,
      overBudgetCount: summary.overBudgetCount + (item.progress >= 1 ? 1 : 0),
    }),
    {
      count: 0,
      totalBudgetMinor: 0,
      totalSpentMinor: 0,
      totalRemainingMinor: 0,
      overBudgetCount: 0,
    },
  );
}

export function buildBudgetProgress(input: {
  budgets: readonly Budget[];
  categories: readonly Category[];
  spendingByCategory: ReadonlyMap<string, number>;
}): BudgetProgress[] {
  const categoryMap = new Map(input.categories.map((category) => [category.id, category]));

  return input.budgets
    .filter((budget) => budget.period === 'monthly')
    .map((budget) => {
      const spentMinor = budget.categoryId
        ? input.spendingByCategory.get(budget.categoryId) ?? 0
        : 0;
      return {
        budget,
        categoryName: budget.categoryId
          ? categoryMap.get(budget.categoryId)?.name ?? budget.name
          : budget.name,
        spentMinor,
        remainingMinor: budget.amountMinor - spentMinor,
        progress: budget.amountMinor > 0 ? Math.max(0, spentMinor / budget.amountMinor) : 0,
      };
    })
    .sort((left, right) => right.progress - left.progress);
}
