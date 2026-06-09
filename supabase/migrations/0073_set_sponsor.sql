-- =============================================================================
-- 0073_set_sponsor.sql
--
-- set_sponsor(p_marketer, p_sponsor) — reassign a marketer's genealogical sponsor.
-- Used after a removal: when the removed person was the SPONSOR of others, those
-- sponsees would otherwise point at a deleted node (→ shown as spillover). The app
-- walks the orphaned sponsees one by one and calls this to set a new sponsor.
--
-- sponsor_id is a "structural column" guarded (admin-only) by
-- guard_marketer_structural_cols(). This SECURITY DEFINER RPC does its OWN authz
-- (visibility + rank >= consultant, matching add/remove) and cycle check, then sets
-- the transaction-local bypass flag so the guard lets the validated write through.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.set_sponsor(p_marketer uuid, p_sponsor uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_org uuid := public.current_org_id();
  v_cur uuid;
  v_i   int := 0;
BEGIN
  -- Visibility: caller must see both the sponsee and the chosen sponsor.
  IF NOT public.can_see_marketer(p_marketer) THEN
    RAISE EXCEPTION 'set_sponsor: % is outside the caller''s visible subtree', p_marketer
      USING ERRCODE = '42501';
  END IF;
  IF NOT public.can_see_marketer(p_sponsor) THEN
    RAISE EXCEPTION 'set_sponsor: sponsor % is outside the caller''s visible subtree', p_sponsor
      USING ERRCODE = '42501';
  END IF;

  IF p_marketer = p_sponsor THEN
    RAISE EXCEPTION 'set_sponsor: a marketer cannot sponsor themselves'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Authority: admins always; otherwise rank >= consultant (matches add/remove).
  IF NOT public.is_org_admin() THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.marketers me
      JOIN public.ranks_meta rm ON rm.rank = me.rank
      JOIN public.ranks_meta c  ON c.rank  = 'consultant'
      WHERE me.id = public.current_marketer_id()
        AND rm.sort_order >= c.sort_order
    ) THEN
      RAISE EXCEPTION 'set_sponsor: requires Consultant rank or higher'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Both rows live and in the caller's org.
  IF NOT EXISTS (
    SELECT 1 FROM public.marketers
    WHERE id = p_marketer AND org_id = v_org AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'set_sponsor: marketer % not found in org', p_marketer
      USING ERRCODE = 'check_violation';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.marketers
    WHERE id = p_sponsor AND org_id = v_org AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'set_sponsor: sponsor % not found in org', p_sponsor
      USING ERRCODE = 'check_violation';
  END IF;

  -- Cycle guard: the new sponsor's sponsor-chain must not lead back to p_marketer.
  v_cur := p_sponsor;
  WHILE v_cur IS NOT NULL AND v_i < 10000 LOOP
    IF v_cur = p_marketer THEN
      RAISE EXCEPTION 'set_sponsor: would create a sponsor cycle'
        USING ERRCODE = 'check_violation';
    END IF;
    SELECT sponsor_id INTO v_cur FROM public.marketers WHERE id = v_cur;
    v_i := v_i + 1;
  END LOOP;

  -- Validated write: bypass the structural-cols guard for this single update.
  PERFORM set_config('app.tree_reattach', 'on', true);
  UPDATE public.marketers
    SET sponsor_id = p_sponsor,
        updated_by = public.current_marketer_id()
  WHERE id = p_marketer;
  PERFORM set_config('app.tree_reattach', 'off', true);
END;
$$;

COMMENT ON FUNCTION public.set_sponsor(uuid, uuid) IS
  'Reassign a marketer''s genealogical sponsor_id (used to re-home sponsees of a removed sponsor so they are not orphaned as spillover). SECURITY DEFINER: re-validates visibility of both nodes + rank >= consultant (or admin) + no self/cycle, then bypasses the admin-only structural-cols guard for the single validated write (0073).';

REVOKE EXECUTE ON FUNCTION public.set_sponsor(uuid, uuid) FROM public, anon;
GRANT  EXECUTE ON FUNCTION public.set_sponsor(uuid, uuid) TO authenticated, service_role;
