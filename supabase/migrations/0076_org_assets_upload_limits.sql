-- 0076: server-side upload validation for the org-assets bucket (audit 9.1).
--
-- Uploads to org-assets happen DIRECTLY from the browser (supabase storage client),
-- so there is no server action to validate type/size. The correct server-side
-- enforcement for direct-to-storage uploads is the bucket policy itself: Supabase
-- Storage rejects any object whose MIME type / size is outside these bounds.
--
-- Allowed types = what the app actually uploads:
--   * logo:      image/png, image/jpeg, image/webp
--   * materiali: application/pdf, text/plain, text/csv, text/markdown
-- (SVG is intentionally NOT allowed: it can carry script and the bucket is public.)
-- Size cap: 50 MB per file.
--
-- Apply to prod via the Supabase MCP / `supabase db push`.

update storage.buckets
set
  file_size_limit = 52428800,  -- 50 MB
  allowed_mime_types = array[
    'image/png',
    'image/jpeg',
    'image/webp',
    'application/pdf',
    'text/plain',
    'text/csv',
    'text/markdown'
  ]
where id = 'org-assets';
