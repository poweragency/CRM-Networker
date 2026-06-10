-- 0081: aggregati del team per un CICLO specifico, per il "Report di fine ciclo".
--
-- cycle_team_funnel(p_cycle): per i prospect ENTRATI nel ciclo p_cycle (finestra di
-- 28 giorni ricavata dall'ancora aziendale / override org), scoped alla sottorete
-- visibile (org intera per l'admin), restituisce il totale prospect + quanti hanno
-- RAGGIUNTO ogni fase (business_info / follow_up / closing / iscrizione) per il
-- calcolo delle conversioni per-fase e generale (BI -> Iscrizione). Include i
-- prospect eliminati (il "percorso fatto" resta contato), come la dashboard.

CREATE OR REPLACE FUNCTION public.cycle_team_funnel(p_cycle int)
RETURNS TABLE(total bigint, reached_bi bigint, reached_fup bigint,
              reached_closing bigint, reached_iscrizione bigint,
              cycle_start timestamptz, cycle_end timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_org    uuid := public.current_org_id();
  v_me     uuid := public.current_marketer_id();
  v_admin  boolean := public.is_org_admin();
  v_anchor timestamptz;
  v_num    int;
  v_len    interval := interval '28 days';
  v_end    timestamptz;
  v_start  timestamptz;
BEGIN
  SELECT (o.settings->'cycle'->>'anchor_end')::timestamptz,
         (o.settings->'cycle'->>'anchor_number')::int
    INTO v_anchor, v_num
  FROM public.organizations o WHERE o.id = v_org;
  IF v_anchor IS NULL THEN v_anchor := timestamptz '2026-06-20 07:00:00+02'; END IF;
  IF v_num    IS NULL THEN v_num    := 78; END IF;

  v_end   := v_anchor + v_len * (p_cycle - v_num);
  v_start := v_end - v_len;

  RETURN QUERY
  WITH pr AS (
    SELECT p.current_stage AS st, p.outcome AS oc
    FROM public.prospects p
    WHERE p.org_id = v_org
      AND p.entered_funnel_at >= v_start AND p.entered_funnel_at < v_end
      AND (
        v_admin
        OR EXISTS (
          SELECT 1 FROM public.marketer_tree_closure cl
          WHERE cl.ancestor_id = v_me AND cl.descendant_id = p.owner_marketer_id
        )
      )
  )
  SELECT
    count(*)::bigint,
    count(*) FILTER (WHERE st >= 'business_info' OR oc = 'enrolled')::bigint,
    count(*) FILTER (WHERE st >= 'follow_up'     OR oc = 'enrolled')::bigint,
    count(*) FILTER (WHERE st >= 'closing'       OR oc = 'enrolled')::bigint,
    count(*) FILTER (WHERE st =  'iscrizione'    OR oc = 'enrolled')::bigint,
    v_start, v_end
  FROM pr;
END $$;

REVOKE EXECUTE ON FUNCTION public.cycle_team_funnel(int) FROM public, anon;
GRANT  EXECUTE ON FUNCTION public.cycle_team_funnel(int) TO authenticated;
