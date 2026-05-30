# 13 — Database Optimization Strategy

> **Status:** Architecture-validation phase. No application code. This document specifies the
> **indexing strategy, query-plan engineering, closure-table maintenance economics, rollup vs.
> materialized-view trade-offs, partitioning, autovacuum tuning, and EXPLAIN-driven validation**
> for the hottest paths in the platform.
>
> **Source of truth:** every table, column, enum, and index referenced here is defined in
> [`01-database-schema.md`](./01-database-schema.md). This document **adds** indexes and tuning
> on top of that canonical schema; where it does, it states explicitly whether an index is
> *already in the schema* (re-stated for context) or *new in this document* (to be added to a
> follow-up migration). It does **not** rename or redefine any table/column.
>
> **Companion docs:** [`11-analytics-architecture.md`](./11-analytics-architecture.md) (the
> queries being optimized here), [`10-security-architecture.md`](./10-security-architecture.md)
> (RLS predicates whose index support is engineered here), [`07-backend-architecture.md`](./07-backend-architecture.md)
> (trigger/cron mechanics).
>
> **Platform:** Supabase — Postgres 15. All numbers/plan shapes below assume Postgres 15 on a
> Supabase **Small/Medium** compute tier (2–4 vCPU, 4–8 GB RAM) as the design target, with a
> per-org working set in the **10²–10⁵ marketers** range. Where compute tier matters for a
> setting, it is called out.

---

## Table of Contents

1. [Optimization Principles & Workload Model](#1-optimization-principles--workload-model)
2. [Index Catalogue (consolidated, by table)](#2-index-catalogue-consolidated-by-table)
3. [Closure-Table & ltree Indexing (the genealogy hot path)](#3-closure-table--ltree-indexing-the-genealogy-hot-path)
4. [Composite & Partial Indexes for Analytics / Funnel](#4-composite--partial-indexes-for-analytics--funnel)
5. [Covering Indexes for Leaderboards](#5-covering-indexes-for-leaderboards)
6. [FK & `org_id` Index Discipline](#6-fk--org_id-index-discipline)
7. [Closure-Table Maintenance Cost (insert / move) & How to Keep It Cheap](#7-closure-table-maintenance-cost-insert--move--how-to-keep-it-cheap)
8. [Denormalized Rollup Tables vs. Materialized Views — Trade-offs](#8-denormalized-rollup-tables-vs-materialized-views--trade-offs)
9. [Partitioning Strategy](#9-partitioning-strategy)
10. [Autovacuum & Storage Tuning for High-Churn Tables](#10-autovacuum--storage-tuning-for-high-churn-tables)
11. [EXPLAIN Analysis of the 4 Hottest Queries](#11-explain-analysis-of-the-4-hottest-queries)
12. [Statistics, Planner & Connection-Pool Notes](#12-statistics-planner--connection-pool-notes)
13. [Index Maintenance, Bloat & Observability](#13-index-maintenance-bloat--observability)
14. [Migration Order & Rollout Plan](#14-migration-order--rollout-plan)
15. [Open Questions / Decisions Needing Sign-off](#15-open-questions--decisions-needing-sign-off)

---

## 1. Optimization Principles & Workload Model

### 1.1 The workload is RLS-shaped, not query-shaped

Every read on a tenant table is silently rewritten by Postgres to `AND (rls_predicate)`. The
**dominant cost driver of the entire platform is therefore the RLS visibility predicate**, which
for almost all tables is:

```sql
-- from 10-security-architecture.md / 01-database-schema.md §8
EXISTS (
  SELECT 1 FROM marketer_tree_closure c
  WHERE c.ancestor_id   = (auth.jwt() ->> 'marketer_id')::uuid
    AND c.descendant_id = <row>.owner_marketer_id   -- or marketer_id / responsible_marketer_id
)
OR (auth.jwt() ->> 'role') IN ('admin','owner')
```

Wrapped in the `SECURITY DEFINER` helper `can_see_marketer(target uuid)`. **Every index decision
below is made so this predicate, and the analytics joins that share its shape, resolve via
index-only / index scans rather than sequential scans.** If we index for the analytic queries but
forget the RLS rewrite, plans regress the moment RLS is enabled. So we index for **predicate +
RLS together**.

### 1.2 Cardinality assumptions (sizing the indexes)

| Table | Rows / org (design target) | Churn profile | Notes |
|---|---|---|---|
| `marketers` | 1e2 – 1e5 | low-write, append-mostly; moves rare | drives closure size |
| `marketer_tree_closure` | **N · avg_depth** (≈ N·log₂N for a balanced binary tree; up to N·H worst case) | bursty on insert/move | the big structural table |
| `contacts` | 5–50 × marketers | medium write | search/filter heavy |
| `prospects` | 1–10 × marketers | medium write | funnel reads |
| `prospect_journey_events` | 3–8 × prospects | append-only-ish | conversion analytics source |
| `calls` | 10–500 × marketers/yr | **high append** | leaderboard + activity source; partition candidate |
| `daily_marketer_metrics` | marketers × active_days | **high churn (UPSERT)** | the rollup fact table; autovacuum-sensitive |
| `notifications` | high append, high delete | **high churn** | autovacuum-sensitive |
| `audit_log` | very high append | append-only | partition candidate |
| `leaderboard_snapshots` | metrics × scopes × periods × ranked rows | periodic bulk replace | covering-index target |

For a **balanced** binary tree of N nodes, closure rows ≈ `N · (1 + ⌊log₂N⌋)`. At N = 100 000
that is ≈ 1.7 M rows; at N = 10 000, ≈ 140 K. For a **degenerate/list-like** tree (height H ≈ N)
it blows up to O(N²) — a real risk in binary genealogies where operators force long single legs.
This is the central reason §7 treats move/insert cost seriously and §15 raises a depth-cap
question.

### 1.3 Index-design rules applied throughout

1. **Lead composite indexes with `org_id`.** Multi-tenant isolation means *every* query is
   `WHERE org_id = $jwt_org`. `org_id` first gives every query a tenant-pruned starting point and
   keeps one org's hot pages clustered.
2. **Push selective equality columns left, range/sort columns right** (the classic B-tree
   left-to-right rule), so a single index serves both the `WHERE` equality and the `ORDER BY`.
3. **Partial indexes for the "active" subset.** Soft-delete (`deleted_at IS NULL`) and
   "open"/"unread"/"pending" flags partition every table into a small hot set and a cold
   tail. Partial indexes keep the hot set's index small, cache-resident, and bloat-light.
4. **Covering (`INCLUDE`) indexes only where index-only scans pay off** — leaderboards and
   closure visibility, where the heap fetch is the cost. Don't `INCLUDE` wide/volatile columns.
5. **GIN/GiST only where B-tree can't help** — ltree subtree ops (GiST), trigram search (GIN),
   array tags (GIN). Accept their higher write cost on the (low-write) tables that need them.
6. **Don't duplicate the PK.** Postgres auto-creates a unique index for every PK and `UNIQUE`
   constraint; we never re-create those.

---

## 2. Index Catalogue (consolidated, by table)

Legend: **[schema]** = already declared in `01-database-schema.md`; **[NEW]** = added by this
optimization document (goes into migration `2_optimization_indexes.sql`, §14).

| Table | Index | Cols / definition | Status | Serves |
|---|---|---|---|---|
| `marketers` | `marketers_path_gist` | `gist (path)` | [schema] | ltree subtree/branch |
| | `marketers_parent_idx` | `(org_id, parent_id)` | [schema] | children lookup, tree render |
| | `marketers_sponsor_idx` | `(org_id, sponsor_id)` | [schema] | sponsorship reports |
| | `marketers_rank_status` | `(org_id, rank, status)` | [schema] | rank/status filters |
| | `marketers_name_trgm` | `gin (display_name gin_trgm_ops)` | [schema] | name search |
| | `marketers_one_child_per_leg` | `(org_id, parent_id, leg) WHERE …` | [schema] | binary constraint |
| | `marketers_active_idx` | `(org_id, status) WHERE deleted_at IS NULL` | **[NEW]** | active-team counts |
| `marketer_tree_closure` | *PK* | `(ancestor_id, descendant_id)` | [schema] | subtree-of-N scan |
| | `closure_descendant_idx` | `(descendant_id)` | [schema] | ancestors-of-N, move delete |
| | `closure_ancestor_depth` | `(ancestor_id, depth)` | [schema] | depth-bounded subtree |
| | `closure_branch_idx` | `(ancestor_id, branch_leg)` | [schema] | Left/Right branch |
| | `closure_visibility_cov` | `(ancestor_id, descendant_id) INCLUDE (org_id)` | **[NEW]** | RLS index-only probe |
| | `closure_org_anc_branch` | `(org_id, ancestor_id, branch_leg) INCLUDE (descendant_id, depth)` | **[NEW]** | branch analytics join |
| `contacts` | `contacts_owner_idx` | `(org_id, owner_marketer_id) WHERE deleted_at IS NULL` | [schema] | owner scan |
| | `contacts_status_idx` | `(org_id, status)` | [schema] | status filter |
| | `contacts_followup_idx` | `(org_id, next_follow_up_at) WHERE … ` | [schema] | follow-up queue |
| | `contacts_tags_gin` | `gin (tags)` | [schema] | tag filter |
| | `contacts_name_trgm` | `gin (…)` | [schema] | name search |
| | `contacts_followup_due_idx` | `(org_id, owner_marketer_id, next_follow_up_at) WHERE next_follow_up_at IS NOT NULL AND deleted_at IS NULL` | **[NEW]** | per-owner due queue |
| `prospects` | `prospects_owner_stage_idx` | `(org_id, owner_marketer_id, current_stage) WHERE deleted_at IS NULL` | [schema] | funnel occupancy |
| | `prospects_stage_idx` | `(org_id, current_stage, outcome)` | [schema] | org funnel totals |
| | `prospects_contact_idx` | `(contact_id)` | [schema] | contact→prospect |
| | `prospects_closed_idx` | `(org_id, closed_at)` | [schema] | closed window |
| | `prospects_new_funnel_idx` | `(org_id, owner_marketer_id, entered_funnel_at) WHERE deleted_at IS NULL` | **[NEW]** | new-prospect counts |
| `prospect_journey_events` | `pje_prospect_idx` | `(prospect_id, entered_at)` | [schema] | per-prospect timeline |
| | `pje_stage_window` | `(org_id, to_stage, entered_at)` | [schema] | conversion windows |
| | `pje_responsible_idx` | `(org_id, responsible_marketer_id, entered_at)` | [schema] | per-marketer conversion |
| | `pje_open_stage_idx` | `(prospect_id) WHERE exited_at IS NULL` | [schema] | open-stage uniqueness |
| | `pje_conv_cov_idx` | `(org_id, responsible_marketer_id, to_stage, entered_at) INCLUDE (exited_at, time_in_stage_secs)` | **[NEW]** | covering conversion agg |
| `calls` | `calls_marketer_time_idx` | `(org_id, marketer_id, occurred_at)` | [schema] | per-marketer activity |
| | `calls_prospect_idx` | `(prospect_id)` | [schema] | calls-of-prospect |
| | `calls_contact_idx` | `(contact_id)` | [schema] | calls-of-contact |
| | `calls_outcome_idx` | `(org_id, outcome, occurred_at)` | [schema] | outcome analytics |
| | `calls_lead_cov_idx` | `(org_id, marketer_id, occurred_at) INCLUDE (outcome, duration_secs)` | **[NEW]** | leaderboard/activity cover |
| `daily_marketer_metrics` | `dmm_org_date_idx` | `(org_id, metric_date)` | [schema] | org-day scan |
| | `dmm_marketer_date_cov` | `(marketer_id, metric_date) INCLUDE (calls_total, calls_connected, new_prospects, stage_iscrizione, new_recruits)` | **[NEW]** | subtree rollup cover |
| `monthly_reports` | `monthly_reports_marketer_idx` | `(org_id, marketer_id, period_start DESC)` | [schema] | report list |
| `leaderboard_snapshots` | `leaderboard_lookup_idx` | `(org_id, metric, scope, scope_ref_id, branch_side, period_start, rank_position)` | [schema] | ranked fetch |
| | `leaderboard_cov_idx` | same key `INCLUDE (marketer_id, value)` | **[NEW]** | index-only leaderboard |
| `bottleneck_findings` | `bottleneck_open_idx` | `(org_id, marketer_id, severity) WHERE resolved_at IS NULL` | [schema] | open findings |
| `notifications` | `(org_id, recipient_marketer_id, read_at, created_at DESC)` | [schema] | inbox |
| | `notifications_unread_idx` | `(org_id, recipient_marketer_id, created_at DESC) WHERE read_at IS NULL AND deleted_at IS NULL` | **[NEW]** | unread badge/list |
| `rank_history` | `(org_id, marketer_id, changed_at DESC)` | [schema] | rank timeline |
| `audit_log` | `(org_id, created_at DESC)`, `(org_id, entity_type, entity_id)` | [schema] | audit browse |

The **[NEW]** entries are the deliberate additions this document contributes; their full
`CREATE INDEX` text is in the relevant section below and assembled in §14.

---

## 3. Closure-Table & ltree Indexing (the genealogy hot path)

The genealogy is queried two structurally-different ways, and we keep **both** access methods
because they win in different situations:

- **Closure table** — set-based, exact-depth, branch-tagged. Best for *aggregation* joins
  ("sum metrics over N's subtree", "is X in N's LEFT branch") and for the RLS visibility probe
  (single-row `EXISTS`).
- **ltree `path`** — prefix/containment. Best for *rendering* an ordered subtree, lexical sort,
  `nlevel()` depth, and ad-hoc `@>`/`<@` containment without a join.

### 3.1 Closure table — the four access patterns and their indexes

| Pattern | Predicate | Index used |
|---|---|---|
| **Subtree of N** (analytics, team totals) | `ancestor_id = N` | **PK** `(ancestor_id, descendant_id)` — range scan on leading col |
| **Depth-bounded subtree** (direct downlines = depth 1; tree-render levels) | `ancestor_id = N AND depth = 1` | `closure_ancestor_depth (ancestor_id, depth)` |
| **Branch of N** (Left vs Right analytics) | `ancestor_id = N AND branch_leg = 'LEFT'` | `closure_branch_idx (ancestor_id, branch_leg)` |
| **Ancestors of X** (breadcrumb, move-delete set) | `descendant_id = X` | `closure_descendant_idx (descendant_id)` |
| **Visibility probe** (RLS) | `ancestor_id = caller AND descendant_id = X` | **PK** (exact two-col equality → 1 row) |

All five are already covered by the schema's PK + three secondary indexes. **The PK is the
workhorse**: because it leads with `ancestor_id`, "everything below N" is one contiguous B-tree
range, and "can caller see X" is a single equality probe — both O(log + matched).

#### [NEW] Covering index for the RLS probe — `closure_visibility_cov`

The RLS `EXISTS` runs on **every row of every tenant query**. With the PK alone the probe is an
index scan that then needs nothing from the heap (it's an `EXISTS`), so the PK is *already*
effectively index-only for that probe. We add a covering variant only because the visibility
helper sometimes also filters `org_id` defensively, and we want that to stay index-only:

```sql
-- [NEW] Keep the RLS visibility EXISTS fully index-only even when org_id is checked.
CREATE INDEX closure_visibility_cov
  ON marketer_tree_closure (ancestor_id, descendant_id)
  INCLUDE (org_id);
```

> **Decision:** this index is *optional* and partly redundant with the PK. Ship it only if §11.1's
> EXPLAIN shows heap fetches on the visibility probe under the actual `can_see_marketer` body.
> If `can_see_marketer` does not reference `org_id` (recommended — `ancestor`/`descendant` already
> imply the org), **drop this index** and rely on the PK. Tracked in §15.

#### [NEW] Branch-analytics covering index — `closure_org_anc_branch`

Branch funnel aggregation (§11.2) joins `closure` (filtered to N's LEFT or RIGHT branch) against
the metrics/funnel tables on `descendant_id`. We want that join driven entirely from the index:

```sql
-- [NEW] Branch analytics: ancestor + leg → set of descendants, index-only.
CREATE INDEX closure_org_anc_branch
  ON marketer_tree_closure (org_id, ancestor_id, branch_leg)
  INCLUDE (descendant_id, depth);
```

This lets "give me every descendant in N's RIGHT branch" be an **index-only scan** producing the
`descendant_id` list that hash-joins into `daily_marketer_metrics` / `prospects`. Without the
`INCLUDE`, the planner index-scans `closure_branch_idx` then heap-fetches each row for
`descendant_id` — a needless ~N random reads per branch query.

### 3.2 ltree `path` — GiST index and its operators

`marketers_path_gist` (`gist (path)`, **[schema]**) is the only viable index for ltree containment.
It accelerates:

| Query intent | Operator | Example |
|---|---|---|
| Whole subtree of node N | `<@` | `WHERE m.path <@ :node_path` |
| Ancestors of node N | `@>` | `WHERE m.path @> :node_path` |
| Lexical/ordered subtree render | `<@` + `ORDER BY path` | tree panel, stable sibling order |
| Depth at node | `nlevel(path)` | level badges, depth caps |

**GiST vs B-tree trade-off for ltree:** GiST on ltree supports the containment operators that a
B-tree cannot; its cost is ~2–3× the write amplification of a B-tree and looser selectivity
estimates. We accept this because `marketers` is **low-write** (§1.2) and tree-render latency is
user-facing. We do **not** put a GiST index on any high-write table.

**When the planner picks ltree over closure:** for *rendering an ordered subtree* the ltree GiST +
`ORDER BY path` avoids a join and yields rows already in display order. For *aggregating metrics
over a subtree* the closure join wins (no per-row `path` comparison; integer joins on
`descendant_id`). The platform uses **closure for math, ltree for drawing** — both indexed, no
redundancy wasted because each is on the critical path of a different feature.

> **GiST tuning:** create the ltree GiST index with `buffering = auto` for the bulk seed of a
> large org, then it self-tunes. For ongoing small inserts the default is fine. There is no
> `fillfactor` knob worth tuning on ltree GiST at our scale.

---

## 4. Composite & Partial Indexes for Analytics / Funnel

The analytics layer (doc #11) almost never reads a single table in isolation; it reads a
**closure-driven descendant set ⋈ fact table** filtered by a date window. The fact tables need
composite indexes whose leading columns match the join key and whose trailing columns satisfy the
window + grouping.

### 4.1 `daily_marketer_metrics` — the rollup fact (subtree aggregation)

The canonical analytic (doc #11 §4.2) is: *team-inclusive totals for marketer N over a date range*
= join N's subtree (from closure) to `daily_marketer_metrics` over `[d0, d1]` and sum. The schema
PK `(marketer_id, metric_date)` is the right **join+range** key, but the aggregation reads several
measure columns; we make the whole join index-only:

```sql
-- [NEW] Cover the subtree rollup so the closure⋈dmm join never touches the heap.
CREATE INDEX dmm_marketer_date_cov
  ON daily_marketer_metrics (marketer_id, metric_date)
  INCLUDE (calls_total, calls_connected, new_prospects, stage_iscrizione, new_recruits);
```

> **Why these five measures and not all:** they are the ones the leaderboard metrics
> (`calls`, `new_prospects`, `enrollments`=`stage_iscrizione`, `team_growth`≈`new_recruits`) and the
> headline dashboard cards read. The remaining `stage_*` columns are read by the funnel-volume
> drilldowns, which are lower-frequency and tolerate a heap fetch. `INCLUDE`-ing all 12 measures
> would roughly double the index size with little marginal cache benefit. If profiling shows the
> stage drilldown is hot, extend the `INCLUDE` list rather than adding a second index.

The schema's `dmm_org_date_idx (org_id, metric_date)` remains for **org-wide** day scans (CEO
dashboard, "whole org on date D") where there is no single ancestor.

### 4.2 `prospects` — current funnel occupancy

`prospects_owner_stage_idx (org_id, owner_marketer_id, current_stage) WHERE deleted_at IS NULL`
(**[schema]**) is exactly right for "current funnel occupancy of a marketer/subtree": the
closure descendant set hash-joins on `owner_marketer_id`, `current_stage` groups in-index, and the
partial clause keeps soft-deleted prospects out of the hot index. No change needed.

New-prospect throughput ("how many entered the funnel this month, per owner") is served today by a
filter on `entered_funnel_at` with no supporting composite; add:

```sql
-- [NEW] New-prospect throughput per owner within a window.
CREATE INDEX prospects_new_funnel_idx
  ON prospects (org_id, owner_marketer_id, entered_funnel_at)
  WHERE deleted_at IS NULL;
```

### 4.3 `prospect_journey_events` — conversion analytics

Conversion (doc #11 §5) groups events by `(responsible_marketer_id, to_stage, month)` and averages
`time_in_stage_secs`. `pje_responsible_idx (org_id, responsible_marketer_id, entered_at)`
(**[schema]**) locates the rows; but the aggregation also needs `to_stage`, `exited_at`, and
`time_in_stage_secs`, forcing a heap fetch per event. Cover it:

```sql
-- [NEW] Covering index for stage-conversion aggregation (feeds mv_stage_conversion + live drilldown).
CREATE INDEX pje_conv_cov_idx
  ON prospect_journey_events (org_id, responsible_marketer_id, to_stage, entered_at)
  INCLUDE (exited_at, time_in_stage_secs);
```

This makes the per-marketer conversion aggregation (and the on-demand "live" version that doesn't
wait for the MV refresh) **index-only**. Leading with `to_stage` before `entered_at` matches the
`GROUP BY to_stage` + per-stage window filter.

### 4.4 `calls` — activity & outcome analytics

`calls_marketer_time_idx (org_id, marketer_id, occurred_at)` (**[schema]**) drives per-marketer
activity windows. Leaderboard "calls" and activity cards also read `outcome` (connected vs not)
and `duration_secs`; cover them so the leaderboard build never heap-fetches a high-volume table:

```sql
-- [NEW] Covering index for call activity / leaderboard 'calls' & 'connected' metrics.
CREATE INDEX calls_lead_cov_idx
  ON calls (org_id, marketer_id, occurred_at)
  INCLUDE (outcome, duration_secs)
  WHERE deleted_at IS NULL;
```

> Note the partial `WHERE deleted_at IS NULL`: `calls` is high-append and rarely soft-deleted, so
> the partial clause adds negligible selectivity but keeps the covering index from indexing the
> (tiny) deleted tail and lets autovacuum skip it sooner.

### 4.5 Partial-index summary (the "active hot set" pattern)

| Table | Partial predicate | Rationale |
|---|---|---|
| `marketers` | `deleted_at IS NULL` (active idx, leg uniqueness, root uniqueness) | exclude tombstones from constraints & counts |
| `contacts` | `deleted_at IS NULL`, `next_follow_up_at IS NOT NULL` | follow-up queue is a *tiny* slice of contacts |
| `prospects` | `deleted_at IS NULL`, `outcome = 'open'` (see below) | open funnel ≪ all-time funnel |
| `prospect_journey_events` | `exited_at IS NULL` | exactly one open event per prospect |
| `calls` | `deleted_at IS NULL` | exclude tombstones |
| `notifications` | `read_at IS NULL AND deleted_at IS NULL` | unread badge reads a sliver |
| `bottleneck_findings` | `resolved_at IS NULL` | open alerts only |

[NEW] open-prospect index (the "open funnel" working set is what dashboards actually show):

```sql
-- [NEW] Open-funnel working set per owner — the live pipeline view.
CREATE INDEX prospects_open_owner_idx
  ON prospects (org_id, owner_marketer_id, current_stage)
  WHERE outcome = 'open' AND deleted_at IS NULL;
```

This is strictly smaller than `prospects_owner_stage_idx` (which includes enrolled/lost/on_hold)
and is the one the pipeline board and bottleneck "inactivity" rule should use.

---

## 5. Covering Indexes for Leaderboards

Leaderboards are **read-instant, write-periodic**: `leaderboard_snapshots` is bulk-replaced by the
`refresh_leaderboards` cron, then read thousands of times until the next refresh. This is the
textbook case for a **covering index** that turns every read into an index-only scan.

The schema's `leaderboard_lookup_idx` keys on
`(org_id, metric, scope, scope_ref_id, branch_side, period_start, rank_position)` — perfect for the
lookup + `ORDER BY rank_position`. But the read also needs `marketer_id` and `value` to render the
row, forcing a heap fetch per ranked row. Add the covering payload:

```sql
-- [NEW] Index-only leaderboard read: lookup key + ORDER BY rank_position, payload included.
CREATE INDEX leaderboard_cov_idx
  ON leaderboard_snapshots
     (org_id, metric, scope, scope_ref_id, branch_side, period_start, rank_position)
  INCLUDE (marketer_id, value);
```

With this, "top 50 by enrollments for branch X this month" is:

```sql
SELECT marketer_id, rank_position, value
FROM leaderboard_snapshots
WHERE org_id = $1 AND metric = 'enrollments' AND scope = 'branch'
  AND scope_ref_id = $2 AND branch_side = 'RIGHT' AND period_start = $3
ORDER BY rank_position
LIMIT 50;
```

→ a single **Index Only Scan**, no heap access, returning rows already sorted. Because
`leaderboard_cov_idx` is a strict superset of `leaderboard_lookup_idx`'s key, **drop
`leaderboard_lookup_idx`** once the covering index ships (two indexes with the same key prefix is
pure write/storage waste). Recorded as a migration step in §14.

> **Why not keep `value` out and sort by it?** Leaderboards display by *precomputed*
> `rank_position` (stable within a period, ties already broken at build time). Sorting by `value`
> at read time would re-introduce a sort node and tie instability. `rank_position` in the key gives
> a free, stable ORDER BY.

The same logic applies to `monthly_reports` reads (a marketer's last N reports), but those are
low-frequency and the JSON `metrics` payload is wide — **do not** `INCLUDE` jsonb. The existing
`monthly_reports_marketer_idx (org_id, marketer_id, period_start DESC)` plus a heap fetch is
correct here; covering a wide jsonb would bloat the index for no cache win.

---

## 6. FK & `org_id` Index Discipline

### 6.1 Every FK that participates in a delete/cascade or a join must be indexed

Postgres does **not** auto-index foreign keys. Unindexed FKs cause two pathologies:
(1) a parent `DELETE`/`UPDATE` does a **sequential scan of the child** to check referencing rows,
and (2) common joins on the FK seq-scan. Audit of the schema's FKs:

| Child.column → Parent | Indexed by | Status |
|---|---|---|
| `marketers.parent_id` → marketers | `marketers_parent_idx` | OK |
| `marketers.sponsor_id` → marketers | `marketers_sponsor_idx` | OK |
| `marketer_tree_closure.descendant_id` → marketers | `closure_descendant_idx` | OK |
| `marketer_tree_closure.ancestor_id` → marketers | PK leads with it | OK |
| `contacts.owner_marketer_id` → marketers | `contacts_owner_idx` | OK |
| `prospects.owner_marketer_id` → marketers | `prospects_owner_stage_idx` | OK |
| `prospects.contact_id` → contacts | `prospects_contact_idx` | OK |
| `prospect_journey_events.prospect_id` → prospects | `pje_prospect_idx` | OK |
| `prospect_journey_events.responsible_marketer_id` → marketers | `pje_responsible_idx` | OK |
| `calls.marketer_id` → marketers | `calls_marketer_time_idx` | OK |
| `calls.prospect_id` → prospects | `calls_prospect_idx` | OK |
| `calls.contact_id` → contacts | `calls_contact_idx` | OK |
| `centos_list_entries.owner_marketer_id` → marketers | *(unique on `(org_id,owner,position)` covers it)* | OK |
| `centos_list_entries.promoted_contact_id` → contacts | **none** | **[NEW] needed** |
| `document_versions.document_id` → internal_documents | `document_versions_doc_idx` | OK |
| `internal_documents.duplicated_from_id` → internal_documents | **none** | **[NEW] needed** |
| `memberships.user_id` → auth.users | `UNIQUE(org_id,user_id) WHERE …` | OK |
| `memberships.marketer_id` → marketers | `UNIQUE(org_id, marketer_id)` | OK |
| `monthly_reports.marketer_id` → marketers | `monthly_reports_marketer_idx` | OK |
| `leaderboard_snapshots.marketer_id` → marketers | **only inside composite as non-leading? no** | **[NEW] needed** |
| `bottleneck_findings.marketer_id` → marketers | `bottleneck_open_idx` (partial) | partial-only → **[NEW] full** |
| `notifications.recipient_marketer_id` → marketers | composite leads with org then recipient | OK |
| `account_invitations.marketer_id` → marketers | partial unique only | **[NEW] needed** |
| `rank_history.marketer_id` → marketers | `(org_id, marketer_id, changed_at)` | OK |

The gaps matter chiefly because **`marketers` rows can be hard-deleted only when childless**
(decision #10, doc #01), but contacts/documents/invitations referencing a marketer or contact are
checked on *those* parents' deletes and on join paths. Add the missing FK indexes:

```sql
-- [NEW] FK-supporting indexes (prevent parent-delete seq scans + speed joins).
CREATE INDEX centos_promoted_contact_idx
  ON centos_list_entries (promoted_contact_id)
  WHERE promoted_contact_id IS NOT NULL;

CREATE INDEX internal_documents_dupfrom_idx
  ON internal_documents (duplicated_from_id)
  WHERE duplicated_from_id IS NOT NULL;

CREATE INDEX leaderboard_marketer_idx
  ON leaderboard_snapshots (marketer_id);

CREATE INDEX bottleneck_marketer_idx
  ON bottleneck_findings (org_id, marketer_id);   -- full (non-partial) for FK + history reads

CREATE INDEX account_invitations_marketer_idx
  ON account_invitations (org_id, marketer_id);
```

### 6.2 `org_id` indexing — leading, not standalone

We **never** create a bare `(org_id)` index. `org_id` has low cardinality *within a connection*
(every row the connection touches shares one `org_id`), so a standalone index on it is useless —
the planner would prefer a seq scan over a single-value index that selects most of the table within
the tenant. Instead `org_id` is the **leading column of composite indexes** (see every index in
§2), which is what makes tenant-scoped equality + a second predicate fast. The only "org-only"
access (a cron job scanning one org wholesale) is rare and seq-scan-acceptable.

> **RLS reality check:** because RLS already constrains every query to `org_id = jwt.org_id`, the
> planner sees a single-org predicate on *every* statement. Leading composites with `org_id` means
> the RLS predicate and the application predicate share one index — no separate "RLS index".

---

## 7. Closure-Table Maintenance Cost (insert / move) & How to Keep It Cheap

This is the structurally riskiest part of the design. The closure table is what makes reads cheap;
the price is paid on writes that change the tree shape. We quantify and contain that price.

### 7.1 Cost model

Let, for a node operation:
- `A` = number of ancestors of the affected node (= its depth) ≈ `O(H)`, `H` = tree height,
- `S` = size of the affected node's subtree,
- `H` = tree height (`log₂N` balanced, up to `N` degenerate).

| Operation | Closure rows touched | ltree `path` rows touched | Frequency | Verdict |
|---|---|---|---|---|
| **Leaf INSERT** (new recruit/spillover, the common case) | `A + 1` inserts (one per ancestor + self) | 1 (`NEW.path = parent.path \|\| label`) | **very high** | cheap — bounded by depth, ~tens of rows |
| **Subtree MOVE** (admin re-placement) | delete `A_old · S` + insert `A_new · S` | rewrite `path` for all `S` nodes | **rare** (admin-only, decision #2) | expensive — quadratic-ish in depth×subtree |
| **SOFT DELETE** | 0 (rows retained) | 0 | low | trivial |
| **HARD DELETE** (childless only) | `A + 1` deletes (ON DELETE CASCADE handles closure) | 0 | rare | cheap |

**Leaf insert is the hot write and it is cheap**: inserting a node at depth `d` writes `d + 1`
closure rows. Even a deep balanced tree (`d ≈ 17` at N=100 K) is ~18 row inserts per recruit —
inconsequential. The maintenance trigger from doc #01 §2.2 is:

```sql
-- ancestor cross-product for the new leaf (from canonical schema)
INSERT INTO marketer_tree_closure (org_id, ancestor_id, descendant_id, depth, branch_leg)
SELECT NEW.org_id, c.ancestor_id, NEW.id, c.depth + 1,
       CASE WHEN c.depth = 0 THEN NEW.leg ELSE c.branch_leg END
FROM marketer_tree_closure c
WHERE c.descendant_id = NEW.parent_id;          -- uses closure_descendant_idx
INSERT INTO marketer_tree_closure (...self-row...) VALUES (NEW.org_id, NEW.id, NEW.id, 0, NULL);
```

The driving `WHERE c.descendant_id = NEW.parent_id` rides **`closure_descendant_idx`** (the
ancestors-of-parent set) — an index range scan of `A` rows. This is why that index exists.

### 7.2 Keeping MOVE cheap (the expensive operation)

Moves are the only genuinely costly tree write. Containment strategy:

1. **Keep moves admin-only and rare** (locked decision #2). A move re-placing the *root of a large
   subtree* is the worst case (`S` large). UI should warn and require confirmation showing `S`
   (subtree size, available instantly from `closure_ancestor_depth` count).
2. **Single-statement set rewrite, not row-by-row.** The move must run as the two bulk SQL
   statements in doc #01 §2.2 (delete cross-set, insert cross-set) inside one transaction — never a
   procedural loop. Set-based delete+insert on the closure is `O((A_old+A_new)·S)` rows in **two**
   statements, which Postgres executes with hash/merge joins, not `S` round-trips.
3. **ltree subtree rewrite in one UPDATE** using ltree's subpath replacement, not per-node:
   ```sql
   -- Rewrite path prefix for the whole moved subtree in a single statement.
   UPDATE marketers d
   SET    path = :new_parent_path || subpath(d.path, nlevel(:old_moved_path) - 1)
   WHERE  d.path <@ :old_moved_path;             -- rides marketers_path_gist
   ```
4. **Defer/guard heavy moves.** If profiling (or an actual large org) shows moves of subtrees with
   `S > ~5 000` are common enough to hurt, route them to an **async maintenance worker** (Edge
   Function + advisory lock per org) that performs the rewrite off the user's request path and
   advisory-locks the org's tree to serialize concurrent moves. This is decision #2's escalation
   path; default remains synchronous trigger.
5. **Lower autovacuum/HOT churn impact:** a big move bulk-updates many `marketers.path` values and
   churns closure rows → schedule an immediate `ANALYZE marketer_tree_closure, marketers` after a
   large move (the maintenance worker does this) so planner stats don't go stale right when read
   load resumes.

### 7.3 Concurrency & correctness guards (cheap to enforce)

- **Cycle guard** (doc #01 §7): a `BEFORE INSERT/UPDATE` trigger rejects a move whose new parent is
  inside the moving subtree, checked as `EXISTS (closure WHERE ancestor_id = NEW.id AND
  descendant_id = NEW.parent_id)` — one PK probe, O(1).
- **Leg-collision guard:** the partial unique `marketers_one_child_per_leg` rejects placing two
  children on the same leg; the move trigger checks the target leg is free before rewriting.
- **Serialize concurrent structural writes per org** via `pg_advisory_xact_lock(hashtext(org_id))`
  inside the move path, so two simultaneous moves on the same tree can't interleave the
  delete/insert cross-sets. Leaf inserts do not need this lock (they only append).

### 7.4 Why not recursive CTE instead of a closure table?

A recursive CTE recomputes ancestry **on every read** — fine for one tree render, fatal for RLS
(which probes visibility on *every row of every query*) and for analytics (subtree sums on every
dashboard load). The closure table trades cheap, bounded write maintenance (§7.1) for O(1)/O(index)
reads on the platform's hottest path. **This is the correct trade for a read-heavy, write-bursty
genealogy.** The recursive CTE remains a fallback for one-off admin tooling and for *verifying*
closure consistency in a nightly check job.

---

## 8. Denormalized Rollup Tables vs. Materialized Views — Trade-offs

The platform deliberately uses **both** mechanisms (doc #01 §6, doc #11 §8). This section states
*why each lives where it does*, because the choice is an optimization decision, not an accident.

### 8.1 The two mechanisms

| Property | **Rollup table** (`daily_marketer_metrics`) | **Materialized view** (`mv_funnel_totals`, `mv_stage_conversion`) |
|---|---|---|
| Refresh granularity | **Incremental** — only dirty `(marketer, day)` pairs recomputed | **Whole view** (or whole, with `CONCURRENTLY`) |
| Freshness | Near-real-time (trigger-driven dirty set + cron backstop) | Periodic (`pg_cron` every 15 min) |
| Write cost per source event | Small targeted UPSERT of one row | None at write time; paid in full at refresh |
| Read latency | Index scan + closure join (fast) | Index scan on MV (fastest — pre-aggregated) |
| Arbitrary slicing | Yes — it's a real table; join to closure for subtree/branch/date | Limited to the view's `GROUP BY` grain |
| Staleness risk | Low (continuously patched) | Bounded by refresh interval |
| Storage | One row per active (marketer, day) | One row per group in the view |
| Concurrency on refresh | No global lock; row-level UPSERT | `REFRESH … CONCURRENTLY` needs the unique index, holds no AccessExclusive but does a full recompute |

### 8.2 The decision rule we applied

> **Use a rollup table when the aggregate must be (a) fresh, (b) sliced arbitrarily by the
> closure/branch/date at read time, and (c) cheaply patchable per source event.**
> **Use a materialized view when the aggregate is (a) tolerant of minutes of staleness, (b) read at
> a fixed grain, and (c) cheaper to recompute wholesale than to patch.**

Applied:

- **`daily_marketer_metrics` is a rollup table** because team/branch/subtree analytics slice it by
  *arbitrary ancestor N* via the closure join — a fixed-grain MV cannot pre-aggregate "every
  possible subtree" (there are N of them). Storing per-marketer-per-day and joining closure on read
  is the only tractable option, and it stays fresh via the dirty-set trigger. **This is the
  backbone.**
- **`mv_funnel_totals` and `mv_stage_conversion` are MVs** because their grain is fixed
  (per-marketer current-stage totals; per-marketer-per-month conversion) and they feed summary
  cards / trend charts that tolerate ≤15-min staleness. Recomputing them wholesale every 15 min via
  `REFRESH … CONCURRENTLY` is simpler and cheaper than incrementally patching, and the unique
  indexes (`mv_funnel_totals_uq`, `mv_stage_conversion_uq`) enable `CONCURRENTLY` (no read-blocking
  during refresh).
- **`leaderboard_snapshots` and `monthly_reports` are plain tables, not MVs**, because they are
  *immutable period snapshots* — once a month closes, its leaderboard/report never changes, so a
  recomputed MV would be wasted work. They are bulk-built by cron and then read-only for the
  period. (They're "rollup tables" written by a job, but with snapshot semantics rather than
  continuous patching.)

### 8.3 Trade-off pitfalls we explicitly avoid

- **MV refresh stampede:** `REFRESH MATERIALIZED VIEW CONCURRENTLY` does a *full* recompute. As the
  org grows, the two MVs' refresh time grows with total prospects/events. Mitigations: (1) the
  15-min cadence is configurable per compute tier; (2) if MV refresh time approaches the cadence,
  **migrate the MV to an incremental rollup table** with the same shape (the read queries don't
  change — they hit a table either way). This is the documented escape hatch, flagged in §15.
- **`CONCURRENTLY` requires a unique index and cannot run inside a transaction block** — both
  satisfied (unique indexes exist; `pg_cron` runs each refresh as its own statement).
- **Dirty-set drift:** the rollup's correctness depends on the trigger enqueuing every affected
  `(marketer, day)`. The hourly `rebuild_daily_metrics` cron (doc #01 §9) is the **backstop** that
  recomputes a rolling 48 h window regardless of the dirty set, bounding any drift to ≤48 h and
  self-healing it. A nightly full-org reconcile (cheap at our scale) can be added if drift is ever
  observed.

---

## 9. Partitioning Strategy

Partitioning is **deferred, not designed-out**: at the design target (≤1e5 marketers/org, tens of
orgs) no table needs partitioning, and premature partitioning would complicate RLS, unique
constraints, and FKs for no benefit. We instead **mark the partition candidates and the trigger
thresholds**, and design the schema so adoption is a non-breaking migration.

### 9.1 Candidates, by growth shape

| Table | Growth | Partition trigger threshold | Scheme when adopted |
|---|---|---|---|
| `audit_log` | append-only, never read hot, retention-bound | > ~50 M rows or > ~50 GB | **RANGE on `created_at`** (monthly), drop old partitions for retention |
| `calls` | high append, queried by recent windows | > ~50 M rows | **RANGE on `occurred_at`** (monthly/quarterly) |
| `prospect_journey_events` | append-heavy, windowed reads | > ~50 M rows | **RANGE on `entered_at`** (monthly) |
| `daily_marketer_metrics` | bounded by marketers×days; old days cold | when cold-day scans hurt | **RANGE on `metric_date`** (quarterly) |
| `notifications` | high churn, short-lived | retention-driven | **RANGE on `created_at`** + aggressive retention delete |

### 9.2 Why RANGE-on-time, not HASH-on-`org_id`

The instinct in multi-tenant is to partition by `org_id`. We reject HASH-on-org because:
1. **RLS already prunes to one org** — every query carries `org_id = jwt.org_id`, so a composite
   index leading with `org_id` gives intra-org pruning *without* partitioning's overhead.
2. **Org-partitioning explodes partition count** (tens→hundreds of orgs × tables) and complicates
   global unique constraints.
3. The real pain at scale is **time-range cold data** (old audit/calls/events), which **RANGE-on-time** addresses directly — recent partitions stay hot/cached, old ones are rarely scanned and trivially **droppable** for retention (vastly cheaper than `DELETE` + vacuum).

> If a single mega-org ever dwarfs all others, **LIST sub-partitioning by `org_id` under a
> time RANGE** is the escalation — but only on evidence. Tracked in §15.

### 9.3 Non-breaking adoption recipe (per table)

1. Create `<table>_p` as a partitioned table with the **same columns, PK, and RLS policies**. PK
   must include the partition key (`PRIMARY KEY (id, created_at)` etc.) — acceptable since reads
   already filter by the time column.
2. Create partitions (e.g. monthly) + a `DEFAULT` partition.
3. Backfill in batches; swap names in a transaction; re-point FKs.
4. Schedule partition creation/drop via `pg_cron` (e.g. create next month's partition on the 25th;
   drop partitions older than retention).

Because the schema already filters these tables by their time column and leads indexes with
`org_id` (which becomes a *secondary* prune within each partition), **no query rewrite is needed**
when partitioning is adopted — partition pruning + the existing composites compose cleanly.

---

## 10. Autovacuum & Storage Tuning for High-Churn Tables

Three tables churn hard enough to need per-table autovacuum overrides; the rest use cluster
defaults. Supabase exposes per-table `ALTER TABLE … SET (autovacuum_*)`.

### 10.1 The high-churn set and why

| Table | Churn source | Risk if untuned |
|---|---|---|
| `daily_marketer_metrics` | **UPSERT** per dirty (marketer, day) — every call/stage/recruit event updates a row; an `UPDATE` is a dead tuple | dead-tuple bloat → index bloat → slower subtree joins; stale stats → bad plans |
| `notifications` | high insert + `read_at` updates + retention delete | bloat + index bloat on the inbox index |
| `prospect_journey_events` | append + the `exited_at` UPDATE on every stage transition | dead tuples from the close-out UPDATE |
| `calls` | high append (few updates) | mostly insert-only → less vacuum pressure, but big → keep visibility map fresh for index-only scans |

### 10.2 Tuning — make autovacuum trigger sooner and faster on these tables

```sql
-- daily_marketer_metrics: UPSERT-heavy. Vacuum/analyze far more aggressively than the 20% default.
ALTER TABLE daily_marketer_metrics SET (
  autovacuum_vacuum_scale_factor   = 0.02,   -- vacuum at 2% dead tuples (default 0.20)
  autovacuum_analyze_scale_factor  = 0.02,   -- re-stat at 2% changes (default 0.10) — keeps subtree-join estimates sane
  autovacuum_vacuum_cost_delay     = 2,      -- ms; let it work harder (default 2 in PG12+, set explicitly)
  autovacuum_vacuum_cost_limit     = 2000,   -- more work per round than the shared default
  fillfactor                       = 85      -- leave 15% free for HOT updates of measure columns
);

-- notifications: high insert + update(read_at) + retention delete.
ALTER TABLE notifications SET (
  autovacuum_vacuum_scale_factor   = 0.05,
  autovacuum_analyze_scale_factor  = 0.05,
  autovacuum_vacuum_cost_limit     = 2000,
  fillfactor                       = 90      -- read_at flip is a small UPDATE; modest HOT headroom
);

-- prospect_journey_events: append + exited_at close-out UPDATE.
ALTER TABLE prospect_journey_events SET (
  autovacuum_vacuum_scale_factor   = 0.05,
  autovacuum_analyze_scale_factor  = 0.05,
  fillfactor                       = 90
);

-- calls: append-mostly & large → keep the visibility map fresh so index-only scans stay index-only.
ALTER TABLE calls SET (
  autovacuum_vacuum_scale_factor   = 0.05,
  autovacuum_analyze_scale_factor  = 0.05,
  autovacuum_vacuum_insert_scale_factor = 0.05,  -- PG13+: vacuum after enough INSERTS, for the VM
  autovacuum_vacuum_cost_limit     = 2000
);

-- marketer_tree_closure: bursty churn on move; otherwise stable. Aggressive ANALYZE after moves
-- is handled by the move worker (§7.2); set a modest standing override.
ALTER TABLE marketer_tree_closure SET (
  autovacuum_analyze_scale_factor  = 0.05,
  fillfactor                       = 90
);
```

### 10.3 `fillfactor` and HOT updates — why it matters here

A **HOT (Heap-Only Tuple) update** avoids rewriting index entries when an update doesn't change any
indexed column *and* there's free space on the same page. `daily_marketer_metrics` updates the
*measure* columns (none of which are indexed once we use covering indexes carefully — note the
`INCLUDE` columns **are** part of the index, so updating them is *not* HOT-eligible for that index).

This creates a real tension worth stating plainly:

> **Covering index ⟂ HOT-update trade-off on `daily_marketer_metrics`:** `dmm_marketer_date_cov`
> `INCLUDE`s the measure columns precisely so reads are index-only — but that means every UPSERT
> that changes a measure invalidates the index entry and prevents a HOT update, increasing index
> churn. **We accept this** because (a) reads vastly outnumber writes on this table and index-only
> subtree joins are the headline win, and (b) `fillfactor = 85` + aggressive autovacuum keep the
> resulting bloat bounded. If write volume ever dominates, the lever is to **shrink the `INCLUDE`
> list** (cover fewer measures) — explicitly noted in §4.1 and §15.

`calls`, `notifications`, `prospect_journey_events` keep `fillfactor` at 90 (small/no measure
updates), `daily_marketer_metrics` at 85 (frequent measure updates).

### 10.4 Anti-wraparound & long-running transactions

- **No `xid` wraparound risk** at our scale, but the analytics cron jobs must **not** hold long
  transactions that pin `xmin` (which would stall vacuum cluster-wide). The MV refreshes and report
  builds run as short, autonomous statements; any long backfill runs in **batched** transactions.
- The hourly `rebuild_daily_metrics` and the move worker explicitly `ANALYZE` their touched tables
  after large changes so the planner never works from stale stats on a freshly-churned table.

---

## 11. EXPLAIN Analysis of the 4 Hottest Queries

For each: the query (with RLS already inlined as the platform actually runs it), the **target plan
shape**, the indexes that produce it, and the regressions to watch. Plans are written as the
expected `EXPLAIN (ANALYZE, BUFFERS)` *shape* at the design-target scale; exact costs depend on
data, but the **node types and index choices are the contract**.

### 11.1 HOT QUERY #1 — Subtree visibility (the RLS primitive, runs on ~every read)

This is `can_see_marketer(target)` and the bulk-visibility variant ("all marketers I can see").
Member-role caller; admins short-circuit before this.

```sql
-- "All marketers visible to the caller" (drives the genealogy panel & is the RLS body shape)
SELECT m.id, m.first_name, m.last_name, m.rank, m.status, m.path
FROM marketers m
WHERE m.org_id = $org
  AND m.deleted_at IS NULL
  AND EXISTS (
        SELECT 1 FROM marketer_tree_closure c
        WHERE c.ancestor_id   = $caller_marketer_id
          AND c.descendant_id = m.id
      );
```

**Target plan:**

```
Nested Loop  (rows≈subtree_size)
  ->  Index Only Scan using closure_ancestor_depth on marketer_tree_closure c
        Index Cond: (ancestor_id = $caller_marketer_id)
        Heap Fetches: 0
  ->  Index Scan using marketers_pkey on marketers m
        Index Cond: (id = c.descendant_id)
        Filter: (org_id = $org AND deleted_at IS NULL)
```

- **Driver:** the caller's subtree is read from the closure leading on `ancestor_id` (PK or
  `closure_ancestor_depth`) — **index-only**, returns the `descendant_id` set directly.
- **Probe:** each `descendant_id` PK-looks-up `marketers`. For the *single-row* `EXISTS` used in
  per-row RLS, the planner instead does a single PK probe `(ancestor_id=$caller, descendant_id=row)`
  → 1 row, ~3 buffer reads. **O(log) per row, the whole point of the closure table.**
- **Watch:** if the plan shows a **Seq Scan on `marketer_tree_closure`**, the `ancestor_id`
  statistic is stale or the search arg got cast away — re-`ANALYZE` and confirm `$caller_marketer_id`
  is a `uuid` literal, not text. If `Heap Fetches > 0` on the closure node, the visibility
  index-only scan is fetching the heap → the `closure_visibility_cov` (§3.1) earns its place.
- **Why it scales:** independent of total org size; cost is `O(subtree_size · log N)`. A leaf
  member with 5 downlines reads 6 rows regardless of a 100 K-node org.

### 11.2 HOT QUERY #2 — Branch funnel aggregation (Left vs Right analytics)

"Funnel totals for marketer N's **RIGHT** branch over a date window" (doc #11 §7.2) — the canonical
branch analytic. Combines closure branch filter + the rollup fact.

```sql
SELECT d.metric_date,
       sum(d.new_prospects)    AS new_prospects,
       sum(d.stage_iscrizione) AS enrollments,
       sum(d.calls_total)      AS calls
FROM marketer_tree_closure c
JOIN daily_marketer_metrics d
     ON d.marketer_id = c.descendant_id
WHERE c.org_id      = $org
  AND c.ancestor_id = $node_n
  AND c.branch_leg  = 'RIGHT'
  AND d.metric_date BETWEEN $d0 AND $d1
GROUP BY d.metric_date
ORDER BY d.metric_date;
```

**Target plan:**

```
GroupAggregate
  Group Key: d.metric_date
  ->  Sort (metric_date)        -- or HashAggregate if rows are few
        ->  Nested Loop
              ->  Index Only Scan using closure_org_anc_branch on marketer_tree_closure c
                    Index Cond: (org_id = $org AND ancestor_id = $node_n AND branch_leg = 'RIGHT')
                    Heap Fetches: 0            -- descendant_id from INCLUDE
              ->  Index Only Scan using dmm_marketer_date_cov on daily_marketer_metrics d
                    Index Cond: (marketer_id = c.descendant_id
                                 AND metric_date BETWEEN $d0 AND $d1)
                    Heap Fetches: 0            -- measures from INCLUDE
```

- **Both sides index-only:** `closure_org_anc_branch` (§3.1, **[NEW]**) yields the RIGHT-branch
  `descendant_id` set with no heap touch; `dmm_marketer_date_cov` (§4.1, **[NEW]**) yields the date
  window + measures with no heap touch. The join is the *only* materialized work.
- **For a large branch** the planner switches the inner side to a **Hash Join** (build a hash on
  the branch `descendant_id` set, probe `daily_marketer_metrics` by a `metric_date` range scan) —
  also fully index-supported. Both shapes are acceptable; the optimizer chooses by branch size.
- **GLOBAL view** is the same query with `branch_leg` predicate dropped (uses PK / `closure_ancestor_depth`);
  **LEFT** swaps `'RIGHT'`→`'LEFT'`. Three views, one index family.
- **Watch:** a **Seq Scan on `daily_marketer_metrics`** means the date window is so wide it's
  cheaper to scan — fine for "all time" on a small org, a regression on a big one; if it appears on
  large orgs, ensure `dmm_marketer_date_cov` exists and `metric_date` stats are fresh. A
  **Bitmap Heap Scan with recheck** on `dmm` means the `INCLUDE` columns aren't covering the
  predicate → confirm the `INCLUDE` list contains every summed measure (it does for the five named).

### 11.3 HOT QUERY #3 — Leaderboard read (top-N within a period/scope)

"Top 50 enrollers for org this month" — the read that happens thousands of times between refreshes.

```sql
SELECT marketer_id, rank_position, value
FROM leaderboard_snapshots
WHERE org_id = $org
  AND metric = 'enrollments'
  AND scope = 'org'
  AND scope_ref_id IS NULL
  AND branch_side = 'GLOBAL'
  AND period_start = $period
ORDER BY rank_position
LIMIT 50;
```

**Target plan:**

```
Limit  (rows=50)
  ->  Index Only Scan using leaderboard_cov_idx on leaderboard_snapshots
        Index Cond: (org_id = $org AND metric = 'enrollments' AND scope = 'org'
                     AND scope_ref_id IS NULL AND branch_side = 'GLOBAL'
                     AND period_start = $period)
        Heap Fetches: 0
```

- **Pure index-only scan, no Sort node:** every equality column is pinned, `rank_position` (next
  key column) supplies the order, `LIMIT 50` stops after 50 index entries, and `marketer_id`/`value`
  come from the `INCLUDE` (§5). This is as fast as Postgres gets — sub-millisecond, ~1–2 buffer
  reads warm.
- **`scope_ref_id IS NULL`** for org scope: because `scope_ref_id` is in the key, the NULL is a
  precise index condition (B-tree indexes NULLs), not a filter. Team/branch scopes pin it to a
  uuid.
- **Watch:** a **Sort node** appearing means the planner couldn't use `rank_position`'s order —
  usually because an equality column was omitted or typed wrong (e.g. `branch_side` left
  unconstrained), breaking the key prefix. Always supply all six key columns. **Heap Fetches > 0**
  means `leaderboard_cov_idx` wasn't chosen (and `leaderboard_lookup_idx` was) → the covering index
  is missing or not yet `ANALYZE`d.

### 11.4 HOT QUERY #4 — Monthly report build (per-marketer, subtree-inclusive, MoM)

The `generate_monthly_reports` cron computes each marketer's **subtree-inclusive** current-month
metrics + previous-month metrics + deltas. Per marketer it runs a subtree aggregation over two
windows. The hot inner aggregation (one marketer N):

```sql
WITH subtree AS (
  SELECT descendant_id
  FROM marketer_tree_closure
  WHERE ancestor_id = $node_n            -- N's whole subtree (GLOBAL)
)
SELECT
  sum(d.calls_total)        AS calls,
  sum(d.calls_connected)    AS connected,
  sum(d.new_prospects)      AS new_prospects,
  sum(d.stage_iscrizione)   AS enrollments,
  sum(d.new_recruits)       AS new_recruits
FROM subtree s
JOIN daily_marketer_metrics d
     ON d.marketer_id = s.descendant_id
WHERE d.metric_date BETWEEN $month_start AND $month_end;
```

**Target plan:**

```
Aggregate
  ->  Hash Join
        Hash Cond: (d.marketer_id = s.descendant_id)
        ->  Index Only Scan using dmm_marketer_date_cov on daily_marketer_metrics d
              Index Cond: (metric_date BETWEEN $month_start AND $month_end)   -- if month is selective
              -- OR: range over the org's rows for the month via dmm_org_date_idx, then hash-probed
        ->  Hash
              ->  Index Only Scan using closure_ancestor_depth on marketer_tree_closure
                    Index Cond: (ancestor_id = $node_n)
                    Heap Fetches: 0
```

- **Subtree set built index-only** from the closure (`ancestor_id = N`), hashed, then probed against
  the month's `daily_marketer_metrics` rows. Both inputs are covered (`dmm_marketer_date_cov` and
  the closure index), so the aggregate's only real work is the hash + sum.
- **Batching across all marketers:** the cron builds *all* reports for the org. Rather than running
  this query N times, the optimized job computes the month's metrics **once per marketer via a
  single closure⋈dmm join grouped by `ancestor_id`** (every node's subtree total in one pass):
  ```sql
  SELECT c.ancestor_id AS marketer_id,
         sum(d.calls_total) AS calls, sum(d.stage_iscrizione) AS enrollments, ...
  FROM marketer_tree_closure c
  JOIN daily_marketer_metrics d ON d.marketer_id = c.descendant_id
  WHERE c.org_id = $org
    AND d.metric_date BETWEEN $month_start AND $month_end
  GROUP BY c.ancestor_id;
  ```
  → one big **Hash Join + HashAggregate** over the org's closure and month metrics, producing every
  marketer's subtree total in a single scan. This is dramatically cheaper than N separate subtree
  queries and is the form the cron should use. Previous-month is the identical query over
  `[$prev_start,$prev_end]`; deltas/percentages are computed in the job from the two result sets.
- **Watch:** the org-wide closure⋈dmm join is the largest analytic in the system (closure rows ≈
  N·logN). It must run **off the user path** (it does — cron, monthly). If it ever strains, it is
  the **first candidate to be split by branch or by depth band**, or to read from a partitioned
  `daily_marketer_metrics` pruned to the month. A **Nested Loop** here instead of a Hash Join on a
  large org is a regression → check `work_mem` is high enough for the hash (the cron session should
  `SET work_mem` up, e.g. `'256MB'`, for the duration of the build).

### 11.5 Plan-validation checklist (apply to all four)

| Symptom in `EXPLAIN (ANALYZE, BUFFERS)` | Likely cause | Fix |
|---|---|---|
| `Seq Scan` on a fact/closure table | stale stats, wrong type on search arg, missing index | `ANALYZE`; cast literals to `uuid`/`date`; confirm index exists |
| `Heap Fetches > 0` on an index-only scan | visibility map cold, or `INCLUDE` missing a needed col | `VACUUM` the table; extend `INCLUDE` list |
| Unexpected `Sort` before a leaderboard/funnel read | key-prefix broken (a leading equality col unconstrained) | supply all key columns / reorder index |
| `Nested Loop` over many rows where `Hash Join` expected | low `work_mem` or bad row estimate | raise `work_mem` for the job; `ANALYZE`; raise stats target on join col |
| Rows estimate wildly off vs. actual | default 100-row stats target too low for skewed cols (`branch_leg`, `to_stage`) | `ALTER TABLE … ALTER COLUMN … SET STATISTICS 500;` |

---

## 12. Statistics, Planner & Connection-Pool Notes

### 12.1 Targeted statistics for skewed/correlated columns

Default `default_statistics_target = 100` under-estimates a few load-bearing columns. Raise stats
where the planner's row estimates drive the four hot plans:

```sql
-- Branch split & stage are low-cardinality but join-selectivity-critical.
ALTER TABLE marketer_tree_closure   ALTER COLUMN branch_leg   SET STATISTICS 500;
ALTER TABLE marketer_tree_closure   ALTER COLUMN ancestor_id  SET STATISTICS 500;  -- skewed: roots have huge subtrees
ALTER TABLE prospect_journey_events ALTER COLUMN to_stage     SET STATISTICS 500;
ALTER TABLE prospects               ALTER COLUMN current_stage SET STATISTICS 500;
ALTER TABLE daily_marketer_metrics  ALTER COLUMN metric_date  SET STATISTICS 500;
```

**Extended statistics** where columns are correlated (the planner assumes independence by default):

```sql
-- ancestor_id & branch_leg are correlated (a given ancestor's descendants skew to one leg);
-- multivariate stats fix the branch-funnel join estimate.
CREATE STATISTICS closure_anc_branch_stat (dependencies, ndistinct)
  ON ancestor_id, branch_leg FROM marketer_tree_closure;

-- org_id & metric_date correlate (orgs onboard at different times → different date ranges).
CREATE STATISTICS dmm_org_date_stat (dependencies)
  ON org_id, metric_date FROM daily_marketer_metrics;
```

Run `ANALYZE` after creating extended statistics so they populate.

### 12.2 Planner-relevant session settings (per workload)

| Setting | Where | Value | Why |
|---|---|---|---|
| `work_mem` | monthly-report / leaderboard cron session | `256MB` (set per session) | hash joins over org-wide closure⋈dmm stay in memory, no disk sort/hash spill |
| `work_mem` | default (API requests) | leave at Supabase default (~4–16 MB) | many small concurrent queries; don't over-allocate |
| `jit` | analytics cron | `on` | long aggregations benefit from JIT; short OLTP doesn't |
| `random_page_cost` | cluster | `1.1` | Supabase storage is SSD/NVMe; the default 4.0 over-penalizes index scans and pushes seq scans |
| `effective_cache_size` | cluster | ~75% of instance RAM | tells the planner the OS/PG cache is large → favors index scans (our entire strategy) |

> `random_page_cost = 1.1` and a correct `effective_cache_size` are **the two most important planner
> settings for this index-heavy design** — with the defaults, Postgres systematically under-uses the
> covering indexes we built. Confirm Supabase's tier defaults and override if needed (§15).

### 12.3 Connection pooling (Supabase / PgBouncer)

- All app traffic goes through **Supabase's pooler in transaction mode**. RLS reads JWT claims via
  `auth.jwt()`/`auth.uid()` which are request-scoped GUCs set per statement — compatible with
  transaction pooling (no session state assumed across statements). **Do not** rely on
  session-level `SET` for anything security-relevant; set per-transaction.
- The analytics cron jobs that need a high `work_mem` must use a **session/direct connection**
  (not the transaction pooler) so the `SET work_mem` holds for the multi-statement job, or set it
  with `SET LOCAL` inside the job's transaction.
- Prepared-statement plan caching: transaction-mode pooling defeats server-side prepared statements;
  the hot queries are simple enough that re-planning cost is negligible relative to execution. No
  action needed, but don't design around held prepared statements.

---

## 13. Index Maintenance, Bloat & Observability

### 13.1 Build/rebuild without downtime

- **All index creation in production uses `CREATE INDEX CONCURRENTLY`** (no `ACCESS EXCLUSIVE`
  lock). The migration in §14 is written `CONCURRENTLY` (which means it cannot run inside the
  migration transaction — see §14 note).
- **Rebuild bloated indexes with `REINDEX … CONCURRENTLY`** (Postgres 12+) — chiefly the
  `daily_marketer_metrics` and `notifications` indexes per §10's churn. Schedule as a low-traffic
  `pg_cron` maintenance job, monthly, gated on measured bloat.

### 13.2 Bloat & usage monitoring (what to alert on)

```sql
-- Unused indexes (candidates to drop — every index taxes writes & vacuum).
SELECT schemaname, relname AS table, indexrelname AS index, idx_scan
FROM pg_stat_user_indexes
WHERE idx_scan = 0
ORDER BY pg_relation_size(indexrelid) DESC;

-- Tables with high dead-tuple ratio (autovacuum not keeping up).
SELECT relname, n_live_tup, n_dead_tup,
       round(n_dead_tup::numeric / nullif(n_live_tup,0), 3) AS dead_ratio,
       last_autovacuum, last_autoanalyze
FROM pg_stat_user_tables
ORDER BY dead_ratio DESC NULLS LAST;

-- Index-only scan effectiveness (heap fetches should be ~0 on our covering indexes).
SELECT indexrelname, idx_scan, idx_tup_read, idx_tup_fetch
FROM pg_stat_user_indexes
WHERE indexrelname IN ('leaderboard_cov_idx','dmm_marketer_date_cov',
                       'pje_conv_cov_idx','closure_org_anc_branch','calls_lead_cov_idx');
```

Alert thresholds: `dead_ratio > 0.2` on a tuned high-churn table → autovacuum is behind (lower its
scale factor further or raise cost limit); a covering index with `idx_tup_fetch ≫ 0` → its table's
visibility map is cold (`VACUUM`) or the `INCLUDE` is incomplete; any **[NEW]** covering index with
`idx_scan = 0` after a week of real traffic → it isn't being chosen (wrong column order or stale
stats) — investigate before assuming it's safe to drop.

### 13.3 Nightly consistency check (cheap insurance, not an index but optimization-adjacent)

A nightly `pg_cron` job verifies closure integrity against a recursive CTE on a sample of orgs (or
fully for small orgs) — catches any trigger drift before it corrupts analytics. Mismatch → alert +
targeted closure rebuild for the affected subtree. This guards the entire read-optimization edifice,
since every fast read trusts the closure being correct.

---

## 14. Migration Order & Rollout Plan

All **[NEW]** objects ship in a dedicated migration **after** the base schema migration, so the
optimization layer is reviewable and revertible independently.

> **`CONCURRENTLY` caveat:** `CREATE INDEX CONCURRENTLY` and `REINDEX CONCURRENTLY` **cannot run
> inside a transaction block**. Supabase migrations run in a transaction by default, so these go in
> a migration explicitly marked non-transactional (or are applied via a one-off ops script /
> `supabase db execute` outside the migration transaction). On an empty/seed database (no
> concurrent traffic) plain `CREATE INDEX` inside a transaction is acceptable and simpler; use
> `CONCURRENTLY` only when adding indexes to a populated production table.

**Migration `2_optimization_indexes.sql` — ordered:**

```sql
-- ============ Closure / genealogy ============
CREATE INDEX CONCURRENTLY closure_org_anc_branch
  ON marketer_tree_closure (org_id, ancestor_id, branch_leg)
  INCLUDE (descendant_id, depth);
-- (closure_visibility_cov: ship only if §11.1 EXPLAIN shows heap fetches — see §15)
-- CREATE INDEX CONCURRENTLY closure_visibility_cov
--   ON marketer_tree_closure (ancestor_id, descendant_id) INCLUDE (org_id);

-- ============ Analytics fact / funnel ============
CREATE INDEX CONCURRENTLY dmm_marketer_date_cov
  ON daily_marketer_metrics (marketer_id, metric_date)
  INCLUDE (calls_total, calls_connected, new_prospects, stage_iscrizione, new_recruits);

CREATE INDEX CONCURRENTLY prospects_new_funnel_idx
  ON prospects (org_id, owner_marketer_id, entered_funnel_at)
  WHERE deleted_at IS NULL;

CREATE INDEX CONCURRENTLY prospects_open_owner_idx
  ON prospects (org_id, owner_marketer_id, current_stage)
  WHERE outcome = 'open' AND deleted_at IS NULL;

CREATE INDEX CONCURRENTLY pje_conv_cov_idx
  ON prospect_journey_events (org_id, responsible_marketer_id, to_stage, entered_at)
  INCLUDE (exited_at, time_in_stage_secs);

CREATE INDEX CONCURRENTLY calls_lead_cov_idx
  ON calls (org_id, marketer_id, occurred_at)
  INCLUDE (outcome, duration_secs)
  WHERE deleted_at IS NULL;

-- ============ Leaderboard (covering) ============
CREATE INDEX CONCURRENTLY leaderboard_cov_idx
  ON leaderboard_snapshots
     (org_id, metric, scope, scope_ref_id, branch_side, period_start, rank_position)
  INCLUDE (marketer_id, value);
-- Superseded by the covering index — drop after verifying leaderboard_cov_idx is chosen:
DROP INDEX CONCURRENTLY IF EXISTS leaderboard_lookup_idx;

-- ============ FK gaps ============
CREATE INDEX CONCURRENTLY centos_promoted_contact_idx
  ON centos_list_entries (promoted_contact_id) WHERE promoted_contact_id IS NOT NULL;
CREATE INDEX CONCURRENTLY internal_documents_dupfrom_idx
  ON internal_documents (duplicated_from_id) WHERE duplicated_from_id IS NOT NULL;
CREATE INDEX CONCURRENTLY leaderboard_marketer_idx
  ON leaderboard_snapshots (marketer_id);
CREATE INDEX CONCURRENTLY bottleneck_marketer_idx
  ON bottleneck_findings (org_id, marketer_id);
CREATE INDEX CONCURRENTLY account_invitations_marketer_idx
  ON account_invitations (org_id, marketer_id);

-- ============ Active hot-set partials ============
CREATE INDEX CONCURRENTLY marketers_active_idx
  ON marketers (org_id, status) WHERE deleted_at IS NULL;
CREATE INDEX CONCURRENTLY contacts_followup_due_idx
  ON contacts (org_id, owner_marketer_id, next_follow_up_at)
  WHERE next_follow_up_at IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX CONCURRENTLY notifications_unread_idx
  ON notifications (org_id, recipient_marketer_id, created_at DESC)
  WHERE read_at IS NULL AND deleted_at IS NULL;
```

**Migration `3_optimization_tuning.sql`** (transactional — `ALTER TABLE`/`CREATE STATISTICS` are
fine in a transaction): the §10 autovacuum/`fillfactor` overrides, §12.1 statistics targets, and
extended statistics, followed by `ANALYZE` of the touched tables.

**Rollout sequence:**
1. Apply base schema (`1_schema.sql`).
2. Apply `3_optimization_tuning.sql` (stats + autovacuum) — cheap, transactional, do first so stats
   are good when indexes build.
3. Apply `2_optimization_indexes.sql` (`CONCURRENTLY`, non-transactional) — on a populated DB run
   index-by-index, verifying each with `\d+` and a smoke `EXPLAIN`.
4. After a week of real traffic: run §13.2 monitoring; **drop** `leaderboard_lookup_idx` only after
   confirming `leaderboard_cov_idx` is chosen; reconsider the optional `closure_visibility_cov`.

---

## 15. Open Questions / Decisions Needing Sign-off

1. **`closure_visibility_cov` — ship or skip?** It is partly redundant with the closure PK. Decision
   hinges on whether `can_see_marketer` references `org_id` in its body (§3.1). **Recommended:**
   omit it; keep `can_see_marketer` org-agnostic (ancestor/descendant already imply org) and rely on
   the PK. Confirm the final helper body in doc #10 before deciding.

2. **`dmm_marketer_date_cov` `INCLUDE` width vs. HOT-update churn (§10.3).** Covering the five hot
   measures makes subtree joins index-only but blocks HOT updates on those measures, raising
   write/bloat on the highest-churn table. **Recommended:** ship as specified, monitor
   `dead_ratio`/index bloat; if write volume dominates reads in practice, shrink the `INCLUDE` to
   `(stage_iscrizione, new_prospects)` only. Needs a load profile to finalize.

3. **MV → incremental-rollup migration trigger (§8.3).** At what org size does
   `REFRESH MATERIALIZED VIEW CONCURRENTLY` on `mv_funnel_totals`/`mv_stage_conversion` approach the
   15-min cadence? **Recommended:** define an alert (refresh duration > 5 min) that triggers the
   documented migration to an incremental rollup table of the same shape. Needs a benchmark on
   representative data.

4. **Partitioning go/no-go thresholds (§9.1).** Confirm the row/size thresholds and the
   **time-RANGE over org-HASH** decision. **Recommended:** RANGE-on-time for `audit_log`, `calls`,
   `prospect_journey_events`; defer until a table crosses ~50 M rows. Confirm data-retention
   policy (drives audit/notifications partition drop schedule), which is currently unspecified.

5. **Degenerate-tree guard / depth cap (§1.2, §7.1).** A binary genealogy can be forced into a long
   single leg, making closure O(N²) and moves pathological. **Recommended:** add a configurable
   max-depth/balance advisory (warn in UI, optionally enforce) and/or a periodic balance report.
   Confirm whether the business ever legitimately builds very deep single legs, or whether a depth
   cap is acceptable.

6. **Planner cost settings on Supabase (§12.2).** Confirm Supabase's tier defaults for
   `random_page_cost` and `effective_cache_size`; this index-centric design assumes
   `random_page_cost ≈ 1.1` and a large `effective_cache_size`. If the platform defaults are higher,
   we must override (where Supabase permits) or accept that some covering indexes won't be chosen.

7. **`work_mem` for analytics cron via the pooler (§12.3).** The org-wide monthly-report join wants
   `work_mem ≈ 256MB`, which needs a session/direct connection or `SET LOCAL` in a transaction.
   Confirm the cron/Edge-Function execution context can set this (Supabase `pg_cron` runs in-DB, so
   `SET LOCAL` inside the job function is the intended mechanism — confirm).

8. **`leaderboard_lookup_idx` drop timing.** The covering `leaderboard_cov_idx` supersedes it, but
   dropping should wait until production `pg_stat_user_indexes` confirms the covering index is
   chosen. **Recommended:** drop one release after the covering index ships, not in the same
   migration, to keep a rollback path.
