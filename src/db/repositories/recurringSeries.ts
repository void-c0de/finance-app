import { getDatabase } from '@/db/database';

import type { RecurringCadence, RecurringKind, RecurringOverride } from '@/services/recurringInsightsCore';

/**
 * Persistierte Nutzerkorrektur zu einer wiederkehrenden Serie.
 *
 * Beschreibt NICHT die Transaktionswahrheit, sondern die Entscheidung des
 * Nutzers: bestätigte/geänderte Art oder „ist keine wiederkehrende Zahlung"
 * (`muted`). Die Primär-ID `seriesKey` ist deterministisch aus
 * `recurringSeriesKey(...)` – so bleibt der Sync-Konflikt eindeutig.
 */
export type RecurringSeries = {
  seriesKey: string;
  merchantName?: string;
  kind: RecurringKind;
  muted: boolean;
  userConfirmed: boolean;
  expectedAmountMinor?: number;
  currency?: string;
  cadence?: RecurringCadence;
  note?: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
};

type RecurringSeriesRow = {
  id: string;
  merchant_name: string | null;
  kind: string;
  muted: number;
  user_confirmed: number;
  expected_amount_minor: number | null;
  currency: string | null;
  cadence: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

function mapRow(row: RecurringSeriesRow): RecurringSeries {
  return {
    seriesKey: row.id,
    merchantName: row.merchant_name ?? undefined,
    kind: row.kind as RecurringKind,
    muted: row.muted === 1,
    userConfirmed: row.user_confirmed === 1,
    expectedAmountMinor: row.expected_amount_minor ?? undefined,
    currency: row.currency ?? undefined,
    cadence: (row.cadence as RecurringCadence | null) ?? undefined,
    note: row.note ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at ?? undefined,
  };
}

export async function listRecurringSeries(): Promise<RecurringSeries[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<RecurringSeriesRow>(
    `SELECT id, merchant_name, kind, muted, user_confirmed, expected_amount_minor,
            currency, cadence, note, created_at, updated_at, deleted_at
     FROM recurring_series
     WHERE deleted_at IS NULL
     ORDER BY updated_at DESC`,
  );
  return rows.map(mapRow);
}

/** Overrides-Map für `buildRecurringInsights`, per `recurringSeriesKey`. */
export async function loadRecurringOverrides(): Promise<Map<string, RecurringOverride>> {
  const series = await listRecurringSeries();
  const map = new Map<string, RecurringOverride>();
  for (const entry of series) {
    map.set(entry.seriesKey, {
      kind: entry.userConfirmed ? entry.kind : undefined,
      muted: entry.muted,
      confirmed: entry.userConfirmed && !entry.muted,
      expectedAmountMinor: entry.expectedAmountMinor ?? null,
    });
  }
  return map;
}

export type UpsertRecurringSeriesInput = {
  seriesKey: string;
  merchantName?: string | null;
  kind: RecurringKind;
  muted?: boolean;
  userConfirmed?: boolean;
  expectedAmountMinor?: number | null;
  currency?: string | null;
  cadence?: RecurringCadence | null;
};

export async function upsertRecurringSeries(
  input: UpsertRecurringSeriesInput,
): Promise<RecurringSeries> {
  const db = await getDatabase();
  const now = new Date().toISOString();

  await db.runAsync(
    `INSERT INTO recurring_series (
       id, merchant_name, kind, muted, user_confirmed,
       expected_amount_minor, currency, cadence, created_at, updated_at, deleted_at
     )
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
     ON CONFLICT(id) DO UPDATE SET
       merchant_name = excluded.merchant_name,
       kind = excluded.kind,
       muted = excluded.muted,
       user_confirmed = excluded.user_confirmed,
       expected_amount_minor = excluded.expected_amount_minor,
       currency = excluded.currency,
       cadence = excluded.cadence,
       deleted_at = NULL`,
    input.seriesKey,
    input.merchantName ?? null,
    input.kind,
    input.muted ? 1 : 0,
    (input.userConfirmed ?? true) ? 1 : 0,
    input.expectedAmountMinor ?? null,
    input.currency ?? null,
    input.cadence ?? null,
    now,
    now,
  );

  const row = await db.getFirstAsync<RecurringSeriesRow>(
    `SELECT id, merchant_name, kind, muted, user_confirmed, expected_amount_minor,
            currency, cadence, note, created_at, updated_at, deleted_at
     FROM recurring_series WHERE id = ?`,
    input.seriesKey,
  );
  if (!row) {
    throw new Error(`Serie ${input.seriesKey} konnte nach dem Speichern nicht gelesen werden.`);
  }
  return mapRow(row);
}

/** Tombstone – Nutzerkorrektur zurücknehmen, die Heuristik greift danach wieder. */
export async function deleteRecurringSeries(seriesKey: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `UPDATE recurring_series
     SET deleted_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
     WHERE id = ? AND deleted_at IS NULL`,
    seriesKey,
  );
}

/** Series-Keys, die der Nutzer als „nicht wiederkehrend" markiert hat. */
export async function listMutedSeriesKeys(): Promise<Set<string>> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{ id: string }>(
    `SELECT id FROM recurring_series WHERE deleted_at IS NULL AND muted = 1`,
  );
  return new Set(rows.map((row) => row.id));
}
