-- =============================================================================
-- seed.sql — Development seed for CRM Networker
--
-- Creates ONE demo organization and a SMALL binary genealogy tree so the tree
-- canvas, branch switcher (Global/Left/Right), and subtree analytics render in
-- local dev. The tree is built EXCLUSIVELY through public.place_marketer()
-- (ADR-001, operator-driven exact-slot placement) so the closure table
-- (marketer_tree_closure) and ltree `path` are populated by the maintenance
-- triggers exactly as they would be in production.
--
-- Shape (binary placement tree; "L:"/"R:" = leg of the parent):
--
--                          Root  (Marco Rossi, vice_president)
--                         /                                  \
--                    L: Giulia Bianchi (etl)          R: Luca Verdi (etl)
--                       /                                   \
--                  L: Sara Conti (team_leader)         R: Paolo Greco (team_leader)
--
-- => 5 marketers: a root + one LEFT child + one RIGHT child + one deeper node on
--    each branch (so both the LEFT and RIGHT subtrees have depth and the
--    closure/branch_leg aggregation has something to roll up).
--
-- NOTE ON LOGINS (auth.users): this seed creates marketer PROFILES only. Profile
-- != account. auth.users logins and `memberships` links are created by Supabase
-- Auth via the rank-gated "Activate CRM Access" flow (ADR-003) — NOT here. The
-- seeded marketers therefore have status='active' but no login attached.
--
-- ranks_meta is ALREADY seeded by migration 0003_tenancy_identity.sql — this
-- file MUST NOT re-insert it.
--
-- Idempotency: this seed is written for a CLEAN `db reset`. It is gated on the
-- demo org slug NOT already existing, so re-running it (e.g. a second seed pass)
-- is a no-op rather than a duplicate/error.
-- =============================================================================

DO $seed$
DECLARE
  v_org      uuid;
  v_root     uuid;   -- Root (depth 0)
  v_left     uuid;   -- LEFT child of root
  v_right    uuid;   -- RIGHT child of root
  v_left_l   uuid;   -- LEFT child of v_left  (deeper, LEFT branch)
  v_right_r  uuid;   -- RIGHT child of v_right (deeper, RIGHT branch)
BEGIN
  -- Skip entirely if the demo org already exists (idempotent re-seed).
  IF EXISTS (SELECT 1 FROM public.organizations WHERE slug = 'demo') THEN
    RAISE NOTICE 'seed: demo organization already present — skipping.';
    RETURN;
  END IF;

  -- ---------------------------------------------------------------------------
  -- 1) Demo organization (Italian locale, Europe/Rome tz — org-local day
  --    bucketing per ADR-009 #8).
  -- ---------------------------------------------------------------------------
  INSERT INTO public.organizations (name, slug, locale, timezone)
  VALUES ('Demo Network Srl', 'demo', 'it', 'Europe/Rome')
  RETURNING id INTO v_org;

  RAISE NOTICE 'seed: created demo organization % (id=%)', 'Demo Network Srl', v_org;

  -- ---------------------------------------------------------------------------
  -- 2) Binary tree via place_marketer(). Signature (migration 0004):
  --      place_marketer(p_org_id, p_parent_id, p_leg, p_sponsor_id,
  --                     p_name, p_surname, p_rank, p_status, p_created_by)
  --    Root: parent_id = NULL, leg = NULL, sponsor_id = NULL (no upline yet).
  -- ---------------------------------------------------------------------------

  -- ROOT --------------------------------------------------------------------
  v_root := public.place_marketer(
    v_org, NULL, NULL, NULL,
    'Marco', 'Rossi',
    'vice_president'::public.marketer_rank,
    'active'::public.marketer_status,
    NULL
  );

  -- LEFT child of root ------------------------------------------------------
  -- sponsor = root (recruiting credit == placement here, but the columns are
  -- independent by design — sponsor_id may differ from parent_id).
  v_left := public.place_marketer(
    v_org, v_root, 'LEFT'::public.placement_leg, v_root,
    'Giulia', 'Bianchi',
    'executive_team_leader'::public.marketer_rank,
    'active'::public.marketer_status,
    v_root
  );

  -- RIGHT child of root -----------------------------------------------------
  v_right := public.place_marketer(
    v_org, v_root, 'RIGHT'::public.placement_leg, v_root,
    'Luca', 'Verdi',
    'executive_team_leader'::public.marketer_rank,
    'active'::public.marketer_status,
    v_root
  );

  -- Deeper on the LEFT branch: LEFT child of v_left -------------------------
  v_left_l := public.place_marketer(
    v_org, v_left, 'LEFT'::public.placement_leg, v_left,
    'Sara', 'Conti',
    'team_leader'::public.marketer_rank,
    'active'::public.marketer_status,
    v_left
  );

  -- Deeper on the RIGHT branch: RIGHT child of v_right ----------------------
  v_right_r := public.place_marketer(
    v_org, v_right, 'RIGHT'::public.placement_leg, v_right,
    'Paolo', 'Greco',
    'team_leader'::public.marketer_rank,
    'active'::public.marketer_status,
    v_right
  );

  RAISE NOTICE 'seed: placed 5 marketers (root=% L=% R=% L.L=% R.R=%)',
    v_root, v_left, v_right, v_left_l, v_right_r;

  -- ---------------------------------------------------------------------------
  -- 3) Sanity: the closure table should now hold every ancestor/descendant pair
  --    incl. self-rows (depth 0). For a 5-node tree of this shape that is:
  --      self(5) + root->{L,R,L.L,R.R}=4 + L->L.L=1 + R->R.R=1 = 11 rows.
  -- ---------------------------------------------------------------------------
  RAISE NOTICE 'seed: marketer_tree_closure rows for demo org = %',
    (SELECT count(*) FROM public.marketer_tree_closure WHERE org_id = v_org);
END
$seed$;
