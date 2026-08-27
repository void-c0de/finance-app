import assert from 'node:assert/strict';

import { buildSupportDiagnostics, diagnosticsLooksSafe } from '../src/services/supportDiagnosticsCore.ts';

const input = {
  appVersion: '1.5.0',
  runtimeVersion: '1.5.0',
  buildNumber: 6,
  platform: 'android',
  osVersion: '16',
  isEmbeddedUpdate: true,
  schemaVersion: 13,
  cloudSyncStatus: 'synced',
  lastSyncedAt: '2026-08-28T10:00:00.000Z',
  lastLocalLoadAt: '2026-08-28T10:01:00.000Z',
  accountCount: 3,
  bankConnectionCount: 1,
  bankConnectionStates: ['active', 'requires_action'],
  bankConnectionsNeedingAction: 1,
  recurringSeriesCount: 4,
  mutedSeriesCount: 1,
  budgetCount: 3,
  activeGoalCount: 2,
  unsyncedChangeCount: 0,
  foreignCurrencies: ['USD'],
  recentErrorCodes: ['CLD-PULL-003', 'CLD-PULL-003', 'not-a-code', 'DB-MIG-001'],
  premiumPlan: 'premium',
  premiumSource: 'coupon',
  now: new Date('2026-08-28T12:00:00.000Z'),
};

const text = buildSupportDiagnostics(input);

// enthält die sicheren Fakten
assert.match(text, /App-Version: 1\.5\.0 \(Build 6\)/);
assert.match(text, /DB-Schema: 13/);
assert.match(text, /Zustände: active, requires_action/);
assert.match(text, /Fremdwährungen: USD/);
assert.match(text, /CLD-PULL-003, DB-MIG-001/, 'nur echte Fehlercodes, dedupliziert');
assert.ok(!text.includes('not-a-code'), 'Nicht-Codes werden verworfen');
assert.match(text, /Tarif: premium \(Quelle: coupon\)/);

// enthält KEINE sensiblen Muster
assert.equal(diagnosticsLooksSafe(text), true);

// Gegenprobe: der Safe-Check schlägt bei echten Secrets an
assert.equal(diagnosticsLooksSafe('token: eyJhbGciOiJ.abc.def'), false);
assert.equal(diagnosticsLooksSafe('Kontostand 1.234,56 EUR'), false);
assert.equal(diagnosticsLooksSafe('mail user@example.com'), false);
assert.equal(diagnosticsLooksSafe('IBAN DE89370400440532013000'), false);

// null / fehlende Werte brechen nichts
const sparse = buildSupportDiagnostics({
  ...input,
  schemaVersion: null,
  lastSyncedAt: null,
  lastLocalLoadAt: null,
  unsyncedChangeCount: null,
  bankConnectionStates: [],
  foreignCurrencies: [],
  recentErrorCodes: [],
});
assert.match(sparse, /DB-Schema: unbekannt/);
assert.match(sparse, /Ungesyncte Änderungen: unbekannt/);
assert.match(sparse, /Interne Fehlercodes \(Sitzung\): keine/);
assert.equal(diagnosticsLooksSafe(sparse), true);

console.log('Support diagnostics: safe redacted bundle, real error codes only');
