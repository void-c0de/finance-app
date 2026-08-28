-- Security hardening (db advisor 0011): pin the search_path on
-- deletion_grace_interval(). It is a pure constant helper, so the behavioural
-- risk is nil, but every function should pin its path.

CREATE OR REPLACE FUNCTION public.deletion_grace_interval()
RETURNS interval
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$ SELECT interval '3 days' $$;
