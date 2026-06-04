-- =============================================================================
-- File 0028 — Seed ranks_meta for the three executive ranks (0027)
-- Purpose: Register the new top-tier ranks in the global rank ladder reference
--          with their sort_order (7..9), Italian label, and CRM-eligibility.
--          All three are CRM-eligible (consultant upward is CRM-eligible).
--
-- Depends on: 0003_tenancy_identity.sql (ranks_meta),
--             0027_executive_ranks.sql   (the enum values — must be COMMITTED
--                                          before this migration uses them).
-- =============================================================================

INSERT INTO public.ranks_meta (rank, sort_order, label_it, crm_eligible) VALUES
  ('senior_vice_president',    7, 'Senior Vice President',    true),
  ('executive_vice_president', 8, 'Executive Vice President', true),
  ('global_director',          9, 'Global Director',          true)
ON CONFLICT (rank) DO NOTHING;
