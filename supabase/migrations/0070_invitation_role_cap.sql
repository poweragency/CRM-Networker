-- =============================================================================
-- 0070_invitation_role_cap.sql
--
-- SECURITY FIX (privilege escalation). The account-invitation pipeline let the
-- caller choose the membership `role` to grant ('member' | 'manager' | 'admin')
-- and never capped it relative to the issuer. The eligibility guard checked the
-- issuer's RANK (>= team_leader) and subtree visibility, but NOT the role grade,
-- and accept_invitation writes role = invitation.role verbatim. So a non-admin
-- Team Leader could mint an invitation with role='admin' for a profile in their
-- own subtree, using an email they control, accept it, and become an org admin.
--
-- Fix: a non-admin issuer may only grant the base 'member' role. Admins/owners/
-- platform may grant any role. Re-applied inside the existing BEFORE INSERT
-- eligibility guard (the single chokepoint for both the server action and the
-- create-invitation Edge Function, since both INSERT into account_invitations).
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
  -- must be rank >= team_leader, able to see the target in their own subtree, AND
  -- may only grant the base 'member' role (no self-escalation to admin/manager).
  -- ---------------------------------------------------------------------------
  IF NOT public.is_org_admin() THEN
    -- Role cap (privilege-escalation fix): non-admins invite as 'member' only.
    IF NEW.role IS DISTINCT FROM 'member' THEN
      RAISE EXCEPTION
        'insufficient privilege: only an org admin may grant role % (non-admins may invite as member only)', NEW.role
        USING ERRCODE = '42501';
    END IF;

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
  'BEFORE INSERT guard on account_invitations (ADR-003, doc 01 §3.1). Enforces target CRM-eligibility (or crm_access override) AND issuer authority (admin/owner OR rank >= team_leader on own subtree) AND role cap (non-admins may grant role=member only; 0070). Defense-in-depth alongside create_invitation().';
