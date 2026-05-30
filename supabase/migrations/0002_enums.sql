-- =============================================================================
-- File 0002 — Enum types (centralized)
-- Purpose: Create EVERY Postgres ENUM type used anywhere in the canonical
--          schema (doc 01), with the canonical values, in ONE place so later
--          migrations only reference them. Canonical Italian snake_case where
--          the business defines the domain; English for system-level sets.
--
-- Depends on: 0001_extensions.sql
--
-- ADR alignment:
--   * marketer_rank ladder + crm-eligibility (ADR / doc 01 §2.0): executive..vice_president.
--   * prospect_stage 6 canonical stages, LOCKED order (doc 01 §5).
--   * membership_role keeps all four canonical values (owner/admin/manager/member);
--     v1 actively uses owner/admin/member, `manager` is reserved (ADR-009 #4).
--
-- All types are created with guarded DO blocks so a clean `db reset` is
-- idempotent and re-runnable without "type already exists" errors.
-- =============================================================================

-- Helper-free idempotent creation pattern: each enum is wrapped so re-running
-- the migration on a non-empty db is safe. On a clean reset the IF check is
-- simply false and the type is created.

-- -----------------------------------------------------------------------------
-- GROUP 1 — Tenancy & Identity
-- -----------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE membership_role AS ENUM (
    'owner',     -- org founder / billing owner
    'admin',     -- full org visibility + management
    'manager',   -- elevated, can manage assigned subtrees (RESERVED — ADR-009 #4)
    'member'     -- standard marketer user; visibility limited to own subtree
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE membership_status AS ENUM (
    'active',
    'invited',
    'suspended',
    'disabled'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- -----------------------------------------------------------------------------
-- GROUP 2 — Marketer Core (ranks, status, placement leg)
-- -----------------------------------------------------------------------------
-- Ordered rank ladder. Physical enum order matches the business ladder, but
-- authoritative ordering lives in ranks_meta.sort_order (doc 01 §2.0).
DO $$ BEGIN
  CREATE TYPE marketer_rank AS ENUM (
    'executive',              -- 1 Executive            (no CRM access by default)
    'consultant',             -- 2 Consultant
    'team_leader',            -- 3 Team Leader
    'senior_team_leader',     -- 4 Senior Team Leader
    'executive_team_leader',  -- 5 Executive Team Leader
    'vice_president'          -- 6 Vice President
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE marketer_status AS ENUM (
    'active',
    'inactive',
    'pending',     -- pre-registered profile, not yet onboarded
    'suspended'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Binary placement leg. English for code clarity; rendered Italian via next-intl.
DO $$ BEGIN
  CREATE TYPE placement_leg AS ENUM ('LEFT', 'RIGHT');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- -----------------------------------------------------------------------------
-- GROUP 3 — Account Lifecycle (activation)
-- -----------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE invitation_status AS ENUM (
    'pending',    -- created, email sent
    'accepted',   -- user signed up & membership activated
    'expired',
    'revoked'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- -----------------------------------------------------------------------------
-- GROUP 4 — CRM Data (contacts, documents)
-- -----------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE contact_status AS ENUM (
    'nuovo',           -- new
    'in_lavorazione',  -- in progress
    'qualificato',     -- qualified
    'non_qualificato', -- disqualified
    'cliente',         -- converted to client
    'perso'            -- lost
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE contact_source AS ENUM (
    'centos_list',     -- from the "Centos" (100) list
    'referral',
    'social',
    'evento',
    'cold',
    'altro'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE document_category AS ENUM (
    'formazione',      -- training
    'script',
    'procedura',
    'marketing',
    'onboarding',
    'altro'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE document_status AS ENUM (
    'draft',
    'published',
    'archived'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- -----------------------------------------------------------------------------
-- GROUP 5 — Funnel & Activity (prospects, journey, calls)
-- -----------------------------------------------------------------------------
-- THE 6 CANONICAL PROSPECT JOURNEY STAGES, ordered. Italian snake_case, LOCKED.
DO $$ BEGIN
  CREATE TYPE prospect_stage AS ENUM (
    'conoscitiva',    -- 1 introductory / discovery
    'business_info',  -- 2 presenting the business
    'follow_up',      -- 3 follow-up
    'closing',        -- 4 closing
    'check_soldi',    -- 5 money check
    'iscrizione'      -- 6 enrollment
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE prospect_outcome AS ENUM (
    'open',           -- still in funnel
    'enrolled',       -- reached iscrizione successfully
    'lost',           -- dropped out
    'on_hold'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE call_type AS ENUM (
    'inbound',
    'outbound',
    'video',
    'whatsapp'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE call_outcome AS ENUM (
    'connesso',        -- connected
    'no_risposta',     -- no answer
    'richiamare',      -- callback requested
    'appuntamento',    -- appointment set
    'non_interessato', -- not interested
    'iscritto'         -- enrolled on the call
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- -----------------------------------------------------------------------------
-- GROUP 6 — Analytics, Reporting, Ops
-- -----------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE report_period AS ENUM ('monthly', 'quarterly');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE leaderboard_metric AS ENUM (
    'calls',
    'new_prospects',
    'conversion_rate',
    'enrollments',
    'team_growth'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE leaderboard_scope AS ENUM ('org', 'team', 'branch');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE bottleneck_type AS ENUM (
    'weak_conversion',  -- stage-to-stage % below threshold
    'stage_delay',      -- avg time-in-stage above threshold
    'inactivity',       -- no calls / no stage movement in window
    'followup_overdue'  -- next_follow_up_at past due in bulk
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE bottleneck_severity AS ENUM ('info', 'warning', 'critical');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE notification_type AS ENUM (
    'follow_up_due',
    'rank_changed',
    'bottleneck_alert',
    'monthly_report_ready',
    'invitation',
    'system'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Branch parameterization for analytics/leaderboards (Global / Left / Right).
DO $$ BEGIN
  CREATE TYPE branch_side AS ENUM ('GLOBAL', 'LEFT', 'RIGHT');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON TYPE marketer_rank IS
  'Ordered rank ladder executive..vice_president. CRM-eligible = consultant..vice_president (see ranks_meta.crm_eligible).';
COMMENT ON TYPE prospect_stage IS
  'LOCKED canonical 6-stage prospect journey, ordered: conoscitiva, business_info, follow_up, closing, check_soldi, iscrizione.';
COMMENT ON TYPE placement_leg IS
  'Binary placement leg of the genealogy tree: LEFT | RIGHT.';
