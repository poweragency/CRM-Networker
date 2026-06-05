-- (a) Let the validated server-side reattach inside remove_marketer move a child
-- past the structural-cols guard (non-admins are otherwise blocked from changing
-- parent_id/leg). Guarded by a transaction-local flag only remove_marketer sets.
CREATE OR REPLACE FUNCTION public.guard_marketer_structural_cols()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF public.is_org_admin() THEN
    RETURN NEW;  -- admins/owners/platform may change anything
  END IF;

  -- Validated reattach performed by remove_marketer (transaction-local flag).
  IF current_setting('app.tree_reattach', true) = 'on' THEN
    RETURN NEW;
  END IF;

  IF NEW.parent_id     IS DISTINCT FROM OLD.parent_id
  OR NEW.leg           IS DISTINCT FROM OLD.leg
  OR NEW.sponsor_id    IS DISTINCT FROM OLD.sponsor_id
  OR NEW.org_id        IS DISTINCT FROM OLD.org_id
  OR NEW.external_code IS DISTINCT FROM OLD.external_code THEN
    RAISE EXCEPTION 'insufficient_privilege: structural columns are admin-only'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.rank IS DISTINCT FROM OLD.rank OR NEW.status IS DISTINCT FROM OLD.status THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.marketer_tree_closure c
      WHERE c.org_id        = OLD.org_id
        AND c.ancestor_id   = public.current_marketer_id()
        AND c.descendant_id = NEW.id
        AND c.depth >= 1
    ) THEN
      RAISE EXCEPTION 'insufficient_privilege: rank/status can only be changed for your downline'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

-- (b) remove_marketer: require Team Leader+ (or admin), and wrap the reattach in
-- the bypass flag so the structural guard lets the child move.
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

  -- Removal is allowed only for Team Leader rank or higher (admins always).
  IF NOT public.is_org_admin() THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.marketers me
      JOIN public.ranks_meta rm ON rm.rank = me.rank
      JOIN public.ranks_meta tl ON tl.rank = 'team_leader'
      WHERE me.id = public.current_marketer_id()
        AND rm.sort_order >= tl.sort_order
    ) THEN
      RAISE EXCEPTION 'remove_marketer: requires Team Leader rank or higher'
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

-- (c) allow non-admins to set the new member's starting rank (drop the
-- rank='executive' restriction); placement still scoped to their visible subtree.
DROP POLICY IF EXISTS marketers_insert ON public.marketers;
CREATE POLICY marketers_insert ON public.marketers
  FOR INSERT WITH CHECK (
    org_id = public.current_org_id()
    AND public.current_membership_active()
    AND (
      public.is_org_admin()
      OR (parent_id IS NOT NULL AND public.can_see_marketer(parent_id))
    )
  );
