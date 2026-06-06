-- 0049: register the 'cliente' / 'no_rank' ranks in ranks_meta (added to the enum
-- in 0048). They sort BELOW executive (sort_order -1 / 0) and are NOT CRM-eligible
-- — i.e. they get the limited view (Profilo + Informativa only). Idempotent.
INSERT INTO public.ranks_meta (rank, sort_order, label_it, crm_eligible) VALUES
  ('cliente', -1, 'Cliente', false),
  ('no_rank',  0, 'No Rank', false)
ON CONFLICT (rank) DO UPDATE
  SET sort_order = EXCLUDED.sort_order,
      label_it   = EXCLUDED.label_it,
      crm_eligible = EXCLUDED.crm_eligible;
