import { getSupabaseClient } from '@/services/cloud/cloudClient';
import { normalizeProductAccess, type ProductAccess } from '@/services/entitlementCore';
import type { PurchasePlatform } from '@/services/billingCore';
import { debugLog } from '@/core/debugLog';

/**
 * Client-Seite der Kauf-Verifizierung.
 *
 * Der Client schickt nur den Kauf-Beleg an den Server. Premium entsteht
 * ausschließlich aus dem verifizierten Serverzustand (`verify-purchase` →
 * `apply_verified_subscription` → `user_subscriptions`). Dieser Wrapper gewährt
 * niemals selbst Premium.
 *
 * Es ist noch KEINE Play-Billing-Bibliothek eingebunden (siehe
 * BILLING_SERVER_CONTRACT.md). Diese Funktion ist die Andockstelle, sobald
 * `productId` + `purchaseToken` aus einem echten Store-Kauf vorliegen.
 */

export type VerifyPurchaseInput = {
  platform: PurchasePlatform;
  productId: string;
  purchaseToken: string;
};

export type VerifyPurchaseResult =
  | { ok: true; access: ProductAccess }
  | { ok: false; reason: 'not_configured' | 'unavailable' | 'rejected' };

export async function verifyPurchase(input: VerifyPurchaseInput): Promise<VerifyPurchaseResult> {
  const client = getSupabaseClient();
  if (!client) return { ok: false, reason: 'unavailable' };

  try {
    const { data, error } = await client.functions.invoke('verify-purchase', {
      method: 'POST',
      body: input,
    });
    if (error) {
      // 501 not_configured surfaces here as a FunctionsHttpError
      const status = (error as { context?: { status?: number } }).context?.status;
      debugLog.warn('BILLING', `verify-purchase fehlgeschlagen (${status ?? '?'})`);
      return { ok: false, reason: status === 501 ? 'not_configured' : 'rejected' };
    }
    if (data?.ok && data.access) {
      return { ok: true, access: normalizeProductAccess(data.access) };
    }
    return { ok: false, reason: 'rejected' };
  } catch {
    return { ok: false, reason: 'unavailable' };
  }
}
