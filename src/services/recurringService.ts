import {
  deleteRecurringSeries,
  upsertRecurringSeries,
} from '@/db/repositories/recurringSeries';

import type { RecurringItem, RecurringKind } from '@/services/recurringInsightsCore';

/**
 * Übersetzt Nutzeraktionen aus der Wiederkehrend-Verwaltung in persistierte
 * Serienkorrekturen. Alle Aktionen sind sync-sicher (deterministische ID =
 * `item.key`) und zerstören keine Transaktionswahrheit.
 */

/** „Ja, das stimmt" – Serie mit der aktuell erkannten Art bestätigen. */
export async function confirmRecurringSeries(item: RecurringItem): Promise<void> {
  await upsertRecurringSeries({
    seriesKey: item.key,
    merchantName: item.title,
    kind: item.kind === 'uncertain' && item.direction === 'income' ? 'income' : item.kind,
    muted: false,
    userConfirmed: true,
    expectedAmountMinor: item.amountMinor,
    currency: item.currency,
    cadence: item.cadence,
  });
}

/** Art ändern (z. B. „unbestätigt" → „Rechnung"). */
export async function setRecurringSeriesKind(
  item: RecurringItem,
  kind: RecurringKind,
): Promise<void> {
  await upsertRecurringSeries({
    seriesKey: item.key,
    merchantName: item.title,
    kind,
    muted: false,
    userConfirmed: true,
    expectedAmountMinor: item.amountMinor,
    currency: item.currency,
    cadence: item.cadence,
  });
}

/** „Das ist keine wiederkehrende Zahlung" – Serie überall unterdrücken. */
export async function muteRecurringSeries(item: RecurringItem): Promise<void> {
  await upsertRecurringSeries({
    seriesKey: item.key,
    merchantName: item.title,
    kind: item.kind,
    muted: true,
    userConfirmed: false,
    currency: item.currency,
    cadence: item.cadence,
  });
}

/** Nutzerkorrektur zurücknehmen – die Heuristik entscheidet danach wieder. */
export async function clearRecurringSeries(seriesKey: string): Promise<void> {
  await deleteRecurringSeries(seriesKey);
}
