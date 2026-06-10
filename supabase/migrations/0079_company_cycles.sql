-- 0079: Cicli aziendali (28 giorni) al posto dei mesi solari per le statistiche live.
--
-- L'org configura un'ancora in organizations.settings->'cycle':
--   { "anchor_end": <timestamptz>, "anchor_number": <int> }
-- ovvero la DATA/ORA di fine del ciclo `anchor_number` (es. ciclo 78 finisce il
-- 2026-06-20 07:00). Ogni ciclo dura 28 giorni. Da qui si ricava il ciclo corrente.
-- Se non configurato, si FALLBACK al mese solare (nulla cambia finche' l'admin non
-- imposta il ciclo). L'admin modifica l'ancora dal menu Org (azzeramento dati).

-- ── Helpers ciclo ────────────────────────────────────────────────────────────

-- Inizio del ciclo che contiene p_at. Fallback: inizio mese solare.
CREATE OR REPLACE FUNCTION public.cycle_start(p_at timestamptz DEFAULT now())
RETURNS timestamptz
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_anchor timestamptz;
  v_len    interval := interval '28 days';
  v_end    timestamptz;
BEGIN
  SELECT (o.settings->'cycle'->>'anchor_end')::timestamptz
    INTO v_anchor
  FROM public.organizations o
  WHERE o.id = public.current_org_id();

  -- Default per OGNI org (anche quelle future): cicli di 28 giorni ancorati al
  -- riferimento aziendale (ciclo 78 -> 2026-06-20 07:00 Europe/Rome). Una singola
  -- org puo' allungare/spostare il proprio ciclo via settings.cycle (tasto admin).
  IF v_anchor IS NULL THEN
    v_anchor := timestamptz '2026-06-20 07:00:00+02';
  END IF;

  v_end := v_anchor;
  WHILE v_end <= p_at LOOP v_end := v_end + v_len; END LOOP;
  WHILE v_end - v_len > p_at LOOP v_end := v_end - v_len; END LOOP;
  RETURN v_end - v_len;
END;
$$;

-- Fine (esclusiva) del ciclo che contiene p_at = inizio + 28 giorni.
CREATE OR REPLACE FUNCTION public.cycle_end(p_at timestamptz DEFAULT now())
RETURNS timestamptz
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT public.cycle_start(p_at) + interval '28 days';
$$;

-- Numero del ciclo corrente (NULL se non configurato).
CREATE OR REPLACE FUNCTION public.cycle_number(p_at timestamptz DEFAULT now())
RETURNS int
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_anchor timestamptz;
  v_num    int;
  v_len    interval := interval '28 days';
  v_end    timestamptz;
  v_k      int := 0;
BEGIN
  SELECT (o.settings->'cycle'->>'anchor_end')::timestamptz,
         (o.settings->'cycle'->>'anchor_number')::int
    INTO v_anchor, v_num
  FROM public.organizations o
  WHERE o.id = public.current_org_id();

  -- Riferimento aziendale di default (ciclo 78 -> 2026-06-20 07:00) per le org
  -- senza override: il numero del ciclo e' sempre valorizzato (mai NULL).
  IF v_anchor IS NULL THEN v_anchor := timestamptz '2026-06-20 07:00:00+02'; END IF;
  IF v_num    IS NULL THEN v_num    := 78; END IF;

  v_end := v_anchor;
  WHILE v_end <= p_at LOOP v_end := v_end + v_len; v_k := v_k + 1; END LOOP;
  WHILE v_end - v_len > p_at LOOP v_end := v_end - v_len; v_k := v_k - 1; END LOOP;
  RETURN v_num + v_k;
END;
$$;

-- Comodo per il frontend: { inizio, fine, numero, configurato }.
CREATE OR REPLACE FUNCTION public.cycle_info()
RETURNS TABLE(cycle_start timestamptz, cycle_end timestamptz, cycle_number int, configured boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT public.cycle_start(now()), public.cycle_end(now()), public.cycle_number(now()),
         (SELECT (o.settings->'cycle'->>'anchor_end') IS NOT NULL
          FROM public.organizations o WHERE o.id = public.current_org_id());
$$;

REVOKE EXECUTE ON FUNCTION public.cycle_start(timestamptz)  FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.cycle_end(timestamptz)    FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.cycle_number(timestamptz) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.cycle_info()              FROM public, anon;
GRANT  EXECUTE ON FUNCTION public.cycle_start(timestamptz)  TO authenticated;
GRANT  EXECUTE ON FUNCTION public.cycle_end(timestamptz)    TO authenticated;
GRANT  EXECUTE ON FUNCTION public.cycle_number(timestamptz) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.cycle_info()              TO authenticated;

-- ── RPC "del mese" -> "del ciclo": stessa logica, finestra = ciclo corrente ──

-- funnel_counts (iscrizioni headline su profilo/tree). Era date_trunc('month').
CREATE OR REPLACE FUNCTION public.funnel_counts(p_ids uuid[])
RETURNS TABLE(marketer_id uuid, prospects bigint, business_info bigint, iscrizioni bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
declare
  v_org   uuid := public.current_org_id();
  v_month timestamptz := public.cycle_start(now());
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

-- subtree_funnel (roll-up iscrizioni sull'albero).
CREATE OR REPLACE FUNCTION public.subtree_funnel(p_ids uuid[])
RETURNS TABLE(marketer_id uuid, prospects bigint, business_info bigint, iscrizioni bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
declare
  v_org   uuid := public.current_org_id();
  v_month timestamptz := public.cycle_start(now());
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

-- top_zoom_month (dashboard "migliori": Zoom del ciclo).
CREATE OR REPLACE FUNCTION public.top_zoom_month(p_limit int default 5)
RETURNS TABLE(marketer_id uuid, display_name text, rank marketer_rank,
              present_count bigint, cam_count bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
declare
  v_org   uuid    := public.current_org_id();
  v_me    uuid    := public.current_marketer_id();
  v_admin boolean := public.is_org_admin();
  v_from  date    := public.cycle_start(now())::date;
  v_to    date    := public.cycle_end(now())::date;
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

-- top_percorsi_month (dashboard "migliori": percorsi del ciclo).
CREATE OR REPLACE FUNCTION public.top_percorsi_month(p_limit int default 5)
RETURNS TABLE(marketer_id uuid, display_name text, rank marketer_rank, cnt bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
declare
  v_org   uuid      := public.current_org_id();
  v_me    uuid      := public.current_marketer_id();
  v_admin boolean   := public.is_org_admin();
  v_from  timestamptz := public.cycle_start(now());
  v_to    timestamptz := public.cycle_end(now());
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

-- top_conversion_month (dashboard "migliori": conversione del ciclo).
CREATE OR REPLACE FUNCTION public.top_conversion_month(p_limit int default 5)
RETURNS TABLE(marketer_id uuid, display_name text, rank marketer_rank,
              enrolled bigint, resolved bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
declare
  v_org   uuid      := public.current_org_id();
  v_me    uuid      := public.current_marketer_id();
  v_admin boolean   := public.is_org_admin();
  v_from  timestamptz := public.cycle_start(now());
  v_to    timestamptz := public.cycle_end(now());
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
