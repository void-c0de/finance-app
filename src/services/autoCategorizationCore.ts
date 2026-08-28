/**
 * Reiner Kern der automatischen Kategorisierung — nur `import type`, kein
 * DB-Zugriff, keine Wert-Importe. Vollständig im Node-Testharness prüfbar
 * (`scripts/test-auto-categorization.mjs`).
 *
 * Prioritätskette (STREAM 5 — Finanz-Wahrheit):
 *
 *   manuelle Wahl  >  Nutzer-Regel (nach priority)  >  eingebaute Heuristik  >  Fallback
 *
 * Eine manuell gesetzte Kategorie wird hier NIE überschrieben. Die Aufrufer in
 * `autoCategorization.ts` normalisieren den Händlernamen (SEPA-Präfixe etc.)
 * bevor sie `resolveCategory` aufrufen.
 */
import type { CategoryRule, Transaction } from '../types/finance';

type CategorizationRule = {
  categoryId: string;
  terms: readonly string[];
};

/** Eingebaute Heuristik. Reihenfolge = Priorität. */
export const EXPENSE_RULES: readonly CategorizationRule[] = [
  { categoryId: 'cat-housing', terms: ['miete', 'hausverwaltung', 'vermieter'] },
  {
    categoryId: 'cat-groceries',
    terms: [
      'rewe',
      'edeka',
      'lidl',
      'aldi',
      'kaufland',
      'netto',
      'penny',
      'lebensmittel',
      'supermarkt',
      'bäckerei',
      'baeckerei',
    ],
  },
  {
    categoryId: 'cat-subscriptions',
    terms: ['spotify', 'netflix', 'disney', 'amazon prime', 'youtube premium', 'subscription', 'abo'],
  },
  {
    categoryId: 'cat-mobility',
    terms: [
      'tanken',
      'tankstelle',
      'shell',
      'aral',
      'esso',
      'total',
      'bahn',
      'deutsche bahn',
      'ticket',
      'parking',
      'parken',
    ],
  },
  { categoryId: 'cat-shopping', terms: ['amazon', 'zalando', 'otto', 'shopping', 'h&m', 'hm.com', 'zara'] },
  {
    categoryId: 'cat-telecom',
    terms: ['mobilfunk', 'vodafone', 'telekom', 'telefonica', 'o2', 'internet', 'dsl', 'handyvertrag'],
  },
  { categoryId: 'cat-utilities', terms: ['strom', 'energie', 'gas', 'wasser', 'nebenkosten', 'stadtwerke'] },
  {
    categoryId: 'cat-dining',
    terms: ['restaurant', 'café', 'cafe', 'lieferando', 'mcdonald', 'burger king', 'kfc', 'pizza'],
  },
  {
    categoryId: 'cat-health',
    terms: ['dm-drogerie', 'drogerie', 'rossmann', 'müller', 'mueller', 'apotheke', 'pharmacy'],
  },
];

export function normalizeSearchText(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLocaleLowerCase('de-DE')
    .trim();
}

export function ruleMatches(
  rule: CategoryRule,
  normalizedMerchant: string,
  normalizedDescription: string,
): boolean {
  const needle = normalizeSearchText(rule.matchValue);
  if (!needle) return false;

  switch (rule.matchType) {
    case 'merchant_equals':
      return normalizedMerchant === needle;
    case 'merchant_contains':
      return normalizedMerchant.includes(needle);
    case 'description_contains':
      return normalizedMerchant.includes(needle) || normalizedDescription.includes(needle);
    default:
      return false;
  }
}

export type CategoryResolution =
  | { kind: 'manual'; categoryId: string }
  | { kind: 'rule'; categoryId: string; ruleId: string }
  | { kind: 'auto'; categoryId: string };

/**
 * Deterministische Zuordnungs-Pipeline auf bereits normalisierten Texten.
 * Priorität: manual > user-rule > auto-heuristik > Fallback.
 */
export function resolveCategory(input: {
  categoryId: string | null | undefined;
  categorySource: Transaction['categorySource'] | null | undefined;
  direction: Transaction['direction'];
  normalizedMerchant: string;
  normalizedDescription: string;
  rules: readonly CategoryRule[];
}): CategoryResolution {
  const { categoryId, categorySource, direction, normalizedMerchant, normalizedDescription, rules } =
    input;

  // 1. Manuelle Wahl gewinnt IMMER.
  if (categorySource === 'manual' && categoryId) {
    return { kind: 'manual', categoryId };
  }

  // 2. Nutzer-Regeln nach Priorität (Aufrufer liefert bereits sortiert).
  for (const rule of rules) {
    if (!rule.enabled) continue;
    if (ruleMatches(rule, normalizedMerchant, normalizedDescription)) {
      return { kind: 'rule', categoryId: rule.categoryId, ruleId: rule.id };
    }
  }

  // 3. Eingebaute Heuristik.
  if (direction === 'income') {
    return { kind: 'auto', categoryId: 'cat-income' };
  }

  for (const heuristic of EXPENSE_RULES) {
    const matches = heuristic.terms.some(
      (term) => normalizedMerchant.includes(term) || normalizedDescription.includes(term),
    );
    if (matches) return { kind: 'auto', categoryId: heuristic.categoryId };
  }

  // 4. Fallback.
  return { kind: 'auto', categoryId: 'cat-other' };
}

/**
 * Darf `autoCategorizeTransactions` diese Transaktion anfassen?
 * - manuelle Kategorie: nie
 * - bereits sinnvoll automatisch (nicht Fallback): nein
 * - ohne Kategorie oder nur Fallback `cat-other`: ja
 */
export function isCategorizationCandidate(
  transaction: Pick<Transaction, 'categoryId' | 'categorySource'>,
): boolean {
  if (transaction.categorySource === 'manual' && transaction.categoryId) return false;
  return !transaction.categoryId || transaction.categoryId === 'cat-other';
}
