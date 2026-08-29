import {
    getDatabase,
} from '@/db/database';

import type {
    Category,
} from '@/types/finance';

export const DEFAULT_CATEGORIES:
readonly Category[] = [
  {
    id:
      'cat-income',

    name:
      'Einnahmen',

    icon:
      '↑',

    isIncomeCategory:
      true,
  },

  {
    id:
      'cat-housing',

    name:
      'Wohnen',

    icon:
      '⌂',

    isIncomeCategory:
      false,
  },

  {
    id:
      'cat-groceries',

    name:
      'Lebensmittel',

    icon:
      '◈',

    isIncomeCategory:
      false,
  },

  {
    id:
      'cat-subscriptions',

    name:
      'Abos & Dienste',

    icon:
      '↻',

    isIncomeCategory:
      false,
  },

  {
    id:
      'cat-mobility',

    name:
      'Mobilität',

    icon:
      '⇢',

    isIncomeCategory:
      false,
  },

  {
    id:
      'cat-shopping',

    name:
      'Shopping',

    icon:
      '▣',

    isIncomeCategory:
      false,
  },

  {
    id:
      'cat-telecom',

    name:
      'Mobilfunk & Internet',

    icon:
      '≈',

    isIncomeCategory:
      false,
  },

  {
    id:
      'cat-utilities',

    name:
      'Energie & Nebenkosten',

    icon:
      'ϟ',

    isIncomeCategory:
      false,
  },

  {
    id:
      'cat-dining',

    name:
      'Essen & Ausgehen',

    icon:
      '◔',

    isIncomeCategory:
      false,
  },

  {
    id:
      'cat-health',

    name:
      'Gesundheit & Drogerie',

    icon:
      '✚',

    isIncomeCategory:
      false,
  },

  {
    id:
      'cat-other',

    name:
      'Sonstiges',

    icon:
      '⋯',

    isIncomeCategory:
      false,
  },
];

type CategoryRow = {
  id:
    string;

  name:
    string;

  icon:
    string | null;

  is_income_category:
    number;
};

function mapCategoryRow(
  row:
    CategoryRow
): Category {
  return {
    id:
      row.id,

    name:
      row.name,

    icon:
      row.icon ??
      undefined,

    isIncomeCategory:
      row.is_income_category ===
      1,
  };
}

/**
 * Frühere Icon-Glyphen der Standardkategorien. Wenn eine Standardkategorie noch
 * exakt eine dieser (nie vom Nutzer gewählten) Glyphen trägt, wird sie beim
 * nächsten Start leise auf das aktuelle, klarere Symbol gehoben. Nutzer­eigene
 * Icons bleiben unangetastet.
 */
const LEGACY_DEFAULT_ICONS: Record<string, readonly string[]> = {
  'cat-income': ['↓'],
  'cat-groceries': ['●'],
  'cat-mobility': ['→'],
  'cat-shopping': ['◇'],
  'cat-telecom': ['⌁'],
  'cat-dining': ['○'],
  'cat-health': ['+'],
  'cat-other': ['·'],
};

export async function ensureDefaultCategories():
Promise<void> {
  const db =
    await getDatabase();

  await db.withTransactionAsync(
    async () => {
      for (
        const category
        of DEFAULT_CATEGORIES
      ) {
        await db.runAsync(
          `
            INSERT OR IGNORE INTO categories (
              id,
              name,
              icon,
              is_income_category
            )
            VALUES (?, ?, ?, ?);
          `,

          category.id,

          category.name,

          category.icon ??
            null,

          category.isIncomeCategory
            ? 1
            : 0
        );

        const legacy = LEGACY_DEFAULT_ICONS[category.id];
        if (legacy && category.icon) {
          await db.runAsync(
            `UPDATE categories
               SET icon = ?
             WHERE id = ?
               AND deleted_at IS NULL
               AND icon IN (${legacy.map(() => '?').join(', ')});`,
            category.icon,
            category.id,
            ...legacy,
          );
        }
      }
    }
  );
}

export async function getCategories():
Promise<Category[]> {
  const db =
    await getDatabase();

  const rows =
    await db.getAllAsync<
      CategoryRow
    >(`
      SELECT
        id,
        name,
        icon,
        is_income_category
      FROM categories WHERE deleted_at IS NULL
      ORDER BY
        is_income_category DESC,
        name ASC;
    `);

  return rows.map(
    mapCategoryRow
  );
}