-- =============================================================================
-- File 0009 — Centos List ("Lista dei 100")
-- Purpose: The "Centos List" prospecting exercise (doc 01 §4.2). Each marketer
--          maintains an ordered list (1..N) of people they could approach. This
--          is the foundational "list of 100" exercise — DISTINCT from `contacts`
--          (the working CRM); a Centos entry can be PROMOTED into a contact via
--          promoted_contact_id.
--          * centos_list_entries table (owner_marketer_id, position, full_name,
--            phone, relationship, rating 1..5, contacted, promoted_contact_id,
--            notes, audit/soft-delete timestamps)
--          * indexes per doc 01 §4.2 (per-owner position uniqueness, owner scan,
--            promotion lookup) + org_id / FK coverage
--          * shared set_updated_at() trigger
--          * RLS: ENABLE + FORCE; read/update/delete visibility via
--            can_see_marketer(owner_marketer_id); insert own-or-admin
--          * least-privilege grants
--
-- Depends on: 0001_extensions.sql (pgcrypto/gen_random_uuid),
--             0003_tenancy_identity.sql (organizations, set_updated_at),
--             0004_marketers_tree.sql (marketers),
--             0005_auth_visibility.sql (current_org_id, can_see_marketer,
--             is_org_admin, current_membership_active),
--             0008_contacts.sql (contacts — promotion target)
--
-- NOTES:
--   * Columns follow the CANONICAL doc 01 §4.2 exactly. The brief's shorthand
--     ("title, description, status, notes") maps onto the canonical schema:
--       - title       -> full_name (the person on the list)
--       - status      -> contacted (boolean) + promoted_contact_id (promotion
--                        state); doc 01 §4.2 models entry state this way, NOT via
--                        a dedicated status enum (no `centos_*` enum exists in
--                        0002_enums.sql — see manifest `issues`).
--       - description -> relationship / notes
--   * promoted_contact_id references public.contacts(id) (created in 0008), so
--     this file MUST run after 0008. ON DELETE SET NULL: deleting the promoted
--     contact must not delete the Centos entry (its history survives).
--   * Centos CRUD does NOT enqueue app_private.dirty_metric_days (ADR-006): the
--     metrics rollup is driven by calls / journey events, not list maintenance.
--   * created_by/updated_by are intentionally OMITTED: doc 01 §4.2 specifies only
--     created_at/updated_at/deleted_at (no audit-actor columns) for this table.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 4.2 centos_list_entries — the "list of 100" prospecting exercise.
-- -----------------------------------------------------------------------------
CREATE TABLE public.centos_list_entries (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id               uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  owner_marketer_id    uuid NOT NULL REFERENCES public.marketers(id) ON DELETE RESTRICT,

  position             smallint NOT NULL,                 -- 1..N ordering slot (unique per owner)
  full_name            text     NOT NULL,
  phone                text,
  relationship         text,                              -- how the marketer knows them
  rating               smallint,                          -- 1..5 prospect-quality score
  contacted            boolean  NOT NULL DEFAULT false,

  -- Promotion provenance: set when this entry is promoted into a CRM contact.
  promoted_contact_id  uuid REFERENCES public.contacts(id) ON DELETE SET NULL,

  notes                text,

  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  deleted_at           timestamptz,

  CONSTRAINT centos_rating_range
    CHECK (rating IS NULL OR (rating BETWEEN 1 AND 5)),
  CONSTRAINT centos_position_positive
    CHECK (position >= 1)
);

COMMENT ON TABLE public.centos_list_entries IS
  'Centos List ("Lista dei 100"): each marketer''s ordered list of people to approach (doc 01 §4.2). Distinct from contacts (working CRM); an entry can be promoted into a contact via promoted_contact_id. Visibility = closure subtree of owner_marketer_id.';
COMMENT ON COLUMN public.centos_list_entries.owner_marketer_id IS
  'Owning marketer profile. RLS visibility keys on this via can_see_marketer() over the closure table (caller sees entries owned by self or any downline).';
COMMENT ON COLUMN public.centos_list_entries.position IS
  '1..N ordering slot, UNIQUE per (org, owner) among active rows (partial on deleted_at IS NULL), so a deleted entry frees its slot.';
COMMENT ON COLUMN public.centos_list_entries.rating IS
  '1–5 prospect-quality score (NULL = unrated). CHECK 1..5.';
COMMENT ON COLUMN public.centos_list_entries.contacted IS
  'Whether the marketer has reached out to this person yet. Models the entry''s working state (doc 01 §4.2 uses a boolean, not a status enum).';
COMMENT ON COLUMN public.centos_list_entries.promoted_contact_id IS
  'Set when the entry is promoted into a CRM contact (public.contacts). ON DELETE SET NULL so the Centos entry survives deletion of the promoted contact.';

-- -----------------------------------------------------------------------------
-- Indexes (doc 01 §4.2 + FK / org_id coverage).
-- -----------------------------------------------------------------------------
-- Per-owner position uniqueness among ACTIVE rows (doc 01 §4.2). Partial on
-- deleted_at IS NULL so a soft-deleted entry releases its slot for re-use.
CREATE UNIQUE INDEX centos_owner_position_uq
  ON public.centos_list_entries (org_id, owner_marketer_id, position)
  WHERE deleted_at IS NULL;

-- Owner scan (active rows): the closure descendant set hash-joins on owner,
-- ordered listing by position.
CREATE INDEX centos_owner_idx
  ON public.centos_list_entries (org_id, owner_marketer_id, position)
  WHERE deleted_at IS NULL;

-- Promotion lookup / FK coverage (which entry promoted which contact).
CREATE INDEX centos_promoted_contact_idx
  ON public.centos_list_entries (promoted_contact_id)
  WHERE promoted_contact_id IS NOT NULL;

-- Tenant-wide org scan coverage.
CREATE INDEX centos_org_idx
  ON public.centos_list_entries (org_id);

-- -----------------------------------------------------------------------------
-- updated_at maintenance — shared trigger.
-- -----------------------------------------------------------------------------
CREATE TRIGGER trg_centos_list_entries_updated_at
  BEFORE UPDATE ON public.centos_list_entries
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =============================================================================
-- Row-Level Security
-- ENABLE + FORCE; tenant isolation via current_org_id(); subtree visibility via
-- can_see_marketer(owner_marketer_id); admin/owner & platform bypass the subtree
-- filter (built into can_see_marketer()/is_org_admin()).
-- =============================================================================
ALTER TABLE public.centos_list_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.centos_list_entries FORCE  ROW LEVEL SECURITY;

-- READ: own + downline-owned entries; admins/owners/platform see the whole org.
CREATE POLICY centos_list_entries_select ON public.centos_list_entries
FOR SELECT TO authenticated
USING (
  org_id = public.current_org_id()
  AND public.can_see_marketer(owner_marketer_id)
);

-- INSERT: create an entry for self or any visible downline owner (own-or-admin).
-- WITH CHECK keeps the row tenant-scoped and within the caller's visibility; the
-- active-membership live re-check defeats stale / suspended JWTs.
CREATE POLICY centos_list_entries_insert ON public.centos_list_entries
FOR INSERT TO authenticated
WITH CHECK (
  org_id = public.current_org_id()
  AND public.current_membership_active()
  AND (
        public.is_org_admin()
     OR public.can_see_marketer(owner_marketer_id)
  )
);

-- UPDATE: may target any visible entry; WITH CHECK keeps it in scope so the
-- owner can't be reassigned out of the caller's subtree.
CREATE POLICY centos_list_entries_update ON public.centos_list_entries
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

-- DELETE: soft-delete is an UPDATE; a hard DELETE is allowed for visible rows
-- (own-or-admin). Members can remove their own (and downline) entries; admins
-- the whole org.
CREATE POLICY centos_list_entries_delete ON public.centos_list_entries
FOR DELETE TO authenticated
USING (
  org_id = public.current_org_id()
  AND (
        public.is_org_admin()
     OR public.can_see_marketer(owner_marketer_id)
  )
);

-- -----------------------------------------------------------------------------
-- Least-privilege table grants (doc 10 §4.2). RLS narrows further.
-- -----------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON public.centos_list_entries TO authenticated;
