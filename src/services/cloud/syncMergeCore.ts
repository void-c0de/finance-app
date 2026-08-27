/**
 * Reine, testbare Merge-Semantik der Cloud-Sync-Engine.
 *
 * Diese Regeln sind der Vertrag zwischen lokalem SQLCipher (Source of Truth)
 * und der Cloud (Hintergrund-Ziel):
 *
 * - Last-Writer-Wins auf Basis der serverseitigen `updated_at`.
 * - Gleichstand gewinnt die eingehende Zeile (Re-Pull bleibt idempotent).
 * - Löschungen sind Tombstones (`deleted_at`) und müssen immer propagieren,
 *   auch wenn `updated_at` bereits hinter dem Cursor liegt.
 * - Cursor bewegen sich ausschließlich vorwärts auf den neuesten Zeitstempel.
 */

export const SYNC_EPOCH_CURSOR = '1970-01-01T00:00:00.000Z';

/**
 * Vereinheitlicht Zeitstempel auf das Z-Suffix, damit die lexikographischen
 * SQLite-Vergleiche konsistent bleiben (PostgreSQL liefert `+00:00`).
 */
export function normalizeSyncTimestamp(value: unknown): string | null {
  if (typeof value !== 'string' || value.length === 0) {
    return null;
  }
  if (value.endsWith('+00:00')) {
    return `${value.slice(0, -6)}Z`;
  }
  return value;
}

/**
 * LWW-Entscheidung für eine eingehende Remote-Zeile: anwenden, außer sie ist
 * echt älter als der lokale Stand.
 */
export function shouldApplyIncomingRow(
  localUpdatedAt: unknown,
  incomingUpdatedAt: unknown,
): boolean {
  const local = normalizeSyncTimestamp(localUpdatedAt) ?? SYNC_EPOCH_CURSOR;
  const incoming = normalizeSyncTimestamp(incomingUpdatedAt) ?? SYNC_EPOCH_CURSOR;
  return incoming >= local;
}

/**
 * Push-Auswahl: eine Zeile muss hochgeladen werden, wenn sie einen Tombstone
 * trägt (Löschungen immer) oder nach dem Push-Cursor geändert wurde.
 *
 * Spiegelt bewusst das SQL-Prädikat
 * `WHERE (deleted_at IS NOT NULL OR updated_at > cursor)`.
 */
export function isRowPendingPush(
  row: { updated_at?: unknown; deleted_at?: unknown },
  cursor: string,
): boolean {
  if (row.deleted_at != null && row.deleted_at !== '') {
    return true;
  }
  const updated = normalizeSyncTimestamp(row.updated_at) ?? SYNC_EPOCH_CURSOR;
  return updated > cursor;
}

/** Bewegt einen Cursor auf den neuesten gesehenen normalisierten Zeitstempel. */
export function advanceCursor(currentCursor: string, seen: unknown): string {
  const stamp = normalizeSyncTimestamp(seen);
  return stamp && stamp > currentCursor ? stamp : currentCursor;
}
