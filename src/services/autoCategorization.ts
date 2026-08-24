import {
    setTransactionCategory,
} from '@/db/repositories/categorization';

import {
    getCategoryRules,
} from '@/db/repositories/categoryRules';

import {
    normalizeMerchantName,
} from '@/services/merchantNormalization';

import type {
    CategoryRule,

    Transaction,
} from '@/types/finance';

type CategorizationRule = {
  categoryId: string;

  terms: readonly string[];
};

const EXPENSE_RULES:
  readonly CategorizationRule[] = [
    {
      categoryId: 'cat-housing',

      terms: [
        'miete',
        'hausverwaltung',
        'vermieter',
      ],
    },

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

      terms: [
        'spotify',
        'netflix',
        'disney',
        'amazon prime',
        'youtube premium',
        'subscription',
        'abo',
      ],
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

    {
      categoryId: 'cat-shopping',

      terms: [
        'amazon',
        'zalando',
        'online-einkauf',
        'online einkauf',
        'shopping',
        'h&m',
        'hm.com',
        'zara',
      ],
    },

    {
      categoryId: 'cat-telecom',

      terms: [
        'mobilfunk',
        'vodafone',
        'telekom',
        'telefonica',
        'o2',
        'internet',
        'dsl',
        'handyvertrag',
      ],
    },

    {
      categoryId: 'cat-utilities',

      terms: [
        'strom',
        'energie',
        'gas',
        'wasser',
        'nebenkosten',
        'stadtwerke',
      ],
    },

    {
      categoryId: 'cat-dining',

      terms: [
        'restaurant',
        'café',
        'cafe',
        'lieferando',
        'mcdonald',
        'burger king',
        'kfc',
        'pizza',
      ],
    },

    {
      categoryId: 'cat-health',

      terms: [
        'dm-drogerie',
        'drogerie',
        'rossmann',
        'müller',
        'mueller',
        'apotheke',
        'pharmacy',
      ],
    },
  ];

function normalizeSearchText(
  value: string
): string {
  return value
    .normalize('NFKD')
    .replace(
      /[\u0300-\u036f]/g,
      ''
    )
    .toLocaleLowerCase(
      'de-DE'
    )
    .trim();
}

/**
 * Normalisierter Händlername einer
 * Transaktion - eine Quelle der Wahrheit
 * für Regel-Matching UND Anzeige.
 */
export function getNormalizedMerchant(
  transaction: Transaction
): string {
  return normalizeMerchantName(
    transaction.counterpartyName ??
      transaction.description
  );
}

function ruleMatches(
  rule:
    CategoryRule,

  normalizedMerchant:
    string,

  normalizedDescription:
    string,
): boolean {
  const needle =
    normalizeSearchText(
      rule.matchValue,
    );

  if (!needle) {
    return false;
  }

  switch (
    rule.matchType
  ) {
    case 'merchant_equals':
      return (
        normalizedMerchant ===
        needle
      );

    case 'merchant_contains':
      return normalizedMerchant.includes(
        needle
      );

    case 'description_contains':
      return (
        normalizedMerchant.includes(
          needle
        ) ||
        normalizedDescription.includes(
          needle
        )
      );

    default:
      return false;
  }
}

export type CategoryResolution =
  | {
      kind:
        'manual';

      categoryId:
        string;
    }
  | {
      kind:
        'rule';

      categoryId:
        string;

      ruleId:
        string;
    }
  | {
      kind:
        'auto';

      categoryId:
        string;
    };

/**
 * Deterministische Zuordnungs-Pipeline.
 *
 * Priorität:
 *   manual > user-rule > auto-heuristik
 *
 * Rein funktional und ohne DB-Zugriff -
 * vollständig testbar.
 */
export function resolveCategoryAssignment(
  input: {
    transaction:
      Pick<
        Transaction,
        | 'categoryId'
        | 'categorySource'
        | 'counterpartyName'
        | 'description'
        | 'direction'
      >;

    rules:
      readonly CategoryRule[];
  },
): CategoryResolution {
  const {
    transaction,
    rules,
  } =
    input;

  /*
   * 1. Manuelle Wahl gewinnt IMMER.
   */
  if (
    transaction.categorySource ===
      'manual' &&
    transaction.categoryId
  ) {
    return {
      kind: 'manual',

      categoryId:
        transaction.categoryId,
    };
  }

  const normalizedMerchant =
    normalizeSearchText(
      normalizeMerchantName(
        transaction.counterpartyName ??
          transaction.description
      ),
    );

  const normalizedDescription =
    normalizeSearchText(
      transaction.description ??
        '',
    );

  /*
   * 2. Nutzer-Regeln nach Priorität.
   */
  for (const rule of rules) {
    if (!rule.enabled) {
      continue;
    }

    if (
      ruleMatches(
        rule,
        normalizedMerchant,
        normalizedDescription,
      )
    ) {
      return {
        kind: 'rule',

        categoryId:
          rule.categoryId,

        ruleId: rule.id,
      };
    }
  }

  /*
   * 3. Eingebaute Heuristik.
   */
  if (
    transaction.direction ===
    'income'
  ) {
    return {
      kind: 'auto',

      categoryId: 'cat-income',
    };
  }

  for (
    const heuristic of EXPENSE_RULES
  ) {
    const matches =
      heuristic.terms.some((term) =>
        normalizedMerchant.includes(term) ||
        normalizedDescription.includes(term)
      );

    if (matches) {
      return {
        kind: 'auto',

        categoryId:
          heuristic.categoryId,
      };
    }
  }

  return {
    kind: 'auto',

    categoryId: 'cat-other',
  };
}

/**
 * Kategorisiert alle bisher noch
 * unkategorisierten Umsätze bzw. solche,
 * die noch nicht manuell festgelegt wurden
 * UND deren aktuelle Kategorie dem
 * Fallback entspricht (Regeln dürfen das
 * Fallback verbessern).
 *
 * WICHTIG:
 * Manuelle Zuordnungen werden nie
 * überschrieben.
 */
export async function autoCategorizeTransactions(
  transactions:
    readonly Transaction[]
): Promise<number> {
  let updatedCount = 0;

  let rules:
    readonly CategoryRule[] =
    [];

  try {
    rules =
      await getCategoryRules();
  } catch (error) {
    console.error(
      '[CAT] Regeln konnten nicht geladen werden:',
      error,
    );
  }

  for (
    const transaction
    of transactions
  ) {
    /*
     * Manuelle Zuordnungen sind unantastbar.
     */
    if (
      transaction.categorySource ===
        'manual' &&
      transaction.categoryId
    ) {
      continue;
    }

    /*
     * Bereits sinnvoll automatisch zugeordnet
     * (nicht Fallback): nur bei NULL erneut versuchen.
     */
    const isFallback =
      !transaction.categoryId ||
      transaction.categoryId ===
        'cat-other';

    if (
      !isFallback &&
      transaction.categoryId
    ) {
      continue;
    }

    const resolution =
      resolveCategoryAssignment({
        transaction,

        rules,
      });

    await setTransactionCategory(
      transaction.id,

      resolution.categoryId,

      resolution.kind === 'rule'
        ? 'rule'

        : 'auto',
    );

    updatedCount += 1;
  }

  return updatedCount;
}
