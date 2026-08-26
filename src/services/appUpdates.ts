/**
 * Zentrale OTA-Update-Verwaltung (expo-updates).
 *
 * Bewusst defensiv:
 *
 * - Alle Zugriffe auf das Native-Modul
 *   sind lazy und try/catch-gesichert.
 * - Läuft die App im Dev-Client gegen
 *   Metro, ist Updates.isEnabled false
 *   -> die UI zeigt einen klaren Hinweis,
 *   statt zu crashen.
 * - In Release-/Dev-Client-Builds mit
 *   konfigurierter Update-URL gilt:
 *
 *   Der App-Start bleibt vollständig
 *   offline-fähig. Updates werden bewusst
 *   erst über die Einstellungen geprüft,
 *   damit ein nicht erreichbarer Server
 *   den Kaltstart niemals blockiert.
 */

import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';

import { getSupabaseClient } from '@/services/cloud/cloudClient';
import { requiresNativeUpgrade, type UpdateLevel } from '@/services/releaseCore';

export type UpdateStatusKind =
  | 'unavailable'
  | 'up_to_date'
  | 'downloading'
  | 'ready_to_install'
  | 'error'
  | 'not_configured';

export type UpdateCheckResult = {
  status: UpdateStatusKind;

  message:
    string;

  currentVersion?:
    string;

  runtimeVersion?:
    string;
};

export type ReleaseMetadata = {
  version: string;
  buildNumber: number;
  runtimeVersion: string;
  title: string;
  summary: string;
  level: UpdateLevel;
  minimumNativeVersion: string | null;
  storeUrl: string | null;
};

export type ProductUpdateResult = UpdateCheckResult & {
  release: ReleaseMetadata | null;
  nativeUpgradeRequired: boolean;
};

const BACKGROUND_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
const SEEN_RELEASE_KEY = 'finance.seen-release.v1';
let lastBackgroundCheckAt = 0;

interface ExpoUpdatesModule {
  isEnabled: boolean;

  channel?:
    string;

  currentVersion?: string;

  runtimeVersion?:
    | string
    | Record<
        string,
        string
      >;

  checkForUpdateAsync(): Promise<{
    isAvailable: boolean;
    reason?: string;
  }>;

  fetchUpdateAsync(): Promise<{
    isNew: boolean;
    manifest?: unknown;
  }>;

  reloadAsync(): Promise<void>;
}

let cachedModule:
  | ExpoUpdatesModule
  | null
  | undefined;

function getUpdatesModule():
  | ExpoUpdatesModule
  | null {
  if (
    cachedModule !==
    undefined
  ) {
    return cachedModule;
  }

  try {
    /*
     * Lazy require:
     * Wenn das Native-Modul im aktuellen
     * Build fehlt, wirft der require hier
     * und wird sauber abgefangen - ohne
     * die App beim Start zu gefährden.
     */
    const module =
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require('expo-updates') as ExpoUpdatesModule;

    cachedModule =
      module?.isEnabled !==
      undefined
        ? module
        : null;
  } catch (error) {
    console.warn(
      '[UPDATES] expo-updates nicht verfügbar:',
      error
    );

    cachedModule = null;
  }

  return cachedModule;
}

function resolveRuntimeVersion(
  module: ExpoUpdatesModule
): string | undefined {
  const value =
    module.runtimeVersion;

  if (typeof value === 'string') {
    return value;
  }

  if (
    value &&
    typeof value ===
      'object'
  ) {
    return (
      value.android ??
      undefined
    );
  }

  return undefined;
}

export function isUpdateSystemAvailable(): boolean {
  const module =
    getUpdatesModule();

  return Boolean(
    module?.isEnabled
  );
}

export async function checkAndInstallUpdate(): Promise<UpdateCheckResult> {
  const module =
    getUpdatesModule();

  if (!module) {
    return {
      status: 'unavailable',

      message:
        'Updates sind in diesem Build nicht verfügbar. Der Build muss einmal mit dem neuen Modul neu erstellt werden.',
    };
  }

  if (!module.isEnabled) {
    return {
      status: 'not_configured',

      message:
        'Dev-Modus: Updates kommen hier direkt über Metro. Die automatische Suche greift in installierten Builds.',
    };
  }

  try {
    const check =
      await module.checkForUpdateAsync();

    if (!check.isAvailable) {
      return {
        status: 'up_to_date',

        message:
          'Du bist auf dem neuesten Stand.',

        currentVersion:
          module.currentVersion,

        runtimeVersion:
          resolveRuntimeVersion(
            module
          ),
      };
    }

    const fetched =
      await module.fetchUpdateAsync();

    if (fetched.isNew) {
      return {
        status: 'ready_to_install',

        message:
          'Update geladen. Neustart anwenden?',

        runtimeVersion:
          resolveRuntimeVersion(
            module
          ),
      };
    }

    return {
      status: 'up_to_date',

      message:
        'Kein neues Update gefunden.',

      runtimeVersion:
        resolveRuntimeVersion(
          module
        ),
    };
  } catch (error) {
    console.error(
      '[UPDATES] Suche fehlgeschlagen:',
      error
    );

    return {
      status: 'error',

      message:
        'Update-Server konnte gerade nicht erreicht werden.',
    };
  }
}

export async function applyPendingReload(): Promise<boolean> {
  const module =
    getUpdatesModule();

  if (!module) {
    return false;
  }

  try {
    await module.reloadAsync();

    return true;
  } catch (error) {
    console.error(
      '[UPDATES] Neustart fehlgeschlagen:',
      error
    );

    return false;
  }
}

export function getInstalledVersionInfo() {
  return {
    version: Constants.expoConfig?.version ?? 'unbekannt',
    runtimeVersion: typeof Constants.expoConfig?.runtimeVersion === 'string'
      ? Constants.expoConfig.runtimeVersion
      : Constants.expoConfig?.version ?? 'unbekannt',
  };
}

export async function getLatestReleaseMetadata(): Promise<ReleaseMetadata | null> {
  const client = getSupabaseClient();
  if (!client) return null;
  try {
    const { data, error } = await client
      .from('app_releases')
      .select('version,build_number,runtime_version,title,summary,update_level,minimum_native_version,store_url')
      .eq('platform', 'android')
      .eq('published', true)
      .order('published_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error || !data) return null;
    return {
      version: data.version,
      buildNumber: data.build_number,
      runtimeVersion: data.runtime_version,
      title: data.title,
      summary: data.summary,
      level: data.update_level as UpdateLevel,
      minimumNativeVersion: data.minimum_native_version,
      storeUrl: data.store_url,
    };
  } catch {
    return null;
  }
}

function releaseKey(release: ReleaseMetadata): string {
  return `${release.version}:${release.buildNumber}`;
}

export async function shouldShowPatchNotes(release: ReleaseMetadata): Promise<boolean> {
  const installed = getInstalledVersionInfo();
  if (installed.version !== release.version) return false;
  try {
    return (await SecureStore.getItemAsync(SEEN_RELEASE_KEY)) !== releaseKey(release);
  } catch {
    return false;
  }
}

export async function markPatchNotesSeen(release: ReleaseMetadata): Promise<void> {
  try { await SecureStore.setItemAsync(SEEN_RELEASE_KEY, releaseKey(release)); } catch { /* non-critical */ }
}

export async function checkProductUpdate(options?: { background?: boolean }): Promise<ProductUpdateResult | null> {
  const now = Date.now();
  if (options?.background && now - lastBackgroundCheckAt < BACKGROUND_CHECK_INTERVAL_MS) return null;
  if (options?.background) lastBackgroundCheckAt = now;
  const release = await getLatestReleaseMetadata();
  const installed = getInstalledVersionInfo();
  const nativeUpgradeRequired = requiresNativeUpgrade(installed.version, release?.minimumNativeVersion ?? null);
  if (nativeUpgradeRequired) {
    return {
      status: 'ready_to_install',
      message: 'Eine neue App-Version ist für die weitere sichere Nutzung erforderlich.',
      currentVersion: installed.version,
      runtimeVersion: installed.runtimeVersion,
      release,
      nativeUpgradeRequired: true,
    };
  }
  const ota = await checkAndInstallUpdate();
  return { ...ota, release, nativeUpgradeRequired: false };
}
