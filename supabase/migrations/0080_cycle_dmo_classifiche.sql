-- 0080: estende i cicli aziendali (28 giorni) a Daily Task (DMO) e Classifiche.
--
-- • dmo_month_leaderboard: il "Top del ciclo" del widget Daily Task conta i giorni
--   all-done nella finestra del CICLO corrente invece del mese solare.
-- • refresh_leaderboards_all_orgs: il job notturno che popola leaderboard_snapshots
--   (lette da /classifiche) usa di default la finestra del ciclo. Nel contesto cron
--   (senza JWT) cycle_start/end ricadono sull'ancora aziendale di default (28 giorni).

CREATE OR REPLACE FUNCTION public.dmo_month_leaderboard()
RETURNS TABLE(marketer_id uuid, display_name text, rank text,
              days_done integer, is_self boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_org   uuid := public.current_org_id();
  v_me    uuid := public.current_marketer_id();
  v_admin boolean := public.is_org_admin();
  v_from  date := public.cycle_start(now())::date;
  v_to    date := public.cycle_end(now())::date;
BEGIN
  RETURN QUERY
  SELECT m.id, m.display_name, m.rank::text, cnt.days::int, (m.id = v_me)
  FROM public.marketers m
  JOIN (
    SELECT d.marketer_id, count(*) AS days
    FROM public.dmo_day d
    WHERE d.org_id = v_org
      AND d.day >= v_from AND d.day < v_to
      AND d.read_pages AND d.ig_story AND d.tiktok_reel
      AND d.meet_person AND d.training
    GROUP BY d.marketer_id
  ) cnt ON cnt.marketer_id = m.id
  WHERE m.org_id = v_org
    AND m.deleted_at IS NULL
    AND (
      v_admin
      OR EXISTS (
        SELECT 1 FROM public.marketer_tree_closure c
        WHERE c.ancestor_id = v_me AND c.descendant_id = m.id
      )
    )
  ORDER BY cnt.days DESC, m.display_name
  LIMIT 50;
END $$;

REVOKE ALL ON FUNCTION public.dmo_month_leaderboard() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dmo_month_leaderboard() TO authenticated;

CREATE OR REPLACE FUNCTION public.refresh_leaderboards_all_orgs(
  p_from date DEFAULT public.cycle_start(now())::date,
  p_to   date DEFAULT (public.cycle_end(now()) - interval '1 day')::date
)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r      record;
  v_sum  int := 0;
BEGIN
  IF p_to < p_from THEN
    RAISE EXCEPTION 'refresh_leaderboards_all_orgs: p_to (%) precedes p_from (%)',
      p_to, p_from USING ERRCODE = 'invalid_parameter_value';
  END IF;

  FOR r IN
    SELECT id FROM public.organizations WHERE deleted_at IS NULL
  LOOP
    v_sum := v_sum + public.refresh_leaderboards(r.id, p_from, p_to);
  END LOOP;

  RETURN v_sum;
END;
$$;
