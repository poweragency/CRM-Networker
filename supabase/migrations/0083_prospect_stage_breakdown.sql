-- 0083: conteggio prospect APERTI per fase del funnel (B.Info / Follow-up / Closing
-- / Check Soldi) di un marketer, per il pannello laterale del tree viewer (caricato
-- on-demand al click del nodo). RLS-aware via can_see_marketer.
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
  FROM public.prospects p
  WHERE p.org_id = v_org
    AND p.owner_marketer_id = p_id
    AND p.outcome = 'open'
    AND p.deleted_at IS NULL;
END $$;

REVOKE EXECUTE ON FUNCTION public.prospect_stage_breakdown(uuid) FROM public, anon;
GRANT  EXECUTE ON FUNCTION public.prospect_stage_breakdown(uuid) TO authenticated;
