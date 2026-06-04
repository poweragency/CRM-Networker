-- =============================================================================
-- File 0030 — Fix custom_access_token_hook: do NOT clobber the PostgREST `role`
-- Purpose: PostgREST chooses the database role from the access token's top-level
--          `role` claim, which MUST remain 'authenticated' (a real, grantable DB
--          role). The original hook (0005) overwrote `role` with the membership
--          role (owner/admin/member), so PostgREST attempted `SET ROLE owner` and
--          returned 401 Unauthorized on EVERY REST/RPC request — the app then fell
--          back to mock data everywhere.
--
--          Fix: leave `role` untouched (stays 'authenticated') and expose the app
--          role under a dedicated top-level `app_role` claim; current_app_role()
--          (and therefore is_org_admin() and all RLS) now reads `app_role`.
--
-- Depends on: 0005_auth_visibility.sql (the original hook + current_app_role).
--
-- AFTER APPLYING: existing sessions still carry the old token — users must obtain
-- a fresh access token (logout + login, or a token refresh) for the new claims to
-- take effect. The frontend reads the role from `app_role` (lib/data/session.ts).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid          uuid := (event -> 'claims' ->> 'sub')::uuid;
  v_claims       jsonb := event -> 'claims';
  v_membership   record;
  v_crm_access   boolean;
  v_is_platform  boolean;
BEGIN
  v_is_platform := EXISTS (SELECT 1 FROM public.platform_admins pa WHERE pa.user_id = v_uid);
  SELECT m.org_id, m.marketer_id, m.role, m.status, m.permissions,
         mk.rank, rm.crm_eligible
    INTO v_membership
  FROM public.memberships m
  JOIN public.marketers   mk ON mk.id   = m.marketer_id
  JOIN public.ranks_meta  rm ON rm.rank = mk.rank
  WHERE m.user_id = v_uid
    AND m.deleted_at IS NULL
  ORDER BY (m.status = 'active') DESC, m.created_at ASC
  LIMIT 1;
  IF v_membership.marketer_id IS NULL THEN
    v_claims := v_claims || jsonb_build_object('is_platform_admin', v_is_platform);
    RETURN jsonb_set(event, '{claims}', v_claims);
  END IF;
  v_crm_access := COALESCE(v_membership.crm_eligible, false)
                  OR COALESCE((v_membership.permissions ->> 'crm_access')::boolean, false);
  -- NOTE: intentionally NOT setting 'role' — PostgREST needs it = 'authenticated'.
  v_claims := v_claims
    || jsonb_build_object(
         'org_id',            v_membership.org_id,
         'marketer_id',       v_membership.marketer_id,
         'app_role',          v_membership.role,
         'rank',              v_membership.rank,
         'crm_access',        v_crm_access,
         'membership_status', v_membership.status,
         'is_platform_admin', v_is_platform
       );
  RETURN jsonb_set(event, '{claims}', v_claims);
END;
$$;

CREATE OR REPLACE FUNCTION public.current_app_role()
RETURNS text LANGUAGE sql STABLE AS $$
  SELECT COALESCE(NULLIF(auth.jwt() ->> 'app_role', ''), 'member')
$$;
