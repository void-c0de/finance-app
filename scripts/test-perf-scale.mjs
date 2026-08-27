import assert from 'node:assert/strict';

import {
  buildCategoryTrends,
  buildMonthlyComparison,
} from '../src/services/analyticsCore.ts';
import {
  buildRecurringInsights,
  buildCashflowForecast,
  detectCommitmentPriceChanges,
  detectMissedRecurring,
} from '../src/services/recurringInsightsCore.ts';

/**
 * Skalen-/Performance-Regression: die reine Insight-Berechnung darf bei
 * realistisch großen Datenmengen nicht einfrieren.
 *
 * Kein UI, kein Gerät – nur die Rechenzeit der deterministischen Kerne.
 * Schwellen sind bewusst großzügig (CI-Rechner sind langsam); es geht um
 * „kein O(n²)-Ausrutscher", nicht um Mikro-Benchmarks.
 */

const CATEGORIES = [
  'cat-groceries', 'cat-dining', 'cat-shopping', 'cat-mobility', 'cat-housing',
  'cat-utilities', 'cat-telecom', 'cat-subscriptions', 'cat-health', 'cat-other',
].map((id) => ({ id, name: id, isIncomeCategory: false }));

const MERCHANTS = [
  'REWE', 'Edeka', 'Aldi', 'Lidl', 'dm', 'Rossmann', 'Shell', 'Aral', 'Netflix',
  'Spotify', 'Vodafone', 'Telekom', 'Amazon', 'Zalando', 'IKEA', 'Bahn', 'MVG',
  'Rewe Getränke', 'Bäcker Müller', 'Restaurant Roma', 'Apotheke', 'Stadtwerke',
];

// deterministischer PRNG
let seed = 42;
const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];

function makeTransactions(count, monthsBack) {
  const now = new Date('2026-08-20T00:00:00Z');
  const txns = [];
  for (let i = 0; i < count; i += 1) {
    const dayOffset = Math.floor(rnd() * monthsBack * 30);
    const d = new Date(now.getTime() - dayOffset * 86_400_000);
    const bookingDate = d.toISOString().slice(0, 10);
    const isIncome = rnd() < 0.06;
    txns.push({
      id: `tx-${i}`,
      accountId: `acc-${i % 4}`,
      externalTransactionId: `ext-${i}`,
      amountMinor: isIncome ? 250_000 + Math.floor(rnd() * 80_000) : 500 + Math.floor(rnd() * 15_000),
      currency: 'EUR',
      direction: isIncome ? 'income' : 'expense',
      bookingDate,
      bookingStatus: rnd() < 0.03 ? 'pending' : 'booked',
      description: pick(MERCHANTS),
      counterpartyName: pick(MERCHANTS),
      categoryId: rnd() < 0.9 ? pick(CATEGORIES).id : undefined,
      isRecurring: rnd() < 0.08,
      isInternalTransfer: rnd() < 0.02,
      createdAt: `${bookingDate}T10:00:00Z`,
    });
  }
  return txns;
}

function time(label, fn, budgetMs) {
  const start = process.hrtime.bigint();
  const result = fn();
  const ms = Number(process.hrtime.bigint() - start) / 1e6;
  console.log(`  ${label}: ${ms.toFixed(1)} ms`);
  assert.ok(ms < budgetMs, `${label} zu langsam: ${ms.toFixed(0)} ms (Budget ${budgetMs} ms)`);
  return result;
}

// --- 10.000 Umsätze, 24 Monate --------------------------------------
{
  const txns = makeTransactions(10_000, 24);
  console.log(`10.000 Umsätze / 24 Monate:`);
  time('buildMonthlyComparison', () => buildMonthlyComparison({ transactions: txns, categories: CATEGORIES, referenceDate: new Date('2026-08-20') }), 400);
  const trends = time('buildCategoryTrends (24M)', () => buildCategoryTrends({ transactions: txns, categories: CATEGORIES, referenceDate: new Date('2026-08-20'), months: 24 }), 1200);
  assert.equal(trends.monthKeys.length, 24);
  const insights = time('buildRecurringInsights', () => buildRecurringInsights(txns, { referenceDate: new Date('2026-08-20') }), 2500);
  const items = insights.items;
  time('detectCommitmentPriceChanges', () => detectCommitmentPriceChanges(items), 200);
  time('detectMissedRecurring', () => detectMissedRecurring({ items, latestBookedDate: '2026-08-19' }), 200);
  time('buildCashflowForecast', () => buildCashflowForecast({ recurringItems: items, horizonDays: 90, openingBalanceMinor: 250_000, referenceDate: new Date('2026-08-20') }), 200);
}

// --- 40.000 Umsätze: immer noch kein Einfrieren --------------------
{
  const txns = makeTransactions(40_000, 24);
  console.log(`40.000 Umsätze / 24 Monate:`);
  time('buildCategoryTrends (24M)', () => buildCategoryTrends({ transactions: txns, categories: CATEGORIES, referenceDate: new Date('2026-08-20'), months: 24 }), 4000);
  time('buildRecurringInsights', () => buildRecurringInsights(txns, { referenceDate: new Date('2026-08-20') }), 9000);
}

console.log('Perf scale: insight build stays well under UI-freeze thresholds');
