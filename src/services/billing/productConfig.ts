/**
 * Store-Produkt-Konfiguration — OHNE erfundene Produkt-IDs.
 *
 * Die echten Play-/App-Store-Produkt-IDs kommen erst mit dem Store-Setup und
 * werden dann über Umgebungsvariablen gesetzt (Produkt-IDs sind KEINE Secrets,
 * aber sie werden auch nicht erfunden):
 *
 *   EXPO_PUBLIC_PREMIUM_MONTHLY_ID
 *   EXPO_PUBLIC_PREMIUM_YEARLY_ID
 *
 * Ohne diese Werte ist Billing schlicht `not_configured`: kein Kauf-Button,
 * kein Absturz, die „Preise folgen"-Zeile bleibt stehen.
 *
 * Nur `import type`.
 */
import type { BillingInterval } from '@/services/billingCore';

export type ConfiguredProduct = {
  /** Interner Schlüssel (`premium_monthly` / `premium_yearly`). */
  id: string;
  interval: BillingInterval;
  /** Die tatsächliche Store-Produkt-ID (Play-Basisplan bzw. App-Store-Produkt). */
  storeProductId: string;
};

function trimmed(value: string | undefined): string {
  return (value ?? '').trim();
}

/**
 * Liefert die konfigurierten Produkte. Leeres Array = nichts eingerichtet.
 * Beide IDs müssen gesetzt sein, sonst gilt Billing als nicht eingerichtet
 * (ein Katalog mit nur einem Plan wäre ein Konfigurationsfehler).
 */
export function getConfiguredProducts(
  env: Record<string, string | undefined> = process.env,
): ConfiguredProduct[] {
  const monthly = trimmed(env.EXPO_PUBLIC_PREMIUM_MONTHLY_ID);
  const yearly = trimmed(env.EXPO_PUBLIC_PREMIUM_YEARLY_ID);
  if (!monthly || !yearly) return [];
  return [
    { id: 'premium_monthly', interval: 'monthly', storeProductId: monthly },
    { id: 'premium_yearly', interval: 'yearly', storeProductId: yearly },
  ];
}

export function isBillingConfigured(env?: Record<string, string | undefined>): boolean {
  return getConfiguredProducts(env).length > 0;
}

/** Store-Produkt-ID → interner Schlüssel (oder null). */
export function internalIdForStoreProduct(
  storeProductId: string,
  env?: Record<string, string | undefined>,
): string | null {
  const match = getConfiguredProducts(env).find((product) => product.storeProductId === storeProductId);
  return match ? match.id : null;
}
