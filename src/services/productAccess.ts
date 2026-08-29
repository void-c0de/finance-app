import * as SecureStore from 'expo-secure-store';

import { getSupabaseClient, hasCloudSession } from '@/services/cloud/cloudClient';
import {
  normalizeProductAccess,
  STANDARD_ACCESS,
  type ProductAccess,
} from '@/services/entitlementCore';

const CACHE_KEY = 'finance.product-access.v1';

export async function getCachedProductAccess(): Promise<ProductAccess> {
  try {
    const raw = await SecureStore.getItemAsync(CACHE_KEY);
    return raw ? normalizeProductAccess(JSON.parse(raw)) : STANDARD_ACCESS;
  } catch {
    return STANDARD_ACCESS;
  }
}

export async function refreshProductAccess(): Promise<ProductAccess> {
  const client = getSupabaseClient();
  if (!client) return getCachedProductAccess();
  // Without a signed-in session the RPC would fail with "permission denied"
  // (anon role) — that is not a server outage, so don't call it and don't
  // log noise. A logged-out user is STANDARD by definition.
  if (!(await hasCloudSession())) return STANDARD_ACCESS;
  try {
    const { data, error } = await client.rpc('get_my_product_access');
    if (error) throw error;
    const access = normalizeProductAccess(data);
    await SecureStore.setItemAsync(CACHE_KEY, JSON.stringify(access));
    return access;
  } catch (error) {
    console.warn('[ACCESS] Produktzugriff konnte nicht aktualisiert werden, Cache wird verwendet:', error);
    return getCachedProductAccess();
  }
}

export type CouponResult = { ok: true; access: ProductAccess } | { ok: false; message: string };

function couponError(message: string): string {
  if (message.includes('coupon_expired')) return 'Dieser Coupon ist abgelaufen.';
  if (message.includes('coupon_already_redeemed')) return 'Du hast diesen Coupon bereits eingelöst.';
  if (message.includes('coupon_limit_reached')) return 'Dieser Coupon wurde bereits vollständig eingelöst.';
  if (message.includes('coupon_invalid')) return 'Der Coupon ist ungültig oder deaktiviert.';
  return 'Coupon konnte gerade nicht eingelöst werden.';
}

export async function redeemPremiumCoupon(code: string): Promise<CouponResult> {
  const client = getSupabaseClient();
  if (!client) return { ok: false, message: 'Cloud nicht konfiguriert.' };
  const normalized = code.trim().toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9_-]{3,31}$/.test(normalized)) {
    return { ok: false, message: 'Bitte einen gültigen Coupon-Code eingeben.' };
  }
  try {
    const { data, error } = await client.rpc('redeem_premium_coupon', { p_code: normalized });
    if (error) return { ok: false, message: couponError(error.message) };
    const access = normalizeProductAccess(data);
    await SecureStore.setItemAsync(CACHE_KEY, JSON.stringify(access));
    return { ok: true, access };
  } catch {
    return { ok: false, message: 'Coupon konnte gerade nicht eingelöst werden.' };
  }
}
