-- Profiles are identity/authorization records, not client-owned sync rows.
-- Remove the legacy broad policy that allowed users to update is_superuser/role.
DROP POLICY IF EXISTS "profiles own rows" ON public.profiles;
DROP POLICY IF EXISTS profiles_own_rows ON public.profiles;

REVOKE INSERT, UPDATE, DELETE ON public.profiles FROM authenticated;
GRANT SELECT ON public.profiles TO authenticated;
