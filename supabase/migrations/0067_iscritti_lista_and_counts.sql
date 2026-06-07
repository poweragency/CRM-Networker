-- 0067: "Iscritto" as a first-class monthly outcome shared by prospects AND Lista
-- contatti, with the counts synced everywhere.
--
-- • lista_contatti_entries.iscritto_at — when the entry was marked 'iscritto'
--   (the monthly-reset anchor for Lista-side enrollments). Cleared when the entry
--   leaves the 'iscritto' state.
-- • funnel_counts / subtree_funnel — "iscrizioni" (the headline iscritti number on
--   the profile / tree / branch summary) is now ENROLLED-THIS-MONTH and counts BOTH
--   real prospects (outcome 'enrolled', closed_at in the current month) AND Lista
--   contatti entries (stato 'iscritto', iscritto_at in the current month). The
--   conversion denominator (business_info) likewise folds in invited Lista contacts
--   that entered the funnel this month, so the ratio can't exceed 100%.
--   The live "prospects (in ballo)" metric is unchanged (open prospects only).

alter table public.lista_contatti_entries
  add column if not exists iscritto_at timestamptz;

-- Backfill existing enrollments so the monthly filter has an anchor.
update public.lista_contatti_entries
  set iscritto_at = updated_at
  where stato = 'iscritto' and iscritto_at is null;

create or replace function public.funnel_counts(p_ids uuid[])
returns table(marketer_id uuid, prospects bigint, business_info bigint, iscrizioni bigint)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_org   uuid := public.current_org_id();
  v_month timestamptz := date_trunc('month', now());
begin
  return query
  with vis as (
    select v.id from unnest(p_ids) as v(id) where public.can_see_marketer(v.id)
  ),
  prosp as (
    select p.owner_marketer_id as id,
      count(*) filter (where p.outcome = 'open')                          as open_now,
      count(*) filter (where p.entered_funnel_at >= v_month
                         and p.current_stage >= 'business_info')          as bi_month,
      count(*) filter (where p.outcome = 'enrolled'
                         and p.closed_at >= v_month)                      as isc_month
    from public.prospects p
    join vis on vis.id = p.owner_marketer_id
    where p.org_id = v_org and p.deleted_at is null
    group by p.owner_marketer_id
  ),
  lista as (
    select l.owner_marketer_id as id,
      count(*) filter (where l.created_at >= v_month
                         and coalesce(l.percorso, 0) >= 1
                         and l.stato in ('invitato', 'iscritto'))         as bi_month,
      count(*) filter (where l.stato = 'iscritto'
                         and l.iscritto_at >= v_month)                    as isc_month
    from public.lista_contatti_entries l
    join vis on vis.id = l.owner_marketer_id
    where l.org_id = v_org and l.deleted_at is null
    group by l.owner_marketer_id
  )
  select vis.id,
    coalesce(pr.open_now, 0)                              as prospects,
    coalesce(pr.bi_month, 0) + coalesce(li.bi_month, 0)  as business_info,
    coalesce(pr.isc_month, 0) + coalesce(li.isc_month, 0) as iscrizioni
  from vis
  left join prosp pr on pr.id = vis.id
  left join lista li on li.id = vis.id;
end;
$$;

create or replace function public.subtree_funnel(p_ids uuid[])
returns table(marketer_id uuid, prospects bigint, business_info bigint, iscrizioni bigint)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_org   uuid := public.current_org_id();
  v_month timestamptz := date_trunc('month', now());
begin
  return query
  with vis as (
    select v.id from unnest(p_ids) as v(id) where public.can_see_marketer(v.id)
  ),
  roll_p as (
    select cl.ancestor_id as id,
      count(*) filter (where p.outcome = 'open')                          as open_now,
      count(*) filter (where p.entered_funnel_at >= v_month
                         and p.current_stage >= 'business_info')          as bi_month,
      count(*) filter (where p.outcome = 'enrolled'
                         and p.closed_at >= v_month)                      as isc_month
    from vis
    join public.marketer_tree_closure cl
      on cl.org_id = v_org and cl.ancestor_id = vis.id
    join public.prospects p
      on p.org_id = v_org and p.owner_marketer_id = cl.descendant_id
     and p.deleted_at is null
    group by cl.ancestor_id
  ),
  roll_l as (
    select cl.ancestor_id as id,
      count(*) filter (where l.created_at >= v_month
                         and coalesce(l.percorso, 0) >= 1
                         and l.stato in ('invitato', 'iscritto'))         as bi_month,
      count(*) filter (where l.stato = 'iscritto'
                         and l.iscritto_at >= v_month)                    as isc_month
    from vis
    join public.marketer_tree_closure cl
      on cl.org_id = v_org and cl.ancestor_id = vis.id
    join public.lista_contatti_entries l
      on l.org_id = v_org and l.owner_marketer_id = cl.descendant_id
     and l.deleted_at is null
    group by cl.ancestor_id
  )
  select vis.id,
    coalesce(rp.open_now, 0)                              as prospects,
    coalesce(rp.bi_month, 0) + coalesce(rl.bi_month, 0)  as business_info,
    coalesce(rp.isc_month, 0) + coalesce(rl.isc_month, 0) as iscrizioni
  from vis
  left join roll_p rp on rp.id = vis.id
  left join roll_l rl on rl.id = vis.id;
end;
$$;
