-- =============================================================================
-- File 0029 — get_subtree(node_id, max_depth)
-- Purpose: Closure-scoped subtree read for the genealogy viewer. Returns the root
--          (depth 0) + descendants (depth <= max_depth) with closure-derived team
--          sizes (global / left / right), the branch leg, and immediate-child
--          flags. The frontend (lib/data/genealogy.ts → getSubtree) calls this RPC
--          to render the binary tree.
--
-- Depends on: 0004_marketers_tree.sql (marketers, marketer_tree_closure),
--             0005_auth_visibility.sql (current_org_id, can_see_marketer).
--
-- Visibility-gated by can_see_marketer(node_id); SECURITY DEFINER so it can read
-- the closure under RLS while re-applying the tenant filter via current_org_id().
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_subtree(node_id uuid, max_depth int DEFAULT 4)
RETURNS TABLE (
  id              uuid,
  parent_id       uuid,
  leg             placement_leg,
  sponsor_id      uuid,
  first_name      text,
  last_name       text,
  display_name    text,
  rank            marketer_rank,
  status          marketer_status,
  team_size       bigint,
  left_team_size  bigint,
  right_team_size bigint,
  has_left_child  boolean,
  has_right_child boolean,
  branch_leg      placement_leg
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org uuid := public.current_org_id();
BEGIN
  IF NOT public.can_see_marketer(node_id) THEN
    RAISE EXCEPTION 'get_subtree: marketer % is outside the caller''s visible subtree', node_id
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH sub AS (
    SELECT cl.descendant_id, cl.depth, cl.branch_leg
    FROM public.marketer_tree_closure cl
    WHERE cl.org_id = v_org
      AND cl.ancestor_id = node_id
      AND cl.depth <= max_depth
  )
  SELECT
    m.id, m.parent_id, m.leg, m.sponsor_id,
    m.first_name, m.last_name, m.display_name,
    m.rank, m.status,
    COALESCE(ts.team_size, 0)       AS team_size,
    COALESCE(ts.left_team_size, 0)  AS left_team_size,
    COALESCE(ts.right_team_size, 0) AS right_team_size,
    EXISTS (
      SELECT 1 FROM public.marketers c
      WHERE c.parent_id = m.id AND c.leg = 'LEFT' AND c.deleted_at IS NULL
    ) AS has_left_child,
    EXISTS (
      SELECT 1 FROM public.marketers c
      WHERE c.parent_id = m.id AND c.leg = 'RIGHT' AND c.deleted_at IS NULL
    ) AS has_right_child,
    sub.branch_leg
  FROM sub
  JOIN public.marketers m ON m.id = sub.descendant_id AND m.deleted_at IS NULL
  LEFT JOIN LATERAL (
    SELECT
      count(*) FILTER (WHERE c2.depth >= 1)                              AS team_size,
      count(*) FILTER (WHERE c2.depth >= 1 AND c2.branch_leg = 'LEFT')   AS left_team_size,
      count(*) FILTER (WHERE c2.depth >= 1 AND c2.branch_leg = 'RIGHT')  AS right_team_size
    FROM public.marketer_tree_closure c2
    WHERE c2.org_id = v_org AND c2.ancestor_id = m.id
  ) ts ON true
  ORDER BY sub.depth, m.leg NULLS FIRST;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_subtree(uuid, int) FROM public;
GRANT  EXECUTE ON FUNCTION public.get_subtree(uuid, int) TO authenticated, service_role;
