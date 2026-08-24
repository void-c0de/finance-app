import {
    setTransactionCategory,
} from '@/db/repositories/categorization';

import {
    normalizeMerchantName,
} from '@/services/merchantNormalization';

import type {
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

function buildTransactionSearchText(
  transaction: Transaction
): string {
  return normalizeSearchText(
    [
      normalizeMerchantName(
        transaction.counterpartyName
      ),

      normalizeMerchantName(
        transaction.description
      ),

      transaction.counterpartyIBAN ??
        '',
    ].join(' ')
  );
}

/**
 * Ermittelt lokal eine passende Kategorie.
 *
 * Diese Funktion verändert noch nichts
 * in SQLite.
 */
export function inferCategoryId(
  transaction: Transaction
): string {
  if (
    transaction.direction ===
    'income'
  ) {
    return 'cat-income';
  }

  const searchText =
    buildTransactionSearchText(
      transaction
    );

  for (
    const rule
    of EXPENSE_RULES
  ) {
    const matches =
      rule.terms.some(
        (term) => {
          const normalizedTerm =
            normalizeSearchText(
              term
            );

          return searchText.includes(
            normalizedTerm
          );
        }
      );

    if (matches) {
      return rule.categoryId;
    }
  }

  return 'cat-other';
}

/**
 * Kategorisiert alle bisher noch
 * unkategorisierten Umsätze.
 *
 * WICHTIG:
 *
 * Dieser benannte Export wird von
 * financeData.ts importiert:
 *
 * import {
 *   autoCategorizeTransactions
 * } from '@/services/autoCategorization';
 */
export async function autoCategorizeTransactions(
  transactions:
    readonly Transaction[]
): Promise<number> {
  let updatedCount = 0;

  for (
    const transaction
    of transactions
  ) {
    /*
     * Bestehende Kategorie niemals
     * automatisch überschreiben.
     *
     * Dadurch bleiben spätere manuelle
     * Änderungen des Nutzers erhalten.
     */
    if (
      transaction.categoryId
    ) {
      continue;
    }

    const categoryId =
      inferCategoryId(
        transaction
      );

    await setTransactionCategory(
      transaction.id,
      categoryId
    );

    updatedCount += 1;
  }

  return updatedCount;
}