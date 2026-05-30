# 16 — Decision Log (Architecture Decision Records)

> **Status: AUTHORITATIVE.** This document records the decisions taken at architecture sign-off
> (2026-05-30) and **supersedes** any conflicting statement in artifacts 01–15. Where a sub-document
> and an ADR below disagree, **the ADR wins** and the implementation must follow the ADR. Each ADR
> notes which sections of which documents it overrides so the build phase has one source of truth.
>
> Provenance tags (e.g. `[01 Q4]`, `C-2`) trace back to the Open-Questions sections of the source
> docs and the Consistency Report in [`00-README.md`](./00-README.md) §4.

---

## ADR-001 — Marketer placement is operator-driven (no automatic spillover) `[resolves C-2, 01 Q4, 14 Q1]`

**Decision.** New marketers are placed into the binary tree by an operator who chooses the exact
`parent_id` + `leg`. There is **no automatic spillover / slot-finding algorithm in v1**.

**Canonical contract.**
```
place_marketer(p_org_id uuid, p_parent_id uuid, p_leg leg_enum,
               p_sponsor_id uuid, p_name text, p_surname text, ...) returns uuid
```
- Inserts the `marketers` row at the **exact** `(p_parent_id, p_leg)` slot.
- Raises a constraint error if that slot is already occupied (the partial unique index on
  `(org_id, parent_id, leg)` is the guard).
- `p_sponsor_id` is recorded independently of placement (recruiting credit ≠ placement), and **may**
  equal or differ from `p_parent_id` — operators can still place a recruit anywhere in their subtree.
- Maintains `marketer_tree_closure` + `ltree path` transactionally via the existing triggers
  (doc 14 §2), unchanged.

**Overrides.**
- **Doc 14 §3.1–§3.3, §3 (spillover), the `find_open_slot()` function, the 4 placement modes, and
  the §-end recommendation to "ship `find_open_slot()`"** are **deferred to a future ADR** and are
  **not built in v1**. Treat that material as a documented future extension only.
- **Docs 07 §6.2 and 09 §3.1** `place_marketer(parent_id, leg, sponsor_id, …)` explicit signature is
  now the single canonical contract (it already matched this decision).

**Consequence.** Moves/re-placements remain rare and **admin-only** (doc 14 §2.4 trigger maintenance
stays synchronous; no async placement worker needed in v1). A degenerate-tree depth/balance advisory
(doc 12 Q2 / 13 Q5) is still recommended because operators can manually create long single legs.

---

## ADR-002 — Compensation, commission and volume are out of scope for v1 `[confirms 01 OQ#5, 15 §1.2]`

**Decision.** The platform is **CRM + Business Intelligence only**. No commission engine, no payout
runs, no PV/CV volume, no binary leg-volume carryover in v1.

- The only monetary field remains `prospects.expected_value`.
- A future `volume_events` table (and, later, a commission engine) is the documented extension path
  and would receive its own ADR + architecture doc + build phase.

**Overrides.** None — this confirms the existing scope boundary. Recorded here so it is an explicit,
signed-off decision rather than an implicit omission.

---

## ADR-003 — Account-activation rights are rank-derived, from an existing profile `[supersedes the `can_invite` flag; 03 §6/§-flags, 04 Q3, 05/06/08 nav gating]`

**User decision (verbatim):** *"tutti i rank da Team Leader in su potranno creare un nuovo account
partendo da una matrice già esistente."*

**Decision.** The right to issue **"Activate CRM Access"** (`account_invitations`) is **derived from
rank**, not from a per-account permission flag:

| Capability | Who | Scope |
|---|---|---|
| **Activate CRM access** (attach a login to an existing profile) | `owner` / `admin`, **and** any member whose `marketers.rank >= team_leader` | Own visible **subtree** only (members); whole org (admin/owner) |
| **Pre-registration** (create a `marketers` *profile / "matrice"* with no login) | `owner` / `admin`, **and** any **CRM-eligible** member (`rank >= consultant`) | Own visible subtree only (members) |

Key rules:
1. Activation **always starts from an existing marketer profile** ("una matrice già esistente") that
   is already in the issuer's visible subtree. It never creates a new person at activation time — it
   attaches `email` / `password` / `permissions` to the existing `marketers` row (the mandatory
   profile-≠-account separation, doc 01 §1.2/§3.1, is unchanged).
2. The activation target must be CRM-eligible (`ranks_meta.crm_eligible = true`, i.e. Consultant→VP),
   or an admin override is required for an Executive (doc 01 §3.1, unchanged).
3. Eligibility is **evaluated server-side** from the JWT `rank` claim + the closure-table subtree
   check inside the `create-invitation` Edge Function and the `account_invitations` RLS policy.

**Overrides — the `can_invite` permission flag is REMOVED from the v1 permission set.**

The v1 `memberships.permissions` flag catalogue therefore becomes **four** flags (was five):

```
crm_access            -- gate to the CRM at all (Executive default false; admin override)
export_enabled        -- may export reports within visibility scope
manage_documents      -- may create/edit org-wide internal documents
view_branch_comparison-- may see Left-vs-Right branch comparison
```
`can_invite` is gone; its function is now `rank >= team_leader`.

**Affected text to honor at build time (do NOT follow the stale `can_invite` wording):**
- **03-roles-matrix.md** — §-flags table row `can_invite` (line ~205), the "Create marketer profiles"
  / "Activate CRM access" rows (lines ~250–251), §6 activation narrative (line ~347), the §-flags
  list (line ~385). Replace every `flag:can_invite` gate with `rank >= team_leader (subtree) OR
  role ∈ {admin,owner}`.
- **05-navigation-structure.md** — `/admin/attivazioni` gating (lines ~178, 229, 332, 350, 645) and
  the flag list (lines ~31, 609): gate the *Attivazioni CRM* item on `rank >= team_leader` OR
  `role ∈ {admin,owner}`.
- **06-sitemap.md** — `/admin/marketer/nuovo` and the activations surface (lines ~347, 527): same gate.
- **08-frontend-architecture.md** — the flag lists and `attivazioni` page guards (lines ~19, 111,
  145, 679, 789): same gate.

The `manager` role + `manager_assignments` future extension (ADR-009 #4 below) is unaffected.

---

## ADR-004 — Multi-factor auth is optional / phased in v1 `[overrides 10 §2 "mandatory", 06 Q8, 09 Q2]`

**Decision.** MFA is **available and encouraged but not enforced** in v1. No mandatory `aal2` for
admins, no compulsory step-up on sensitive actions at launch.

- Supabase Auth MFA (TOTP) is wired and self-enrollable from `/impostazioni` → Sicurezza, but not
  required.
- The Google / Microsoft OAuth buttons and the 2FA enrollment UI ship **visible-but-disabled**
  (clearly "coming soon") so the surface exists without being active.
- **Future ADR** will introduce mandatory MFA for `owner`/`admin` + step-up re-auth (rank/permission
  changes, placement moves, bulk deletes, org settings) — the design in doc 10 §2 is retained as the
  target, just not enforced in v1.

**Retained from doc 10 regardless of MFA:** the 1 h access-token TTL + live `membership_status`
re-check on writes, and the **404-not-403** response for rows outside the caller's subtree (existence
privacy). These are security defaults independent of MFA and are **kept**.

---

## ADR-005 — RLS policy SQL lives in docs 04 §5 and 10 §3 (there is no `02-rls-policies.md`) `[resolves C-1]`

**Decision.** Slot `02` is the **ERD** (`02-erd.md`). The canonical RLS policy SQL lives in
**`04-permissions-matrix.md` §5** and **`10-security-architecture.md` §3**. All cross-references to a
non-existent `02-rls-policies.md` are corrected (in-place fixes applied to docs 03, 06, 07). The
single visibility primitive is `can_see_marketer()` over the closure table, used identically by RLS,
search, analytics MV wrappers, report assembly, and API authorization gates.

---

## ADR-006 — The metrics dirty-set queue is `app_private.dirty_metric_days` `[resolves C-4]`

**Decision.** Standardize the trigger-driven incremental-refresh queue table on the single name
**`app_private.dirty_metric_days`** (the full DDL is in doc 11 §2.3). The variant name
`app_private.metrics_dirty` in docs 07/09 is corrected in place.

---

## ADR-007 — Canonical JWT claim set + access-token hook is doc 10 §2.2 `[resolves C-3]`

**Decision.** The Supabase access-token auth hook is **enabled**, and the canonical claim set is the
richest one (doc 10 §2.2):
```
org_id, marketer_id, role, rank, crm_access, membership_status, is_platform_admin
```
The thinner hook in doc 07 §4.7 (`org_id, marketer_id, role`) is an early draft and is superseded.
App-role placement is fixed as a **top-level `role` claim** (not `app_metadata.app_role`) so every
RLS policy and the API read **one** accessor path. `is_platform_admin` is sourced from the
`platform_admins` table (ADR-009 #3).

---

## ADR-008 — Canonical route map + route-group scheme `[resolves C-5; merges 05/08 and 06]`

**Decision.** One URL contract, Italian-first (slugs are the stable contract; **content** is
localized via `next-intl`, **paths are not** translated per-locale). Scope/branch live in URL params
(`?scope=global|left|right`, shareable). Five route groups:

```
(public)   /                         marketing/landing (minimal in v1)
(auth)     /accedi                   login
           /recupera-password        request reset
           /reimposta-password       set new password (token)
           /invito/[token]           accept invitation → activation

(app)      /dashboard                rank-adaptive dashboard
           /genealogia               binary genealogy tree (expand/zoom/drag/search)
           /contatti                 contact list (search/filter/tags/bulk/follow-up)
           /percorso-prospect        6-stage prospect journey board
           /chiamate                 call tracking
           /centos                   Centos list
           /sette-perche             Sette Perché
           /documenti                internal structured documents
           /analytics                performance/conversion/team/branch  (?scope=&branch=)
           /classifiche              leaderboards
           /report                   reports + export
           /notifiche                notifications
           /impostazioni             profile · account · sicurezza (MFA/OAuth stubs)

(admin)    /admin                    CEO / executive dashboard (org-wide)
           /admin/marketer           manage profiles
           /admin/marketer/nuovo     pre-registration (create "matrice")
           /admin/attivazioni        Activate CRM Access  (also rank≥team_leader, own subtree — ADR-003)
           /admin/ranghi             rank management + rank_history
           /admin/audit              audit log
           /admin/impostazioni-org   org settings

(platform) /platform                 super_admin: orgs + impersonation (ADR-009 #3)
```

**Overrides.** This supersedes both the `(crm)/(auth)/(public)` + `/rete/albero`, `/crm/contatti`,
`/analisi/*` vocabulary in docs 05/08 **and** the `(app)/(admin)/(platform)` + `/genealogia`,
`/analytics/*` vocabulary in doc 06. The build follows **this** map.

---

## ADR-009 — Accepted engineering defaults (the ~50 non-product §6 items)

The remaining open questions consolidated in [`00-README.md`](./00-README.md) §6 are **accepted at
their recommended defaults** and are **non-blocking** for the build. The load-bearing ones, recorded
explicitly:

1. **Access-token hook enabled** (ADR-007). One hook, one accessor path.
2. **Identity:** one `memberships` row per marketer per org (one tree position per person per org).
   Multi-org login is **deferred** to a future ADR (no active-org switcher in v1).
3. **`super_admin`** via a `platform_admins` table + `is_platform_admin` claim + runtime
   org-impersonation (not a reserved bootstrap org).
4. **`manager` role deferred** to a future `manager_assignments` table that *extends*
   `can_see_marketer()` — never by loosening the closure check. v1 has roles `owner`, `admin`,
   `member` + the platform `super_admin`.
5. **Rich-text editor = Tiptap/ProseMirror**; `internal_documents.body` stored as ProseMirror JSON.
6. **Cardinality:** 1 contact → N prospects (no M:N). Member-created profiles default
   `rank='executive'`, `status='pending'`.
7. **Visibility defaults:** Sette Perché read-subtree / write-own; internal documents org-wide for
   CRM-eligible members; notifications strictly self; member-visible leaderboards subtree/self-rooted.
8. **Analytics definitions:** org-local day bucketing (`organizations.timezone`); open-stage
   time-in-stage = live-elapsed; conversion default = **flow ratio** (cohort opt-in); min-volume gate
   default `min_volume_conoscitiva = 10`; bottleneck window = trailing 30 days; inactivity alerts do
   **not** mutate `marketers.status`; MV staleness ≤ 15 min on hot cards.
9. **Reporting:** PDF via `@react-pdf/renderer`, XLSX via SheetJS, CSV streamed; pull-default delivery
   (notification + in-app + on-demand); email attachments out of scope v1; artifact TTL 30 days,
   signed-URL TTL 300 s; sync/async export cutover ≈ 5 000 rows; export gated by visibility scope.
10. **Scale/ops:** Supavisor pooling; `pg_net` for cron→Edge; per-org incremental MV refresh adopted
    at tier T2; time-RANGE monthly partitioning of append tables deferred (~50 M rows); service-role
    Edge surface review is a **release gate** (each must re-check tenant + `can_see_marketer`);
    `audit_log` written for every sensitive action; every `pg_cron` job idempotent.

**Still needing business (not engineering) confirmation — non-blocking, can be tuned post-build:**
- Leaderboard own-vs-team metric semantics per metric (`C-6`): default = `calls / new_prospects /
  enrollments / conversion` rank **own** activity, `team_growth` ranks **subtree**.
- Legal/compliance retention windows (`notifications` prune, `audit_log` hot/archive horizon) and the
  GDPR-erasure = anonymize-in-place posture — require a legal sign-off before the lifecycle cron is
  switched on, but do not block earlier build phases.

---

## Net effect on the build

- **Simpler tree write path** (ADR-001): one explicit `place_marketer`, no slot-finder.
- **Four permission flags, rank-gated activation** (ADR-003): authorization keys on rank + closure,
  not a `can_invite` flag.
- **Lower auth friction** (ADR-004): MFA/OAuth present but not enforced.
- **One RLS home, one queue name, one JWT hook, one route map** (ADR-005…008): no ambiguity for
  implementers.

The **Recommended Build Sequence** in [`00-README.md`](./00-README.md) §7 stands unchanged; apply it
with the contracts above.
