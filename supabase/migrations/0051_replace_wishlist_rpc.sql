-- 0051: atomic replace for the 100's list (audit A4). The data layer previously
-- DELETEd the whole list then re-INSERTed in two non-transactional round-trips, so
-- a failure mid-save permanently wiped the user's list. This RPC does it in ONE
-- transaction. SECURITY INVOKER → RLS still enforces that the caller may see the
-- owner and write their wishlist; org is derived from the (visible) owner row.
CREATE OR REPLACE FUNCTION public.replace_wishlist(p_owner uuid, p_items jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE v_org uuid;
BEGIN
  SELECT org_id INTO v_org
  FROM public.marketers
  WHERE id = p_owner AND deleted_at IS NULL;
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'replace_wishlist: owner % not found/visible', p_owner
      USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.wishlist_items WHERE owner_marketer_id = p_owner;

  INSERT INTO public.wishlist_items (org_id, owner_marketer_id, title, horizon, done, position)
  SELECT v_org, p_owner,
         left(coalesce(e->>'title',''), 300),
         coalesce(nullif(e->>'horizon',''), 'vicino'),
         coalesce((e->>'done')::boolean, false),
         (ord)::smallint
  FROM jsonb_array_elements(p_items) WITH ORDINALITY AS t(e, ord)
  WHERE coalesce(e->>'title','') <> '';
END $$;

REVOKE ALL ON FUNCTION public.replace_wishlist(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.replace_wishlist(uuid, jsonb) TO authenticated;
