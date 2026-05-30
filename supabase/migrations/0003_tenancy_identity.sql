-- =============================================================================
-- File 0003 — Tenancy & Identity
-- Purpose: Foundational tenancy + identity objects:
--          * shared set_updated_at() trigger function (used by every table that
--            carries updated_at, per doc 01 §0 Conventions)
--          * organizations (tenant root)
--          * platform_admins (ADR-009 #3: super_admin via a table + claim)
--          * ranks_meta (rank ladder reference + the 6 seeded ranks)
--          * memberships (auth.users <-> marketers link, role, status, the 4
--            v1 permission flags defaulted in `permissions` jsonb — ADR-003)
--
-- Depends on: 0001_extensions.sql (pgcrypto/gen_random_uuid),
--             0002_enums.sql (membership_role, membership_status, marketer_rank)
--
-- NOTE: memberships.marketer_id references marketers(id), which is created in
-- 0004. To keep this file self-contained and runnable in filename order, the
-- marketer_id FK on memberships is added in 0004 (after marketers exists) via
-- ALTER TABLE. The column itself is declared here.
--
-- RLS is enabled/forced and policies are defined in 0006_rls_core.sql.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Shared trigger function: keep updated_at current on UPDATE.
-- One canonical function attached to every table that has updated_at.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.set_updated_at() IS
  'Shared BEFORE UPDATE trigger: stamps NEW.updated_at = now(). Attached to every table with an updated_at column.';

-- -----------------------------------------------------------------------------
-- 1.1 organizations — the tenant root.
-- -----------------------------------------------------------------------------
CREATE TABLE public.organizations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  slug        text NOT NULL,
  locale      text NOT NULL DEFAULT 'it',
  timezone    text NOT NULL DEFAULT 'Europe/Rome',
  settings    jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz,

  CONSTRAINT organizations_slug_uq UNIQUE (slug),
  CONSTRAINT organizations_slug_len CHECK (char_length(slug) BETWEEN 2 AND 63)
);

COMMENT ON TABLE public.organizations IS
  'Tenant root. One organization = one network-marketing company instance. Every tenant row references organizations(id).';

CREATE TRIGGER trg_organizations_updated_at
  BEFORE UPDATE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- -----------------------------------------------------------------------------
-- platform_admins — ADR-009 #3: super_admin (platform operator) registry.
-- A row here means the auth.users login is a platform admin who can manage all
-- orgs and impersonate. Sourced into the `is_platform_admin` JWT claim by the
-- access-token hook (0005). NOT tenant-scoped (global).
-- -----------------------------------------------------------------------------
CREATE TABLE public.platform_admins (
  user_id     uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  notes       text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.platform_admins IS
  'Global super_admin registry (ADR-009 #3). Presence grants platform-wide access + org impersonation via the is_platform_admin claim. Not tenant-scoped.';

-- -----------------------------------------------------------------------------
-- 2.0 ranks_meta — rank ladder reference (sort order + Italian label + CRM flag).
-- Global (not tenant-scoped); per-org overrides live in organizations.settings.
-- -----------------------------------------------------------------------------
CREATE TABLE public.ranks_meta (
  rank          marketer_rank PRIMARY KEY,
  sort_order    smallint NOT NULL,
  label_it      text NOT NULL,
  crm_eligible  boolean NOT NULL DEFAULT false,

  CONSTRAINT ranks_meta_sort_order_uq UNIQUE (sort_order)
);

COMMENT ON TABLE public.ranks_meta IS
  'Global rank ladder reference: numeric sort_order, Italian label, and CRM-eligibility. CRM-eligible = consultant..vice_president.';

INSERT INTO public.ranks_meta (rank, sort_order, label_it, crm_eligible) VALUES
  ('executive',             1, 'Executive',              false),
  ('consultant',            2, 'Consultant',             true),
  ('team_leader',           3, 'Team Leader',            true),
  ('senior_team_leader',    4, 'Senior Team Leader',     true),
  ('executive_team_leader', 5, 'Executive Team Leader',  true),
  ('vice_president',        6, 'Vice President',          true);

-- -----------------------------------------------------------------------------
-- 1.2 memberships — the account link binding auth.users <-> ONE marketers
-- profile within an org, carrying org-level role + status + fine-grained perms.
-- This is the only place login identity and profile meet. Activation sets
-- user_id + status='active'; it NEVER duplicates the marketers profile.
--
-- permissions jsonb defaults the FOUR v1 flags (ADR-003 — can_invite REMOVED):
--   crm_access, export_enabled, manage_documents, view_branch_comparison
-- -----------------------------------------------------------------------------
CREATE TABLE public.memberships (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id       uuid REFERENCES auth.users(id) ON DELETE SET NULL,  -- NULL while invited-not-yet-signed-up
  marketer_id   uuid NOT NULL,  -- FK -> marketers(id) added in 0004 (marketers created there)
  role          membership_role   NOT NULL DEFAULT 'member',
  status        membership_status NOT NULL DEFAULT 'invited',
  permissions   jsonb NOT NULL DEFAULT jsonb_build_object(
                  'crm_access',             false,
                  'export_enabled',         false,
                  'manage_documents',       false,
                  'view_branch_comparison', false
                ),
  last_login_at timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  deleted_at    timestamptz,

  -- One account link per profile per org.
  CONSTRAINT memberships_org_marketer_uq UNIQUE (org_id, marketer_id)
);

-- A given login maps to exactly one profile per org (partial: only when set).
CREATE UNIQUE INDEX memberships_org_user_uq
  ON public.memberships (org_id, user_id)
  WHERE user_id IS NOT NULL;

-- FK / lookup indexes.
CREATE INDEX memberships_org_idx       ON public.memberships (org_id);
CREATE INDEX memberships_user_idx      ON public.memberships (user_id) WHERE user_id IS NOT NULL;
CREATE INDEX memberships_marketer_idx  ON public.memberships (marketer_id);
CREATE INDEX memberships_status_idx    ON public.memberships (org_id, status);

COMMENT ON TABLE public.memberships IS
  'Account link: binds an auth.users login to ONE marketers profile within an org, carrying role/status/permissions. Activation sets user_id + status=active; never recreates the profile.';
COMMENT ON COLUMN public.memberships.permissions IS
  'v1 permission flags (ADR-003, four total): crm_access, export_enabled, manage_documents, view_branch_comparison. can_invite is REMOVED (activation is rank-gated).';

CREATE TRIGGER trg_memberships_updated_at
  BEFORE UPDATE ON public.memberships
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
