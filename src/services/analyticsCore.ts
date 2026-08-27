import type { Category, Transaction } from '../types/finance';

/**
 * Analytics-Kern 2.0 – reine, testbare Vergleichs- und Trendlogik.
 *
 * Regeln (überall gleich):
 * - Nur gebuchte Umsätze; vorgemerkte werden ausgeschlossen.
 * - Erkannte Eigenüberweisungen zählen nie.
 * - Beträge sind ganzzahlige Minor-Units. Erstattungen (negative Ausgaben)
 *   reduzieren die Kategorie-/Monatssumme korrekt.
 * - „Keine Daten" ist nicht „null": `hasBaseline` / `hasEnoughData` unterscheiden.
 * - Kein Prozentwert bei Vormonat = 0 (kein Division-durch-Null-Unsinn).
 */

export type MonthKey = string; // 'YYYY-MM'

export function monthKeyOf(date: Date): MonthKey {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export function shiftMonthKey(key: MonthKey, deltaMonths: number): MonthKey {
  const [year, month] = key.split('-').map((part) => Number.parseInt(part, 10));
  const base = new Date(Date.UTC(year, month - 1 + deltaMonths, 1));
  return `${base.getUTCFullYear()}-${String(base.getUTCMonth() + 1).padStart(2, '0')}`;
}

function inMonth(transaction: Transaction, key: MonthKey): boolean {
  return transaction.bookingDate.startsWith(key);
}

function countableExpense(transaction: Transaction): boolean {
  return (
    transaction.direction === 'expense' &&
    transaction.bookingStatus !== 'pending' &&
    !transaction.isInternalTransfer
  );
}

function countableIncome(transaction: Transaction): boolean {
  return (
    transaction.direction === 'income' &&
    transaction.bookingStatus !== 'pending' &&
    !transaction.isInternalTransfer
  );
}

function sumExpenses(transactions: readonly Transaction[], key: MonthKey): number {
  let total = 0;
  for (const transaction of transactions) {
    if (inMonth(transaction, key) && countableExpense(transaction)) {
      total += transaction.amountMinor;
    }
  }
  return total;
}

function sumIncome(transactions: readonly Transaction[], key: MonthKey): number {
  let total = 0;
  for (const transaction of transactions) {
    if (inMonth(transaction, key) && countableIncome(transaction)) {
      total += transaction.amountMinor;
    }
  }
  return total;
}

function monthHasActivity(transactions: readonly Transaction[], key: MonthKey): boolean {
  return transactions.some(
    (transaction) =>
      inMonth(transaction, key) &&
      transaction.bookingStatus !== 'pending' &&
      !transaction.isInternalTransfer,
  );
}

function expenseByCategory(
  transactions: readonly Transaction[],
  key: MonthKey,
): Map<string, number> {
  const map = new Map<string, number>();
  for (const transaction of transactions) {
    if (!inMonth(transaction, key) || !countableExpense(transaction) || !transaction.categoryId) {
      continue;
    }
    map.set(transaction.categoryId, (map.get(transaction.categoryId) ?? 0) + transaction.amountMinor);
  }
  return map;
}

export type ChangeDirection = 'up' | 'down' | 'flat';

export type MoneyDelta = {
  currentMinor: number;
  previousMinor: number;
  deltaMinor: number;
  /** null, wenn der Vormonat 0 war – dann gibt es keine sinnvolle Prozentzahl. */
  deltaPercent: number | null;
  /** Hatte der Vormonat überhaupt Werte dieser Art? */
  hasBaseline: boolean;
  direction: ChangeDirection;
};

function buildDelta(currentMinor: number, previousMinor: number): MoneyDelta {
  const deltaMinor = currentMinor - previousMinor;
  const hasBaseline = previousMinor !== 0;
  const tolerance = Math.max(100, Math.abs(previousMinor) * 0.02);
  return {
    currentMinor,
    previousMinor,
    deltaMinor,
    deltaPercent: hasBaseline ? deltaMinor / Math.abs(previousMinor) : null,
    hasBaseline,
    direction: deltaMinor > tolerance ? 'up' : deltaMinor < -tolerance ? 'down' : 'flat',
  };
}

export type CategoryDelta = {
  categoryId: string;
  name: string;
  currentMinor: number;
  previousMinor: number;
  deltaMinor: number;
};

export type MonthlyComparison = {
  currentKey: MonthKey;
  previousKey: MonthKey;
  /** Beide Monate haben Aktivität – erst dann sind Vergleiche belastbar. */
  hasEnoughData: boolean;
  income: MoneyDelta;
  expenses: MoneyDelta;
  cashflow: MoneyDelta;
  /** Nur Ausgabenkategorien, nach Betrag der Veränderung absteigend. */
  categoryDeltas: CategoryDelta[];
  topIncrease: CategoryDelta | null;
  topDecrease: CategoryDelta | null;
};

export function buildMonthlyComparison(input: {
  transactions: readonly Transaction[];
  categories: readonly Category[];
  referenceDate?: Date;
}): MonthlyComparison {
  const now = input.referenceDate ?? new Date();
  const currentKey = monthKeyOf(now);
  const previousKey = shiftMonthKey(currentKey, -1);
  const nameOf = new Map(input.categories.map((category) => [category.id, category.name]));

  const currentExpenses = sumExpenses(input.transactions, currentKey);
  const previousExpenses = sumExpenses(input.transactions, previousKey);
  const currentIncome = sumIncome(input.transactions, currentKey);
  const previousIncome = sumIncome(input.transactions, previousKey);

  const currentByCategory = expenseByCategory(input.transactions, currentKey);
  const previousByCategory = expenseByCategory(input.transactions, previousKey);
  const categoryIds = new Set([...currentByCategory.keys(), ...previousByCategory.keys()]);

  const categoryDeltas: CategoryDelta[] = [...categoryIds]
    .map((categoryId) => {
      const currentMinor = currentByCategory.get(categoryId) ?? 0;
      const previousMinor = previousByCategory.get(categoryId) ?? 0;
      return {
        categoryId,
        name: nameOf.get(categoryId) ?? 'Kategorie',
        currentMinor,
        previousMinor,
        deltaMinor: currentMinor - previousMinor,
      };
    })
    .filter((entry) => entry.deltaMinor !== 0)
    .sort((left, right) => Math.abs(right.deltaMinor) - Math.abs(left.deltaMinor));

  const increases = categoryDeltas.filter((entry) => entry.deltaMinor > 0);
  const decreases = categoryDeltas.filter((entry) => entry.deltaMinor < 0);

  return {
    currentKey,
    previousKey,
    hasEnoughData:
      monthHasActivity(input.transactions, currentKey) &&
      monthHasActivity(input.transactions, previousKey),
    income: buildDelta(currentIncome, previousIncome),
    expenses: buildDelta(currentExpenses, previousExpenses),
    cashflow: buildDelta(currentIncome - currentExpenses, previousIncome - previousExpenses),
    categoryDeltas,
    topIncrease: increases[0] ?? null,
    topDecrease: decreases[decreases.length - 1] ?? null,
  };
}

// ---------------------------------------------------------------------------
// Category trends over N months
// ---------------------------------------------------------------------------

export type CategoryTrendPoint = { monthKey: MonthKey; amountMinor: number };

export type CategoryTrend = {
  categoryId: string;
  name: string;
  /** Ältester zuerst, `months` Einträge. */
  points: CategoryTrendPoint[];
  currentMinor: number;
  averageMinor: number;
  /** Anteil an den Ausgaben des aktuellen Monats (0..1). */
  sharePercent: number;
  slope: 'rising' | 'falling' | 'stable';
};

export type CategoryTrendReport = {
  monthKeys: MonthKey[];
  totalCurrentExpenseMinor: number;
  trends: CategoryTrend[];
};

export function buildCategoryTrends(input: {
  transactions: readonly Transaction[];
  categories: readonly Category[];
  referenceDate?: Date;
  months?: number;
}): CategoryTrendReport {
  const now = input.referenceDate ?? new Date();
  const months = Math.max(2, Math.min(24, input.months ?? 6));
  const currentKey = monthKeyOf(now);
  const monthKeys: MonthKey[] = [];
  for (let index = months - 1; index >= 0; index -= 1) {
    monthKeys.push(shiftMonthKey(currentKey, -index));
  }

  const nameOf = new Map(input.categories.map((category) => [category.id, category.name]));
  const perMonth = monthKeys.map((key) => expenseByCategory(input.transactions, key));
  const totalCurrentExpenseMinor = sumExpenses(input.transactions, currentKey);

  const categoryIds = new Set<string>();
  for (const map of perMonth) for (const id of map.keys()) categoryIds.add(id);

  const trends: CategoryTrend[] = [...categoryIds].map((categoryId) => {
    const points = monthKeys.map((monthKey, index) => ({
      monthKey,
      amountMinor: perMonth[index].get(categoryId) ?? 0,
    }));
    const currentMinor = points[points.length - 1].amountMinor;
    const sum = points.reduce((acc, point) => acc + point.amountMinor, 0);
    const averageMinor = Math.round(sum / points.length);

    const half = Math.floor(points.length / 2);
    const firstAvg = points.slice(0, half).reduce((a, p) => a + p.amountMinor, 0) / Math.max(1, half);
    const secondAvg =
      points.slice(half).reduce((a, p) => a + p.amountMinor, 0) / Math.max(1, points.length - half);
    const slopeTolerance = Math.max(500, Math.abs(firstAvg) * 0.1);

    return {
      categoryId,
      name: nameOf.get(categoryId) ?? 'Kategorie',
      points,
      currentMinor,
      averageMinor,
      sharePercent: totalCurrentExpenseMinor > 0 ? currentMinor / totalCurrentExpenseMinor : 0,
      slope:
        secondAvg - firstAvg > slopeTolerance
          ? 'rising'
          : firstAvg - secondAvg > slopeTolerance
            ? 'falling'
            : 'stable',
    };
  });

  trends.sort((left, right) => right.currentMinor - left.currentMinor);
  return { monthKeys, totalCurrentExpenseMinor, trends };
}
