# Deploy su Vercel — CRM Networker

L'app Next.js sta nella sottocartella **`web/`** del repo (la root contiene anche `docs/` e
`supabase/`). L'unico passaggio non ovvio è quindi impostare la **Root Directory = `web`** su Vercel.

Senza variabili d'ambiente l'app fa il build e gira in **modalità demo** (dati mock), quindi puoi
deployare subito e vedere l'interfaccia online; collegherai Supabase più avanti.

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
5. **Environment Variables**: per ora **lasciale vuote** (deploy in modalità demo). Vedi sotto per
   quando colleghi Supabase.
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

## Variabili d'ambiente (quando Supabase sarà pronto)

Il frontend è **RLS-bound** e usa SOLO la chiave anon (mai la service-role). Servono **due** variabili,
da aggiungere in Vercel → Project → *Settings → Environment Variables* (scope: Production + Preview):

| Nome | Valore | Dove trovarlo |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://<ref>.supabase.co` | Supabase → Project Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | la *anon / publishable key* | Supabase → Project Settings → API |

(`NEXT_PUBLIC_DEFAULT_LOCALE=it` è opzionale: ha già `it` come default.)

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
