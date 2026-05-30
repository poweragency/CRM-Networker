-- =============================================================================
-- File 0005 — Auth claim accessors, visibility primitive, access-token hook
-- Purpose: The authorization spine read by every RLS policy.
--          * JWT claim accessors: current_org_id(), current_marketer_id(),
--            current_app_role(), current_rank(), current_membership_status(),
--            is_platform_admin(), is_org_admin()
--          * current_membership_active() live-claim convenience
--          * can_see_marketer(target) — the SINGLE visibility primitive over the
--            closure table (own + descendants; admin/owner & platform bypass)
--          * can_see_marketer_in_branch(root, target, side) — branch-scoped variant
--          * assert_caller_active() — live membership_status re-check (defeats
--            stale JWTs on write paths)
--          * custom_access_token_hook(event) — stamps the ADR-007 claim set
--
-- Depends on: 0003_tenancy_identity.sql (memberships, ranks_meta, platform_admins),
--             0004_marketers_tree.sql (marketers, marketer_tree_closure)
--
-- ADR-007 claim set (top-level `role`):
--   org_id, marketer_id, role, rank, crm_access, membership_status, is_platform_admin
--
-- NAMING NOTE (see issues): the task brief mandates current_* accessor names.
-- Docs 04 (auth_org_id/auth_marketer_id/auth_role) and 10 (jwt_org_id/
-- jwt_marketer_id/jwt_role/jwt_membership_active) used different spellings for the
-- SAME claims. We adopt the brief's current_* names as canonical and use them
-- consistently in 0006. is_org_admin() keeps its name (identical across docs).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Claim accessors. STABLE; a missing/empty claim returns NULL/default so RLS
-- fails CLOSED (deny) rather than erroring.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.current_org_id()
RETURNS uuid
LANGUAGE sql STABLE
AS $$
  SELECT NULLIF(auth.jwt() ->> 'org_id', '')::uuid
$$;

CREATE OR REPLACE FUNCTION public.current_marketer_id()
RETURNS uuid
LANGUAGE sql STABLE
AS $$
  SELECT NULLIF(auth.jwt() ->> 'marketer_id', '')::uuid
$$;

-- NB: named current_app_role(), NOT current_role — the latter is a reserved SQL
-- niladic function (returns the session DB role). The rename avoids any
-- unqualified-call footgun. (Resolves BUILD-REPORT O-2.)
CREATE OR REPLACE FUNCTION public.current_app_role()
RETURNS text
LANGUAGE sql STABLE
AS $$
  SELECT COALESCE(NULLIF(auth.jwt() ->> 'role', ''), 'member')
$$;

CREATE OR REPLACE FUNCTION public.current_rank()
RETURNS text
LANGUAGE sql STABLE
AS $$
  SELECT NULLIF(auth.jwt() ->> 'rank', '')
$$;

CREATE OR REPLACE FUNCTION public.current_membership_status()
RETURNS text
LANGUAGE sql STABLE
AS $$
  SELECT NULLIF(auth.jwt() ->> 'membership_status', '')
$$;

CREATE OR REPLACE FUNCTION public.current_membership_active()
RETURNS boolean
LANGUAGE sql STABLE
AS $$
  SELECT public.current_membership_status() = 'active'
$$;

-- Platform super_admin (ADR-009 #3): true if the JWT carries the claim, OR (as a
-- defensive fallback when the claim is absent) the login is present in
-- platform_admins. The closure read in can_see_marketer never depends on this.
CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS boolean
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((auth.jwt() ->> 'is_platform_admin')::boolean, false)
      OR EXISTS (SELECT 1 FROM public.platform_admins pa WHERE pa.user_id = auth.uid());
$$;

CREATE OR REPLACE FUNCTION public.is_org_admin()
RETURNS boolean
LANGUAGE sql STABLE
AS $$
  SELECT public.current_app_role() IN ('admin', 'owner') OR public.is_platform_admin()
$$;

COMMENT ON FUNCTION public.current_org_id() IS 'JWT org_id claim (tenant). NULL when absent -> RLS denies.';
COMMENT ON FUNCTION public.current_marketer_id() IS 'JWT marketer_id claim (caller profile / closure ancestor root).';
COMMENT ON FUNCTION public.is_org_admin() IS 'True for role admin/owner (or platform admin). Bypasses subtree filter, never the tenant filter.';
COMMENT ON FUNCTION public.is_platform_admin() IS 'ADR-009 #3 super_admin: from is_platform_admin JWT claim or platform_admins table.';

-- -----------------------------------------------------------------------------
-- can_see_marketer(target) — THE single visibility primitive.
-- "caller can see X" <=> a closure row exists with ancestor_id = caller's
-- marketer_id and descendant_id = X (depth 0 = self). Admin/owner & platform
-- bypass the subtree filter. SECURITY DEFINER to read the closure without
-- recursing into the marketer_tree_closure RLS; re-applies the tenant filter
-- internally so it can never become a cross-org oracle.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.can_see_marketer(target_marketer_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.is_org_admin()                       -- admins/owners/platform see the whole org
    OR EXISTS (
      SELECT 1
      FROM public.marketer_tree_closure c
      WHERE c.org_id        = public.current_org_id()      -- tenant-scope the closure read
        AND c.ancestor_id   = public.current_marketer_id() -- caller is an ancestor (or self)
        AND c.descendant_id = target_marketer_id
    );
$$;

COMMENT ON FUNCTION public.can_see_marketer(uuid) IS
  'Single visibility primitive: true iff caller (current_marketer_id) is an ancestor-or-self of target in the same org, OR caller is admin/owner/platform. SECURITY DEFINER; re-applies tenant filter; returns only a boolean.';

-- Branch-scoped visibility (Left/Right analytics, branch leaderboards). doc 04 §1.4
CREATE OR REPLACE FUNCTION public.can_see_marketer_in_branch(
  root_marketer_id   uuid,
  target_marketer_id uuid,
  side               placement_leg
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.can_see_marketer(root_marketer_id)   -- caller must be allowed to see the branch root
    AND EXISTS (
      SELECT 1
      FROM public.marketer_tree_closure c
      WHERE c.org_id        = public.current_org_id()
        AND c.ancestor_id   = root_marketer_id
        AND c.descendant_id = target_marketer_id
        AND c.branch_leg    = side               -- O(1) via closure_branch_idx
    );
$$;

COMMENT ON FUNCTION public.can_see_marketer_in_branch(uuid, uuid, placement_leg) IS
  'Branch-scoped visibility: target is in root''s LEFT/RIGHT branch and caller can see root. branch_leg is NULL on the self-row, so the root is excluded from its own branch.';

-- -----------------------------------------------------------------------------
-- assert_caller_active() — live membership_status re-check (doc 10 §4.4).
-- Used by privileged write functions to reject suspended/disabled callers even
-- on a still-valid (<= 1h) JWT.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.assert_caller_active()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.memberships m
    WHERE m.user_id = auth.uid()
      AND m.org_id  = public.current_org_id()
      AND m.status  = 'active'
      AND m.deleted_at IS NULL
  );
$$;

COMMENT ON FUNCTION public.assert_caller_active() IS
  'Live re-check that the caller''s membership is active (defeats stale JWTs on suspension). Invoked by sensitive write functions.';

-- -----------------------------------------------------------------------------
-- custom_access_token_hook(event) — ADR-007 access-token auth hook.
-- Stamps the canonical claim set from memberships + marketers + ranks_meta:
--   org_id, marketer_id, role, rank, crm_access, membership_status, is_platform_admin
-- Registered in Supabase Auth -> Hooks -> Custom Access Token.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid          uuid := (event -> 'claims' ->> 'sub')::uuid;
  v_claims       jsonb := event -> 'claims';
  v_membership   record;
  v_crm_access   boolean;
  v_is_platform  boolean;
BEGIN
  -- Platform-admin flag is independent of any org membership.
  v_is_platform := EXISTS (SELECT 1 FROM public.platform_admins pa WHERE pa.user_id = v_uid);

  -- Resolve the active membership for this login. One membership per org;
  -- v1 MVP = one org per login (active preferred, then earliest).
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
    -- No profile link yet (mid-activation) or platform-only login: issue a token
    -- with no org context (RLS denies all tenant rows) but carry the platform flag.
    v_claims := v_claims || jsonb_build_object('is_platform_admin', v_is_platform);
    RETURN jsonb_set(event, '{claims}', v_claims);
  END IF;

  v_crm_access := COALESCE(v_membership.crm_eligible, false)
                  OR COALESCE((v_membership.permissions ->> 'crm_access')::boolean, false);

  v_claims := v_claims
    || jsonb_build_object(
         'org_id',            v_membership.org_id,
         'marketer_id',       v_membership.marketer_id,
         'role',              v_membership.role,
         'rank',              v_membership.rank,
         'crm_access',        v_crm_access,
         'membership_status', v_membership.status,
         'is_platform_admin', v_is_platform
       );

  RETURN jsonb_set(event, '{claims}', v_claims);
END;
$$;

COMMENT ON FUNCTION public.custom_access_token_hook(jsonb) IS
  'ADR-007 Supabase access-token auth hook. Stamps org_id, marketer_id, role, rank, crm_access, membership_status, is_platform_admin from memberships/marketers/ranks_meta. role is a TOP-LEVEL claim.';

-- -----------------------------------------------------------------------------
-- Privilege locking for the auth hook (doc 10 §2.2). Only the auth admin role
-- may execute it; revoke from app roles. Grant the minimal reads it needs.
-- -----------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb) FROM authenticated, anon, public;
GRANT  EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb) TO supabase_auth_admin;
GRANT  USAGE  ON SCHEMA public TO supabase_auth_admin;
GRANT  SELECT ON public.memberships, public.marketers, public.ranks_meta, public.platform_admins
  TO supabase_auth_admin;

-- Visibility helpers are callable by logged-in users; deny anon/public.
REVOKE EXECUTE ON FUNCTION public.can_see_marketer(uuid) FROM public;
GRANT  EXECUTE ON FUNCTION public.can_see_marketer(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.can_see_marketer_in_branch(uuid, uuid, placement_leg) FROM public;
GRANT  EXECUTE ON FUNCTION public.can_see_marketer_in_branch(uuid, uuid, placement_leg) TO authenticated;
