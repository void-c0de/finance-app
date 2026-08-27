import assert from 'node:assert/strict';

import {
  FINANCE_BASE_CURRENCY,
  baseCurrencyTransactions,
  foreignCurrencyAccounts,
  foreignCurrencyNote,
  foreignCurrencySummary,
} from '../src/services/currencyScope.ts';

/**
 * Währungs-Geltungsbereich: EUR ist Basis, Fremdwährungen werden NICHT
 * in dieselbe Summe geworfen und getrennt ausgewiesen.
 */

assert.equal(FINANCE_BASE_CURRENCY, 'EUR');

const tx = (currency, amountMinor) => ({
  id: `${currency}-${amountMinor}`,
  accountId: 'a',
  amountMinor,
  currency,
  direction: 'expense',
  bookingDate: '2026-08-10',
  bookingStatus: 'booked',
  description: 'x',
  createdAt: '2026-08-10T00:00:00Z',
});

const txns = [tx('EUR', 1000), tx('eur', 2000), tx('USD', 5000), tx('CHF', 300), tx('', 999)];
const base = baseCurrencyTransactions(txns);
assert.equal(base.length, 2, 'nur EUR/eur');
assert.deepEqual(base.map((t) => t.amountMinor).sort(), [1000, 2000]);

const acc = (currency, id = currency) => ({
  id,
  providerId: 'p',
  externalAccountId: `ext-${id}`,
  name: id,
  currency,
  balanceMinor: 100,
  type: 'checking',
});

const accounts = [acc('EUR', 'e1'), acc('EUR', 'e2'), acc('USD', 'u1'), acc('CHF', 'c1'), acc('usd', 'u2')];
const foreign = foreignCurrencyAccounts(accounts);
assert.equal(foreign.length, 3, 'USD x2 + CHF');

const summary = foreignCurrencySummary(accounts);
assert.equal(summary.hasForeign, true);
assert.deepEqual(summary.currencies, ['CHF', 'USD'], 'distinkt, sortiert, normalisiert');
assert.equal(summary.accountCount, 3);

const note = foreignCurrencyNote(summary);
assert.match(note, /CHF, USD/);
assert.match(note, /nicht in die Summen in EUR eingerechnet/);

// nur EUR → kein Hinweis
const eurOnly = foreignCurrencySummary([acc('EUR', 'e1')]);
assert.equal(eurOnly.hasForeign, false);
assert.equal(foreignCurrencyNote(eurOnly), null);

console.log('Currency scope: base = EUR, foreign accounts partitioned & labelled, never summed together');
