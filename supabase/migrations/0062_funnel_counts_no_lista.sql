-- 0062: "prospect in ballo" = ONLY open prospects in the kanban funnel.
--
-- Lista-100 entries are PRE-funnel contacts (a `percorso` step is the informational
-- path of a contact; "promote" creates a CONTACT, not a kanban prospect). They are
-- never in a kanban stage, so counting them as "in ballo" over-counted. Drop the
-- Lista-100 contribution: prospects = open rows in the `prospects` table only.
-- (business_info / iscrizioni stay this-month's cohort, unchanged.)

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
      count(*) filter (where p.entered_funnel_at >= v_month
                         and p.current_stage = 'iscrizione')              as isc_month
    from public.prospects p
    join vis on vis.id = p.owner_marketer_id
    where p.org_id = v_org and p.deleted_at is null
    group by p.owner_marketer_id
  )
  select vis.id,
    coalesce(pr.open_now, 0)  as prospects,
    coalesce(pr.bi_month, 0)  as business_info,
    coalesce(pr.isc_month, 0) as iscrizioni
  from vis
  left join prosp pr on pr.id = vis.id;
end;
$$;
