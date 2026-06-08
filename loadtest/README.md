# Load test — trovare il tetto reale di concorrenza

Misura quanti utenti possono loggarsi e usare l'app **contemporaneamente** sullo
stack live (Supabase Auth + PostgREST/RPC), per ogni taglia di compute. Niente
stime: numeri veri, così dimensioni il tier sul tuo target (es. 10k) pagando solo
ciò che serve.

> ⚠️ **Colpisce il progetto LIVE.** Crea utenti di test e genera carico reale.
> Esegui in una finestra a basso traffico (o su una **Supabase branch/clone** con i
> dati seedati) e **fai sempre il cleanup** alla fine. Gli utenti di test hanno email
> `loadtest+...@example.com` e una membership `member` legata a marketer senza account.

## Prerequisiti
- [k6](https://k6.io/docs/get-started/installation/) installato (`k6 version`).
- Node 18+ per il seeding.
- La **service role key** di Supabase (Dashboard → Project Settings → API). NON committarla.

```bash
cd loadtest
npm install            # @supabase/supabase-js per il seeding
```

## 1) Crea gli utenti di test
Quanti utenti distinti vuoi simulare (riusati a rotazione dai VU; non servono 10k
utenti per misurare il throughput — bastano 200–1000 reali):

```bash
SUPABASE_URL=https://qpfnsselgwulrlmlandd.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=eyJ...service-role... \
ORG_ID=ad9a57f3-b658-4178-9124-daf2d1904518 \
COUNT=500 \
npm run seed
# → scrive loadtest/users.json
```

## 2) Lancia il test
`ANON_KEY` = la publishable/anon key (NON la service role).

**Scenario STEADY** — "N utenti attivi che fanno cose" (riusa i token → isola il
tetto DB/RPC, il numero che ti interessa davvero):
```bash
k6 run -e SUPABASE_URL=https://qpfnsselgwulrlmlandd.supabase.co \
       -e ANON_KEY=eyJ...anon... \
       -e SCENARIO=steady -e PEAK_VUS=500 -e THINK=3 \
       login-load.js
```

**Scenario BURST** — "tutti si loggano insieme" (login freschi/sec, stressa Auth+DB):
```bash
k6 run -e SUPABASE_URL=... -e ANON_KEY=... \
       -e SCENARIO=burst -e PEAK_RATE=200 \
       login-load.js
```

Variabili utili: `PEAK_VUS`, `PEAK_RATE`, `RAMP` (default 2m), `HOLD`, `THINK`,
`MAX_VUS`.

## 3) Leggi i risultati
Guarda nell'output k6:
- `login_duration` p95 e `login_errors`
- `rpc_duration` p95 e `rpc_errors`
- `http_req_failed`

**In parallelo** tieni aperta la dashboard Supabase (Reports → Database):
**connessioni attive** e **CPU**. Il *tetto* è dove succede una di queste:
le connessioni vanno al massimo, la CPU satura, i p95 schizzano, o gli errori salgono
(le soglie nel file diventano rosse). Quel numero di VUs/rate è il limite di quel tier.

## 4) Il ciclo per arrivare a 10k
1. Misura sul **Micro** attuale (max_connections 60) → segna il tetto.
2. Alza il **compute** di un gradino (Dashboard → Settings → Compute & Disk) e rilancia.
3. Ripeti finché regge il target con margine. Indicativo connessioni dirette:
   Micro 60 · Small 90 · Medium 120 · Large 160 · XL 240 · 2XL 380.
4. Non dimenticare gli **altri colli** (vedi sotto): Auth, Realtime, Vercel.

## 5) Cleanup (sempre!)
```bash
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npm run cleanup
```

---

## Caveat importanti (leggere)
- **Rate limit di Auth**: da una sola macchina lo scenario `burst` colpisce il rate
  limit *per-IP* di GoTrue, non il DB. Per un vero test di 10k login: usa **k6 Cloud**
  (IP distribuiti) o più macchine, e alza temporaneamente i rate limit in
  Dashboard → Authentication → Rate Limits per la finestra di test.
- **Throughput DB vs Auth**: per misurare solo il DB/RPC usa `steady` (riusa i token).
- **Realtime (Presenze)**: questo test NON apre canali Realtime. Se prevedi tanti utenti
  con Presenze in diretta, è un limite a parte (connessioni Realtime concorrenti del
  piano) — va testato/dimensionato separatamente.
- **Vercel**: questo test va dritto a Supabase (salta il frontend). Il cold start e la
  concorrenza delle funzioni Vercel sono un livello aggiuntivo da considerare nel
  budget end-to-end.

## Cosa serve in pratica per reggere 10k login simultanei (riassunto)
1. **Upgrade compute Supabase** (leva n°1: CPU + RAM + connessioni + pool PostgREST).
2. **Supavisor** (pooler) in transaction mode per il traffico serverless (porta 6543).
3. **Alzare i rate limit di Auth** e verificare la capacità di GoTrue.
4. **Shell statica su CDN** (Vercel edge) + ridurre i cold start.
5. **Dimensionare Realtime** se Presenze è usato in massa.
6. **Spalmare il picco** (apertura anticipata / sala d'attesa): 10k su 1 min = ~167/s.
7. **Questo load test** per validare ogni step con numeri reali.
