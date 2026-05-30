-- =============================================================================
-- File 0008 — Contacts (CRM contact book)
-- Purpose: The CRM contact book owned by a marketer (doc 01 §4.1). Search /
--          filter / sort / tag / bulk-action target; feeds the prospect funnel
--          (a contact can later be promoted to a prospect).
--          * contacts table (owner_marketer_id, name/surname, phone/email/city,
--            status/source, tags text[], next_follow_up_at, last_interaction_at,
--            notes, audit cols, soft-delete)
--          * indexes per doc 01 §4.1 + doc 13 §2/§4 (owner, status, follow-up,
--            tags GIN, name trigram, [NEW] per-owner due-queue)
--          * shared set_updated_at() trigger
--          * RLS: ENABLE + FORCE; read/update/delete visibility via
--            can_see_marketer(owner_marketer_id); insert own-or-admin
--          * least-privilege grants
--
-- Depends on: 0001_extensions.sql (pgcrypto/gen_random_uuid, pg_trgm),
--             0002_enums.sql (contact_status, contact_source),
--             0003_tenancy_identity.sql (organizations, set_updated_at),
--             0004_marketers_tree.sql (marketers),
--             0005_auth_visibility.sql (current_org_id, can_see_marketer,
--             is_org_admin, current_membership_active)
--
-- NOTES:
--   * tags are a `text[]` array per the CANONICAL doc 01 §4.1 (NOT a join
--     table); GIN-indexed for tag filtering.
--   * The follow-up queue (ADR / doc 01 §9 enqueue_followups cron, doc 13 §4)
--     reads contacts.next_follow_up_at; both an org-wide and a per-owner partial
--     index support it.
--   * Contacts do not enqueue app_private.dirty_metric_days (ADR-006): that
--     rollup is driven by calls / journey events, not by contact CRUD. The
--     queue table is owned by the later analytics migration.
--
--   * `created_by`/`updated_by` reference marketers(id) (the acting profile),
--     nullable for system actions, per doc 01 §0 Audit columns.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 4.1 contacts — CRM contact book owned by a marketer.
-- -----------------------------------------------------------------------------
CREATE TABLE public.contacts (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  owner_marketer_id   uuid NOT NULL REFERENCES public.marketers(id) ON DELETE RESTRICT,

  first_name          text NOT NULL,
  last_name           text,
  email               text,
  phone               text,
  city                text,

  status              contact_status NOT NULL DEFAULT 'nuovo',
  source              contact_source NOT NULL DEFAULT 'altro',
  tags                text[]  NOT NULL DEFAULT '{}',   -- free-form labels; GIN-indexed

  next_follow_up_at   timestamptz,                     -- drives the follow-up queue
  last_interaction_at timestamptz,                     -- updated by calls/journey events
  notes               text,

  created_by          uuid REFERENCES public.marketers(id),
  updated_by          uuid REFERENCES public.marketers(id),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  deleted_at          timestamptz
);

COMMENT ON TABLE public.contacts IS
  'CRM contact book owned by a marketer (owner_marketer_id). Search/filter/sort/tag/bulk-action target; can be promoted into a prospect. Visibility = closure subtree of owner_marketer_id.';
COMMENT ON COLUMN public.contacts.owner_marketer_id IS
  'Owning marketer profile. RLS visibility keys on this via can_see_marketer() over the closure table (caller sees contacts owned by self or any downline).';
COMMENT ON COLUMN public.contacts.tags IS
  'Free-form labels (doc 01 §4.1): a text[] array, GIN-indexed. Not a join table.';
COMMENT ON COLUMN public.contacts.next_follow_up_at IS
  'Next scheduled follow-up; drives the enqueue_followups queue (doc 01 §9). Partial-indexed when NOT NULL on active rows.';
COMMENT ON COLUMN public.contacts.last_interaction_at IS
  'Last interaction timestamp, refreshed by calls / journey events (set by those later modules / the app layer).';

-- -----------------------------------------------------------------------------
-- Indexes (doc 01 §4.1 [schema] + doc 13 §2/§4 [NEW]).
-- -----------------------------------------------------------------------------
-- Owner scan (active rows): the closure descendant set hash-joins on owner.
CREATE INDEX contacts_owner_idx
  ON public.contacts (org_id, owner_marketer_id)
  WHERE deleted_at IS NULL;

-- Status filter.
CREATE INDEX contacts_status_idx
  ON public.contacts (org_id, status);

-- Org-wide follow-up queue (active rows with a scheduled follow-up).
CREATE INDEX contacts_followup_idx
  ON public.contacts (org_id, next_follow_up_at)
  WHERE next_follow_up_at IS NOT NULL AND deleted_at IS NULL;

-- Tag filtering (text[] array).
CREATE INDEX contacts_tags_gin
  ON public.contacts USING gin (tags);

-- Fuzzy name search (trigram). The expression is IMMUTABLE (coalesce + || of
-- text columns), satisfying the GIN expression-index requirement.
CREATE INDEX contacts_name_trgm
  ON public.contacts USING gin
     ((coalesce(first_name, '') || ' ' || coalesce(last_name, '')) gin_trgm_ops);

-- [NEW] (doc 13 §2/§4) Per-owner due queue: "my (or my subtree's) contacts due
-- for follow-up". Strictly smaller hot set than the org-wide follow-up index.
CREATE INDEX contacts_followup_due_idx
  ON public.contacts (org_id, owner_marketer_id, next_follow_up_at)
  WHERE next_follow_up_at IS NOT NULL AND deleted_at IS NULL;

-- -----------------------------------------------------------------------------
-- updated_at maintenance — shared trigger.
-- -----------------------------------------------------------------------------
CREATE TRIGGER trg_contacts_updated_at
  BEFORE UPDATE ON public.contacts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =============================================================================
-- Row-Level Security
-- ENABLE + FORCE; tenant isolation via current_org_id(); subtree visibility via
-- can_see_marketer(owner_marketer_id); admin/owner & platform bypass the subtree
-- filter (built into can_see_marketer()/is_org_admin()).
-- =============================================================================
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contacts FORCE  ROW LEVEL SECURITY;

-- READ: own + downline-owned contacts; admins/owners/platform see the whole org.
CREATE POLICY contacts_select ON public.contacts
FOR SELECT TO authenticated
USING (
  org_id = public.current_org_id()
  AND public.can_see_marketer(owner_marketer_id)
);

-- INSERT: create a contact for self or any visible downline owner (write
-- own-or-admin). WITH CHECK keeps the row tenant-scoped and within the caller's
-- visibility; the active-membership live re-check defeats stale/ suspended JWTs.
CREATE POLICY contacts_insert ON public.contacts
FOR INSERT TO authenticated
WITH CHECK (
  org_id = public.current_org_id()
  AND public.current_membership_active()
  AND (
        public.is_org_admin()
     OR public.can_see_marketer(owner_marketer_id)
  )
);

-- UPDATE: may target any visible contact; WITH CHECK keeps it in scope so the
-- owner can't be reassigned out of the caller's subtree.
CREATE POLICY contacts_update ON public.contacts
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
-- (own-or-admin). Members can remove their own (and downline) contacts; admins
-- the whole org.
CREATE POLICY contacts_delete ON public.contacts
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
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contacts TO authenticated;
