import * as Crypto from 'expo-crypto';

import {
    minorUnitsToMajorNumber,
} from '@/core/money';

import {
    getDatabase,
} from '@/db/database';

import type {
    Budget,
    BudgetPeriod,
} from '@/types/finance';

type BudgetRow = {
  id:
    string;

  category_id:
    string | null;

  name:
    string;

  amount_minor:
    number;

  period:
    string;
};

function mapBudgetRow(
  row:
    BudgetRow
): Budget {
  return {
    id:
      row.id,

    categoryId:
      row.category_id ??
      undefined,

    name:
      row.name,

    amountMinor:
      row.amount_minor,

    period:
      row.period as
        BudgetPeriod,
  };
}

export async function getBudgets():
Promise<Budget[]> {
  const db =
    await getDatabase();

  const rows =
    await db.getAllAsync<
      BudgetRow
    >(`
      SELECT
        id,
        category_id,
        name,
        amount_minor,
        period
      FROM budgets WHERE deleted_at IS NULL
      ORDER BY
        name ASC;
    `);

  return rows.map(
    mapBudgetRow
  );
}

export async function upsertMonthlyCategoryBudget(
  input: {
    categoryId:
      string;

    name:
      string;

    amountMinor:
      number;

    currency?:
      string;
  }
): Promise<Budget> {
  const db =
    await getDatabase();

  const currency =
    input.currency ??
    'EUR';

  const legacyAmount =
    minorUnitsToMajorNumber(
      input.amountMinor,
      currency
    );

  const existing =
    await db.getFirstAsync<
      BudgetRow
    >(
      `
        SELECT
          id,
          category_id,
          name,
          amount_minor,
          period
      FROM budgets
      WHERE deleted_at IS NULL
        AND category_id = ?
          AND period = 'monthly'
        LIMIT 1;
      `,

      input.categoryId
    );

  if (existing) {
    await db.runAsync(
      `
        UPDATE budgets
        SET
          name = ?,
          amount = ?,
          amount_minor = ?
        WHERE id = ?;
      `,

      input.name,

      legacyAmount,

      input.amountMinor,

      existing.id
    );

    return {
      id:
        existing.id,

      categoryId:
        input.categoryId,

      name:
        input.name,

      amountMinor:
        input.amountMinor,

      period:
        'monthly',
    };
  }

  const id =
    Crypto.randomUUID();

  await db.runAsync(
    `
      INSERT INTO budgets (
        id,
        category_id,
        name,
        amount,
        amount_minor,
        period
      )
      VALUES (
        ?,
        ?,
        ?,
        ?,
        ?,
        'monthly'
      );
    `,

    id,

    input.categoryId,

    input.name,

    legacyAmount,

    input.amountMinor
  );

  return {
    id,

    categoryId:
      input.categoryId,

    name:
      input.name,

    amountMinor:
      input.amountMinor,

    period:
      'monthly',
  };
}

export async function deleteBudget(
  id:
    string
): Promise<void> {
  const db =
    await getDatabase();

  await db.runAsync(
    `
      UPDATE budgets
      SET deleted_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      WHERE id = ?
        AND deleted_at IS NULL;
    `,

    id
  );
}
