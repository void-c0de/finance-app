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
  { id: 'manual_categorization', label: 'Manuelle Kategorien', availability: 'standard' },
  { id: 'basic_planning', label: 'Manuelle Sparziele und Basisplanung', availability: 'standard' },
  { id: 'advanced_planning', label: 'Automatische und konto-verknüpfte Sparziele', availability: 'premium' },
  { id: 'advanced_category_rules', label: 'Automatische Händlerregeln', availability: 'premium' },
  { id: 'premium_analytics', label: 'Erweiterte Prognosen und Analysen', availability: 'premium' },
  { id: 'advanced_exports', label: 'Erweiterte Exporte', availability: 'premium' },
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
]);

const ADMIN_CAPABILITIES = new Set<ProductCapability>([
  'coupon_admin',
  'user_entitlement_admin',
  'release_admin',
  'support_diagnostics',
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
  if (capability === 'core_finance' || capability === 'manual_categorization' || capability === 'basic_planning') return true;
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
