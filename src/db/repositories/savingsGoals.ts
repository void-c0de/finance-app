import * as Crypto from 'expo-crypto';

import {
    minorUnitsToMajorNumber,
} from '@/core/money';

import {
    getDatabase,
} from '@/db/database';

import type {
    GoalContribution,

    GoalContributionSource,

    SavingsGoal,

    SavingsGoalStatus,

    SavingsGoalTrackingMode,
} from '@/types/finance';

type GoalRow = {
  id:
    string;

  name:
    string;

  description:
    string | null;

  target_amount_minor:
    number;

  current_amount_minor:
    number;

  starting_amount_minor:
    number;

  currency:
    string;

  target_date:
    string | null;

  linked_account_id:
    string | null;

  rule_keyword:
    string | null;

  tracking_mode:
    string;

  status:
    string;

  created_at:
    string | null;

  updated_at:
    string | null;

  deleted_at:
    string | null;
};

type ContributionRow = {
  id:
    string;

  goal_id:
    string;

  amount_minor:
    number;

  source:
    string;

  source_transaction_id:
    string | null;

  note:
    string | null;

  occurred_at:
    string;

  created_at:
    string | null;

  updated_at:
    string | null;

  deleted_at:
    string | null;
};

function mapGoalRow(
  row: GoalRow
): SavingsGoal {
  return {
    id:
      row.id,

    name:
      row.name,

    description:
      row.description ??
      undefined,

    targetAmountMinor:
      row.target_amount_minor,

    currentAmountMinor:
      row.current_amount_minor,

    startingAmountMinor:
      row.starting_amount_minor,

    currency:
      row.currency,

    targetDate:
      row.target_date ??
      undefined,

    linkedAccountId:
      row.linked_account_id ??
      undefined,

    ruleKeyword:
      row.rule_keyword ??
      undefined,

    trackingMode:
      row.tracking_mode as
        SavingsGoalTrackingMode,

    status:
      row.status as
        SavingsGoalStatus,

    createdAt:
      row.created_at ??
      '',

    updatedAt:
      row.updated_at ??
      '',

    deletedAt:
      row.deleted_at ??
      undefined,
  };
}

function mapContributionRow(
  row: ContributionRow
): GoalContribution {
  return {
    id:
      row.id,

    goalId:
      row.goal_id,

    amountMinor:
      row.amount_minor,

    source:
      row.source as
        GoalContributionSource,

    sourceTransactionId:
      row.source_transaction_id ??
      undefined,

    note:
      row.note ??
      undefined,

    occurredAt:
      row.occurred_at,

    createdAt:
      row.created_at ??
      '',

    updatedAt:
      row.updated_at ??
      '',

    deletedAt:
      row.deleted_at ??
      undefined,
  };
}

/*
 * Fortschritt ist immer abgeleitet:
 * Startbetrag + Summe aktiver Beitraege.
 * Keine manuell pflegbare Phantom-Summe.
 */
async function recomputeGoalProgress(
  db:
    | Awaited<ReturnType<typeof getDatabase>>
    | null = null,
): Promise<void> {
  const database =
    db ??
    (await getDatabase());

  await database.runAsync(`
    UPDATE savings_goals
    SET current_amount_minor =
      starting_amount_minor +
      COALESCE(
        (
          SELECT SUM(amount_minor)
          FROM goal_contributions
          WHERE goal_contributions.goal_id = savings_goals.id
            AND goal_contributions.deleted_at IS NULL
        ),
        0
      )
    WHERE deleted_at IS NULL
      AND current_amount_minor <>
        starting_amount_minor +
        COALESCE(
          (
            SELECT SUM(amount_minor)
            FROM goal_contributions
            WHERE goal_contributions.goal_id = savings_goals.id
              AND goal_contributions.deleted_at IS NULL
          ),
          0
        );
  `);
}

/**
 * Alle aktiven Sparziele (ohne Tombstones),
 * Fortschritt frisch abgeleitet aus der
 * Beitrags-Historie.
 */
export async function getActiveGoals():
Promise<SavingsGoal[]> {
  const db =
    await getDatabase();

  await recomputeGoalProgress(
    db
  );

  const rows =
    await db.getAllAsync<GoalRow>(`
      SELECT
        id,
        name,
        description,
        target_amount_minor,
        current_amount_minor,
        starting_amount_minor,
        currency,
        target_date,
        linked_account_id,
        rule_keyword,
        tracking_mode,
        status,
        created_at,
        updated_at,
        deleted_at
      FROM savings_goals
      WHERE deleted_at IS NULL
        AND status = 'active'
      ORDER BY
        CASE
          WHEN target_date IS NULL THEN 1
          ELSE 0
        END ASC,
        target_date ASC,
        name COLLATE NOCASE ASC;
    `);

  return rows.map(
    mapGoalRow
  );
}

export async function getGoalById(
  id:
    string
): Promise<SavingsGoal | null> {
  const db =
    await getDatabase();

  const row =
    await db.getFirstAsync<GoalRow>(
      `
        SELECT
          id,
          name,
          description,
          target_amount_minor,
          current_amount_minor,
          starting_amount_minor,
          currency,
          target_date,
          linked_account_id,
          tracking_mode,
          status,
          created_at,
          updated_at,
          deleted_at
        FROM savings_goals
        WHERE id = ?
          AND deleted_at IS NULL;
      `,

      id,
    );

  if (!row) {
    return null;
  }

  return mapGoalRow(
    row,
  );
}

export async function createGoal(
  input: {
    name:
      string;

    targetAmountMinor:
      number;

    startingAmountMinor?:
      number;

    targetDate?:
      string;

    description?:
      string;

    currency?:
      string;
  }
): Promise<SavingsGoal> {
  const db =
    await getDatabase();

  const id =
    Crypto.randomUUID();

  const startingMinor =
    input.startingAmountMinor ??
    0;

  const currency =
    input.currency ??
    'EUR';

  /*
   * Legacy-Spalten (target_amount /
   * current_amount REAL NOT NULL ohne
   * Default) werden aus den Minor-Units
   * abgeleitet - gleiches Muster wie
   * budgets/transactions.
   */
  const legacyTarget =
    minorUnitsToMajorNumber(
      input.targetAmountMinor,
      currency,
    );

  const legacyCurrent =
    minorUnitsToMajorNumber(
      startingMinor,
      currency,
    );

  const now =
    new Date().toISOString();

  await db.runAsync(
    `
      INSERT INTO savings_goals (
        id,
        name,
        description,
        target_amount,
        target_amount_minor,
        current_amount,
        current_amount_minor,
        starting_amount_minor,
        currency,
        target_date,
        tracking_mode,
        status,
        created_at,
        updated_at
      )
      VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
        'manual', 'active', ?, ?
      );
    `,

    id,

    input.name,

    input.description ??
      null,

    legacyTarget,

    input.targetAmountMinor,

    legacyCurrent,

    startingMinor,

    startingMinor,

    currency,

    input.targetDate ??
      null,

    now,

    now,
  );

  const goal =
    await getGoalById(id);

  if (!goal) {
    throw new Error(
      `Sparziel ${id} konnte nach dem Anlegen nicht gelesen werden.`,
    );
  }

  return goal;
}

export async function updateGoal(
  id:
    string,

  fields: {
    name?:
      string;

    description?:
      string |
      null;

    targetAmountMinor?:
      number;

    targetDate?:
      string |
      null;

    currency?:
      string;

    /**
     * Stichwort fuer automatisches
     * Tracking. Leer/null schaltet
     * den Modus auf 'manual' zurueck.
     */
    ruleKeyword?:
      string |
      null;
  }
): Promise<void> {
  const db =
    await getDatabase();

  const assignments:
    string[] =
    [];

  const values:
    (
      | string
      | number
      | null
    )[] =
    [];

  if (
    fields.name !==
    undefined
  ) {
    assignments.push(
      'name = ?',
    );

    values.push(
      fields.name,
    );
  }

  if (
    fields.description !==
    undefined
  ) {
    assignments.push(
      'description = ?',
    );

    values.push(
      fields.description,
    );
  }

  if (
    fields.targetAmountMinor !==
    undefined
  ) {
    assignments.push(
      'target_amount_minor = ?',
    );

    values.push(
      fields.targetAmountMinor,
    );

    assignments.push(
      'target_amount = ?',
    );

    values.push(
      minorUnitsToMajorNumber(
        fields.targetAmountMinor,

        fields.currency ??
          'EUR',
      ),
    );
  }

  if (
    fields.targetDate !==
    undefined
  ) {
    assignments.push(
      'target_date = ?',
    );

    values.push(
      fields.targetDate,
    );
  }

  if (
    fields.ruleKeyword !==
    undefined
  ) {
    const keyword =
      fields.ruleKeyword?.trim() ||
      null;

    assignments.push(
      'rule_keyword = ?',
    );

    values.push(
      keyword,
    );

    assignments.push(
      'tracking_mode = ?',
    );

    values.push(
      keyword
        ? 'transaction_rule'

        : 'manual',
    );
  }

  if (
    assignments.length ===
    0
  ) {
    return;
  }

  /*
   * updated_at bewusst NICHT setzen -
   * der Trigger pflegt den Zeitstempel
   * und haelt die Sync-Reihenfolge
   * konsistent.
   */
  await db.runAsync(
    `
      UPDATE savings_goals
      SET ${assignments.join(', ')}
      WHERE id = ?
        AND deleted_at IS NULL;
    `,

    ...values,

    id,
  );
}

/**
 * Archivieren statt löschen:
 * Ziel verschwindet aus der aktiven
 * Planung, Historie bleibt erhalten
 * und synchronisiert weiter.
 */
export async function archiveGoal(
  id:
    string
): Promise<void> {
  const db =
    await getDatabase();

  await db.runAsync(
    `
      UPDATE savings_goals
      SET status = 'archived'
      WHERE id = ?
        AND deleted_at IS NULL;
    `,

    id,
  );
}

/**
 * Tombstone-Delete: Zeile bleibt lokal +
 * remote bestehen, deleted_at propagiert.
 */
export async function deleteGoal(
  id:
    string
): Promise<void> {
  const db =
    await getDatabase();

  await db.runAsync(
    `
      UPDATE savings_goals
      SET deleted_at = ?
      WHERE id = ?;
    `,

    new Date().toISOString(),

    id,
  );
}

/**
 * Existiert fuer dieses Ziel bereits ein
 * AKTIVER Beitraeg zu genau dieser
 * Transaktion? Grundlage der
 * Idempotenz beim automatischen
 * Tracking (Unique-Index aus v11
 * erzwingt das auch auf DB-Ebene).
 */
export async function hasActiveContributionForTransaction(
  goalId:
    string,

  sourceTransactionId:
    string,
): Promise<boolean> {
  const db =
    await getDatabase();

  const row =
    await db.getFirstAsync<{
      x:
        number;
    }>(
      `
        SELECT 1 AS x
        FROM goal_contributions
        WHERE goal_id = ?
          AND source_transaction_id = ?
          AND deleted_at IS NULL
        LIMIT 1;
      `,

      goalId,

      sourceTransactionId,
    );

  return Boolean(
    row,
  );
}

/**
 * Einzahlung/Entnahme als eigener,
 * pruefbarer Beitrags-Datensatz.
 * Negativer Betrag = Entnahme.
 */
export async function addContribution(
  input: {
    goalId:
      string;

    amountMinor:
      number;

    note?:
      string;

    source?:
      GoalContributionSource;

    sourceTransactionId?:
      string;

    occurredAt?:
      string;
  }
): Promise<GoalContribution> {
  const db =
    await getDatabase();

  const id =
    Crypto.randomUUID();

  const occurredAt =
    input.occurredAt ??
    new Date().toISOString();

  const now =
    new Date().toISOString();

  /*
   * created_at/updated_at sind lokal
   * NOT NULL ohne Default - der
   * AFTER-INSERT-Trigger kann eine
   * Constraint-Verletzung nicht mehr
   * retten. Deshalb explizit setzen.
   */
  await db.runAsync(
    `
      INSERT INTO goal_contributions (
        id,
        goal_id,
        amount_minor,
        source,
        source_transaction_id,
        note,
        occurred_at,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);
    `,

    id,

    input.goalId,

    input.amountMinor,

    input.source ??
      'manual',

    input.sourceTransactionId ??
      null,

    input.note ??
      null,

    occurredAt,

    now,

    now,
  );

  await recomputeGoalProgress(
    db,
  );

  const row =
    await db.getFirstAsync<ContributionRow>(
      `
        SELECT *
        FROM goal_contributions
        WHERE id = ?;
      `,

      id,
    );

  if (!row) {
    throw new Error(
      `Beitrag ${id} konnte nach dem Speichern nicht gelesen werden.`,
    );
  }

  return mapContributionRow(
    row,
  );
}

/**
 * Beitrag korrigieren/entfernen:
 * Tombstone statt Hard-Delete - der
 * Fortschritt wird danach neu abgeleitet,
 * die Historie bleibt remote nachvollziehbar.
 */
export async function deleteContribution(
  id:
    string
): Promise<void> {
  const db =
    await getDatabase();

  await db.runAsync(
    `
      UPDATE goal_contributions
      SET deleted_at = ?
      WHERE id = ?;
    `,

    new Date().toISOString(),

    id,
  );

  await recomputeGoalProgress(
    db,
  );
}

export async function listContributions(
  goalId:
    string
): Promise<GoalContribution[]> {
  const db =
    await getDatabase();

  const rows =
    await db.getAllAsync<ContributionRow>(
      `
        SELECT *
        FROM goal_contributions
        WHERE goal_id = ?
          AND deleted_at IS NULL
        ORDER BY
          occurred_at DESC,
          created_at DESC;
      `,

      goalId,
    );

  return rows.map(
    mapContributionRow
  );
}
