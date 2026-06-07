-- 0061: scale-hardening aggregate RPCs.
--
-- Whole-org client reads (registry team sizes, dashboard leaderboards) were
-- aggregated in JS after a single SELECT → silently truncated by PostgREST's row
-- cap once the org grows. These functions aggregate SERVER-SIDE and return only the
-- small result the UI needs (per-id counts, or a top-N), so they're exact at any
-- size. All are SECURITY DEFINER and replicate the caller's visibility:
--   • team_counts: per-id gate via can_see_marketer.
--   • dashboard top-N: org-wide for admins, else the caller's subtree (closure).

-- ── team_counts ────────────────────────────────────────────────────────────
-- Per-marketer binary team size (+ left/right), same definition as get_subtree.
create or replace function public.team_counts(p_ids uuid[])
returns table(marketer_id uuid, team bigint, lft bigint, rgt bigint)
language plpgsql stable security definer set search_path to 'public'
as $$
declare v_org uuid := public.current_org_id();
begin
  return query
  with vis as (
    select v.id from unnest(p_ids) as v(id) where public.can_see_marketer(v.id)
  )
  select vis.id,
    count(cl.descendant_id)                                              as team,
    count(cl.descendant_id) filter (where cl.branch_leg = 'LEFT')        as lft,
    count(cl.descendant_id) filter (where cl.branch_leg = 'RIGHT')       as rgt
  from vis
  left join public.marketer_tree_closure cl
    on cl.org_id = v_org and cl.ancestor_id = vis.id and cl.depth >= 1
  group by vis.id;
end;
$$;
grant execute on function public.team_counts(uuid[]) to authenticated;

-- ── top_zoom_month ─────────────────────────────────────────────────────────
-- Top-N marketers by present Zoom this month (+ camera-on count), within scope.
create or replace function public.top_zoom_month(p_limit int default 5)
returns table(marketer_id uuid, display_name text, rank marketer_rank,
              present_count bigint, cam_count bigint)
language plpgsql stable security definer set search_path to 'public'
as $$
declare
  v_org   uuid    := public.current_org_id();
  v_me    uuid    := public.current_marketer_id();
  v_admin boolean := public.is_org_admin();
  v_from  date    := date_trunc('month', now())::date;
  v_to    date    := (date_trunc('month', now()) + interval '1 month')::date;
begin
  return query
  select m.id, m.display_name, m.rank,
    count(*)                          as present_count,
    count(*) filter (where z.cam)     as cam_count
  from public.marketers m
  join public.zoom_attendance z
    on z.marketer_id = m.id and z.present = true
   and z.call_date >= v_from and z.call_date < v_to
  where m.org_id = v_org and m.deleted_at is null
    and (v_admin or exists (
      select 1 from public.marketer_tree_closure cl
      where cl.ancestor_id = v_me and cl.descendant_id = m.id))
  group by m.id, m.display_name, m.rank
  order by present_count desc, m.display_name
  limit greatest(p_limit, 0);
end;
$$;
grant execute on function public.top_zoom_month(int) to authenticated;

-- ── top_percorsi_month ─────────────────────────────────────────────────────
-- Top-N by prospects entered this month (incl. deleted — "percorso fatto" counts).
create or replace function public.top_percorsi_month(p_limit int default 5)
returns table(marketer_id uuid, display_name text, rank marketer_rank, cnt bigint)
language plpgsql stable security definer set search_path to 'public'
as $$
declare
  v_org   uuid      := public.current_org_id();
  v_me    uuid      := public.current_marketer_id();
  v_admin boolean   := public.is_org_admin();
  v_from  timestamptz := date_trunc('month', now());
  v_to    timestamptz := date_trunc('month', now()) + interval '1 month';
begin
  return query
  select m.id, m.display_name, m.rank, count(*) as cnt
  from public.marketers m
  join public.prospects p
    on p.owner_marketer_id = m.id
   and p.entered_funnel_at >= v_from and p.entered_funnel_at < v_to
  where m.org_id = v_org and m.deleted_at is null
    and (v_admin or exists (
      select 1 from public.marketer_tree_closure cl
      where cl.ancestor_id = v_me and cl.descendant_id = m.id))
  group by m.id, m.display_name, m.rank
  order by cnt desc, m.display_name
  limit greatest(p_limit, 0);
end;
$$;
grant execute on function public.top_percorsi_month(int) to authenticated;

-- ── top_conversion_month ───────────────────────────────────────────────────
-- Top-N by Business-Info→Iscrizione conversion this month. Only resolved cohorts
-- count: enrolled = success, deleted-not-enrolled = failure; still-open excluded.
create or replace function public.top_conversion_month(p_limit int default 5)
returns table(marketer_id uuid, display_name text, rank marketer_rank,
              enrolled bigint, resolved bigint)
language plpgsql stable security definer set search_path to 'public'
as $$
declare
  v_org   uuid      := public.current_org_id();
  v_me    uuid      := public.current_marketer_id();
  v_admin boolean   := public.is_org_admin();
  v_from  timestamptz := date_trunc('month', now());
  v_to    timestamptz := date_trunc('month', now()) + interval '1 month';
begin
  return query
  with mp as (
    select p.owner_marketer_id as id,
      count(*) filter (where p.outcome = 'enrolled' or p.current_stage = 'iscrizione') as enr,
      count(*) filter (where p.deleted_at is not null
                         and not (p.outcome = 'enrolled' or p.current_stage = 'iscrizione')) as fail
    from public.prospects p
    where p.org_id = v_org
      and p.entered_funnel_at >= v_from and p.entered_funnel_at < v_to
    group by p.owner_marketer_id
  )
  select m.id, m.display_name, m.rank, mp.enr as enrolled, (mp.enr + mp.fail) as resolved
  from mp
  join public.marketers m on m.id = mp.id and m.org_id = v_org and m.deleted_at is null
  where (mp.enr + mp.fail) > 0
    and (v_admin or exists (
      select 1 from public.marketer_tree_closure cl
      where cl.ancestor_id = v_me and cl.descendant_id = m.id))
  order by (mp.enr::numeric / (mp.enr + mp.fail)) desc, (mp.enr + mp.fail) desc
  limit greatest(p_limit, 0);
end;
$$;
grant execute on function public.top_conversion_month(int) to authenticated;
