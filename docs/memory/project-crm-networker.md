---
name: project-crm-networker
description: CRM Networker — multi-tenant CRM+BI for network marketing; stack, modello, ADR firmati, stato build
metadata:
  type: project
---

**CRM Networker** = piattaforma CRM + Business Intelligence multi-tenant, enterprise, per organizzazioni di network marketing. Path: `e:\POWER AGENCY\SAAS\CRM\CRM Networker`. Repo GitHub: **CRM-Networker** (remote da collegare/push). UI italiana, i18n-ready.

**Stack (locked):** Supabase (Postgres 15 + Auth + RLS + Edge Functions + Realtime + pg_cron) backend; Next.js 14 App Router + TypeScript + Tailwind + shadcn/ui + Recharts frontend.

**Modello core (obbligatorio):** profilo **marketer** ≠ **account** utente. `marketers` esiste senza login (pre-registrazione); `memberships` collega `auth.users` a un profilo ESISTENTE (l'attivazione non ricrea mai il profilo). Multi-tenancy = `org_id` + `FORCE ROW LEVEL SECURITY` su ogni tabella, isolata via claim JWT `org_id` (`current_org_id()`).

**Genealogia = ALBERO BINARIO VERO.** `marketers.parent_id` + `leg` (un figlio LEFT + un RIGHT, partial-unique); `sponsor_id` separato per il credito di recruiting. Closure table (`marketer_tree_closure` + `branch_leg`) + path `ltree` = primitiva unica sia per la visibilità RLS (`can_see_marketer()`) sia per le analytics Left/Right. Placement **operator-driven** (no spillover) → `place_marketer(parent,leg,sponsor,...)`.

**Rank:** executive, consultant, team_leader, senior_team_leader, executive_team_leader, vice_president. CRM-eligible = consultant→vice_president. Attivazione account gated a **rank ≥ team_leader** (sottoalbero) OPPURE admin/owner.

**ADR firmati (2026-05-30)** — `docs/architecture/16-decision-log.md` (AUTORITATIVO, supera 01–15): ADR-001 placement operator-driven; ADR-002 compensi/volumi out-of-scope v1; ADR-003 attivazione rank-gated, flag `can_invite` rimossa (4 flag: crm_access, export_enabled, manage_documents, view_branch_comparison); ADR-004 MFA opzionale/phased; ADR-005…008 fix consistenza (RLS in doc 04/10; coda `app_private.dirty_metric_days`; hook JWT doc 10 §2.2; route map ADR-008).

**STATO BUILD:**
- ✅ **Architettura**: `docs/architecture/00-README.md` … `16-decision-log.md` (17 doc).
- ✅ **Backend Supabase**: `supabase/migrations/0001..0020` (tenancy, albero+closure/ltree triggers, auth/visibility, RLS su 24/24 tabelle, lifecycle, contatti, centos, sette-perché, documenti+versioning, prospects+journey, calls, notifiche, audit, fact layer+MV, leaderboard/bottleneck, reporting, cron) + `seed.sql` + `config.toml` + `BUILD-REPORT.md` (verdetto READY). Fix post-review applicati: O-1 (path in BEFORE INSERT), O-2 (`current_role`→`current_app_role`), O-3 (search_path ltree).
- ✅ **Frontend Slice 1** (`web/`, commit 3107c36): foundation condivisa (design system dark/light next-themes, primitive UI shadcn-style, `lib/types/db.ts`, data-layer Supabase server-only con **fallback mock**, scope provider Global/Sinistra/Destra, nav ADR-008); **auth** (/accedi, /recupera-password, /reimposta-password, /invito/[token]); **app shell** (sidebar gated, topbar con scope/tema/menu, mobile drawer, /dashboard rank-adaptive); **genealogia** binaria React Flow + d3-hierarchy (node card, pannello dettaglio, search, tab Sinistra/Destra). **`next build` verde** (verificato, exit 0, 9 route, gira senza env in modalità demo). Avvio: `npm --prefix web run dev`.
- ⏳ **Validazione DB**: niente Docker/psql locale → migrazioni verificate solo staticamente; vanno applicate con `npx supabase db push` su un progetto Supabase reale (poi iterare sugli errori).
- ⏳ **Git**: repo locale inizializzato (main, 3 commit), memoria in-repo. Remote `CRM-Networker` ancora da collegare/pushare (serve URL).

**COSA MANCA (prossimi step, ordine in 00-README §7):** altre fette frontend — **Slice CRM** (contatti, percorso-prospect board, sette-perché, centos, documenti Tiptap, chiamate), **Slice Analytics** (dashboard/funnel/conversion/team/branch, classifiche, report/export, notifiche), **Slice Admin** (pre-registrazione, attivazioni, ranghi, audit, impostazioni org); **Edge Functions Deno** (create-invitation/activate-account, generate-report-export, pg_net cron fan-out); generazione tipi TS dal DB; provisioning Supabase reale; Realtime; test; hardening.

**Convenzione memoria:** questa è la memoria canonica in-repo. Lo stub a `~/.claude/projects/<slug>/memory/` rimanda qui. Al prossimo avvio: `git pull --rebase` prima di leggere. Vedi global CLAUDE.md.
