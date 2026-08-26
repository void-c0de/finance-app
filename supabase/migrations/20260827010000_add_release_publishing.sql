CREATE OR REPLACE FUNCTION public.admin_publish_release(
  p_version text, p_build_number integer, p_runtime_version text,
  p_title text, p_summary text, p_update_level text DEFAULT 'optional',
  p_minimum_native_version text DEFAULT NULL, p_store_url text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_id uuid;
BEGIN
  IF NOT public.is_superuser() THEN RAISE EXCEPTION 'admin_required'; END IF;
  IF p_update_level NOT IN ('optional','recommended','required') THEN RAISE EXCEPTION 'invalid_update_level'; END IF;
  IF trim(p_title) = '' OR trim(p_summary) = '' THEN RAISE EXCEPTION 'release_notes_required'; END IF;
  UPDATE public.app_releases SET published = false WHERE platform = 'android' AND published;
  INSERT INTO public.app_releases(platform, version, build_number, runtime_version, title, summary, update_level, minimum_native_version, store_url, published, published_at, created_by)
  VALUES('android', trim(p_version), p_build_number, trim(p_runtime_version), trim(p_title), trim(p_summary), p_update_level, nullif(trim(p_minimum_native_version), ''), nullif(trim(p_store_url), ''), true, now(), auth.uid())
  ON CONFLICT(platform, version, build_number) DO UPDATE SET
    runtime_version=excluded.runtime_version, title=excluded.title, summary=excluded.summary,
    update_level=excluded.update_level, minimum_native_version=excluded.minimum_native_version,
    store_url=excluded.store_url, published=true, published_at=now(), updated_at=now()
  RETURNING id INTO v_id;
  INSERT INTO public.admin_audit_log(actor_user_id, action, entity_id, metadata)
  VALUES(auth.uid(), 'release.published', v_id::text, jsonb_build_object('version', p_version, 'buildNumber', p_build_number, 'level', p_update_level));
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_publish_release(text, integer, text, text, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_publish_release(text, integer, text, text, text, text, text, text) TO authenticated;

DO $$
DECLARE v_admin uuid;
BEGIN
  SELECT id INTO v_admin FROM public.profiles WHERE role='superuser' ORDER BY created_at LIMIT 1;
  IF v_admin IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.app_releases WHERE platform='android' AND version='1.1.0' AND build_number=2) THEN
    INSERT INTO public.app_releases(platform, version, build_number, runtime_version, title, summary, update_level, published, published_at, created_by)
    VALUES('android','1.1.0',2,'1.1.0','Stabilere Bankverbindungen','OTA-Start, Transaktionsabgleich und Verbindungsstatus wurden deutlich robuster.','optional',true,now(),v_admin);
  END IF;
END;
$$;
