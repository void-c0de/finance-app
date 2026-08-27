/**
 * Reine Regeln des Lösch-Lebenszyklus (ohne Netzwerk / DB).
 *
 * Testbar unter `node --experimental-strip-types`. Die serverseitige RPC in
 * `supabase/migrations/20260827160000_add_data_lifecycle.sql` ist die
 * Autorität; diese Datei hält die geteilten Konstanten und die Client-Logik,
 * ob ein Antrag „fällig" ist und was als Nächstes zu tun ist.
 */

export const DELETION_GRACE_DAYS = 3;

/**
 * FK-sichere Löschreihenfolge der Cloud-Finanzdaten (Kinder zuerst).
 * Muss mit `purge_owner_finance_data` in der Migration übereinstimmen.
 */
export const FINANCE_PURGE_ORDER: readonly string[] = [
  'finance_goal_contributions',
  'finance_transactions',
  'finance_recurring_series',
  'finance_budgets',
  'finance_savings_goals',
  'finance_category_rules',
  'finance_accounts',
  'finance_bank_connections',
  'finance_categories',
  'app_debug_logs',
];

export type DeletionRequestState = {
  status: 'none' | 'pending' | 'cancelled' | 'completed';
  kind?: 'finance_data' | 'account';
  graceUntil?: string;
};

export function graceUntilFrom(requestedAt: Date): string {
  return new Date(requestedAt.getTime() + DELETION_GRACE_DAYS * 86_400_000).toISOString();
}

export function isDeletionDue(state: DeletionRequestState, now: Date = new Date()): boolean {
  return (
    state.status === 'pending' &&
    typeof state.graceUntil === 'string' &&
    Date.parse(state.graceUntil) <= now.getTime()
  );
}

/** Verbleibende Kulanzzeit in ganzen Stunden (für die UI). */
export function graceHoursRemaining(state: DeletionRequestState, now: Date = new Date()): number {
  if (state.status !== 'pending' || !state.graceUntil) return 0;
  const ms = Date.parse(state.graceUntil) - now.getTime();
  return ms <= 0 ? 0 : Math.ceil(ms / 3_600_000);
}

export type AdminDeletionRow = {
  status: 'pending' | 'cancelled' | 'completed';
  grace_until: string;
};

/** Teilt Löschanträge in fällig / im Kulanzfenster / abgeschlossen. */
export function groupDeletionRequests<T extends AdminDeletionRow>(
  rows: readonly T[],
  now: Date = new Date(),
): { due: T[]; pending: T[]; closed: T[] } {
  const nowMs = now.getTime();
  return {
    due: rows.filter((r) => r.status === 'pending' && Date.parse(r.grace_until) <= nowMs),
    pending: rows.filter((r) => r.status === 'pending' && Date.parse(r.grace_until) > nowMs),
    closed: rows.filter((r) => r.status !== 'pending'),
  };
}

export type NextDeletionStep =
  | 'idle'
  | 'awaiting_grace'
  | 'ready_finance_purge'
  | 'ready_account_edge_function';

export function nextDeletionStep(state: DeletionRequestState, now: Date = new Date()): NextDeletionStep {
  if (state.status !== 'pending') return 'idle';
  if (!isDeletionDue(state, now)) return 'awaiting_grace';
  return state.kind === 'account' ? 'ready_account_edge_function' : 'ready_finance_purge';
}
