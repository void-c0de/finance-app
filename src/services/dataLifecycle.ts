import { getSupabaseClient } from '@/services/cloud/cloudClient';
import { debugLog } from '@/core/debugLog';

/**
 * Client-Wrapper für die serverautoritativen Lösch-Operationen.
 *
 * Der Client löscht NIEMALS direkt in `finance_*`. Er stellt nur Anträge und
 * ruft die geprüften RPCs auf. Jede Operation betrifft ausschließlich den
 * angemeldeten Nutzer (`auth.uid()` serverseitig – kein Ziel-Argument).
 *
 * Ablauf:
 *   1. `request*Deletion` → Antrag mit 3-Tage-Kulanzfenster (stornierbar).
 *   2. Nach Ablauf: `runDueDeletionFinalization` (wird beim Sync mitgerufen)
 *      oder – bei Konto-Löschung – die Edge Function `finalize-account-deletion`.
 */

export type DeletionKind = 'finance_data' | 'account';

export type DeletionStatus =
  | { status: 'none' }
  | {
      status: 'pending' | 'cancelled' | 'completed';
      kind: DeletionKind;
      requestedAt: string;
      graceUntil: string;
      finalizedAt: string | null;
      due: boolean;
    };

export type LifecycleResult<T> = { ok: true; value: T } | { ok: false; message: string };

function noClient(): LifecycleResult<never> {
  return { ok: false, message: 'Für Löschvorgänge muss ein Cloud-Konto verbunden sein.' };
}

export async function getDeletionStatus(): Promise<DeletionStatus> {
  const client = getSupabaseClient();
  if (!client) return { status: 'none' };
  try {
    const { data, error } = await client.rpc('get_my_deletion_status');
    if (error || !data || data.status === 'none') return { status: 'none' };
    return data as DeletionStatus;
  } catch {
    return { status: 'none' };
  }
}

export async function requestDataDeletion(kind: DeletionKind): Promise<LifecycleResult<DeletionStatus>> {
  const client = getSupabaseClient();
  if (!client) return noClient();
  try {
    const { data, error } = await client.rpc('request_data_deletion', { p_kind: kind });
    if (error) return { ok: false, message: 'Der Antrag konnte gerade nicht gestellt werden.' };
    return { ok: true, value: { status: 'pending', due: false, finalizedAt: null, ...(data as object) } as DeletionStatus };
  } catch {
    return { ok: false, message: 'Der Antrag konnte gerade nicht gestellt werden.' };
  }
}

export async function cancelDataDeletion(): Promise<LifecycleResult<true>> {
  const client = getSupabaseClient();
  if (!client) return noClient();
  try {
    const { error } = await client.rpc('cancel_data_deletion');
    if (error) return { ok: false, message: 'Der Antrag konnte nicht storniert werden.' };
    return { ok: true, value: true };
  } catch {
    return { ok: false, message: 'Der Antrag konnte nicht storniert werden.' };
  }
}

export type FinalizationOutcome = {
  finalized: boolean;
  kind?: DeletionKind;
  rowsDeleted?: number;
  authUserDeletionPending?: boolean;
  reason?: string;
};

/**
 * Faule Finalisierung: wird opportunistisch beim Sync-Start aufgerufen. Löscht
 * nur, wenn ein eigener Antrag fällig ist (Kulanzfenster abgelaufen). Kein
 * Scheduler nötig.
 */
export async function runDueDeletionFinalization(): Promise<FinalizationOutcome> {
  const client = getSupabaseClient();
  if (!client) return { finalized: false, reason: 'no_client' };
  try {
    const { data, error } = await client.rpc('finalize_my_due_deletion');
    if (error) {
      debugLog.warn('LIFECYCLE', 'Finalisierung fehlgeschlagen', error.message);
      return { finalized: false, reason: 'error' };
    }
    const outcome = data as FinalizationOutcome;
    if (outcome.finalized) {
      debugLog.info('LIFECYCLE', `Cloud-Finanzdaten gelöscht · ${outcome.rowsDeleted ?? 0} Zeilen`);
    }
    return outcome;
  } catch {
    return { finalized: false, reason: 'error' };
  }
}

/**
 * Ruft die Edge Function für die Konto-Löschung auf (löscht Finanzdaten + den
 * Auth-Nutzer selbst). Erst nach Ablauf des Kulanzfensters wirksam.
 */
export async function finalizeAccountDeletion(): Promise<LifecycleResult<FinalizationOutcome>> {
  const client = getSupabaseClient();
  if (!client) return noClient();
  try {
    const { data, error } = await client.functions.invoke('finalize-account-deletion', { method: 'POST' });
    if (error) return { ok: false, message: 'Die Konto-Löschung konnte nicht abgeschlossen werden.' };
    return { ok: true, value: data as FinalizationOutcome };
  } catch {
    return { ok: false, message: 'Die Konto-Löschung konnte nicht abgeschlossen werden.' };
  }
}
