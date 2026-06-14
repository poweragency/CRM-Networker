-- 0087: sospensione organizzazioni (mancato rinnovo) + RPC elenco org per il
-- super-admin (platform admin). La sospensione NON tocca i dati: blocca solo
-- l'accesso dei membri (gestito a livello app nel layout (app)).

-- 1) Stato dell'org. 'active' (default) | 'suspended'. + quando è stata sospesa.
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'suspended')),
  ADD COLUMN IF NOT EXISTS suspended_at timestamptz;

COMMENT ON COLUMN public.organizations.status IS
  'active | suspended. Sospesa (mancato rinnovo) = i membri vedono "Servizio momentaneamente non attivo"; i dati restano intatti.';

-- 2) Elenco org per il pannello super-admin. SECURITY DEFINER + gate interno
-- is_platform_admin() (un chiamante non-platform non riceve righe). Aggrega il
-- numero di membri attivi e l'owner (nome + email login) per la lista/ricerca.
CREATE OR REPLACE FUNCTION public.platform_list_orgs()
RETURNS TABLE(
  id           uuid,
  name         text,
  slug         text,
  status       text,
  suspended_at timestamptz,
  created_at   timestamptz,
  member_count bigint,
  owner_name   text,
  owner_email  text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN
    RETURN; -- nessuna riga per chi non è platform admin
  END IF;
  RETURN QUERY
  SELECT
    o.id, o.name, o.slug, o.status, o.suspended_at, o.created_at,
    (
      SELECT count(*) FROM public.memberships m
      WHERE m.org_id = o.id AND m.deleted_at IS NULL AND m.status = 'active'
    )::bigint AS member_count,
    own.display_name AS owner_name,
    ownu.email       AS owner_email
  FROM public.organizations o
  LEFT JOIN LATERAL (
    SELECT m.marketer_id, m.user_id
    FROM public.memberships m
    WHERE m.org_id = o.id AND m.role = 'owner' AND m.deleted_at IS NULL
    ORDER BY m.created_at ASC
    LIMIT 1
  ) ow ON true
  LEFT JOIN public.marketers own ON own.id = ow.marketer_id
  LEFT JOIN auth.users     ownu ON ownu.id = ow.user_id
  WHERE o.deleted_at IS NULL
  ORDER BY o.created_at DESC;
END $$;

REVOKE EXECUTE ON FUNCTION public.platform_list_orgs() FROM public, anon;
GRANT  EXECUTE ON FUNCTION public.platform_list_orgs() TO authenticated;

COMMENT ON FUNCTION public.platform_list_orgs() IS
  'Elenco organizzazioni per il super-admin (gate is_platform_admin). Nome/slug/stato/data + n. membri attivi + owner (nome/email).';
