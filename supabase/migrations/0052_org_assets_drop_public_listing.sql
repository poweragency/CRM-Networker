-- 0052: drop the broad public SELECT policy on the org-assets bucket (audit M27
-- public_bucket_allows_listing). The bucket is marked public=true, so direct
-- object access via the public URL (getPublicUrl → /object/public/...) still works
-- WITHOUT this policy — it only enabled enumerating/listing every file, which the
-- app never does. Removing it stops cross-tenant file enumeration.
DROP POLICY IF EXISTS org_assets_public_read ON storage.objects;
