/**
 * Provider-neutrale Client-Schnittstelle für In-App-Käufe.
 *
 * Verantwortung des Clients:
 *   - Produkte + lokalisierte Store-Preise abfragen
 *   - einen Kauf starten
 *   - den Kaufbeleg (Token/Receipt) an den Server reichen
 *   - „Käufe wiederherstellen"
 *
 * Der Client gewährt NIEMALS selbst Premium — Entitlement entsteht
 * ausschließlich aus `verify-purchase` → `apply_verified_subscription`.
 *
 * Aktuell gibt es keine native Billing-Bibliothek (weder Google Play Billing
 * noch StoreKit) und keine Store-Produkte. `nullBillingClient` liefert überall
 * ehrlich `available: false`. Sobald eine Bibliothek + Produkte existieren,
 * wird hier ein Android- bzw. iOS-Adapter eingehängt — die aufrufende UI
 * ändert sich nicht.
 */
import type { BillingInterval, PurchasePlatform } from '@/services/billingCore';
import { verifyPurchase, type VerifyPurchaseResult } from '@/services/billing';

export type StoreProduct = {
  /** Interner Produktschlüssel (`premium_monthly` / `premium_yearly`). */
  id: string;
  interval: BillingInterval;
  /** Vom Store gelieferter, bereits lokalisierter Preis-String (z. B. „3,99 €"). */
  localizedPrice: string;
  priceCurrencyCode: string;
  priceMinor: number;
};

export type PurchaseOutcome =
  | { kind: 'verified'; result: VerifyPurchaseResult }
  | { kind: 'cancelled' }
  | { kind: 'pending' }
  | { kind: 'unavailable'; reason: string };

export interface BillingClient {
  readonly platform: PurchasePlatform | 'none';
  /** Ist ein echter Store-Kaufweg verfügbar? */
  isAvailable(): Promise<boolean>;
  /** Produkte inkl. lokalisierter Preise; leer, solange kein Store-Setup existiert. */
  queryProducts(): Promise<StoreProduct[]>;
  /** Kauf starten; bei Erfolg wird der Beleg serverseitig verifiziert. */
  purchase(productId: string): Promise<PurchaseOutcome>;
  /** „Käufe wiederherstellen" — reicht vorhandene Belege erneut zur Server-Prüfung. */
  restorePurchases(): Promise<PurchaseOutcome>;
}

export const nullBillingClient: BillingClient = {
  platform: 'none',
  async isAvailable() {
    return false;
  },
  async queryProducts() {
    return [];
  },
  async purchase() {
    return { kind: 'unavailable', reason: 'Es ist noch kein Kaufweg eingerichtet.' };
  },
  async restorePurchases() {
    return { kind: 'unavailable', reason: 'Es ist noch kein Kaufweg eingerichtet.' };
  },
};

/**
 * Gemeinsamer Verifizierungs-Handoff für künftige Adapter: nimmt einen echten
 * Store-Beleg und leitet ihn an den Server. Der Adapter ruft NUR das hier auf,
 * niemals `productAccess` direkt.
 */
export async function handoffToServer(input: {
  platform: PurchasePlatform;
  productId: string;
  purchaseToken: string;
}): Promise<PurchaseOutcome> {
  const result = await verifyPurchase(input);
  return { kind: 'verified', result };
}

let active: BillingClient = nullBillingClient;

/** Aktueller Client. Bis ein Adapter registriert ist: `nullBillingClient`. */
export function getBillingClient(): BillingClient {
  return active;
}

/** Adapter registrieren (Android/iOS) — wird beim App-Start aufgerufen, sobald vorhanden. */
export function registerBillingClient(client: BillingClient): void {
  active = client;
}
