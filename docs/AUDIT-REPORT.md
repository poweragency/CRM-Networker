# Audit Tecnico — PowerNetwork CRM

> Audit multi-agente read-only (14 dimensioni, 50 agenti, verifica avversariale dei CRITICO/ALTO). Generato dai risultati del workflow.

> **⚠️ Addendum 2026-06-13:** questo report è uno **snapshot** alla data dell'audit. Alcuni finding sono stati fixati nei commit successivi (es. ALTO #6 `createInvitation` falso-successo → fix `e4bfba8`; vari fix performance/notifiche). Il **CRITICO #1 "fail-open senza env in produzione" è RISOLTO** (verificato nel codice): in produzione l'app fa ora **fail-closed** — `isDemoAllowed=false` quando `NODE_ENV=production` (`web/lib/env.ts`), quindi senza env `getCurrentClaims()` ritorna `UNAUTH_CLAIMS` (non privilegiato) e il layout `(app)` reindirizza a `/accedi` (`web/lib/data/session.ts`, `web/app/(app)/layout.tsx`: `if (demo && (isSupabaseConfigured || !isDemoAllowed)) redirect('/accedi')`); la demo owner resta solo fuori produzione o con opt-in `NEXT_PUBLIC_DEMO=1`. Una nota precedente (11/06) affermava erroneamente che il finding restasse APERTO. Il testo del finding #1 qui sotto descrive lo stato **all'epoca dell'audit**. Prima di lavorare un finding, verificare nel codice se è già stato chiuso.

## Verdetto

**A well-architected CRM that fails open to an auth-less admin by design, lies "success" on real failures, and has never been tested — promising bones, not shippable to paying users under attack tomorrow.**

> _Nota 2026-06-13: il "fails open to an auth-less admin" del verdetto si riferisce allo stato all'epoca dell'audit. È stato **RISOLTO**: in produzione l'app fa ora fail-closed (vedi l'Addendum in cima e il CRITICO #1)._

- **Production ready:** NO  ·  **Readiness score:** 34/100
- **Conteggio (dopo dedup, 11 duplicati rimossi):** CRITICO 1 · ALTO 13 · MEDIO 60 · BASSO 37  (tot 111)

## Executive summary

PowerNetwork is a feature-complete, architecturally thoughtful multi-tenant network-marketing CRM whose backend (binary-tree closure model, RLS-everywhere, JWT-claim hooks, demo-safe data layer) is genuinely above average for a solo-developer project — but it is NOT safe to put in front of paying, hostile, high-traffic users tomorrow. The single disqualifying issue is a CRITICO fail-open posture: the official deploy guide (DEPLOY-VERCEL.md) instructs operators to deploy to PRODUCTION with empty env vars, and the code responds by serving a fully navigable CRM as a hardcoded role:'owner' identity with NO login required (getCurrentClaims returns DEMO_CLAIMS on missing env / thrown query / unstamped claims). A misconfigured or env-dropped prod URL silently becomes an auth-less admin shell rather than crashing. Layered on top: storage RLS has zero org-scoping (any authenticated user can list/overwrite/delete every org's files — tenant-isolation break, latent only because there is one org today), stored XSS via javascript: hrefs in the document viewer (no CSP anywhere to contain it), service-role account-provisioning (activateCrmAccess) gated only by subtree-visibility instead of caller authority, and authorization that is UX-only — middleware path-gating is bypassable by direct Server Action POST and no page/layout/action re-checks role server-side. The systemic security theme is "RLS is the only line of defense" with no application-layer authority checks, no input validation (zod installed, never used server-side), no security headers, no rate limiting, and no observability (zero logging in web/; the root error boundary discards the error object) — so the first RLS regression or transient DB failure degrades silently with no telemetry to detect it.

On correctness and operations the app is also not launch-ready: a pervasive "silent false success" pattern (RLS-denied writes, failed Edge Function invocations, and synthetic-id notification mutations all return ok:true) means the UI routinely lies that operations succeeded — confirmed live, the create-invitation Edge Function is not even deployed so 100% of invitations silently fail while reporting success, and the entire notification mark-read/dismiss/unread-badge feature is a permanent no-op. Core funnel data is corrupted (enrolling a prospect never sets outcome='enrolled'/closed_at, masked only by one defensive dashboard check), data-loss bugs exist (saveWishlist hard-deletes then non-transactionally re-inserts; bulkTagContacts reads tags from the MOCK array and overwrites real tags), and there is no CI, no automated tests, and migration drift (repo ends at 0046, prod runs 0049 with enum values shipped code depends on) so the repo cannot rebuild prod for DR. Performance is fine at the current ~14-row scale but carries latent cliffs (un-memoized per-request session reads, force-dynamic everywhere with zero caching, unbounded .in() lists, heavy eager client bundles). Under attack: exploitable today. At scale: untested. In front of paying users: it will mislead them with false-success UX and miscount their funnel.

## Temi trasversali (cause sistemiche)

- RLS is treated as the ONLY security line, not the last: no application-layer authority checks on privileged/service-role actions, no server-side re-gating in layouts/pages/actions, no input validation (zod installed but never used server-side). Any single RLS regression — and migration drift already exists (0006->0042) — becomes immediately exploitable through unguarded Server Actions.
- Fail-open instead of fail-closed: empty env -> demo owner identity, thrown query -> demo owner claims, unknown rank in isLimited -> not-limited, getCurrentClaims swallows all errors into a privileged persona. The default posture across auth, middleware, and the data layer is to grant rather than deny on uncertainty.
- Silent false success / dishonest result envelopes: RLS-denied writes, failed Edge Function calls, synthetic-id notification mutations, and optimistic-on-failure returns all surface ok:true or success toasts while nothing persisted. Combined with zero logging, the UI lies and operators are blind.
- Optimistic-UI vs canonical-DB divergence: kanban rollback captures the already-moved state, derived-state-from-props ignores router.refresh, add-member node omits crm_access and skips ancestor count updates, mutation results return mock/optimistic placeholders typed as persisted rows. Client state drifts from the database on every failure or refresh.
- Non-transactional multi-step writes with manual/best-effort rollback: saveWishlist delete-then-insert, addMarketer createMarketer->extra->activate with manual rollback, account create/delete with no retries/timeouts, deleteOrgDocument row-then-storage, read-modify-write on JSONB settings. Each is a data-loss or orphaned-state window.
- Schema/code/migration drift with no detection: TS enums lag DB enums (MarketerStatus, marketer_rank cliente/no_rank), asRank() drops 4 real ranks, RLS live policies diverge from committed migrations, repo ends at 0046 while prod runs 0049. No CI diff, no generated types, no tests to catch any of it.
- Performance is fine at toy scale (~14 rows, 1 org) but riddled with latent cliffs that are invisible today: un-memoized per-request session/client reads, force-dynamic everywhere with zero read caching, unbounded .in(descendantSet) lists, per-row RLS function calls, eager heavy client bundles (xyflow, react-table, dead react-query). All scale 1:1 with growth.
- Production-readiness fundamentals are absent: no CI/CD gate, zero automated tests on security-critical RLS/closure/JWT logic, no observability, no rate limiting, no security headers/CSP, no healthcheck/rollback runbook. The 'production-grade' README claim is not yet earned.
- Dead/duplicated surface widens audit scope: dead activate-crm-dialog (a dormant service-role path), unused react-query/date-fns, unsurfaced legacy routes still URL-reachable, parallel contacts vs lista-contatti stacks, a 2130-LOC mock layer mirroring the real one with no shape enforcement (already drifted on notifications).
- Accessibility debt is systemic, not incidental: every custom dialog/sheet/mobile-nav lacks a focus trap and focus restoration (WCAG 2.4.3), nested interactive content in kanban cards, borderline muted-text contrast, raw <img> logo — a B2B/procurement and legal liability that compounds as more flows move into modals.

## Top priorità (fix per primi)

1. **Production deploy is documented and configured with NO env vars -> app silently serves mock data under a fake admin identity (fail-open)** — The only CRITICO: a documented prod deploy step (or any env drop / thrown query) brings an auth-less, owner-impersonating CRM online. Fail-closed in production (throw at boot when prod env vars missing; never return DEMO_CLAIMS outside an explicit demo opt-in) and delete the empty-env deploy guidance before anything else ships.
2. **Storage bucket org-assets policies have NO org scoping: any authenticated user can overwrite/delete/list every org's files (cross-tenant)** — Tenant-isolation break at the storage layer, enforced solely by RLS that only checks bucket_id; writes happen via the anon browser client so the UI gate is irrelevant. Cross-org wipe/disclosure becomes live the moment a second org onboards. Scope every policy by org_id path prefix and kill the public-read listing policy.
3. **Stored XSS via javascript: link href in RichTextViewer (internal documents)** — Stored XSS readable org-wide -> session hijack and privilege escalation from manage_documents to admin, with NO CSP anywhere to contain it. Allowlist http/https/mailto/tel on the href and sanitize the Tiptap JSON server-side.
4. **Service-role activateCrmAccess() re-checks only target VISIBILITY, not the caller's authority — any consultant+ can provision logins for their subtree** — A service-role primitive that creates real auth logins with attacker-chosen credentials, gated only by subtree visibility — the developer's own comment admits the authority check lives only in the UI. Add a server-side is_org_admin OR rank>=team_leader check, mirroring the remove_marketer RPC.
5. **Limited-member and admin gating is UX-only — no page/layout re-checks authorization, and server actions bypass middleware path-gating entirely** — Server Actions are POST-dispatchable to any route, so middleware path-gating is bypassed and there is zero defense-in-depth. Every privileged action and admin page needs a server-side role/rank assertion; treat RLS as the last line, not the only line.
6. **createInvitation reports ok:true/demo:true on REAL Edge Function failure — silently lies success in production** — Confirmed live: the create-invitation Edge Function is NOT deployed, so 100% of invitations fail while the admin sees success and no email is sent — the monetized onboarding flow is fully broken today. Deploy the function and make invoke errors return ok:false.
7. **Notification dismiss/mark-read are permanent no-ops: synthetic non-UUID ids hit a uuid PK (22P02 swallowed as success); markAll marks ENTIRE org read for admins** — The whole notifications inbox is non-functional (can never be cleared, badge never decrements) AND markAllNotificationsRead lacks a recipient scope so an admin clicking it corrupts every member's inbox state once a real producer writes rows. Core UX is broken and an active cross-user data bug is one cron job away.
8. **Reaching 'iscrizione' never sets outcome='enrolled'/closed_at — changeStage never passes p_outcome** — Corrupts the core funnel/conversion fact base the whole CRM exists to report; masked only by one defensive dashboard check, so every other consumer (reports, exports, future queries) silently mis-states enrollments. One-arg fix at the call site.
9. **saveWishlist hard-deletes the entire list then re-inserts, non-transactionally (data-loss window + ignores soft-delete)** — Deterministic permanent user-data loss: an inactive-membership caller passes the DELETE then fails the INSERT WITH CHECK, wiping the list every edit. Representative of the broader non-transactional/no-validation write pattern. Wrap in one RPC/transaction.
10. **No observability + inconsistent logging-free error handling across the data layer (95 catch blocks, zero logging)** — With the fail-open demo fallback and pervasive silent-success masking, a production failure is invisible — no logs, no error tracking, the error boundary discards the error. You cannot detect or diagnose the CRITICO/ALTO failures above until a user complains. Add Sentry + a central withFallback helper that distinguishes 'no env' from 'query threw' and logs the latter.

## Quick wins

- Pass p_outcome:'enrolled' when toStage==='iscrizione' in changeStage (prospects.ts) — one argument fixes the core funnel/closed_at corruption the RPC already supports.
- Sanitize the login redirect param: require raw.startsWith('/') && !raw.startsWith('//'), reusing the guard already present in percorso-prospect — closes the open redirect.
- Add a same-origin check / allowlist http(s)/mailto/tel on RichTextViewer link hrefs — neutralizes the stored XSS at the sink in a few lines.
- Add async headers() to next.config.mjs: X-Frame-Options DENY, nosniff, Referrer-Policy, HSTS, and a starter (report-only) CSP — defense-in-depth for XSS/clickjacking with no app changes.
- Fix bulkTagContacts to read existing tags from the DB row (or array_cat in SQL) instead of MOCK_CONTACTS — stops irreversible tag loss on a presented-as-additive op.
- Wrap getCurrentClaims and createClient in React cache() — collapses 4-8 redundant session reads/client allocations per request to one, a one-line-per-fn perf win on the hottest path.
- Add .eq('recipient_marketer_id', marketerId) to markAllNotificationsRead — prevents an admin from marking the entire org's notifications read once notifications are persisted.
- Remove @tanstack/react-query and date-fns from package.json (and the dead provider) — both are installed and never used; shrinks shared bundle and supply-chain surface.
- Make activateCrmAccess / revokeAccountForMarketer self-authorizing (is_org_admin OR rank>=team_leader AND can_see_marketer) before any service-role call — closes the authority gap on the loaded-gun helpers.
- Add SUPABASE_SERVICE_ROLE_KEY to web/.env.example and the DEPLOY-VERCEL.md var table — prevents guide-followers from shipping a deploy where activation silently fails with service_missing.
- Commit migrations 0047/0048/0049 (and reconcile early squashed names) so the repo can rebuild prod — the cliente/no_rank enum values shipped code depends on are absent from a clean db reset.

---

## Findings dettagliati (ordinati per gravità)

### CRITICO (1)

#### 1. Production deploy is documented and configured with NO env vars -> app silently serves mock data under a fake admin identity (fail-open)

> ✅ **RISOLTO (2026-06-13, verificato nel codice).** In produzione l'app fa ora **fail-closed**: `isDemoAllowed=false` quando `NODE_ENV=production` (`web/lib/env.ts`), `getCurrentClaims()` ritorna `UNAUTH_CLAIMS` (non privilegiato, niente org/marketer) invece di `DEMO_CLAIMS` (`web/lib/data/session.ts`), e il layout `(app)` reindirizza a `/accedi` (`web/app/(app)/layout.tsx`: `if (demo && (isSupabaseConfigured || !isDemoAllowed)) redirect('/accedi')`). La demo owner resta solo fuori produzione o con `NEXT_PUBLIC_DEMO=1`. Il testo qui sotto è lo stato **all'epoca dell'audit**.

- **Gravità:** CRITICO  ·  **Priorità:** P0  ·  **Tipo:** security  ·  **Confidence:** high  ·  **Verdetto verifica:** confirmed
- **Dimensione:** DevOps, CI/CD, Config, Secrets, Observability, Production Readiness
- **Dove:** docs/DEPLOY-VERCEL.md:5-7,23-25; web/lib/data/session.ts:29-35,63-76,110-112; web/lib/data/crm-shared.ts:47-59; web/lib/env.ts:13-15; web/middleware.ts:97-100
- **Perché è un problema:** isSupabaseConfigured is true only when both NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are present (env.ts:14-15). When they are absent, getCurrentClaims() returns a hardcoded DEMO_CLAIMS set with role:'owner', rank:'vice_president', crm_access:true (session.ts:29-35,64-65), the data layer returns mock rows (crm-shared.ts:47-59), and middleware becomes a no-op so NO auth redirect happens (middleware.ts:97-100). DEPLOY-VERCEL.md:5-7 and :23-25 explicitly tell the operator to deploy to PRODUCTION first with env vars left empty ('per ora lasciale vuote', 'deploy in modalità demo'). The fallback is also triggered at runtime by ANY thrown query (session.ts:110-112, the catch returns demo claims) and when org_id/marketer_id claims are missing (session.ts:101-107).
- **Conseguenza reale:** A production URL can come online showing a fully navigable CRM populated with fabricated demo data while every visitor is treated as an org owner/admin with no login required. If Supabase env is ever dropped, mis-scoped, or the JWT hook hasn't stamped claims, the live app silently degrades to fake-admin demo mode instead of erroring — catastrophic for a paid, multi-tenant, RLS-dependent product (looks 'working' but is auth-less and data-less).
- **Come riprodurlo:** Deploy web/ to Vercel with no environment variables (exactly as DEPLOY-VERCEL.md step 5 instructs), open the production URL: the app renders the dashboard/genealogy as owner 'vice_president' with mock data and no sign-in. Or in a configured deploy, force a Supabase outage/timeout so a query throws -> session.ts catch returns DEMO_CLAIMS.
- **Come risolverlo:** Fail closed in production: in lib/env.ts throw at boot (or in a server-only assert) when NODE_ENV/VERCEL_ENV === 'production' and required vars are missing. Never return DEMO_CLAIMS when not explicitly in a demo allow-list (e.g. require an opt-in NEXT_PUBLIC_DEMO=1 flag); the runtime catch in session.ts should surface an error, not silently impersonate an owner. Remove the 'deploy with empty env' guidance from DEPLOY-VERCEL.md.
- **Impatto (scalabilità/sicurezza/performance):** security
- **Rischio futuro:** As the team scales and env management spreads across preview/prod/branches, the probability of a missing or wrong var in production approaches certainty; the failure mode is silent data fabrication + auth bypass rather than a loud crash, so it can go unnoticed for a long time.
- **Nota verificatore:** CORE CLAIM CONFIRMED (auth fail-open via documented empty-env prod deploy). Verified every cited line:

- web/lib/env.ts:14-15: isSupabaseConfigured = SUPABASE_URL && SUPABASE_ANON_KEY both present. No NODE_ENV/VERCEL_ENV=production guard anywhere (grepped lib/ + app/; vercel.json declares no env, only {"framework":"nextjs"}).
- web/lib/data/session.ts:29-35: DEMO_CLAIMS = {org_id:'demo-org', marketer_id:MOCK_ROOT_ID, role:'owner', rank:'vice_president', crm_access:true}. Returned at :64-65 (env missing), :76 (no session), :101-107 (missing org/marketer), :110-112 (any thrown query).
- web/lib/data/crm-shared.ts:47-59: getClient() returns null when env missing → data layer serves mock (e.g. dashboard.ts:51 returns []).
- web/middleware.ts:97-100: no-op when env missing (no auth redirect).
- THE ACTUAL LINCHPIN (stronger than cited): web/app/(app)/layout.tsx:34-37 redirects to /accedi ONLY when (isSupabaseConfigured && demo). With env missing, isSupabaseConfigured=false → redirect skipped → full authenticated CRM shell renders as role:'owner'/vice_president with NO login. orgName shows 'Networker · Demo' (layout :65) but the app is fully navigable unauthenticated.
- docs/DEPLOY-VERCEL.md:6-7 ('Senza variabili... gira in modalità demo, deploya subito') and :23-25 ('Environment Variables: per ora lasciale vuote (deploy in modalità demo)') explicitly instruct deploying to PRODUCTION with empty env. .env.local is gitignored (git check-ignore exit 0, not tracked) so the deploy relies solely on Vercel-dashboard env that the doc says to leave empty.

SEVERITY JUSTIFIED AT CRITICO: a documented production deploy step brings an auth-less, owner-impersonating CRM online — a trivially reachable auth/privilege-bypass posture with no fail-closed guard.

BUT TWO SUB-CLAIMS ARE OVERSTATED (do not downgrade the core, noted for accuracy): (1) In env-missing mode there is NO real DB connection, so ONLY fabricated mock rows are served — no real multi-tenant data is leaked (the 'data-less' framing is correct; the data-exposure alarm is not). (2) The 'configured deploy + query throws → fake admin over real data' path is NOT a privilege escalation: the RLS-bound client enforces RLS by the real cookie JWT, not by these in-memory claims; the service-role path (account.ts:91-106) scopes by claims.org_id='demo-org' which matches no real org and returns 'forbidden'; and an authed user whose query throws gets demo:true → bounced to /accedi by layout.tsx:35. So the runtime-catch impersonation is a degraded-UX/loop hazard, not an over-real-data auth bypass. The empty-env production-deploy bypass remains real and CRITICO.

### ALTO (13)

#### 2. Service-role activateCrmAccess() re-checks only target VISIBILITY, not the caller's authority — any consultant+ can provision logins for their subtree

- **Gravità:** ALTO  ·  **Priorità:** P1  ·  **Tipo:** security  ·  **Confidence:** high  ·  **Verdetto verifica:** confirmed
- **Dimensione:** Auth, Session, Middleware & Privilege Escalation
- **Dove:** web/lib/data/account.ts:86-153 (activateCrmAccess); reached via web/app/(app)/genealogia/actions.ts:251-278 activateCrmAccessAction and :101-203 addMarketerAction
- **Perché è un problema:** The function's own doc says 'admin/team_leader caller', but the code only verifies (a) claims.org_id present and (b) an RLS-bound SELECT proving the target marketer is in the caller's org and visible (can_see_marketer). It then uses the SERVICE-ROLE admin client (getAdminClient, bypasses RLS) to admin.auth.admin.createUser() with an attacker-chosen email+password and upsert an active membership. There is NO check of the caller's role/rank before the privileged op. The genealogia UI gates the affordance client-side only; the server action does not re-gate.
- **Conseguenza reale:** Any active member whose rank is consultant or above (i.e. not 'limited', so not blocked by middleware) can create a real auth.users login — with credentials THEY choose — for any marketer in their downline, and bind an active membership to it. They effectively control that account (they set its password) and can grant CRM access. This is account provisioning + credential control far broader than the documented admin/team_leader gate.
- **Come riprodurlo:** As a non-admin consultant, POST the activateCrmAccessAction server action (action id resolvable from /genealogia render, but invokable from any page) with {marketerId: <a downline id>, email: attacker@x, password: 'p@ssw0rd1'}. The function passes the org+visibility check and creates the login. (Bounded to the caller's subtree by can_see_marketer, but with no rank/role gate.)
- **Come risolverlo:** Before calling getAdminClient(), re-verify caller authority server-side: load the caller's claims (role/rank) and require is_org_admin OR rank>=team_leader (mirror the remove_marketer RPC's internal gate). Do NOT rely on the client UI for this. Same gate must be applied in activateCrmAccessAction and addMarketerAction.
- **Impatto (scalabilità/sicurezza/performance):** security
- **Rischio futuro:** If the rank threshold for 'limited' changes, or if can_see_marketer's subtree semantics widen, the blast radius of this ungated service-role call grows silently. Service-role calls with no caller-authority re-check are the highest-value target in the codebase.
- **Nota verificatore:** CONFIRMED. activateCrmAccess (web/lib/data/account.ts:86-153) performs only two checks before the service-role privileged op: (1) claims.org_id present (line 92-93), and (2) an RLS-bound SELECT on marketers proving target.org_id==orgId (lines 96-106). There is NO caller role/rank check. It then calls getAdminClient() (admin.ts: service-role, bypasses RLS) → admin.auth.admin.createUser({email,password,email_confirm:true}) (lines 124-128) with attacker-chosen credentials and upserts an active membership with crm_access:true (lines 135-145).

The visibility bound is exactly can_see_marketer, NOT admin-only. Live DB marketers_select policy = "(org_id = current_org_id()) AND can_see_marketer(id)"; can_see_marketer = "is_org_admin() OR EXISTS(closure ancestor=current_marketer_id descendant=target)". So the SELECT on line 98-103 passes for ANY descendant in the caller's own subtree.

Exploitability gap verified by rank thresholds: RANK_ORDER (db.ts:33-46) = cliente(0),no_rank(1),executive(2),consultant(3),team_leader(4)... Middleware isLimited (middleware.ts:91-93) blocks only idx<indexOf('consultant'), i.e. ranks 0-2 — so a 'consultant' (idx 3) is NOT limited and can invoke server actions. UI gate canActivateCrm (permissions.ts:17,28-33) requires role>=admin OR rank>=team_leader(idx 4). Therefore a plain member-role consultant fails the UI gate yet hits NO server gate. The action chain confirms no server gate exists: activate-crm-dialog.tsx just calls activateCrmAccessAction (no auth check); activateCrmAccessAction (actions.ts:251-278) only validates email regex + password>=8; addMarketerAction (actions.ts:101-203) likewise calls activateCrmAccess with no role check.

Smoking gun: the developer's own comment at permissions.ts:9-11 states "The subtree constraint is enforced server-side by RLS ...; the UI gates on role/rank" — explicitly admitting the role/rank authority check lives ONLY in the UI. Contrast with the SECURITY DEFINER remove_marketer RPC (live DB pg_get_functiondef) which DOES gate authority server-side: "IF NOT public.is_org_admin() THEN ... rm.sort_order >= tl.sort_order (team_leader) ... RAISE EXCEPTION 'requires Team Leader rank or higher'". This proves the correct pattern exists and activateCrmAccess deviates from it — matching the finding's recommended fix verbatim.

Severity ALTO is correct (not CRITICO): blast radius is bounded to the caller's own subtree (can_see_marketer), and account.ts:119-121 refuses targets that already have a user_id membership (so existing logins cannot be hijacked — only marketers without a login can be provisioned). But the attacker chooses the credentials (controls the new account), binds an active crm_access membership, and does so without the required team_leader/admin authority that every other privileged tree op enforces. A real server-side authority bypass exploitable by any consultant+ member. Verdict confirmed, severity unchanged (ALTO).

#### 3. Limited-member and admin gating is UX-only — no page/layout re-checks authorization, and server actions bypass middleware path-gating entirely

- **Gravità:** ALTO  ·  **Priorità:** P1  ·  **Tipo:** design  ·  **Confidence:** high  ·  **Verdetto verifica:** confirmed
- **Dimensione:** Auth, Session, Middleware & Privilege Escalation
- **Dove:** web/middleware.ts:50-69,135-152 (LIMITED_BLOCKED, isLimited); web/app/(app)/layout.tsx:27-79 (no limited/role enforcement); every web/app/(app)/**/page.tsx (no isLimitedViewer/role check); web/app/(app)/impostazioni/actions.ts (setMemberRoleAction reachable from the one page limited users can open)
- **Perché è un problema:** The ONLY enforcement of the 'limited member' restriction (and of admin-only sections) is web/middleware.ts gating by URL pathname. (app)/layout.tsx only redirects unauthenticated/demo sessions to /accedi — it never checks isLimitedViewer or admin role. No (app) page (dashboard, admin, team/[id], etc.) performs a server-side authorization re-check; they render content for whoever the layout admitted. Crucially, Next.js Server Actions are dispatched by an action ID via POST to whatever route the request targets — they are NOT bound to the page that declared them. A limited user is confined to /impostazioni + /informativa, but can POST a server action reference (e.g. addMarketerAction, activateCrmAccessAction) to /impostazioni (NOT in LIMITED_BLOCKED), so the middleware blocked-path check never fires.
- **Conseguenza reale:** A 'limited' member (member role + rank below consultant) or a non-admin member can invoke server actions for features the UI/middleware hides — e.g. add a marketer under themselves, attempt role changes, create invitations — limited only by RLS, not by the application. A regular non-admin consultant can also simply navigate to /admin (not in LIMITED_BLOCKED, no page-level role check) and see the admin shell + reach its action surfaces. The app provides zero defense-in-depth: if any RLS policy is ever loosened or buggy, there is no second line.
- **Come riprodurlo:** 1) As a limited user, capture the addMarketerAction Server-Action POST (Next-Action header + payload) from a privileged session, replay it against /impostazioni — middleware does not block (path not in LIMITED_BLOCKED) and the action runs (RLS then allows inserting an executive child under the caller's own id since can_see_marketer(self)=true). 2) As a non-admin consultant, browse to /admin — no redirect, page renders.
- **Come risolverlo:** Enforce authorization in the trust boundary, not just middleware: (a) in (app)/layout.tsx (or a shared guard) redirect limited viewers away from non-allowed segments and verify section access server-side; (b) add an explicit role/rank assertion at the top of each privileged server action (and each admin page) instead of trusting middleware+RLS; (c) for admin sections, gate the page server-side on is_org_admin. Treat RLS as the last line, not the only line.
- **Impatto (scalabilità/sicurezza/performance):** security
- **Rischio futuro:** Server Actions multiplying over time means the count of unguarded, middleware-bypassable privileged entry points keeps growing. The moment one RLS policy regresses (see the 0006→0042 insert-policy drift already present), an unguarded action becomes directly exploitable.
- **Nota verificatore:** Verified structurally and against the live DB (project qpfnsselgwulrlmlandd). CONFIRMED.

1) Gating is UX-only at the middleware. web/middleware.ts:42-94,126-152 only checks request.nextUrl.pathname: PROTECTED_PREFIXES (auth-or-not) and LIMITED_BLOCKED + isLimited() (limited→bounce to /impostazioni). There is NO admin-role middleware check at all; the only role logic is isLimited(), which returns false for anyone at consultant rank or with role admin/owner/co_admin/manager (lines 85-94).

2) No layout/page server-side re-check. web/app/(app)/layout.tsx:32-37 redirects ONLY when getCurrentClaims() resolves demo (no session) — it never reads role/rank to enforce limited or admin. /admin lives under (app) (no separate (admin) route group/layout — Glob of web/app/**/layout.tsx returns only (auth), (app), root), so it shares this unguarded layout. web/app/(app)/admin/page.tsx has zero role assertion and its own comment (lines 32-33) admits "the whole /admin section is gated to admin/owner by the nav, and the data layer's RLS widens... only for those roles." web/app/(app)/admin/marketer/page.tsx likewise calls listMarketers() with no role check. So a non-admin consultant passing middleware (isLimited=false) renders the admin shell.

3) Server Actions bypass the path-gate and have no own guard. web/app/(app)/impostazioni/actions.ts (setMemberRoleAction) and web/app/(app)/genealogia/actions.ts (addMarketerAction, activateCrmAccessAction) are 'use server' actions dispatched by action-id POST to the rendered route. /impostazioni is NOT in LIMITED_BLOCKED, so a limited user can POST any action reference there and the middleware blocked-path check never fires. addMarketerAction (genealogia/actions.ts:101-203) takes a client-supplied parentId and calls createMarketer (web/lib/data/admin.ts:167-198) — no role/rank assertion anywhere in the action path; getOwnerContext only stamps org/marketer ids.

4) RLS confirms the exploit for the genealogy write. Live pg_policy: marketers_insert WITH CHECK = ((org_id = current_org_id()) AND current_membership_active() AND (is_org_admin() OR ((parent_id IS NOT NULL) AND can_see_marketer(parent_id)))). can_see_marketer (pg_get_functiondef) returns true when a closure row exists with ancestor=current_marketer_id() and descendant=target; I verified the closure holds self-rows (SELECT count(*) WHERE ancestor_id=descendant_id AND depth=0 → 8), so can_see_marketer(self)=true for every marketer. current_membership_active() is true for an active limited member. Therefore a limited member (member role + rank below consultant), who is supposed to only reach Profilo+Informativa, CAN insert an executive child under their own id through addMarketerAction — a genealogy write they are UX-forbidden from. Confirmed no defense-in-depth; RLS is the sole line.

Skeptical scoping (why ALTO, not CRITICO): RLS still blocks the highest-value abuses. memberships_admin_write USING/CHECK = is_org_admin() OR platform-admin, and is_org_admin()=current_app_role() IN (admin,owner) read from the unforgeable JWT app_role claim — so setMemberRoleAction and activateCrmAccess membership writes by a non-admin are rejected (no privilege escalation to admin, no org-wide writes). The concretely-exploitable-today impact is bounded: (a) a limited member performing a subtree-scoped marketer insert they should not be able to, and (b) non-admin members viewing the admin shell (data still RLS-scoped to their subtree). This is a genuine authorization gap and a real defense-in-depth failure (any future RLS regression — e.g. the noted 0006→0042 insert-policy drift — becomes directly exploitable through these unguarded actions), but it is not auth/privilege bypass, data loss, or guaranteed outage. ALTO is correct; severity unchanged.

#### 4. Notification dismiss/mark-read are permanent no-ops: synthetic non-UUID ids hit a uuid PK (22P02 swallowed as success)

- **Gravità:** ALTO  ·  **Priorità:** P1  ·  **Tipo:** bug  ·  **Confidence:** high  ·  **Verdetto verifica:** confirmed
- **Dimensione:** Cross-cutting Data-flow & Frontend-Backend-DB Integration
- **Dove:** web/lib/data/notifications.ts:78 (id:`bday-${b.id}`), :114 (id:`newmember-${id}`) vs :148-163 markNotificationRead / :183-197 dismissNotification (.eq('id', id)); UI: web/components/notifications/notifications-manager.tsx:92-113 (markRead/dismiss)
- **Perché è un problema:** listNotifications generates ids as 'bday-<uuid>' and 'newmember-<uuid>'. markNotificationRead/dismissNotification do supabase.from('notifications').update(...).eq('id', id). Verified live: notifications.id is type uuid. Passing 'bday-…' to .eq on a uuid column produces Postgres 22P02 'invalid input syntax for type uuid'. supabase-js returns it as an error, but the surrounding try/catch returns {demo:true, ok:true} (it treats the throw as demo). The client (notifications-manager.tsx:98,111) then shows a success toast and optimistically updates local state. Because the inbox is regenerated every request (notifications.ts top comment + listNotifications), nothing was persisted, so the 'dismissed'/'read' item reappears on next load.
- **Conseguenza reale:** User dismisses or marks a birthday/new-member notification, sees a success toast, navigates away, and the notification is back — and the unread badge (layout.tsx:61 listNotifications().unread) is unchanged. Mark-all-read also never persists for these synthetic rows. The persistence layer is effectively dead code for the only two notification kinds that exist.
- **Come riprodurlo:** As a user with downline birthdays/new members, open /notifiche, click 'Segna come letto' or the X. Toast shows success. Reload → the notification is back and still unread.
- **Come risolverlo:** Treat generated ids as client-only no-ops with an honest result (return {demo:true, ok:true} WITHOUT touching the DB when id starts with 'bday-'/'newmember-'), OR back the inbox with a real notifications table and stable uuids. Also branch the catch so a real 22P02 isn't misreported as demo-success.
- **Impatto (scalabilità/sicurezza/performance):** Breaks the core UX contract of the notifications inbox; users cannot ever clear these notifications. Misleads via false success toasts.
- **Rischio futuro:** Any future deep-link / read-state feature built on notification ids inherits the broken contract; the swallowed 22P02 also hides the real cause from logs.
- **Nota verificatore:** OUTCOME CONFIRMED, but the finding's MECHANISM is factually wrong. Verified: web/lib/data/notifications.ts:76 generates id `bday-${b.id}` and :113 `newmember-${String(r.id)}`; markNotificationRead :154-158 / dismissNotification :189-192 / markAllNotificationsRead :171-175 run `supabase.from('notifications').update(...).eq('id', id)`. Live DB: information_schema.columns shows notifications.id is type uuid default gen_random_uuid(). Live test `SELECT 'bday-00000000-...'::uuid` → ERROR 22P02 invalid input syntax for type uuid. PostgREST returns HTTP 400 with that error body, so the update genuinely fails and persists nothing. The inbox is DERIVED at request time, never stored (notifications.ts:7-17 header + listNotifications :129-145 rebuilds from closure/birthdays every call; generated rows always have read_at:null at :81,:119). Layout badge (web/app/(app)/layout.tsx:61) = listNotifications().unread, recomputed every request → never decrements. Net effect = dismiss/mark-read/mark-all are permanent no-ops for the only two notification kinds; items reappear on reload; success toast always shown. That matches the consequence. HOWEVER the finding's core causal claim is WRONG: it says supabase-js throws the 22P02 and the try/catch returns {demo:true, ok:true} ('treats the throw as demo'). I read the installed postgrest-js 2.106.2 PostgrestBuilder.ts: shouldThrowOnError defaults false (:82,:135); processResponse only throws when shouldThrowOnError (:534-536) — otherwise returns {success:false, error, data:null} (:539-546). The code never calls .throwOnError(). So `const { error } = await ...` (:154,:189) gets a non-null error WITHOUT throwing → returns {demo:false, ok:false}; the catch (:160,:194) is NEVER reached. Thus res.demo is false (not the claimed true), and the demo-mode toast description is NOT shown. The false success toast happens for a DIFFERENT reason: notifications-manager.tsx notifyDemo (:84-90) is hardcoded variant:'success' and the markRead/markAll/dismiss handlers (:96-98,:104-106,:110-112) ignore res.ok entirely. So the proposed fix item 'branch the catch so a real 22P02 isn't misreported as demo-success' targets a non-existent code path. Verdict confirmed (real, impactful, ALTO is right: a core inbox feature is permanently broken with misleading feedback), but the mechanism description and one fix bullet are inaccurate and should be corrected: the bug is (a) querying a uuid column with synthetic non-uuid ids against a derived/never-stored inbox, and (b) the client never surfacing ok:false.

#### 5. saveWishlist hard-deletes the entire list then re-inserts, non-transactionally (data-loss window + ignores soft-delete)

- **Gravità:** ALTO  ·  **Priorità:** P1  ·  **Tipo:** bug  ·  **Confidence:** high  ·  **Verdetto verifica:** confirmed
- **Dimensione:** Database Schema, Indexing, N+1 & Query Cost (live + code)
- **Dove:** web/lib/data/wishlist.ts:67-86 (delete().eq('owner_marketer_id') then insert([...]))
- **Perché è un problema:** The two statements run as separate PostgREST calls with no transaction. If the DELETE succeeds and the INSERT fails (network error, RLS check_qual rejection, constraint), the user's whole 100's list is permanently gone. It also issues a HARD delete on a table that has a deleted_at soft-delete column (wishlist_items.deleted_at), discarding history and any FK references, and re-creates rows with fresh ids on every save (churns the table, breaks any external reference to item ids).
- **Conseguenza reale:** A transient failure mid-save wipes the user's bucket list with no recovery. Every reorder/edit deletes and recreates all N rows, generating N tombstones-worth of churn and invalidating ids.
- **Come riprodurlo:** Call saveWishlist with a valid owner, then force the insert to fail (e.g. a row violating a check); the prior list is already deleted and not restored.
- **Come risolverlo:** Do the replace in a single RPC/transaction (delete+insert inside one SECURITY INVOKER function), or better, diff the incoming list against existing rows and UPDATE positions/flags in place + insert/soft-delete the delta, preserving ids. At minimum wrap in a DB function so it is atomic.
- **Impatto (scalabilità/sicurezza/performance):** data integrity
- **Rischio futuro:** Probability of the failure window being hit rises with usage and list size; silent data loss is the worst-perceived bug class.
- **Nota verificatore:** CONFIRMED. Verified against code + live DB (project qpfnsselgwulrlmlandd).

CODE (web/lib/data/wishlist.ts:67-86): saveWishlist runs two separate PostgREST calls with no transaction/RPC: line 69 `await supabase.from('wishlist_items').delete().eq('owner_marketer_id', marketerId)` (HARD delete, return value/error not even checked), then lines 71-80 `.insert([...])`. getClient() (web/lib/data/crm-shared.ts:47-54) returns the RLS-BOUND server client (createClient from @/lib/supabase/server), NOT service-role — so both statements are subject to RLS. If the DELETE commits and the INSERT then fails, the list is gone with no restore. Confirmed.

SOFT-DELETE IGNORED: Live columns show wishlist_items.deleted_at timestamptz nullable (migration 0025_wishlist.sql:28). getWishlist (wishlist.ts:35) filters `.is('deleted_at', null)` and migration 0025:34-36 builds partial index `wishlist_owner_idx ... WHERE deleted_at IS NULL` — the table is explicitly designed for soft-delete, yet saveWishlist issues a physical DELETE. Confirmed design inconsistency.

STRONGER-THAN-CLAIMED TRIGGER (RLS asymmetry): pg_policy on wishlist_items shows DELETE using_qual = `org_id=current_org_id() AND (is_org_admin() OR can_see_marketer(owner_marketer_id))` (NO membership check), but INSERT with_check = `... AND current_membership_active() AND (is_org_admin() OR can_see_marketer(...))`. So a caller with subtree visibility but an INACTIVE membership passes DELETE and then FAILS the re-INSERT WITH CHECK → deterministic, reproducible total data loss, not merely a transient network error. This strengthens the finding.

CHURN: client WishlistManager.persist() (web/components/team/wishlist-manager.tsx:53-67) fires on every add/toggle/delete/reorder, each sending the full list, so even toggling one item done deletes+reinserts ALL N rows with fresh gen_random_uuid() ids. Confirmed.

OVERSTATED SUB-CLAIM: pg_constraint query for confrelid='public.wishlist_items' returned [] — NO foreign keys reference wishlist_items.id. So 'breaks any external reference to item ids / discards FK references' is currently false; id-churn is real but low-impact today.

SEVERITY: ALTO is correct. Real data-integrity / silent data-loss bug with a deterministic trigger, but blast radius is a single user's personal 100's list (not org-wide, no auth/privilege bypass), so not CRITICO. The FK overstatement does not lower the core severity.

#### 6. Migration drift: repo committed only through 0046 but live DB has 0047/0048/0049 (plus squashed/renamed early migrations)

- **Gravità:** ALTO  ·  **Priorità:** P1  ·  **Tipo:** tech_debt  ·  **Confidence:** high  ·  **Verdetto verifica:** confirmed
- **Dimensione:** DevOps, CI/CD, Config, Secrets, Observability, Production Readiness
- **Dove:** supabase/migrations/ (git ls-files: 0001..0046, 46 files) vs live list_migrations (project qpfnsselgwulrlmlandd): adds 0047_repair_antonio_closure, 0048_add_cliente_norank_to_rank_enum, 0049_ranks_meta_cliente_norank; also live names 0008_contacts_centos and 0021_to_0026_final do not match the repo's per-file naming
- **Perché è un problema:** Verified directly: git ls-files supabase/migrations/ lists exactly 0001..0046. The live DB's migration ledger (via MCP list_migrations) contains three additional applied migrations (0047/0048/0049) that exist in NO committed file, and the early-migration version names were squashed (0008_contacts_centos, 0010_seven_whys_documents, 0012_prospects_calls, 0014_notifications_audit, 0021_to_0026_final) and do not correspond 1:1 to the repo's filenames. The repo therefore cannot reproduce the production schema via `supabase db reset`/`db push`.
- **Conseguenza reale:** A fresh environment built from the repo (CI shadow DB, a new region, disaster recovery, a new developer) will be missing 0047-0049 — including the cliente/no_rank enum values that production code already depends on (session.ts:48-50 lists 'cliente'/'no_rank' as valid ranks; middleware limited-view logic depends on them). Restoring/rebuilding from source produces a schema that diverges from prod and can break enum casts and rank gating. Out-of-band MCP-applied changes are also un-reviewed.
- **Come riprodurlo:** Compare `git ls-files supabase/migrations/` (ends 0046) with MCP list_migrations for qpfnsselgwulrlmlandd (ends 0049). Run supabase db reset from the repo: the cliente/no_rank enum members and 0047 closure repair are absent.
- **Come risolverlo:** Commit the exact SQL of 0047/0048/0049 (and reconcile the squashed early-migration names) into supabase/migrations/ so the repo is the source of truth. Stop applying schema via MCP/dashboard to production; route all DDL through reviewed migration files + CI-verified `db push`. Add a CI check that diffs committed migrations against the live ledger.
- **Impatto (scalabilità/sicurezza/performance):** scalability
- **Rischio futuro:** Drift accumulates every time a fix is hand-applied; eventually the repo cannot rebuild prod at all, making DR and environment cloning unreliable precisely when they are needed most.
- **Nota verificatore:** Verified against both the committed repo and the live DB (project qpfnsselgwulrlmlandd). (1) `git ls-files supabase/migrations/` returns exactly 0001..0046 (46 files); no 0047/0048/0049. (2) list_migrations AND a direct query of supabase_migrations.schema_migrations both show three extra applied migrations with no committed file: 0047_repair_antonio_closure, 0048_add_cliente_norank_to_rank_enum, 0049_ranks_meta_cliente_norank. (3) The enum drift is real and code-depended-upon: committed 0002_enums.sql:50-58 defines marketer_rank as executive..vice_president; committed 0027 adds the top 3; committed 0039:2 adds advanced_team_leader. NO committed migration adds 'cliente'/'no_rank' (the 'cliente' at 0002_enums.sql:96 belongs to the unrelated contact_status enum). Live pg_enum for marketer_rank DOES contain cliente (0) and no_rank (0.5), and live ranks_meta has cliente(-1)/no_rank(0) rows with no committed migration (0028 incl.) creating them. Production code hard-depends on these values: web/lib/data/session.ts:48-50 asRank allowlist; web/lib/types/db.ts:19-20,34-35,50-51 MarketerRank union/labels; web/middleware.ts:84 + web/lib/nav.ts:48,84,135 limited-view gating. (4) Early-migration squash confirmed: live ledger names (0008_contacts_centos, 0010_seven_whys_documents, 0012_prospects_calls, 0014_notifications_audit, 0021_to_0026_final) do not match repo filenames 1:1; repo's 0020_cron has no ledger entry. Net: a `supabase db reset`/`db push` from the repo reproduces only through 0046, missing the cliente/no_rank enum values that shipped code already references plus the 0047 closure repair — genuine source-of-truth/DR drift with code impact. Only auditor error is the cited path (web/lib/session.ts vs actual web/lib/data/session.ts); line numbers and substance correct. ALTO is right: DR/source-of-truth reliability + breaks rank gating/enum casts on a from-source rebuild; not remotely exploitable so not CRITICO, more than MEDIO.

#### 7. markAllNotificationsRead marks the ENTIRE org read for an admin/owner (no recipient scope)

- **Gravità:** ALTO  ·  **Priorità:** P1  ·  **Tipo:** bug  ·  **Confidence:** high  ·  **Verdetto verifica:** confirmed
- **Dimensione:** Domain Logic Correctness: Notifications, Birthdays, Dashboard, Limited-view, Ranks
- **Dove:** web/lib/data/notifications.ts:166-180 (markAllNotificationsRead); supabase/migrations/0014_notifications.sql:138-153 (notifications_update policy: is_org_admin() OR recipient=current_marketer_id())
- **Perché è un problema:** The UPDATE filters only `.eq('org_id', orgId).is('read_at', null)` with NO recipient_marketer_id predicate. The table's UPDATE RLS policy lets is_org_admin() update org-wide. So when the caller is an admin/owner (the live org owner is role=owner), this statement flips read_at on every unread notification of every marketer in the org, not just the caller's own.
- **Conseguenza reale:** An admin clicking 'Segna tutte come lette' silently marks all other members' notifications as read across the whole tenant — data corruption of other users' inbox state. Members are unaffected only because RLS happens to narrow them to self.
- **Come riprodurlo:** As an admin/owner, with real persisted notifications for multiple recipients in the org, call markAllReadAction(); inspect notifications: every recipient's unread rows now have read_at set.
- **Come risolverlo:** Always scope by the caller: add .eq('recipient_marketer_id', marketerId) (from getOwnerContext) to the UPDATE, regardless of role. Do not rely on RLS to scope a 'mark MY notifications' operation when the policy intentionally widens for admins.
- **Impatto (scalabilità/sicurezza/performance):** Cross-user data integrity violation for any privileged caller once notifications are persisted.
- **Rischio futuro:** Currently dormant only because notifications are never stored; becomes an active data-corruption bug the instant a real producer writes rows.
- **Nota verificatore:** CONFIRMED. Code: web/lib/data/notifications.ts:166-180 markAllNotificationsRead does `.update({read_at}).eq('org_id', orgId).is('read_at', null)` with NO recipient predicate, even though getOwnerContext() returns marketerId (crm-shared.ts:62-68) and only destructures orgId (line 170). RLS verified LIVE (pg_policy on public.notifications): notifications_update USING and WITH CHECK both = ((org_id = current_org_id()) AND (is_org_admin() OR (recipient_marketer_id = current_marketer_id()))). is_org_admin() (pg_get_functiondef) = current_app_role() IN ('admin','owner') OR is_platform_admin(), which short-circuits TRUE for an admin/owner, so RLS does NOT narrow the UPDATE to the caller's own rows -> an owner/admin clicking the button flips read_at on EVERY recipient's unread row in the org. The action is wired to UI: notifiche/actions.ts:24-25 markAllReadAction -> markAllNotificationsRead, invoked from components/notifications/notifications-manager.tsx:105 ('Segna tutte come lette'). Live org memberships: 1 owner, 2 co_admin, 4 member -> a privileged caller (owner) exists. Severity ALTO is correct, NOT CRITICO: the bug is currently DORMANT — live notifications table has 0 rows, pg_cron is NOT installed, and listNotifications never reads the table (derives inbox from marketer_tree_closure + marketers, lines 43-145). One correction to the finding's reasoning: it claims 'no real producer' — that is WRONG and actually strengthens the finding. Two deployed DB functions write multi-recipient rows: public.run_bottleneck_engine (INSERT INTO public.notifications ... SELECT bf.org_id, bf.marketer_id, 'bottleneck_alert' ...) and public.generate_monthly_reports (INSERT INTO public.notifications (...) VALUES (p_org_id, v_subject, 'monthly_report_ready' ...)). The instant these existing producers are scheduled, the empty-table mitigation evaporates and the cross-user inbox corruption becomes active. Fix is trivial and correct: add .eq('recipient_marketer_id', marketerId) (already returned by getOwnerContext) and never rely on the intentionally-admin-widened RLS policy to scope a 'mark MY notifications' op.

#### 8. Kanban optimistic rollback captures the ALREADY-MOVED state, so a failed write never reverts

- **Gravità:** ALTO  ·  **Priorità:** P1  ·  **Tipo:** bug  ·  **Confidence:** high  ·  **Verdetto verifica:** confirmed
- **Dimensione:** React Correctness: Hooks, Effects, Re-renders, Memory Leaks, State
- **Dove:** web/components/prospects/prospect-board.tsx:204-224 (onDragOver) and :226-272 (onDragEnd, esp. snapshot at :261)
- **Perché è un problema:** onDragOver continuously calls setStageMap to move the dragged card into the hovered column for live preview. onDragEnd then captures `const snapshot = stageMap` (line 261) from its closure — but by the time the drop fires, stageMap already reflects the dragOver mutation (the card is already in the destination column). On a server failure it does `setStageMap(snapshot)` (line 269), which restores the post-move state, not the original. The card stays in the wrong column while the DB still has the old stage.
- **Conseguenza reale:** After a transient server/RLS error on a stage change, the board shows the prospect in the new stage but the database keeps the old stage. The user believes the move succeeded (no visible revert), and the inconsistency persists until a full page refresh. Data shown ≠ data stored.
- **Come riprodurlo:** Force changeStageAction to return {ok:false} (e.g. RLS denial / network blip). Drag a card from 'conoscitiva' to 'closing'. An error toast appears, but the card remains in 'closing'. Reload: it is back in 'conoscitiva'. The optimistic move was never rolled back.
- **Come risolverlo:** Capture the snapshot BEFORE any optimistic mutation: store toStageMap(board) (or the pre-dragStart map) in a ref on onDragStart, and restore THAT on failure. Do not rely on the closure value of stageMap, which onDragOver has already mutated.
- **Impatto (scalabilità/sicurezza/performance):** Data-integrity / correctness: UI diverges from persisted state on any write failure under real load (mobile networks, RLS edge cases).
- **Rischio futuro:** Bites whenever the backend is flaky; silent drift is the worst kind because users act on stale UI.
- **Nota verificatore:** VERIFIED CONFIRMED by reading web/components/prospects/prospect-board.tsx and the data layer. The bug mechanic is exactly as described.

Chain of evidence:
1. onDragOver (lines 204-224) commits a REAL state update during the drag: for a cross-column move (from !== to) it calls setStageMap(prev => ...) removing the card from `from` and prepending it to `to` with current_stage: to (lines 218-222). This re-renders the component, so the new render's closure has stageMap = the already-moved map.
2. onDragEnd (line 226) is a plain function recreated every render and passed fresh to <DndContext onDragEnd={onDragEnd}> (line 390). The drop therefore invokes the LATEST closure, where stageMap already reflects onDragOver's mutation.
3. Line 261 `const snapshot = stageMap` thus captures the POST-move map (card already in destination), not the original.
4. originStage (lines 250-252) is correctly derived from board.columns (the immutable server prop), so destStage !== originStage holds and the write proceeds — the guard at line 254 does NOT prevent this.
5. On failure, line 269 setStageMap(snapshot) restores the moved map → the card stays in the destination column while the DB keeps the old stage. No real rollback; divergence persists until reload (router.refresh only runs on success, line 296).

Real (non-demo) failure path is reachable: web/lib/data/prospects.ts:272-277 and 289-294 return {ok:false, demo:false} on an RPC error (RLS denial / thrown exception), so the broken rollback branch genuinely executes in production, not just in theory.

Note the correct pattern is already used elsewhere in the same file: line 256 uses toStageMap(board) to snap back, proving toStageMap(board) (or a ref captured in onDragStart) is the right snapshot source — exactly the proposed fix.

Minor correction to the finding's framing: the user is NOT left with zero feedback — an error toast 'Operazione non riuscita. Riprova.' fires (line 270). So 'user believes the move succeeded' is slightly overstated; however the visual move is genuinely never reverted, contradicting both the toast and the DB. Severity ALTO stands: real data-shown != data-stored correctness defect on a reachable failure path, but it requires a write failure to trigger, shows an error toast, and self-heals on next refresh — so not CRITICO.

#### 9. Real enrollment (iscrizione) leaves prospect outcome='open'/closed_at=NULL — changeStage never passes p_outcome

- **Gravità:** ALTO  ·  **Priorità:** P1  ·  **Tipo:** bug  ·  **Confidence:** high  ·  **Verdetto verifica:** confirmed
- **Dimensione:** Server Actions, Data Layer Correctness, Transactions & Resilience
- **Dove:** web/lib/data/prospects.ts:266-271 (changeStage RPC call); caller web/components/prospects/prospect-board.tsx:329 changeStageAction(target.id,'iscrizione'); RPC def supabase/migrations/0012_prospects_journey.sql:259-378
- **Perché è un problema:** change_prospect_stage(p_prospect_id,p_new_stage,p_notes,p_outcome DEFAULT NULL,p_at DEFAULT NULL): when p_outcome is NULL the RPC computes v_new_outcome=COALESCE(NULL, current_outcome) and v_new_closed=NULL, i.e. it leaves outcome='open' and closed_at=NULL even when moving to the terminal 'iscrizione' stage. There is NO trigger that auto-derives outcome from stage (confirmed: 0012 has only prospects_open_first_event AFTER INSERT; the header comment at 0012:246-249 explicitly says the CALLER must pass p_outcome='enrolled'). The data layer calls the RPC with only 3 args and the optimistic object it returns sets outcome:'enrolled', so client state and DB diverge.
- **Conseguenza reale:** Every enrolled prospect is persisted as still 'open'. The kanban 'openOnly' filter (.eq('outcome','open'), prospects.ts:100) keeps showing iscritti as open; any report/metric that filters or counts on outcome undercounts enrollments; closed_at is never stamped so funnel-time and conversion analytics on closed_at are wrong. On the next server render the card 'jumps back' from the optimistic enrolled state to an open-looking row.
- **Come riprodurlo:** With Supabase configured, drag a prospect to the Iscrizione column (or use the closing CTA). Then SELECT current_stage,outcome,closed_at FROM prospects WHERE id=<that prospect>: current_stage='iscrizione' but outcome='open', closed_at IS NULL.
- **Come risolverlo:** In changeStage, pass p_outcome:'enrolled' (and rely on the RPC to stamp closed_at) when toStage==='iscrizione' (and the appropriate terminal outcome for lost/on_hold flows). The RPC already supports it; e.g. supabase.rpc('change_prospect_stage',{p_prospect_id,p_new_stage:toStage,p_notes:notes??null,p_outcome:toStage==='iscrizione'?'enrolled':null}).
- **Impatto (scalabilità/sicurezza/performance):** Corrupts the core funnel/conversion data the whole CRM is built to report on; dashboard.ts works around it by also checking stage, masking the bug while leaving the DB inconsistent for every other consumer.
- **Rischio futuro:** Any new query that trusts prospects.outcome (exports, RLS, downstream analytics facts) will silently produce wrong numbers; very hard to detect because the optimistic UI looks correct.
- **Nota verificatore:** CONFIRMED. Core claim verified against code + live DB (project qpfnsselgwulrlmlandd).

RPC: Live pg_get_functiondef of public.change_prospect_stage matches migration 0012 exactly: v_new_outcome := COALESCE(p_outcome, v_prospect.outcome); v_new_closed := CASE WHEN v_new_outcome='open' THEN NULL ELSE v_at END. With p_outcome NULL and an open prospect, moving to 'iscrizione' persists outcome='open', closed_at=NULL.

Caller: web/lib/data/prospects.ts:267-271 calls supabase.rpc('change_prospect_stage',{p_prospect_id,p_new_stage:toStage,p_notes}) — only 3 args, never p_outcome. Confirmed via grep this is the sole RPC call site. The optimistic object (prospects.ts:240) and prospect-board.tsx:105 set outcome:'enrolled', diverging from the DB.

No auto-derivation: live pg_trigger on prospects = {prospects_enqueue_metric (AFTER), trg_prospects_open_first_event (AFTER INSERT only), trg_prospects_updated_at}. None set outcome from stage. CHECK prospects_closed_consistency ties outcome<->closed_at but NOT stage, so the wrong row (stage=iscrizione, outcome=open, closed_at=NULL) is constraint-valid.

Independent corroboration of the bug: web/lib/data/dashboard.ts:105 (comment) + 128-130 classify enrolled = (r.outcome==='enrolled' || stageIndex(current_stage)===iscr). The '|| stage===iscrizione' branch is a deliberate workaround that only makes sense if outcome stays 'open' after enrollment — the author knew. This masks the bug for the conversion metric while leaving prospects.outcome/closed_at wrong for every other consumer (exports, funnel-time on closed_at, any future query trusting outcome).

Live data note: no prospect is currently in iscrizione (all rows open in conoscitiva/business_info), so I could not observe a real corrupted row, but the codepath + RPC logic guarantee it; verdict rests on code/schema, not on existing data.

Two finding consequences are OVERSTATED (do not change severity): (1) the openOnly filter (prospects.ts:100 .eq('outcome','open')) is implemented but never set true by any caller (grep: no openOnly:true anywhere) — dormant, not active; enrolled cards leave the board because iscrizione is not a kanban column, not via outcome. (2) 'card jumps back to open-looking row' is inaccurate: the real path re-reads canonical state (prospects.ts:280) and the board removes the card entirely on enroll (prospect-board.tsx:334-340), so no visible jump-back.

Severity ALTO is correct: real data-integrity defect on the core funnel field, masked only by dashboard.ts's defensive double-check, with latent risk for any new consumer. Not CRITICO — no auth/security bypass, no data loss (state is recoverable from current_stage), and the one active analytics path already compensates.

#### 10. bulkTagContacts reads existing tags from MOCK_CONTACTS in the LIVE path → overwrites/loses real tags

- **Gravità:** ALTO  ·  **Priorità:** P1  ·  **Tipo:** bug  ·  **Confidence:** high  ·  **Verdetto verifica:** confirmed
- **Dimensione:** Server Actions, Data Layer Correctness, Transactions & Resilience
- **Dove:** web/lib/data/contacts.ts:238-258 (line 247: const current = MOCK_CONTACTS.find((c)=>c.id===id)?.tags ?? [])
- **Perché è un problema:** In the configured-Supabase branch the per-row tag merge computes the base set from the in-memory MOCK_CONTACTS array, not from the actual DB row. For any real contact id, MOCK_CONTACTS.find returns undefined, so current=[] and the UPDATE sets tags = the new tags only, discarding whatever tags the contact already had in the DB.
- **Conseguenza reale:** Bulk-tagging real contacts silently deletes all their pre-existing tags (replace instead of add). Irreversible per-row data loss of tag metadata; returns ok:true so the user gets a success toast.
- **Come riprodurlo:** On a real DB, give contact C tags ['vip']. Select C in the list and bulk-add tag ['call-back']. Re-read C: tags=['call-back'] (the 'vip' tag is gone) instead of ['vip','call-back'].
- **Come risolverlo:** Read current tags from the DB (or do the merge in SQL with array_cat/dedup, e.g. an RPC or update ... set tags = (select array(select distinct unnest(tags||$tags)) ...)). Never source live merge state from the mock dataset.
- **Impatto (scalabilità/sicurezza/performance):** Data integrity: destroys user-curated segmentation tags during a bulk operation that is presented as additive ('add tags').
- **Rischio futuro:** Same mock-as-source-of-truth anti-pattern appears in update merges across the layer; will keep producing 'lost field' bugs as more columns are edited.
- **Nota verificatore:** Confirmed by reading web/lib/data/contacts.ts:238-258. Line 242 getClient() and line 243 early-return: the early return ONLY fires when supabase is null (env missing). When Supabase IS configured, execution reaches the try block (244) and line 247 literally does `const current = MOCK_CONTACTS.find((c) => c.id === id)?.tags ?? []`, line 248 `merged = Array.from(new Set([...current, ...tags]))`, lines 249-252 `update({ tags: merged })`.eq('id', id) — a full overwrite, not array_cat in SQL (the line-245 comment is misleading). MOCK_CONTACTS ids are demo strings (web/lib/data/mock/contacts.ts:37 `id:'ct-001'`...), while real rows are UUIDs, so for any real contact .find() returns undefined => current=[] => the UPDATE writes ONLY the new tags, discarding pre-existing DB tags. Live DB confirms the column is real and persisted: information_schema shows public.contacts.tags = ARRAY (text[]), default '{}', NOT NULL. The operation is unambiguously additive by intent: action name 'Bulk add tags' (contacts.ts:237; actions.ts:63), and the client optimistic update at web/components/contacts/contacts-manager.tsx:283 merges `Array.from(new Set([...c.tags, ...tags]))` — so local UI state shows merged tags while the DB row is overwritten, and the toast at 288-292 reports success (ok:true). Net: silent, irreversible per-row loss of curated tags. One caveat (reason I did not escalate, and why a strict reviewer might say 'not currently reproducible'): the dev DB contacts table is empty right now (SELECT count = 0, with_tags = 0), so no live data is being lost today; the bug is unconditional in code the moment any real contact has >=1 existing tag. Severity ALTO is correct: data-integrity loss under a normal feature, but not remotely exploitable, no auth/privilege bypass, scoped to RLS-visible rows, so not CRITICO. Note the same mock-as-source anti-pattern also exists in updateContact (line 199) for the demo `merged` fallback, though there the live path correctly does a partial PATCH so it does not lose data.

#### 11. createInvitation reports ok:true/demo:true on REAL Edge Function failure — silently lies success in production

- **Gravità:** ALTO  ·  **Priorità:** P1  ·  **Tipo:** bug  ·  **Confidence:** high  ·  **Verdetto verifica:** confirmed
- **Dimensione:** Server Actions, Data Layer Correctness, Transactions & Resilience
- **Dove:** web/lib/data/admin-invitations.ts:101-118 (lines 111-113 and the catch at 116-117)
- **Perché è un problema:** In the configured path, if supabase.functions.invoke('create-invitation') returns an error OR no invitation_id (function not deployed, 500, auth error, RPC failure), the code returns {invitation:base, demo:true, ok:true} — a fabricated optimistic pending row marked as a successful 'demo' simulation. The catch block does the same. So a production failure to actually mint+email the invitation is indistinguishable from demo mode and is shown to the admin as success.
- **Conseguenza reale:** An admin believes a CRM-access invitation was issued and the email sent, but nothing was persisted or sent. The (fake) row even appears in the optimistic list. The invitee never receives access; the admin has no error signal.
- **Come riprodurlo:** With Supabase configured but the create-invitation Edge Function not deployed (or returning 500), issue an invitation: the UI shows a pending invitation and a success/demo toast; account_invitations has no new row and no email is sent.
- **Come risolverlo:** When env is configured, treat an invoke error / missing invitation_id as ok:false, demo:false and surface a real error to the UI. Reserve demo:true strictly for the no-env branch.
- **Impatto (scalabilità/sicurezza/performance):** Security/onboarding correctness: silently failed access provisioning with false positive feedback; undermines trust in the admin console.
- **Rischio futuro:** Masks Edge Function regressions indefinitely; failures only surface as 'why didn't X get access' support tickets.
- **Nota verificatore:** Confirmed by code + live DB. web/lib/data/admin-invitations.ts:101-118: with Supabase configured, if functions.invoke('create-invitation') returns error OR no invitation_id, line 111-113 returns {invitation:base, demo:true, ok:true}; the catch at 116-117 returns the same. Real production failures are thus indistinguishable from demo mode and reported as success. The 'ok' field is dead: Grep for '.ok' in web/components/admin/invitations-manager.tsx finds NO matches; onCreate (lines 86-100) never reads res.ok — it unconditionally does setItems([res.invitation,...]) (line 93) and fires a success toast (line 94-98), only switching the description to 'created_demo' when res.demo. The createInvitationAction wrapper (web/app/(app)/admin/attivazioni/actions.ts:18-22) just passes the result through. Crucially, this is NOT hypothetical: list_edge_functions on live project qpfnsselgwulrlmlandd returns {"functions":[]} — the create-invitation Edge Function is NOT deployed, so EVERY invitation attempt in the configured project hits the error||!invitationId branch (line 111) and is reported to the admin as a successful demo invitation while nothing is persisted in account_invitations and no email is sent. listInvitations (lines 32-37) reads the real table, so the fabricated optimistic row disappears on refresh. Auditor's repro, consequence, and fix are accurate. Severity ALTO is correct: silently-failed access provisioning with false-positive feedback, currently a 100% failure rate; not CRITICO since it is not a remote exploit/privilege bypass/data loss.

#### 12. Storage bucket org-assets policies have NO org scoping: any authenticated user can overwrite/delete/list every org's files (cross-tenant)

- **Gravità:** ALTO  ·  **Priorità:** P1  ·  **Tipo:** security  ·  **Confidence:** high  ·  **Verdetto verifica:** confirmed
- **Dimensione:** Supabase RLS & DB Function Security (live)
- **Dove:** storage.objects policies org_assets_auth_insert / org_assets_auth_update / org_assets_auth_delete / org_assets_public_read (bucket org-assets)
- **Perché è un problema:** All three write policies for role authenticated have USING/WITH CHECK = just (bucket_id = 'org-assets'::text). There is no org_id prefix check on the object name/path, no owner check, and no membership check. The shared bucket holds assets for ALL organizations. org_assets_public_read has roles=NULL (everyone) with USING (bucket_id='org-assets'), so any client can also LIST/READ every object (advisor public_bucket_allows_listing).
- **Conseguenza reale:** A logged-in user in org A can DELETE or overwrite (UPDATE) any file belonging to org B (logos, document attachments, exports) and enumerate/read all of them. This is cross-tenant data tampering / destruction and information disclosure.
- **Come riprodurlo:** Authenticate as any org member, then DELETE FROM storage via the client: supabase.storage.from('org-assets').remove(['<some-other-orgs-path>']) or .upload over an existing path. The DELETE policy USING only checks bucket_id, so it succeeds regardless of which org owns the file. List via .list() succeeds for anyone due to org_assets_public_read.
- **Come risolverlo:** Scope every org-assets policy by deriving org from the object path, e.g. require (storage.foldername(name))[1] = current_org_id()::text in USING and WITH CHECK for insert/update/delete, and restrict SELECT/list to that same prefix (or make the bucket non-public and use signed URLs). Remove the blanket public-read listing policy.
- **Impatto (scalabilità/sicurezza/performance):** Breaks tenant isolation at the storage layer; enables cross-org data loss and disclosure independent of the otherwise-solid table RLS.
- **Rischio futuro:** As more orgs onboard and more files are stored, the blast radius grows; a single malicious or compromised member can wipe other tenants' assets.
- **Nota verificatore:** CONFIRMED. Tried to refute it but every claim holds.

LIVE pg_policy on storage.objects (project qpfnsselgwulrlmlandd) returns exactly 4 policies for the org-assets bucket, all with the described gaps:
- org_assets_auth_insert (cmd=a, role authenticated): WITH CHECK = (bucket_id = 'org-assets'::text), USING null
- org_assets_auth_update (cmd=w, role authenticated): USING and WITH CHECK both = (bucket_id = 'org-assets'::text)
- org_assets_auth_delete (cmd=d, role authenticated): USING = (bucket_id = 'org-assets'::text), no other predicate
- org_assets_public_read (cmd=r, roles=NULL i.e. PUBLIC): USING = (bucket_id = 'org-assets'::text)
No org_id / path-prefix / owner / membership check on any of them. Source matches: supabase/migrations/0045_org_documents_and_logo.sql lines 56-74 (line 58 INSERT bucket public=true; lines 63-74 the four policies verbatim). Live storage.buckets confirms org-assets public=true, file_size_limit=null, allowed_mime_types=null.

Objects ARE stored under an org_id prefix (live storage.objects: 'ad9a57f3-.../logo/...png', '.../documents/...png'), so storage.foldername(name)[1] scoping is feasible but is NOT applied -> the fix is exactly as proposed.

Critical aggravator: writes happen client-side via the RLS-bound ANON browser client, not service-role. web/components/team/documents-settings.tsx:95-114 and web/components/team/org-identity-settings.tsx:73-85 call supabase.storage.from('org-assets').upload/remove on createClient(), which is createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY) (web/lib/supabase/client.ts:18). So storage RLS is the SOLE enforcement layer; the migration's own comment (0045 line 61, 'app-layer restricts who calls it') is false for direct client storage calls — any authenticated member can run .remove([...]) / .upload(over existing path) regardless of UI gating, and even a limited-view member can destroy admin-published document objects that org_documents table RLS would forbid them to delete (storage object has no matching check), causing data loss + metadata/storage divergence.

Supabase's own security advisor independently flags public_bucket_allows_listing for bucket org-assets / policy org_assets_public_read (get_advisors security, cache_key public_bucket_allows_listing_org-assets), confirming the public list/read disclosure.

Severity stays ALTO. The cross-TENANT blast radius is currently latent (live organizations count = 1, so no second org's files exist to wipe today), which is the only reason it is not CRITICO. But the structural tenant-isolation break is real and confirmed, the public-read/listing disclosure is live now, and intra-org unauthorized destruction of storage objects by limited members is already exploitable. ALTO is correct.

#### 13. Server actions perform ZERO server-side validation — all input is trusted (zod installed but never used)

- **Gravità:** ALTO  ·  **Priorità:** P1  ·  **Tipo:** security  ·  **Confidence:** high  ·  **Verdetto verifica:** confirmed
- **Dimensione:** TypeScript Soundness & Input Validation
- **Dove:** web/app/(app)/contatti/actions.ts:39-93; web/app/(app)/percorso-prospect/actions.ts:43-66; web/app/(app)/chiamate/actions.ts:25-30; web/app/(app)/documenti/actions.ts:42-106; web/app/(app)/team/[id]/actions.ts:27-83; web/app/(app)/lista-contatti/actions.ts:39-69; package.json:37
- **Perché è un problema:** Next.js Server Actions are a public RPC endpoint: the function args are deserialized from an attacker-controllable POST body, and TypeScript types (ContactInput, ProspectInput, CallInput, {rank?, status?}, MembershipRole, string[]) are fully erased at runtime. Every action here is a thin wrapper that forwards `input`/`patch`/`ids` directly to the data layer, which builds an `optimistic` object and inserts it (e.g. contacts.ts:150-191, calls.ts:119-155, prospects.ts:173-212). No length checks, no enum membership checks, no shape checks. `zod ^3.23.8` is a declared dependency but `import .* zod` / `z.object` / `safeParse` have ZERO matches in the entire web/ tree.
- **Conseguenza reale:** A caller can POST arbitrary payloads: oversized strings (no length cap on notes/full_name/first_name → DB bloat / cost), arbitrary `owner_marketer_id`/`marketer_id`/`contact_id` to attribute records to other marketers (only RLS WRITE policies stop cross-org writes; nothing validates the FK target belongs to the caller), invalid enum-ish strings that reach the insert (Postgres rejects bad enums, but the action returns a generic ok:false with no field-level feedback). Bulk actions (bulkTagContactsAction, bulkDeleteContactsAction) accept an unbounded `ids: string[]` — a client can send 100k ids in one call.
- **Come riprodurlo:** From the browser devtools on any authenticated page, invoke the bound server action with a crafted payload, e.g. createCallAction({ call_type: 'outbound', outcome: 'connesso', duration_secs: -999999, occurred_at: 'not-a-date', marketer_id: '<someone-elses-id>' }). duration_secs negative and a bogus occurred_at flow into the optimistic Call and into the insert unvalidated; marketer_id overrides the caller default (calls.ts:128).
- **Come risolverlo:** Define a zod schema per action input (it is already a dependency) and `schema.safeParse(input)` at the TOP of each server action, returning a typed validation-error envelope on failure. Validate: enum membership against the canonical *_ORDER arrays, string max-lengths, numeric ranges (duration_secs >= 0, percorso 0..5, rating 1..5), date parseability, and array size caps for bulk ops. Do NOT trust owner/marketer/contact ids from the client — derive owner from getOwnerContext() and verify referenced ids are visible to the caller.
- **Impatto (scalabilità/sicurezza/performance):** Security (mass-assignment / attribution spoofing bounded only by RLS), data-integrity (garbage values persisted), and cost/DoS (unbounded strings & id arrays).
- **Rischio futuro:** As RLS write policies are loosened or new columns are added to the insert objects, the lack of a validation chokepoint means each new field is implicitly trusted. The unused zod dep signals validation was planned and dropped.
- **Nota verificatore:** CORE THESIS CONFIRMED, but the finding contains a flat factual error and an overstated repro. Verified each cited action file: createCallAction (chiamate/actions.ts:25-30), createContactAction/updateContactAction/bulkTagContactsAction/bulkDeleteContactsAction (contatti/actions.ts:39-93), createProspectAction (percorso-prospect/actions.ts:43-66), createDocumentAction/saveVersionAction (documenti/actions.ts:42-106), saveMarketerIdentityAction (team/[id]/actions.ts:73-83 — note this one DOES have a self-edit guard), createListaContattiAction (lista-contatti/actions.ts:39-69). All are thin pass-throughs that forward input/patch/ids to the data layer with NO safeParse and NO checks. The data layer also does no validation: calls.ts:118-155 and contacts.ts:150-191 build an optimistic object and insert it; client-supplied input.marketer_id/owner_marketer_id override the derived default (calls.ts:128, contacts.ts:159).

FACTUAL ERROR IN FINDING: it claims "import .* zod / z.object / safeParse have ZERO matches in the entire web/ tree." FALSE. Grep found 8 files using zod with z.object+safeParse, e.g. web/components/calls/call-form-schema.ts:25,60; web/components/contacts/contact-form-schema.ts:24,69; web/components/lista-contatti/lista-contatti-form-schema.ts:18,50; plus 4 auth pages. zod IS used — as react-hook-form resolvers (CLIENT-side only), which IS bypassable by invoking the bound action directly. The "unused dep, validation planned and dropped" narrative is wrong; validation exists client-side but is not re-run on the server.

REPRO PARTIALLY DEFEATED by live DB constraints (pg_constraint): calls_duration_secs_check CHECK (duration_secs >= 0) — so duration_secs:-999999 is REJECTED, insert errors, action returns ok:false (the "negative duration persists" claim is false). calls_has_target CHECK requires prospect_id OR contact_id. Enum columns are USER-DEFINED (Postgres rejects bogus enum strings). prospects has expected_value>=0 and closed-consistency checks. So "garbage values persisted" is materially weakened for typed/enum/bounded columns.

ATTRIBUTION SPOOFING REAL BUT NARROWER than headline. Live RLS INSERT WITH CHECK (pg_policy): calls_insert = org_id=current_org_id() AND current_membership_active() AND (is_org_admin() OR can_see_marketer(marketer_id)); contacts_insert/prospects_insert identically on owner_marketer_id. can_see_marketer = admin OR closure ancestor=self, so a caller can only attribute to their OWN downline subtree — cross-org, upline, and sibling spoofing are blocked by RLS. Finding's "attribute records to other marketers" overstates it (though it concedes the RLS qualification).

GENUINELY UNMITIGATED (justifies keeping ALTO): (1) text columns notes/first_name/last_name/city/relationship have character_maximum_length=null and NO CHECK (verified information_schema.columns + pg_constraint) — client caps (2000/80 chars) are not enforced server-side, so a direct action call stores arbitrarily large strings → DB-bloat/cost. (2) bulkTagContacts/bulkDeleteContacts (contacts.ts:238-275) accept unbounded ids:string[] with no size cap → real cost/DoS. (3) same-subtree attribution via client-supplied marketer/owner ids has no server check, bounded only by RLS. These unbounded-input/DoS vectors are not stopped by any constraint or RLS, so ALTO stands. Verdict confirmed with the above scope/evidence corrections; it is not a cross-org or privilege bypass (RLS holds), so it should not be escalated to CRITICO.

#### 14. Stored XSS via javascript: link href in RichTextViewer (internal documents)

- **Gravità:** ALTO  ·  **Priorità:** P1  ·  **Tipo:** security  ·  **Confidence:** high  ·  **Verdetto verifica:** confirmed
- **Dimensione:** Web Pentest: XSS, CSRF, SSRF, Injection, Secrets, CORS, Upload
- **Dove:** web/components/crm/rich-text-viewer.tsx:35-43 (sink); web/app/(app)/documenti/actions.ts:42-64 / saveVersionAction+createDocumentAction (source); web/lib/data/documents.ts:124-212 (no validation)
- **Perché è un problema:** renderText() takes the link mark's attrs.href straight from stored Tiptap JSON and emits <a href={href}> with no URL-scheme allowlist. React escapes the attribute VALUE (prevents attribute breakout) but does NOT block the javascript: scheme, so href="javascript:..." produces a clickable link that executes script in the viewer's origin/session. The document body is a free-form TiptapDoc that flows from the client server action (createDocumentAction/saveVersionAction) into JSONB with zero server-side structural validation or sanitization, so an attacker fully controls the link mark's href.
- **Conseguenza reale:** A user with manage_documents permission (co-admin / team lead) creates or edits an org-wide internal document containing a link mark with href=javascript:fetch('/...'){…}. internal_documents are readable org-wide by every CRM-eligible member (migration 0011 internal_documents_select). When any viewer — including an org admin/owner — opens the doc and clicks the styled link, JS runs in their authenticated session: session/cookie theft, privileged actions via the victim's RLS context, account takeover. Stored XSS = privilege escalation from manage_documents to admin.
- **Come riprodurlo:** 1) As a manage_documents user, call saveVersionAction(docId, { body: { type:'doc', content:[{ type:'paragraph', content:[{ type:'text', text:'clicca', marks:[{ type:'link', attrs:{ href:'javascript:alert(document.cookie)' }}]}]}]}}). 2) Have an admin open /documenti, select the doc, click the 'clicca' link. 3) The javascript: URI executes.
- **Come risolverlo:** In RichTextViewer.renderText() validate the href scheme before rendering: parse and only allow http/https/mailto/tel, otherwise drop the href (render plain text or href='#'). Mirror this on the write side: validate/sanitize the TiptapDoc in the documents data layer (reject link marks with non-http(s) schemes) before insert/update. Do NOT rely on the editor (StarterKit) not emitting links — the action accepts arbitrary JSON regardless of the editor.
- **Impatto (scalabilità/sicurezza/performance):** Security: stored XSS leading to session hijack and admin account takeover within a tenant; bypasses the manage_documents/admin permission boundary.
- **Rischio futuro:** If a Tiptap Link extension or any other href-bearing mark is later added to the editor, or if other surfaces start rendering user TiptapDoc with RichTextViewer (e.g. notes), the blast radius widens. Same unsanitized pattern would propagate.
- **Nota verificatore:** Verified end-to-end; the finding is real. SINK: web/components/crm/rich-text-viewer.tsx:35-43 — case 'link' does `const href = String(mark.attrs?.href ?? '#')` then renders `<a href={href} target="_blank" rel="noopener noreferrer">`. No scheme allowlist. React is ^18.3.1 (web/package.json): it escapes the attribute VALUE but does NOT strip the javascript: scheme (only a one-time dev warning), so href="javascript:..." lands in the live DOM and executes on click. SOURCE/NO-VALIDATION: actions.ts:42-64 createDocumentAction/saveVersionAction take a free-form DocumentInput.body (TiptapDoc) and pass it unchanged to documents.ts, which does `update.body = patch.body` (line 198) and `insert({...optimistic})` (line 153) with zero structural validation. DB: migration 0011 line 101 `body jsonb NOT NULL DEFAULT '{}'` with no body CHECK; live DB (qpfnsselgwulrlmlandd) confirms body=jsonb NOT NULL and only two triggers on internal_documents (trg_internal_documents_snapshot, trg_internal_documents_updated_at) — neither sanitizes; snapshot copies body verbatim. REACHABILITY: RichTextViewer renders bodies at document-pane.tsx:223 (a 'use client' component) and version-history-sheet.tsx:210. RLS read is org-wide for CRM-eligible members (0011 internal_documents_select lines 387-393); write gated to admin OR permissions->>manage_documents (lines 397-416, current_can_manage_documents). No Content-Security-Policy exists anywhere in the repo (grep for Content-Security-Policy/script-src: no matches), so no CSP backstop. NUANCE (does not refute): the editor is bare StarterKit with NO Link extension (rich-text-editor.tsx:179), so the legitimate UI cannot create a link mark — the attacker must forge the server-action payload directly, which is trivially possible for any authenticated manage_documents user since the actions accept arbitrary JSON regardless of the editor (exactly the finding's repro/fix). Stored XSS -> session hijack / privilege escalation manage_documents->admin within a tenant. Severity ALTO is appropriate.

### MEDIO (60)

#### 15. Open redirect on login via unvalidated `redirect` query param

- **Gravità:** MEDIO  ·  **Priorità:** P1  ·  **Tipo:** security  ·  **Confidence:** high  ·  **Verdetto verifica:** confirmed
- **Dimensione:** Auth, Session, Middleware & Privilege Escalation
- **Dove:** web/app/(auth)/accedi/page.tsx:101-103
- **Perché è un problema:** After a successful signInWithPassword, the code does `const redirectTo = searchParams.get('redirect') ?? '/dashboard'; router.replace(redirectTo);` with NO check that redirectTo is an internal/relative path. Next.js router.replace() will navigate to an absolute or protocol-relative URL (e.g. https://evil.com or //evil.com). The same codebase validates this pattern elsewhere (web/app/(app)/percorso-prospect/[id]/page.tsx:49 uses `fromParam.startsWith('/')`), so the omission here is clearly a defect, not a deliberate exception.
- **Conseguenza reale:** An attacker sends a victim a link like https://app/accedi?redirect=https://evil-lookalike.com. The victim authenticates on the REAL site (so it looks legitimate), then is immediately bounced to the attacker's clone — a high-credibility phishing / credential-replay or token-harvest vector. Can also be chained to leak the freshly-issued auth state via referer to an external origin.
- **Come riprodurlo:** Visit /accedi?redirect=https://example.com (or /accedi?redirect=//example.com), log in with valid credentials, observe the browser navigates off-site to example.com instead of staying on the app.
- **Come risolverlo:** Sanitize before navigating: only honor the param when it is a same-origin path. e.g. `const raw = searchParams.get('redirect') ?? '/dashboard'; const redirectTo = raw.startsWith('/') && !raw.startsWith('//') ? raw : '/dashboard'; router.replace(redirectTo);`. Reuse the existing startsWith('/') guard pattern already present in percorso-prospect.
- **Impatto (scalabilità/sicurezza/performance):** security
- **Rischio futuro:** As more flows (invitation accept, deep links) start passing `redirect`, the unsanitized sink becomes the single funnel for every redirect-based phishing payload; trivially weaponized once the app has real users.
- **Nota verificatore:** CONFIRMED. web/app/(auth)/accedi/page.tsx:101-103 reads searchParams.get('redirect') and passes it unmodified to router.replace(): `const redirectTo = searchParams.get('redirect') ?? '/dashboard'; router.replace(redirectTo); router.refresh();`. The ?? only guards null, not malicious values. router/useRouter is imported from next/navigation (line 5), Next 14.2.35 (web/package.json:29) App Router — router.replace/push with a protocol-relative URL (//evil.com) or absolute URL (https://evil.com) navigates the browser off-origin (CWE-601 open redirect), no same-origin check exists.\n\nFunnel is ACTIVE, not hypothetical: middleware.ts:128-132 sets redirectUrl.searchParams.set('redirect', pathname) when bouncing unauthenticated users to /accedi, so the param is a first-class part of the normal auth flow and /accedi is its sole sink. Corroborating-pattern claim verified: the codebase DOES validate an analogous param elsewhere — web/app/(app)/percorso-prospect/[id]/page.tsx:49 `fromParam && fromParam.startsWith('/')` — and the login page does not reuse it. Grep for any sanitizeRedirect/safeRedirect/isInternal helper found NONE; accedi is the only unguarded redirect sink.\n\nSeverity adjusted ALTO->MEDIO: the auditor's consequence is partly overstated. Impact is bounded — it is a post-auth open redirect requiring victim interaction (click crafted link) AND a successful login; it is NOT an auth/privilege bypass and there is no direct token harvest: Supabase auth state lives in HttpOnly cookies, not the URL/fragment, so the 'leak auth state via referer' chain is weak (no token in the redirect target). Real, exploitable phishing-amplifier defect that should be fixed (the proposed `raw.startsWith('/') && !raw.startsWith('//')` guard is correct), but its bounded blast radius fits MEDIO rather than ALTO under the given rubric. DB-only finding check N/A (pure client-side code).

#### 16. revokeAccountForMarketer() uses service-role with only an org check — no caller-authority or visibility re-check

- **Gravità:** MEDIO  ·  **Priorità:** P2  ·  **Tipo:** security  ·  **Confidence:** high  ·  **Verdetto verifica:** confirmed
- **Dimensione:** Auth, Session, Middleware & Privilege Escalation
- **Dove:** web/lib/data/account.ts:28-70; called from web/app/(app)/genealogia/actions.ts:215-223 removeMarketerAction
- **Perché è un problema:** revokeAccountForMarketer() reads claims.org_id, then with the SERVICE-ROLE admin client deletes the membership row and the auth.users login for the given marketerId, filtered only by org_id+marketer_id. It performs NO can_see_marketer and NO role/rank check. Today it is only invoked AFTER removeMarketer() (whose remove_marketer RPC enforces team_leader+ and visibility), so it is safe in the current call chain — but the safety is entirely positional/by-convention, and the function is exported.
- **Conseguenza reale:** If revokeAccountForMarketer is ever called from a new path without first passing the RLS-gated removeMarketer (easy to do — it's a plain exported server-only fn), any caller with a valid org_id claim could delete the login of ANY marketer in the org (account destruction / lockout), because the service-role client bypasses RLS and the only filter is org_id.
- **Come riprodurlo:** Static: add any new caller of revokeAccountForMarketer(<any marketer in org>) without a prior authorization gate; it will deleteUser() for that marketer using service-role. Current code path is gated, so not exploitable as shipped, but the function is a loaded gun.
- **Come risolverlo:** Make the function self-authorizing: require is_org_admin OR (rank>=team_leader AND can_see_marketer(marketerId)) before any admin.* call, mirroring remove_marketer. Do not rely on the caller having pre-authorized.
- **Impatto (scalabilità/sicurezza/performance):** security
- **Rischio futuro:** A future feature (bulk cleanup, re-org tooling) is very likely to call this directly; the missing internal guard turns a convenience helper into an org-wide account-deletion primitive.
- **Nota verificatore:** not independently re-verified (MEDIO/BASSO)

#### 17. RLS policy drift between committed migrations and live DB (marketers_insert lost the status='pending' clause)

- **Gravità:** MEDIO  ·  **Priorità:** P2  ·  **Tipo:** tech_debt  ·  **Confidence:** high  ·  **Verdetto verifica:** confirmed
- **Dimensione:** Auth, Session, Middleware & Privilege Escalation
- **Dove:** supabase/migrations/0006_rls_core.sql:156-170 vs live policy (verified via pg_policy on public.marketers); origin migration supabase/migrations/0042_marketers_insert_downline_active.sql
- **Perché è un problema:** Migration 0006 defined marketers_insert for non-admins as `can_see_marketer(parent_id) AND rank='executive' AND status='pending'`. The LIVE policy (and 0042) is `can_see_marketer(parent_id) AND rank='executive'` — the `status='pending'` restriction was dropped so the tree 'add member' (status='active') would work. The dimension's source-of-truth migrations therefore do NOT match production behavior; an auditor reading 0006 would wrongly conclude member-created profiles are inert pending rows.
- **Conseguenza reale:** Non-admin members can directly INSERT ACTIVE marketer profiles into their subtree (intended for the tree flow), but the discrepancy means security reasoning based on the committed migration is wrong. Active (vs pending) member-created profiles immediately count toward team metrics and are visible/operable; combined with the ungated addMarketerAction this lets a low-privilege user inflate their active downline. Rank is still pinned to 'executive' by RLS so rank-escalation via insert is NOT possible.
- **Come riprodurlo:** Compare 0006_rls_core.sql lines 156-170 to `select pg_get_expr(polwithcheck,polrelid) from pg_policy where polrelid='public.marketers'::regclass and polname='marketers_insert'` — the live check_expr omits the status clause.
- **Come risolverlo:** Reconcile the migration history (the live state is the intended one per 0042) and add a regression test / advisor that diffs live RLS against migrations in CI, so security-relevant drift is caught. Document that member inserts are now active, not pending.
- **Impatto (scalabilità/sicurezza/performance):** security
- **Rischio futuro:** Undetected RLS drift is how an audited-secure policy silently becomes insecure. Without a drift check, the next 'quick fix' DROP POLICY/CREATE POLICY in prod can widen access with nobody noticing.
- **Nota verificatore:** not independently re-verified (MEDIO/BASSO)

#### 18. RLS-denied writes return ok:true (silent false success) for setMemberRole / updateMarketerIdentity / contact & org actions

- **Gravità:** MEDIO  ·  **Priorità:** P2  ·  **Tipo:** bug  ·  **Confidence:** high  ·  **Verdetto verifica:** confirmed
- **Dimensione:** Auth, Session, Middleware & Privilege Escalation
- **Dove:** web/lib/data/roles.ts:85-90 (setMemberRole); web/lib/data/team.ts:268-273 (updateMarketerExtra), :299-304 (updateMarketerIdentity); pattern repeated across data layer
- **Perché è un problema:** These use the RLS-bound client: `const { error } = await supabase.from(...).update(...).eq('id', id); return { ok: !error }`. PostgREST/Postgres returns NO error when an UPDATE matches zero rows because RLS filtered them out — it simply affects 0 rows. So when a non-admin calls setMemberRoleAction (gated by memberships_admin_write = is_org_admin), the write changes nothing but the function returns ok:true. The UI then shows success.
- **Conseguenza reale:** Not a privilege escalation (RLS correctly prevents the write), but it MASKS the security boundary: a user is told their unauthorized action succeeded. This erodes auditability and can hide real bugs (e.g., a genuine permission misconfiguration looks like success). It also means the UI cannot distinguish 'forbidden' from 'done', so it can't surface a correct error.
- **Come riprodurlo:** As a non-admin, invoke setMemberRoleAction(<other marketer>, 'co_admin'); RLS blocks the UPDATE (0 rows), error is null, action returns {ok:true}; UI toasts success though nothing changed.
- **Come risolverlo:** Use `.select()` on writes and assert rows were actually returned/affected (PostgREST returns the updated rows; an empty array => denied). Return ok:false (or a 'forbidden' flag) when zero rows are affected. Apply consistently across the data layer.
- **Impatto (scalabilità/sicurezza/performance):** security
- **Rischio futuro:** Silent-success writes make every future RLS regression invisible in the UI and logs — exactly the failures an audit needs to surface will be hidden.
- **Nota verificatore:** not independently re-verified (MEDIO/BASSO)

#### 19. No application-layer auth rate limiting / brute-force protection

- **Gravità:** MEDIO  ·  **Priorità:** P2  ·  **Tipo:** security  ·  **Confidence:** medium  ·  **Verdetto verifica:** confirmed
- **Dimensione:** Auth, Session, Middleware & Privilege Escalation
- **Dove:** web/app/(auth)/accedi/page.tsx:91-99 (signInWithPassword), web/app/(auth)/recupera-password/page.tsx:63-66 (resetPasswordForEmail); confirmed absent: grep for rate.?limit/throttle across web/ returns no matches
- **Perché è un problema:** Login and password-reset call Supabase Auth directly from the browser client with no app-side throttling, CAPTCHA, or lockout. There is no rate-limiting middleware anywhere in the codebase. The app fully depends on Supabase Auth's built-in (and project-config-dependent) rate limits, which are coarse (per-IP/email) and not tuned/verified here.
- **Conseguenza reale:** Credential stuffing / password brute-forcing and password-reset email bombing are throttled only by whatever Supabase defaults happen to be set on the project. No CAPTCHA is wired (the project shows no hCaptcha/Turnstile integration), so automated attacks against /accedi are feasible at Supabase's default ceilings.
- **Come riprodurlo:** Script repeated signInWithPassword calls for one email; nothing in the app slows or locks the account beyond Supabase's global limiter.
- **Come risolverlo:** Enable Supabase Auth CAPTCHA (hCaptcha/Turnstile) for password sign-in and reset, and/or front auth with an edge rate limiter (per-IP + per-email). Verify the project's Auth rate-limit settings explicitly rather than relying on defaults.
- **Impatto (scalabilità/sicurezza/performance):** security
- **Rischio futuro:** Without explicit limits, traffic growth or a leaked email list makes the login endpoint a cheap brute-force target; reset endpoint enables email-bombing of arbitrary addresses.
- **Nota verificatore:** not independently re-verified (MEDIO/BASSO)

#### 20. Dead 'Attiva accesso CRM' feature: orphaned dialog + server action + types + permission helper

- **Gravità:** MEDIO  ·  **Priorità:** P2  ·  **Tipo:** tech_debt  ·  **Confidence:** high  ·  **Verdetto verifica:** confirmed
- **Dimensione:** Codebase Health: Dead Code, Duplication, Unused Deps/Exports, Naming
- **Dove:** web/components/genealogy/activate-crm-dialog.tsx (whole file); web/app/(app)/genealogia/actions.ts:226-278 (activateCrmAccessAction, ActivateCrmInput, ActivateCrmResult, EMAIL_RE:239); web/components/genealogy/permissions.ts:51-53 (isCrmEligibleRank)
- **Perché è un problema:** activate-crm-dialog.tsx (component ActivateCrmDialog) has ZERO importers (grep for 'activate-crm-dialog' and 'ActivateCrmDialog' across web/ returns only self-references). It is the ONLY importer of activateCrmAccessAction (actions.ts:251), so that server action plus its ActivateCrmInput/ActivateCrmResult interfaces and the EMAIL_RE regex are dead transitively. isCrmEligibleRank (permissions.ts:51) is exported but has ZERO importers (grep finds only its definition; genealogy-view.tsx imports only canActivateCrm/canAddMember). The activation affordance survives only vestigially: genealogy-view.tsx:69 computes canActivate via canActivateCrm and passes it to NodeDetailPanel (genealogy-view.tsx:174), but node-detail-panel.tsx:270-272 repurposes that prop to gate a 'Remove from tree' button — the dialog itself is never rendered anywhere.
- **Conseguenza reale:** A non-trivial security-sensitive surface (it talks about service-role createUser via activateCrmAccess) is dead-but-present: future maintainers may believe activation works from the tree, may re-wire the dead dialog without re-auditing it, or may waste time keeping it in sync. The real activation flow lives in /admin/attivazioni (a different invitations path), so the duplication is also confusing.
- **Come riprodurlo:** Grep web/ for 'activate-crm-dialog', 'ActivateCrmDialog', 'activateCrmAccessAction', 'isCrmEligibleRank' — every match is either the definition or the dead dialog itself; no live caller exists.
- **Come risolverlo:** Delete activate-crm-dialog.tsx, activateCrmAccessAction + ActivateCrmInput/ActivateCrmResult + EMAIL_RE in genealogia/actions.ts, and isCrmEligibleRank. Rename the surviving NodeDetailPanel prop from canActivate to canRemove (it now gates removal, not activation) and rename/repoint canActivateCrm accordingly so the permission name matches its actual use.
- **Impatto (scalabilità/sicurezza/performance):** Reduces attack/audit surface (a dormant service-role activation path) and removes a misleading duplicate of the live /admin/attivazioni flow.
- **Rischio futuro:** High drift risk: the dead dialog references service-role user creation; if security rules change, this stale copy will be missed in audits and could be accidentally re-enabled.
- **Nota verificatore:** not independently re-verified (MEDIO/BASSO)

#### 21. Large island of unsurfaced legacy routes shipped in the build but unreachable from the live shell

- **Gravità:** MEDIO  ·  **Priorità:** P2  ·  **Tipo:** tech_debt  ·  **Confidence:** high  ·  **Verdetto verifica:** confirmed
- **Dimensione:** Codebase Health: Dead Code, Duplication, Unused Deps/Exports, Naming
- **Dove:** web/lib/nav.ts:70-83 (nav reduced to 4 items; comment admits legacy pages 'no longer surfaced'); orphaned routes: web/app/(app)/{contatti,chiamate,documenti,percorso-prospect}/; admin-island: web/app/(app)/{admin,analytics,classifiche,report}/
- **Perché è un problema:** navSections (nav.ts:73-83) surfaces only dashboard, genealogia, statistiche, presenze; footer adds informativa + impostazioni; topbar adds /notifiche and /org (managers). /admin and /analytics have NO inbound link from any surfaced surface — /admin links to /analytics, /analytics links to /classifiche and /report, so the entire admin→analytics→classifiche→report cluster is a self-referential island with no entry point from the live nav (grep shows /admin only linked from within admin/* pages; /analytics only from admin/page.tsx:82 and its own scope switcher). /contatti, /chiamate, /documenti are referenced only by their own components/actions. /percorso-prospect/page.tsx:9-11 is a pure redirect stub ('the standalone kanban no longer exists'). nav.ts:71 explicitly states these legacy pages 'still exist in the codebase but are no longer surfaced'.
- **Conseguenza reale:** Thousands of LOC (pages + actions + manager components + their slices of the data and mock layers) are compiled, type-checked, lint-gated and security-relevant yet deliver zero user value, inflating build time, bundle, and — critically — audit scope. RLS/permission regressions in these pages still matter because the routes are technically still navigable by URL (middleware.ts:27-67 still gates them), but no one is exercising them.
- **Come riprodurlo:** Read nav.ts:73-83 (4 items). Grep for inbound links: rg "'/admin'|\"/admin\"" / "/contatti" / "/analytics" in *.tsx — no link originates from a surfaced page; /admin and /analytics form a closed link graph with no surfaced entry.
- **Come risolverlo:** Decide per route: either re-surface it in nav (and re-audit) or delete the route + its components + its data/mock slices. If kept 'for later', move them out of app/(app)/ into a clearly-marked archived area or behind a feature flag so they don't ship and don't widen the security/audit surface.
- **Impatto (scalabilità/sicurezza/performance):** Roughly halves the maintenance/audit surface; cuts build and bundle; eliminates URL-reachable-but-unmaintained pages as a latent RLS/permission risk.
- **Rischio futuro:** Unmaintained-but-routable pages rot: their RLS/permission assumptions drift from the rest of the app while still being reachable by direct URL, becoming the weakest link in a future security review.
- **Nota verificatore:** not independently re-verified (MEDIO/BASSO)

#### 22. Two parallel 'contact' concepts (contacts vs lista-contatti) with fully duplicated component+schema+data stacks

- **Gravità:** MEDIO  ·  **Priorità:** P2  ·  **Tipo:** design  ·  **Confidence:** high  ·  **Verdetto verifica:** confirmed
- **Dimensione:** Codebase Health: Dead Code, Duplication, Unused Deps/Exports, Naming
- **Dove:** web/lib/data/contacts.ts + web/lib/data/lista-contatti.ts; web/components/contacts/* (contacts-manager, contact-form-sheet, contact-form-schema, contact-detail-sheet, contact-bulk-bar) vs web/components/lista-contatti/* (lista-contatti-manager, lista-contatti-form-sheet, lista-contatti-form-schema, lista-contatti-detail-sheet); routes web/app/(app)/contatti/ vs web/app/(app)/lista-contatti/
- **Perché è un problema:** The product has two distinct contact entities — 'contacts' (CRM contact manager, /contatti) and 'lista-contatti' (the 'list of 100', /lista-contatti and embedded in profiles) — each with its own data module, server actions, manager component, form sheet, zod schema, and detail sheet. They share the same domain vocabulary ('contatti') in Italian, so the naming gives no hint which is which; the only signal is the slug. /contatti is itself one of the unsurfaced legacy routes (no inbound nav link), while lista-contatti is live (embedded in /impostazioni and /team/[id]).
- **Conseguenza reale:** Maintainers must constantly disambiguate two near-identically-named contact systems; bug fixes/validation changes have to be mirrored across two schema files and two form sheets; the dead /contatti standalone gives the false impression both are first-class.
- **Come riprodurlo:** Glob web/components/{contacts,lista-contatti}/** and web/lib/data/{contacts,lista-contatti}.ts — two complete parallel stacks. nav.ts surfaces neither standalone route.
- **Come risolverlo:** If /contatti is truly retired, delete the contacts/* stack (or fold any still-needed reads like getContactById used by percorso-prospect detail into a single module) and standardize on one clearly-named contact concept. At minimum, rename so the two concepts are linguistically distinct (e.g. 'crm-contacts' vs 'list-of-100').
- **Impatto (scalabilità/sicurezza/performance):** Removes a whole duplicated CRUD stack and the cognitive tax of two same-named contact systems.
- **Rischio futuro:** Drift: validation/business rules diverge silently between the two contact stacks; new devs wire to the wrong one.
- **Nota verificatore:** not independently re-verified (MEDIO/BASSO)

#### 23. Massive mock data layer (2130 LOC) mirrors the real data layer (5287 LOC) with no shared shape enforcement → drift risk

- **Gravità:** MEDIO  ·  **Priorità:** P2  ·  **Tipo:** tech_debt  ·  **Confidence:** high  ·  **Verdetto verifica:** confirmed
- **Dimensione:** Codebase Health: Dead Code, Duplication, Unused Deps/Exports, Naming
- **Dove:** web/lib/data/mock/* (16 files, 2130 LOC total) mirroring web/lib/data/*.ts (5287 LOC); plus per-fn filterMock helpers e.g. web/lib/data/contacts.ts:50-114 ('mirrors the Supabase query semantics')
- **Perché è un problema:** Every real data fn has a hand-written mock counterpart that must replicate filtering/sorting/scoping semantics in TypeScript (contacts.ts:50 filterMock comment: 'mirrors the Supabase query semantics'). The mock layer is ~40% the size of the real one. There is no test or type mechanism guaranteeing the mock semantics stay in sync with the SQL; the only coupling is convention. The notifications case already shows what happens when they diverge (real layer rewritten, mock left orphaned).
- **Conseguenza reale:** Demo mode can silently diverge from real behavior (different filtering/sorting/scoping), so 'modalità demo' can pass while real RLS-scoped queries behave differently — masking bugs in review/demo. Every data-layer change is doubled work.
- **Come riprodurlo:** wc -l on lib/data/mock/*.ts (2130) vs lib/data/*.ts top-level (5287); read contacts.ts:50-114 filterMock re-implementing query semantics by hand.
- **Come risolverlo:** Acknowledge this as deliberate resilience tooling but bound it: (a) add a thin contract/test that runs the same filter assertions against mock and a SQLite/PG fixture, or (b) generate mock filtering from a single shared predicate spec, or (c) prune mocks for unsurfaced/legacy routes when those routes are removed.
- **Impatto (scalabilità/sicurezza/performance):** Cuts maintenance in half for the data layer and closes the demo-vs-real semantic-drift gap.
- **Rischio futuro:** Guaranteed drift over time; demo passes while prod misbehaves (already happened with notifications).
- **Nota verificatore:** not independently re-verified (MEDIO/BASSO)

#### 24. Inconsistent AND logging-free error handling across the data layer (95 catch blocks, 27 files)

- **Gravità:** MEDIO  ·  **Priorità:** P1  ·  **Tipo:** design  ·  **Confidence:** high  ·  **Verdetto verifica:** confirmed
- **Dimensione:** Codebase Health: Dead Code, Duplication, Unused Deps/Exports, Naming
- **Dove:** web/lib/data/*.ts (95 catch blocks across 27 files). Examples: contacts.ts:111-113 (return mock demo:true), contacts.ts:188-190 (return optimistic demo:false ok:false), team.ts:84-86 (/* leave map empty */ silent), team.ts:170-172 (/* keep EMPTY_EXTRA */), team.ts:271-273 ({ok:false,demo:false}), seven-whys.ts:71-74 (records=MOCK + demo=true), notifications.ts:58-60 (/* best-effort */ empty)
- **Perché è un problema:** The demo-fallback contract is implemented ad hoc: on a thrown query, different fns do materially different things — fall back to mock with demo:true (reads), return optimistic data with demo:false/ok:false (mutations), or silently swallow into an empty value with no flag at all (team.ts:84,170; notifications.ts:58). Critically, NONE of the 95 catch blocks log the error (no console.error/warn anywhere in lib/data/*.ts). A real Supabase failure in production is therefore indistinguishable from 'no env / demo' and is completely invisible.
- **Conseguenza reale:** Production data-access failures degrade silently to mock or empty results with no telemetry — users see demo/empty data, operators get no signal, and root-causing an outage is near-impossible. The 'silent swallow with no demo flag' variants (team.ts, notifications.ts) are the worst: even the UI's config-notice can't fire because there's no demo:true to surface.
- **Come riprodurlo:** rg '} catch' lib/data → 95 across 27 files; rg 'console\.(error|warn|log)' lib/data → none. Compare contacts.ts:111 vs team.ts:84 vs contacts.ts:188 for three different catch outcomes.
- **Come risolverlo:** Centralize the fallback in crm-shared.ts (a withFallback(fn, mockFn) helper) so every read uses one path; make mutations a single helper too. Inside the helper, distinguish 'no env' (expected demo) from 'query threw' (real failure) and log/report the latter (console.error at minimum, ideally to an error sink) before falling back. Eliminate the silent-empty variants that don't set demo:true.
- **Impatto (scalabilità/sicurezza/performance):** Restores observability of production query failures (currently zero) and makes the demo-fallback behavior uniform and testable.
- **Rischio futuro:** As traffic grows, transient DB/RLS errors will manifest as 'mysterious empty/demo data' tickets with no logs to diagnose; the inconsistency also guarantees new data fns copy whichever neighbor they happened to look at.
- **Nota verificatore:** not independently re-verified (MEDIO/BASSO)

#### 25. Limited-view gatekeepers disagree: session.asRank() drops 4 real ranks → nav hides full menu while middleware serves all pages

- **Gravità:** MEDIO  ·  **Priorità:** P1  ·  **Tipo:** bug  ·  **Confidence:** high  ·  **Verdetto verifica:** confirmed
- **Dimensione:** Cross-cutting Data-flow & Frontend-Backend-DB Integration
- **Dove:** web/lib/data/session.ts:47-61 (asRank allow-list) feeding web/lib/nav.ts:143-147 (isLimitedViewer) vs web/middleware.ts:84-94 (isLimited reads raw JWT rank); RANK_ORDER in web/lib/types/db.ts:33-46
- **Perché è un problema:** asRank()'s allow-list is ['cliente','no_rank','executive','consultant','team_leader','senior_team_leader','executive_team_leader','vice_president'] and maps anything else to 'executive'. It OMITS advanced_team_leader, senior_vice_president, executive_vice_president, global_director — all real enum values (verified live) present in RANK_ORDER. The (app)/layout.tsx builds NavViewer.rank from claims.rank (i.e. asRank output), so a member with rank='advanced_team_leader' becomes 'executive' → isLimitedViewer({role:'member',rank:'executive'}) = true → sidebar renders only Profilo+Informativa (nav.ts:161-163). The middleware's isLimited() decodes the RAW JWT (decodeJwtClaims) and does RANK_ORDER.indexOf('advanced_team_leader')=5 ≥ indexOf('consultant')=3 → NOT limited → it does NOT redirect, so every /dashboard, /genealogia, /statistiche page is fully reachable by direct URL. The two layers contradict on the exact same user.
- **Conseguenza reale:** A high-rank 'member' (advanced_team_leader / any of the 3 top exec ranks) gets a crippled sidebar (looks demoted to a client) yet the pages are all reachable by typing the URL — inconsistent, confusing, and a gating logic that nobody can reason about. Conversely the mismatch could in other rank/role combos hide a legit menu the backend allows.
- **Come riprodurlo:** Set a membership role='member' on a marketer with rank='advanced_team_leader' (or senior_vice_president). Log in: sidebar shows only Profilo+Informativa, but manually visiting /dashboard renders the full dashboard (no redirect).
- **Come risolverlo:** Make asRank() validate against the canonical RANK_ORDER (or import and use it) instead of a hand-maintained subset, and default unknown to the lowest safe value consistently with the middleware's fail-open. Better: share ONE isLimited predicate between nav.ts and middleware.ts so they cannot drift.
- **Impatto (scalabilità/sicurezza/performance):** Authorization/visibility inconsistency across the two enforcement points; UX correctness and trust in the gating model.
- **Rischio futuro:** Every new rank added to the enum (the team already added 6 since 0002) must be remembered in this hidden allow-list or it silently collapses to 'executive' and demotes the user; guaranteed to rot.
- **Nota verificatore:** The mechanism is real and verified end-to-end. (1) asRank() (web/lib/data/session.ts:47-61) hard-codes an 8-element allow-list omitting advanced_team_leader, senior_team_leader is PRESENT but advanced_team_leader/senior_vice_president/executive_vice_president/global_director are absent; anything else maps to 'executive'. Live enum confirms all 12 ranks exist incl. those 4 (pg_enum: advanced_team_leader sort 3.5, senior_vice_president 7, executive_vice_president 8, global_director 9). (2) custom_access_token_hook (pg_get_functiondef) stamps the RAW marketers.rank into the JWT ('rank', v_membership.rank) with no projection, so middleware.ts:91 decodeJwtClaims sees the true rank. (3) layout.tsx:39-43 builds NavViewer.rank = claims.rank = asRank output. For role='member', rank='advanced_team_leader': asRank→'executive'; nav.ts:143-147 isLimitedViewer = !(roleAtLeast('member','co_admin')[false] || rankAtLeast('executive','consultant')[indexOf 2>=3 false]) = TRUE → sidebar = Profilo+Informativa only (nav.ts:161-163). Middleware isLimited (middleware.ts:84-94): role member, idx=RANK_ORDER.indexOf('advanced_team_leader')=5, 5<indexOf('consultant')=3 = FALSE → no redirect → /dashboard,/genealogia,/statistiche fully reachable. The two layers genuinely contradict on the same user. Bonus: same asRank collapse also wrongly suppresses canActivateCrm (web/components/genealogy/permissions.ts:28-33) for these ranks (executive<team_leader). Corrections to the finding that lower severity from ALTO to MEDIO: (a) This is NOT an auth/privilege bypass — the divergence is fail-CLOSED in the UI (nav over-restricts; middleware correctly does not block a legit high-rank user). RLS is the real boundary (per all doc comments). No data loss, no escalation. (b) Live data has ZERO members with any of the 4 dropped ranks: SELECT over memberships+marketers shows only executive/team_leader/executive_team_leader in use, all of which ARE in the allow-list, so the bug is currently LATENT, not actively harming any user. (c) The 'conversely could hide a legit menu' reverse case via asRank cannot produce nav-shows-but-backend-blocks — asRank only ever maps down to 'executive', so it can only over-restrict, never under-restrict. Real correctness bug + guaranteed-to-rot design (hand-maintained subset duplicating RANK_ORDER), but impact is UX/visibility inconsistency on an unused-today rank set, not a security hole or outage → MEDIO, not ALTO. Fix is sound: validate asRank against RANK_ORDER and share one isLimited predicate.

#### 26. Optimistic add-member node drifts from canonical row: crm_access undefined despite account created

- **Gravità:** MEDIO  ·  **Priorità:** P2  ·  **Tipo:** bug  ·  **Confidence:** high  ·  **Verdetto verifica:** confirmed
- **Dimensione:** Cross-cutting Data-flow & Frontend-Backend-DB Integration
- **Dove:** web/app/(app)/genealogia/actions.ts:154-173 (node built without crm_access) vs web/lib/data/genealogy.ts:73-76 (get_subtree returns crm_access:true); merged at web/components/genealogy/use-genealogy-tree.ts:238-264 (addChild) via genealogy-view.tsx:94-103
- **Perché è un problema:** addMarketerAction creates the marketer, sets extras, and calls activateCrmAccess() which creates an auth user + active membership (crm_access:true). But the TreeNode it returns omits crm_access entirely (it is never set in the object literal at actions.ts:154-172). TreeNode.crm_access is optional and 'undefined ⇒ treated as no CRM' (db.ts:304-306). So the freshly added node renders as having NO CRM access. On the next reload, get_subtree (genealogy.ts:73, via migration 0034) returns crm_access:true because the active membership exists — the canonical state flips.
- **Conseguenza reale:** Immediately after adding a member with an account, the tree shows them as not-having-CRM-access (e.g. a missing badge / wrong affordance), contradicting what was just created; it self-heals only on reload.
- **Come riprodurlo:** Add a member from the tree with email+password. Inspect the new node's CRM-access indicator immediately vs after a page reload — it changes.
- **Come risolverlo:** Set crm_access:true on the returned node in addMarketerAction (the account was just created), matching what get_subtree will report.
- **Impatto (scalabilità/sicurezza/performance):** Optimistic UI vs canonical row divergence on a security-relevant flag; cosmetic but misleading.
- **Rischio futuro:** If any client logic ever keys an action off node.crm_access (e.g. hide 'Attiva accesso'), the stale undefined will offer to re-activate an account that already exists.
- **Nota verificatore:** not independently re-verified (MEDIO/BASSO)

#### 27. Optimistic add-member updates only the direct parent's counts, not the ancestor chain (team_size drift)

- **Gravità:** MEDIO  ·  **Priorità:** P2  ·  **Tipo:** bug  ·  **Confidence:** high  ·  **Verdetto verifica:** confirmed
- **Dimensione:** Cross-cutting Data-flow & Frontend-Backend-DB Integration
- **Dove:** web/components/genealogy/use-genealogy-tree.ts:238-264 (addChild bumps only next.get(parentId)) vs supabase/migrations/0004_marketers_tree.sql closure (AFTER INSERT adds a closure row for EVERY ancestor) reflected by genealogy.ts:100-120 fetchTeamCounts
- **Perché è un problema:** addChild increments has_left/right_child, left/right_count and team_size on the IMMEDIATE parent only. In a closure-table genealogy, inserting a descendant adds depth>=1 rows for every ancestor up to the root, so each ancestor's team_size (and the relevant branch count) should increase by 1. The optimistic cache leaves all grandparents+ stale until a server reload re-fetches counts.
- **Conseguenza reale:** After adding a member, any already-loaded ancestor node above the direct parent shows a team_size/branch count that is too low by 1 (and compounds across multiple adds in a session) until the page is reloaded.
- **Come riprodurlo:** Expand root → child → grandchild, then add a member under the grandchild. The grandchild (direct parent) count updates; the child and root team_size do not, despite the new descendant being in their subtree.
- **Come risolverlo:** Walk parent_id up the cache in addChild and increment team_size (and left/right_count keyed on the top-level branch leg) for every ancestor present in the cache, or trigger a counts refresh for the visible ancestors.
- **Impatto (scalabilità/sicurezza/performance):** Optimistic counts diverge from the closure-derived canonical aggregates; misleading team-size figures mid-session.
- **Rischio futuro:** As the binary tree grows and users add several members per session without reloading, the drift accumulates and erodes trust in the headline team-size numbers.
- **Nota verificatore:** not independently re-verified (MEDIO/BASSO)

#### 28. Board 'total' and openOnly filter count iscrizione-stage prospects that should have left the funnel

- **Gravità:** MEDIO  ·  **Priorità:** P2  ·  **Tipo:** bug  ·  **Confidence:** medium  ·  **Verdetto verifica:** confirmed
- **Dimensione:** Cross-cutting Data-flow & Frontend-Backend-DB Integration
- **Dove:** web/lib/data/prospects.ts:74-113 (groupByStage / listProspectBoard total) and :88-101 openOnly filter (.eq('outcome','open')) vs web/components/prospects/prospect-board.tsx:70 BOARD_STAGES excludes iscrizione
- **Perché è un problema:** Because change_prospect_stage leaves outcome='open' for iscrizione-stage prospects (finding #1), listProspectBoard with openOnly:true (.eq('outcome','open')) still returns them, and total = rows.length counts them. groupByStage builds a column for all 6 STAGE_ORDER stages including iscrizione, but the client BOARD_STAGES filters iscrizione out of the rendered columns — so the row is fetched and counted at the data layer but invisible in the UI. The data-layer total and the client-recomputed total (prospect-board.tsx:353-356, sums BOARD_STAGES only) disagree.
- **Conseguenza reale:** Funnel total / KPI counts from listProspectBoard (and computeProspectKpis, which flatMaps all columns including iscrizione) include enrolled-but-not-closed prospects that the board hides, so the headline 'prospect nel funnel' number and personal KPIs are inconsistent between server-computed and client-rendered views.
- **Come riprodurlo:** Enroll a prospect (it stays outcome='open', stage='iscrizione'). Call listProspectBoard({openOnly:true}) → total includes it; the board UI (BOARD_STAGES) does not show it → numbers differ.
- **Come risolverlo:** Fix finding #1 (set outcome='enrolled' so openOnly excludes it) — that also makes the board total consistent. Independently, groupByStage/total should exclude iscrizione or align with BOARD_STAGES.
- **Impatto (scalabilità/sicurezza/performance):** Inconsistent funnel counts across server data layer vs client board; depends on and compounds finding #1.
- **Rischio futuro:** Any consumer of listProspectBoard.total / computeProspectKpis inherits the inflated count; resolving #1 is the clean fix.
- **Nota verificatore:** not independently re-verified (MEDIO/BASSO)

#### 29. Every read RLS policy calls can_see_marketer() per row (un-wrapped EXISTS over closure + 3 JWT helpers)

- **Gravità:** MEDIO  ·  **Priorità:** P1  ·  **Tipo:** perf  ·  **Confidence:** high  ·  **Verdetto verifica:** confirmed
- **Dimensione:** Database Schema, Indexing, N+1 & Query Cost (live + code)
- **Dove:** Policies marketers_select, prospects_select, wishlist_items_select, closure_select, plus all *_subtree/branch_metrics RPCs; public.can_see_marketer(uuid) = is_org_admin() OR EXISTS(SELECT 1 FROM marketer_tree_closure ...)
- **Perché è un problema:** can_see_marketer() is invoked once per candidate row in each SELECT policy and is NOT wrapped in a scalar subquery, so Postgres re-evaluates it (and the nested current_org_id()/current_marketer_id() JWT parses + is_org_admin()) for every row scanned. For non-admins each evaluation is an EXISTS probe into marketer_tree_closure. The Supabase performance advisor already flags the analogous pattern (auth_rls_initplan) on memberships_select for calling auth.uid() per row.
- **Conseguenza reale:** A non-admin listing prospects/marketers/wishlist over a large visible subtree pays one closure-EXISTS per row examined; combined with the closure-scan RPCs above, large-subtree reads degrade from index lookups to per-row function calls. Admins short-circuit via is_org_admin() but still re-parse the JWT per row.
- **Come riprodurlo:** EXPLAIN ANALYZE a select on marketers as a non-admin member with a large downline; the plan shows can_see_marketer / closure SubPlan executed once per row rather than once per query.
- **Come risolverlo:** Make the helpers cheap and cached: in policies reference (SELECT can_see_marketer(id)) or restructure can_see_marketer to be an inlinable SQL function, and ensure current_org_id()/current_marketer_id() results are hoisted (wrap as (select current_org_id())). Per Supabase RLS guidance, wrapping auth/STABLE calls in a subquery lets the planner evaluate them once (InitPlan) instead of per row.
- **Impatto (scalabilità/sicurezza/performance):** performance
- **Rischio futuro:** Scales with row count of every core table; the cost is invisible at 14 rows and unavoidable at scale.
- **Nota verificatore:** MECHANISM CONFIRMED, but severity inflated and the headline fix is WRONG.

VERIFIED via live DB (project qpfnsselgwulrlmlandd):
- pg_get_functiondef: public.can_see_marketer(uuid) is `LANGUAGE sql STABLE SECURITY DEFINER` = `SELECT is_org_admin() OR EXISTS(SELECT 1 FROM marketer_tree_closure c WHERE c.org_id=current_org_id() AND c.ancestor_id=current_marketer_id() AND c.descendant_id=target)`. SECURITY DEFINER disables SQL inlining, so it stays a function call.
- Policies (pg_policy): marketers_select USING (org_id=current_org_id() AND can_see_marketer(id)); prospects_select / wishlist_items_select on can_see_marketer(owner_marketer_id); closure_select on can_see_marketer(descendant_id). All un-wrapped, as described.
- EXPLAIN (ANALYZE,VERBOSE) `SELECT id FROM marketers WHERE org_id=current_org_id() AND can_see_marketer(id)` => `Index Cond: (org_id = NULLIF(current_setting('request.jwt...')...))` and `Filter: can_see_marketer(marketers.id)`. So current_org_id() IS inlined+hoisted into the Index Cond (evaluated once, NOT per row — contradicts the finding's claim that the JWT parse in the top-level clause re-runs per row), while can_see_marketer stays a per-row Filter. Forced seq scan shows `Filter: (org_id=... AND can_see_marketer(...))`, `Rows Removed by Filter: 14` => confirms per-row evaluation. Inside can_see_marketer, is_org_admin()->is_platform_admin() does EXISTS(platform_admins WHERE user_id=auth.uid()) plus a marketer_tree_closure EXISTS per call for non-admins = real per-row work.

WHY DOWNGRADED TO MEDIO / fix is wrong:
1. The finding's primary remediation `(SELECT can_see_marketer(id))` DOES NOT WORK. EXPLAIN of the wrapped form yields `Filter: (SubPlan 1) ... Output: can_see_marketer(marketers.id)` = a correlated per-row SubPlan, NOT an InitPlan. The Supabase `(select auth.uid())` trick only hoists row-INDEPENDENT calls; can_see_marketer takes a row-varying column argument so it can never fold to InitPlan. The recommended fix is technically incorrect.
2. Supabase performance advisor (get_advisors type=performance): auth_rls_initplan fires on EXACTLY ONE policy = memberships_select (literal auth.uid()). It does NOT flag any can_see_marketer policy. So the finding's "advisor already flags the analogous pattern" is true only for memberships; the advisor does not corroborate the can_see_marketer cost.
3. Candidate rows are pre-bounded by the org_id Index Cond before can_see_marketer runs, and closure is well-indexed (PK (ancestor_id,descendant_id), closure_ancestor_depth, closure_descendant_idx) so each EXISTS is an index probe, not a scan. Data layer commonly pre-filters (web/lib/data/prospects.ts:98-99 `.eq('owner_marketer_id', ...)`). Current scale: 14 marketers / 9 prospects / 28 closure rows.

Net: a genuine, verifiable per-row STABLE-function inefficiency that grows linearly with per-org row count, but it is two index probes per surviving row (microseconds), pre-bounded by org, and not the "index-lookups -> per-row function calls" cliff implied. Real tech debt with moderate impact = MEDIO, not ALTO. A correct fix would be to push the closure check into a join/EXISTS at the policy level or make can_see_marketer SECURITY INVOKER + inlinable, not the proposed (SELECT ...) wrap.

#### 30. Notifications + team extras build unbounded .in() lists from the full descendant set every request

- **Gravità:** MEDIO  ·  **Priorità:** P1  ·  **Tipo:** perf  ·  **Confidence:** high  ·  **Verdetto verifica:** uncertain
- **Dimensione:** Database Schema, Indexing, N+1 & Query Cost (live + code)
- **Dove:** web/lib/data/notifications.ts:43-62 descendantIds() + :101-107 marketers.in(Array.from(team)); web/lib/data/team.ts:75-88 fetchExtras .in(ids) called from listTeamMembers and listUpcomingBirthdays:215
- **Perché è un problema:** descendantIds() returns the caller's ENTIRE strict downline (closure depth>=1, no cap) into a JS Set, which is then passed verbatim as a PostgREST .in(...) filter. listUpcomingBirthdays/fetchExtras likewise selects extras for EVERY marketer returned by listMarketers (capped at 500, but still a 500-id .in()). For a top upline the descendant set can be the whole org, producing a multi-thousand-element IN list on every notifications poll and every team-roster render.
- **Conseguenza reale:** Per request: a huge URL/array IN clause (PostgREST encodes it in the query string -> risk of request-size limits and slow planning), plus the closure read that produced it. The notifications endpoint is polled frequently, multiplying the cost.
- **Come riprodurlo:** As an upline with thousands of descendants, load the notifications inbox; inspect the outgoing PostgREST request -> in.(id1,id2,...,idN) with N = whole downline.
- **Come risolverlo:** Push the filtering into SQL: replace the descendantIds()+.in() round-trip with a single join/RPC (new_member and birthday detection both belong server-side as one closure-joined query bounded by the time window and a LIMIT). For fetchExtras, select extras in the same query that lists the team rather than a second .in() pass.
- **Impatto (scalabilità/sicurezza/performance):** scalability
- **Rischio futuro:** IN-list size grows with downline; eventually trips PostgREST/HTTP limits and planner cost.
- **Nota verificatore:** Code claims are ACCURATE but severity is inflated; current impact is nil. VERIFIED CODE: descendantIds() (web/lib/data/notifications.ts:43-62) reads the strict downline via .eq('ancestor_id',marketerId).gte('depth',1) into an uncapped JS Set; newMemberNotifications passes it verbatim as .in('id', Array.from(team)) (notifications.ts:101-107). fetchExtras (web/lib/data/team.ts:75-88) does .in('id', ids), called from listTeamMembers (team.ts:104) and listUpcomingBirthdays (team.ts:215), both sourced from listMarketers — which is HARD-CAPPED at .limit(500) (web/lib/data/admin.ts:108-109). So the fetchExtras IN-list is bounded <=500 (the finding admits this); only the notifications descendant IN-list is truly uncapped. LIVE DB (qpfnsselgwulrlmlandd) REFUTES the impact: total_marketers=14, active=8, closure_rows=28, orgs=1; largest strict downline (depth>=1) = 7. The 'multi-thousand IN list / whole org' scenario does not exist — it's a single 14-person tree. INDEX SUPPORT: pg_indexes shows closure_ancestor_depth=(ancestor_id,depth) so descendantIds() is index-backed; marketer_tree_closure_pkey=(ancestor_id,descendant_id) and marketers_pkey on id back the .in() lookups — these are not unindexed scans, and a 500-id IN against a PK is trivial in Postgres. FREQUENCY CLAIM FALSE: grep found NO client polling (no setInterval/refreshInterval); listNotifications() runs server-side once per app-page render (web/app/(app)/layout.tsx:61 badge, notifiche/page.tsx:24 inbox) — a per-navigation RSC call, not a frequent poll. CONCLUSION: real but purely latent scalability debt — only the notifications descendant IN-list is uncapped, it is index-backed, and the org would need thousands of members under one upline (PostgREST URL limit ~tens of KB = thousands of UUIDs) before it bites. No current or near-term impact; ALTO ('cliff likely under real load') is unsupported — downgrade to MEDIO tech-debt. Marked uncertain because the underlying unbounded pattern is genuinely present but I cannot confirm it has or will have the described impact at any realistic scale of this app.

#### 31. Dashboard + rank-distribution pull whole result sets and aggregate in Node instead of in SQL

- **Gravità:** MEDIO  ·  **Priorità:** P2  ·  **Tipo:** perf  ·  **Confidence:** high  ·  **Verdetto verifica:** confirmed
- **Dimensione:** Database Schema, Indexing, N+1 & Query Cost (live + code)
- **Dove:** web/lib/data/dashboard.ts:49-73 fetchPresentRows (all present zoom rows for the month), :110-136 fetchMonthProspects (all month prospects), grouped in JS; web/lib/data/admin.ts:227-238 getRankDistribution counts in JS over listMarketers(limit 500)
- **Perché è un problema:** fetchPresentRows selects every present zoom_attendance row for the subtree this month with an embedded marketers join, then counts per marketer in JS; fetchMonthProspects selects every prospect entered this month and classifies in JS; getRankDistribution fetches up to 500 marketer rows just to count per rank. These are textbook GROUP BY/count workloads done client-side, transferring all rows over the wire.
- **Conseguenza reale:** Bandwidth and memory grow linearly with the subtree's monthly activity; the dashboard (a landing page) and admin rank chart get slower as data accumulates, with no LIMIT protecting the zoom/prospect pulls.
- **Come riprodurlo:** Seed a month of zoom/prospect activity for a large subtree; observe the dashboard query returning every row and the Node process aggregating them.
- **Come risolverlo:** Replace with aggregated SQL/RPCs: SELECT marketer_id, count(*), sum(cam::int) ... GROUP BY marketer_id ORDER BY count DESC LIMIT n for zoom; a grouped prospect query for percorsi/conversion; SELECT rank, count(*) GROUP BY rank for the distribution.
- **Impatto (scalabilità/sicurezza/performance):** performance
- **Rischio futuro:** Degrades steadily with activity volume; the zoom/prospect selects have no LIMIT so worst case is unbounded.
- **Nota verificatore:** not independently re-verified (MEDIO/BASSO)

#### 32. marketer_tree_closure has no covering index for the per-call subtree size query (ancestor_id + branch_leg + depth>=1)

- **Gravità:** MEDIO  ·  **Priorità:** P2  ·  **Tipo:** perf  ·  **Confidence:** medium  ·  **Verdetto verifica:** confirmed
- **Dimensione:** Database Schema, Indexing, N+1 & Query Cost (live + code)
- **Dove:** Index closure_ancestor_depth(ancestor_id,depth) and closure_branch_idx(ancestor_id,branch_leg); query web/lib/data/genealogy.ts:108-112 fetchTeamCounts (.in('ancestor_id',ids).gte('depth',1) selecting branch_leg) called for the root, every node, and every children list
- **Perché è un problema:** fetchTeamCounts runs once for the root node, once per getNode, and once per getChildren result set, filtering ancestor_id IN (...) AND depth>=1 and reading branch_leg. closure_ancestor_depth covers ancestor_id+depth but must heap-fetch branch_leg; closure_branch_idx covers ancestor_id+branch_leg but not the depth>=1 predicate. Neither is a single index satisfying the exact (ancestor_id, depth, branch_leg) read, so Postgres heap-fetches per matching row.
- **Conseguenza reale:** Each genealogy interaction (expand a node, refresh a card) fires an extra closure round-trip that, for an ancestor with a large subtree, returns one row per descendant and re-counts in JS (withCounts). Duplicative with get_subtree which already returns counts.
- **Come riprodurlo:** EXPLAIN ANALYZE select ancestor_id, branch_leg from marketer_tree_closure where ancestor_id = any(...) and depth >= 1 for a large-subtree ancestor; observe index scan + heap fetch and large row count returned to the app.
- **Come risolverlo:** Add a covering index closure_ancestor_depth_leg ON marketer_tree_closure(ancestor_id, depth) INCLUDE (branch_leg, descendant_id), and/or eliminate fetchTeamCounts entirely by reusing the counts get_subtree/get_node already compute server-side instead of a second per-call query.
- **Impatto (scalabilità/sicurezza/performance):** performance
- **Rischio futuro:** Cost is per-ancestor-subtree-size and runs on every tree click; grows with org size.
- **Nota verificatore:** not independently re-verified (MEDIO/BASSO)

#### 33. 36 unindexed foreign keys flagged by the performance advisor (incl. marketers.parent_id and marketers.sponsor_id leading-column gaps)

- **Gravità:** MEDIO  ·  **Priorità:** P2  ·  **Tipo:** perf  ·  **Confidence:** high  ·  **Verdetto verifica:** confirmed
- **Dimensione:** Database Schema, Indexing, N+1 & Query Cost (live + code)
- **Dove:** Supabase performance advisor unindexed_foreign_keys (36 entries): marketers_parent_id_fkey, marketers_sponsor_id_fkey, prospects_owner_marketer_id_fkey, contacts_owner_marketer_id_fkey, notifications_recipient_marketer_id_fkey, wishlist_items_owner_marketer_id_fkey, zoom_attendance_marketer_id_fkey, *_created_by/updated_by, etc.
- **Perché è un problema:** Many FK columns have only composite indexes led by org_id (e.g. marketers_parent_idx is (org_id,parent_id), marketers_sponsor_idx is (org_id,sponsor_id), prospects_owner_stage_idx leads with org_id), so the bare FK column is not a usable left-prefix. The owner_marketer_id FKs are ON DELETE RESTRICT and the parent_id FK is ON DELETE RESTRICT: every delete/soft-delete of a marketer must verify no child/owner row references it, which without a leading index on the referencing column forces a scan. The created_by/updated_by/actor_marketer_id audit FKs have no index at all.
- **Conseguenza reale:** Marketer deletion/removal (remove_marketer RPC) and any cascade pay sequential scans on referencing tables as data grows; the org_id-led composites do not help the FK reference check which keys on the bare column.
- **Come riprodurlo:** Run get_advisors(performance) -> 36 unindexed_foreign_keys; or delete a marketer with many prospects/contacts and EXPLAIN the FK trigger query.
- **Come risolverlo:** Add single-column (or referencing-column-leading) indexes for the FKs actually exercised by deletes/joins: marketers(parent_id), marketers(sponsor_id), prospects(owner_marketer_id), contacts(owner_marketer_id), wishlist_items(owner_marketer_id), notifications(recipient_marketer_id), zoom_attendance(marketer_id). The pure audit-trail FKs (created_by/updated_by) are low priority. Cross-check against the 51 unused_index advisor entries before adding more.
- **Impatto (scalabilità/sicurezza/performance):** performance
- **Rischio futuro:** Reference-check scans grow with referencing-table size; matters once deletes happen on populated tables.
- **Nota verificatore:** not independently re-verified (MEDIO/BASSO)

#### 34. lista_contatti_entries createListaContatti derives next position via max() then inserts under a partial unique index (race + scan)

- **Gravità:** MEDIO  ·  **Priorità:** P2  ·  **Tipo:** bug  ·  **Confidence:** high  ·  **Verdetto verifica:** confirmed
- **Dimensione:** Database Schema, Indexing, N+1 & Query Cost (live + code)
- **Dove:** web/lib/data/lista-contatti.ts:117-137 (SELECT position ORDER BY desc LIMIT 1, then insert position=max+1) vs unique index lista_contatti_owner_position_uq (org_id,owner_marketer_id,position) WHERE deleted_at IS NULL
- **Perché è un problema:** Reading max(position) and then inserting max+1 in a separate statement is a classic read-then-write race: two concurrent adds for the same owner both read the same max and both insert the same position, the second failing the partial unique index (the comment even documents the prior duplicate-key bug). It is also a non-atomic two-round-trip pattern.
- **Conseguenza reale:** Concurrent adds (double-click, two tabs, retries) produce a 23505 unique violation that surfaces as a failed insert; the app returns ok:false with no retry.
- **Come riprodurlo:** Fire two createListaContatti calls for the same owner concurrently; one fails on lista_contatti_owner_position_uq.
- **Come risolverlo:** Compute the position inside the INSERT atomically (INSERT ... SELECT COALESCE(max(position),0)+1 ... in a single statement / RPC), or make position a per-owner sequence, or catch 23505 and retry. Same pattern should be audited in any reorder path.
- **Impatto (scalabilità/sicurezza/performance):** data integrity
- **Rischio futuro:** Low-frequency now; any UI that allows rapid adds or retries will trip it.
- **Nota verificatore:** not independently re-verified (MEDIO/BASSO)

#### 35. lista_contatti_entries carries duplicate/legacy columns (relationship vs rapporto, rating vs stato/percorso) — schema drift

- **Gravità:** MEDIO  ·  **Priorità:** P3  ·  **Tipo:** tech_debt  ·  **Confidence:** high  ·  **Verdetto verifica:** confirmed
- **Dimensione:** Database Schema, Indexing, N+1 & Query Cost (live + code)
- **Dove:** information_schema.columns for lista_contatti_entries: relationship(text,null) AND rapporto(text,null); rating(smallint,null) alongside stato(text NOT NULL default 'non_invitato') and percorso(smallint NOT NULL default 0); SELECT in web/lib/data/lista-contatti.ts:20-21 reads both relationship and rapporto
- **Perché è un problema:** The table has both an old relationship column and a newer rapporto column, plus rating coexisting with the newer stato/percorso modeling. The data layer SELECTs both relationship and rapporto and updateListaContatti spreads arbitrary patch keys, so the two can diverge. stato is typed as free text with a string default instead of an enum (contact_status/prospect_stage are enums elsewhere), losing type safety. The PK index is even named centos_list_entries_pkey, evidence of a rename that left columns behind.
- **Conseguenza reale:** Two sources of truth for relationship/status; writers can update one and readers the other, producing inconsistent UI. stato as text allows invalid values silently.
- **Come riprodurlo:** Inspect the column list; update relationship without rapporto (or vice versa) and observe divergence.
- **Come risolverlo:** Decide the canonical columns, backfill, and drop the legacy ones in a migration; convert stato to an enum with a CHECK or USER-DEFINED type matching the app's ListaContattiStatus.
- **Impatto (scalabilità/sicurezza/performance):** data integrity
- **Rischio futuro:** Drift accumulates with every write; harder to untangle later.
- **Nota verificatore:** not independently re-verified (MEDIO/BASSO)

#### 36. No CI/CD pipeline: every push to main deploys to production with zero automated gate

- **Gravità:** MEDIO  ·  **Priorità:** P0  ·  **Tipo:** design  ·  **Confidence:** high  ·  **Verdetto verifica:** confirmed
- **Dimensione:** DevOps, CI/CD, Config, Secrets, Observability, Production Readiness
- **Dove:** (no .github/ directory anywhere in repo); docs/DEPLOY-VERCEL.md:26-27; web/package.json:5-11
- **Perché è un problema:** A recursive search found no .github/workflows and no CI YAML of any kind. DEPLOY-VERCEL.md:26-27 documents Vercel auto-deploy: 'ogni push su main -> deploy di produzione automatico'. package.json defines build/lint/typecheck scripts but nothing runs them before deploy. There is therefore no automated typecheck (tsc --noEmit), lint, test, or build gate between a commit and production.
- **Conseguenza reale:** A commit that fails typecheck, breaks a server action, or regresses RLS scoping ships directly to paying tenants. The only safety net is Vercel's own build step (next build), which will not catch type errors unless Next is configured to fail on them, and catches no logic/security regressions.
- **Come riprodurlo:** Push any commit with a TypeScript error in a server-only module that still transpiles, or a logic regression, to main; it deploys to production unguarded.
- **Come risolverlo:** Add a GitHub Actions workflow on PR + push to main that runs (in web/): npm ci, npm run typecheck, npm run lint, npm run build, and a test suite once it exists; make it a required status check and gate Vercel production deploys on it (or deploy only from a release branch after green CI).
- **Impatto (scalabilità/sicurezza/performance):** scalability
- **Rischio futuro:** Risk compounds with team size and change velocity; without a gate, the first serious regression to reach prod is a question of when, not if, and on a monetized CRM that means tenant-facing downtime or data exposure.
- **Nota verificatore:** FACTS ALL VERIFIED. (1) No CI: recursive find / Glob / `git ls-files | grep -iE "\.github|workflow|husky"` return ZERO matches outside node_modules (only third-party busboy/reusify/streamsearch ci.yml inside web/node_modules). No .github/ at repo root. (2) docs/DEPLOY-VERCEL.md:26 literally: "ogni push su `main` -> deploy di produzione automatico; ogni Pull Request -> Preview Deployment". (3) web/package.json:5-11 defines build/lint/typecheck but nothing invokes them pre-deploy. (4) No tests: every *.test.*/*.spec.* hit is inside web/node_modules; no app test files exist. (5) No git hooks (.husky absent), no tracked eslint config (web/.eslintrc* and eslint.config.* both absent; git ls-files shows none). (6) web/vercel.json:1-4 is bare ({framework:nextjs}); no ignoreCommand/buildCommand gate.

CORRECTION TO THE FINDING (why I downgrade): the "consequence"/"repro" overstate the type-error risk. web/next.config.mjs:7-18 does NOT set typescript.ignoreBuildErrors or eslint.ignoreDuringBuilds. Next.js DEFAULT behavior fails `next build` on TS type errors, and tsconfig.json:7 has "strict": true. So Vercel's own `next build` IS a real, strict typecheck gate -- a commit that fails tsc would fail the Vercel build and NOT reach production. The finding's claim that next build "will not catch type errors unless Next is configured to fail on them" is backwards for this repo. (ESLint is a different story: with no eslint config present, `next build` skips lint with a warning rather than failing -- so lint truly is ungated.)

NET: the core thesis stands -- there is no automated gate for logic regressions, RLS/security scoping regressions, or lint, and ZERO test suite, on a single-developer (git shortlog: william 144, willi 7) push-to-prod monetized multi-tenant CRM. That is real, verified production-readiness debt. But because the sharpest stated scenario (broken types shipping to prod) is in fact caught by Next's default strict build on Vercel, ALTO is inflated; this is a process/design gap with moderate impact, not an exploitable hole or guaranteed outage. MEDIO.

#### 37. Zero automated tests for a monetized, security-critical multi-tenant CRM

- **Gravità:** MEDIO  ·  **Priorità:** P1  ·  **Tipo:** tech_debt  ·  **Confidence:** high  ·  **Verdetto verifica:** confirmed
- **Dimensione:** DevOps, CI/CD, Config, Secrets, Observability, Production Readiness
- **Dove:** (no *.test.*, *.spec.*, vitest/jest/playwright config found in repo); web/package.json:5-11 (no test script)
- **Perché è un problema:** A repo-wide search for test/spec files and test-runner configs returned nothing, and package.json has no 'test' script. The most security-sensitive logic in the app — RLS scoping, the closure-table genealogy invariants, JWT claim parsing (session.ts/middleware.ts), the non-transactional activation rollback (account.ts:124-152, genealogia/actions.ts), and limited-view gating — has no regression coverage at all.
- **Conseguenza reale:** Any refactor can silently break tenant isolation, privilege gating, or the manual activation rollback (orphaning auth users or memberships) with nothing to catch it. For a paid product handling org-scoped personal data, an undetected RLS/visibility regression is a data-leak incident.
- **Come riprodurlo:** N/A (absence verified by search). e.g. a change to RANK_ORDER or to decodeJwtClaims in middleware.ts would alter limited-view enforcement with no failing test.
- **Come risolverlo:** Introduce a test runner (vitest) for the pure logic (claim parsing, rank gating, prospect-kpis, conversion math) and an integration layer (supabase local + pgTAP or seeded RLS tests) that asserts can_see_marketer scoping and activation/rollback atomicity. Add npm test to CI as a required gate.
- **Impatto (scalabilità/sicurezza/performance):** security
- **Rischio futuro:** Test debt grows with the schema (already 49 migrations); the cost and risk of every future RLS/genealogy change rises, and the closure-table/JWT logic is exactly the kind that breaks silently.
- **Nota verificatore:** Every factual claim in the finding is verified by filesystem inspection (not a live-DB claim, so no SQL needed). (1) No application test files: Glob web/{app,lib,components,hooks}/**/*.{test,spec}.{ts,tsx} = "No files found"; Glob **/{__tests__,tests,e2e}/**/*.{ts,tsx} returns only node_modules (tiptap/zod). (2) No test-runner config: Glob {vitest,jest,playwright,cypress}.config.* and root-level configs = none outside node_modules. (3) No test tooling installed: Grep vitest|jest|playwright|@testing-library|cypress|pgtap in **/package.json = "No files found"; web/package.json:39-49 devDependencies confirm none. (4) No `test` script: web/package.json:5-11 has only dev/build/start/lint/typecheck. (5) No CI gate at all: repo root has NO .github directory (ls confirms) and no root package.json. (6) No DB tests: supabase/ contains only migrations 0001-0046, functions/, seed.sql, config.toml, BUILD-REPORT.md — no pgTAP. The cited security-critical-but-untested code is real: account.ts:124-152 is exactly the non-transactional createUser->memberships.upsert with best-effort deleteUser rollback; middleware.ts:71-94 is the hand-rolled decodeJwtClaims (atob, base64url->base64) + isLimited rank gating, including a deliberate fail-open on unknown rank (line 92) and RANK_ORDER.indexOf comparison (line 93) — precisely the brittle pure logic a regression could silently break. The finding's premise is therefore fully accurate, not a false positive. I downgrade ALTO->MEDIO per the strict rubric: absence of tests is not itself a remotely exploitable hole, an active bug, or a guaranteed outage — it is real, notable tech debt that raises the probability of a future RLS/visibility/rollback regression. That is latent risk (moderate present impact), which is MEDIO, not ALTO. The fix recommendation (vitest for pure logic + pgTAP/seeded RLS integration tests + npm test as a CI gate) is sound.

#### 38. No observability: zero logging in web/ and the root error boundary discards every error -> blind in production

- **Gravità:** MEDIO  ·  **Priorità:** P1  ·  **Tipo:** design  ·  **Confidence:** high  ·  **Verdetto verifica:** confirmed
- **Dimensione:** DevOps, CI/CD, Config, Secrets, Observability, Production Readiness
- **Dove:** web/app/error.tsx:9-29; (grep console.(log|error|warn|info|debug) across web/ = 0 matches); supabase/functions (no logger/Sentry); web/package.json (no Sentry/logging dep)
- **Perché è un problema:** A grep for console.* across the entire web/ tree returns zero occurrences, and there is no Sentry/logging dependency in package.json. The root error boundary error.tsx:9 destructures only { reset } and never reads or reports the `error` argument, so caught exceptions vanish. The data layer swallows failures into demo fallbacks (session.ts:110, crm-shared.ts:51-53, account.ts:45/56 'ignore' catches) without emitting anything.
- **Conseguenza reale:** When something breaks in production there is no signal — no error tracking, no structured logs, no alerting. A failing Supabase query degrades to fabricated demo data (see CRITICO finding) with no telemetry that it happened. Incident detection depends entirely on a user complaining.
- **Come riprodurlo:** Trigger any server-action failure in prod; error.tsx renders a generic message and nothing is logged or reported anywhere.
- **Come risolverlo:** Add error monitoring (Sentry @sentry/nextjs or equivalent) wired into error.tsx and a global-error.tsx, and instrument the silent catches in session.ts/crm-shared.ts/account.ts to report (not swallow) the underlying error server-side. Add structured server logging for service-role operations (activation/revoke).
- **Impatto (scalabilità/sicurezza/performance):** security
- **Rischio futuro:** Without telemetry, the silent-demo-fallback and migration-drift failure modes can persist undetected in production indefinitely; MTTR for any incident is unbounded.
- **Nota verificatore:** All factual claims VERIFIED against the actual code. (1) Grep `console\.(log|error|warn|info|debug)` across web/ = ZERO matches (confirmed). (2) web/app/error.tsx is the only error boundary (no web/app/global-error.tsx, no web/instrumentation.ts — both Glob-confirmed absent); error.tsx:9 `export default function Error({ reset }: { error: Error; reset: () => void })` types `error` but destructures only `reset` and never reads/reports it (lines 9-29) — confirmed discarded. (3) package.json (read lines 1-50): NO Sentry/pino/winston/datadog/logtail/newrelic dependency; the only observability hit (@opentelemetry/api) is a TRANSITIVE entry in package-lock.json, not a direct dep, and is unused. (4) Silent catches confirmed: account.ts:45-47, 56-58 (`/* ignore */`); session.ts:110-112 (`catch { return DEMO_CLAIMS demo:true }`); crm-shared.ts:51-53 (`catch { return null }`). Grep for empty/ignore catches + demo-fallback across web/lib/data = 110 occurrences in 27 files — the swallow-into-demo pattern is real and pervasive, with no telemetry emitted. So the finding is factually accurate and confirmed. HOWEVER severity ALTO and impact:"security" are inflated/misattributed: this is an observability/production-readiness gap, NOT a security weakness (no auth bypass, no privilege escalation, no data exposure) and NOT itself a data-integrity bug or guaranteed-outage condition. Per the rubric ALTO requires a serious bug / real security weakness / data-integrity risk / performance cliff; absence of monitoring is none of those — it is classic "notable tech debt with moderate impact" = MEDIO. The amplifying angle (failing query degrades to fabricated demo data silently) is real but that data-integrity risk belongs to the separate silent-demo-fallback finding; the observability gap on its own is design/tech debt. Adjusting severity to MEDIO; the security impact tag is incorrect (should be reliability/operability).

#### 39. SUPABASE_SERVICE_ROLE_KEY omitted from deploy guide and web/.env.example -> activation flow silently breaks in prod

- **Gravità:** MEDIO  ·  **Priorità:** P1  ·  **Tipo:** bug  ·  **Confidence:** high  ·  **Verdetto verifica:** confirmed
- **Dimensione:** DevOps, CI/CD, Config, Secrets, Observability, Production Readiness
- **Dove:** docs/DEPLOY-VERCEL.md:40-50 (lists only the two NEXT_PUBLIC vars); web/.env.example:1-8 (no service-role key); web/lib/supabase/admin.ts:13-19; web/lib/data/account.ts:108-110
- **Perché è un problema:** getAdminClient() returns null when SUPABASE_SERVICE_ROLE_KEY is unset (admin.ts:14-15). DEPLOY-VERCEL.md:40-50 documents ONLY NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY as the variables to set in Vercel, and web/.env.example (the file a deployer copies) lists only those two — it never mentions the service-role key. The root .env.example does mention it (line 29), but the Vercel guide and the web-scoped example (matching Root Directory = web) do not.
- **Conseguenza reale:** A deployment that follows the official guide will appear healthy (auth + reads work via the anon key) but every privileged operation that needs the admin client fails: activateCrmAccess returns error:'service_missing' (account.ts:110) and revokeAccountForMarketer returns {ok:false} (account.ts:34). Admins cannot create or revoke CRM logins — a core monetized feature — with a non-obvious cause.
- **Come riprodurlo:** Deploy per DEPLOY-VERCEL.md (set the two listed vars only), then try 'Attiva accesso CRM' for a marketer: it fails with service_missing while the rest of the app works.
- **Come risolverlo:** Add SUPABASE_SERVICE_ROLE_KEY (server-only, no NEXT_PUBLIC prefix) to web/.env.example and to the DEPLOY-VERCEL.md variables table with a security note; ideally have lib/env.ts (or a server-only check) warn/fail when the activation feature is reachable but the key is missing.
- **Impatto (scalabilità/sicurezza/performance):** security
- **Rischio futuro:** Each new environment (preview, new prod, DR) reproduces the same gap; the broken-activation symptom is intermittent and hard to diagnose because the rest of the app is fine.
- **Nota verificatore:** Factual core VERIFIED and accurate. docs/DEPLOY-VERCEL.md:42-50 documents ONLY NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY and line 42 actively states "Servono **due** variabili ... usa SOLO la chiave anon (mai la service-role)" — steering deployers AWAY from the service-role key. web/.env.example:1-8 (the file matching Vercel Root Directory=web) likewise lists only the two NEXT_PUBLIC vars + DEFAULT_LOCALE and line 2 says "uses ONLY the anon key — never the service-role key". admin.ts:13-15 returns null when SUPABASE_SERVICE_ROLE_KEY is unset; account.ts:110 returns error:'service_missing' and account.ts:34 returns {ok:false} for revoke. web/lib/env.ts only validates the 2 public vars (isSupabaseConfigured, lines 13-15) — no validation/warning for the service-role key, so a guide-following deploy looks healthy (auth+reads work) while the activation/revoke feature is broken. So the documented-deploy-path-breaks-activation claim is real.

However the finding OVERSTATES severity and mis-tags impact: (1) the root .env.example:29 AND README.md:100 BOTH document the key correctly, so the README-driven setup path is fine — only the Vercel guide + web-scoped example omit it. (2) Failure is NOT silent/hard-to-diagnose on the primary path: activate-crm-dialog.tsx:76 -> it.json:227 surfaces "Attivazione non configurata sul server. Aggiungi la chiave SUPABASE_SERVICE_ROLE_KEY." — the in-app error literally names the missing variable. (The secondary add-member-dialog.tsx:118-119 path uses the vaguer add_service_missing, it.json:253.) (3) impact:"security" is WRONG — a missing service-role key fails CLOSED (no privilege escalation, no data exposure, no remote exploit); by design admin.ts degrades gracefully instead of crashing. This is a documentation/config defect that breaks a core feature in a guide-following deploy (genuine MEDIO impact), self-mitigated by an in-app message naming the exact key — not an ALTO-tier serious bug or security weakness.

#### 40. Lint gate is non-functional: `next lint` script with ESLint not installed or configured

- **Gravità:** MEDIO  ·  **Priorità:** P2  ·  **Tipo:** tech_debt  ·  **Confidence:** high  ·  **Verdetto verifica:** confirmed
- **Dimensione:** DevOps, CI/CD, Config, Secrets, Observability, Production Readiness
- **Dove:** web/package.json:9 ('lint': 'next lint'); web/ (no .eslintrc*, no eslint in package-lock.json, no eslint binary in node_modules/.bin)
- **Perché è un problema:** package.json declares a lint script, but ESLint is absent: grep -c eslint web/package-lock.json returns 0, there is no .eslintrc* config file, and node_modules/.bin has no eslint binary. `next lint` in this state either aborts asking to install ESLint (interactive, fails in CI) or no-ops — it provides no real static-analysis coverage.
- **Conseguenza reale:** Even if CI were added, `npm run lint` would not actually enforce anything, and common mistakes (unused vars, exhaustive-deps, accidental client/server import boundaries) go uncaught. It also gives a false sense of a quality gate that does not exist.
- **Come riprodurlo:** Run `npm run lint` in web/ on a clean install: ESLint is not present, so the script cannot lint the codebase.
- **Come risolverlo:** Add eslint + eslint-config-next as devDependencies and a checked-in eslint config (next/core-web-vitals), then wire npm run lint into CI as a required check.
- **Impatto (scalabilità/sicurezza/performance):** scalability
- **Rischio futuro:** Without working lint, server/client boundary and hook-dependency bugs accumulate; the larger the codebase grows the more value is lost.
- **Nota verificatore:** not independently re-verified (MEDIO/BASSO)

#### 41. Live DB reports 73 security advisories (leaked-password protection off, public bucket lists all files, mutable function search_path)

- **Gravità:** MEDIO  ·  **Priorità:** P2  ·  **Tipo:** security  ·  **Confidence:** high  ·  **Verdetto verifica:** confirmed
- **Dimensione:** DevOps, CI/CD, Config, Secrets, Observability, Production Readiness
- **Dove:** Supabase advisors for project qpfnsselgwulrlmlandd (security): 73 WARN total — auth_leaked_password_protection (1), public_bucket_allows_listing 'org-assets' (1), function_search_path_mutable (23), authenticated/anon_security_definer_function_executable (29+16), extension_in_public ltree/btree_gist/pg_trgm (3)
- **Perché è un problema:** get_advisors(security) returned 73 warnings. Concretely: HaveIBeenPwned leaked-password protection is disabled (auth_leaked_password_protection); the public bucket 'org-assets' has a broad SELECT policy (org_assets_public_read) allowing clients to LIST all files, not just fetch known URLs (public_bucket_allows_listing); 23 functions have a mutable search_path (search-path-hijack hardening gap for SECURITY DEFINER helpers); ltree/btree_gist/pg_trgm are installed in the public schema.
- **Conseguenza reale:** Users can register compromised passwords; an authenticated client can enumerate every object in org-assets (potential cross-tenant asset discovery depending on naming); mutable search_path on SECURITY DEFINER functions is a known privilege-escalation hardening gap.
- **Come riprodurlo:** Run get_advisors(project_id=qpfnsselgwulrlmlandd, type=security): 73 WARN entries with the names above.
- **Come risolverlo:** Enable leaked-password protection in Auth settings; drop the broad SELECT listing policy on org-assets (object URL access does not need it); set explicit search_path on all SECURITY DEFINER functions (committed via migration); relocate extensions out of public. Add get_advisors to CI/post-migration checks.
- **Impatto (scalabilità/sicurezza/performance):** security
- **Rischio futuro:** search_path and security-definer advisories grow with each new RPC; left unaddressed they form a steady hardening debt that an attacker can probe as the schema expands.
- **Nota verificatore:** not independently re-verified (MEDIO/BASSO)

#### 42. No rate limiting / WAF / abuse protection on auth and server actions

- **Gravità:** MEDIO  ·  **Priorità:** P2  ·  **Tipo:** security  ·  **Confidence:** medium  ·  **Verdetto verifica:** confirmed
- **Dimensione:** DevOps, CI/CD, Config, Secrets, Observability, Production Readiness
- **Dove:** (no upstash/ratelimit/middleware throttle in web/; grep for rateLimit/@upstash/ratelimit = 0); web/middleware.ts (auth refresh + gating only, no throttling); web/app/(auth)/accedi, recupera-password (no limiter)
- **Perché è un problema:** Searches found no rate-limiting library or code anywhere; middleware.ts only refreshes sessions and gates routes. Login, password-recovery, and the public invite-acceptance/activation paths have no per-IP or per-account throttling, and there is no WAF layer beyond Vercel/Supabase defaults.
- **Conseguenza reale:** Credential-stuffing/brute-force against /accedi and recovery, and abuse of public invite/activation endpoints, are unthrottled at the app layer. For a paid CRM this raises account-takeover and resource-exhaustion risk.
- **Come riprodurlo:** Hammer the sign-in or password-recovery endpoint repeatedly; the app applies no throttle (only whatever GoTrue defaults provide upstream).
- **Come risolverlo:** Add rate limiting in middleware (e.g. Upstash Ratelimit keyed by IP) on auth + activation routes, and ensure Supabase Auth rate limits are tuned; consider Vercel WAF/edge rules for the auth surface.
- **Impatto (scalabilità/sicurezza/performance):** security
- **Rischio futuro:** Becomes a real target the moment the product has paying users and a discoverable login; absence of throttling is much harder to retrofit under active abuse.
- **Nota verificatore:** not independently re-verified (MEDIO/BASSO)

#### 43. Dashboard conversion metric implementation contradicts its own documented semantics

- **Gravità:** MEDIO  ·  **Priorità:** P2  ·  **Tipo:** bug  ·  **Confidence:** medium  ·  **Verdetto verifica:** confirmed
- **Dimensione:** Domain Logic Correctness: Notifications, Birthdays, Dashboard, Limited-view, Ranks
- **Dove:** web/lib/data/dashboard.ts:13-16 + 23-25 (docstring: 'share of those that reached Closing among those that reached Business Info'); vs 101-136 (fetchMonthProspects) + 211-225 (conversion = enrolled/(enrolled+resolvedFail))
- **Perché è un problema:** The file header and the `conversion` field comment define conversion as Closing-reached / BusinessInfo-reached. The actual computation is iscritti/(iscritti + deleted-not-enrolled): enrolled = (outcome 'enrolled' OR current_stage 'iscrizione'); resolvedFail = deleted_at set; open prospects excluded. It never references the Business Info or Closing stages at all. The two definitions produce different numbers.
- **Conseguenza reale:** The 'Conversione' leaderboard shows a different metric than the documented/intended one. Anyone reasoning from the header comment (or product spec) will misread the leaderboard; a prospect that reached Closing but was later deleted counts as a FAILURE, and an open prospect parked at Business Info is ignored entirely.
- **Come riprodurlo:** Owner A this month: 1 prospect enrolled, 1 deleted while in 'closing', 1 open in 'business_info'. Documented metric (Closing/BusinessInfo) would be 1/2 (the deleted one reached closing) considering 2 reached BI. Implementation returns enrolled/resolved = 1/2 by coincidence here but diverges generally (e.g. an open BI prospect changes the documented denominator but not the implemented one).
- **Come risolverlo:** Decide the canonical definition and align code+comments. If 'iscritti over resolved prospects' is intended, rewrite the header/field docs; if Closing/BusinessInfo is intended, compute from stage throughput (journey events) instead of outcome/deleted.
- **Impatto (scalabilità/sicurezza/performance):** Misleading KPI; correctness of the headline conversion ranking is ambiguous and likely wrong relative to spec.
- **Rischio futuro:** Drifts further as stages evolve; deleted-prospect-as-failure skews ranking against marketers who clean up their board.
- **Nota verificatore:** not independently re-verified (MEDIO/BASSO)

#### 44. @tanstack/react-query shipped on every route but never used (dead heavy dep in shared first-load JS)

- **Gravità:** MEDIO  ·  **Priorità:** P1  ·  **Tipo:** tech_debt  ·  **Confidence:** high  ·  **Verdetto verifica:** confirmed
- **Dimensione:** Frontend Performance, Bundle Size, Code-splitting, Images
- **Dove:** web/app/providers.tsx:4,16-27,36-38; mounted in web/app/layout.tsx:6,54; web/package.json:18
- **Perché è un problema:** providers.tsx imports QueryClient/QueryClientProvider and instantiates a QueryClient, and <Providers> wraps {children} in the ROOT layout (app/layout.tsx:54), so react-query is in the shared client bundle loaded by EVERY route (auth + all app pages). But a full-tree grep for useQuery|useMutation|useInfiniteQuery|useQueryClient returns ZERO matches — the library is configured and never used. The published bundle (lock shows @tanstack/react-query@5.100.14) is dead weight in the most expensive bundle there is: the shared/first-load chunk.
- **Conseguenza reale:** Every visitor, including the unauthenticated login page, downloads, parses and executes the react-query runtime + provider for no functional benefit, inflating first-load JS and slowing TTI on the lowest-end devices/networks, which network-marketing field users (mobile) typically have.
- **Come riprodurlo:** grep for `from '@tanstack/react-query'` -> only web/app/providers.tsx. grep for `useQuery|useMutation|useQueryClient|useInfiniteQuery` across web/ -> No matches found. Confirm <Providers> is in the root layout (app/layout.tsx:54).
- **Come risolverlo:** Remove QueryClient/QueryClientProvider from providers.tsx and drop @tanstack/react-query from package.json. The app uses RSC + Server Actions for all data; there is no client cache to manage. If client-side fetching is planned, add the provider only when the first useQuery is introduced.
- **Impatto (scalabilità/sicurezza/performance):** Reduces shared first-load JS on 100% of routes; faster TTI everywhere. No functional change since the API is unused.
- **Rischio futuro:** A dormant provider invites cargo-cult useQuery additions and masks the fact that nothing actually relies on it; the bloat compounds as more client islands import from it 'because it's already there'.
- **Nota verificatore:** Factual core fully verified. web/app/providers.tsx:4 imports `{ QueryClient, QueryClientProvider } from '@tanstack/react-query'`; lines 16-27 instantiate a QueryClient (staleTime/gcTime/refetchOnWindowFocus defaults); lines 36-38 wrap {children} in <QueryClientProvider>. It is a 'use client' component (line 1). web/app/layout.tsx:6 imports Providers and line 54 mounts <Providers>{children}</Providers> in the ROOT layout, so the react-query runtime is in the shared client chunk on EVERY route incl. unauthenticated pages. web/package.json:18 declares "@tanstack/react-query": "^5.59.0" as a prod dependency; web/package-lock.json:582 resolves it to 5.100.14. Whole-tree greps confirm dead usage: the ONLY reference to '@tanstack/react-query' anywhere in web/ is providers.tsx:4 (the import). Zero matches for useQuery|useMutation|useInfiniteQuery|useQueryClient|useQueries|useSuspenseQuery|prefetchQuery across both .tsx and .ts files, and no re-export/wrapper hook exists. So the provider is configured but no consumer reads from the cache — confirmed dead weight. Not a DB claim, so no Supabase inspection needed. SEVERITY OVERSTATED: this is genuine but is the finding's own kind=tech_debt with zero functional impact and a trivial fix. react-query v5's used surface (client core + provider, unused hooks/devtools tree-shake out) is ~12-13KB gzip in shared JS — a real but modest add, not a 'performance cliff likely under real load' as the ALTO rubric requires, especially next to the genuinely-used heavy client deps already shipped (@xyflow/react, @tiptap/*, @tanstack/react-table, @dnd-kit/*, d3-hierarchy). 'Notable tech debt with moderate impact' = MEDIO, not ALTO.

#### 45. Genealogy canvas (@xyflow/react + d3-hierarchy) eagerly bundled with no code-splitting

- **Gravità:** MEDIO  ·  **Priorità:** P1  ·  **Tipo:** perf  ·  **Confidence:** high  ·  **Verdetto verifica:** confirmed
- **Dimensione:** Frontend Performance, Bundle Size, Code-splitting, Images
- **Dove:** web/components/genealogy/genealogy-canvas.tsx:1-17 (xyflow), web/components/genealogy/layout.ts:1 (d3-hierarchy); statically imported via web/components/genealogy/genealogy-view.tsx:25-27; rendered by web/app/(app)/genealogia/page.tsx:4,42; CSS side-effect import web/components/genealogy/genealogy-view.tsx (xyflow/react/dist/style.css)
- **Perché è un problema:** @xyflow/react (React Flow, v12 — the single heaviest client dependency, pulls in its own renderer, zustand store, d3-zoom/d3-drag/d3-selection transitive deps) plus d3-hierarchy are imported with plain static `import` statements through the GenealogyView -> GenealogyCanvas chain. There is no next/dynamic and no React.lazy anywhere in the genealogy folder (verified: React.lazy appears only in document-pane.tsx). So the entire React Flow runtime is in the /genealogia route's client JS, loaded up-front before the user can interact.
- **Conseguenza reale:** The /genealogia first-load JS is dominated by React Flow + d3; LCP/TTI on that route suffer, especially on mobile. The page already SSRs an initial node window, so the heavy interactive canvas could be deferred without hurting first paint.
- **Come riprodurlo:** grep `from '@xyflow/react'` -> genealogy-canvas.tsx, marketer-node.tsx, add-slot-node.tsx. grep `next/dynamic|React.lazy` in web/components/genealogy -> none. genealogy-view.tsx:25 statically imports GenealogyCanvas.
- **Come risolverlo:** Lazy-load the canvas: `const GenealogyCanvas = dynamic(() => import('./genealogy-canvas').then(m => m.GenealogyCanvas), { ssr: false, loading: () => <GenealogySkeleton/> })` (or React.lazy + Suspense as already done for the editor). Keep the lightweight SSR summary/skeleton for first paint and hydrate the canvas after. Also import xyflow CSS only within the lazy chunk.
- **Impatto (scalabilità/sicurezza/performance):** Removes the heaviest client lib from the /genealogia critical path; large first-load JS reduction on that route with no UX regression (skeleton already exists).
- **Rischio futuro:** React Flow versions only grow; as the tree gains features (drag placement, minimap interactions) the eager chunk balloons further and the genealogy route becomes the slowest in the app.
- **Nota verificatore:** Tried to refute; every cited fact holds. (1) @xyflow/react is a direct dep, v12 "^12.10.2" (web/package.json:23) and d3-hierarchy "^3.1.2" (web/package.json:26). (2) Plain static imports of the React Flow runtime: genealogy-canvas.tsx:4-17 (ReactFlow, MiniMap, Controls, Background, ReactFlowProvider, useNodesState/useEdgesState/useReactFlow), marketer-node.tsx:4 and add-slot-node.tsx:4 (Handle/Position); d3-hierarchy in layout.ts:1 (hierarchy, tree). (3) CSS side-effect import '@xyflow/react/dist/style.css' at genealogy-view.tsx:4. (4) genealogy-view.tsx:24-27 statically imports GenealogyCanvas; page.tsx:4,42 renders GenealogyView. (5) Grep for next/dynamic|React.lazy|dynamic( across web/components/genealogy = ZERO matches, so no code-splitting in the folder; React.lazy exists in the repo at document-pane.tsx:46, confirming the pattern is established but not applied here. (6) next.config.mjs has NO optimizePackageImports/modularizeImports/analyzer mitigation. (7) The proposed fix is low-risk: GenealogySkeleton already exists and is wired as the page Suspense fallback (page.tsx:41), so dynamic(()=>import('./genealogy-canvas'),{ssr:false,loading:GenealogySkeleton}) would defer React Flow + d3 with no UX regression. Confirmed real and concrete. Lowering ALTO->MEDIO because: Next route-level code-splitting already isolates React Flow to the /genealogia chunk only (it is NOT in the shared/global bundle, so other routes are unaffected), the route is force-dynamic behind auth (not a public LCP-sensitive landing page), and this is a one-time per-route download cost, not a runtime performance cliff under load — which is the ALTO bar. No measured bundle size was provided. Still a genuine, easily-fixed first-load-JS cost on the app's heaviest interactive route.

#### 46. date-fns declared as a dependency but never imported

- **Gravità:** MEDIO  ·  **Priorità:** P2  ·  **Tipo:** tech_debt  ·  **Confidence:** high  ·  **Verdetto verifica:** confirmed
- **Dimensione:** Frontend Performance, Bundle Size, Code-splitting, Images
- **Dove:** web/package.json:27
- **Perché è un problema:** date-fns ^4.4.0 is listed in dependencies, but a full grep for `date-fns` across all .ts/.tsx returns No matches. It is never imported in any form (neither `from 'date-fns'` nor `date-fns/...`).
- **Conseguenza reale:** Although tree-shaking means an unused dep should not reach the client bundle, it still bloats node_modules, install time, and the lockfile, and signals confusion about which date utility is canonical (the app formats dates manually / via Intl elsewhere). It also creates supply-chain surface for zero benefit.
- **Come riprodurlo:** grep `date-fns` across web/**/*.{ts,tsx} -> No matches found (only package.json + package-lock.json).
- **Come risolverlo:** Remove date-fns from package.json (and regenerate the lockfile). Reintroduce it scoped per-function (`import { format } from 'date-fns/format'`) only when actually needed.
- **Impatto (scalabilità/sicurezza/performance):** Smaller dependency surface and lockfile; eliminates a dead dep. No bundle impact today (already tree-shaken out) but removes confusion/risk.
- **Rischio futuro:** A present-but-unused date lib invites someone to `import { format } from 'date-fns'` (barrel) later, which without per-path imports can pull a large slice of the lib into a client bundle.
- **Nota verificatore:** not independently re-verified (MEDIO/BASSO)

#### 47. @tanstack/react-table eagerly bundled into three list-manager client islands

- **Gravità:** MEDIO  ·  **Priorità:** P2  ·  **Tipo:** perf  ·  **Confidence:** high  ·  **Verdetto verifica:** confirmed
- **Dimensione:** Frontend Performance, Bundle Size, Code-splitting, Images
- **Dove:** web/components/crm/data-table.tsx:4-13; consumed statically by web/components/contacts/contacts-manager.tsx:5,29 (/contatti), web/components/calls/calls-manager.tsx:5,20 (/chiamate), and indirectly /lista-contatti
- **Perché è un problema:** The shared DataTable wraps @tanstack/react-table (useReactTable + 4 row models) and is imported with a plain static import by the contacts and calls managers, which the pages render directly (e.g. contatti/page.tsx:4 -> ContactsManager). No dynamic import. react-table ships in the first-load JS of every list route even though the table is below-the-fold relative to the page header/filters.
- **Conseguenza reale:** Each list route pays the react-table cost up-front. Less severe than xyflow but it is duplicated reasoning across 3 routes and is a clean code-split candidate since the table is purely client interactivity over server-fetched rows.
- **Come riprodurlo:** grep `from '@tanstack/react-table'` -> data-table.tsx, contacts-manager.tsx, calls-manager.tsx. grep `next/dynamic|React.lazy` in those files -> none.
- **Come risolverlo:** Either dynamic-import the DataTable (ssr:false with a static skeleton, which the component already has via Skeleton import), or render a server-side static table for first paint and hydrate the interactive DataTable lazily.
- **Impatto (scalabilità/sicurezza/performance):** Trims first-load JS on /contatti, /chiamate, /lista-contatti; modest per-route win.
- **Rischio futuro:** As more list views adopt DataTable, the eager react-table cost is paid on each route bundle; centralizing the lazy boundary now prevents N copies of the problem.
- **Nota verificatore:** not independently re-verified (MEDIO/BASSO)

#### 48. Every page is force-dynamic — zero static/ISR optimization, full SSR on every request

- **Gravità:** MEDIO  ·  **Priorità:** P2  ·  **Tipo:** perf  ·  **Confidence:** medium  ·  **Verdetto verifica:** confirmed
- **Dimensione:** Frontend Performance, Bundle Size, Code-splitting, Images
- **Dove:** web/app/(app)/*/page.tsx (dashboard:23, contatti:19, genealogia:20, documenti:24, analytics:44, statistiche:12, classifiche:23, report:21, presenze:16, notifiche:15, admin/*:14-35, etc. — ~25 pages) plus web/app/(auth)/invito/[token]/page.tsx:9
- **Perché è un problema:** `export const dynamic = 'force-dynamic'` is declared on essentially every route (grep returned ~25 page hits). The data layer reads request cookies/Supabase so request-time rendering is required for authed pages, but force-dynamic disables the full-route cache and any static shell, so every navigation does a fresh server render + data round-trip. There is no use of generateStaticParams, route segment caching, or partial prerendering for shells.
- **Conseguenza reale:** Higher TTFB/LCP than necessary and higher Vercel server cost at scale: with N field marketers hammering dashboards/lists, every hit is a cold-ish RSC render. Static shells (header, nav, skeleton) cannot be served from cache.
- **Come riprodurlo:** grep `force-dynamic` -> hits on ~25 app pages. No `revalidate`/`generateStaticParams` on data pages (only revalidatePath in actions).
- **Come risolverlo:** Keep force-dynamic only where strictly needed; for shells consider streaming with Suspense + a static layout, and for genuinely cacheable per-org reads use `revalidate` with cache tags + revalidateTag in the existing Server Actions. At minimum, audit which pages truly need per-request data vs short revalidate windows.
- **Impatto (scalabilità/sicurezza/performance):** Lower TTFB/LCP and reduced server/function invocation cost under real multi-tenant load.
- **Rischio futuro:** force-dynamic-everywhere becomes the default copy-paste; as traffic grows, server cost scales linearly with requests with no caching relief.
- **Nota verificatore:** not independently re-verified (MEDIO/BASSO)

#### 49. getCurrentClaims() re-runs getSession() + new Supabase client 4+ times per request (no React cache() memoization)

- **Gravità:** MEDIO  ·  **Priorità:** P1  ·  **Tipo:** perf  ·  **Confidence:** high  ·  **Verdetto verifica:** confirmed
- **Dimensione:** Next.js Architecture: RSC/CSR boundaries, Waterfalls, Caching
- **Dove:** web/lib/data/session.ts:63-113 (getCurrentClaims, not wrapped in cache()); web/lib/data/crm-shared.ts:62-69 (getOwnerContext→getCurrentClaims); web/lib/data/org-identity.ts:20; web/lib/data/notifications.ts:48; web/app/(app)/layout.tsx:32,47,61,64
- **Perché è un problema:** getCurrentClaims() each time calls createClient() (a fresh @supabase/ssr server client reading cookies()), then supabase.auth.getSession(), then decodes the JWT. It is NOT wrapped in React's cache(), so the framework cannot dedupe it within a single request. In (app)/layout.tsx it is hit at least 4x per render: directly (L32), inside listNotifications→descendantIds→getOwnerContext (notifications.ts:48), inside getOrgIdentity→getOwnerContext (org-identity.ts:20), and getNode's path. Every (app) page rendered on top of the layout adds MORE calls (e.g. genealogia getRootMarketer calls it internally again at genealogy.ts:170; team/[id] calls it directly + via getMarketerProfile chain).
- **Conseguenza reale:** Every authenticated navigation pays for 4-8 redundant session reads + JWT decodes + client instantiations. On the Edge/Node serverless function this is wasted CPU and cookie parsing on a hot path that runs for literally every page view; under real concurrent load it inflates function duration (Vercel billing) and TTFB with zero functional benefit.
- **Come riprodurlo:** Add a counter/log inside getCurrentClaims and load /team/[id]; observe it fires for layout (x4 via helpers) plus the page's direct call + getMarketerProfile path = ~5-6 invocations for one navigation.
- **Come risolverlo:** Wrap getCurrentClaims in React's cache(): `export const getCurrentClaims = cache(async (): Promise<SessionResult> => {...})`. Same for createClient() in web/lib/supabase/server.ts (memoize per-request so getClient()/getCurrentClaims share ONE client). This collapses N session reads to 1 per request with a one-line change.
- **Impatto (scalabilità/sicurezza/performance):** perf: removes redundant auth I/O + client allocation on the hottest code path (every page load), cutting serverless function CPU/duration and TTFB; scales linearly with traffic.
- **Rischio futuro:** As more widgets/server components call getOwnerContext/getCurrentClaims, the per-request multiplier silently grows; without cache() each new data helper adds another full session read.
- **Nota verificatore:** CONFIRMED in mechanism, but severity inflated (ALTO -> MEDIO).

Verified facts:
- getCurrentClaims is NOT wrapped in cache(): web/lib/data/session.ts:63 is a plain `export async function`. Grep for `cache(` across all of web/ returns ZERO matches — nothing in the codebase uses React cache(). createClient is also un-memoized (web/lib/supabase/server.ts:21, plain function).
- Multiple getCurrentClaims() per (app) render. In web/app/(app)/layout.tsx: L32 direct (1); L61 listNotifications -> descendantIds -> getOwnerContext -> getCurrentClaims (notifications.ts:48 + 134, crm-shared.ts:67) (1); L64 getOrgIdentity -> getOwnerContext -> getCurrentClaims (org-identity.ts:20) (1) = 3 getCurrentClaims in the layout. On team/[id] (page.tsx:79) a 4th direct call is added. genealogia getRootMarketer adds another (genealogy.ts:170).
- Each call does real per-request work: createClient() builds a fresh @supabase/ssr server client (registers onAuthStateChange, builds cookie storage adapter), then getSession() reads cookies via the storage adapter (node_modules/@supabase/ssr/.../cookies.js getItem L226-247: getAll([key]) from next/headers, combineChunks, stringFromBase64URL decode, JSON.parse, _isValidSession), then session.ts:80 does a SECOND manual JWT base64/JSON decode (decodeJwt). None is deduped because each createClient() yields an independent GoTrue client (createServerClient.js sets autoRefreshToken:false, persistSession with per-instance storage) — the library cannot share state across them. So N calls = N client allocations + N cookie parses + N JWT decodes. Fix (`cache()`) is a valid one-liner with no behavioral change.

Why MEDIO not ALTO:
- Verified there is NO network round-trip on the hot path: GoTrueClient.__loadSession (GoTrueClient.js:2324) only calls _callRefreshToken when hasExpired (L2378); for a valid token it returns from local storage. SSR _initialize (L280) is a no-op when !isBrowser() with detectSessionInUrl:false. The finding itself concedes this ("no extra network round-trip"). So the waste is bounded local CPU: a handful of cookie reads + base64 + JSON parses + small allocations per request — measurable but sub-ms-to-low-ms, scaling LINEARLY with traffic, not a "performance cliff" (the ALTO bar). It is genuine, easily-fixed tech debt = MEDIO.
- Two minor inaccuracies in the finding: (1) it counts getNode (layout.tsx:47) as a getCurrentClaims call, but getNode (genealogy.ts:260-286) calls createClient() directly and does NOT call getCurrentClaims — so the layout has 3 getCurrentClaims (+1 bare createClient via getNode), not 4 getCurrentClaims. (2) genealogy.ts:170 getCurrentClaims only fires in the member fallback branch (admins return at the org-root branch L161-165). These don't change the substance: redundant un-memoized session/client work on every authenticated page is real.

#### 50. Universal force-dynamic with zero caching: every navigation is a full uncached server render hitting Supabase

- **Gravità:** MEDIO  ·  **Priorità:** P1  ·  **Tipo:** perf  ·  **Confidence:** high  ·  **Verdetto verifica:** confirmed
- **Dimensione:** Next.js Architecture: RSC/CSR boundaries, Waterfalls, Caching
- **Dove:** web/app/(app)/**/page.tsx (30 files all `export const dynamic = 'force-dynamic'`, e.g. dashboard/page.tsx:23, genealogia/page.tsx:20, team/[id]/page.tsx:38, presenze/page.tsx:16, statistiche/page.tsx:12); no unstable_cache/revalidate/cache() found anywhere except revalidatePath in actions
- **Perché è un problema:** Grep for `cache(|unstable_cache|revalidate` returns only revalidatePath() inside Server Actions — there is NO read-side caching anywhere. Combined with force-dynamic on every route, each page render re-executes all Supabase reads from scratch. Some data is highly cacheable and rarely changes per request: org identity (name/logo, read in the layout on EVERY navigation via getOrgIdentity), team rosters (statistiche), leaderboards (dashboard, which the comment admits are 'mock/derived'). None of it is wrapped in unstable_cache with a tag/revalidate.
- **Conseguenza reale:** Layout-level reads (claims, getNode(self), listNotifications, getOrgIdentity) re-execute on EVERY single page click because layouts re-render per navigation and nothing is cached. Org identity (changes maybe once a month) is fetched on every page view across the whole user base. This is a database-read amplification cliff under real load.
- **Come riprodurlo:** Navigate between any two (app) pages; the (app) layout re-runs getOrgIdentity()+listNotifications()+getNode() each time with no cache hit, plus the new page's full read set.
- **Come risolverlo:** Wrap stable reads in unstable_cache with tags: getOrgIdentity → `unstable_cache(fn, ['org-identity', orgId], { tags: ['org-identity'], revalidate: 300 })`, invalidated by the existing revalidatePath in org/actions.ts (or revalidateTag). At minimum wrap getCurrentClaims/getNode/getOrgIdentity in React cache() so the layout doesn't refetch within a render. Leaderboards/roster can take a short `revalidate` since they're derived.
- **Impatto (scalabilità/sicurezza/performance):** perf/scalability: eliminates Supabase round-trips on data that doesn't change per-request; reduces DB connection pressure and per-render latency that currently scales 1:1 with navigation count.
- **Rischio futuro:** As the user base grows, the layout's per-navigation read fan-out multiplies DB load with no relief valve; the team will reach Supabase connection/pooler limits far sooner than necessary.
- **Nota verificatore:** The CORE observation is verified but the finding is framed wrong (causation + fix) and severity is inflated.

VERIFIED TRUE: (1) 27 `(app)` page.tsx files declare `export const dynamic='force-dynamic'` (Grep confirms; finding said 30 — minor overcount). (2) No read-side caching anywhere: the only `next/cache` usage in web/ is `revalidatePath` inside Server Actions (impostazioni/actions.ts, org/actions.ts, percorso-prospect/actions.ts). No `unstable_cache`, no `revalidate` segment, no React `cache()` wrapping any data fn. (3) The (app) layout re-runs reads on every navigation: web/app/(app)/layout.tsx:32 getCurrentClaims, :47 getNode(self), :61 listNotifications, :64 getOrgIdentity. (4) Per-navigation DB fan-out is real and actually ~7 round-trips: getNode = marketers select (genealogy.ts:270) + fetchTeamCounts closure query (:281); listNotifications = descendantIds closure query (notifications.ts:50) + listUpcomingBirthdays→listMarketers+fetchExtras (team.ts:213-215) + newMemberNotifications marketers query (:101); getOrgIdentity = organizations query (org-identity.ts:21).

WRONG / OVERSTATED: (a) getCurrentClaims is NOT a DB read — it decodes the JWT from the session cookie (session.ts:72-80, comment 'no extra network round-trip'); the finding lists `claims` among layout DB reads. (b) PRIMARY FIX IS NON-VIABLE: `unstable_cache(getOrgIdentity,...)` would throw at runtime because getOrgIdentity → getClient() → createClient() → cookies() (server.ts:26), and cookies() cannot be used inside unstable_cache. Only the finding's fallback (React cache() for intra-render dedup) is valid. (c) CAUSATION MIS-ATTRIBUTED: routes are inherently dynamic because every read uses a cookie-bound RLS client; force-dynamic is redundant, not the cause — removing it would not enable caching. (d) SEVERITY INFLATED: the 'cliff under real load / pooler limits' is purely projected. Live DB (project qpfnsselgwulrlmlandd): 14 marketers, 28 closure rows, 1 org, 7 memberships; all hit queries are well-indexed (closure_ancestor_depth, marketers_pkey, organizations_pkey, organizations_pkey). No current perf problem. The real, present issue is redundant per-render work (getCurrentClaims/getOwnerContext resolved repeatedly across functions in one render with no cache() dedup) = moderate tech debt, MEDIO not ALTO.

#### 51. Sequential data waterfalls that should be Promise.all (org page, genealogia, getMarketerProfile)

- **Gravità:** MEDIO  ·  **Priorità:** P2  ·  **Tipo:** perf  ·  **Confidence:** high  ·  **Verdetto verifica:** confirmed
- **Dimensione:** Next.js Architecture: RSC/CSR boundaries, Waterfalls, Caching
- **Dove:** web/app/(app)/org/page.tsx:38-41 (4 serial awaits); web/app/(app)/genealogia/page.tsx:23,29,31 (claims→root→subtree serial); web/lib/data/team.ts:130-138 (getNode then getNode(sponsor) serial); web/app/(app)/layout.tsx:32→47→61→64 (4 serial awaits)
- **Perché è un problema:** org/page.tsx awaits listOrgRoles() THEN listManageableCalls() THEN listOrgDocuments() THEN getOrgIdentity() — four independent reads run one-after-another instead of Promise.all, so total latency = sum, not max. (app)/layout.tsx similarly chains getCurrentClaims→getNode→listNotifications→getOrgIdentity serially (the last three are independent once claims resolve). genealogia chains getCurrentClaims→getRootMarketer→getSubtree where getRootMarketer ALSO calls getCurrentClaims again and runs fetchTeamCounts; getMarketerProfile (team.ts:130-138) does getNode(id) then a SECOND serial getNode(sponsor_id). Note team/[id] page DOES correctly use Promise.all (L70-86) — but it duplicates getNode (see separate finding).
- **Conseguenza reale:** On the org settings page, latency is roughly 4x a single round-trip instead of 1x. The (app) layout adds 3 serial round-trips to EVERY navigation. genealogia adds an extra serial root read + redundant claims read before the subtree RPC. Each unnecessary serialization adds a full network RTT to Supabase.
- **Come riprodurlo:** Instrument org/page.tsx data calls with timestamps; the four reads start sequentially (each awaits the prior) rather than concurrently.
- **Come risolverlo:** org/page.tsx: `const [roles, calls, docs, identity] = await Promise.all([...])` (gate admin-only ones with conditional). (app)/layout.tsx: resolve claims first, then Promise.all the independent getNode/listNotifications/getOrgIdentity. team.ts getMarketerProfile: the sponsor lookup can join in the original select or run in parallel after node resolves.
- **Impatto (scalabilità/sicurezza/performance):** perf: collapses additive multi-RTT latency to a single RTT on settings/genealogy/profile pages and the shared layout, improving TTFB proportionally to fan-out width.
- **Rischio futuro:** Each new independent read added to these pages by default gets appended as another serial await, so page latency creeps up linearly as features are added.
- **Nota verificatore:** not independently re-verified (MEDIO/BASSO)

#### 52. getNode() fetched 3-4x for a single /team/[id] view (metadata + page + profile + sponsor)

- **Gravità:** MEDIO  ·  **Priorità:** P2  ·  **Tipo:** perf  ·  **Confidence:** high  ·  **Verdetto verifica:** confirmed
- **Dimensione:** Next.js Architecture: RSC/CSR boundaries, Waterfalls, Caching
- **Dove:** web/app/(app)/team/[id]/page.tsx:45 (generateMetadata getNode), :66 (page body getNode), web/lib/data/team.ts:130 (getMarketerProfile getNode, called from page L83) and team.ts:136 (getNode for sponsor); each getNode = select + fetchTeamCounts (genealogy.ts:281) = 2 queries
- **Perché è un problema:** Rendering /team/[id] resolves the same node via getNode at least three times: once in generateMetadata (L45), once in the page body (L66), and again inside getMarketerProfile (team.ts:130) which is awaited in the page's Promise.all (L83). Plus getMarketerProfile fetches the sponsor node (team.ts:136). getNode is not cache()-wrapped, and each call also fires fetchTeamCounts (a closure-table aggregation query, genealogy.ts:100-125). So one profile view triggers ~4 getNode executions = ~8 Supabase queries for what is logically one row + its counts.
- **Conseguenza reale:** A single profile page view multiplies the marketers select and the closure-table count query 3-4x. The closure aggregation (fetchTeamCounts) is the expensive one and is run redundantly for the same id within one render.
- **Come riprodurlo:** Load /team/<id> with query logging; the marketers row select for that id appears in generateMetadata, the page, and getMarketerProfile, each followed by a marketer_tree_closure aggregation.
- **Come risolverlo:** Wrap getNode in React cache() (genealogy.ts) so all same-id calls within a request dedupe to one DB hit. generateMetadata + page + getMarketerProfile would then share a single fetch automatically.
- **Impatto (scalabilità/sicurezza/performance):** perf: ~75% reduction in queries for the profile hub (one of the most-visited pages), including the costly closure aggregation.
- **Rischio futuro:** Any new server component on the profile page that needs the node will add yet another uncached getNode; the multiplier only grows.
- **Nota verificatore:** not independently re-verified (MEDIO/BASSO)

#### 53. Middleware runs getUser() AND a second getSession() on a near-global matcher

- **Gravità:** MEDIO  ·  **Priorità:** P2  ·  **Tipo:** perf  ·  **Confidence:** high  ·  **Verdetto verifica:** confirmed
- **Dimensione:** Next.js Architecture: RSC/CSR boundaries, Waterfalls, Caching
- **Dove:** web/middleware.ts:122-124 (getUser), :137-140 (getSession), :157-159 (matcher matches everything except static assets)
- **Perché è un problema:** The matcher runs middleware on essentially every non-asset request. For every authenticated request it calls supabase.auth.getUser() (L124) — which validates/refreshes the token and may hit Supabase Auth — AND THEN, for the limited-view check, calls supabase.auth.getSession() (L140) to re-read the cookie and get the raw access_token for decodeJwtClaims(). getUser() has already populated the session internally, so the second getSession() reparses the cookies a second time. The limited-view JWT claims (app_role/rank) could be read from the token already available after getUser without a separate getSession round-trip.
- **Conseguenza reale:** Double session/cookie work on every page navigation, document, route — the hottest possible path at the Edge. getSession() after getUser() is redundant cookie parsing; on Edge this is per-request CPU paid for every asset-adjacent request the broad matcher catches.
- **Come riprodurlo:** Inspect middleware.ts: getUser() at L124 then getSession() at L140 both execute for any authenticated request matching the (very broad) matcher.
- **Come risolverlo:** After getUser(), read the access token from the already-loaded session via a single getSession() OR (better) call getSession() ONCE and derive both `user = session?.user` and `access_token` from it (getSession is sufficient here since RLS is the real boundary and the JWT is decoded locally anyway). Also tighten the matcher to only the protected/limited prefixes instead of the catch-all to skip middleware on truly public/non-app paths.
- **Impatto (scalabilità/sicurezza/performance):** perf: halves auth work in middleware on the highest-frequency code path; narrowing the matcher avoids running auth logic on requests that don't need it.
- **Rischio futuro:** Edge middleware cost is per-request and grows directly with traffic; the redundant call is a fixed tax on every navigation forever.
- **Nota verificatore:** not independently re-verified (MEDIO/BASSO)

#### 54. No error.tsx / not-found.tsx inside (app) route group — failures destroy the authenticated shell

- **Gravità:** MEDIO  ·  **Priorità:** P2  ·  **Tipo:** design  ·  **Confidence:** high  ·  **Verdetto verifica:** confirmed
- **Dimensione:** Next.js Architecture: RSC/CSR boundaries, Waterfalls, Caching
- **Dove:** Only web/app/error.tsx and web/app/not-found.tsx exist (glob confirms no (app)/error.tsx, no (app)/not-found.tsx); web/app/(app)/team/[id]/page.tsx:68 calls notFound(); web/app/error.tsx:13 renders min-h-screen full-screen
- **Perché è un problema:** There is exactly one error boundary (web/app/error.tsx) and one not-found (web/app/not-found.tsx), both at the root. The (app) group has no error.tsx and no not-found.tsx. When team/[id] calls notFound() (L68) or any (app) server component throws, the boundary that catches it is the ROOT one, which renders a standalone min-h-screen centered message (error.tsx:13) — REPLACING the entire AppShell (sidebar, topbar, nav). The user loses all navigation chrome and context on a single page's failure or a bad /team/<id> URL.
- **Conseguenza reale:** A non-existent or RLS-hidden marketer id (common: deep-linking, stale link, crossline id) triggers notFound() which nukes the whole app shell instead of showing a 'not found' inside the content area. Same for any transient page error — the user is dumped to a bare full-screen page with no way back except the link, harming perceived reliability of an otherwise resilient app.
- **Come riprodurlo:** Visit /team/<random-uuid>; getNode returns null → notFound() → root not-found.tsx renders full-screen, sidebar/topbar gone.
- **Come risolverlo:** Add web/app/(app)/error.tsx (client boundary) and web/app/(app)/not-found.tsx that render INSIDE the shell content area (the (app) layout wraps them), so errors/404s keep the sidebar/topbar. Optionally per-segment error.tsx for genealogia/team.
- **Impatto (scalabilità/sicurezza/performance):** design/reliability: keeps the app navigable on partial failure; aligns the otherwise demo-safe resilience strategy with the UI shell.
- **Rischio futuro:** As more deep-linkable [id] routes are added (percorso-prospect/[id], sette-perche/[id]), every notFound() will keep blowing away the shell until a group-level boundary exists.
- **Nota verificatore:** not independently re-verified (MEDIO/BASSO)

#### 55. ProspectDetail derives all editing state from props once; ignores fresh data after router.refresh()

- **Gravità:** MEDIO  ·  **Priorità:** P2  ·  **Tipo:** bug  ·  **Confidence:** medium  ·  **Verdetto verifica:** confirmed
- **Dimensione:** React Correctness: Hooks, Effects, Re-renders, Memory Leaks, State
- **Dove:** web/components/prospects/prospect-detail.tsx:55-65 (useState initializers from prospect/extra) + saveStage router.refresh() at :92
- **Perché è un problema:** savedStage, stage, profiling, pack, notes, savedExtra are all initialized from props via useState(prospect.x) / useState(extra.x). These initializers run only on mount. saveStage() calls router.refresh() (line 92) after a real write, which re-renders the RSC parent with new props — but the useState values do not re-sync to the new props, so the component keeps showing/comparing against the stale mounted values.
- **Conseguenza reale:** After a successful non-demo stage save, the server data updates but the detail card's 'savedExtra'/'savedStage' baseline can drift from the refreshed props. If the row was also changed elsewhere (or the refresh returns a normalized value), the dirty-comparison and displayed values are computed against stale state, producing a phantom-dirty UnsavedBar or stale displayed package/notes.
- **Come riprodurlo:** Open a prospect detail, change stage, Salva fase (non-demo). router.refresh() runs. Edit the same prospect's stage in another tab and refresh this one via the router — the local savedStage baseline does not update, so the UnsavedBar dirty logic compares against the original mount value.
- **Come risolverlo:** Either key the component by prospect.id at the parent so it remounts on data change, or add effects to re-sync saved* baselines when prospect.id / extra identity changes (useEffect resetting state on prop change), or lift the canonical state up.
- **Impatto (scalabilità/sicurezza/performance):** Correctness of the unsaved-changes guard and displayed values after refresh; moderate.
- **Rischio futuro:** Grows as more fields are added; classic derived-state-from-props trap.
- **Nota verificatore:** not independently re-verified (MEDIO/BASSO)

#### 56. Genealogy canvas rebuilds every node's data object on each selection, defeating React.memo

- **Gravità:** MEDIO  ·  **Priorità:** P2  ·  **Tipo:** perf  ·  **Confidence:** high  ·  **Verdetto verifica:** confirmed
- **Dimensione:** React Correctness: Hooks, Effects, Re-renders, Memory Leaks, State
- **Dove:** web/components/genealogy/genealogy-canvas.tsx:184-207 (toFlow useMemo depends on selectedId) + :98-117 (per-node data with selected) ; web/components/genealogy/marketer-node.tsx:240 (React.memo)
- **Perché è un problema:** toFlow maps EVERY positioned node into a fresh data object that embeds `selected: ctx.selectedId === p.node.id`. The toFlow useMemo lists selectedId as a dependency, so a single click recomputes rfNodes for the WHOLE tree, handing every MarketerNode a brand-new data object reference. MarketerNode is React.memo'd, but the data prop identity changes for all nodes, so all of them re-render on every selection. Same pattern re-creates all node data when `expanded`/`animate` change.
- **Conseguenza reale:** On a large expanded tree, every click in the detail panel / every select re-renders all node cards (each renders avatars, badges, KPI cells). With onlyRenderVisibleElements this is bounded to the viewport, but during pan + selection on big trees it is wasteful and can drop frames — precisely the 'performance cliff under real load' case the perf threshold tries to avoid.
- **Come riprodurlo:** Expand a large subtree (hundreds of nodes), open React DevTools profiler, click different nodes — every visible MarketerNode re-renders on each selection despite React.memo.
- **Come risolverlo:** Pass selectedId (or a per-node selected boolean derived inside the node from a context/zustand) without baking it into each node's data object — e.g. keep node.data stable and let React Flow's own `selected` (it already sets node.selected) drive selection styling (MarketerNodeImpl already reads rfSelected). Memoize the marketer data objects per node id so only the (de)selected nodes change identity.
- **Impatto (scalabilità/sicurezza/performance):** Performance on large genealogies; the very screen designed to scale.
- **Rischio futuro:** Worsens linearly with tree size; the PERF_THRESHOLD chrome-dropping does not address per-node re-render churn.
- **Nota verificatore:** not independently re-verified (MEDIO/BASSO)

#### 57. Modal has no focus trap and no focus restore on close

- **Gravità:** MEDIO  ·  **Priorità:** P2  ·  **Tipo:** bug  ·  **Confidence:** high  ·  **Verdetto verifica:** confirmed
- **Dimensione:** React Correctness: Hooks, Effects, Re-renders, Memory Leaks, State
- **Dove:** web/components/ui/modal.tsx:43-57 (effect: only Escape + body lock, no focus management)
- **Perché è un problema:** The Modal sets aria-modal="true" but never moves focus into the dialog on open, never traps Tab within it, and never restores focus to the trigger on close. Tab keeps cycling through the underlying page behind the backdrop. This hosts the Anagrafica editor (anagrafica-modal.tsx) and other 'personal file' surfaces. FormSheet (the sibling overlay) at least auto-focuses its first field; Modal does neither.
- **Conseguenza reale:** Keyboard and screen-reader users can Tab out of the modal into the obscured page content, and focus is lost after close (jumps to body). This is an accessibility correctness defect for an aria-modal dialog and a focus-management bug.
- **Come riprodurlo:** Open the Anagrafica modal, press Tab repeatedly — focus leaves the dialog and lands on links/buttons behind the backdrop. Close the modal — focus is not returned to the 'Anagrafica' trigger button.
- **Come risolverlo:** On open: store document.activeElement, move focus to the dialog (or first focusable), and add a keydown Tab handler that cycles focus within the panel. On close/unmount: restore focus to the saved element. Consider reusing one shared dialog primitive for Modal + FormSheet.
- **Impatto (scalabilità/sicurezza/performance):** Accessibility / keyboard correctness for all modal-hosted editors.
- **Rischio futuro:** Accessibility debt that compounds as more flows move into modals.
- **Nota verificatore:** not independently re-verified (MEDIO/BASSO)

#### 58. WishlistManager ignores updated initialItems prop after the parent RSC refreshes

- **Gravità:** MEDIO  ·  **Priorità:** P3  ·  **Tipo:** bug  ·  **Confidence:** medium  ·  **Verdetto verifica:** confirmed
- **Dimensione:** React Correctness: Hooks, Effects, Re-renders, Memory Leaks, State
- **Dove:** web/components/team/wishlist-manager.tsx:42 (useState(initialItems)) — rendered via PersonalFiles in team/[id]/page.tsx
- **Perché è un problema:** items state is seeded once from initialItems with no effect to re-sync when the prop changes. The parent page is force-dynamic and PersonalFiles can re-render with fresh wishlistRes.items (e.g. after navigation back, or a sibling save triggering re-fetch). The local items array silently shadows the new server data.
- **Conseguenza reale:** If the wishlist changes server-side (or the user navigates away and back within a cached client tree), the displayed list / completion % can be stale relative to the DB until a hard reload.
- **Come riprodurlo:** Edit wishlist, navigate to another marketer and back (client nav reuse), or have the row updated elsewhere — the local items state persists the old snapshot.
- **Come risolverlo:** Add useEffect resetting items when initialItems identity changes, or key the component by marketerId so it remounts per profile, or treat the server row as the source of truth and reconcile.
- **Impatto (scalabilità/sicurezza/performance):** Stale UI vs server; moderate-low (mostly own-profile editing).
- **Rischio futuro:** Same derived-state pattern repeated across editors (also ProspectDetail).
- **Nota verificatore:** not independently re-verified (MEDIO/BASSO)

#### 59. Overlays declare aria-modal but implement no focus trap or focus restoration (WCAG 2.4.3 / 2.1.2)

- **Gravità:** MEDIO  ·  **Priorità:** P1  ·  **Tipo:** design  ·  **Confidence:** high  ·  **Verdetto verifica:** confirmed
- **Dimensione:** SEO, Metadata, Accessibility & Mobile Responsiveness
- **Dove:** web/components/ui/modal.tsx:43-108 (no focus move at all); web/components/crm/form-sheet.tsx:47-64; web/components/crm/confirm-dialog.tsx:42-55; web/components/shell/mobile-nav.tsx:40-53
- **Perché è un problema:** All four are custom dialogs (no Radix) with role=dialog/alertdialog + aria-modal='true'. They wire Escape + body-scroll-lock but never confine Tab order to the dialog and never restore focus to the trigger on close. Modal additionally never moves focus INTO the dialog on open (no ref, no autofocus) — only FormSheet and ConfirmDialog focus a first/confirm element. With aria-modal=true, AT hides background content, but the DOM focus order still lets Tab/Shift+Tab walk into the visually-hidden, inert-but-focusable page behind the scrim.
- **Conseguenza reale:** Keyboard and screen-reader users can Tab out of an open modal into background controls they can't see (the scrim only blocks the mouse), interact with hidden actions, and on close focus is dumped to <body> (lost context). For Modal specifically, opening it leaves focus on the trigger behind the overlay — a sighted-keyboard user must blindly Tab to reach the dialog. This is a core WCAG 2.1 AA failure for every create/edit/confirm/delete flow and the mobile menu.
- **Come riprodurlo:** Open any FormSheet (e.g. 'Nuovo prospect'), the Modal (7 Perché / Anagrafica), a ConfirmDialog (delete prospect), or the mobile drawer; press Tab repeatedly — focus leaves the dialog and lands on topbar/sidebar/page controls behind the scrim. Close the dialog — focus does not return to the opener.
- **Come risolverlo:** Add a shared focus-trap: on open, store document.activeElement, move focus to the first focusable (or the dialog container with tabIndex=-1), intercept Tab/Shift+Tab to cycle within the panel, and on cleanup restore focus to the stored element. Easiest: adopt Radix Dialog (already a dep family) or focus-trap-react for all four primitives.
- **Impatto (scalabilità/sicurezza/performance):** Accessibility: systemic WCAG 2.1 AA failure across every modal/sheet/dialog and the mobile nav; legal/procurement risk for any B2B sale requiring accessibility conformance.
- **Rischio futuro:** Every new dialog copies this broken pattern (4 already do), so the defect multiplies; retrofitting later means touching all overlays at once.
- **Nota verificatore:** Independently verified by reading all four cited files. The technical claims are accurate:

1) No focus trap in any of the four. The only keydown handlers are Escape-only: modal.tsx:45-47, form-sheet.tsx:49-51, confirm-dialog.tsx:45-47, mobile-nav.tsx:43-45. None intercept Tab/Shift+Tab, none apply `inert`/`tabindex` to background, so DOM tab order falls through to topbar/sidebar/page behind the scrim. Scrims are aria-hidden/pointer-event-only divs (modal.tsx:62-65, form-sheet.tsx:71-74, confirm-dialog.tsx:72-75, mobile-nav.tsx:61-67) and do not remove background focusability.

2) No focus restoration on close in any of the four. No component captures document.activeElement on open; every cleanup (modal.tsx:51-54, form-sheet.tsx:60-63, confirm-dialog.tsx:51-54, mobile-nav.tsx:49-52) only removes the listener and restores body.style.overflow. Focus is dumped to <body> on close.

3) Modal moves focus nowhere on open: modal.tsx:43-55 has no ref/.focus()/autoFocus; the panel div (66-76) has no tabIndex/ref. mobile-nav.tsx:41-53 likewise has no focus move. The finding correctly distinguishes these from FormSheet (form-sheet.tsx:56-59 focuses first focusable) and ConfirmDialog (confirm-dialog.tsx:44 focuses confirmRef).

4) Confirmed no mitigation exists: package.json (lines 12-38) has no @radix-ui, no focus-trap/focus-trap-react; grep shows no FocusScope/inert/focus-trap usage anywhere in web/. All four carry aria-modal="true" (modal.tsx:68, form-sheet.tsx:78, confirm-dialog.tsx:78, mobile-nav.tsx:72). These primitives are used in 20 files across every CRM flow, so the systemic-scope claim holds.

Caveats reducing severity vs the original ALTO: (a) one WCAG mis-citation — 2.1.2 'No Keyboard Trap' is the inverse of this defect (it concerns being unable to leave); the actual failures are SC 2.4.3 Focus Order and the WAI-ARIA dialog authoring pattern. The substance is correct regardless. (b) This is an accessibility/compliance defect with NO security, data-loss, auth-bypass, or outage impact; mouse users are unaffected and aria-modal does hide background from AT, so the worst case is degraded keyboard/SR navigation, not a functional block. Under this rubric's security/data/perf-weighted bar, MEDIO ('real bug / notable tech debt with moderate impact') fits better than ALTO, though the systemic scope keeps it a legitimate, real finding.

#### 60. Title template has no %s placeholder — every page tab shows the same literal "PowerNetwork", making all per-page generateMetadata dead code

- **Gravità:** MEDIO  ·  **Priorità:** P2  ·  **Tipo:** bug  ·  **Confidence:** high  ·  **Verdetto verifica:** confirmed
- **Dimensione:** SEO, Metadata, Accessibility & Mobile Responsiveness
- **Dove:** web/app/layout.tsx:20-23 (title.template = 'PowerNetwork'); dead consumers: web/app/(app)/dashboard/page.tsx:25-28, web/app/(app)/team/[id]/page.tsx:40-47, and ~22 more generateMetadata in web/app/(app)/**/page.tsx
- **Perché è un problema:** In Next.js App Router, a `title.template` is interpolated via `%s`. With template = 'PowerNetwork' (no `%s`), every child page's resolved title is *discarded* and replaced by the literal template. So `generateMetadata` returning `{ title: t('title') }` or the marketer's display_name has zero effect on the rendered <title>.
- **Conseguenza reale:** Browser tab, history entries, bookmarks, pinned tabs and screen-reader page-title announcements are identical ('PowerNetwork') on every route. With ~12+ tabs open (a CRM is a multi-tab tool) users cannot distinguish Dashboard from a specific marketer profile. Roughly 25 generateMetadata functions run on every request producing output that is thrown away (wasted RSC work).
- **Come riprodurlo:** Run the app, open /dashboard then /team/<id>; observe the document.title stays 'PowerNetwork' both times. The code comment at web/app/layout.tsx:17-19 explicitly acknowledges 'the tab never changes when navigating'.
- **Come risolverlo:** Set `title: { default: 'PowerNetwork', template: '%s · PowerNetwork' }` in web/app/layout.tsx so page titles interpolate; pages already supply the segment. If a fixed tab is genuinely desired, delete the ~25 generateMetadata functions instead of running dead code.
- **Impatto (scalabilità/sicurezza/performance):** Usability/SEO: page identity is lost across the whole app; minor wasted per-request compute on every navigation.
- **Rischio futuro:** Compounds as routes grow — every new page adds another no-op generateMetadata, and devs keep authoring titles that silently do nothing, eroding trust in the metadata layer.
- **Nota verificatore:** not independently re-verified (MEDIO/BASSO)

#### 61. Kanban card nests interactive Link + buttons inside a dnd-kit role=button drag surface (invalid nested interactive content)

- **Gravità:** MEDIO  ·  **Priorità:** P2  ·  **Tipo:** design  ·  **Confidence:** high  ·  **Verdetto verifica:** confirmed
- **Dimensione:** SEO, Metadata, Accessibility & Mobile Responsiveness
- **Dove:** web/components/prospects/prospect-card.tsx:222-265 (root spreads {...attributes}{...listeners} → role='button' tabIndex=0) wrapping ProspectCardBody children: detail <Link> (99-109), enroll/delete <button> (110-140) and full-card <Link> (254-262)
- **Perché è un problema:** @dnd-kit's useSortable `attributes` set role='button' and tabIndex=0 on the card root. Inside that button the card renders a navigation Link plus enroll/delete buttons plus a full-area overlay Link. HTML forbids interactive content inside a button; ARIA forbids focusable descendants inside role='button'. The nested overlay Link has tabIndex=-1, but the visible icon buttons and detail Link are real Tab stops nested inside the role=button.
- **Conseguenza reale:** Ambiguous semantics for screen readers (a 'button' that contains a link and more buttons), unreliable Enter/Space handling (the drag-button vs nested controls), and a confusing keyboard tab sequence on the board. The native drag keyboard activation (Space to lift) collides with nested-control activation. Degraded but not fully broken — cards remain partially operable.
- **Come riprodurlo:** Tab onto a prospect card on the kanban; note focus lands on the role=button card AND its nested Apri/Iscritto/Elimina controls; SR announces a button containing a link and buttons. Validate with axe-core: 'Interactive controls must not be nested'.
- **Come risolverlo:** Move dnd-kit `listeners`/`attributes` onto a dedicated drag handle (the existing GripVertical span) instead of the whole card root, so the card container is a plain region and the Link/buttons are top-level interactive siblings. This also fixes the click-vs-drag ambiguity cleanly.
- **Impatto (scalabilità/sicurezza/performance):** Accessibility: invalid ARIA/HTML nesting on the primary prospect workflow; degraded keyboard DnD.
- **Rischio futuro:** As more per-card actions are added inside the drag surface, the nesting conflict worsens and keyboard DnD becomes more fragile.
- **Nota verificatore:** not independently re-verified (MEDIO/BASSO)

#### 62. updateContact / updateListaContatti / saveVersion / archiveDocument return MOCK 'merged' row as the saved data on real DB error

- **Gravità:** MEDIO  ·  **Priorità:** P2  ·  **Tipo:** bug  ·  **Confidence:** high  ·  **Verdetto verifica:** confirmed
- **Dimensione:** Server Actions, Data Layer Correctness, Transactions & Resilience
- **Dove:** web/lib/data/contacts.ts:194-218 (merged from MOCK 199-201); web/lib/data/lista-contatti.ts:145-167 (merged from MOCK 150-152); web/lib/data/documents.ts:168-212 & 270-302
- **Perché è un problema:** On a configured-but-failed UPDATE these return {data: merged, demo:false, ok:false} where 'merged' is built from the in-memory MOCK_* fixture (or null if the id isn't in the mock — which it never is for real rows) merged with the patch. ok:false is set, but the action envelopes still hand 'merged' back as the entry/contact/document. If the client renders the returned row on a non-blocking failure (or ignores ok), it shows fabricated mock-derived data instead of the true DB state.
- **Conseguenza reale:** On a real save failure the UI can display a row that does not match the database (fields from a mock fixture, or a stale optimistic merge). Inconsistent state until a hard refresh; the user may believe an edit stuck.
- **Come riprodurlo:** Configured env; force an UPDATE error (e.g. invalid enum value for status). updateContact returns ok:false but data=merged (mock + patch); a client that patches local state from data shows wrong values.
- **Come risolverlo:** On ok:false in the live path, return data:null (or the unchanged prior server row), never a mock-derived object. Keep optimistic rollback purely client-side keyed on ok:false.
- **Impatto (scalabilità/sicurezza/performance):** UI/DB divergence on failures; erodes trust and complicates debugging.
- **Rischio futuro:** Grows as fixtures drift from the real schema; mock-shaped objects can carry fields/values impossible in prod.
- **Nota verificatore:** not independently re-verified (MEDIO/BASSO)

#### 63. Read-modify-write on organizations.settings (theme + bottleneck) is racy — concurrent admin saves clobber each other

- **Gravità:** MEDIO  ·  **Priorità:** P2  ·  **Tipo:** bug  ·  **Confidence:** high  ·  **Verdetto verifica:** confirmed
- **Dimensione:** Server Actions, Data Layer Correctness, Transactions & Resilience
- **Dove:** web/lib/data/org-theme.ts:44-66 (read 50-54, write 58-61); web/lib/data/admin.ts:364-400 (read 379-383, write 388-395)
- **Perché è un problema:** Both saveOrgTheme and updateOrgSettings do SELECT settings → spread in JS → UPDATE settings. There is no row lock or jsonb merge in SQL. Two concurrent admin saves (e.g. one changing theme, one changing bottleneck) each read the old blob and write back their merged copy; the later write overwrites the earlier one's key. Last-writer-wins silently drops the other change.
- **Conseguenza reale:** An admin's settings change (theme or bottleneck thresholds) can silently vanish when another admin saves concurrently. Both got success toasts.
- **Come riprodurlo:** Two admins: A saves theme, B saves bottleneck, both reading before either writes. Final settings contains only whichever UPDATE committed last; the other key reverts.
- **Come risolverlo:** Use a single SQL jsonb merge (settings = settings || jsonb_build_object('theme', ...)) so the DB merges atomically, or SELECT ... FOR UPDATE within an RPC. Avoid read-modify-write of JSONB across a round trip.
- **Impatto (scalabilità/sicurezza/performance):** Lost config writes under concurrent admin activity; low frequency but silent.
- **Rischio futuro:** More settings keys = more collisions; debugging 'my setting reverted' is hard.
- **Nota verificatore:** not independently re-verified (MEDIO/BASSO)

#### 64. No retries/timeouts on external auth-admin and Edge-Function calls; transient failures become unmasked partial state

- **Gravità:** MEDIO  ·  **Priorità:** P2  ·  **Tipo:** tech_debt  ·  **Confidence:** medium  ·  **Verdetto verifica:** confirmed
- **Dimensione:** Server Actions, Data Layer Correctness, Transactions & Resilience
- **Dove:** web/lib/data/account.ts:124-150 (createUser, deleteUser), 61-67 (deleteUser in revoke); admin-invitations.ts:102-115 (functions.invoke); genealogia/actions.ts:129 (activateCrmAccess in the create flow)
- **Perché è un problema:** Calls to admin.auth.admin.createUser/deleteUser and functions.invoke have no timeout and no retry. A transient timeout on createUser that actually created the user but failed the client response would leave an orphan auth user (the membership upsert never runs). A failure on the compensating deleteUser (account.ts:148) leaves an orphaned auth user with no membership. revokeAccountForMarketer deletes the membership first then the auth user (61-67); if deleteUser fails after the membership row is gone, the user can no longer be located via memberships to retry deletion — a permanently orphaned, still-loginable auth user (though now without an active membership row).
- **Conseguenza reale:** Intermittent Auth API hiccups create orphaned auth users (login still works until membership/JWT checks bite) or block clean revocation, with the demo-safe layer masking the failure. No automatic recovery.
- **Come riprodurlo:** Simulate a slow/failing GoTrue admin endpoint during activateCrmAccess: createUser succeeds server-side but the response errors → returns email_taken; outer rollback soft-deletes marketer but the auth user persists.
- **Come risolverlo:** Add bounded timeouts + idempotent retry (or look up by email before create to make createUser idempotent); in revoke, delete the auth user before (or independently of) the membership row, and verify deletion; log failures loudly rather than swallowing.
- **Impatto (scalabilità/sicurezza/performance):** Auth hygiene + orphaned-credential risk; aggravated by the silent error handling elsewhere.
- **Rischio futuro:** Orphaned auth users accumulate and can become a re-auth/security audit problem.
- **Nota verificatore:** not independently re-verified (MEDIO/BASSO)

#### 65. accept_invitation() trusts caller-supplied p_user_id instead of binding the membership to auth.uid()

- **Gravità:** MEDIO  ·  **Priorità:** P1  ·  **Tipo:** security  ·  **Confidence:** medium  ·  **Verdetto verifica:** confirmed
- **Dimensione:** Supabase RLS & DB Function Security (live)
- **Dove:** public.accept_invitation(p_token_hash text, p_user_id uuid) — SECURITY DEFINER, GRANT EXECUTE to authenticated
- **Perché è un problema:** The function creates/activates a membership with user_id = p_user_id taken verbatim from the argument; it never checks p_user_id = auth.uid(). It is SECURITY DEFINER (bypasses RLS) and EXECUTE-able by any authenticated user (and listed in advisors as authenticated_security_definer_function_executable). The only gate is knowledge of a valid pending token_hash (token_hash is UNIQUE, and invitation_context() — granted to anon — confirms validity and leaks the target email/role/org for any token_hash).
- **Conseguenza reale:** Whoever can call this with a valid pending token can bind that org's membership/role to an arbitrary user id (including their own), i.e. claim an invitation that was issued for someone else and grant themselves access/role in that org. The auth binding relies entirely on token-hash secrecy with no caller-identity check.
- **Come riprodurlo:** As an authenticated user, obtain or guess a pending token_hash (invitation_context(token_hash) as anon confirms targets), then call rpc accept_invitation(token_hash, '<attacker-auth-uid>'). A membership row is inserted for that user_id in the invitation's org with the invitation's role — no check ties it to the caller.
- **Come risolverlo:** Inside accept_invitation, require p_user_id = auth.uid() (or drop the parameter and use auth.uid() directly), and verify the authenticated email matches the invitation email. Restrict the raw token to the edge function and ensure tokens are high-entropy.
- **Impatto (scalabilità/sicurezza/performance):** Authorization/privilege weakness in the account-activation path; potential unauthorized org access.
- **Rischio futuro:** Self-service signup flows that pass user ids client-side will silently make this exploitable; any token leakage (logs, URLs) becomes a full account-claim.
- **Nota verificatore:** The core technical claim is TRUE and verified against the live DB (project qpfnsselgwulrlmlandd), but the ALTO severity is inflated by an infeasible repro and an overstated leak claim.\n\nVERIFIED TRUE:\n- accept_invitation(p_token_hash, p_user_id) is SECURITY DEFINER and inserts user_id = p_user_id verbatim with NO auth.uid() / email binding. Live pg_get_functiondef matches supabase/migrations/0007_account_lifecycle.sql lines 304-407 (INSERT ... VALUES (v_inv.org_id, p_user_id, ...) at lines 375-376; ON CONFLICT ... SET user_id = EXCLUDED.user_id at line 378). The only gates are token_hash match + status='pending' + not expired.\n- EXECUTE is granted to authenticated (live aclexplode: authenticated, postgres, service_role have EXECUTE on accept_invitation; migration line 534).\n- No DB-layer backstop: pg_trigger/pg_constraint on public.memberships show only audit + updated_at triggers and FK/unique constraints (memberships_org_marketer_uq, user_id_fkey) -- nothing binds user_id to the invitation email.\n- Impact is real: custom_access_token_hook (live) derives org_id/marketer_id/app_role/rank/crm_access/membership_status straight from the memberships row keyed by user_id, so binding a membership to your own uid yields a working JWT with that org/role on next refresh.\n\nOVERSTATED / REFUTED:\n- The repro 'obtain or guess a pending token_hash' is infeasible to guess: tokens are 256-bit CSPRNG (supabase/functions/_shared/token.ts lines 7-11, crypto.getRandomValues(32 bytes)), stored only as SHA-256. Brute-force/enumeration is not viable.\n- 'invitation_context leaks the target ... for any token_hash' is wrong: live def (migration 0021 lines 26-54) filters status='pending' AND expires_at>now() and is keyed by the secret hash, so it confirms/leaks only for a hash you ALREADY possess -- it does not provide a token to an attacker, just amplifies an already-leaked one.\n- The normal write path is the service-role activate-account edge function (supabase/functions/activate-account/index.ts), which an arbitrary authenticated user cannot drive with attacker-chosen p_user_id without holding the raw token.\n\nRESIDUAL (genuine) RISK that justifies MEDIO not BASSO: a party who legitimately holds a valid raw token (the intended invitee, or anyone the token leaked to via URL/logs/forwarded email) can bind the org membership/role to an ARBITRARY user_id instead of the invited email -- a real authorization/defense-in-depth gap. The proper fix (require p_user_id = auth.uid() and verify email match) is correct. But exploitability is fully gated behind token secrecy with no enumeration path, so this is MEDIO, not ALTO.

#### 66. log_audit() lets any authenticated member forge arbitrary audit-log entries in their own org

- **Gravità:** MEDIO  ·  **Priorità:** P2  ·  **Tipo:** security  ·  **Confidence:** high  ·  **Verdetto verifica:** confirmed
- **Dimensione:** Supabase RLS & DB Function Security (live)
- **Dove:** public.log_audit(p_action audit_action, p_entity_type text, p_entity_id uuid, p_before jsonb, p_after jsonb, p_ip_address inet) — SECURITY DEFINER, GRANT EXECUTE to authenticated
- **Perché è un problema:** audit_log has zero INSERT policies and authenticated has no INSERT table grant, so the table is meant to be append-only-by-trusted-paths. But log_audit is SECURITY DEFINER and EXECUTE-able by authenticated; it inserts with org_id=current_org_id() and actor=current_marketer_id() but otherwise writes every other column (action enum, entity_type, entity_id, before, after, ip_address) directly from caller-controlled arguments with no validation. deny_audit_mutation only blocks UPDATE/DELETE, not these injected INSERTs.
- **Conseguenza reale:** A non-admin member can fabricate audit records (e.g. fake 'rank.change'/'account.activate' entries, arbitrary entity_ids, attacker-chosen before/after JSON, spoofed ip_address) attributed to themselves, polluting/forging the org audit trail that admins rely on for investigations and compliance.
- **Come riprodurlo:** Authenticate as a member, call rpc log_audit('rank.change','marketers','<any-uuid>','{"rank":"executive"}','{"rank":"global_director"}','1.2.3.4'). Row is inserted into audit_log for the caller's org with all caller-supplied content.
- **Come risolverlo:** Revoke EXECUTE on log_audit from authenticated (let only service_role/triggers write audit rows), or constrain it to admins, or strip/override caller-supplied ip_address and validate entity_type/entity_id against the actor's permissions.
- **Impatto (scalabilità/sicurezza/performance):** Undermines integrity/trustworthiness of the audit subsystem; enables log spoofing and noise.
- **Rischio futuro:** If audit_log is later used for security alerting, billing, or legal evidence, forged entries become a real liability.
- **Nota verificatore:** not independently re-verified (MEDIO/BASSO)

#### 67. SECURITY DEFINER trigger functions are directly EXECUTE-able as RPC by anon/authenticated

- **Gravità:** MEDIO  ·  **Priorità:** P2  ·  **Tipo:** security  ·  **Confidence:** high  ·  **Verdetto verifica:** confirmed
- **Dimensione:** Supabase RLS & DB Function Security (live)
- **Dove:** public.audit_trigger(), marketers_after_insert_tree(), marketers_after_move_tree(), marketers_rank_history_sync(), guard_marketer_structural_cols(), account_invitations_eligibility_guard(), documents_snapshot_version(), calls_touch_last_interaction() — all SECURITY DEFINER, EXECUTE granted to anon and/or authenticated (advisors anon/authenticated_security_definer_function_executable)
- **Perché è un problema:** These are trigger functions meant to run only in trigger context, but they are exposed at /rest/v1/rpc/<name> to anon/authenticated. They run as the (privileged) owner and bypass RLS. marketers_after_insert_tree / marketers_after_move_tree write directly to marketer_tree_closure and mutate marketers.path. Most reference NEW/OLD/TG_OP which are NULL/undefined when invoked directly (so they typically error on NOT-NULL/PK constraints rather than corrupting data), but exposing RLS-bypassing, closure-mutating functions to anon is an unnecessary and fragile attack surface.
- **Conseguenza reale:** Increased attack surface: any change to these functions that makes them tolerate NULL NEW/OLD could let an unauthenticated caller mutate the genealogy closure or marketer paths bypassing RLS. Even today they are probing/DoS targets and a defense-in-depth failure.
- **Come riprodurlo:** curl -X POST <project>/rest/v1/rpc/marketers_after_insert_tree (anon apikey) reaches the function; it executes as owner (SECURITY DEFINER) and only fails at the constraint layer, not at an authorization layer.
- **Come risolverlo:** REVOKE EXECUTE ... FROM PUBLIC, anon, authenticated on all trigger functions (triggers still fire via the table owner). Adopt a default-deny grant policy and explicitly grant EXECUTE only to roles that must call genuine RPCs.
- **Impatto (scalabilità/sicurezza/performance):** Defense-in-depth gap around the most integrity-sensitive subsystem (binary-tree closure) and the audit/eligibility guards.
- **Rischio futuro:** A future refactor that null-guards NEW/OLD (a common 'make it callable' change) silently converts this into an RLS-bypass write primitive.
- **Nota verificatore:** not independently re-verified (MEDIO/BASSO)

#### 68. Enum drift: TS MarketerStatus has 2 values, DB marketer_status enum has 4 (pending, suspended unrepresented)

- **Gravità:** MEDIO  ·  **Priorità:** P2  ·  **Tipo:** design  ·  **Confidence:** high  ·  **Verdetto verifica:** confirmed
- **Dimensione:** TypeScript Soundness & Input Validation
- **Dove:** web/lib/types/db.ts:190 (export type MarketerStatus = 'active' | 'inactive'); DB enum marketer_status = {active, inactive, pending, suspended}; consumers: web/lib/data/genealogy.ts:84 + admin.ts:66
- **Perché è un problema:** Verified via pg_enum: marketer_status = active, inactive, pending, suspended (migration 0002_enums.sql:62-67 created it with all 4; `pending` is documented as 'pre-registered profile'). The TS union only declares 2. Row mappers cast blindly: genealogy.ts toTreeNode does `status: row.status` typed as MarketerStatus and then `activity: row.status === 'active' ? 'cold' : 'dormant'`; admin.ts rowToAdminMarketer does `status: r.status as MarketerStatus`. A real row with status 'pending' or 'suspended' is force-typed into a union it doesn't belong to.
- **Conseguenza reale:** Any marketer whose DB status is 'pending' or 'suspended' is silently rendered as 'dormant' in the genealogy tree (genealogy.ts:84) and mislabeled by STATUS_LABELS (db.ts:192, which only maps active→Attivo / inactive→Scaduto — a 'pending'/'suspended' value yields `undefined` label → blank badge). Filtering by status in the admin registry (admin.ts:84-86) can never match these states. TS gives false confidence that exhaustive switches over MarketerStatus are complete.
- **Come riprodurlo:** Insert/observe a marketers row with status='pending'. In /genealogia it shows the 'dormant' health badge; STATUS_LABELS['pending'] is undefined → empty status pill.
- **Come risolverlo:** Extend the TS union to `'active' | 'inactive' | 'pending' | 'suspended'` and add STATUS_LABELS entries, OR if pending/suspended are deliberately not surfaced, narrow with a runtime guard in the mapper (e.g. `status: row.status === 'active' ? 'active' : 'inactive'`) instead of a blind cast, and document the collapse.
- **Impatto (scalabilità/sicurezza/performance):** Data-integrity / correctness: states exist in the DB that the UI cannot represent; misleads operators about a member's real lifecycle state.
- **Rischio futuro:** New statuses added to the DB enum (already happened once) will keep silently collapsing to 'dormant'/blank with no compile error because of the `as MarketerStatus` cast.
- **Nota verificatore:** not independently re-verified (MEDIO/BASSO)

#### 69. DB rows read as Record<string, unknown> then String()/Number()/as-Enum coerced — null/missing columns hide schema mismatches

- **Gravità:** MEDIO  ·  **Priorità:** P2  ·  **Tipo:** tech_debt  ·  **Confidence:** high  ·  **Verdetto verifica:** confirmed
- **Dimensione:** TypeScript Soundness & Input Validation
- **Dove:** web/lib/data/admin.ts:52-74,110-112,130-137,255-267,298-308,328-341; web/lib/data/reports.ts:45-65,82-97,119-130; web/lib/data/roles.ts:43-52; web/lib/data/notifications.ts:108-122
- **Perché è un problema:** Mappers select columns then treat the result as `Record<string, unknown>` and coerce field-by-field with `String(r.x ?? '')`, `Number(r.x ?? 0)`, and `r.rank as MarketerRank`. This defeats the type system at the exact boundary where it matters. `Number(undefined)` from a missing/renamed column = NaN (reports.ts:47 toPayload `n('calls_total')` returns NaN if the jsonb key is absent or non-numeric); `String(undefined)` would yield 'undefined' but is guarded with `?? ''` in most spots — yet `created_at: String(r.created_at ?? '')` produces '' (an invalid date string) silently when the column is null/renamed. Enum casts (`r.rank as MarketerRank`, `r.status as ExportJob['status']`, `r.action as AuditAction`) accept ANY string with no membership check.
- **Conseguenza reale:** A renamed/typo'd select column or a null jsonb metrics value yields NaN/empty-string/'undefined' propagated into typed objects with no error — e.g. reports.ts MetricsPayload fields become NaN and flow into delta/percentage math and charts (NaN%); admin.ts created_at='' breaks date sorting/formatting. Enum casts let a future DB value the TS union doesn't know about pass straight into label-lookup maps (RANK_LABELS[badRank] → undefined → blank UI).
- **Come riprodurlo:** In reports.ts toPayload, if monthly_reports.metrics jsonb is `{}` (no keys) — which is the documented fallback shape — every field becomes Number(undefined)=NaN; the report card then renders NaN values and NaN deltas.
- **Come risolverlo:** Generate Supabase types (`generate_typescript_types`) and type the `.select()` result instead of `Record<string, unknown>`. For coercion, replace `Number(r.x ?? 0)` with `Number.isFinite(Number(r.x)) ? Number(r.x) : 0`, and replace `as SomeEnum` with a runtime membership check against the canonical *_ORDER arrays (fallback to a safe default like asRank() already does in session.ts).
- **Impatto (scalabilità/sicurezza/performance):** Correctness/observability: silent NaN/empty values in analytics & reporting; enum-drift bugs become invisible until a user sees a blank label.
- **Rischio futuro:** Column renames during refactors produce no compile error and no runtime exception — the worst class of silent data bug.
- **Nota verificatore:** not independently re-verified (MEDIO/BASSO)

#### 70. MutationResult typed as { data: T } but returns optimistic placeholder on failure (ok:false) and `as Contact`/`as Call` casts of unvalidated DB rows

- **Gravità:** MEDIO  ·  **Priorità:** P2  ·  **Tipo:** bug  ·  **Confidence:** high  ·  **Verdetto verifica:** confirmed
- **Dimensione:** TypeScript Soundness & Input Validation
- **Dove:** web/lib/data/contacts.ts:186-190,210-214; web/lib/data/calls.ts:150-153; web/lib/data/prospects.ts:207-210; return type web/lib/data/crm-shared.ts:31-36
- **Perché è un problema:** MutationResult<T> declares `data: T` non-null. On a real failed write the functions return `{ data: optimistic, demo: false, ok: false }` — i.e. the type says you got the persisted row, but you actually got a client-fabricated optimistic object with a fake `demoId('ct')` id that does NOT exist in the DB. Successful reads cast the raw PostgREST response with `data as Contact` / `data as Call` / `data as Prospect` (contacts.ts:187, calls.ts:151) with no validation that the shape matches.
- **Conseguenza reale:** Callers that read `result.data` after `ok:false` (the type encourages this) get a phantom row with a non-existent id; any follow-up update/delete keyed on that id silently no-ops (eq('id', fakeId) matches nothing) while the UI shows the item as saved. The `as Contact` casts mean a column drift in SELECT silently produces a malformed Contact.
- **Come riprodurlo:** With Supabase configured, force an insert error (e.g. violate a constraint). createContact returns ok:false but data = optimistic with id 'ct-<random>'. If the client optimistically keeps the row and later calls updateContactAction('ct-<random>', ...), the update matches zero rows and returns ok:true (no error), so the UI believes the edit persisted.
- **Come risolverlo:** Make data nullable on failure: `data: T | null` and return `data: null` when ok:false, OR split into a discriminated union `{ ok:true; data:T } | { ok:false; error }`. Replace `data as Contact` with a parse/validate step (zod schema for the row, reused from the type).
- **Impatto (scalabilità/sicurezza/performance):** Correctness: success-typed results on failure cause ghost rows and silent no-op writes that look successful.
- **Rischio futuro:** Optimistic-UI patterns built on this contract will keep producing ghost records as more entities adopt the same pattern.
- **Nota verificatore:** not independently re-verified (MEDIO/BASSO)

#### 71. JWT claims decoded from untrusted token and structurally unvalidated; security gating in middleware reads unverified payload

- **Gravità:** MEDIO  ·  **Priorità:** P2  ·  **Tipo:** security  ·  **Confidence:** medium  ·  **Verdetto verifica:** confirmed
- **Dimensione:** TypeScript Soundness & Input Validation
- **Dove:** web/middleware.ts:71-94,137-152; web/lib/data/session.ts:80-128
- **Perché è un problema:** decodeJwtClaims (middleware.ts:72) and decodeJwt (session.ts:116) base64url-decode the JWT payload WITHOUT signature verification and JSON.parse it, then read `app_role`/`rank` (middleware) and project into SessionClaims (session). The middleware uses these to decide LIMITED_BLOCKED redirects. There is no structural validation of the parsed object beyond optional field reads; `claims.rank` is fed to RANK_ORDER.indexOf((claims.rank ?? '') as MarketerRank). isLimited fails OPEN on unknown rank (idx===-1 → returns false, line 92), and on admin-ish roles returns false.
- **Conseguenza reale:** Because the middleware decodes WITHOUT verifying the signature, it must not be relied on as a security boundary — and the code comments acknowledge 'RLS remains the real security boundary'. But the limited-view gating IS a real access decision made off an unverified payload: a user who can craft a cookie with `app_role:'admin'` would bypass the limited-view redirect in middleware (RLS still protects data, so impact is UI-gating bypass, not data exfiltration). Separately, isLimited fails open on an unrecognized rank string (rank enum drift → a real but TS-unknown rank → idx -1 → treated as NOT limited), so a genuinely limited user with a newer rank value could be un-gated.
- **Come riprodurlo:** Set the access-token cookie payload's rank to a value not in RANK_ORDER (e.g. a future DB rank). isLimited returns false (line 92 fail-open) and the limited member reaches blocked sections in the UI until RLS denies the underlying queries.
- **Come risolverlo:** Treat the middleware decode strictly as UX hinting (it already is unverified) and ensure every limited-blocked route ALSO enforces server-side on the page/data layer using getCurrentClaims (which at least reads getSession's token). Make isLimited fail CLOSED for unknown ranks when role is a plain member, and validate the decoded claims object shape (typeof checks) before use. Keep RANK_ORDER, the DB enum, and ranks_meta in sync via generated types.
- **Impatto (scalabilità/sicurezza/performance):** Security (defense-in-depth gating decision on unverified data; fail-open on enum drift). Data is still RLS-protected, which caps severity.
- **Rischio futuro:** Any future feature that trusts the middleware-decoded role for an actual capability (not just redirect) would become a real privilege bypass.
- **Nota verificatore:** not independently re-verified (MEDIO/BASSO)

#### 72. No security headers (no CSP, HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy) → clickjacking + missing XSS hardening

- **Gravità:** MEDIO  ·  **Priorità:** P2  ·  **Tipo:** security  ·  **Confidence:** high  ·  **Verdetto verifica:** confirmed
- **Dimensione:** Web Pentest: XSS, CSRF, SSRF, Injection, Secrets, CORS, Upload
- **Dove:** web/next.config.mjs:7-18 (no async headers() block); confirmed no headers/CSP/frame-ancestors anywhere in web/*.{mjs,js,ts}
- **Perché è un problema:** next.config.mjs defines no headers(). The app therefore ships with no Content-Security-Policy (no frame-ancestors, no script-src restriction), no X-Frame-Options, no Strict-Transport-Security, no X-Content-Type-Options, and no Referrer-Policy. There is nothing to contain an XSS payload (e.g. the document-viewer XSS above can freely exfiltrate) and nothing preventing the app from being framed.
- **Conseguenza reale:** (1) Clickjacking: any site can <iframe> the CRM and trick a logged-in user into performing UI actions (e.g. revoke access, approve, delete). (2) Any XSS (see RichTextViewer finding) is unconstrained — a CSP with a strict script-src/connect-src would blunt cookie exfiltration. (3) No HSTS allows SSL-strip on first visit; no nosniff allows MIME-confusion on user-uploaded assets.
- **Come riprodurlo:** curl -I the deployed app and observe absence of Content-Security-Policy / X-Frame-Options / Strict-Transport-Security / X-Content-Type-Options / Referrer-Policy response headers; the app loads inside a third-party <iframe>.
- **Come risolverlo:** Add an async headers() to next.config.mjs returning for source '/(.*)': X-Frame-Options: DENY (or CSP frame-ancestors 'none'), X-Content-Type-Options: nosniff, Referrer-Policy: strict-origin-when-cross-origin, Strict-Transport-Security: max-age=63072000; includeSubDomains; preload, and a Content-Security-Policy (start in report-only) restricting script-src/connect-src to self + the Supabase project origin.
- **Impatto (scalabilità/sicurezza/performance):** Security: removes the primary clickjacking control and the main defense-in-depth layer that would contain an XSS; weakens transport security.
- **Rischio futuro:** Each new XSS-capable surface ships with zero containment until a CSP exists; retrofitting a strict CSP after the app grows is significantly harder.
- **Nota verificatore:** not independently re-verified (MEDIO/BASSO)

#### 73. Over-broad Server Actions allowedOrigins '*.vercel.app' weakens CSRF defense

- **Gravità:** MEDIO  ·  **Priorità:** P2  ·  **Tipo:** security  ·  **Confidence:** medium  ·  **Verdetto verifica:** confirmed
- **Dimensione:** Web Pentest: XSS, CSRF, SSRF, Injection, Secrets, CORS, Upload
- **Dove:** web/next.config.mjs:14-16 (serverActions.allowedOrigins: ['localhost:3000', '*.vercel.app'])
- **Perché è un problema:** Next.js Server Actions use an Origin/Host check as built-in CSRF protection. Allowing the entire '*.vercel.app' wildcard trusts every Vercel-hosted site on the shared apex — anyone can deploy a free project at <attacker>.vercel.app and obtain a passing Origin. This intentionally widens the trusted-origin set far beyond the app's own deploys.
- **Conseguenza reale:** The Origin-based CSRF layer is effectively neutralized against any attacker who controls a *.vercel.app subdomain. In practice the auth cookie is SameSite=Lax (@supabase/ssr default), so a cross-site POST does not carry the session — this is what prevents live exploitation today. But the defense-in-depth Origin check is gone, so a single regression (cookie set to SameSite=None, a future GET-based action, or browser quirks) becomes directly exploitable CSRF against authenticated users.
- **Come riprodurlo:** Inspect next.config.mjs: '*.vercel.app' is in allowedOrigins. A page hosted at any-attacker.vercel.app can issue a Server Action POST whose Origin passes the allowlist; only the SameSite=Lax cookie currently stops the request from being authenticated.
- **Come risolverlo:** Replace the wildcard with the exact production domain(s) and the specific preview deploy domain pattern you actually use (or just the custom domain). Avoid trusting the shared '*.vercel.app' namespace. Keep auth cookies SameSite=Lax/Strict.
- **Impatto (scalabilità/sicurezza/performance):** Security: removes the Origin-based CSRF guard for Server Actions; currently latent due to SameSite=Lax cookies but a one-line regression away from exploitable.
- **Rischio futuro:** Couples CSRF safety entirely to cookie SameSite behavior; any auth/cookie change silently re-opens CSRF.
- **Nota verificatore:** not independently re-verified (MEDIO/BASSO)

#### 74. Latent PostgREST .or() filter injection in contacts search

- **Gravità:** MEDIO  ·  **Priorità:** P3  ·  **Tipo:** security  ·  **Confidence:** medium  ·  **Verdetto verifica:** confirmed
- **Dimensione:** Web Pentest: XSS, CSRF, SSRF, Injection, Secrets, CORS, Upload
- **Dove:** web/lib/data/contacts.ts:92-97 (.or(`first_name.ilike.${s},...`)); same template pattern for single-column .ilike in documents.ts:75, prospects.ts:101, genealogy.ts:308
- **Perché è un problema:** listContacts() interpolates the raw filters.search string into a PostgREST .or() expression: query.or(`first_name.ilike.${s},last_name.ilike.${s},email.ilike.${s},city.ilike.${s}`). In .or(), commas and parentheses are STRUCTURAL separators; a search value containing ',' or ')' or column.op.value tokens lets the caller inject additional OR conditions / reference other columns, altering the WHERE logic (RLS still bounds the rows, but the predicate can be manipulated to widen/confuse results or probe columns). The single-column .ilike calls (documents/prospects/genealogy) are lower-risk since the user string is the value, not the structure, but still pass unescaped wildcards/patterns.
- **Conseguenza reale:** Currently NOT reachable: the contacts UI (components/contacts/contacts-manager.tsx:149) filters the already-loaded list client-side and the only server call (app/(app)/contatti/page.tsx:29) passes no search. So filters.search is never sent today. But the injectable sink is shipped and any future server-side search wiring (a server action or URL param) would immediately expose PostgREST operator injection.
- **Come riprodurlo:** If filters.search were wired from user input, a value like 'x.ilike.%,org_id.eq.<other>' (or containing commas/parens) would inject extra OR clauses into the .or() string. Demonstrable today only by calling listContacts({ search }) directly from server code.
- **Come risolverlo:** Do not interpolate raw user input into .or()/.filter() strings. Escape PostgREST reserved chars (comma, parentheses, dot, backslash) and wildcards, or build the OR with the structured filter API. For the .ilike value cases, escape % and _ in the user term.
- **Impatto (scalabilità/sicurezza/performance):** Security/data-integrity: PostgREST operator injection if/when search is wired server-side; logic-level filter manipulation within RLS bounds.
- **Rischio futuro:** High likelihood of activation — search is a natural next feature; the dangerous template is already in place to be copy-pasted.
- **Nota verificatore:** not independently re-verified (MEDIO/BASSO)

### BASSO (37)

#### 75. create_invitation/revoke_invitation gated only by RLS visibility, not admin — contradicts the 'admin-only' doc and lets any member invite/revoke in their subtree

- **Gravità:** BASSO  ·  **Priorità:** P3  ·  **Tipo:** design  ·  **Confidence:** high  ·  **Verdetto verifica:** confirmed
- **Dimensione:** Auth, Session, Middleware & Privilege Escalation
- **Dove:** web/lib/data/admin-invitations.ts:12-19 (doc claims admin), :82-119 createInvitation, :127-140 revokeInvitation; live RLS account_invitations_insert/_update = is_org_admin() OR can_see_marketer(marketer_id); create_invitation RPC runs as invoker with assert_caller_active()
- **Perché è un problema:** The module header states invitation creation is the admin '/admin/attivazioni' workflow, but the actual authorization (create_invitation has no admin check, only assert_caller_active; RLS on account_invitations allows can_see_marketer) lets any active member mint/revoke invitations for anyone in their subtree. Not a breach (subtree-bounded, token still hashed/expiring/single-use), but the implemented authority is broader than documented and the UI nominally lives under /admin which has no server-side admin gate (see the UX-only gating finding).
- **Conseguenza reale:** Any active member can issue activation invitations (and trigger emails via the create-invitation Edge Function) for their downline, and revoke pending ones — capability the team likely believes is admin-restricted. Possible unexpected invitation emails / membership provisioning initiated by non-admins.
- **Come riprodurlo:** As a non-admin active member, call createInvitationAction with marketerId in your subtree; create_invitation passes (assert_caller_active + RLS can_see_marketer) and a pending invitation is created.
- **Come risolverlo:** Decide the intended policy. If invitations are meant to be admin/team_leader-only, add that check to create_invitation/revoke_invitation (and tighten the RLS WITH CHECK), plus gate /admin pages server-side. Otherwise, fix the misleading 'admin-only' documentation.
- **Impatto (scalabilità/sicurezza/performance):** security
- **Rischio futuro:** Doc/implementation divergence on who can invite leads to wrong assumptions when new flows reuse these RPCs; combined with the unguarded /admin page it broadens over time.
- **Nota verificatore:** not independently re-verified (MEDIO/BASSO)

#### 76. Middleware gates routes by unverified atob-decoded JWT claims (acceptable today, fragile by construction)

- **Gravità:** BASSO  ·  **Priorità:** P3  ·  **Tipo:** design  ·  **Confidence:** medium  ·  **Verdetto verifica:** confirmed
- **Dimensione:** Auth, Session, Middleware & Privilege Escalation
- **Dove:** web/middleware.ts:71-94 (decodeJwtClaims/isLimited), :137-152; mirrored in web/lib/data/session.ts:115-129
- **Perché è un problema:** decodeJwtClaims base64-decodes the JWT payload WITHOUT verifying the signature, then isLimited() makes a routing decision from app_role/rank. This is only safe because supabase.auth.getUser() (line 122-124) is awaited first and validates the token against Supabase Auth before any decode — a forged/tampered token fails getUser(), the user is treated as unauthenticated, and protected routes redirect to /accedi. So tampering the claims does not currently grant access. However, the decision logic structurally trusts unverified bytes, and isLimited() fails OPEN on unknown rank (line 92: idx===-1 returns false => not limited => not blocked).
- **Conseguenza reale:** No current exploit (getUser guards it). Risk is latent: if the getUser() call is ever removed/reordered, or if a future code path reads decodeJwtClaims without a prior validation, the gate becomes trivially bypassable by editing the base64 payload. The fail-open-on-unknown-rank also means a token with a rank string the client doesn't recognize is treated as non-limited (full app), rather than denied.
- **Come riprodurlo:** Static review: decodeJwtClaims performs no signature check; safety depends entirely on the preceding getUser(). Unknown-rank tokens (idx===-1) are treated as not-limited.
- **Come risolverlo:** Document the invariant that getUser() MUST precede any claim-based gate, and prefer reading role/rank from the getUser()-validated user object / a verified source rather than re-decoding the raw access_token. Make isLimited fail CLOSED (treat unknown/missing rank as limited) for route gating.
- **Impatto (scalabilità/sicurezza/performance):** security
- **Rischio futuro:** Refactors that move/remove the getUser() call (e.g. a perf optimization to skip the network round-trip) would silently convert this into a full middleware auth bypass.
- **Nota verificatore:** not independently re-verified (MEDIO/BASSO)

#### 77. getCurrentClaims() swallows all errors into a privileged DEMO owner identity

- **Gravità:** BASSO  ·  **Priorità:** P3  ·  **Tipo:** design  ·  **Confidence:** medium  ·  **Verdetto verifica:** confirmed
- **Dimensione:** Auth, Session, Middleware & Privilege Escalation
- **Dove:** web/lib/data/session.ts:29-35 (DEMO_CLAIMS = owner/vice_president/crm_access:true), :63-113 (returns DEMO on no-session/empty-claims/any throw)
- **Perché è un problema:** On missing env, no session, unstamped org/marketer claims, OR any thrown error, getCurrentClaims returns DEMO_CLAIMS — a maximally privileged identity (role:'owner', rank:'vice_president', crm_access:true) with demo:true. In production this is mitigated because (app)/layout.tsx redirects to /accedi whenever isSupabaseConfigured && demo. But the safety hinges entirely on every consumer honoring the demo flag; any server code that calls getCurrentClaims() and reads claims.role WITHOUT also checking demo would treat an error/anon caller as an owner.
- **Conseguenza reale:** If any current or future server-side authorization check uses getCurrentClaims().claims.role and forgets to gate on demo, an unauthenticated or error state is interpreted as full owner privileges. The default-to-owner-on-error posture is the opposite of fail-closed.
- **Come riprodurlo:** Static: induce a throw in getCurrentClaims (e.g., transient supabase error) → returns owner/vice_president claims with demo:true; a consumer ignoring demo sees an owner.
- **Come risolverlo:** Make the error/anon default fail CLOSED (empty/unprivileged claims, or a discriminated 'unauthenticated' result) rather than a privileged demo owner. Keep the demo persona only behind an explicit !isSupabaseConfigured branch, never in the catch/empty-claims path when env is configured.
- **Impatto (scalabilità/sicurezza/performance):** security
- **Rischio futuro:** The pattern is a foot-gun: as authorization gradually moves into the app layer (recommended in other findings), any consumer that trusts .role without .demo silently becomes an auth bypass for anonymous/error traffic.
- **Nota verificatore:** not independently re-verified (MEDIO/BASSO)

#### 78. Dead mock module: mock/notifications.ts (mockNotifications) has zero importers after the notifications rewrite

- **Gravità:** BASSO  ·  **Priorità:** P3  ·  **Tipo:** tech_debt  ·  **Confidence:** high  ·  **Verdetto verifica:** confirmed
- **Dimensione:** Codebase Health: Dead Code, Duplication, Unused Deps/Exports, Naming
- **Dove:** web/lib/data/mock/notifications.ts (whole file, mockNotifications:10-85)
- **Perché è un problema:** notifications.ts was rewritten to DERIVE notifications at request time (birthday + new_member only) from listUpcomingBirthdays and a marketers query (notifications.ts:5,64-126) and no longer reads any stored/mock inbox. A repo-wide grep for 'mock/notifications' and 'mockNotifications' returns only the file's own definition — zero importers. The module's demo data references notification types (bottleneck_alert, follow_up_due, monthly_report_ready, rank_changed, invitation, system) that the live code no longer produces.
- **Conseguenza reale:** An 85-line module of stale demo data sits unused, and its richer set of notification types contradicts the current 'only two derived kinds' design, misleading anyone reading it about what notifications the app supports.
- **Come riprodurlo:** rg 'mock/notifications|mockNotifications' web/ → only the file itself.
- **Come risolverlo:** Delete web/lib/data/mock/notifications.ts.
- **Impatto (scalabilità/sicurezza/performance):** Removes dead, design-contradicting demo data; small clarity win.
- **Rischio futuro:** Low, but it actively misrepresents the notification model to future readers.
- **Nota verificatore:** not independently re-verified (MEDIO/BASSO)

#### 79. Copy-pasted fieldCx/selectCx Tailwind strings across 6 components

- **Gravità:** BASSO  ·  **Priorità:** P3  ·  **Tipo:** tech_debt  ·  **Confidence:** high  ·  **Verdetto verifica:** confirmed
- **Dimensione:** Codebase Health: Dead Code, Duplication, Unused Deps/Exports, Naming
- **Dove:** web/components/team/marketer-anagrafica.tsx:62-63; web/components/genealogy/add-member-dialog.tsx:44-45; web/components/prospects/prospect-detail.tsx:40-41; web/components/lista-contatti/lista-contatti-form-sheet.tsx:34-35; web/components/team/documents-settings.tsx:29-30; web/components/team/calls-settings.tsx:27-28
- **Perché è un problema:** The same long input/select class string ('flex h-9 w-full rounded-md border border-input bg-background ... focus-visible:ring-2 focus-visible:ring-ring ...') is redeclared in 6 files as local fieldCx/selectCx consts, with subtle inconsistencies (some include focus-visible:ring-offset-2, some px-3 vs px-2, some include disabled: states, some don't). There is already a components/ui/input.tsx but these bespoke fields bypass it.
- **Conseguenza reale:** Styling drift (the variants already differ); a design-token change must be edited in 6 places; inputs look subtly inconsistent across forms.
- **Come riprodurlo:** rg 'const fieldCx|const selectCx' web/ → 6 declarations with differing class strings.
- **Come risolverlo:** Extract one fieldClass/selectClass (or use the existing ui/input.tsx and a small ui/native-select primitive) and import everywhere; delete the local consts.
- **Impatto (scalabilità/sicurezza/performance):** Consistent form styling; single source of truth for input tokens.
- **Rischio futuro:** Visual inconsistency compounds as more forms copy whichever variant is nearest.
- **Nota verificatore:** not independently re-verified (MEDIO/BASSO)

#### 80. ms-per-day magic number (86_400_000) duplicated across 11+ files; no shared time constants

- **Gravità:** BASSO  ·  **Priorità:** P3  ·  **Tipo:** tech_debt  ·  **Confidence:** high  ·  **Verdetto verifica:** confirmed
- **Dimensione:** Codebase Health: Dead Code, Duplication, Unused Deps/Exports, Naming
- **Dove:** web/lib/utils.ts:78; web/lib/data/admin-invitations.ts:93; web/lib/data/analytics.ts:111; web/lib/data/calls.ts:41,74; web/lib/data/team.ts:235; web/lib/data/notifications.ts:99; web/lib/data/mock/_shared.ts:33,39; web/components/calls/calls-manager.tsx:163,180; web/components/team/personal-performance.tsx:47,52; web/components/team/performance-modal.tsx:123
- **Perché è un problema:** The literal 86_400_000 (and 3_600_000) is scattered through date math in 11+ files instead of a named constant (e.g. MS_PER_DAY). Likewise the deterministic demo 'now' base date '2026-05-30T09:00:00.000Z' is duplicated in mock/_shared.ts:32,38.
- **Conseguenza reale:** Date math is unreadable and error-prone (easy to typo a zero); the demo base-date duplication means changing the demo clock requires editing two spots.
- **Come riprodurlo:** rg '86_400_000|3_600_000' web/ → 14 occurrences across 11 files.
- **Come risolverlo:** Add MS_PER_DAY / MS_PER_HOUR to lib/utils.ts (or a lib/time.ts) and import; hoist the demo base date to a single constant in mock/_shared.ts.
- **Impatto (scalabilità/sicurezza/performance):** Readability and a smaller off-by-a-zero surface in time math.
- **Rischio futuro:** Low, but a single mistyped literal silently corrupts a date window.
- **Nota verificatore:** not independently re-verified (MEDIO/BASSO)

#### 81. Orphan i18n keys after UI removals (wishlist.horizon, anagrafica.f_notes/f_notes_placeholder)

- **Gravità:** BASSO  ·  **Priorità:** P3  ·  **Tipo:** tech_debt  ·  **Confidence:** high  ·  **Verdetto verifica:** confirmed
- **Dimensione:** Codebase Health: Dead Code, Duplication, Unused Deps/Exports, Naming
- **Dove:** web/messages/it.json:1204-1205 (f_notes, f_notes_placeholder), 1239 (wishlist.horizon)
- **Perché è un problema:** wishlist-manager.tsx:72-74 comments that 'horizon is no longer surfaced in the UI' yet messages/it.json:1239 still defines wishlist.horizon; a grep for t('horizon')/'.horizon' label usage in components returns nothing. Similarly anagrafica.f_notes and f_notes_placeholder (it.json:1204-1205) have ZERO t('f_notes') references in components (the note field lost its label). These are dead translation keys.
- **Conseguenza reale:** Dead keys accumulate in the single-locale catalog; translators/maintainers can't tell which keys are live, and the catalog misrepresents the UI.
- **Come riprodurlo:** rg "'horizon'|f_notes" web/components → no matches; the keys exist only in it.json and (for horizon) in data shape code.
- **Come risolverlo:** Remove wishlist.horizon, anagrafica.f_notes and anagrafica.f_notes_placeholder from it.json. Consider an unused-i18n-key lint step to prevent recurrence.
- **Impatto (scalabilità/sicurezza/performance):** Cleaner, trustworthy translation catalog.
- **Rischio futuro:** Catalog cruft grows with every UI removal; without a checker it's invisible.
- **Nota verificatore:** not independently re-verified (MEDIO/BASSO)

#### 82. Ordering constants split across modules (ROLE_ORDER in nav.ts, RANK_ORDER in types/db.ts) forcing UI→nav coupling

- **Gravità:** BASSO  ·  **Priorità:** P3  ·  **Tipo:** design  ·  **Confidence:** medium  ·  **Verdetto verifica:** confirmed
- **Dimensione:** Codebase Health: Dead Code, Duplication, Unused Deps/Exports, Naming
- **Dove:** web/lib/nav.ts:53 (ROLE_ORDER) vs web/lib/types/db.ts (RANK_ORDER); consumer web/components/genealogy/permissions.ts:1-2 imports RANK_ORDER from types/db and ROLE_ORDER from nav
- **Perché è un problema:** Two sibling domain-ordering constants live in unrelated modules: RANK_ORDER in the types module, ROLE_ORDER in the navigation module. permissions.ts (a pure authorization helper) must import from BOTH, and in particular reaches into lib/nav.ts (a presentation concern) just to get ROLE_ORDER. This couples authorization logic to the nav module.
- **Conseguenza reale:** A pure permission/domain helper depends on the navigation module; the two ordering enums are discoverable in different places, and any module needing role ordering must import nav.ts even when it has nothing to do with the sidebar.
- **Come riprodurlo:** Read permissions.ts:1-2 (imports RANK_ORDER from types/db, ROLE_ORDER from nav) and nav.ts:53 (ROLE_ORDER defined here).
- **Come risolverlo:** Move ROLE_ORDER next to RANK_ORDER in lib/types/db.ts (or a lib/domain/order.ts) and have nav.ts import it from there, so authorization helpers never depend on the nav module.
- **Impatto (scalabilità/sicurezza/performance):** Cleaner layering: domain ordering separated from presentation; authorization no longer imports nav.
- **Rischio futuro:** Encourages further presentation↔domain coupling as more helpers reach into nav.ts for ROLE_ORDER.
- **Nota verificatore:** not independently re-verified (MEDIO/BASSO)

#### 83. Birthday 'today' uses server-local clock, not the org timezone (Europe/Rome) — day-boundary misfires

- **Gravità:** BASSO  ·  **Priorità:** P3  ·  **Tipo:** bug  ·  **Confidence:** medium  ·  **Verdetto verifica:** confirmed
- **Dimensione:** Cross-cutting Data-flow & Frontend-Backend-DB Integration
- **Dove:** web/lib/data/notifications.ts:71 (listUpcomingBirthdays(0, now=new Date())) → web/lib/data/team.ts:209-244 (today = new Date(now.getFullYear(),getMonth(),getDate())) vs organizations.timezone default 'Europe/Rome' (web/lib/data/admin.ts:337)
- **Perché è un problema:** birthdayNotifications passes now=new Date() and listUpcomingBirthdays derives 'today' from the server-local Y/M/D. On Vercel the runtime clock is UTC, while the org timezone is Europe/Rome (UTC+1/＋2). Around local midnight the server's calendar day differs from Rome's, so daysUntil===0 (today-only) is computed against the wrong day.
- **Conseguenza reale:** A team member's birthday notification can appear a day early/late or be skipped entirely for users near the midnight boundary; the deep-link href (notificationHref → /team/<id>) still resolves, but the trigger day is off.
- **Come riprodurlo:** Set a member's birth_date to tomorrow (Rome). Between 22:00–24:00 Rome time (still 'tomorrow-1' in UTC depending on offset), the birthday-today notification logic uses UTC's date and can fire/withhold on the wrong calendar day.
- **Come risolverlo:** Compute 'today' in the org timezone (organizations.timezone) when deciding daysUntil===0, e.g. format now via Intl with timeZone before extracting Y/M/D.
- **Impatto (scalabilità/sicurezza/performance):** Minor correctness/timing issue on a derived, non-critical notification; no data loss.
- **Rischio futuro:** Becomes visible if orgs in other timezones are onboarded; the hardcoded reliance on server-local date is a latent multi-tz bug.
- **Nota verificatore:** not independently re-verified (MEDIO/BASSO)

#### 84. Stale/incorrect code comment claims the DB enum lacks no_rank — actual live enum has cliente AND no_rank (schema-vs-code drift)

- **Gravità:** BASSO  ·  **Priorità:** P2  ·  **Tipo:** tech_debt  ·  **Confidence:** high  ·  **Verdetto verifica:** confirmed
- **Dimensione:** Cross-cutting Data-flow & Frontend-Backend-DB Integration
- **Dove:** web/app/(app)/genealogia/actions.ts:106-110 comment ('the DB enum has no no_rank'); live marketer_rank enum verified to contain cliente(0) and no_rank(0.5); these values are NOT in any committed migration (supabase/migrations/0002_enums.sql:50-59 has no cliente/no_rank; grep for ADD VALUE cliente/no_rank → none)
- **Perché è un problema:** The action's comment asserts the new member 'starts at the entry rank executive (the DB enum has no no_rank)', but the live enum (pg_enum) and ranks_meta both contain cliente and no_rank, and the dialog (add-member-dialog.tsx:205, RANK_ORDER) lets the admin pick them; createMarketer passes input.rank straight through. So the comment is wrong AND the enum values exist only in the live DB, not in the committed migrations — schema drift between repo and prod.
- **Conseguenza reale:** Misleading comment for maintainers (they may 'fix' the action to force executive). More importantly, a clean `supabase db reset` from migrations 0001-0046 produces an enum WITHOUT cliente/no_rank, so the same add-member flow that works in prod would throw 22P02 (invalid enum value) on a freshly-provisioned environment, falling into createMarketer's catch → {ok:false} → generic 'add_error' in the dialog.
- **Come riprodurlo:** Provision a DB purely from supabase/migrations, then add a member with rank=cliente/no_rank → INSERT fails (enum value absent) → dialog shows add_error. Against the live project it succeeds (enum has the values).
- **Come risolverlo:** Add a committed migration that does ALTER TYPE marketer_rank ADD VALUE 'cliente'/'no_rank' (+ ranks_meta seed) so repo and prod match; correct the comment in actions.ts.
- **Impatto (scalabilità/sicurezza/performance):** Environment reproducibility / onboarding-new-env breakage; latent enum mismatch between code paths and committed schema.
- **Rischio futuro:** Any CI/staging rebuilt from migrations will silently behave differently from prod for rank handling until the drift is reconciled.
- **Nota verificatore:** not independently re-verified (MEDIO/BASSO)

#### 85. Two-statement leaderboard read: separate latest-period probe before the data query

- **Gravità:** BASSO  ·  **Priorità:** P3  ·  **Tipo:** perf  ·  **Confidence:** medium  ·  **Verdetto verifica:** confirmed
- **Dimensione:** Database Schema, Indexing, N+1 & Query Cost (live + code)
- **Dove:** web/lib/data/leaderboards.ts:41-61 (one query for max period_start, then a second query for the ranked rows)
- **Perché è un problema:** getLeaderboard issues a round-trip to find the latest period_start, then a second round-trip to fetch that period's rows. This is two sequential network calls where a single query (subquery/CTE selecting max period_start, or ordering by period_start DESC, rank_position) would do. leaderboard_lookup_idx already supports both. Minor latency, no correctness issue.
- **Conseguenza reale:** Doubled latency on the leaderboard panel (two serial Supabase calls).
- **Come riprodurlo:** Trace the network for a leaderboard render: two PostgREST calls.
- **Come risolverlo:** Collapse to one query that filters period_start = (select max(period_start) ... ) or fetches ordered by (period_start desc, rank_position) and slices in app, eliminating the extra round-trip.
- **Impatto (scalabilità/sicurezza/performance):** performance
- **Rischio futuro:** Negligible; pure latency.
- **Nota verificatore:** not independently re-verified (MEDIO/BASSO)

#### 86. marketers anagrafica extras and several FK-bearing columns are nullable where NOT NULL would be safer

- **Gravità:** BASSO  ·  **Priorità:** P3  ·  **Tipo:** design  ·  **Confidence:** medium  ·  **Verdetto verifica:** confirmed
- **Dimensione:** Database Schema, Indexing, N+1 & Query Cost (live + code)
- **Dove:** information_schema.columns: marketers.display_name (null), marketers.path is NOT NULL but starting_package/addon/city/region/birth_date/occupation all null (expected); memberships.user_id null (intentional for pre-registration); marketers.leg null while parent_id present is constrained only by partial unique index, not a CHECK
- **Perché è un problema:** display_name is nullable and the app constantly falls back to first+last concatenation (toTreeNode, rowToAdminMarketer), indicating it is effectively required for UX — a generated column (first||' '||last) or NOT NULL with a default would remove the repeated COALESCE branches. There is no CHECK enforcing that leg IS NOT NULL whenever parent_id IS NOT NULL (and NULL when root); integrity relies solely on the partial unique index marketers_one_child_per_leg, which permits a non-root row with NULL leg.
- **Conseguenza reale:** A marketer with parent_id set but leg NULL is insertable, breaking branch_leg-based aggregation (it would be counted in neither LEFT nor RIGHT). display_name nulls force defensive code everywhere.
- **Come riprodurlo:** Insert a marketer with parent_id set and leg NULL; the one-child-per-leg partial index does not block it, and branch counts silently drop it.
- **Come risolverlo:** Add CHECK ((parent_id IS NULL) = (leg IS NULL)) (root has no leg, non-root must have one); make display_name a generated stored column or NOT NULL.
- **Impatto (scalabilità/sicurezza/performance):** data integrity
- **Rischio futuro:** A single malformed insert corrupts branch metrics with no error.
- **Nota verificatore:** not independently re-verified (MEDIO/BASSO)

#### 87. memberships_select RLS re-evaluates auth.uid() per row; duplicate permissive SELECT policies on memberships and ranks_meta

- **Gravità:** BASSO  ·  **Priorità:** P3  ·  **Tipo:** perf  ·  **Confidence:** high  ·  **Verdetto verifica:** confirmed
- **Dimensione:** Database Schema, Indexing, N+1 & Query Cost (live + code)
- **Dove:** Supabase advisor auth_rls_initplan on memberships_select; multiple_permissive_policies on memberships {memberships_admin_write, memberships_select} and ranks_meta {ranks_meta_platform_write, ranks_meta_select} for role authenticated, action SELECT
- **Perché è un problema:** memberships_select calls auth.uid() unwrapped, so it is re-evaluated per row (advisor-flagged). Both memberships and ranks_meta have two permissive policies covering SELECT for authenticated (the FOR ALL write policy also grants SELECT), so Postgres OR-evaluates both policies on every read, doubling policy overhead.
- **Conseguenza reale:** Slightly higher per-row RLS cost on membership/ranks reads; memberships is read on most session/context resolutions (getOwnerContext, marketer crm_access embeds).
- **Come riprodurlo:** get_advisors(performance) -> auth_rls_initplan + 2x multiple_permissive_policies; EXPLAIN a memberships select to see both policies applied.
- **Come risolverlo:** Wrap auth.uid() as (select auth.uid()) in memberships_select; scope the FOR ALL write policies to their actual commands (or split into INSERT/UPDATE/DELETE) so they don't also fire on SELECT.
- **Impatto (scalabilità/sicurezza/performance):** performance
- **Rischio futuro:** Minor; grows with membership/ranks row counts (both small by nature).
- **Nota verificatore:** not independently re-verified (MEDIO/BASSO)

#### 88. No healthcheck endpoint, no documented rollback runbook, README inaccurate vs reality

- **Gravità:** BASSO  ·  **Priorità:** P3  ·  **Tipo:** tech_debt  ·  **Confidence:** high  ·  **Verdetto verifica:** confirmed
- **Dimensione:** DevOps, CI/CD, Config, Secrets, Observability, Production Readiness
- **Dove:** web/app (no api/ or health/ route); docs/DEPLOY-VERCEL.md (no rollback/runbook section); README.md:3,89,147 vs repo reality
- **Perché è un problema:** There is no health/readiness route in web/app (no api/ directory), so external uptime monitoring can only probe a full page. DEPLOY-VERCEL.md covers deploy but documents no rollback strategy beyond implicit Vercel redeploy and no migration-rollback plan. README.md:3 calls this 'production-grade' yet there is no CI/tests/monitoring; README:147 instructs generating types to `src/lib/database.types.ts` while the actual code lives under web/lib (no src/), so the documented type-generation path is wrong.
- **Conseguenza reale:** Uptime checks are coarse; on a bad deploy or bad migration the team has no written rollback procedure (and migrations are forward-only DDL with drift, so DB rollback is undefined). README overstatement plus the wrong types path mislead operators/new contributors.
- **Come riprodurlo:** Look for /api/health (absent); search DEPLOY-VERCEL.md for 'rollback' (absent); compare README:147 src/lib path with the actual web/lib layout.
- **Come risolverlo:** Add a lightweight /api/health route (verifies env presence + a trivial DB ping) for uptime monitoring; add a rollback/runbook section (Vercel instant-rollback + migration down strategy) to DEPLOY-VERCEL.md; correct README type-generation path and temper the 'production-grade' claim until CI/tests/monitoring exist.
- **Impatto (scalabilità/sicurezza/performance):** scalability
- **Rischio futuro:** Minor now, but the missing rollback runbook becomes acute during the first prod incident; doc drift worsens as the codebase evolves.
- **Nota verificatore:** not independently re-verified (MEDIO/BASSO)

#### 89. New-member notification keyed on marketers.created_at, not on when they joined the caller's team

- **Gravità:** BASSO  ·  **Priorità:** P3  ·  **Tipo:** bug  ·  **Confidence:** medium  ·  **Verdetto verifica:** confirmed
- **Dimensione:** Domain Logic Correctness: Notifications, Birthdays, Dashboard, Limited-view, Ranks
- **Dove:** web/lib/data/notifications.ts:91-126 (cutoff vs r.created_at), 34-35 (NEW_MEMBER_WINDOW_DAYS)
- **Perché è un problema:** A 'new member of YOUR team' event is detected by marketers.created_at within the last 7 days. But a profile can be pre-registered long before being placed under the caller (placement/closure built later via addMarketerAction). created_at reflects profile creation, not team entry.
- **Conseguenza reale:** A person placed into the caller's downline today but created weeks ago produces NO new-member notification (created_at outside the 7-day window). Conversely a freshly-created node placed elsewhere then moved would notify the wrong upline timing. The feature misses legitimate team additions.
- **Come riprodurlo:** Pre-register marketer X (created_at = 30 days ago). Today place X under caller C. C opens /notifiche: no 'nuovo membro' notification, because X.created_at is older than the 7-day cutoff.
- **Come risolverlo:** Key the window on the team-join event (closure row creation time / a placed_at column) rather than marketers.created_at, or detect recency from the closure edge.
- **Impatto (scalabilità/sicurezza/performance):** Notification completeness gap; low blast radius today (small org).
- **Rischio futuro:** More noticeable as pre-registration + delayed placement becomes common.
- **Nota verificatore:** not independently re-verified (MEDIO/BASSO)

#### 90. Unbounded .in(team) list in new-member query for large uplines

- **Gravità:** BASSO  ·  **Priorità:** P3  ·  **Tipo:** perf  ·  **Confidence:** medium  ·  **Verdetto verifica:** confirmed
- **Dimensione:** Domain Logic Correctness: Notifications, Birthdays, Dashboard, Limited-view, Ranks
- **Dove:** web/lib/data/notifications.ts:101-107 (.in('id', Array.from(team))); web/lib/data/genealogy.ts:100-125 (fetchTeamCounts also fans .in over ids)
- **Perché è un problema:** descendantIds() returns the caller's entire strict downline, then newMemberNotifications passes the whole set to PostgREST .in('id', [...]). For a top-of-tree upline this can be thousands of ids in one URL-encoded filter, hitting PostgREST URL-length limits and a large IN scan on every /notifiche and every layout render (unread badge).
- **Conseguenza reale:** For very large downlines the request can 414/exceed limits; the catch returns empty notifications (graceful), so big uplines silently get NO notifications, and the badge query runs an oversized IN on each page load.
- **Come riprodurlo:** Construct an upline with several thousand descendants; load any (app) page: the layout's listNotifications() fans a multi-thousand-id .in() per request.
- **Come risolverlo:** Server-side join instead of client-side IN: query marketers via a closure JOIN/RPC scoped to ancestor=marketerId (depth>=1) so filtering stays in Postgres; cache descendantIds per request and reuse for both birthday and new-member paths.
- **Impatto (scalabilità/sicurezza/performance):** Performance cliff and silent feature loss for the largest, most important uplines.
- **Rischio futuro:** Scales poorly; current data max ~7 descendants so not yet triggered (verified live).
- **Nota verificatore:** not independently re-verified (MEDIO/BASSO)

#### 91. Feb-29 birthdays roll to Mar-1 in non-leap years

- **Gravità:** BASSO  ·  **Priorità:** P3  ·  **Tipo:** tech_debt  ·  **Confidence:** high  ·  **Verdetto verifica:** confirmed
- **Dimensione:** Domain Logic Correctness: Notifications, Birthdays, Dashboard, Limited-view, Ranks
- **Dove:** web/lib/data/team.ts:230-236 (new Date(year, month-1, day) for month/day from birth_date)
- **Perché è un problema:** For birth_date ...-02-29, new Date(year, 1, 29) in a non-leap year overflows to March 1. daysUntil is then computed against March 1, so the birthday is recognized on the wrong day in 3 of every 4 years.
- **Conseguenza reale:** Feb-29-born members are greeted on March 1 (or not on Feb 28) in non-leap years — a minor correctness quirk in the birthday feature.
- **Come riprodurlo:** birth_date = 2000-02-29, now = 2026-02-28 (non-leap). next = new Date(2026,1,29) → Mar 1 2026, daysUntil = 1, not 0; on Mar 1 it fires.
- **Come risolverlo:** Define a deliberate policy for Feb-29 (e.g. celebrate Feb 28 in non-leap years) and clamp the day accordingly.
- **Impatto (scalabilità/sicurezza/performance):** Cosmetic edge case affecting a small subset of users.
- **Rischio futuro:** Permanent but trivial.
- **Nota verificatore:** not independently re-verified (MEDIO/BASSO)

#### 92. Raw <img> for org logo (no next/image, no width/height) → CLS and unoptimized image

- **Gravità:** BASSO  ·  **Priorità:** P3  ·  **Tipo:** perf  ·  **Confidence:** high  ·  **Verdetto verifica:** confirmed
- **Dimensione:** Frontend Performance, Bundle Size, Code-splitting, Images
- **Dove:** web/components/team/org-identity-settings.tsx:116
- **Perché è un problema:** The org logo is rendered as `<img src={logoUrl} alt="" className="h-full w-full object-contain" />` — a raw <img>, not next/image, with no intrinsic width/height attributes (only CSS sizing on the parent). next/image is not used anywhere in the app (grep `next/image` -> 0 matches). Raw user-supplied logos are served unoptimized (no resizing/format negotiation) and contribute to layout shift before load.
- **Conseguenza reale:** Cumulative Layout Shift on the org-identity settings panel and unoptimized image bytes for arbitrarily-large uploaded logos. Minor because it is a single settings surface, not a hot path.
- **Come riprodurlo:** grep `<img ` across web/**/*.tsx -> only org-identity-settings.tsx:116. grep `next/image` -> No matches.
- **Come risolverlo:** Use next/image with explicit width/height (or fill + a sized container with aspect-ratio) and configure the Supabase storage domain in next.config images.remotePatterns. Reserve space via aspect-ratio to eliminate CLS.
- **Impatto (scalabilità/sicurezza/performance):** Removes a CLS source and enables image optimization on the one raster image the app renders.
- **Rischio futuro:** If more user-uploaded images (avatars, attachments) are added with the same raw-<img> pattern, CLS and unoptimized-bytes problems multiply across the app.
- **Nota verificatore:** not independently re-verified (MEDIO/BASSO)

#### 93. Login screen runs ~17 concurrent infinite CSS animations (paint/compositor cost)

- **Gravità:** BASSO  ·  **Priorità:** P3  ·  **Tipo:** perf  ·  **Confidence:** medium  ·  **Verdetto verifica:** confirmed
- **Dimensione:** Frontend Performance, Bundle Size, Code-splitting, Images
- **Dove:** web/app/(auth)/_components/auth-shell.tsx:45-76 (3 blur-3xl aurora layers + 14-particle field, each animate-aurora / animate-glow-pulse); keyframes in web/tailwind.config.ts:184-194 (aurora 14s infinite, glow-pulse 2.4s infinite, all 'infinite')
- **Perché è un problema:** AuthShell renders 3 large radial-gradient layers with `blur-3xl` (42rem/40rem/36rem) animating `aurora` (14s infinite) plus 14 particles each animating `glow-pulse` (2.4s infinite) with box-shadow glow. blur + animated transform/opacity on huge elements forces continuous compositing/repaint. It is a server component (good — no JS), so the cost is pure GPU/paint, not bundle. Animations run forever even after the form is in view, with no prefers-reduced-motion guard.
- **Conseguenza reale:** Sustained GPU/battery usage on the login page, jank on low-end mobile, and a busy first impression. Not a correctness or bundle issue, hence BASSO.
- **Come riprodurlo:** Read auth-shell.tsx:45-76; count animate-aurora (3) + animate-glow-pulse particles (14). tailwind.config.ts:189-193 shows these keyframes are `infinite`.
- **Come risolverlo:** Reduce the number of always-on infinite animations (e.g. animate only 1-2 auroras, make particles static or fade once), and gate decorative motion behind `@media (prefers-reduced-motion: reduce)` to disable it for users who request reduced motion.
- **Impatto (scalabilità/sicurezza/performance):** Lower paint/compositor and battery cost on the most-visited unauthenticated page; better accessibility for reduced-motion users.
- **Rischio futuro:** The same heavy-decoration pattern (animate-aurora/glow-pulse on blur-3xl) is already copied into dashboard, presenze, marketer-hero; without a reduced-motion convention the paint cost spreads across authed pages too.
- **Nota verificatore:** not independently re-verified (MEDIO/BASSO)

#### 94. Whole-page Suspense in genealogia blocks streaming of stable content (no granular streaming)

- **Gravità:** BASSO  ·  **Priorità:** P3  ·  **Tipo:** tech_debt  ·  **Confidence:** medium  ·  **Verdetto verifica:** confirmed
- **Dimensione:** Next.js Architecture: RSC/CSR boundaries, Waterfalls, Caching
- **Dove:** web/app/(app)/genealogia/page.tsx:40-49 (single Suspense wrapping the entire GenealogyView); other pages (dashboard, statistiche, team/[id], presenze, org) have no Suspense at all and rely solely on loading.tsx
- **Perché è un problema:** genealogia awaits all data (claims, root, subtree) in the page body BEFORE rendering, then wraps the already-resolved GenealogyView in a Suspense whose fallback can therefore never actually show (the await happens above the Suspense, so the page is already blocked). The Suspense at L41 is effectively dead — the boundary only helps if an async child suspends, but GenealogyView receives fully-resolved props. Real streaming would require moving the awaits into a child server component inside the boundary. Other heavy pages have no Suspense and block entirely on their data via loading.tsx (which is fine but coarse).
- **Conseguenza reale:** No progressive streaming: the genealogia page TTFB waits for the full claims→root→counts→subtree chain before any HTML for the view flushes; the Suspense fallback (GenealogySkeleton) is never reached because the suspending work is hoisted above it. Minor — loading.tsx still gives instant nav feedback.
- **Come riprodurlo:** Read genealogia/page.tsx: getCurrentClaims/getRootMarketer/getSubtree are awaited at L23-31, above the return; the Suspense at L41 wraps a component built from already-resolved data.
- **Come risolverlo:** If streaming is desired, push the data fetching into an async child component rendered inside the Suspense boundary (so the boundary actually suspends and streams the skeleton), or drop the dead Suspense and keep loading.tsx as the nav-level fallback.
- **Impatto (scalabilità/sicurezza/performance):** perf: marginal; enables true streaming of the genealogy view shell ahead of the (slow) subtree query if refactored.
- **Rischio futuro:** The dead Suspense gives a false impression of streaming; future devs may assume partial rendering works when it doesn't.
- **Nota verificatore:** not independently re-verified (MEDIO/BASSO)

#### 95. Dragging a Lista-contatti mirror card has no live cross-column preview (onDragOver no-op for lc- cards)

- **Gravità:** BASSO  ·  **Priorità:** P3  ·  **Tipo:** design  ·  **Confidence:** high  ·  **Verdetto verifica:** confirmed
- **Dimensione:** React Correctness: Hooks, Effects, Re-renders, Memory Leaks, State
- **Dove:** web/components/prospects/prospect-board.tsx:204-224 (onDragOver) vs :135-151 (lcByStage lives outside stageMap)
- **Perché è un problema:** onDragOver resolves the source column with findStageOf(prev, activeId) where prev = stageMap, but lc- cards live only in lcByStage (derived from the store), never in stageMap. So `from` is null and onDragOver returns early — no optimistic preview while dragging an invited-contact card. onDragEnd does handle it (updates percorso via the store), but only after drop.
- **Conseguenza reale:** Inconsistent UX: real prospect cards animate between columns during drag; Lista-contatti mirror cards do not move until released. Confusing but not broken.
- **Come riprodurlo:** Drag a card with the 'Lista' badge across columns — it stays put visually until you drop it, unlike normal cards.
- **Come risolverlo:** Either include lc cards in a unified working map during drag, or render a DragOverlay-only preview for lc cards (the overlay already works), and document that lc cards commit only on drop.
- **Impatto (scalabilità/sicurezza/performance):** Minor UX inconsistency in the kanban.
- **Rischio futuro:** Low; cosmetic.
- **Nota verificatore:** not independently re-verified (MEDIO/BASSO)

#### 96. A single stage-change move disables dragging on ALL board cards

- **Gravità:** BASSO  ·  **Priorità:** P3  ·  **Tipo:** tech_debt  ·  **Confidence:** high  ·  **Verdetto verifica:** confirmed
- **Dimensione:** React Correctness: Hooks, Effects, Re-renders, Memory Leaks, State
- **Dove:** web/components/prospects/prospect-board.tsx:408 (busy={busyId !== null}) -> board-column.tsx:50/146 (busy) -> prospect-card.tsx:196-208 (useSortable disabled)
- **Perché è un problema:** busyId tracks the single card being committed, but it is passed to every column as a boolean busy flag, which disables useSortable on every card in every column for the duration of the in-flight server action.
- **Conseguenza reale:** While one card's stage change is committing (network latency), the user cannot start dragging any other card. On slow connections the whole board feels frozen.
- **Come riprodurlo:** Throttle network, drag a card to a new column; immediately try to drag a different card — it won't grab until the first commit resolves.
- **Come risolverlo:** Disable only the specific card: pass busyId down and set disabled={busy === card.id} in ProspectCard, instead of a global boolean.
- **Impatto (scalabilità/sicurezza/performance):** Minor responsiveness regression under latency.
- **Rischio futuro:** Low.
- **Nota verificatore:** not independently re-verified (MEDIO/BASSO)

#### 97. genealogy-view post-add/post-pick setTimeouts are not cancelled on unmount

- **Gravità:** BASSO  ·  **Priorità:** P3  ·  **Tipo:** tech_debt  ·  **Confidence:** high  ·  **Verdetto verifica:** confirmed
- **Dimensione:** React Correctness: Hooks, Effects, Re-renders, Memory Leaks, State
- **Dove:** web/components/genealogy/genealogy-view.tsx:100 (handleAdded) and :110 (handlePick) — window.setTimeout(... canvasRef.current?.centerOn ..., 140/120)
- **Perché è un problema:** Both callbacks schedule a setTimeout to center the canvas after layout settles, but neither stores/clears the timer. If the user navigates away (or the canvas unmounts) within the 120-140ms window, the callback fires against a possibly-null ref. It guards with optional chaining (canvasRef.current?.), so it won't throw, but it is an uncancelled timer touching post-unmount.
- **Conseguenza reale:** No crash (optional chaining protects it), but it's a latent timer leak pattern; if the centerOn target were heavier or the ref logic changed, it could act on a stale instance.
- **Come riprodurlo:** Add a member or pick a search result, then immediately navigate away before ~140ms.
- **Come risolverlo:** Store the timeout id and clear it in a cleanup, or trigger centering from an effect keyed on the new selectedId with proper teardown.
- **Impatto (scalabilità/sicurezza/performance):** Negligible now; defensive cleanup.
- **Rischio futuro:** Low.
- **Nota verificatore:** not independently re-verified (MEDIO/BASSO)

#### 98. useGenealogyTree getNode recreated every render via [cache] dependency causes downstream churn

- **Gravità:** BASSO  ·  **Priorità:** P3  ·  **Tipo:** perf  ·  **Confidence:** medium  ·  **Verdetto verifica:** confirmed
- **Dimensione:** React Correctness: Hooks, Effects, Re-renders, Memory Leaks, State
- **Dove:** web/components/genealogy/use-genealogy-tree.ts:110 (getNode useCallback deps [cache]) and :308-311 (visibleNodes = Array.from(cache.values()) on every cache change)
- **Perché è un problema:** getNode is memoized on [cache], so every cache mutation (lazy load, addChild, removeNode) yields a new getNode identity. genealogy-view passes tree.getNode-derived selectedNode and tree functions around; visibleNodes is a fresh array each time cache changes, which re-runs the canvas layoutTree useMemo. This is mostly inherent to a Map-in-state design, but combined with the per-node data rebuild it amplifies re-render cost.
- **Conseguenza reale:** Extra recomputation on each tree mutation. Bounded and correct, but contributes to the canvas re-render cost on large trees.
- **Come riprodurlo:** Profile expanding nodes on a large tree; each expand recreates visibleNodes and re-lays-out.
- **Come risolverlo:** Acceptable as-is for correctness; if perf matters, keep cache as a ref + a version counter, or memoize visibleNodes more granularly. Primarily flagged together with the canvas memo finding.
- **Impatto (scalabilità/sicurezza/performance):** Minor perf; correctness fine.
- **Rischio futuro:** Low-moderate as tree size grows.
- **Nota verificatore:** not independently re-verified (MEDIO/BASSO)

#### 99. No robots.txt / sitemap / web manifest; shareable OG & icon routes are force-dynamic

- **Gravità:** BASSO  ·  **Priorità:** P3  ·  **Tipo:** perf  ·  **Confidence:** high  ·  **Verdetto verifica:** confirmed
- **Dimensione:** SEO, Metadata, Accessibility & Mobile Responsiveness
- **Dove:** Absent: web/app/robots.ts, web/app/sitemap.ts, web/app/manifest.ts (only icon.tsx, apple-icon.tsx, opengraph-image.tsx, twitter-image.tsx exist); web/app/opengraph-image.tsx:11 and web/app/icon.tsx:10 set `export const dynamic = 'force-dynamic'`
- **Perché è un problema:** The app is private/auth-gated, but the auth pages (/accedi, /recupera-password, /invito/[token]) are public and indexable, and the OG/twitter images are the only link-preview assets. There is no robots policy (so crawlers may attempt protected paths, all of which 302→/accedi), no sitemap, and the share images are regenerated on every request (force-dynamic) instead of cached — wasteful and slower social-unfurl. No PWA manifest / themeColor for the installable dark-canvas auth screen.
- **Conseguenza reale:** Minor: search engines waste crawl budget hitting redirect-walls; every social share/Slack unfurl re-renders the 1200x630 image server-side (cold @vercel/og cost) rather than serving a cached asset; no add-to-homescreen identity. No data/security impact (no canonical leak of private data).
- **Come riprodurlo:** GET /robots.txt and /sitemap.xml → 404. Inspect og image response headers → no long-lived cache due to force-dynamic. View-source of /accedi → no manifest/theme-color meta.
- **Come risolverlo:** Add web/app/robots.ts (Disallow protected prefixes, Allow auth pages) and an optional web/app/sitemap.ts for public auth routes. Remove `dynamic='force-dynamic'` from icon/opengraph routes (or replace with `export const revalidate` / static generation) so @vercel/og output is cached; the comment cites an 'offline build' constraint that should be re-validated. Add a manifest.ts with name + themeColor.
- **Impatto (scalabilità/sicurezza/performance):** SEO/perf: small crawl-budget waste and uncached per-request OG rendering; negligible for a private app but trivially fixable.
- **Rischio futuro:** If a public marketing/landing surface is added later (root page.tsx already redirects, anticipating one), the missing robots/sitemap/canonical foundation will need to be built from scratch.
- **Nota verificatore:** not independently re-verified (MEDIO/BASSO)

#### 100. Pervasive muted-foreground text on cards risks failing WCAG 1.4.3 contrast (esp. dark mode and tinted org themes)

- **Gravità:** BASSO  ·  **Priorità:** P3  ·  **Tipo:** design  ·  **Confidence:** medium  ·  **Verdetto verifica:** confirmed
- **Dimensione:** SEO, Metadata, Accessibility & Mobile Responsiveness
- **Dove:** globals.css:17 (--muted-foreground 240 6% 44% light) and :138/:114 (dark 240 8% 64%); applied as text-muted-foreground extensively, e.g. prospect-card.tsx:157,167; marketer-kpis.tsx:62; topbar.tsx:146; data-table.tsx:144; plus reduced-opacity variants like text-treeNode-foreground/45 (marketer-node.tsx:76) and text-muted-foreground/60 (board-column.tsx:158)
- **Perché è un problema:** --muted-foreground at L=44% on the card background, and especially the dark-mode L=64% on dark cards, sits near the 4.5:1 AA threshold for the small (text-xs/[10-11px]) labels it's used for; many places further reduce it with /45–/60 opacity, pushing effective contrast below AA for normal text. Org-admin theme overrides (themeVars on AppShell) can tint backgrounds and break the assumed ratios entirely.
- **Conseguenza reale:** Low-vision users struggle to read secondary labels (owner names, KPI captions, stage hints, table headers, empty-state text). Likely AA failures on the smallest captions and all the opacity-reduced variants; org custom themes can make it worse with no guardrail.
- **Come riprodurlo:** Run an axe/Lighthouse contrast audit on a prospect card / KPI strip in dark mode, and on the tree-node KPI captions (text-treeNode-foreground/45 on near-black). Inspect any text-muted-foreground/60 caption.
- **Come risolverlo:** Bump --muted-foreground to >=4.5:1 against card in both themes (e.g. lighten dark-mode value, darken light-mode value), and avoid stacking opacity modifiers on already-muted text used at <14px. Add an automated contrast check in CI for the token palette; clamp/validate org theme overrides.
- **Impatto (scalabilità/sicurezza/performance):** Accessibility: borderline AA contrast across many secondary labels; amplified by user-supplied org themes.
- **Rischio futuro:** Every new caption defaults to text-muted-foreground, so the marginal-contrast pattern keeps spreading; org theming feature can silently regress contrast.
- **Nota verificatore:** not independently re-verified (MEDIO/BASSO)

#### 101. Genealogy canvas (React Flow) consumes ~full viewport height on touch, contending with page scroll and lacking a mobile fallback

- **Gravità:** BASSO  ·  **Priorità:** P3  ·  **Tipo:** design  ·  **Confidence:** medium  ·  **Verdetto verifica:** confirmed
- **Dimensione:** SEO, Metadata, Accessibility & Mobile Responsiveness
- **Dove:** web/components/genealogy/genealogy-view.tsx:150 (Card h-[calc(100vh-8rem)] min-h-[520px]); canvas web/components/genealogy/genealogy-canvas.tsx:270-321 (ReactFlow with pan/zoom, no touchAction guidance)
- **Perché è un problema:** On a phone the binary tree is rendered in a ~100vh React Flow surface that captures touch for pan/zoom. The node cards are NODE_WIDTH-fixed and the tidy binary layout is wide, so the small-screen experience is heavy panning inside a viewport-filling canvas that competes with normal page scroll; there is no simplified/list view for narrow screens.
- **Conseguenza reale:** Two-finger/one-finger gesture ambiguity (scroll the page vs pan the tree) makes the genealogy hard to use on mobile; users can get 'stuck' inside the canvas. Functional but poor on the primary differentiator feature for touch users.
- **Come riprodurlo:** Open /genealogia on a phone-sized viewport; try to scroll past the tree — the gesture pans the canvas instead; the wide binary layout requires extensive panning to read nodes.
- **Come risolverlo:** Constrain canvas height on small screens (e.g. h-[60vh] sm:h-[calc(100vh-8rem)]), ensure React Flow panOnScroll/zoomOnPinch settings don't trap page scroll, and consider a compact list/accordion fallback for the tree below a breakpoint.
- **Impatto (scalabilità/sicurezza/performance):** Responsive/mobile: degraded touch UX on the flagship genealogy view; no data/correctness impact.
- **Rischio futuro:** As trees grow, the mobile panning problem worsens; retrofitting a mobile tree view later is non-trivial.
- **Nota verificatore:** not independently re-verified (MEDIO/BASSO)

#### 102. No themeColor / viewport metadata export; auth screen is a fixed dark canvas with light system chrome

- **Gravità:** BASSO  ·  **Priorità:** P3  ·  **Tipo:** tech_debt  ·  **Confidence:** high  ·  **Verdetto verifica:** confirmed
- **Dimensione:** SEO, Metadata, Accessibility & Mobile Responsiveness
- **Dove:** web/app/layout.tsx:15-37 (Metadata only, no `export const viewport`); auth shell hard-codes dark bg web/app/(auth)/_components/auth-shell.tsx:43 (bg-[#070710])
- **Perché è un problema:** Next 14 auto-emits a default viewport meta so zoom/responsiveness aren't blocked (good — no maximum-scale lock found), but there is no `themeColor`. The auth pages render an always-dark backdrop regardless of OS theme, so mobile browser UI (address bar) won't match, and there's no PWA theme color.
- **Conseguenza reale:** Cosmetic: on mobile the browser chrome color doesn't match the dark auth canvas; no installable theme identity. No functional impact.
- **Come riprodurlo:** Open /accedi on mobile Chrome/Safari — the browser toolbar stays light against the dark page; no theme-color meta in view-source.
- **Come risolverlo:** Add `export const viewport: Viewport = { themeColor: [{ media: '(prefers-color-scheme: dark)', color: '#070710' }, { media: '(prefers-color-scheme: light)', color: '#ffffff' }] }` to web/app/layout.tsx.
- **Impatto (scalabilità/sicurezza/performance):** Polish/PWA: minor visual mismatch of mobile browser chrome; no accessibility or functional impact.
- **Rischio futuro:** Needed if a PWA/installable experience is pursued; trivial now, easy to forget.
- **Nota verificatore:** not independently re-verified (MEDIO/BASSO)

#### 103. deleteOrgDocument deletes the DB row before removing storage bytes (best-effort, unchecked) → orphaned files

- **Gravità:** BASSO  ·  **Priorità:** P3  ·  **Tipo:** bug  ·  **Confidence:** medium  ·  **Verdetto verifica:** confirmed
- **Dimensione:** Server Actions, Data Layer Correctness, Transactions & Resilience
- **Dove:** web/lib/data/org-documents.ts:95-108 (row delete 99, storage.remove 103 unchecked)
- **Perché è un problema:** The function hard-deletes the org_documents row first, then best-effort removes the storage object without checking the result. If storage.remove fails (or throws after the row is gone), the file is orphaned in the public org-assets bucket with no DB pointer to ever find/clean it.
- **Conseguenza reale:** Storage leaks public files that remain downloadable by URL even though the document was 'deleted'; gradual bucket bloat and a minor data-exposure surprise (deleted doc still fetchable if URL known).
- **Come riprodurlo:** Delete an org document while storage.remove fails (e.g. wrong path / transient): row gone, object remains in org-assets.
- **Come risolverlo:** Remove storage first (or capture and surface the storage error), and/or run a periodic reconciler. Consider soft-delete + async purge so the pointer survives until bytes are confirmed gone.
- **Impatto (scalabilità/sicurezza/performance):** Minor storage leak + lingering public access to 'deleted' files.
- **Rischio futuro:** Bucket grows unbounded; the public bucket means orphans stay accessible.
- **Nota verificatore:** not independently re-verified (MEDIO/BASSO)

#### 104. CRM write actions have no revalidatePath — full-page navigation after a masked failure shows stale/inconsistent data

- **Gravità:** BASSO  ·  **Priorità:** P3  ·  **Tipo:** design  ·  **Confidence:** medium  ·  **Verdetto verifica:** confirmed
- **Dimensione:** Server Actions, Data Layer Correctness, Transactions & Resilience
- **Dove:** web/app/(app)/contatti/actions.ts, chiamate/actions.ts, lista-contatti/actions.ts, sette-perche/actions.ts, documenti/actions.ts, presenze/actions.ts, team/[id]/actions.ts (none call revalidatePath); contrast percorso-prospect/actions.ts:35-38, org/actions.ts:25-49, impostazioni/actions.ts which do
- **Perché è un problema:** These actions return serializable envelopes for client islands to patch local state and deliberately skip revalidatePath. That is fine on success, but combined with the demo-safe masking (an ok:false/optimistic data return), a user who hard-navigates or refreshes after a silently-failed or optimistic-only write sees server-rendered data that disagrees with what the client showed. There is no server cache invalidation to reconcile.
- **Conseguenza reale:** Transient UI/DB divergence after failures or in multi-tab sessions; mostly cosmetic because a refresh re-reads the DB, but it can confuse users when an optimistic row 'disappears' on reload.
- **Come riprodurlo:** Create a contact while the insert fails (masked ok:false but optimistic row rendered); navigate away and back: the row is gone.
- **Come risolverlo:** This is acceptable as a design choice IF failures are surfaced honestly; the real fix is in the masking findings. Optionally add targeted revalidatePath on confirmed real writes for parity with the prospect/org actions.
- **Impatto (scalabilità/sicurezza/performance):** Minor staleness; amplified by the error-masking issues above.
- **Rischio futuro:** Low; becomes more visible if optimistic flows expand.
- **Nota verificatore:** not independently re-verified (MEDIO/BASSO)

#### 105. org_documents has RLS enabled but NOT forced (rls_forced=false), inconsistent with every other table

- **Gravità:** BASSO  ·  **Priorità:** P3  ·  **Tipo:** tech_debt  ·  **Confidence:** high  ·  **Verdetto verifica:** confirmed
- **Dimensione:** Supabase RLS & DB Function Security (live)
- **Dove:** public.org_documents (relrowsecurity=true, relforcerowsecurity=false); all 26 other public tables have FORCE RLS
- **Perché è un problema:** Every other public table sets FORCE ROW LEVEL SECURITY so that even the table owner is subject to RLS; org_documents does not. With FORCE off, the table-owner role (and any process running as owner, e.g. a SECURITY DEFINER function owned by that role that queries org_documents) bypasses the org_documents RLS policies entirely. authenticated/anon are not the owner so client access is still policy-bound, but the inconsistency removes a layer of protection that the rest of the schema relies on.
- **Conseguenza reale:** Any current or future owner-context code path (definer function, admin job) reading/writing org_documents skips the carefully-written scope/team_branch visibility rules, risking cross-team document exposure through that path.
- **Come riprodurlo:** Compare pg_class.relforcerowsecurity: org_documents=false vs e.g. internal_documents=true. A SECURITY DEFINER function owned by the table owner selecting from org_documents would not have RLS applied.
- **Come risolverlo:** ALTER TABLE public.org_documents FORCE ROW LEVEL SECURITY to match the rest of the schema.
- **Impatto (scalabilità/sicurezza/performance):** Removes the owner-bypass guard for the document-sharing table; low today but a latent inconsistency.
- **Rischio futuro:** When document-related SECURITY DEFINER helpers are added (the codebase already trends that way), they will silently bypass org_documents RLS.
- **Nota verificatore:** not independently re-verified (MEDIO/BASSO)

#### 106. 23 functions have a mutable (unset) search_path

- **Gravità:** BASSO  ·  **Priorità:** P3  ·  **Tipo:** tech_debt  ·  **Confidence:** high  ·  **Verdetto verifica:** confirmed
- **Dimensione:** Supabase RLS & DB Function Security (live)
- **Dove:** public functions flagged by advisor function_search_path_mutable: create_invitation, revoke_invitation, duplicate_document, save_document_version, period_bounds, jsonb_delta, jsonb_delta_pct, prospect_stage_order, bottleneck_severity_rank, prospects_open_first_event, deny_audit_mutation, set_updated_at, uuid_label, and the JWT helpers current_org_id/current_marketer_id/current_app_role/current_rank/current_membership_status/current_membership_active/current_can_access_crm/is_org_admin/is_co_admin (full list in advisor)
- **Perché è un problema:** These functions do not SET search_path. All of them are SECURITY INVOKER (run with caller privileges), so the classic search_path-privilege-escalation does not apply, but unqualified object references can still be resolved against a caller-controlled search_path, and the project's own SECURITY DEFINER functions explicitly set search_path — these are the inconsistent stragglers. create_invitation/revoke_invitation/duplicate_document/save_document_version perform writes and are EXECUTE-able by authenticated/PUBLIC.
- **Conseguenza reale:** Hardening gap and inconsistency; if any of these were ever switched to SECURITY DEFINER (e.g. duplicate_document/save_document_version are write helpers that could plausibly be made definer), they would immediately become search_path-injection targets.
- **Come riprodurlo:** get_advisors(security) returns 23 function_search_path_mutable WARN lints; confirmed via proconfig being NULL for these functions.
- **Come risolverlo:** Add SET search_path = '' (and schema-qualify all references) or SET search_path = public to each, matching the convention already used by the SECURITY DEFINER functions.
- **Impatto (scalabilità/sicurezza/performance):** Minor hardening / consistency; preempts a future escalation if any are promoted to SECURITY DEFINER.
- **Rischio futuro:** A later 'SECURITY DEFINER' change to any write helper turns this latent issue into an exploitable injection.
- **Nota verificatore:** not independently re-verified (MEDIO/BASSO)

#### 107. guard_marketer_structural_cols lets any member change rank/status of their entire downline (including over-promotion)

- **Gravità:** BASSO  ·  **Priorità:** P3  ·  **Tipo:** design  ·  **Confidence:** medium  ·  **Verdetto verifica:** confirmed
- **Dimensione:** Supabase RLS & DB Function Security (live)
- **Dove:** public.guard_marketer_structural_cols() trigger (BEFORE UPDATE on marketers) + RLS marketers_update (USING/WITH CHECK = can_see_marketer(id))
- **Perché è un problema:** The trigger blocks structural/tenancy column changes for non-admins (good) and restricts rank/status changes to rows where the caller is an ancestor with depth>=1. But it imposes no ceiling: a non-admin can set a downline member's rank to ANY value, including a rank higher than the caller's own. There is no 'cannot exceed your own rank' or 'cannot change your own rank' check, and no limit on status transitions.
- **Conseguenza reale:** A team leader can arbitrarily inflate (or zero out) ranks/status of anyone beneath them, corrupting rank_history (auto-synced by marketers_rank_history_sync), leaderboards, eligibility and reporting; over-promotion can grant downline members CRM eligibility logic they shouldn't have.
- **Come riprodurlo:** As a non-admin member, UPDATE public.marketers SET rank='global_director' WHERE id='<a downline id with depth>=1>'. RLS USING/WITH CHECK can_see_marketer passes; structural guard allows because it only checks ancestry, not rank ceiling.
- **Come risolverlo:** In the trigger, when NEW.rank changes for a non-admin, require the new rank's sort_order <= the caller's own rank sort_order (and forbid changing one's own rank); optionally constrain status transitions to an allowed set.
- **Impatto (scalabilità/sicurezza/performance):** Data-integrity/business-rule weakness in the rank system rather than a tenant breach (still org+subtree bounded).
- **Rischio futuro:** As compensation/eligibility increasingly keys off rank, unchecked downline promotion becomes a fraud/abuse vector.
- **Nota verificatore:** not independently re-verified (MEDIO/BASSO)

#### 108. invitation_context() exposes invitee PII (email, name, rank, org) to anon for any valid token_hash

- **Gravità:** BASSO  ·  **Priorità:** P3  ·  **Tipo:** security  ·  **Confidence:** medium  ·  **Verdetto verifica:** confirmed
- **Dimensione:** Supabase RLS & DB Function Security (live)
- **Dove:** public.invitation_context(p_token_hash text) — SECURITY DEFINER, EXECUTE granted to anon (and authenticated/PUBLIC)
- **Perché è un problema:** The function returns marketer display_name, email, rank, role and org name for any pending, non-expired token_hash, callable unauthenticated. token_hash is the only secret (UNIQUE). This is intended for the public accept-invite page, but it means token secrecy is the sole control over a PII disclosure, and it pairs with the accept_invitation weakness above.
- **Conseguenza reale:** Anyone holding a token_hash (e.g. leaked invite link, log, referrer) can retrieve the invitee's email and org details without authenticating; weak/guessable tokens would allow PII enumeration.
- **Come riprodurlo:** POST <project>/rest/v1/rpc/invitation_context with apikey=anon and a valid p_token_hash returns the invitee email/name/rank/org.
- **Come risolverlo:** Return the minimum needed for the accept screen (e.g. org name + masked email), ensure tokens are high-entropy and short-lived, and consider rate-limiting; do not return raw email to anon.
- **Impatto (scalabilità/sicurezza/performance):** Minor PII exposure gated only by token secrecy.
- **Rischio futuro:** Combined with the accept_invitation p_user_id flaw, token exposure escalates from PII leak to account claim.
- **Nota verificatore:** not independently re-verified (MEDIO/BASSO)

#### 109. Double-cast of a Partial to a required type and `as` casts that widen Partial→full in document save path

- **Gravità:** BASSO  ·  **Priorità:** P3  ·  **Tipo:** tech_debt  ·  **Confidence:** medium  ·  **Verdetto verifica:** confirmed
- **Dimensione:** TypeScript Soundness & Input Validation
- **Dove:** web/app/(app)/documenti/actions.ts:59-62 (patch as DocumentInput & { change_note?: string }); web/components/genealogy/genealogy-canvas.tsx:255,314 + marketer-node.tsx:86 (data as unknown as MarketerNodeData)
- **Perché è un problema:** saveVersionAction receives `patch: Partial<DocumentInput> & { change_note?: string }` and casts it to the NON-partial `DocumentInput & { change_note?: string }` before passing to saveVersion — asserting all required DocumentInput fields are present when by type they are not. The genealogy canvas uses `data as unknown as MarketerNodeData` (the only `as unknown as` in the app) to bypass React Flow's node-data typing; these are the only double-casts and rely on runtime invariants the compiler can't see.
- **Conseguenza reale:** If saveVersion ever reads a required DocumentInput field directly (e.g. title) on a patch that omits it, it gets undefined despite the type claiming presence — a latent NPE/empty-write. The React Flow casts break if the node data shape diverges from MarketerNodeData (no compile check).
- **Come riprodurlo:** Call saveVersionAction(id, { change_note: 'x' }) (body/title omitted). The cast tells the compiler title:string is present; saveVersion must defensively handle the missing field at runtime or it writes undefined.
- **Come risolverlo:** Keep saveVersion's parameter as Partial and merge against the existing row inside the data layer (the doc comment says it does merge) — drop the misleading cast. For React Flow, define a typed Node<MarketerNodeData> generic instead of `as unknown as`.
- **Impatto (scalabilità/sicurezza/performance):** Tech debt / latent correctness: a type assertion that lies about field presence.
- **Rischio futuro:** A refactor of saveVersion to read required fields directly would turn this into a runtime bug with no compile warning.
- **Nota verificatore:** not independently re-verified (MEDIO/BASSO)

#### 110. tsconfig lacks noUncheckedIndexedAccess / exactOptionalPropertyTypes; non-null bang used on array indexing

- **Gravità:** BASSO  ·  **Priorità:** P3  ·  **Tipo:** tech_debt  ·  **Confidence:** high  ·  **Verdetto verifica:** confirmed
- **Dimensione:** TypeScript Soundness & Input Validation
- **Dove:** web/tsconfig.json:7 (strict only); web/lib/utils.ts:34-35; web/lib/data/prospects.ts:233 (MOCK_PROSPECTS[0]!); web/lib/data/mock-genealogy.ts:185 (NODE_MAP.get(s.id)!)
- **Perché è un problema:** `strict:true` is on but `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes` are NOT enabled. Without noUncheckedIndexedAccess, array/record indexing is typed as T (not T|undefined), so `parts[0]`, `MOCK_PROSPECTS[0]`, `MOCK_CALL_TARGETS[c.id]` are assumed defined; the code then uses `!` (utils.ts:34-35 `parts[0]!`, prospects.ts:233 `MOCK_PROSPECTS[0]!`) to paper over what the flag would have surfaced. With the flag off, many unchecked indexings elsewhere have no safety net.
- **Conseguenza reale:** Index-out-of-bounds and missing-key accesses are invisible to the compiler. In real DB mode MOCK_PROSPECTS[0]! is harmless (mock array is non-empty), but the pattern normalizes `!` to silence the compiler rather than handle absence; new code indexing dynamic arrays/records gets no warning.
- **Come riprodurlo:** Static: enable noUncheckedIndexedAccess in tsconfig and run tsc — the `!` sites and other dynamic indexings will surface as the errors the flag is designed to catch.
- **Come risolverlo:** Enable `noUncheckedIndexedAccess` (and consider exactOptionalPropertyTypes) and fix the resulting sites with explicit guards instead of `!`. This is the single highest-leverage config change for this dimension given how much code indexes DB-derived arrays/maps.
- **Impatto (scalabilità/sicurezza/performance):** Type-safety hardening: would catch a class of undefined-access bugs the current config allows.
- **Rischio futuro:** Growing the data layer without this flag means dynamic indexing bugs accumulate undetected.
- **Nota verificatore:** not independently re-verified (MEDIO/BASSO)

#### 111. SVG org-logo upload to public bucket rendered org-wide

- **Gravità:** BASSO  ·  **Priorità:** P3  ·  **Tipo:** security  ·  **Confidence:** medium  ·  **Verdetto verifica:** confirmed
- **Dimensione:** Web Pentest: XSS, CSRF, SSRF, Injection, Secrets, CORS, Upload
- **Dove:** web/components/team/org-identity-settings.tsx:71-82,116 (accept '.svg', contentType file.type, getPublicUrl, <img src>); web/components/shell/sidebar.tsx:67 + mobile-nav.tsx:87 (org-wide render); web/lib/data/org-identity.ts:38-55 (action stores arbitrary logo_url)
- **Perché è un problema:** The logo uploader accepts .svg and uploads with the client-supplied content-type to the PUBLIC org-assets bucket, then stores the public URL. The URL is rendered via <img src> in the shell to all members. Script inside an SVG does NOT execute when loaded via <img>, so there is no app-origin XSS. However, the file is served from the Supabase storage public origin as image/svg+xml, so a user who opens the storage URL directly renders the SVG as a document where embedded script runs (in the storage origin, not the app). Separately, updateOrgIdentity() accepts ANY logo_url string from the client without validating it points at the org-assets bucket.
- **Conseguenza reale:** An admin (writes are admin/owner-only via RLS) could plant a malicious SVG whose script runs only if someone visits the raw storage URL — limited, cross-origin to the app, and self-targeted to the admin's own org. The unvalidated logo_url lets an admin set an arbitrary external image URL (privacy/leak of viewer IPs via remote image), but again admin-gated.
- **Come riprodurlo:** Upload a crafted .svg as org logo; it is stored at the public URL with image/svg+xml; opening that storage URL directly executes the embedded script in the storage origin.
- **Come risolverlo:** Disallow SVG for logos (restrict to png/jpg/webp) or force a safe content-type / Content-Disposition on upload; validate server-side in updateOrgIdentity that logo_url is within the expected org-assets public path; consider serving user assets from a separate sandboxed origin.
- **Impatto (scalabilità/sicurezza/performance):** Security: minor — cross-origin/self-targeted, admin-gated; mainly content-type/upload hardening.
- **Rischio futuro:** If logo/asset rendering ever moves to same-origin proxying or inline <svg>, the inert-img protection disappears and this becomes app-origin XSS.
- **Nota verificatore:** not independently re-verified (MEDIO/BASSO)
