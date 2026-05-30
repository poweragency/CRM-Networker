-- =============================================================================
-- File 0007 — Account Lifecycle (CRM-access activation)
-- Purpose: GROUP 3 — the "Activate CRM Access" workflow (doc 01 §3, ADR-003).
--          * account_invitations table (token_hash, email, target marketer_id,
--            status, expiry, invited_by, role/permissions to grant on accept).
--          * Eligibility-guard trigger (ADR-003 + doc 01 §3.1): the issuer's rank
--            must be >= team_leader within their own visible subtree, OR the
--            issuer is admin/owner/platform; AND the TARGET marketer must be
--            crm_eligible (ranks_meta) OR carry an explicit crm_access override
--            (Executive admin-override). Defense-in-depth alongside the RPC gate.
--          * create_invitation(...) RPC — server-side eligibility gate that
--            inserts the invitation (raw token hashing is the Edge Function's job;
--            this RPC accepts the already-hashed token).
--          * accept_invitation(p_token_hash, p_user_id) RPC — profile-preserving
--            activation: links auth.users to the EXISTING marketers profile via a
--            memberships row; NEVER recreates / touches the profile id or tree.
--          * revoke_invitation(...) / expire helper.
--          * ENABLE + FORCE RLS + policies (read: admins/owners/platform, or the
--            invited profile's upline; write: via the RPCs / admin).
--
-- Depends on: 0002_enums.sql        (invitation_status, membership_role,
--                                     membership_status, marketer_rank),
--             0003_tenancy_identity.sql (organizations, memberships, ranks_meta),
--             0004_marketers_tree.sql   (marketers, marketer_tree_closure),
--             0005_auth_visibility.sql  (current_org_id, current_marketer_id,
--                                        current_rank, can_see_marketer,
--                                        is_org_admin, is_platform_admin,
--                                        assert_caller_active),
--             0006_rls_core.sql         (set_updated_at trigger pattern)
--
-- ADR-003: account-activation rights are RANK-DERIVED, from an EXISTING profile.
--   Activate CRM access  <= owner/admin  OR  rank >= team_leader (own subtree).
--   There is NO can_invite flag. The v1 permission set is exactly four flags:
--   crm_access, export_enabled, manage_documents, view_branch_comparison.
--
-- ISSUES / FOLLOW-UP (also surfaced in the manifest):
--   * The auth.users creation + single-use raw-token mint + invitation email send
--     are a Deno Edge Function follow-up (`activate-account` / `create-invitation`,
--     doc 07 §4.1). This SQL provides only the transactional DB half: the RPC
--     gates + guards + the profile-preserving membership activation.
--   * audit_log is created in a later Group-6 migration. Per the foundation
--     convention (0004), audit inserts here are guarded with to_regclass so they
--     are a no-op until audit_log exists, and become active automatically after.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Token-ladder note: only the SHA-256 token_hash is ever stored (doc 01 §3.1).
-- The raw single-use token lives only in the invite email/URL; the Edge Function
-- hashes it and calls accept_invitation(p_token_hash, ...). The DB never sees the
-- raw token.
-- -----------------------------------------------------------------------------

-- =============================================================================
-- 3.1 account_invitations — drives "Activate CRM Access".
-- An issuer ties an invitation to an EXISTING marketers profile (a "matrice").
-- On acceptance, a memberships row is activated linking that profile to the new
-- auth.users login — the profile is preserved, never recreated.
-- =============================================================================
CREATE TABLE public.account_invitations (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  marketer_id       uuid NOT NULL REFERENCES public.marketers(id)     ON DELETE CASCADE, -- profile being activated
  email             text NOT NULL,                 -- invitee login email
  token_hash        text NOT NULL,                 -- SHA-256 of the single-use token (raw never stored)
  role              membership_role   NOT NULL DEFAULT 'member',  -- role to grant on acceptance
  permissions       jsonb NOT NULL DEFAULT '{}'::jsonb,           -- e.g. {"crm_access": true} override for an Executive
  status            invitation_status NOT NULL DEFAULT 'pending',
  invited_by        uuid REFERENCES public.marketers(id) ON DELETE SET NULL, -- issuing marketer (NULL for admin/system)
  expires_at        timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  accepted_at       timestamptz,
  accepted_user_id  uuid REFERENCES auth.users(id) ON DELETE SET NULL,       -- set on accept
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT account_invitations_token_hash_uq UNIQUE (token_hash),
  CONSTRAINT account_invitations_email_len     CHECK (char_length(email) BETWEEN 3 AND 320)
);

COMMENT ON TABLE public.account_invitations IS
  'Drives the "Activate CRM Access" workflow (doc 01 §3, ADR-003). Each invitation attaches a login to an EXISTING marketers profile; acceptance activates a memberships row and never recreates the profile. Only token_hash (SHA-256) is stored.';
COMMENT ON COLUMN public.account_invitations.token_hash IS
  'SHA-256 of the single-use raw token (raw token never stored; minted/hashed by the Edge Function).';
COMMENT ON COLUMN public.account_invitations.permissions IS
  'Permission overrides to merge into the membership on acceptance, e.g. {"crm_access": true} to admin-enable an Executive (doc 01 §3.1).';
COMMENT ON COLUMN public.account_invitations.invited_by IS
  'Issuing marketer (recruiting upline). NULL for admin/owner/system-issued invitations.';

-- One LIVE (pending) invite per profile at a time (doc 01 §3.1). Re-issuing
-- requires revoking/expiring the prior one first.
CREATE UNIQUE INDEX account_invitations_one_pending_per_marketer
  ON public.account_invitations (org_id, marketer_id)
  WHERE status = 'pending';

-- FK / lookup indexes (every FK + org_id indexed, per conventions).
CREATE INDEX account_invitations_org_idx       ON public.account_invitations (org_id);
CREATE INDEX account_invitations_marketer_idx  ON public.account_invitations (org_id, marketer_id);
CREATE INDEX account_invitations_invited_by_idx ON public.account_invitations (org_id, invited_by);
CREATE INDEX account_invitations_status_idx    ON public.account_invitations (org_id, status);
CREATE INDEX account_invitations_email_idx     ON public.account_invitations (org_id, lower(email));
CREATE INDEX account_invitations_expiry_idx    ON public.account_invitations (status, expires_at)
  WHERE status = 'pending';

CREATE TRIGGER trg_account_invitations_updated_at
  BEFORE UPDATE ON public.account_invitations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =============================================================================
-- Eligibility guard — BEFORE INSERT trigger (ADR-003 + doc 01 §3.1).
-- Defense-in-depth: this fires for ANY insert path (RPC, raw PostgREST, admin
-- console) and rejects an invitation that violates either rule:
--
--   (A) TARGET eligibility: the target marketer must be CRM-eligible
--       (ranks_meta.crm_eligible = true, i.e. consultant..vice_president) OR the
--       invitation carries an explicit crm_access override (Executive admin
--       override). An Executive with no override is rejected.
--
--   (B) ISSUER authority: the caller must be admin/owner/platform, OR a member
--       whose rank >= team_leader AND who can see (own subtree) the target. The
--       rank threshold uses ranks_meta.sort_order so the ladder is never hard-
--       coded. team_leader is sort_order 3.
--
-- SECURITY DEFINER so the guard can read ranks_meta/marketers without depending
-- on the caller's RLS; it re-applies the tenant filter on every read.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.account_invitations_eligibility_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_target_rank        marketer_rank;
  v_target_eligible    boolean;
  v_override_crm       boolean;
  v_team_leader_order  smallint;
  v_caller_rank_order  smallint;
BEGIN
  -- The target profile must exist in the SAME org as the invitation (tenant safety).
  SELECT mk.rank
    INTO v_target_rank
  FROM public.marketers mk
  WHERE mk.id = NEW.marketer_id
    AND mk.org_id = NEW.org_id
    AND mk.deleted_at IS NULL;

  IF v_target_rank IS NULL THEN
    RAISE EXCEPTION 'invitation target % is not an active profile in org %',
      NEW.marketer_id, NEW.org_id
      USING ERRCODE = 'check_violation';
  END IF;

  -- ---------------------------------------------------------------------------
  -- (A) TARGET CRM-eligibility. crm_eligible OR an explicit crm_access override.
  -- ---------------------------------------------------------------------------
  SELECT rm.crm_eligible
    INTO v_target_eligible
  FROM public.ranks_meta rm
  WHERE rm.rank = v_target_rank;

  v_override_crm := COALESCE((NEW.permissions ->> 'crm_access')::boolean, false);

  IF NOT COALESCE(v_target_eligible, false) AND NOT v_override_crm THEN
    RAISE EXCEPTION
      'target marketer % (rank %) is not CRM-eligible; an admin crm_access override is required',
      NEW.marketer_id, v_target_rank
      USING ERRCODE = 'check_violation';
  END IF;

  -- ---------------------------------------------------------------------------
  -- (B) ISSUER authority. Admin/owner/platform always pass. Otherwise the caller
  -- must be rank >= team_leader AND able to see the target in their own subtree.
  -- ---------------------------------------------------------------------------
  IF NOT public.is_org_admin() THEN
    SELECT sort_order INTO v_team_leader_order
    FROM public.ranks_meta WHERE rank = 'team_leader';

    SELECT sort_order INTO v_caller_rank_order
    FROM public.ranks_meta
    WHERE rank = NULLIF(public.current_rank(), '')::marketer_rank;

    IF v_caller_rank_order IS NULL OR v_caller_rank_order < v_team_leader_order THEN
      RAISE EXCEPTION
        'insufficient rank to activate CRM access: requires rank >= team_leader (ADR-003)'
        USING ERRCODE = '42501';
    END IF;

    -- Scope: members may only activate within their OWN visible subtree.
    IF NOT public.can_see_marketer(NEW.marketer_id) THEN
      RAISE EXCEPTION
        'target marketer % is outside the issuer''s visible subtree (ADR-003)', NEW.marketer_id
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.account_invitations_eligibility_guard() IS
  'BEFORE INSERT guard on account_invitations (ADR-003, doc 01 §3.1). Enforces target CRM-eligibility (or crm_access override) AND issuer authority (admin/owner OR rank >= team_leader on own subtree). Defense-in-depth alongside create_invitation().';

CREATE TRIGGER trg_account_invitations_eligibility_guard
  BEFORE INSERT ON public.account_invitations
  FOR EACH ROW EXECUTE FUNCTION public.account_invitations_eligibility_guard();

-- =============================================================================
-- create_invitation() — the server-side gate that issues an invitation.
-- The Edge Function mints the raw single-use token, hashes it (SHA-256), sends
-- the email, and calls THIS to persist the invitation. The eligibility trigger
-- above re-validates everything; this RPC additionally:
--   * derives org_id + invited_by from the JWT (never trusts the client),
--   * re-checks the caller is active (defeats a stale JWT after suspension),
--   * normalizes a NULL permissions arg to '{}'.
-- Returns the new invitation id.
-- INVOKER (runs as authenticated, under RLS); the guard trigger is DEFINER.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.create_invitation(
  p_marketer_id  uuid,                                  -- existing profile to activate
  p_email        text,                                  -- invitee login email
  p_token_hash   text,                                  -- SHA-256 of the raw token (hashed by the Edge Fn)
  p_role         membership_role DEFAULT 'member',      -- role to grant on acceptance
  p_permissions  jsonb           DEFAULT '{}'::jsonb,   -- permission overrides (e.g. crm_access)
  p_expires_at   timestamptz     DEFAULT NULL           -- defaults to now() + 7 days when NULL
) RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_org   uuid := public.current_org_id();
  v_actor uuid := public.current_marketer_id();
  v_id    uuid;
BEGIN
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'create_invitation: no org context (missing org_id claim)'
      USING ERRCODE = '42501';
  END IF;

  -- Live membership re-check (doc 10 §4.4): a suspended caller with a still-valid
  -- JWT cannot issue activations.
  IF NOT public.assert_caller_active() THEN
    RAISE EXCEPTION 'create_invitation: caller membership is not active'
      USING ERRCODE = '42501';
  END IF;

  IF p_token_hash IS NULL OR char_length(p_token_hash) < 16 THEN
    RAISE EXCEPTION 'create_invitation: token_hash is required (hash the raw token in the Edge Function)'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Insert. The BEFORE INSERT eligibility guard enforces ADR-003 (target
  -- CRM-eligibility + issuer rank/subtree). A pending invite already existing for
  -- this profile raises a unique_violation on account_invitations_one_pending_per_marketer.
  INSERT INTO public.account_invitations (
    org_id, marketer_id, email, token_hash, role, permissions, status,
    invited_by, expires_at
  ) VALUES (
    v_org, p_marketer_id, p_email, p_token_hash, p_role,
    COALESCE(p_permissions, '{}'::jsonb), 'pending',
    v_actor, COALESCE(p_expires_at, now() + interval '7 days')
  )
  RETURNING id INTO v_id;

  -- Audit (guarded until audit_log exists — foundation convention, 0004).
  IF to_regclass('public.audit_log') IS NOT NULL THEN
    INSERT INTO public.audit_log (org_id, actor_marketer_id, actor_user_id, action,
                                  entity_type, entity_id, after)
    VALUES (v_org, v_actor, auth.uid(), 'invitation.create',
            'account_invitations', v_id,
            jsonb_build_object('marketer_id', p_marketer_id, 'email', p_email,
                               'role', p_role));
  END IF;

  RETURN v_id;
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'a pending invitation already exists for marketer % (revoke it first)', p_marketer_id
      USING ERRCODE = '23505';
END;
$$;

COMMENT ON FUNCTION public.create_invitation(uuid, text, text, membership_role, jsonb, timestamptz) IS
  'ADR-003 gate: issues an account_invitations row for an EXISTING profile. Derives org_id/invited_by from the JWT, re-checks the caller is active, then inserts (the BEFORE INSERT guard enforces target eligibility + issuer rank>=team_leader/subtree, or admin/owner). The raw token is minted+hashed by the Edge Function; this RPC stores only token_hash.';

-- =============================================================================
-- accept_invitation() — profile-preserving activation (the DB half; doc 07 §4.1).
-- Called by the activate-account Edge Function AFTER it has created the
-- auth.users login (service role) and hashed the raw token. In ONE transaction:
--   1) validate the token (hash match, status='pending', not expired),
--   2) flip the invitation to 'accepted' (+ accepted_at, accepted_user_id),
--   3) attach the login to the EXISTING marketers profile by activating its
--      memberships row (insert-or-update); the marketers row is NEVER written —
--      id / parent_id / leg / sponsor_id / path / rank / contacts / history all
--      survive untouched (profile != account, doc 01 §1.2/§3.1).
--
-- Idempotency (doc 07 §4.1): a retry with the same token whose invitation is
-- already 'accepted' for the same user is a no-op that returns the existing
-- membership id, instead of double-activating.
--
-- SECURITY DEFINER: must write memberships + auth-linked rows on behalf of an
-- as-yet-not-fully-authenticated invitee (the new login may not carry org claims
-- yet). It derives org/marketer strictly from the validated invitation row, never
-- from the caller — so it can never become a cross-org escalation. EXECUTE is
-- restricted to service_role + authenticated (the Edge Function calls it).
-- =============================================================================
CREATE OR REPLACE FUNCTION public.accept_invitation(
  p_token_hash text,           -- SHA-256 of the raw token (hashed by the Edge Function)
  p_user_id    uuid            -- the freshly-created auth.users id to link
) RETURNS uuid                 -- returns the activated membership id
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inv          public.account_invitations%ROWTYPE;
  v_membership_id uuid;
  v_base_perms    jsonb;
  v_merged_perms  jsonb;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'accept_invitation: p_user_id is required (create the auth.users login first)'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Lock the invitation row so concurrent accepts of the same token serialize.
  SELECT * INTO v_inv
  FROM public.account_invitations
  WHERE token_hash = p_token_hash
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'accept_invitation: invalid token'
      USING ERRCODE = 'no_data_found';
  END IF;

  -- Idempotent retry: already accepted by THIS user -> return existing membership.
  IF v_inv.status = 'accepted' THEN
    IF v_inv.accepted_user_id IS NOT DISTINCT FROM p_user_id THEN
      SELECT id INTO v_membership_id
      FROM public.memberships
      WHERE org_id = v_inv.org_id AND marketer_id = v_inv.marketer_id;
      RETURN v_membership_id;   -- no-op success
    END IF;
    RAISE EXCEPTION 'accept_invitation: invitation already accepted by another user'
      USING ERRCODE = 'unique_violation';
  END IF;

  IF v_inv.status <> 'pending' THEN
    RAISE EXCEPTION 'accept_invitation: invitation is % (not pending)', v_inv.status
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_inv.expires_at <= now() THEN
    -- Lazily flip to expired so the queue self-cleans, then reject.
    UPDATE public.account_invitations
      SET status = 'expired'
      WHERE id = v_inv.id;
    RAISE EXCEPTION 'accept_invitation: invitation expired at %', v_inv.expires_at
      USING ERRCODE = 'check_violation';
  END IF;

  -- ---------------------------------------------------------------------------
  -- Activate the membership — PROFILE-PRESERVING. We attach the login to the
  -- EXISTING marketers profile (v_inv.marketer_id). The marketers row is never
  -- touched. The membership is created-if-absent (pre-registration with no prior
  -- membership) or flipped to active (an 'invited' membership placeholder).
  -- Permission overrides on the invitation are merged onto the base flag set.
  -- ---------------------------------------------------------------------------
  v_base_perms := jsonb_build_object(
                    'crm_access',             false,
                    'export_enabled',         false,
                    'manage_documents',       false,
                    'view_branch_comparison', false
                  );
  v_merged_perms := v_base_perms || COALESCE(v_inv.permissions, '{}'::jsonb);

  INSERT INTO public.memberships (org_id, user_id, marketer_id, role, status, permissions)
  VALUES (v_inv.org_id, p_user_id, v_inv.marketer_id, v_inv.role, 'active', v_merged_perms)
  ON CONFLICT (org_id, marketer_id) DO UPDATE
    SET user_id     = EXCLUDED.user_id,
        role        = EXCLUDED.role,
        status      = 'active',
        -- Preserve any pre-set flags; layer the invitation's overrides on top.
        permissions = public.memberships.permissions || COALESCE(v_inv.permissions, '{}'::jsonb),
        deleted_at  = NULL,
        updated_at  = now()
  RETURNING id INTO v_membership_id;

  -- Mark the invitation consumed.
  UPDATE public.account_invitations
    SET status           = 'accepted',
        accepted_at      = now(),
        accepted_user_id = p_user_id
    WHERE id = v_inv.id;

  -- Audit (guarded until audit_log exists).
  IF to_regclass('public.audit_log') IS NOT NULL THEN
    INSERT INTO public.audit_log (org_id, actor_marketer_id, actor_user_id, action,
                                  entity_type, entity_id, after)
    VALUES (v_inv.org_id, v_inv.marketer_id, p_user_id, 'account.activate',
            'memberships', v_membership_id,
            jsonb_build_object('invitation_id', v_inv.id,
                               'marketer_id', v_inv.marketer_id,
                               'role', v_inv.role));
  END IF;

  RETURN v_membership_id;
END;
$$;

COMMENT ON FUNCTION public.accept_invitation(text, uuid) IS
  'Profile-preserving activation (DB half, doc 07 §4.1). Validates the token (hash/status/expiry) and activates the memberships row linking the new auth.users login to the EXISTING marketers profile. The marketers row is NEVER written. Idempotent on retry. SECURITY DEFINER; org/marketer derive only from the validated invitation row.';

-- =============================================================================
-- revoke_invitation() — admin/owner or the issuing upline cancels a pending
-- invite. Flips status to 'revoked'. INVOKER under RLS; the RLS write policy
-- (below) constrains who may touch the row.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.revoke_invitation(p_invitation_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_org uuid := public.current_org_id();
  v_marketer_id uuid;
BEGIN
  UPDATE public.account_invitations
    SET status = 'revoked'
    WHERE id = p_invitation_id
      AND org_id = v_org
      AND status = 'pending'
    RETURNING marketer_id INTO v_marketer_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'revoke_invitation: no pending invitation % in this org', p_invitation_id
      USING ERRCODE = 'no_data_found';
  END IF;

  IF to_regclass('public.audit_log') IS NOT NULL THEN
    INSERT INTO public.audit_log (org_id, actor_marketer_id, actor_user_id, action,
                                  entity_type, entity_id, after)
    VALUES (v_org, public.current_marketer_id(), auth.uid(), 'invitation.revoke',
            'account_invitations', p_invitation_id,
            jsonb_build_object('marketer_id', v_marketer_id));
  END IF;
END;
$$;

COMMENT ON FUNCTION public.revoke_invitation(uuid) IS
  'Cancels a pending account_invitation (status -> revoked) within the caller''s org. RLS bounds who may target the row (admins/owners or the invited profile''s upline).';

-- =============================================================================
-- expire_stale_invitations() — idempotent maintenance helper (pg_cron backstop).
-- Flips any pending invitation past its expires_at to 'expired'. SECURITY DEFINER
-- so the scheduled job (no JWT) can run it org-wide; it is read-only of identity.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.expire_stale_invitations()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  UPDATE public.account_invitations
    SET status = 'expired'
    WHERE status = 'pending'
      AND expires_at <= now();
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

COMMENT ON FUNCTION public.expire_stale_invitations() IS
  'Idempotent maintenance: flips pending invitations past expires_at to expired. Intended as a pg_cron backstop; accept_invitation also lazily expires on read.';

-- =============================================================================
-- RLS — enable + force + policies (doc 01 §8: admins/owners, or the invited
-- marketer's upline; create/manage restricted accordingly).
-- =============================================================================
ALTER TABLE public.account_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_invitations FORCE  ROW LEVEL SECURITY;

-- READ: same-org, and either admin/owner/platform OR the caller can see the
-- target profile (it is in their subtree — the invited marketer's upline).
CREATE POLICY account_invitations_select ON public.account_invitations
FOR SELECT TO authenticated
USING (
  org_id = public.current_org_id()
  AND (public.is_org_admin() OR public.can_see_marketer(marketer_id))
);

-- INSERT: same-org, caller active, and either admin/owner/platform OR a
-- rank>=team_leader upline (mirrors ADR-003). The eligibility-guard trigger is
-- the authoritative defense-in-depth; this WITH CHECK is the RLS-layer gate so a
-- raw PostgREST insert is also bounded. (create_invitation() is the normal path.)
CREATE POLICY account_invitations_insert ON public.account_invitations
FOR INSERT TO authenticated
WITH CHECK (
  org_id = public.current_org_id()
  AND public.current_membership_active()
  AND (
        public.is_org_admin()
     OR public.can_see_marketer(marketer_id)
  )
);

-- UPDATE: same-org; admins/owners/platform, or the invited profile's upline
-- (e.g. revoke). WITH CHECK keeps the row in-org. accept_invitation() runs
-- SECURITY DEFINER and bypasses this (it has no caller subtree).
CREATE POLICY account_invitations_update ON public.account_invitations
FOR UPDATE TO authenticated
USING      (org_id = public.current_org_id()
            AND (public.is_org_admin() OR public.can_see_marketer(marketer_id)))
WITH CHECK (org_id = public.current_org_id()
            AND (public.is_org_admin() OR public.can_see_marketer(marketer_id)));

-- DELETE: admins/owners/platform only. (Normal lifecycle is revoke, not delete.)
CREATE POLICY account_invitations_delete ON public.account_invitations
FOR DELETE TO authenticated
USING (org_id = public.current_org_id() AND public.is_org_admin());

-- =============================================================================
-- Grants (least-privilege; RLS narrows further).
-- =============================================================================
GRANT SELECT, INSERT, UPDATE, DELETE ON public.account_invitations TO authenticated;

-- RPC execute grants. accept_invitation runs SECURITY DEFINER and must be
-- callable by the Edge Function (service_role) and by an authenticated invitee
-- session; the others run under RLS as authenticated.
REVOKE EXECUTE ON FUNCTION public.create_invitation(uuid, text, text, membership_role, jsonb, timestamptz) FROM public;
GRANT  EXECUTE ON FUNCTION public.create_invitation(uuid, text, text, membership_role, jsonb, timestamptz) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.accept_invitation(text, uuid) FROM public;
GRANT  EXECUTE ON FUNCTION public.accept_invitation(text, uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.revoke_invitation(uuid) FROM public;
GRANT  EXECUTE ON FUNCTION public.revoke_invitation(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.expire_stale_invitations() FROM public;
GRANT  EXECUTE ON FUNCTION public.expire_stale_invitations() TO service_role;
