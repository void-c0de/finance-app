import assert from 'node:assert/strict';

import {
  goalProgressBarPercent,
  goalProgressPercent,
  goalProgressRatio,
  resolveGoalProgress,
} from '../src/services/goalProgressCore.ts';

/**
 * Vollständiger Lebenszyklus-Nachweis für Sparziele.
 *
 * Kern-Invariante: pro Tracking-Modus gibt es GENAU EINE autoritative
 * Fortschrittsquelle. `account_balance` nutzt ausschließlich den verknüpften
 * Kontostand; alle anderen Modi nutzen Startbetrag + aktive Beiträge. Kontostand
 * und Beitrags-Ledger werden nie addiert.
 */

// --- manual ------------------------------------------------------------------
assert.deepEqual(
  resolveGoalProgress({
    trackingMode: 'manual',
    startingAmountMinor: 50_000,
    contributionAmountsMinor: [10_000, 5_000],
    lastKnownAmountMinor: 0,
  }),
  { amountMinor: 65_000, source: 'contributions', linkedAccountAvailable: true },
);

// Entnahme (negativer Beitrag) reduziert den Fortschritt, bleibt aber im Ledger.
assert.equal(
  resolveGoalProgress({
    trackingMode: 'manual',
    startingAmountMinor: 50_000,
    contributionAmountsMinor: [10_000, -20_000],
    lastKnownAmountMinor: 0,
  }).amountMinor,
  40_000,
);

// --- transaction_rule (verhält sich wie contributions) ----------------------
assert.equal(
  resolveGoalProgress({
    trackingMode: 'transaction_rule',
    startingAmountMinor: 0,
    contributionAmountsMinor: [20_000, 20_000, 20_000],
    lastKnownAmountMinor: 999,
  }).source,
  'contributions',
);

// --- account_balance: verfügbar -------------------------------------------
{
  const r = resolveGoalProgress({
    trackingMode: 'account_balance',
    startingAmountMinor: 0,
    contributionAmountsMinor: [777, 777], // müssen ignoriert werden – keine Doppelzählung
    linkedAccountBalanceMinor: 240_000,
    lastKnownAmountMinor: 100_000,
  });
  assert.deepEqual(r, { amountMinor: 240_000, source: 'account_balance', linkedAccountAvailable: true });
}

// --- account_balance: Konto vorübergehend nicht verfügbar -> letzter Stand ---
{
  const r = resolveGoalProgress({
    trackingMode: 'account_balance',
    startingAmountMinor: 0,
    contributionAmountsMinor: [],
    linkedAccountBalanceMinor: null,
    lastKnownAmountMinor: 180_000,
  });
  assert.deepEqual(r, { amountMinor: 180_000, source: 'last_known', linkedAccountAvailable: false });
}

// --- account_balance: Konto getombstoned (undefined) -> letzter Stand -------
assert.equal(
  resolveGoalProgress({
    trackingMode: 'account_balance',
    startingAmountMinor: 0,
    contributionAmountsMinor: [],
    lastKnownAmountMinor: 75_000,
  }).source,
  'last_known',
);

// --- account_balance: überzogenes Konto -> 0, nie negativ ------------------
assert.equal(
  resolveGoalProgress({
    trackingMode: 'account_balance',
    startingAmountMinor: 0,
    contributionAmountsMinor: [],
    linkedAccountBalanceMinor: -4_500,
    lastKnownAmountMinor: 10_000,
  }).amountMinor,
  0,
);

// --- account_balance: über Ziel -> Betrag bleibt sichtbar -----------------
assert.equal(
  resolveGoalProgress({
    trackingMode: 'account_balance',
    startingAmountMinor: 0,
    contributionAmountsMinor: [],
    linkedAccountBalanceMinor: 500_000,
    lastKnownAmountMinor: 0,
  }).amountMinor,
  500_000,
);

// --- Eigenüberweisung Giro -> Spar (account_balance) ----------------------
// Vorher Kontostand 100.000, danach 120.000. Der Fortschritt folgt dem Konto,
// ganz ohne zusätzlichen Beitrag – exakt +20.000, keine Doppelzählung.
{
  const before = resolveGoalProgress({
    trackingMode: 'account_balance', startingAmountMinor: 0, contributionAmountsMinor: [],
    linkedAccountBalanceMinor: 100_000, lastKnownAmountMinor: 0,
  }).amountMinor;
  const after = resolveGoalProgress({
    trackingMode: 'account_balance', startingAmountMinor: 0, contributionAmountsMinor: [],
    linkedAccountBalanceMinor: 120_000, lastKnownAmountMinor: 0,
  }).amountMinor;
  assert.equal(after - before, 20_000);
}

// --- Anzeige-Helfer -------------------------------------------------------
assert.equal(goalProgressRatio(0, 0), 0, 'Ziel ohne Betrag = 0');
assert.equal(goalProgressRatio(-100, 1000), 0, 'negativ wird auf 0 geklemmt');
assert.equal(goalProgressPercent(1500, 1000), 150, 'über 100 % bleibt numerisch sichtbar');
assert.equal(goalProgressBarPercent(1500, 1000), 100, 'Balken bei 100 % gedeckelt');
assert.equal(goalProgressBarPercent(1, 1000), 2, 'Balken mindestens 2 %');

// --- RC4: regelbasiertes Tracking respektiert die Ziel-Währung -------
const { savingsRuleMatches } = await import('../src/services/savingsRuleCore.ts');

const income = (over = {}) => ({
  bookingStatus: 'booked',
  direction: 'income',
  isInternalTransfer: false,
  accountId: 'acc-1',
  description: 'Gehalt Sparplan',
  counterpartyName: 'Arbeitgeber',
  currency: 'EUR',
  ...over,
});

assert.equal(
  savingsRuleMatches(income(), { keyword: 'sparplan', currency: 'EUR' }),
  true,
  'EUR-Eingang mit Stichwort füllt EUR-Ziel',
);
assert.equal(
  savingsRuleMatches(income({ currency: 'USD' }), { keyword: 'sparplan', currency: 'EUR' }),
  false,
  'USD-Eingang füllt KEIN EUR-Ziel (kein FX)',
);
assert.equal(
  savingsRuleMatches(income({ currency: 'USD' }), { keyword: 'sparplan', currency: 'USD' }),
  true,
  'USD-Eingang füllt USD-Ziel',
);
assert.equal(
  savingsRuleMatches(income({ direction: 'expense' }), { keyword: 'sparplan', currency: 'EUR' }),
  false,
  'Ausgaben erzeugen nie Beiträge',
);
assert.equal(
  savingsRuleMatches(income({ bookingStatus: 'pending' }), { keyword: 'sparplan', currency: 'EUR' }),
  false,
  'vorgemerkte Umsätze zählen nicht',
);
assert.equal(
  savingsRuleMatches(income({ isInternalTransfer: true }), { keyword: 'sparplan', currency: 'EUR' }),
  false,
  'Eigenüberweisungen zählen nicht',
);
assert.equal(
  savingsRuleMatches(income({ accountId: 'acc-2' }), {
    keyword: 'sparplan',
    currency: 'EUR',
    linkedAccountId: 'acc-1',
  }),
  false,
  'nur das verknüpfte Konto',
);
assert.equal(
  savingsRuleMatches(income({ description: 'Miete', counterpartyName: 'Vermieter' }), {
    keyword: 'sparplan',
    currency: 'EUR',
  }),
  false,
  'ohne Stichwort kein Beitrag',
);

console.log('Savings goal lifecycle: all tests passed (incl. currency-scoped rule tracking)');
