import { create } from 'zustand';

import {
    runCloudSync,
} from '@/services/cloud/syncEngine';

type CloudSyncStatus =
  | 'idle'
  | 'unconfigured'
  | 'syncing'
  | 'synced'
  | 'error';

interface CloudSyncState {
  status:
    CloudSyncStatus;

  message:
    string;

  lastSyncedAt:
    string | null;

  isBusy:
    boolean;

  refreshCloudSync: () => Promise<void>;
}

export const useCloudSyncStore =
  create<CloudSyncState>((set) => ({
    status:
      'idle',

    message:
      'Noch nicht synchronisiert',

    lastSyncedAt:
      null,

    isBusy:
      false,

    refreshCloudSync: async () => {
      if (
        useCloudSyncStore.getState()
          .isBusy
      ) {
        return;
      }

      set({
        isBusy: true,

        status: 'syncing',

        message:
          'Synchronisiere…',
      });

      const result =
        await runCloudSync();

      set({
        isBusy: false,

        status:
          result.status ===
            'unconfigured'
            ? 'unconfigured'

            : result.status ===
                  'error'
              ? 'error'

              : 'synced',

        message:
          result.message,

        lastSyncedAt:
          result.status ===
          'synced'
            ? new Date().toISOString()
            : useCloudSyncStore.getState()
                .lastSyncedAt,
      });
    },
  }));
