import Constants from 'expo-constants';

import { getDatabase } from '@/db/database';
import { withDbLock } from '@/core/dbWriteLock';
import { debugLog } from '@/core/debugLog';
import { inspectBackup } from '@/services/backupImportCore';
import { applyRestore } from '@/services/backupRestoreService';
import { buildDemoDataset, DEMO_LIKE } from '@/services/demoDataCore';

/**
 * Demo-Daten laden / entfernen.
 *
 * Ausschließlich ein Entwickler-/Superuser-Werkzeug für Screenshots und QA.
 * Alle Zeilen tragen das ID-Präfix `demo-`; `clearDemoData()` fasst niemals
 * echte Daten an. Ist ein Cloud-Konto verbunden, werden die Demo-Zeilen
 * mitsynchronisiert – der Aufrufer weist darauf hin.
 */

const DEMO_TABLES = [
  'goal_contributions',
  'transactions',
  'recurring_series',
  'category_rules',
  'budgets',
  'savings_goals',
  'accounts',
  'bank_connections',
] as const;

export type DemoSeedResult = { ok: true; written: number } | { ok: false; reason: string };

export async function seedDemoData(now: Date = new Date()): Promise<DemoSeedResult> {
  const dataset = buildDemoDataset(now);
  const raw = JSON.stringify({
    format: 'finance-app-backup',
    version: 2,
    createdAt: now.toISOString(),
    appVersion: Constants.expoConfig?.version ?? null,
    data: dataset,
  });

  const inspection = inspectBackup(raw);
  if (!inspection.ok) {
    debugLog.error('DEMO', 'Demo-Datensatz ungültig', inspection.issues.slice(0, 3));
    return { ok: false, reason: 'invalid_dataset' };
  }

  const result = await applyRestore(inspection.backup);
  if (!result.ok) {
    return { ok: false, reason: 'write_failed' };
  }
  debugLog.info('DEMO', `Demo-Daten geladen · ${result.written} Einträge`);
  return { ok: true, written: result.written };
}

export async function clearDemoData(): Promise<{ ok: boolean; removed: number }> {
  return withDbLock(async () => {
    const db = await getDatabase();
    let removed = 0;
    try {
      await db.withExclusiveTransactionAsync(async (txn) => {
        await txn.runAsync('PRAGMA defer_foreign_keys = ON');
        for (const table of DEMO_TABLES) {
          // Tombstone statt Hard-Delete: falls die Zeilen bereits in der Cloud
          // liegen, propagiert die Löschung beim nächsten Sync.
          const res = await txn.runAsync(
            `UPDATE ${table}
             SET deleted_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
             WHERE id LIKE ? AND deleted_at IS NULL`,
            DEMO_LIKE,
          );
          removed += res.changes ?? 0;
        }
      });
      debugLog.info('DEMO', `Demo-Daten entfernt · ${removed} Zeilen`);
      return { ok: true, removed };
    } catch (error) {
      debugLog.error('DEMO', 'Demo-Daten konnten nicht entfernt werden', error);
      return { ok: false, removed };
    }
  });
}

export async function countDemoRows(): Promise<number> {
  const db = await getDatabase();
  let total = 0;
  for (const table of DEMO_TABLES) {
    const row = await db.getFirstAsync<{ n: number }>(
      `SELECT COUNT(*) AS n FROM ${table} WHERE id LIKE ? AND deleted_at IS NULL`,
      DEMO_LIKE,
    );
    total += row?.n ?? 0;
  }
  return total;
}
