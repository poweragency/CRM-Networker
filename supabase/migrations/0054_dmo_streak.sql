-- 0054: "Catena d'Oro" — daily streak (DMO). Records, per marketer, each day the
-- 3 daily tasks were all completed; the streak is the run of consecutive recorded
-- days. dmo_status() computes today's tasks + streak + records today (idempotent),
-- all in Europe/Rome local time so the day boundary is correct (DST-safe).

CREATE TABLE IF NOT EXISTS public.dmo_day (
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  marketer_id uuid NOT NULL REFERENCES public.marketers(id) ON DELETE CASCADE,
  day date NOT NULL,
  completed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (marketer_id, day)
);

ALTER TABLE public.dmo_day ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dmo_day FORCE ROW LEVEL SECURITY;

CREATE POLICY dmo_day_select ON public.dmo_day
  FOR SELECT TO authenticated
  USING (org_id = public.current_org_id() AND marketer_id = public.current_marketer_id());

GRANT SELECT ON public.dmo_day TO authenticated;

CREATE OR REPLACE FUNCTION public.dmo_status()
RETURNS TABLE(present boolean, lista boolean, funnel boolean, all_done boolean,
              streak integer, today_recorded boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org    uuid := public.current_org_id();
  v_me     uuid := public.current_marketer_id();
  v_today  date := (now() AT TIME ZONE 'Europe/Rome')::date;
  v_present boolean;
  v_lista   boolean;
  v_funnel  boolean;
  v_all     boolean;
  v_streak  integer := 0;
  v_d       date;
BEGIN
  IF v_me IS NULL THEN
    RETURN QUERY SELECT false, false, false, false, 0, false;
    RETURN;
  END IF;

  v_present := EXISTS (
    SELECT 1 FROM public.zoom_attendance z
    WHERE z.marketer_id = v_me AND z.present AND z.call_date = v_today
  );
  v_lista := EXISTS (
    SELECT 1 FROM public.lista_contatti_entries l
    WHERE l.owner_marketer_id = v_me AND l.deleted_at IS NULL
      AND (l.created_at AT TIME ZONE 'Europe/Rome')::date = v_today
  );
  v_funnel := EXISTS (
    SELECT 1 FROM public.prospects p
    WHERE p.owner_marketer_id = v_me AND p.deleted_at IS NULL
      AND (p.updated_at AT TIME ZONE 'Europe/Rome')::date = v_today
  );
  v_all := v_present AND v_lista AND v_funnel;

  IF v_all THEN
    INSERT INTO public.dmo_day (org_id, marketer_id, day, completed_at)
    VALUES (v_org, v_me, v_today, now())
    ON CONFLICT (marketer_id, day) DO NOTHING;
  END IF;

  -- Streak: consecutive recorded days ending today (or yesterday if today not yet done).
  v_d := v_today;
  IF NOT EXISTS (SELECT 1 FROM public.dmo_day d WHERE d.marketer_id = v_me AND d.day = v_today) THEN
    v_d := v_today - 1;
  END IF;
  WHILE EXISTS (SELECT 1 FROM public.dmo_day d WHERE d.marketer_id = v_me AND d.day = v_d) LOOP
    v_streak := v_streak + 1;
    v_d := v_d - 1;
  END LOOP;

  RETURN QUERY SELECT
    v_present, v_lista, v_funnel, v_all, v_streak,
    EXISTS (SELECT 1 FROM public.dmo_day d WHERE d.marketer_id = v_me AND d.day = v_today);
END $$;

REVOKE ALL ON FUNCTION public.dmo_status() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dmo_status() TO authenticated;
