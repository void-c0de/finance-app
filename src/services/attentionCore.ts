import type { BankConnectionStatus } from '../types/banking';

/**
 * Zentrales, deterministisches Aufmerksamkeitsmodell.
 *
 * Sammelt die unabhängigen „braucht Aufmerksamkeit"-Konzepte des Produkts an
 * einer Stelle und priorisiert sie. Reiner Leaf-Core ohne DB/UI.
 *
 * Nicht alarmieren, wo nichts kaputt ist: transiente, harmlose Zustände
 * (`temporarily_unavailable`) sind höchstens informativ.
 */

export type AttentionPriority =
  | 'critical'
  | 'action_required'
  | 'review'
  | 'informational';

export type AttentionItem = {
  id: string;
  priority: AttentionPriority;
  title: string;
  detail: string;
  /** Ziel-Route für den Deep-Link. */
  route: string;
  count?: number;
};

const PRIORITY_ORDER: Record<AttentionPriority, number> = {
  critical: 0,
  action_required: 1,
  review: 2,
  informational: 3,
};

export type AttentionInput = {
  uncategorizedExpenseCount: number;
  uncertainRecurringCount: number;
  overBudgetCount: number;
  bankConnections: readonly {
    id: string;
    institutionName: string;
    status: BankConnectionStatus;
  }[];
  cloudSyncFailed: boolean;
  /** Serien, deren erwartete Zahlung überfällig ist (nur bei frischen Bankdaten). */
  missedRecurring?: readonly { seriesKey: string; title: string }[];
};

const CONNECTION_ATTENTION: Partial<
  Record<
    BankConnectionStatus,
    { priority: AttentionPriority; title: string; detail: string }
  >
> = {
  revoked: {
    priority: 'critical',
    title: 'Bankzugriff widerrufen',
    detail: 'Verbinde das Konto erneut, wenn du es weiter nutzen möchtest.',
  },
  consent_expired: {
    priority: 'action_required',
    title: 'Bankfreigabe abgelaufen',
    detail: 'Erneuere die Zustimmung bei deiner Bank.',
  },
  requires_action: {
    priority: 'action_required',
    title: 'Bankverbindung erneut bestätigen',
    detail: 'Die Bank benötigt erneut deine Freigabe.',
  },
  error: {
    priority: 'review',
    title: 'Bankverbindung gestört',
    detail: 'Die letzte Aktualisierung ist fehlgeschlagen.',
  },
  temporarily_unavailable: {
    priority: 'informational',
    title: 'Bank vorübergehend nicht erreichbar',
    detail: 'Deine zuletzt synchronisierten Daten bleiben verfügbar.',
  },
};

export function buildAttentionItems(input: AttentionInput): AttentionItem[] {
  const items: AttentionItem[] = [];

  for (const connection of input.bankConnections) {
    const mapping = CONNECTION_ATTENTION[connection.status];
    if (!mapping) continue;
    items.push({
      id: `bank:${connection.id}`,
      priority: mapping.priority,
      title: mapping.title,
      detail: `${connection.institutionName} · ${mapping.detail}`,
      route: '/bank-connections',
    });
  }

  if (input.overBudgetCount > 0) {
    items.push({
      id: 'budgets:over',
      priority: 'action_required',
      title:
        input.overBudgetCount === 1
          ? 'Ein Budget ist überschritten'
          : `${input.overBudgetCount} Budgets sind überschritten`,
      detail: 'Sieh dir die betroffenen Kategorien in der Planung an.',
      route: '/(tabs)/planning',
      count: input.overBudgetCount,
    });
  }

  for (const entry of input.missedRecurring ?? []) {
    items.push({
      id: `missed:${entry.seriesKey}`,
      priority: 'review',
      title: `${entry.title}: erwartete Zahlung bisher nicht erkannt`,
      detail: 'Keine Aussage über eine Kündigung – prüfe die Serie in den Analysen.',
      route: '/analytics',
    });
  }

  if (input.cloudSyncFailed) {
    items.push({
      id: 'sync:failed',
      priority: 'review',
      title: 'Cloud-Sync unvollständig',
      detail: 'Deine lokalen Daten sind weiterhin vollständig verfügbar.',
      route: '/cloud-account',
    });
  }

  if (input.uncategorizedExpenseCount > 0) {
    items.push({
      id: 'transactions:uncategorized',
      priority: 'review',
      title: `${input.uncategorizedExpenseCount} Ausgaben ohne Kategorie`,
      detail: 'Kategorisieren verbessert Budgets und Auswertungen.',
      route: '/uncategorized',
      count: input.uncategorizedExpenseCount,
    });
  }

  if (input.uncertainRecurringCount > 0) {
    items.push({
      id: 'recurring:uncertain',
      priority: 'review',
      title: `${input.uncertainRecurringCount} mögliche wiederkehrende Zahlungen`,
      detail: 'Bestätige oder verwirf die erkannten Kandidaten in der Planung.',
      route: '/(tabs)/planning',
      count: input.uncertainRecurringCount,
    });
  }

  items.sort((left, right) => {
    const byPriority = PRIORITY_ORDER[left.priority] - PRIORITY_ORDER[right.priority];
    if (byPriority !== 0) return byPriority;
    return (right.count ?? 0) - (left.count ?? 0);
  });

  return items;
}

export function highestAttentionPriority(
  items: readonly AttentionItem[],
): AttentionPriority | null {
  return items.length > 0 ? items[0].priority : null;
}
