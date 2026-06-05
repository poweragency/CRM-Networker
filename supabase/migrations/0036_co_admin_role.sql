-- Stage 2: introduce the co-admin role. Adding an enum value must be its own
-- migration (the new value can't be used in the same transaction that adds it).
ALTER TYPE public.membership_role ADD VALUE IF NOT EXISTS 'co_admin';
