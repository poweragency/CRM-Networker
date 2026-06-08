-- 0069: RLS policy hygiene (advisor WARN: auth_rls_initplan + multiple_permissive).
-- Semantically IDENTICAL to before — only reorganized for the planner:
--   • memberships_select: JWT-reading functions wrapped in (select …) so they're
--     evaluated ONCE per query (initplan) instead of per row.
--   • the `FOR ALL` admin/platform write policies are split into INSERT/UPDATE/DELETE
--     so SELECT is served by a SINGLE permissive policy (no overlap).
-- Access rules are unchanged (verified: a member still sees only their own row;
-- admins still manage). Already applied to prod via MCP; file keeps the repo in sync.

alter policy memberships_select on public.memberships
  using (
    (select public.is_platform_admin())
    or ((org_id = (select public.current_org_id()))
        and ((user_id = (select auth.uid())) or (select public.is_org_admin())))
  );

drop policy memberships_admin_write on public.memberships;
create policy memberships_admin_insert on public.memberships for insert to authenticated
  with check ((select public.is_platform_admin()) or ((org_id = (select public.current_org_id())) and (select public.is_org_admin())));
create policy memberships_admin_update on public.memberships for update to authenticated
  using ((select public.is_platform_admin()) or ((org_id = (select public.current_org_id())) and (select public.is_org_admin())))
  with check ((select public.is_platform_admin()) or ((org_id = (select public.current_org_id())) and (select public.is_org_admin())));
create policy memberships_admin_delete on public.memberships for delete to authenticated
  using ((select public.is_platform_admin()) or ((org_id = (select public.current_org_id())) and (select public.is_org_admin())));

drop policy ranks_meta_platform_write on public.ranks_meta;
create policy ranks_meta_platform_insert on public.ranks_meta for insert to authenticated
  with check ((select public.is_platform_admin()));
create policy ranks_meta_platform_update on public.ranks_meta for update to authenticated
  using ((select public.is_platform_admin())) with check ((select public.is_platform_admin()));
create policy ranks_meta_platform_delete on public.ranks_meta for delete to authenticated
  using ((select public.is_platform_admin()));
