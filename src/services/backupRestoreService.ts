import { getDatabase, withWriteTransaction } from '@/db/database';
import { withDbLock } from '@/core/dbWriteLock';
import { debugLog } from '@/core/debugLog';
import {
  buildRestorePlan,
  RESTORE_ORDER,
  type BackupDomain,
  type LocalRowIndex,
  type LocalRowMeta,
  type ParsedBackup,
  type RestorePlan,
} from '@/services/backupImportCore';

/**
 * Backup einlesen und schreiben.
 *
 * Grundsätze:
 *  - Restore ist ein **Merge**, kein Blind-Replace. Bestehende (auch per Cloud
 *    synchronisierte) Zeilen werden nur überschrieben, wenn das Backup laut
 *    Last-Writer-Wins neuer ist. Ein lokaler Tombstone gilt als Stand – ein
 *    altes Backup belebt bewusst Gelöschtes nicht wieder.
 *  - Der gesamte Restore läuft in EINER Transaktion. Jeder Fehler → Rollback,
 *    keine halb wiederhergestellte Datenbank.
 *  - Bank-Verbindungen werden nur als getrennte Metadaten geschrieben
 *    (`status = 'requires_action'`); niemals ein Zugang / Token.
 *  - Geld bleibt ganzzahlige Minor-Unit; Legacy-REAL-Spalten sind nur ein
 *    abgeleiteter Schatten.
 */

// ---------------------------------------------------------------------------
// Tabellen-Spezifikation (gespiegelt aus src/db/database.ts + TABLE_MAPPINGS)
// ---------------------------------------------------------------------------

type ColumnValue = string | number | null;

type DomainTable = {
  domain: BackupDomain;
  table: string;
  /** Aktive Zeilen lesen (für den Backup-Export). */
  readColumns: string;
  mapRowToBackup: (row: Record<string, unknown>) => Record<string, unknown>;
  /** Backup-Zeile → vollständige DB-Spaltenwerte inkl. Legacy-/Pflichtspalten. */
  toDbColumns: (row: Record<string, ColumnValue>) => Record<string, ColumnValue>;
};

function minorToLegacyReal(minor: unknown): number {
  const value = typeof minor === 'number' && Number.isFinite(minor) ? minor : 0;
  return value / 100;
}

function nowIso(): string {
  return new Date().toISOString();
}

const DOMAIN_TABLES: Record<BackupDomain, DomainTable> = {
  categories: {
    domain: 'categories',
    table: 'categories',
    readColumns: 'id, name, icon, is_income_category, created_at, updated_at, deleted_at',
    mapRowToBackup: (r) => ({
      id: r.id,
      name: r.name,
      icon: r.icon ?? null,
      isIncomeCategory: r.is_income_category === 1,
      createdAt: r.created_at ?? null,
      updatedAt: r.updated_at ?? null,
      deletedAt: r.deleted_at ?? null,
    }),
    toDbColumns: (r) => ({
      id: r.id,
      name: r.name,
      icon: r.icon ?? null,
      is_income_category: r.isIncomeCategory ?? 0,
    }),
  },
  bankConnections: {
    domain: 'bankConnections',
    table: 'bank_connections',
    readColumns:
      'id, provider_id, external_connection_id, institution_id, institution_name, status, is_demo, last_synced_at, created_at, updated_at, deleted_at',
    mapRowToBackup: (r) => ({
      id: r.id,
      providerId: r.provider_id,
      externalConnectionId: r.external_connection_id ?? null,
      institutionId: r.institution_id ?? null,
      institutionName: r.institution_name ?? null,
      isDemo: r.is_demo === 1,
      createdAt: r.created_at ?? null,
      updatedAt: r.updated_at ?? null,
      deletedAt: r.deleted_at ?? null,
    }),
    toDbColumns: (r) => ({
      id: r.id,
      provider_id: r.providerId,
      // Backup trägt bewusst keine Bank-Autorisierung. Nur Metadaten, getrennt.
      external_connection_id:
        typeof r.externalConnectionId === 'string' && r.externalConnectionId.length > 0
          ? r.externalConnectionId
          : `restored:${String(r.id)}`,
      institution_id: typeof r.institutionId === 'string' ? r.institutionId : '',
      institution_name:
        typeof r.institutionName === 'string' && r.institutionName.length > 0
          ? r.institutionName
          : String(r.providerId ?? 'Bank'),
      status: 'requires_action',
      is_demo: r.isDemo ?? 0,
      last_synced_at: null,
    }),
  },
  categoryRules: {
    domain: 'categoryRules',
    table: 'category_rules',
    readColumns:
      'id, name, match_type, match_value, category_id, enabled, priority, created_at, updated_at, deleted_at',
    mapRowToBackup: (r) => ({
      id: r.id,
      name: r.name,
      matchType: r.match_type,
      matchValue: r.match_value,
      categoryId: r.category_id,
      enabled: r.enabled === 1,
      priority: r.priority ?? 100,
      createdAt: r.created_at ?? null,
      updatedAt: r.updated_at ?? null,
      deletedAt: r.deleted_at ?? null,
    }),
    toDbColumns: (r) => ({
      id: r.id,
      name: r.name,
      match_type: r.matchType,
      match_value: r.matchValue,
      category_id: r.categoryId,
      enabled: r.enabled ?? 1,
      priority: typeof r.priority === 'number' ? r.priority : 100,
    }),
  },
  accounts: {
    domain: 'accounts',
    table: 'accounts',
    readColumns:
      'id, bank_connection_id, provider_id, external_account_id, name, iban, currency, balance_minor, type, institution_name, last_synced_at, created_at, updated_at, deleted_at',
    mapRowToBackup: (r) => ({
      id: r.id,
      bankConnectionId: r.bank_connection_id ?? null,
      providerId: r.provider_id,
      externalAccountId: r.external_account_id,
      name: r.name,
      iban: r.iban ?? null,
      currency: r.currency,
      balanceMinor: r.balance_minor ?? 0,
      type: r.type,
      institutionName: r.institution_name ?? null,
      createdAt: r.created_at ?? null,
      updatedAt: r.updated_at ?? null,
      deletedAt: r.deleted_at ?? null,
    }),
    toDbColumns: (r) => ({
      id: r.id,
      bank_connection_id: r.bankConnectionId ?? null,
      provider_id: r.providerId,
      external_account_id: r.externalAccountId,
      name: r.name,
      iban: r.iban ?? null,
      currency: r.currency,
      balance_minor: typeof r.balanceMinor === 'number' ? r.balanceMinor : 0,
      balance: minorToLegacyReal(r.balanceMinor),
      type: r.type,
      institution_name: r.institutionName ?? null,
      last_synced_at: null,
    }),
  },
  budgets: {
    domain: 'budgets',
    table: 'budgets',
    readColumns: 'id, category_id, name, amount_minor, period, created_at, updated_at, deleted_at',
    mapRowToBackup: (r) => ({
      id: r.id,
      categoryId: r.category_id ?? null,
      name: r.name,
      amountMinor: r.amount_minor ?? 0,
      period: r.period ?? 'monthly',
      createdAt: r.created_at ?? null,
      updatedAt: r.updated_at ?? null,
      deletedAt: r.deleted_at ?? null,
    }),
    toDbColumns: (r) => ({
      id: r.id,
      category_id: r.categoryId ?? null,
      name: r.name,
      amount_minor: typeof r.amountMinor === 'number' ? r.amountMinor : 0,
      amount: minorToLegacyReal(r.amountMinor),
      period: r.period ?? 'monthly',
    }),
  },
  savingsGoals: {
    domain: 'savingsGoals',
    table: 'savings_goals',
    readColumns:
      'id, name, description, target_amount_minor, current_amount_minor, starting_amount_minor, currency, target_date, linked_account_id, rule_keyword, tracking_mode, status, created_at, updated_at, deleted_at',
    mapRowToBackup: (r) => ({
      id: r.id,
      name: r.name,
      description: r.description ?? null,
      targetAmountMinor: r.target_amount_minor ?? 0,
      currentAmountMinor: r.current_amount_minor ?? 0,
      startingAmountMinor: r.starting_amount_minor ?? 0,
      currency: r.currency ?? 'EUR',
      targetDate: r.target_date ?? null,
      linkedAccountId: r.linked_account_id ?? null,
      ruleKeyword: r.rule_keyword ?? null,
      trackingMode: r.tracking_mode ?? 'manual',
      status: r.status ?? 'active',
      createdAt: r.created_at ?? null,
      updatedAt: r.updated_at ?? null,
      deletedAt: r.deleted_at ?? null,
    }),
    toDbColumns: (r) => ({
      id: r.id,
      name: r.name,
      description: r.description ?? null,
      target_amount_minor: typeof r.targetAmountMinor === 'number' ? r.targetAmountMinor : 0,
      target_amount: minorToLegacyReal(r.targetAmountMinor),
      current_amount_minor: typeof r.currentAmountMinor === 'number' ? r.currentAmountMinor : 0,
      current_amount: minorToLegacyReal(r.currentAmountMinor),
      starting_amount_minor: typeof r.startingAmountMinor === 'number' ? r.startingAmountMinor : 0,
      currency: r.currency ?? 'EUR',
      target_date: r.targetDate ?? null,
      linked_account_id: r.linkedAccountId ?? null,
      rule_keyword: r.ruleKeyword ?? null,
      tracking_mode: r.trackingMode ?? 'manual',
      status: r.status ?? 'active',
    }),
  },
  goalContributions: {
    domain: 'goalContributions',
    table: 'goal_contributions',
    readColumns:
      'id, goal_id, amount_minor, source, source_transaction_id, note, occurred_at, created_at, updated_at, deleted_at',
    mapRowToBackup: (r) => ({
      id: r.id,
      goalId: r.goal_id,
      amountMinor: r.amount_minor,
      source: r.source,
      sourceTransactionId: r.source_transaction_id ?? null,
      note: r.note ?? null,
      occurredAt: r.occurred_at,
      createdAt: r.created_at ?? null,
      updatedAt: r.updated_at ?? null,
      deletedAt: r.deleted_at ?? null,
    }),
    toDbColumns: (r) => ({
      id: r.id,
      goal_id: r.goalId,
      amount_minor: typeof r.amountMinor === 'number' ? r.amountMinor : 0,
      source: r.source ?? 'manual',
      source_transaction_id: r.sourceTransactionId ?? null,
      note: r.note ?? null,
      occurred_at: r.occurredAt ?? nowIso(),
    }),
  },
  recurringSeries: {
    domain: 'recurringSeries',
    table: 'recurring_series',
    readColumns:
      'id, merchant_name, kind, muted, user_confirmed, expected_amount_minor, currency, cadence, note, created_at, updated_at, deleted_at',
    mapRowToBackup: (r) => ({
      id: r.id,
      merchantName: r.merchant_name ?? null,
      kind: r.kind ?? 'uncertain',
      muted: r.muted === 1,
      userConfirmed: r.user_confirmed === 1,
      expectedAmountMinor: r.expected_amount_minor ?? null,
      currency: r.currency ?? null,
      cadence: r.cadence ?? null,
      note: r.note ?? null,
      createdAt: r.created_at ?? null,
      updatedAt: r.updated_at ?? null,
      deletedAt: r.deleted_at ?? null,
    }),
    toDbColumns: (r) => ({
      id: r.id,
      merchant_name: r.merchantName ?? null,
      kind: r.kind ?? 'uncertain',
      muted: r.muted ?? 0,
      user_confirmed: r.userConfirmed ?? 1,
      expected_amount_minor: typeof r.expectedAmountMinor === 'number' ? r.expectedAmountMinor : null,
      currency: r.currency ?? null,
      cadence: r.cadence ?? null,
      note: r.note ?? null,
    }),
  },
  transactions: {
    domain: 'transactions',
    table: 'transactions',
    readColumns:
      'id, account_id, external_transaction_id, amount_minor, currency, direction, booking_date, booking_status, value_date, description, counterparty_name, counterparty_iban, category_id, category_source, is_recurring, created_at, updated_at, deleted_at',
    mapRowToBackup: (r) => ({
      id: r.id,
      accountId: r.account_id,
      externalTransactionId: r.external_transaction_id ?? null,
      amountMinor: r.amount_minor ?? 0,
      currency: r.currency,
      direction: r.direction,
      bookingDate: r.booking_date,
      bookingStatus: r.booking_status ?? 'booked',
      valueDate: r.value_date ?? null,
      description: r.description ?? '',
      counterpartyName: r.counterparty_name ?? null,
      counterpartyIBAN: r.counterparty_iban ?? null,
      categoryId: r.category_id ?? null,
      categorySource: r.category_source ?? null,
      isRecurring: r.is_recurring === 1,
      createdAt: r.created_at ?? null,
      updatedAt: r.updated_at ?? null,
      deletedAt: r.deleted_at ?? null,
    }),
    toDbColumns: (r) => {
      const minor = typeof r.amountMinor === 'number' ? r.amountMinor : 0;
      const magnitude = Math.abs(minor) / 100;
      return {
        id: r.id,
        account_id: r.accountId,
        external_transaction_id: r.externalTransactionId ?? null,
        amount_minor: minor,
        amount: r.direction === 'income' ? magnitude : -magnitude,
        currency: r.currency,
        direction: r.direction,
        booking_date: r.bookingDate,
        booking_status: r.bookingStatus ?? 'booked',
        value_date: r.valueDate ?? null,
        description: typeof r.description === 'string' ? r.description : '',
        counterparty_name: r.counterpartyName ?? null,
        counterparty_iban: r.counterpartyIBAN ?? null,
        category_id: r.categoryId ?? null,
        category_source: r.categorySource ?? null,
        is_recurring: r.isRecurring ?? 0,
      };
    },
  },
};

// ---------------------------------------------------------------------------
// Export: aktuelle DB → Backup-Datenteil
// ---------------------------------------------------------------------------

export type BackupData = {
  accounts: unknown[];
  transactions: unknown[];
  categories: unknown[];
  categoryRules: unknown[];
  budgets: unknown[];
  savingsGoals: unknown[];
  goalContributions: unknown[];
  recurringSeries: unknown[];
  bankConnections: unknown[];
};

export async function collectBackupData(): Promise<BackupData> {
  const db = await getDatabase();
  const out = {} as Record<BackupDomain, unknown[]>;
  for (const domain of RESTORE_ORDER) {
    const spec = DOMAIN_TABLES[domain];
    const rows = await db.getAllAsync<Record<string, unknown>>(
      `SELECT ${spec.readColumns} FROM ${spec.table} WHERE deleted_at IS NULL`,
    );
    out[domain] = rows.map((row) => spec.mapRowToBackup(row));
  }
  return {
    accounts: out.accounts,
    transactions: out.transactions,
    categories: out.categories,
    categoryRules: out.categoryRules,
    budgets: out.budgets,
    savingsGoals: out.savingsGoals,
    goalContributions: out.goalContributions,
    recurringSeries: out.recurringSeries,
    bankConnections: out.bankConnections,
  };
}

// ---------------------------------------------------------------------------
// Import: ParsedBackup → transaktionaler Merge
// ---------------------------------------------------------------------------

export type RestoreOutcome =
  | { ok: true; plan: RestorePlan; written: number }
  | { ok: false; reason: string };

async function buildLocalIndex(db: Awaited<ReturnType<typeof getDatabase>>): Promise<LocalRowIndex> {
  const index = {} as LocalRowIndex;
  for (const domain of RESTORE_ORDER) {
    const spec = DOMAIN_TABLES[domain];
    const rows = await db.getAllAsync<{ id: string; updated_at: string | null; deleted_at: string | null }>(
      `SELECT id, updated_at, deleted_at FROM ${spec.table}`,
    );
    const map = new Map<string, LocalRowMeta>();
    for (const row of rows) {
      map.set(row.id, { updatedAt: row.updated_at ?? null, deletedAt: row.deleted_at ?? null });
    }
    index[domain] = map;
  }
  return index;
}

function upsertSql(table: string, columns: string[]): string {
  const placeholders = columns.map(() => '?').join(', ');
  const assignments = columns
    .filter((column) => column !== 'id')
    .map((column) => `${column} = excluded.${column}`)
    .join(', ');
  return `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})
          ON CONFLICT(id) DO UPDATE SET ${assignments}`;
}

/**
 * Wendet ein validiertes Backup an. Alles-oder-nichts: Fehler → Rollback.
 */
export async function applyRestore(backup: ParsedBackup): Promise<RestoreOutcome> {
  return withDbLock(async (): Promise<RestoreOutcome> => {
    const db = await getDatabase();
    const localIndex = await buildLocalIndex(db);
    const plan = buildRestorePlan(backup, localIndex);

    if (plan.totalWrites === 0) {
      return { ok: true, plan, written: 0 };
    }

    let written = 0;
    try {
      await withWriteTransaction(db, async (txn) => {
        for (const domain of RESTORE_ORDER) {
          const spec = DOMAIN_TABLES[domain];
          const toWrite = plan.writes[domain];
          if (!toWrite || toWrite.size === 0) continue;

          for (const row of backup.rows[domain]) {
            const id = row.id as string;
            if (!toWrite.has(id)) continue;

            const dbColumns = spec.toDbColumns(row);
            // Sync-Zeitstempel bewusst aus dem Backup übernehmen (LWW-korrekt).
            const createdAt = (row.createdAt as string | null) ?? nowIso();
            const updatedAt = (row.updatedAt as string | null) ?? createdAt;
            const deletedAt = (row.deletedAt as string | null) ?? null;
            dbColumns.created_at = createdAt;
            dbColumns.updated_at = updatedAt;
            dbColumns.deleted_at = deletedAt;

            const columns = Object.keys(dbColumns);
            const values = columns.map((column) => dbColumns[column]);
            await txn.runAsync(upsertSql(spec.table, columns), ...values);

            // Trigger stempeln created_at/updated_at nach dem INSERT neu –
            // hier deterministisch auf die Backup-Werte zurücksetzen. Da der
            // Update-Trigger nur `WHEN NEW.updated_at = OLD.updated_at` feuert,
            // ist dieser Schritt selbst kein Re-Stamp.
            await txn.runAsync(
              `UPDATE ${spec.table} SET created_at = ?, updated_at = ?, deleted_at = ? WHERE id = ?`,
              createdAt,
              updatedAt,
              deletedAt,
              id,
            );
            written += 1;
          }
        }
      });
    } catch (error) {
      debugLog.error('BACKUP', 'Restore fehlgeschlagen – Transaktion zurückgerollt', error);
      return { ok: false, reason: 'restore_failed' };
    }

    debugLog.info('BACKUP', `Restore ok · ${written} Einträge zusammengeführt`);
    return { ok: true, plan, written };
  });
}
