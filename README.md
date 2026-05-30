# CRM Networker

A **production-grade, multi-tenant CRM + Business Intelligence platform for
network-marketing organizations**. It combines a contact/prospect CRM with a
signature **binary genealogy tree** and a closure-table-driven analytics engine
(performance, conversion, team/branch, leaderboards, bottleneck detection,
automatic monthly/quarterly reports).

The design is deliberately **database-centric**: multi-tenant isolation, the
binary-tree invariants, and the transactional domain logic all live *inside*
Postgres so no client or Edge layer can bypass them.

> Architecture is fully specified before code. Read
> [`docs/architecture/00-README.md`](docs/architecture/00-README.md) first (the
> master index + sign-off review), then
> [`docs/architecture/16-decision-log.md`](docs/architecture/16-decision-log.md)
> — the **authoritative ADRs** that override anything they conflict with.

---

## Stack

| Layer | Technology |
|---|---|
| System of record | **Supabase Postgres 15** — Row-Level Security as the primary isolation boundary |
| Auth | Supabase Auth (GoTrue): email/password, recovery, JWT; custom **access-token hook** stamps `org_id, marketer_id, role, rank, crm_access, membership_status, is_platform_admin` |
| Data API | PostgREST (CRUD + RPC, RLS-enforced) |
| Background logic | Edge Functions (Deno) for external I/O + orchestration; `pg_cron` for scheduled rollups/reports |
| Realtime | Supabase Realtime (logical replication, RLS-filtered) |
| Frontend | Next.js 14 (App Router) + TypeScript + Tailwind + shadcn/ui + Recharts; React Flow + d3-hierarchy for the genealogy canvas; `@tanstack/react-query` + Realtime; Italian-first via `next-intl` |

### Signature invariants (see the ADRs)

- **Multi-tenant:** every tenant table has `org_id`; `ENABLE` + `FORCE ROW LEVEL
  SECURITY`; isolation keyed on the `org_id` JWT claim via `current_org_id()`.
- **Binary tree:** `marketers.parent_id` + `marketers.leg ('LEFT'|'RIGHT')`, at
  most one LEFT + one RIGHT child per parent; **separate `sponsor_id`** for
  recruiting credit. A **closure table** (`marketer_tree_closure`) + an **ltree
  `path`** make subtree/branch queries O(index).
- **Operator-driven placement** (ADR-001): `place_marketer()` inserts at the
  exact `(parent_id, leg)` slot and raises if occupied — no spillover in v1.
- **Profile ≠ account:** a `marketers` profile exists with no login;
  `memberships` later attaches an `auth.users` login to that **existing** row.
  Activation never recreates the profile.
- **Rank-gated activation** (ADR-003): the right to "Activate CRM Access" derives
  from `rank >= team_leader` (own subtree) or `role ∈ {admin, owner}` — there is
  no `can_invite` flag. v1 permission flags: `crm_access`, `export_enabled`,
  `manage_documents`, `view_branch_comparison`.
- **Single visibility primitive:** `can_see_marketer(target)` over the closure
  table — used by every RLS read policy.

---

## Repository layout

```
.
├── README.md
├── .gitignore
├── .env.example                  # copy to .env.local and fill in
├── docs/
│   └── architecture/             # the canonical spec (01–16)
│       ├── 00-README.md          #   master index + sign-off review  (read first)
│       ├── 01-database-schema.md #   canonical schema (exact names)
│       ├── 16-decision-log.md    #   AUTHORITATIVE ADRs (override 01–15)
│       └── …                     #   02 ERD … 15 reporting
└── supabase/
    ├── config.toml               # Supabase CLI config (Postgres 15, auth hook, ports)
    ├── seed.sql                  # dev seed: demo org + small binary tree via place_marketer()
    ├── migrations/               # SQL migrations, applied in filename order
    │   ├── 0001_extensions.sql
    │   ├── 0002_enums.sql
    │   ├── 0003_tenancy_identity.sql
    │   ├── 0004_marketers_tree.sql
    │   ├── 0005_auth_visibility.sql
    │   ├── 0006_rls_core.sql
    │   ├── 0007_account_lifecycle.sql
    │   ├── 0008_contacts.sql … 0014_notifications.sql
    │   └── …
    └── functions/                # Edge Functions (Deno) — added as implemented
```

---

## Getting started

### Prerequisites

- **Node.js 18+** and a package manager (`npm` / `pnpm` / `yarn`).
- The **Supabase CLI** via `npx supabase …` (no global install required).
- **Docker Desktop** is required *only* for a fully local stack (`supabase
  start` / `db reset`). To apply migrations to a hosted project (`db push`) you
  do **not** need Docker.

### 1. Configure environment

```bash
cp .env.example .env.local
# then fill in NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
# and SUPABASE_SERVICE_ROLE_KEY (server-only).
```

### 2. Apply the database schema

**Option A — hosted project (no Docker).** Link the repo to a Supabase project,
then push the migrations:

```bash
# one-time: link this repo to your Supabase project
npx supabase login
npx supabase link --project-ref <your-project-ref>

# apply all migrations (0001…00NN) in filename order to the linked DB
npx supabase db push
```

> `seed.sql` is dev data and is **not** applied by `db push`. To load the demo
> org + sample tree into a hosted project, run it explicitly, e.g.
> `psql "$DATABASE_URL" -f supabase/seed.sql`.

**Option B — fully local stack (requires Docker).** This applies every migration
**and** the seed on a clean database:

```bash
npx supabase start      # boot local Postgres + Auth + Studio (prints local keys)
npx supabase db reset   # drop, re-run all migrations in order, then seed.sql
```

`db reset` is the canonical correctness check: the migrations are authored so a
clean reset of an empty database succeeds top-to-bottom in filename order.

### 3. Enable the access-token hook

The JWT claim contract depends on the **custom access-token hook**
(`public.custom_access_token_hook`, defined in
`supabase/migrations/0005_auth_visibility.sql`). Locally it is wired by
`supabase/config.toml` (`[auth.hook.custom_access_token]`). On a **hosted**
project, enable it once under **Dashboard → Authentication → Hooks → Custom
Access Token** and point it at that function.

### 4. Generate TypeScript types

Regenerate the typed client whenever the schema changes:

```bash
# hosted (linked) project:
npx supabase gen types typescript --linked > src/lib/database.types.ts

# or local stack:
npx supabase gen types typescript --local  > src/lib/database.types.ts
```

### 5. Run the app

```bash
npm install
npm run dev          # Next.js dev server on http://127.0.0.1:3000
```

---

## Documentation

- **Start here:** [`docs/architecture/00-README.md`](docs/architecture/00-README.md)
  — master index, completeness checklist, consistency report, recommended build
  sequence.
- **Binding decisions:** [`docs/architecture/16-decision-log.md`](docs/architecture/16-decision-log.md)
  — the ADRs (placement, activation, MFA, RLS home, JWT claims, route map). These
  **override** any conflicting text in docs 01–15.
- **Canonical schema:** [`docs/architecture/01-database-schema.md`](docs/architecture/01-database-schema.md)
  — the single source of truth for every table/column/enum/index name.

---

## License

Proprietary — © POWER AGENCY. All rights reserved.
