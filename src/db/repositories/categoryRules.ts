import {
    getDatabase,
} from '@/db/database';

import type {
    CategoryRule,

    CategoryRuleMatchType,
} from '@/types/finance';

type RuleRow = {
  id:
    string;

  name:
    string;

  match_type:
    string;

  match_value:
    string;

  category_id:
    string;

  enabled:
    number;

  priority:
    number;

  created_at:
    string;

  updated_at:
    string;

  deleted_at:
    string | null;
};

function mapRow(
  row: RuleRow
): CategoryRule {
  return {
    id: row.id,

    name: row.name,

    matchType:
      row.match_type as CategoryRuleMatchType,

    matchValue:
      row.match_value,

    categoryId:
      row.category_id,

    enabled:
      row.enabled === 1,

    priority:
      row.priority,

    createdAt:
      row.created_at,

    updatedAt:
      row.updated_at,

    deletedAt:
      row.deleted_at ?? undefined,
  };
}

/**
 * Alle aktiven (nicht gelöschten) Regeln,
 * sortiert nach Priorität dann Alter -
 * deterministische Reihenfolge für die Engine.
 */
export async function getCategoryRules(
  includeDisabled =
    true,
): Promise<CategoryRule[]> {
  const db =
    await getDatabase();

  const rows =
    await db.getAllAsync<RuleRow>(
      `
        SELECT *
        FROM category_rules
        WHERE deleted_at IS NULL
        ORDER BY priority ASC, created_at ASC;
      `,
    );

  return rows
    .map(mapRow)
    .filter(
      (rule) =>
        includeDisabled || rule.enabled,
    );
}

export async function createCategoryRule(
  rule: Omit<
    CategoryRule,
    'createdAt' | 'updatedAt' | 'deletedAt'
  > & {
    createdAt?: string;
  },
): Promise<void> {
  const db =
    await getDatabase();

  await db.runAsync(
    `
      INSERT INTO category_rules (
        id, name, match_type, match_value,
        category_id, enabled, priority,
        created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);
    `,

    rule.id,

    rule.name,

    rule.matchType,

    rule.matchValue,

    rule.categoryId,

    rule.enabled ? 1 : 0,

    rule.priority,

    rule.createdAt ??
      new Date().toISOString(),

    new Date().toISOString(),
  );
}

export async function setCategoryRuleEnabled(
  ruleId:
    string,

  enabled:
    boolean,
): Promise<void> {
  const db =
    await getDatabase();

  await db.runAsync(
    `
      UPDATE category_rules
      SET enabled = ?
      WHERE id = ?;
    `,

    enabled ? 1 : 0,

    ruleId,
  );
}

/**
 * Tombstone-Delete: Zeile bleibt lokal +
 * remote bestehen, deleted_at propagiert.
 */
export async function deleteCategoryRule(
  ruleId:
    string,
): Promise<void> {
  const db =
    await getDatabase();

  await db.runAsync(
    `
      UPDATE category_rules
      SET deleted_at = ?
      WHERE id = ?;
    `,

    new Date().toISOString(),

    ruleId,
  );
}
