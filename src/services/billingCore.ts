/**
 * Reiner Kern für die künftige Kauf-Verifizierung (Billing Readiness).
 *
 * WICHTIG – der Vertrag, der sich nie ändert:
 *   Ein Kauf-Claim des Clients IST KEIN Premium-Entitlement.
 *   Premium entsteht ausschließlich aus serverseitig verifiziertem Zustand.
 *
 * Dieser Kern integriert KEINE Billing-Bibliothek und baut KEINEN Checkout.
 * Er definiert die Datenformen und die deterministischen Regeln, damit ein
 * späterer echter Kauf (Google Play Billing / RevenueCat → Server-Verifizierung
 * → `user_subscriptions`) ohne Architektur-Umbau andocken kann.
 *
 * Nur `import type` – testbar unter `node --experimental-strip-types`.
 */

export type EntitlementSourceKind =
  | 'superuser'
  | 'coupon'
  | 'admin'
  | 'google_play'
  | 'app_store'
  | 'revenuecat'
  | 'store'
  | 'migration';

export type PurchasePlatform = 'google_play' | 'app_store' | 'revenuecat';

export type BillingInterval = 'monthly' | 'yearly';

// ---------------------------------------------------------------------------
// Produktkatalog – konfigurierbar, keine erfundenen aktiven Preise
// ---------------------------------------------------------------------------

export type PremiumProduct = {
  id: string;
  interval: BillingInterval;
  /** Play-Console Basisplan-/Produkt-ID (final erst mit Store-Setup). */
  googlePlayProductId: string;
  /** App-Store-Connect Produkt-ID (final erst mit StoreKit-Setup). */
  appStoreProductId: string;
  /** RevenueCat-Paket-Bezeichner (final erst mit RevenueCat-Setup). */
  revenueCatPackageId: string;
};

export const PREMIUM_PRODUCTS: readonly PremiumProduct[] = [
  {
    id: 'premium_monthly',
    interval: 'monthly',
    googlePlayProductId: 'premium.monthly',
    appStoreProductId: 'premium.monthly',
    revenueCatPackageId: '$rc_monthly',
  },
  {
    id: 'premium_yearly',
    interval: 'yearly',
    googlePlayProductId: 'premium.yearly',
    appStoreProductId: 'premium.yearly',
    revenueCatPackageId: '$rc_annual',
  },
];

/** Store-Produkt-ID einer Plattform → interner Produktschlüssel (oder null). */
export function productIdForPlatform(
  platform: PurchasePlatform,
  storeProductId: string,
): string | null {
  const match = PREMIUM_PRODUCTS.find((product) => {
    if (product.id === storeProductId) return true;
    if (platform === 'google_play') return product.googlePlayProductId === storeProductId;
    if (platform === 'app_store') return product.appStoreProductId === storeProductId;
    return product.revenueCatPackageId === storeProductId;
  });
  return match ? match.id : null;
}

export type PriceConfig = {
  currency: string;
  monthlyMinor: number;
  yearlyMinor: number;
  /** Bezugsquelle der Preise – Store-Katalog ist am Ende die Wahrheit. */
  source: 'remote_config' | 'store_catalog';
};

/**
 * Es gibt noch keine echten Preise. `null` bedeutet: die UI zeigt eine ehrliche
 * „Preise folgen mit der Kauffreigabe"-Zeile statt einer erfundenen Zahl.
 */
export const PREMIUM_PRICING: PriceConfig | null = null;

export function formatPriceLine(config: PriceConfig | null): string {
  if (!config) {
    return 'Preise folgen mit der Kauffreigabe im Google Play Store.';
  }
  const fmt = (minor: number) =>
    `${(Math.trunc(minor) / 100).toFixed(2).replace('.', ',')} ${config.currency}`;
  return `${fmt(config.monthlyMinor)} / Monat · ${fmt(config.yearlyMinor)} / Jahr`;
}

// ---------------------------------------------------------------------------
// Kauf-Verifizierung – Formen für den späteren Server-Endpunkt
// ---------------------------------------------------------------------------

export type PurchaseVerificationRequest = {
  platform: PurchasePlatform;
  productId: string;
  /** Play: purchaseToken · RevenueCat: app_user_id/entitlement-Referenz. */
  purchaseToken: string;
  /** Optionale, nicht-personenbezogene Konto-Verknüpfung (Play obfuscatedAccountId). */
  accountRef?: string;
};

export type VerifiedEntitlement = {
  plan: 'premium';
  source: EntitlementSourceKind;
  expiresAt: string | null;
  permanent: boolean;
  autoRenewing: boolean;
  verifiedAt: string;
};

export type PurchaseVerificationResult =
  | { ok: true; entitlement: VerifiedEntitlement }
  | {
      ok: false;
      reason: 'invalid_token' | 'expired' | 'refunded' | 'on_hold' | 'platform_unavailable' | 'not_configured';
    };

const PURCHASE_PLATFORMS: readonly PurchasePlatform[] = ['google_play', 'app_store', 'revenuecat'];

/** Grundprüfung einer Anfrage, bevor sie überhaupt an den Server geht. */
export function isWellFormedPurchaseRequest(request: PurchaseVerificationRequest): boolean {
  if (!PURCHASE_PLATFORMS.includes(request.platform)) return false;
  if (typeof request.purchaseToken !== 'string' || request.purchaseToken.trim().length < 8) return false;
  return productIdForPlatform(request.platform, request.productId) != null;
}

// ---------------------------------------------------------------------------
// Entitlement-Präzedenz – „nie eine längere durch eine kürzere ersetzen"
// ---------------------------------------------------------------------------

export type EntitlementCandidate = {
  source: EntitlementSourceKind;
  /** ISO-Zeitstempel oder null bei permanent. */
  expiresAt: string | null;
  permanent?: boolean;
  /** Nur aktive Kandidaten zählen (verifiziert, nicht widerrufen). */
  active?: boolean;
};

export type ResolvedEntitlement = {
  isPremium: boolean;
  isSuperuser: boolean;
  source: EntitlementSourceKind | 'none';
  premiumExpiresAt: string | null;
  permanent: boolean;
};

/**
 * Deterministische Zusammenführung mehrerer Entitlement-Quellen:
 *
 *  1. Superuser (Rolle) schlägt alles – kein Ablauf.
 *  2. Sonst gewinnt der Kandidat mit dem SPÄTESTEN Ablauf; `permanent` schlägt
 *     jedes Datum. Ein Coupon oder Admin-Grant verlängert dadurch effektiv,
 *     verkürzt aber nie eine laufende bezahlte Laufzeit.
 *  3. Abgelaufene / inaktive Kandidaten zählen nicht.
 */
export function resolveEntitlement(
  candidates: readonly EntitlementCandidate[],
  now: Date = new Date(),
): ResolvedEntitlement {
  if (candidates.some((candidate) => candidate.source === 'superuser' && candidate.active !== false)) {
    return { isPremium: true, isSuperuser: true, source: 'superuser', premiumExpiresAt: null, permanent: true };
  }

  const nowMs = now.getTime();
  const viable = candidates.filter((candidate) => {
    if (candidate.active === false) return false;
    if (candidate.source === 'superuser') return false;
    if (candidate.permanent) return true;
    return candidate.expiresAt != null && Date.parse(candidate.expiresAt) > nowMs;
  });

  if (viable.length === 0) {
    return { isPremium: false, isSuperuser: false, source: 'none', premiumExpiresAt: null, permanent: false };
  }

  const permanentWinner = viable.find((candidate) => candidate.permanent);
  if (permanentWinner) {
    return {
      isPremium: true,
      isSuperuser: false,
      source: permanentWinner.source,
      premiumExpiresAt: null,
      permanent: true,
    };
  }

  const best = viable.reduce((winner, candidate) =>
    Date.parse(candidate.expiresAt as string) > Date.parse(winner.expiresAt as string) ? candidate : winner,
  );
  return {
    isPremium: true,
    isSuperuser: false,
    source: best.source,
    premiumExpiresAt: best.expiresAt,
    permanent: false,
  };
}

/**
 * Wie ein neu verifizierter Kauf mit einem bestehenden Ablauf zusammengeführt
 * wird: additive Verlängerung ab dem späteren der beiden Zeitpunkte
 * (now, bestehender Ablauf). Spiegelt `redeem_premium_coupon` serverseitig.
 */
export function mergePurchaseExpiry(
  existingExpiresAt: string | null,
  addedDurationDays: number,
  now: Date = new Date(),
): string {
  const existingMs = existingExpiresAt ? Date.parse(existingExpiresAt) : 0;
  const base = Math.max(now.getTime(), Number.isFinite(existingMs) ? existingMs : 0);
  return new Date(base + addedDurationDays * 86_400_000).toISOString();
}
