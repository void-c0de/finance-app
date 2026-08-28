/**
 * Registriert beim App-Start den nativen Billing-Adapter — aber nur, wenn
 * echte Store-Produkt-IDs konfiguriert sind. Sonst bleibt `nullBillingClient`
 * aktiv (Premium Center zeigt weiter „Preise folgen", kein Kauf-Button).
 *
 * `expo-iap` wird bewusst dynamisch importiert, damit ein Build ohne
 * Store-Setup den nativen Pfad nicht anfasst.
 */
import { debugLog } from '@/core/debugLog';
import { registerBillingClient } from '@/services/billingClient';
import { isBillingConfigured } from '@/services/billing/productConfig';

let initialized = false;

export async function initBilling(): Promise<void> {
  if (initialized) return;
  initialized = true;

  if (!isBillingConfigured()) {
    debugLog.info('BILLING', 'Kein Store-Setup — nullBillingClient bleibt aktiv');
    return;
  }

  try {
    const { createExpoIapBillingClient } = await import('@/services/billing/expoIapAdapter');
    const client = createExpoIapBillingClient();
    if (client) {
      registerBillingClient(client);
      debugLog.info('BILLING', `Nativer Billing-Adapter registriert (${client.platform})`);
      // Einmaliger stiller Abgleich: fängt einen Kauf ab, dessen Verifizierung
      // durch App-Kill / Netzausfall unterbrochen wurde. Kein Kauf-Dialog,
      // keine UI-Änderung, keine Schleife.
      const { usePurchaseStore } = await import('@/stores/usePurchaseStore');
      void usePurchaseStore.getState().reconcileSilently();
    }
  } catch {
    // Kein Absturz — der Coupon-/Admin-Weg bleibt unberührt.
    debugLog.warn('BILLING', 'Nativer Billing-Adapter konnte nicht geladen werden');
  }
}
