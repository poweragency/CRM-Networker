-- =============================================================================
-- File 0019 — Reporting subsystem (monthly reports, export jobs, assembly RPCs)
-- Purpose: The reporting & export layer (doc 15 + ADR-009 #9). It turns the
--          already-computed analytics (files 0016/0017) into human-consumable
--          report DATASETS and downloadable-export JOB rows. SQL owns:
--            * monthly_reports         — immutable per-(subject,month/quarter)
--                                        snapshot with current/previous metrics,
--                                        absolute MoM/QoQ diff + % growth
--                                        (doc 01 §6.4). [canonical table]
--            * report_export_jobs      — async large-export queue (doc 15 §11.2,
--                                        ADR-009 #9). [new, additive]
--            * enums export_format / export_status (doc 15 §3.4). [new]
--            * jsonb_delta() / jsonb_delta_pct() — MoM/QoQ diff helpers
--                                        (doc 11 §13.3 contract). [new helpers]
--            * generate_monthly_reports() — the cron generator that upserts
--                                        monthly_reports per CRM-eligible subject
--                                        + the org row, and emits
--                                        monthly_report_ready notifications
--                                        (doc 15 §8.1, doc 01 §6.4 cron). [new]
--            * generate_monthly_report() — single-subject on-demand (re)gen RPC
--                                        (doc 15 §13.1, API #09 §3.6). [new]
--            * period_bounds() — resolve (granularity, start) -> [start,end] and
--                                validate first-of-period (doc 15 §3.3). [new]
--            * the assembly layer read under the CALLER's JWT (RLS-scoped):
--                build_team_report / build_funnel_report / build_conversion_report
--                / build_monthly_performance_report / build_rank_report
--                / build_leaderboard_export, dispatched by
--                assemble_report_dataset() (doc 15 §4.1, §5). [new]
--            * estimate_export_rows() — sync/async pre-flight (doc 15 §11.1). [new]
--            * enqueue_export_job() — create a report_export_jobs row (§11.2). [new]
--            * audit_report_export() — one immutable audit row per export (§12.4).
--            * dispatch_due_monthly_reports() / dispatch_due_quarterly_reports()
--                / drain_export_jobs() / purge_export_artifacts() — cron BODIES
--                only (pg_cron registration is done in the later scheduling
--                migration, exactly like 0016/0017). [new]
--          RENDERING (PDF/XLSX/CSV bytes) happens in the Deno Edge Function
--          `generate-report-export` (follow-up; see manifest `issues`). SQL only
--          ASSEMBLES the dataset jsonb and writes job/snapshot rows.
--
-- Depends on:
--   0001_extensions.sql        (pgcrypto / gen_random_uuid; pg_cron NOT enabled here)
--   0002_enums.sql             (report_period, branch_side, leaderboard_metric,
--                               leaderboard_scope, marketer_rank, prospect_stage,
--                               notification_type)
--   0003_tenancy_identity.sql  (organizations, ranks_meta, marketers ref)
--   0004_marketers_tree.sql    (marketers, marketer_tree_closure, rank_history)
--   0005_auth_visibility.sql   (current_org_id, current_marketer_id, current_app_role,
--                               can_see_marketer, is_org_admin, is_platform_admin,
--                               current_membership_active)
--   0011_documents.sql         (current_can_access_crm)
--   0012_prospects_journey.sql (prospects)
--   0014_notifications.sql     (notifications)
--   0015_audit.sql             (audit_log, audit_action enum, deny_audit_mutation)
--   0016_analytics_facts.sql   (daily_marketer_metrics, subtree_metrics_json,
--                               subtree_metrics, branch_metrics, org_local_date)
--   0017_analytics_views.sql   (mv_funnel_totals/-secured, funnel_totals_subtree,
--                               stage_conversion_subtree, prospect_stage_order)
--
-- NOTES / DECISIONS (see manifest `issues`):
--   * leaderboard_snapshots / bottleneck_findings (doc 01 §6.5/§6.6) are NOT created
--     here — they are owned by the analytics/leaderboard migration set. This file
--     only READS leaderboard_snapshots (build_leaderboard_export) and tolerates its
--     absence gracefully (the build fn guards on to_regclass()).
--   * generate_monthly_reports() is placed here (the reporting migration) because
--     this file owns monthly_reports. Doc 15 §8.1 calls it "the analytics
--     generator"; functionally it lives wherever monthly_reports is defined. It
--     consumes subtree_metrics_json() (0016) verbatim — no metric is redefined.
--   * audit_action gains 'report.export' and 'report.download' via
--     ALTER TYPE ... ADD VALUE IF NOT EXISTS (the enum is owned by 0015; we only
--     extend it). ADD VALUE cannot run inside a txn block on some PG versions, so
--     it is the FIRST statement and uses IF NOT EXISTS for reset-idempotency.
--   * pg_cron registration is intentionally OMITTED (0001 defers pg_cron to the
--     scheduling migration). We ship the job BODIES; the cron.schedule() calls are
--     documented as comments at the end, to be enabled by that migration.
--   * assemble_report_dataset + all build_* fns are SECURITY INVOKER so the
--     closure RLS on every underlying read applies (doc 15 §4.1/§12.1). The
--     definer analytics helpers they call (subtree_metrics_json, funnel/stage
--     subtree fns) re-validate can_see_marketer() internally.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 0. Extend the audit_action enum (owned by 0015) with report actions.
--    ADD VALUE must run outside an explicit transaction on older PG; it is also
--    not allowed to be used in the same txn it was added on some versions, but we
--    do NOT reference these new labels at DDL time (only at runtime in the Edge
--    Function / audit_report_export), so this is safe. IF NOT EXISTS keeps reset
--    idempotent.
-- -----------------------------------------------------------------------------
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'report.export';
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'report.download';

-- -----------------------------------------------------------------------------
-- 1. New enums (doc 15 §3.4).
-- -----------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE public.export_format AS ENUM ('pdf', 'xlsx', 'csv');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON TYPE public.export_format IS
  'Rendered export artifact format (doc 15 §3.4): pdf | xlsx | csv. The Edge renderer dispatches on this.';

DO $$ BEGIN
  CREATE TYPE public.export_status AS ENUM (
    'queued',     -- accepted, awaiting render
    'rendering',  -- Edge Function actively building the artifact
    'ready',      -- artifact in the reports bucket, signed URL issuable
    'failed',     -- render error (see error_code); retriable
    'expired'     -- artifact TTL elapsed and object purged
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON TYPE public.export_status IS
  'Lifecycle of an async report_export_jobs row (doc 15 §3.4): queued -> rendering -> ready -> expired; or -> failed (retriable).';

-- =============================================================================
-- 2. monthly_reports — immutable per-subject performance snapshot (doc 01 §6.4).
--    One row per (org_id, marketer_id, period, period_start). marketer_id NULL =
--    the org-level roll-up (admin/CEO report). Re-running a period UPSERTs (never
--    duplicates) so re-export is byte-stable. Treated append-only history; the
--    historical-evolution chart reads the trailing N rows for the same subject.
-- =============================================================================
CREATE TABLE public.monthly_reports (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,

  -- The subject of the report. NULL = org-level roll-up (whole tenant), visible
  -- to admins/owners/platform only.
  marketer_id       uuid REFERENCES public.marketers(id) ON DELETE CASCADE,

  period            report_period NOT NULL DEFAULT 'monthly',
  period_start      date NOT NULL,    -- first day of the month / quarter
  period_end        date NOT NULL,    -- last day of the month / quarter

  -- Current-period subtree-inclusive metrics (doc 11 §9.2 fixed-key payload,
  -- produced by subtree_metrics_json()).
  metrics           jsonb NOT NULL,
  -- Prior-period payload + per-key diffs (NULL when there is no prior snapshot).
  previous_metrics  jsonb,
  deltas            jsonb,            -- absolute MoM/QoQ diff per numeric key
  delta_pct         jsonb,            -- % MoM/QoQ change per numeric key

  generated_at      timestamptz NOT NULL DEFAULT now(),
  created_at        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT monthly_reports_period_consistency
    CHECK (period_end >= period_start),

  -- The upsert key: one snapshot per subject per period instance.
  CONSTRAINT monthly_reports_subject_period_uq
    UNIQUE (org_id, marketer_id, period, period_start)
);

COMMENT ON TABLE public.monthly_reports IS
  'Immutable automatic performance reports (doc 01 §6.4): one row per (org_id, marketer_id, period, period_start). marketer_id NULL = org-level roll-up. metrics/previous_metrics/deltas/delta_pct are the doc 11 §9.2 jsonb payload + MoM/QoQ diffs. Upserted by generate_monthly_reports() on the 1st of each month/quarter; the source of truth for R-M exports. RLS: org + subtree visibility of marketer_id (org row -> admins).';
COMMENT ON COLUMN public.monthly_reports.marketer_id IS
  'Report subject (subtree root). NULL = org-level roll-up, visible to admins/owners/platform only.';
COMMENT ON COLUMN public.monthly_reports.metrics IS
  'Current-period subtree-inclusive metrics, the doc 11 §9.2 fixed-key jsonb payload from subtree_metrics_json().';
COMMENT ON COLUMN public.monthly_reports.deltas IS
  'Absolute per-numeric-key diff = metrics[k] - previous_metrics[k] (jsonb_delta). NULL when no prior snapshot.';
COMMENT ON COLUMN public.monthly_reports.delta_pct IS
  '% per-numeric-key change = round((metrics[k]-previous_metrics[k]) / |previous_metrics[k]|, 4) (jsonb_delta_pct). NULL when no prior snapshot.';

-- Canonical lookup: a subject's snapshots newest-first (evolution series + R-M).
CREATE INDEX monthly_reports_marketer_idx
  ON public.monthly_reports (org_id, marketer_id, period_start DESC);

-- Period scan (the dispatcher's "already generated?" existence check; org-wide).
CREATE INDEX monthly_reports_period_idx
  ON public.monthly_reports (org_id, period, period_start);

-- =============================================================================
-- 3. report_export_jobs — async large-export queue (doc 15 §11.2).
--    A job's scope/params are FROZEN at enqueue (the visibility check ran then);
--    the worker re-validates and renders only what the requester could see.
-- =============================================================================
CREATE TABLE public.report_export_jobs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,

  -- The caller's marketer profile (you see only your own jobs; admins see all).
  requested_by    uuid NOT NULL REFERENCES public.marketers(id) ON DELETE CASCADE,

  report_type     text          NOT NULL,            -- doc 15 §2 report key
  format          export_format NOT NULL,
  scope           jsonb         NOT NULL,            -- frozen {kind, marketer_id, branch_side}
  params          jsonb         NOT NULL,            -- frozen period + options envelope

  status          export_status NOT NULL DEFAULT 'queued',
  artifact_path   text,                              -- reports/ bucket key once 'ready'
  bytes           bigint,
  row_count       bigint,
  error_code      text,                              -- set when status='failed'
  attempts        smallint      NOT NULL DEFAULT 0,

  claimed_at      timestamptz,                       -- worker lease (FOR UPDATE SKIP LOCKED)
  started_at      timestamptz,
  finished_at     timestamptz,
  expires_at      timestamptz,                       -- artifact TTL (-> 'expired' after)

  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT report_export_jobs_attempts_nonneg CHECK (attempts >= 0),
  CONSTRAINT report_export_jobs_bytes_nonneg
    CHECK (bytes IS NULL OR bytes >= 0),
  CONSTRAINT report_export_jobs_rowcount_nonneg
    CHECK (row_count IS NULL OR row_count >= 0),
  -- A 'ready' job must point at an artifact; a 'failed' job should carry a code.
  CONSTRAINT report_export_jobs_ready_has_path
    CHECK (status <> 'ready' OR artifact_path IS NOT NULL)
);

COMMENT ON TABLE public.report_export_jobs IS
  'Async large-export queue (doc 15 §11.2). One row per export request that exceeds the sync threshold (estimate_export_rows). scope/params are frozen at enqueue; the worker (drain_export_jobs -> Edge) re-validates can_see_marketer() and renders only the visible subtree. RLS: own jobs (requested_by = current_marketer_id) + admin org-wide.';
COMMENT ON COLUMN public.report_export_jobs.scope IS
  'Frozen visibility scope {kind, marketer_id, branch_side} captured at enqueue. The worker re-validates it before rendering.';
COMMENT ON COLUMN public.report_export_jobs.artifact_path IS
  'reports/ Storage bucket object key, set when status flips to ready. Deterministic so re-render overwrites (doc 15 §9.2).';
COMMENT ON COLUMN public.report_export_jobs.status IS
  'export_status lifecycle: queued -> rendering -> ready -> expired, or -> failed (retriable up to max_attempts).';

CREATE INDEX report_export_jobs_owner_idx
  ON public.report_export_jobs (org_id, requested_by, created_at DESC);

-- Cheap worker-claim scan: only queued/rendering rows, oldest-first.
CREATE INDEX report_export_jobs_status_idx
  ON public.report_export_jobs (status, created_at)
  WHERE status IN ('queued', 'rendering');

-- Org coverage (admin org-wide listing + purge scan of ready/expired artifacts).
CREATE INDEX report_export_jobs_org_idx
  ON public.report_export_jobs (org_id, created_at DESC);

-- Dedupe duplicate clicks: collapse identical in-flight requests into one job
-- (doc 15 §11.2). The hash freezes the scope+params payload.
CREATE UNIQUE INDEX report_export_jobs_dedupe_uq
  ON public.report_export_jobs (
    org_id, requested_by, report_type, format,
    md5(scope::text || params::text)
  )
  WHERE status IN ('queued', 'rendering');

CREATE TRIGGER trg_report_export_jobs_updated_at
  BEFORE UPDATE ON public.report_export_jobs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =============================================================================
-- 4. jsonb_delta() / jsonb_delta_pct() — MoM/QoQ diff helpers (doc 11 §13.3).
--    Operate key-wise over the numeric keys present in BOTH payloads. Non-numeric
--    values (and keys absent on either side) are skipped. IMMUTABLE/pure.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.jsonb_delta(p_cur jsonb, p_prev jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_out jsonb := '{}'::jsonb;
  k     text;
  cur_t jsonb;
  prv_t jsonb;
BEGIN
  IF p_cur IS NULL OR p_prev IS NULL THEN
    RETURN NULL;
  END IF;
  FOR k IN SELECT jsonb_object_keys(p_cur) LOOP
    cur_t := p_cur -> k;
    prv_t := p_prev -> k;
    -- Both sides must be present and JSON numbers.
    IF prv_t IS NOT NULL
       AND jsonb_typeof(cur_t) = 'number'
       AND jsonb_typeof(prv_t) = 'number'
    THEN
      v_out := v_out || jsonb_build_object(
        k, to_jsonb( (cur_t)::text::numeric - (prv_t)::text::numeric )
      );
    END IF;
  END LOOP;
  RETURN v_out;
END;
$$;

COMMENT ON FUNCTION public.jsonb_delta(jsonb, jsonb) IS
  'Per-numeric-key absolute diff (current - previous) over keys present and numeric in BOTH payloads (doc 11 §13.3). NULL if either input is NULL. Non-numeric keys skipped. Used for monthly_reports.deltas.';

CREATE OR REPLACE FUNCTION public.jsonb_delta_pct(p_cur jsonb, p_prev jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_out jsonb := '{}'::jsonb;
  k     text;
  cur_n numeric;
  prv_n numeric;
BEGIN
  IF p_cur IS NULL OR p_prev IS NULL THEN
    RETURN NULL;
  END IF;
  FOR k IN SELECT jsonb_object_keys(p_cur) LOOP
    IF (p_prev -> k) IS NOT NULL
       AND jsonb_typeof(p_cur -> k)  = 'number'
       AND jsonb_typeof(p_prev -> k) = 'number'
    THEN
      cur_n := (p_cur  -> k)::text::numeric;
      prv_n := (p_prev -> k)::text::numeric;
      -- Guard divide-by-zero: undefined % growth from a zero base -> NULL entry.
      IF prv_n = 0 THEN
        v_out := v_out || jsonb_build_object(k, 'null'::jsonb);
      ELSE
        v_out := v_out || jsonb_build_object(
          k, to_jsonb( round((cur_n - prv_n) / abs(prv_n), 4) )
        );
      END IF;
    END IF;
  END LOOP;
  RETURN v_out;
END;
$$;

COMMENT ON FUNCTION public.jsonb_delta_pct(jsonb, jsonb) IS
  'Per-numeric-key % change round((cur-prev)/|prev|, 4) over keys numeric in BOTH payloads (doc 11 §13.3). Zero previous base -> null entry (undefined growth). NULL if either input is NULL. Used for monthly_reports.delta_pct.';

-- =============================================================================
-- 5. period_bounds() — resolve (granularity, period_start) -> [start, end] and
--    validate the first-of-period rule (doc 15 §3.3). IMMUTABLE.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.period_bounds(
  p_granularity text,
  p_period_start date
)
RETURNS TABLE(period_start date, period_end date)
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  IF p_granularity = 'monthly' THEN
    IF p_period_start <> date_trunc('month', p_period_start)::date THEN
      RAISE EXCEPTION 'invalid_period_start' USING ERRCODE = '22023';
    END IF;
    RETURN QUERY SELECT p_period_start,
                        (p_period_start + interval '1 month' - interval '1 day')::date;
  ELSIF p_granularity = 'quarterly' THEN
    IF p_period_start <> date_trunc('quarter', p_period_start)::date THEN
      RAISE EXCEPTION 'invalid_period_start' USING ERRCODE = '22023';
    END IF;
    RETURN QUERY SELECT p_period_start,
                        (p_period_start + interval '3 months' - interval '1 day')::date;
  ELSE
    -- 'custom': caller supplies both bounds; validated by the RPC, not here.
    RAISE EXCEPTION 'custom_requires_explicit_end' USING ERRCODE = '22023';
  END IF;
END;
$$;

COMMENT ON FUNCTION public.period_bounds(text, date) IS
  'Resolve (granularity, period_start) to a concrete [period_start, period_end] for monthly/quarterly and validate the first-of-period rule (doc 15 §3.3). custom granularity raises (caller supplies both bounds).';

-- =============================================================================
-- 6. generate_monthly_reports() — the automatic generator (doc 15 §8.1, doc 01
--    §6.4 cron). For period P (monthly|quarterly) in org O, for every CRM-eligible
--    marketer (subtree-inclusive) PLUS the org roll-up row, UPSERT a
--    monthly_reports snapshot with current/previous/deltas/delta_pct and emit a
--    'monthly_report_ready' notification. SECURITY DEFINER (runs as the cron/
--    service principal): it bypasses RLS to write across the whole org and reads
--    metrics directly from daily_marketer_metrics (NOT via the RLS-scoped
--    subtree_metrics_json, which gates on the caller's JWT and would reject a
--    cron principal with no marketer context). Idempotent on the unique key.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.generate_monthly_reports(
  p_org_id       uuid,
  p_period_start date,
  p_period       report_period DEFAULT 'monthly'
)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pstart      date;
  v_pend        date;
  v_prev_start  date;
  v_prev_end    date;
  v_subject     uuid;
  v_cur         jsonb;
  v_prev        jsonb;
  v_count       int := 0;
  v_report_id   uuid;
  r             record;
BEGIN
  -- Resolve current + previous period bounds from the canonical helper.
  SELECT pb.period_start, pb.period_end
    INTO v_pstart, v_pend
  FROM public.period_bounds(p_period::text, p_period_start) pb;

  IF p_period = 'monthly' THEN
    v_prev_start := (v_pstart - interval '1 month')::date;
  ELSE
    v_prev_start := (v_pstart - interval '3 months')::date;
  END IF;
  SELECT pb.period_end INTO v_prev_end
  FROM public.period_bounds(p_period::text, v_prev_start) pb;

  -- ----- Subject set: every CRM-eligible marketer + the org roll-up (NULL) -----
  -- CRM-eligible = ranks_meta.crm_eligible OR an explicit membership crm_access
  -- override. We resolve eligibility from ranks_meta (rank-driven) UNION the set
  -- of marketers whose membership grants crm_access (doc 15 §8.3 / ADR-009 #10).
  FOR r IN
    WITH eligible AS (
      SELECT m.id AS marketer_id
      FROM public.marketers m
      JOIN public.ranks_meta rm ON rm.rank = m.rank
      WHERE m.org_id = p_org_id
        AND m.deleted_at IS NULL
        AND rm.crm_eligible = true
      UNION
      SELECT mem.marketer_id
      FROM public.memberships mem
      WHERE mem.org_id = p_org_id
        AND COALESCE((mem.permissions ->> 'crm_access')::boolean, false) = true
    )
    SELECT marketer_id FROM eligible
    UNION ALL
    SELECT NULL::uuid AS marketer_id          -- the org-level roll-up row
  LOOP
    v_subject := r.marketer_id;

    -- Current + previous subtree-inclusive metrics, computed directly from facts
    -- (definer context: no JWT subtree gate). Org row (NULL subject) sums the org.
    v_cur  := public.report_metrics_direct(p_org_id, v_subject, v_pstart, v_pend);
    v_prev := public.report_metrics_direct(p_org_id, v_subject, v_prev_start, v_prev_end);

    INSERT INTO public.monthly_reports AS mr (
      org_id, marketer_id, period, period_start, period_end,
      metrics, previous_metrics, deltas, delta_pct, generated_at
    ) VALUES (
      p_org_id, v_subject, p_period, v_pstart, v_pend,
      v_cur, v_prev,
      public.jsonb_delta(v_cur, v_prev),
      public.jsonb_delta_pct(v_cur, v_prev),
      now()
    )
    ON CONFLICT (org_id, marketer_id, period, period_start)
    DO UPDATE SET
      period_end       = EXCLUDED.period_end,
      metrics          = EXCLUDED.metrics,
      previous_metrics = EXCLUDED.previous_metrics,
      deltas           = EXCLUDED.deltas,
      delta_pct        = EXCLUDED.delta_pct,
      generated_at     = now()
    RETURNING mr.id INTO v_report_id;

    v_count := v_count + 1;

    -- Emit the in-app notification to the subject marketer (skip the org row,
    -- which has no single recipient — admins read it via the org listing).
    IF v_subject IS NOT NULL THEN
      INSERT INTO public.notifications (
        org_id, recipient_marketer_id, type, title_it, body_it, payload
      ) VALUES (
        p_org_id, v_subject, 'monthly_report_ready',
        'Report ' || CASE WHEN p_period = 'quarterly' THEN 'trimestrale' ELSE 'mensile' END || ' pronto',
        'Il tuo report di ' || to_char(v_pstart, 'MM/YYYY') || ' è disponibile.',
        jsonb_build_object(
          'report_id',    v_report_id,
          'period_start', v_pstart,
          'report_type',  'monthly_performance_report',
          'scope_kind',   'team'
        )
      );
    END IF;
  END LOOP;

  RETURN v_count;
END;
$$;

COMMENT ON FUNCTION public.generate_monthly_reports(uuid, date, report_period) IS
  'Automatic report generator (doc 15 §8.1): UPSERTs a monthly_reports snapshot (current+previous+deltas+delta_pct) for every CRM-eligible marketer + the org roll-up, and emits a monthly_report_ready notification per subject. SECURITY DEFINER cron/service principal; idempotent on the unique key. Handles monthly and quarterly via the period arg.';

-- report_metrics_direct(): the fact-table read used by the DEFINER generator.
-- Mirrors subtree_metrics_json()'s fixed-key payload (doc 11 §9.2) but WITHOUT the
-- JWT visibility gate, so the cron principal can compute any subject's metrics.
-- p_marketer_id NULL => the whole org. SECURITY DEFINER + search_path locked.
CREATE OR REPLACE FUNCTION public.report_metrics_direct(
  p_org_id      uuid,
  p_marketer_id uuid,
  p_from        date,
  p_to          date
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v record;
  v_team_size bigint := 0;
  v_active    bigint := 0;
BEGIN
  IF p_marketer_id IS NOT NULL THEN
    -- Subtree-inclusive activity (closure ⋈ facts), no visibility gate (definer).
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
    INTO v
    FROM public.marketer_tree_closure cl
    JOIN public.daily_marketer_metrics d
      ON d.marketer_id = cl.descendant_id
     AND d.metric_date BETWEEN p_from AND p_to
    WHERE cl.org_id      = p_org_id
      AND cl.ancestor_id = p_marketer_id;

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
    -- Org-wide aggregate (NULL subject = the roll-up row).
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
    INTO v
    FROM public.daily_marketer_metrics d
    WHERE d.org_id = p_org_id
      AND d.metric_date BETWEEN p_from AND p_to;

    SELECT count(*), count(*) FILTER (WHERE mk.status = 'active')
    INTO v_team_size, v_active
    FROM public.marketers mk
    WHERE mk.org_id = p_org_id AND mk.deleted_at IS NULL;
  END IF;

  RETURN jsonb_build_object(
    'calls_total',         v.calls_total,
    'calls_connected',     v.calls_connected,
    'calls_duration_secs', v.calls_duration_secs,
    'new_prospects',       v.new_prospects,
    'conoscitiva',         v.conoscitiva,
    'business_info',       v.business_info,
    'follow_up',           v.follow_up,
    'closing',             v.closing,
    'check_soldi',         v.check_soldi,
    'iscrizione',          v.iscrizione,
    'enrollments',         v.iscrizione,
    'new_recruits',        v.new_recruits,
    'team_size',           v_team_size,
    'active_members',      v_active,
    'conv_overall',
      round(v.iscrizione::numeric / NULLIF(v.conoscitiva, 0), 4),
    'conv_check_soldi_iscrizione',
      round(v.iscrizione::numeric / NULLIF(v.check_soldi, 0), 4)
  );
END;
$$;

COMMENT ON FUNCTION public.report_metrics_direct(uuid, uuid, date, date) IS
  'DEFINER fact read for generate_monthly_reports: the doc 11 §9.2 fixed-key metrics payload for a subject''s GLOBAL subtree (or the whole org when NULL) over [from,to], WITHOUT a JWT visibility gate. System-only — never granted to authenticated.';

-- =============================================================================
-- 7. generate_monthly_report() — single-subject on-demand (re)generate RPC
--    (doc 15 §13.1, API #09 §3.6). Runs under the CALLER's JWT, enforces the
--    visibility/admin guards, then delegates the actual write to the DEFINER
--    generator for ONE subject by upserting just that row. Used for mid-month
--    preview / backfill from the UI.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.generate_monthly_report(
  p_marketer_id  uuid,                              -- NULL = org roll-up (admin only)
  p_period_start date,
  p_period       report_period DEFAULT 'monthly'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org        uuid := public.current_org_id();
  v_pstart     date;
  v_pend       date;
  v_prev_start date;
  v_prev_end   date;
  v_cur        jsonb;
  v_prev       jsonb;
  v_id         uuid;
BEGIN
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'no org context' USING ERRCODE = '42501';
  END IF;
  IF NOT public.current_membership_active() THEN
    RAISE EXCEPTION 'membership inactive' USING ERRCODE = '42501';
  END IF;

  -- Authority: org row -> admin/owner; subject row -> caller must see it.
  IF p_marketer_id IS NULL THEN
    IF NOT public.is_org_admin() THEN
      RAISE EXCEPTION 'org_report_requires_admin' USING ERRCODE = '42501';
    END IF;
  ELSE
    IF NOT public.can_see_marketer(p_marketer_id) THEN
      RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Resolve period bounds (validates first-of-period); reject future periods.
  SELECT pb.period_start, pb.period_end INTO v_pstart, v_pend
  FROM public.period_bounds(p_period::text, p_period_start) pb;
  IF v_pstart > (now() AT TIME ZONE 'UTC')::date THEN
    RAISE EXCEPTION 'period_in_future' USING ERRCODE = '22023';
  END IF;

  IF p_period = 'monthly' THEN
    v_prev_start := (v_pstart - interval '1 month')::date;
  ELSE
    v_prev_start := (v_pstart - interval '3 months')::date;
  END IF;
  SELECT pb.period_end INTO v_prev_end
  FROM public.period_bounds(p_period::text, v_prev_start) pb;

  v_cur  := public.report_metrics_direct(v_org, p_marketer_id, v_pstart, v_pend);
  v_prev := public.report_metrics_direct(v_org, p_marketer_id, v_prev_start, v_prev_end);

  INSERT INTO public.monthly_reports AS mr (
    org_id, marketer_id, period, period_start, period_end,
    metrics, previous_metrics, deltas, delta_pct, generated_at
  ) VALUES (
    v_org, p_marketer_id, p_period, v_pstart, v_pend,
    v_cur, v_prev,
    public.jsonb_delta(v_cur, v_prev),
    public.jsonb_delta_pct(v_cur, v_prev),
    now()
  )
  ON CONFLICT (org_id, marketer_id, period, period_start)
  DO UPDATE SET
    period_end       = EXCLUDED.period_end,
    metrics          = EXCLUDED.metrics,
    previous_metrics = EXCLUDED.previous_metrics,
    deltas           = EXCLUDED.deltas,
    delta_pct        = EXCLUDED.delta_pct,
    generated_at     = now()
  RETURNING mr.id INTO v_id;

  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION public.generate_monthly_report(uuid, date, report_period) IS
  'On-demand (re)generate ONE monthly_reports snapshot for a subject (NULL = org roll-up, admin only) (doc 15 §13.1 / API #09 §3.6). Caller-JWT authority guards (can_see_marketer / org_report_requires_admin / invalid_period_start / period_in_future) then upserts via the DEFINER fact read. Returns the report id.';

-- =============================================================================
-- 8. Assembly layer (doc 15 §4.1, §5) — SECURITY INVOKER so closure RLS applies.
--    Each build_* fn returns the type-specific `data` block of the dataset
--    contract (§5.2). They lean on the analytics DEFINER helpers (which
--    re-validate visibility internally) and on the RLS-scoped tables/views.
-- =============================================================================

-- ----- R-M: monthly performance (off the immutable monthly_reports snapshot) ---
CREATE OR REPLACE FUNCTION public.build_monthly_performance_report(
  p_org_id          uuid,
  p_marketer_id     uuid,
  p_granularity     text,
  p_period_start    date,
  p_history_periods int DEFAULT 12
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_period report_period := p_granularity::report_period;
  v_row    record;
  v_evo    jsonb;
BEGIN
  -- The snapshot row for the requested period (RLS auto-scopes the subject).
  SELECT metrics, previous_metrics, deltas, delta_pct
    INTO v_row
  FROM public.monthly_reports
  WHERE org_id = p_org_id
    AND marketer_id IS NOT DISTINCT FROM p_marketer_id
    AND period = v_period
    AND period_start = p_period_start;

  -- Historical evolution: trailing N snapshots, oldest -> newest for charting.
  SELECT COALESCE(jsonb_agg(e ORDER BY e.period_start), '[]'::jsonb)
    INTO v_evo
  FROM (
    SELECT period_start,
           (metrics ->> 'conv_overall')::numeric AS conv_overall,
           (metrics ->> 'enrollments')::int      AS enrollments,
           (metrics ->> 'calls_total')::int      AS calls_total
    FROM public.monthly_reports
    WHERE org_id = p_org_id
      AND marketer_id IS NOT DISTINCT FROM p_marketer_id
      AND period = v_period
    ORDER BY period_start DESC
    LIMIT GREATEST(p_history_periods, 1)
  ) e;

  RETURN jsonb_build_object(
    'metrics',          COALESCE(v_row.metrics, '{}'::jsonb),
    'previous_metrics', v_row.previous_metrics,
    'deltas',           v_row.deltas,
    'delta_pct',        v_row.delta_pct,
    'evolution',        v_evo
  );
END;
$$;

COMMENT ON FUNCTION public.build_monthly_performance_report(uuid, uuid, text, date, int) IS
  'R-M data block (doc 15 §5.2): the monthly_reports snapshot row (metrics/previous/deltas/delta_pct) + trailing-N evolution series, all RLS-scoped (SECURITY INVOKER). No live recomputation — the snapshot is the source of truth.';

-- ----- R-T: team report -------------------------------------------------------
CREATE OR REPLACE FUNCTION public.build_team_report(
  p_org_id      uuid,
  p_marketer_id uuid,
  p_branch      branch_side,
  p_from        date,
  p_to          date
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_metrics       jsonb;
  v_team_size     bigint := 0;
  v_active        bigint := 0;
  v_inactive      bigint := 0;
  v_pending       bigint := 0;
  v_suspended     bigint := 0;
  v_direct_child  bigint := 0;
  v_direct_recr   bigint := 0;
  v_new_period    bigint := 0;
  v_size_start    bigint := 0;
BEGIN
  IF p_marketer_id IS NULL THEN
    RAISE EXCEPTION 'team_report requires a subtree root' USING ERRCODE = '22023';
  END IF;

  -- Subtree-inclusive activity payload (definer helper, visibility re-checked).
  v_metrics := public.subtree_metrics_json(p_org_id, p_marketer_id, p_from, p_to);

  -- Composition over the closure ⋈ marketers (RLS on marketers scopes this).
  SELECT
    count(*) FILTER (WHERE cl.depth >= 1),
    count(*) FILTER (WHERE cl.depth >= 1 AND mk.status = 'active'),
    count(*) FILTER (WHERE cl.depth >= 1 AND mk.status = 'inactive'),
    count(*) FILTER (WHERE cl.depth >= 1 AND mk.status = 'pending'),
    count(*) FILTER (WHERE cl.depth >= 1 AND mk.status = 'suspended'),
    count(*) FILTER (WHERE cl.depth = 1),
    count(*) FILTER (WHERE cl.depth >= 1 AND mk.registration_date >= p_from
                                        AND mk.registration_date <= p_to)
  INTO v_team_size, v_active, v_inactive, v_pending, v_suspended,
       v_direct_child, v_new_period
  FROM public.marketer_tree_closure cl
  JOIN public.marketers mk
    ON mk.id = cl.descendant_id AND mk.deleted_at IS NULL
  WHERE cl.org_id = p_org_id
    AND cl.ancestor_id = p_marketer_id;

  -- direct_recruits: sponsored (recruiting credit), distinct from placement.
  SELECT count(*) INTO v_direct_recr
  FROM public.marketers mk
  WHERE mk.org_id = p_org_id
    AND mk.sponsor_id = p_marketer_id
    AND mk.deleted_at IS NULL;

  -- size at period start = team_size minus those who joined within the window.
  v_size_start := GREATEST(v_team_size - v_new_period, 0);

  RETURN jsonb_build_object(
    'composition', jsonb_build_object(
      'team_size',          v_team_size,
      'active_members',     v_active,
      'inactive_members',   v_inactive,
      'pending_members',    v_pending,
      'suspended_members',  v_suspended,
      'direct_children',    v_direct_child,
      'direct_recruits',    v_direct_recr,
      'new_members_period', v_new_period,
      'growth_pct',
        round(v_new_period::numeric / NULLIF(v_size_start, 0), 4)
    ),
    'activity', jsonb_build_object(
      'calls_total',     v_metrics -> 'calls_total',
      'calls_connected', v_metrics -> 'calls_connected',
      'new_prospects',   v_metrics -> 'new_prospects',
      'iscrizione',      v_metrics -> 'iscrizione',
      'new_recruits',    v_metrics -> 'new_recruits'
    ),
    'branch_side', p_branch
  );
END;
$$;

COMMENT ON FUNCTION public.build_team_report(uuid, uuid, branch_side, date, date) IS
  'R-T data block (doc 15 §5.2 / §2.1): subtree composition (size/active/.../direct_recruits/new/growth) + activity totals. SECURITY INVOKER + closure RLS; activity from subtree_metrics_json(). per-member detail is emitted by the Edge layer when requested.';

-- ----- R-F: funnel report -----------------------------------------------------
CREATE OR REPLACE FUNCTION public.build_funnel_report(
  p_org_id      uuid,
  p_marketer_id uuid,
  p_branch      branch_side,
  p_from        date,
  p_to          date
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_metrics  jsonb;
  v_occ      jsonb;
  v_branches jsonb;
  v_pipeline numeric;
BEGIN
  IF p_marketer_id IS NULL THEN
    RAISE EXCEPTION 'funnel_report requires a subtree root' USING ERRCODE = '22023';
  END IF;

  -- Throughput (stage entries in the window): subtree activity payload.
  v_metrics := public.subtree_metrics_json(p_org_id, p_marketer_id, p_from, p_to);

  -- Current occupancy: closure-scoped funnel from the secured MV helper.
  SELECT COALESCE(
           jsonb_object_agg('open_' || ft.current_stage::text, ft.prospects_count)
             FILTER (WHERE ft.outcome = 'open'),
           '{}'::jsonb
         )
         || jsonb_build_object(
              'enrolled_total',
              COALESCE(sum(ft.enrolled_count) FILTER (WHERE ft.outcome = 'enrolled'), 0),
              'lost_total',
              COALESCE(sum(ft.prospects_count) FILTER (WHERE ft.outcome = 'lost'), 0)
            )
    INTO v_occ
  FROM public.funnel_totals_subtree(p_org_id, p_marketer_id) ft;

  -- Pipeline value: sum(expected_value) of OPEN prospects in the visible subtree
  -- (RLS on prospects scopes this to the caller's subtree automatically).
  SELECT COALESCE(sum(p.expected_value), 0)
    INTO v_pipeline
  FROM public.prospects p
  JOIN public.marketer_tree_closure cl
    ON cl.descendant_id = p.owner_marketer_id
   AND cl.org_id = p.org_id
  WHERE p.org_id = p_org_id
    AND cl.ancestor_id = p_marketer_id
    AND p.outcome = 'open'
    AND p.deleted_at IS NULL;

  -- Branch split (GLOBAL/LEFT/RIGHT) throughput from branch_metrics().
  SELECT COALESCE(jsonb_agg(
           jsonb_build_object(
             'branch_side',   bm.branch_side,
             'new_prospects', bm.new_prospects,
             'conoscitiva',   bm.conoscitiva,
             'business_info', bm.business_info,
             'follow_up',     bm.follow_up,
             'closing',       bm.closing,
             'check_soldi',   bm.check_soldi,
             'iscrizione',    bm.iscrizione
           ) ORDER BY bm.branch_side
         ), '[]'::jsonb)
    INTO v_branches
  FROM public.branch_metrics(p_org_id, p_marketer_id, p_from, p_to) bm;

  RETURN jsonb_build_object(
    'throughput', jsonb_build_object(
      'new_prospects', v_metrics -> 'new_prospects',
      'conoscitiva',   v_metrics -> 'conoscitiva',
      'business_info', v_metrics -> 'business_info',
      'follow_up',     v_metrics -> 'follow_up',
      'closing',       v_metrics -> 'closing',
      'check_soldi',   v_metrics -> 'check_soldi',
      'iscrizione',    v_metrics -> 'iscrizione'
    ),
    'occupancy',      v_occ,
    'pipeline_value', v_pipeline,
    'branches',       v_branches,
    'branch_side',    p_branch
  );
END;
$$;

COMMENT ON FUNCTION public.build_funnel_report(uuid, uuid, branch_side, date, date) IS
  'R-F data block (doc 15 §5.2 / §2.2): per-stage throughput (subtree_metrics_json), current occupancy (funnel_totals_subtree), pipeline_value (sum open expected_value, RLS-scoped), and GLOBAL/LEFT/RIGHT branch split (branch_metrics). SECURITY INVOKER.';

-- ----- R-C: conversion report -------------------------------------------------
CREATE OR REPLACE FUNCTION public.build_conversion_report(
  p_org_id          uuid,
  p_marketer_id     uuid,
  p_branch          branch_side,
  p_from            date,
  p_to              date,
  p_history_periods int     DEFAULT 12,
  p_cohort_mode     boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_entered  int[] := ARRAY[0,0,0,0,0,0];   -- indexed by prospect_stage_order 1..6
  v_avg      jsonb := '{}'::jsonb;
  v_trend    jsonb;
  rec        record;
BEGIN
  IF p_marketer_id IS NULL THEN
    RAISE EXCEPTION 'conversion_report requires a subtree root' USING ERRCODE = '22023';
  END IF;

  -- Per-stage entered totals + avg time-in-stage for the single window.
  FOR rec IN
    SELECT to_stage, stage_order, entered_count, avg_time_in_stage_secs
    FROM public.stage_conversion_subtree(p_org_id, p_marketer_id, p_from, p_to)
  LOOP
    v_entered[rec.stage_order] := rec.entered_count;
    v_avg := v_avg || jsonb_build_object(
      rec.to_stage::text,
      round(COALESCE(rec.avg_time_in_stage_secs, 0) / 86400.0, 2)  -- secs -> days
    );
  END LOOP;

  -- Monthly trend of conv_overall with MoM diff/% from the secured conversion
  -- view (RLS-scoped). conv_overall = iscrizione_entries / conoscitiva_entries.
  SELECT COALESCE(jsonb_agg(t ORDER BY t.period_month), '[]'::jsonb)
    INTO v_trend
  FROM (
    SELECT period_month,
           conv_overall,
           round(conv_overall
                 - lag(conv_overall) OVER (ORDER BY period_month), 4) AS mom_diff,
           round( (conv_overall - lag(conv_overall) OVER (ORDER BY period_month))
                  / NULLIF(abs(lag(conv_overall) OVER (ORDER BY period_month)), 0), 4)
             AS mom_pct
    FROM (
      SELECT s.period_month,
             round(
               sum(s.entered_count) FILTER (WHERE s.to_stage = 'iscrizione')::numeric
               / NULLIF(sum(s.entered_count) FILTER (WHERE s.to_stage = 'conoscitiva'), 0),
               4
             ) AS conv_overall
      FROM public.v_stage_conversion_secured s
      WHERE s.org_id = p_org_id
        AND s.marketer_id IN (
          SELECT cl.descendant_id
          FROM public.marketer_tree_closure cl
          WHERE cl.org_id = p_org_id AND cl.ancestor_id = p_marketer_id
        )
      GROUP BY s.period_month
      ORDER BY s.period_month DESC
      LIMIT GREATEST(p_history_periods, 1)
    ) m
  ) t;

  RETURN jsonb_build_object(
    'stage_to_stage', jsonb_build_object(
      'conv_conoscitiva_business_info',
        round(v_entered[2]::numeric / NULLIF(v_entered[1], 0), 4),
      'conv_business_info_follow_up',
        round(v_entered[3]::numeric / NULLIF(v_entered[2], 0), 4),
      'conv_follow_up_closing',
        round(v_entered[4]::numeric / NULLIF(v_entered[3], 0), 4),
      'conv_closing_check_soldi',
        round(v_entered[5]::numeric / NULLIF(v_entered[4], 0), 4),
      'conv_check_soldi_iscrizione',
        round(v_entered[6]::numeric / NULLIF(v_entered[5], 0), 4),
      'conv_overall',
        round(v_entered[6]::numeric / NULLIF(v_entered[1], 0), 4)
    ),
    'avg_time_in_stage_days', v_avg,
    'trend',                  v_trend,
    'cohort',                 CASE WHEN p_cohort_mode THEN '{}'::jsonb ELSE 'null'::jsonb END,
    'branch_side',            p_branch
  );
END;
$$;

COMMENT ON FUNCTION public.build_conversion_report(uuid, uuid, branch_side, date, date, int, boolean) IS
  'R-C data block (doc 15 §5.2 / §2.3): single-window stage-to-stage conversion % + avg time-in-stage (stage_conversion_subtree), and monthly trend of conv_overall with MoM diff/% from v_stage_conversion_secured. cohort_mode placeholder per doc 11 §5.6. SECURITY INVOKER.';

-- ----- R-R: rank report -------------------------------------------------------
CREATE OR REPLACE FUNCTION public.build_rank_report(
  p_org_id      uuid,
  p_marketer_id uuid,
  p_from        date,
  p_to          date
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_dist      jsonb;
  v_changes   jsonb;
  v_eligible  bigint := 0;
  v_noteligib bigint := 0;
BEGIN
  IF p_marketer_id IS NULL THEN
    RAISE EXCEPTION 'rank_report requires a subtree root' USING ERRCODE = '22023';
  END IF;

  -- Distribution: count per rank in the subtree (RLS scopes marketers).
  SELECT COALESCE(jsonb_agg(
           jsonb_build_object(
             'rank',         rm.rank,
             'label_it',     rm.label_it,
             'sort_order',   rm.sort_order,
             'count',        d.cnt,
             'crm_eligible', rm.crm_eligible
           ) ORDER BY rm.sort_order
         ), '[]'::jsonb)
    INTO v_dist
  FROM public.ranks_meta rm
  LEFT JOIN (
    SELECT mk.rank, count(*) AS cnt
    FROM public.marketer_tree_closure cl
    JOIN public.marketers mk
      ON mk.id = cl.descendant_id AND mk.deleted_at IS NULL
    WHERE cl.org_id = p_org_id
      AND cl.ancestor_id = p_marketer_id
    GROUP BY mk.rank
  ) d ON d.rank = rm.rank;

  -- CRM-eligibility breakdown.
  SELECT
    COALESCE(sum(CASE WHEN rm.crm_eligible THEN cnt ELSE 0 END), 0),
    COALESCE(sum(CASE WHEN rm.crm_eligible THEN 0 ELSE cnt END), 0)
  INTO v_eligible, v_noteligib
  FROM public.ranks_meta rm
  LEFT JOIN LATERAL (
    SELECT count(*) AS cnt
    FROM public.marketer_tree_closure cl
    JOIN public.marketers mk
      ON mk.id = cl.descendant_id AND mk.deleted_at IS NULL
    WHERE cl.org_id = p_org_id
      AND cl.ancestor_id = p_marketer_id
      AND mk.rank = rm.rank
  ) c ON true;

  -- Rank changes in the window for visible marketers (RLS on rank_history).
  SELECT COALESCE(jsonb_agg(
           jsonb_build_object(
             'marketer_id',   rh.marketer_id,
             'display_name',  mk.display_name,
             'previous_rank', rh.previous_rank,
             'new_rank',      rh.new_rank,
             'changed_at',    rh.changed_at,
             'changed_by',    cb.display_name,
             'notes',         rh.notes
           ) ORDER BY rh.changed_at DESC
         ), '[]'::jsonb)
    INTO v_changes
  FROM public.rank_history rh
  JOIN public.marketer_tree_closure cl
    ON cl.descendant_id = rh.marketer_id
   AND cl.org_id = rh.org_id
   AND cl.ancestor_id = p_marketer_id
  JOIN public.marketers mk ON mk.id = rh.marketer_id
  LEFT JOIN public.marketers cb ON cb.id = rh.changed_by
  WHERE rh.org_id = p_org_id
    AND rh.changed_at >= p_from::timestamptz
    AND rh.changed_at <  (p_to + 1)::timestamptz;

  RETURN jsonb_build_object(
    'distribution', v_dist,
    'crm_eligible_summary', jsonb_build_object(
      'eligible',     v_eligible,
      'not_eligible', v_noteligib
    ),
    'changes', v_changes
  );
END;
$$;

COMMENT ON FUNCTION public.build_rank_report(uuid, uuid, date, date) IS
  'R-R data block (doc 15 §5.2 / §2.5): subtree rank distribution (joined ranks_meta), CRM-eligible vs not summary, and in-window rank_history changes (previous->new, changed_by display_name). SECURITY INVOKER; closure-scoped.';

-- ----- leaderboard_export -----------------------------------------------------
-- Reads leaderboard_snapshots (owned by the leaderboard migration; may not yet
-- exist). Guarded by to_regclass() so this file loads independently and the fn
-- degrades to an empty rowset rather than erroring if the table is absent.
CREATE OR REPLACE FUNCTION public.build_leaderboard_export(
  p_org_id   uuid,
  p_envelope jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_metric  text := p_envelope #>> '{scope,metric}';
  v_scope   text := COALESCE(p_envelope #>> '{scope,kind}', 'org');
  v_ref     uuid := nullif(p_envelope #>> '{scope,marketer_id}', '')::uuid;
  v_branch  text := COALESCE(p_envelope #>> '{scope,branch_side}', 'GLOBAL');
  v_pstart  date := (p_envelope #>> '{period,period_start}')::date;
  v_rows    jsonb := '[]'::jsonb;
BEGIN
  IF to_regclass('public.leaderboard_snapshots') IS NOT NULL THEN
    EXECUTE $q$
      SELECT COALESCE(jsonb_agg(
               jsonb_build_object(
                 'rank_position', ls.rank_position,
                 'marketer_id',   ls.marketer_id,
                 'display_name',  mk.display_name,
                 'rank',          mk.rank,
                 'value',         ls.value
               ) ORDER BY ls.rank_position
             ), '[]'::jsonb)
      FROM public.leaderboard_snapshots ls
      JOIN public.marketers mk ON mk.id = ls.marketer_id
      WHERE ls.org_id = $1
        AND ls.metric = $2::leaderboard_metric
        AND ls.scope  = $3::leaderboard_scope
        AND ls.scope_ref_id IS NOT DISTINCT FROM $4
        AND ls.branch_side  IS NOT DISTINCT FROM $5::branch_side
        AND ls.period_start = $6
    $q$
    INTO v_rows
    USING p_org_id, v_metric, v_scope, v_ref, v_branch, v_pstart;
  END IF;

  RETURN jsonb_build_object(
    'metric',      v_metric,
    'scope',       v_scope,
    'branch_side', v_branch,
    'rows',        v_rows
  );
END;
$$;

COMMENT ON FUNCTION public.build_leaderboard_export(uuid, jsonb) IS
  'leaderboard_export data block (doc 15 §2.6 / §5.2): the ranked rows from leaderboard_snapshots for the selected metric/scope/scope_ref/branch_side/period_start. SECURITY INVOKER (RLS-scoped). Guarded by to_regclass so this file is independent of the leaderboard migration order; returns empty rows if absent.';

-- ----- dispatcher: assemble_report_dataset (doc 15 §4.1) ----------------------
CREATE OR REPLACE FUNCTION public.assemble_report_dataset(p_envelope jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_type       text        := p_envelope ->> 'report_type';
  v_org        uuid        := public.current_org_id();
  v_scope_kind text        := p_envelope #>> '{scope,kind}';
  v_marketer   uuid        := nullif(p_envelope #>> '{scope,marketer_id}', '')::uuid;
  v_branch     branch_side := COALESCE((p_envelope #>> '{scope,branch_side}')::branch_side, 'GLOBAL');
  v_gran       text        := p_envelope #>> '{period,granularity}';
  v_pstart     date        := (p_envelope #>> '{period,period_start}')::date;
  v_pend       date        := nullif(p_envelope #>> '{period,period_end}', '')::date;
  v_hist       int         := COALESCE((p_envelope #>> '{period,history_periods}')::int, 12);
  v_cohort     boolean     := COALESCE((p_envelope #>> '{options,cohort_mode}')::boolean, false);
  v_data       jsonb;
BEGIN
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'no org context' USING ERRCODE = '42501';
  END IF;
  -- CRM-eligibility gate: only CRM-eligible callers (or admins) reach the export.
  IF NOT public.current_can_access_crm() THEN
    RAISE EXCEPTION 'not_crm_eligible' USING ERRCODE = '42501';
  END IF;

  -- Org-scope guard: marketer_id NULL (org root) requires admin/owner.
  IF v_scope_kind = 'org' AND NOT public.is_org_admin() THEN
    RAISE EXCEPTION 'org_report_requires_admin' USING ERRCODE = '42501';
  END IF;
  -- Subtree-visibility guard (defence in depth; RLS is the hard boundary).
  IF v_marketer IS NOT NULL AND NOT public.can_see_marketer(v_marketer) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  -- Derive period_end for snapshot granularities when omitted.
  IF v_pend IS NULL AND v_gran IN ('monthly', 'quarterly') AND v_pstart IS NOT NULL THEN
    SELECT pb.period_end INTO v_pend
    FROM public.period_bounds(v_gran, v_pstart) pb;
  END IF;

  CASE v_type
    WHEN 'team_report' THEN
      v_data := public.build_team_report(v_org, v_marketer, v_branch, v_pstart, v_pend);
    WHEN 'funnel_report' THEN
      v_data := public.build_funnel_report(v_org, v_marketer, v_branch, v_pstart, v_pend);
    WHEN 'conversion_report' THEN
      v_data := public.build_conversion_report(v_org, v_marketer, v_branch, v_pstart, v_pend, v_hist, v_cohort);
    WHEN 'monthly_performance_report' THEN
      v_data := public.build_monthly_performance_report(v_org, v_marketer, v_gran, v_pstart, v_hist);
    WHEN 'rank_report' THEN
      v_data := public.build_rank_report(v_org, v_marketer, v_pstart, v_pend);
    WHEN 'leaderboard_export' THEN
      v_data := public.build_leaderboard_export(v_org, p_envelope);
    ELSE
      RAISE EXCEPTION 'invalid_report_request' USING ERRCODE = '22023';
  END CASE;

  RETURN jsonb_build_object(
    'dataset_version', 1,
    'report_type',     v_type,
    'org', jsonb_build_object(
      'id',     v_org,
      'name',   (SELECT name FROM public.organizations WHERE id = v_org),
      'locale', COALESCE(p_envelope #>> '{options,locale}', 'it')
    ),
    'scope',        p_envelope -> 'scope',
    'period',       jsonb_build_object('granularity', v_gran, 'start', v_pstart, 'end', v_pend),
    'generated_at', now(),
    'data',         v_data
  );
END;
$$;

COMMENT ON FUNCTION public.assemble_report_dataset(jsonb) IS
  'Report Dataset assembler (doc 15 §4.1, §5): dispatches on report_type to the build_* helpers and returns the versioned dataset jsonb the Edge renderer consumes. SECURITY INVOKER so closure RLS scopes every read; enforces not_crm_eligible / org_report_requires_admin / forbidden / invalid_report_request guards.';

-- =============================================================================
-- 9. estimate_export_rows() — cheap sync/async pre-flight (doc 15 §11.1).
--    RLS-scoped (SECURITY INVOKER). Estimates the primary-table row count for the
--    artifact; the Edge classifier compares it to the sync threshold (~5000).
-- =============================================================================
CREATE OR REPLACE FUNCTION public.estimate_export_rows(p_envelope jsonb)
RETURNS bigint
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_type     text   := p_envelope ->> 'report_type';
  v_org      uuid   := public.current_org_id();
  v_marketer uuid   := COALESCE(nullif(p_envelope #>> '{scope,marketer_id}', '')::uuid,
                                public.current_marketer_id());
  v_data_tbl text   := COALESCE(p_envelope #>> '{options,data_export_table}', 'prospects');
  v_n        bigint := 0;
BEGIN
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'no org context' USING ERRCODE = '42501';
  END IF;

  -- Aggregate reports are always small (a handful of rows) -> sync.
  IF v_type IN ('team_report','funnel_report','conversion_report',
                'monthly_performance_report','rank_report','leaderboard_export') THEN
    RETURN 0;
  END IF;

  -- data_export: count VISIBLE rows of the chosen list table in scope. RLS on the
  -- underlying tables scopes the count to the caller's subtree automatically.
  IF v_data_tbl = 'prospects' THEN
    SELECT count(*) INTO v_n
    FROM public.prospects p
    JOIN public.marketer_tree_closure cl
      ON cl.descendant_id = p.owner_marketer_id AND cl.org_id = p.org_id
    WHERE p.org_id = v_org AND cl.ancestor_id = v_marketer
      AND p.deleted_at IS NULL;
  ELSIF v_data_tbl = 'contacts' THEN
    SELECT count(*) INTO v_n
    FROM public.contacts c
    JOIN public.marketer_tree_closure cl
      ON cl.descendant_id = c.owner_marketer_id AND cl.org_id = c.org_id
    WHERE c.org_id = v_org AND cl.ancestor_id = v_marketer
      AND c.deleted_at IS NULL;
  ELSIF v_data_tbl = 'calls' THEN
    SELECT count(*) INTO v_n
    FROM public.calls k
    JOIN public.marketer_tree_closure cl
      ON cl.descendant_id = k.marketer_id AND cl.org_id = k.org_id
    WHERE k.org_id = v_org AND cl.ancestor_id = v_marketer;
  ELSE
    v_n := 0;
  END IF;

  RETURN v_n;
END;
$$;

COMMENT ON FUNCTION public.estimate_export_rows(jsonb) IS
  'Cheap RLS-scoped row estimate for sync/async export classification (doc 15 §11.1). Aggregate reports return 0 (always sync). data_export counts visible rows of the chosen list table (prospects|contacts|calls) in the caller''s subtree. SECURITY INVOKER.';

-- =============================================================================
-- 10. enqueue_export_job() — create an async report_export_jobs row (doc 15
--     §11.2 / §13.1). Runs under the caller's JWT, re-validates visibility, then
--     freezes scope/params. Dedupe handled by the partial unique index (a
--     duplicate click returns the existing in-flight job id).
-- =============================================================================
CREATE OR REPLACE FUNCTION public.enqueue_export_job(
  p_report_type text,
  p_format      export_format,
  p_scope       jsonb,
  p_params      jsonb,
  p_row_count   bigint DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_org      uuid := public.current_org_id();
  v_me       uuid := public.current_marketer_id();
  v_marketer uuid := nullif(p_scope #>> '{marketer_id}', '')::uuid;
  v_id       uuid;
BEGIN
  IF v_org IS NULL OR v_me IS NULL THEN
    RAISE EXCEPTION 'no caller context' USING ERRCODE = '42501';
  END IF;
  IF NOT public.current_membership_active() THEN
    RAISE EXCEPTION 'membership inactive' USING ERRCODE = '42501';
  END IF;
  IF NOT public.current_can_access_crm() THEN
    RAISE EXCEPTION 'not_crm_eligible' USING ERRCODE = '42501';
  END IF;
  -- Freeze-time visibility check (the worker re-validates again before render).
  IF COALESCE(p_scope #>> '{kind}', 'team') = 'org' AND NOT public.is_org_admin() THEN
    RAISE EXCEPTION 'org_report_requires_admin' USING ERRCODE = '42501';
  END IF;
  IF v_marketer IS NOT NULL AND NOT public.can_see_marketer(v_marketer) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.report_export_jobs (
    org_id, requested_by, report_type, format, scope, params, status, row_count
  ) VALUES (
    v_org, v_me, p_report_type, p_format, p_scope, p_params, 'queued', p_row_count
  )
  -- Dedupe: a second identical in-flight click hits the partial unique index;
  -- DO NOTHING then SELECT returns the existing job id.
  ON CONFLICT (org_id, requested_by, report_type, format, md5(scope::text || params::text))
    WHERE status IN ('queued', 'rendering')
  DO NOTHING
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    SELECT id INTO v_id
    FROM public.report_export_jobs
    WHERE org_id = v_org
      AND requested_by = v_me
      AND report_type = p_report_type
      AND format = p_format
      AND md5(scope::text || params::text) = md5(p_scope::text || p_params::text)
      AND status IN ('queued', 'rendering')
    LIMIT 1;
  END IF;

  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION public.enqueue_export_job(text, export_format, jsonb, jsonb, bigint) IS
  'Create an async report_export_jobs row (doc 15 §11.2). Caller-JWT visibility re-check (not_crm_eligible / org_report_requires_admin / forbidden), then freezes scope/params. Duplicate in-flight clicks dedupe via the partial unique index and return the existing job id. SECURITY INVOKER.';

-- =============================================================================
-- 11. audit_report_export() — one immutable audit row per export/download
--     (doc 15 §12.4). SECURITY DEFINER; writes via the audit_log table directly
--     (log_audit only accepts a fixed action set; here we pass a dynamic
--     report.* action). Reads the caller context from the JWT.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.audit_report_export(
  p_action text,                        -- 'export' | 'download'
  p_type   text,
  p_scope  jsonb,
  p_period jsonb,
  p_format text,
  p_path   text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org    uuid := public.current_org_id();
  v_action audit_action;
BEGIN
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'no org context' USING ERRCODE = '42501';
  END IF;
  v_action := CASE p_action
                WHEN 'download' THEN 'report.download'::audit_action
                ELSE 'report.export'::audit_action
              END;

  INSERT INTO public.audit_log (
    org_id, actor_marketer_id, actor_user_id, action, entity_type, entity_id, after
  ) VALUES (
    v_org, public.current_marketer_id(), auth.uid(), v_action, 'report', NULL,
    jsonb_build_object(
      'report_type', p_type,
      'scope',       p_scope,
      'period',      p_period,
      'format',      p_format,
      'path',        p_path
    )
  );
END;
$$;

COMMENT ON FUNCTION public.audit_report_export(text, text, jsonb, jsonb, text, text) IS
  'Write one immutable audit_log row per export (report.export) or download (report.download) (doc 15 §12.4). SECURITY DEFINER; records actor, report_type, scope, period, format, path. Called by the Edge Function after a successful render / signed-URL issuance.';

-- =============================================================================
-- 12. Cron job BODIES (doc 15 §8.2, §11.4, §14). pg_cron is NOT enabled in this
--     migration set (0001 defers it to the scheduling migration); we ship the
--     functions and document the cron.schedule() registration as comments. All
--     are idempotent (existence-guarded / status-claimed).
-- =============================================================================

-- 12.1 dispatch_due_monthly_reports(): hourly. Fire generate_monthly_reports for
--      any org whose LOCAL time is the 1st @ 02:00 and not yet generated for the
--      just-closed month. SECURITY DEFINER (org-wide).
CREATE OR REPLACE FUNCTION public.dispatch_due_monthly_reports()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r       record;
  n       int := 0;
  v_local timestamptz;
  v_pstart date;
BEGIN
  FOR r IN
    SELECT id, COALESCE(timezone, 'Europe/Rome') AS tz
    FROM public.organizations
    WHERE deleted_at IS NULL
  LOOP
    v_local := now() AT TIME ZONE r.tz;
    IF extract(day FROM v_local) = 1 AND extract(hour FROM v_local) = 2 THEN
      v_pstart := date_trunc('month', (v_local::date - 1))::date;   -- month just closed
      IF NOT EXISTS (
        SELECT 1 FROM public.monthly_reports
        WHERE org_id = r.id AND period = 'monthly' AND period_start = v_pstart
      ) THEN
        PERFORM public.generate_monthly_reports(r.id, v_pstart, 'monthly');
        n := n + 1;
      END IF;
    END IF;
  END LOOP;
  RETURN n;
END;
$$;

COMMENT ON FUNCTION public.dispatch_due_monthly_reports() IS
  'Hourly dispatcher (doc 15 §8.2): for every org at org-local 1st-of-month 02:00 with no monthly_reports row yet for the just-closed month, runs generate_monthly_reports(). Idempotent (existence-guarded upsert). pg_cron registration lives in the scheduling migration.';

-- 12.2 dispatch_due_quarterly_reports(): hourly, quarter-firsts @ 02:30.
CREATE OR REPLACE FUNCTION public.dispatch_due_quarterly_reports()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r        record;
  n        int := 0;
  v_local  timestamptz;
  v_qstart date;
BEGIN
  FOR r IN
    SELECT id, COALESCE(timezone, 'Europe/Rome') AS tz
    FROM public.organizations
    WHERE deleted_at IS NULL
  LOOP
    v_local := now() AT TIME ZONE r.tz;
    -- First day of a quarter, ~02:30 local.
    IF v_local::date = date_trunc('quarter', v_local)::date
       AND extract(hour FROM v_local) = 2 THEN
      -- The quarter that just closed = the quarter containing yesterday.
      v_qstart := date_trunc('quarter', (v_local::date - 1))::date;
      IF NOT EXISTS (
        SELECT 1 FROM public.monthly_reports
        WHERE org_id = r.id AND period = 'quarterly' AND period_start = v_qstart
      ) THEN
        PERFORM public.generate_monthly_reports(r.id, v_qstart, 'quarterly');
        n := n + 1;
      END IF;
    END IF;
  END LOOP;
  RETURN n;
END;
$$;

COMMENT ON FUNCTION public.dispatch_due_quarterly_reports() IS
  'Hourly dispatcher for quarterly reports (doc 15 §8.6): same as the monthly dispatcher but on quarter-firsts, period=quarterly. Idempotent.';

-- 12.3 drain_export_jobs(): claim queued jobs with FOR UPDATE SKIP LOCKED, flip
--      them to 'rendering', and return their ids so the cron wrapper can fire the
--      Edge Function (net.http_post) per id. SECURITY DEFINER.
CREATE OR REPLACE FUNCTION public.drain_export_jobs(p_limit int DEFAULT 20)
RETURNS SETOF uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH claimed AS (
    SELECT j.id
    FROM public.report_export_jobs j
    WHERE j.status = 'queued'
    ORDER BY j.created_at
    FOR UPDATE SKIP LOCKED
    LIMIT GREATEST(p_limit, 1)
  )
  UPDATE public.report_export_jobs u
  SET status     = 'rendering',
      claimed_at = now(),
      started_at = now(),
      attempts   = u.attempts + 1
  FROM claimed
  WHERE u.id = claimed.id
  RETURNING u.id;
END;
$$;

COMMENT ON FUNCTION public.drain_export_jobs(int) IS
  'Worker claim (doc 15 §11.4): atomically claims up to p_limit queued report_export_jobs (FOR UPDATE SKIP LOCKED), flips them to rendering (claimed_at/started_at/attempts++), and returns their ids. The scheduling migration''s 1-min cron fires generate-report-export per id via net.http_post. SECURITY DEFINER.';

-- 12.4 purge_export_artifacts(): nightly. Mark ready jobs past their TTL as
--      'expired' (the Storage object purge is done by the cron wrapper / Edge).
CREATE OR REPLACE FUNCTION public.purge_export_artifacts()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_n int;
BEGIN
  UPDATE public.report_export_jobs
  SET status = 'expired'
  WHERE status = 'ready'
    AND expires_at IS NOT NULL
    AND expires_at < now();
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$$;

COMMENT ON FUNCTION public.purge_export_artifacts() IS
  'Nightly TTL purge (doc 15 §9.2 / §14): flips ready report_export_jobs past expires_at to expired. The matching Storage object deletion is performed by the cron wrapper / Edge (Storage is not reachable from SQL). Idempotent.';

-- =============================================================================
-- 13. Row-Level Security.
-- =============================================================================

-- ----- monthly_reports: org + subtree visibility of marketer_id (org row ->
--       admins). System-written only: no INSERT/UPDATE/DELETE policy for
--       authenticated (writes flow through the SECURITY DEFINER generators or the
--       service role). Reads are subtree-scoped exactly like the fact tables.
ALTER TABLE public.monthly_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.monthly_reports FORCE  ROW LEVEL SECURITY;

CREATE POLICY monthly_reports_select ON public.monthly_reports
FOR SELECT TO authenticated
USING (
  org_id = public.current_org_id()
  AND (
        -- org-level roll-up row: admins/owners/platform only.
        (marketer_id IS NULL AND public.is_org_admin())
        -- subject row: visible iff the caller can see that marketer (subtree).
     OR (marketer_id IS NOT NULL AND public.can_see_marketer(marketer_id))
  )
);

COMMENT ON POLICY monthly_reports_select ON public.monthly_reports IS
  'Read: own + downline subjects (can_see_marketer); org roll-up (marketer_id NULL) to admins/owners/platform only (doc 01 §8 / doc 15 §9.1). No write policy: snapshots are system-written (DEFINER generators / service role).';

-- ----- report_export_jobs: own jobs (requested_by) + admin org-wide. Members
--       INSERT only via enqueue_export_job (which re-validates); a direct INSERT
--       is allowed but constrained to the caller's own marketer + active
--       membership. UPDATE/DELETE of job state is system/admin (the worker uses
--       the service role); a member may not mutate a job row's lifecycle.
ALTER TABLE public.report_export_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_export_jobs FORCE  ROW LEVEL SECURITY;

CREATE POLICY report_export_jobs_select ON public.report_export_jobs
FOR SELECT TO authenticated
USING (
  org_id = public.current_org_id()
  AND (
        public.is_org_admin()
     OR requested_by = public.current_marketer_id()
  )
);

CREATE POLICY report_export_jobs_insert ON public.report_export_jobs
FOR INSERT TO authenticated
WITH CHECK (
  org_id = public.current_org_id()
  AND public.current_membership_active()
  AND requested_by = public.current_marketer_id()
);

-- Members/admins may cancel/dismiss their own (admin: org) jobs; the WITH CHECK
-- keeps the row tenant-scoped and owned. The rendering worker runs as the service
-- role (bypasses RLS) and performs the queued->rendering->ready/failed writes.
CREATE POLICY report_export_jobs_update ON public.report_export_jobs
FOR UPDATE TO authenticated
USING (
  org_id = public.current_org_id()
  AND (
        public.is_org_admin()
     OR requested_by = public.current_marketer_id()
  )
)
WITH CHECK (
  org_id = public.current_org_id()
  AND (
        public.is_org_admin()
     OR requested_by = public.current_marketer_id()
  )
);

CREATE POLICY report_export_jobs_delete ON public.report_export_jobs
FOR DELETE TO authenticated
USING (
  org_id = public.current_org_id()
  AND (
        public.is_org_admin()
     OR requested_by = public.current_marketer_id()
  )
);

COMMENT ON POLICY report_export_jobs_select ON public.report_export_jobs IS
  'Read: own jobs (requested_by = current_marketer_id) + admin/owner/platform org-wide (doc 15 §11.2). The rendering worker reads via the service role (bypasses RLS).';

-- =============================================================================
-- 14. Grants (least-privilege, doc 10 §4.2). RLS narrows further. The service
--     role (cron/Edge worker) bypasses RLS and needs no table grant here.
-- =============================================================================

-- Tables.
GRANT SELECT                          ON public.monthly_reports     TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE  ON public.report_export_jobs  TO authenticated;

-- Pure jsonb / period helpers: safe for everyone (no data access).
GRANT EXECUTE ON FUNCTION public.jsonb_delta(jsonb, jsonb)        TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.jsonb_delta_pct(jsonb, jsonb)    TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.period_bounds(text, date)        TO authenticated, service_role;

-- Assembly + estimation + enqueue + audit: callable by authenticated (RLS-scoped
-- or self-guarded). audit_report_export also by service_role (the Edge worker).
GRANT EXECUTE ON FUNCTION public.assemble_report_dataset(jsonb)                                        TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.estimate_export_rows(jsonb)                                           TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.enqueue_export_job(text, export_format, jsonb, jsonb, bigint)         TO authenticated;
GRANT EXECUTE ON FUNCTION public.audit_report_export(text, text, jsonb, jsonb, text, text)             TO authenticated, service_role;

-- Single-subject on-demand (re)generate: authenticated (caller-JWT guarded).
GRANT EXECUTE ON FUNCTION public.generate_monthly_report(uuid, date, report_period)                    TO authenticated;

-- The build_* helpers are called internally by assemble_report_dataset, but are
-- also independently callable by the in-app viewer (RLS-scoped). Grant to
-- authenticated; deny PUBLIC.
GRANT EXECUTE ON FUNCTION public.build_team_report(uuid, uuid, branch_side, date, date)                        TO authenticated;
GRANT EXECUTE ON FUNCTION public.build_funnel_report(uuid, uuid, branch_side, date, date)                     TO authenticated;
GRANT EXECUTE ON FUNCTION public.build_conversion_report(uuid, uuid, branch_side, date, date, int, boolean)   TO authenticated;
GRANT EXECUTE ON FUNCTION public.build_monthly_performance_report(uuid, uuid, text, date, int)                TO authenticated;
GRANT EXECUTE ON FUNCTION public.build_rank_report(uuid, uuid, date, date)                                    TO authenticated;
GRANT EXECUTE ON FUNCTION public.build_leaderboard_export(uuid, jsonb)                                        TO authenticated;

-- System-only functions: generators, the DEFINER fact read, and the cron bodies.
-- Revoke from PUBLIC; grant EXECUTE only to service_role (cron/Edge principal).
REVOKE ALL ON FUNCTION public.generate_monthly_reports(uuid, date, report_period)   FROM PUBLIC;
REVOKE ALL ON FUNCTION public.report_metrics_direct(uuid, uuid, date, date)         FROM PUBLIC;
REVOKE ALL ON FUNCTION public.dispatch_due_monthly_reports()                        FROM PUBLIC;
REVOKE ALL ON FUNCTION public.dispatch_due_quarterly_reports()                      FROM PUBLIC;
REVOKE ALL ON FUNCTION public.drain_export_jobs(int)                                FROM PUBLIC;
REVOKE ALL ON FUNCTION public.purge_export_artifacts()                              FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.generate_monthly_reports(uuid, date, report_period) TO service_role;
GRANT EXECUTE ON FUNCTION public.report_metrics_direct(uuid, uuid, date, date)       TO service_role;
GRANT EXECUTE ON FUNCTION public.dispatch_due_monthly_reports()                      TO service_role;
GRANT EXECUTE ON FUNCTION public.dispatch_due_quarterly_reports()                    TO service_role;
GRANT EXECUTE ON FUNCTION public.drain_export_jobs(int)                              TO service_role;
GRANT EXECUTE ON FUNCTION public.purge_export_artifacts()                            TO service_role;

-- =============================================================================
-- 15. pg_cron registration (DEFERRED — enabled by the scheduling migration).
--     Reproduced here as documentation of the intended schedule (doc 15 §14).
--     DO NOT uncomment until pg_cron is provisioned (0001 defers it).
-- -----------------------------------------------------------------------------
--   SELECT cron.schedule('dispatch_monthly_reports',  '0 * * * *',
--                        $$SELECT public.dispatch_due_monthly_reports();$$);
--   SELECT cron.schedule('dispatch_quarterly_reports','0 * * * *',
--                        $$SELECT public.dispatch_due_quarterly_reports();$$);
--   SELECT cron.schedule('drain_export_jobs',         '* * * * *',
--                        $$SELECT public.drain_export_jobs();$$);   -- + net.http_post per id
--   SELECT cron.schedule('purge_export_artifacts',    '0 4 * * *',
--                        $$SELECT public.purge_export_artifacts();$$);
-- =============================================================================
