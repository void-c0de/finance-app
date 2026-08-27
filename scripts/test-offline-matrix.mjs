import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  isRowPendingPush,
  shouldApplyIncomingRow,
  SYNC_EPOCH_CURSOR,
} from '../src/services/cloud/syncMergeCore.ts';

/**
 * Offline/Sync-Beweismatrix.
 *
 * Modelliert die ECHTE Engine-Semantik mit zwei Geräten und einem Server:
 *
 * - Push sendet Zeilen mit `deleted_at IS NOT NULL OR updated_at > push_cursor`
 *   (isRowPendingPush). Der Server macht ein reines Upsert auf `id`; der
 *   `set_updated_at`-Trigger stempelt `updated_at = <Sync-Zeit>`. Effektiv gilt
 *   also: „das zuletzt synchronisierende Gerät gewinnt" – deterministisch.
 * - Pull wendet eine Server-Zeile an, außer sie ist älter als der lokale Stand
 *   (shouldApplyIncomingRow, LWW auf `updated_at`).
 * - `deleted_at` ist eine gewöhnliche Spalte und unterliegt derselben LWW.
 * - Aktive Zeilen = `deleted_at IS NULL` (Query-Ebene). Ein neues Gerät zieht
 *   auch Tombstones, zeigt sie aber nie an.
 */

let clock = 1_000;
const tick = () => new Date(clock++ * 1000).toISOString();

function makeServer() {
  return { rows: new Map() };
}
function makeDevice(name) {
  return { name, rows: new Map(), pushCursor: SYNC_EPOCH_CURSOR, pullCursor: SYNC_EPOCH_CURSOR };
}

function localWrite(device, id, patch) {
  const prev = device.rows.get(id) ?? { id, deleted_at: null };
  device.rows.set(id, { ...prev, ...patch, id, updated_at: tick() });
}
function localDelete(device, id) {
  const prev = device.rows.get(id);
  if (!prev) return;
  device.rows.set(id, { ...prev, deleted_at: tick(), updated_at: tick() });
}

function push(device, server) {
  for (const row of [...device.rows.values()].sort((a, b) => a.updated_at.localeCompare(b.updated_at))) {
    if (!isRowPendingPush(row, device.pushCursor)) continue;
    // server upsert on id; trigger re-stamps updated_at to sync time
    const stamped = { ...row, updated_at: tick() };
    server.rows.set(row.id, stamped);
    device.rows.set(row.id, stamped); // client keeps the server timestamp
    if (stamped.updated_at > device.pushCursor) device.pushCursor = stamped.updated_at;
  }
}

function pull(device, server) {
  const incoming = [...server.rows.values()]
    .filter((row) => row.updated_at > device.pullCursor)
    .sort((a, b) => a.updated_at.localeCompare(b.updated_at));
  for (const row of incoming) {
    const local = device.rows.get(row.id);
    if (!local || shouldApplyIncomingRow(local.updated_at, row.updated_at)) {
      device.rows.set(row.id, { ...row });
    }
    if (row.updated_at > device.pullCursor) device.pullCursor = row.updated_at;
  }
}

const active = (store) => [...store.rows.values()].filter((row) => !row.deleted_at);

// --- CREATE OFFLINE -> reconnect -> exactly one object -------------------
{
  const server = makeServer();
  const a = makeDevice('A');
  const b = makeDevice('B');
  localWrite(a, 'cat-1', { name: 'Lebensmittel' });
  push(a, server);
  pull(b, server);
  assert.equal(active(a).length, 1);
  assert.equal(active(b).length, 1);
  assert.equal(b.rows.get('cat-1').name, 'Lebensmittel');
  // pull twice = idempotent
  pull(b, server);
  assert.equal(active(b).length, 1);
}

// --- UPDATE OFFLINE -> reconnect -> last device to sync wins -----------
{
  const server = makeServer();
  const a = makeDevice('A');
  const b = makeDevice('B');
  localWrite(a, 'b-1', { name: 'Essen', amount_minor: 30000 });
  push(a, server); pull(b, server);

  // both go offline and edit
  localWrite(a, 'b-1', { amount_minor: 40000 });
  localWrite(b, 'b-1', { amount_minor: 50000 });
  // A syncs first, then B
  push(a, server);
  push(b, server);
  pull(a, server); pull(b, server);
  assert.equal(server.rows.get('b-1').amount_minor, 50000, 'zuletzt synchronisiertes Gerät gewinnt');
  assert.equal(a.rows.get('b-1').amount_minor, 50000);
  assert.equal(b.rows.get('b-1').amount_minor, 50000);
}

// --- DELETE OFFLINE -> tombstone -> propagates ------------------------
{
  const server = makeServer();
  const a = makeDevice('A');
  const b = makeDevice('B');
  localWrite(a, 'g-1', { name: 'Notgroschen' });
  push(a, server); pull(b, server);
  assert.equal(active(b).length, 1);

  localDelete(a, 'g-1');
  push(a, server);
  pull(b, server);
  assert.equal(active(b).length, 0, 'Tombstone propagiert');
  assert.equal(b.rows.get('g-1').deleted_at != null, true);
  // reconnect twice: no resurrection
  pull(b, server);
  assert.equal(active(b).length, 0);
}

// --- REMOTE UPDATE WHILE LOCAL OFFLINE -> deterministic merge ---------
{
  const server = makeServer();
  const a = makeDevice('A');
  const b = makeDevice('B');
  localWrite(a, 'r-1', { kind: 'uncertain' });
  push(a, server); pull(b, server);

  // B offline (no pull); A changes remotely
  localWrite(a, 'r-1', { kind: 'subscription' });
  push(a, server);
  // B finally pulls
  pull(b, server);
  assert.equal(b.rows.get('r-1').kind, 'subscription');
}

// --- LOCAL DELETE VS REMOTE UPDATE -> last to sync wins --------------
{
  const server = makeServer();
  const a = makeDevice('A');
  const b = makeDevice('B');
  localWrite(a, 'x-1', { name: 'X' });
  push(a, server); pull(b, server);

  // A deletes offline, B updates offline
  localDelete(a, 'x-1');
  localWrite(b, 'x-1', { name: 'X neu' });
  // B syncs last -> update wins, row is back
  push(a, server);
  push(b, server);
  pull(a, server);
  assert.equal(active(a).length, 1, 'späteres Update hebt den Tombstone auf');
  assert.equal(a.rows.get('x-1').name, 'X neu');

  // opposite order -> delete wins
  const server2 = makeServer();
  const c = makeDevice('C');
  const d = makeDevice('D');
  localWrite(c, 'y-1', { name: 'Y' });
  push(c, server2); pull(d, server2);
  localWrite(d, 'y-1', { name: 'Y neu' });
  localDelete(c, 'y-1');
  push(d, server2);
  push(c, server2);
  pull(d, server2);
  assert.equal(active(d).length, 0, 'späterer Tombstone gewinnt');
}

// --- TOMBSTONE BEHIND CURSOR -> still propagated --------------------
{
  const server = makeServer();
  const a = makeDevice('A');
  localWrite(a, 't-1', { name: 'T' });
  push(a, server);
  // push cursor is now ahead of the row; delete does NOT bump updated_at past
  // the cursor in the "behind cursor" sense — but isRowPendingPush forces it.
  const row = a.rows.get('t-1');
  const staleTombstone = { ...row, deleted_at: '2000-01-01T00:00:00.000Z' };
  assert.equal(
    isRowPendingPush(staleTombstone, '2999-01-01T00:00:00.000Z'),
    true,
    'ein Tombstone wird immer gepusht, auch hinter dem Cursor',
  );
}

// --- NEW DEVICE -> reconstruct active state, no resurrection --------
{
  const server = makeServer();
  const a = makeDevice('A');
  localWrite(a, 'n-1', { name: 'aktiv' });
  localWrite(a, 'n-2', { name: 'wird gelöscht' });
  push(a, server);
  localDelete(a, 'n-2');
  push(a, server);

  const fresh = makeDevice('FRESH');
  pull(fresh, server);
  assert.equal(fresh.rows.size, 2, 'neues Gerät zieht auch Tombstones');
  assert.equal(active(fresh).length, 1, 'zeigt aber nur aktive Zeilen');
  assert.equal(active(fresh)[0].id, 'n-1');
}

// --- NEW-DEVICE RECOVERY: dependency-safe table order -----------------
// Parent tables must sync before children so a fresh device never applies a
// child row before its referenced parent exists.
{
  const source = readFileSync('src/services/cloud/syncEngine.ts', 'utf8');
  const order = [...source.matchAll(/localTable:\s*\n?\s*'([a-z_]+)'/g)].map((m) => m[1]);

  const DEPENDENCIES = {
    category_rules: ['categories'],
    accounts: ['bank_connections'],
    budgets: ['categories'],
    savings_goals: ['accounts'],
    goal_contributions: ['savings_goals'],
    transactions: ['accounts', 'categories'],
  };

  assert.ok(order.length >= 9, `erwartete >= 9 Sync-Tabellen, fand ${order.length}`);
  const position = new Map(order.map((table, index) => [table, index]));

  for (const [child, parents] of Object.entries(DEPENDENCIES)) {
    assert.ok(position.has(child), `${child} fehlt in TABLE_MAPPINGS`);
    for (const parent of parents) {
      assert.ok(position.has(parent), `${parent} fehlt in TABLE_MAPPINGS`);
      assert.ok(
        position.get(parent) < position.get(child),
        `Recovery-Reihenfolge: ${parent} muss vor ${child} synchronisiert werden`,
      );
    }
  }
}

console.log('Offline/sync matrix: all scenarios passed');
