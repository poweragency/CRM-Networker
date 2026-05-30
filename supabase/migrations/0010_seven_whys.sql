-- =============================================================================
-- File 0010 — Seven Whys ("Sette Perché")
-- Purpose: The "Sette Perché" motivation exercise (doc 01 §4.3). ONE record per
--          marketer capturing their seven reasons ("perché") for building the
--          business, used in coaching and surfaced on the profile.
--          * seven_whys table (marketer_id owner, why_1..why_7, primary_why_index
--            1..7, notes, created_at/updated_at) — canonical columns per doc 01 §4.3.
--          * indexes: UNIQUE(org_id, marketer_id) [one per marketer] + FK/org_id
--            coverage.
--          * shared set_updated_at() trigger.
--          * RLS: ENABLE + FORCE. READ across the subtree via
--            can_see_marketer(marketer_id); WRITE only the caller's OWN marketer
--            row (marketer_id = current_marketer_id()) OR admin/owner/platform.
--            (ADR-009 #7: Sette Perché = read-subtree / write-own.)
--          * least-privilege grants.
--
-- Depends on: 0001_extensions.sql (pgcrypto/gen_random_uuid),
--             0003_tenancy_identity.sql (organizations, set_updated_at),
--             0004_marketers_tree.sql (marketers),
--             0005_auth_visibility.sql (current_org_id, current_marketer_id,
--             can_see_marketer, is_org_admin, current_membership_active)
--
-- NOTES (see manifest `issues`):
--   * Canonical columns follow doc 01 §4.3 EXACTLY: the owner is `marketer_id`
--     (NOT a generic "owner_marketer_id"), there is NO `deleted_at`, and NO
--     created_by/updated_by audit-actor columns (doc 01 §4.3 lists only
--     created_at/updated_at). The record is effectively a 1:1 extension of the
--     marketer profile.
--   * The brief mentions a "subject person_name" and a free-form "notes" field.
--     doc 01 §4.3 (canonical) has NO `person_name`/`subject` column — the subject
--     IS the marketer (marketer_id, UNIQUE one-per-marketer) — and DOES NOT list a
--     `notes` column either. We follow doc 01 as the source of truth for fixed
--     identifiers but ADD a nullable `notes text` (the brief explicitly requests
--     it; it is a harmless additive coaching field). `person_name` is intentionally
--     OMITTED: the seven-whys subject is the owning marketer, so a redundant name
--     column would duplicate marketers.display_name. Both deviations are recorded
--     in `issues`.
--   * WRITE scope is OWN-ONLY (not own-or-downline like centos): an upline can READ
--     a downline's Sette Perché (coaching visibility) but cannot author/overwrite
--     it. Admins/owners/platform may write any row (closure/role bypass).
--   * No app_private.dirty_metric_days enqueue (ADR-006): this exercise does not
--     feed activity metrics.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 4.3 seven_whys — one motivation record per marketer (doc 01 §4.3).
-- -----------------------------------------------------------------------------
CREATE TABLE public.seven_whys (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  marketer_id         uuid NOT NULL REFERENCES public.marketers(id) ON DELETE CASCADE,

  -- The seven reasons. All nullable: the exercise is filled in incrementally.
  why_1               text,   -- Primo perché
  why_2               text,   -- Secondo perché
  why_3               text,   -- Terzo perché
  why_4               text,   -- Quarto perché
  why_5               text,   -- Quinto perché
  why_6               text,   -- Sesto perché
  why_7               text,   -- Settimo perché

  -- Which of 1..7 is the core driver (the "perché principale").
  primary_why_index   smallint,

  -- Additive coaching note (brief). Not part of the canonical doc 01 §4.3 column
  -- list; nullable and free-form.
  notes               text,

  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),

  -- One Sette Perché record per marketer per org (doc 01 §4.3).
  CONSTRAINT seven_whys_marketer_uq UNIQUE (org_id, marketer_id),
  -- primary_why_index, when set, must point at one of the seven slots.
  CONSTRAINT seven_whys_primary_index_range
    CHECK (primary_why_index IS NULL OR (primary_why_index BETWEEN 1 AND 7))
);

COMMENT ON TABLE public.seven_whys IS
  'Sette Perché ("Seven Whys") motivation exercise (doc 01 §4.3): one record per marketer holding why_1..why_7 + primary_why_index. Visibility = closure subtree of marketer_id (read); writes are own-marketer-only (ADR-009 #7 read-subtree/write-own).';
COMMENT ON COLUMN public.seven_whys.marketer_id IS
  'Owning marketer profile (the subject of the exercise). UNIQUE(org_id, marketer_id): exactly one record per marketer. RLS read visibility keys on this via can_see_marketer(); writes require marketer_id = current_marketer_id() (own) OR admin.';
COMMENT ON COLUMN public.seven_whys.primary_why_index IS
  '1..7 pointer to whichever why_N is the core driver (NULL = unset). CHECK 1..7.';
COMMENT ON COLUMN public.seven_whys.notes IS
  'Free-form coaching note (additive to doc 01 §4.3; nullable). See migration header / manifest issues.';

-- -----------------------------------------------------------------------------
-- Indexes (doc 01 §4.3 + FK / org_id coverage).
-- The UNIQUE(org_id, marketer_id) constraint already provides an index that
-- covers per-marketer lookup; we add an explicit org_id index for tenant scans.
-- -----------------------------------------------------------------------------
CREATE INDEX seven_whys_org_idx
  ON public.seven_whys (org_id);

-- -----------------------------------------------------------------------------
-- updated_at maintenance — shared trigger.
-- -----------------------------------------------------------------------------
CREATE TRIGGER trg_seven_whys_updated_at
  BEFORE UPDATE ON public.seven_whys
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =============================================================================
-- Row-Level Security
-- ENABLE + FORCE. Tenant isolation via current_org_id().
--   READ  : subtree visibility via can_see_marketer(marketer_id) — an upline can
--           see a downline's Sette Perché (coaching). Admin/owner/platform bypass
--           the subtree filter (built into can_see_marketer()/is_org_admin()).
--   WRITE : OWN marketer only — marketer_id = current_marketer_id() — OR admin.
--           An upline may READ but NOT author/overwrite a downline's record
--           (ADR-009 #7: write-own).
-- =============================================================================
ALTER TABLE public.seven_whys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seven_whys FORCE  ROW LEVEL SECURITY;

-- READ: own + downline records; admins/owners/platform see the whole org.
CREATE POLICY seven_whys_select ON public.seven_whys
FOR SELECT TO authenticated
USING (
  org_id = public.current_org_id()
  AND public.can_see_marketer(marketer_id)
);

-- INSERT: create ONLY your own record (marketer_id = caller) — or admin for any
-- marketer in the org. The active-membership live re-check defeats stale /
-- suspended JWTs. WITH CHECK keeps the row tenant-scoped and write-own.
CREATE POLICY seven_whys_insert ON public.seven_whys
FOR INSERT TO authenticated
WITH CHECK (
  org_id = public.current_org_id()
  AND public.current_membership_active()
  AND (
        public.is_org_admin()
     OR marketer_id = public.current_marketer_id()
  )
);

-- UPDATE: edit ONLY your own record — or admin. USING gates which rows are
-- visible-to-update; WITH CHECK keeps it tenant-scoped and prevents reassigning
-- the record to someone else's marketer_id (write-own invariant).
CREATE POLICY seven_whys_update ON public.seven_whys
FOR UPDATE TO authenticated
USING (
  org_id = public.current_org_id()
  AND (
        public.is_org_admin()
     OR marketer_id = public.current_marketer_id()
  )
)
WITH CHECK (
  org_id = public.current_org_id()
  AND (
        public.is_org_admin()
     OR marketer_id = public.current_marketer_id()
  )
);

-- DELETE: remove ONLY your own record — or admin (own-or-admin, write-own).
CREATE POLICY seven_whys_delete ON public.seven_whys
FOR DELETE TO authenticated
USING (
  org_id = public.current_org_id()
  AND (
        public.is_org_admin()
     OR marketer_id = public.current_marketer_id()
  )
);

-- -----------------------------------------------------------------------------
-- Least-privilege table grants (doc 10 §4.2). RLS narrows further.
-- -----------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON public.seven_whys TO authenticated;
