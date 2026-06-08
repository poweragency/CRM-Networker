# Pre-launch checklist — Gestionale GG

Stato al 2026-06-08. Niente di distruttivo è stato eseguito: questo è il piano.

## ✅ Già verificato / fatto in questa sessione
- **Performance a 10k nodi**: tree, statistiche, presenze, profilo, login → tutti rapidi (RPC `SECURITY DEFINER`, viewer lazy 150 nodi, paginazione).
- **Login affidabile**: navigazione hard dopo il sign-in (niente più stallo intermittente).
- **Isolamento dati (RLS) come membro** (#1): un utente `member` vede **solo il proprio sottoalbero** (verificato: 7.952 nodi su 10.016, titolare/upline invisibili, RPC fuori-ramo negate con 42501). **Nessun leak.**
- **Hardening RPC** (#8): tolto l'EXECUTE ad `anon`/PUBLIC sulle 14 RPC dati/report/scrittura (migration 0068). `authenticated` ok, `invitation_context` + helper preservati.
- **Advisor Supabase**: 0 errori critici (security + performance). Restano WARN minori (sotto).

## 🔴 Da fare prima di pubblicare
1. **Email di Auth (SMTP)** — di default Supabase usa un mailer limitato/non production. Collegare un SMTP vero (Resend/SendGrid) o conferma/reset password non arrivano (o vanno in spam). Dashboard → Authentication → Emails / SMTP.
2. **Pulizia dati di test** (#3) — vedi sezione dedicata sotto.
3. **Backup** — confermare i backup giornalieri (Pro) attivi; valutare PITR se i dati sono critici. Dashboard → Database → Backups.
4. **Rate limit Auth in produzione** — ora alzato per i test. Rimetterlo a ~**150–300 / 5 min per IP** (non 30: blocca i team su WiFi condivisa; non 3000). Dashboard → Authentication → Rate Limits.

## 🟡 Consigliati
5. **Test su telefono vero**: drag&drop kanban touch, presenze, albero, login.
6. **Test di scrittura in concorrenza**: 2+ utenti che spostano prospect / segnano presenze insieme + realtime; insert/remove sull'albero (i lock ci sono).
7. **Monitoraggio errori** in produzione (Sentry, o alert sui log Vercel/Supabase).

## 🟢 Opzionali / dopo
- WARN advisor residui (impatto trascurabile, tabelle piccole): policy `memberships_select` rivalutata per riga (`auth_rls_initplan`) e policy multiple su `memberships`/`ranks_meta`. Da sistemare con calma, **non** a ridosso del lancio (RLS su tabella critica).
- Estensioni in `public` (ltree, btree_gist, pg_trgm) → cosmetico, lasciare.
- **Burst di login distribuito** (k6 Cloud) solo se previsto un lancio sincronizzato di massa.
- Eventuale **revoca dei grant service_role** concessi per il load test (`marketers` SELECT, `memberships` SELECT/INSERT/DELETE) se si vuole ripristinare il lockdown originale (sono comunque sicuri: ruolo server-segreto).

---

## #3 — Pulizia dati di test (numeri reali)
| | Conteggio |
|---|---|
| Marketer **reali** (creati prima del 2026-06-07) | **18** |
| Marketer **di seed** (dal 2026-06-07) | **9.998** |
| Prospect totali | 60.238 (quasi tutti seed) |
| Lista contatti | 35.762 (quasi tutti seed) |
| Closure | 133.978 |
| Membership | 315 (reali + 300 utenti load-test) |

La separazione è netta per data: **cutoff `2026-06-07`**.

### Opzione A — Progetto di produzione pulito (consigliata, rischio zero)
Tieni QUESTO progetto come **staging/load-test** (utile per i test futuri) e crea un **nuovo progetto Supabase per la produzione**:
1. Nuovo progetto → applica le migration `0001`…`0068`.
2. Ricrea l'owner + i ~18 marketer reali (sono pochi: veloce, niente delete rischiosi).
3. Punta le env di Vercel (URL + anon key) al nuovo progetto.
Vantaggio: produzione **pulita dal primo giorno**, nessun rischio di cancellare dati reali, e mantieni l'ambiente di test.

### Opzione B — Pulizia in-place (stesso progetto/URL)
Solo se vuoi riusare questo progetto. **Backup PRIMA**, poi DRY-RUN, poi delete in transazione.

**1) DRY-RUN (sola lettura) — cosa verrebbe rimosso:**
```sql
with seed as (
  select id from marketers
  where org_id='ad9a57f3-b658-4178-9124-daf2d1904518' and created_at >= '2026-06-07'
)
select
  (select count(*) from seed) as marketers_seed,
  (select count(*) from prospects where owner_marketer_id in (select id from seed)) as prospects_seed,
  (select count(*) from lista_contatti_entries where owner_marketer_id in (select id from seed)) as lista_seed,
  (select count(*) from marketer_tree_closure where ancestor_id in (select id from seed) or descendant_id in (select id from seed)) as closure_seed,
  (select count(*) from memberships where marketer_id in (select id from seed)) as memberships_seed;
```
Controlla che `marketers_seed` ≈ 9.998 e che i 18 reali NON siano inclusi.

**2) DELETE (in transazione, dopo backup):** rimuovere PRIMA le righe figlie, POI i marketer. L'ordine esatto dipende dalle FK presenti — da preparare e verificare con `BEGIN; … ; ROLLBACK;` prima del `COMMIT`. Tabelle figlie tipiche: `prospect_journey_events`, `prospects`, `lista_contatti_entries`, `zoom_attendance`, `seven_whys`, `wishlist_items`, `formazione_progress`, `dmo_day`, `marketer_tree_closure`, `memberships`, infine `marketers`. ⚠️ Da fare assistito, non alla cieca.

**3) Utenti auth di test (load test):**
```
cd loadtest
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npm run cleanup
```

> Raccomandazione: per un lancio sereno, **Opzione A**. L'Opzione B è fattibile (separazione netta per data) ma la facciamo insieme, con backup e dry-run, il giorno del lancio.
