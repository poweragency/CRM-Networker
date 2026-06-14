-- 0088: fix platform_list_orgs(). auth.users.email è varchar(255) e
-- marketers.display_name è text; un RETURNS TABLE pretende il match ESATTO del
-- tipo, quindi senza cast espliciti l'RPC andava in errore a runtime
-- ("structure of query does not match function result type") e il pannello
-- super-admin vedeva la lista org VUOTA. Cast a text espliciti su tutte le
-- colonne testuali derivate.
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
    RETURN;
  END IF;
  RETURN QUERY
  SELECT
    o.id,
    o.name::text,
    o.slug::text,
    o.status::text,
    o.suspended_at,
    o.created_at,
    (
      SELECT count(*) FROM public.memberships m
      WHERE m.org_id = o.id AND m.deleted_at IS NULL AND m.status = 'active'
    )::bigint AS member_count,
    own.display_name::text AS owner_name,
    ownu.email::text       AS owner_email
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
