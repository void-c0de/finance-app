import {
    initializeDatabase,
} from '@/db/database';

import {
    useFinanceStore,
} from '@/stores/useFinanceStore';

import {
    useCloudSyncStore,
} from '@/stores/useCloudSyncStore';

import {
    useThemeStore,
} from '@/stores/useThemeStore';

import {
    initBilling,
} from '@/services/billing/registerBilling';

export async function prepareApplication():
Promise<void> {
  await Promise.all([
    useThemeStore
      .getState()
      .hydrateTheme(),

    initializeDatabase(),
  ]);

  // Best-effort, blockiert den Boot nie. Registriert den nativen Billing-Adapter
  // nur, wenn Store-Produkt-IDs konfiguriert sind — sonst no-op.
  void initBilling();
}

export async function loadAuthenticatedApplicationData():
Promise<void> {
  await useFinanceStore
    .getState()
    .refreshFinanceData();

  /*
   * M6 — Cloud-Sync als Best-Effort
   * Hintergrundlauf. Blockiert niemals
   * Boot oder Datenanzeige.
   */
  void useCloudSyncStore
    .getState()
    .refreshCloudSync();
}