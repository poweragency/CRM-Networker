-- Team calls can target the creator's LEFT branch, RIGHT branch, or ALL downline.
-- Admins create only ORG calls; co-admins create only TEAM calls.

ALTER TABLE public.zoom_calls
  ADD COLUMN IF NOT EXISTS team_branch text CHECK (team_branch IN ('left','right','all'));

UPDATE public.zoom_calls SET team_branch = 'all' WHERE scope = 'team' AND team_branch IS NULL;

-- SELECT: admin → all; org → everyone; creator → own; team → creator's downline,
-- filtered by branch (closure.branch_leg = the leg the descendant sits in).
DROP POLICY IF EXISTS zoom_calls_select ON public.zoom_calls;
CREATE POLICY zoom_calls_select ON public.zoom_calls
  FOR SELECT USING (
    org_id = public.current_org_id() AND (
      public.is_org_admin()
      OR scope = 'org'
      OR created_by = public.current_marketer_id()
      OR (scope = 'team' AND EXISTS (
        SELECT 1 FROM public.marketer_tree_closure c
        WHERE c.org_id = zoom_calls.org_id
          AND c.ancestor_id = zoom_calls.created_by
          AND c.descendant_id = public.current_marketer_id()
          AND c.depth >= 1
          AND (
            COALESCE(zoom_calls.team_branch, 'all') = 'all'
            OR (zoom_calls.team_branch = 'left'  AND c.branch_leg = 'LEFT')
            OR (zoom_calls.team_branch = 'right' AND c.branch_leg = 'RIGHT')
          )
      ))
    )
  );

-- INSERT: admin → ORG only; co-admin → TEAM only (owned by self).
DROP POLICY IF EXISTS zoom_calls_insert ON public.zoom_calls;
CREATE POLICY zoom_calls_insert ON public.zoom_calls
  FOR INSERT WITH CHECK (
    org_id = public.current_org_id() AND public.current_membership_active() AND (
      (public.is_org_admin() AND scope = 'org')
      OR (public.is_co_admin() AND scope = 'team' AND created_by = public.current_marketer_id())
    )
  );
