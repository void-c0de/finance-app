import { setTransactionCategory } from '@/db/repositories/categorization';
import { getCategoryRules } from '@/db/repositories/categoryRules';
import {
  isCategorizationCandidate,
  normalizeSearchText,
  resolveCategory,
  type CategoryResolution,
} from '@/services/autoCategorizationCore';
import { normalizeMerchantName } from '@/services/merchantNormalization';
import type { CategoryRule, Transaction } from '@/types/finance';

export {
  EXPENSE_RULES,
  isCategorizationCandidate,
  normalizeSearchText,
  resolveCategory,
  ruleMatches,
} from '@/services/autoCategorizationCore';
export type { CategoryResolution } from '@/services/autoCategorizationCore';

/**
 * Normalisierter Händlername einer Transaktion — eine Quelle der Wahrheit für
 * Regel-Matching UND Anzeige.
 */
export function getNormalizedMerchant(transaction: Transaction): string {
  return normalizeMerchantName(transaction.counterpartyName ?? transaction.description);
}

/**
 * Deterministische Zuordnungs-Pipeline für eine Transaktion.
 * Priorität: manual > user-rule > auto-heuristik > Fallback.
 */
export function resolveCategoryAssignment(input: {
  transaction: Pick<
    Transaction,
    'categoryId' | 'categorySource' | 'counterpartyName' | 'description' | 'direction'
  >;
  rules: readonly CategoryRule[];
}): CategoryResolution {
  const { transaction, rules } = input;
  return resolveCategory({
    categoryId: transaction.categoryId,
    categorySource: transaction.categorySource,
    direction: transaction.direction,
    normalizedMerchant: normalizeSearchText(
      normalizeMerchantName(transaction.counterpartyName ?? transaction.description),
    ),
    normalizedDescription: normalizeSearchText(transaction.description ?? ''),
    rules,
  });
}

/**
 * Kategorisiert alle bisher noch unkategorisierten Umsätze bzw. solche, deren
 * aktuelle Kategorie dem Fallback entspricht (Regeln dürfen das Fallback
 * verbessern).
 *
 * WICHTIG: Manuelle Zuordnungen werden nie überschrieben.
 */
export async function autoCategorizeTransactions(
  transactions: readonly Transaction[],
): Promise<number> {
  let updatedCount = 0;

  let rules: readonly CategoryRule[] = [];
  try {
    rules = await getCategoryRules();
  } catch (error) {
    console.error('[CAT] Regeln konnten nicht geladen werden:', error);
  }

  for (const transaction of transactions) {
    if (!isCategorizationCandidate(transaction)) {
      continue;
    }

    const resolution = resolveCategoryAssignment({ transaction, rules });

    await setTransactionCategory(
      transaction.id,
      resolution.categoryId,
      resolution.kind === 'rule' ? 'rule' : 'auto',
    );

    updatedCount += 1;
  }

  return updatedCount;
}
