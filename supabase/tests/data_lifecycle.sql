-- Live integration test for the deletion lifecycle. Runs inside one
-- transaction and always ROLLS BACK, so no request rows, audit entries or
-- (in the "due" case) finance-data deletions persist.
BEGIN;

DO $$ BEGIN
  PERFORM set_config('test.admin_id', (SELECT id::text FROM public.profiles WHERE role='superuser' LIMIT 1), true);
  PERFORM set_config('test.user_one', (SELECT id::text FROM public.profiles WHERE role='user' ORDER BY created_at LIMIT 1), true);
  PERFORM set_config('test.user_two', (SELECT id::text FROM public.profiles WHERE role='user' ORDER BY created_at OFFSET 1 LIMIT 1), true);
END; $$;

-- === user_one: request → still-in-grace → cancel ==========================
DO $$ BEGIN PERFORM set_config('request.jwt.claim.sub', current_setting('test.user_one'), true); END; $$;
SET LOCAL ROLE authenticated;

DO $$
DECLARE v_status jsonb;
DECLARE v_grace timestamptz;
BEGIN
  v_status := public.request_data_deletion('finance_data');
  IF v_status->>'status' <> 'pending' THEN RAISE EXCEPTION 'request not pending: %', v_status; END IF;
  v_grace := (v_status->>'graceUntil')::timestamptz;
  IF v_grace < now() + interval '2 days' OR v_grace > now() + interval '4 days' THEN
    RAISE EXCEPTION 'grace window not ~3 days: %', v_grace;
  END IF;

  -- not due yet → finalisation is a no-op
  IF (public.finalize_my_due_deletion()->>'finalized')::boolean THEN
    RAISE EXCEPTION 'finalised while still in grace';
  END IF;

  -- status is visible to the owner
  IF public.get_my_deletion_status()->>'status' <> 'pending' THEN RAISE EXCEPTION 'own status not visible'; END IF;

  PERFORM public.cancel_data_deletion();
  IF public.get_my_deletion_status()->>'status' <> 'cancelled' THEN RAISE EXCEPTION 'cancel did not take'; END IF;
END;
$$;

-- === user_two cannot see or cancel user_one's request ====================
RESET ROLE;
DO $$ BEGIN PERFORM set_config('request.jwt.claim.sub', current_setting('test.user_two'), true); END; $$;
SET LOCAL ROLE authenticated;

DO $$
DECLARE v_visible integer;
BEGIN
  SELECT count(*) INTO v_visible FROM public.finance_deletion_requests
  WHERE user_id = current_setting('test.user_one')::uuid;
  IF v_visible <> 0 THEN RAISE EXCEPTION 'RLS leak: user_two sees user_one deletion request'; END IF;

  -- user_two has no pending request → cancel must fail cleanly
  BEGIN
    PERFORM public.cancel_data_deletion();
    RAISE EXCEPTION 'cancel succeeded without a pending request';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'no_pending_request' THEN RAISE; END IF;
  END;

  -- non-superuser cannot sweep or list
  BEGIN
    PERFORM public.admin_finalize_due_deletions();
    RAISE EXCEPTION 'non-superuser ran deletion sweep';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'admin_required' THEN RAISE; END IF;
  END;

  IF EXISTS (SELECT 1 FROM public.admin_list_deletion_requests()) THEN
    RAISE EXCEPTION 'non-superuser listed deletion requests';
  END IF;
END;
$$;

-- === due path: backdate grace, finalise, verify completed ================
RESET ROLE;
DO $$ BEGIN PERFORM set_config('request.jwt.claim.sub', current_setting('test.user_two'), true); END; $$;
SET LOCAL ROLE authenticated;

DO $$
DECLARE v_result jsonb;
BEGIN
  PERFORM public.request_data_deletion('finance_data');
END;
$$;

-- backdating needs table owner rights; do it as the definer-less superuser path
RESET ROLE;
UPDATE public.finance_deletion_requests
SET grace_until = now() - interval '1 minute'
WHERE user_id = current_setting('test.user_two')::uuid;

DO $$ BEGIN PERFORM set_config('request.jwt.claim.sub', current_setting('test.user_two'), true); END; $$;
SET LOCAL ROLE authenticated;

DO $$
DECLARE v_result jsonb;
BEGIN
  v_result := public.finalize_my_due_deletion();
  IF NOT (v_result->>'finalized')::boolean THEN RAISE EXCEPTION 'due request not finalised: %', v_result; END IF;
  IF public.get_my_deletion_status()->>'status' <> 'completed' THEN RAISE EXCEPTION 'status not completed'; END IF;
  -- no finance rows left for this owner
  IF EXISTS (SELECT 1 FROM public.finance_transactions WHERE owner_id = auth.uid()) THEN
    RAISE EXCEPTION 'finance_transactions remain after finalisation';
  END IF;
END;
$$;

-- === account request: sync-time call refuses, edge-function call finalises ===
DO $$ BEGIN PERFORM set_config('request.jwt.claim.sub', current_setting('test.user_one'), true); END; $$;
SET LOCAL ROLE authenticated;
DO $$ BEGIN PERFORM public.request_data_deletion('account'); END; $$;

RESET ROLE;
UPDATE public.finance_deletion_requests
SET grace_until = now() - interval '1 minute'
WHERE user_id = current_setting('test.user_one')::uuid;

DO $$ BEGIN PERFORM set_config('request.jwt.claim.sub', current_setting('test.user_one'), true); END; $$;
SET LOCAL ROLE authenticated;
DO $$
DECLARE v_result jsonb;
BEGIN
  -- default call (as used opportunistically at sync time) must NOT finalise an account request
  v_result := public.finalize_my_due_deletion();
  IF (v_result->>'finalized')::boolean THEN RAISE EXCEPTION 'sync-time call finalised an account request'; END IF;
  IF v_result->>'reason' <> 'needs_account_edge_function' THEN RAISE EXCEPTION 'wrong reason: %', v_result; END IF;

  -- the edge function calls it with p_allow_account => true
  v_result := public.finalize_my_due_deletion(true);
  IF NOT (v_result->>'finalized')::boolean THEN RAISE EXCEPTION 'edge-function call did not finalise: %', v_result; END IF;
  IF NOT (v_result->>'authUserDeletionPending')::boolean THEN RAISE EXCEPTION 'authUserDeletionPending not set for account'; END IF;
END;
$$;

RESET ROLE;
ROLLBACK;
