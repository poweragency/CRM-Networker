-- 0082: i Team Leader (e rank superiori) diventano AUTOMATICAMENTE co-admin.
--
-- Invece di assegnare il ruolo a mano (sezione Ruoli, ora rimossa), deriviamo il
-- co_admin dal RANK direttamente nell'access-token hook: se il ruolo di membership
-- è 'member' e il rank è >= Team Leader (per sort_order in ranks_meta), il JWT porta
-- app_role = 'co_admin'. I ruoli superiori (owner/admin/manager) restano invariati.
-- Effetto "appena raggiunto il rank": al successivo refresh del token (o login).

CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid          uuid := (event -> 'claims' ->> 'sub')::uuid;
  v_claims       jsonb := event -> 'claims';
  v_membership   record;
  v_crm_access   boolean;
  v_is_platform  boolean;
  v_app_role     text;
  v_tl_order     int;
BEGIN
  v_is_platform := EXISTS (SELECT 1 FROM public.platform_admins pa WHERE pa.user_id = v_uid);
  SELECT m.org_id, m.marketer_id, m.role, m.status, m.permissions,
         mk.rank, rm.crm_eligible, rm.sort_order
    INTO v_membership
  FROM public.memberships m
  JOIN public.marketers   mk ON mk.id   = m.marketer_id
  JOIN public.ranks_meta  rm ON rm.rank = mk.rank
  WHERE m.user_id = v_uid
    AND m.deleted_at IS NULL
  ORDER BY (m.status = 'active') DESC, m.created_at ASC
  LIMIT 1;
  IF v_membership.marketer_id IS NULL THEN
    v_claims := v_claims || jsonb_build_object('is_platform_admin', v_is_platform);
    RETURN jsonb_set(event, '{claims}', v_claims);
  END IF;
  v_crm_access := COALESCE(v_membership.crm_eligible, false)
                  OR COALESCE((v_membership.permissions ->> 'crm_access')::boolean, false);

  -- Effective app role: rank Team Leader and above are AUTOMATICALLY co-admin
  -- (team-scoped powers), unless already a higher role (owner/admin/manager).
  v_app_role := v_membership.role;
  IF v_membership.role = 'member' THEN
    SELECT sort_order INTO v_tl_order FROM public.ranks_meta WHERE rank = 'team_leader';
    IF v_tl_order IS NOT NULL AND v_membership.sort_order >= v_tl_order THEN
      v_app_role := 'co_admin';
    END IF;
  END IF;

  -- NOTE: intentionally NOT setting 'role' — PostgREST needs it = 'authenticated'.
  v_claims := v_claims
    || jsonb_build_object(
         'org_id',            v_membership.org_id,
         'marketer_id',       v_membership.marketer_id,
         'app_role',          v_app_role,
         'rank',              v_membership.rank,
         'crm_access',        v_crm_access,
         'membership_status', v_membership.status,
         'is_platform_admin', v_is_platform
       );
  RETURN jsonb_set(event, '{claims}', v_claims);
END;
$$;
