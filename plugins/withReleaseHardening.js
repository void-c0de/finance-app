const { withAndroidManifest, AndroidConfig } = require('expo/config-plugins');

/**
 * Release-Härtung des generierten AndroidManifest.
 *
 *  1. Entfernt `SYSTEM_ALERT_WINDOW` – die Expo-Vorlage fügt es für den
 *     Dev-Overlay (LogBox) ein; im Release braucht die App es nicht und
 *     Google Play markiert die „Über anderen Apps anzeigen"-Berechtigung.
 *  2. Setzt `android:allowBackup="false"` – die lokale SQLCipher-DB ist nur
 *     mit dem geräte-gebundenen SecureStore-Schlüssel lesbar (der bewusst
 *     NICHT gesichert wird). Ein Auto-Backup/Device-Transfer würde nur eine
 *     unbrauchbare Datenbank übertragen. Der offizielle Weg ist das
 *     App-eigene Finanz-Backup + Cloud-Sync.
 */
function withReleaseHardening(config) {
  return withAndroidManifest(config, (androidConfig) => {
    const manifest = androidConfig.modResults.manifest;

    // 1. SYSTEM_ALERT_WINDOW entfernen
    if (Array.isArray(manifest['uses-permission'])) {
      manifest['uses-permission'] = manifest['uses-permission'].filter(
        (perm) => perm?.$?.['android:name'] !== 'android.permission.SYSTEM_ALERT_WINDOW',
      );
    }

    // 2. allowBackup = false
    const application = AndroidConfig.Manifest.getMainApplicationOrThrow(androidConfig.modResults);
    application.$['android:allowBackup'] = 'false';

    return androidConfig;
  });
}

module.exports = withReleaseHardening;
