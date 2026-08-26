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
      )
      ON CONFLICT (
        provider_id,
        external_connection_id
      )
      DO UPDATE SET
        institution_id =
          excluded.institution_id,

        institution_name =
          excluded.institution_name,

        status =
          excluded.status,

        is_demo =
          excluded.is_demo,

        last_synced_at =
          excluded.last_synced_at,

        deleted_at = NULL;
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

  const row =
    await db.getFirstAsync<BankConnectionRow>(
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
        WHERE provider_id = ?
          AND external_connection_id = ?
          AND deleted_at IS NULL
        LIMIT 1;
      `,
      input.providerId,
      input.externalConnectionId,
    );

  if (!row) {
    throw new Error(
      'Bank connection could not be loaded after upsert.',
    );
  }

  return mapBankConnectionRow(
    row,
  );
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

  /**
   * TOMBSTONE-DELETE (M5-Kontrakt):
   *
   * Verbindung, Konten und Umsaetze
   * werden soft-deleted, damit die
   * Loeschung ueber die Cloud auf alle
   * Geraete propagiert. Ein Hard-Delete
   * wuerde Cloud-Restdaten hinterlassen,
   * die bei Cursor-/Owner-Reset
   * zurueckkehren koennen.
   */
  await db.withTransactionAsync(
    async () => {
      const now = new Date().toISOString();

      await db.runAsync(
        `
          UPDATE transactions
          SET deleted_at = ?
          WHERE account_id IN (
            SELECT id FROM accounts
            WHERE bank_connection_id = ?
          )
            AND deleted_at IS NULL;
        `,
        now,
        id
      );

      await db.runAsync(
        `
          UPDATE accounts
          SET deleted_at = ?
          WHERE bank_connection_id = ?
            AND deleted_at IS NULL;
        `,
        now,
        id
      );

      await db.runAsync(
        `
          UPDATE bank_connections
          SET deleted_at = ?
          WHERE id = ?;
        `,
        now,
        id
      );
    }
  );
}
