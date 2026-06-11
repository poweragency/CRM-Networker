# Deploy su Vercel — CRM Networker

L'app Next.js sta nella sottocartella **`web/`** del repo (la root contiene anche `docs/` e
`supabase/`). L'unico passaggio non ovvio è quindi impostare la **Root Directory = `web`** su Vercel.

> 🛑 **SICUREZZA (CRITICO) — NON deployare MAI in produzione senza variabili d'ambiente.**
> In sviluppo locale, senza env, l'app gira in *modalità demo* (dati mock) per comodità.
> ⚠️ **ATTENZIONE: contrariamente a quanto affermava una versione precedente di questo
> documento, l'app NON fa fail-closed.** Verificato dall'audit (2026-06, AUDIT-REPORT.md):
> senza variabili Supabase l'app fa **FAIL-OPEN** — `getCurrentClaims()` ritorna
> `DEMO_CLAIMS` con ruolo `owner` (`web/lib/env.ts`, `web/lib/data/session.ts`,
> `web/middleware.ts`) e serve una shell admin navigabile **a chiunque, senza login**.
> Un deploy di produzione con env mancanti è quindi un'app esposta con admin finto.
> **Imposta SEMPRE tutte le variabili prima del primo deploy** e verifica subito che
> l'URL pubblico reindirizzi al login. TODO aperto: guard di boot in `web/lib/env.ts`
> che blocchi l'avvio se `NODE_ENV=production` e le env mancano.

---

## Metodo A — Dashboard Vercel + GitHub (consigliato, auto-deploy)

1. Vai su **vercel.com** e accedi **con GitHub** (l'account che ha accesso all'org `poweragency`).
2. **Add New… → Project**.
3. **Import** del repository `poweragency/CRM-Networker`.
   - Se non compare: *Adjust GitHub App Permissions* e concedi a Vercel l'accesso all'org `poweragency`
     (o al singolo repo).
4. **Configure Project** — l'unica impostazione critica:
   - **Root Directory** → clicca *Edit* e seleziona **`web`**. ⚠️ Fondamentale.
   - **Framework Preset**: si rileva da solo come **Next.js**.
   - **Build Command / Output / Install**: lascia i **default** (`next build`, gestione automatica,
     `npm install`). Il lockfile usato è `web/package-lock.json`.
5. **Environment Variables**: **impostale ora** (sono obbligatorie in produzione — vedi la tabella
   sotto). Senza, il deploy di produzione fa fail-closed e resta bloccato al login.
6. **Deploy**. In ~1–2 minuti hai l'URL pubblico (es. `crm-networker.vercel.app`).
7. Da qui in poi: ogni **push su `main`** → deploy di produzione automatico; ogni **Pull Request** →
   *Preview Deployment* con URL dedicato.

## Metodo B — Vercel CLI

```bash
npm i -g vercel
cd web
vercel            # primo run: collega/crea il progetto (quando chiede la root, sei già dentro web/)
vercel --prod     # deploy di produzione
```

---

## Variabili d'ambiente (obbligatorie in produzione)

Il frontend è **RLS-bound** e usa la chiave anon nel browser. La service-role è **solo server-side**
(mai `NEXT_PUBLIC`). Aggiungi in Vercel → Project → *Settings → Environment Variables*
(scope: Production + Preview):

| Nome | Valore | Dove trovarlo |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://<ref>.supabase.co` | Supabase → Project Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | la *anon / publishable key* | Supabase → Project Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | la *service_role secret* (server-only) | Supabase → Project Settings → API |

⚠️ `SUPABASE_SERVICE_ROLE_KEY` è un **segreto**: non va MAI prefissato con `NEXT_PUBLIC` né esposto al
client. Serve per creare/eliminare i login dei membri (attivazione account, rimozione dall'albero, inviti);
senza, quei flussi falliscono silenziosamente con `service_missing`.

(`NEXT_PUBLIC_DEFAULT_LOCALE=it` è opzionale: ha già `it` come default. NON impostare `NEXT_PUBLIC_DEMO` in
produzione.)

Dopo averle inserite → **Redeploy** (Deployments → ⋯ → Redeploy). L'app esce dalla modalità demo e
legge i dati reali. Imposta lo stesso set in `web/.env.local` per lo sviluppo locale.

---

## Note

- **Server Actions**: `next.config.mjs` ha `allowedOrigins: ['localhost:3000', '*.vercel.app']`. Same-origin
  è sempre permesso; `*.vercel.app` copre preview/produzione. Se colleghi un **dominio custom**, aggiungilo
  lì e fai un nuovo deploy.
- **Node**: Vercel usa Node 20/22 di default — compatibile con Next 14.
- **Auth Supabase (più avanti)**: in Supabase → Authentication → URL Configuration, imposta *Site URL* e
  *Redirect URLs* sul dominio Vercel (es. `https://crm-networker.vercel.app/**`) perché i link di
  recupero password / invito puntino al sito giusto.
- Il warning Windows `PackFileCacheStrategy` (drive-letter `e:` vs `E:`) **non** appare su Vercel (Linux).
