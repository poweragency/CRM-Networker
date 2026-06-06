-- 0050: DB security hardening (audit M27/B32/M53/B31/A3). No app behavior change:
-- pins function search_path, removes direct EXECUTE on trigger functions + the
-- audit writer, forces RLS on org_documents, and scopes storage WRITES per-org
-- (public READ kept so logos/documents still resolve via their public URLs).

-- 1) Pin search_path on the app's OWN functions lacking one (skip extension fns,
--    e.g. ltree/pg_trgm installed in public).
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prokind = 'f'
      AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e')
      AND NOT EXISTS (SELECT 1 FROM unnest(coalesce(p.proconfig,'{}')) c WHERE c LIKE 'search_path=%')
  LOOP
    EXECUTE format('ALTER FUNCTION public.%I(%s) SET search_path = public, extensions', r.proname, r.args);
  END LOOP;
END $$;

-- 2) Trigger functions + log_audit must not be callable as RPC by API roles.
--    Triggers still fire on DML regardless of EXECUTE grants.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e')
      AND (p.prorettype = 'pg_catalog.trigger'::regtype OR p.proname = 'log_audit')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.sig);
  END LOOP;
END $$;

-- 3) Force RLS on org_documents (consistency with every other table).
ALTER TABLE public.org_documents FORCE ROW LEVEL SECURITY;

-- 4) Per-org scoping of storage writes (paths are `<org_id>/...`).
DROP POLICY IF EXISTS org_assets_auth_insert ON storage.objects;
DROP POLICY IF EXISTS org_assets_auth_update ON storage.objects;
DROP POLICY IF EXISTS org_assets_auth_delete ON storage.objects;

CREATE POLICY org_assets_auth_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'org-assets' AND (storage.foldername(name))[1] = public.current_org_id()::text);
CREATE POLICY org_assets_auth_update ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'org-assets' AND (storage.foldername(name))[1] = public.current_org_id()::text)
  WITH CHECK (bucket_id = 'org-assets' AND (storage.foldername(name))[1] = public.current_org_id()::text);
CREATE POLICY org_assets_auth_delete ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'org-assets' AND (storage.foldername(name))[1] = public.current_org_id()::text);
