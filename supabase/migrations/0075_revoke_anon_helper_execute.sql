-- 0075: hardening (security advisor 0028 anon_security_definer_function_executable).
--
-- Remove anon's ability to call SECURITY DEFINER helper functions that are only
-- ever needed by signed-in users (they are RLS internals / per-request helpers).
-- They already FAIL CLOSED for an unauthenticated caller (no auth.uid()/auth.jwt()
-- -> return false/null), so this is defense-in-depth: it just removes them from the
-- public REST surface (/rest/v1/rpc/...). Mirrors the 0068/0069 convention.
--
-- NOT revoked here:
--   * invitation_context(text) — intentionally callable by anon (the invite
--     landing page resolves the invitation BEFORE the user has a session).
--   * the per-table current_* claim accessors stay granted to authenticated (RLS
--     policies evaluated as `authenticated` need EXECUTE on them).
--
-- Calls to these functions from INSIDE other SECURITY DEFINER functions / RLS
-- policies are unaffected (they run with the function-owner's privileges).
--
-- Apply to prod via the Supabase MCP / `supabase db push`; this file keeps the
-- repo in sync.

REVOKE EXECUTE ON FUNCTION public.assert_caller_active()            FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.is_platform_admin()               FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.org_day_bounds(uuid, date)        FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.org_local_date(uuid, timestamptz) FROM anon, public;

GRANT EXECUTE ON FUNCTION public.assert_caller_active()            TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_platform_admin()               TO authenticated;
GRANT EXECUTE ON FUNCTION public.org_day_bounds(uuid, date)        TO authenticated;
GRANT EXECUTE ON FUNCTION public.org_local_date(uuid, timestamptz) TO authenticated;
