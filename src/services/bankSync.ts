import {
    getBankProvider,
} from '@/banking/providerRegistry';

import {
    initializeDatabase,
} from '@/db/database';

import {
    upsertProviderAccount,
} from '@/db/repositories/accounts';

import {
    getBankConnectionById,
    getBankConnections,
    markBankConnectionSyncSuccess,
    updateBankConnectionStatus,
} from '@/db/repositories/bankConnections';

import {
    upsertProviderTransactions,
} from '@/db/repositories/transactions';

import type {
    BankConnection,
} from '@/types/banking';

const DEFAULT_SYNC_STALE_MS =
  5 * 60 * 1000;

const inFlightSyncs =
  new Map<
    string,
    Promise<BankSyncResult>
  >();

export type BankSyncResult = {
  connectionId: string;

  accountCount: number;

  transactionCount: number;

  syncedAt: string;
};

export type SyncFailure = {
  connectionId: string;

  message: string;
};

export type SyncAllResult = {
  synced:
    BankSyncResult[];

  skippedConnectionIds:
    string[];

  failed:
    SyncFailure[];
};

function errorToMessage(
  error: unknown
): string {
  if (
    error instanceof Error
  ) {
    return error.message;
  }

  return String(error);
}

function shouldSyncConnection(
  connection:
    BankConnection,
  force: boolean
): boolean {
  if (force) {
    return true;
  }

  if (
    !connection.lastSyncedAt
  ) {
    return true;
  }

  const lastSyncTime =
    Date.parse(
      connection.lastSyncedAt
    );

  if (
    Number.isNaN(
      lastSyncTime
    )
  ) {
    return true;
  }

  return (
    Date.now() -
      lastSyncTime >=
    DEFAULT_SYNC_STALE_MS
  );
}

async function performBankConnectionSync(
  connectionId: string
): Promise<BankSyncResult> {
  await initializeDatabase();

  const connection =
    await getBankConnectionById(
      connectionId
    );

  if (!connection) {
    throw new Error(
      `Bank connection not found: ${connectionId}`
    );
  }

  const provider =
    getBankProvider(
      connection.providerId
    );

  try {
    await provider.refresh(
      connection.externalConnectionId
    );

    const providerAccounts =
      await provider.getAccounts(
        connection.externalConnectionId
      );

    const syncedAt =
      new Date().toISOString();

    let transactionCount = 0;

    const from =
      new Date();

    from.setMonth(
      from.getMonth() - 3
    );

    const to =
      new Date();

    for (
      const providerAccount
      of providerAccounts
    ) {
      const localAccount =
        await upsertProviderAccount({
          connectionId:
            connection.id,

          providerId:
            connection.providerId,

          account:
            providerAccount,

          syncedAt,
        });

      const providerTransactions =
        await provider.getTransactions(
          connection.externalConnectionId,
          providerAccount.externalAccountId,
          from,
          to
        );

      transactionCount +=
        await upsertProviderTransactions(
          localAccount.id,
          providerTransactions
        );
    }

    await markBankConnectionSyncSuccess(
      connection.id,
      syncedAt
    );

    return {
      connectionId:
        connection.id,

      accountCount:
        providerAccounts.length,

      transactionCount,

      syncedAt,
    };
  } catch (error) {
    try {
      await updateBankConnectionStatus(
        connection.id,
        'error'
      );
    } catch (
      statusError
    ) {
      console.error(
        'Could not update bank connection error state:',
        statusError
      );
    }

    throw error;
  }
}

export async function syncBankConnection(
  connectionId: string
): Promise<BankSyncResult> {
  const existingSync =
    inFlightSyncs.get(
      connectionId
    );

  if (existingSync) {
    return existingSync;
  }

  const syncPromise =
    performBankConnectionSync(
      connectionId
    );

  inFlightSyncs.set(
    connectionId,
    syncPromise
  );

  try {
    return await syncPromise;
  } finally {
    if (
      inFlightSyncs.get(
        connectionId
      ) === syncPromise
    ) {
      inFlightSyncs.delete(
        connectionId
      );
    }
  }
}

export async function syncAllBankConnections(
  options?: {
    force?: boolean;
  }
): Promise<SyncAllResult> {
  await initializeDatabase();

  const force =
    options?.force ??
    false;

  const connections =
    await getBankConnections();

  const result:
    SyncAllResult = {
      synced: [],

      skippedConnectionIds:
        [],

      failed: [],
    };

  for (
    const connection
    of connections
  ) {
    if (
      connection.status ===
      'disconnected'
    ) {
      result.skippedConnectionIds.push(
        connection.id
      );

      continue;
    }

    if (
      !shouldSyncConnection(
        connection,
        force
      )
    ) {
      result.skippedConnectionIds.push(
        connection.id
      );

      continue;
    }

    try {
      const syncResult =
        await syncBankConnection(
          connection.id
        );

      result.synced.push(
        syncResult
      );
    } catch (error) {
      result.failed.push({
        connectionId:
          connection.id,

        message:
          errorToMessage(
            error
          ),
      });
    }
  }

  return result;
}