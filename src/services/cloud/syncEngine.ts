import {
    getDatabase,
} from '@/db/database';

import {
    buildDebugUploadPayload,
    debugLog,
} from '@/core/debugLog';

import {
    withDbLock,
} from '@/core/dbWriteLock';

import {
    minorUnitsToMajorNumber,
} from '@/core/money';

import {
    normalizeSyncTimestamp,
    shouldApplyIncomingRow,
    SYNC_EPOCH_CURSOR,
} from '@/services/cloud/syncMergeCore';

import {
    ensureCloudSession,
    getSupabaseClient,
} from '@/services/cloud/cloudClient';

import {
    runDueDeletionFinalization,
} from '@/services/dataLifecycle';

import {
    wipeLocalFinanceDataLocked,
} from '@/services/localDataReset';

/**
 * M6 — Cloud-Sync-Engine.
 *
 * Prinzipien:
 *
 * - Local-first: SQLCipher bleibt die
 *   Source of Truth. Cloud ist ein
 *   Hintergrund-Ziel.
 * - Inkrementell über updated_at-Cursor
 *   (lokal in sync_metadata).
 * - Konflikte: Last-Writer-Wins auf Basis
 *   der serverseitigen updated_at.
 * - Löschungen propagieren als Tombstones
 *   (deleted_at), nie als harte Deletes.
 * - Best-Effort: Sync blockiert niemals
 *   Boot oder UI.
 */

/**
 * Strukturierte Fehler-Codes der Cloud-Sync-Engine.
 *
 * Format: CLD-<BEREICH>-<NR>
 * Diese Codes erscheinen 1:1 in den Debug-Logs,
 * im Store und in der UI.
 */
export const CLOUD_ERROR_CODES = {
  NOT_CONFIGURED:
    'CLD-CFG-001',

  SESSION_FAILED:
    'CLD-AUTH-001',

  PUSH_TABLE_FAILED:
    'CLD-PUSH-001',

  PULL_QUERY_FAILED:
    'CLD-PULL-001',

  PULL_ROW_PRECHECK_FAILED:
    'CLD-PULL-002',

  PULL_ROW_WRITE_FAILED:
    'CLD-PULL-003',

  PULL_CURSOR_FAILED:
    'CLD-PULL-004',

  METADATA_FAILED:
    'CLD-META-001',

  UNKNOWN:
    'CLD-UNK-001',
} as const;

export type CloudErrorCode =
  (typeof CLOUD_ERROR_CODES)[keyof typeof CLOUD_ERROR_CODES];

type SyncStatus =
  | 'idle'
  | 'unconfigured'
  | 'signing_in'
  | 'syncing'
  | 'synced'
  | 'error';

type TableRow = Record<
  string,
  string
  | number
  | null
>;

type RemoteRow = Record<
  string,
  unknown
>;

type TableMapping = {
  localTable:
    string;

  remoteTable:
    string;

  booleanColumns:
    readonly string[];

  /**
   * Explizite Spalten-Whitelist.
   *
   * Lokale Tabellen enthalten historische
   * Spalten (z. B. `balance`, `amount`
   * aus frühen Migrationen), die es remote
   * nicht gibt - und Server-Zeitstempel
   * bewusst NICHT: updated_at gehört
   * der Cloud (LWW-Referenz).
   */
  pushColumns:
    readonly string[];

  /**
   * Spalten, die aus der Cloud in die
   * lokale Tabelle geschrieben werden.
   *
   = Remote-only Spalten (z. B. owner_id)
   * dürfen nie lokal landen. Die Server-
   * Zeitstempel created_at/updated_at sind
   * bewusst inklusive - sie tragen LWW.
   */
  pullColumns:
    readonly string[];

  /**
   * Lokale Pflichtspalten ohne Default
   * (Legacy `amount` REAL NOT NULL), die
   * nicht Teil der Cloud-Spalten sind.
   *
   * Wird aus den Remote-Werten abgeleitet,
   * damit Pull-INSERTs nicht an lokalen
   * Legacy-Constraints scheitern.
   */
  deriveLocal?:
    (remoteRow: RemoteRow) => Record<
      string,
      string | number | null
    >;
};

const EPOCH_CURSOR = SYNC_EPOCH_CURSOR;

/*
 * Reihenfolge wichtig:
 * Elterntabellen zuerst pushen/pullen,
 * damit referenzielle Logik im Client
 * stabil bleibt (Remote hat bewusst keine
 * FK-Constraints zwischen Finance-Tabellen).
 */
const TABLE_MAPPINGS: readonly TableMapping[] =
  [
    {
      localTable:
        'categories',

      remoteTable:
        'finance_categories',

      booleanColumns: [
        'is_income_category',
      ],

      pushColumns: [
        'id',
        'name',
        'icon',
        'is_income_category',
        'deleted_at',
      ],

      pullColumns: [
        'id',
        'name',
        'icon',
        'is_income_category',
        'deleted_at',
        'created_at',
        'updated_at',
      ],
    },

    {
      localTable:
        'bank_connections',

      remoteTable:
        'finance_bank_connections',

      booleanColumns: [
        'is_demo',
      ],

      pushColumns: [
        'id',
        'provider_id',
        'external_connection_id',
        'institution_id',
        'institution_name',
        'status',
        'is_demo',
        'last_synced_at',
        'deleted_at',
      ],

      pullColumns: [
        'id',
        'provider_id',
        'external_connection_id',
        'institution_id',
        'institution_name',
        'status',
        'is_demo',
        'last_synced_at',
        'deleted_at',
        'created_at',
        'updated_at',
      ],
    },

    {
      localTable:
        'category_rules',

      remoteTable:
        'finance_category_rules',

      booleanColumns: [
        'enabled',
      ],

      pushColumns: [
        'id',
        'name',
        'match_type',
        'match_value',
        'category_id',
        'enabled',
        'priority',
        'deleted_at',
      ],

      pullColumns: [
        'id',
        'name',
        'match_type',
        'match_value',
        'category_id',
        'enabled',
        'priority',
        'deleted_at',
        'created_at',
        'updated_at',
      ],
    },

    {
      localTable:
        'accounts',

      remoteTable:
        'finance_accounts',

      booleanColumns: [],

      pushColumns: [
        'id',
        'bank_connection_id',
        'provider_id',
        'external_account_id',
        'name',
        'iban',
        'currency',
        'balance_minor',
        'type',
        'institution_name',
        'last_synced_at',
        'deleted_at',
      ],

      pullColumns: [
        'id',
        'bank_connection_id',
        'provider_id',
        'external_account_id',
        'name',
        'iban',
        'currency',
        'balance_minor',
        'type',
        'institution_name',
        'last_synced_at',
        'deleted_at',
        'created_at',
        'updated_at',
      ],
    },

    {
      localTable:
        'budgets',

      remoteTable:
        'finance_budgets',

      booleanColumns: [],

      pushColumns: [
        'id',
        'category_id',
        'name',
        'amount_minor',
        'period',
        'deleted_at',
      ],

      pullColumns: [
        'id',
        'category_id',
        'name',
        'amount_minor',
        'period',
        'deleted_at',
        'created_at',
        'updated_at',
      ],

      deriveLocal: (remoteRow) => ({
        amount: minorUnitsToMajorNumber(
          typeof remoteRow.amount_minor === 'number'
            ? remoteRow.amount_minor
            : 0,
          typeof remoteRow.currency === 'string' ? remoteRow.currency : 'EUR',
        ),
      }),
    },

    {
      localTable:
        'savings_goals',

      remoteTable:
        'finance_savings_goals',

      booleanColumns: [],

      pushColumns: [
        'id',
        'name',
        'description',
        'target_amount_minor',
        'current_amount_minor',
        'starting_amount_minor',
        'currency',
        'target_date',
        'linked_account_id',
        'rule_keyword',
        'tracking_mode',
        'status',
        'deleted_at',
      ],

      pullColumns: [
        'id',
        'name',
        'description',
        'target_amount_minor',
        'current_amount_minor',
        'starting_amount_minor',
        'currency',
        'target_date',
        'linked_account_id',
        'rule_keyword',
        'tracking_mode',
        'status',
        'deleted_at',
        'created_at',
        'updated_at',
      ],

      deriveLocal: (remoteRow) => ({
        target_amount: minorUnitsToMajorNumber(
          typeof remoteRow.target_amount_minor === 'number'
            ? remoteRow.target_amount_minor
            : 0,
          typeof remoteRow.currency === 'string' ? remoteRow.currency : 'EUR',
        ),

        current_amount: minorUnitsToMajorNumber(
          typeof remoteRow.current_amount_minor === 'number'
            ? remoteRow.current_amount_minor
            : 0,
          typeof remoteRow.currency === 'string' ? remoteRow.currency : 'EUR',
        ),
      }),
    },

    {
      localTable:
        'goal_contributions',

      remoteTable:
        'finance_goal_contributions',

      booleanColumns: [],

      pushColumns: [
        'id',
        'goal_id',
        'amount_minor',
        'source',
        'source_transaction_id',
        'note',
        'occurred_at',
        'deleted_at',
      ],

      pullColumns: [
        'id',
        'goal_id',
        'amount_minor',
        'source',
        'source_transaction_id',
        'note',
        'occurred_at',
        'deleted_at',
        'created_at',
        'updated_at',
      ],
    },

    {
      localTable:
        'recurring_series',

      remoteTable:
        'finance_recurring_series',

      booleanColumns: [
        'muted',
        'user_confirmed',
      ],

      pushColumns: [
        'id',
        'merchant_name',
        'kind',
        'muted',
        'user_confirmed',
        'expected_amount_minor',
        'currency',
        'cadence',
        'note',
        'deleted_at',
      ],

      pullColumns: [
        'id',
        'merchant_name',
        'kind',
        'muted',
        'user_confirmed',
        'expected_amount_minor',
        'currency',
        'cadence',
        'note',
        'deleted_at',
        'created_at',
        'updated_at',
      ],
    },

    {
      localTable:
        'transactions',

      remoteTable:
        'finance_transactions',

      booleanColumns: [
        'is_recurring',
      ],

      pushColumns: [
        'id',
        'account_id',
        'external_transaction_id',
        'amount_minor',
        'currency',
        'direction',
        'booking_date',
        'booking_status',
        'value_date',
        'description',
        'counterparty_name',
        'counterparty_iban',
        'category_id',
        'category_source',
        'is_recurring',
        'deleted_at',
      ],

      pullColumns: [
        'id',
        'account_id',
        'external_transaction_id',
        'amount_minor',
        'currency',
        'direction',
        'booking_date',
        'booking_status',
        'value_date',
        'description',
        'counterparty_name',
        'counterparty_iban',
        'category_id',
        'category_source',
        'is_recurring',
        'deleted_at',
        'created_at',
        'updated_at',
      ],

      deriveLocal: (remoteRow) => {
        const amountMinor =
          typeof remoteRow.amount_minor ===
            'number'
            ? remoteRow.amount_minor
            : 0;

        const currency =
          typeof remoteRow.currency ===
            'string'
            ? remoteRow.currency
            : 'EUR';

        const major =
          Math.abs(
            minorUnitsToMajorNumber(
              amountMinor,
              currency,
            ),
          );

        return {
          amount:
            remoteRow.direction ===
              'income'
              ? major

              : -major,
        };
      },
    },
  ];

const normalizeTimestamp = normalizeSyncTimestamp;

async function getSyncMetadata(
  key: string,
): Promise<string | null> {
  const db =
    await getDatabase();

  const row =
    await db.getFirstAsync<{
      value: string;
    }>(
      `SELECT value FROM sync_metadata WHERE key = ?`,
      key,
    );

  return row?.value ?? null;
}

async function setSyncMetadata(
  key: string,

  value: string,
): Promise<void> {
  const db =
    await getDatabase();

  await db.runAsync(
    `INSERT INTO sync_metadata (key, value, updated_at)
     VALUES (?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
     ON CONFLICT(key) DO UPDATE SET
       value = excluded.value,
       updated_at = excluded.updated_at`,
    key,

    value,
  );
}

function toBooleanOut(
  row: TableRow,

  column: string,
): unknown {
  const value =
    row[column];

  return value === 1;
}

function mapLocalToRemote(
  row: TableRow,

  mapping: TableMapping,
): RemoteRow {
  const remote: RemoteRow =
    {};

  for (const key of mapping.pushColumns) {
    if (
      !(key in row)
    ) {
      continue;
    }

    if (
      mapping.booleanColumns.includes(
        key,
      )
    ) {
      remote[key] =
        toBooleanOut(
          row,
          key,
        );

      continue;
    }

    remote[key] =
      row[key];
  }

  return remote;
}

function mapRemoteToLocal(
  row: RemoteRow,

  mapping: TableMapping,
): TableRow {
  const local: TableRow =
    {};

  for (const key of mapping.pullColumns) {
    if (
      !(key in row)
    ) {
      continue;
    }

    const value =
      row[key];

    if (
      mapping.booleanColumns.includes(
        key,
      )
    ) {
      local[key] =
        value === true
          ? 1

          : 0;

      continue;
    }

    if (
      key ===
        'created_at' ||
      key ===
        'updated_at' ||
      key ===
        'deleted_at'
    ) {
      local[key] =
        normalizeTimestamp(
          value,
        );

      continue;
    }

    if (
      value === null ||
      typeof value ===
        'string' ||
      typeof value ===
        'number'
    ) {
      local[key] =
        value;
    }
  }

  /*
   * Lokale Legacy-Pflichtspalten
   * (z. B. `amount` REAL NOT NULL)
   * aus den Remote-Werten ableiten.
   */
  if (
    mapping.deriveLocal
  ) {
    const derived =
      mapping.deriveLocal(
        row,
      );

    for (const [
      key,
      value,
    ] of Object.entries(
      derived,
    )) {
      if (
        !(key in local)
      ) {
        local[key] =
          value;
      }
    }
  }

  return local;
}

async function applyPullRow(
  mapping: TableMapping,

  row: TableRow,
): Promise<void> {
  const db =
    await getDatabase();

  const columns =
    Object.keys(row);

  if (
    columns.length ===
    0
  ) {
    return;
  }

  let existing:
    | {
        updated_at:
          | string
          | null;
      }
    | null = null;

  try {
    existing =
      await db.getFirstAsync<{
        updated_at:
          | string
          | null;
      }>(
        `SELECT updated_at FROM ${mapping.localTable} WHERE id = ?`,

        row.id as string,
      );
  } catch (error) {
    debugLog.error(
      'CLOUD',
      `${CLOUD_ERROR_CODES.PULL_ROW_PRECHECK_FAILED}: Vorab-Check ${mapping.localTable}/${row.id} fehlgeschlagen`,
      error,
    );

    throw error;
  }

  if (
    existing?.updated_at &&
    !shouldApplyIncomingRow(
      existing.updated_at,
      row.updated_at,
    )
  ) {
    return;
  }

  /*
   * Bewusst KEIN INSERT OR REPLACE:
   * Replace löscht bei Unique-Konflikten
   * unsichtbar Zeilen (inkl. FK-Cascades
   * über ON DELETE CASCADE der Transaktionen)
   * und interagiert schlecht mit den
   * Timestamp-Triggern.
   *
   * Stattdessen: explizites Upsert,
   * Konflikt nur über die Primär-ID.
   */
  const placeholders =
    columns.map(
      () => '?',
    );

  const updateAssignments =
    columns.filter(
      (column) =>
        column !== 'id',
    );

  const updateClause =
    updateAssignments.length >
    0
      ? `DO UPDATE SET ${updateAssignments
          .map(
            (column) =>
              `${column} = excluded.${column}`,
          )
          .join(', ')}`
      : 'DO NOTHING';

  const sql =
    `INSERT INTO ${mapping.localTable} (${columns.join(', ')})
     VALUES (${placeholders.join(', ')})
     ON CONFLICT(id) ${updateClause}`;

  const bindValues =
    columns.map((column) => {
      const value =
        row[column];

      return value === undefined
        ? null
        : value;
    });

  try {
    await db.runAsync(
      sql,
      ...bindValues,
    );
  } catch (error) {
    debugLog.error(
      'CLOUD',
      `${CLOUD_ERROR_CODES.PULL_ROW_WRITE_FAILED}: ${mapping.localTable}/${row.id} · SQL=${sql.replace(/\s+/g, ' ').slice(0, 260)} · Werte=${JSON.stringify(bindValues).slice(0, 400)}`,
      error,
    );

    throw error;
  }
}

async function pullTable(
  mapping: TableMapping,

  userId: string,

  stats: {
    pulled: number;
  },
): Promise<void> {
  const supabase =
    getSupabaseClient();

  if (!supabase) {
    return;
  }

  const cursorKey =
    `pull_cursor_${mapping.remoteTable}`;

  let cursor =
    EPOCH_CURSOR;

  try {
    cursor =
      (await getSyncMetadata(
        cursorKey,
      )) ?? EPOCH_CURSOR;
  } catch (error) {
    debugLog.error(
      'CLOUD',
      `${CLOUD_ERROR_CODES.METADATA_FAILED}: Cursor-Lesefehler ${mapping.localTable}`,
      error,
    );
  }

  debugLog.debug(
    'CLOUD',
    `Pull ${mapping.localTable} ab Cursor ${cursor}`,
  );

  let data:
    RemoteRow[] = [];

  try {
    const { data: rows, error } =
      await supabase
        .from(mapping.remoteTable)
        .select('*')
        .eq('owner_id', userId)
        .gt('updated_at', cursor)
        .order('updated_at', {
          ascending: true,
        })
        .limit(500);

    if (error) {
      throw new Error(
        error.message,
      );
    }

    data =
      (rows ??
        []) as RemoteRow[];
  } catch (error) {
    debugLog.error(
      'CLOUD',
      `${CLOUD_ERROR_CODES.PULL_QUERY_FAILED}: Remote-Abfrage ${mapping.localTable} fehlgeschlagen`,
      error,
    );

    throw error;
  }

  let newestCursor =
    cursor;

  for (const raw of data) {
    const rowId =
      typeof raw.id ===
        'string'
        ? raw.id
        : '<ohne-id>';

    try {
      /*
       * Diagnose: Zeilenschlüssel vor
       * der Abbildung protokollieren,
       * falls eine Spalte fehlt.
       */
      if (
        __DEV__
      ) {
        debugLog.debug(
          'CLOUD',
          `Pull-Zeile ${mapping.localTable}/${rowId}`,
          Object.keys(raw).join(','),
        );
      }

      const local =
        mapRemoteToLocal(
          raw,
          mapping,
        );

      await applyPullRow(
        mapping,
        local,
      );

      stats.pulled += 1;
    } catch (error) {
      debugLog.error(
        'CLOUD',
        `${CLOUD_ERROR_CODES.PULL_ROW_WRITE_FAILED}: Zeile ${mapping.localTable}/${rowId} abgelehnt`,
        error,
      );

      throw error;
    }

    const stamp =
      normalizeTimestamp(
        raw.updated_at,
      );

    if (
      stamp &&
      stamp >
        newestCursor
    ) {
      newestCursor =
        stamp;
    }
  }

  if (newestCursor !== cursor) {
    try {
      await setSyncMetadata(
        cursorKey,

        newestCursor,
      );
    } catch (error) {
      debugLog.error(
        'CLOUD',
        `${CLOUD_ERROR_CODES.PULL_CURSOR_FAILED}: Cursor-Update ${mapping.localTable} fehlgeschlagen`,
        error,
      );

      throw error;
    }
  }
}

async function pushTable(
  mapping: TableMapping,

  stats: {
    pushed: number;
  },
): Promise<void> {
  const supabase =
    getSupabaseClient();

  if (!supabase) {
    return;
  }

  const cursorKey =
    `push_cursor_${mapping.remoteTable}`;

  const cursor =
    (await getSyncMetadata(
      cursorKey,
    )) ??
    EPOCH_CURSOR;

  const db =
    await getDatabase();

  const rows =
    await db.getAllAsync<TableRow>(
      `SELECT * FROM ${mapping.localTable}
       WHERE (deleted_at IS NOT NULL OR updated_at > ?)
       ORDER BY updated_at ASC
       LIMIT 400`,

      cursor,
    );

  if (
    rows.length ===
    0
  ) {
    return;
  }

  const payload =
    rows.map((row) =>
      mapLocalToRemote(
        row,
        mapping,
      ),
    );

  const { error } =
    await supabase
      .from(mapping.remoteTable)
      .upsert(payload, {
        onConflict: 'id',
      });

  if (error) {
    throw new Error(
      `Push ${mapping.remoteTable} fehlgeschlagen: ${error.message}`,
    );
  }

  let newestCursor =
    cursor;

  for (const row of rows) {
    const stamp =
      normalizeTimestamp(
        row.updated_at,
      );

    if (
      stamp &&
      stamp >
        newestCursor
    ) {
      newestCursor =
        stamp;
    }

    stats.pushed += 1;
  }

  if (newestCursor !== cursor) {
    await setSyncMetadata(
      cursorKey,

      newestCursor,
    );
  }
}

export type CloudSyncResult = {
  status:
    SyncStatus;

  message:
    string;

  pushed?: number;

  pulled?: number;
};

let running: Promise<CloudSyncResult> | null =
  null;

/**
 * Führt einen kompletten Sync-Durchlauf aus.
 * Parallelität wird bewusst geblockt.
 */
export function runCloudSync(): Promise<CloudSyncResult> {
  if (running) {
    debugLog.info(
      'CLOUD',
      'Sync übersprungen - läuft bereits',
    );

    return running;
  }

  running = executeCloudSync()
    .catch(
      (error):
        CloudSyncResult => {
        debugLog.error(
          'CLOUD',
          'Sync fehlgeschlagen (unbehandelt)',
          error,
        );

        return {
          status: 'error',

          message:
            'Synchronisierung fehlgeschlagen',
        };
      },
    )
    .finally(() => {
      running = null;
    });

  return running;
}

async function uploadDebugPayload(
  userId: string,
): Promise<void> {
  const supabase =
    getSupabaseClient();

  if (!supabase) {
    return;
  }

  const payload =
    buildDebugUploadPayload(60);

  if (
    payload.length ===
    0
  ) {
    return;
  }

  try {
    const { error } =
      await supabase
        .from('app_debug_logs')
        .insert(payload);

    if (error) {
      console.warn(
        '[CLOUD] Debug-Upload fehlgeschlagen:',
        error.message,
      );
    }
  } catch (uploadError) {
    console.warn(
      '[CLOUD] Debug-Upload Ausnahme:',
      uploadError,
    );
  }
}

async function executeCloudSync(): Promise<CloudSyncResult> {
  return withDbLock(
    async (): Promise<CloudSyncResult> => {
    if (!getSupabaseClient()) {
      return {
        status: 'unconfigured',

        message:
          'Cloud nicht konfiguriert',
      };
    }

    const session =
      await ensureCloudSession();

    if (!session.ok) {
      debugLog.error(
        'CLOUD',
        `Keine Cloud-Session: ${session.message}`,
      );

      void (async () => {
        const client =
          getSupabaseClient();

        if (!client) return;

        try {
          await client
            .from('app_debug_logs')
            .insert(
              buildDebugUploadPayload(40),
            );
        } catch {
          /*
           * Ohne Session kein Upload möglich -
           * Einträge bleiben im Ring-Puffer.
           */
        }
      })();

      return {
        status: 'error',

        message:
          session.message,
      };
    }

    debugLog.info(
      'CLOUD',
      `Sync-Start (user ${session.userId.slice(0, 8)}…)`,
    );

    /*
     * Faule Finalisierung fälliger Löschanträge (Kulanzfenster abgelaufen).
     * Serverseitig werden die eigenen `finance_*`-Zeilen gelöscht. Danach
     * MUSS die lokale DB geleert werden – sonst würde derselbe Lauf die
     * gerade gelöschten Daten wieder hochladen.
     */
    try {
      const finalization = await runDueDeletionFinalization();
      if (finalization.finalized) {
        await wipeLocalFinanceDataLocked();
        debugLog.info(
          'CLOUD',
          `Löschantrag finalisiert · ${finalization.rowsDeleted ?? 0} Cloud-Zeilen · lokale DB geleert`,
        );
        return {
          status: 'synced',
          message: 'Finanzdaten gelöscht',
          pushed: 0,
          pulled: 0,
        };
      }
    } catch (finalizationError) {
      debugLog.warn('CLOUD', 'Lösch-Finalisierung übersprungen', finalizationError);
    }

    /*
     * Besitzerwechsel-Erkennung:
     *
     * Sync-Cursor gehören immer zu einem
     * Datenraum. Wechselt der Owner
     * (z. B. Anmeldung am persönlichen
     * Konto), müssen alle Cursor zurück-
     * gesetzt werden, damit sämtliche
     * lokalen Daten in den neuen Raum
     * übernommen werden.
     */
    try {
      const lastOwner =
        await getSyncMetadata(
          'last_owner',
        );

      if (
        lastOwner &&
        lastOwner !==
          session.userId
      ) {
        debugLog.info(
          'CLOUD',
          'Besitzerwechsel erkannt - Cursor werden zurückgesetzt',
        );

        for (const mapping of TABLE_MAPPINGS) {
          await setSyncMetadata(
            `pull_cursor_${mapping.remoteTable}`,

            EPOCH_CURSOR,
          );

          await setSyncMetadata(
            `push_cursor_${mapping.remoteTable}`,

            EPOCH_CURSOR,
          );
        }
      }

      if (
        lastOwner !==
        session.userId
      ) {
        await setSyncMetadata(
          'last_owner',

          session.userId,
        );
      }
    } catch (ownerError) {
      debugLog.warn(
        'CLOUD',
        'Besitzerwechsel-Prüfung fehlgeschlagen',
        ownerError,
      );
    }

    /*
     * Diagnose: lokales Schema der
     * Sync-Tabellen dokumentieren,
     * damit Diskrepanzen zwischen
     * Migrationen und Laufzeit sichtbar
     * werden.
     */
    try {
      const db =
        await getDatabase();

      for (const mapping of TABLE_MAPPINGS) {
        const cols =
          await db.getAllAsync<{
            name: string;
          }>(
            `PRAGMA table_info(${mapping.localTable})`,
          );

        debugLog.debug(
          'CLOUD',
          `Schema ${mapping.localTable}: ${cols.map((c) => c.name).join(',')}`,
        );
      }

      const version =
        await db.getFirstAsync<{
          max_version:
            number;
        }>(
          `SELECT MAX(version) AS max_version FROM schema_migrations`,
        );

      debugLog.debug(
        'CLOUD',
        `Lokale Schema-Version: ${version?.max_version ?? 'unbekannt'}`,
      );
    } catch (schemaError) {
      debugLog.warn(
        'CLOUD',
        'Schema-Diagnose fehlgeschlagen',
        schemaError,
      );
    }

    const stats = {
      pushed: 0,
      pulled: 0,
    };

    let failure:
      | string
      | null = null;

    /*
     * Erst lokale Änderungen hochladen,
     * dann fremde Änderungen ziehen -
     * reduziert LWW-Kollisionen im selben Lauf.
     */
    for (const mapping of TABLE_MAPPINGS) {
      try {
        await pushTable(
          mapping,
          stats,
        );
      } catch (error) {
        failure = `push:${mapping.remoteTable}`;

        debugLog.error(
          'CLOUD',
          `Push fehlgeschlagen: ${mapping.localTable}`,
          error,
        );

        break;
      }
    }

    if (!failure) {
      for (const mapping of TABLE_MAPPINGS) {
        try {
          await pullTable(
            mapping,
            session.userId,
            stats,
          );
        } catch (error) {
          failure = `pull:${mapping.remoteTable}`;

          debugLog.error(
            'CLOUD',
            `Pull fehlgeschlagen: ${mapping.localTable}`,
            error,
          );

          break;
        }
      }
    }

    if (failure) {
      await uploadDebugPayload(
        session.userId,
      );

      return {
        status: 'error',

        message:
          'Synchronisierung fehlgeschlagen',
      };
    }

    await setSyncMetadata(
      'last_synced_at',

      new Date()
        .toISOString()
        .replace(
          /\.\d{3}Z$/,
          '.000Z',
        ),
    );

    debugLog.info(
      'CLOUD',
      `Sync ok · push ${stats.pushed} · pull ${stats.pulled}`,
    );

    await uploadDebugPayload(
      session.userId,
    );

    return {
      status: 'synced',

      message: `Synchronisiert · ${stats.pushed} hoch · ${stats.pulled} runter`,

      pushed:
        stats.pushed,

      pulled:
        stats.pulled,
    };
    },
  );
}
