-- 0060: funnel_counts — per-marketer funnel aggregates computed SERVER-SIDE.
--
-- WHY: the genealogy tree enriches every visible node with its funnel KPIs by
-- reading prospects + lista_contatti_entries for the WHOLE org in one client-side
-- `.in(ids)` query. Those reads are subject to PostgREST's row cap, so on a large
-- org the tree silently UNDERCOUNTS (esp. the Lista-100 contribution) and a node's
-- "prospect" number ends up lower than the person's real figure. Aggregating in
-- SQL removes the cap entirely and makes the count exact as the org grows.
--
-- It also centralizes the ONE definition of "prospect in ballo":
--   open prospects (outcome='open') + Lista-100 entries still in percorso
--   (percorso 1..4, stato not concluded). A live snapshot — NOT month-scoped.
-- business_info / iscrizioni are THIS MONTH's cohort (entered_funnel_at in the
-- current month) so the monthly conversion = iscritti(mese) / business-info(mese).
--
-- SECURITY DEFINER + a per-id can_see_marketer gate: a caller can only read counts
-- for marketers inside their own visible subtree (mirrors the table RLS), so it
-- can't be used to probe people outside the caller's line.

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
    select v.id
    from unnest(p_ids) as v(id)
    where public.can_see_marketer(v.id)
  ),
  prosp as (
    select p.owner_marketer_id as id,
      count(*) filter (where p.outcome = 'open')                          as open_now,
      count(*) filter (where p.entered_funnel_at >= v_month
                         and p.current_stage >= 'business_info')          as bi_month,
      count(*) filter (where p.entered_funnel_at >= v_month
                         and p.current_stage = 'iscrizione')              as isc_month
    from public.prospects p
    join vis on vis.id = p.owner_marketer_id
    where p.org_id = v_org and p.deleted_at is null
    group by p.owner_marketer_id
  ),
  lista as (
    select l.owner_marketer_id as id, count(*) as cnt
    from public.lista_contatti_entries l
    join vis on vis.id = l.owner_marketer_id
    where l.org_id = v_org and l.deleted_at is null
      and l.percorso between 1 and 4
      and (l.stato is null or l.stato not in ('iscritto', 'non_iscritto'))
    group by l.owner_marketer_id
  )
  select vis.id,
    coalesce(pr.open_now, 0) + coalesce(li.cnt, 0) as prospects,
    coalesce(pr.bi_month, 0)                       as business_info,
    coalesce(pr.isc_month, 0)                      as iscrizioni
  from vis
  left join prosp pr on pr.id = vis.id
  left join lista li on li.id = vis.id;
end;
$$;

grant execute on function public.funnel_counts(uuid[]) to authenticated;
