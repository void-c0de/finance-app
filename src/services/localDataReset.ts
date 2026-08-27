import { getDatabase } from '@/db/database';
import { withDbLock } from '@/core/dbWriteLock';
import { debugLog } from '@/core/debugLog';

/**
 * Lokaler Geräte-Reset.
 *
 * Löscht ausschließlich die lokale SQLCipher-Datenbank (alle Finanzzeilen +
 * Sync-Cursor). Betrifft NICHT:
 *  - das Cloud-Konto (Anmeldung bleibt bestehen),
 *  - die Cloud-Finanzdaten (die beim nächsten Login neu heruntergeladen werden),
 *  - App-Sperre / Biometrie / SecureStore.
 *
 * Ist eine Cloud-Synchronisierung eingerichtet, wird die Datenbank danach beim
 * nächsten Sync vollständig aus der Cloud rekonstruiert. Ungesyncte lokale
 * Änderungen gehen dabei verloren – der Aufrufer MUSS vorher
 * `countUnsyncedChanges()` prüfen und warnen.
 */

const DATA_TABLES = [
  'goal_contributions',
  'transactions',
  'recurring_series',
  'budgets',
  'savings_goals',
  'category_rules',
  'accounts',
  'bank_connections',
  'categories',
  'sync_metadata',
] as const;

/**
 * Interner Reset OHNE `withDbLock`. Nur aufrufen, wenn der Aufrufer den
 * DB-Schreib-Lock bereits hält (z. B. innerhalb der Sync-Engine).
 */
export async function wipeLocalFinanceDataLocked(): Promise<{ ok: boolean }> {
  const db = await getDatabase();
  try {
    await db.withExclusiveTransactionAsync(async (txn) => {
      await txn.runAsync('PRAGMA defer_foreign_keys = ON');
      for (const table of DATA_TABLES) {
        await txn.runAsync(`DELETE FROM ${table}`);
      }
    });
    debugLog.info('RESET', 'Lokale Finanzdaten zurückgesetzt');
    return { ok: true };
  } catch (error) {
    debugLog.error('RESET', 'Lokaler Reset fehlgeschlagen', error);
    return { ok: false };
  }
}

export async function wipeLocalFinanceData(): Promise<{ ok: boolean }> {
  return withDbLock(() => wipeLocalFinanceDataLocked());
}
