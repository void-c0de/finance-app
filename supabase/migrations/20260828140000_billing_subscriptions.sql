-- Billing readiness — server-authoritative subscription state.
--
-- No purchase is trusted from the client. A verified store purchase writes here
-- and then feeds the SAME central entitlement (user_subscriptions →
-- get_my_product_access), exactly like a coupon or an admin grant. No second
-- Premium system.
--
-- The actual Google Play Developer API / RevenueCat call lives in the
-- verify-purchase Edge Function and needs external credentials (documented in
-- BILLING_SERVER_CONTRACT.md). This migration only creates the storage +
-- entitlement-merge function so the Edge Function can drop in without further
-- schema work.

-- 1. Allow store sources on the central subscription row.
ALTER TABLE public.user_subscriptions DROP CONSTRAINT IF EXISTS user_subscriptions_source_check;
ALTER TABLE public.user_subscriptions
  ADD CONSTRAINT user_subscriptions_source_check
  CHECK (source IN ('none', 'coupon', 'admin', 'store', 'migration', 'google_play', 'revenuecat'));

-- 2. Provider subscription state. Purchase tokens are NEVER stored in the clear —
--    only a SHA-256 hash, for idempotency / dedup.
CREATE TABLE IF NOT EXISTS public.billing_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('google_play', 'revenuecat')),
  product_id text NOT NULL,
  purchase_token_sha256 text NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'active', 'in_grace', 'on_hold', 'paused', 'cancelled', 'expired', 'revoked')),
  auto_renewing boolean NOT NULL DEFAULT true,
  current_period_end timestamptz,
  latest_notification_type text,
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, purchase_token_sha256)
);

CREATE INDEX IF NOT EXISTS billing_subscriptions_user_idx
  ON public.billing_subscriptions (user_id, status);

ALTER TABLE public.billing_subscriptions ENABLE ROW LEVEL SECURITY;

-- The user may read their OWN billing state (status/period end only matters to
-- them). The token hash is not sensitive on its own but stays server-only in
-- practice — the client reads entitlement via get_my_product_access, not here.
DROP POLICY IF EXISTS billing_subscriptions_select_own ON public.billing_subscriptions;
CREATE POLICY billing_subscriptions_select_own ON public.billing_subscriptions
FOR SELECT USING (user_id = auth.uid() OR public.is_superuser());

DROP TRIGGER IF EXISTS set_updated_at ON public.billing_subscriptions;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.billing_subscriptions
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

REVOKE ALL ON public.billing_subscriptions FROM anon;
GRANT SELECT ON public.billing_subscriptions TO authenticated;
-- INSERT/UPDATE only through the SECURITY DEFINER merge function below (called
-- by the Edge Function with the service role).

-- 3. Central merge: a verified provider subscription → user_subscriptions.
--    Deterministic precedence (mirrors billingCore.resolveEntitlement):
--    never shorten a longer running term; permanent wins; superuser untouched.
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
  IF p_provider NOT IN ('google_play', 'revenuecat') THEN RAISE EXCEPTION 'bad_provider'; END IF;

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
    -- Never shorten a longer term (e.g. a coupon that runs past the store period).
    v_new_end := greatest(coalesce(v_existing_end, p_period_end), coalesce(p_period_end, v_existing_end));
    v_plan := 'premium';
    v_status := 'active';
  ELSE
    -- Store term ended/revoked. Keep any longer non-store term; else drop to standard.
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
      -- keep a longer coupon/admin term visible as its own source
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

-- Helper so the merge function can return a fresh access snapshot for any user.
CREATE OR REPLACE FUNCTION public.get_my_product_access_for(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
  v_sub public.user_subscriptions%ROWTYPE;
  v_premium boolean;
BEGIN
  SELECT role INTO v_role FROM public.profiles WHERE id = p_user_id;
  SELECT * INTO v_sub FROM public.user_subscriptions WHERE user_id = p_user_id;
  v_premium := v_role = 'superuser' OR (
    v_sub.plan = 'premium' AND v_sub.status IN ('active', 'trial', 'granted')
    AND (v_sub.permanent OR v_sub.premium_expires_at > now())
  );
  RETURN jsonb_build_object(
    'role', coalesce(v_role, 'user'),
    'plan', CASE WHEN v_premium THEN 'premium' ELSE 'standard' END,
    'isPremium', v_premium,
    'isSuperuser', v_role = 'superuser',
    'premiumExpiresAt', CASE WHEN v_role = 'superuser' OR v_sub.permanent THEN NULL ELSE v_sub.premium_expires_at END,
    'source', CASE WHEN v_role = 'superuser' THEN 'superuser' ELSE coalesce(v_sub.source, 'none') END
  );
END;
$$;

-- These are called ONLY by the Edge Function (service role). Not a client API.
REVOKE ALL ON FUNCTION public.apply_verified_subscription(uuid, text, text, text, text, boolean, timestamptz, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_my_product_access_for(uuid) FROM PUBLIC, anon, authenticated;

-- 4. Superuser visibility.
CREATE OR REPLACE FUNCTION public.admin_list_billing_subscriptions()
RETURNS SETOF public.billing_subscriptions
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM public.billing_subscriptions
  WHERE public.is_superuser()
  ORDER BY updated_at DESC
  LIMIT 200
$$;
REVOKE ALL ON FUNCTION public.admin_list_billing_subscriptions() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_billing_subscriptions() TO authenticated;
