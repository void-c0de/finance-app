-- Persisted recurring-series user corrections.
-- This table stores the user's DECISION about a recurring relationship
-- (confirmed/changed kind, or "this is not a recurring payment" => muted),
-- never transaction truth. The primary id is the deterministic
-- recurringSeriesKey(accountId, currency, direction, merchant), so two devices
-- correcting the same series produce the same row and the sync conflict
-- resolves via ON CONFLICT(id) + last-writer-wins on updated_at.

CREATE TABLE IF NOT EXISTS public.finance_recurring_series (
  id text PRIMARY KEY,
  owner_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  merchant_name text,
  kind text NOT NULL DEFAULT 'uncertain',
  muted boolean NOT NULL DEFAULT false,
  user_confirmed boolean NOT NULL DEFAULT true,
  expected_amount_minor bigint,
  currency text,
  cadence text,
  note text,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.finance_recurring_series ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS finance_recurring_series_own_rows ON public.finance_recurring_series;
CREATE POLICY finance_recurring_series_own_rows ON public.finance_recurring_series
FOR ALL USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

DROP TRIGGER IF EXISTS set_updated_at ON public.finance_recurring_series;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.finance_recurring_series
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS idx_finance_recurring_series_owner_updated
ON public.finance_recurring_series (owner_id, updated_at);

REVOKE ALL ON public.finance_recurring_series FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.finance_recurring_series TO authenticated;
