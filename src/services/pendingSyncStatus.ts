import { getDatabase } from '@/db/database';
import { SYNC_EPOCH_CURSOR } from '@/services/cloud/syncMergeCore';

/**
 * Zählt lokale Änderungen, die noch nicht in die Cloud gepusht wurden.
 *
 * Spiegelt exakt das Push-Prädikat der Sync-Engine:
 *   `deleted_at IS NOT NULL OR updated_at > push_cursor`
 * Damit ist die Zahl verlässlich – kein geschätzter Wert. Wird vor einem
 * lokalen Reset angezeigt, damit ungesyncte Mutationen nicht still verloren gehen.
 */

const SYNC_TABLES: readonly { local: string; remote: string }[] = [
  { local: 'categories', remote: 'finance_categories' },
  { local: 'bank_connections', remote: 'finance_bank_connections' },
  { local: 'category_rules', remote: 'finance_category_rules' },
  { local: 'accounts', remote: 'finance_accounts' },
  { local: 'budgets', remote: 'finance_budgets' },
  { local: 'savings_goals', remote: 'finance_savings_goals' },
  { local: 'goal_contributions', remote: 'finance_goal_contributions' },
  { local: 'recurring_series', remote: 'finance_recurring_series' },
  { local: 'transactions', remote: 'finance_transactions' },
];

export type PendingSyncStatus = {
  /** true, wenn überhaupt eine Cloud-Synchronisierung eingerichtet ist. */
  syncConfigured: boolean;
  total: number;
  byTable: Record<string, number>;
};

export async function countUnsyncedChanges(): Promise<PendingSyncStatus> {
  const db = await getDatabase();

  const lastOwner = await db.getFirstAsync<{ value: string }>(
    `SELECT value FROM sync_metadata WHERE key = 'last_owner'`,
  );
  const syncConfigured = Boolean(lastOwner?.value);

  const byTable: Record<string, number> = {};
  let total = 0;

  for (const table of SYNC_TABLES) {
    const cursorRow = await db.getFirstAsync<{ value: string }>(
      `SELECT value FROM sync_metadata WHERE key = ?`,
      `push_cursor_${table.remote}`,
    );
    const cursor = cursorRow?.value ?? SYNC_EPOCH_CURSOR;

    const countRow = await db.getFirstAsync<{ n: number }>(
      `SELECT COUNT(*) AS n FROM ${table.local}
       WHERE deleted_at IS NOT NULL OR updated_at > ?`,
      cursor,
    );
    const n = countRow?.n ?? 0;
    if (n > 0) byTable[table.local] = n;
    total += n;
  }

  return { syncConfigured, total, byTable };
}
