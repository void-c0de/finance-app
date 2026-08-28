/**
 * Reiner Kern des Tink-Verbindungs-Lebenszyklus — `import type` only, kein I/O.
 * Testbar über `scripts/test-tink-lifecycle.mjs`.
 *
 * Zweck: die erlaubten Zustandsübergänge einer Bankverbindung an EINER Stelle
 * beschreiben und — die harte Invariante — festhalten, welche Zustände lokale
 * Konten/Umsätze löschen dürfen (nur eine bewusste Nutzeraktion) und welche
 * NICHT (jede Art von Provider-/Consent-Fehler).
 *
 * Tink-Produktivvertrag (kontinuierlicher Zugriff, server-seitige Token-
 * Rotation) ist extern blockiert — die Zustände `consent_expired` /
 * `requires_action` modellieren den Sandbox-Weg: der Nutzer startet den hosted
 * Tink-Link-Flow erneut.
 */
import type { BankConnectionStatus } from '@/types/banking';

/** Ereignisse, die einen Verbindungszustand verändern können. */
export type TinkConnectionEvent =
  | { type: 'LINK_STARTED' }
  | { type: 'EXCHANGE_OK' } // Code getauscht, Daten geladen
  | { type: 'SYNC_STARTED' }
  | { type: 'SYNC_OK' }
  | { type: 'PROVIDER_TEMPORARY_ERROR' } // Bank/Tink kurzzeitig nicht erreichbar
  | { type: 'CONSENT_EXPIRED' } // PSD2-Zustimmung abgelaufen (90 Tage)
  | { type: 'REAUTH_REQUIRED' } // Tink verlangt erneute starke Kundenauthentifizierung
  | { type: 'ACCESS_REVOKED' } // Nutzer/Bank hat den Zugriff widerrufen
  | { type: 'UNKNOWN_ERROR' }
  | { type: 'USER_DISCONNECTED' }; // bewusste Trennung in der App

/**
 * Was ein Zielzustand für die bereits importierten Daten bedeutet.
 *  - keep:   Konten & Umsätze bleiben unverändert nutzbar (nur nicht mehr aktuell).
 *  - delete: Konten & Umsätze werden getombstoned (NUR bei bewusster Trennung).
 */
export type DataRetentionPolicy = 'keep' | 'delete';

export type LifecycleFacts = {
  status: BankConnectionStatus;
  /** Muss der Nutzer aktiv werden (Reconnect / Zustimmung erneuern)? */
  userActionRequired: boolean;
  /** Dürfen lokale Konten/Umsätze in diesem Zustand entfernt werden? */
  retention: DataRetentionPolicy;
  /** Läuft die Verbindung automatisch weiter, sobald das Problem behoben ist? */
  autoRecovers: boolean;
};

const FACTS: Record<BankConnectionStatus, LifecycleFacts> = {
  connecting: { status: 'connecting', userActionRequired: false, retention: 'keep', autoRecovers: true },
  active: { status: 'active', userActionRequired: false, retention: 'keep', autoRecovers: true },
  syncing: { status: 'syncing', userActionRequired: false, retention: 'keep', autoRecovers: true },
  requires_action: { status: 'requires_action', userActionRequired: true, retention: 'keep', autoRecovers: false },
  consent_expired: { status: 'consent_expired', userActionRequired: true, retention: 'keep', autoRecovers: false },
  temporarily_unavailable: { status: 'temporarily_unavailable', userActionRequired: false, retention: 'keep', autoRecovers: true },
  revoked: { status: 'revoked', userActionRequired: true, retention: 'keep', autoRecovers: false },
  error: { status: 'error', userActionRequired: false, retention: 'keep', autoRecovers: true },
  // Nur dieser Zustand darf löschen — und nur, weil der Nutzer es ausgelöst hat.
  disconnected: { status: 'disconnected', userActionRequired: false, retention: 'delete', autoRecovers: false },
};

export function lifecycleFacts(status: BankConnectionStatus): LifecycleFacts {
  return FACTS[status] ?? FACTS.error;
}

/**
 * Nächster Zustand. Bewusst konservativ: ein Provider-/Consent-Ereignis führt nie
 * zu `disconnected` (und damit nie zu Datenverlust) — dafür braucht es
 * `USER_DISCONNECTED`.
 */
export function nextConnectionStatus(
  current: BankConnectionStatus,
  event: TinkConnectionEvent,
): BankConnectionStatus {
  if (event.type === 'USER_DISCONNECTED') return 'disconnected';

  switch (event.type) {
    case 'LINK_STARTED':
      return 'connecting';
    case 'EXCHANGE_OK':
    case 'SYNC_OK':
      return 'active';
    case 'SYNC_STARTED':
      // aus stabilen Zuständen heraus; ein Reauth-/Consent-Problem bleibt bestehen
      return current === 'requires_action' || current === 'consent_expired' || current === 'revoked'
        ? current
        : 'syncing';
    case 'PROVIDER_TEMPORARY_ERROR':
      return current === 'requires_action' || current === 'consent_expired' || current === 'revoked'
        ? current
        : 'temporarily_unavailable';
    case 'CONSENT_EXPIRED':
      return 'consent_expired';
    case 'REAUTH_REQUIRED':
      return 'requires_action';
    case 'ACCESS_REVOKED':
      return 'revoked';
    case 'UNKNOWN_ERROR':
      return current === 'requires_action' || current === 'consent_expired' || current === 'revoked'
        ? current
        : 'error';
    default:
      return current;
  }
}

/** Harte Invariante: ist ein Datenlösch-Schritt für diesen Übergang erlaubt? */
export function mayDeleteImportedData(from: BankConnectionStatus, to: BankConnectionStatus, event: TinkConnectionEvent): boolean {
  return event.type === 'USER_DISCONNECTED' && to === 'disconnected';
}

/** Darf aus diesem Zustand ein automatischer (nicht vom Nutzer angestoßener) Sync starten? */
export function canAutoSync(status: BankConnectionStatus): boolean {
  return status === 'active' || status === 'temporarily_unavailable' || status === 'error';
}
