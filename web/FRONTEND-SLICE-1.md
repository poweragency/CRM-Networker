# CRM Networker — Frontend Slice 1

Premium, multi-tenant CRM + BI frontend for network marketing. Next.js 14 (App Router),
TypeScript strict, Tailwind + class-variance-authority primitives, lucide-react, next-intl
(Italian default), @tanstack/react-query, Supabase via `@supabase/ssr`.

This slice covers the **Auth**, **App Shell** and **binary Genealogy** surfaces, wired on top of
the FE-Foundation shared modules. It **type-checks and builds cleanly with NO Supabase env set.**

## How to run

From the repository root (the app lives in `web/`):

```bash
# dev server (http://localhost:3000)
npm --prefix web run dev

# fast type pass
npm --prefix web run typecheck     # == tsc --noEmit

# full production build (no env required — see Demo mode)
npm --prefix web run build
npm --prefix web run start
```

Node deps are already installed — do **not** run `npm install`.

## Routes available

| Route                     | Group     | Render | Notes |
|---------------------------|-----------|--------|-------|
| `/`                       | root      | static | landing / redirect entry |
| `/accedi`                 | `(auth)`  | static | login (email/password + OAuth buttons) |
| `/recupera-password`      | `(auth)`  | static | request password reset |
| `/reimposta-password`     | `(auth)`  | static | set new password |
| `/invito/[token]`         | `(auth)`  | dynamic | accept invitation (token-scoped) |
| `/dashboard`              | `(app)`   | static | rank-adaptive landing, 4 KPI tiles, binary branch overview, quick links |
| `/genealogia`             | `(app)`   | dynamic | binary genealogy centerpiece (Global \| Sinistra \| Destra), canvas, search, node detail |

The authenticated shell (`app/(app)/layout.tsx`) renders the gated sidebar, topbar (org name,
user menu, theme toggle, notifications), and mobile nav. Navigation items and their rank/role/CRM
gates come from `lib/nav.ts` (ADR-008 route map). Routes not yet implemented as pages
(`/contatti`, `/analytics`, `/classifiche`, `/report`, `/notifiche`, `/impostazioni`, `/admin/*`)
are present as gated nav targets / quick links and are reserved for later slices.

`/genealogia` and `/invito/[token]` are server-rendered on demand (`ƒ`) because they read request
cookies / Supabase at request time; the rest prerender as static (`○`).

## Demo mode (resilience)

The app **builds and runs without Supabase env configured.** The data layer is the single source
of resilience:

- `lib/env.ts` exposes `isSupabaseConfigured` (true only when both `NEXT_PUBLIC_SUPABASE_URL` and
  `NEXT_PUBLIC_SUPABASE_ANON_KEY` are present). Accessing env never throws.
- `lib/supabase/server.ts#createClient()` returns `null` when env is missing instead of throwing.
- `lib/data/genealogy.ts` and `lib/data/session.ts` (both `server-only`) try Supabase and **fall
  back to the mock binary tree / demo claims** when env is missing OR a query throws. Every result
  carries a `demo` flag.
- When `demo` is true, the UI shows the discreet `components/config-notice.tsx` notice
  (`variant="inline"`) — "modalità demo / config mancante".
- `middleware.ts` is a **no-op when env is missing** (no auth redirect), so protected routes stay
  reachable in demo mode; with env set it refreshes the session and redirects unauthenticated
  users to `/accedi`.
- The `(app)` layout only bounces to `/accedi` when env **is** configured but there is no real
  session; in pure no-env demo mode it renders the full shell so the product is explorable.

To run against a real backend, copy `.env.example` to `.env.local` and fill the Supabase vars.

## Build / typecheck status

- `tsc --noEmit -p web/tsconfig.json` → **exit 0** (no errors).
- `next build` (clean, `.next` removed, no env) → **success**, 9 pages generated, no type/lint
  errors.

The only build-time console output is benign webpack `PackFileCacheStrategy` warnings about Windows
drive-letter casing (`e:` vs `E:` in the absolute path). They do not affect correctness or output
and disappear on case-consistent paths / non-Windows hosts.

## Open items / notes

- **Reserved routes**: `/contatti`, `/percorso-prospect`, `/analytics`, `/classifiche`, `/report`,
  `/notifiche`, `/impostazioni`, `/admin/*` exist as gated nav targets but not yet as pages —
  deferred to later slices.
- **KPI / activity feed**: `toTreeNode()` defaults live KPIs to 0 and activity to a deterministic
  value until the metrics rollup endpoint feeds them; mock nodes carry realistic demo KPIs.
- **Notifications unread count** in the topbar is a static placeholder (`3`) until the notifications
  feed lands.
- **`get_subtree` RPC + `branch_leg`**: the real branch (LEFT/RIGHT) filter relies on the server
  RPC returning `branch_leg`; demo mode derives branches from the mock tree structure.
- No changes were required to the FE-Foundation shared modules; this slice integrated cleanly and
  the existing code already satisfied the type-check and build gates.

---

# FRONTEND — Slice 2 (CRM)

Integration/build pass over the six CRM screens layered on top of the Slice-1 shell + the CRM
Foundation modules (`lib/types/db.ts` CRM block, `lib/data/<domain>.ts` + `lib/data/mock/*`,
`components/crm/*`). Goal of this pass: make the whole app **type-check and `next build` cleanly
with NO Supabase env**, fixing at the source (no feature removal).

## Screens built (routes)

All inside the `(app)` route group, reusing the existing shell `layout.tsx` (sidebar/topbar +
`ConfigNotice` "modalità demo") and the canonical ADR-008 Italian slugs:

| Route | Page (server) | Interactive client subtree | Notes |
| --- | --- | --- | --- |
| `/contatti` | `app/(app)/contatti/page.tsx` + `actions.ts` | `components/contacts/*` (contacts-manager, data-table, form-sheet + zod schema, detail-sheet, bulk-bar) | DataTable + FilterBar, bulk tag/delete, create/edit/delete via demo-safe Server Actions. |
| `/percorso-prospect` (+ `/[id]`) | `app/(app)/percorso-prospect/page.tsx`, `[id]/page.tsx` + `actions.ts` | `components/prospects/*` (prospect-board, board-column, prospect-card, stage-changer, funnel-progress, journey-timeline, new-prospect-sheet, prospect-calls) | 6-stage ordered Kanban (dnd-kit, client-only); stage change → `change_prospect_stage` RPC, simulated in demo. Detail page = funnel + journey timeline. |
| `/sette-perche` (+ `/[id]`) | `app/(app)/sette-perche/page.tsx`, `[id]/page.tsx` + `actions.ts` | `components/seven-whys/*` (manager, stepper, editor, detail, person-card, why-progress) | Per-marketer 7-whys editor/stepper; upsert via Server Action. |
| `/centos` | `app/(app)/centos/page.tsx` + `actions.ts` | `components/centos/*` (centos-manager, form-sheet + schema, detail-sheet, rating-stars[-input]) | List + rating; promote-to-contact returns `{entry_id,contact_id}`, simulated in demo. |
| `/documenti` | `app/(app)/documenti/page.tsx` + `actions.ts` | `components/documents/*` (documents-workspace, library, pane, editor, form-sheet, version-history-sheet) | Rich-text-only (Tiptap), versioning/duplicate/archive, NO uploads. Resolves author/editor ids → names via genealogy layer. |
| `/chiamate` | `app/(app)/chiamate/page.tsx` + `actions.ts` | `components/calls/*` (calls-manager, stats-strip, form-sheet + schema, prospect-picker) | Call log + `getCallStats` strip; create call via Server Action, optional prospect link. |

`loading.tsx` skeletons exist for `documenti`, `percorso-prospect`, `sette-perche`.

## Demo-mode notes (resilience)

- Every screen reads through the SERVER-ONLY data layer (`lib/data/<domain>.ts`), which goes through
  `lib/data/crm-shared.ts`: `getClient()` returns `null` when `isSupabaseConfigured` is false, every
  read is wrapped so a missing client OR a failed query falls back to the `lib/data/mock/*` dataset,
  and `isDemo()` is `true`. Reads never throw.
- Mutations (create/edit/delete/bulk, `change_prospect_stage`, `promoteCentos`, `saveVersion`,
  `upsertSevenWhys`, `createCall`) run through Server Actions that return `MutationResult<T>`; in demo
  mode they are SIMULATED (no DB write, success result) and the client applies optimistic local state
  + a `useToast()` notice. No mutation throws with no env.
- The shell `layout.tsx` renders `ConfigNotice` ("modalità demo") app-wide; the CRM screens inherit it.
- Every CRM page is `export const dynamic = 'force-dynamic'` (the data layer reads request
  cookies/Supabase), so prerender does not crash without env while still degrading to demo data.
- Client-only libraries are correctly behind `"use client"` boundaries: dnd-kit (prospect board),
  Tiptap (`RichTextEditor`, `immediatelyRender:false` for SSR), `@tanstack/react-table` (DataTable),
  react-hook-form + zod (form sheets). Server components pass plain serialized data as props.

## Build status

- **`npx tsc --noEmit`** (strict) → **PASS** (exit 0, no errors).
- **`next build`** with `NEXT_PUBLIC_SUPABASE_URL`/`ANON_KEY` empty → **SUCCESS**. `✓ Compiled
  successfully`, all **15 routes** generated, no type/lint errors. The 6 CRM routes render as
  `ƒ (Dynamic)` (server-rendered on demand), the static marketing/auth pages as `○ (Static)`.
- No source fixes were required in this integration pass — the screens as written already satisfied
  both gates (correct `"use client"` boundaries, dynamic pages, data-as-props, demo-safe data layer).
- The only build console output is the benign Windows drive-letter-casing webpack
  `PackFileCacheStrategy` warning (`e:` vs `E:`), carried over from Slice 1; it does not affect
  correctness or output.

## Open items / notes (Slice 2)

- `/documenti` has no separate `/[id]` route: the reader/editor is an in-page workspace pane
  (`documents-workspace.tsx`) driven by client state, not a nested route. Intentional.
- Real RPCs (`change_prospect_stage`, `promote_centos`, document version snapshots) are exercised
  only against a live Supabase; demo mode simulates their effects locally. Server-side RLS scoping
  (own + downline subtree) is assumed and not re-implemented in the UI.
- Still deferred (gated nav targets, not yet pages): `/analytics`, `/classifiche`, `/report`,
  `/notifiche`, `/impostazioni`, `/admin/*`.
