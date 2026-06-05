-- Co-admin predicate (mirrors is_org_admin). A co-admin is NOT an org admin:
-- they only gain team-scoped powers (e.g. adding calls for their own downline).
CREATE OR REPLACE FUNCTION public.is_co_admin()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT public.current_app_role() = 'co_admin'
$$;

COMMENT ON FUNCTION public.is_co_admin() IS
  'TRUE when the caller''s app_role is co_admin (team-scoped manager named by an admin).';
