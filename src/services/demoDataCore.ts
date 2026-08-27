/**
 * Deterministischer, offensichtlich synthetischer Demo-Datensatz.
 *
 * Zweck: Store-/QA-Screenshots und Review-Demos OHNE echte Finanzdaten.
 *
 * Grundsätze:
 *  - Rein & testbar (nur `import type`), keine DB, kein Zufall.
 *  - Alle erzeugten IDs beginnen mit `demo-` → `clearDemoData()` entfernt
 *    ausschließlich diese Zeilen, echte Daten werden nie angetastet.
 *  - Werte sind erkennbar „rund"/synthetisch; Gegenparteien tragen „Demo".
 *  - 6 Monate Historie, damit Analysen, Trends und Prognose Inhalt haben.
 *  - Enthält die Standard-Kategorien (echte `cat-*`-IDs, NICHT `demo-`), damit
 *    die FK-Prüfung des Importers greift; per LWW werden sie nicht verändert.
 */

import type { TransactionDirection } from '../types/finance';

export const DEMO_ID_PREFIX = 'demo-';

type Row = Record<string, string | number | boolean | null>;

export type DemoDataset = {
  accounts: Row[];
  transactions: Row[];
  categories: Row[];
  categoryRules: Row[];
  budgets: Row[];
  savingsGoals: Row[];
  goalContributions: Row[];
  recurringSeries: Row[];
  bankConnections: Row[];
};

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** ISO-Datum (YYYY-MM-DD) für Tag `day` im Monat `monthsAgo` vor `ref`. */
function dateFor(ref: Date, monthsAgo: number, day: number): string {
  const d = new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth() - monthsAgo, 1));
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  const safeDay = Math.min(day, lastDay);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(safeDay)}`;
}

function iso(ref: Date, monthsAgo: number, day: number): string {
  return `${dateFor(ref, monthsAgo, day)}T09:00:00.000Z`;
}

const CATEGORIES: Row[] = [
  { id: 'cat-income', name: 'Einnahmen', icon: '↓', isIncomeCategory: true },
  { id: 'cat-housing', name: 'Wohnen', icon: '⌂', isIncomeCategory: false },
  { id: 'cat-groceries', name: 'Lebensmittel', icon: '●', isIncomeCategory: false },
  { id: 'cat-subscriptions', name: 'Abos & Dienste', icon: '↻', isIncomeCategory: false },
  { id: 'cat-telecom', name: 'Telefon & Internet', icon: '☎', isIncomeCategory: false },
  { id: 'cat-utilities', name: 'Strom & Energie', icon: '⚡', isIncomeCategory: false },
  { id: 'cat-mobility', name: 'Mobilität', icon: '⛽', isIncomeCategory: false },
  { id: 'cat-dining', name: 'Restaurant & Café', icon: '☕', isIncomeCategory: false },
  { id: 'cat-shopping', name: 'Shopping', icon: '☺', isIncomeCategory: false },
  { id: 'cat-health', name: 'Gesundheit', icon: '＋', isIncomeCategory: false },
  { id: 'cat-other', name: 'Sonstiges', icon: '•', isIncomeCategory: false },
];

type TxTemplate = {
  key: string;
  day: number;
  amountMinor: number | ((monthsAgo: number) => number);
  direction: TransactionDirection;
  description: string;
  counterparty: string;
  categoryId: string | null;
  recurring?: boolean;
  /** nur in bestimmten Monaten (0 = aktueller Monat). */
  onlyMonths?: number[];
  account?: 'checking' | 'card';
};

// Monatlich wiederkehrende Vorlagen. Streaming steigt im Preis (Demo für die
// Abo-Preisänderungs-Erkennung), Strom variiert leicht.
const MONTHLY: TxTemplate[] = [
  { key: 'salary', day: 1, amountMinor: 312000, direction: 'income', description: 'Gehalt', counterparty: 'Demo Arbeitgeber GmbH', categoryId: 'cat-income', recurring: true },
  { key: 'rent', day: 2, amountMinor: 118000, direction: 'expense', description: 'Miete', counterparty: 'Demo Hausverwaltung', categoryId: 'cat-housing', recurring: true },
  {
    key: 'streaming-video',
    day: 6,
    amountMinor: (m) => (m >= 3 ? 1299 : 1499), // Preiserhöhung vor 3 Monaten
    direction: 'expense',
    description: 'Video-Streaming',
    counterparty: 'Demo Streaming',
    categoryId: 'cat-subscriptions',
    recurring: true,
  },
  { key: 'streaming-music', day: 7, amountMinor: 1099, direction: 'expense', description: 'Musik-Streaming', counterparty: 'Demo Music', categoryId: 'cat-subscriptions', recurring: true },
  { key: 'phone', day: 9, amountMinor: 2999, direction: 'expense', description: 'Mobilfunk', counterparty: 'Demo Mobilfunk', categoryId: 'cat-telecom', recurring: true },
  { key: 'internet', day: 10, amountMinor: 3990, direction: 'expense', description: 'Internet & Festnetz', counterparty: 'Demo Netz', categoryId: 'cat-telecom', recurring: true },
  { key: 'power', day: 14, amountMinor: (m) => 7400 + (m % 2 === 0 ? 300 : -200), direction: 'expense', description: 'Stromabschlag', counterparty: 'Demo Energie', categoryId: 'cat-utilities', recurring: true },
  { key: 'insurance', day: 15, amountMinor: 4210, direction: 'expense', description: 'Haftpflicht & Hausrat', counterparty: 'Demo Versicherung', categoryId: 'cat-other', recurring: true },
  { key: 'gym', day: 16, amountMinor: 2990, direction: 'expense', description: 'Fitnessstudio', counterparty: 'Demo Fitness', categoryId: 'cat-health', recurring: true },
  { key: 'savings-transfer', day: 3, amountMinor: 25000, direction: 'expense', description: 'Sparen: Dauerauftrag', counterparty: 'Demo Tagesgeld', categoryId: null, recurring: true },
];

// Unregelmäßige Ausgaben (variieren pro Monat leicht über den Multiplikator).
const VARIABLE: TxTemplate[] = [
  { key: 'grocery-1', day: 4, amountMinor: 5240, direction: 'expense', description: 'Wocheneinkauf', counterparty: 'Demo Supermarkt', categoryId: 'cat-groceries' },
  { key: 'grocery-2', day: 11, amountMinor: 6180, direction: 'expense', description: 'Wocheneinkauf', counterparty: 'Demo Supermarkt', categoryId: 'cat-groceries' },
  { key: 'grocery-3', day: 19, amountMinor: 4790, direction: 'expense', description: 'Wocheneinkauf', counterparty: 'Demo Supermarkt', categoryId: 'cat-groceries' },
  { key: 'grocery-4', day: 26, amountMinor: 5530, direction: 'expense', description: 'Wocheneinkauf', counterparty: 'Demo Biomarkt', categoryId: 'cat-groceries' },
  { key: 'drugstore', day: 8, amountMinor: 2140, direction: 'expense', description: 'Drogerie', counterparty: 'Demo Drogerie', categoryId: 'cat-health' },
  { key: 'fuel', day: 12, amountMinor: 7120, direction: 'expense', description: 'Tanken', counterparty: 'Demo Tankstelle', categoryId: 'cat-mobility' },
  { key: 'transit', day: 5, amountMinor: 4900, direction: 'expense', description: 'Nahverkehr Monatsticket', counterparty: 'Demo Verkehr', categoryId: 'cat-mobility' },
  { key: 'restaurant', day: 17, amountMinor: 4360, direction: 'expense', description: 'Abendessen', counterparty: 'Demo Restaurant', categoryId: 'cat-dining' },
  { key: 'cafe', day: 22, amountMinor: 980, direction: 'expense', description: 'Café', counterparty: 'Demo Rösterei', categoryId: 'cat-dining' },
  { key: 'shopping', day: 20, amountMinor: 8990, direction: 'expense', description: 'Online-Bestellung', counterparty: 'Demo Versand', categoryId: 'cat-shopping', account: 'card' },
  { key: 'clothes', day: 24, amountMinor: 6450, direction: 'expense', description: 'Kleidung', counterparty: 'Demo Mode', categoryId: 'cat-shopping', account: 'card', onlyMonths: [0, 2, 4] },
  { key: 'refund', day: 25, amountMinor: 3299, direction: 'income', description: 'Rückerstattung', counterparty: 'Demo Versand', categoryId: 'cat-shopping', onlyMonths: [1, 3] },
  { key: 'pharmacy', day: 13, amountMinor: 1780, direction: 'expense', description: 'Apotheke', counterparty: 'Demo Apotheke', categoryId: 'cat-health', onlyMonths: [0, 3, 5] },
  { key: 'gift', day: 27, amountMinor: 4200, direction: 'expense', description: 'Geschenk', counterparty: 'Demo Buchhandlung', categoryId: 'cat-other', onlyMonths: [2] },
];

const HISTORY_MONTHS = 6; // aktueller Monat + 5 zurück

function amount(t: TxTemplate, monthsAgo: number): number {
  return typeof t.amountMinor === 'function' ? t.amountMinor(monthsAgo) : t.amountMinor;
}

/** Baut den kompletten Demo-Datensatz relativ zu `now`. */
export function buildDemoDataset(now: Date = new Date()): DemoDataset {
  const connId = `${DEMO_ID_PREFIX}conn-1`;
  const checkingId = `${DEMO_ID_PREFIX}acc-checking`;
  const savingsId = `${DEMO_ID_PREFIX}acc-savings`;
  const cardId = `${DEMO_ID_PREFIX}acc-card`;
  const currentDay = now.getUTCDate();

  const bankConnections: Row[] = [
    {
      id: connId,
      providerId: 'mock',
      externalConnectionId: 'demo-connection',
      institutionId: 'demo-bank',
      institutionName: 'Demo Bank',
      isDemo: true,
    },
  ];

  const accounts: Row[] = [
    { id: checkingId, bankConnectionId: connId, providerId: 'mock', externalAccountId: 'demo:checking', name: 'Girokonto', iban: 'DE00 0000 0000 0000 0000 00', currency: 'EUR', balanceMinor: 214300, type: 'checking', institutionName: 'Demo Bank' },
    { id: savingsId, bankConnectionId: connId, providerId: 'mock', externalAccountId: 'demo:savings', name: 'Tagesgeld', iban: 'DE00 0000 0000 0000 0000 01', currency: 'EUR', balanceMinor: 640000, type: 'savings', institutionName: 'Demo Bank' },
    { id: cardId, bankConnectionId: connId, providerId: 'mock', externalAccountId: 'demo:card', name: 'Kreditkarte', iban: null, currency: 'EUR', balanceMinor: -18450, type: 'credit', institutionName: 'Demo Bank' },
  ];

  const transactions: Row[] = [];
  const push = (t: TxTemplate, monthsAgo: number) => {
    if (monthsAgo === 0 && t.day > currentDay) return; // aktueller Monat: nur bis heute
    if (t.onlyMonths && !t.onlyMonths.includes(monthsAgo)) return;
    const accountId = t.account === 'card' ? cardId : checkingId;
    transactions.push({
      id: `${DEMO_ID_PREFIX}tx-${t.key}-${monthsAgo}`,
      accountId,
      externalTransactionId: `demo:${t.key}:${monthsAgo}`,
      amountMinor: amount(t, monthsAgo),
      currency: 'EUR',
      direction: t.direction,
      bookingDate: dateFor(now, monthsAgo, t.day),
      bookingStatus: 'booked',
      description: t.description,
      counterpartyName: t.counterparty,
      categoryId: t.categoryId,
      categorySource: t.categoryId ? 'auto' : 'none',
      isRecurring: Boolean(t.recurring),
    });
  };

  for (let m = HISTORY_MONTHS - 1; m >= 0; m -= 1) {
    for (const t of MONTHLY) push(t, m);
    for (const t of VARIABLE) push(t, m);
  }
  // Gegenbuchung Sparen → Tagesgeld (interne Umbuchung), monatlich
  for (let m = HISTORY_MONTHS - 1; m >= 0; m -= 1) {
    if (m === 0 && 3 > currentDay) continue;
    transactions.push({
      id: `${DEMO_ID_PREFIX}tx-savings-in-${m}`,
      accountId: savingsId,
      externalTransactionId: `demo:savings-in:${m}`,
      amountMinor: 25000,
      currency: 'EUR',
      direction: 'income',
      bookingDate: dateFor(now, m, 3),
      bookingStatus: 'booked',
      description: 'Sparen: Eingang',
      counterpartyName: 'Demo Girokonto',
      categoryId: null,
      categorySource: 'none',
      isRecurring: true,
    });
  }

  const budgets: Row[] = [
    { id: `${DEMO_ID_PREFIX}budget-groceries`, categoryId: 'cat-groceries', name: 'Lebensmittel', amountMinor: 55000, period: 'monthly' },
    { id: `${DEMO_ID_PREFIX}budget-dining`, categoryId: 'cat-dining', name: 'Restaurant & Café', amountMinor: 12000, period: 'monthly' },
    { id: `${DEMO_ID_PREFIX}budget-shopping`, categoryId: 'cat-shopping', name: 'Shopping', amountMinor: 15000, period: 'monthly' },
  ];

  const savingsGoals: Row[] = [
    {
      id: `${DEMO_ID_PREFIX}goal-emergency`,
      name: 'Notgroschen',
      description: 'Drei Nettogehälter als Puffer',
      targetAmountMinor: 900000,
      currentAmountMinor: 540000,
      startingAmountMinor: 400000,
      currency: 'EUR',
      targetDate: dateFor(now, -8, 1),
      linkedAccountId: null,
      ruleKeyword: null,
      trackingMode: 'manual',
      status: 'active',
    },
    {
      id: `${DEMO_ID_PREFIX}goal-vacation`,
      name: 'Urlaub',
      description: 'Sommerreise',
      targetAmountMinor: 200000,
      currentAmountMinor: 90000,
      startingAmountMinor: 0,
      currency: 'EUR',
      targetDate: dateFor(now, -5, 1),
      linkedAccountId: null,
      ruleKeyword: null,
      trackingMode: 'manual',
      status: 'active',
    },
  ];

  const goalContributions: Row[] = [];
  for (let m = HISTORY_MONTHS - 1; m >= 1; m -= 1) {
    goalContributions.push({
      id: `${DEMO_ID_PREFIX}gc-emergency-${m}`,
      goalId: `${DEMO_ID_PREFIX}goal-emergency`,
      amountMinor: 20000,
      source: 'manual',
      sourceTransactionId: null,
      note: 'Monatliche Rücklage',
      occurredAt: iso(now, m, 3),
    });
    goalContributions.push({
      id: `${DEMO_ID_PREFIX}gc-vacation-${m}`,
      goalId: `${DEMO_ID_PREFIX}goal-vacation`,
      amountMinor: 18000,
      source: 'manual',
      sourceTransactionId: null,
      note: 'Urlaubskasse',
      occurredAt: iso(now, m, 12),
    });
  }

  const recurringSeries: Row[] = [
    { id: `${DEMO_ID_PREFIX}rs-video`, merchantName: 'Demo Streaming', kind: 'subscription', muted: false, userConfirmed: true, expectedAmountMinor: 1499, currency: 'EUR', cadence: 'monthly', note: null },
    { id: `${DEMO_ID_PREFIX}rs-music`, merchantName: 'Demo Music', kind: 'subscription', muted: false, userConfirmed: true, expectedAmountMinor: 1099, currency: 'EUR', cadence: 'monthly', note: null },
    { id: `${DEMO_ID_PREFIX}rs-gym`, merchantName: 'Demo Fitness', kind: 'bill', muted: false, userConfirmed: true, expectedAmountMinor: 2990, currency: 'EUR', cadence: 'monthly', note: null },
  ];

  const categoryRules: Row[] = [
    { id: `${DEMO_ID_PREFIX}rule-supermarkt`, name: 'Supermarkt → Lebensmittel', matchType: 'merchant_contains', matchValue: 'Demo Supermarkt', categoryId: 'cat-groceries', enabled: true, priority: 100 },
  ];

  return {
    accounts,
    transactions,
    categories: CATEGORIES,
    categoryRules,
    budgets,
    savingsGoals,
    goalContributions,
    recurringSeries,
    bankConnections,
  };
}

/** SQL-`LIKE`-Muster für alle Demo-Zeilen. */
export const DEMO_LIKE = `${DEMO_ID_PREFIX}%`;
