-- 0065: attendance_page / attendance_summary — fast /presenze at scale.
--
-- Presenze loaded the WHOLE subtree (10k members, each with a present/cam object
-- per call) just to render a 60-card grid + compute the live "X/total present"
-- gauges. The payload (building + shipping 10k members) was the ~5s open cost.
--
-- Split it: the grid pages through members (attendance_page), and the day-wide
-- counters are computed server-side (attendance_summary) so they stay EXACT even
-- though the client only holds a page. Both are SECURITY DEFINER and reproduce
-- get_subtree's visibility (closure ancestor = caller, self included) without the
-- per-row RLS on marketers.

create or replace function public.attendance_page(
  p_date   date,
  p_search text default '',
  p_offset int  default 0,
  p_limit  int  default 100
)
returns table(
  id uuid, display_name text, rank marketer_rank, status marketer_status,
  present jsonb, cam jsonb, total bigint
)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_org  uuid := public.current_org_id();
  v_me   uuid := public.current_marketer_id();
  v_like text := case
    when coalesce(btrim(p_search), '') = '' then null
    else '%' || replace(replace(replace(p_search, '\', '\\'), '%', '\%'), '_', '\_') || '%'
  end;
begin
  return query
  with vis as (
    select m.id, m.display_name, m.rank, m.status
    from public.marketer_tree_closure cl
    join public.marketers m on m.id = cl.descendant_id and m.deleted_at is null
    where cl.org_id = v_org and cl.ancestor_id = v_me
      and (v_like is null or m.display_name ilike v_like)
  ),
  cnt as (select count(*) as total from vis),
  page as (
    select * from vis
    order by display_name, id
    offset greatest(p_offset, 0)
    limit least(greatest(p_limit, 1), 300)
  )
  select
    p.id, p.display_name, p.rank, p.status,
    coalesce((
      select jsonb_object_agg(za.call_id, za.present)
      from public.zoom_attendance za
      where za.org_id = v_org and za.marketer_id = p.id
        and za.call_date = p_date and za.call_id is not null
    ), '{}'::jsonb),
    coalesce((
      select jsonb_object_agg(za.call_id, za.cam)
      from public.zoom_attendance za
      where za.org_id = v_org and za.marketer_id = p.id
        and za.call_date = p_date and za.call_id is not null
    ), '{}'::jsonb),
    cnt.total
  from page p cross join cnt;
end;
$$;
grant execute on function public.attendance_page(date, text, int, int) to authenticated;

create or replace function public.attendance_summary(p_date date)
returns table(total_members bigint, present_counts jsonb, cam_counts jsonb)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_org uuid := public.current_org_id();
  v_me  uuid := public.current_marketer_id();
begin
  return query
  with vis as (
    select cl.descendant_id as id
    from public.marketer_tree_closure cl
    join public.marketers m on m.id = cl.descendant_id and m.deleted_at is null
    where cl.org_id = v_org and cl.ancestor_id = v_me
  ),
  att as (
    select za.call_id,
           count(*) filter (where za.present) as p,
           count(*) filter (where za.cam)     as c
    from public.zoom_attendance za
    join vis on vis.id = za.marketer_id
    where za.org_id = v_org and za.call_date = p_date and za.call_id is not null
    group by za.call_id
  )
  select
    (select count(*) from vis)::bigint,
    coalesce((select jsonb_object_agg(call_id, p) from att), '{}'::jsonb),
    coalesce((select jsonb_object_agg(call_id, c) from att), '{}'::jsonb);
end;
$$;
grant execute on function public.attendance_summary(date) to authenticated;
