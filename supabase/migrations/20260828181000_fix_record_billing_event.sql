-- Repair: record_billing_event assigned ROW_COUNT (integer) into a boolean.
-- Same behaviour, correct types. (The 20260828180000 source is also corrected;
-- this migration fixes databases where the broken version already applied.)

CREATE OR REPLACE FUNCTION public.record_billing_event(
  p_provider text,
  p_event_id text,
  p_event_type text,
  p_event_at timestamptz,
  p_payload_sha256 text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rows integer;
BEGIN
  INSERT INTO public.billing_webhook_events (provider, event_id, event_type, event_at, payload_sha256)
  VALUES (p_provider, p_event_id, p_event_type, p_event_at, p_payload_sha256)
  ON CONFLICT (provider, event_id) DO NOTHING;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows > 0;
END;
$$;

REVOKE ALL ON FUNCTION public.record_billing_event(text, text, text, timestamptz, text) FROM PUBLIC, anon, authenticated;
