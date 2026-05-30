-- =============================================================================
-- File 0016 — Analytics Fact Layer (BI engine: fact table, dirty-set, rollup)
-- Purpose: GROUP 6 (doc 01 §6.1, doc 11 §1-§8, ADR-006) — the atomic analytics
--          fact layer and its incremental, timezone-correct refresh machinery,
--          plus the closure-joined scope/branch aggregation read functions.
--
--          * public.daily_marketer_metrics — the canonical fact table (doc 01
--            §6.1): one row per (marketer_id, metric_date) holding that
--            marketer's OWN activity (calls / new prospects / the six stage-entry
--            counters / new recruits). All team/branch/report/leaderboard
--            analytics aggregate THIS table joined to marketer_tree_closure.
--          * app_private.dirty_metric_days — ADR-006 trigger-driven incremental-
--            refresh queue (UNLOGGED; PK (marketer_id, metric_date)). Lives in
--            app_private (ADR-006 overrides doc 11 §2.3's public placement).
--          * Timezone helpers (doc 11 §13 / Open Question #9 -> org-local):
--              - public.org_day_bounds(org_id, date)  -> [lo, hi) timestamptz
--              - public.org_local_date(org_id, ts)    -> org-local calendar date
--          * public.recompute_daily_marketer_metric(org,marketer,date) —
--            idempotent full recompute of one fact row from the source tables
--            (doc 11 §2.2). UPSERT keyed on the fact PK.
--          * Flag-dirty trigger fns + AFTER triggers on the four source tables
--            (calls / prospects / prospect_journey_events / marketers) that
--            enqueue the affected (marketer, org-local-day) pairs (doc 11 §2.3).
--          * public.drain_dirty_metric_days(limit) — drains the queue idempotently
--            (FOR UPDATE SKIP LOCKED), recomputing each pair (doc 11 §2.3).
--          * public.rebuild_daily_metrics(p_org_id, p_from, p_to) — bounded
--            window rebuild / reconciliation backstop (doc 01 §9 rebuild_daily_metrics).
--          * Closure-joined read functions (doc 11 §4/§6/§7), each RLS-safe via
--            can_see_marketer():
--              - public.subtree_metrics(org, marketer, from, to)      [GLOBAL subtree]
--              - public.branch_metrics(org, marketer, from, to)       [GLOBAL/LEFT/RIGHT]
--              - public.subtree_metrics_json(org, marketer, from, to) [doc 11 §9.2 jsonb]
--          * RLS on daily_marketer_metrics: ENABLE + FORCE; tenant via
--            current_org_id(); subtree visibility via can_see_marketer(marketer_id)
--            (doc 01 §8 / doc 11 §15). The fact table is system-written only:
--            authenticated may SELECT; INSERT/UPDATE/DELETE go through the
--            SECURITY DEFINER rollup functions / service_role.
--
-- Depends on: 0001_extensions.sql        (pgcrypto, app_private schema),
--             0002_enums.sql             (prospect_stage, call_outcome, branch_side,
--                                          placement_leg),
--             0003_tenancy_identity.sql  (organizations[.timezone], set_updated_at),
--             0004_marketers_tree.sql    (marketers, marketer_tree_closure),
--             0005_auth_visibility.sql   (current_org_id, can_see_marketer,
--                                          is_org_admin, is_platform_admin),
--             0012_prospects_journey.sql (prospects, prospect_journey_events),
--             0013_calls.sql             (calls)
--
-- ADR-006: the metrics dirty-set queue is app_private.dirty_metric_days.
--   * It is UNLOGGED (a rebuildable queue, not durable data — doc 11 §2.3) and
--     lives in app_private (not granted to authenticated/anon).
--   * The four source domain migrations (0012/0013/0004 era) DELIBERATELY did not
--     create their enqueue triggers (to avoid a forward dependency on this queue
--     + org_local_date()); they are OWNED and attached HERE.
--
-- TIMEZONE (doc 11 §1.5, schema Open Q #9 -> org-local): every date-grained
--   metric buckets on organizations.timezone, never UTC. org_local_date() and
--   org_day_bounds() are the single source of that conversion.
--
-- SCOPING NOTE (see manifest `issues`): doc 11 also specifies mv_funnel_totals,
--   mv_stage_conversion, monthly_reports, leaderboard_snapshots, bottleneck_findings
--   and the pg_cron schedule. Per this migration's brief (fact table + dirty-set +
--   flag-dirty triggers + rebuild + scope/branch aggregation), those are NOT created
--   here; they belong to later analytics/ops migrations. This file is internally
--   consistent and self-contained on a clean reset in filename order.
-- =============================================================================


-- =============================================================================
-- 6.0 Timezone helpers — org-local day bucketing (doc 11 §1.5 / §13).
-- IMMUTABLE-unsafe (they read organizations.timezone), so STABLE. SECURITY
-- DEFINER so trigger/rollup callers can resolve the org timezone regardless of
-- their RLS on organizations; both re-take only a single text column and cannot
-- leak cross-tenant data.
-- =============================================================================

-- org_local_date(org, ts): the calendar date of `ts` in the org's local timezone.
-- Falls back to 'Europe/Rome' (the organizations.timezone default) if the org row
-- is somehow unavailable, so the function is total (never returns NULL for a real ts).
CREATE OR REPLACE FUNCTION public.org_local_date(
  p_org_id uuid,
  p_ts     timestamptz
) RETURNS date
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT (p_ts AT TIME ZONE COALESCE(
            (SELECT o.timezone FROM public.organizations o WHERE o.id = p_org_id),
            'Europe/Rome'))::date;
$$;

COMMENT ON FUNCTION public.org_local_date(uuid, timestamptz) IS
  'Org-local calendar date of a timestamptz, bucketing on organizations.timezone (doc 11 §1.5). Used by the dirty-set enqueue triggers to assign metric_date. Falls back to Europe/Rome.';

-- org_day_bounds(org, date): the half-open [lo, hi) timestamptz window covering the
-- org-local calendar day `p_date`. lo = local midnight of p_date; hi = local
-- midnight of the next day. recompute_*() filters source rows with
-- `occurred_at >= lo AND occurred_at < hi` so DST transitions are handled by the
-- timezone math (the local day may be 23h/25h long; bounds are still correct).
CREATE OR REPLACE FUNCTION public.org_day_bounds(
  p_org_id uuid,
  p_date   date,
  OUT lo   timestamptz,
  OUT hi   timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tz text;
BEGIN
  SELECT COALESCE(o.timezone, 'Europe/Rome') INTO v_tz
  FROM public.organizations o WHERE o.id = p_org_id;
  IF v_tz IS NULL THEN
    v_tz := 'Europe/Rome';
  END IF;

  -- Interpret p_date's local midnight in v_tz as an absolute instant.
  lo := (p_date::timestamp)            AT TIME ZONE v_tz;
  hi := ((p_date + 1)::timestamp)      AT TIME ZONE v_tz;
END;
$$;

COMMENT ON FUNCTION public.org_day_bounds(uuid, date) IS
  'Half-open [lo,hi) timestamptz bounds of the org-local calendar day p_date (org timezone). Source-table filter for recompute_daily_marketer_metric(). DST-correct via timezone math.';


-- =============================================================================
-- 6.1 daily_marketer_metrics — the atomic analytics fact table (doc 01 §6.1).
-- One row per (marketer_id, metric_date) = a marketer's OWN activity that day.
-- =============================================================================
CREATE TABLE public.daily_marketer_metrics (
  org_id                uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  marketer_id           uuid NOT NULL REFERENCES public.marketers(id)     ON DELETE CASCADE,
  metric_date           date NOT NULL,

  -- Activity (calls)
  calls_total           int    NOT NULL DEFAULT 0,
  calls_connected       int    NOT NULL DEFAULT 0,
  calls_duration_secs   bigint NOT NULL DEFAULT 0,

  -- Funnel volume (events ENTERING each stage on this day — additive across days)
  new_prospects         int NOT NULL DEFAULT 0,    -- prospects whose entered_funnel_at is this day
  stage_conoscitiva     int NOT NULL DEFAULT 0,
  stage_business_info   int NOT NULL DEFAULT 0,
  stage_follow_up       int NOT NULL DEFAULT 0,
  stage_closing         int NOT NULL DEFAULT 0,
  stage_check_soldi     int NOT NULL DEFAULT 0,
  stage_iscrizione      int NOT NULL DEFAULT 0,     -- enrollments (throughput)

  -- Recruiting (credited to sponsor_id, not parent_id — doc 11 §2.1)
  new_recruits          int NOT NULL DEFAULT 0,     -- marketers sponsored (registered) this day

  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),

  PRIMARY KEY (marketer_id, metric_date),

  -- Defensive non-negativity (the recompute always produces >= 0; this guards
  -- against any future manual / service write going wrong).
  CONSTRAINT dmm_nonneg CHECK (
        calls_total         >= 0
    AND calls_connected     >= 0
    AND calls_duration_secs >= 0
    AND new_prospects       >= 0
    AND stage_conoscitiva   >= 0
    AND stage_business_info >= 0
    AND stage_follow_up     >= 0
    AND stage_closing       >= 0
    AND stage_check_soldi   >= 0
    AND stage_iscrizione    >= 0
    AND new_recruits        >= 0
  )
);

COMMENT ON TABLE public.daily_marketer_metrics IS
  'Atomic analytics fact table (doc 01 §6.1): one row per (marketer_id, metric_date) of a marketer''s OWN org-local-day activity. Subtree/branch/report/leaderboard totals are computed on read by joining marketer_tree_closure. Recomputed idempotently per dirty (marketer,day) by recompute_daily_marketer_metric().';
COMMENT ON COLUMN public.daily_marketer_metrics.metric_date IS
  'Org-LOCAL calendar day (organizations.timezone), not UTC (doc 11 §1.5). Source rows are bucketed via org_local_date()/org_day_bounds().';
COMMENT ON COLUMN public.daily_marketer_metrics.stage_iscrizione IS
  'Entries into the iscrizione stage this day = throughput enrollments (additive). Distinct from current state enrollments (prospects.outcome=''enrolled'').';
COMMENT ON COLUMN public.daily_marketer_metrics.new_recruits IS
  'Marketers whose sponsor_id = this marketer and registration_date = metric_date (recruiting credit via sponsor_id, doc 11 §2.1). Team SIZE/growth use placement (closure) instead.';

-- Org + date scan (period filters over the whole org; backs org-level reports/
-- leaderboards and the RLS tenant predicate).
CREATE INDEX dmm_org_date_idx ON public.daily_marketer_metrics (org_id, metric_date);

CREATE TRIGGER trg_daily_marketer_metrics_updated_at
  BEFORE UPDATE ON public.daily_marketer_metrics
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- =============================================================================
-- 6.2 app_private.dirty_metric_days — ADR-006 incremental-refresh queue.
-- UNLOGGED (a rebuildable queue, not durable data): on crash it is truncated by
-- Postgres, and the hourly rebuild_daily_metrics() backstop reconciles anyway.
-- PK (marketer_id, metric_date) coalesces repeated dirtying of the same pair into
-- one row (ON CONFLICT DO NOTHING in the enqueue triggers). Lives in app_private
-- (not exposed to authenticated/anon).
-- =============================================================================
CREATE UNLOGGED TABLE app_private.dirty_metric_days (
  org_id       uuid NOT NULL,
  marketer_id  uuid NOT NULL,
  metric_date  date NOT NULL,
  enqueued_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (marketer_id, metric_date)
);

COMMENT ON TABLE app_private.dirty_metric_days IS
  'ADR-006 trigger-driven incremental-refresh queue for daily_marketer_metrics. UNLOGGED + (marketer_id,metric_date) PK coalesces repeated dirtying. Drained every ~2 min by drain_dirty_metric_days(); rebuild_daily_metrics() is the cron backstop.';

-- Drain order (oldest first) + SKIP LOCKED scan support.
CREATE INDEX dirty_metric_days_enqueued_idx
  ON app_private.dirty_metric_days (enqueued_at);


-- =============================================================================
-- 6.3 recompute_daily_marketer_metric() — idempotent full recompute of ONE fact
-- row from the source tables (doc 11 §2.2). SECURITY DEFINER so it can read the
-- source tables and write the fact table irrespective of the caller's RLS; it is
-- a pure aggregation keyed by an explicit (org, marketer, date) and writes only
-- the one fact row, so it cannot leak or cross tenants.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.recompute_daily_marketer_metric(
  p_org_id      uuid,
  p_marketer_id uuid,
  p_date        date
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lo timestamptz;
  v_hi timestamptz;
BEGIN
  SELECT lo, hi INTO v_lo, v_hi FROM public.org_day_bounds(p_org_id, p_date);

  INSERT INTO public.daily_marketer_metrics AS d (
    org_id, marketer_id, metric_date,
    calls_total, calls_connected, calls_duration_secs,
    new_prospects,
    stage_conoscitiva, stage_business_info, stage_follow_up,
    stage_closing, stage_check_soldi, stage_iscrizione,
    new_recruits, updated_at
  )
  SELECT
    p_org_id, p_marketer_id, p_date,
    -- calls: org-scoped + this marketer + occurred in the org-local day window.
    COALESCE(cc.calls_total, 0),
    COALESCE(cc.calls_connected, 0),
    COALESCE(cc.calls_duration_secs, 0),
    -- new prospects entering the funnel this day (by owner).
    COALESCE(np.new_prospects, 0),
    -- stage ENTRIES this day (by responsible marketer, one scan over journey events).
    COALESCE(se.stage_conoscitiva, 0),
    COALESCE(se.stage_business_info, 0),
    COALESCE(se.stage_follow_up, 0),
    COALESCE(se.stage_closing, 0),
    COALESCE(se.stage_check_soldi, 0),
    COALESCE(se.stage_iscrizione, 0),
    -- new recruits credited by sponsor_id on their registration_date.
    COALESCE(nr.new_recruits, 0),
    now()
  FROM (SELECT 1) AS _anchor
  LEFT JOIN LATERAL (
    SELECT
      count(*)                                              AS calls_total,
      count(*) FILTER (WHERE c.outcome = 'connesso')        AS calls_connected,
      COALESCE(sum(c.duration_secs), 0)                     AS calls_duration_secs
    FROM public.calls c
    WHERE c.org_id      = p_org_id
      AND c.marketer_id = p_marketer_id
      AND c.deleted_at  IS NULL
      AND c.occurred_at >= v_lo
      AND c.occurred_at <  v_hi
  ) cc ON true
  LEFT JOIN LATERAL (
    SELECT count(*) AS new_prospects
    FROM public.prospects p
    WHERE p.org_id            = p_org_id
      AND p.owner_marketer_id = p_marketer_id
      AND p.deleted_at        IS NULL
      AND p.entered_funnel_at >= v_lo
      AND p.entered_funnel_at <  v_hi
  ) np ON true
  LEFT JOIN LATERAL (
    SELECT
      count(*) FILTER (WHERE e.to_stage = 'conoscitiva')   AS stage_conoscitiva,
      count(*) FILTER (WHERE e.to_stage = 'business_info')  AS stage_business_info,
      count(*) FILTER (WHERE e.to_stage = 'follow_up')      AS stage_follow_up,
      count(*) FILTER (WHERE e.to_stage = 'closing')        AS stage_closing,
      count(*) FILTER (WHERE e.to_stage = 'check_soldi')    AS stage_check_soldi,
      count(*) FILTER (WHERE e.to_stage = 'iscrizione')     AS stage_iscrizione
    FROM public.prospect_journey_events e
    WHERE e.org_id                  = p_org_id
      AND e.responsible_marketer_id = p_marketer_id
      AND e.entered_at >= v_lo
      AND e.entered_at <  v_hi
  ) se ON true
  LEFT JOIN LATERAL (
    SELECT count(*) AS new_recruits
    FROM public.marketers m
    WHERE m.org_id            = p_org_id
      AND m.sponsor_id        = p_marketer_id
      AND m.deleted_at        IS NULL
      AND m.registration_date = p_date
  ) nr ON true
  ON CONFLICT (marketer_id, metric_date) DO UPDATE SET
    calls_total         = EXCLUDED.calls_total,
    calls_connected     = EXCLUDED.calls_connected,
    calls_duration_secs = EXCLUDED.calls_duration_secs,
    new_prospects       = EXCLUDED.new_prospects,
    stage_conoscitiva   = EXCLUDED.stage_conoscitiva,
    stage_business_info = EXCLUDED.stage_business_info,
    stage_follow_up     = EXCLUDED.stage_follow_up,
    stage_closing       = EXCLUDED.stage_closing,
    stage_check_soldi   = EXCLUDED.stage_check_soldi,
    stage_iscrizione    = EXCLUDED.stage_iscrizione,
    new_recruits        = EXCLUDED.new_recruits,
    updated_at          = now();
END;
$$;

COMMENT ON FUNCTION public.recompute_daily_marketer_metric(uuid, uuid, date) IS
  'Idempotent full recompute of one daily_marketer_metrics row from calls/prospects/prospect_journey_events/marketers over the org-local day (doc 11 §2.2). UPSERT on the fact PK. SECURITY DEFINER; writes only the single (marketer,date) fact row.';


-- =============================================================================
-- 6.4 Flag-dirty trigger functions + AFTER triggers (doc 11 §2.3).
-- Each AFTER I/U/D trigger enqueues the (org, marketer, org-local-day) pair(s)
-- the write affects, into app_private.dirty_metric_days. On UPDATE we enqueue
-- BOTH the OLD and NEW (marketer, day) coordinates so a moved/redated row clears
-- its old bucket and refreshes its new one. SECURITY DEFINER so the trigger can
-- write the app_private queue (which authenticated has no rights to) and read the
-- org timezone; they emit only queue rows, never tenant data.
-- =============================================================================

-- ---- calls: bucket on occurred_at (org-local), marketer = marketer_id. --------
CREATE OR REPLACE FUNCTION public.enqueue_dirty_from_calls()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP IN ('INSERT', 'UPDATE') AND NEW.marketer_id IS NOT NULL THEN
    INSERT INTO app_private.dirty_metric_days (org_id, marketer_id, metric_date)
    VALUES (NEW.org_id, NEW.marketer_id,
            public.org_local_date(NEW.org_id, NEW.occurred_at))
    ON CONFLICT DO NOTHING;
  END IF;

  IF TG_OP IN ('UPDATE', 'DELETE') AND OLD.marketer_id IS NOT NULL THEN
    INSERT INTO app_private.dirty_metric_days (org_id, marketer_id, metric_date)
    VALUES (OLD.org_id, OLD.marketer_id,
            public.org_local_date(OLD.org_id, OLD.occurred_at))
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION public.enqueue_dirty_from_calls() IS
  'AFTER I/U/D on calls: enqueues (org, marketer_id, org-local day of occurred_at) into app_private.dirty_metric_days for both OLD and NEW coordinates (doc 11 §2.3).';

CREATE TRIGGER calls_enqueue_metric
  AFTER INSERT OR UPDATE OR DELETE ON public.calls
  FOR EACH ROW EXECUTE FUNCTION public.enqueue_dirty_from_calls();

-- ---- prospects: bucket on entered_funnel_at, marketer = owner_marketer_id. -----
CREATE OR REPLACE FUNCTION public.enqueue_dirty_from_prospects()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP IN ('INSERT', 'UPDATE') AND NEW.owner_marketer_id IS NOT NULL THEN
    INSERT INTO app_private.dirty_metric_days (org_id, marketer_id, metric_date)
    VALUES (NEW.org_id, NEW.owner_marketer_id,
            public.org_local_date(NEW.org_id, NEW.entered_funnel_at))
    ON CONFLICT DO NOTHING;
  END IF;

  IF TG_OP IN ('UPDATE', 'DELETE') AND OLD.owner_marketer_id IS NOT NULL THEN
    INSERT INTO app_private.dirty_metric_days (org_id, marketer_id, metric_date)
    VALUES (OLD.org_id, OLD.owner_marketer_id,
            public.org_local_date(OLD.org_id, OLD.entered_funnel_at))
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION public.enqueue_dirty_from_prospects() IS
  'AFTER I/U/D on prospects: enqueues (org, owner_marketer_id, org-local day of entered_funnel_at) into app_private.dirty_metric_days (drives new_prospects). doc 11 §2.3.';

CREATE TRIGGER prospects_enqueue_metric
  AFTER INSERT OR UPDATE OR DELETE ON public.prospects
  FOR EACH ROW EXECUTE FUNCTION public.enqueue_dirty_from_prospects();

-- ---- prospect_journey_events: bucket on entered_at, marketer = responsible. ----
CREATE OR REPLACE FUNCTION public.enqueue_dirty_from_journey()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP IN ('INSERT', 'UPDATE') AND NEW.responsible_marketer_id IS NOT NULL THEN
    INSERT INTO app_private.dirty_metric_days (org_id, marketer_id, metric_date)
    VALUES (NEW.org_id, NEW.responsible_marketer_id,
            public.org_local_date(NEW.org_id, NEW.entered_at))
    ON CONFLICT DO NOTHING;
  END IF;

  IF TG_OP IN ('UPDATE', 'DELETE') AND OLD.responsible_marketer_id IS NOT NULL THEN
    INSERT INTO app_private.dirty_metric_days (org_id, marketer_id, metric_date)
    VALUES (OLD.org_id, OLD.responsible_marketer_id,
            public.org_local_date(OLD.org_id, OLD.entered_at))
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION public.enqueue_dirty_from_journey() IS
  'AFTER I/U/D on prospect_journey_events: enqueues (org, responsible_marketer_id, org-local day of entered_at) into app_private.dirty_metric_days (drives the six stage_* entry counters). doc 11 §2.3.';

CREATE TRIGGER pje_enqueue_metric
  AFTER INSERT OR UPDATE OR DELETE ON public.prospect_journey_events
  FOR EACH ROW EXECUTE FUNCTION public.enqueue_dirty_from_journey();

-- ---- marketers (recruit): bucket on registration_date, marketer = sponsor_id. --
-- new_recruits credits the SPONSOR. We enqueue the sponsor's registration_date
-- bucket. On UPDATE we cover a re-sponsored or re-dated recruit by enqueueing both
-- the OLD and NEW (sponsor, registration_date) coordinates. NULL sponsor (org root
-- / unsponsored) contributes to nobody, so it is skipped.
CREATE OR REPLACE FUNCTION public.enqueue_dirty_from_marketers()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP IN ('INSERT', 'UPDATE') AND NEW.sponsor_id IS NOT NULL THEN
    INSERT INTO app_private.dirty_metric_days (org_id, marketer_id, metric_date)
    VALUES (NEW.org_id, NEW.sponsor_id, NEW.registration_date)
    ON CONFLICT DO NOTHING;
  END IF;

  IF TG_OP IN ('UPDATE', 'DELETE') AND OLD.sponsor_id IS NOT NULL THEN
    INSERT INTO app_private.dirty_metric_days (org_id, marketer_id, metric_date)
    VALUES (OLD.org_id, OLD.sponsor_id, OLD.registration_date)
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION public.enqueue_dirty_from_marketers() IS
  'AFTER I/U/D on marketers: enqueues the SPONSOR''s (org, sponsor_id, registration_date) into app_private.dirty_metric_days (drives new_recruits — recruiting credit via sponsor_id, doc 11 §2.1). registration_date is already a calendar date (no tz conversion).';

-- Fire only when a recruit-credit-relevant column changes on UPDATE (sponsor_id,
-- registration_date, org_id, deleted_at) to avoid churn on unrelated edits; the
-- INSERT/DELETE arms always fire.
CREATE TRIGGER marketers_enqueue_metric_ins
  AFTER INSERT ON public.marketers
  FOR EACH ROW EXECUTE FUNCTION public.enqueue_dirty_from_marketers();

CREATE TRIGGER marketers_enqueue_metric_upd
  AFTER UPDATE OF sponsor_id, registration_date, org_id, deleted_at ON public.marketers
  FOR EACH ROW EXECUTE FUNCTION public.enqueue_dirty_from_marketers();

CREATE TRIGGER marketers_enqueue_metric_del
  AFTER DELETE ON public.marketers
  FOR EACH ROW EXECUTE FUNCTION public.enqueue_dirty_from_marketers();


-- =============================================================================
-- 6.5 drain_dirty_metric_days() — drain the queue idempotently (doc 11 §2.3).
-- Deletes up to p_limit oldest pairs (FOR UPDATE SKIP LOCKED so concurrent
-- micro-batches do not contend) and recomputes each. Returns #pairs processed.
-- SECURITY DEFINER (touches app_private + writes the fact table).
-- =============================================================================
CREATE OR REPLACE FUNCTION public.drain_dirty_metric_days(p_limit int DEFAULT 5000)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count int := 0;
  r record;
BEGIN
  FOR r IN
    DELETE FROM app_private.dirty_metric_days
    WHERE (marketer_id, metric_date) IN (
      SELECT marketer_id, metric_date
      FROM app_private.dirty_metric_days
      ORDER BY enqueued_at
      LIMIT p_limit
      FOR UPDATE SKIP LOCKED
    )
    RETURNING org_id, marketer_id, metric_date
  LOOP
    PERFORM public.recompute_daily_marketer_metric(r.org_id, r.marketer_id, r.metric_date);
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

COMMENT ON FUNCTION public.drain_dirty_metric_days(int) IS
  'Drains up to p_limit oldest (marketer,day) pairs from app_private.dirty_metric_days (FOR UPDATE SKIP LOCKED) and recomputes each fact row. Idempotent. Intended for a ~2 min pg_cron micro-batch. Returns rows processed (doc 11 §2.3).';


-- =============================================================================
-- 6.6 rebuild_daily_metrics() — bounded-window rebuild / reconciliation backstop
-- (doc 01 §9 "rebuild_daily_metrics", doc 11 §8.1). Recomputes EVERY active
-- marketer's fact row for each org-local day in [p_from, p_to] for one org (or all
-- orgs when p_org_id IS NULL). Defaults to the trailing 2 days (the hourly 48h
-- backstop). Idempotent (each recompute is an upsert). Returns rows recomputed.
-- SECURITY DEFINER. NOTE: this is a backstop / repair path — the dirty-set drain
-- is the primary, incremental path; this exists to self-heal after an UNLOGGED
-- queue truncation (crash) or a historical correction.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.rebuild_daily_metrics(
  p_org_id uuid DEFAULT NULL,
  p_from   date DEFAULT (current_date - 1),
  p_to     date DEFAULT current_date
) RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count int := 0;
  r record;
BEGIN
  IF p_to < p_from THEN
    RAISE EXCEPTION 'rebuild_daily_metrics: p_to (%) precedes p_from (%)', p_to, p_from
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  FOR r IN
    SELECT m.org_id, m.id AS marketer_id, gs.d::date AS metric_date
    FROM public.marketers m
    CROSS JOIN generate_series(p_from, p_to, interval '1 day') AS gs(d)
    WHERE m.deleted_at IS NULL
      AND (p_org_id IS NULL OR m.org_id = p_org_id)
  LOOP
    PERFORM public.recompute_daily_marketer_metric(r.org_id, r.marketer_id, r.metric_date);
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

COMMENT ON FUNCTION public.rebuild_daily_metrics(uuid, date, date) IS
  'Reconciliation backstop (doc 01 §9): recomputes daily_marketer_metrics for every non-deleted marketer x org-local day in [p_from,p_to] (one org or all). Defaults to the trailing 48h. Idempotent. The dirty-set drain is the primary incremental path; this self-heals after an UNLOGGED-queue truncation or for historical corrections.';


-- =============================================================================
-- 6.7 Closure-joined scope/branch read functions (doc 11 §4 / §6 / §7).
-- These aggregate daily_marketer_metrics over a node's subtree via
-- marketer_tree_closure, with GLOBAL / LEFT / RIGHT branch variants through the
-- closure branch_leg column. Each is RLS-SAFE: it first asserts
-- can_see_marketer(p_marketer_id) so a caller cannot aggregate a subtree they may
-- not see (the fact table's own RLS does not auto-apply inside a SECURITY DEFINER
-- function, so visibility is enforced explicitly here).
-- =============================================================================

-- subtree_metrics(): GLOBAL subtree totals (self + entire downline) for a node
-- over [p_from, p_to]. The workhorse of dashboards (doc 11 §4.2).
CREATE OR REPLACE FUNCTION public.subtree_metrics(
  p_org_id      uuid,
  p_marketer_id uuid,
  p_from        date,
  p_to          date,
  OUT calls_total           bigint,
  OUT calls_connected       bigint,
  OUT calls_duration_secs   bigint,
  OUT new_prospects         bigint,
  OUT conoscitiva           bigint,
  OUT business_info         bigint,
  OUT follow_up             bigint,
  OUT closing               bigint,
  OUT check_soldi           bigint,
  OUT iscrizione            bigint,
  OUT new_recruits          bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Visibility gate (RLS-equivalent): caller must be allowed to see this root.
  IF NOT public.can_see_marketer(p_marketer_id) THEN
    RAISE EXCEPTION 'subtree_metrics: marketer % is outside the caller''s visible subtree', p_marketer_id
      USING ERRCODE = '42501';
  END IF;
  -- Tenant guard: the requested org must be the caller's org (defense in depth).
  IF p_org_id IS DISTINCT FROM public.current_org_id() AND NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'subtree_metrics: org mismatch' USING ERRCODE = '42501';
  END IF;

  SELECT
    COALESCE(sum(d.calls_total), 0),
    COALESCE(sum(d.calls_connected), 0),
    COALESCE(sum(d.calls_duration_secs), 0),
    COALESCE(sum(d.new_prospects), 0),
    COALESCE(sum(d.stage_conoscitiva), 0),
    COALESCE(sum(d.stage_business_info), 0),
    COALESCE(sum(d.stage_follow_up), 0),
    COALESCE(sum(d.stage_closing), 0),
    COALESCE(sum(d.stage_check_soldi), 0),
    COALESCE(sum(d.stage_iscrizione), 0),
    COALESCE(sum(d.new_recruits), 0)
  INTO
    calls_total, calls_connected, calls_duration_secs, new_prospects,
    conoscitiva, business_info, follow_up, closing, check_soldi, iscrizione,
    new_recruits
  FROM public.marketer_tree_closure cl
  JOIN public.daily_marketer_metrics d
    ON d.marketer_id = cl.descendant_id
   AND d.metric_date BETWEEN p_from AND p_to
  WHERE cl.org_id      = p_org_id
    AND cl.ancestor_id = p_marketer_id;   -- depth >= 0 => self included (GLOBAL subtree)
END;
$$;

COMMENT ON FUNCTION public.subtree_metrics(uuid, uuid, date, date) IS
  'GLOBAL subtree (self + downline) activity totals for a node over [from,to], aggregating daily_marketer_metrics via marketer_tree_closure (doc 11 §4.2). Visibility-gated by can_see_marketer().';

-- branch_metrics(): one row per branch_side (GLOBAL / LEFT / RIGHT) for a node
-- over [p_from,p_to], using closure.branch_leg (doc 11 §7.2). Self contributes to
-- GLOBAL only; LEFT/RIGHT descendants contribute to their leg AND GLOBAL.
CREATE OR REPLACE FUNCTION public.branch_metrics(
  p_org_id      uuid,
  p_marketer_id uuid,
  p_from        date,
  p_to          date
) RETURNS TABLE (
  branch_side           branch_side,
  calls_total           bigint,
  calls_connected       bigint,
  calls_duration_secs   bigint,
  new_prospects         bigint,
  conoscitiva           bigint,
  business_info         bigint,
  follow_up             bigint,
  closing               bigint,
  check_soldi           bigint,
  iscrizione            bigint,
  new_recruits          bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.can_see_marketer(p_marketer_id) THEN
    RAISE EXCEPTION 'branch_metrics: marketer % is outside the caller''s visible subtree', p_marketer_id
      USING ERRCODE = '42501';
  END IF;
  IF p_org_id IS DISTINCT FROM public.current_org_id() AND NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'branch_metrics: org mismatch' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH scoped AS (
    SELECT
      -- self (depth 0, branch_leg NULL) -> GLOBAL only; others -> their leg.
      CASE WHEN cl.depth = 0 THEN 'GLOBAL' ELSE cl.branch_leg::text END AS leg_bucket,
      d.calls_total, d.calls_connected, d.calls_duration_secs,
      d.new_prospects,
      d.stage_conoscitiva, d.stage_business_info, d.stage_follow_up,
      d.stage_closing, d.stage_check_soldi, d.stage_iscrizione,
      d.new_recruits
    FROM public.marketer_tree_closure cl
    JOIN public.daily_marketer_metrics d
      ON d.marketer_id = cl.descendant_id
     AND d.metric_date BETWEEN p_from AND p_to
    WHERE cl.org_id      = p_org_id
      AND cl.ancestor_id = p_marketer_id
  ),
  exploded AS (
    -- every descendant contributes to GLOBAL ...
    SELECT 'GLOBAL'::branch_side AS bs, * FROM scoped
    UNION ALL
    -- ... and LEFT/RIGHT descendants additionally to their own leg.
    SELECT leg_bucket::branch_side AS bs, * FROM scoped WHERE leg_bucket <> 'GLOBAL'
  )
  SELECT
    x.bs,
    COALESCE(sum(x.calls_total), 0),
    COALESCE(sum(x.calls_connected), 0),
    COALESCE(sum(x.calls_duration_secs), 0),
    COALESCE(sum(x.new_prospects), 0),
    COALESCE(sum(x.stage_conoscitiva), 0),
    COALESCE(sum(x.stage_business_info), 0),
    COALESCE(sum(x.stage_follow_up), 0),
    COALESCE(sum(x.stage_closing), 0),
    COALESCE(sum(x.stage_check_soldi), 0),
    COALESCE(sum(x.stage_iscrizione), 0),
    COALESCE(sum(x.new_recruits), 0)
  FROM exploded x
  GROUP BY x.bs
  ORDER BY x.bs;   -- enum order: GLOBAL, LEFT, RIGHT
END;
$$;

COMMENT ON FUNCTION public.branch_metrics(uuid, uuid, date, date) IS
  'Branch funnel/activity aggregation for a node over [from,to], one row per branch_side (GLOBAL/LEFT/RIGHT) via marketer_tree_closure.branch_leg (doc 11 §7.2). Self -> GLOBAL only. Visibility-gated by can_see_marketer().';

-- subtree_metrics_json(): the doc 11 §9.2 fixed-key jsonb payload for a node's
-- GLOBAL subtree over [from,to], composing activity (subtree_metrics) with team
-- composition (closure ⋈ marketers) + derived conversion ratios. Used later by
-- monthly/quarterly report generation. NULL p_marketer_id => org-wide aggregate.
CREATE OR REPLACE FUNCTION public.subtree_metrics_json(
  p_org_id      uuid,
  p_marketer_id uuid,
  p_from        date,
  p_to          date
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  m            record;
  v_team_size  bigint := 0;
  v_active     bigint := 0;
BEGIN
  -- Visibility: a non-NULL root must be visible; the org-wide (NULL) variant is
  -- admin/owner/platform only (it aggregates the whole tenant).
  IF p_marketer_id IS NOT NULL THEN
    IF NOT public.can_see_marketer(p_marketer_id) THEN
      RAISE EXCEPTION 'subtree_metrics_json: marketer % is outside the caller''s visible subtree', p_marketer_id
        USING ERRCODE = '42501';
    END IF;
  ELSE
    IF NOT public.is_org_admin() THEN
      RAISE EXCEPTION 'subtree_metrics_json: org-wide metrics require admin/owner'
        USING ERRCODE = '42501';
    END IF;
  END IF;
  IF p_org_id IS DISTINCT FROM public.current_org_id() AND NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'subtree_metrics_json: org mismatch' USING ERRCODE = '42501';
  END IF;

  -- Activity totals.
  IF p_marketer_id IS NOT NULL THEN
    SELECT * INTO m FROM public.subtree_metrics(p_org_id, p_marketer_id, p_from, p_to);
  ELSE
    -- Org-wide: sum the whole org's facts directly (no closure root).
    SELECT
      COALESCE(sum(d.calls_total), 0)         AS calls_total,
      COALESCE(sum(d.calls_connected), 0)     AS calls_connected,
      COALESCE(sum(d.calls_duration_secs), 0) AS calls_duration_secs,
      COALESCE(sum(d.new_prospects), 0)       AS new_prospects,
      COALESCE(sum(d.stage_conoscitiva), 0)   AS conoscitiva,
      COALESCE(sum(d.stage_business_info), 0) AS business_info,
      COALESCE(sum(d.stage_follow_up), 0)     AS follow_up,
      COALESCE(sum(d.stage_closing), 0)       AS closing,
      COALESCE(sum(d.stage_check_soldi), 0)   AS check_soldi,
      COALESCE(sum(d.stage_iscrizione), 0)    AS iscrizione,
      COALESCE(sum(d.new_recruits), 0)        AS new_recruits
    INTO m
    FROM public.daily_marketer_metrics d
    WHERE d.org_id = p_org_id
      AND d.metric_date BETWEEN p_from AND p_to;
  END IF;

  -- Team composition (placement-based, doc 11 §6.1): subtree members + active.
  IF p_marketer_id IS NOT NULL THEN
    SELECT
      count(*) FILTER (WHERE cl.depth >= 1),
      count(*) FILTER (WHERE cl.depth >= 1 AND mk.status = 'active')
    INTO v_team_size, v_active
    FROM public.marketer_tree_closure cl
    JOIN public.marketers mk
      ON mk.id = cl.descendant_id AND mk.deleted_at IS NULL
    WHERE cl.org_id = p_org_id
      AND cl.ancestor_id = p_marketer_id;
  ELSE
    SELECT
      count(*),
      count(*) FILTER (WHERE mk.status = 'active')
    INTO v_team_size, v_active
    FROM public.marketers mk
    WHERE mk.org_id = p_org_id AND mk.deleted_at IS NULL;
  END IF;

  RETURN jsonb_build_object(
    'calls_total',          m.calls_total,
    'calls_connected',      m.calls_connected,
    'calls_duration_secs',  m.calls_duration_secs,
    'new_prospects',        m.new_prospects,
    'conoscitiva',          m.conoscitiva,
    'business_info',        m.business_info,
    'follow_up',            m.follow_up,
    'closing',              m.closing,
    'check_soldi',          m.check_soldi,
    'iscrizione',           m.iscrizione,
    'enrollments',          m.iscrizione,          -- alias: iscrizione throughput
    'new_recruits',         m.new_recruits,
    'team_size',            v_team_size,
    'active_members',       v_active,
    'conv_overall',
      round(m.iscrizione::numeric / NULLIF(m.conoscitiva, 0), 4),
    'conv_check_soldi_iscrizione',
      round(m.iscrizione::numeric / NULLIF(m.check_soldi, 0), 4)
  );
END;
$$;

COMMENT ON FUNCTION public.subtree_metrics_json(uuid, uuid, date, date) IS
  'doc 11 §9.2 fixed-key jsonb metrics payload for a node''s GLOBAL subtree over [from,to] (activity + team composition + derived conversion ratios). NULL p_marketer_id => org-wide (admin/owner/platform only). Backs monthly/quarterly report generation.';


-- =============================================================================
-- 6.8 Row-Level Security — daily_marketer_metrics (doc 01 §8 / doc 11 §15).
-- ENABLE + FORCE; tenant via current_org_id(); subtree visibility via
-- can_see_marketer(marketer_id) (admins/owners/platform bypass the subtree
-- filter inside that helper). The fact table is SYSTEM-WRITTEN ONLY: there is no
-- INSERT/UPDATE/DELETE policy for `authenticated`, so all writes flow through the
-- SECURITY DEFINER rollup functions (recompute/drain/rebuild) or the service_role
-- (which bypasses RLS). Reads are subtree-scoped exactly like the source tables.
-- =============================================================================
ALTER TABLE public.daily_marketer_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_marketer_metrics FORCE  ROW LEVEL SECURITY;

-- READ: own + downline fact rows; admins/owners/platform see the whole org.
CREATE POLICY daily_marketer_metrics_select ON public.daily_marketer_metrics
FOR SELECT TO authenticated
USING (
  org_id = public.current_org_id()
  AND public.can_see_marketer(marketer_id)
);

-- No INSERT/UPDATE/DELETE policies for authenticated: writes are system-only.


-- =============================================================================
-- 6.9 Grants (least-privilege).
--   * authenticated may SELECT the fact table (RLS narrows to their subtree) and
--     EXECUTE the read functions.
--   * The recompute/drain/rebuild maintenance functions are NOT granted to
--     authenticated (run by pg_cron / service_role / Edge maintenance jobs).
--   * app_private (incl. dirty_metric_days) is never granted to authenticated/anon.
-- =============================================================================
GRANT SELECT ON public.daily_marketer_metrics TO authenticated;

-- Read functions (visibility-gated internally): callable by logged-in users.
REVOKE EXECUTE ON FUNCTION public.subtree_metrics(uuid, uuid, date, date)      FROM public;
REVOKE EXECUTE ON FUNCTION public.branch_metrics(uuid, uuid, date, date)       FROM public;
REVOKE EXECUTE ON FUNCTION public.subtree_metrics_json(uuid, uuid, date, date) FROM public;
GRANT  EXECUTE ON FUNCTION public.subtree_metrics(uuid, uuid, date, date)      TO authenticated, service_role;
GRANT  EXECUTE ON FUNCTION public.branch_metrics(uuid, uuid, date, date)       TO authenticated, service_role;
GRANT  EXECUTE ON FUNCTION public.subtree_metrics_json(uuid, uuid, date, date) TO authenticated, service_role;

-- Timezone helpers are read-only and harmless; allow authenticated + service_role.
GRANT  EXECUTE ON FUNCTION public.org_local_date(uuid, timestamptz) TO authenticated, service_role;
GRANT  EXECUTE ON FUNCTION public.org_day_bounds(uuid, date)        TO authenticated, service_role;

-- Maintenance functions: service_role only (pg_cron runs as a superuser/owner and
-- does not need an explicit grant; service_role covers Edge-invoked maintenance).
-- Revoke the default PUBLIC execute so authenticated cannot trigger recomputes.
REVOKE EXECUTE ON FUNCTION public.recompute_daily_marketer_metric(uuid, uuid, date) FROM public;
REVOKE EXECUTE ON FUNCTION public.drain_dirty_metric_days(int)                      FROM public;
REVOKE EXECUTE ON FUNCTION public.rebuild_daily_metrics(uuid, date, date)           FROM public;
GRANT  EXECUTE ON FUNCTION public.recompute_daily_marketer_metric(uuid, uuid, date) TO service_role;
GRANT  EXECUTE ON FUNCTION public.drain_dirty_metric_days(int)                      TO service_role;
GRANT  EXECUTE ON FUNCTION public.rebuild_daily_metrics(uuid, date, date)           TO service_role;

-- The enqueue trigger functions run as their (definer) owner via the triggers;
-- they are not meant to be called directly, so keep them off PUBLIC's execute set.
REVOKE EXECUTE ON FUNCTION public.enqueue_dirty_from_calls()     FROM public;
REVOKE EXECUTE ON FUNCTION public.enqueue_dirty_from_prospects() FROM public;
REVOKE EXECUTE ON FUNCTION public.enqueue_dirty_from_journey()   FROM public;
REVOKE EXECUTE ON FUNCTION public.enqueue_dirty_from_marketers() FROM public;
