-- 0089: il bucket `org-assets` diventa PRIVATO. I file (loghi org, documenti,
-- libri) non sono più accessibili via URL pubblico: si leggono solo con signed
-- URL generati lato server dal client RLS, quindi la firma è limitata alla
-- propria org. Aggiunge la policy SELECT org-scoped (prima i read passavano dal
-- bucket pubblico, quindi non esisteva una policy di lettura).
UPDATE storage.buckets SET public = false WHERE id = 'org-assets';

DROP POLICY IF EXISTS org_assets_auth_select ON storage.objects;
CREATE POLICY org_assets_auth_select ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'org-assets'
  AND (storage.foldername(name))[1] = (public.current_org_id())::text
);
