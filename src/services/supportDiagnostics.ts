import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { getDatabase } from '@/db/database';
import { getRecentDebugLogs, debugLog } from '@/core/debugLog';
import { getBankConnectionHealth } from '@/services/bankConnectionHealth';
import { countUnsyncedChanges } from '@/services/pendingSyncStatus';
import { foreignCurrencySummary } from '@/services/currencyScope';
import {
  buildSupportDiagnostics,
  diagnosticsLooksSafe,
  type SupportDiagnosticsInput,
} from '@/services/supportDiagnosticsCore';
import { useFinanceStore } from '@/stores/useFinanceStore';
import { useCloudSyncStore } from '@/stores/useCloudSyncStore';
import { useProductAccessStore } from '@/stores/useProductAccessStore';

/**
 * Nutzer-Diagnosepaket für den Support.
 *
 * Sammelt nur sichere, aggregierte Werte, baut daraus einen redigierten Text
 * und stellt ihn als Datei über das System-Teilen-Menü bereit. Nichts wird
 * automatisch hochgeladen.
 */

async function gather(): Promise<SupportDiagnosticsInput> {
  const finance = useFinanceStore.getState();
  const cloud = useCloudSyncStore.getState();
  const access = useProductAccessStore.getState().access;

  let schemaVersion: number | null = null;
  try {
    const db = await getDatabase();
    const row = await db.getFirstAsync<{ v: number }>('SELECT MAX(version) AS v FROM schema_migrations');
    schemaVersion = row?.v ?? null;
  } catch {
    /* ignore */
  }

  let unsynced: number | null = null;
  try {
    unsynced = (await countUnsyncedChanges()).total;
  } catch {
    /* ignore */
  }

  const states = new Set<string>();
  let needAction = 0;
  for (const connection of finance.bankConnections) {
    states.add(connection.status);
    if (getBankConnectionHealth(connection).userActionRequired) needAction += 1;
  }

  const mutedSeries = [...finance.recurringOverrides.values()].filter((entry) => entry.muted).length;

  const codes = getRecentDebugLogs()
    .filter((entry) => entry.level === 'error' || entry.level === 'warn')
    .flatMap((entry) => entry.message.match(/[A-Z]{2,5}-[A-Z]{2,6}-\d{2,3}/g) ?? []);

  const runtimeVersion =
    typeof Constants.expoConfig?.runtimeVersion === 'string'
      ? Constants.expoConfig.runtimeVersion
      : (Constants.expoConfig?.version ?? 'unbekannt');

  return {
    appVersion: Constants.expoConfig?.version ?? 'unbekannt',
    runtimeVersion,
    buildNumber:
      Platform.OS === 'ios'
        ? (Constants.expoConfig?.ios?.buildNumber ?? '?')
        : (Constants.expoConfig?.android?.versionCode ?? '?'),
    platform: Platform.OS,
    osVersion: String(Platform.Version ?? ''),
    updateChannel: null,
    isEmbeddedUpdate: true,
    schemaVersion,
    cloudSyncStatus: cloud.status,
    lastSyncedAt: cloud.lastSyncedAt,
    lastLocalLoadAt: finance.lastLoadedAt,
    accountCount: finance.accounts.length,
    bankConnectionCount: finance.bankConnections.length,
    bankConnectionStates: [...states].sort(),
    bankConnectionsNeedingAction: needAction,
    recurringSeriesCount: finance.recurringOverrides.size,
    mutedSeriesCount: mutedSeries,
    budgetCount: finance.budgets.length,
    activeGoalCount: finance.goals.length,
    unsyncedChangeCount: unsynced,
    foreignCurrencies: foreignCurrencySummary(finance.accounts).currencies,
    recentErrorCodes: codes,
    premiumPlan: access.isSuperuser ? 'superuser' : access.plan,
    premiumSource: access.source,
  };
}

export type SupportBundleResult = 'shared' | 'unavailable' | 'error';

export async function createAndShareSupportBundle(): Promise<SupportBundleResult> {
  try {
    const text = buildSupportDiagnostics(await gather());
    if (!diagnosticsLooksSafe(text)) {
      debugLog.error('SUPPORT', 'Diagnosepaket abgebrochen – Sicherheitsprüfung fehlgeschlagen');
      return 'error';
    }
    if (!(await Sharing.isAvailableAsync())) return 'unavailable';

    const file = new File(Paths.cache, `finance-diagnose-${new Date().toISOString().slice(0, 10)}.txt`);
    try {
      if (file.exists) file.delete();
    } catch {
      /* egal */
    }
    try {
      file.create({ overwrite: true });
    } catch {
      /* write legt sie sonst an */
    }
    file.write(text);
    await Sharing.shareAsync(file.uri, { mimeType: 'text/plain', UTI: 'public.plain-text', dialogTitle: 'Support-Diagnose teilen' });
    try {
      if (file.exists) file.delete();
    } catch {
      /* Cache wird bereinigt */
    }
    return 'shared';
  } catch (error) {
    debugLog.error('SUPPORT', 'Diagnosepaket fehlgeschlagen', error);
    return 'error';
  }
}

/** Für die Vorschau in der UI (ohne Teilen). */
export async function previewSupportDiagnostics(): Promise<string> {
  return buildSupportDiagnostics(await gather());
}
