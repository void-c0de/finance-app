import type { BankAccount, Transaction } from '../types/finance';

/**
 * Währungs-Geltungsbereich.
 *
 * Die App rechnet in EINER Basiswährung (EUR). Konten und Umsätze in anderen
 * Währungen werden NICHT in dieselbe Summe geworfen (das wäre eine falsche
 * Zahl), sondern getrennt ausgewiesen. Es gibt bewusst KEINE eingebaute
 * Währungsumrechnung mit statischen/erfundenen Kursen.
 *
 * Rein & testbar (nur `import type`).
 */

export const FINANCE_BASE_CURRENCY = 'EUR';

function norm(code: string | null | undefined): string {
  return (code ?? '').toUpperCase().trim();
}

/** Nur Umsätze in der Basiswährung – für belastbare Einnahmen/Ausgaben/Cashflow. */
export function baseCurrencyTransactions(
  transactions: readonly Transaction[],
  base: string = FINANCE_BASE_CURRENCY,
): Transaction[] {
  const b = norm(base);
  return transactions.filter((transaction) => norm(transaction.currency) === b);
}

/** Konten, die NICHT in der Basiswährung geführt werden. */
export function foreignCurrencyAccounts(
  accounts: readonly BankAccount[],
  base: string = FINANCE_BASE_CURRENCY,
): BankAccount[] {
  const b = norm(base);
  return accounts.filter((account) => norm(account.currency) !== b && norm(account.currency) !== '');
}

export type ForeignCurrencySummary = {
  hasForeign: boolean;
  /** Distinkte Fremdwährungscodes, alphabetisch. */
  currencies: string[];
  accountCount: number;
};

export function foreignCurrencySummary(
  accounts: readonly BankAccount[],
  base: string = FINANCE_BASE_CURRENCY,
): ForeignCurrencySummary {
  const foreign = foreignCurrencyAccounts(accounts, base);
  const currencies = [...new Set(foreign.map((account) => norm(account.currency)))].sort();
  return { hasForeign: foreign.length > 0, currencies, accountCount: foreign.length };
}

/** Ein-Satz-Hinweis für die UI, wenn Fremdwährungskonten existieren. */
export function foreignCurrencyNote(summary: ForeignCurrencySummary): string | null {
  if (!summary.hasForeign) return null;
  const list = summary.currencies.join(', ');
  return `Konten in ${list} werden separat geführt und nicht in die Summen in ${FINANCE_BASE_CURRENCY} eingerechnet.`;
}
