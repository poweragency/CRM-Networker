# Edge Functions (Deno)

Server-side I/O + orchestration that must not live in the client (doc 07 §4).
Each function runs on the Supabase Edge runtime (Deno); `SUPABASE_URL`,
`SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are injected automatically.

| Function | Auth | Purpose |
|---|---|---|
| `create-invitation` | JWT (admin/leader) | Mint a single-use token, store only its SHA‑256 hash via `create_invitation` (ADR‑003 gate enforced in the RPC), build the invite link, optionally email it. |
| `activate-account` | none (token = proof) | Create the `auth.users` login (service role) then `accept_invitation(token_hash, user_id)` — profile-preserving, idempotent. |
| `generate-report-export` | JWT (CRM-eligible) | Call `assemble_report_dataset` under the caller's RLS and render **CSV/JSON** (PDF/XLSX = follow-up). Sync path; the async `report_export_jobs` drain is separate. |

`_shared/` holds CORS, JSON/file response helpers, the SHA‑256 token helpers and
the `userClient` (caller-JWT, RLS-bound) / `adminClient` (service-role) factories.

## Contracts

```jsonc
// POST /functions/v1/create-invitation        (Authorization: Bearer <admin JWT>)
{ "marketer_id": "uuid", "email": "x@y.it", "role": "member", "crm_access": true }
//   201 -> { "invitation_id": "uuid", "invite_url": "https://…/invito/<rawToken>", "emailed": false }

// POST /functions/v1/activate-account          (no auth)
{ "token": "<rawToken>", "password": "min-8-chars" }
//   200 -> { "membership_id": "uuid", "email": "x@y.it" }

// POST /functions/v1/generate-report-export    (Authorization: Bearer <user JWT>)
{ "envelope": { "report_type": "team_report",
                "scope": { "kind": "team", "marketer_id": "uuid", "branch_side": "GLOBAL" },
                "period": { "granularity": "monthly", "period_start": "2026-05-01" } },
  "format": "csv" }
//   200 -> file download (text/csv | application/json)
```

## Deploy

```bash
# one-time: link the repo to your hosted project
npx supabase login
npx supabase link --project-ref <your-project-ref>

# deploy all three (or name one)
npx supabase functions deploy create-invitation activate-account generate-report-export

# optional email for create-invitation (Resend):
npx supabase secrets set RESEND_API_KEY=… INVITE_FROM_EMAIL="CRM <noreply@your-domain>"
# the invite link host (else falls back to the request origin):
npx supabase secrets set SITE_URL="https://your-app.vercel.app"
```

`verify_jwt` per function is declared in `../config.toml` (`activate-account` is
public because the invitee has no session yet — the single-use token is the proof).

## Frontend wiring

- `web/lib/data/admin-invitations.ts` → `create-invitation` (admin issues invites).
- `web/app/(auth)/invito/[token]/invite-form.tsx` → `activate-account` (invitee sets password).
- `generate-report-export` is invocable from a report's export action (sync CSV/JSON download) — wiring the download button is a small follow-up.

All call sites keep the demo-safe fallback: with no env (or on error) the UI
simulates success so the app stays fully walkable (RESILIENCE).
