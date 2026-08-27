import assert from 'node:assert/strict';

import {
  BACKUP_LIMITS,
  buildRestorePlan,
  inspectBackup,
  RESTORE_ORDER,
  summarizeCounts,
} from '../src/services/backupImportCore.ts';

/**
 * Backup-Import: strenge Validierung + konservativer Merge-Plan.
 * Ein importiertes File ist NICHT vertrauenswürdig.
 */

const T0 = '2026-01-01T00:00:00.000Z';
const T1 = '2026-06-01T00:00:00.000Z';
const T2 = '2026-08-01T00:00:00.000Z';

function baseBackup(overrides = {}) {
  return JSON.stringify({
    format: 'finance-app-backup',
    version: 2,
    createdAt: T2,
    appVersion: '1.4.0',
    data: {
      categories: [{ id: 'cat-1', name: 'Lebensmittel', isIncomeCategory: false, createdAt: T0, updatedAt: T1 }],
      accounts: [
        {
          id: 'acc-1',
          providerId: 'tink',
          externalAccountId: 'ext-1',
          name: 'Giro',
          currency: 'EUR',
          balanceMinor: 123456,
          type: 'checking',
          createdAt: T0,
          updatedAt: T1,
        },
      ],
      budgets: [
        { id: 'bud-1', categoryId: 'cat-1', name: 'Essen', amountMinor: 40000, period: 'monthly', updatedAt: T1 },
      ],
      transactions: [
        {
          id: 'tx-1',
          accountId: 'acc-1',
          amountMinor: 999,
          currency: 'EUR',
          direction: 'expense',
          bookingDate: '2026-05-05',
          bookingStatus: 'booked',
          description: 'Rewe',
          categoryId: 'cat-1',
          updatedAt: T1,
        },
      ],
      savingsGoals: [
        {
          id: 'goal-1',
          name: 'Notgroschen',
          targetAmountMinor: 300000,
          currentAmountMinor: 50000,
          startingAmountMinor: 0,
          currency: 'EUR',
          trackingMode: 'manual',
          status: 'active',
          updatedAt: T1,
        },
      ],
      goalContributions: [
        { id: 'gc-1', goalId: 'goal-1', amountMinor: 50000, source: 'manual', occurredAt: T0, updatedAt: T1 },
      ],
      recurringSeries: [
        { id: 'acc-1|EUR|expense|netflix', kind: 'subscription', muted: false, userConfirmed: true, updatedAt: T1 },
      ],
      bankConnections: [
        { id: 'bc-1', providerId: 'tink', institutionName: 'Test Bank', isDemo: true, updatedAt: T1 },
      ],
      ...overrides,
    },
  });
}

// --- happy path v2 ------------------------------------------------------
{
  const result = inspectBackup(baseBackup());
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.counts.transactions, 1);
  assert.equal(result.counts.categories, 1);
  assert.equal(result.backup.formatVersion, 2);
  assert.equal(result.backup.createdAt, T2);
  const summary = summarizeCounts(result.counts);
  assert.ok(summary.find((s) => s.domain === 'transactions'));
}

// --- v1 (ohne die neuen Domänen / Zeitstempel) bleibt importierbar -----
{
  const v1 = JSON.stringify({
    format: 'finance-app-backup',
    version: 1,
    createdAt: T1,
    appVersion: '1.3.0',
    data: {
      categories: [{ id: 'c', name: 'X', isIncomeCategory: false }],
      accounts: [],
      budgets: [],
      transactions: [],
      savingsGoals: [],
      recurringSeries: [],
    },
  });
  const result = inspectBackup(v1);
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.counts.categories, 1);
}

// --- Ablehnungen ------------------------------------------------------
function rejects(raw, code, label) {
  const result = inspectBackup(raw);
  assert.equal(result.ok, false, `${label}: hätte abgelehnt werden müssen`);
  assert.ok(
    result.issues.some((i) => i.code === code),
    `${label}: erwartete Code ${code}, bekam ${JSON.stringify(result.issues.map((i) => i.code))}`,
  );
}

rejects('', 'empty_file', 'leere Datei');
rejects('{ kaputt', 'invalid_json', 'defektes JSON');
rejects(JSON.stringify([1, 2, 3]), 'not_a_backup', 'Array statt Objekt');
rejects(JSON.stringify({ format: 'anderes', version: 2, data: {} }), 'wrong_format', 'falsches Format');
rejects(JSON.stringify({ format: 'finance-app-backup', version: 99, data: {} }), 'unsupported_version', 'Zukunftsversion');
rejects(JSON.stringify({ format: 'finance-app-backup', version: 2, data: null }), 'missing_data', 'kein Datenteil');
rejects(baseBackup({ categories: { not: 'a list' } }), 'domain_not_array', 'Domäne kein Array');
rejects(
  baseBackup({
    categories: [
      { id: 'dup', name: 'A', isIncomeCategory: false },
      { id: 'dup', name: 'B', isIncomeCategory: false },
    ],
  }),
  'duplicate_id',
  'doppelte ID',
);
rejects(
  baseBackup({ transactions: [{ id: 'tx-x', accountId: 'nope', amountMinor: 1, currency: 'EUR', direction: 'expense', bookingDate: '2026-01-01', bookingStatus: 'booked', updatedAt: T1 }] }),
  'broken_reference',
  'FK auf fehlendes Konto',
);
rejects(
  baseBackup({ accounts: [{ id: 'a', providerId: 'p', externalAccountId: 'e', name: 'n', currency: 'EUR', balanceMinor: 1.5, type: 'checking', updatedAt: T1 }] }),
  'bad_money',
  'Fließkomma-Betrag',
);
rejects(
  baseBackup({ accounts: [{ id: 'a', providerId: 'p', externalAccountId: 'e', name: 'n', currency: 'EUR', balanceMinor: '100', type: 'checking', updatedAt: T1 }] }),
  'bad_money',
  'String-Betrag',
);
rejects(
  baseBackup({ categories: [{ id: 'c', name: 'x'.repeat(BACKUP_LIMITS.maxStringLength + 1), isIncomeCategory: false }] }),
  'string_too_long',
  'überlanger String',
);
rejects(
  baseBackup({ goalContributions: [{ id: 'g', goalId: 'goal-1', amountMinor: 1, source: 'manual', occurredAt: 'gestern', updatedAt: T1 }] }),
  'bad_timestamp',
  'ungültiger Zeitstempel',
);
rejects(
  baseBackup({ transactions: [{ id: 'tx-2', accountId: 'acc-1', amountMinor: 1, currency: 'EU', direction: 'expense', bookingDate: '2026-01-01', bookingStatus: 'booked', updatedAt: T1 }] }),
  'bad_currency',
  'ungültige Währung',
);
rejects(
  baseBackup({ budgets: [{ id: 'b', categoryId: 'cat-1', name: 'x', amountMinor: 1, period: 'daily', updatedAt: T1 }] }),
  'bad_enum',
  'unerlaubtes Enum',
);

// --- Prototyp-Verschmutzung ------------------------------------------
{
  const raw = `{"format":"finance-app-backup","version":2,"data":{"categories":[{"id":"c","name":"x","isIncomeCategory":false,"__proto__":{"admin":true}}]}}`;
  const result = inspectBackup(raw);
  assert.equal(result.ok, false, 'Zeile mit __proto__ muss abgelehnt werden');
  assert.ok(result.issues.some((i) => i.code === 'row_not_object' || i.code === 'not_a_backup'));
  assert.equal(({}).admin, undefined, 'kein Prototyp verschmutzt');
}

// --- Übergröße -------------------------------------------------------
{
  const huge = 'x'.repeat(BACKUP_LIMITS.maxBytes + 10);
  const result = inspectBackup(`{"format":"finance-app-backup","version":2,"note":"${huge}","data":{}}`);
  assert.equal(result.ok, false);
  assert.equal(result.issues[0].code, 'too_large');
}

// --- optionale Referenz wird bereinigt statt abgelehnt ---------------
{
  const result = inspectBackup(
    baseBackup({
      transactions: [
        {
          id: 'tx-9',
          accountId: 'acc-1',
          amountMinor: 100,
          currency: 'EUR',
          direction: 'expense',
          bookingDate: '2026-01-01',
          bookingStatus: 'booked',
          categoryId: 'ghost-cat',
          updatedAt: T1,
        },
      ],
    }),
  );
  assert.equal(result.ok, true, 'defekte optionale Kategorie-Referenz ist nicht fatal');
  assert.ok(result.notes.some((n) => n.code === 'reference_sanitized'));
  assert.equal(result.backup.rows.transactions[0].categoryId, null, 'Referenz geleert');
}

// --- Restore-Plan: create / update / skip-older / skip-unchanged ------
{
  const parsed = inspectBackup(baseBackup());
  assert.equal(parsed.ok, true);

  const empty = Object.fromEntries(RESTORE_ORDER.map((d) => [d, new Map()]));
  const planFresh = buildRestorePlan(parsed.backup, empty);
  assert.equal(planFresh.perDomain.transactions.create, 1);
  assert.equal(planFresh.perDomain.categories.create, 1);
  assert.ok(planFresh.totalWrites >= 8);

  // lokal existiert tx-1 NEUER als das Backup -> skip
  const localNewer = { ...empty, transactions: new Map([['tx-1', { updatedAt: T2, deletedAt: null }]]) };
  const plan2 = buildRestorePlan(parsed.backup, localNewer);
  assert.equal(plan2.perDomain.transactions.skipOlder, 1);
  assert.equal(plan2.perDomain.transactions.create, 0);

  // lokal existiert tx-1 mit exakt gleichem updatedAt -> skip unchanged
  const localSame = { ...empty, transactions: new Map([['tx-1', { updatedAt: T1, deletedAt: null }]]) };
  const plan3 = buildRestorePlan(parsed.backup, localSame);
  assert.equal(plan3.perDomain.transactions.skipUnchanged, 1);

  // lokal existiert tx-1 ÄLTER -> update
  const localOlder = { ...empty, transactions: new Map([['tx-1', { updatedAt: T0, deletedAt: null }]]) };
  const plan4 = buildRestorePlan(parsed.backup, localOlder);
  assert.equal(plan4.perDomain.transactions.update, 1);
}

// --- Restore belebt einen NEUEREN lokalen Tombstone nicht wieder -----
{
  const parsed = inspectBackup(baseBackup());
  const empty = Object.fromEntries(RESTORE_ORDER.map((d) => [d, new Map()]));
  const locallyDeletedLater = {
    ...empty,
    transactions: new Map([['tx-1', { updatedAt: T0, deletedAt: T2 }]]),
  };
  const plan = buildRestorePlan(parsed.backup, locallyDeletedLater);
  assert.equal(plan.perDomain.transactions.skipOlder, 1, 'bewusst gelöschte Zeile bleibt gelöscht');
  assert.equal(plan.perDomain.transactions.update, 0);
}

// --- FK-sichere Reihenfolge -----------------------------------------
{
  const pos = new Map(RESTORE_ORDER.map((d, i) => [d, i]));
  assert.ok(pos.get('categories') < pos.get('budgets'));
  assert.ok(pos.get('accounts') < pos.get('transactions'));
  assert.ok(pos.get('savingsGoals') < pos.get('goalContributions'));
  assert.ok(pos.get('bankConnections') < pos.get('accounts'));
}

console.log('Backup import: all validation & merge-plan scenarios passed');
