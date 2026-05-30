# BUILD-REPORT — CRM Networker migration set (static review)

**Reviewer:** build-reviewer (static analysis; no live DB)
**Scope:** `supabase/migrations/0001…0020` (filename order), `supabase/config.toml`, `supabase/seed.sql`
**Canonical refs:** `docs/architecture/01-database-schema.md`, `docs/architecture/16-decision-log.md`
**Target:** clean `supabase db reset` on an empty Postgres 15 (Supabase) database.

---

## 1. Verdict

**READY (with open issues).**

The set is internally consistent and should run **top-to-bottom on a clean reset**:

- No forward references across files (every referenced table/column/enum/function is created in an
  earlier-numbered file or earlier in the same file; intra-file forward references are only
  function→function in PL/pgSQL bodies, which resolve at call time).
- No object is created twice. Every doc-01 table + the ADR-009 additions (`platform_admins`) and the
  additive reporting tables exist exactly once.
- Enum values match the canonical sets — the 6 journey stages, the 6 ranks, `LEFT`/`RIGHT`,
  `branch_side`, statuses — verbatim.
- RLS `ENABLE + FORCE` on **every** `public` tenant table (24/24); `app_private.dirty_metric_days`
  is correctly private (no RLS, not granted to app roles).
- ADRs honored: operator-driven `place_marketer` with **no** `find_open_slot`/spillover (ADR-001);
  **no** `can_invite`, exactly 4 permission flags (ADR-003); rank-gated activation; single
  `can_see_marketer()` visibility primitive; `app_private.dirty_metric_days` queue name (ADR-006);
  canonical JWT claim accessors + top-level `role` (ADR-007); MFA not enforced in SQL (ADR-004);
  pg_cron guarded (ADR/0001+0020).
- Dollar-quoting is balanced everywhere (distinct tags `$$` / `$q$` / `$cron_provision$` / `$seed$`);
  `SECURITY DEFINER` functions set `search_path`; PG15 features used (`UNIQUE NULLS NOT DISTINCT`,
  `security_invoker` views, generated columns) are valid on the locked PG15 stack.

The **open issues** below are functional/robustness gaps, not reset blockers. None were auto-fixed
because each requires a design decision that could regress the closure/tree machinery if guessed.

---

## 2. Per-file object inventory

| File | Tables / Views / Types created | Key functions / triggers | RLS |
|---|---|---|---|
| 0001_extensions | schema `app_private`; ext pgcrypto, ltree, btree_gist, pg_trgm | — | n/a |
| 0002_enums | 18 enums (membership_role/status, marketer_rank/status, placement_leg, invitation_status, contact_status/source, document_category/status, prospect_stage/outcome, call_type/outcome, report_period, leaderboard_metric/scope, bottleneck_type/severity, notification_type, branch_side) | — | n/a |
| 0003_tenancy_identity | organizations, platform_admins, ranks_meta (seeded), memberships | `set_updated_at()`; updated_at triggers | (deferred to 0006) |
| 0004_marketers_tree | marketers, marketer_tree_closure, rank_history | `uuid_label`, `marketers_cycle_guard`, `marketers_after_insert_tree`, `marketers_after_move_tree`, `marketers_rank_history_sync`, `place_marketer`, `move_marketer`; adds memberships.marketer_id FK | (deferred to 0006) |
| 0005_auth_visibility | — | `current_org_id/marketer_id/role/rank/membership_status/membership_active`, `is_platform_admin`, `is_org_admin`, `can_see_marketer`, `can_see_marketer_in_branch`, `assert_caller_active`, `custom_access_token_hook` | n/a |
| 0006_rls_core | — | `guard_marketer_structural_cols`; ENABLE+FORCE + policies for organizations, ranks_meta, platform_admins, memberships, marketers, marketer_tree_closure, rank_history | ✅ |
| 0007_account_lifecycle | account_invitations | `account_invitations_eligibility_guard`, `create_invitation`, `accept_invitation`, `revoke_invitation`, `expire_stale_invitations` | ✅ |
| 0008_contacts | contacts | updated_at trigger | ✅ |
| 0009_centos | centos_list_entries | updated_at trigger | ✅ |
| 0010_seven_whys | seven_whys | updated_at trigger | ✅ |
| 0011_documents | internal_documents, document_versions | `current_can_access_crm`, `current_can_manage_documents`, `documents_snapshot_version`, `save_document_version`, `duplicate_document` | ✅ |
| 0012_prospects_journey | prospects, prospect_journey_events | `prospects_open_first_event`, `change_prospect_stage` | ✅ |
| 0013_calls | calls | `calls_touch_last_interaction` | ✅ |
| 0014_notifications | notifications | — | ✅ |
| 0015_audit | type audit_action; audit_log | `log_audit`, `audit_trigger` (→ marketers/memberships/rank_history/account_invitations), `deny_audit_mutation` | ✅ (read = admin only; immutable) |
| 0016_analytics_facts | daily_marketer_metrics; app_private.dirty_metric_days (UNLOGGED) | `org_local_date`, `org_day_bounds`, `recompute_daily_marketer_metric`, 4× enqueue triggers, `drain_dirty_metric_days`, `rebuild_daily_metrics`, `subtree_metrics`, `branch_metrics`, `subtree_metrics_json` | ✅ (fact table) |
| 0017_analytics_views | mv_funnel_totals, mv_stage_conversion, v_*_secured views | `prospect_stage_order`, `refresh_funnel_mvs`, `refresh_funnel_analytics`, `funnel_totals_subtree`, `stage_conversion_subtree` | MV locked down; secured views security_invoker |
| 0018_leaderboards_bottlenecks | leaderboard_snapshots, bottleneck_findings | `org_bottleneck_settings`, `refresh_leaderboards`, `leaderboard_metric_values`, `leaderboard_scope_members`, `run_bottleneck_engine`, `bottleneck_severity_rank`, `run_bottleneck_rules` | ✅ (read subtree; system-written) |
| 0019_reporting | monthly_reports, report_export_jobs; types export_format/export_status; extends audit_action | `jsonb_delta(_pct)`, `period_bounds`, `generate_monthly_reports`, `report_metrics_direct`, `generate_monthly_report`, `build_*` (×6), `assemble_report_dataset`, `estimate_export_rows`, `enqueue_export_job`, `audit_report_export`, 4× cron bodies | ✅ |
| 0020_cron | — | `refresh_leaderboards_all_orgs`, `run_bottleneck_rules_all_orgs`, `enqueue_followups`, `schedule_cron_jobs`; **guarded** pg_cron provisioning DO block | n/a |

---

## 3. RLS coverage table

| Table | ENABLE+FORCE | SELECT predicate | Write guard |
|---|:---:|---|---|
| organizations | ✅ | `id = current_org_id()` OR platform | UPDATE/DELETE admin/owner/platform |
| ranks_meta | ✅ | `true` (global ref) | write platform only |
| platform_admins | ✅ | platform only | ALL platform only |
| memberships | ✅ | own row OR admin | ALL admin/owner/platform |
| marketers | ✅ | `current_org_id()` + `can_see_marketer(id)` | INSERT subtree+pending/executive; UPDATE in-scope (+ structural-col guard trigger); DELETE admin |
| marketer_tree_closure | ✅ | org + `can_see_marketer(descendant_id)` | trigger-only (no write policy) |
| rank_history | ✅ | org + `can_see_marketer(marketer_id)` | trigger-only |
| account_invitations | ✅ | org + (admin OR `can_see_marketer(marketer_id)`) | INSERT/UPDATE admin or upline; DELETE admin |
| contacts | ✅ | org + `can_see_marketer(owner_marketer_id)` | own-or-admin |
| centos_list_entries | ✅ | org + `can_see_marketer(owner_marketer_id)` | own-or-admin |
| seven_whys | ✅ | org + `can_see_marketer(marketer_id)` | **write-own** or admin (ADR-009 #7) |
| internal_documents | ✅ | org + `current_can_access_crm()` (org-wide) | `current_can_manage_documents()` OR admin |
| document_versions | ✅ | org + crm + parent doc visible | trigger/RPC-only (no write policy) |
| prospects | ✅ | org + `can_see_marketer(owner_marketer_id)` | own-or-admin |
| prospect_journey_events | ✅ | org + `can_see_marketer(responsible_marketer_id)` | INSERT/UPDATE in-scope; DELETE admin |
| calls | ✅ | org + `can_see_marketer(marketer_id)` | own-or-admin |
| notifications | ✅ | org + (admin OR `recipient = current_marketer_id()`) **strictly self** | INSERT admin; UPDATE/DELETE self-or-admin |
| audit_log | ✅ | org + `is_org_admin()` only | **no** write policy; UPDATE/DELETE revoked (incl. service_role) + trigger-blocked → immutable |
| daily_marketer_metrics | ✅ | org + `can_see_marketer(marketer_id)` | system-only (no write policy) |
| leaderboard_snapshots | ✅ | org + `can_see_marketer(marketer_id)` | system-only |
| bottleneck_findings | ✅ | org + `can_see_marketer(marketer_id)` | system-only |
| monthly_reports | ✅ | org + (admin for org row, else `can_see_marketer(marketer_id)`) | system-only |
| report_export_jobs | ✅ | org + (admin OR `requested_by = current_marketer_id()`) | INSERT self; UPDATE/DELETE self-or-admin |
| mv_funnel_totals / mv_stage_conversion | n/a (MV) | read only via `v_*_secured` (security_invoker) + DEFINER subtree fns; raw MV revoked from app roles | — |
| app_private.dirty_metric_days | n/a (private schema) | not exposed; not granted to authenticated/anon | system-only |

Every read policy uses `current_org_id()` + `can_see_marketer()` (or the documented strict-self /
admin-only / org-wide-crm variants). Writes are guarded everywhere; `audit_log` is immutable.

---

## 4. Issues fixed in-place

**None.** Every candidate fix touched non-trivial closure/tree or RLS-shape logic where a wrong guess
would regress a passing reset. All findings are recorded below instead (per the "do not guess" rule).
The set as written is reset-safe; the open issues are functional hardening items.

---

## 5. OPEN issues (need a human decision)

### O-1 — `marketers.path NOT NULL` blocks the direct member-INSERT path the RLS policy invites (functional, MEDIUM)
`marketers.path ltree NOT NULL` has **no default** (`0004_marketers_tree.sql:53`). `path` is populated
by the **AFTER INSERT** trigger `marketers_after_insert_tree` (`0004:229-271`), which runs *after* the
NOT NULL constraint is already checked. The only safe insert is `place_marketer()` (computes a
provisional `path`, `0004:428-433`). But the RLS policy `marketers_insert` (`0006:156-170`) explicitly
permits a member to `INSERT INTO public.marketers` directly (PostgREST pre-registration) — such an
insert that omits `path` will fail with a NOT NULL violation **before** the trigger can fill it.
- Reset impact: **none** (seed uses `place_marketer`).
- Runtime impact: any non-`place_marketer` insert (raw PostgREST, or app code that doesn't call the RPC)
  is dead-on-arrival.
- Recommended fix (needs sign-off; do **not** auto-apply): move path computation into a **BEFORE INSERT**
  trigger (compute provisional `path = parent.path || uuid_label(NEW.id)`; root = `uuid_label(id)`),
  leaving the closure cross-product in the AFTER trigger; OR document that `place_marketer()` is the
  *only* supported insert path and tighten the RLS INSERT policy to effectively force the RPC. Changing
  trigger timing interacts with the closure/`branch_leg` logic, so it needs a deliberate review.

### O-2 — `public.current_role()` shadows the reserved niladic `current_role` (advisory, LOW)
`0005_auth_visibility.sql:46` defines `public.current_role()`; `current_role` is a Postgres reserved
keyword (a special niladic function returning the session role). Schema-qualified creation and all call
sites (`public.current_role()`, `0005:91`; doc-comment `0019:47`) are **valid** and resolve to the user
function — **not** a reset blocker. Risk is future footgun: any *unqualified* `current_role()` written in
later app/SQL code silently hits the built-in (current Postgres role) instead of the JWT-role accessor.
- Recommended: rename to `current_app_role()` / `current_jwt_role()` for unambiguity, OR keep and add a
  lint rule that the accessor is always schema-qualified. (Cosmetic; defer if churn is unwanted.)

### O-3 — ltree operators in non-search-path-pinned tree functions depend on `extensions` being on the search_path (robustness, LOW)
`marketers_after_insert_tree`, `marketers_after_move_tree`, `place_marketer`, `move_marketer`
(`0004`) use ltree functions/operators (`text2ltree`, `subpath`, `nlevel`, `||`, `<@`). These are
deliberately **not** `SET search_path` (so they can see the `extensions` schema where Supabase installs
ltree) and not `SECURITY DEFINER`. On standard Supabase the database default search_path includes
`extensions`, so this works (and the seed exercises it). On a hardened DB where `extensions` is not on
the default search_path, these operators would fail to resolve.
- Reset impact: works on standard Supabase / local CLI stack.
- Recommended: pin these functions with `SET search_path = public, extensions` (and schema-qualify the
  ltree calls if you also want them DEFINER-safe). Confirm the deployment's role/db search_path includes
  `extensions` before relying on the implicit resolution.

### O-4 — Two function-name aliases exist for the same job, by design but worth confirming (advisory, INFO)
Per the brief, `run_bottleneck_engine()` (engine) and `run_bottleneck_rules()` (doc-01 §9 cron name)
both exist (`0018`), the latter a thin wrapper over the former. Similarly `generate_monthly_reports()`
(generator) vs the dispatchers. Intentional and documented in each file's header `issues` note; flagged
only so reviewers know the duplication is deliberate (not an accidental double-definition).

### O-5 — Edge-Function / pg_net halves are stubbed (scope, INFO — expected)
Several flows are explicitly the "DB half" only: invitation token mint/email + `auth.users` creation
(`activate-account` Edge Fn, 0007), report rendering bytes (`generate-report-export`, 0019), and the
pg_net `net.http_post` fan-out for bottleneck/export cron (0020). The SQL is complete and idempotent;
the Edge/pg_net layers are documented follow-ups. No action for the migration set; tracked so the
release gate re-checks tenant + `can_see_marketer` on every service-role Edge surface (ADR-009 #10).

---

## 6. Spot checks performed (all PASS)

- Forward-reference scan across 0001→0020: no table/column/enum/function referenced before creation
  (audit_log inserts in 0004/0007/0012 are `to_regclass`-guarded until 0015 creates it).
- Enum canonical values: `prospect_stage` (conoscitiva→iscrizione), `marketer_rank` (executive→
  vice_president), `placement_leg` (LEFT/RIGHT), `branch_side` (GLOBAL/LEFT/RIGHT) — all exact.
- `place_marketer` raises `unique_violation` on an occupied `(parent,leg)` slot; partial unique index
  `marketers_one_child_per_leg` is the hard backstop; no spillover / no `find_open_slot` anywhere.
- `memberships.permissions` defaults exactly the 4 flags; no `can_invite` anywhere except the comments
  documenting its removal.
- JWT accessors read `auth.jwt() ->> '<claim>'` with `role` top-level; hook stamps the full ADR-007 set.
- `audit_log` immutability: REVOKE UPDATE/DELETE from authenticated **and** service_role + BEFORE
  UPDATE/DELETE trigger raising unconditionally.
- Dollar-quote balance, `SET search_path` on DEFINER functions, generated columns, `WITH NO DATA` +
  non-concurrent first `REFRESH` on empty MVs, `UNIQUE NULLS NOT DISTINCT` and `security_invoker`
  (PG15) — all valid on the locked PG15 stack (`config.toml major_version = 15`).
- Seed builds the tree exclusively via `place_marketer()`; idempotent (gated on `slug='demo'`);
  `ranks_meta` not re-inserted (owned by 0003).

---

## 7. Post-review fixes applied (after the static review)

The three actionable open issues were resolved in-tree and re-verified:

| Issue | Resolution | Files |
|---|---|---|
| **O-1** — `path NOT NULL` blocked direct pre-registration inserts | Moved `path` computation into a **BEFORE INSERT** trigger `marketers_compute_path()` (fires after the cycle guard); the AFTER INSERT trigger now builds only the closure cross-product; `place_marketer()` omits `path` and lets the trigger derive it. Direct PostgREST inserts now succeed as well as the RPC. | `0004_marketers_tree.sql` |
| **O-3** — ltree resolution depended on implicit `extensions` search_path | Pinned `SET search_path = public, extensions` on `marketers_compute_path`, `marketers_after_insert_tree`, `marketers_after_move_tree`, `place_marketer`, `move_marketer`. | `0004_marketers_tree.sql` |
| **O-2** — `current_role()` shadowed the reserved niladic | Renamed `public.current_role()` → `public.current_app_role()` (definition + `is_org_admin()` caller + doc comments). `grep current_role()` now returns nothing. | `0005_auth_visibility.sql`, `0019_reporting.sql` |

O-4 (deliberate function aliases) and O-5 (Edge-Function / pg_net halves are documented follow-ups)
are INFO/scope and need no code change. The set remains reset-safe with these fixes applied.
