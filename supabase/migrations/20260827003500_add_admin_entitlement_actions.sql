CREATE OR REPLACE FUNCTION public.admin_grant_premium(
  p_email text,
  p_duration_days integer DEFAULT 30,
  p_permanent boolean DEFAULT false
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE v_target uuid;
DECLARE v_existing_until timestamptz;
DECLARE v_until timestamptz;
BEGIN
  IF NOT public.is_superuser() THEN RAISE EXCEPTION 'admin_required'; END IF;
  IF NOT p_permanent AND (p_duration_days < 1 OR p_duration_days > 3650) THEN RAISE EXCEPTION 'invalid_duration'; END IF;
  SELECT id INTO v_target FROM auth.users WHERE lower(email) = lower(trim(p_email));
  IF v_target IS NULL THEN RAISE EXCEPTION 'user_not_found'; END IF;
  SELECT premium_expires_at INTO v_existing_until FROM public.user_subscriptions WHERE user_id = v_target;
  v_until := CASE WHEN p_permanent THEN NULL ELSE greatest(now(), coalesce(v_existing_until, now())) + make_interval(days => p_duration_days) END;
  INSERT INTO public.user_subscriptions(user_id, plan, status, source, premium_started_at, premium_expires_at, permanent)
  VALUES(v_target, 'premium', 'granted', 'admin', now(), v_until, p_permanent)
  ON CONFLICT(user_id) DO UPDATE SET
    plan='premium', status='granted', source='admin',
    premium_started_at=coalesce(user_subscriptions.premium_started_at, now()),
    premium_expires_at=CASE WHEN user_subscriptions.permanent THEN user_subscriptions.premium_expires_at ELSE excluded.premium_expires_at END,
    permanent=user_subscriptions.permanent OR excluded.permanent;
  INSERT INTO public.admin_audit_log(actor_user_id, action, target_user_id, metadata)
  VALUES(auth.uid(), 'premium.granted', v_target, jsonb_build_object('durationDays', p_duration_days, 'permanent', p_permanent));
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_revoke_premium(p_email text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE v_target uuid;
BEGIN
  IF NOT public.is_superuser() THEN RAISE EXCEPTION 'admin_required'; END IF;
  SELECT id INTO v_target FROM auth.users WHERE lower(email) = lower(trim(p_email));
  IF v_target IS NULL THEN RAISE EXCEPTION 'user_not_found'; END IF;
  IF public.is_superuser(v_target) THEN RAISE EXCEPTION 'cannot_revoke_superuser'; END IF;
  INSERT INTO public.user_subscriptions(user_id, plan, status, source, premium_started_at, premium_expires_at, permanent)
  VALUES(v_target, 'standard', 'cancelled', 'admin', NULL, NULL, false)
  ON CONFLICT(user_id) DO UPDATE SET plan='standard', status='cancelled', source='admin', premium_expires_at=NULL, permanent=false;
  INSERT INTO public.admin_audit_log(actor_user_id, action, target_user_id)
  VALUES(auth.uid(), 'premium.revoked', v_target);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_grant_premium(text, integer, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_revoke_premium(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_grant_premium(text, integer, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_revoke_premium(text) TO authenticated;
