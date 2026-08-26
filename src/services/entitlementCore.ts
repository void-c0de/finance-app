export type ProductRole = 'user' | 'superuser';
export type ProductPlan = 'standard' | 'premium';

export type ProductAccess = {
  role: ProductRole;
  plan: ProductPlan;
  isPremium: boolean;
  isSuperuser: boolean;
  premiumExpiresAt: string | null;
  source: 'none' | 'coupon' | 'admin' | 'store' | 'migration' | 'superuser';
};

export type ProductCapability =
  | 'core_finance'
  | 'basic_planning'
  | 'advanced_planning'
  | 'advanced_category_rules'
  | 'premium_analytics'
  | 'advanced_exports'
  | 'coupon_admin'
  | 'user_entitlement_admin'
  | 'release_admin'
  | 'support_diagnostics';

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
      : row.source === 'coupon' || row.source === 'admin' || row.source === 'store' || row.source === 'migration'
        ? row.source
        : 'none',
  };
}

export function hasCapability(access: ProductAccess, capability: ProductCapability): boolean {
  if (capability === 'core_finance' || capability === 'basic_planning') return true;
  if (ADMIN_CAPABILITIES.has(capability)) return access.isSuperuser;
  if (PREMIUM_CAPABILITIES.has(capability)) return access.isPremium;
  return false;
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
