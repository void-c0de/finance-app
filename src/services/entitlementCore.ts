export type ProductRole = 'user' | 'superuser';
export type ProductPlan = 'standard' | 'premium';

export type ProductAccess = {
  role: ProductRole;
  plan: ProductPlan;
  isPremium: boolean;
  isSuperuser: boolean;
  premiumExpiresAt: string | null;
  source: 'none' | 'coupon' | 'admin' | 'google_play' | 'revenuecat' | 'store' | 'migration' | 'superuser';
};

export type ProductCapability =
  | 'core_finance'
  | 'manual_categorization'
  | 'basic_planning'
  | 'advanced_planning'
  | 'advanced_category_rules'
  | 'premium_analytics'
  | 'advanced_exports'
  | 'full_finance_export'
  | 'premium_themes'
  | 'coupon_admin'
  | 'user_entitlement_admin'
  | 'release_admin'
  | 'support_diagnostics';

export type CapabilityAvailability = 'standard' | 'premium' | 'superuser';

export const PRODUCT_CAPABILITIES: readonly {
  id: ProductCapability;
  label: string;
  availability: CapabilityAvailability;
}[] = [
  { id: 'core_finance', label: 'Konten, Umsätze und Basis-Dashboard', availability: 'standard' },
  { id: 'manual_categorization', label: 'Manuelle Kategorien und Korrekturen', availability: 'standard' },
  { id: 'basic_planning', label: 'Manuelle Sparziele und Basisplanung', availability: 'standard' },
  { id: 'advanced_planning', label: 'Automatische und konto-verknüpfte Sparziele', availability: 'premium' },
  { id: 'advanced_category_rules', label: 'Automatische Händlerregeln', availability: 'premium' },
  { id: 'premium_analytics', label: 'Monatsvergleiche, Trends, Prognosen und Abo-Analysen', availability: 'premium' },
  { id: 'advanced_exports', label: 'Erweiterte Exporte (Budgets, Sparziele, Abos)', availability: 'premium' },
  { id: 'full_finance_export', label: 'Vollständiger Finanz-Export als Backup', availability: 'premium' },
  { id: 'premium_themes', label: 'Premium-Designs', availability: 'premium' },
  { id: 'coupon_admin', label: 'Coupon-Verwaltung', availability: 'superuser' },
  { id: 'user_entitlement_admin', label: 'Premium-Verwaltung', availability: 'superuser' },
  { id: 'release_admin', label: 'Release-Verwaltung', availability: 'superuser' },
  { id: 'support_diagnostics', label: 'Support-Diagnose', availability: 'superuser' },
];

export const STANDARD_ACCESS: ProductAccess = {
  role: 'user',
  plan: 'standard',
  isPremium: false,
  isSuperuser: false,
  premiumExpiresAt: null,
  source: 'none',
};

const PREMIUM_CAPABILITIES = new Set<ProductCapability>([
  'advanced_planning',
  'advanced_category_rules',
  'premium_analytics',
  'advanced_exports',
  'full_finance_export',
  'premium_themes',
]);

const ADMIN_CAPABILITIES = new Set<ProductCapability>([
  'coupon_admin',
  'user_entitlement_admin',
  'release_admin',
  'support_diagnostics',
]);

const ALWAYS_ON = new Set<ProductCapability>([
  'core_finance',
  'manual_categorization',
  'basic_planning',
]);

export function normalizeProductAccess(value: unknown, now = new Date()): ProductAccess {
  if (!value || typeof value !== 'object') return STANDARD_ACCESS;
  const row = value as Record<string, unknown>;
  const isSuperuser = row.isSuperuser === true || row.role === 'superuser';
  const expiresAt = typeof row.premiumExpiresAt === 'string' ? row.premiumExpiresAt : null;
  const notExpired = !expiresAt || new Date(expiresAt).getTime() > now.getTime();
  const isPremium = isSuperuser || (row.isPremium === true && notExpired);
  return {
    role: isSuperuser ? 'superuser' : 'user',
    plan: isPremium ? 'premium' : 'standard',
    isPremium,
    isSuperuser,
    premiumExpiresAt: isSuperuser ? null : expiresAt,
    source: isSuperuser
      ? 'superuser'
      : row.source === 'coupon' || row.source === 'admin' || row.source === 'google_play' || row.source === 'revenuecat' || row.source === 'store' || row.source === 'migration'
        ? row.source
        : 'none',
  };
}

export function hasCapability(access: ProductAccess, capability: ProductCapability): boolean {
  if (ALWAYS_ON.has(capability)) return true;
  if (ADMIN_CAPABILITIES.has(capability)) return access.isSuperuser;
  if (PREMIUM_CAPABILITIES.has(capability)) return access.isPremium;
  return false;
}

export function canConfigureGoalTracking(
  access: ProductAccess,
  mode: 'manual' | 'transaction_rule' | 'account_balance',
): boolean {
  return mode === 'manual' || hasCapability(access, 'advanced_planning');
}

export function extendPremiumUntil(
  currentExpiry: string | null,
  durationDays: number,
  now = new Date(),
): string {
  const current = currentExpiry ? new Date(currentExpiry) : now;
  const base = current.getTime() > now.getTime() ? current : now;
  return new Date(base.getTime() + durationDays * 86_400_000).toISOString();
}

// ---------------------------------------------------------------------------
// Quotas — one source of truth, remote-config-ready shape
// ---------------------------------------------------------------------------

export type QuotaKey = 'activeBudgets' | 'activeManualGoals';

/**
 * Standard-Obergrenzen. `Infinity` = unbegrenzt. Die Form ist bewusst so
 * gewählt, dass eine spätere Fernkonfiguration nur die Zahlen ersetzen muss.
 */
export const PRODUCT_QUOTAS: Record<QuotaKey, { standard: number; premium: number; label: string }> = {
  activeBudgets: { standard: 2, premium: Infinity, label: 'Budgets' },
  activeManualGoals: { standard: 2, premium: Infinity, label: 'manuelle Sparziele' },
};

export function getQuotaLimit(access: ProductAccess, key: QuotaKey): number {
  const quota = PRODUCT_QUOTAS[key];
  return access.isPremium ? quota.premium : quota.standard;
}

export type QuotaState = {
  key: QuotaKey;
  limit: number;
  used: number;
  remaining: number;
  /** true, sobald keine weitere Erstellung erlaubt ist. */
  reached: boolean;
  unlimited: boolean;
  /**
   * true, wenn ein bestehender Standard-Nutzer bereits ÜBER dem neuen Limit
   * liegt – seine Objekte bleiben, nur neue brauchen Premium (Grandfathering).
   */
  grandfathered: boolean;
};

export function quotaState(access: ProductAccess, key: QuotaKey, used: number): QuotaState {
  const limit = getQuotaLimit(access, key);
  const unlimited = !Number.isFinite(limit);
  return {
    key,
    limit,
    used,
    remaining: unlimited ? Infinity : Math.max(0, limit - used),
    reached: !unlimited && used >= limit,
    unlimited,
    grandfathered: !unlimited && used > limit,
  };
}

export function canCreateWithinQuota(access: ProductAccess, key: QuotaKey, currentCount: number): boolean {
  return !quotaState(access, key, currentCount).reached;
}

// ---------------------------------------------------------------------------
// Centralized upgrade copy — no duplicated / contradictory strings
// ---------------------------------------------------------------------------

export type PremiumPillarId = 'automate' | 'understand' | 'plan' | 'personalize' | 'data';

export const PREMIUM_PILLARS: readonly {
  id: PremiumPillarId;
  title: string;
  subtitle: string;
  points: readonly string[];
}[] = [
  {
    id: 'automate',
    title: 'Automatisieren',
    subtitle: 'Weniger jeden Monat neu nachtragen.',
    points: [
      'Händler künftig automatisch der richtigen Kategorie zuordnen',
      'Sparziele mit einem echten Sparkonto verknüpfen',
      'Regelbasierte Sparbeiträge aus passenden Umsätzen',
    ],
  },
  {
    id: 'understand',
    title: 'Verstehen',
    subtitle: 'Mehr erkennen, weniger selbst rechnen.',
    points: [
      'Monatsvergleiche und Verlauf über mehrere Monate',
      'Kategorie-Trends und größte Veränderungen',
      'Abo-Preisänderungen und Hinweise auf ausgebliebene Zahlungen',
      '30-/60-/90-Tage-Cashflow-Prognose',
    ],
  },
  {
    id: 'plan',
    title: 'Planen',
    subtitle: 'Deine Finanzen ein paar Schritte voraus.',
    points: [
      'Unbegrenzt viele Budgets',
      'Unbegrenzt viele Sparziele',
      'Erweiterte, automatische Planung',
    ],
  },
  {
    id: 'personalize',
    title: 'Personalisieren',
    subtitle: 'Die App fühlt sich nach dir an.',
    points: ['Premium-Designs mit abgestimmten Farbwelten'],
  },
  {
    id: 'data',
    title: 'Daten',
    subtitle: 'Alles exportieren, wenn du willst.',
    points: [
      'Budgets, Sparziele und Abos als CSV',
      'Vollständiges Finanz-Backup als Datei',
    ],
  },
];

export type PremiumGateContext =
  | 'budgets_quota'
  | 'goals_quota'
  | 'category_rules'
  | 'account_linked_goal'
  | 'transaction_rule_goal'
  | 'analytics'
  | 'forecast'
  | 'advanced_export'
  | 'full_export'
  | 'premium_theme'
  | 'recurring_intelligence';

export const PREMIUM_GATE_COPY: Record<
  PremiumGateContext,
  { title: string; body: string; cta: string; pillar: PremiumPillarId }
> = {
  budgets_quota: {
    title: 'Mehr Budgets mit Premium',
    body: 'Mit Premium erstellst du unbegrenzt viele Budgets und vergleichst deine Ausgaben über mehrere Monate.',
    cta: 'Premium ansehen',
    pillar: 'plan',
  },
  goals_quota: {
    title: 'Mehr Sparziele mit Premium',
    body: 'Mit Premium legst du beliebig viele Sparziele an – manuell oder automatisch mit deinem Sparkonto verknüpft.',
    cta: 'Premium ansehen',
    pillar: 'plan',
  },
  category_rules: {
    title: 'Automatisch statt jeden Monat neu',
    body: 'Mit Premium wird aus dieser Zuordnung eine Regel: passende Händler landen künftig automatisch in der richtigen Kategorie.',
    cta: 'Premium ansehen',
    pillar: 'automate',
  },
  account_linked_goal: {
    title: 'Sparziel mit deinem Konto verbinden',
    body: 'Mit Premium synchronisiert sich dieses Sparziel automatisch mit dem Stand deines Sparkontos – ganz ohne manuelle Beiträge.',
    cta: 'Premium ansehen',
    pillar: 'automate',
  },
  transaction_rule_goal: {
    title: 'Automatische Sparbeiträge',
    body: 'Mit Premium erkennt die App passende Umsätze und bucht sie automatisch als Beitrag auf dieses Sparziel.',
    cta: 'Premium ansehen',
    pillar: 'automate',
  },
  analytics: {
    title: 'Sieh, wie sich deine Finanzen entwickeln',
    body: 'Mit Premium vergleichst du Monate, erkennst Trends je Kategorie und siehst Abo-Preisänderungen auf einen Blick.',
    cta: 'Premium ansehen',
    pillar: 'understand',
  },
  forecast: {
    title: 'Deine nächsten 30–90 Tage',
    body: 'Mit Premium siehst du, wie sich deine bekannten Einnahmen und Fixkosten auf die kommenden Wochen auswirken.',
    cta: 'Premium ansehen',
    pillar: 'understand',
  },
  advanced_export: {
    title: 'Mehr als nur Umsätze exportieren',
    body: 'Mit Premium exportierst du auch Budgets, Sparziele und deine wiederkehrenden Zahlungen als CSV.',
    cta: 'Premium ansehen',
    pillar: 'data',
  },
  full_export: {
    title: 'Vollständiges Finanz-Backup',
    body: 'Mit Premium sicherst du deinen gesamten Finanzstand als eine Datei – zum Aufbewahren oder für später.',
    cta: 'Premium ansehen',
    pillar: 'data',
  },
  premium_theme: {
    title: 'Ein Design nur für dich',
    body: 'Dieses Design gehört zu Premium. System, Hell, Dunkel und AMOLED bleiben immer kostenlos.',
    cta: 'Premium ansehen',
    pillar: 'personalize',
  },
  recurring_intelligence: {
    title: 'Tiefer in deine Abos schauen',
    body: 'Erkannte Abos und die nächste Zahlung siehst du auch im Standard. Preisverlauf, ausgebliebene Zahlungen und Fixkosten-Trends gehören zu Premium.',
    cta: 'Premium ansehen',
    pillar: 'understand',
  },
};
