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

export type DeletionRequestRow = {
  user_id: string;
  kind: 'finance_data' | 'account';
  status: 'pending' | 'cancelled' | 'completed';
  requested_at: string;
  grace_until: string;
  finalized_at: string | null;
  rows_deleted: number | null;
};

/** Operative Sicht auf Löschanträge – nur Metadaten, nie Finanzinhalte. */
export async function listDeletionRequests(): Promise<DeletionRequestRow[]> {
  const client = getSupabaseClient();
  if (!client) throw new Error('Cloud nicht konfiguriert');
  const { data, error } = await client.rpc('admin_list_deletion_requests');
  if (error) throw error;
  return (data ?? []) as DeletionRequestRow[];
}

/** Fällige Löschungen (Kulanzfenster abgelaufen) sofort ausführen. */
export async function sweepDueDeletions(): Promise<{ requests: number; rowsDeleted: number }> {
  const client = getSupabaseClient();
  if (!client) throw new Error('Cloud nicht konfiguriert');
  const { data, error } = await client.rpc('admin_finalize_due_deletions');
  if (error) throw error;
  return { requests: data?.requests ?? 0, rowsDeleted: data?.rowsDeleted ?? 0 };
}

export type AuditLogRow = {
  id: number;
  actor_user_id: string;
  action: string;
  target_user_id: string | null;
  entity_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

/** Operatives Audit-Protokoll – nur sichere Metadaten, keine Finanzinhalte. */
export async function listAuditLog(limit = 100, actionPrefix?: string): Promise<AuditLogRow[]> {
  const client = getSupabaseClient();
  if (!client) throw new Error('Cloud nicht konfiguriert');
  let query = client
    .from('admin_audit_log')
    .select('id,actor_user_id,action,target_user_id,entity_id,metadata,created_at')
    .order('created_at', { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 300));
  if (actionPrefix) query = query.like('action', `${actionPrefix}%`);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as AuditLogRow[];
}

export type BillingSubscriptionRow = {
  id: string;
  user_id: string;
  provider: 'google_play' | 'revenuecat';
  product_id: string;
  status: string;
  auto_renewing: boolean;
  current_period_end: string | null;
  verified_at: string | null;
  updated_at: string;
};

/** Verifizierte Store-Abos – nur Metadaten, kein Kauf-Token. */
export async function listBillingSubscriptions(): Promise<BillingSubscriptionRow[]> {
  const client = getSupabaseClient();
  if (!client) throw new Error('Cloud nicht konfiguriert');
  const { data, error } = await client.rpc('admin_list_billing_subscriptions');
  if (error) throw error;
  return (data ?? []) as BillingSubscriptionRow[];
}

export async function pruneDebugLogs(keepDays = 14): Promise<number> {
  const client = getSupabaseClient();
  if (!client) throw new Error('Cloud nicht konfiguriert');
  const { data, error } = await client.rpc('admin_prune_debug_logs', { p_keep_days: keepDays });
  if (error) throw error;
  return typeof data === 'number' ? data : 0;
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
