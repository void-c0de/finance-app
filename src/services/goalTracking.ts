import {
    debugLog,
} from '@/core/debugLog';

import {
    APP_ERROR_CODES,
} from '@/core/errorCodes';

import {
    getDatabase,
} from '@/db/database';

import {
    addContribution,

    hasActiveContributionForTransaction,
} from '@/db/repositories/savingsGoals';

import type {
    Transaction,
} from '@/types/finance';

type RuleGoalRow = {
  id:
    string;

  name:
    string;

  rule_keyword:
    string;

  linked_account_id:
    string | null;
};

function transactionMatchesRule(
  transaction:
    Transaction,

  goal:
    RuleGoalRow,

  keyword:
    string,
): boolean {
  if (
    transaction.bookingStatus ===
      'pending'
  ) {
    return false;
  }

  if (
    transaction.direction !==
      'income'
  ) {
    return false;
  }

  if (
    goal.linked_account_id &&
    transaction.accountId !==
      goal.linked_account_id
  ) {
    return false;
  }

  const haystack =
    `${transaction.description} ${transaction.counterpartyName ?? ''}`
      .toLowerCase();

  return haystack.includes(
    keyword,
  );
}

/**
 * M3 — Automatisches Sparziel-Tracking.
 *
 * Fuer jedes aktive Ziel mit
 * tracking_mode='transaction_rule'
 * erzeugen passende EINGEHENDE
 * Transaktionen genau EINEN Beitraeg
 * (source 'transaction').
 *
 * Idempotenz: Vor dem Insert wird auf
 * einen aktiven Beitraeg mit derselben
 * source_transaction_id geprueft; ein
 * Partial-Unique-Index (v11) erzwingt
 * das auf DB-Ebene. Mehrfaches Laufen
 * des Syncs erzeugt also nie Duplikate -
 * Voraussetzung fuer echten Bank-Sync.
 */
export async function applySavingsGoalRules(
  transactions:
    Transaction[],
): Promise<number> {
  if (
    transactions.length ===
    0
  ) {
    return 0;
  }

  let goals:
    RuleGoalRow[] =
    [];

  try {
    const db =
      await getDatabase();

    goals =
      await db.getAllAsync<RuleGoalRow>(
        `
          SELECT
            id,
            name,
            rule_keyword,
            linked_account_id
          FROM savings_goals
          WHERE deleted_at IS NULL
            AND status = 'active'
            AND tracking_mode = 'transaction_rule'
            AND rule_keyword IS NOT NULL;
        `,
      );
  } catch (error) {
    debugLog.error(
      'PLANNING',

      `${APP_ERROR_CODES.GOALS_TRACK_FAILED}: Regel-Ziele konnten nicht geladen werden`,

      error,
    );

    return 0;
  }

  if (
    goals.length ===
    0
  ) {
    return 0;
  }

  let created =
    0;

  for (
    const goal of
    goals
  ) {
    const keyword =
      goal.rule_keyword
        .trim()
        .toLowerCase();

    if (
      !keyword
    ) {
      continue;
    }

    for (
      const transaction of
      transactions
    ) {
      if (
        !transactionMatchesRule(
          transaction,

          goal,

          keyword,
        )
      ) {
        continue;
      }

      try {
        const alreadyTracked =
          await hasActiveContributionForTransaction(
            goal.id,

            transaction.id,
          );

        if (
          alreadyTracked
        ) {
          continue;
        }

        await addContribution({
          goalId:
            goal.id,

          amountMinor:
            transaction.amountMinor,

          source:
            'transaction',

          sourceTransactionId:
            transaction.id,

          note: `Auto · ${goal.rule_keyword.trim()}`,

          occurredAt: `${transaction.bookingDate}T12:00:00.000Z`,
        });

        created +=
          1;
      } catch (error) {
        debugLog.error(
          'PLANNING',

          `${APP_ERROR_CODES.GOALS_TRACK_FAILED}: Auto-Beitrag ${transaction.id} -> ${goal.id} fehlgeschlagen`,

          error,
        );
      }
    }
  }

  if (
    created >
    0
  ) {
    debugLog.info(
      'PLANNING',

      `Auto-Tracking: ${created} Beitraege aus ${transactions.length} Transaktionen erzeugt`,
    );
  }

  return created;
}
