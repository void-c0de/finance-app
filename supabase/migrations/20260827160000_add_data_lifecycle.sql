-- Data lifecycle: user-initiated deletion of synchronised finance data and
-- account deletion, with a cancellable grace window and lazy finalisation.
--
-- Design constraints:
--  * Free infrastructure only. No scheduled jobs. Finalisation happens when the
--    owner's client calls finalize_my_due_deletion() (opportunistically on sync)
--    or when a superuser sweeps due requests. No fake background guarantee.
--  * The authenticated user may only ever act on THEMSELVES. No target-user
--    argument is accepted anywhere.
--  * SECURITY DEFINER functions pin search_path and are revoked from anon.
--  * Deletion of the auth.users row itself needs service_role and therefore an
--    Edge Function (finalize-account-deletion) — documented as an external
--    blocker. Finance-data deletion works fully without it.

CREATE TABLE IF NOT EXISTS public.finance_deletion_requests (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'finance_data' CHECK (kind IN ('finance_data', 'account')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'cancelled', 'completed')),
  requested_at timestamptz NOT NULL DEFAULT now(),
  grace_until timestamptz NOT NULL,
  finalized_at timestamptz,
  rows_deleted integer,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.finance_deletion_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS deletion_requests_select_own ON public.finance_deletion_requests;
CREATE POLICY deletion_requests_select_own ON public.finance_deletion_requests
FOR SELECT USING (user_id = auth.uid() OR public.is_superuser());

DROP TRIGGER IF EXISTS set_updated_at ON public.finance_deletion_requests;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.finance_deletion_requests
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

REVOKE ALL ON public.finance_deletion_requests FROM anon;
GRANT SELECT ON public.finance_deletion_requests TO authenticated;

-- Grace window: 3 days. A single constant, easy to tune later.
CREATE OR REPLACE FUNCTION public.deletion_grace_interval()
RETURNS interval
LANGUAGE sql
IMMUTABLE
AS $$ SELECT interval '3 days' $$;

-- ---------------------------------------------------------------------------
-- Request / cancel
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.request_data_deletion(p_kind text DEFAULT 'finance_data')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_row public.finance_deletion_requests%ROWTYPE;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'authentication_required'; END IF;
  IF p_kind NOT IN ('finance_data', 'account') THEN RAISE EXCEPTION 'invalid_kind'; END IF;

  INSERT INTO public.finance_deletion_requests (user_id, kind, status, requested_at, grace_until)
  VALUES (v_user_id, p_kind, 'pending', now(), now() + public.deletion_grace_interval())
  ON CONFLICT (user_id) DO UPDATE SET
    kind = excluded.kind,
    status = 'pending',
    requested_at = now(),
    grace_until = now() + public.deletion_grace_interval(),
    finalized_at = NULL,
    rows_deleted = NULL
  RETURNING * INTO v_row;

  INSERT INTO public.admin_audit_log (actor_user_id, action, target_user_id, metadata)
  VALUES (v_user_id, 'deletion.requested', v_user_id, jsonb_build_object('kind', p_kind));

  RETURN jsonb_build_object(
    'kind', v_row.kind,
    'status', v_row.status,
    'requestedAt', v_row.requested_at,
    'graceUntil', v_row.grace_until
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_data_deletion()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_row public.finance_deletion_requests%ROWTYPE;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'authentication_required'; END IF;

  UPDATE public.finance_deletion_requests
  SET status = 'cancelled'
  WHERE user_id = v_user_id AND status = 'pending'
  RETURNING * INTO v_row;

  IF NOT FOUND THEN RAISE EXCEPTION 'no_pending_request'; END IF;

  INSERT INTO public.admin_audit_log (actor_user_id, action, target_user_id, metadata)
  VALUES (v_user_id, 'deletion.cancelled', v_user_id, jsonb_build_object('kind', v_row.kind));

  RETURN jsonb_build_object('status', 'cancelled');
END;
$$;

CREATE OR REPLACE FUNCTION public.get_my_deletion_status()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_row public.finance_deletion_requests%ROWTYPE;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'authentication_required'; END IF;
  SELECT * INTO v_row FROM public.finance_deletion_requests WHERE user_id = v_user_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'none');
  END IF;
  RETURN jsonb_build_object(
    'kind', v_row.kind,
    'status', v_row.status,
    'requestedAt', v_row.requested_at,
    'graceUntil', v_row.grace_until,
    'finalizedAt', v_row.finalized_at,
    'due', v_row.status = 'pending' AND v_row.grace_until <= now()
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- Finalisation — deletes only the CALLER's own finance rows, FK-safe order
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.purge_owner_finance_data(p_owner uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted integer := 0;
  v_step integer;
BEGIN
  -- children first, then parents
  DELETE FROM public.finance_goal_contributions WHERE owner_id = p_owner;
  GET DIAGNOSTICS v_step = ROW_COUNT; v_deleted := v_deleted + v_step;
  DELETE FROM public.finance_transactions WHERE owner_id = p_owner;
  GET DIAGNOSTICS v_step = ROW_COUNT; v_deleted := v_deleted + v_step;
  DELETE FROM public.finance_recurring_series WHERE owner_id = p_owner;
  GET DIAGNOSTICS v_step = ROW_COUNT; v_deleted := v_deleted + v_step;
  DELETE FROM public.finance_budgets WHERE owner_id = p_owner;
  GET DIAGNOSTICS v_step = ROW_COUNT; v_deleted := v_deleted + v_step;
  DELETE FROM public.finance_savings_goals WHERE owner_id = p_owner;
  GET DIAGNOSTICS v_step = ROW_COUNT; v_deleted := v_deleted + v_step;
  DELETE FROM public.finance_category_rules WHERE owner_id = p_owner;
  GET DIAGNOSTICS v_step = ROW_COUNT; v_deleted := v_deleted + v_step;
  DELETE FROM public.finance_accounts WHERE owner_id = p_owner;
  GET DIAGNOSTICS v_step = ROW_COUNT; v_deleted := v_deleted + v_step;
  DELETE FROM public.finance_bank_connections WHERE owner_id = p_owner;
  GET DIAGNOSTICS v_step = ROW_COUNT; v_deleted := v_deleted + v_step;
  DELETE FROM public.finance_categories WHERE owner_id = p_owner;
  GET DIAGNOSTICS v_step = ROW_COUNT; v_deleted := v_deleted + v_step;
  DELETE FROM public.app_debug_logs WHERE owner_id = p_owner;
  GET DIAGNOSTICS v_step = ROW_COUNT; v_deleted := v_deleted + v_step;
  RETURN v_deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.purge_owner_finance_data(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.finalize_my_due_deletion()
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

  v_deleted := public.purge_owner_finance_data(v_user_id);

  -- Premium-Entitlement zurücksetzen; Coupon-Einlösungen (Historie) bleiben.
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
    -- Bei 'account' muss zusätzlich der Auth-Nutzer über die Edge Function
    -- gelöscht werden; das kann der Client nicht (kein service_role).
    'authUserDeletionPending', v_row.kind = 'account'
  );
END;
$$;

-- Superuser-Sweep (operativ, ersetzt keinen Scheduler)
CREATE OR REPLACE FUNCTION public.admin_finalize_due_deletions()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rec record;
  v_count integer := 0;
  v_rows integer := 0;
  v_step integer;
BEGIN
  IF NOT public.is_superuser() THEN RAISE EXCEPTION 'admin_required'; END IF;
  FOR v_rec IN
    SELECT user_id FROM public.finance_deletion_requests
    WHERE status = 'pending' AND grace_until <= now()
    FOR UPDATE
  LOOP
    v_step := public.purge_owner_finance_data(v_rec.user_id);
    DELETE FROM public.user_subscriptions WHERE user_id = v_rec.user_id;
    UPDATE public.finance_deletion_requests
    SET status = 'completed', finalized_at = now(), rows_deleted = v_step
    WHERE user_id = v_rec.user_id;
    v_count := v_count + 1;
    v_rows := v_rows + v_step;
  END LOOP;
  INSERT INTO public.admin_audit_log (actor_user_id, action, metadata)
  VALUES (auth.uid(), 'deletion.sweep', jsonb_build_object('requests', v_count, 'rowsDeleted', v_rows));
  RETURN jsonb_build_object('requests', v_count, 'rowsDeleted', v_rows);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_list_deletion_requests()
RETURNS SETOF public.finance_deletion_requests
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM public.finance_deletion_requests
  WHERE public.is_superuser()
  ORDER BY requested_at DESC
  LIMIT 200
$$;

-- ---------------------------------------------------------------------------
-- Grants — authenticated only, self-scoped; anon revoked everywhere
-- ---------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.request_data_deletion(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cancel_data_deletion() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_my_deletion_status() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.finalize_my_due_deletion() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_finalize_due_deletions() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_list_deletion_requests() FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.request_data_deletion(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_data_deletion() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_deletion_status() TO authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_my_due_deletion() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_finalize_due_deletions() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_deletion_requests() TO authenticated;
