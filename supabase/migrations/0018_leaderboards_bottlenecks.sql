-- =============================================================================
-- File 0018 — Leaderboards & Bottleneck Detection Engine (cold snapshots)
-- Purpose: GROUP 6 (doc 01 §6.5/§6.6, doc 11 §10 bottleneck engine & §11
--          leaderboards, ADR-009 #8 defaults) — the two IMMUTABLE-within-period
--          snapshot surfaces produced by nightly / on-demand pg_cron batch jobs,
--          plus their refresh/evaluation engines and closure-scoped RLS.
--
--          Objects created here:
--            * TABLE public.leaderboard_snapshots   (doc 01 §6.5)
--                immutable ranked rows keyed by metric / scope / scope_ref_id /
--                branch_side / period; one row per ranked marketer.
--                + INDEX leaderboard_lookup_idx (doc 01 §6.5).
--            * TABLE public.bottleneck_findings     (doc 01 §6.6)
--                one row per detected weakness (rule, affected marketer/subtree
--                root, severity, stage, metric/threshold, IT title+reco, window,
--                resolved_at). UNIQUE (org_id,marketer_id,type,stage,period_start)
--                makes each rule idempotent per marketer/stage/period.
--                + INDEX bottleneck_open_idx (doc 01 §6.6).
--            * FUNCTION public.org_bottleneck_settings(uuid) -> jsonb
--                merges organizations.settings->'bottleneck' over the ADR-009 #8
--                defaults so the engine always has a complete threshold set.
--            * FUNCTION public.refresh_leaderboards(uuid, date, date)  (doc 11 §11)
--                recomputes leaderboard_snapshots for ALL metric × scope combos
--                for one org over one period: org scope (all marketers), team
--                scope (per "team root of interest"), branch scope (LEFT+RIGHT per
--                root). Idempotent UPSERT; period rows are stable within the period.
--            * FUNCTION public.run_bottleneck_engine(uuid[, date, date])  (doc 11 §10)
--                evaluates rules R1..R4 over the trailing 30-day window for one org,
--                upserts findings, auto-resolves cleared findings, and emits
--                'bottleneck_alert' notifications for new / severity-escalated
--                findings. Inactivity findings NEVER mutate marketers.status (§10.2/
--                ADR-009 #8). Returns #findings upserted.
--            * FUNCTION public.run_bottleneck_rules(uuid) — doc 01 §9 cron-name
--                thin wrapper over run_bottleneck_engine() (see `issues`).
--            * RLS on both tables: ENABLE + FORCE; tenant via current_org_id();
--                subtree visibility via can_see_marketer(marketer_id). Both are
--                SYSTEM-WRITTEN ONLY (cron / service_role): authenticated may
--                SELECT (RLS-narrowed) but has NO write policy. service_role
--                bypasses RLS to produce rows.
--            * least-privilege grants.
--
-- Depends on: 0001_extensions.sql        (pgcrypto / gen_random_uuid),
--             0002_enums.sql             (leaderboard_metric, leaderboard_scope,
--                                          branch_side, bottleneck_type,
--                                          bottleneck_severity, prospect_stage,
--                                          notification_type),
--             0003_tenancy_identity.sql  (organizations[.settings], set_updated_at),
--             0004_marketers_tree.sql    (marketers, marketer_tree_closure),
--             0005_auth_visibility.sql   (current_org_id, can_see_marketer,
--                                          is_org_admin, is_platform_admin),
--             0008_contacts.sql          (contacts — R4 followup_overdue source),
--             0014_notifications.sql     (notifications — alert sink),
--             0016_analytics_facts.sql   (daily_marketer_metrics — R1/R3 + the
--                                          leaderboard metric values),
--             0017_analytics_views.sql   (mv_stage_conversion — R2 stage_delay;
--                                          prospect_stage_order())
--
-- ADR / spec invariants honored here:
--   * ADR-009 #8 DEFAULTS: trailing-30-day window; min_volume_conoscitiva = 10;
--     conversion = flow ratio; inactivity does NOT mutate marketers.status.
--   * doc 11 §10: idempotent UPSERT keyed (org,marketer,type,stage,period_start);
--     auto-resolution sweep; notify on new / escalated.
--   * doc 11 §11: own-activity metrics (calls/new_prospects/enrollments/
--     conversion_rate) rank by daily_marketer_metrics; team_growth is a subtree
--     metric (closure ⋈ marketers.registration_date). conversion_rate is
--     min-volume gated to avoid tiny-sample #1 placements.
--   * doc 11 §15 / doc 01 §8: every read policy uses can_see_marketer(); writes
--     are system-only (no authenticated write policy).
--
-- TABLE NAMES / COLUMNS taken VERBATIM from doc 01 §6.5/§6.6.
-- FUNCTION NAMES: the brief mandates refresh_leaderboards() + run_bottleneck_engine();
--   doc 01 §9's cron registry names the bottleneck job run_bottleneck_rules() — a
--   thin alias is provided so both names resolve (see manifest `issues`).
--
-- pg_cron is NOT scheduled here (provisioned + guarded in the later scheduling
-- migration). refresh_leaderboards() and run_bottleneck_engine()/run_bottleneck_rules()
-- are the callable targets that migration's cron entries invoke. All are idempotent.
-- =============================================================================


-- =============================================================================
-- 6.5 leaderboard_snapshots — materialized leaderboard rankings (doc 01 §6.5).
-- Immutable within a period: a leaderboard does not reshuffle mid-period. One row
-- per ranked marketer per (metric, scope, scope_ref_id, branch_side, period).
-- =============================================================================
CREATE TABLE public.leaderboard_snapshots (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  metric           leaderboard_metric NOT NULL,
  scope            leaderboard_scope  NOT NULL,
  scope_ref_id     uuid,              -- root marketer for 'team'/'branch' scope; NULL for 'org'
  branch_side      branch_side,       -- LEFT/RIGHT for branch scope; GLOBAL otherwise
  period_start     date NOT NULL,
  period_end       date NOT NULL,

  marketer_id      uuid NOT NULL REFERENCES public.marketers(id) ON DELETE CASCADE,
  rank_position    int  NOT NULL,
  value            numeric(18,4) NOT NULL,

  generated_at     timestamptz NOT NULL DEFAULT now(),

  -- NULLS NOT DISTINCT (PG15): for scope='org' the key carries scope_ref_id=NULL.
  -- Plain SQL UNIQUE treats NULLs as distinct, so the ON CONFLICT upsert in
  -- refresh_leaderboards would never collide on the org-scope rows and would
  -- duplicate them on every re-run, breaking the "stable/immutable within period,
  -- regenerate overwrites in place" contract (doc 11 §11). NULLS NOT DISTINCT makes
  -- two org-scope rows with the same (metric, NULL, branch_side, period, marketer)
  -- collide so the regen is idempotent.
  UNIQUE NULLS NOT DISTINCT (org_id, metric, scope, scope_ref_id, branch_side, period_start, marketer_id),

  -- Defensive consistency: rank positions are 1-based; period is well-ordered.
  CONSTRAINT leaderboard_rank_positive  CHECK (rank_position >= 1),
  CONSTRAINT leaderboard_period_ordered CHECK (period_end >= period_start)
);

COMMENT ON TABLE public.leaderboard_snapshots IS
  'Precomputed, immutable-within-period leaderboard rankings (doc 01 §6.5 / doc 11 §11). One row per ranked marketer per (metric, scope, scope_ref_id, branch_side, period_start). System-written by refresh_leaderboards(); authenticated SELECT only (RLS subtree-scoped via can_see_marketer).';
COMMENT ON COLUMN public.leaderboard_snapshots.scope_ref_id IS
  'Subtree root marketer for scope=team/branch; NULL for scope=org (doc 11 §11.3).';
COMMENT ON COLUMN public.leaderboard_snapshots.branch_side IS
  'LEFT/RIGHT for scope=branch (the leg ranked); GLOBAL for scope=org/team (doc 11 §11.1).';
COMMENT ON COLUMN public.leaderboard_snapshots.value IS
  'The ranked metric value for this marketer over the period (own activity for calls/new_prospects/enrollments/conversion_rate; subtree new-member count for team_growth — doc 11 §11.2).';

-- Single index range scan for the read query (doc 01 §6.5): probe by
-- (org, metric, scope, scope_ref_id, branch_side, period_start) ordered by rank.
CREATE INDEX leaderboard_lookup_idx
  ON public.leaderboard_snapshots (org_id, metric, scope, scope_ref_id, branch_side, period_start, rank_position);

COMMENT ON INDEX public.leaderboard_lookup_idx IS
  'doc 01 §6.5 lookup key: (org_id, metric, scope, scope_ref_id, branch_side, period_start, rank_position). Serves "top N by metric, scope, period" as one index range scan (doc 11 §11.5).';


-- =============================================================================
-- 6.6 bottleneck_findings — output of the bottleneck detection engine (doc 01 §6.6).
-- One row per detected weakness, attributed to the affected marketer / subtree
-- root. UNIQUE (org_id, marketer_id, type, stage, period_start) makes each rule
-- idempotent per marketer/stage/period (re-runs UPSERT, never duplicate). `stage`
-- is NULL for inactivity / followup_overdue (the NULL is a single slot per
-- (marketer,type,period) under the UNIQUE constraint — see NOTE below).
-- =============================================================================
CREATE TABLE public.bottleneck_findings (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id             uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  marketer_id        uuid NOT NULL REFERENCES public.marketers(id) ON DELETE CASCADE, -- affected marketer / subtree root
  type               bottleneck_type     NOT NULL,
  severity           bottleneck_severity NOT NULL DEFAULT 'warning',
  stage              prospect_stage,     -- relevant stage when applicable (NULL for inactivity / followup_overdue)
  metric_value       numeric(18,4),      -- measured conversion %, delay days, quiet days, overdue count
  threshold_value    numeric(18,4),      -- the breached rule threshold
  title_it           text NOT NULL,      -- Italian short title
  recommendation_it  text NOT NULL,      -- Italian actionable recommendation
  detected_at        timestamptz NOT NULL DEFAULT now(),
  period_start       date NOT NULL,
  period_end         date NOT NULL,
  resolved_at        timestamptz,        -- set when condition clears (engine sweep) or user dismisses

  created_at         timestamptz NOT NULL DEFAULT now(),

  -- NULLS NOT DISTINCT (PG15): doc 11 §10.3 requires a NULL `stage` (inactivity /
  -- followup_overdue) to be a SINGLE slot per (org, marketer, type, period) so the
  -- engine's ON CONFLICT upsert is idempotent. Plain SQL UNIQUE treats NULLs as
  -- distinct, which would let duplicate NULL-stage findings accumulate across runs;
  -- NULLS NOT DISTINCT makes two NULL-stage rows collide as intended.
  UNIQUE NULLS NOT DISTINCT (org_id, marketer_id, type, stage, period_start),

  CONSTRAINT bottleneck_period_ordered CHECK (period_end >= period_start)
);

COMMENT ON TABLE public.bottleneck_findings IS
  'Output of the bottleneck detection engine (doc 01 §6.6 / doc 11 §10). One row per detected weakness attributed to marketer_id (the affected marketer / subtree root). System-written by run_bottleneck_engine() nightly; idempotent per (marketer,type,stage,period). Surfaced as alerts; authenticated SELECT only (RLS subtree-scoped via can_see_marketer).';
COMMENT ON COLUMN public.bottleneck_findings.marketer_id IS
  'The affected marketer / subtree root. weak_conversion & stage_delay are subtree-scoped (closure ancestor); inactivity & followup_overdue are individual. Visible up the chain to uplines/admins via RLS.';
COMMENT ON COLUMN public.bottleneck_findings.stage IS
  'Relevant prospect_stage for weak_conversion (the weak FROM-stage) and stage_delay (the slow stage); NULL for inactivity / followup_overdue. The UNIQUE constraint treats a NULL stage as a single slot per (marketer,type,period).';
COMMENT ON COLUMN public.bottleneck_findings.resolved_at IS
  'NULL = open. Set by the engine''s auto-resolution sweep when the condition no longer holds on a later run, or by a user dismissal. Open findings = resolved_at IS NULL (see bottleneck_open_idx).';

-- Open-findings badge / alert query (doc 01 §6.6): the partial index keeps the
-- "open findings for this marketer/subtree by severity" probe fast.
CREATE INDEX bottleneck_open_idx
  ON public.bottleneck_findings (org_id, marketer_id, severity) WHERE resolved_at IS NULL;

COMMENT ON INDEX public.bottleneck_open_idx IS
  'doc 01 §6.6 partial index over OPEN findings (resolved_at IS NULL): (org_id, marketer_id, severity). Backs the alert badge / open-bottleneck list.';


-- =============================================================================
-- org_bottleneck_settings(org) — resolved threshold config for the engine.
-- Deep-merges organizations.settings->'bottleneck' over the ADR-009 #8 / doc 11
-- §10.2 defaults so the engine ALWAYS has a complete, well-typed threshold set
-- (a partial per-org override only changes the keys it provides). STABLE (reads
-- organizations). SECURITY DEFINER so the system engine can read org settings
-- regardless of the caller's RLS; returns only the merged config jsonb.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.org_bottleneck_settings(p_org_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    -- nested objects merged one level deep; scalars overridden as wholes.
    jsonb_build_object(
      'min_volume_conoscitiva',
        COALESCE((ovr->>'min_volume_conoscitiva')::int, 10),
      'inactivity_days',
        COALESCE((ovr->>'inactivity_days')::int, 14),
      'followup_overdue_count',
        COALESCE((ovr->>'followup_overdue_count')::int, 5),
      'weak_conv_threshold',
        COALESCE(def->'weak_conv_threshold', '{}'::jsonb)
          || COALESCE(ovr->'weak_conv_threshold', '{}'::jsonb),
      'max_avg_days_in_stage',
        COALESCE(def->'max_avg_days_in_stage', '{}'::jsonb)
          || COALESCE(ovr->'max_avg_days_in_stage', '{}'::jsonb)
    )
  FROM (
    SELECT
      -- ADR-009 #8 / doc 11 §10.2 DEFAULTS.
      jsonb_build_object(
        'weak_conv_threshold', jsonb_build_object(
          'conoscitiva_business_info', 0.40,
          'business_info_follow_up',   0.50,
          'follow_up_closing',         0.40,
          'closing_check_soldi',       0.50,
          'check_soldi_iscrizione',    0.60
        ),
        'max_avg_days_in_stage', jsonb_build_object(
          'conoscitiva',   5,
          'business_info', 7,
          'follow_up',    14,
          'closing',       7,
          'check_soldi',   5
        )
      ) AS def,
      COALESCE(
        (SELECT o.settings->'bottleneck' FROM public.organizations o WHERE o.id = p_org_id),
        '{}'::jsonb
      ) AS ovr
  ) s;
$$;

COMMENT ON FUNCTION public.org_bottleneck_settings(uuid) IS
  'Resolved bottleneck threshold config for an org: deep-merges organizations.settings->''bottleneck'' over the ADR-009 #8 / doc 11 §10.2 defaults (min_volume_conoscitiva=10, inactivity_days=14, followup_overdue_count=5, the 5 weak_conv thresholds, the 5 max_avg_days_in_stage). Always returns a complete config.';


-- =============================================================================
-- refresh_leaderboards(org, period_start, period_end) — recompute ALL leaderboard
-- snapshots for one org / one period (doc 11 §11). Loops the 5 metric × the 3
-- scopes:
--   * org    scope: 1 snapshot set per metric over the whole org.
--   * team   scope: 1 set per "team root of interest" (marketers with a downline —
--                   bounded, not every leaf — doc 11 §11.4 / A-4), branch_side GLOBAL.
--   * branch scope: LEFT and RIGHT sets per the same team roots.
-- Each set ranks marketers by the metric value (rank() OVER (ORDER BY value DESC,
-- marketer_id) — deterministic tie-break). Only positive values rank (HAVING > 0)
-- so empty marketers are not padded into the board. Idempotent UPSERT on the
-- UNIQUE key; period rows are stable within the period (re-run overwrites in place).
-- conversion_rate is MIN-VOLUME GATED (>= min_volume_conoscitiva conoscitiva
-- entries) to avoid tiny-sample #1 placements (doc 11 §11.2).
--
-- SECURITY DEFINER: a system job (pg_cron / service_role) that reads facts +
-- closure across the org and writes the snapshot table irrespective of RLS. It is
-- keyed by an explicit p_org_id and writes only that org's rows. Returns the
-- number of snapshot rows upserted.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.refresh_leaderboards(
  p_org_id       uuid,
  p_period_start date,
  p_period_end   date
) RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count   int := 0;
  v_minvol  int;
  v_metric  leaderboard_metric;
  r_root    record;
BEGIN
  IF p_period_end < p_period_start THEN
    RAISE EXCEPTION 'refresh_leaderboards: p_period_end (%) precedes p_period_start (%)',
      p_period_end, p_period_start USING ERRCODE = 'invalid_parameter_value';
  END IF;

  v_minvol := COALESCE((public.org_bottleneck_settings(p_org_id)->>'min_volume_conoscitiva')::int, 10);

  -- -------------------------------------------------------------------------
  -- A) ORG SCOPE — rank ALL marketers in the org against each other, per metric.
  --    scope_ref_id = NULL, branch_side = GLOBAL.
  -- -------------------------------------------------------------------------
  FOREACH v_metric IN ARRAY ARRAY[
    'calls', 'new_prospects', 'enrollments', 'conversion_rate', 'team_growth'
  ]::leaderboard_metric[]
  LOOP
    INSERT INTO public.leaderboard_snapshots AS ls (
      org_id, metric, scope, scope_ref_id, branch_side,
      period_start, period_end, marketer_id, rank_position, value, generated_at
    )
    SELECT
      p_org_id, v_metric, 'org', NULL, 'GLOBAL',
      p_period_start, p_period_end,
      ranked.marketer_id,
      rank() OVER (ORDER BY ranked.value DESC, ranked.marketer_id),
      ranked.value, now()
    FROM (
      SELECT marketer_id, value
      FROM public.leaderboard_metric_values(p_org_id, v_metric, NULL, NULL, p_period_start, p_period_end, v_minvol)
    ) ranked
    ON CONFLICT (org_id, metric, scope, scope_ref_id, branch_side, period_start, marketer_id)
    DO UPDATE SET rank_position = EXCLUDED.rank_position,
                  value         = EXCLUDED.value,
                  period_end    = EXCLUDED.period_end,
                  generated_at  = now();
  END LOOP;

  -- The return value is a single authoritative tally of all snapshot rows for this
  -- org/period, computed AFTER all inserts (org + team + branch) — see the end of
  -- the function. (Accumulating per-statement ROW_COUNT inside the FOREACH would
  -- miss the team/branch loops and is harder to read.)

  -- -------------------------------------------------------------------------
  -- B) TEAM + BRANCH SCOPES — per "team root of interest": any marketer that has
  --    at least one placement descendant (depth >= 1). Bounded set (not leaves),
  --    doc 11 §11.4 / A-4. For each root:
  --      * team  scope (branch_side GLOBAL): rank the root's whole subtree.
  --      * branch scope LEFT / RIGHT: rank each leg of the root.
  -- -------------------------------------------------------------------------
  FOR r_root IN
    SELECT DISTINCT cl.ancestor_id AS root_id
    FROM public.marketer_tree_closure cl
    WHERE cl.org_id = p_org_id
      AND cl.depth >= 1                      -- ancestor of >=1 descendant => has a team
  LOOP
    FOREACH v_metric IN ARRAY ARRAY[
      'calls', 'new_prospects', 'enrollments', 'conversion_rate', 'team_growth'
    ]::leaderboard_metric[]
    LOOP
      -- team scope (GLOBAL subtree of root, self included).
      INSERT INTO public.leaderboard_snapshots AS ls (
        org_id, metric, scope, scope_ref_id, branch_side,
        period_start, period_end, marketer_id, rank_position, value, generated_at
      )
      SELECT
        p_org_id, v_metric, 'team', r_root.root_id, 'GLOBAL',
        p_period_start, p_period_end,
        ranked.marketer_id,
        rank() OVER (ORDER BY ranked.value DESC, ranked.marketer_id),
        ranked.value, now()
      FROM public.leaderboard_metric_values(
             p_org_id, v_metric, r_root.root_id, NULL, p_period_start, p_period_end, v_minvol
           ) ranked
      ON CONFLICT (org_id, metric, scope, scope_ref_id, branch_side, period_start, marketer_id)
      DO UPDATE SET rank_position = EXCLUDED.rank_position,
                    value         = EXCLUDED.value,
                    period_end    = EXCLUDED.period_end,
                    generated_at  = now();

      -- branch scope LEFT.
      INSERT INTO public.leaderboard_snapshots AS ls (
        org_id, metric, scope, scope_ref_id, branch_side,
        period_start, period_end, marketer_id, rank_position, value, generated_at
      )
      SELECT
        p_org_id, v_metric, 'branch', r_root.root_id, 'LEFT',
        p_period_start, p_period_end,
        ranked.marketer_id,
        rank() OVER (ORDER BY ranked.value DESC, ranked.marketer_id),
        ranked.value, now()
      FROM public.leaderboard_metric_values(
             p_org_id, v_metric, r_root.root_id, 'LEFT', p_period_start, p_period_end, v_minvol
           ) ranked
      ON CONFLICT (org_id, metric, scope, scope_ref_id, branch_side, period_start, marketer_id)
      DO UPDATE SET rank_position = EXCLUDED.rank_position,
                    value         = EXCLUDED.value,
                    period_end    = EXCLUDED.period_end,
                    generated_at  = now();

      -- branch scope RIGHT.
      INSERT INTO public.leaderboard_snapshots AS ls (
        org_id, metric, scope, scope_ref_id, branch_side,
        period_start, period_end, marketer_id, rank_position, value, generated_at
      )
      SELECT
        p_org_id, v_metric, 'branch', r_root.root_id, 'RIGHT',
        p_period_start, p_period_end,
        ranked.marketer_id,
        rank() OVER (ORDER BY ranked.value DESC, ranked.marketer_id),
        ranked.value, now()
      FROM public.leaderboard_metric_values(
             p_org_id, v_metric, r_root.root_id, 'RIGHT', p_period_start, p_period_end, v_minvol
           ) ranked
      ON CONFLICT (org_id, metric, scope, scope_ref_id, branch_side, period_start, marketer_id)
      DO UPDATE SET rank_position = EXCLUDED.rank_position,
                    value         = EXCLUDED.value,
                    period_end    = EXCLUDED.period_end,
                    generated_at  = now();
    END LOOP;
  END LOOP;

  -- Authoritative tally: all snapshot rows for this org/period after the run.
  SELECT count(*) INTO v_count
  FROM public.leaderboard_snapshots
  WHERE org_id = p_org_id AND period_start = p_period_start;

  RETURN v_count;
END;
$$;

COMMENT ON FUNCTION public.refresh_leaderboards(uuid, date, date) IS
  'Recomputes leaderboard_snapshots for one org / one period across all 5 metrics x {org, team(per root), branch LEFT/RIGHT(per root)} scopes (doc 11 §11). rank() ties broken by marketer_id; only positive values rank; conversion_rate is min-volume gated. Idempotent UPSERT; period rows stable within period. SECURITY DEFINER (system job). Returns total snapshot rows for the org/period.';


-- =============================================================================
-- leaderboard_metric_values(org, metric, root, branch, from, to, min_vol) —
-- per-marketer ranked values for ONE metric over ONE scope, returned as
-- (marketer_id, value) rows (already filtered to value > 0). Factored out of
-- refresh_leaderboards so org / team / branch scopes share one definition:
--   * p_root_id IS NULL                -> ORG scope (all marketers in the org).
--   * p_root_id set, p_branch IS NULL  -> TEAM scope (closure subtree of root,
--                                         self included).
--   * p_root_id set, p_branch in L/R   -> BRANCH scope (that leg of the root).
-- Metric mapping (doc 11 §11.2):
--   calls / new_prospects / enrollments  : own activity sums over the period.
--   conversion_rate                      : sum(iscrizione)/NULLIF(sum(conoscitiva),0)
--                                          gated by sum(conoscitiva) >= min_vol.
--   team_growth                          : subtree NEW members in period (closure ⋈
--                                          marketers.registration_date). For a single
--                                          marketer this counts their own downline
--                                          additions in the window.
-- SECURITY DEFINER (system helper, read-only); not exposed to end users.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.leaderboard_metric_values(
  p_org_id  uuid,
  p_metric  leaderboard_metric,
  p_root_id uuid,
  p_branch  placement_leg,
  p_from    date,
  p_to      date,
  p_min_vol int DEFAULT 10
)
RETURNS TABLE (marketer_id uuid, value numeric)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- ----- team_growth: subtree NEW members per candidate marketer ----------
  -- For each candidate (the marketers in scope), count placement descendants
  -- (depth >= 1) whose registration_date falls in the window. Uses the closure.
  IF p_metric = 'team_growth' THEN
    RETURN QUERY
    SELECT cand.id AS marketer_id,
           count(nm.id)::numeric AS value
    FROM public.leaderboard_scope_members(p_org_id, p_root_id, p_branch) cand
    LEFT JOIN public.marketer_tree_closure dcl
           ON dcl.org_id = p_org_id AND dcl.ancestor_id = cand.id AND dcl.depth >= 1
    LEFT JOIN public.marketers nm
           ON nm.id = dcl.descendant_id
          AND nm.deleted_at IS NULL
          AND nm.registration_date BETWEEN p_from AND p_to
    GROUP BY cand.id
    HAVING count(nm.id) > 0;
    RETURN;
  END IF;

  -- ----- conversion_rate: ratio of own-activity stage sums, min-vol gated ---
  IF p_metric = 'conversion_rate' THEN
    RETURN QUERY
    SELECT cand.id AS marketer_id,
           round(
             COALESCE(sum(d.stage_iscrizione), 0)::numeric
             / NULLIF(sum(d.stage_conoscitiva), 0), 4) AS value
    FROM public.leaderboard_scope_members(p_org_id, p_root_id, p_branch) cand
    JOIN public.daily_marketer_metrics d
      ON d.marketer_id = cand.id
     AND d.metric_date BETWEEN p_from AND p_to
    GROUP BY cand.id
    HAVING sum(d.stage_conoscitiva) >= p_min_vol           -- tiny-sample gate
       AND COALESCE(sum(d.stage_iscrizione), 0) > 0
       AND (sum(d.stage_iscrizione)::numeric / NULLIF(sum(d.stage_conoscitiva), 0)) > 0;
    RETURN;
  END IF;

  -- ----- calls / new_prospects / enrollments: own-activity period sums ------
  RETURN QUERY
  SELECT cand.id AS marketer_id,
         CASE p_metric
           WHEN 'calls'         THEN COALESCE(sum(d.calls_total), 0)
           WHEN 'new_prospects' THEN COALESCE(sum(d.new_prospects), 0)
           WHEN 'enrollments'   THEN COALESCE(sum(d.stage_iscrizione), 0)
         END::numeric AS value
  FROM public.leaderboard_scope_members(p_org_id, p_root_id, p_branch) cand
  JOIN public.daily_marketer_metrics d
    ON d.marketer_id = cand.id
   AND d.metric_date BETWEEN p_from AND p_to
  GROUP BY cand.id, p_metric
  HAVING (CASE p_metric
            WHEN 'calls'         THEN COALESCE(sum(d.calls_total), 0)
            WHEN 'new_prospects' THEN COALESCE(sum(d.new_prospects), 0)
            WHEN 'enrollments'   THEN COALESCE(sum(d.stage_iscrizione), 0)
          END) > 0;
END;
$$;

COMMENT ON FUNCTION public.leaderboard_metric_values(uuid, leaderboard_metric, uuid, placement_leg, date, date, int) IS
  'Per-marketer ranked (marketer_id, value>0) rows for one leaderboard metric over one scope (org when root NULL; team when root set + branch NULL; branch leg when root+branch set). Own-activity sums for calls/new_prospects/enrollments; min-volume-gated ratio for conversion_rate; subtree new-member count for team_growth (doc 11 §11.2). SECURITY DEFINER system helper.';


-- =============================================================================
-- leaderboard_scope_members(org, root, branch) — the candidate marketer set for
-- a leaderboard scope, as (id) rows:
--   * root NULL              -> every non-deleted marketer in the org (ORG scope).
--   * root set, branch NULL  -> the root's closure subtree, self INCLUDED (TEAM).
--   * root set, branch L/R   -> the root's LEFT/RIGHT branch, self EXCLUDED (BRANCH).
-- Branch self-exclusion is by construction (branch_leg is NULL on the depth-0 self
-- row; depth>=1 with branch_leg = leg). doc 11 §7.1 / §11.3.
-- SECURITY DEFINER read-only system helper.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.leaderboard_scope_members(
  p_org_id  uuid,
  p_root_id uuid,
  p_branch  placement_leg
)
RETURNS TABLE (id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- ORG scope: all live marketers in the org.
  SELECT m.id
  FROM public.marketers m
  WHERE p_root_id IS NULL
    AND m.org_id = p_org_id
    AND m.deleted_at IS NULL

  UNION

  -- TEAM scope: closure subtree of root (depth >= 0 => self included).
  SELECT cl.descendant_id
  FROM public.marketer_tree_closure cl
  JOIN public.marketers m ON m.id = cl.descendant_id AND m.deleted_at IS NULL
  WHERE p_root_id IS NOT NULL
    AND p_branch IS NULL
    AND cl.org_id = p_org_id
    AND cl.ancestor_id = p_root_id

  UNION

  -- BRANCH scope: a single leg of root (depth >= 1, branch_leg = leg; self excluded).
  SELECT cl.descendant_id
  FROM public.marketer_tree_closure cl
  JOIN public.marketers m ON m.id = cl.descendant_id AND m.deleted_at IS NULL
  WHERE p_root_id IS NOT NULL
    AND p_branch IS NOT NULL
    AND cl.org_id = p_org_id
    AND cl.ancestor_id = p_root_id
    AND cl.branch_leg = p_branch;
$$;

COMMENT ON FUNCTION public.leaderboard_scope_members(uuid, uuid, placement_leg) IS
  'Candidate marketer set (id) for a leaderboard scope: org (root NULL, all live marketers), team (root set + branch NULL, closure subtree incl. self), or branch (root + leg, that leg only, self excluded). doc 11 §7.1/§11.3. SECURITY DEFINER read-only helper.';


-- =============================================================================
-- run_bottleneck_engine(org [, win_from, win_to]) — evaluate rules R1..R4 over the
-- trailing 30-day window for one org, upsert findings, auto-resolve cleared ones,
-- and emit 'bottleneck_alert' notifications for NEW / severity-ESCALATED findings
-- (doc 11 §10). Returns the number of findings inserted/updated by this run.
--
-- Window (ADR-009 #8): default trailing 30 days ending today (org-local "today"
-- is approximated by current_date; the period_start anchors the UNIQUE key so a
-- given calendar day's run is idempotent). period_start = win_from for ALL rules,
-- so re-running the same day overwrites in place; a new day opens a fresh key.
--
-- Rules (doc 11 §10.3):
--   R1 weak_conversion : per-marketer SUBTREE consecutive-stage % < threshold,
--                        gated by entered(from) >= min_volume_conoscitiva.
--   R2 stage_delay     : per-marketer SUBTREE exited-weighted avg days-in-stage >
--                        max_avg_days_in_stage[stage] (from mv_stage_conversion).
--   R3 inactivity      : per INDIVIDUAL active marketer, no calls AND no stage
--                        movement for >= inactivity_days. NEVER mutates
--                        marketers.status (ADR-009 #8 / doc 11 §6.2/§10.3).
--   R4 followup_overdue: per owner, overdue contacts (next_follow_up_at < now)
--                        count >= followup_overdue_count.
--
-- Idempotent UPSERT keyed (org,marketer,type,stage,period_start). After upserts,
-- a sweep auto-resolves any previously-open finding for this period NOT re-touched
-- by this run (its condition cleared). Then notifications fire for new/escalated.
--
-- SECURITY DEFINER system job; keyed by p_org_id; writes only that org's findings
-- + notifications.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.run_bottleneck_engine(
  p_org_id   uuid,
  p_win_from date DEFAULT (current_date - 29),  -- trailing 30 days inclusive
  p_win_to   date DEFAULT current_date
) RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cfg        jsonb;
  v_minvol     int;
  v_inact      int;
  v_fu_thr     int;
  v_run_at     timestamptz := now();  -- transaction-start ts; == every detected_at written this run
  v_count      int := 0;
  v_n          int;
BEGIN
  IF p_win_to < p_win_from THEN
    RAISE EXCEPTION 'run_bottleneck_engine: p_win_to (%) precedes p_win_from (%)',
      p_win_to, p_win_from USING ERRCODE = 'invalid_parameter_value';
  END IF;

  v_cfg    := public.org_bottleneck_settings(p_org_id);
  v_minvol := COALESCE((v_cfg->>'min_volume_conoscitiva')::int, 10);
  v_inact  := COALESCE((v_cfg->>'inactivity_days')::int, 14);
  v_fu_thr := COALESCE((v_cfg->>'followup_overdue_count')::int, 5);

  -- =======================================================================
  -- R1 — weak_conversion. Per-marketer SUBTREE stage-entry sums from
  -- daily_marketer_metrics (closure ancestor = the attributed marketer).
  -- For each consecutive pair, flag if entered(from) >= min_vol and
  -- entered(to)/entered(from) < threshold. Severity scales with how far below.
  -- =======================================================================
  WITH pair_stats AS (
    SELECT
      cl.ancestor_id AS marketer_id,
      sum(d.stage_conoscitiva)   AS c1,
      sum(d.stage_business_info) AS c2,
      sum(d.stage_follow_up)     AS c3,
      sum(d.stage_closing)       AS c4,
      sum(d.stage_check_soldi)   AS c5,
      sum(d.stage_iscrizione)    AS c6
    FROM public.marketer_tree_closure cl
    JOIN public.daily_marketer_metrics d
      ON d.marketer_id = cl.descendant_id
     AND d.metric_date BETWEEN p_win_from AND p_win_to
    WHERE cl.org_id = p_org_id
    GROUP BY cl.ancestor_id
  ),
  pairs AS (
    SELECT marketer_id, 'conoscitiva'::prospect_stage AS stage,
           c2::numeric / NULLIF(c1, 0) AS ratio,
           (v_cfg #>> ARRAY['weak_conv_threshold','conoscitiva_business_info'])::numeric AS thr,
           c1 AS vol,
           'Conversione debole: Conoscitiva -> Business Info' AS title_it,
           'Solo una piccola parte delle conoscitive avanza a business info. Rivedi lo script di apertura e la qualificazione iniziale.' AS reco_it
    FROM pair_stats
    UNION ALL
    SELECT marketer_id, 'business_info',
           c3::numeric / NULLIF(c2, 0),
           (v_cfg #>> ARRAY['weak_conv_threshold','business_info_follow_up'])::numeric,
           c2,
           'Conversione debole: Business Info -> Follow Up',
           'Molti prospect non passano al follow up dopo la presentazione. Pianifica il follow up entro 48h e usa materiali di supporto.'
    FROM pair_stats
    UNION ALL
    SELECT marketer_id, 'follow_up',
           c4::numeric / NULLIF(c3, 0),
           (v_cfg #>> ARRAY['weak_conv_threshold','follow_up_closing'])::numeric,
           c3,
           'Conversione debole: Follow Up -> Closing',
           'I follow up non si trasformano in chiusure. Definisci una call-to-action chiara e gestisci le obiezioni.'
    FROM pair_stats
    UNION ALL
    SELECT marketer_id, 'closing',
           c5::numeric / NULLIF(c4, 0),
           (v_cfg #>> ARRAY['weak_conv_threshold','closing_check_soldi'])::numeric,
           c4,
           'Conversione debole: Closing -> Check Soldi',
           'Le chiusure non arrivano al check soldi. Verifica budget e disponibilita economica prima del closing.'
    FROM pair_stats
    UNION ALL
    SELECT marketer_id, 'check_soldi',
           c6::numeric / NULLIF(c5, 0),
           (v_cfg #>> ARRAY['weak_conv_threshold','check_soldi_iscrizione'])::numeric,
           c5,
           'Conversione debole: Check Soldi -> Iscrizione',
           'Il check soldi non si converte in iscrizione. Semplifica il processo di iscrizione e rimuovi gli attriti finali.'
    FROM pair_stats
  )
  INSERT INTO public.bottleneck_findings AS bf (
    org_id, marketer_id, type, severity, stage,
    metric_value, threshold_value, title_it, recommendation_it,
    detected_at, period_start, period_end
  )
  SELECT
    p_org_id, marketer_id, 'weak_conversion',
    (CASE WHEN ratio < thr * 0.5 THEN 'critical'
          WHEN ratio < thr * 0.8 THEN 'warning'
          ELSE 'info' END)::bottleneck_severity,
    stage,
    round(ratio, 4), thr, title_it, reco_it,
    now(), p_win_from, p_win_to
  FROM pairs
  WHERE vol >= v_minvol
    AND ratio IS NOT NULL
    AND thr  IS NOT NULL
    AND ratio < thr
  ON CONFLICT (org_id, marketer_id, type, stage, period_start)
  DO UPDATE SET metric_value      = EXCLUDED.metric_value,
                severity          = EXCLUDED.severity,
                threshold_value   = EXCLUDED.threshold_value,
                title_it          = EXCLUDED.title_it,
                recommendation_it = EXCLUDED.recommendation_it,
                period_end        = EXCLUDED.period_end,
                detected_at       = now(),
                resolved_at       = NULL;          -- re-open if condition persists
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_count := v_count + v_n;

  -- =======================================================================
  -- R2 — stage_delay. Per-marketer SUBTREE exited-weighted avg days-in-stage
  -- from mv_stage_conversion (completed events). Flag if > max_avg_days_in_stage
  -- for that stage. The window is bucketed to month starts to match the MV grain.
  -- =======================================================================
  WITH stage_delay AS (
    SELECT
      cl.ancestor_id AS marketer_id,
      sc.to_stage    AS stage,
      sum(sc.avg_time_in_stage_secs * sc.exited_count)
        / NULLIF(sum(sc.exited_count), 0) / 86400.0 AS avg_days
    FROM public.marketer_tree_closure cl
    JOIN public.mv_stage_conversion sc
      ON sc.marketer_id = cl.descendant_id
     AND sc.org_id      = p_org_id
     AND sc.period_month BETWEEN date_trunc('month', p_win_from)::date
                            AND date_trunc('month', p_win_to)::date
    WHERE cl.org_id = p_org_id
    GROUP BY cl.ancestor_id, sc.to_stage
  )
  INSERT INTO public.bottleneck_findings AS bf (
    org_id, marketer_id, type, severity, stage,
    metric_value, threshold_value, title_it, recommendation_it,
    detected_at, period_start, period_end
  )
  SELECT
    p_org_id, sd.marketer_id, 'stage_delay',
    (CASE WHEN sd.avg_days > t.thr * 2   THEN 'critical'
          WHEN sd.avg_days > t.thr * 1.5 THEN 'warning'
          ELSE 'info' END)::bottleneck_severity,
    sd.stage, round(sd.avg_days, 2), t.thr,
    'Tempo eccessivo in fase: ' || sd.stage::text,
    'I prospect restano troppo a lungo in questa fase (' || round(sd.avg_days, 1)
      || ' giorni in media). Accelera con follow up programmati e scadenze chiare.',
    now(), p_win_from, p_win_to
  FROM stage_delay sd
  CROSS JOIN LATERAL (
    SELECT (v_cfg #>> ARRAY['max_avg_days_in_stage', sd.stage::text])::numeric AS thr
  ) t
  WHERE sd.avg_days IS NOT NULL
    AND t.thr      IS NOT NULL
    AND sd.avg_days > t.thr
  ON CONFLICT (org_id, marketer_id, type, stage, period_start)
  DO UPDATE SET metric_value      = EXCLUDED.metric_value,
                severity          = EXCLUDED.severity,
                threshold_value   = EXCLUDED.threshold_value,
                title_it          = EXCLUDED.title_it,
                recommendation_it = EXCLUDED.recommendation_it,
                period_end        = EXCLUDED.period_end,
                detected_at       = now(),
                resolved_at       = NULL;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_count := v_count + v_n;

  -- =======================================================================
  -- R3 — inactivity. Per INDIVIDUAL active marketer: days since the last day with
  -- any call OR any stage movement, within the window. Flag if >= inactivity_days.
  -- stage is NULL (one slot per (marketer,inactivity,period)). DOES NOT mutate
  -- marketers.status (ADR-009 #8) — this is a behavioural notion only.
  -- =======================================================================
  INSERT INTO public.bottleneck_findings AS bf (
    org_id, marketer_id, type, severity, stage,
    metric_value, threshold_value, title_it, recommendation_it,
    detected_at, period_start, period_end
  )
  SELECT
    m.org_id, m.id, 'inactivity',
    (CASE WHEN q.days_quiet > v_inact * 2 THEN 'critical' ELSE 'warning' END)::bottleneck_severity,
    NULL, q.days_quiet::numeric, v_inact,
    'Inattivita rilevata',
    'Nessuna chiamata ne avanzamento prospect negli ultimi ' || q.days_quiet
      || ' giorni. Riprendi le attivita: contatta 5 nominativi dalla tua Lista Centos.',
    now(), p_win_from, p_win_to
  FROM public.marketers m
  CROSS JOIN LATERAL (
    SELECT GREATEST(
      COALESCE(
        p_win_to - max(d.metric_date) FILTER (
          WHERE d.calls_total > 0
             OR (d.stage_conoscitiva + d.stage_business_info + d.stage_follow_up
                 + d.stage_closing + d.stage_check_soldi + d.stage_iscrizione) > 0
        ),
        (p_win_to - p_win_from + 1)            -- never active in window => full window quiet
      ),
      0
    ) AS days_quiet
    FROM public.daily_marketer_metrics d
    WHERE d.marketer_id = m.id
      AND d.metric_date BETWEEN p_win_from AND p_win_to
  ) q
  WHERE m.org_id = p_org_id
    AND m.deleted_at IS NULL
    AND m.status = 'active'
    AND q.days_quiet >= v_inact
  ON CONFLICT (org_id, marketer_id, type, stage, period_start)
  DO UPDATE SET metric_value      = EXCLUDED.metric_value,
                severity          = EXCLUDED.severity,
                threshold_value   = EXCLUDED.threshold_value,
                title_it          = EXCLUDED.title_it,
                recommendation_it = EXCLUDED.recommendation_it,
                period_end        = EXCLUDED.period_end,
                detected_at       = now(),
                resolved_at       = NULL;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_count := v_count + v_n;

  -- =======================================================================
  -- R4 — followup_overdue. Per owner_marketer_id: count of non-deleted contacts
  -- whose next_follow_up_at is past due. Flag if >= followup_overdue_count.
  -- State condition read directly from contacts (not the fact table). stage NULL.
  -- =======================================================================
  INSERT INTO public.bottleneck_findings AS bf (
    org_id, marketer_id, type, severity, stage,
    metric_value, threshold_value, title_it, recommendation_it,
    detected_at, period_start, period_end
  )
  SELECT
    p_org_id, c.owner_marketer_id, 'followup_overdue',
    (CASE WHEN count(*) > v_fu_thr * 3 THEN 'critical'
          WHEN count(*) > v_fu_thr * 2 THEN 'warning'
          ELSE 'info' END)::bottleneck_severity,
    NULL, count(*)::numeric, v_fu_thr,
    'Follow up in ritardo',
    count(*) || ' contatti hanno un follow up scaduto. Pianifica una sessione di richiamo oggi.',
    now(), p_win_from, p_win_to
  FROM public.contacts c
  WHERE c.org_id = p_org_id
    AND c.deleted_at IS NULL
    AND c.next_follow_up_at IS NOT NULL
    AND c.next_follow_up_at < now()
  GROUP BY c.owner_marketer_id
  HAVING count(*) >= v_fu_thr
  ON CONFLICT (org_id, marketer_id, type, stage, period_start)
  DO UPDATE SET metric_value      = EXCLUDED.metric_value,
                severity          = EXCLUDED.severity,
                threshold_value   = EXCLUDED.threshold_value,
                title_it          = EXCLUDED.title_it,
                recommendation_it = EXCLUDED.recommendation_it,
                period_end        = EXCLUDED.period_end,
                detected_at       = now(),
                resolved_at       = NULL;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_count := v_count + v_n;

  -- =======================================================================
  -- Auto-resolution sweep (doc 11 §10.4). Any finding for THIS org/period that
  -- was open but NOT re-touched by this run has a cleared condition => resolve it.
  -- v_run_at = now() (the transaction-start timestamp) equals every detected_at
  -- written by this run's upserts (now() is constant within a transaction), so
  -- fresh rows have detected_at = v_run_at (NOT < v_run_at) and are never swept;
  -- only findings carried over from a PRIOR run (strictly earlier transaction
  -- timestamp) satisfy detected_at < v_run_at and are resolved.
  -- =======================================================================
  UPDATE public.bottleneck_findings bf
  SET resolved_at = now()
  WHERE bf.org_id       = p_org_id
    AND bf.resolved_at  IS NULL
    AND bf.period_start = p_win_from
    AND bf.detected_at  < v_run_at;

  -- =======================================================================
  -- Notification emission (doc 11 §10.5). For each OPEN finding from this run
  -- that is NEW (no prior notification for this finding id) OR severity-ESCALATED
  -- vs. the last alert, insert a 'bottleneck_alert' notification to the affected
  -- marketer with a deep-link payload {finding_id}. We de-dupe via the payload's
  -- finding_id + severity already notified (avoids re-notifying an unchanged
  -- ongoing condition across nightly runs).
  -- =======================================================================
  INSERT INTO public.notifications (
    org_id, recipient_marketer_id, type, title_it, body_it, payload
  )
  SELECT
    bf.org_id, bf.marketer_id, 'bottleneck_alert',
    bf.title_it, bf.recommendation_it,
    jsonb_build_object('finding_id', bf.id, 'severity', bf.severity::text)
  FROM public.bottleneck_findings bf
  WHERE bf.org_id       = p_org_id
    AND bf.period_start = p_win_from
    AND bf.resolved_at  IS NULL
    AND bf.detected_at  >= v_run_at        -- touched by THIS run
    AND NOT EXISTS (
      -- skip if an alert for this finding at >= this severity was already sent.
      SELECT 1
      FROM public.notifications n
      WHERE n.org_id = bf.org_id
        AND n.type   = 'bottleneck_alert'
        AND n.recipient_marketer_id = bf.marketer_id
        AND n.payload->>'finding_id' = bf.id::text
        AND public.bottleneck_severity_rank((n.payload->>'severity'))
              >= public.bottleneck_severity_rank(bf.severity::text)
    );

  RETURN v_count;
END;
$$;

COMMENT ON FUNCTION public.run_bottleneck_engine(uuid, date, date) IS
  'Bottleneck detection engine (doc 11 §10): evaluates R1 weak_conversion, R2 stage_delay, R3 inactivity, R4 followup_overdue over the trailing-30-day window (ADR-009 #8) for one org; idempotent UPSERT into bottleneck_findings keyed (org,marketer,type,stage,period_start); auto-resolves cleared findings; emits bottleneck_alert notifications for new/escalated findings. Inactivity NEVER mutates marketers.status. SECURITY DEFINER system job. Returns #findings upserted.';


-- bottleneck_severity_rank(text) — ordinal of a severity label (info<warning<critical)
-- for the notification escalation comparison. IMMUTABLE; unknown -> 0.
CREATE OR REPLACE FUNCTION public.bottleneck_severity_rank(p_sev text)
RETURNS int
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_sev
    WHEN 'info'     THEN 1
    WHEN 'warning'  THEN 2
    WHEN 'critical' THEN 3
    ELSE 0
  END;
$$;

COMMENT ON FUNCTION public.bottleneck_severity_rank(text) IS
  'Ordinal of a bottleneck_severity label (info=1<warning=2<critical=3) for the notification escalation comparison in run_bottleneck_engine(). IMMUTABLE.';


-- =============================================================================
-- run_bottleneck_rules(org) — doc 01 §9 cron-registry name. Thin idempotent
-- wrapper over run_bottleneck_engine() with the default trailing-30-day window,
-- so the scheduling migration can invoke EITHER the brief's run_bottleneck_engine()
-- or the schema's run_bottleneck_rules() and get identical behavior (see `issues`).
-- =============================================================================
CREATE OR REPLACE FUNCTION public.run_bottleneck_rules(p_org_id uuid)
RETURNS int
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.run_bottleneck_engine(p_org_id);
$$;

COMMENT ON FUNCTION public.run_bottleneck_rules(uuid) IS
  'doc 01 §9 cron-name alias for run_bottleneck_engine(org) with the default trailing-30-day window. Idempotent. SECURITY DEFINER.';


-- =============================================================================
-- Row-Level Security — leaderboard_snapshots & bottleneck_findings.
-- Both: ENABLE + FORCE; tenant via current_org_id(); subtree visibility via
-- can_see_marketer(marketer_id) (admins/owners/platform see the whole org through
-- that helper). SYSTEM-WRITTEN ONLY: no INSERT/UPDATE/DELETE policy for
-- authenticated, so the refresh/engine functions (service_role / pg_cron, which
-- bypass RLS) are the only writers. A user dismissing a finding goes through a
-- future SECURITY DEFINER RPC, not a direct UPDATE — kept out of v1 surface here.
-- =============================================================================
ALTER TABLE public.leaderboard_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leaderboard_snapshots FORCE  ROW LEVEL SECURITY;

-- READ: a member sees leaderboard rows whose marketer_id is in their subtree;
-- admins/owners/platform see the whole org (doc 01 §6.5 RLS key).
CREATE POLICY leaderboard_snapshots_select ON public.leaderboard_snapshots
FOR SELECT TO authenticated
USING (
  org_id = public.current_org_id()
  AND public.can_see_marketer(marketer_id)
);

-- No write policies for authenticated: leaderboards are system-produced.

ALTER TABLE public.bottleneck_findings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bottleneck_findings FORCE  ROW LEVEL SECURITY;

-- READ: own + downline findings; admins/owners/platform see the whole org
-- (doc 01 §6.6 RLS key — subtree visibility of marketer_id).
CREATE POLICY bottleneck_findings_select ON public.bottleneck_findings
FOR SELECT TO authenticated
USING (
  org_id = public.current_org_id()
  AND public.can_see_marketer(marketer_id)
);

-- No write policies for authenticated: findings are system-produced.


-- =============================================================================
-- Grants (least-privilege).
--   * authenticated may SELECT both snapshot tables (RLS narrows to subtree).
--   * The refresh/engine functions are system jobs: service_role only (pg_cron
--     runs as owner/superuser and needs no explicit grant). Revoke the default
--     PUBLIC execute so authenticated cannot trigger expensive recomputes.
--   * The internal scope/value/settings helpers are NOT granted to authenticated.
-- =============================================================================
GRANT SELECT ON public.leaderboard_snapshots TO authenticated;
GRANT SELECT ON public.bottleneck_findings   TO authenticated;

-- Engine / refresh entry points: service_role only.
REVOKE EXECUTE ON FUNCTION public.refresh_leaderboards(uuid, date, date)   FROM public;
REVOKE EXECUTE ON FUNCTION public.run_bottleneck_engine(uuid, date, date)  FROM public;
REVOKE EXECUTE ON FUNCTION public.run_bottleneck_rules(uuid)               FROM public;
GRANT  EXECUTE ON FUNCTION public.refresh_leaderboards(uuid, date, date)   TO service_role;
GRANT  EXECUTE ON FUNCTION public.run_bottleneck_engine(uuid, date, date)  TO service_role;
GRANT  EXECUTE ON FUNCTION public.run_bottleneck_rules(uuid)               TO service_role;

-- Internal helpers: system-only (called by the engines as definer; not direct).
REVOKE EXECUTE ON FUNCTION public.org_bottleneck_settings(uuid)                                                FROM public;
REVOKE EXECUTE ON FUNCTION public.leaderboard_scope_members(uuid, uuid, placement_leg)                         FROM public;
REVOKE EXECUTE ON FUNCTION public.leaderboard_metric_values(uuid, leaderboard_metric, uuid, placement_leg, date, date, int) FROM public;
GRANT  EXECUTE ON FUNCTION public.org_bottleneck_settings(uuid)                                                TO service_role;
GRANT  EXECUTE ON FUNCTION public.leaderboard_scope_members(uuid, uuid, placement_leg)                         TO service_role;
GRANT  EXECUTE ON FUNCTION public.leaderboard_metric_values(uuid, leaderboard_metric, uuid, placement_leg, date, date, int) TO service_role;

-- bottleneck_severity_rank() is a pure helper; harmless to expose.
REVOKE EXECUTE ON FUNCTION public.bottleneck_severity_rank(text) FROM public;
GRANT  EXECUTE ON FUNCTION public.bottleneck_severity_rank(text) TO authenticated, service_role;
