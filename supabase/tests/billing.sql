-- Live rollback-only test for apply_verified_subscription precedence.
BEGIN;

DO $$ BEGIN
  PERFORM set_config('test.u1', (SELECT id::text FROM public.profiles WHERE role='user' ORDER BY created_at LIMIT 1), true);
END; $$;

-- clean slate for the test user
DELETE FROM public.user_subscriptions WHERE user_id = current_setting('test.u1')::uuid;
DELETE FROM public.billing_subscriptions WHERE user_id = current_setting('test.u1')::uuid;

-- 1) A verified active store purchase → premium until +30d
DO $$
DECLARE v jsonb;
BEGIN
  v := public.apply_verified_subscription(
    current_setting('test.u1')::uuid, 'google_play', 'premium.monthly', 'hash-1',
    'active', true, now() + interval '30 days', 'verify_purchase');
  IF (v->>'isPremium')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'store purchase did not grant premium: %', v; END IF;
  IF v->>'source' <> 'google_play' THEN RAISE EXCEPTION 'wrong source: %', v; END IF;
END; $$;

-- 2) A longer coupon term already exists → store renewal must NOT shorten it
UPDATE public.user_subscriptions
SET premium_expires_at = now() + interval '200 days', source = 'coupon'
WHERE user_id = current_setting('test.u1')::uuid;

DO $$
DECLARE v jsonb; v_end timestamptz;
BEGIN
  v := public.apply_verified_subscription(
    current_setting('test.u1')::uuid, 'google_play', 'premium.monthly', 'hash-1',
    'active', true, now() + interval '30 days', 'rtdn_2');
  SELECT premium_expires_at INTO v_end FROM public.user_subscriptions WHERE user_id = current_setting('test.u1')::uuid;
  IF v_end < now() + interval '199 days' THEN RAISE EXCEPTION 'store renewal shortened the longer coupon term: %', v_end; END IF;
END; $$;

-- 3) Store subscription expires, but the coupon term is still in the future → stays premium
DO $$
DECLARE v jsonb;
BEGIN
  v := public.apply_verified_subscription(
    current_setting('test.u1')::uuid, 'google_play', 'premium.monthly', 'hash-1',
    'expired', false, now() - interval '1 day', 'rtdn_13');
  IF (v->>'isPremium')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'lost premium despite a longer coupon term: %', v; END IF;
END; $$;

-- 4) Idempotency: same token hash upserts, never duplicates
DO $$
DECLARE c integer;
BEGIN
  PERFORM public.apply_verified_subscription(
    current_setting('test.u1')::uuid, 'google_play', 'premium.monthly', 'hash-1',
    'active', true, now() + interval '30 days', 'rtdn_2');
  SELECT count(*) INTO c FROM public.billing_subscriptions
  WHERE user_id = current_setting('test.u1')::uuid AND purchase_token_sha256 = 'hash-1';
  IF c <> 1 THEN RAISE EXCEPTION 'duplicate billing_subscriptions row: %', c; END IF;
END; $$;

-- 4b) App Store is an accepted provider (RC4); a bogus provider still raises.
DO $$
DECLARE r jsonb;
BEGIN
  r := public.apply_verified_subscription(
    current_setting('test.u1')::uuid, 'app_store', 'premium.yearly', 'hash-appstore-1',
    'active', true, now() + interval '365 days', 'verify_purchase');
  IF (r->>'plan') <> 'premium' THEN RAISE EXCEPTION 'app_store purchase did not grant premium: %', r; END IF;

  BEGIN
    PERFORM public.apply_verified_subscription(
      current_setting('test.u1')::uuid, 'paypal', 'x', 'h2', 'active', true, now(), NULL);
    RAISE EXCEPTION 'bogus provider was accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%bad_provider%' THEN RAISE; END IF;
  END;
END; $$;

-- 5) The merge function is not callable by a normal authenticated user
DO $$ BEGIN PERFORM set_config('request.jwt.claim.sub', current_setting('test.u1'), true); END; $$;
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  BEGIN
    PERFORM public.apply_verified_subscription(
      current_setting('test.u1')::uuid, 'google_play', 'x', 'h', 'active', true, now(), NULL);
    RAISE EXCEPTION 'normal user called apply_verified_subscription';
  EXCEPTION WHEN insufficient_privilege OR undefined_function THEN
    NULL; -- expected
  WHEN OTHERS THEN
    IF SQLERRM LIKE '%permission denied%' THEN NULL; ELSE RAISE; END IF;
  END;
END; $$;

RESET ROLE;
ROLLBACK;
