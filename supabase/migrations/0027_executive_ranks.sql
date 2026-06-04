-- =============================================================================
-- File 0027 — Executive ranks above Vice President
-- Purpose: Extend the marketer_rank ladder with the three top-tier ranks that
--          sit ABOVE vice_president:
--            7  senior_vice_president
--            8  executive_vice_president
--            9  global_director
--          All three are CRM-eligible (seeded in 0028_executive_ranks_meta.sql).
--
-- Depends on: 0002_enums.sql (marketer_rank).
--
-- NOTE: `ALTER TYPE ... ADD VALUE` may be run inside a transaction (PG12+) but the
-- new value CANNOT be USED in the same transaction. The ranks_meta seed that
-- references these values therefore lives in the SEPARATE 0028 migration, which
-- runs after this one has committed. IF NOT EXISTS keeps a clean reset idempotent.
-- =============================================================================

ALTER TYPE public.marketer_rank ADD VALUE IF NOT EXISTS 'senior_vice_president';
ALTER TYPE public.marketer_rank ADD VALUE IF NOT EXISTS 'executive_vice_president';
ALTER TYPE public.marketer_rank ADD VALUE IF NOT EXISTS 'global_director';
