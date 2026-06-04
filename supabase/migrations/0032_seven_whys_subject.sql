-- =============================================================================
-- File 0032 — Add seven_whys.subject (the "tema centrale")
-- Purpose: The Sette Perché editor / data layer SELECT and upsert a `subject`
--          field (the central theme), but 0010 intentionally omitted it. As a
--          result every seven_whys query failed ("column seven_whys.subject does
--          not exist") and the page fell back to mock data. Add the nullable
--          column so reads succeed and the theme persists.
--
-- Depends on: 0010_seven_whys.sql (seven_whys).
-- =============================================================================

ALTER TABLE public.seven_whys ADD COLUMN IF NOT EXISTS subject text;
