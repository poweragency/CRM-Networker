-- =============================================================================
-- File 0012 — Prospects & Journey (the 6-stage funnel)
-- Purpose: GROUP 5 (doc 01 §5.1/§5.2) — the prospect funnel and its full stage
--          history, plus the transactional stage-change RPC (doc 01 §5.2, doc 11).
--          * prospects table — a contact actively moving through the canonical
--            6-stage journey. Holds the CURRENT stage denormalized for fast funnel
--            queries (current_stage, current_stage_since), the lifecycle outcome
--            (open/enrolled/lost/on_hold), entered_funnel_at / closed_at, the
--            optional source contact_id, expected_value, owner, audit, soft-delete.
--          * prospect_journey_events table — the immutable historical record of
--            every stage transition: from_stage/to_stage, entered_at/exited_at,
--            GENERATED time_in_stage_secs, responsible_marketer_id, notes.
--          * "at most one OPEN event (exited_at IS NULL) per prospect" — enforced
--            BOTH by a partial UNIQUE index AND the change_prospect_stage() RPC.
--          * change_prospect_stage(p_prospect_id, p_new_stage, ...) RPC: in ONE
--            transaction (a) stamps exited_at=now() on the currently-open event,
--            (b) inserts the new open event (from_stage/to_stage), (c) updates
--            prospects.current_stage + current_stage_since. Optionally closes the
--            prospect (outcome) when entering iscrizione / on a terminal outcome.
--          * funnel-entry helper: an AFTER INSERT trigger on prospects opens the
--            first journey event (to_stage = the row's current_stage, from_stage
--            NULL) so the history is complete from t0.
--          * indexes per doc 01 §5.1/§5.2; ENABLE + FORCE RLS keyed on
--            current_org_id() + can_see_marketer(owner / responsible).
--
-- Depends on: 0001_extensions.sql        (pgcrypto/gen_random_uuid),
--             0002_enums.sql             (prospect_stage, prospect_outcome),
--             0003_tenancy_identity.sql  (organizations, set_updated_at),
--             0004_marketers_tree.sql    (marketers),
--             0005_auth_visibility.sql   (current_org_id, current_marketer_id,
--                                         can_see_marketer, is_org_admin,
--                                         current_membership_active,
--                                         assert_caller_active),
--             0008_contacts.sql          (contacts — prospects.contact_id FK)
--
-- CANONICAL-NAMES NOTE (see manifest `issues`):
--   * The task brief sketches prospect_journey_events with a single `stage` column.
--     doc 01 §5.2 (CANONICAL) instead carries `from_stage` (NULL on funnel entry)
--     and `to_stage NOT NULL`. We follow doc 01 verbatim: the "stage entered" is
--     `to_stage`; analytics (doc 11 §2.1) read `to_stage`. `from_stage` is recorded
--     for transition analytics. No `stage` column is created.
--   * doc 01 §5.2 has NO `org_id`-less event; every event carries org_id for tenant
--     scoping/RLS (canonical). time_in_stage_secs is a STORED generated column,
--     NULL until exited_at is set, exactly as doc 01 §5.2.
--
-- METRICS NOTE (ADR-006):
--   The trigger that enqueues app_private.dirty_metric_days from prospects /
--   prospect_journey_events (doc 11 §2.3) is OWNED BY the later analytics migration
--   (the queue table + org_local_date() are created there). 0012 deliberately does
--   NOT create that enqueue trigger, to avoid a forward dependency. The journey
--   tables it creates are the source the analytics triggers will later attach to.
-- =============================================================================

-- =============================================================================
-- 5.1 prospects — a contact moving through the 6-stage journey.
-- current_stage is denormalized (fast funnel queries); the full history lives in
-- prospect_journey_events. Visibility = closure subtree of owner_marketer_id.
-- =============================================================================
CREATE TABLE public.prospects (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  owner_marketer_id     uuid NOT NULL REFERENCES public.marketers(id) ON DELETE RESTRICT,
  contact_id            uuid REFERENCES public.contacts(id) ON DELETE SET NULL,  -- source contact (optional)

  full_name             text NOT NULL,            -- denormalized for prospects created directly
  current_stage         prospect_stage   NOT NULL DEFAULT 'conoscitiva',
  outcome               prospect_outcome NOT NULL DEFAULT 'open',

  current_stage_since   timestamptz NOT NULL DEFAULT now(), -- entry time of current stage (time-in-stage base)
  entered_funnel_at     timestamptz NOT NULL DEFAULT now(),
  closed_at             timestamptz,               -- when outcome left 'open'
  expected_value        numeric(14,2),             -- optional deal value (the ONLY money field, ADR-002)
  notes                 text,

  created_by            uuid REFERENCES public.marketers(id),
  updated_by            uuid REFERENCES public.marketers(id),
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  deleted_at            timestamptz,

  -- outcome <-> closed_at consistency: open <=> no close time; terminal/on_hold
  -- <=> closed_at present (doc 01 §5.1).
  CONSTRAINT prospects_closed_consistency
    CHECK ((outcome = 'open' AND closed_at IS NULL)
        OR (outcome <> 'open' AND closed_at IS NOT NULL)),
  CONSTRAINT prospects_expected_value_nonneg
    CHECK (expected_value IS NULL OR expected_value >= 0)
);

COMMENT ON TABLE public.prospects IS
  'A contact actively moving through the canonical 6-stage journey (doc 01 §5.1). current_stage/current_stage_since are denormalized for fast funnel queries; full history is in prospect_journey_events. expected_value is the only monetary field (ADR-002). Visibility = closure subtree of owner_marketer_id.';
COMMENT ON COLUMN public.prospects.owner_marketer_id IS
  'Responsible marketer profile. RLS visibility keys on this via can_see_marketer() over the closure table (caller sees prospects owned by self or any downline).';
COMMENT ON COLUMN public.prospects.contact_id IS
  'Optional source contact (ADR-009 #6: 1 contact -> N prospects). ON DELETE SET NULL so removing a contact never deletes its funnel history.';
COMMENT ON COLUMN public.prospects.current_stage IS
  'Denormalized current journey stage; kept in lock-step with the open prospect_journey_events row by change_prospect_stage().';
COMMENT ON COLUMN public.prospects.current_stage_since IS
  'Entry time of the current stage; the base for live "current time-in-stage" = now() - current_stage_since (ADR-009 #8 open-stage = live-elapsed).';
COMMENT ON COLUMN public.prospects.expected_value IS
  'Optional deal value, numeric(14,2). The single money field in v1 (ADR-002: no commission/volume engine).';

-- -----------------------------------------------------------------------------
-- Indexes (doc 01 §5.1).
-- -----------------------------------------------------------------------------
-- Owner + current-stage board scan (active rows): the closure descendant set
-- hash-joins on owner; this index serves the per-owner funnel board.
CREATE INDEX prospects_owner_stage_idx
  ON public.prospects (org_id, owner_marketer_id, current_stage)
  WHERE deleted_at IS NULL;

-- Org-wide stage/outcome slicing (funnel occupancy, mv_funnel_totals source).
CREATE INDEX prospects_stage_idx
  ON public.prospects (org_id, current_stage, outcome);

-- Source-contact lookup (1 contact -> N prospects).
CREATE INDEX prospects_contact_idx
  ON public.prospects (contact_id);

-- Closed-at slicing (cohort / period analytics).
CREATE INDEX prospects_closed_idx
  ON public.prospects (org_id, closed_at);

CREATE TRIGGER trg_prospects_updated_at
  BEFORE UPDATE ON public.prospects
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =============================================================================
-- 5.2 prospect_journey_events — stage history (immutable transition log).
-- from_stage NULL on funnel entry; to_stage NOT NULL. time_in_stage_secs is a
-- STORED generated column, NULL while the event is open (exited_at IS NULL).
-- =============================================================================
CREATE TABLE public.prospect_journey_events (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                   uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  prospect_id              uuid NOT NULL REFERENCES public.prospects(id) ON DELETE CASCADE,
  responsible_marketer_id  uuid NOT NULL REFERENCES public.marketers(id) ON DELETE RESTRICT,

  from_stage               prospect_stage,             -- NULL on funnel entry
  to_stage                 prospect_stage NOT NULL,
  entered_at               timestamptz NOT NULL DEFAULT now(),
  exited_at                timestamptz,                -- NULL while this is the current (open) stage
  -- Generated time-in-stage in seconds; NULL until exited_at is set (doc 01 §5.2).
  time_in_stage_secs       bigint GENERATED ALWAYS AS (
                             CASE WHEN exited_at IS NOT NULL
                                  THEN EXTRACT(EPOCH FROM (exited_at - entered_at))::bigint
                             END
                           ) STORED,
  notes                    text,
  created_at               timestamptz NOT NULL DEFAULT now(),

  -- A transition must change stage (the funnel-entry event has from_stage NULL,
  -- which is DISTINCT FROM any to_stage, so it passes).
  CONSTRAINT pje_stage_progression CHECK (from_stage IS DISTINCT FROM to_stage),
  -- exited_at, when present, cannot precede entered_at (keeps time_in_stage >= 0).
  CONSTRAINT pje_exit_after_entry CHECK (exited_at IS NULL OR exited_at >= entered_at)
);

COMMENT ON TABLE public.prospect_journey_events IS
  'Immutable historical record of every prospect stage transition (doc 01 §5.2). from_stage NULL on funnel entry; to_stage = the stage entered. time_in_stage_secs is generated (NULL until exited). Raw material for conversion analytics (mv_stage_conversion) and bottleneck detection. Visibility = closure subtree of responsible_marketer_id.';
COMMENT ON COLUMN public.prospect_journey_events.from_stage IS
  'Stage being left; NULL on the funnel-entry event. Powers stage-to-stage transition analytics.';
COMMENT ON COLUMN public.prospect_journey_events.to_stage IS
  'Stage entered by this event. Analytics count entries by to_stage (doc 11 §2.1); the open event''s to_stage mirrors prospects.current_stage.';
COMMENT ON COLUMN public.prospect_journey_events.exited_at IS
  'When the prospect left this stage. NULL marks the single OPEN event per prospect (the current stage). Enforced unique by pje_one_open_per_prospect.';
COMMENT ON COLUMN public.prospect_journey_events.time_in_stage_secs IS
  'GENERATED STORED: EXTRACT(EPOCH FROM exited_at - entered_at) once exited; NULL while open. Live time-in-stage for an open stage is computed as now() - prospects.current_stage_since.';

-- -----------------------------------------------------------------------------
-- Indexes (doc 01 §5.2).
-- -----------------------------------------------------------------------------
-- Per-prospect timeline.
CREATE INDEX pje_prospect_idx
  ON public.prospect_journey_events (prospect_id, entered_at);

-- Stage-entry window (mv_stage_conversion / daily metrics source: to_stage + time).
CREATE INDEX pje_stage_window
  ON public.prospect_journey_events (org_id, to_stage, entered_at);

-- Responsible-marketer activity window (closure-joined subtree analytics).
CREATE INDEX pje_responsible_idx
  ON public.prospect_journey_events (org_id, responsible_marketer_id, entered_at);

-- Fast lookup of the single OPEN event per prospect (the change RPC reads this).
CREATE INDEX pje_open_stage_idx
  ON public.prospect_journey_events (prospect_id)
  WHERE exited_at IS NULL;

-- CONSTRAINT: at most ONE open event (exited_at IS NULL) per prospect. This is the
-- structural guarantee behind change_prospect_stage(); a partial UNIQUE index is
-- the cheapest enforcement and also makes pje_open_stage_idx redundant for the
-- uniqueness role (kept separate as a plain lookup index for clarity).
CREATE UNIQUE INDEX pje_one_open_per_prospect
  ON public.prospect_journey_events (prospect_id)
  WHERE exited_at IS NULL;

COMMENT ON INDEX public.pje_one_open_per_prospect IS
  'Enforces "at most one OPEN (exited_at IS NULL) journey event per prospect" (doc 01 §5.2). change_prospect_stage() closes the prior open event before opening the next, so the invariant holds at statement boundaries.';

-- =============================================================================
-- Funnel-entry trigger — open the first journey event when a prospect is created.
-- Keeps the stage history complete from t0 WITHOUT requiring the app to insert the
-- opening event by hand. Fires AFTER INSERT so prospects.id exists. The new event
-- is OPEN (exited_at NULL) with from_stage NULL, to_stage = the row's current_stage
-- (default 'conoscitiva', or whatever stage the prospect was created at).
-- SECURITY INVOKER: runs under the inserting caller's RLS; the INSERT WITH CHECK
-- below already proved the caller may write events for this responsible marketer.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.prospects_open_first_event()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO public.prospect_journey_events (
    org_id, prospect_id, responsible_marketer_id,
    from_stage, to_stage, entered_at
  ) VALUES (
    NEW.org_id, NEW.id, NEW.owner_marketer_id,
    NULL, NEW.current_stage, NEW.current_stage_since
  );
  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION public.prospects_open_first_event() IS
  'AFTER INSERT on prospects: opens the first prospect_journey_events row (from_stage NULL, to_stage = current_stage, entered_at = current_stage_since) so journey history is complete from funnel entry. Satisfies the one-open-event invariant (a fresh prospect has exactly one open event).';

CREATE TRIGGER trg_prospects_open_first_event
  AFTER INSERT ON public.prospects
  FOR EACH ROW EXECUTE FUNCTION public.prospects_open_first_event();

-- =============================================================================
-- change_prospect_stage() — the transactional stage-transition RPC (doc 01 §5.2).
-- In ONE transaction:
--   1) lock the prospect row (serializes concurrent transitions on it),
--   2) close the currently-open journey event (exited_at = now()),
--   3) insert the new OPEN event (from_stage = prior stage, to_stage = new stage),
--   4) update prospects.current_stage + current_stage_since (+ outcome/closed_at
--      when the move is terminal — see p_outcome).
--
-- The one-open-event invariant holds at the statement boundary: step 2 closes the
-- old event before step 3 opens the new one, so pje_one_open_per_prospect is never
-- violated even momentarily within the same statement-set.
--
-- Optional p_outcome lets the caller set a terminal outcome in the same call
-- (e.g. reaching 'iscrizione' -> outcome='enrolled', or abandoning -> 'lost'):
--   * outcome = 'open'           -> closed_at cleared (re-open), prospect stays live.
--   * outcome in (enrolled/lost) -> closed_at = now() (terminal).
--   * outcome = 'on_hold'        -> closed_at = now() (paused; prospects CHECK treats
--                                   any non-open outcome as closed).
-- When p_outcome is NULL the outcome is left as-is (a normal mid-funnel advance).
--
-- SECURITY DEFINER so it can maintain the event log and prospect row atomically
-- regardless of which side of the closure the caller sits; it RE-VALIDATES the
-- caller's authority (tenant + can_see_marketer(owner) + live-active membership)
-- before mutating, so it can never become a cross-subtree write oracle.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.change_prospect_stage(
  p_prospect_id uuid,
  p_new_stage   prospect_stage,
  p_notes       text             DEFAULT NULL,
  p_outcome     prospect_outcome DEFAULT NULL,  -- NULL = leave outcome unchanged
  p_at          timestamptz      DEFAULT NULL   -- override transition time (default now())
) RETURNS uuid                                  -- returns the new (open) journey event id
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prospect    public.prospects%ROWTYPE;
  v_actor       uuid := public.current_marketer_id();
  v_at          timestamptz := COALESCE(p_at, now());
  v_new_event   uuid;
  v_new_outcome prospect_outcome;
  v_new_closed  timestamptz;
BEGIN
  -- Lock the prospect so two concurrent transitions on the same prospect serialize
  -- (prevents a race that would transiently open two events).
  SELECT * INTO v_prospect
  FROM public.prospects
  WHERE id = p_prospect_id
    AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'change_prospect_stage: prospect % not found (or deleted)', p_prospect_id
      USING ERRCODE = 'no_data_found';
  END IF;

  -- Tenant + authorization re-check (defense-in-depth; the RPC is SECURITY DEFINER
  -- so RLS does not auto-apply). Caller must be in-org, see the owner's subtree,
  -- and have a live-active membership (defeats a stale JWT after suspension).
  IF v_prospect.org_id IS DISTINCT FROM public.current_org_id() THEN
    RAISE EXCEPTION 'change_prospect_stage: prospect % is outside the caller''s org', p_prospect_id
      USING ERRCODE = '42501';
  END IF;

  IF NOT public.assert_caller_active() THEN
    RAISE EXCEPTION 'change_prospect_stage: caller membership is not active'
      USING ERRCODE = '42501';
  END IF;

  IF NOT public.can_see_marketer(v_prospect.owner_marketer_id) THEN
    RAISE EXCEPTION 'change_prospect_stage: prospect % is outside the caller''s visible subtree', p_prospect_id
      USING ERRCODE = '42501';
  END IF;

  -- No-op guard: moving to the SAME stage with no outcome change is rejected so we
  -- never write a zero-length event that would violate pje_stage_progression.
  IF v_prospect.current_stage = p_new_stage AND p_outcome IS NULL THEN
    RAISE EXCEPTION 'change_prospect_stage: prospect % is already in stage %', p_prospect_id, p_new_stage
      USING ERRCODE = 'check_violation';
  END IF;

  -- Resolve the outcome/closed_at to write (NULL p_outcome => keep current).
  v_new_outcome := COALESCE(p_outcome, v_prospect.outcome);
  v_new_closed  := CASE WHEN v_new_outcome = 'open' THEN NULL ELSE v_at END;

  -- 1) Close the currently-open event (there is exactly one, by invariant). If the
  -- stage is genuinely advancing we also stamp it; if only the outcome changed
  -- (same stage), the open event still closes and a fresh same-stage open event is
  -- NOT created — guarded by the no-op check above ensuring stage actually differs
  -- whenever we proceed to step 2/3. (Same-stage + outcome change is allowed and
  -- handled by skipping the event swap; see below.)
  IF v_prospect.current_stage IS DISTINCT FROM p_new_stage THEN
    UPDATE public.prospect_journey_events
      SET exited_at = v_at
      WHERE prospect_id = p_prospect_id
        AND exited_at IS NULL;

    -- 2) Open the new event. from_stage = the stage we just left.
    INSERT INTO public.prospect_journey_events (
      org_id, prospect_id, responsible_marketer_id,
      from_stage, to_stage, entered_at, notes
    ) VALUES (
      v_prospect.org_id, p_prospect_id, v_prospect.owner_marketer_id,
      v_prospect.current_stage, p_new_stage, v_at, p_notes
    )
    RETURNING id INTO v_new_event;

    -- 3) Denormalize onto the prospect.
    UPDATE public.prospects
      SET current_stage       = p_new_stage,
          current_stage_since = v_at,
          outcome             = v_new_outcome,
          closed_at           = v_new_closed,
          updated_by          = v_actor,
          updated_at          = now()
      WHERE id = p_prospect_id;
  ELSE
    -- Same stage, outcome-only change (e.g. mark 'lost'/'on_hold' without advancing).
    -- Keep the open event; just record the outcome and close time on the prospect.
    -- Return the existing open event id.
    SELECT id INTO v_new_event
    FROM public.prospect_journey_events
    WHERE prospect_id = p_prospect_id AND exited_at IS NULL;

    UPDATE public.prospects
      SET outcome    = v_new_outcome,
          closed_at  = v_new_closed,
          updated_by = v_actor,
          updated_at = now()
      WHERE id = p_prospect_id;
  END IF;

  -- Audit (guarded until audit_log exists — foundation convention, 0004/0007).
  IF to_regclass('public.audit_log') IS NOT NULL THEN
    INSERT INTO public.audit_log (org_id, actor_marketer_id, actor_user_id, action,
                                  entity_type, entity_id, before, after)
    VALUES (v_prospect.org_id, v_actor, auth.uid(), 'prospect.stage_change',
            'prospects', p_prospect_id,
            jsonb_build_object('stage', v_prospect.current_stage, 'outcome', v_prospect.outcome),
            jsonb_build_object('stage', p_new_stage, 'outcome', v_new_outcome));
  END IF;

  RETURN v_new_event;
END;
$$;

COMMENT ON FUNCTION public.change_prospect_stage(uuid, prospect_stage, text, prospect_outcome, timestamptz) IS
  'Transactional prospect stage transition (doc 01 §5.2): locks the prospect, closes the open journey event (exited_at), opens the new event (from_stage/to_stage), and denormalizes current_stage/current_stage_since (+ outcome/closed_at) onto prospects. Preserves the one-open-event invariant. SECURITY DEFINER; re-validates tenant + can_see_marketer(owner) + live-active membership. Returns the new open event id.';

-- =============================================================================
-- Row-Level Security — prospects.
-- ENABLE + FORCE; tenant isolation via current_org_id(); subtree visibility via
-- can_see_marketer(owner_marketer_id); admin/owner & platform bypass the subtree
-- filter (built into can_see_marketer()/is_org_admin()).
-- =============================================================================
ALTER TABLE public.prospects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prospects FORCE  ROW LEVEL SECURITY;

-- READ: own + downline-owned prospects; admins/owners/platform see the whole org.
CREATE POLICY prospects_select ON public.prospects
FOR SELECT TO authenticated
USING (
  org_id = public.current_org_id()
  AND public.can_see_marketer(owner_marketer_id)
);

-- INSERT: create a prospect for self or any visible downline owner. The active-
-- membership live re-check defeats stale/suspended JWTs.
CREATE POLICY prospects_insert ON public.prospects
FOR INSERT TO authenticated
WITH CHECK (
  org_id = public.current_org_id()
  AND public.current_membership_active()
  AND (
        public.is_org_admin()
     OR public.can_see_marketer(owner_marketer_id)
  )
);

-- UPDATE: may target any visible prospect; WITH CHECK keeps the owner inside the
-- caller's subtree so a prospect can't be reassigned out of scope.
CREATE POLICY prospects_update ON public.prospects
FOR UPDATE TO authenticated
USING (
  org_id = public.current_org_id()
  AND public.can_see_marketer(owner_marketer_id)
)
WITH CHECK (
  org_id = public.current_org_id()
  AND (
        public.is_org_admin()
     OR public.can_see_marketer(owner_marketer_id)
  )
);

-- DELETE: own-or-admin over the visible subtree (soft-delete is an UPDATE; a hard
-- DELETE cascades the journey events via the FK ON DELETE CASCADE).
CREATE POLICY prospects_delete ON public.prospects
FOR DELETE TO authenticated
USING (
  org_id = public.current_org_id()
  AND (
        public.is_org_admin()
     OR public.can_see_marketer(owner_marketer_id)
  )
);

-- =============================================================================
-- Row-Level Security — prospect_journey_events.
-- Visibility keys on responsible_marketer_id (equivalently the parent prospect's
-- owner, which the funnel-entry trigger and change RPC keep identical). Events are
-- effectively append-only history: normal writes go through change_prospect_stage()
-- (SECURITY DEFINER, bypasses these policies) and the funnel-entry trigger
-- (SECURITY INVOKER, must satisfy INSERT WITH CHECK). UPDATE is allowed only to
-- annotate notes within scope; DELETE is admin-only (history preservation).
-- =============================================================================
ALTER TABLE public.prospect_journey_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prospect_journey_events FORCE  ROW LEVEL SECURITY;

-- READ: events whose responsible marketer is visible to the caller.
CREATE POLICY pje_select ON public.prospect_journey_events
FOR SELECT TO authenticated
USING (
  org_id = public.current_org_id()
  AND public.can_see_marketer(responsible_marketer_id)
);

-- INSERT: same-org, caller active, responsible marketer visible. This bounds both
-- the funnel-entry trigger (runs as the inserting caller) and any direct event
-- insert; the normal transition path is change_prospect_stage() (DEFINER).
CREATE POLICY pje_insert ON public.prospect_journey_events
FOR INSERT TO authenticated
WITH CHECK (
  org_id = public.current_org_id()
  AND public.current_membership_active()
  AND (
        public.is_org_admin()
     OR public.can_see_marketer(responsible_marketer_id)
  )
);

-- UPDATE: in-scope annotation (e.g. fixing notes). WITH CHECK keeps it in scope.
-- The stage/time columns are normally only moved by the DEFINER RPC.
CREATE POLICY pje_update ON public.prospect_journey_events
FOR UPDATE TO authenticated
USING (
  org_id = public.current_org_id()
  AND public.can_see_marketer(responsible_marketer_id)
)
WITH CHECK (
  org_id = public.current_org_id()
  AND (
        public.is_org_admin()
     OR public.can_see_marketer(responsible_marketer_id)
  )
);

-- DELETE: admins/owners/platform only — the journey log is preserved history.
CREATE POLICY pje_delete ON public.prospect_journey_events
FOR DELETE TO authenticated
USING (
  org_id = public.current_org_id()
  AND public.is_org_admin()
);

-- =============================================================================
-- Grants (least-privilege; RLS narrows further). The change RPC is SECURITY
-- DEFINER and callable by authenticated sessions and the Edge service role.
-- =============================================================================
GRANT SELECT, INSERT, UPDATE, DELETE ON public.prospects                TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.prospect_journey_events  TO authenticated;

REVOKE EXECUTE ON FUNCTION public.change_prospect_stage(uuid, prospect_stage, text, prospect_outcome, timestamptz) FROM public;
GRANT  EXECUTE ON FUNCTION public.change_prospect_stage(uuid, prospect_stage, text, prospect_outcome, timestamptz) TO authenticated, service_role;
