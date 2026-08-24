/**
 * Zentrale Fehlercode-Registrierung.
 *
 * Format: <APP>-<BEREICH>-<NR>
 *
 * Vollständige Referenz (privat, nicht im Repo):
 * C:\Users\durak\finance-app-private\ERROR_CODES.md
 */

export const APP_ERROR_CODES = {
  /*
   * Cloud-Sync (CLD)
   */
  SYNC_NOT_CONFIGURED:
    'CLD-CFG-001',

  SYNC_SESSION_FAILED:
    'CLD-AUTH-001',

  SYNC_PUSH_TABLE_FAILED:
    'CLD-PUSH-001',

  SYNC_PULL_QUERY_FAILED:
    'CLD-PULL-001',

  SYNC_PULL_PRECHECK_FAILED:
    'CLD-PULL-002',

  SYNC_PULL_ROW_WRITE_FAILED:
    'CLD-PULL-003',

  SYNC_PULL_CURSOR_FAILED:
    'CLD-PULL-004',

  SYNC_METADATA_FAILED:
    'CLD-META-001',

  SYNC_UNKNOWN:
    'CLD-UNK-001',

  /*
   * Authentifizierung (AUTH)
   */
  AUTH_SIGNIN_FAILED:
    'AUTH-SGN-001',

  AUTH_SIGNUP_FAILED:
    'AUTH-SGN-002',

  AUTH_EMAIL_NOT_CONFIRMED:
    'AUTH-SGN-003',

  AUTH_INVALID_CREDENTIALS:
    'AUTH-SGN-004',

  AUTH_ALREADY_REGISTERED:
    'AUTH-SGN-005',

  AUTH_RATE_LIMITED:
    'AUTH-SGN-006',

  AUTH_WEAK_PASSWORD:
    'AUTH-SGN-007',

  AUTH_SIGNOUT_FAILED:
    'AUTH-SGN-010',

  /*
   * Kategorien (CAT)
   */
  CATEGORY_SAVE_FAILED:
    'CAT-SAVE-001',

  CATEGORY_NOT_FOUND:
    'CAT-SAVE-002',

  /*
   * Transaktionen (TXN)
   */
  TXN_NOT_FOUND:
    'TXN-LOAD-001',
} as const;

export type AppErrorCode =
  (typeof APP_ERROR_CODES)[keyof typeof APP_ERROR_CODES];

/**
 * Nutzerfreundliche Kurztexte.
 * Details bleiben ausschließlich im Debug-Journal.
 */
export const APP_ERROR_MESSAGES: Record<
  AppErrorCode,
  string
> = {
  'CLD-CFG-001':
    'Cloud ist nicht konfiguriert.',

  'CLD-AUTH-001':
    'Cloud-Anmeldung nicht möglich.',

  'CLD-PUSH-001':
    'Hochladen nicht möglich.',

  'CLD-PULL-001':
    'Herunterladen nicht möglich.',

  'CLD-PULL-002':
    'Datenprüfung fehlgeschlagen.',

  'CLD-PULL-003':
    'Datensatz abgelehnt.',

  'CLD-PULL-004':
    'Sync-Position nicht gespeichert.',

  'CLD-META-001':
    'Sync-Status nicht gespeichert.',

  'CLD-UNK-001':
    'Unbekannter Sync-Fehler.',

  'AUTH-SGN-001':
    'Anmeldung fehlgeschlagen.',

  'AUTH-SGN-002':
    'Registrierung fehlgeschlagen.',

  'AUTH-SGN-003':
    'E-Mail noch nicht bestätigt.',

  'AUTH-SGN-004':
    'E-Mail oder Passwort falsch.',

  'AUTH-SGN-005':
    'Konto existiert bereits.',

  'AUTH-SGN-006':
    'Zu viele Versuche.',

  'AUTH-SGN-007':
    'Passwort zu schwach.',

  'AUTH-SGN-010':
    'Abmelden fehlgeschlagen.',

  'CAT-SAVE-001':
    'Kategorie konnte nicht gespeichert werden.',

  'CAT-SAVE-002':
    'Kategorie nicht gefunden.',

  'TXN-LOAD-001':
    'Umsatz nicht gefunden.',
};
