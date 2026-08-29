import { create } from 'zustand';

import {
    runCloudSync,
} from '@/services/cloud/syncEngine';

/**
 * UX-Policy für Sync-Fehler:
 *
 * Hintergrund-Synchronisierung darf den
 * Nutzer niemals mit Fehlerdialogen oder
 * Alarmfarben belasten. Fehler werden
 * still (Debug-Journal + Upload) behandelt
 * und automatisch beim nächsten Anlass
 * erneut versucht.
 */

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

  errorCode?:
    string;

  lastSyncedAt:
    string | null;

  isBusy:
    boolean;

  refreshCloudSync: () => Promise<void>;
}

function friendlyMessage(
  status: CloudSyncStatus,
): string {
  if (
    status ===
    'syncing'
  ) {
    return 'Synchronisiere…';
  }

  if (
    status ===
    'unconfigured'
  ) {
    return 'Cloud inaktiv';
  }

  if (
    status ===
    'error'
  ) {
    return 'Wird später erneut versucht';
  }

  return 'Auf dem neuesten Stand';
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

        message: friendlyMessage('syncing'),

        errorCode: undefined,
      });

      const result =
        await runCloudSync();

      const nextStatus: CloudSyncStatus =
        result.status ===
          'unconfigured'
          ? 'unconfigured'

          : result.status ===
                'error'
            ? 'error'

            : 'synced';

      set({
        isBusy: false,

        status: nextStatus,

        /*
         * Bewusst ruhige Formulierungen -
         * technische Details leben im
         * Debug-Journal, nicht in der UI.
         */
        message:
          nextStatus ===
          'synced'
            ? `Aktuell · ${result.pushed ?? 0}↑ ${result.pulled ?? 0}↓`

            : friendlyMessage(nextStatus),

        errorCode:
          nextStatus ===
          'error'
            ? 'CLD-UNK-001'
            : undefined,

        lastSyncedAt:
          nextStatus ===
          'synced'
            ? new Date().toISOString()
            : useCloudSyncStore.getState()
                .lastSyncedAt,
      });
    },
  }));
