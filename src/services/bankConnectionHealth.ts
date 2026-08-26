import type {
  BankConnection,
  BankConnectionStatus,
} from '@/types/banking';

export type ConnectionHealthTone =
  | 'positive'
  | 'warning'
  | 'negative'
  | 'neutral';

export type ConnectionHealth = {
  label: string;
  detail: string;
  tone: ConnectionHealthTone;
  userActionRequired: boolean;
};

const STATUS_HEALTH: Record<BankConnectionStatus, ConnectionHealth> = {
  connecting: {
    label: 'Wird verbunden',
    detail: 'Die Bankfreigabe wird abgeschlossen.',
    tone: 'neutral',
    userActionRequired: false,
  },
  active: {
    label: 'Aktuell',
    detail: 'Die Verbindung ist einsatzbereit.',
    tone: 'positive',
    userActionRequired: false,
  },
  syncing: {
    label: 'Wird synchronisiert',
    detail: 'Vorhandene Daten bleiben währenddessen verfügbar.',
    tone: 'neutral',
    userActionRequired: false,
  },
  requires_action: {
    label: 'Neu verbinden',
    detail: 'Die Bank benötigt erneut deine Freigabe.',
    tone: 'warning',
    userActionRequired: true,
  },
  consent_expired: {
    label: 'Freigabe abgelaufen',
    detail: 'Erneuere die Zustimmung bei deiner Bank.',
    tone: 'warning',
    userActionRequired: true,
  },
  temporarily_unavailable: {
    label: 'Bank nicht erreichbar',
    detail: 'Deine zuletzt synchronisierten Daten bleiben verfügbar.',
    tone: 'warning',
    userActionRequired: false,
  },
  revoked: {
    label: 'Zugriff widerrufen',
    detail: 'Verbinde das Konto erneut, wenn du es weiter nutzen möchtest.',
    tone: 'negative',
    userActionRequired: true,
  },
  error: {
    label: 'Verbindung gestört',
    detail: 'Die letzte Aktualisierung ist fehlgeschlagen.',
    tone: 'negative',
    userActionRequired: false,
  },
  disconnected: {
    label: 'Getrennt',
    detail: 'Diese Bankverbindung ist nicht aktiv.',
    tone: 'neutral',
    userActionRequired: false,
  },
};

export function getBankConnectionHealth(
  connection: Pick<BankConnection, 'status'>,
): ConnectionHealth {
  return STATUS_HEALTH[connection.status] ?? STATUS_HEALTH.error;
}
