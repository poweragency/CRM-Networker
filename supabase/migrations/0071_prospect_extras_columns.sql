-- =============================================================================
-- 0071_prospect_extras_columns.sql
--
-- Persist the prospect "extra" fields shown on /percorso-prospect/[id]:
-- profilazione (free text) and pacchetto scelto. Until now these (plus `notes`,
-- which already existed) were kept only in a server in-memory map and returned
-- demo:true even with Supabase configured — so a save appeared to succeed but the
-- data was lost on restart and invisible to other sessions (silent data loss).
--
-- `notes` already exists on prospects; this adds the two missing columns. Writes
-- go through the existing prospects_update RLS policy (in-scope rows only).
-- starting_package mirrors marketers.starting_package: a free `text` value (not an
-- enum), matching the StartingPackage labels in the app.
-- =============================================================================
ALTER TABLE public.prospects
  ADD COLUMN IF NOT EXISTS profiling        text,
  ADD COLUMN IF NOT EXISTS starting_package text;

COMMENT ON COLUMN public.prospects.profiling IS
  'Free-text profilazione of the prospect, edited on the prospect detail page (0071).';
COMMENT ON COLUMN public.prospects.starting_package IS
  'Pacchetto scelto for the prospect (text, mirrors marketers.starting_package); edited on the prospect detail page (0071).';
