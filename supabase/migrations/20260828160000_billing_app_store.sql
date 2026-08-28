-- RC4: allow the App Store as a verified billing provider.
-- Purely additive — widening a CHECK never invalidates existing rows.
-- No StoreKit product exists yet; verify-purchase still returns not_configured
-- for app_store until Apple server credentials are set.

BEGIN;

-- 1. Central subscription row: app_store as a source.
ALTER TABLE public.user_subscriptions DROP CONSTRAINT IF EXISTS user_subscriptions_source_check;
ALTER TABLE public.user_subscriptions
  ADD CONSTRAINT user_subscriptions_source_check
  CHECK (source IN ('none', 'coupon', 'admin', 'store', 'migration', 'google_play', 'app_store', 'revenuecat'));

-- 2. billing_subscriptions provider whitelist.
ALTER TABLE public.billing_subscriptions DROP CONSTRAINT IF EXISTS billing_subscriptions_provider_check;
ALTER TABLE public.billing_subscriptions
  ADD CONSTRAINT billing_subscriptions_provider_check
  CHECK (provider IN ('google_play', 'app_store', 'revenuecat'));

-- 3. apply_verified_subscription: identical body to 20260828140000, the guard
--    line is the only change ('app_store' added to the whitelist).
CREATE OR REPLACE FUNCTION public.apply_verified_subscription(
  p_user_id uuid,
  p_provider text,
  p_product_id text,
  p_token_sha256 text,
  p_status text,
  p_auto_renewing boolean,
  p_period_end timestamptz,
  p_notification_type text DEFAULT NULL
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
BEGIN
  IF p_user_id IS NULL THEN RAISE EXCEPTION 'user_required'; END IF;
  IF p_provider NOT IN ('google_play', 'app_store', 'revenuecat') THEN RAISE EXCEPTION 'bad_provider'; END IF;

  INSERT INTO public.billing_subscriptions (
    user_id, provider, product_id, purchase_token_sha256, status,
    auto_renewing, current_period_end, latest_notification_type, verified_at
  )
  VALUES (
    p_user_id, p_provider, p_product_id, p_token_sha256, p_status,
    coalesce(p_auto_renewing, true), p_period_end, p_notification_type, now()
  )
  ON CONFLICT (provider, purchase_token_sha256) DO UPDATE SET
    product_id = excluded.product_id,
    status = excluded.status,
    auto_renewing = excluded.auto_renewing,
    current_period_end = excluded.current_period_end,
    latest_notification_type = excluded.latest_notification_type,
    verified_at = now();

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
                             'status', p_status, 'notification', p_notification_type));

  RETURN public.get_my_product_access_for(p_user_id);
END;
$$;

REVOKE ALL ON FUNCTION public.apply_verified_subscription(uuid, text, text, text, text, boolean, timestamptz, text) FROM PUBLIC, anon, authenticated;

COMMIT;
