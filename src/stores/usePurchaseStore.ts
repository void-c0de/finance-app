import { create } from 'zustand';

import { debugLog } from '@/core/debugLog';
import { getBillingClient, type StoreProduct } from '@/services/billingClient';
import type { VerifyPurchaseResult } from '@/services/billing';
import { isBillingConfigured } from '@/services/billing/productConfig';
import {
  initialPurchaseState,
  purchaseReducer,
  type PurchaseEvent,
  type PurchaseState,
} from '@/services/billing/purchaseStateMachine';
import { useProductAccessStore } from '@/stores/useProductAccessStore';

type PurchaseStoreState = {
  machine: PurchaseState;
  products: StoreProduct[];
  /** Store-Kaufweg grundsätzlich möglich (Produkt-IDs konfiguriert). */
  configured: boolean;
  loadProducts(): Promise<void>;
  buy(internalProductId: string): Promise<void>;
  restore(): Promise<void>;
  retryVerification(): Promise<void>;
  dismiss(): void;
  /**
   * Bei Konto-Wechsel (Ab-/Anmeldung) aufrufen: die lokale Kauf-UI darf keinen
   * Zustand des vorherigen Kontos behalten. Kein Token, keine „verified"-Anzeige
   * aus einer fremden Sitzung. Das autoritative Entitlement kommt danach frisch
   * vom Server (`useProductAccessStore.refresh()`).
   */
  resetForAccountChange(): void;
};

export const usePurchaseStore = create<PurchaseStoreState>((set, get) => {
  const dispatch = (event: PurchaseEvent) => {
    set((state) => ({ machine: purchaseReducer(state.machine, event) }));
  };

  /** Nach jeder Server-Verifizierung: Entitlement autoritativ neu laden. */
  const refreshEntitlement = async () => {
    await useProductAccessStore.getState().refresh();
  };

  const applyVerifyResult = async (result: VerifyPurchaseResult) => {
    if (result.ok) {
      await refreshEntitlement();
      dispatch({ type: 'VERIFY_OK' });
    } else if (result.reason === 'not_configured') {
      dispatch({ type: 'VERIFY_NOT_CONFIGURED' });
    } else {
      dispatch({ type: 'VERIFY_FAILED' });
    }
  };

  return {
    machine: initialPurchaseState,
    products: [],
    configured: isBillingConfigured(),

    async loadProducts() {
      if (!get().configured) {
        dispatch({ type: 'NOT_CONFIGURED' });
        return;
      }
      dispatch({ type: 'INIT' });
      const client = getBillingClient();
      if (!(await client.isAvailable())) {
        dispatch({ type: 'STORE_UNAVAILABLE' });
        return;
      }
      try {
        const products = await client.queryProducts();
        set({ products });
        dispatch(products.length > 0 ? { type: 'PRODUCTS_LOADED' } : { type: 'STORE_UNAVAILABLE' });
      } catch {
        debugLog.warn('BILLING', 'loadProducts fehlgeschlagen');
        dispatch({ type: 'PRODUCTS_FAILED' });
      }
    },

    async buy(internalProductId: string) {
      dispatch({ type: 'BUY' });
      const outcome = await getBillingClient().purchase(internalProductId);

      if (outcome.kind === 'cancelled') {
        dispatch({ type: 'PURCHASE_CANCELLED' });
        return;
      }
      if (outcome.kind === 'pending') {
        dispatch({ type: 'PURCHASE_PENDING' });
        return;
      }
      if (outcome.kind === 'unavailable') {
        dispatch({ type: 'PURCHASE_ERROR', message: outcome.reason });
        return;
      }

      // outcome.kind === 'verified' — der Adapter hat bereits serverseitig geprüft.
      dispatch({ type: 'PURCHASE_RECEIVED' });
      await applyVerifyResult(outcome.result);
    },

    async restore() {
      dispatch({ type: 'RESTORE' });
      const outcome = await getBillingClient().restorePurchases();
      if (outcome.kind === 'verified') {
        await applyVerifyResult(outcome.result);
        return;
      }
      dispatch({
        type: 'VERIFY_FAILED',
        message:
          outcome.kind === 'unavailable'
            ? outcome.reason
            : 'Es konnten keine Käufe wiederhergestellt werden.',
      });
    },

    async retryVerification() {
      dispatch({ type: 'RETRY_VERIFY' });
      await get().restore();
    },

    dismiss() {
      dispatch({ type: 'DISMISS' });
    },

    resetForAccountChange() {
      set({ machine: initialPurchaseState, products: [], configured: isBillingConfigured() });
    },
  };
});
