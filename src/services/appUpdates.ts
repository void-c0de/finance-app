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

export type UpdateStatusKind =
  | 'unavailable'
  | 'up_to_date'
  | 'downloading'
  | 'ready_to_install'
  | 'error'
  | 'not_configured';

type UpdateCheckResult = {
  status: UpdateStatusKind;

  message:
    string;

  currentVersion?:
    string;

  runtimeVersion?:
    string;
};

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
