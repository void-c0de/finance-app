import type { Transaction } from '../types/finance';

/**
 * Konfidenz-bewusste Erkennung und Klassifizierung wiederkehrender Zahlungen.
 *
 * Grundsätze:
 * - Interne Überweisungen und vorgemerkte Umsätze sind niemals ein Abo, eine
 *   Rechnung oder Einkommen. Sie werden hier immer ausgeschlossen.
 * - Unsichere Daten werden als `uncertain` mit niedriger Konfidenz markiert,
 *   nie als sichere Kategorie.
 * - Eine manuelle Zuordnung des Nutzers gewinnt immer.
 * - Dieses Modul ist ein reiner, testbarer Leaf-Core ohne DB-/App-Importe.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

export type RecurringKind = 'subscription' | 'bill' | 'income' | 'uncertain';
export type RecurringConfidence = 'high' | 'medium' | 'low';
export type RecurringCadence =
  | 'weekly'
  | 'monthly'
  | 'quarterly'
  | 'yearly'
  | 'irregular'
  | 'unknown';

export type RecurringClassificationInput = {
  direction: 'income' | 'expense';
  merchant: string;
  description?: string;
  amountsMinor: readonly number[];
  intervalDaysMedian: number | null;
  occurrences: number;
  manualKind?: RecurringKind | null;
};

export type RecurringClassification = {
  kind: RecurringKind;
  confidence: RecurringConfidence;
  cadence: RecurringCadence;
  amountStable: boolean;
  reason: string;
};

const SUBSCRIPTION_MERCHANTS: readonly string[] = [
  'netflix', 'spotify', 'disney', 'disney+', 'dazn', 'youtube', 'youtube premium',
  'amazon prime', 'prime video', 'audible', 'apple.com/bill', 'apple.com', 'icloud',
  'apple music', 'google storage', 'google one', 'patreon', 'notion', 'dropbox',
  'adobe', 'microsoft 365', 'office 365', 'xbox', 'playstation', 'nintendo', 'canva',
  'chatgpt', 'openai', 'anthropic', 'claude', 'linkedin', 'storytel', 'sky', 'wow',
  'paramount', 'crunchyroll', 'twitch', 'strava', 'komoot', 'duolingo', 'babbel',
  'nordvpn', 'proton', '1password', 'github', 'jetbrains', 'figma', 'setapp',
];

const BILL_KEYWORDS: readonly string[] = [
  'versicherung', 'insurance', 'strom', 'stadtwerke', 'energie', 'gas', 'wasser',
  'abwasser', 'telekom', 'vodafone', 'o2', 'telefonica', 'telefónica', '1&1', '1und1',
  'pyur', 'congstar', 'aldi talk', 'miete', 'rent', 'kaltmiete', 'warmmiete',
  'hausverwaltung', 'nebenkosten', 'gez', 'rundfunk', 'rundfunkbeitrag',
  'beitragsservice', 'fitness', 'gym', 'mcfit', 'clever fit', 'fitx', 'urban sports',
  'internet', 'dsl', 'kabel', 'unitymedia', 'eon', 'e.on', 'enbw', 'rwe', 'lekker',
  'yello', 'krankenkasse', 'aok', 'barmer', 'techniker krankenkasse', 'grundsteuer',
  'kita', 'kindergarten', 'darlehen', 'kredit', 'ratenkredit',
];

const INCOME_KEYWORDS: readonly string[] = [
  'gehalt', 'lohn', 'salary', 'bezuege', 'bezüge', 'entgelt', 'verguetung',
  'vergütung', 'rente', 'pension', 'ausbildungsverguetung', 'bafoeg', 'bafög',
  'kindergeld', 'honorar', 'payroll',
];

function normalizeText(value: string): string {
  return value.toLocaleLowerCase('de-DE').replace(/\s+/g, ' ').trim();
}

function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

export function classifyCadence(intervalDaysMedian: number | null): RecurringCadence {
  if (intervalDaysMedian === null || !Number.isFinite(intervalDaysMedian)) return 'unknown';
  const d = intervalDaysMedian;
  if (d >= 5 && d <= 9) return 'weekly';
  if (d >= 24 && d <= 38) return 'monthly';
  if (d >= 80 && d <= 100) return 'quarterly';
  if (d >= 330 && d <= 400) return 'yearly';
  return 'irregular';
}

export function isAmountStable(amountsMinor: readonly number[]): boolean {
  if (amountsMinor.length < 2) return true;
  const typical = median(amountsMinor.map((amount) => Math.abs(amount)));
  if (typical === 0) return false;
  const tolerance = Math.max(100, typical * 0.15);
  return amountsMinor.every((amount) => Math.abs(Math.abs(amount) - typical) <= tolerance);
}

function matchesAny(haystack: string, needles: readonly string[]): boolean {
  return needles.some((needle) => haystack.includes(needle));
}

const KIND_REASON: Record<RecurringKind, string> = {
  subscription: 'Erkannt als Abo',
  bill: 'Erkannt als laufende Rechnung',
  income: 'Erkannt als wiederkehrendes Einkommen',
  uncertain: 'Mögliche wiederkehrende Zahlung',
};

export const RECURRING_KIND_LABEL: Record<RecurringKind, string> = {
  subscription: 'Abo',
  bill: 'Rechnung',
  income: 'Einkommen',
  uncertain: 'Unbestätigt',
};

export function classifyRecurring(
  input: RecurringClassificationInput,
): RecurringClassification {
  const cadence = classifyCadence(input.intervalDaysMedian);
  const amountStable = isAmountStable(input.amountsMinor);
  const haystack = `${normalizeText(input.merchant)} ${normalizeText(input.description ?? '')}`.trim();
  const regularCadence =
    cadence === 'weekly' || cadence === 'monthly' || cadence === 'quarterly' || cadence === 'yearly';

  if (input.manualKind) {
    return {
      kind: input.manualKind,
      confidence: 'high',
      cadence,
      amountStable,
      reason: 'Manuell zugeordnet',
    };
  }

  if (input.direction === 'income') {
    const namedSalary = matchesAny(haystack, INCOME_KEYWORDS);
    const confidence: RecurringConfidence = namedSalary
      ? 'high'
      : input.occurrences >= 3 && regularCadence
        ? 'medium'
        : 'low';
    return { kind: 'income', confidence, cadence, amountStable, reason: KIND_REASON.income };
  }

  if (matchesAny(haystack, SUBSCRIPTION_MERCHANTS)) {
    return {
      kind: 'subscription',
      confidence: amountStable && regularCadence ? 'high' : 'medium',
      cadence,
      amountStable,
      reason: KIND_REASON.subscription,
    };
  }

  if (matchesAny(haystack, BILL_KEYWORDS)) {
    return {
      kind: 'bill',
      confidence: amountStable ? 'high' : 'medium',
      cadence,
      amountStable,
      reason: KIND_REASON.bill,
    };
  }

  if (regularCadence && amountStable && input.occurrences >= 3) {
    return { kind: 'uncertain', confidence: 'medium', cadence, amountStable, reason: KIND_REASON.uncertain };
  }

  return { kind: 'uncertain', confidence: 'low', cadence, amountStable, reason: KIND_REASON.uncertain };
}

/** Kanonischer Monatsfaktor je Rhythmus – stabile, intuitive Anzeigewerte. */
function monthlyMultiplierFor(cadence: RecurringCadence, effectiveIntervalDays: number): number {
  switch (cadence) {
    case 'weekly':
      return 30 / 7;
    case 'monthly':
      return 1;
    case 'quarterly':
      return 1 / 3;
    case 'yearly':
      return 1 / 12;
    default:
      return Math.min(5, Math.max(1 / 12, 30 / effectiveIntervalDays));
  }
}

export type RecurringItem = {
  key: string;
  title: string;
  accountId: string;
  currency: string;
  direction: 'income' | 'expense';
  kind: RecurringKind;
  confidence: RecurringConfidence;
  cadence: RecurringCadence;
  /** Zuletzt beobachteter Betrag (Minor-Units, immer positiv). */
  amountMinor: number;
  /** Auf einen Monat normierter Schätzwert (Minor-Units). */
  monthlyEstimateMinor: number;
  occurrences: number;
  lastDate: string;
  nextDate: string;
  reason: string;
  driftPercent?: number;
};

export type RecurringSummary = {
  subscriptionCount: number;
  billCount: number;
  incomeCount: number;
  uncertainCount: number;
  /** Monatlich gebundene Ausgaben (Abos + Rechnungen + unbestätigt). */
  monthlyCommittedMinor: number;
  /** Monatlich erwartetes wiederkehrendes Einkommen. */
  monthlyRecurringIncomeMinor: number;
};

export type RecurringInsights = {
  items: RecurringItem[];
  summary: RecurringSummary;
  /** Ausgaben-Positionen mit Fälligkeit innerhalb des Horizonts, aufsteigend. */
  upcoming: RecurringItem[];
};

function defaultNormalizer(value: string | null | undefined): string {
  return (value ?? '')
    .replace(/\b\d{6,}\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Verdichtet als wiederkehrend markierte Transaktionen zu Positionen mit
 * konfidenz-bewusster Klassifizierung (Abo / Rechnung / Einkommen / unbestätigt).
 */
export function buildRecurringInsights(
  transactions: readonly Transaction[],
  options?: {
    normalizeMerchant?: (value: string | null | undefined) => string;
    referenceDate?: Date;
    horizonDays?: number;
    manualKindByKey?: ReadonlyMap<string, RecurringKind>;
  },
): RecurringInsights {
  const normalizeMerchant = options?.normalizeMerchant ?? defaultNormalizer;
  const now = options?.referenceDate ?? new Date();
  const horizonDays = options?.horizonDays ?? 45;

  const groups = new Map<string, Transaction[]>();

  for (const transaction of transactions) {
    if (
      !transaction.isRecurring ||
      transaction.isInternalTransfer ||
      transaction.bookingStatus === 'pending'
    ) {
      continue;
    }

    const title = normalizeMerchant(
      transaction.counterpartyName ?? transaction.description,
    );
    if (!title) continue;

    const key = `${transaction.accountId}|${transaction.currency}|${transaction.direction}|${title.toLocaleLowerCase('de-DE')}`;
    const group = groups.get(key) ?? [];
    group.push(transaction);
    groups.set(key, group);
  }

  const items: RecurringItem[] = [];

  for (const [key, group] of groups) {
    group.sort(
      (left, right) => Date.parse(left.bookingDate) - Date.parse(right.bookingDate),
    );

    const latest = group[group.length - 1];
    const previous = group[group.length - 2];
    const amountsMinor = group.map((transaction) => Math.abs(transaction.amountMinor));

    const intervals: number[] = [];
    for (let index = 1; index < group.length; index += 1) {
      const delta =
        (Date.parse(group[index].bookingDate) - Date.parse(group[index - 1].bookingDate)) / DAY_MS;
      if (Number.isFinite(delta) && delta > 0) intervals.push(delta);
    }
    const intervalDaysMedian = intervals.length > 0 ? median(intervals) : null;

    const title = normalizeMerchant(latest.counterpartyName ?? latest.description);

    const classification = classifyRecurring({
      direction: latest.direction,
      merchant: title,
      description: latest.description,
      amountsMinor,
      intervalDaysMedian,
      occurrences: group.length,
      manualKind: options?.manualKindByKey?.get(key) ?? null,
    });

    const effectiveInterval = intervalDaysMedian ?? 30;
    const monthlyEstimateMinor = Math.round(
      Math.abs(latest.amountMinor) *
        monthlyMultiplierFor(classification.cadence, effectiveInterval),
    );

    let nextTimestamp = Date.parse(latest.bookingDate) + effectiveInterval * DAY_MS;
    while (nextTimestamp < now.getTime()) {
      nextTimestamp += effectiveInterval * DAY_MS;
    }

    let driftPercent: number | undefined;
    if (previous) {
      const difference = Math.abs(latest.amountMinor) - Math.abs(previous.amountMinor);
      const ratio = Math.abs(previous.amountMinor) > 0
        ? difference / Math.abs(previous.amountMinor)
        : 0;
      if (Math.abs(difference) >= 100 && Math.abs(ratio) >= 0.1) {
        driftPercent = ratio;
      }
    }

    items.push({
      key,
      title,
      accountId: latest.accountId,
      currency: latest.currency,
      direction: latest.direction,
      kind: classification.kind,
      confidence: classification.confidence,
      cadence: classification.cadence,
      amountMinor: Math.abs(latest.amountMinor),
      monthlyEstimateMinor,
      occurrences: group.length,
      lastDate: latest.bookingDate.slice(0, 10),
      nextDate: new Date(nextTimestamp).toISOString().slice(0, 10),
      reason: classification.reason,
      driftPercent,
    });
  }

  items.sort((left, right) => left.nextDate.localeCompare(right.nextDate));

  const summary: RecurringSummary = {
    subscriptionCount: 0,
    billCount: 0,
    incomeCount: 0,
    uncertainCount: 0,
    monthlyCommittedMinor: 0,
    monthlyRecurringIncomeMinor: 0,
  };

  for (const item of items) {
    if (item.kind === 'subscription') summary.subscriptionCount += 1;
    else if (item.kind === 'bill') summary.billCount += 1;
    else if (item.kind === 'income') summary.incomeCount += 1;
    else summary.uncertainCount += 1;

    if (item.direction === 'expense') {
      summary.monthlyCommittedMinor += item.monthlyEstimateMinor;
    } else {
      summary.monthlyRecurringIncomeMinor += item.monthlyEstimateMinor;
    }
  }

  const horizonCutoff = now.getTime() + horizonDays * DAY_MS;
  const upcoming = items.filter(
    (item) =>
      item.direction === 'expense' &&
      item.occurrences >= 2 &&
      Date.parse(`${item.nextDate}T00:00:00.000Z`) <= horizonCutoff,
  );

  return { items, summary, upcoming };
}
