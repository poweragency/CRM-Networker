-- =============================================================================
-- File 0020 — Scheduled & background work (pg_cron provisioning + schedule)
-- Purpose: GROUP 7 — the platform's scheduler layer (doc 07 §5 "Scheduled &
--          background work", doc 15 §14 "pg_cron Schedule additions", doc 01 §9
--          cron registry). This migration is the SINGLE place where pg_cron is
--          provisioned and where EVERY recurring job is registered. It owns NO
--          new tables/enums/RLS — it only schedules the IDEMPOTENT functions
--          already defined in earlier migrations (0016/0017/0018/0019), plus two
--          thin all-orgs fan-out wrappers + the follow-up enqueuer that the cron
--          registry (doc 01 §9) names but no earlier file owns.
--
--          What this file creates:
--            * GUARDED pg_cron provisioning: a DO block that checks
--              pg_available_extensions and `CREATE EXTENSION IF NOT EXISTS pg_cron`
--              only when the extension is actually installable, and RAISE NOTICE +
--              skips gracefully otherwise — so a clean `supabase db reset` on an
--              empty database WITHOUT pg_cron still succeeds top-to-bottom.
--            * public.refresh_leaderboards_all_orgs([from,to]) — fan-out wrapper:
--              loops every live org and calls refresh_leaderboards() (0018) for the
--              CURRENT calendar month by default. Idempotent (period-stable upsert).
--            * public.run_bottleneck_rules_all_orgs() — fan-out wrapper: loops
--              every live org and calls run_bottleneck_rules() (0018, the doc 01 §9
--              alias over run_bottleneck_engine). Idempotent per (marketer,type,
--              stage,period). One org per statement (doc 07 §5.4 lock-scope rule).
--            * public.enqueue_followups() — doc 01 §9 / doc 07 §5.1 cron body:
--              finds contacts whose next_follow_up_at is due (active rows) and
--              inserts a 'follow_up_due' notification to the OWNER, deduped per
--              (contact, org-local due-day) so a re-run the same day never
--              re-notifies (doc 07 §5.3). SECURITY DEFINER (writes notifications
--              for any recipient, reads contacts org-wide).
--            * public.schedule_cron_jobs() — idempotent registrar that (un)schedules
--              the full job set via cron.schedule/cron.unschedule, invoked from the
--              guarded provisioning block (and re-runnable by an operator).
--
--          Schedule registered (doc 07 §5.1 + doc 15 §14, all idempotent):
--            | cron name                  | cadence       | body                                   |
--            |----------------------------|---------------|----------------------------------------|
--            | drain_dirty_metrics        | */2 * * * *   | drain_dirty_metric_days()  (0016)      |
--            | rebuild_daily_metrics      | 7 * * * *     | rebuild_daily_metrics() 48h backstop   |
--            | refresh_funnel_mvs         | */15 * * * *  | refresh_funnel_mvs()        (0017)     |
--            | refresh_leaderboards       | 30 2 * * *    | refresh_leaderboards_all_orgs()(0018)  |
--            | run_bottleneck_rules       | 0 3 * * *     | run_bottleneck_rules_all_orgs()(0018)  |
--            | enqueue_followups          | */30 * * * *  | enqueue_followups()         (0020)     |
--            | dispatch_monthly_reports   | 0 * * * *     | dispatch_due_monthly_reports()  (0019) |
--            | dispatch_quarterly_reports | 0 * * * *     | dispatch_due_quarterly_reports()(0019) |
--            | drain_export_jobs          | * * * * *     | drain_export_jobs()         (0019)     |
--            | purge_export_artifacts     | 0 4 * * *     | purge_export_artifacts()    (0019)     |
--
-- Depends on:
--   0001_extensions.sql        (app_private schema; pg_cron DEFERRED to HERE)
--   0002_enums.sql             (notification_type — 'follow_up_due')
--   0003_tenancy_identity.sql  (organizations[.timezone, .deleted_at])
--   0008_contacts.sql          (contacts.next_follow_up_at / owner_marketer_id)
--   0014_notifications.sql     (notifications — follow_up_due sink)
--   0016_analytics_facts.sql   (drain_dirty_metric_days, rebuild_daily_metrics,
--                               org_local_date)
--   0017_analytics_views.sql   (refresh_funnel_mvs)
--   0018_leaderboards_bottlenecks.sql (refresh_leaderboards, run_bottleneck_rules)
--   0019_reporting.sql         (dispatch_due_monthly_reports,
--                               dispatch_due_quarterly_reports, drain_export_jobs,
--                               purge_export_artifacts)
--
-- DESIGN NOTES (see manifest `issues`):
--   * EF-INVOKING JOBS run SQL-ONLY here. doc 07 §5 has run_bottleneck_rules /
--     drain_export_jobs / report pre-render fire Edge Functions via
--     net.http_post (pg_net). pg_net is NOT provisioned by this migration set
--     (it, like pg_cron, is environment-dependent and not required for a clean
--     reset). The cron bodies therefore call the SQL halves that ARE present and
--     idempotent: run_bottleneck_rules_all_orgs() evaluates the rules and writes
--     findings/notifications directly (run_bottleneck_engine already does the full
--     SQL evaluation in-DB — doc 18); drain_export_jobs() claims jobs to
--     'rendering' (the Edge render half is wired when pg_net + the Edge Function
--     are deployed). This keeps the schedule fully functional on a pg_cron-only
--     environment and is forward-compatible with adding the net.http_post fan-out.
--   * NO net.http_post / pg_net call appears in this file, so it never references
--     an absent object; a pg_net-enabled deployment layers the HTTP fan-out on top.
--   * cron.schedule registration is wrapped so re-running the registrar
--     (cron.unschedule IF the job exists, then cron.schedule) is idempotent across
--     repeated migrations / manual re-runs.
--   * All job bodies are existing idempotent functions: re-running any job (machine
--     restart, overlapping schedule) never corrupts state (doc 07 §5.3).
-- =============================================================================


-- =============================================================================
-- 1. refresh_leaderboards_all_orgs() — nightly fan-out over every live org for
--    the CURRENT calendar month (doc 07 §5.1 refresh_leaderboards, doc 11 §11).
--    Leaderboards are immutable WITHIN a period; this recompute overwrites the
--    current period's rows in place (idempotent upsert in refresh_leaderboards).
--    p_from/p_to default to the current month [first .. last day]; an operator may
--    pass an explicit window for a backfill. SECURITY DEFINER (system job: reads
--    facts/closure + writes leaderboard_snapshots across the whole org).
-- =============================================================================
CREATE OR REPLACE FUNCTION public.refresh_leaderboards_all_orgs(
  p_from date DEFAULT date_trunc('month', current_date)::date,
  p_to   date DEFAULT (date_trunc('month', current_date) + interval '1 month' - interval '1 day')::date
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

  -- One org per call to keep transaction/lock scope small (doc 07 §5.4).
  FOR r IN
    SELECT id FROM public.organizations WHERE deleted_at IS NULL
  LOOP
    v_sum := v_sum + public.refresh_leaderboards(r.id, p_from, p_to);
  END LOOP;

  RETURN v_sum;
END;
$$;

COMMENT ON FUNCTION public.refresh_leaderboards_all_orgs(date, date) IS
  'Nightly leaderboard fan-out (doc 07 §5.1): calls refresh_leaderboards() for every live org over the current calendar month (default) or an explicit backfill window. Idempotent (period-stable upsert). SECURITY DEFINER system job. Returns total snapshot rows across all orgs.';


-- =============================================================================
-- 2. run_bottleneck_rules_all_orgs() — nightly fan-out over every live org of the
--    bottleneck engine (doc 07 §5.1 run_bottleneck_rules, doc 11 §10). Each org
--    is evaluated independently (one org per statement, doc 07 §5.4) over the
--    engine's default trailing-30-day window. Idempotent per (org,marketer,type,
--    stage,period_start); the engine auto-resolves cleared findings and emits
--    'bottleneck_alert' notifications for new/escalated findings.
--
--    NOTE (doc 07 §4.4): the architecture has pg_cron invoke the bottleneck-engine
--    EDGE function via net.http_post for per-org batching/retry/external alerts.
--    pg_net is not provisioned in this migration set, so this body invokes the
--    in-DB SQL engine (run_bottleneck_rules -> run_bottleneck_engine, doc 18),
--    which performs the COMPLETE rule evaluation + findings + notifications in
--    SQL. A pg_net deployment can swap this for the net.http_post fan-out without
--    changing the schedule. SECURITY DEFINER.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.run_bottleneck_rules_all_orgs()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r     record;
  v_sum int := 0;
BEGIN
  FOR r IN
    SELECT id FROM public.organizations WHERE deleted_at IS NULL
  LOOP
    v_sum := v_sum + public.run_bottleneck_rules(r.id);
  END LOOP;

  RETURN v_sum;
END;
$$;

COMMENT ON FUNCTION public.run_bottleneck_rules_all_orgs() IS
  'Nightly bottleneck fan-out (doc 07 §5.1): runs run_bottleneck_rules() (-> run_bottleneck_engine, doc 18) for every live org over the default trailing-30-day window, one org per statement (doc 07 §5.4). Idempotent UPSERT into bottleneck_findings; auto-resolves cleared findings; emits bottleneck_alert notifications. SECURITY DEFINER. Returns total findings upserted across orgs.';


-- =============================================================================
-- 3. enqueue_followups() — doc 01 §9 / doc 07 §5.1 cron body. Find contacts whose
--    next_follow_up_at is due (active rows) and insert a 'follow_up_due'
--    notification to the OWNER, deduped per (contact, org-local due-day) so a
--    re-run within the same day NEVER re-notifies (doc 07 §5.3 idempotency).
--
--    Dedupe key: notifications.payload->>'contact_id' + payload->>'due_day' (the
--    contact's org-local follow-up date). The NOT EXISTS guard skips a contact for
--    which a follow_up_due notification with the same due_day was already emitted.
--    SECURITY DEFINER: it writes notifications for arbitrary recipients (system
--    producer) and reads contacts org-wide, bypassing the caller-scoped RLS the
--    same way every other cron body does. Returns #notifications inserted.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.enqueue_followups()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_n int;
BEGIN
  INSERT INTO public.notifications (
    org_id, recipient_marketer_id, type, title_it, body_it, payload
  )
  SELECT
    c.org_id,
    c.owner_marketer_id,
    'follow_up_due',
    'Follow up in scadenza',
    'Hai un follow up programmato per ' ||
      COALESCE(NULLIF(trim(c.first_name || ' ' || COALESCE(c.last_name, '')), ''), 'un contatto')
      || '.',
    jsonb_build_object(
      'contact_id', c.id,
      'due_day',    public.org_local_date(c.org_id, c.next_follow_up_at),
      'due_at',     c.next_follow_up_at
    )
  FROM public.contacts c
  WHERE c.deleted_at IS NULL
    AND c.next_follow_up_at IS NOT NULL
    AND c.next_follow_up_at <= now()
    -- Idempotency: skip if this contact's due-day follow-up was already notified.
    AND NOT EXISTS (
      SELECT 1
      FROM public.notifications n
      WHERE n.org_id = c.org_id
        AND n.recipient_marketer_id = c.owner_marketer_id
        AND n.type = 'follow_up_due'
        AND n.payload->>'contact_id' = c.id::text
        AND n.payload->>'due_day' =
              public.org_local_date(c.org_id, c.next_follow_up_at)::text
    );

  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$$;

COMMENT ON FUNCTION public.enqueue_followups() IS
  'Follow-up enqueuer (doc 01 §9 / doc 07 §5.1): inserts a follow_up_due notification to the owner for each active contact whose next_follow_up_at is due, deduped per (contact, org-local due-day) so a same-day re-run never re-notifies (doc 07 §5.3). SECURITY DEFINER system producer. Returns #notifications inserted.';


-- =============================================================================
-- 4. Least-privilege grants for the cron bodies created here. They are SYSTEM
--    jobs (pg_cron runs as the table owner/superuser and needs no explicit grant;
--    service_role covers any Edge-invoked maintenance). Revoke the default PUBLIC
--    execute so `authenticated` can never trigger an org-wide recompute/fan-out.
-- =============================================================================
REVOKE ALL ON FUNCTION public.refresh_leaderboards_all_orgs(date, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.run_bottleneck_rules_all_orgs()           FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enqueue_followups()                       FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.refresh_leaderboards_all_orgs(date, date) TO service_role;
GRANT EXECUTE ON FUNCTION public.run_bottleneck_rules_all_orgs()           TO service_role;
GRANT EXECUTE ON FUNCTION public.enqueue_followups()                       TO service_role;


-- =============================================================================
-- 5. schedule_cron_jobs() — idempotent registrar of the full job set. Called from
--    the guarded provisioning DO block (§6) ONLY when pg_cron is present, and
--    re-runnable by an operator. For each job it unschedules any existing entry of
--    the same name (so re-running does not stack duplicate schedules) and then
--    schedules it. It is defined unconditionally (it does not reference cron.* at
--    DDL time — only at call time, inside dynamic EXECUTE), so this migration loads
--    fine even where pg_cron is absent; it is simply never invoked there.
--
--    All bodies are idempotent functions defined earlier (or in §1-§3 above). The
--    SQL-only schedule keeps cron transactions short (doc 07 §5.4); jobs that the
--    architecture eventually fans out to Edge Functions (bottleneck, export drain,
--    report pre-render) are wired to their in-DB SQL halves here and can be
--    upgraded to net.http_post when pg_net is provisioned.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.schedule_cron_jobs()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, cron
AS $$
DECLARE
  v_job   record;
  v_exists boolean;
BEGIN
  -- Guard: only operate when pg_cron's catalog is actually present.
  IF to_regclass('cron.job') IS NULL THEN
    RAISE NOTICE '0020_cron: cron.job not found — pg_cron not installed; skipping schedule registration.';
    RETURN;
  END IF;

  -- (jobname, schedule, command) — the authoritative job catalog (doc 07 §5.1 /
  -- doc 15 §14). Every command is a single idempotent function call.
  FOR v_job IN
    SELECT * FROM (VALUES
      -- Drain the ADR-006 dirty-metrics queue + recompute the dirty fact rows.
      ('drain_dirty_metrics',        '*/2 * * * *',  'SELECT public.drain_dirty_metric_days();'),
      -- Hourly 48h self-heal backstop for daily_marketer_metrics.
      ('rebuild_daily_metrics',      '7 * * * *',    'SELECT public.rebuild_daily_metrics();'),
      -- Refresh the two analytics MVs CONCURRENTLY (<=15 min, doc 15 §14).
      ('refresh_funnel_mvs',         '*/15 * * * *', 'SELECT public.refresh_funnel_mvs();'),
      -- Nightly leaderboard recompute for the current period (all orgs).
      ('refresh_leaderboards',       '30 2 * * *',   'SELECT public.refresh_leaderboards_all_orgs();'),
      -- Nightly bottleneck rule scan / inactivity scan (all orgs).
      ('run_bottleneck_rules',       '0 3 * * *',    'SELECT public.run_bottleneck_rules_all_orgs();'),
      -- Follow-up due enqueue -> notifications (idempotent per contact/day).
      ('enqueue_followups',          '*/30 * * * *', 'SELECT public.enqueue_followups();'),
      -- Hourly org-local 1st-of-month monthly report generation dispatcher.
      ('dispatch_monthly_reports',   '0 * * * *',    'SELECT public.dispatch_due_monthly_reports();'),
      -- Hourly org-local quarter-first quarterly report dispatcher.
      ('dispatch_quarterly_reports', '0 * * * *',    'SELECT public.dispatch_due_quarterly_reports();'),
      -- Per-minute async export-job claim (queued -> rendering).
      ('drain_export_jobs',          '* * * * *',    'SELECT public.drain_export_jobs();'),
      -- Nightly export-artifact TTL purge (ready -> expired past expires_at).
      ('purge_export_artifacts',     '0 4 * * *',    'SELECT public.purge_export_artifacts();')
    ) AS j(jobname, schedule, command)
  LOOP
    -- Idempotent (re)registration: drop any same-named job, then (re)schedule.
    SELECT EXISTS (SELECT 1 FROM cron.job WHERE jobname = v_job.jobname)
      INTO v_exists;
    IF v_exists THEN
      PERFORM cron.unschedule(v_job.jobname);
    END IF;

    PERFORM cron.schedule(v_job.jobname, v_job.schedule, v_job.command);
  END LOOP;

  RAISE NOTICE '0020_cron: pg_cron schedule registered (10 jobs).';
END;
$$;

COMMENT ON FUNCTION public.schedule_cron_jobs() IS
  'Idempotent pg_cron registrar (doc 07 §5.1 / doc 15 §14): unschedules then schedules the full 10-job catalog. No-op (RAISE NOTICE) when pg_cron is absent (cron.job missing). Invoked by the guarded provisioning block; re-runnable by an operator. Every job command is a single idempotent function.';

REVOKE ALL ON FUNCTION public.schedule_cron_jobs() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.schedule_cron_jobs() TO service_role;


-- =============================================================================
-- 6. GUARDED pg_cron PROVISIONING (the brief's core requirement).
--    A single DO block that:
--      (a) checks pg_available_extensions for 'pg_cron';
--      (b) if installable, CREATE EXTENSION IF NOT EXISTS pg_cron, then registers
--          the schedule via schedule_cron_jobs();
--      (c) if NOT installable (e.g. a plain Postgres / `supabase db reset`
--          environment without the pg_cron control file), RAISE NOTICE and skip —
--          so the reset still succeeds top-to-bottom.
--    The CREATE EXTENSION itself is also wrapped so that even a permission error
--    on a locked-down environment degrades to a NOTICE instead of aborting reset.
-- =============================================================================
DO $cron_provision$
DECLARE
  v_available boolean;
  v_installed boolean;
BEGIN
  -- Is pg_cron available to install on THIS server?
  SELECT EXISTS (
    SELECT 1 FROM pg_available_extensions WHERE name = 'pg_cron'
  ) INTO v_available;

  -- Is it already installed (e.g. a hosted Supabase project pre-provisions it)?
  SELECT EXISTS (
    SELECT 1 FROM pg_extension WHERE extname = 'pg_cron'
  ) INTO v_installed;

  IF NOT v_available AND NOT v_installed THEN
    RAISE NOTICE '0020_cron: pg_cron is not available on this server — skipping scheduler provisioning. Background jobs (% , %, …) are defined and idempotent; schedule them by running SELECT public.schedule_cron_jobs() once pg_cron is provisioned.',
      'refresh_funnel_mvs', 'generate_monthly_reports';
    RETURN;
  END IF;

  -- Install pg_cron if not yet present. pg_cron creates its objects in the `cron`
  -- schema. Guarded so a privilege/availability hiccup degrades to a NOTICE rather
  -- than failing the whole migration / reset.
  IF NOT v_installed THEN
    BEGIN
      CREATE EXTENSION IF NOT EXISTS pg_cron;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE '0020_cron: CREATE EXTENSION pg_cron failed (%) — skipping scheduler provisioning. Run SELECT public.schedule_cron_jobs() after pg_cron is installed.',
        SQLERRM;
      RETURN;
    END;
  END IF;

  -- Register (idempotently) the full job catalog.
  PERFORM public.schedule_cron_jobs();

EXCEPTION WHEN OTHERS THEN
  -- Final safety net: never let scheduler setup abort a clean reset.
  RAISE NOTICE '0020_cron: scheduler provisioning encountered an error (%) and was skipped; the platform still resets cleanly. Run SELECT public.schedule_cron_jobs() manually once pg_cron is available.',
    SQLERRM;
END;
$cron_provision$;

-- =============================================================================
-- END 0020_cron.sql — pg_cron provisioned (guarded), 10 idempotent jobs scheduled.
-- =============================================================================
