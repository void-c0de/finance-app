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

/**
 * Stabile, geräteübergreifende Identität einer wiederkehrenden Serie.
 * Konto-IDs synchronisieren als text-PK, daher ist der Schlüssel überall gleich.
 * Wird sowohl zum Gruppieren als auch als `series_key` der persistierten
 * Nutzerkorrektur verwendet.
 */
export function recurringSeriesKey(
  accountId: string,
  currency: string,
  direction: 'income' | 'expense',
  normalizedMerchant: string,
): string {
  return `${accountId}|${currency}|${direction}|${normalizedMerchant.toLocaleLowerCase('de-DE')}`;
}

/** Persistierte Nutzerkorrektur zu einer Serie. */
export type RecurringOverride = {
  kind?: RecurringKind;
  /** Nutzer hat „ist keine wiederkehrende Zahlung" gewählt – Serie wird überall unterdrückt. */
  muted?: boolean;
  /** Nutzer hat die Serie ausdrücklich bestätigt. */
  confirmed?: boolean;
  expectedAmountMinor?: number | null;
};

export type RecurringItem = {
  key: string;
  title: string;
  accountId: string;
  currency: string;
  direction: 'income' | 'expense';
  kind: RecurringKind;
  confidence: RecurringConfidence;
  cadence: RecurringCadence;
  /** Median-Abstand aufeinanderfolgender Buchungen in Tagen (Fallback 30). */
  intervalDays: number;
  /** Nutzer hat diese Serie ausdrücklich bestätigt (höchste Vertrauensstufe). */
  userConfirmed: boolean;
  /** Zuletzt beobachteter Betrag (Minor-Units, immer positiv). */
  amountMinor: number;
  /** Auf einen Monat normierter Schätzwert (Minor-Units). */
  monthlyEstimateMinor: number;
  occurrences: number;
  lastDate: string;
  /** Erstes projiziertes Vorkommen nach der letzten Buchung – kann in der Vergangenheit liegen. */
  expectedDate: string;
  /** Nächstes Vorkommen ab jetzt (immer in der Zukunft). */
  nextDate: string;
  /** Beobachtete Beträge je Vorkommen, chronologisch, immer positiv. */
  amountHistoryMinor: number[];
  reason: string;
  driftPercent?: number;
};

/** Zählt als monatlich gebundene Ausgabe: bestätigt, oder Abo/Rechnung mit hoher Konfidenz. */
export function isCommittedExpense(item: RecurringItem): boolean {
  if (item.direction !== 'expense') return false;
  if (item.userConfirmed) return item.kind !== 'income';
  return (item.kind === 'subscription' || item.kind === 'bill') && item.confidence === 'high';
}

export type RecurringSummary = {
  subscriptionCount: number;
  billCount: number;
  incomeCount: number;
  uncertainCount: number;
  confirmedCount: number;
  /** Monatlich gebundene Ausgaben – nur bestätigte bzw. hochsichere Abos/Rechnungen. */
  monthlyCommittedMinor: number;
  /** Monatlich erwartete Ausgaben aus unsicheren Kandidaten (separat ausweisen). */
  monthlyUncertainMinor: number;
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
    /** Persistierte Nutzerkorrekturen, per `recurringSeriesKey`. */
    overridesByKey?: ReadonlyMap<string, RecurringOverride>;
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

    const key = recurringSeriesKey(
      transaction.accountId,
      transaction.currency,
      transaction.direction,
      title,
    );
    const group = groups.get(key) ?? [];
    group.push(transaction);
    groups.set(key, group);
  }

  const items: RecurringItem[] = [];

  for (const [key, group] of groups) {
    const override = options?.overridesByKey?.get(key);
    if (override?.muted) {
      continue;
    }

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
      manualKind: override?.kind ?? null,
    });

    const userConfirmed = Boolean(override?.confirmed || override?.kind);
    const kind = classification.kind;
    const confidence = userConfirmed ? 'high' : classification.confidence;

    const effectiveInterval = intervalDaysMedian ?? 30;
    const observedAmountMinor = Math.abs(latest.amountMinor);
    const baseAmountMinor =
      typeof override?.expectedAmountMinor === 'number' && override.expectedAmountMinor > 0
        ? override.expectedAmountMinor
        : observedAmountMinor;
    const monthlyEstimateMinor = Math.round(
      baseAmountMinor * monthlyMultiplierFor(classification.cadence, effectiveInterval),
    );

    const expectedTimestamp = Date.parse(latest.bookingDate) + effectiveInterval * DAY_MS;
    let nextTimestamp = expectedTimestamp;
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
      kind,
      confidence,
      cadence: classification.cadence,
      intervalDays: effectiveInterval,
      userConfirmed,
      amountMinor: observedAmountMinor,
      monthlyEstimateMinor,
      occurrences: group.length,
      lastDate: latest.bookingDate.slice(0, 10),
      expectedDate: new Date(expectedTimestamp).toISOString().slice(0, 10),
      nextDate: new Date(nextTimestamp).toISOString().slice(0, 10),
      amountHistoryMinor: amountsMinor,
      reason: override?.confirmed && !override?.kind ? 'Bestätigt' : classification.reason,
      driftPercent,
    });
  }

  items.sort((left, right) => left.nextDate.localeCompare(right.nextDate));

  const summary: RecurringSummary = {
    subscriptionCount: 0,
    billCount: 0,
    incomeCount: 0,
    uncertainCount: 0,
    confirmedCount: 0,
    monthlyCommittedMinor: 0,
    monthlyUncertainMinor: 0,
    monthlyRecurringIncomeMinor: 0,
  };

  for (const item of items) {
    if (item.kind === 'subscription') summary.subscriptionCount += 1;
    else if (item.kind === 'bill') summary.billCount += 1;
    else if (item.kind === 'income') summary.incomeCount += 1;
    else summary.uncertainCount += 1;
    if (item.userConfirmed) summary.confirmedCount += 1;

    if (item.direction === 'income') {
      summary.monthlyRecurringIncomeMinor += item.monthlyEstimateMinor;
    } else if (isCommittedExpense(item)) {
      summary.monthlyCommittedMinor += item.monthlyEstimateMinor;
    } else {
      summary.monthlyUncertainMinor += item.monthlyEstimateMinor;
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

// ---------------------------------------------------------------------------
// Financial commitments engine — "Wie viel Geld ist schon gebunden?"
// ---------------------------------------------------------------------------

export type CommitmentBucket = 'confirmed' | 'likely' | 'uncertain';

/** In welche Sicherheitsstufe fällt eine Ausgaben-Serie? */
export function commitmentBucket(item: RecurringItem): CommitmentBucket {
  if (item.direction !== 'expense') return 'uncertain';
  if (item.userConfirmed && item.kind !== 'income') return 'confirmed';
  if ((item.kind === 'subscription' || item.kind === 'bill') && item.confidence === 'high') {
    return 'likely';
  }
  return 'uncertain';
}

export type MonthlyCommitments = {
  /** Bestätigte monatliche Ausgabenbindung. */
  confirmedMinor: number;
  /** Hochsicher erkannte, aber nicht bestätigte monatliche Bindung. */
  likelyMinor: number;
  /** Unsichere Kandidaten – bewusst NICHT als gebunden gezählt. */
  uncertainMinor: number;
  /** confirmed + likely – die belastbare „Fixkosten"-Zahl. */
  committedMinor: number;
  /** Monatlich erwartetes wiederkehrendes Einkommen (senkt Fixkosten NICHT). */
  recurringIncomeMinor: number;
  byBucket: Record<CommitmentBucket, RecurringItem[]>;
};

export function buildMonthlyCommitments(
  items: readonly RecurringItem[],
): MonthlyCommitments {
  const result: MonthlyCommitments = {
    confirmedMinor: 0,
    likelyMinor: 0,
    uncertainMinor: 0,
    committedMinor: 0,
    recurringIncomeMinor: 0,
    byBucket: { confirmed: [], likely: [], uncertain: [] },
  };

  for (const item of items) {
    if (item.direction === 'income') {
      result.recurringIncomeMinor += item.monthlyEstimateMinor;
      continue;
    }
    const bucket = commitmentBucket(item);
    result.byBucket[bucket].push(item);
    if (bucket === 'confirmed') result.confirmedMinor += item.monthlyEstimateMinor;
    else if (bucket === 'likely') result.likelyMinor += item.monthlyEstimateMinor;
    else result.uncertainMinor += item.monthlyEstimateMinor;
  }

  result.committedMinor = result.confirmedMinor + result.likelyMinor;
  return result;
}

// ---------------------------------------------------------------------------
// Cashflow forecast — conservative, certainty-labelled, never a promise
// ---------------------------------------------------------------------------

export type ForecastCertainty = 'known' | 'likely' | 'uncertain';

export type ForecastOccurrence = {
  seriesKey: string;
  title: string;
  date: string;
  /** Signiert: negativ = Abfluss, positiv = Zufluss. */
  amountMinor: number;
  certainty: ForecastCertainty;
  direction: 'income' | 'expense';
};

export type CashflowForecast = {
  horizonDays: number;
  openingBalanceMinor: number;
  /** Bestätigte Abflüsse im Horizont (negativ). */
  knownOutflowMinor: number;
  /** Hochsicher erkannte, unbestätigte Abflüsse (negativ). */
  likelyOutflowMinor: number;
  /** Unsichere Kandidaten (negativ) – nur informativ. */
  uncertainOutflowMinor: number;
  /** Erwartete wiederkehrende Zuflüsse im Horizont (positiv). */
  expectedInflowMinor: number;
  /** opening + bekannte Abflüsse + bestätigte/erkannte Zuflüsse. */
  projectedAfterKnownMinor: number;
  /** opening + (bekannte + erkannte) Abflüsse + Zuflüsse. Unsicheres bleibt außen vor. */
  projectedAfterLikelyMinor: number;
  occurrences: ForecastOccurrence[];
};

function occurrenceCertainty(item: RecurringItem): ForecastCertainty {
  if (item.direction === 'income') {
    return item.userConfirmed || item.confidence === 'high' ? 'known' : 'likely';
  }
  const bucket = commitmentBucket(item);
  if (bucket === 'confirmed') return 'known';
  if (bucket === 'likely') return 'likely';
  return 'uncertain';
}

/**
 * Konservative Vorschau. Zählt NUR projizierte wiederkehrende Vorkommen im
 * Zeitfenster (nextDate .. nextDate+Horizont). Bereits gebuchte Umsätze werden
 * nicht doppelt gezählt, weil `nextDate` immer in der Zukunft liegt.
 * Diskretionäre künftige Ausgaben werden bewusst NICHT geschätzt.
 */
export function buildCashflowForecast(input: {
  openingBalanceMinor: number;
  recurringItems: readonly RecurringItem[];
  referenceDate?: Date;
  horizonDays?: number;
}): CashflowForecast {
  const now = input.referenceDate ?? new Date();
  const horizonDays = input.horizonDays ?? 30;
  const horizonEnd = now.getTime() + horizonDays * DAY_MS;

  const occurrences: ForecastOccurrence[] = [];

  for (const item of input.recurringItems) {
    if (item.occurrences < 2) continue;
    const step = Math.max(1, item.intervalDays) * DAY_MS;
    const certainty = occurrenceCertainty(item);
    let ts = Date.parse(`${item.nextDate}T00:00:00.000Z`);
    if (Number.isNaN(ts)) continue;

    let guard = 0;
    while (ts <= horizonEnd && guard < 64) {
      guard += 1;
      if (ts > now.getTime()) {
        occurrences.push({
          seriesKey: item.key,
          title: item.title,
          date: new Date(ts).toISOString().slice(0, 10),
          amountMinor: item.direction === 'expense' ? -item.amountMinor : item.amountMinor,
          certainty,
          direction: item.direction,
        });
      }
      ts += step;
    }
  }

  occurrences.sort((left, right) => left.date.localeCompare(right.date));

  let knownOutflowMinor = 0;
  let likelyOutflowMinor = 0;
  let uncertainOutflowMinor = 0;
  let expectedInflowMinor = 0;

  for (const occurrence of occurrences) {
    if (occurrence.direction === 'income') {
      if (occurrence.certainty !== 'uncertain') expectedInflowMinor += occurrence.amountMinor;
      continue;
    }
    if (occurrence.certainty === 'known') knownOutflowMinor += occurrence.amountMinor;
    else if (occurrence.certainty === 'likely') likelyOutflowMinor += occurrence.amountMinor;
    else uncertainOutflowMinor += occurrence.amountMinor;
  }

  const projectedAfterKnownMinor =
    input.openingBalanceMinor + knownOutflowMinor + expectedInflowMinor;
  const projectedAfterLikelyMinor = projectedAfterKnownMinor + likelyOutflowMinor;

  return {
    horizonDays,
    openingBalanceMinor: input.openingBalanceMinor,
    knownOutflowMinor,
    likelyOutflowMinor,
    uncertainOutflowMinor,
    expectedInflowMinor,
    projectedAfterKnownMinor,
    projectedAfterLikelyMinor,
    occurrences,
  };
}

// ---------------------------------------------------------------------------
// Commitment / subscription price-change detection
// ---------------------------------------------------------------------------

export type CommitmentPriceChange = {
  seriesKey: string;
  title: string;
  kind: RecurringKind;
  fromMinor: number;
  toMinor: number;
  deltaMinor: number;
  deltaPercent: number;
  confidence: RecurringConfidence;
};

/**
 * Erkennt echte Preisänderungen einer laufenden Verpflichtung.
 *
 * Konservativ und konfidenz-bewusst:
 * - Abo: schon kleine, stabile Sprünge zählen (Basis = Median der bisherigen
 *   Beträge, aktueller Betrag muss deutlich und als neues Plateau abweichen).
 * - Rechnung/Versorger/unbestätigt: normale Schwankung ist erwartbar – nur
 *   große, klare Verschiebungen werden gemeldet.
 * - Einmalige Ausreißer werden nicht gemeldet (der aktuelle Wert muss vom
 *   bisherigen Median abweichen, nicht nur vom direkten Vorgänger).
 */
export function detectCommitmentPriceChanges(
  items: readonly RecurringItem[],
): CommitmentPriceChange[] {
  const changes: CommitmentPriceChange[] = [];

  for (const item of items) {
    const history = item.amountHistoryMinor;
    if (history.length < 3) continue;

    const baseline = median(history.slice(0, -1));
    const latest = history[history.length - 1];
    if (baseline <= 0) continue;

    const deltaMinor = latest - baseline;
    const deltaPercent = deltaMinor / baseline;
    const absPercent = Math.abs(deltaPercent);
    const absMinor = Math.abs(deltaMinor);

    const strict = item.kind === 'subscription';
    const minMinor = strict ? 50 : 300;
    const minPercent = strict ? 0.03 : 0.2;
    if (absMinor < minMinor || absPercent < minPercent) continue;

    // Kein einmaliger Ausreißer: der vorletzte Betrag sollte noch nahe an der
    // Basis liegen, der letzte klar davon weg (echter Stufenwechsel), ODER die
    // letzten zwei liegen beide auf dem neuen Niveau.
    const prev = history[history.length - 2];
    const prevIsBaseline = Math.abs(prev - baseline) <= Math.max(minMinor, baseline * 0.05);
    const twoOnNewLevel =
      history.length >= 4 &&
      Math.abs(prev - latest) <= Math.max(minMinor, Math.abs(latest) * 0.05) &&
      Math.abs(history[history.length - 3] - baseline) <= Math.max(minMinor, baseline * 0.05);
    if (!prevIsBaseline && !twoOnNewLevel) continue;

    changes.push({
      seriesKey: item.key,
      title: item.title,
      kind: item.kind,
      fromMinor: Math.round(baseline),
      toMinor: latest,
      deltaMinor: Math.round(deltaMinor),
      deltaPercent,
      confidence:
        strict && (twoOnNewLevel || item.userConfirmed)
          ? 'high'
          : item.confidence === 'high'
            ? 'medium'
            : 'low',
    });
  }

  changes.sort((left, right) => Math.abs(right.deltaMinor) - Math.abs(left.deltaMinor));
  return changes;
}

// ---------------------------------------------------------------------------
// Missed / silent recurring series — "expected payment did not appear"
// ---------------------------------------------------------------------------

export type MissedRecurring = {
  seriesKey: string;
  title: string;
  kind: RecurringKind;
  direction: 'income' | 'expense';
  lastDate: string;
  expectedByDate: string;
  daysOverdue: number;
};

/**
 * Meldet Serien, deren erwartete nächste Zahlung überfällig ist und für die
 * kein passender Umsatz existiert.
 *
 * Bewusst vorsichtig – behauptet NIE eine Kündigung:
 * - braucht >= 3 Vorkommen (klares Muster),
 * - Kulanzfenster aus dem historischen Rhythmus (max. Abweichung berücksichtigt),
 * - nur „frische" Serien (letzte Zahlung < 3 Intervalle her) – eine vor Monaten
 *   beendete Serie ist nicht „ausgeblieben",
 * - **kein Alarm, wenn die Bankdaten selbst veraltet sind** (neuester gebuchter
 *   Umsatz älter als `maxDataStalenessDays`).
 */
export function detectMissedRecurring(input: {
  items: readonly RecurringItem[];
  referenceDate?: Date;
  /** Buchungsdatum (YYYY-MM-DD) des insgesamt neuesten gebuchten Umsatzes. */
  latestBookedDate?: string | null;
  maxDataStalenessDays?: number;
}): MissedRecurring[] {
  const now = input.referenceDate ?? new Date();
  const nowMs = now.getTime();
  const maxStaleness = input.maxDataStalenessDays ?? 4;

  if (input.latestBookedDate) {
    const freshnessMs = Date.parse(`${input.latestBookedDate}T23:59:59.999Z`);
    if (Number.isFinite(freshnessMs) && (nowMs - freshnessMs) / DAY_MS > maxStaleness) {
      // Bankdaten veraltet -> keine „ausgeblieben"-Signale (keine Fehlalarme).
      return [];
    }
  }

  const missed: MissedRecurring[] = [];

  for (const item of input.items) {
    if (item.occurrences < 3) continue;

    const interval = Math.max(1, item.intervalDays);
    const grace = Math.max(4, interval * 0.25);
    const expectedMs = Date.parse(`${item.expectedDate}T00:00:00.000Z`);
    const lastMs = Date.parse(`${item.lastDate}T00:00:00.000Z`);
    if (!Number.isFinite(expectedMs) || !Number.isFinite(lastMs)) continue;

    const overdueDays = (nowMs - expectedMs) / DAY_MS;
    const sinceLastDays = (nowMs - lastMs) / DAY_MS;

    if (overdueDays <= grace) continue; // noch im Fenster
    if (sinceLastDays > interval * 3) continue; // Serie ist längst beendet, nicht „ausgeblieben"

    missed.push({
      seriesKey: item.key,
      title: item.title,
      kind: item.kind,
      direction: item.direction,
      lastDate: item.lastDate,
      expectedByDate: new Date(expectedMs + grace * DAY_MS).toISOString().slice(0, 10),
      daysOverdue: Math.round(overdueDays - grace),
    });
  }

  missed.sort((left, right) => right.daysOverdue - left.daysOverdue);
  return missed;
}
