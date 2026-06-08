-- 0068: hardening — remove anon's ability to call the data/report/write RPCs.
--
-- These SECURITY DEFINER functions are already internally gated (they need a
-- marketer_id/org claim to return anything), but EXECUTE was granted to PUBLIC by
-- default, so an unauthenticated (anon) caller could still invoke them. Defense in
-- depth: revoke from PUBLIC + anon, keep authenticated. (invitation_context and the
-- internal helpers are intentionally left callable — the invite flow runs pre-login.)
-- Already applied to prod via the Supabase MCP; this file keeps the repo in sync.

do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'roster_page','team_summary','team_counts','funnel_counts','subtree_funnel',
        'team_notification_feed','attendance_page','attendance_summary',
        'top_conversion_month','top_percorsi_month','top_zoom_month',
        'generate_monthly_report','audit_report_export','remove_marketer'
      )
  loop
    execute format('revoke execute on function %s from public, anon', r.sig);
    execute format('grant execute on function %s to authenticated', r.sig);
  end loop;
end $$;
