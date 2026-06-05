-- Remove a marketer from the binary tree, reattaching its SINGLE downline into
-- the vacated leg under the parent. Refuses when both legs are occupied, when the
-- node is the org root, or when it's the caller. Soft-delete (parent FK is
-- RESTRICT + partial unique on deleted_at IS NULL frees the slot). Visibility-
-- gated via can_see_marketer, so anyone can prune within their own subtree.
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

  -- 1) soft-delete → frees the node's (parent, leg) slot.
  UPDATE public.marketers
  SET deleted_at = now(), updated_by = COALESCE(p_actor, updated_by)
  WHERE id = p_node;

  -- 2) reattach the single child into the vacated leg (closure + path rebuilt by
  --    the after-move trigger, which also strips the removed node from them).
  IF v_child IS NOT NULL THEN
    PERFORM public.move_marketer(v_org, v_child, v_parent, v_leg, p_actor);
  END IF;

  -- 3) drop the removed node's own closure rows.
  DELETE FROM public.marketer_tree_closure
  WHERE org_id = v_org AND (ancestor_id = p_node OR descendant_id = p_node);
END;
$$;

GRANT EXECUTE ON FUNCTION public.remove_marketer(uuid, uuid) TO authenticated;

COMMENT ON FUNCTION public.remove_marketer(uuid, uuid) IS
  'Soft-removes a marketer, reattaching its single child to the parent in the vacated leg. Refuses if both legs occupied, root, or self. Visibility-gated.';
