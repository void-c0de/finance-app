/**
 * `BillingClient`-Adapter auf Basis von `expo-iap`
 * (OpenIAP-Spezifikation → Google Play Billing 8 / StoreKit 2).
 *
 * Vertrag, der sich nie ändert:
 *   Ein Kauf-Event des Stores ist KEIN Premium.
 *   Sequenz: nativer Kauf → vereinheitlichter Token → `verify-purchase` (Server)
 *            → `apply_verified_subscription` → Entitlement-Refetch → erst dann UI-Premium.
 *   `finishTransaction()` wird ERST nach erfolgreicher Server-Prüfung aufgerufen.
 *
 * Ohne konfigurierte Produkt-IDs (`EXPO_PUBLIC_PREMIUM_*_ID`) wird dieser Adapter
 * gar nicht registriert — dann bleibt `nullBillingClient` aktiv.
 */
import { Platform } from 'react-native';
import {
  endConnection,
  fetchProducts,
  finishTransaction,
  getAvailablePurchases,
  initConnection,
  purchaseErrorListener,
  purchaseUpdatedListener,
  requestPurchase,
  type Product,
  type Purchase,
} from 'expo-iap';

import { debugLog } from '@/core/debugLog';
import type { PurchasePlatform } from '@/services/billingCore';
import {
  handoffToServer,
  type BillingClient,
  type PurchaseOutcome,
  type StoreProduct,
} from '@/services/billingClient';
import {
  getConfiguredProducts,
  internalIdForStoreProduct,
  type ConfiguredProduct,
} from '@/services/billing/productConfig';

type IapError = { code?: string | null; message?: string | null };

function currentPlatform(): PurchasePlatform | null {
  if (Platform.OS === 'android') return 'google_play';
  if (Platform.OS === 'ios') return 'app_store';
  return null;
}

/** expo-iap liefert einen vereinheitlichten Token (iOS = JWS, Android = purchaseToken). */
function tokenOf(purchase: Purchase): string {
  return (
    purchase.purchaseToken ??
    (purchase as { purchaseTokenAndroid?: string | null }).purchaseTokenAndroid ??
    ''
  );
}

function toStoreProduct(product: Product, configured: ConfiguredProduct[]): StoreProduct | null {
  const match = configured.find((c) => c.storeProductId === product.id);
  if (!match) return null;
  return {
    id: match.id,
    interval: match.interval,
    localizedPrice: product.displayPrice,
    priceCurrencyCode: product.currency,
    priceMinor: Math.round((product.price ?? 0) * 100),
  };
}

type PendingResolver = (outcome: PurchaseOutcome) => void;

export function createExpoIapBillingClient(
  env: Record<string, string | undefined> = process.env,
): BillingClient | null {
  const platform = currentPlatform();
  const configured = getConfiguredProducts(env);
  if (!platform || configured.length === 0) return null;

  let connected = false;
  let pending: PendingResolver | null = null;
  const subscriptions: { remove: () => void }[] = [];

  const settle = (outcome: PurchaseOutcome) => {
    const resolve = pending;
    pending = null;
    resolve?.(outcome);
  };

  async function verifyAndFinish(purchase: Purchase): Promise<PurchaseOutcome> {
    const token = tokenOf(purchase);
    const internalId =
      internalIdForStoreProduct(purchase.productId, env) ??
      internalIdForStoreProduct(
        (purchase as { currentPlanId?: string | null }).currentPlanId ?? '',
        env,
      );

    if (!token || !internalId) {
      debugLog.warn('BILLING', 'Kauf ohne verwertbaren Token/Produkt — übersprungen');
      return { kind: 'unavailable', reason: 'Der Kaufbeleg war unvollständig.' };
    }

    // purchaseState 'pending' (langsame Zahlweise) schaltet nichts frei.
    if (purchase.purchaseState === 'pending') {
      return { kind: 'pending' };
    }

    const outcome = await handoffToServer({
      platform: platform!,
      productId: internalId,
      purchaseToken: token,
    });

    if (outcome.kind === 'verified' && outcome.result.ok) {
      try {
        await finishTransaction({ purchase, isConsumable: false });
      } catch {
        // Verifiziert, aber Acknowledge/Finish scheiterte — kein Premium-Verlust,
        // der nächste Restore/Sync gleicht ab.
        debugLog.warn('BILLING', 'finishTransaction fehlgeschlagen (Server-Zustand bleibt gültig)');
      }
    }
    return outcome;
  }

  async function ensureConnection(): Promise<boolean> {
    if (connected) return true;
    try {
      await initConnection();
      connected = true;

      subscriptions.push(
        purchaseUpdatedListener((purchase: Purchase) => {
          void (async () => {
            const outcome = await verifyAndFinish(purchase);
            settle(outcome);
          })();
        }),
      );
      subscriptions.push(
        purchaseErrorListener((error: IapError) => {
          const code = String(error.code ?? '');
          if (code === 'user-cancelled') {
            settle({ kind: 'cancelled' });
          } else if (code === 'pending' || code === 'deferred-payment') {
            settle({ kind: 'pending' });
          } else {
            debugLog.warn('BILLING', `Kauf-Fehler (${code})`);
            settle({
              kind: 'unavailable',
              reason: mapErrorMessage(code),
            });
          }
        }),
      );
      return true;
    } catch {
      debugLog.warn('BILLING', 'initConnection fehlgeschlagen');
      return false;
    }
  }

  return {
    platform,

    async isAvailable() {
      return ensureConnection();
    },

    async queryProducts(): Promise<StoreProduct[]> {
      if (!(await ensureConnection())) return [];
      try {
        const skus = configured.map((c) => c.storeProductId);
        const products = await fetchProducts({ skus, type: 'subs' });
        return (Array.isArray(products) ? products : [])
          .map((product) => toStoreProduct(product as Product, configured))
          .filter((p): p is StoreProduct => p !== null)
          .sort((a, b) => (a.interval === 'monthly' ? -1 : 1) - (b.interval === 'monthly' ? -1 : 1));
      } catch {
        debugLog.warn('BILLING', 'fetchProducts fehlgeschlagen');
        return [];
      }
    },

    async purchase(productId: string): Promise<PurchaseOutcome> {
      if (!(await ensureConnection())) {
        return { kind: 'unavailable', reason: 'Der Store ist gerade nicht erreichbar.' };
      }
      const product = configured.find((c) => c.id === productId || c.storeProductId === productId);
      if (!product) {
        return { kind: 'unavailable', reason: 'Dieses Produkt ist nicht eingerichtet.' };
      }
      if (pending) {
        return { kind: 'unavailable', reason: 'Es läuft bereits ein Kauf.' };
      }

      return new Promise<PurchaseOutcome>((resolve) => {
        pending = resolve;
        const timeout = setTimeout(() => {
          if (pending === resolve) {
            settle({ kind: 'unavailable', reason: 'Zeitüberschreitung beim Kauf.' });
          }
        }, 120_000);
        const wrapped: PendingResolver = (outcome) => {
          clearTimeout(timeout);
          resolve(outcome);
        };
        pending = wrapped;

        requestPurchase({
          type: 'subs',
          request: {
            apple: { sku: product.storeProductId },
            google: { skus: [product.storeProductId] },
          },
        }).catch(() => {
          debugLog.warn('BILLING', 'requestPurchase warf synchron');
          if (pending === wrapped) {
            settle({ kind: 'unavailable', reason: 'Der Kauf konnte nicht gestartet werden.' });
          }
        });
      });
    },

    async restorePurchases(): Promise<PurchaseOutcome> {
      if (!(await ensureConnection())) {
        return { kind: 'unavailable', reason: 'Der Store ist gerade nicht erreichbar.' };
      }
      try {
        const owned = await getAvailablePurchases();
        const relevant = (Array.isArray(owned) ? owned : []).filter(
          (p) => internalIdForStoreProduct(p.productId, env) != null && tokenOf(p).length > 0,
        );
        if (relevant.length === 0) {
          return { kind: 'unavailable', reason: 'Keine wiederherstellbaren Käufe gefunden.' };
        }
        // Alle Kandidaten serverseitig prüfen; der Resolver-Merge ist idempotent.
        let last: PurchaseOutcome = { kind: 'unavailable', reason: 'Keine Prüfung möglich.' };
        for (const purchase of relevant) {
          last = await verifyAndFinish(purchase);
        }
        return last;
      } catch {
        debugLog.warn('BILLING', 'restorePurchases fehlgeschlagen');
        return { kind: 'unavailable', reason: 'Wiederherstellung fehlgeschlagen.' };
      }
    },
  };
}

function mapErrorMessage(code: string): string {
  switch (code) {
    case 'billing-unavailable':
    case 'iap-not-available':
      return 'In-App-Käufe sind auf diesem Gerät/Konto nicht verfügbar.';
    case 'network-error':
    case 'service-timeout':
    case 'service-disconnected':
      return 'Keine Verbindung zum Store. Bitte später erneut versuchen.';
    case 'already-owned':
    case 'duplicate-purchase':
      return 'Dieses Abo besteht bereits. Nutze „Käufe wiederherstellen".';
    case 'item-unavailable':
    case 'sku-not-found':
      return 'Dieses Produkt ist im Store nicht verfügbar.';
    default:
      return 'Der Kauf konnte nicht abgeschlossen werden.';
  }
}

/** Store-Verbindung schließen (z. B. bei Logout). Listener bleiben für die App-Laufzeit. */
export async function teardownExpoIap(): Promise<void> {
  try {
    await endConnection();
  } catch {
    /* best effort */
  }
}
