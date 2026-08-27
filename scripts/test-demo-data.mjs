import assert from 'node:assert/strict';

import { buildDemoDataset, DEMO_ID_PREFIX } from '../src/services/demoDataCore.ts';
import { inspectBackup, RESTORE_ORDER, buildRestorePlan } from '../src/services/backupImportCore.ts';

/**
 * Demo-Datensatz: deterministisch, offensichtlich synthetisch, importierbar.
 */

const NOW = new Date('2026-08-15T12:00:00.000Z');

const a = buildDemoDataset(NOW);
const b = buildDemoDataset(NOW);
assert.deepEqual(a, b, 'deterministisch bei gleichem Zeitpunkt');

// --- alle erzeugten IDs tragen das demo- Präfix (außer Standard-Kategorien) ---
for (const domain of ['accounts', 'transactions', 'budgets', 'savingsGoals', 'goalContributions', 'recurringSeries', 'bankConnections', 'categoryRules']) {
  for (const row of a[domain]) {
    assert.ok(String(row.id).startsWith(DEMO_ID_PREFIX), `${domain}: ID ohne demo- Präfix: ${row.id}`);
  }
}
for (const row of a.categories) {
  assert.ok(String(row.id).startsWith('cat-'), 'Kategorien nutzen die echten Standard-IDs');
}

// --- offensichtlich synthetisch: jede Gegenpartei enthält "Demo" oder ist neutral ---
const merchants = new Set(a.transactions.map((t) => t.counterpartyName).filter(Boolean));
for (const m of merchants) {
  assert.ok(/Demo|Giro|Tagesgeld/.test(String(m)), `Gegenpartei nicht klar synthetisch: ${m}`);
}

// --- Geld ist immer ganzzahlige Minor-Unit ---
for (const t of a.transactions) {
  assert.ok(Number.isSafeInteger(t.amountMinor) && t.amountMinor > 0, `Betrag ungültig: ${t.amountMinor}`);
}

// --- Historie: mind. 5 verschiedene Monate mit Umsätzen ---
const months = new Set(a.transactions.map((t) => String(t.bookingDate).slice(0, 7)));
assert.ok(months.size >= 5, `zu wenig Monatshistorie: ${months.size}`);

// --- aktueller Monat: keine Buchung in der Zukunft ---
for (const t of a.transactions) {
  assert.ok(String(t.bookingDate) <= '2026-08-15', `Buchung in der Zukunft: ${t.bookingDate}`);
}

// --- Abo-Preisänderung ist enthalten (für die Preis-Intelligenz) ---
const videoAmounts = new Set(
  a.transactions.filter((t) => t.description === 'Video-Streaming').map((t) => t.amountMinor),
);
assert.ok(videoAmounts.size >= 2, 'Video-Streaming hat eine Preisänderung');

// --- Budgets / Ziele / wiederkehrende Serien vorhanden ---
assert.equal(a.budgets.length, 3);
assert.equal(a.savingsGoals.length, 2);
assert.ok(a.recurringSeries.length >= 3);
assert.ok(a.goalContributions.length >= 8);

// --- durch die strenge Importer-Validierung ---
const raw = JSON.stringify({ format: 'finance-app-backup', version: 2, createdAt: NOW.toISOString(), appVersion: '1.5.0', data: a });
const result = inspectBackup(raw);
assert.equal(result.ok, true, `Demo-Backup wird abgelehnt: ${JSON.stringify(result.ok ? {} : result.issues)}`);
assert.equal(result.notes.length, 0, `unerwartete Bereinigungen: ${JSON.stringify(result.notes)}`);
assert.equal(result.counts.transactions, a.transactions.length);

// --- Restore-Plan auf leerer DB: alles create, kein Konflikt ---
const empty = Object.fromEntries(RESTORE_ORDER.map((d) => [d, new Map()]));
const plan = buildRestorePlan(result.backup, empty);
assert.equal(plan.perDomain.transactions.create, a.transactions.length);
assert.ok(plan.totalWrites > 100, `zu wenig Demo-Inhalt: ${plan.totalWrites} Schreibvorgänge`);

// --- FK-Integrität: jede Transaktion verweist auf ein Demo-Konto ---
const accIds = new Set(a.accounts.map((x) => x.id));
for (const t of a.transactions) {
  assert.ok(accIds.has(t.accountId), `Transaktion ohne gültiges Konto: ${t.accountId}`);
}

console.log(`Demo data: ${a.transactions.length} Umsätze über ${months.size} Monate, ${plan.totalWrites} Schreibvorgänge – deterministisch & importierbar`);
