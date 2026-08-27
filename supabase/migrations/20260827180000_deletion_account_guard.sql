-- finalize_my_due_deletion gains p_allow_account so that only the account-
-- deletion Edge Function (which can also remove the auth.users row) finalises
-- an 'account' request. The opportunistic sync-time call finalises 'finance_data'
-- requests only and leaves 'account' requests for the Edge Function.

CREATE OR REPLACE FUNCTION public.finalize_my_due_deletion(p_allow_account boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_row public.finance_deletion_requests%ROWTYPE;
  v_deleted integer;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'authentication_required'; END IF;

  SELECT * INTO v_row FROM public.finance_deletion_requests
  WHERE user_id = v_user_id FOR UPDATE;

  IF NOT FOUND OR v_row.status <> 'pending' THEN
    RETURN jsonb_build_object('finalized', false, 'reason', 'no_due_request');
  END IF;
  IF v_row.grace_until > now() THEN
    RETURN jsonb_build_object('finalized', false, 'reason', 'still_in_grace', 'graceUntil', v_row.grace_until);
  END IF;
  IF v_row.kind = 'account' AND NOT p_allow_account THEN
    -- An account request is finalised only through the Edge Function so the
    -- auth.users row is removed in the same operation.
    RETURN jsonb_build_object('finalized', false, 'reason', 'needs_account_edge_function');
  END IF;

  v_deleted := public.purge_owner_finance_data(v_user_id);
  DELETE FROM public.user_subscriptions WHERE user_id = v_user_id;

  UPDATE public.finance_deletion_requests
  SET status = 'completed', finalized_at = now(), rows_deleted = v_deleted
  WHERE user_id = v_user_id;

  INSERT INTO public.admin_audit_log (actor_user_id, action, target_user_id, metadata)
  VALUES (v_user_id, 'deletion.finalized', v_user_id, jsonb_build_object('kind', v_row.kind, 'rowsDeleted', v_deleted));

  RETURN jsonb_build_object(
    'finalized', true,
    'kind', v_row.kind,
    'rowsDeleted', v_deleted,
    'authUserDeletionPending', v_row.kind = 'account'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_my_due_deletion(boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finalize_my_due_deletion(boolean) TO authenticated;

-- The old zero-arg signature is superseded; drop it so callers use the guarded one.
DROP FUNCTION IF EXISTS public.finalize_my_due_deletion();
