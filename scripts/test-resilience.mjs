import assert from 'node:assert/strict';

import { buildMonthlyComparison, buildCategoryTrends } from '../src/services/analyticsCore.ts';
import { buildRecurringInsights, buildCashflowForecast, detectMissedRecurring, detectCommitmentPriceChanges } from '../src/services/recurringInsightsCore.ts';
import { inspectBackup } from '../src/services/backupImportCore.ts';
import { resolveEntitlement } from '../src/services/billingCore.ts';
import { baseCurrencyTransactions, foreignCurrencySummary } from '../src/services/currencyScope.ts';
import { buildSupportDiagnostics } from '../src/services/supportDiagnosticsCore.ts';

/**
 * Fehlerinjektion auf Kern-Ebene: leere / defekte / extreme Eingaben dürfen
 * niemals eine Ausnahme werfen. Die UI degradiert dann sauber statt schwarz.
 */

const empty = [];
const garbage = [
  null, undefined, 42, 'x', {}, [null], [{}], [{ amountMinor: NaN }],
  [{ bookingDate: null, direction: 'expense', amountMinor: 1 }],
  [{ bookingDate: '2026-13-99', direction: 'weird', amountMinor: Infinity, currency: null }],
];

function noThrow(label, fn) {
  try {
    fn();
  } catch (error) {
    throw new Error(`${label} warf: ${error?.message ?? error}`);
  }
}

// --- Analytics -----------------------------------------------------
noThrow('buildMonthlyComparison([])', () => buildMonthlyComparison({ transactions: empty, categories: empty }));
noThrow('buildCategoryTrends([])', () => buildCategoryTrends({ transactions: empty, categories: empty }));
for (const g of garbage) {
  noThrow(`buildMonthlyComparison(garbage)`, () => buildMonthlyComparison({ transactions: Array.isArray(g) ? g : [], categories: [] }));
  noThrow(`buildCategoryTrends(garbage)`, () => buildCategoryTrends({ transactions: Array.isArray(g) ? g : [], categories: [], months: 6 }));
}

// --- Recurring ---------------------------------------------------
noThrow('buildRecurringInsights([])', () => buildRecurringInsights(empty));
noThrow('buildRecurringInsights(garbage)', () => buildRecurringInsights([{ bookingDate: 'x', amountMinor: NaN, direction: 'e' }]));
const ins = buildRecurringInsights(empty);
noThrow('detectMissedRecurring([])', () => detectMissedRecurring({ items: ins.items, latestBookedDate: null }));
noThrow('detectCommitmentPriceChanges([])', () => detectCommitmentPriceChanges(ins.items));
noThrow('buildCashflowForecast([])', () => buildCashflowForecast({ recurringItems: ins.items, openingBalanceMinor: 0 }));
noThrow('buildCashflowForecast(neg balance, 0 horizon)', () => buildCashflowForecast({ recurringItems: ins.items, openingBalanceMinor: -999999, horizonDays: 0 }));

// --- Backup import: garbage never throws, always a structured result --
for (const raw of ['', '{', '[]', 'null', '{"format":"x"}', JSON.stringify({ format: 'finance-app-backup', version: 2, data: { transactions: 'not-array' } }), 'x'.repeat(50)]) {
  noThrow(`inspectBackup(${JSON.stringify(raw).slice(0, 20)})`, () => {
    const r = inspectBackup(raw);
    assert.ok(typeof r.ok === 'boolean');
    if (!r.ok) assert.ok(Array.isArray(r.issues) && r.issues.length > 0);
  });
}

// --- Entitlement resolution: empty / malformed candidates -----------
noThrow('resolveEntitlement([])', () => {
  const r = resolveEntitlement([]);
  assert.equal(r.isPremium, false);
});
noThrow('resolveEntitlement(garbage)', () => resolveEntitlement([{ source: 'coupon' }, { source: 'x', expiresAt: 'nonsense' }, {}]));

// --- Currency scope: null-ish currencies -------------------------
noThrow('baseCurrencyTransactions(garbage)', () => baseCurrencyTransactions([{ currency: null }, { currency: undefined }, { currency: 'eur' }]));
noThrow('foreignCurrencySummary(garbage)', () => foreignCurrencySummary([{ currency: null }, { currency: '' }, { currency: 'usd' }]));

// --- Support diagnostics: missing fields ------------------------
noThrow('buildSupportDiagnostics(sparse)', () => buildSupportDiagnostics({
  appVersion: '', runtimeVersion: '', buildNumber: '', platform: '', schemaVersion: null,
  cloudSyncStatus: '', lastSyncedAt: null, lastLocalLoadAt: null, accountCount: 0,
  bankConnectionCount: 0, bankConnectionStates: [], bankConnectionsNeedingAction: 0,
  recurringSeriesCount: 0, mutedSeriesCount: 0, budgetCount: 0, activeGoalCount: 0,
  unsyncedChangeCount: null, foreignCurrencies: [], recentErrorCodes: [], premiumPlan: '', premiumSource: '',
}));

console.log('Resilience: all cores degrade gracefully on empty / malformed / extreme input');
