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
