-- =============================================================================
-- File 0015 — Audit Log (append-only, immutable sensitive-action trail)
-- Purpose: GROUP 6 — the org-wide, append-only audit trail (doc 01 §6.8,
--          doc 10 §5 "audit immutability").
--          * audit_action ENUM — the canonical sensitive-action vocabulary
--            (doc 10 §5.1) PLUS every action string already emitted by the
--            foundation RPCs/triggers (0004/0007/0012), so those inserts type-
--            check the moment audit_log goes live. (Task brief: `action
--            audit_action enum`; this OVERRIDES doc 01 §6.8's `action text`.)
--          * audit_log table (append-only: org_id, actor_marketer_id,
--            actor_user_id, action, entity_type, entity_id, before jsonb,
--            after jsonb, ip_address inet, created_at) — NO updated_at /
--            deleted_at (doc 01 §6.8).
--          * indexes (doc 01 §6.8): (org_id, created_at DESC),
--            (org_id, entity_type, entity_id) + FK/actor coverage.
--          * log_audit(...) SECURITY DEFINER writer (doc 10 §5.2): resolves
--            org/actor/ip from JWT + request context, inserts one row.
--          * audit_trigger() GENERIC row-level audit trigger function +
--            attachment to the sensitive tables: marketers, memberships,
--            rank_history, account_invitations.
--          * deny_audit_mutation() immutability trigger + REVOKE UPDATE/DELETE
--            (even from service_role) — append-only enforced (doc 10 §5.2).
--          * RLS: ENABLE + FORCE; admins/owners (+ platform) read within org;
--            NO INSERT/UPDATE/DELETE policy for `authenticated` ⇒ writes only via
--            the SECURITY DEFINER writer/triggers; mutation blocked for everyone.
--
-- Depends on: 0001_extensions.sql        (pgcrypto / gen_random_uuid),
--             0002_enums.sql             (no audit enum there — owned HERE),
--             0003_tenancy_identity.sql  (organizations, memberships),
--             0004_marketers_tree.sql    (marketers, marketer_tree_closure,
--                                          rank_history),
--             0005_auth_visibility.sql   (current_org_id, current_marketer_id,
--                                          is_org_admin, is_platform_admin),
--             0007_account_lifecycle.sql (account_invitations)
--
-- IMMUTABILITY (doc 10 §5.2): audit_log has no UPDATE/DELETE path. UPDATE/DELETE
-- are REVOKEd from authenticated AND service_role, and a BEFORE UPDATE OR DELETE
-- trigger raises unconditionally. Even the service role (which bypasses RLS)
-- cannot mutate history. Inserts arrive only through log_audit() / audit_trigger()
-- (both SECURITY DEFINER) or the guarded inserts already present in the foundation
-- RPCs (0004/0007/0012).
--
-- NAMING / OVERRIDE NOTES (also surfaced in the manifest `issues`):
--   * `action` column type: the task brief mandates an `audit_action` ENUM;
--     canonical doc 01 §6.8 specifies `action text`. The ENUM wins (brief OVERRIDE).
--     To stay compatible with the already-written foundation inserts — which emit
--     bare text literals 'marketer.place', 'marketer.move', 'prospect.stage_change',
--     'invitation.create', 'account.activate', 'invitation.revoke' — every one of
--     those strings is an enum member, so the literals implicit-cast cleanly.
--   * No ordering hazard: 0004/0007/0012 wrap their audit inserts in
--     `IF to_regclass('public.audit_log') IS NOT NULL` (false until THIS file
--     runs), so at migration time they are no-ops; at runtime the enum exists.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- audit_action — the canonical sensitive-action vocabulary.
-- Created idempotently (matches the 0002 enum pattern) so a clean `db reset`
-- is re-runnable. Values = doc 10 §5.1 table UNION the strings the foundation
-- RPCs/triggers already emit (0004/0007/0012). Adding new actions later is an
-- ALTER TYPE ... ADD VALUE migration.
-- -----------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE audit_action AS ENUM (
    -- marketers / genealogy
    'marketer.create',          -- profile created
    'marketer.place',           -- profile placed at an exact (parent,leg) slot (place_marketer, 0004)
    'marketer.move',            -- placement move / re-parent (move_marketer, 0004)
    'marketer.status_change',   -- status change (suspend/activate profile)
    'rank.change',              -- rank change (mirrors rank_history)
    -- prospects / funnel
    'prospect.stage_change',    -- 6-stage journey transition (change_prospect_stage, 0012)
    -- account lifecycle / invitations
    'invitation.create',        -- invitation issued (create_invitation, 0007)
    'invitation.revoke',        -- invitation revoked (revoke_invitation, 0007)
    'account.activate',         -- CRM-access activation (accept_invitation, 0007)
    -- memberships
    'membership.role_change',       -- role before/after
    'membership.permissions_change',-- permissions before/after
    'membership.status_change',     -- membership suspended/disabled/reactivated
    -- bulk CRM ops
    'contacts.bulk_update',     -- bulk contact mutation
    'contacts.bulk_delete',     -- bulk contact (soft) delete
    -- documents
    'document.publish',         -- document published
    'document.archive',         -- document archived
    -- org
    'organization.update',      -- org settings change
    -- auth-adjacent (actor/system flagged; PII redacted by the writer)
    'auth.email_change',        -- login email change (redacted)
    'auth.refresh_reuse'        -- refresh-token reuse detected (system flag)
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON TYPE audit_action IS
  'Canonical sensitive-action vocabulary for audit_log.action (doc 10 §5.1). Includes every string emitted by the foundation RPCs/triggers (marketer.place/move, prospect.stage_change, invitation.create/revoke, account.activate). Task brief OVERRIDE of doc 01 §6.8 `action text`.';

-- -----------------------------------------------------------------------------
-- 6.8 audit_log — append-only audit trail. NO updated_at / deleted_at (doc 01).
-- actor_* are NULL for system/cron actions; before/after are JSON snapshots.
-- -----------------------------------------------------------------------------
CREATE TABLE public.audit_log (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id             uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,

  -- WHO acted (both nullable: NULL for system/cron). actor_marketer_id is the
  -- acting profile; actor_user_id is the auth.users login.
  actor_marketer_id  uuid REFERENCES public.marketers(id) ON DELETE SET NULL,
  actor_user_id      uuid REFERENCES auth.users(id)       ON DELETE SET NULL,

  -- WHAT happened.
  action             audit_action NOT NULL,
  entity_type        text NOT NULL,            -- table/entity affected, e.g. 'marketers'
  entity_id          uuid,                     -- affected row id (NULL for bulk/summary)

  -- BEFORE/AFTER snapshots (PII discipline: credentials/raw tokens never written).
  before             jsonb,
  after              jsonb,

  -- WHERE from (forwarded client IP; doc 10 OQ#10).
  ip_address         inet,

  created_at         timestamptz NOT NULL DEFAULT now()
  -- Intentionally NO updated_at / deleted_at: this table is APPEND-ONLY (doc 01 §6.8).
);

COMMENT ON TABLE public.audit_log IS
  'Append-only audit trail of sensitive actions (doc 01 §6.8, doc 10 §5). Immutable: UPDATE/DELETE revoked (even from service_role) + blocked by trigger. Read = admins/owners/platform within org; writes only via log_audit()/audit_trigger() (SECURITY DEFINER) or the guarded foundation RPC inserts.';
COMMENT ON COLUMN public.audit_log.actor_marketer_id IS
  'Acting profile (current_marketer_id at write time). NULL for system/cron actions.';
COMMENT ON COLUMN public.audit_log.actor_user_id IS
  'Acting auth.users login (auth.uid() at write time). NULL for system/cron actions.';
COMMENT ON COLUMN public.audit_log.action IS
  'audit_action enum: the sensitive-action name (doc 10 §5.1), e.g. rank.change, marketer.move, invitation.create.';
COMMENT ON COLUMN public.audit_log.before IS
  'Pre-change JSON snapshot. NULL on pure-create actions. Credentials/raw tokens are NEVER written here (doc 10 §6.2).';
COMMENT ON COLUMN public.audit_log.after IS
  'Post-change JSON snapshot. NULL on pure-delete actions. Credentials/raw tokens are NEVER written here (doc 10 §6.2).';
COMMENT ON COLUMN public.audit_log.ip_address IS
  'Forwarded client IP (e.g. x-forwarded-for), set by the Edge/writer when available (doc 10 OQ#10).';

-- -----------------------------------------------------------------------------
-- Indexes (doc 01 §6.8: org timeline + entity lookup) + actor/org coverage.
-- -----------------------------------------------------------------------------
-- Org-scoped reverse-chronological scan (admin audit timeline).
CREATE INDEX audit_log_org_time_idx
  ON public.audit_log (org_id, created_at DESC);

-- "Show the history of THIS entity" lookups.
CREATE INDEX audit_log_entity_idx
  ON public.audit_log (org_id, entity_type, entity_id);

-- Filter the timeline by action type (e.g. all rank.change in an org).
CREATE INDEX audit_log_action_idx
  ON public.audit_log (org_id, action, created_at DESC);

-- Actor activity trail (who did what), FK coverage for actor_marketer_id.
CREATE INDEX audit_log_actor_idx
  ON public.audit_log (org_id, actor_marketer_id, created_at DESC)
  WHERE actor_marketer_id IS NOT NULL;

-- =============================================================================
-- log_audit() — the explicit SECURITY DEFINER writer (doc 10 §5.2).
-- Resolves org_id / actor_marketer_id / actor_user_id from the JWT and the
-- caller-provided client IP, then inserts ONE row. SECURITY DEFINER so it can
-- write audit_log even though `authenticated` has no INSERT grant/policy on the
-- table. org/actor are derived from the verified JWT (never from the caller's
-- body) so it cannot be used to forge cross-org/cross-actor audit entries.
-- Returns the new audit row id.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.log_audit(
  p_action       audit_action,
  p_entity_type  text,
  p_entity_id    uuid    DEFAULT NULL,
  p_before       jsonb   DEFAULT NULL,
  p_after        jsonb   DEFAULT NULL,
  p_ip_address   inet    DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org uuid := public.current_org_id();
  v_id  uuid;
BEGIN
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'log_audit: no org context (missing org_id claim)'
      USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.audit_log (
    org_id, actor_marketer_id, actor_user_id, action, entity_type, entity_id,
    before, after, ip_address
  ) VALUES (
    v_org, public.current_marketer_id(), auth.uid(), p_action, p_entity_type,
    p_entity_id, p_before, p_after, p_ip_address
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION public.log_audit(audit_action, text, uuid, jsonb, jsonb, inet) IS
  'Explicit audit writer (doc 10 §5.2). SECURITY DEFINER: resolves org_id/actor_marketer_id/actor_user_id from the JWT (never the caller body) and inserts one audit_log row. Used by application/Edge write paths that are not covered by the generic table trigger.';

-- =============================================================================
-- audit_trigger() — GENERIC row-level audit trigger function.
-- Attach to any tenant table to record INSERT/UPDATE/DELETE as audit_log rows.
-- Derives:
--   * action:      '<entity>.create' | '<entity>.update' | '<entity>.delete'
--                  where <entity> is the table name (TG_TABLE_NAME). The string
--                  must be a valid audit_action enum member — for the four
--                  attached tables below, generic verbs are NOT in the enum, so
--                  this trigger maps each table to its canonical action(s).
--   * org_id:      from the row's org_id column (every attached table has one).
--   * actor:       current_marketer_id() / auth.uid() (NULL for system/cron).
--   * before/after: to_jsonb(OLD) / to_jsonb(NEW), with sensitive columns redacted.
--
-- SECURITY DEFINER so it can INSERT into audit_log regardless of the writer's
-- (lack of) grant on that table. It NEVER mutates the audited row (returns
-- OLD/NEW unchanged); attached AFTER the operation so the change is committed
-- to the same transaction as the audit row (atomic).
--
-- Redaction: token_hash, password, permissions-with-secrets are stripped from
-- the snapshots (doc 10 §6.2 — credentials/raw tokens are never audited).
-- =============================================================================
CREATE OR REPLACE FUNCTION public.audit_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org      uuid;
  v_entity   text := TG_TABLE_NAME;
  v_action   audit_action;
  v_entity_id uuid;
  v_before   jsonb;
  v_after    jsonb;
  -- Columns scrubbed from snapshots regardless of table (credentials/tokens).
  v_redact   text[] := ARRAY['token_hash', 'password', 'encrypted_password'];
BEGIN
  -- ---------------------------------------------------------------------------
  -- Resolve org_id + entity_id + snapshots from OLD/NEW.
  -- ---------------------------------------------------------------------------
  IF TG_OP = 'DELETE' THEN
    v_before    := to_jsonb(OLD) - v_redact;
    v_after     := NULL;
    v_org       := (to_jsonb(OLD) ->> 'org_id')::uuid;
    v_entity_id := (to_jsonb(OLD) ->> 'id')::uuid;
  ELSIF TG_OP = 'INSERT' THEN
    v_before    := NULL;
    v_after     := to_jsonb(NEW) - v_redact;
    v_org       := (to_jsonb(NEW) ->> 'org_id')::uuid;
    v_entity_id := (to_jsonb(NEW) ->> 'id')::uuid;
  ELSE  -- UPDATE
    v_before    := to_jsonb(OLD) - v_redact;
    v_after     := to_jsonb(NEW) - v_redact;
    v_org       := (to_jsonb(NEW) ->> 'org_id')::uuid;
    v_entity_id := (to_jsonb(NEW) ->> 'id')::uuid;
  END IF;

  -- ---------------------------------------------------------------------------
  -- Map (table, TG_OP, column deltas) -> canonical audit_action.
  -- Generic verbs aren't enum members, so each attached table is mapped to the
  -- canonical action vocabulary (doc 10 §5.1). Unknown combinations are skipped
  -- (return without writing) rather than raising, so auditing never blocks a
  -- legitimate write.
  -- ---------------------------------------------------------------------------
  IF v_entity = 'marketers' THEN
    IF TG_OP = 'INSERT' THEN
      v_action := 'marketer.create';
    ELSIF TG_OP = 'UPDATE' THEN
      IF NEW.rank IS DISTINCT FROM OLD.rank THEN
        v_action := 'rank.change';
      ELSIF NEW.parent_id IS DISTINCT FROM OLD.parent_id
            OR NEW.leg IS DISTINCT FROM OLD.leg THEN
        v_action := 'marketer.move';
      ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
        v_action := 'marketer.status_change';
      ELSE
        RETURN COALESCE(NEW, OLD);  -- non-sensitive profile edit: not audited here
      END IF;
    ELSE
      RETURN OLD;  -- marketers are soft-deleted; a hard DELETE is not expected
    END IF;

  ELSIF v_entity = 'memberships' THEN
    IF TG_OP = 'UPDATE' THEN
      IF NEW.role IS DISTINCT FROM OLD.role THEN
        v_action := 'membership.role_change';
      ELSIF NEW.permissions IS DISTINCT FROM OLD.permissions THEN
        v_action := 'membership.permissions_change';
      ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
        v_action := 'membership.status_change';
      ELSE
        RETURN NEW;  -- e.g. last_login_at touch: not a sensitive change
      END IF;
    ELSE
      RETURN COALESCE(NEW, OLD);  -- membership INSERT/DELETE audited by the lifecycle RPCs
    END IF;

  ELSIF v_entity = 'rank_history' THEN
    -- rank_history is append-only & system-written; mirror each new row as rank.change.
    IF TG_OP = 'INSERT' THEN
      v_action := 'rank.change';
    ELSE
      RETURN COALESCE(NEW, OLD);
    END IF;

  ELSIF v_entity = 'account_invitations' THEN
    IF TG_OP = 'INSERT' THEN
      v_action := 'invitation.create';
    ELSIF TG_OP = 'UPDATE' THEN
      IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status = 'revoked' THEN
        v_action := 'invitation.revoke';
      ELSIF NEW.status IS DISTINCT FROM OLD.status AND NEW.status = 'accepted' THEN
        v_action := 'account.activate';
      ELSE
        RETURN NEW;  -- expiry flip / housekeeping: not separately audited
      END IF;
    ELSE
      RETURN OLD;
    END IF;

  ELSE
    -- Unattached table (defensive): do not write an unknown action.
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- No org context on the row (should not happen for tenant tables): skip.
  IF v_org IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  INSERT INTO public.audit_log (
    org_id, actor_marketer_id, actor_user_id, action, entity_type, entity_id,
    before, after
  ) VALUES (
    v_org, public.current_marketer_id(), auth.uid(), v_action, v_entity, v_entity_id,
    v_before, v_after
  );

  RETURN COALESCE(NEW, OLD);
END;
$$;

COMMENT ON FUNCTION public.audit_trigger() IS
  'Generic AFTER row-level audit trigger (doc 10 §5). Maps (table, op, column deltas) to a canonical audit_action and writes a to_jsonb before/after snapshot (token_hash/password redacted) to audit_log. SECURITY DEFINER; never mutates the audited row. Attached to marketers, memberships, rank_history, account_invitations.';

-- -----------------------------------------------------------------------------
-- Attach the generic audit trigger to the sensitive tables (task spec).
-- AFTER each op so the change is already applied and shares the transaction.
-- -----------------------------------------------------------------------------
CREATE TRIGGER trg_audit_marketers
  AFTER INSERT OR UPDATE OR DELETE ON public.marketers
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger();

CREATE TRIGGER trg_audit_memberships
  AFTER INSERT OR UPDATE OR DELETE ON public.memberships
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger();

CREATE TRIGGER trg_audit_rank_history
  AFTER INSERT OR UPDATE OR DELETE ON public.rank_history
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger();

CREATE TRIGGER trg_audit_account_invitations
  AFTER INSERT OR UPDATE OR DELETE ON public.account_invitations
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger();

-- =============================================================================
-- Immutability (doc 10 §5.2): audit_log is APPEND-ONLY.
-- 1) A BEFORE UPDATE OR DELETE trigger raises unconditionally.
-- 2) UPDATE/DELETE are REVOKEd from authenticated AND service_role — so even the
--    RLS-bypassing service role cannot rewrite history. Inserts still flow via the
--    SECURITY DEFINER writer/triggers (which run as the function owner).
-- =============================================================================
CREATE OR REPLACE FUNCTION public.deny_audit_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is append-only (immutable); % is not permitted', TG_OP
    USING ERRCODE = '42501';
END;
$$;

COMMENT ON FUNCTION public.deny_audit_mutation() IS
  'Immutability guard for audit_log (doc 10 §5.2): raises on any UPDATE/DELETE. Belt-and-suspenders with the REVOKE of UPDATE/DELETE from authenticated AND service_role.';

CREATE TRIGGER trg_audit_immutable
  BEFORE UPDATE OR DELETE ON public.audit_log
  FOR EACH ROW EXECUTE FUNCTION public.deny_audit_mutation();

-- =============================================================================
-- Row-Level Security.
-- ENABLE + FORCE; tenant isolation via current_org_id(). READ is admin/owner/
-- platform ONLY (doc 01 §8, doc 10 §3.3.9) — members never read the raw audit log.
-- There is deliberately NO INSERT/UPDATE/DELETE policy for `authenticated`:
--   * writes flow through SECURITY DEFINER functions/triggers (run as owner), or
--     the service role (bypasses RLS);
--   * UPDATE/DELETE are additionally REVOKEd + trigger-blocked (immutable).
-- =============================================================================
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log FORCE  ROW LEVEL SECURITY;

-- READ: admins/owners/platform within their org only.
CREATE POLICY audit_log_admin_select ON public.audit_log
FOR SELECT TO authenticated
USING (
  org_id = public.current_org_id()
  AND public.is_org_admin()
);

-- (No INSERT/UPDATE/DELETE policies: default-deny for authenticated.)

-- =============================================================================
-- Grants (least-privilege; doc 10 §4.2 + §5.2).
-- authenticated may only SELECT (and only what the admin RLS policy permits).
-- UPDATE/DELETE are explicitly REVOKEd from BOTH authenticated and service_role
-- so audit history is immutable even to the RLS-bypassing service role.
-- INSERT is NOT granted to authenticated (writes go through SECURITY DEFINER
-- functions/triggers, owned by the migration role).
-- =============================================================================
GRANT SELECT ON public.audit_log TO authenticated;

REVOKE INSERT, UPDATE, DELETE ON public.audit_log FROM authenticated;
REVOKE UPDATE, DELETE          ON public.audit_log FROM service_role;

-- The explicit writer is callable by authenticated app paths and the service role.
REVOKE EXECUTE ON FUNCTION public.log_audit(audit_action, text, uuid, jsonb, jsonb, inet) FROM public;
GRANT  EXECUTE ON FUNCTION public.log_audit(audit_action, text, uuid, jsonb, jsonb, inet) TO authenticated, service_role;
