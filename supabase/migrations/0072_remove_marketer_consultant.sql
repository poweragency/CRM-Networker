-- =============================================================================
-- 0072_remove_marketer_consultant.sql
--
-- Align the REMOVE capability with the ADD capability. "Add member from the tree"
-- was lowered to rank >= consultant (so consultants can onboard their downline),
-- and the remove affordance shares the same UI gate — but remove_marketer() still
-- required Team Leader+, so a consultant saw a "Rimuovi" button that always failed
-- with "requires Team Leader rank or higher". Lower the rank floor to consultant
-- so whoever can add can also remove within their OWN subtree (still RLS-scoped:
-- can_see_marketer, no both-legs, not root, not self). Admins/owners unchanged.
--
-- Only the rank gate changes; the rest of remove_marketer is identical to 0044.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.remove_marketer(p_node uuid, p_actor uuid DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','extensions'
AS $$
DECLARE
  v_org    uuid;
  v_parent uuid;
  v_leg    placement_leg;
  v_left   uuid;
  v_right  uuid;
  v_child  uuid;
BEGIN
  IF NOT public.can_see_marketer(p_node) THEN
    RAISE EXCEPTION 'remove_marketer: % is outside the caller''s visible subtree', p_node
      USING ERRCODE = '42501';
  END IF;

  -- Removal is allowed for Consultant rank or higher (admins always). Aligned with
  -- the add-member capability so add/remove are symmetric (0072; was team_leader).
  IF NOT public.is_org_admin() THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.marketers me
      JOIN public.ranks_meta rm ON rm.rank = me.rank
      JOIN public.ranks_meta tl ON tl.rank = 'consultant'
      WHERE me.id = public.current_marketer_id()
        AND rm.sort_order >= tl.sort_order
    ) THEN
      RAISE EXCEPTION 'remove_marketer: requires Consultant rank or higher'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  SELECT org_id, parent_id, leg
    INTO v_org, v_parent, v_leg
  FROM public.marketers
  WHERE id = p_node AND deleted_at IS NULL
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'remove_marketer: marketer % not found', p_node;
  END IF;

  IF v_parent IS NULL THEN
    RAISE EXCEPTION 'remove_marketer: cannot remove the org root'
      USING ERRCODE = 'check_violation';
  END IF;

  IF p_node = public.current_marketer_id() THEN
    RAISE EXCEPTION 'remove_marketer: cannot remove yourself'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT id INTO v_left  FROM public.marketers
    WHERE org_id = v_org AND parent_id = p_node AND leg = 'LEFT'  AND deleted_at IS NULL;
  SELECT id INTO v_right FROM public.marketers
    WHERE org_id = v_org AND parent_id = p_node AND leg = 'RIGHT' AND deleted_at IS NULL;

  IF v_left IS NOT NULL AND v_right IS NOT NULL THEN
    RAISE EXCEPTION 'remove_marketer: node has people on both legs'
      USING ERRCODE = 'check_violation';
  END IF;

  v_child := COALESCE(v_left, v_right);

  UPDATE public.marketers
  SET deleted_at = now(), updated_by = COALESCE(p_actor, updated_by)
  WHERE id = p_node;

  IF v_child IS NOT NULL THEN
    PERFORM set_config('app.tree_reattach', 'on', true);
    PERFORM public.move_marketer(v_org, v_child, v_parent, v_leg, p_actor);
    PERFORM set_config('app.tree_reattach', 'off', true);
  END IF;

  DELETE FROM public.marketer_tree_closure
  WHERE org_id = v_org AND (ancestor_id = p_node OR descendant_id = p_node);
END;
$$;
