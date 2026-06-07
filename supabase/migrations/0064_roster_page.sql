-- 0064: roster_page / team_summary — fast /statistiche at scale.
--
-- The marketers RLS policy evaluates can_see_marketer(id) PER ROW, so any whole-org
-- scan (the roster page sort, the count, the totals) costs ~700ms at 10k rows; the
-- page did 4 such scans → 3-5s. These SECURITY DEFINER RPCs evaluate visibility ONCE
-- (is_org_admin() into a variable; non-admins fall back to the subtree via closure)
-- and run the scan without per-row RLS → ~tens of ms. They reproduce exactly the
-- caller's visibility (admin = whole org, else own subtree), so they're safe.

create or replace function public.roster_page(
  p_search text default '',
  p_offset int default 0,
  p_limit  int default 50
)
returns table(
  id uuid, display_name text, rank marketer_rank, status marketer_status,
  starting_package text, phone text, city text, region text,
  registration_date date, team_size bigint, total bigint
)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_org   uuid    := public.current_org_id();
  v_me    uuid    := public.current_marketer_id();
  v_admin boolean := public.is_org_admin();
  v_like  text    := case
    when coalesce(btrim(p_search), '') = '' then null
    else '%' || replace(replace(replace(p_search, '\', '\\'), '%', '\%'), '_', '\_') || '%'
  end;
begin
  return query
  with vis as (
    select m.id, m.display_name, m.rank, m.status, m.starting_package,
           m.phone, m.city, m.region, m.registration_date
    from public.marketers m
    where m.org_id = v_org and m.deleted_at is null and m.id <> v_me
      and (v_admin or exists (
        select 1 from public.marketer_tree_closure c
        where c.org_id = v_org and c.ancestor_id = v_me and c.descendant_id = m.id))
      and (v_like is null
        or m.display_name ilike v_like or m.city ilike v_like or m.region ilike v_like)
  ),
  cnt as (select count(*) as total from vis)
  select v.id, v.display_name, v.rank, v.status, v.starting_package,
         v.phone, v.city, v.region, v.registration_date,
         (select count(*) from public.marketer_tree_closure tc
            where tc.org_id = v_org and tc.ancestor_id = v.id and tc.depth >= 1)::bigint,
         cnt.total
  from vis cross join cnt
  order by v.display_name, v.id
  offset greatest(p_offset, 0)
  limit least(greatest(p_limit, 1), 200);
end;
$$;
grant execute on function public.roster_page(text, int, int) to authenticated;

create or replace function public.team_summary()
returns table(total bigint, active bigint)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_org   uuid    := public.current_org_id();
  v_me    uuid    := public.current_marketer_id();
  v_admin boolean := public.is_org_admin();
begin
  return query
  with vis as (
    select m.status from public.marketers m
    where m.org_id = v_org and m.deleted_at is null and m.id <> v_me
      and (v_admin or exists (
        select 1 from public.marketer_tree_closure c
        where c.org_id = v_org and c.ancestor_id = v_me and c.descendant_id = m.id))
  )
  select count(*)::bigint, count(*) filter (where status = 'active')::bigint from vis;
end;
$$;
grant execute on function public.team_summary() to authenticated;
