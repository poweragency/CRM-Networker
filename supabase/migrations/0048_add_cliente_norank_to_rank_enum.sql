-- 0048: add the two lowest marketer ranks the UI exposes — 'cliente' (a customer)
-- and 'no_rank' (registered but not yet ranked) — BELOW 'executive'. Application
-- code already depends on these enum members (session.asRank allow-list, the
-- limited-view gating in nav.ts / middleware.ts), so they MUST exist in the enum.
--
-- Kept in its own migration: Postgres allows ADD VALUE inside a transaction but
-- the new value cannot be USED in the same transaction — the ranks_meta rows that
-- reference them are inserted in 0049.
ALTER TYPE public.marketer_rank ADD VALUE IF NOT EXISTS 'cliente' BEFORE 'executive';
ALTER TYPE public.marketer_rank ADD VALUE IF NOT EXISTS 'no_rank' BEFORE 'executive';
