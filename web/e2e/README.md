# Smoke E2E (Playwright)

Robot che apre un **browser vero** (Chrome desktop + un profilo mobile Pixel), fa
login e visita tutte le pagine principali, verificando che **non crashino**. È
**read-only** (nessun dato creato/cancellato) → sicuro anche contro la produzione.
Ogni crash che trova finisce anche in **Sentry** (è app + browser reali).

## Una volta sola
```bash
cd web
npx playwright install chromium
```

## Configurazione (variabili d'ambiente)
- `E2E_EMAIL` / `E2E_PASSWORD` — un account reale sul target (consigliato: l'admin/owner, così vede tutte le pagine).
- `E2E_BASE_URL` — opzionale, default = produzione (`https://networker.vercel.app`).

## Lanciare
PowerShell (Windows):
```powershell
$env:E2E_EMAIL="tua@email"; $env:E2E_PASSWORD="password"; npm run test:e2e
```
Con interfaccia grafica (per vederlo cliccare):
```powershell
$env:E2E_EMAIL="tua@email"; $env:E2E_PASSWORD="password"; npm run test:e2e:ui
```
Contro il sito locale invece della produzione:
```powershell
$env:E2E_BASE_URL="http://localhost:3000"; $env:E2E_EMAIL="..."; $env:E2E_PASSWORD="..."; npm run test:e2e
```

## Cosa copre / cosa no
- ✅ Login, render di tutte le pagine principali (desktop + mobile), apertura/chiusura modale anagrafica.
- ❌ Niente operazioni distruttive (aggiungi/rimuovi membro, elimina prospect, ecc.): vanno provate a mano.
- I report con screenshot dei fallimenti finiscono in `playwright-report/` (apri `npx playwright show-report`).
