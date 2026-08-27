/**
 * Lokale, datenschutzfreundliche Produktzähler.
 *
 * NUR im Speicher, NUR anonyme Ereignis-Zähler, KEIN Upload, KEINE personen-
 * bezogenen Daten, keine Drittanbieter-Analytics. Dient dazu, später
 * Produktentscheidungen zu stützen, falls eine echte Telemetrie-Architektur
 * mit eigenem Datenschutzmodell hinzukommt. Bis dahin ist das nur das
 * Ereignismodell.
 */

export type PremiumEvent =
  | 'premium_center_opened'
  | 'premium_preview_opened'
  | 'premium_gate_opened'
  | 'premium_gate_cta'
  | 'premium_gate_dismissed'
  | 'quota_gate_opened'
  | 'theme_premium_tapped'
  | 'theme_selected'
  | 'analytics_preview_opened';

type EventRecord = { count: number; lastSource: string | null; lastAt: string | null };

const counters = new Map<PremiumEvent, EventRecord>();

export function trackPremiumEvent(event: PremiumEvent, source?: string): void {
  const current = counters.get(event) ?? { count: 0, lastSource: null, lastAt: null };
  counters.set(event, {
    count: current.count + 1,
    lastSource: source ?? current.lastSource,
    lastAt: new Date().toISOString(),
  });
}

export function getPremiumEventSnapshot(): Record<string, EventRecord> {
  return Object.fromEntries(counters.entries());
}

export function resetPremiumEvents(): void {
  counters.clear();
}
