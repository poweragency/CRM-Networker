-- Make room (offset trick avoids the per-row unique collision on sort_order),
-- then register ranks_meta for the new rank (the JWT hook JOINs this — the row
-- is mandatory, else a marketer with this rank would get no claims at login).
UPDATE public.ranks_meta SET sort_order = sort_order + 100 WHERE sort_order >= 4;
UPDATE public.ranks_meta SET sort_order = sort_order - 99  WHERE sort_order >= 104;

INSERT INTO public.ranks_meta (rank, sort_order, label_it, crm_eligible)
VALUES ('advanced_team_leader', 4, 'Advanced Team Leader', true)
ON CONFLICT (rank) DO NOTHING;
