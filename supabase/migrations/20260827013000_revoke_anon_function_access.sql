-- Supabase may grant function execution explicitly to API roles. PUBLIC revoke
-- alone is therefore insufficient: no SECURITY DEFINER function is callable by anon.
REVOKE EXECUTE ON FUNCTION public.is_superuser(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_my_product_access() FROM anon;
REVOKE EXECUTE ON FUNCTION public.redeem_premium_coupon(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_create_coupon(text, integer, integer, timestamptz, text, boolean) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_set_coupon_active(uuid, boolean) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_grant_premium(text, integer, boolean) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_revoke_premium(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_publish_release(text, integer, text, text, text, text, text, text) FROM anon;

-- Trigger/maintenance functions are never direct client APIs.
REVOKE EXECUTE ON FUNCTION public.create_profile_for_new_user() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM anon, authenticated;
