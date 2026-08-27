import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';

/**
 * Echte SQL-Verhaltensprüfung für die synchronisierten Kern-Entitäten.
 *
 * LIMITIERUNG: getestet wird reines SQLite (node:sqlite), nicht SQLCipher.
 * SQLCipher ist SQL-semantisch identisch (SQLite + Verschlüsselungsschicht);
 * die Verschlüsselung selbst wird hier NICHT geprüft. Das DDL ist 1:1 aus
 * src/db/database.ts (Migrationen v9 und v13) übernommen.
 */

const db = new DatabaseSync(':memory:');
db.exec("PRAGMA foreign_keys = ON;");

// --- v13: recurring_series (aus database.ts) -------------------------
db.exec(`
  CREATE TABLE recurring_series (
    id TEXT PRIMARY KEY NOT NULL,
    merchant_name TEXT,
    kind TEXT NOT NULL DEFAULT 'uncertain',
    muted INTEGER NOT NULL DEFAULT 0,
    user_confirmed INTEGER NOT NULL DEFAULT 1,
    expected_amount_minor INTEGER,
    currency TEXT,
    cadence TEXT,
    note TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
  );
  CREATE TRIGGER trg_recurring_series_insert
  AFTER INSERT ON recurring_series
  BEGIN
    UPDATE recurring_series SET
      created_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
      updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    WHERE id = NEW.id;
  END;
  CREATE TRIGGER trg_recurring_series_update
  AFTER UPDATE ON recurring_series
  WHEN NEW.updated_at = OLD.updated_at
  BEGIN
    UPDATE recurring_series SET
      updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    WHERE id = NEW.id;
  END;
`);

const KEY = 'acc|EUR|expense|netflix.com';

// upsert mirrors src/db/repositories/recurringSeries.ts
const upsert = db.prepare(`
  INSERT INTO recurring_series (id, merchant_name, kind, muted, user_confirmed,
    expected_amount_minor, currency, cadence, created_at, updated_at, deleted_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
  ON CONFLICT(id) DO UPDATE SET
    merchant_name = excluded.merchant_name,
    kind = excluded.kind,
    muted = excluded.muted,
    user_confirmed = excluded.user_confirmed,
    expected_amount_minor = excluded.expected_amount_minor,
    currency = excluded.currency,
    cadence = excluded.cadence,
    deleted_at = NULL
`);

// CREATE
upsert.run(KEY, 'Netflix', 'subscription', 0, 1, 1799, 'EUR', 'monthly', 't0', 't0');
let row = db.prepare('SELECT * FROM recurring_series WHERE id = ?').get(KEY);
assert.equal(row.kind, 'subscription');
assert.notEqual(row.created_at, 't0', 'INSERT-Trigger stempelt created_at');
assert.match(row.updated_at, /Z$/, 'ISO-Zeitstempel');
const createdAt = row.created_at;
const firstUpdatedAt = row.updated_at;

// UPDATE via upsert -> same id, deleted_at stays NULL, updated_at advances
await new Promise((resolve) => setTimeout(resolve, 5));
upsert.run(KEY, 'Netflix', 'bill', 0, 1, 1799, 'EUR', 'monthly', 'ignored', 'ignored');
row = db.prepare('SELECT * FROM recurring_series WHERE id = ?').get(KEY);
assert.equal(row.kind, 'bill', 'Konflikt-Update ändert kind');
assert.equal(row.created_at, createdAt, 'created_at bleibt beim Update stabil');
assert.ok(row.updated_at > firstUpdatedAt, 'Update-Trigger schiebt updated_at vor');
assert.equal(db.prepare('SELECT COUNT(*) c FROM recurring_series').get().c, 1, 'kein Duplikat');

// TOMBSTONE
await new Promise((resolve) => setTimeout(resolve, 5));
const beforeTomb = row.updated_at;
db.prepare(`UPDATE recurring_series SET deleted_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ? AND deleted_at IS NULL`).run(KEY);
row = db.prepare('SELECT * FROM recurring_series WHERE id = ?').get(KEY);
assert.ok(row.deleted_at, 'Tombstone gesetzt');
assert.ok(row.updated_at > beforeTomb, 'Tombstone schiebt updated_at vor (propagiert über Sync)');

// query filtering
assert.equal(
  db.prepare('SELECT COUNT(*) c FROM recurring_series WHERE deleted_at IS NULL').get().c,
  0,
  'aktive Abfrage blendet Tombstone aus',
);

// RESURRECTION via re-upsert
await new Promise((resolve) => setTimeout(resolve, 5));
upsert.run(KEY, 'Netflix', 'subscription', 0, 1, 1999, 'EUR', 'monthly', 'x', 'x');
row = db.prepare('SELECT * FROM recurring_series WHERE id = ?').get(KEY);
assert.equal(row.deleted_at, null, 'Re-Upsert belebt die Serie wieder (deleted_at = NULL)');
assert.equal(row.expected_amount_minor, 1999);
assert.equal(row.created_at, createdAt, 'created_at überlebt die Wiederbelebung');

// --- v9: savings_goals + goal_contributions (parent/child) ----------
db.exec(`
  CREATE TABLE savings_goals (
    id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL,
    target_amount REAL NOT NULL, target_amount_minor INTEGER NOT NULL DEFAULT 0,
    current_amount REAL NOT NULL DEFAULT 0, current_amount_minor INTEGER NOT NULL DEFAULT 0,
    starting_amount_minor INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'active',
    tracking_mode TEXT NOT NULL DEFAULT 'manual',
    created_at TEXT, updated_at TEXT, deleted_at TEXT
  );
  CREATE TABLE goal_contributions (
    id TEXT PRIMARY KEY NOT NULL, goal_id TEXT NOT NULL, amount_minor INTEGER NOT NULL,
    source TEXT NOT NULL DEFAULT 'manual', source_transaction_id TEXT, note TEXT,
    occurred_at TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT
  );
  CREATE UNIQUE INDEX idx_goal_contrib_goal_tx_active
  ON goal_contributions(goal_id, source_transaction_id)
  WHERE source_transaction_id IS NOT NULL AND deleted_at IS NULL;
  CREATE TRIGGER trg_goal_contrib_insert AFTER INSERT ON goal_contributions
  BEGIN
    UPDATE goal_contributions SET
      created_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'),
      updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
    WHERE id = NEW.id;
  END;
`);

db.prepare(`INSERT INTO savings_goals (id, name, target_amount, target_amount_minor, created_at, updated_at) VALUES ('g1','Notgroschen',3000,300000,'t','t')`).run();
const addContrib = db.prepare(`INSERT INTO goal_contributions (id, goal_id, amount_minor, source, source_transaction_id, occurred_at, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)`);
addContrib.run('c1', 'g1', 20000, 'transaction', 'tx-1', 'o', 'x', 'x');

// idempotency: second active auto-contribution for the same tx is rejected
assert.throws(
  () => addContrib.run('c2', 'g1', 20000, 'transaction', 'tx-1', 'o', 'x', 'x'),
  /UNIQUE|constraint/i,
  'Partial-Unique-Index verhindert doppelten aktiven Auto-Beitrag',
);

// after tombstoning c1, the same tx may be tracked again (re-import)
db.prepare(`UPDATE goal_contributions SET deleted_at = 'gone' WHERE id = 'c1'`).run();
addContrib.run('c3', 'g1', 20000, 'transaction', 'tx-1', 'o', 'x', 'x');
assert.equal(
  db.prepare(`SELECT COUNT(*) c FROM goal_contributions WHERE goal_id='g1' AND source_transaction_id='tx-1' AND deleted_at IS NULL`).get().c,
  1,
  'genau ein aktiver Beitrag pro Transaktion',
);

// parent tombstone does NOT hard-delete children (both carry their own tombstone)
db.prepare(`UPDATE savings_goals SET deleted_at = 'gone' WHERE id = 'g1'`).run();
assert.equal(db.prepare(`SELECT COUNT(*) c FROM goal_contributions WHERE goal_id='g1'`).get().c, 2, 'Kind-Zeilen bleiben physisch erhalten');

// --- transaktionaler Restore: alles-oder-nichts ---------------------
// Spiegelt backupRestoreService.applyRestore: mehrere Upserts in EINER
// Transaktion; schlägt ein Schritt fehl, bleibt die DB unverändert.
{
  db.exec(`
    CREATE TABLE restore_accounts (id TEXT PRIMARY KEY, name TEXT NOT NULL, balance REAL NOT NULL);
    CREATE TABLE restore_tx (
      id TEXT PRIMARY KEY, account_id TEXT NOT NULL, amount REAL NOT NULL,
      FOREIGN KEY (account_id) REFERENCES restore_accounts(id)
    );
    INSERT INTO restore_accounts VALUES ('a1', 'Bestand', 100.0);
  `);

  const before = db.prepare('SELECT name, balance FROM restore_accounts WHERE id = ?').get('a1');

  let rolledBack = false;
  try {
    db.exec('BEGIN');
    db.prepare(`INSERT INTO restore_accounts (id, name, balance) VALUES ('a1','Neu',999.0)
                ON CONFLICT(id) DO UPDATE SET name = excluded.name, balance = excluded.balance`).run();
    db.prepare('INSERT INTO restore_tx (id, account_id, amount) VALUES (?,?,?)').run('t1', 'a1', 5.0);
    // fehlerhafter Schritt: FK auf nicht existierendes Konto
    db.prepare('INSERT INTO restore_tx (id, account_id, amount) VALUES (?,?,?)').run('t2', 'ghost', 5.0);
    db.exec('COMMIT');
  } catch {
    db.exec('ROLLBACK');
    rolledBack = true;
  }

  assert.equal(rolledBack, true, 'defekte FK bricht die Restore-Transaktion ab');
  const after = db.prepare('SELECT name, balance FROM restore_accounts WHERE id = ?').get('a1');
  assert.deepEqual(after, before, 'nach Rollback ist das Konto unverändert');
  assert.equal(db.prepare('SELECT COUNT(*) c FROM restore_tx').get().c, 0, 'keine halb geschriebenen Umsätze');
}

// --- Restore setzt Backup-Zeitstempel trotz Insert-Trigger ----------
{
  db.exec(`
    CREATE TABLE restore_stamped (
      id TEXT PRIMARY KEY, kind TEXT NOT NULL,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT
    );
    CREATE TRIGGER trg_restore_stamped_insert AFTER INSERT ON restore_stamped
    BEGIN
      UPDATE restore_stamped SET
        created_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'),
        updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
      WHERE id = NEW.id;
    END;
    CREATE TRIGGER trg_restore_stamped_update AFTER UPDATE ON restore_stamped
    WHEN NEW.updated_at = OLD.updated_at
    BEGIN
      UPDATE restore_stamped SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = NEW.id;
    END;
  `);
  const BACKUP_TS = '2026-02-02T02:02:02.000Z';
  db.exec('BEGIN');
  db.prepare(`INSERT INTO restore_stamped (id, kind, created_at, updated_at, deleted_at) VALUES ('s1','x',?,?,NULL)`).run(BACKUP_TS, BACKUP_TS);
  // korrektiver UPDATE (wie im Restore-Service) – Trigger feuert nicht, weil sich updated_at ändert
  db.prepare(`UPDATE restore_stamped SET created_at = ?, updated_at = ?, deleted_at = ? WHERE id = 's1'`).run(BACKUP_TS, BACKUP_TS, null);
  db.exec('COMMIT');
  const row = db.prepare('SELECT created_at, updated_at FROM restore_stamped WHERE id = ?').get('s1');
  assert.equal(row.updated_at, BACKUP_TS, 'Restore behält den Backup-updated_at (LWW-korrekt)');
  assert.equal(row.created_at, BACKUP_TS, 'Restore behält den Backup-created_at');
}

db.close();
console.log('SQLite repository semantics (plain SQLite, not SQLCipher): all tests passed');
