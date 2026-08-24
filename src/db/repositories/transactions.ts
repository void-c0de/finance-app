import * as Crypto from 'expo-crypto';

import {
    minorUnitsToMajorNumber,
} from '@/core/money';

import {
    getDatabase,
} from '@/db/database';

import type {
    ProviderTransaction,
} from '@/types/banking';

import type {
    Transaction,
    TransactionDirection,
} from '@/types/finance';

type TransactionRow = {
  id: string;

  account_id: string;

  external_transaction_id:
    string | null;

  amount_minor: number;

  currency: string;

  direction: string;

  booking_date: string;

  value_date:
    string | null;

  description: string;

  counterparty_name:
    string | null;

  counterparty_iban:
    string | null;

  category_id:
    string | null;

  is_recurring: number;

  created_at: string;
};

function mapTransactionRow(
  row: TransactionRow
): Transaction {
  return {
    id:
      row.id,

    accountId:
      row.account_id,

    externalTransactionId:
      row.external_transaction_id ??
      undefined,

    amountMinor:
      row.amount_minor,

    currency:
      row.currency,

    direction:
      row.direction as
        TransactionDirection,

    bookingDate:
      row.booking_date,

    valueDate:
      row.value_date ??
      undefined,

    description:
      row.description,

    counterpartyName:
      row.counterparty_name ??
      undefined,

    counterpartyIBAN:
      row.counterparty_iban ??
      undefined,

    categoryId:
      row.category_id ??
      undefined,

    isRecurring:
      row.is_recurring === 1,

    createdAt:
      row.created_at,
  };
}

export async function upsertProviderTransactions(
  accountId: string,
  transactions:
    readonly ProviderTransaction[]
): Promise<number> {
  const db =
    await getDatabase();

  const now =
    new Date().toISOString();

  let processedCount = 0;

  await db.withTransactionAsync(
    async () => {
      for (
        const transaction
        of transactions
      ) {
        const generatedId =
          Crypto.randomUUID();

        const legacyAmount =
          minorUnitsToMajorNumber(
            transaction.amountMinor,
            transaction.currency
          );

        await db.runAsync(
          `
            INSERT INTO transactions (
              id,
              account_id,
              external_transaction_id,
              amount,
              amount_minor,
              currency,
              direction,
              booking_date,
              value_date,
              description,
              counterparty_name,
              counterparty_iban,
              category_id,
              is_recurring,
              created_at
            )
            VALUES (
              ?,
              ?,
              ?,
              ?,
              ?,
              ?,
              ?,
              ?,
              ?,
              ?,
              ?,
              ?,
              NULL,
              ?,
              ?
            )
            ON CONFLICT (
              account_id,
              external_transaction_id
            )
            DO UPDATE SET
              amount =
                excluded.amount,

              amount_minor =
                excluded.amount_minor,

              currency =
                excluded.currency,

              direction =
                excluded.direction,

              booking_date =
                excluded.booking_date,

              value_date =
                excluded.value_date,

              description =
                excluded.description,

              counterparty_name =
                excluded.counterparty_name,

              counterparty_iban =
                excluded.counterparty_iban,

              is_recurring =
                excluded.is_recurring;
          `,
          generatedId,
          accountId,
          transaction.externalTransactionId,
          legacyAmount,
          transaction.amountMinor,
          transaction.currency,
          transaction.direction,
          transaction.bookingDate,
          transaction.valueDate ??
            null,
          transaction.description,
          transaction.counterpartyName ??
            null,
          transaction.counterpartyIBAN ??
            null,
          transaction.isRecurring
            ? 1
            : 0,
          now
        );

        processedCount += 1;
      }
    }
  );

  return processedCount;
}

export async function getTransactions(
  limit = 500
): Promise<Transaction[]> {
  const db =
    await getDatabase();

  const safeLimit =
    Math.max(
      1,
      Math.min(
        Math.trunc(limit),
        5000
      )
    );

  const rows =
    await db.getAllAsync<TransactionRow>(
      `
        SELECT
          id,
          account_id,
          external_transaction_id,
          amount_minor,
          currency,
          direction,
          booking_date,
          value_date,
          description,
          counterparty_name,
          counterparty_iban,
          category_id,
          is_recurring,
          created_at
        FROM transactions WHERE deleted_at IS NULL
        ORDER BY
          booking_date DESC,
          created_at DESC
        LIMIT ?;
      `,
      safeLimit
    );

  return rows.map(
    mapTransactionRow
  );
}

export async function getTransactionsForAccount(
  accountId: string,
  limit = 500
): Promise<Transaction[]> {
  const db =
    await getDatabase();

  const safeLimit =
    Math.max(
      1,
      Math.min(
        Math.trunc(limit),
        5000
      )
    );

  const rows =
    await db.getAllAsync<TransactionRow>(
      `
        SELECT
          id,
          account_id,
          external_transaction_id,
          amount_minor,
          currency,
          direction,
          booking_date,
          value_date,
          description,
          counterparty_name,
          counterparty_iban,
          category_id,
          is_recurring,
          created_at
        FROM transactions
        WHERE deleted_at IS NULL
          AND account_id = ?
        ORDER BY
          booking_date DESC,
          created_at DESC
        LIMIT ?;
      `,
      accountId,
      safeLimit
    );

  return rows.map(
    mapTransactionRow
  );
}