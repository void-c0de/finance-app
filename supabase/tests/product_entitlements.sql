-- Live integration test. It intentionally runs inside one transaction and
-- always rolls back, so no coupon, grant, redemption or audit test data remain.
BEGIN;

DO $$ BEGIN
  PERFORM set_config('test.admin_id', (SELECT id::text FROM public.profiles WHERE role='superuser' LIMIT 1), true);
  PERFORM set_config('test.user_one', (SELECT id::text FROM public.profiles WHERE role='user' ORDER BY created_at LIMIT 1), true);
  PERFORM set_config('test.user_two', (SELECT id::text FROM public.profiles WHERE role='user' ORDER BY created_at OFFSET 1 LIMIT 1), true);
  PERFORM set_config('request.jwt.claim.sub', current_setting('test.admin_id'), true);
END; $$;
SET LOCAL ROLE authenticated;

DO $$
BEGIN
  PERFORM public.admin_create_coupon('TEST_EXTEND_7', 7, NULL, NULL, 'rollback test', false);
  PERFORM public.admin_create_coupon('TEST_EXTEND_30', 30, NULL, NULL, 'rollback test', false);
  PERFORM public.admin_create_coupon('TEST_LIMIT_ONE', 7, 1, NULL, 'rollback test', false);
  PERFORM public.admin_create_coupon('TEST_EXPIRED', 7, 1, now() - interval '1 day', 'rollback test', false);
  PERFORM public.admin_create_coupon('TEST_DISABLED', 7, 1, NULL, 'rollback test', false);
  PERFORM public.admin_set_coupon_active((SELECT id FROM public.premium_coupons WHERE code='TEST_DISABLED'), false);
END;
$$;

RESET ROLE;
DO $$ BEGIN PERFORM set_config('request.jwt.claim.sub', current_setting('test.user_one'), true); END; $$;
SET LOCAL ROLE authenticated;

DO $$
DECLARE v_first timestamptz;
DECLARE v_extended timestamptz;
BEGIN
  PERFORM public.redeem_premium_coupon('TEST_EXTEND_7');
  SELECT premium_expires_at INTO v_first FROM public.user_subscriptions WHERE user_id=auth.uid();
  PERFORM public.redeem_premium_coupon('TEST_EXTEND_30');
  SELECT premium_expires_at INTO v_extended FROM public.user_subscriptions WHERE user_id=auth.uid();
  IF v_extended < v_first + interval '30 days' THEN RAISE EXCEPTION 'coupon_shortened_or_not_extended'; END IF;

  BEGIN
    PERFORM public.redeem_premium_coupon('TEST_EXTEND_7');
    RAISE EXCEPTION 'duplicate_redemption_allowed';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'coupon_already_redeemed' THEN RAISE; END IF;
  END;

  BEGIN
    PERFORM public.redeem_premium_coupon('TEST_EXPIRED');
    RAISE EXCEPTION 'expired_coupon_allowed';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'coupon_expired' THEN RAISE; END IF;
  END;

  BEGIN
    PERFORM public.redeem_premium_coupon('TEST_DISABLED');
    RAISE EXCEPTION 'disabled_coupon_allowed';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'coupon_invalid' THEN RAISE; END IF;
  END;

  PERFORM public.redeem_premium_coupon('TEST_LIMIT_ONE');
END;
$$;

RESET ROLE;
DO $$ BEGIN PERFORM set_config('request.jwt.claim.sub', current_setting('test.user_two'), true); END; $$;
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  BEGIN
    PERFORM public.redeem_premium_coupon('TEST_LIMIT_ONE');
    RAISE EXCEPTION 'coupon_limit_exceeded';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'coupon_limit_reached' THEN RAISE; END IF;
  END;
END;
$$;

-- A normal authenticated user must never cross the server authority boundary.
DO $$
DECLARE v_admin_rpc_denied boolean := false;
DECLARE v_audit_count integer;
BEGIN
  BEGIN
    PERFORM public.admin_create_coupon('TEST_FORBIDDEN', 7, 1, NULL, 'must not exist', false);
  EXCEPTION WHEN OTHERS THEN
    v_admin_rpc_denied := true;
  END;
  IF NOT v_admin_rpc_denied THEN RAISE EXCEPTION 'normal_user_created_coupon'; END IF;

  v_admin_rpc_denied := false;
  BEGIN
    PERFORM public.admin_grant_premium('nobody@example.invalid', 7, false);
  EXCEPTION WHEN OTHERS THEN
    v_admin_rpc_denied := true;
  END;
  IF NOT v_admin_rpc_denied THEN RAISE EXCEPTION 'normal_user_granted_premium'; END IF;

  v_admin_rpc_denied := false;
  BEGIN
    PERFORM public.admin_publish_release('99.0.0', 999, '99.0.0', 'forbidden', 'forbidden', 'required', NULL, NULL);
  EXCEPTION WHEN OTHERS THEN
    v_admin_rpc_denied := true;
  END;
  IF NOT v_admin_rpc_denied THEN RAISE EXCEPTION 'normal_user_published_release'; END IF;

  SELECT count(*) INTO v_audit_count FROM public.admin_audit_log;
  IF v_audit_count <> 0 THEN RAISE EXCEPTION 'normal_user_read_admin_audit'; END IF;

  v_admin_rpc_denied := false;
  BEGIN
    UPDATE public.profiles SET role='superuser' WHERE id=auth.uid();
  EXCEPTION WHEN OTHERS THEN
    v_admin_rpc_denied := true;
  END;
  IF NOT v_admin_rpc_denied THEN RAISE EXCEPTION 'normal_user_modified_role'; END IF;

  v_admin_rpc_denied := false;
  BEGIN
    INSERT INTO public.user_subscriptions(user_id, plan, source)
    VALUES (auth.uid(), 'premium', 'admin');
  EXCEPTION WHEN OTHERS THEN
    v_admin_rpc_denied := true;
  END;
  IF NOT v_admin_rpc_denied THEN RAISE EXCEPTION 'normal_user_self_granted_premium'; END IF;
END;
$$;

ROLLBACK;
