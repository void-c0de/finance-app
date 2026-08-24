import * as Crypto from 'expo-crypto';

import {
    minorUnitsToMajorNumber,
} from '@/core/money';

import {
    getDatabase,
} from '@/db/database';

import type {
    ProviderAccount,
} from '@/types/banking';

import type {
    AccountType,
    BankAccount,
} from '@/types/finance';

type AccountRow = {
  id:
    string;

  bank_connection_id:
    string | null;

  provider_id:
    string;

  external_account_id:
    string;

  name:
    string;

  iban:
    string | null;

  currency:
    string;

  balance_minor:
    number;

  type:
    string;

  institution_name:
    string | null;

  last_synced_at:
    string | null;
};

export type UpsertProviderAccountInput = {
  connectionId:
    string;

  providerId:
    string;

  account:
    ProviderAccount;

  syncedAt:
    string;
};

function mapAccountRow(
  row:
    AccountRow
): BankAccount {
  return {
    id:
      row.id,

    bankConnectionId:
      row.bank_connection_id ??
      undefined,

    providerId:
      row.provider_id,

    externalAccountId:
      row.external_account_id,

    name:
      row.name,

    iban:
      row.iban ??
      undefined,

    currency:
      row.currency,

    balanceMinor:
      row.balance_minor,

    type:
      row.type as
        AccountType,

    institutionName:
      row.institution_name ??
      undefined,

    lastSyncedAt:
      row.last_synced_at ??
      undefined,
  };
}

export async function upsertProviderAccount(
  input:
    UpsertProviderAccountInput
): Promise<BankAccount> {
  const db =
    await getDatabase();

  const generatedId =
    Crypto.randomUUID();

  const legacyBalance =
    minorUnitsToMajorNumber(
      input.account.balanceMinor,
      input.account.currency
    );

  await db.runAsync(
    `
      INSERT INTO accounts (
        id,
        bank_connection_id,
        provider_id,
        external_account_id,
        name,
        iban,
        currency,
        balance,
        balance_minor,
        type,
        institution_name,
        last_synced_at
      )
      VALUES (
        ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?
      )
      ON CONFLICT (
        provider_id,
        external_account_id
      )
      DO UPDATE SET
        bank_connection_id =
          excluded.bank_connection_id,

        name =
          excluded.name,

        iban =
          excluded.iban,

        currency =
          excluded.currency,

        balance =
          excluded.balance,

        balance_minor =
          excluded.balance_minor,

        type =
          excluded.type,

        institution_name =
          excluded.institution_name,

        last_synced_at =
          excluded.last_synced_at;
    `,

    generatedId,

    input.connectionId,

    input.providerId,

    input.account
      .externalAccountId,

    input.account.name,

    input.account.iban ??
      null,

    input.account.currency,

    legacyBalance,

    input.account.balanceMinor,

    input.account.type,

    input.account
      .institutionName ??
      null,

    input.syncedAt
  );

  const row =
    await db.getFirstAsync<
      AccountRow
    >(
      `
        SELECT
          id,
          bank_connection_id,
          provider_id,
          external_account_id,
          name,
          iban,
          currency,
          balance_minor,
          type,
          institution_name,
          last_synced_at
        FROM accounts
        WHERE deleted_at IS NULL
          AND provider_id = ?
          AND external_account_id = ?
        LIMIT 1;
      `,

      input.providerId,

      input.account
        .externalAccountId
    );

  if (!row) {
    throw new Error(
      'Account could not be loaded after upsert.'
    );
  }

  return mapAccountRow(
    row
  );
}

export async function getAccounts():
Promise<BankAccount[]> {
  const db =
    await getDatabase();

  const rows =
    await db.getAllAsync<
      AccountRow
    >(`
      SELECT
        id,
        bank_connection_id,
        provider_id,
        external_account_id,
        name,
        iban,
        currency,
        balance_minor,
        type,
        institution_name,
        last_synced_at
      FROM accounts WHERE deleted_at IS NULL
      ORDER BY
        CASE type
          WHEN 'checking' THEN 1
          WHEN 'savings' THEN 2
          WHEN 'credit' THEN 3
          WHEN 'cash' THEN 4
          WHEN 'investment' THEN 5
          ELSE 6
        END,
        name ASC;
    `);

  return rows.map(
    mapAccountRow
  );
}

export async function getAccountsForConnection(
  connectionId:
    string
): Promise<BankAccount[]> {
  const db =
    await getDatabase();

  const rows =
    await db.getAllAsync<
      AccountRow
    >(
      `
        SELECT
          id,
          bank_connection_id,
          provider_id,
          external_account_id,
          name,
          iban,
          currency,
          balance_minor,
          type,
          institution_name,
          last_synced_at
        FROM accounts
        WHERE deleted_at IS NULL
          AND bank_connection_id = ?
        ORDER BY
          name ASC;
      `,

      connectionId
    );

  return rows.map(
    mapAccountRow
  );
}

export async function getAccountById(
  id:
    string
): Promise<
  BankAccount | null
> {
  const db =
    await getDatabase();

  const row =
    await db.getFirstAsync<
      AccountRow
    >(
      `
        SELECT
          id,
          bank_connection_id,
          provider_id,
          external_account_id,
          name,
          iban,
          currency,
          balance_minor,
          type,
          institution_name,
          last_synced_at
        FROM accounts
        WHERE deleted_at IS NULL AND id = ?
        LIMIT 1;
      `,

      id
    );

  return row
    ? mapAccountRow(
        row
      )
    : null;
}

export async function deleteAccountsForConnection(
  connectionId:
    string
): Promise<void> {
  const db =
    await getDatabase();

  await db.runAsync(
    `
      DELETE FROM accounts
      WHERE bank_connection_id = ?;
    `,

    connectionId
  );
}