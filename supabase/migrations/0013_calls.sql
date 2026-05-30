-- =============================================================================
-- File 0013 — Calls (call tracking)
-- Purpose: GROUP 5 (doc 01 §5.3) — the call-activity log. One row per call made
--          or taken by a marketer, optionally about a prospect and/or a contact.
--          Feeds activity analytics, leaderboards, daily metrics, and refreshes
--          the related contact/prospect "last interaction" timestamp.
--          * calls table — marketer_id (who made/took the call), nullable
--            prospect_id and contact_id (ON DELETE SET NULL), call_type enum,
--            call_outcome enum, duration_secs (>=0), occurred_at, notes, audit
--            cols (created_by), soft-delete. CHECK calls_has_target: at least one
--            of prospect_id / contact_id is present (doc 01 §5.3).
--          * indexes per doc 01 §5.3 (marketer+time, prospect, contact, outcome).
--          * shared set_updated_at() trigger.
--          * AFTER INSERT trigger calls_touch_last_interaction(): stamps
--            last_interaction_at on the linked contact/prospect-source-contact so
--            the contacts.last_interaction_at field (doc 01 §4.1) stays current
--            "updated by calls/journey events". SECURITY DEFINER, tenant-scoped.
--          * RLS: ENABLE + FORCE; tenant via current_org_id(); subtree visibility
--            via can_see_marketer(marketer_id); write own-or-admin + live-active.
--          * least-privilege grants.
--
-- Depends on: 0001_extensions.sql       (pgcrypto/gen_random_uuid),
--             0002_enums.sql            (call_type, call_outcome),
--             0003_tenancy_identity.sql (organizations, set_updated_at),
--             0004_marketers_tree.sql   (marketers),
--             0005_auth_visibility.sql  (current_org_id, current_marketer_id,
--                                        can_see_marketer, is_org_admin,
--                                        current_membership_active,
--                                        assert_caller_active),
--             0008_contacts.sql         (contacts — calls.contact_id FK; the
--                                        last_interaction_at column it touches),
--             0012_prospects_journey.sql(prospects — calls.prospect_id FK)
--
-- CANONICAL-NAMES NOTE (see manifest `issues`):
--   * The task brief sketches calls with (marketer_id, prospect_id nullable,
--     call_type, duration_secs, outcome, occurred_at, notes). doc 01 §5.3
--     (CANONICAL) additionally carries a nullable `contact_id` and a
--     `calls_has_target` CHECK (prospect_id IS NOT NULL OR contact_id IS NOT NULL).
--     We follow doc 01 verbatim: contact_id and the target CHECK are included.
--   * The brief lists an "occurred_at" index; doc 01 §5.3 folds occurred_at into
--     calls_marketer_time_idx (org_id, marketer_id, occurred_at) and
--     calls_outcome_idx (org_id, outcome, occurred_at). We implement the canonical
--     doc 01 index set (which covers org/marketer/prospect/occurred_at).
--
-- METRICS NOTE (ADR-006):
--   Calls are a primary driver of daily_marketer_metrics (calls_total /
--   calls_connected / calls_duration_secs, doc 01 §6.1). The trigger that enqueues
--   app_private.dirty_metric_days from calls is OWNED BY the later analytics
--   migration (the dirty-metrics queue table + org_local_date() are created there).
--   0013 deliberately does NOT create that enqueue trigger, to avoid a forward
--   dependency on objects that do not yet exist at this point in the reset order.
--   This file's last_interaction_at touch trigger is independent of that queue.
-- =============================================================================

-- =============================================================================
-- 5.3 calls — call tracking (type, duration, outcome, prospect/contact, notes).
-- Visibility = closure subtree of marketer_id (who made/took the call).
-- =============================================================================
CREATE TABLE public.calls (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  marketer_id         uuid NOT NULL REFERENCES public.marketers(id) ON DELETE RESTRICT, -- who made/took the call
  prospect_id         uuid REFERENCES public.prospects(id) ON DELETE SET NULL,
  contact_id          uuid REFERENCES public.contacts(id)  ON DELETE SET NULL,

  call_type           call_type    NOT NULL,
  outcome             call_outcome NOT NULL,
  duration_secs       int          NOT NULL DEFAULT 0 CHECK (duration_secs >= 0),
  occurred_at         timestamptz  NOT NULL DEFAULT now(),
  notes               text,

  created_by          uuid REFERENCES public.marketers(id),
  created_at          timestamptz  NOT NULL DEFAULT now(),
  updated_at          timestamptz  NOT NULL DEFAULT now(),
  deleted_at          timestamptz,

  -- A call must reference at least one target (a prospect, a contact, or both).
  CONSTRAINT calls_has_target
    CHECK (prospect_id IS NOT NULL OR contact_id IS NOT NULL)
);

COMMENT ON TABLE public.calls IS
  'Call-activity log (doc 01 §5.3): one row per call made/taken by a marketer, optionally about a prospect and/or contact. Feeds activity analytics, leaderboards, and daily_marketer_metrics (calls_total/calls_connected/calls_duration_secs). Visibility = closure subtree of marketer_id.';
COMMENT ON COLUMN public.calls.marketer_id IS
  'Marketer who made/took the call. RLS visibility keys on this via can_see_marketer() over the closure table (caller sees calls by self or any downline). ON DELETE RESTRICT: a marketer with call history cannot be hard-deleted.';
COMMENT ON COLUMN public.calls.prospect_id IS
  'Optional prospect the call concerned. ON DELETE SET NULL so removing a prospect never deletes the call activity record (the calls_has_target CHECK still requires a contact_id to remain in that case).';
COMMENT ON COLUMN public.calls.contact_id IS
  'Optional contact the call concerned. ON DELETE SET NULL so removing a contact never deletes the call activity record. At least one of prospect_id/contact_id must be present (calls_has_target).';
COMMENT ON COLUMN public.calls.duration_secs IS
  'Call duration in seconds, >= 0. Aggregated into daily_marketer_metrics.calls_duration_secs.';
COMMENT ON COLUMN public.calls.outcome IS
  'Call outcome (connesso/no_risposta/richiamare/appuntamento/non_interessato/iscritto). outcome=''connesso'' feeds daily_marketer_metrics.calls_connected.';
COMMENT ON COLUMN public.calls.occurred_at IS
  'When the call happened (org-local-bucketed into metric_date by the later analytics rollup). Defaults to now().';
COMMENT ON CONSTRAINT calls_has_target ON public.calls IS
  'doc 01 §5.3: every call references at least one of prospect_id / contact_id. Combined with ON DELETE SET NULL on both, a call can still be orphaned of one target but never of both at insert time.';

-- -----------------------------------------------------------------------------
-- Indexes (doc 01 §5.3).
-- -----------------------------------------------------------------------------
-- Per-marketer activity window: the closure descendant set hash-joins on
-- marketer_id; occurred_at orders the activity feed and buckets daily metrics.
CREATE INDEX calls_marketer_time_idx
  ON public.calls (org_id, marketer_id, occurred_at);

-- Prospect call history (calls about a given prospect).
CREATE INDEX calls_prospect_idx
  ON public.calls (prospect_id);

-- Contact call history (calls about a given contact).
CREATE INDEX calls_contact_idx
  ON public.calls (contact_id);

-- Outcome slicing over time (connected-rate / outcome-mix analytics).
CREATE INDEX calls_outcome_idx
  ON public.calls (org_id, outcome, occurred_at);

-- -----------------------------------------------------------------------------
-- updated_at maintenance — shared trigger.
-- -----------------------------------------------------------------------------
CREATE TRIGGER trg_calls_updated_at
  BEFORE UPDATE ON public.calls
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =============================================================================
-- calls_touch_last_interaction() — refresh the linked contact's
-- last_interaction_at (doc 01 §4.1: "updated by calls/journey events").
-- Fires AFTER INSERT on calls. Touches:
--   * the directly-linked contact (NEW.contact_id), and
--   * the source contact of the linked prospect (prospects.contact_id), if any,
-- but never moves last_interaction_at backwards (a back-dated occurred_at must not
-- clobber a more recent interaction). Org-scoped so it can never reach across
-- tenants. SECURITY DEFINER so the touch succeeds even when the caller's RLS would
-- not let them UPDATE that contact row directly (the contact is, by construction,
-- in the caller's visible subtree — the INSERT WITH CHECK already proved the call's
-- marketer is visible — but the contact may be owned by a different visible owner;
-- DEFINER keeps the denormalization reliable). It re-applies the tenant filter
-- internally and writes ONLY last_interaction_at, so it cannot become a cross-org
-- or privilege-escalation oracle.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.calls_touch_last_interaction()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Directly-linked contact.
  IF NEW.contact_id IS NOT NULL THEN
    UPDATE public.contacts
      SET last_interaction_at = NEW.occurred_at
      WHERE id     = NEW.contact_id
        AND org_id = NEW.org_id
        AND (last_interaction_at IS NULL OR last_interaction_at < NEW.occurred_at);
  END IF;

  -- Source contact of the linked prospect (if the prospect carries one and it is
  -- not the same contact already touched above).
  IF NEW.prospect_id IS NOT NULL THEN
    UPDATE public.contacts c
      SET last_interaction_at = NEW.occurred_at
      FROM public.prospects p
      WHERE p.id          = NEW.prospect_id
        AND p.org_id      = NEW.org_id
        AND c.id          = p.contact_id
        AND c.org_id      = NEW.org_id
        AND c.id IS DISTINCT FROM NEW.contact_id
        AND (c.last_interaction_at IS NULL OR c.last_interaction_at < NEW.occurred_at);
  END IF;

  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION public.calls_touch_last_interaction() IS
  'AFTER INSERT on calls: refreshes contacts.last_interaction_at (doc 01 §4.1) for the directly-linked contact and the linked prospect''s source contact, never moving it backwards. SECURITY DEFINER, tenant-scoped (org_id), writes only last_interaction_at.';

CREATE TRIGGER trg_calls_touch_last_interaction
  AFTER INSERT ON public.calls
  FOR EACH ROW EXECUTE FUNCTION public.calls_touch_last_interaction();

-- =============================================================================
-- Row-Level Security — calls.
-- ENABLE + FORCE; tenant isolation via current_org_id(); subtree visibility via
-- can_see_marketer(marketer_id); admin/owner & platform bypass the subtree filter
-- (built into can_see_marketer()/is_org_admin()).
-- =============================================================================
ALTER TABLE public.calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calls FORCE  ROW LEVEL SECURITY;

-- READ: own + downline calls; admins/owners/platform see the whole org.
CREATE POLICY calls_select ON public.calls
FOR SELECT TO authenticated
USING (
  org_id = public.current_org_id()
  AND public.can_see_marketer(marketer_id)
);

-- INSERT: log a call for self or any visible downline marketer (write
-- own-or-admin). WITH CHECK keeps the row tenant-scoped and within the caller's
-- visibility; the active-membership live re-check defeats stale/suspended JWTs.
CREATE POLICY calls_insert ON public.calls
FOR INSERT TO authenticated
WITH CHECK (
  org_id = public.current_org_id()
  AND public.current_membership_active()
  AND (
        public.is_org_admin()
     OR public.can_see_marketer(marketer_id)
  )
);

-- UPDATE: may target any visible call; WITH CHECK keeps it in scope so the
-- attributed marketer can't be reassigned out of the caller's subtree.
CREATE POLICY calls_update ON public.calls
FOR UPDATE TO authenticated
USING (
  org_id = public.current_org_id()
  AND public.can_see_marketer(marketer_id)
)
WITH CHECK (
  org_id = public.current_org_id()
  AND (
        public.is_org_admin()
     OR public.can_see_marketer(marketer_id)
  )
);

-- DELETE: own-or-admin over the visible subtree. Soft-delete is an UPDATE
-- (deleted_at); a hard DELETE is allowed for visible rows.
CREATE POLICY calls_delete ON public.calls
FOR DELETE TO authenticated
USING (
  org_id = public.current_org_id()
  AND (
        public.is_org_admin()
     OR public.can_see_marketer(marketer_id)
  )
);

-- -----------------------------------------------------------------------------
-- Least-privilege table grants (doc 10 §4.2). RLS narrows further.
-- -----------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON public.calls TO authenticated;
