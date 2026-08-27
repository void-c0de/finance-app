import assert from 'node:assert/strict';
import { buildBudgetProgress, buildMonthlyCategorySpending, summarizeBudgetProgress } from '../src/services/budgetInsightsCore.ts';

const insights = buildBudgetProgress({
  categories: [{ id: 'food', name: 'Lebensmittel' }, { id: 'travel', name: 'Reisen' }],
  budgets: [{ id: 'budget-1', categoryId: 'food', name: 'Lebensmittel', amountMinor: 5_000, period: 'monthly' }],
  spendingByCategory: new Map([['food', 6_000], ['travel', 4_000]]),
});

const budget = insights[0];
assert.equal(budget.spentMinor, 6_000, 'Nur Ausgaben der Budgetkategorie zählen');
assert.equal(budget.remainingMinor, -1_000, 'Überschreitung bleibt als negativer Rest sichtbar');
assert.equal(budget.progress, 1.2, 'Fortschritt oberhalb 100 % darf nicht abgeschnitten werden');

const multi = buildBudgetProgress({
  categories: [{ id: 'food', name: 'Lebensmittel' }, { id: 'travel', name: 'Reisen' }],
  budgets: [
    { id: 'b-food', categoryId: 'food', name: 'Lebensmittel', amountMinor: 5_000, period: 'monthly' },
    { id: 'b-travel', categoryId: 'travel', name: 'Reisen', amountMinor: 10_000, period: 'monthly' },
  ],
  spendingByCategory: new Map([['food', 6_000], ['travel', 2_500]]),
});

const summary = summarizeBudgetProgress(multi);
assert.equal(summary.count, 2, 'Alle Monatsbudgets werden gezählt');
assert.equal(summary.totalBudgetMinor, 15_000, 'Gesamtbudget summiert korrekt');
assert.equal(summary.totalSpentMinor, 8_500, 'Gesamtausgaben summieren korrekt');
assert.equal(summary.totalRemainingMinor, 6_500, 'Restbetrag inklusive Überschreitung');
assert.equal(summary.overBudgetCount, 1, 'Nur überschrittene Budgets werden gezählt');

assert.deepEqual(summarizeBudgetProgress([]), {
  count: 0, totalBudgetMinor: 0, totalSpentMinor: 0, totalRemainingMinor: 0, overBudgetCount: 0,
}, 'Leere Budgetliste ergibt Nullwerte');

const month = '2026-08';
const spending = buildMonthlyCategorySpending([
  { id: 't1', bookingDate: `${month}-04`, direction: 'expense', amountMinor: 2_000, categoryId: 'food', bookingStatus: 'booked', isInternalTransfer: false },
  { id: 't2', bookingDate: `${month}-07`, direction: 'expense', amountMinor: 1_500, categoryId: 'food', bookingStatus: 'pending', isInternalTransfer: false },
  { id: 't3', bookingDate: `${month}-09`, direction: 'expense', amountMinor: 9_900, categoryId: 'food', bookingStatus: 'booked', isInternalTransfer: true },
  { id: 't4', bookingDate: `${month}-11`, direction: 'income', amountMinor: 5_000, categoryId: 'food', bookingStatus: 'booked', isInternalTransfer: false },
  { id: 't5', bookingDate: `${month}-12`, direction: 'expense', amountMinor: 700, categoryId: null, bookingStatus: 'booked', isInternalTransfer: false },
  { id: 't6', bookingDate: '2026-07-30', direction: 'expense', amountMinor: 4_000, categoryId: 'food', bookingStatus: 'booked', isInternalTransfer: false },
], new Date('2026-08-15T00:00:00Z'));
assert.equal(spending.get('food'), 2_000, 'Nur gebuchte, eigene, kategorisierte Ausgaben des Monats zählen');
assert.equal(spending.has('uncategorized'), false, 'Nicht kategorisierte Ausgaben landen in keinem Budget');

console.log('Budget insights: all tests passed');
