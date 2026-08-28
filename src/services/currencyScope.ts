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

/** Gleiche Währung (case-insensitiv, getrimmt). Leere Codes gelten als ungleich. */
export function sameCurrency(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = norm(a);
  const y = norm(b);
  return x.length > 0 && x === y;
}

/**
 * Budgets sind (noch) implizit in der Basiswährung denominiert — es gibt kein
 * `currency`-Feld auf `Budget`. Diese Funktion ist die EINE Stelle, an der das
 * steht; ein späteres Feld würde nur hier eingehängt.
 */
export function budgetCurrency(): string {
  return FINANCE_BASE_CURRENCY;
}

/** Zählt dieser Umsatz gegen ein Budget in `budgetCur`? Nur bei Währungsgleichheit. */
export function transactionCountsForBudget(
  transactionCurrency: string | null | undefined,
  budgetCur: string = FINANCE_BASE_CURRENCY,
): boolean {
  return sameCurrency(transactionCurrency, budgetCur);
}

/** Darf eine Regel-Transaktion einen Beitrag zu einem Ziel dieser Währung erzeugen? */
export function goalRuleAcceptsTransaction(
  goalCurrency: string | null | undefined,
  transactionCurrency: string | null | undefined,
): boolean {
  return sameCurrency(goalCurrency, transactionCurrency);
}

export type GoalLinkCheck = { ok: boolean; reason?: string };

/**
 * Darf ein Sparziel mit `goalCurrency` an ein Konto mit `accountCurrency`
 * gekoppelt werden? Ohne FX-Umrechnung nur bei gleicher Währung.
 */
export function canLinkAccountToGoal(
  goalCurrency: string | null | undefined,
  accountCurrency: string | null | undefined,
): GoalLinkCheck {
  if (!norm(accountCurrency)) {
    return { ok: false, reason: 'Das Konto hat keine erkennbare Währung.' };
  }
  if (sameCurrency(goalCurrency, accountCurrency)) {
    return { ok: true };
  }
  return {
    ok: false,
    reason: `Das Ziel ist in ${norm(goalCurrency) || FINANCE_BASE_CURRENCY}, das Konto in ${norm(
      accountCurrency,
    )}. Ohne Währungsumrechnung lässt sich der Kontostand nicht als Fortschritt übernehmen.`,
  };
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
