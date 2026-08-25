import * as SQLite from 'expo-sqlite';

import {
  runMoneySelfTest,
} from '@/core/money.test-data';

import {
  getDatabaseEncryptionKey,
} from '@/security/databaseKey';

let database:
  SQLite.SQLiteDatabase | null =
    null;

type Migration = {
  version: number;

  sql: string;
};

const migrations:
  Migration[] = [
    {
      version: 1,

      sql: `
        CREATE TABLE IF NOT EXISTS accounts (
          id TEXT PRIMARY KEY NOT NULL,

          provider_id TEXT NOT NULL,

          external_account_id TEXT NOT NULL,

          name TEXT NOT NULL,

          iban TEXT,

          currency TEXT NOT NULL,

          balance REAL NOT NULL DEFAULT 0,

          type TEXT NOT NULL,

          institution_name TEXT,

          last_synced_at TEXT
        );

        CREATE TABLE IF NOT EXISTS categories (
          id TEXT PRIMARY KEY NOT NULL,

          name TEXT NOT NULL,

          icon TEXT,

          is_income_category INTEGER
            NOT NULL
            DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS transactions (
          id TEXT PRIMARY KEY NOT NULL,

          account_id TEXT NOT NULL,

          external_transaction_id TEXT,

          amount REAL NOT NULL,

          currency TEXT NOT NULL,

          direction TEXT NOT NULL,

          booking_date TEXT NOT NULL,

          value_date TEXT,

          description TEXT NOT NULL,

          counterparty_name TEXT,

          counterparty_iban TEXT,

          category_id TEXT,

          is_recurring INTEGER
            NOT NULL
            DEFAULT 0,

          created_at TEXT NOT NULL,

          FOREIGN KEY (
            account_id
          )
            REFERENCES accounts(id)
            ON DELETE CASCADE,

          FOREIGN KEY (
            category_id
          )
            REFERENCES categories(id)
            ON DELETE SET NULL
        );

        CREATE TABLE IF NOT EXISTS budgets (
          id TEXT PRIMARY KEY NOT NULL,

          category_id TEXT,

          name TEXT NOT NULL,

          amount REAL NOT NULL,

          period TEXT NOT NULL
            DEFAULT 'monthly',

          FOREIGN KEY (
            category_id
          )
            REFERENCES categories(id)
            ON DELETE SET NULL
        );

        CREATE TABLE IF NOT EXISTS savings_goals (
          id TEXT PRIMARY KEY NOT NULL,

          name TEXT NOT NULL,

          target_amount REAL NOT NULL,

          current_amount REAL
            NOT NULL
            DEFAULT 0,

          target_date TEXT
        );

        CREATE INDEX IF NOT EXISTS
          idx_transactions_account_id
        ON transactions(account_id);

        CREATE INDEX IF NOT EXISTS
          idx_transactions_booking_date
        ON transactions(booking_date);

        CREATE INDEX IF NOT EXISTS
          idx_transactions_category_id
        ON transactions(category_id);
      `,
    },

    {
      version: 2,

      sql: `
        CREATE TABLE IF NOT EXISTS bank_connections (
          id TEXT PRIMARY KEY NOT NULL,

          provider_id TEXT NOT NULL,

          external_connection_id TEXT
            NOT NULL,

          institution_id TEXT NOT NULL,

          institution_name TEXT NOT NULL,

          status TEXT NOT NULL,

          is_demo INTEGER
            NOT NULL
            DEFAULT 0,

          created_at TEXT NOT NULL,

          updated_at TEXT NOT NULL,

          last_synced_at TEXT,

          UNIQUE(
            provider_id,
            external_connection_id
          )
        );

        CREATE INDEX IF NOT EXISTS
          idx_bank_connections_provider
        ON bank_connections(provider_id);

        CREATE INDEX IF NOT EXISTS
          idx_bank_connections_status
        ON bank_connections(status);
      `,
    },

    {
      version: 3,

      sql: `
        ALTER TABLE accounts
        ADD COLUMN balance_minor INTEGER
          NOT NULL
          DEFAULT 0;

        UPDATE accounts
        SET balance_minor =
          CAST(
            ROUND(balance * 100)
            AS INTEGER
          );

        ALTER TABLE transactions
        ADD COLUMN amount_minor INTEGER
          NOT NULL
          DEFAULT 0;

        UPDATE transactions
        SET amount_minor =
          CAST(
            ROUND(
              ABS(amount) * 100
            )
            AS INTEGER
          );

        ALTER TABLE budgets
        ADD COLUMN amount_minor INTEGER
          NOT NULL
          DEFAULT 0;

        UPDATE budgets
        SET amount_minor =
          CAST(
            ROUND(amount * 100)
            AS INTEGER
          );

        ALTER TABLE savings_goals
        ADD COLUMN target_amount_minor INTEGER
          NOT NULL
          DEFAULT 0;

        UPDATE savings_goals
        SET target_amount_minor =
          CAST(
            ROUND(
              target_amount * 100
            )
            AS INTEGER
          );

        ALTER TABLE savings_goals
        ADD COLUMN current_amount_minor INTEGER
          NOT NULL
          DEFAULT 0;

        UPDATE savings_goals
        SET current_amount_minor =
          CAST(
            ROUND(
              current_amount * 100
            )
            AS INTEGER
          );
      `,
    },

    {
      version: 4,

      sql: `
        CREATE UNIQUE INDEX IF NOT EXISTS
          idx_accounts_provider_external_unique
        ON accounts(
          provider_id,
          external_account_id
        );

        CREATE INDEX IF NOT EXISTS
          idx_accounts_provider_id
        ON accounts(provider_id);

        CREATE INDEX IF NOT EXISTS
          idx_accounts_last_synced_at
        ON accounts(last_synced_at);

        CREATE INDEX IF NOT EXISTS
          idx_transactions_external_id
        ON transactions(
          external_transaction_id
        );
      `,
    },

    {
      /**
       * Accounts werden jetzt einer
       * konkreten Bankverbindung
       * zugeordnet.
       *
       * Außerdem verhindert der
       * Unique-Index doppelte Umsätze
       * bei wiederholten Syncs.
       */
      version: 5,

      sql: `
        ALTER TABLE accounts
        ADD COLUMN bank_connection_id TEXT;

        CREATE INDEX IF NOT EXISTS
          idx_accounts_bank_connection_id
        ON accounts(
          bank_connection_id
        );

        CREATE UNIQUE INDEX IF NOT EXISTS
          idx_transactions_account_external_unique
        ON transactions(
          account_id,
          external_transaction_id
        );
      `,
    },

    {
      /**
       * M5 — Sync-sichere lokale Spalten.
       *
       * created_at / updated_at / deleted_at
       * auf allen synchronisierbaren Entitäten.
       *
       * Trigger pflegen die Zeitstempel
       * automatisch, damit Repositories und
       * Sync-Engine konsistente Werte haben.
       */
      version: 6,

      sql: `
        ALTER TABLE accounts ADD COLUMN created_at TEXT;
        ALTER TABLE accounts ADD COLUMN updated_at TEXT;
        ALTER TABLE accounts ADD COLUMN deleted_at TEXT;

        ALTER TABLE categories ADD COLUMN created_at TEXT;
        ALTER TABLE categories ADD COLUMN updated_at TEXT;
        ALTER TABLE categories ADD COLUMN deleted_at TEXT;

        ALTER TABLE transactions ADD COLUMN updated_at TEXT;
        ALTER TABLE transactions ADD COLUMN deleted_at TEXT;

        ALTER TABLE budgets ADD COLUMN created_at TEXT;
        ALTER TABLE budgets ADD COLUMN updated_at TEXT;
        ALTER TABLE budgets ADD COLUMN deleted_at TEXT;

        ALTER TABLE bank_connections ADD COLUMN deleted_at TEXT;

        UPDATE accounts SET
          created_at = COALESCE(created_at, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
          updated_at = COALESCE(updated_at, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));

        UPDATE categories SET
          created_at = COALESCE(created_at, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
          updated_at = COALESCE(updated_at, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));

        UPDATE transactions SET
          updated_at = COALESCE(updated_at, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));

        UPDATE budgets SET
          created_at = COALESCE(created_at, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
          updated_at = COALESCE(updated_at, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));

        CREATE TRIGGER IF NOT EXISTS trg_accounts_insert
        AFTER INSERT ON accounts
        BEGIN
          UPDATE accounts SET
            created_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
            updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
          WHERE id = NEW.id;
        END;

        CREATE TRIGGER IF NOT EXISTS trg_accounts_update
        AFTER UPDATE ON accounts
        WHEN NEW.updated_at = OLD.updated_at
        BEGIN
          UPDATE accounts SET
            updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
          WHERE id = NEW.id;
        END;

        CREATE TRIGGER IF NOT EXISTS trg_categories_insert
        AFTER INSERT ON categories
        BEGIN
          UPDATE categories SET
            created_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
            updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
          WHERE id = NEW.id;
        END;

        CREATE TRIGGER IF NOT EXISTS trg_categories_update
        AFTER UPDATE ON categories
        WHEN NEW.updated_at = OLD.updated_at
        BEGIN
          UPDATE categories SET
            updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
          WHERE id = NEW.id;
        END;

        CREATE TRIGGER IF NOT EXISTS trg_transactions_update
        AFTER UPDATE ON transactions
        WHEN NEW.updated_at = OLD.updated_at
        BEGIN
          UPDATE transactions SET
            updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
          WHERE id = NEW.id;
        END;

        CREATE TRIGGER IF NOT EXISTS trg_budgets_insert
        AFTER INSERT ON budgets
        BEGIN
          UPDATE budgets SET
            created_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
            updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
          WHERE id = NEW.id;
        END;

        CREATE TRIGGER IF NOT EXISTS trg_budgets_update
        AFTER UPDATE ON budgets
        WHEN NEW.updated_at = OLD.updated_at
        BEGIN
          UPDATE budgets SET
            updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
          WHERE id = NEW.id;
        END;
      `,
    },

    {
      /**
       * M5/M6 — Sync-Metadaten.
       *
       * Speichert Pull/Push-Cursor der
       * Cloud-Synchronisierung lokal,
       * damit inkrementelle Läufe möglich sind.
       */
      version: 7,

      sql: `
        CREATE TABLE IF NOT EXISTS sync_metadata (
          key TEXT PRIMARY KEY NOT NULL,
          value TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
      `,
    },

    {
      /**
       * M2 — Kategorie-Regeln + Zuordnungsquelle.
       *
       * category_rules: nutzerdefinierte Regeln
       *   ("immer Händler X -> Kategorie Y").
       *
       * transactions.category_source: woher kommt
       *   die aktuelle Kategorie?
       *   manual > rule > auto > none.
       *   Auto-/Rule-Pfade dürfen 'manual' nie
       *   überschreiben.
       */
      version: 8,

      sql: `
        CREATE TABLE IF NOT EXISTS category_rules (
          id TEXT PRIMARY KEY NOT NULL,
          name TEXT NOT NULL,
          match_type TEXT NOT NULL,
          match_value TEXT NOT NULL,
          category_id TEXT NOT NULL,
          enabled INTEGER NOT NULL DEFAULT 1,
          priority INTEGER NOT NULL DEFAULT 100,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          deleted_at TEXT
        );

        CREATE INDEX IF NOT EXISTS
          idx_category_rules_enabled_priority
        ON category_rules(enabled, priority);

        ALTER TABLE transactions ADD COLUMN category_source TEXT;

        UPDATE transactions
        SET category_source = CASE
          WHEN category_id IS NULL THEN 'none'
          ELSE 'auto'
        END;

        CREATE TRIGGER IF NOT EXISTS trg_category_rules_insert
        AFTER INSERT ON category_rules
        BEGIN
          UPDATE category_rules SET
            created_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
            updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
          WHERE id = NEW.id;
        END;

        CREATE TRIGGER IF NOT EXISTS trg_category_rules_update
        AFTER UPDATE ON category_rules
        WHEN NEW.updated_at = OLD.updated_at
        BEGIN
          UPDATE category_rules SET
            updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
          WHERE id = NEW.id;
        END;
      `,
    },

    {
      /**
       * M3 — Sparziele mit Beitrags-Historie.
       *
       * savings_goals wird erweitert
       * (Beschreibung, Tracking-Modus,
       *  Startbetrag, Waehrung, Status,
       *  optionales verknuepftes Konto).
       *
       * goal_contributions: jede Einzahlung/
       * Anpassung ist ein eigener, pruefbarer
       * Datensatz. current_amount_minor wird
       * aus starting + Summe aktiver Beitraege
       * abgeleitet (keine Phantom-Money).
       */
      version: 9,

      sql: `
        ALTER TABLE savings_goals ADD COLUMN description TEXT;
        ALTER TABLE savings_goals ADD COLUMN tracking_mode TEXT NOT NULL DEFAULT 'manual';
        ALTER TABLE savings_goals ADD COLUMN linked_account_id TEXT;
        ALTER TABLE savings_goals ADD COLUMN currency TEXT NOT NULL DEFAULT 'EUR';
        ALTER TABLE savings_goals ADD COLUMN status TEXT NOT NULL DEFAULT 'active';
        ALTER TABLE savings_goals ADD COLUMN starting_amount_minor INTEGER NOT NULL DEFAULT 0;

        CREATE TABLE IF NOT EXISTS goal_contributions (
          id TEXT PRIMARY KEY NOT NULL,
          goal_id TEXT NOT NULL,
          amount_minor INTEGER NOT NULL,
          source TEXT NOT NULL DEFAULT 'manual',
          source_transaction_id TEXT,
          note TEXT,
          occurred_at TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          deleted_at TEXT
        );

        CREATE INDEX IF NOT EXISTS
          idx_goal_contributions_goal
        ON goal_contributions(goal_id, deleted_at);

        CREATE TRIGGER IF NOT EXISTS trg_goal_contrib_insert
        AFTER INSERT ON goal_contributions
        BEGIN
          UPDATE goal_contributions SET
            created_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
            updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
          WHERE id = NEW.id;
        END;

        CREATE TRIGGER IF NOT EXISTS trg_goal_contrib_update
        AFTER UPDATE ON goal_contributions
        WHEN NEW.updated_at = OLD.updated_at
        BEGIN
          UPDATE goal_contributions SET
            updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
          WHERE id = NEW.id;
        END;

        CREATE TRIGGER IF NOT EXISTS trg_savings_goals_update
        AFTER UPDATE ON savings_goals
        WHEN NEW.updated_at = OLD.updated_at
        BEGIN
          UPDATE savings_goals SET
            updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
          WHERE id = NEW.id;
        END;
      `,
    },

    {
      /**
       * M3 — Sparziele sync-faehig machen.
       *
       * v6 hatte savings_goals uebersprungen:
       * created_at / updated_at / deleted_at
       * fehlen lokal. Ohne diese Spalten
       * laeuft weder der Tombstone-Delete
       * noch die LWW-Synchronisierung.
       */
      version: 10,

      sql: `
        ALTER TABLE savings_goals ADD COLUMN created_at TEXT;
        ALTER TABLE savings_goals ADD COLUMN updated_at TEXT;
        ALTER TABLE savings_goals ADD COLUMN deleted_at TEXT;

        UPDATE savings_goals SET
          created_at = COALESCE(created_at, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
          updated_at = COALESCE(updated_at, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));

        CREATE TRIGGER IF NOT EXISTS trg_savings_goals_insert
        AFTER INSERT ON savings_goals
        BEGIN
          UPDATE savings_goals SET
            created_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
            updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
          WHERE id = NEW.id;
        END;
      `,
    },

    {
      /**
       * M3 — Automatisches Sparziel-Tracking.
       *
       * rule_keyword: Transaktionen, deren
       * Beschreibung/Empfaenger das Stichwort
       * enthaelt, erzeugen automatisch einen
       * Beitraeg (source 'transaction').
       *
       * Idempotenz: Partial-Unique-Index auf
       * (goal_id, source_transaction_id) -
       * dieselbe Transaktion kann pro Ziel
       * GENAU EINEN aktiven Beitraeg erzeugen,
       * egal wie oft der Sync laeuft.
       */
      version: 11,

      sql: `
        ALTER TABLE savings_goals ADD COLUMN rule_keyword TEXT;

        CREATE UNIQUE INDEX IF NOT EXISTS
          idx_goal_contrib_goal_tx_active
        ON goal_contributions(goal_id, source_transaction_id)
        WHERE source_transaction_id IS NOT NULL
          AND deleted_at IS NULL;
      `,
    },
  ];

async function configureDatabase(
  db: SQLite.SQLiteDatabase
): Promise<void> {
  const encryptionKey =
    await getDatabaseEncryptionKey();

  await db.execAsync(`
    PRAGMA key = '${encryptionKey}';
  `);

  await db.execAsync(`
    PRAGMA foreign_keys = ON;
    PRAGMA journal_mode = WAL;
  `);
}

async function ensureMigrationTable(
  db: SQLite.SQLiteDatabase
): Promise<void> {
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS
      schema_migrations (
        version INTEGER
          PRIMARY KEY
          NOT NULL,

        applied_at TEXT
          NOT NULL
      );
  `);
}

async function getCurrentSchemaVersion(
  db: SQLite.SQLiteDatabase
): Promise<number> {
  const row =
    await db.getFirstAsync<{
      version: number | null;
    }>(`
      SELECT
        MAX(version) AS version
      FROM schema_migrations;
    `);

  return row?.version ?? 0;
}

async function applyMigration(
  db: SQLite.SQLiteDatabase,
  migration: Migration
): Promise<void> {
  await db.withTransactionAsync(
    async () => {
      await db.execAsync(
        migration.sql
      );

      await db.runAsync(
        `
          INSERT INTO
            schema_migrations (
              version,
              applied_at
            )
          VALUES (?, ?);
        `,
        migration.version,
        new Date().toISOString()
      );
    }
  );

  console.log(
    `Database migration ${migration.version} applied`
  );
}

async function applyMigrations(
  db: SQLite.SQLiteDatabase
): Promise<void> {
  await ensureMigrationTable(db);

  const currentVersion =
    await getCurrentSchemaVersion(db);

  const pendingMigrations =
    migrations.filter(
      (migration) =>
        migration.version >
        currentVersion
    );

  for (
    const migration
    of pendingMigrations
  ) {
    await applyMigration(
      db,
      migration
    );
  }
}

export async function getDatabase():
Promise<SQLite.SQLiteDatabase> {
  if (database) {
    return database;
  }

  const db =
    await SQLite.openDatabaseAsync(
      'finance.db'
    );

  try {
    await configureDatabase(db);

    database = db;

    return db;
  } catch (error) {
    await db.closeAsync();

    throw error;
  }
}

export async function initializeDatabase():
Promise<void> {
  if (__DEV__) {
    runMoneySelfTest();
  }

  const db =
    await getDatabase();

  await applyMigrations(db);
}