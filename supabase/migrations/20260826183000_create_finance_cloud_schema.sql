-- Complete, reproducible cloud schema for the local-first finance client.
-- Every row is owned by the authenticated user; clients never provide owner_id.

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  is_superuser boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.create_profile_for_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id) VALUES (NEW.id)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS create_profile_after_signup ON auth.users;
CREATE TRIGGER create_profile_after_signup
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.create_profile_for_new_user();

INSERT INTO public.profiles (id)
SELECT id FROM auth.users
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.finance_categories (
  id text PRIMARY KEY,
  owner_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  icon text,
  is_income_category boolean NOT NULL DEFAULT false,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.finance_bank_connections (
  id text PRIMARY KEY,
  owner_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  provider_id text NOT NULL,
  external_connection_id text NOT NULL,
  institution_id text NOT NULL,
  institution_name text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  is_demo boolean NOT NULL DEFAULT false,
  last_synced_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.finance_category_rules (
  id text PRIMARY KEY,
  owner_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  match_type text NOT NULL,
  match_value text NOT NULL,
  category_id text,
  enabled boolean NOT NULL DEFAULT true,
  priority integer NOT NULL DEFAULT 0,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.finance_accounts (
  id text PRIMARY KEY,
  owner_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  bank_connection_id text,
  provider_id text NOT NULL,
  external_account_id text NOT NULL,
  name text NOT NULL,
  iban text,
  currency text NOT NULL DEFAULT 'EUR',
  balance_minor bigint NOT NULL DEFAULT 0,
  type text,
  institution_name text,
  last_synced_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.finance_budgets (
  id text PRIMARY KEY,
  owner_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  category_id text,
  name text NOT NULL,
  amount_minor bigint NOT NULL DEFAULT 0,
  period text NOT NULL DEFAULT 'monthly',
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.finance_savings_goals (
  id text PRIMARY KEY,
  owner_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  target_amount_minor bigint NOT NULL DEFAULT 0,
  current_amount_minor bigint NOT NULL DEFAULT 0,
  starting_amount_minor bigint NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'EUR',
  target_date text,
  linked_account_id text,
  rule_keyword text,
  tracking_mode text NOT NULL DEFAULT 'manual',
  status text NOT NULL DEFAULT 'active',
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.finance_goal_contributions (
  id text PRIMARY KEY,
  owner_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  goal_id text NOT NULL,
  amount_minor bigint NOT NULL,
  source text NOT NULL,
  source_transaction_id text,
  note text,
  occurred_at timestamptz NOT NULL,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.finance_transactions (
  id text PRIMARY KEY,
  owner_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id text NOT NULL,
  external_transaction_id text NOT NULL,
  amount_minor bigint NOT NULL,
  currency text NOT NULL DEFAULT 'EUR',
  direction text NOT NULL,
  booking_date text NOT NULL,
  booking_status text NOT NULL DEFAULT 'booked',
  value_date text,
  description text NOT NULL DEFAULT '',
  counterparty_name text,
  counterparty_iban text,
  category_id text,
  category_source text,
  is_recurring boolean NOT NULL DEFAULT false,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.app_debug_logs (
  id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  owner_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  ts timestamptz NOT NULL,
  level text NOT NULL,
  tag text NOT NULL,
  message text NOT NULL,
  details text,
  created_at timestamptz NOT NULL DEFAULT now()
);

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'profiles', 'finance_categories', 'finance_bank_connections',
    'finance_category_rules', 'finance_accounts', 'finance_budgets',
    'finance_savings_goals', 'finance_goal_contributions',
    'finance_transactions', 'app_debug_logs'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
  END LOOP;
END;
$$;

DROP POLICY IF EXISTS profiles_select_own ON public.profiles;
CREATE POLICY profiles_select_own ON public.profiles
FOR SELECT USING (id = auth.uid());

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'finance_categories', 'finance_bank_connections', 'finance_category_rules',
    'finance_accounts', 'finance_budgets', 'finance_savings_goals',
    'finance_goal_contributions', 'finance_transactions'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', table_name || '_own_rows', table_name);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid())',
      table_name || '_own_rows', table_name
    );
    EXECUTE format('DROP TRIGGER IF EXISTS set_updated_at ON public.%I', table_name);
    EXECUTE format(
      'CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()',
      table_name
    );
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I (owner_id, updated_at)', 'idx_' || table_name || '_owner_updated', table_name);
  END LOOP;
END;
$$;

DROP POLICY IF EXISTS app_debug_logs_insert_own ON public.app_debug_logs;
CREATE POLICY app_debug_logs_insert_own ON public.app_debug_logs
FOR INSERT WITH CHECK (owner_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_app_debug_logs_owner_created
ON public.app_debug_logs(owner_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_finance_transactions_owner_booking
ON public.finance_transactions(owner_id, booking_date DESC);

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.finance_categories TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.finance_bank_connections TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.finance_category_rules TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.finance_accounts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.finance_budgets TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.finance_savings_goals TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.finance_goal_contributions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.finance_transactions TO authenticated;
GRANT INSERT ON public.app_debug_logs TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.app_debug_logs_id_seq TO authenticated;
