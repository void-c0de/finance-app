import type {
  BankAccount,
  Budget,
  Category,
  SavingsGoal,
  Transaction,
} from '../types/finance';
import type { RecurringItem } from './recurringInsightsCore';

/**
 * Reiner Export-Kern. Erzeugt CSV-Text ohne jede Fließkomma-Geldmathematik.
 *
 * Datenschutz: enthält NUR nutzereigene Finanzdaten. Keine Tokens, Sessions,
 * Provider-Zugänge, geheimen IDs oder Debug-Daten. Der Aufrufer ist dafür
 * verantwortlich, die Datei nicht automatisch irgendwohin hochzuladen.
 */

/** Minor-Units als schlichter Dezimalstring, rein ganzzahlig gerechnet. */
export function minorToPlain(minor: number, fractionDigits = 2): string {
  const value = Math.trunc(minor);
  const negative = value < 0;
  const digits = String(Math.abs(value)).padStart(fractionDigits + 1, '0');
  const cut = digits.length - fractionDigits;
  const body = fractionDigits > 0 ? `${digits.slice(0, cut)}.${digits.slice(cut)}` : digits;
  return negative ? `-${body}` : body;
}

/** RFC-4180-konformes Feld: quoten bei Komma, Anführungszeichen oder Zeilenumbruch. */
export function csvCell(value: string | number | null | undefined): string {
  const text = value === null || value === undefined ? '' : String(value);
  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export function toCsv(headers: readonly string[], rows: readonly (readonly (string | number | null | undefined)[])[]): string {
  const lines = [headers.map(csvCell).join(',')];
  for (const row of rows) {
    lines.push(row.map(csvCell).join(','));
  }
  // \r\n + führende BOM, damit Excel deutsche Umlaute korrekt liest.
  return `﻿${lines.join('\r\n')}\r\n`;
}

export type ExportLookup = {
  categoryName: (id: string | null | undefined) => string;
  accountName: (id: string | null | undefined) => string;
};

export function buildExportLookup(
  categories: readonly Category[],
  accounts: readonly BankAccount[],
): ExportLookup {
  const categoryMap = new Map(categories.map((category) => [category.id, category.name]));
  const accountMap = new Map(accounts.map((account) => [account.id, account.name]));
  return {
    categoryName: (id) => (id ? categoryMap.get(id) ?? '' : ''),
    accountName: (id) => (id ? accountMap.get(id) ?? '' : ''),
  };
}

const DIRECTION_LABEL: Record<string, string> = {
  income: 'Einnahme',
  expense: 'Ausgabe',
};

const STATUS_LABEL: Record<string, string> = {
  booked: 'gebucht',
  pending: 'vorgemerkt',
  unknown: 'unbekannt',
};

export function buildTransactionsCsv(
  transactions: readonly Transaction[],
  lookup: ExportLookup,
): string {
  const headers = [
    'Datum',
    'Empfänger/Beschreibung',
    'Betrag',
    'Währung',
    'Richtung',
    'Kategorie',
    'Konto',
    'Wiederkehrend',
    'Interne Umbuchung',
    'Buchungsstatus',
  ];
  const rows = [...transactions]
    .sort((left, right) => right.bookingDate.localeCompare(left.bookingDate))
    .map((transaction) => [
      transaction.bookingDate.slice(0, 10),
      transaction.counterpartyName ?? transaction.description ?? '',
      minorToPlain(
        transaction.direction === 'expense' ? -Math.abs(transaction.amountMinor) : Math.abs(transaction.amountMinor),
      ),
      transaction.currency,
      DIRECTION_LABEL[transaction.direction] ?? transaction.direction,
      lookup.categoryName(transaction.categoryId),
      lookup.accountName(transaction.accountId),
      transaction.isRecurring ? 'ja' : 'nein',
      transaction.isInternalTransfer ? 'ja' : 'nein',
      STATUS_LABEL[transaction.bookingStatus] ?? transaction.bookingStatus,
    ]);
  return toCsv(headers, rows);
}

export function buildBudgetsCsv(
  budgets: readonly Budget[],
  lookup: ExportLookup,
): string {
  const headers = ['Kategorie', 'Name', 'Monatslimit', 'Zeitraum'];
  const rows = budgets.map((budget) => [
    lookup.categoryName(budget.categoryId) || budget.name,
    budget.name,
    minorToPlain(budget.amountMinor),
    budget.period,
  ]);
  return toCsv(headers, rows);
}

export function buildSavingsGoalsCsv(goals: readonly SavingsGoal[]): string {
  const headers = ['Name', 'Zielbetrag', 'Aktueller Betrag', 'Währung', 'Zieldatum', 'Modus', 'Status'];
  const rows = goals.map((goal) => [
    goal.name,
    minorToPlain(goal.targetAmountMinor),
    minorToPlain(goal.currentAmountMinor),
    goal.currency,
    goal.targetDate ?? '',
    goal.trackingMode,
    goal.status,
  ]);
  return toCsv(headers, rows);
}

export function buildRecurringCsv(items: readonly RecurringItem[]): string {
  const headers = [
    'Bezeichnung',
    'Art',
    'Richtung',
    'Konfidenz',
    'Bestätigt',
    'Rhythmus',
    'Letzter Betrag',
    'Monatlich (geschätzt)',
    'Währung',
    'Letzte Zahlung',
    'Nächste erwartet',
  ];
  const rows = items.map((item) => [
    item.title,
    item.kind,
    item.direction === 'expense' ? 'Ausgabe' : 'Einnahme',
    item.confidence,
    item.userConfirmed ? 'ja' : 'nein',
    item.cadence,
    minorToPlain(item.amountMinor),
    minorToPlain(item.monthlyEstimateMinor),
    item.currency,
    item.lastDate,
    item.nextDate,
  ]);
  return toCsv(headers, rows);
}

export type ExportKind = 'transactions' | 'budgets' | 'savings_goals' | 'recurring';

export const EXPORT_KIND_LABEL: Record<ExportKind, string> = {
  transactions: 'Umsätze',
  budgets: 'Budgets',
  savings_goals: 'Sparziele',
  recurring: 'Wiederkehrende Zahlungen',
};

/** Dateiname mit Zeitstempel, ohne Sonderzeichen. */
export function exportFileName(kind: ExportKind, referenceDate = new Date()): string {
  const stamp = referenceDate.toISOString().slice(0, 10);
  return `finance-${kind}-${stamp}.csv`;
}
