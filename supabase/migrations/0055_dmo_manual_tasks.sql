-- 0055: "Catena d'Oro" v2 — the DMO becomes 5 MANUAL daily tasks the user ticks
-- by hand (reading, IG story, TikTok/reel, meet a person, training video). Each
-- day row stores the 5 booleans; "all done" = all 5 true; the streak is the run
-- of consecutive all-done days (Europe/Rome). A month leaderboard RPC powers the
-- dashboard "who did the most DMO days this month" widget.

-- Per-task columns on the daily row (manual ticks; default false).
ALTER TABLE public.dmo_day
  ADD COLUMN IF NOT EXISTS read_pages   boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ig_story     boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS tiktok_reel  boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS meet_person  boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS training     boolean NOT NULL DEFAULT false;

-- Speeds the leaderboard's "all-done days this month" aggregate.
CREATE INDEX IF NOT EXISTS dmo_day_org_day_idx
  ON public.dmo_day (org_id, day);

-- ── dmo_status(): today's 5 tasks + all_done + streak (read-only, no auto-record).
DROP FUNCTION IF EXISTS public.dmo_status();
CREATE FUNCTION public.dmo_status()
RETURNS TABLE(read_pages boolean, ig_story boolean, tiktok_reel boolean,
              meet_person boolean, training boolean, all_done boolean,
              streak integer, today_recorded boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me    uuid := public.current_marketer_id();
  v_today date := (now() AT TIME ZONE 'Europe/Rome')::date;
  v_rp boolean := false;
  v_ig boolean := false;
  v_tt boolean := false;
  v_mp boolean := false;
  v_tr boolean := false;
  v_all boolean := false;
  v_today_all boolean := false;
  v_streak integer := 0;
  v_d date;
BEGIN
  IF v_me IS NULL THEN
    RETURN QUERY SELECT false, false, false, false, false, false, 0, false;
    RETURN;
  END IF;

  SELECT d.read_pages, d.ig_story, d.tiktok_reel, d.meet_person, d.training
    INTO v_rp, v_ig, v_tt, v_mp, v_tr
    FROM public.dmo_day d
    WHERE d.marketer_id = v_me AND d.day = v_today;
  -- (NOT FOUND → the booleans keep their false defaults.)

  v_all := v_rp AND v_ig AND v_tt AND v_mp AND v_tr;
  v_today_all := v_all;

  -- Streak: consecutive all-done days ending today (or yesterday if today is not
  -- yet complete, so an in-progress day doesn't break a real streak).
  v_d := v_today;
  IF NOT v_today_all THEN
    v_d := v_today - 1;
  END IF;
  WHILE EXISTS (
    SELECT 1 FROM public.dmo_day d
    WHERE d.marketer_id = v_me AND d.day = v_d
      AND d.read_pages AND d.ig_story AND d.tiktok_reel AND d.meet_person AND d.training
  ) LOOP
    v_streak := v_streak + 1;
    v_d := v_d - 1;
  END LOOP;

  RETURN QUERY SELECT v_rp, v_ig, v_tt, v_mp, v_tr, v_all, v_streak, v_today_all;
END $$;

REVOKE ALL ON FUNCTION public.dmo_status() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dmo_status() TO authenticated;

-- ── dmo_toggle(): set one of today's tasks on/off, then return the fresh status.
CREATE OR REPLACE FUNCTION public.dmo_toggle(p_task text, p_value boolean)
RETURNS TABLE(read_pages boolean, ig_story boolean, tiktok_reel boolean,
              meet_person boolean, training boolean, all_done boolean,
              streak integer, today_recorded boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org   uuid := public.current_org_id();
  v_me    uuid := public.current_marketer_id();
  v_today date := (now() AT TIME ZONE 'Europe/Rome')::date;
BEGIN
  IF v_me IS NULL THEN
    RETURN QUERY SELECT false, false, false, false, false, false, 0, false;
    RETURN;
  END IF;
  IF p_task NOT IN ('read_pages','ig_story','tiktok_reel','meet_person','training') THEN
    RAISE EXCEPTION 'invalid dmo task: %', p_task;
  END IF;

  INSERT INTO public.dmo_day (org_id, marketer_id, day)
  VALUES (v_org, v_me, v_today)
  ON CONFLICT (marketer_id, day) DO NOTHING;

  -- p_task is whitelisted above, so this format()'d identifier is safe.
  EXECUTE format(
    'UPDATE public.dmo_day SET %I = $1, completed_at = now() WHERE marketer_id = $2 AND day = $3',
    p_task
  ) USING p_value, v_me, v_today;

  RETURN QUERY SELECT * FROM public.dmo_status();
END $$;

REVOKE ALL ON FUNCTION public.dmo_toggle(text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dmo_toggle(text, boolean) TO authenticated;

-- ── dmo_month_leaderboard(): per-marketer count of all-done DMO days this month,
-- scoped to the caller's visible subtree (admins see the whole org). Definer so it
-- can aggregate across people the dmo_day RLS would otherwise hide.
CREATE OR REPLACE FUNCTION public.dmo_month_leaderboard()
RETURNS TABLE(marketer_id uuid, display_name text, rank text,
              days_done integer, is_self boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org   uuid := public.current_org_id();
  v_me    uuid := public.current_marketer_id();
  v_admin boolean := public.is_org_admin();
  v_month date := date_trunc('month', (now() AT TIME ZONE 'Europe/Rome'))::date;
BEGIN
  RETURN QUERY
  SELECT m.id, m.display_name, m.rank::text, cnt.days::int, (m.id = v_me)
  FROM public.marketers m
  JOIN (
    SELECT d.marketer_id, count(*) AS days
    FROM public.dmo_day d
    WHERE d.org_id = v_org
      AND d.day >= v_month
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
