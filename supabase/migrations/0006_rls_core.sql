-- =============================================================================
-- File 0006 — Core RLS: enable/force + policies for the foundation tables
-- Purpose: Lock down the tables owned by the foundation:
--          organizations, ranks_meta, platform_admins, memberships, marketers,
--          marketer_tree_closure, rank_history.
--          * ENABLE + FORCE ROW LEVEL SECURITY on every tenant table.
--          * Reads use can_see_marketer()/current_org_id(); writes guard org +
--            role; admin/owner bypass via is_org_admin(); platform admin global.
--          * WITH CHECK on inserts/updates so rows can't be moved out of scope.
--          * guard_marketer_structural_cols() — field-level guard (RLS can't
--            diff OLD/NEW): structural/rank/status columns are admin-only.
--
-- Depends on: 0003_tenancy_identity.sql (organizations, ranks_meta,
--             platform_admins, memberships),
--             0004_marketers_tree.sql (marketers, marketer_tree_closure, rank_history),
--             0005_auth_visibility.sql (current_*, is_org_admin, is_platform_admin,
--             can_see_marketer, current_membership_active)
--
-- Policies for the remaining tables (contacts, prospects, calls, documents,
-- analytics, notifications, audit_log, account_invitations, etc.) live in their
-- own later migrations alongside those tables.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Field-level guard: members may edit profile fields but NOT structural /
-- authority columns (parent_id, leg, sponsor_id, rank, status, org_id,
-- external_code). Consolidates doc 10 §3.5 and doc 04 §4.1. Admins/owners/
-- platform bypass. Structural MOVES go through move_marketer() (admin-only).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_marketer_structural_cols()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF public.is_org_admin() THEN
    RETURN NEW;  -- admins/owners/platform may change anything
  END IF;

  IF NEW.parent_id     IS DISTINCT FROM OLD.parent_id
  OR NEW.leg           IS DISTINCT FROM OLD.leg
  OR NEW.sponsor_id    IS DISTINCT FROM OLD.sponsor_id
  OR NEW.rank          IS DISTINCT FROM OLD.rank
  OR NEW.status        IS DISTINCT FROM OLD.status
  OR NEW.org_id        IS DISTINCT FROM OLD.org_id
  OR NEW.external_code IS DISTINCT FROM OLD.external_code THEN
    RAISE EXCEPTION 'insufficient_privilege: structural/rank/status columns are admin-only'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_guard_marketer_structural_cols
  BEFORE UPDATE ON public.marketers
  FOR EACH ROW EXECUTE FUNCTION public.guard_marketer_structural_cols();

-- =============================================================================
-- Enable + FORCE RLS on every foundation tenant/identity table.
-- FORCE applies RLS even to the table owner (migrations role).
-- =============================================================================
ALTER TABLE public.organizations          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organizations          FORCE  ROW LEVEL SECURITY;
ALTER TABLE public.ranks_meta             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ranks_meta             FORCE  ROW LEVEL SECURITY;
ALTER TABLE public.platform_admins        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_admins        FORCE  ROW LEVEL SECURITY;
ALTER TABLE public.memberships            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.memberships            FORCE  ROW LEVEL SECURITY;
ALTER TABLE public.marketers              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketers              FORCE  ROW LEVEL SECURITY;
ALTER TABLE public.marketer_tree_closure  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketer_tree_closure  FORCE  ROW LEVEL SECURITY;
ALTER TABLE public.rank_history           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rank_history           FORCE  ROW LEVEL SECURITY;

-- =============================================================================
-- organizations — self only (read); admin update; platform sees all.
-- =============================================================================
CREATE POLICY organizations_select ON public.organizations
FOR SELECT TO authenticated
USING (id = public.current_org_id() OR public.is_platform_admin());

CREATE POLICY organizations_admin_update ON public.organizations
FOR UPDATE TO authenticated
USING      ((id = public.current_org_id() AND public.is_org_admin()) OR public.is_platform_admin())
WITH CHECK ((id = public.current_org_id() AND public.is_org_admin()) OR public.is_platform_admin());

-- Soft-delete the org (owner) — DELETE policy reserved to admins/owners/platform.
CREATE POLICY organizations_admin_delete ON public.organizations
FOR DELETE TO authenticated
USING ((id = public.current_org_id() AND public.is_org_admin()) OR public.is_platform_admin());

-- =============================================================================
-- ranks_meta — global reference. Readable by all authenticated; no app writes
-- (per-org overrides live in organizations.settings). Platform may manage.
-- =============================================================================
CREATE POLICY ranks_meta_select ON public.ranks_meta
FOR SELECT TO authenticated
USING (true);

CREATE POLICY ranks_meta_platform_write ON public.ranks_meta
FOR ALL TO authenticated
USING (public.is_platform_admin())
WITH CHECK (public.is_platform_admin());

-- =============================================================================
-- platform_admins — only platform admins may read/manage the registry.
-- =============================================================================
CREATE POLICY platform_admins_all ON public.platform_admins
FOR ALL TO authenticated
USING (public.is_platform_admin())
WITH CHECK (public.is_platform_admin());

-- =============================================================================
-- memberships — read own row or admin; writes admin/owner only (closes the
-- self-escalation path: a member can read but never UPDATE their own role/perms).
-- =============================================================================
CREATE POLICY memberships_select ON public.memberships
FOR SELECT TO authenticated
USING (
  public.is_platform_admin()
  OR (
    org_id = public.current_org_id()
    AND (user_id = auth.uid() OR public.is_org_admin())
  )
);

CREATE POLICY memberships_admin_write ON public.memberships
FOR ALL TO authenticated
USING (
  public.is_platform_admin()
  OR (org_id = public.current_org_id() AND public.is_org_admin())
)
WITH CHECK (
  public.is_platform_admin()
  OR (org_id = public.current_org_id() AND public.is_org_admin())
);

-- =============================================================================
-- marketers — org isolation + closure subtree visibility.
-- Field-level limits (structural/rank/status) enforced by
-- guard_marketer_structural_cols() above (RLS can't diff OLD/NEW).
-- =============================================================================
-- READ: own profile + entire downline subtree; admins/platform see the org.
CREATE POLICY marketers_select ON public.marketers
FOR SELECT TO authenticated
USING (
  org_id = public.current_org_id()
  AND public.can_see_marketer(id)
);

-- INSERT: pre-register a downline. The new node's parent must be visible to the
-- caller (so it lands in their subtree); members create non-privileged pending
-- profiles. Admins/platform place anywhere in the org. ADR-009 #6: member-created
-- profiles default rank='executive', status='pending'.
CREATE POLICY marketers_insert ON public.marketers
FOR INSERT TO authenticated
WITH CHECK (
  org_id = public.current_org_id()
  AND public.current_membership_active()
  AND (
        public.is_org_admin()
     OR (
          parent_id IS NOT NULL
          AND public.can_see_marketer(parent_id)
          AND rank   = 'executive'
          AND status = 'pending'
        )
  )
);

-- UPDATE: may target any visible node; WITH CHECK keeps the row in scope so it
-- cannot be moved out of the caller's subtree.
CREATE POLICY marketers_update ON public.marketers
FOR UPDATE TO authenticated
USING      (org_id = public.current_org_id() AND public.can_see_marketer(id))
WITH CHECK (org_id = public.current_org_id() AND public.can_see_marketer(id));

-- DELETE: admins/owners/platform only (structural integrity). Members never delete.
CREATE POLICY marketers_delete ON public.marketers
FOR DELETE TO authenticated
USING (org_id = public.current_org_id() AND public.is_org_admin());

-- =============================================================================
-- marketer_tree_closure — read-only to end users; never directly written by
-- anyone (maintained exclusively by triggers on marketers). A member may read a
-- closure edge only when they can see the descendant; admins/platform see the org.
-- =============================================================================
CREATE POLICY closure_select ON public.marketer_tree_closure
FOR SELECT TO authenticated
USING (
  org_id = public.current_org_id()
  AND public.can_see_marketer(descendant_id)
);
-- No INSERT/UPDATE/DELETE policy for authenticated: closure is trigger-maintained
-- only (SECURITY DEFINER tree triggers run as table owner, bypassing RLS).

-- =============================================================================
-- rank_history — read within subtree; append-only & system-written (trigger on
-- marketers). No INSERT/UPDATE/DELETE policy for authenticated.
-- =============================================================================
CREATE POLICY rank_history_select ON public.rank_history
FOR SELECT TO authenticated
USING (
  org_id = public.current_org_id()
  AND public.can_see_marketer(marketer_id)
);

-- =============================================================================
-- Table-privilege least-privilege grants (doc 10 §4.2). RLS narrows further.
-- =============================================================================
-- Reference / self tables: read-only for authenticated.
GRANT SELECT ON public.organizations TO authenticated;
GRANT UPDATE ON public.organizations TO authenticated;   -- gated to admins by RLS
GRANT SELECT ON public.ranks_meta    TO authenticated;
GRANT SELECT ON public.platform_admins TO authenticated; -- gated to platform by RLS

-- memberships: read self / admin-write (RLS-gated). Grant CRUD; RLS bounds it.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.memberships TO authenticated;

-- marketers: pre-register + field-restricted update + admin delete (RLS/trigger bound).
GRANT SELECT, INSERT, UPDATE, DELETE ON public.marketers TO authenticated;

-- closure / rank_history: read-only (writes are trigger-only).
GRANT SELECT ON public.marketer_tree_closure TO authenticated;
GRANT SELECT ON public.rank_history          TO authenticated;
