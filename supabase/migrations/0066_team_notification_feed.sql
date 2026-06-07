-- 0066: team_notification_feed — fast login (the layout's notification bell).
--
-- The (app) layout builds the notification inbox on every FULL page load (i.e. at
-- login). It did so by (a) loading ALL marketers to find today's birthdays and
-- (b) `.in('id', <up to 10k ids>)` to find recent joins — both whole-org scans with
-- per-row RLS (~700ms each) + a multi-KB URL. This SECURITY DEFINER feed evaluates
-- the downline ONCE (closure, depth >= 1) and returns only the few matching rows
-- (recent joins + today's birthdays), so the bell costs ~ms instead of seconds.

create or replace function public.team_notification_feed(p_new_days int default 7)
returns table(kind text, marketer_id uuid, display_name text, created_at timestamptz)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_org uuid        := public.current_org_id();
  v_me  uuid        := public.current_marketer_id();
  v_cut timestamptz := now() - make_interval(days => greatest(p_new_days, 0));
begin
  return query
  with team as (
    select cl.descendant_id as id
    from public.marketer_tree_closure cl
    where cl.org_id = v_org and cl.ancestor_id = v_me and cl.depth >= 1
  ),
  fam as (
    select m.id, m.created_at, m.birth_date,
           coalesce(
             nullif(m.display_name, ''),
             nullif(btrim(coalesce(m.first_name, '') || ' ' || coalesce(m.last_name, '')), '')
           ) as name
    from team
    join public.marketers m on m.id = team.id and m.deleted_at is null
  )
  -- Cap each kind so a big intake (or a seed that just created everyone) can't flood
  -- the bell or blow up the notification_state lookup that follows.
  (
    select 'new_member'::text, f.id, f.name, f.created_at
    from fam f
    where f.created_at >= v_cut
    order by f.created_at desc
    limit 50
  )
  union all
  (
    select 'birthday'::text, f.id, f.name, f.created_at
    from fam f
    where f.birth_date is not null
      and extract(month from f.birth_date) = extract(month from now())
      and extract(day   from f.birth_date) = extract(day   from now())
    order by f.created_at desc
    limit 50
  );
end;
$$;
grant execute on function public.team_notification_feed(int) to authenticated;
