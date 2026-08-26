import { getSupabaseClient } from '@/services/cloud/cloudClient';

export type PremiumCoupon = {
  id: string;
  code: string;
  duration_days: number | null;
  permanent: boolean;
  max_uses: number | null;
  expires_at: string | null;
  active: boolean;
  note: string | null;
  created_at: string;
  coupon_redemptions?: { count: number }[];
};

export async function listPremiumCoupons(): Promise<PremiumCoupon[]> {
  const client = getSupabaseClient();
  if (!client) throw new Error('Cloud nicht konfiguriert');
  const { data, error } = await client
    .from('premium_coupons')
    .select('id,code,duration_days,permanent,max_uses,expires_at,active,note,created_at,coupon_redemptions(count)')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as PremiumCoupon[];
}

export async function createPremiumCoupon(input: {
  code: string;
  durationDays: number;
  maxUses: number | null;
  note: string | null;
  permanent: boolean;
}): Promise<void> {
  const client = getSupabaseClient();
  if (!client) throw new Error('Cloud nicht konfiguriert');
  const { error } = await client.rpc('admin_create_coupon', {
    p_code: input.code.trim().toUpperCase(),
    p_duration_days: input.durationDays,
    p_max_uses: input.maxUses,
    p_expires_at: null,
    p_note: input.note,
    p_permanent: input.permanent,
  });
  if (error) throw error;
}

export async function setPremiumCouponActive(id: string, active: boolean): Promise<void> {
  const client = getSupabaseClient();
  if (!client) throw new Error('Cloud nicht konfiguriert');
  const { error } = await client.rpc('admin_set_coupon_active', {
    p_coupon_id: id,
    p_active: active,
  });
  if (error) throw error;
}

export async function grantPremiumToUser(email: string, durationDays: number, permanent: boolean): Promise<void> {
  const client = getSupabaseClient();
  if (!client) throw new Error('Cloud nicht konfiguriert');
  const { error } = await client.rpc('admin_grant_premium', {
    p_email: email.trim().toLowerCase(), p_duration_days: durationDays, p_permanent: permanent,
  });
  if (error) throw error;
}

export async function revokePremiumFromUser(email: string): Promise<void> {
  const client = getSupabaseClient();
  if (!client) throw new Error('Cloud nicht konfiguriert');
  const { error } = await client.rpc('admin_revoke_premium', { p_email: email.trim().toLowerCase() });
  if (error) throw error;
}

export async function publishAppRelease(input: {
  version: string; buildNumber: number; runtimeVersion: string; title: string; summary: string;
  level: 'optional' | 'recommended' | 'required'; minimumNativeVersion: string | null; storeUrl: string | null;
}): Promise<void> {
  const client = getSupabaseClient();
  if (!client) throw new Error('Cloud nicht konfiguriert');
  const { error } = await client.rpc('admin_publish_release', {
    p_version: input.version, p_build_number: input.buildNumber, p_runtime_version: input.runtimeVersion,
    p_title: input.title, p_summary: input.summary, p_update_level: input.level,
    p_minimum_native_version: input.minimumNativeVersion, p_store_url: input.storeUrl,
  });
  if (error) throw error;
}
