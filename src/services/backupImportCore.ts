/**
 * Reiner, testbarer Kern für den Backup-Import.
 *
 * Verantwortung:
 *  1. Eine unbekannte, potenziell bösartige Datei streng validieren.
 *  2. Eine normalisierte, sichere Zwischenform (`ParsedBackup`) erzeugen –
 *     ausschließlich mit bekannten Feldern (unbekannte Schlüssel werden verworfen,
 *     Prototyp-Verschmutzung ist damit strukturell ausgeschlossen).
 *  3. Aus `ParsedBackup` + lokalem Zeilenindex einen deterministischen,
 *     konservativen Restore-Plan (Merge, kein Blind-Replace) berechnen.
 *
 * Dieser Kern schreibt NICHTS. Er importiert nur `type` und bleibt damit unter
 * `node --experimental-strip-types` testbar.
 *
 * Sicherheitsgrenzen:
 *  - Enthält keine Bankzugänge / Tokens / Secrets – das Backup-Format trägt keine.
 *  - Bank-Verbindungen werden nur als getrennte Metadaten wiederhergestellt.
 *  - Geld ist immer ganzzahlige Minor-Unit; keine Fließkomma-Konvertierung.
 */

import type { TransactionDirection } from '../types/finance';

// ---------------------------------------------------------------------------
// Limits – ein importiertes File ist nicht vertrauenswürdig
// ---------------------------------------------------------------------------

export const BACKUP_LIMITS = {
  /** Maximale Dateigröße (UTF-8 Bytes). Ein echtes Finanz-Backup bleibt weit darunter. */
  maxBytes: 8 * 1024 * 1024,
  /** Maximale Zeilen pro Domäne. */
  maxRowsPerDomain: 200_000,
  /** Maximale Zeilen über alle Domänen. */
  maxRowsTotal: 500_000,
  /** Maximale Länge eines Freitext-/String-Feldes. */
  maxStringLength: 2_000,
  /** Erlaubter Betragsbereich in Minor-Units (± ~10 Mrd. Einheiten). */
  moneyMin: -1_000_000_000_000,
  moneyMax: 1_000_000_000_000,
} as const;

export const FINANCE_BACKUP_FORMAT = 'finance-app-backup';
export const SUPPORTED_BACKUP_VERSIONS = [1, 2] as const;

// ---------------------------------------------------------------------------
// Domänen
// ---------------------------------------------------------------------------

export type BackupDomain =
  | 'categories'
  | 'bankConnections'
  | 'categoryRules'
  | 'accounts'
  | 'budgets'
  | 'savingsGoals'
  | 'goalContributions'
  | 'recurringSeries'
  | 'transactions';

/**
 * Reihenfolge für einen FK-sicheren Restore: Eltern zuerst.
 * (Categories → Rules/Budgets, Connections → Accounts → Goals → Contributions,
 *  Accounts+Categories → Transactions.)
 */
export const RESTORE_ORDER: readonly BackupDomain[] = [
  'categories',
  'bankConnections',
  'categoryRules',
  'accounts',
  'budgets',
  'savingsGoals',
  'goalContributions',
  'recurringSeries',
  'transactions',
];

// ---------------------------------------------------------------------------
// Normalisierte, validierte Zeilen
// ---------------------------------------------------------------------------

type Row = Record<string, string | number | null>;

export type ParsedBackup = {
  formatVersion: number;
  createdAt: string | null;
  appVersion: string | null;
  rows: Record<BackupDomain, Row[]>;
};

export type BackupIssue = {
  code: string;
  domain?: BackupDomain;
  detail: string;
};

export type BackupInspection =
  | {
      ok: true;
      backup: ParsedBackup;
      counts: Record<BackupDomain, number>;
      /** Nicht-fatale Bereinigungen (z. B. ungültige optionale Kategorie-Referenz → null). */
      notes: BackupIssue[];
    }
  | { ok: false; issues: BackupIssue[] };

// ---------------------------------------------------------------------------
// Validierungs-Primitive
// ---------------------------------------------------------------------------

const ID_PATTERN = /^[A-Za-z0-9._:|\-]{1,128}$/;
const CURRENCY_PATTERN = /^[A-Z]{3}$/;
const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function utf8ByteLength(text: string): number {
  // Ohne Buffer-Abhängigkeit (Node + RN + node:sqlite-Tests).
  let bytes = 0;
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    if (code < 0x80) bytes += 1;
    else if (code < 0x800) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff) {
      bytes += 4;
      i += 1;
    } else bytes += 3;
  }
  return bytes;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function hasDangerousKeys(value: object): boolean {
  return Object.keys(value).some((key) => DANGEROUS_KEYS.has(key));
}

function isIsoTimestamp(value: unknown): value is string {
  if (typeof value !== 'string' || value.length < 10 || value.length > 40) return false;
  const time = Date.parse(value);
  return Number.isFinite(time);
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function isSafeMoney(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    Number.isSafeInteger(value) &&
    value >= BACKUP_LIMITS.moneyMin &&
    value <= BACKUP_LIMITS.moneyMax
  );
}

type FieldSpec = {
  name: string;
  required?: boolean;
  kind: 'id' | 'idRef' | 'string' | 'money' | 'bool' | 'timestamp' | 'currency' | 'enum';
  enumValues?: readonly string[];
};

type DomainSpec = {
  /** Datenschlüssel im Backup (`data.<key>`). */
  key: BackupDomain;
  fields: readonly FieldSpec[];
};

const DIRECTIONS: readonly TransactionDirection[] = ['income', 'expense'];

const DOMAIN_SPECS: readonly DomainSpec[] = [
  {
    key: 'categories',
    fields: [
      { name: 'id', kind: 'id', required: true },
      { name: 'name', kind: 'string', required: true },
      { name: 'icon', kind: 'string' },
      { name: 'isIncomeCategory', kind: 'bool' },
    ],
  },
  {
    key: 'bankConnections',
    fields: [
      { name: 'id', kind: 'id', required: true },
      { name: 'providerId', kind: 'string', required: true },
      { name: 'externalConnectionId', kind: 'string' },
      { name: 'institutionId', kind: 'string' },
      { name: 'institutionName', kind: 'string' },
      { name: 'isDemo', kind: 'bool' },
    ],
  },
  {
    key: 'categoryRules',
    fields: [
      { name: 'id', kind: 'id', required: true },
      { name: 'name', kind: 'string', required: true },
      {
        name: 'matchType',
        kind: 'enum',
        required: true,
        enumValues: ['merchant_contains', 'merchant_equals', 'description_contains'],
      },
      { name: 'matchValue', kind: 'string', required: true },
      { name: 'categoryId', kind: 'idRef', required: true },
      { name: 'enabled', kind: 'bool' },
      { name: 'priority', kind: 'money' },
    ],
  },
  {
    key: 'accounts',
    fields: [
      { name: 'id', kind: 'id', required: true },
      { name: 'bankConnectionId', kind: 'idRef' },
      { name: 'providerId', kind: 'string', required: true },
      { name: 'externalAccountId', kind: 'string', required: true },
      { name: 'name', kind: 'string', required: true },
      { name: 'iban', kind: 'string' },
      { name: 'currency', kind: 'currency', required: true },
      { name: 'balanceMinor', kind: 'money', required: true },
      {
        name: 'type',
        kind: 'enum',
        required: true,
        enumValues: ['checking', 'savings', 'credit', 'cash', 'investment', 'other'],
      },
      { name: 'institutionName', kind: 'string' },
    ],
  },
  {
    key: 'budgets',
    fields: [
      { name: 'id', kind: 'id', required: true },
      { name: 'categoryId', kind: 'idRef' },
      { name: 'name', kind: 'string', required: true },
      { name: 'amountMinor', kind: 'money', required: true },
      { name: 'period', kind: 'enum', required: true, enumValues: ['weekly', 'monthly', 'yearly'] },
    ],
  },
  {
    key: 'savingsGoals',
    fields: [
      { name: 'id', kind: 'id', required: true },
      { name: 'name', kind: 'string', required: true },
      { name: 'description', kind: 'string' },
      { name: 'targetAmountMinor', kind: 'money', required: true },
      { name: 'currentAmountMinor', kind: 'money' },
      { name: 'startingAmountMinor', kind: 'money' },
      { name: 'currency', kind: 'currency', required: true },
      { name: 'targetDate', kind: 'string' },
      { name: 'linkedAccountId', kind: 'idRef' },
      { name: 'ruleKeyword', kind: 'string' },
      {
        name: 'trackingMode',
        kind: 'enum',
        required: true,
        enumValues: ['manual', 'transaction_rule', 'account_balance'],
      },
      { name: 'status', kind: 'enum', required: true, enumValues: ['active', 'archived'] },
    ],
  },
  {
    key: 'goalContributions',
    fields: [
      { name: 'id', kind: 'id', required: true },
      { name: 'goalId', kind: 'idRef', required: true },
      { name: 'amountMinor', kind: 'money', required: true },
      { name: 'source', kind: 'enum', required: true, enumValues: ['manual', 'transaction', 'adjustment'] },
      { name: 'sourceTransactionId', kind: 'idRef' },
      { name: 'note', kind: 'string' },
      { name: 'occurredAt', kind: 'timestamp', required: true },
    ],
  },
  {
    key: 'recurringSeries',
    fields: [
      { name: 'id', kind: 'id', required: true },
      { name: 'merchantName', kind: 'string' },
      {
        name: 'kind',
        kind: 'enum',
        required: true,
        enumValues: ['subscription', 'bill', 'income', 'uncertain'],
      },
      { name: 'muted', kind: 'bool' },
      { name: 'userConfirmed', kind: 'bool' },
      { name: 'expectedAmountMinor', kind: 'money' },
      { name: 'currency', kind: 'currency' },
      { name: 'cadence', kind: 'string' },
      { name: 'note', kind: 'string' },
    ],
  },
  {
    key: 'transactions',
    fields: [
      { name: 'id', kind: 'id', required: true },
      { name: 'accountId', kind: 'idRef', required: true },
      { name: 'externalTransactionId', kind: 'string' },
      { name: 'amountMinor', kind: 'money', required: true },
      { name: 'currency', kind: 'currency', required: true },
      { name: 'direction', kind: 'enum', required: true, enumValues: DIRECTIONS },
      { name: 'bookingDate', kind: 'string', required: true },
      {
        name: 'bookingStatus',
        kind: 'enum',
        required: true,
        enumValues: ['pending', 'booked', 'unknown'],
      },
      { name: 'valueDate', kind: 'string' },
      { name: 'description', kind: 'string' },
      { name: 'counterpartyName', kind: 'string' },
      { name: 'counterpartyIBAN', kind: 'string' },
      { name: 'categoryId', kind: 'idRef' },
      {
        name: 'categorySource',
        kind: 'enum',
        enumValues: ['manual', 'rule', 'auto', 'none'],
      },
      { name: 'isRecurring', kind: 'bool' },
    ],
  },
];

const SYNC_META_FIELDS: readonly FieldSpec[] = [
  { name: 'createdAt', kind: 'timestamp' },
  { name: 'updatedAt', kind: 'timestamp' },
  { name: 'deletedAt', kind: 'timestamp' },
];

// ---------------------------------------------------------------------------
// inspectBackup – die strenge Pipeline
// ---------------------------------------------------------------------------

export function inspectBackup(rawText: string): BackupInspection {
  const issues: BackupIssue[] = [];
  const notes: BackupIssue[] = [];

  if (typeof rawText !== 'string' || rawText.length === 0) {
    return { ok: false, issues: [{ code: 'empty_file', detail: 'Die Datei ist leer.' }] };
  }
  if (utf8ByteLength(rawText) > BACKUP_LIMITS.maxBytes) {
    return {
      ok: false,
      issues: [{ code: 'too_large', detail: `Die Datei ist größer als ${Math.round(BACKUP_LIMITS.maxBytes / 1024 / 1024)} MB.` }],
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    return { ok: false, issues: [{ code: 'invalid_json', detail: 'Die Datei ist keine gültige JSON-Datei.' }] };
  }

  if (!isPlainObject(parsed) || hasDangerousKeys(parsed)) {
    return { ok: false, issues: [{ code: 'not_a_backup', detail: 'Unerwartete Dateistruktur.' }] };
  }

  if (parsed.format !== FINANCE_BACKUP_FORMAT) {
    return { ok: false, issues: [{ code: 'wrong_format', detail: 'Das ist kein Finanz-Backup dieser App.' }] };
  }

  const version = parsed.version;
  if (typeof version !== 'number' || !SUPPORTED_BACKUP_VERSIONS.includes(version as 1 | 2)) {
    return {
      ok: false,
      issues: [
        {
          code: 'unsupported_version',
          detail: `Backup-Version ${String(version)} wird von dieser App-Version nicht unterstützt.`,
        },
      ],
    };
  }

  const data = parsed.data;
  if (!isPlainObject(data) || hasDangerousKeys(data)) {
    return { ok: false, issues: [{ code: 'missing_data', detail: 'Der Datenteil des Backups fehlt oder ist ungültig.' }] };
  }

  const rows: Record<BackupDomain, Row[]> = {
    categories: [],
    bankConnections: [],
    categoryRules: [],
    accounts: [],
    budgets: [],
    savingsGoals: [],
    goalContributions: [],
    recurringSeries: [],
    transactions: [],
  };
  const ids: Record<BackupDomain, Set<string>> = {
    categories: new Set(),
    bankConnections: new Set(),
    categoryRules: new Set(),
    accounts: new Set(),
    budgets: new Set(),
    savingsGoals: new Set(),
    goalContributions: new Set(),
    recurringSeries: new Set(),
    transactions: new Set(),
  };

  let totalRows = 0;

  for (const spec of DOMAIN_SPECS) {
    const raw = data[spec.key];
    if (raw === undefined || raw === null) continue; // Domäne im Backup weggelassen → ok
    if (!Array.isArray(raw)) {
      issues.push({ code: 'domain_not_array', domain: spec.key, detail: `„${spec.key}" ist keine Liste.` });
      continue;
    }
    if (raw.length > BACKUP_LIMITS.maxRowsPerDomain) {
      issues.push({ code: 'domain_too_many_rows', domain: spec.key, detail: `„${spec.key}" hat zu viele Einträge.` });
      continue;
    }
    totalRows += raw.length;
    if (totalRows > BACKUP_LIMITS.maxRowsTotal) {
      return { ok: false, issues: [{ code: 'too_many_rows', detail: 'Das Backup enthält insgesamt zu viele Einträge.' }] };
    }

    for (let index = 0; index < raw.length; index += 1) {
      const rawRow = raw[index];
      if (!isPlainObject(rawRow) || hasDangerousKeys(rawRow)) {
        issues.push({ code: 'row_not_object', domain: spec.key, detail: `${spec.key}[${index}] ist kein gültiges Objekt.` });
        continue;
      }
      const row = validateRow(spec, rawRow, index, issues);
      if (!row) continue;

      const id = row.id as string;
      if (ids[spec.key].has(id)) {
        issues.push({ code: 'duplicate_id', domain: spec.key, detail: `${spec.key}: doppelte ID „${id}".` });
        continue;
      }
      ids[spec.key].add(id);
      rows[spec.key].push(row);
    }
  }

  if (issues.length > 0) {
    return { ok: false, issues };
  }

  // -- Referenzielle Integrität --------------------------------------------
  // Fehlende PFLICHT-Eltern → fatal. Fehlende OPTIONALE Referenzen → auf null
  // bereinigt (nicht-fatal, als Note vermerkt).
  checkRequiredRef(rows.transactions, 'accountId', ids.accounts, 'transactions', issues);
  checkRequiredRef(rows.goalContributions, 'goalId', ids.savingsGoals, 'goalContributions', issues);
  checkRequiredRef(rows.categoryRules, 'categoryId', ids.categories, 'categoryRules', issues);

  if (issues.length > 0) {
    return { ok: false, issues };
  }

  sanitizeOptionalRef(rows.transactions, 'categoryId', ids.categories, 'transactions', notes);
  sanitizeOptionalRef(rows.budgets, 'categoryId', ids.categories, 'budgets', notes);
  sanitizeOptionalRef(rows.accounts, 'bankConnectionId', ids.bankConnections, 'accounts', notes);
  sanitizeOptionalRef(rows.savingsGoals, 'linkedAccountId', ids.accounts, 'savingsGoals', notes);

  const counts = Object.fromEntries(
    (Object.keys(rows) as BackupDomain[]).map((key) => [key, rows[key].length]),
  ) as Record<BackupDomain, number>;

  return {
    ok: true,
    backup: {
      formatVersion: version,
      createdAt: str(parsed.createdAt),
      appVersion: str(parsed.appVersion),
      rows,
    },
    counts,
    notes,
  };
}

function validateRow(
  spec: DomainSpec,
  rawRow: Record<string, unknown>,
  index: number,
  issues: BackupIssue[],
): Row | null {
  const out: Row = {};
  let rowOk = true;

  for (const field of [...spec.fields, ...SYNC_META_FIELDS]) {
    const value = rawRow[field.name];
    const missing = value === undefined || value === null;

    if (missing) {
      if (field.required) {
        issues.push({ code: 'missing_field', domain: spec.key, detail: `${spec.key}[${index}]: Feld „${field.name}" fehlt.` });
        rowOk = false;
      } else {
        out[field.name] = null;
      }
      continue;
    }

    switch (field.kind) {
      case 'id':
      case 'idRef': {
        if (typeof value !== 'string' || !ID_PATTERN.test(value)) {
          issues.push({ code: 'bad_id', domain: spec.key, detail: `${spec.key}[${index}]: „${field.name}" ist keine gültige ID.` });
          rowOk = false;
        } else {
          out[field.name] = value;
        }
        break;
      }
      case 'string': {
        if (typeof value !== 'string') {
          issues.push({ code: 'bad_string', domain: spec.key, detail: `${spec.key}[${index}]: „${field.name}" ist kein Text.` });
          rowOk = false;
        } else if (value.length > BACKUP_LIMITS.maxStringLength) {
          issues.push({ code: 'string_too_long', domain: spec.key, detail: `${spec.key}[${index}]: „${field.name}" ist zu lang.` });
          rowOk = false;
        } else {
          out[field.name] = value;
        }
        break;
      }
      case 'money': {
        if (!isSafeMoney(value)) {
          issues.push({
            code: 'bad_money',
            domain: spec.key,
            detail: `${spec.key}[${index}]: „${field.name}" ist kein gültiger ganzzahliger Betrag.`,
          });
          rowOk = false;
        } else {
          out[field.name] = value;
        }
        break;
      }
      case 'bool': {
        if (typeof value !== 'boolean') {
          issues.push({ code: 'bad_bool', domain: spec.key, detail: `${spec.key}[${index}]: „${field.name}" ist kein Wahrheitswert.` });
          rowOk = false;
        } else {
          out[field.name] = value ? 1 : 0;
        }
        break;
      }
      case 'timestamp': {
        if (!isIsoTimestamp(value)) {
          issues.push({ code: 'bad_timestamp', domain: spec.key, detail: `${spec.key}[${index}]: „${field.name}" ist kein gültiger Zeitstempel.` });
          rowOk = false;
        } else {
          out[field.name] = value;
        }
        break;
      }
      case 'currency': {
        if (typeof value !== 'string' || !CURRENCY_PATTERN.test(value)) {
          issues.push({ code: 'bad_currency', domain: spec.key, detail: `${spec.key}[${index}]: „${field.name}" ist kein 3-Buchstaben-Währungscode.` });
          rowOk = false;
        } else {
          out[field.name] = value;
        }
        break;
      }
      case 'enum': {
        if (typeof value !== 'string' || !field.enumValues?.includes(value)) {
          issues.push({ code: 'bad_enum', domain: spec.key, detail: `${spec.key}[${index}]: „${field.name}" hat einen unerwarteten Wert.` });
          rowOk = false;
        } else {
          out[field.name] = value;
        }
        break;
      }
    }
  }

  return rowOk ? out : null;
}

function checkRequiredRef(
  list: Row[],
  field: string,
  parents: Set<string>,
  domain: BackupDomain,
  issues: BackupIssue[],
): void {
  for (const row of list) {
    const ref = row[field];
    if (typeof ref === 'string' && !parents.has(ref)) {
      issues.push({
        code: 'broken_reference',
        domain,
        detail: `${domain}: „${field}" verweist auf einen nicht enthaltenen Eintrag („${ref}").`,
      });
      return;
    }
  }
}

function sanitizeOptionalRef(
  list: Row[],
  field: string,
  parents: Set<string>,
  domain: BackupDomain,
  notes: BackupIssue[],
): void {
  let cleaned = 0;
  for (const row of list) {
    const ref = row[field];
    if (typeof ref === 'string' && !parents.has(ref)) {
      row[field] = null;
      cleaned += 1;
    }
  }
  if (cleaned > 0) {
    notes.push({
      code: 'reference_sanitized',
      domain,
      detail: `${domain}: ${cleaned} ungültige „${field}"-Verweise wurden geleert.`,
    });
  }
}

// ---------------------------------------------------------------------------
// Restore-Plan – konservativer Merge, kein Blind-Replace
// ---------------------------------------------------------------------------

export type LocalRowMeta = { updatedAt: string | null; deletedAt: string | null };
export type LocalRowIndex = Record<BackupDomain, Map<string, LocalRowMeta>>;

export type DomainPlan = {
  create: number;
  update: number;
  skipOlder: number;
  skipUnchanged: number;
};

export type RestorePlan = {
  mode: 'merge';
  perDomain: Record<BackupDomain, DomainPlan>;
  /** IDs je Domäne, die tatsächlich geschrieben werden (create ∪ update). */
  writes: Record<BackupDomain, Set<string>>;
  totalWrites: number;
};

/**
 * LWW-Entscheidung, gespiegelt aus `shouldApplyIncomingRow`:
 * eine eingehende Zeile wird angewendet, außer sie ist ECHT älter als der
 * lokale Stand. Ein lokaler Tombstone zählt als lokaler Stand – ein altes
 * Backup belebt also nichts wieder, das bewusst gelöscht wurde.
 */
function backupWins(incomingUpdatedAt: string | null, local: LocalRowMeta): boolean {
  const localStamp = local.deletedAt ?? local.updatedAt ?? '1970-01-01T00:00:00.000Z';
  const incoming = incomingUpdatedAt ?? '1970-01-01T00:00:00.000Z';
  return incoming >= localStamp;
}

export function buildRestorePlan(backup: ParsedBackup, local: LocalRowIndex): RestorePlan {
  const perDomain = {} as Record<BackupDomain, DomainPlan>;
  const writes = {} as Record<BackupDomain, Set<string>>;
  let totalWrites = 0;

  for (const domain of RESTORE_ORDER) {
    const plan: DomainPlan = { create: 0, update: 0, skipOlder: 0, skipUnchanged: 0 };
    const write = new Set<string>();
    const localMap = local[domain] ?? new Map<string, LocalRowMeta>();

    for (const row of backup.rows[domain]) {
      const id = row.id as string;
      const existing = localMap.get(id);
      const incomingUpdatedAt = (row.updatedAt as string | null) ?? null;

      if (!existing) {
        plan.create += 1;
        write.add(id);
        continue;
      }
      if (!backupWins(incomingUpdatedAt, existing)) {
        plan.skipOlder += 1;
        continue;
      }
      if (
        existing.updatedAt &&
        incomingUpdatedAt &&
        incomingUpdatedAt === existing.updatedAt &&
        !existing.deletedAt
      ) {
        plan.skipUnchanged += 1;
        continue;
      }
      plan.update += 1;
      write.add(id);
    }

    perDomain[domain] = plan;
    writes[domain] = write;
    totalWrites += write.size;
  }

  return { mode: 'merge', perDomain, writes, totalWrites };
}

/** Kurzfassung für die Import-Vorschau. */
export function summarizeCounts(counts: Record<BackupDomain, number>): { domain: BackupDomain; label: string; count: number }[] {
  const labels: Record<BackupDomain, string> = {
    categories: 'Kategorien',
    bankConnections: 'Bankverbindungen',
    categoryRules: 'Kategorie-Regeln',
    accounts: 'Konten',
    budgets: 'Budgets',
    savingsGoals: 'Sparziele',
    goalContributions: 'Sparbeiträge',
    recurringSeries: 'Wiederkehrende Serien',
    transactions: 'Umsätze',
  };
  return RESTORE_ORDER.map((domain) => ({ domain, label: labels[domain], count: counts[domain] ?? 0 })).filter(
    (entry) => entry.count > 0,
  );
}
