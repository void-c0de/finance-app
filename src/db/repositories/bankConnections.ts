import * as Crypto from 'expo-crypto';

import {
  getDatabase,
} from '@/db/database';

import type {
  BankConnection,
  BankConnectionStatus,
} from '@/types/banking';

type BankConnectionRow = {
  id: string;

  provider_id: string;

  external_connection_id: string;

  institution_id: string;

  institution_name: string;

  status: string;

  is_demo: number;

  created_at: string;

  updated_at: string;

  last_synced_at:
    string | null;
};

export type CreateBankConnectionInput = {
  providerId: string;

  externalConnectionId: string;

  institutionId: string;

  institutionName: string;

  status:
    BankConnectionStatus;

  isDemo: boolean;
};

function mapBankConnectionRow(
  row: BankConnectionRow
): BankConnection {
  return {
    id:
      row.id,

    providerId:
      row.provider_id,

    externalConnectionId:
      row.external_connection_id,

    institutionId:
      row.institution_id,

    institutionName:
      row.institution_name,

    status:
      row.status as
        BankConnectionStatus,

    isDemo:
      row.is_demo === 1,

    createdAt:
      row.created_at,

    updatedAt:
      row.updated_at,

    lastSyncedAt:
      row.last_synced_at ??
      undefined,
  };
}

export async function createBankConnection(
  input: CreateBankConnectionInput
): Promise<BankConnection> {
  const db =
    await getDatabase();

  const id =
    Crypto.randomUUID();

  const now =
    new Date().toISOString();

  await db.runAsync(
    `
      INSERT INTO bank_connections (
        id,
        provider_id,
        external_connection_id,
        institution_id,
        institution_name,
        status,
        is_demo,
        created_at,
        updated_at,
        last_synced_at
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
        NULL
      );
    `,
    id,
    input.providerId,
    input.externalConnectionId,
    input.institutionId,
    input.institutionName,
    input.status,
    input.isDemo
      ? 1
      : 0,
    now,
    now
  );

  return {
    id,

    providerId:
      input.providerId,

    externalConnectionId:
      input.externalConnectionId,

    institutionId:
      input.institutionId,

    institutionName:
      input.institutionName,

    status:
      input.status,

    isDemo:
      input.isDemo,

    createdAt:
      now,

    updatedAt:
      now,
  };
}

export async function getBankConnections():
Promise<BankConnection[]> {
  const db =
    await getDatabase();

  const rows =
    await db.getAllAsync<
      BankConnectionRow
    >(`
      SELECT
        id,
        provider_id,
        external_connection_id,
        institution_id,
        institution_name,
        status,
        is_demo,
        created_at,
        updated_at,
        last_synced_at
      FROM bank_connections WHERE deleted_at IS NULL
      ORDER BY
        created_at DESC;
    `);

  return rows.map(
    mapBankConnectionRow
  );
}

export async function getBankConnectionById(
  id: string
): Promise<BankConnection | null> {
  const db =
    await getDatabase();

  const row =
    await db.getFirstAsync<
      BankConnectionRow
    >(
      `
        SELECT
          id,
          provider_id,
          external_connection_id,
          institution_id,
          institution_name,
          status,
          is_demo,
          created_at,
          updated_at,
          last_synced_at
        FROM bank_connections
        WHERE id = ? AND deleted_at IS NULL
        LIMIT 1;
      `,
      id
    );

  return row
    ? mapBankConnectionRow(row)
    : null;
}

export async function markBankConnectionSyncSuccess(
  id: string,
  syncedAt: string
): Promise<void> {
  const db =
    await getDatabase();

  await db.runAsync(
    `
      UPDATE bank_connections
      SET
        status = 'active',
        last_synced_at = ?,
        updated_at = ?
      WHERE id = ?;
    `,
    syncedAt,
    syncedAt,
    id
  );
}

export async function updateBankConnectionStatus(
  id: string,
  status: BankConnectionStatus
): Promise<void> {
  const db =
    await getDatabase();

  await db.runAsync(
    `
      UPDATE bank_connections
      SET
        status = ?,
        updated_at = ?
      WHERE id = ?;
    `,
    status,
    new Date().toISOString(),
    id
  );
}

export async function deleteBankConnection(
  id: string
): Promise<void> {
  const db =
    await getDatabase();

  await db.withTransactionAsync(
    async () => {
      /**
       * accounts.bank_connection_id besitzt
       * aktuell bewusst noch keinen echten
       * SQLite-Foreign-Key, da die Spalte
       * per Migration ergänzt wurde.
       *
       * Deshalb löschen wir Accounts
       * explizit.
       *
       * Transactions werden anschließend
       * über:
       *
       * transactions.account_id
       * ON DELETE CASCADE
       *
       * automatisch entfernt.
       */
      await db.runAsync(
        `
          DELETE FROM accounts
          WHERE bank_connection_id = ?;
        `,
        id
      );

      await db.runAsync(
        `
          DELETE FROM bank_connections
          WHERE id = ?;
        `,
        id
      );
    }
  );
}