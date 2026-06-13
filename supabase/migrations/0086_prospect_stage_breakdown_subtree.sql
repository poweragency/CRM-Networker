-- 0086: il breakdown prospect per fase del pannello tree riguarda TUTTO il
-- sottoalbero (la persona + tutta la sua downline), non solo i prospect personali.
-- Aggrega via marketer_tree_closure (ancestor_id = p_id include la self-row depth 0).
CREATE OR REPLACE FUNCTION public.prospect_stage_breakdown(p_id uuid)
RETURNS TABLE(business_info bigint, follow_up bigint, closing bigint, check_soldi bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_org uuid := public.current_org_id();
BEGIN
  IF NOT public.can_see_marketer(p_id) THEN
    RETURN QUERY SELECT 0::bigint, 0::bigint, 0::bigint, 0::bigint;
    RETURN;
  END IF;
  RETURN QUERY
  SELECT
    count(*) FILTER (WHERE p.current_stage = 'business_info')::bigint,
    count(*) FILTER (WHERE p.current_stage = 'follow_up')::bigint,
    count(*) FILTER (WHERE p.current_stage = 'closing')::bigint,
    count(*) FILTER (WHERE p.current_stage = 'check_soldi')::bigint
  FROM public.marketer_tree_closure cl
  JOIN public.prospects p
    ON p.org_id = v_org
   AND p.owner_marketer_id = cl.descendant_id
   AND p.outcome = 'open'
   AND p.deleted_at IS NULL
  WHERE cl.org_id = v_org
    AND cl.ancestor_id = p_id;
END $$;
