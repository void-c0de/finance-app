/**
 * Reiner Kern des regelbasierten Sparziel-Trackings — nur `import type`.
 * Testbar über `scripts/test-savings-lifecycle.mjs`.
 */
import type { Transaction } from '../types/finance';

/** Gleiche Währung (case-insensitiv, getrimmt); leere Codes gelten als ungleich. */
function sameCurrency(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = (a ?? '').toUpperCase().trim();
  const y = (b ?? '').toUpperCase().trim();
  return x.length > 0 && x === y;
}

export type SavingsRule = {
  keyword: string;
  linkedAccountId?: string | null;
  /** Währung des Ziels. Nur währungsgleiche Eingänge erzeugen Beiträge (kein FX). */
  currency: string;
};

/**
 * Erzeugt dieser Umsatz einen Beitrag zu einem Regel-Ziel?
 * - nur gebuchte EINGÄNGE
 * - keine erkannten Eigenüberweisungen
 * - ggf. nur vom verknüpften Konto
 * - Stichwort in Beschreibung/Empfänger
 * - **gleiche Währung wie das Ziel**
 */
export function savingsRuleMatches(
  transaction: Pick<
    Transaction,
    | 'bookingStatus'
    | 'direction'
    | 'isInternalTransfer'
    | 'accountId'
    | 'description'
    | 'counterpartyName'
    | 'currency'
  >,
  rule: SavingsRule,
): boolean {
  if (transaction.bookingStatus === 'pending') return false;
  if (transaction.direction !== 'income') return false;
  if (transaction.isInternalTransfer) return false;
  if (rule.linkedAccountId && transaction.accountId !== rule.linkedAccountId) return false;
  if (!sameCurrency(rule.currency, transaction.currency)) return false;

  const keyword = rule.keyword.trim().toLowerCase();
  if (!keyword) return false;

  const haystack = `${transaction.description ?? ''} ${transaction.counterpartyName ?? ''}`.toLowerCase();
  return haystack.includes(keyword);
}
