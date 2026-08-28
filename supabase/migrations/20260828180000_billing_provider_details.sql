-- RC7: real provider verification support — additive.
--
-- Adds the provider-identity + environment columns the Google Play / App Store
-- verifiers now produce, an idempotency ledger for store notifications, and a
-- first-verified-account-wins guard against purchase replay across Finance
-- accounts. Widening columns / adding tables never invalidates existing rows.
--
-- No raw tokens or receipts are stored — only SHA-256 hashes and the provider's
-- own opaque transaction identifiers (needed to correlate async notifications).

BEGIN;

-- 1. Provider identity + environment on the subscription row.
ALTER TABLE public.billing_subscriptions
  ADD COLUMN IF NOT EXISTS provider_transaction_id text,
  ADD COLUMN IF NOT EXISTS provider_original_transaction_id text,
  ADD COLUMN IF NOT EXISTS environment text NOT NULL DEFAULT 'production'
    CHECK (environment IN ('production', 'sandbox')),
  ADD COLUMN IF NOT EXISTS cancellation_reason text,
  ADD COLUMN IF NOT EXISTS last_event_at timestamptz;

-- Correlate App Store Server Notifications (which carry originalTransactionId,
-- not the client purchase token) back to a user.
CREATE INDEX IF NOT EXISTS billing_subscriptions_provider_orig_idx
  ON public.billing_subscriptions (provider, provider_original_transaction_id)
  WHERE provider_original_transaction_id IS NOT NULL;

-- 2. Notification idempotency ledger. Store notifications arrive duplicated,
--    delayed and out of order — record each provider event exactly once.
CREATE TABLE IF NOT EXISTS public.billing_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL CHECK (provider IN ('google_play', 'app_store', 'revenuecat')),
  event_id text NOT NULL,
  event_type text,
  event_at timestamptz,
  payload_sha256 text NOT NULL,
  processed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, event_id)
);

ALTER TABLE public.billing_webhook_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.billing_webhook_events FROM anon, authenticated;
-- service-role only; no client ever reads this.

-- 3. Record a provider event once. Returns true if this is the first time we
--    have seen it (caller should process), false if it is a duplicate.
CREATE OR REPLACE FUNCTION public.record_billing_event(
  p_provider text,
  p_event_id text,
  p_event_type text,
  p_event_at timestamptz,
  p_payload_sha256 text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rows integer;
BEGIN
  INSERT INTO public.billing_webhook_events (provider, event_id, event_type, event_at, payload_sha256)
  VALUES (p_provider, p_event_id, p_event_type, p_event_at, p_payload_sha256)
  ON CONFLICT (provider, event_id) DO NOTHING;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows > 0;
END;
$$;
REVOKE ALL ON FUNCTION public.record_billing_event(text, text, text, timestamptz, text) FROM PUBLIC, anon, authenticated;

-- 4. apply_verified_subscription — new signature (drops the RC4 8-arg version).
--    Adds provider identity, environment, cancellation reason and an event
--    ordering timestamp, plus a first-verified-account-wins replay guard.
DROP FUNCTION IF EXISTS public.apply_verified_subscription(uuid, text, text, text, text, boolean, timestamptz, text);

CREATE FUNCTION public.apply_verified_subscription(
  p_user_id uuid,
  p_provider text,
  p_product_id text,
  p_token_sha256 text,
  p_status text,
  p_auto_renewing boolean,
  p_period_end timestamptz,
  p_notification_type text DEFAULT NULL,
  p_provider_transaction_id text DEFAULT NULL,
  p_original_transaction_id text DEFAULT NULL,
  p_environment text DEFAULT 'production',
  p_cancellation_reason text DEFAULT NULL,
  p_event_at timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_premium_active boolean;
  v_existing_end timestamptz;
  v_new_end timestamptz;
  v_plan text;
  v_status text;
  v_owner uuid;
  v_prev_event_at timestamptz;
BEGIN
  IF p_user_id IS NULL THEN RAISE EXCEPTION 'user_required'; END IF;
  IF p_provider NOT IN ('google_play', 'app_store', 'revenuecat') THEN RAISE EXCEPTION 'bad_provider'; END IF;

  -- Replay / account-switch guard: a store purchase identity belongs to the
  -- FIRST Finance account that verified it. A different account trying to claim
  -- the same token or the same original-transaction is rejected. (An explicit
  -- support/admin transfer would be a separate, audited operation.)
  SELECT user_id INTO v_owner
  FROM public.billing_subscriptions
  WHERE provider = p_provider
    AND (
      purchase_token_sha256 = p_token_sha256
      OR (p_original_transaction_id IS NOT NULL
          AND provider_original_transaction_id = p_original_transaction_id)
    )
  ORDER BY created_at ASC
  LIMIT 1;

  IF v_owner IS NOT NULL AND v_owner <> p_user_id THEN
    RAISE EXCEPTION 'subscription_owned_by_other_account';
  END IF;

  -- Out-of-order guard: never let an older provider event overwrite newer state.
  SELECT last_event_at INTO v_prev_event_at
  FROM public.billing_subscriptions
  WHERE provider = p_provider AND purchase_token_sha256 = p_token_sha256;

  IF v_prev_event_at IS NOT NULL AND p_event_at IS NOT NULL AND p_event_at < v_prev_event_at THEN
    RETURN public.get_my_product_access_for(p_user_id);
  END IF;

  INSERT INTO public.billing_subscriptions (
    user_id, provider, product_id, purchase_token_sha256, status,
    auto_renewing, current_period_end, latest_notification_type, verified_at,
    provider_transaction_id, provider_original_transaction_id, environment,
    cancellation_reason, last_event_at
  )
  VALUES (
    p_user_id, p_provider, p_product_id, p_token_sha256, p_status,
    coalesce(p_auto_renewing, true), p_period_end, p_notification_type, now(),
    p_provider_transaction_id, p_original_transaction_id, coalesce(p_environment, 'production'),
    p_cancellation_reason, coalesce(p_event_at, now())
  )
  ON CONFLICT (provider, purchase_token_sha256) DO UPDATE SET
    product_id = excluded.product_id,
    status = excluded.status,
    auto_renewing = excluded.auto_renewing,
    current_period_end = excluded.current_period_end,
    latest_notification_type = excluded.latest_notification_type,
    verified_at = now(),
    provider_transaction_id = coalesce(excluded.provider_transaction_id, public.billing_subscriptions.provider_transaction_id),
    provider_original_transaction_id = coalesce(excluded.provider_original_transaction_id, public.billing_subscriptions.provider_original_transaction_id),
    environment = excluded.environment,
    cancellation_reason = excluded.cancellation_reason,
    last_event_at = greatest(public.billing_subscriptions.last_event_at, excluded.last_event_at);

  v_premium_active := p_status IN ('active', 'in_grace') AND (p_period_end IS NULL OR p_period_end > now());

  SELECT premium_expires_at INTO v_existing_end
  FROM public.user_subscriptions
  WHERE user_id = p_user_id AND plan = 'premium' AND status IN ('active', 'trial', 'granted');

  IF v_premium_active THEN
    v_new_end := greatest(coalesce(v_existing_end, p_period_end), coalesce(p_period_end, v_existing_end));
    v_plan := 'premium';
    v_status := 'active';
  ELSE
    IF v_existing_end IS NOT NULL AND v_existing_end > now() THEN
      v_new_end := v_existing_end;
      v_plan := 'premium';
      v_status := 'active';
    ELSE
      v_new_end := NULL;
      v_plan := 'standard';
      v_status := 'expired';
    END IF;
  END IF;

  INSERT INTO public.user_subscriptions (user_id, plan, status, source, premium_started_at, premium_expires_at, permanent)
  VALUES (p_user_id, v_plan, v_status, p_provider, now(), v_new_end, false)
  ON CONFLICT (user_id) DO UPDATE SET
    plan = CASE WHEN user_subscriptions.permanent THEN 'premium' ELSE v_plan END,
    status = CASE WHEN user_subscriptions.permanent THEN user_subscriptions.status ELSE v_status END,
    source = CASE
      WHEN user_subscriptions.permanent THEN user_subscriptions.source
      WHEN v_plan = 'premium' AND user_subscriptions.premium_expires_at IS NOT NULL
        AND user_subscriptions.premium_expires_at > coalesce(v_new_end, 'epoch'::timestamptz)
        THEN user_subscriptions.source
      ELSE p_provider
    END,
    premium_expires_at = CASE
      WHEN user_subscriptions.permanent THEN user_subscriptions.premium_expires_at
      ELSE greatest(coalesce(user_subscriptions.premium_expires_at, v_new_end), coalesce(v_new_end, user_subscriptions.premium_expires_at))
    END;

  INSERT INTO public.admin_audit_log (actor_user_id, action, target_user_id, metadata)
  VALUES (p_user_id, 'billing.verified', p_user_id,
          jsonb_build_object('provider', p_provider, 'productId', p_product_id,
                             'status', p_status, 'notification', p_notification_type,
                             'environment', coalesce(p_environment, 'production')));

  RETURN public.get_my_product_access_for(p_user_id);
END;
$$;

REVOKE ALL ON FUNCTION public.apply_verified_subscription(uuid, text, text, text, text, boolean, timestamptz, text, text, text, text, text, timestamptz)
  FROM PUBLIC, anon, authenticated;

COMMIT;
