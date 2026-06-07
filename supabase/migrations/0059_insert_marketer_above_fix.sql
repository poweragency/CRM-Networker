-- 0059: fix insert_marketer_above — the org enforces a single root
-- (marketers_single_root_per_org), so we can't park the target at parent NULL.
-- Instead create N in a TEMP free slot (the upline's free leg, else a leaf outside
-- the target's subtree), move the target under N, then move N into the target's
-- original slot. All relinks go through move_marketer (cycle/slot-safe + closure).

CREATE OR REPLACE FUNCTION public.insert_marketer_above(
  p_target  uuid,
  p_first   text,
  p_last    text,
  p_rank    marketer_rank DEFAULT 'executive',
  p_sponsor uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_org    uuid;
  v_parent uuid;
  v_leg    placement_leg;
  v_opp    placement_leg;
  v_me     uuid := public.current_marketer_id();
  v_new    uuid;
  v_tmp_parent uuid;
  v_tmp_leg    placement_leg;
BEGIN
  IF NOT public.can_see_marketer(p_target) THEN
    RAISE EXCEPTION 'insert_marketer_above: % is outside the caller''s visible subtree', p_target
      USING ERRCODE = '42501';
  END IF;

  IF NOT public.is_org_admin() THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.marketers me
      JOIN public.ranks_meta rm ON rm.rank = me.rank
      JOIN public.ranks_meta tl ON tl.rank = 'team_leader'
      WHERE me.id = v_me AND rm.sort_order >= tl.sort_order
    ) THEN
      RAISE EXCEPTION 'insert_marketer_above: requires Team Leader rank or higher'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  SELECT org_id, parent_id, leg
    INTO v_org, v_parent, v_leg
  FROM public.marketers
  WHERE id = p_target AND deleted_at IS NULL
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'insert_marketer_above: target % not found', p_target;
  END IF;
  IF v_parent IS NULL THEN
    RAISE EXCEPTION 'insert_marketer_above: cannot insert above the org root'
      USING ERRCODE = 'check_violation';
  END IF;

  v_opp := CASE WHEN v_leg = 'LEFT' THEN 'RIGHT' ELSE 'LEFT' END;

  -- Pick a temporary slot for N: the upline's free opposite leg if available,
  -- otherwise any leaf outside the target's subtree (so the later moves can't cycle).
  IF NOT EXISTS (
    SELECT 1 FROM public.marketers
    WHERE org_id = v_org AND parent_id = v_parent AND leg = v_opp AND deleted_at IS NULL
  ) THEN
    v_tmp_parent := v_parent;
    v_tmp_leg := v_opp;
  ELSE
    SELECT m.id INTO v_tmp_parent
    FROM public.marketers m
    WHERE m.org_id = v_org AND m.deleted_at IS NULL AND m.id <> p_target
      AND NOT EXISTS (SELECT 1 FROM public.marketers c WHERE c.parent_id = m.id AND c.deleted_at IS NULL)
      AND NOT EXISTS (SELECT 1 FROM public.marketer_tree_closure cl WHERE cl.ancestor_id = p_target AND cl.descendant_id = m.id)
    LIMIT 1;
    IF v_tmp_parent IS NULL THEN
      RAISE EXCEPTION 'insert_marketer_above: no temporary slot available';
    END IF;
    v_tmp_leg := 'LEFT';
  END IF;

  PERFORM set_config('app.tree_reattach', 'on', true);

  -- 1. Create N in the temporary slot.
  INSERT INTO public.marketers (
    org_id, first_name, last_name, parent_id, leg, sponsor_id, rank, status, created_by, updated_by
  ) VALUES (
    v_org, p_first, p_last, v_tmp_parent, v_tmp_leg, COALESCE(p_sponsor, v_parent), p_rank, 'active', v_me, v_me
  ) RETURNING id INTO v_new;

  -- 2. Move the target (+ its subtree) under N, freeing the target's old slot.
  PERFORM public.move_marketer(v_org, p_target, v_new, 'LEFT', v_me);

  -- 3. Move N into the target's original slot under the upline.
  PERFORM public.move_marketer(v_org, v_new, v_parent, v_leg, v_me);

  PERFORM set_config('app.tree_reattach', 'off', true);
  RETURN v_new;
END;
$$;
