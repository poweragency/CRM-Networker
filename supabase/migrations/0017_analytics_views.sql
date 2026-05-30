-- =============================================================================
-- File 0017 — Analytics materialized views (funnel totals & stage conversion)
-- Purpose: GROUP 6 (doc 01 §6.2/§6.3, doc 11 §5 & §8 & §15) — the two HOT
--          materialized views that back the performance-analytics and
--          conversion-analytics surfaces, refreshed CONCURRENTLY, plus the
--          RLS-safe access layer over them (MVs cannot enforce RLS on their
--          own — doc 11 §15.2).
--
--          Objects created here:
--            * prospect_stage_order(prospect_stage) -> int  (doc 11 §5.1)
--                IMMUTABLE ladder-position helper so SQL never hard-codes the
--                stage order; used by the conversion read functions.
--            * MATERIALIZED VIEW public.mv_funnel_totals  (doc 01 §6.2)
--                grain (org_id, marketer_id, current_stage, outcome) with
--                prospects_count + enrolled_count; current-occupancy snapshot.
--            * MATERIALIZED VIEW public.mv_stage_conversion (doc 01 §6.3)
--                grain (org_id, marketer_id, period_month, to_stage) with
--                entered_count + exited_count + avg_time_in_stage_secs.
--            * UNIQUE indexes mv_funnel_totals_uq / mv_stage_conversion_uq
--                — REQUIRED for REFRESH MATERIALIZED VIEW ... CONCURRENTLY.
--            * supporting non-unique indexes for the closure-joined reads.
--            * refresh_funnel_mvs()        — refresh both MVs CONCURRENTLY
--                (the pg_cron 15-min job target, doc 11 §8 / §16).
--            * refresh_funnel_analytics(uuid) — DEBOUNCED on-demand wrapper
--                (advisory lock + last-refreshed guard) for post-bulk-op hooks
--                (doc 11 §8.4).
--            * RLS-safe wrapper VIEWS over each MV (doc 11 §15.2):
--                v_funnel_totals_secured / v_stage_conversion_secured —
--                tenant + can_see_marketer() filtered; these (NOT the MVs) are
--                what authenticated callers read.
--            * SECURITY DEFINER closure-scoped read functions for the
--                genealogy node card / subtree dashboards:
--                funnel_totals_subtree(uuid,uuid)  and
--                stage_conversion_subtree(uuid,uuid,date,date) — each
--                re-applies tenant + can_see_marketer(root) before reading the
--                MV, so the MV is never an end-user-reachable leak.
--            * privilege lockdown: REVOKE all on the MVs from app roles; GRANT
--                SELECT only on the secured views; GRANT EXECUTE on the read
--                functions to authenticated; refresh functions to service_role.
--
-- Depends on: 0001_extensions.sql        (pgcrypto, app_private schema)
--             0002_enums.sql             (prospect_stage, prospect_outcome,
--                                         placement_leg, branch_side)
--             0003_tenancy_identity.sql  (organizations)
--             0004_marketers_tree.sql    (marketers, marketer_tree_closure)
--             0005_auth_visibility.sql   (current_org_id, current_marketer_id,
--                                         can_see_marketer, is_org_admin,
--                                         is_platform_admin)
--             0012_prospects_journey.sql (prospects, prospect_journey_events —
--                                         the SOURCE tables both MVs aggregate)
--
-- SCOPE NOTE (ownership boundary, see manifest `issues`):
--   * This migration owns the two MVs + their refresh/RLS layer ONLY. The
--     base fact table public.daily_marketer_metrics, the ADR-006 queue
--     app_private.dirty_metric_days, the enqueue triggers, and the
--     org_local_date()/org_day_bounds()/recompute_daily_marketer_metric()/
--     drain_dirty_metric_days() helpers (doc 11 §2) belong to the SEPARATE
--     fact-layer migration (0016). 0017 deliberately reads ONLY from prospects
--     and prospect_journey_events (created in 0012), so it has NO forward
--     dependency and runs clean in filename order. Both MVs in doc 01 §6.2/§6.3
--     are defined over prospects / prospect_journey_events, not over the fact
--     table, so this split is exact to the canonical schema.
--   * pg_cron scheduling itself is NOT created here (pg_cron is provisioned and
--     guarded in the later scheduling migration). refresh_funnel_mvs() is the
--     callable target that the scheduling migration's cron entry invokes.
--
-- CANONICAL-NAMES NOTE:
--   MV column lists, the GROUP BY grain, and the UNIQUE index columns are taken
--   VERBATIM from doc 01 §6.2/§6.3. mv_stage_conversion buckets period_month on
--   date_trunc('month', entered_at)::date exactly as the canonical definition.
-- =============================================================================

-- =============================================================================
-- prospect_stage_order() — ordered ladder position (doc 11 §5.1).
-- IMMUTABLE so SQL never hard-codes the 6-stage sequence; the conversion read
-- functions use it to drive consecutive-stage ratios in canonical order.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.prospect_stage_order(s prospect_stage)
RETURNS int
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE s
    WHEN 'conoscitiva'   THEN 1
    WHEN 'business_info' THEN 2
    WHEN 'follow_up'     THEN 3
    WHEN 'closing'       THEN 4
    WHEN 'check_soldi'   THEN 5
    WHEN 'iscrizione'    THEN 6
  END;
$$;

COMMENT ON FUNCTION public.prospect_stage_order(prospect_stage) IS
  'Canonical 1..6 ladder position of a prospect_stage (doc 11 §5.1): conoscitiva=1 .. iscrizione=6. IMMUTABLE; used to order consecutive-stage conversion ratios without hard-coding the enum sequence.';

-- =============================================================================
-- mv_funnel_totals — current funnel OCCUPANCY per marketer (doc 01 §6.2).
-- Grain: (org_id, marketer_id, current_stage, outcome). One row per distinct
-- combination present in the (non-deleted) prospects table. prospects_count is
-- the occupancy; enrolled_count is the enrolled subset (state enrollments, doc
-- 11 §3.2). This is a STATE snapshot, not throughput — additive across
-- marketers via the closure join, NOT across time.
--
-- Built directly from public.prospects (0012). REFRESHed CONCURRENTLY on the
-- 15-min cron + on-demand after bulk stage changes (doc 11 §8).
-- =============================================================================
CREATE MATERIALIZED VIEW public.mv_funnel_totals AS
SELECT
  p.org_id,
  p.owner_marketer_id                            AS marketer_id,
  p.current_stage,
  p.outcome,
  count(*)                                       AS prospects_count,
  count(*) FILTER (WHERE p.outcome = 'enrolled') AS enrolled_count
FROM public.prospects p
WHERE p.deleted_at IS NULL
GROUP BY p.org_id, p.owner_marketer_id, p.current_stage, p.outcome
WITH NO DATA;

COMMENT ON MATERIALIZED VIEW public.mv_funnel_totals IS
  'Current funnel occupancy per marketer (doc 01 §6.2): one row per (org_id, marketer_id, current_stage, outcome) over non-deleted prospects. prospects_count = occupancy; enrolled_count = enrolled subset. STATE snapshot (not throughput). Refreshed CONCURRENTLY every ~15 min. NEVER read directly by end users — read via v_funnel_totals_secured or funnel_totals_subtree() which apply RLS (doc 11 §15.2).';

-- UNIQUE index — MANDATORY for REFRESH MATERIALIZED VIEW ... CONCURRENTLY, and
-- the lookup key for the secured read path. Matches doc 01 §6.2 exactly.
CREATE UNIQUE INDEX mv_funnel_totals_uq
  ON public.mv_funnel_totals (org_id, marketer_id, current_stage, outcome);

COMMENT ON INDEX public.mv_funnel_totals_uq IS
  'doc 01 §6.2 UNIQUE key (org_id, marketer_id, current_stage, outcome). Enables REFRESH MATERIALIZED VIEW CONCURRENTLY and serves the secured lookup (its (org_id, marketer_id) prefix resolves the closure-joined subtree probe in funnel_totals_subtree()).';

-- =============================================================================
-- mv_stage_conversion — stage-entry counts & avg time-in-stage, per marketer
-- per month (doc 01 §6.3). Grain: (org_id, marketer_id, period_month,
-- to_stage). Built from public.prospect_journey_events (0012):
--   entered_count          = events entering to_stage in that month
--   exited_count           = of those, how many have already exited
--   avg_time_in_stage_secs = mean completed time-in-stage (NULLs excluded)
-- This is the backbone of conversion analytics, trends, MoM, and the
-- stage_delay bottleneck rule (doc 11 §5 / §10).
-- =============================================================================
CREATE MATERIALIZED VIEW public.mv_stage_conversion AS
SELECT
  e.org_id,
  e.responsible_marketer_id                                       AS marketer_id,
  date_trunc('month', e.entered_at)::date                         AS period_month,
  e.to_stage,
  count(*)                                                        AS entered_count,
  count(*) FILTER (WHERE e.exited_at IS NOT NULL)                 AS exited_count,
  avg(e.time_in_stage_secs) FILTER (WHERE e.time_in_stage_secs IS NOT NULL)
                                                                  AS avg_time_in_stage_secs
FROM public.prospect_journey_events e
GROUP BY e.org_id, e.responsible_marketer_id, date_trunc('month', e.entered_at), e.to_stage
WITH NO DATA;

COMMENT ON MATERIALIZED VIEW public.mv_stage_conversion IS
  'Per-marketer per-month stage-entry analytics (doc 01 §6.3): one row per (org_id, marketer_id, period_month, to_stage) over prospect_journey_events. entered_count = entries into to_stage that month; exited_count = of those, already exited; avg_time_in_stage_secs = mean completed time-in-stage. Backs conversion %, trends/MoM, and the stage_delay bottleneck rule. Refreshed CONCURRENTLY every ~15 min. NEVER read directly by end users — read via v_stage_conversion_secured or stage_conversion_subtree() (doc 11 §15.2).';

-- UNIQUE index — MANDATORY for REFRESH ... CONCURRENTLY. Matches doc 01 §6.3.
CREATE UNIQUE INDEX mv_stage_conversion_uq
  ON public.mv_stage_conversion (org_id, marketer_id, period_month, to_stage);

COMMENT ON INDEX public.mv_stage_conversion_uq IS
  'doc 01 §6.3 UNIQUE key (org_id, marketer_id, period_month, to_stage). Enables REFRESH MATERIALIZED VIEW CONCURRENTLY and serves the secured/period-sliced lookup (its (org_id, marketer_id, period_month) prefix resolves the closure-joined subtree + month-window probe in stage_conversion_subtree()).';

-- =============================================================================
-- Initial population. CREATE ... WITH NO DATA leaves the MVs unscannable until
-- first refreshed; the very first refresh CANNOT be CONCURRENTLY (the unique
-- index has nothing to diff against), so we do a plain blocking refresh here.
-- On a clean `supabase db reset` the source tables are empty, so this is O(0).
-- Subsequent refreshes (cron / on-demand) use CONCURRENTLY via refresh_funnel_mvs().
-- =============================================================================
REFRESH MATERIALIZED VIEW public.mv_funnel_totals;
REFRESH MATERIALIZED VIEW public.mv_stage_conversion;

-- =============================================================================
-- refresh_funnel_mvs() — refresh BOTH analytics MVs CONCURRENTLY.
-- The target of the pg_cron 15-min job (doc 11 §8 / §16). CONCURRENTLY keeps
-- the MVs readable during refresh (no AccessExclusive lock) — safe because both
-- carry the required UNIQUE index. SECURITY DEFINER so the scheduler/service
-- role can run it regardless of MV ownership; sets a safe search_path.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.refresh_funnel_mvs()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_funnel_totals;
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_stage_conversion;
END;
$$;

COMMENT ON FUNCTION public.refresh_funnel_mvs() IS
  'Refresh both analytics MVs (mv_funnel_totals, mv_stage_conversion) CONCURRENTLY. Target of the pg_cron refresh_funnel_mvs job (every ~15 min, doc 11 §16). SECURITY DEFINER; CONCURRENTLY requires the UNIQUE index on each MV.';

-- =============================================================================
-- refresh_funnel_analytics(p_org_id) — DEBOUNCED on-demand wrapper (doc 11 §8.4).
-- Called by Edge Functions after bulk operations (bulk stage change, CSV import,
-- placement move). Debounce strategy:
--   * pg_try_advisory_xact_lock() on a fixed key: if another refresh is already
--     in flight, this call returns false WITHOUT piling up a second refresh.
-- The MVs are org-wide (a CONCURRENTLY refresh recomputes all orgs in one pass),
-- so p_org_id is accepted for API symmetry / future per-org partitioning but the
-- refresh itself is global. Returns true if THIS call performed the refresh,
-- false if it was debounced (another refresh held the lock).
-- =============================================================================
CREATE OR REPLACE FUNCTION public.refresh_funnel_analytics(p_org_id uuid DEFAULT NULL)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  -- Fixed advisory-lock key for the analytics-refresh critical section.
  v_lock_key constant bigint := hashtext('refresh_funnel_analytics');
BEGIN
  -- Transaction-scoped try-lock: auto-released at COMMIT/ROLLBACK; a concurrent
  -- caller that fails to acquire simply skips (debounce), never blocks.
  IF NOT pg_try_advisory_xact_lock(v_lock_key) THEN
    RETURN false;
  END IF;

  PERFORM public.refresh_funnel_mvs();
  RETURN true;
END;
$$;

COMMENT ON FUNCTION public.refresh_funnel_analytics(uuid) IS
  'Debounced on-demand refresh of the analytics MVs (doc 11 §8.4). Uses pg_try_advisory_xact_lock to coalesce a burst of bulk-op triggers into at most one in-flight refresh; returns false when debounced. p_org_id is accepted for API symmetry but the CONCURRENTLY refresh is org-wide. SECURITY DEFINER.';

-- =============================================================================
-- RLS-SAFE WRAPPER VIEWS (doc 11 §15.2).
-- Materialized views do NOT enforce RLS. End users therefore NEVER select the
-- MVs directly: they read these views, which re-apply the tenant predicate
-- (org_id = current_org_id()) AND the single visibility primitive
-- can_see_marketer(marketer_id). can_see_marketer() is SECURITY DEFINER and
-- already short-circuits for admin/owner/platform (whole-org visibility) and
-- re-applies the tenant filter internally, so these views inherit the exact
-- closure-subtree semantics of every base-table read policy.
--
-- security_invoker=true (PG15) makes the view evaluate can_see_marketer() and
-- current_org_id() as the CALLING user — essential, otherwise the predicate
-- would resolve against the view owner's (empty) JWT and leak nothing OR
-- everything. With security_invoker the JWT accessors read the caller's claims.
-- =============================================================================
CREATE VIEW public.v_funnel_totals_secured
WITH (security_invoker = true) AS
  SELECT f.org_id,
         f.marketer_id,
         f.current_stage,
         f.outcome,
         f.prospects_count,
         f.enrolled_count
  FROM public.mv_funnel_totals f
  WHERE f.org_id = public.current_org_id()
    AND public.can_see_marketer(f.marketer_id);

COMMENT ON VIEW public.v_funnel_totals_secured IS
  'RLS-safe read surface over mv_funnel_totals (doc 11 §15.2). security_invoker view: filters to the caller''s org and to marketers the caller can_see_marketer() (subtree; admins/owners/platform see the whole org). Authenticated callers are granted SELECT on THIS view, never on the MV.';

CREATE VIEW public.v_stage_conversion_secured
WITH (security_invoker = true) AS
  SELECT s.org_id,
         s.marketer_id,
         s.period_month,
         s.to_stage,
         s.entered_count,
         s.exited_count,
         s.avg_time_in_stage_secs
  FROM public.mv_stage_conversion s
  WHERE s.org_id = public.current_org_id()
    AND public.can_see_marketer(s.marketer_id);

COMMENT ON VIEW public.v_stage_conversion_secured IS
  'RLS-safe read surface over mv_stage_conversion (doc 11 §15.2). security_invoker view: filters to the caller''s org and to marketers the caller can_see_marketer(). Slice by period_month for trend/MoM. Authenticated callers are granted SELECT on THIS view, never on the MV.';

-- =============================================================================
-- funnel_totals_subtree() — closure-scoped current funnel for a node's SUBTREE.
-- The genealogy node card / profile funnel call this with a subtree root: it
-- returns the aggregated current occupancy across the root + its whole downline
-- (depth >= 0). SECURITY DEFINER so it can read the MV (which app roles cannot)
-- AND the closure, but it RE-VALIDATES authority first: caller must be in the
-- same org and can_see_marketer(root). It then restricts the MV scan to the
-- root's closure descendants, so it can never return rows outside the caller's
-- visible subtree even though it runs as definer.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.funnel_totals_subtree(
  p_org_id uuid,
  p_root_marketer_id uuid
)
RETURNS TABLE(
  current_stage   prospect_stage,
  outcome         prospect_outcome,
  prospects_count bigint,
  enrolled_count  bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Tenant + authority re-check (definer bypasses RLS, so we enforce it here).
  IF p_org_id IS DISTINCT FROM public.current_org_id() THEN
    RAISE EXCEPTION 'funnel_totals_subtree: org % is outside the caller''s org', p_org_id
      USING ERRCODE = '42501';
  END IF;
  IF NOT public.can_see_marketer(p_root_marketer_id) THEN
    RAISE EXCEPTION 'funnel_totals_subtree: marketer % is outside the caller''s visible subtree', p_root_marketer_id
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    f.current_stage,
    f.outcome,
    sum(f.prospects_count)::bigint AS prospects_count,
    sum(f.enrolled_count)::bigint  AS enrolled_count
  FROM public.mv_funnel_totals f
  WHERE f.org_id = p_org_id
    AND f.marketer_id IN (
      SELECT cl.descendant_id
      FROM public.marketer_tree_closure cl
      WHERE cl.org_id = p_org_id
        AND cl.ancestor_id = p_root_marketer_id    -- depth >= 0 => self included
    )
  GROUP BY f.current_stage, f.outcome
  ORDER BY public.prospect_stage_order(f.current_stage), f.outcome;
END;
$$;

COMMENT ON FUNCTION public.funnel_totals_subtree(uuid, uuid) IS
  'Closure-scoped current funnel occupancy for a node''s subtree (root + downline, depth>=0) from mv_funnel_totals (doc 11 §4.3). SECURITY DEFINER: re-validates tenant + can_see_marketer(root) before reading, then restricts the MV scan to the root''s closure descendants. Rows are ordered by canonical stage order.';

-- =============================================================================
-- stage_conversion_subtree() — closure-scoped per-stage entry totals for a
-- node's SUBTREE over a month window. Powers stage-to-stage conversion % and
-- trend (doc 11 §5.4). Returns one row per to_stage with summed entered/exited
-- counts and the exited-count-weighted average time-in-stage. The caller (or an
-- Edge Function) computes consecutive-stage ratios from these totals, ordering
-- by prospect_stage_order(). SECURITY DEFINER with the same re-validation.
-- p_from/p_to are bucketed to month starts to match mv_stage_conversion grain.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.stage_conversion_subtree(
  p_org_id uuid,
  p_root_marketer_id uuid,
  p_from date DEFAULT NULL,   -- inclusive lower bound (any date in the first month)
  p_to   date DEFAULT NULL    -- inclusive upper bound (any date in the last month)
)
RETURNS TABLE(
  to_stage               prospect_stage,
  stage_order            int,
  entered_count          bigint,
  exited_count           bigint,
  avg_time_in_stage_secs numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_from_month date := date_trunc('month', COALESCE(p_from, '-infinity'::date))::date;
  v_to_month   date := date_trunc('month', COALESCE(p_to,   'infinity'::date))::date;
BEGIN
  IF p_org_id IS DISTINCT FROM public.current_org_id() THEN
    RAISE EXCEPTION 'stage_conversion_subtree: org % is outside the caller''s org', p_org_id
      USING ERRCODE = '42501';
  END IF;
  IF NOT public.can_see_marketer(p_root_marketer_id) THEN
    RAISE EXCEPTION 'stage_conversion_subtree: marketer % is outside the caller''s visible subtree', p_root_marketer_id
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    s.to_stage,
    public.prospect_stage_order(s.to_stage)               AS stage_order,
    sum(s.entered_count)::bigint                          AS entered_count,
    sum(s.exited_count)::bigint                           AS exited_count,
    -- exited-count-weighted mean of completed time-in-stage (doc 11 §10.2 R2).
    (sum(s.avg_time_in_stage_secs * s.exited_count)
       / NULLIF(sum(s.exited_count), 0))::numeric         AS avg_time_in_stage_secs
  FROM public.mv_stage_conversion s
  WHERE s.org_id = p_org_id
    AND s.period_month BETWEEN v_from_month AND v_to_month
    AND s.marketer_id IN (
      SELECT cl.descendant_id
      FROM public.marketer_tree_closure cl
      WHERE cl.org_id = p_org_id
        AND cl.ancestor_id = p_root_marketer_id
    )
  GROUP BY s.to_stage
  ORDER BY public.prospect_stage_order(s.to_stage);
END;
$$;

COMMENT ON FUNCTION public.stage_conversion_subtree(uuid, uuid, date, date) IS
  'Closure-scoped per-stage entry totals for a node''s subtree over a month window from mv_stage_conversion (doc 11 §5.4). Returns one row per to_stage (entered/exited counts + exited-weighted avg time-in-stage) ordered by canonical stage order; callers derive consecutive-stage conversion %. p_from/p_to are bucketed to month starts to match the MV grain (NULL => unbounded). SECURITY DEFINER: re-validates tenant + can_see_marketer(root).';

-- =============================================================================
-- PRIVILEGE LOCKDOWN (doc 11 §15.2 — "Grant SELECT on the view; never on the MV").
-- 1) Revoke any inherited access to the raw MVs from app roles. They are read
--    ONLY through the secured views / definer functions above.
-- 2) Grant SELECT on the secured wrapper views to authenticated.
-- 3) Grant EXECUTE on the closure-scoped read functions to authenticated.
-- 4) The refresh functions run as system jobs / Edge service role only.
-- =============================================================================
REVOKE ALL ON public.mv_funnel_totals    FROM PUBLIC, authenticated, anon;
REVOKE ALL ON public.mv_stage_conversion FROM PUBLIC, authenticated, anon;

GRANT SELECT ON public.v_funnel_totals_secured    TO authenticated;
GRANT SELECT ON public.v_stage_conversion_secured TO authenticated;

REVOKE EXECUTE ON FUNCTION public.prospect_stage_order(prospect_stage) FROM public;
GRANT  EXECUTE ON FUNCTION public.prospect_stage_order(prospect_stage) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.funnel_totals_subtree(uuid, uuid) FROM public;
GRANT  EXECUTE ON FUNCTION public.funnel_totals_subtree(uuid, uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.stage_conversion_subtree(uuid, uuid, date, date) FROM public;
GRANT  EXECUTE ON FUNCTION public.stage_conversion_subtree(uuid, uuid, date, date) TO authenticated;

-- Refresh functions: system-side only. The scheduling migration's pg_cron job
-- and post-bulk-op Edge Functions (service_role) invoke them; end users do not.
REVOKE EXECUTE ON FUNCTION public.refresh_funnel_mvs()           FROM public;
GRANT  EXECUTE ON FUNCTION public.refresh_funnel_mvs()           TO service_role;
REVOKE EXECUTE ON FUNCTION public.refresh_funnel_analytics(uuid) FROM public;
GRANT  EXECUTE ON FUNCTION public.refresh_funnel_analytics(uuid) TO service_role, authenticated;
