-- app_debug_logs retention.
--
-- The table holds short, REDACTED technical event lines (no tokens, no raw
-- transactions, no email; message capped 500 chars, details 2000 — see
-- src/core/debugLog.ts). It exists only to debug sync problems for the owner.
--
-- Retention: 14 days OR the 500 most recent rows per owner, whichever is
-- smaller. No paid cron: the client calls prune_my_debug_logs() right before it
-- uploads a new batch (lazy, self-scoped, free). A superuser sweep exists too.

CREATE OR REPLACE FUNCTION public.prune_my_debug_logs(p_keep_days integer DEFAULT 14)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_deleted integer := 0;
  v_step integer;
  v_keep integer := least(greatest(coalesce(p_keep_days, 14), 1), 90);
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'authentication_required'; END IF;

  DELETE FROM public.app_debug_logs
  WHERE owner_id = v_user_id
    AND created_at < now() - make_interval(days => v_keep);
  GET DIAGNOSTICS v_step = ROW_COUNT; v_deleted := v_deleted + v_step;

  -- Cap the row count per owner regardless of age.
  DELETE FROM public.app_debug_logs
  WHERE id IN (
    SELECT id FROM public.app_debug_logs
    WHERE owner_id = v_user_id
    ORDER BY created_at DESC
    OFFSET 500
  );
  GET DIAGNOSTICS v_step = ROW_COUNT; v_deleted := v_deleted + v_step;

  RETURN v_deleted;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_prune_debug_logs(p_keep_days integer DEFAULT 14)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted integer;
  v_keep integer := least(greatest(coalesce(p_keep_days, 14), 1), 90);
BEGIN
  IF NOT public.is_superuser() THEN RAISE EXCEPTION 'admin_required'; END IF;
  DELETE FROM public.app_debug_logs WHERE created_at < now() - make_interval(days => v_keep);
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  INSERT INTO public.admin_audit_log (actor_user_id, action, metadata)
  VALUES (auth.uid(), 'debug_logs.pruned', jsonb_build_object('keepDays', v_keep, 'deleted', v_deleted));
  RETURN v_deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.prune_my_debug_logs(integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_prune_debug_logs(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.prune_my_debug_logs(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_prune_debug_logs(integer) TO authenticated;

-- Owner may now also DELETE their own debug rows directly (needed for the purge
-- inside finalize_my_due_deletion / prune, and harmless — RLS scopes it).
DROP POLICY IF EXISTS app_debug_logs_delete_own ON public.app_debug_logs;
CREATE POLICY app_debug_logs_delete_own ON public.app_debug_logs
FOR DELETE USING (owner_id = auth.uid() OR public.is_superuser());

DROP POLICY IF EXISTS app_debug_logs_select_own ON public.app_debug_logs;
CREATE POLICY app_debug_logs_select_own ON public.app_debug_logs
FOR SELECT USING (owner_id = auth.uid() OR public.is_superuser());

GRANT DELETE ON public.app_debug_logs TO authenticated;
