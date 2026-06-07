-- 0063: subtree_funnel — per-marketer funnel rolled up over the WHOLE subtree.
--
-- With the tree loaded lazily (only ~300 nodes + revealed paths) the client can no
-- longer sum a node's descendants to show "prospect = team total". This RPC computes
-- that roll-up SERVER-SIDE for a set of ids: for each id, the in-ballo prospects
-- (open) and this-month's BI/iscrizioni summed across its entire subtree (the node
-- itself + all descendants, via the closure incl. depth 0). One bounded query for
-- the loaded window (~600ms for 300 ids). SECURITY DEFINER + per-id can_see_marketer.

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
  roll as (
    select cl.ancestor_id as id,
      count(*) filter (where p.outcome = 'open')                          as open_now,
      count(*) filter (where p.entered_funnel_at >= v_month
                         and p.current_stage >= 'business_info')          as bi_month,
      count(*) filter (where p.entered_funnel_at >= v_month
                         and p.current_stage = 'iscrizione')              as isc_month
    from vis
    join public.marketer_tree_closure cl
      on cl.org_id = v_org and cl.ancestor_id = vis.id
    join public.prospects p
      on p.org_id = v_org and p.owner_marketer_id = cl.descendant_id
     and p.deleted_at is null
    group by cl.ancestor_id
  )
  select vis.id,
    coalesce(roll.open_now, 0)  as prospects,
    coalesce(roll.bi_month, 0)  as business_info,
    coalesce(roll.isc_month, 0) as iscrizioni
  from vis
  left join roll on roll.id = vis.id;
end;
$$;

grant execute on function public.subtree_funnel(uuid[]) to authenticated;
