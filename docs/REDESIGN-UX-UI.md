# CRM Networker — Redesign UX/UI Premium

> Analisi multi-agente sul **prodotto reale** (CRM per network marketing). Proposta **solo estetica/UX**, nessuna modifica di logica. Riferimenti: Linear · Stripe · Vercel · Notion · Raycast · Revolut Business.

---

## 1. Shell / Information Architecture / Sidebar / Topbar — CRM Networker (app shell globale)

### 1) Problemi attuali
- Topbar destra sovraccarica: ScopeSwitcher + ThemeToggle + NotificheBell + UserMenu compressi con sm:gap-1.5; 4 affordance in pochi px collassano su small screen e creano una 'parete' di icone ad alto rumore visivo, senza gerarchia (nessun raggruppamento, tutto lo stesso peso).
- Workspace identity ambigua: label 'Workspace' nascosto sotto sm, orgName con truncate che non va mai in overflow perché il label occupa lo spazio; su micro-display non si capisce cosa rappresenti l'header.
- Hamburger mobile senza stato: nessun aria-pressed/active quando il drawer è aperto, il colore non cambia, l'utente non sa se il menu è gia spalancato (rischio doppio-tap / disorientamento).
- Sidebar collapsed w-[4.25rem] = magic value tarato sull'avatar+padding, non allineato a una griglia di rail standard (3rem/3.5rem) -> spaziatura asimmetrica tra icona e bordo, percezione 'non finita'.
- Collapse button salta: con justify-center (collapsed) sta al centro, con justify-between (expanded) salta a destra; discontinuità di posizione che rompe la memoria muscolare e fa sembrare il toggle 'instabile'.
- Section title sparisce in collapsed (!collapsed) ma resta il divider (h-px): il divider promette una sezione il cui nome non c'è -> linee orfane che confondono invece di organizzare.
- space-y-5 identico tra expanded e collapsed: in rail icons-only le icone sono gia separate dal whitespace, lo spacing extra crea 'buchi morti' verticali e allunga inutilmente la colonna.
- Doppia convenzione di separazione: footer con border-t fisso (mx-3) vs item con divider condizionale (separatorBefore) -> due grammatiche di divisione nella stessa nav, lettura incoerente.
- Hover invisibile in collapsed: l'attivo usa bg-primary/10+text-primary ma l'hover resta text-muted/hover:bg-muted appena percettibile sulle icone del rail; il feedback di puntamento è quasi assente.
- Active state incoerente tra stati: accent-bar sinistra (w-0.5) appare solo in expanded; in collapsed resta solo il colore icona e il tooltip non cambia colore -> l'attivo è leggibile a metà nel rail.
- Badge notifiche fragile: posizionamento hard-coded (right-1.5 top-1.5) si disallinea a densità diverse; il troncamento gestisce '9+' ma non numeri a 2 cifre come '10' che escono dalla pillola.
- User menu trigger asimmetrico: nome max-w-[10rem] truncate solo da sm+, quindi su mobile il trigger è 'solo avatar' mentre su desktop è avatar+nome+ruolo -> il componente cambia forma e baricentro tra breakpoint.
- Drawer mobile sproporzionato: w-[17rem] con max-w-[85vw] su 320px = ~272px che mangia quasi tutta la viewport, niente respiro/scrim percepibile, sensazione di overlay invadente.
- Doppio bordo mobile: header del drawer ripete border-b come la topbar -> due linee grigie parallele visibili a drawer aperto, peso visivo raddoppiato in alto.
- Close (X) senza affordance di chiusura primaria: nessuno stato toggle, lo scrim click chiude ma non è segnalato; l'utente non sa quale sia il gesto 'ufficiale' per chiudere.
- Incoerenza di materiale: topbar bg-card/80 backdrop-blur (vetro) vs sidebar bg-card solido; in scroll la topbar si smaterializza mentre la sidebar resta opaca -> due 'piani' con peso visivo diverso, shell non monolitica.
- Icon size h-[18px] w-[18px] ripetuto in 5 punti senza costante di design: cambiare misura per accessibilita richiede find-replace su piu file (debito di tokenizzazione, fonte di drift).
- Animazione collapse parziale: transition solo su width (duration-200), nessun fade su opacity/visibility per label e divider che spariscono di colpo -> collapse 'a scatti', poco premium.
- Search ambigua: placeholder centrale che 'opens nothing yet', sembra un input ma non è focusable sotto lg; l'utente clicca aspettandosi una command palette e non succede nulla -> affordance ingannevole.
- Auth-gate muto: la nav filtra item per rank/role/crm_access ma non spiega perché un marketer vede meno sezioni; nessun segnale -> l'utente non distingue tra 'permesso mancante' e 'bug'.

### 2) Nuova struttura proposta
Shell a 3 zone con grammatica unica e un solo 'materiale vetro' coerente.\n\nA) TOPBAR (h-14, sticky, bg-card/70 backdrop-blur con hairline border-b 1px solo allo scroll via shadow-sm progressiva). Tre cluster con gap a scala (gap-2 / gap-3):\n  - SINISTRA: [hamburger solo <md] + [Logo/Brand mark] + Workspace pill (avatar org + nome org troncabile con ellipsis reale, label 'Workspace' rimosso, sostituito da icona chevron che suggerisce switch). Su <sm resta brand+workspace pill compatta ma sempre leggibile.\n  - CENTRO: trigger Command/Search a forma di pill 'Cerca... ⌘K' (max-w-md, mx-auto) coerente come bottone-trigger, non finto input; cliccabile a ogni breakpoint (su mobile diventa icona-lente nel cluster destro). Apre la command palette gia esistente concettualmente come overlay.\n  - DESTRA: due sotto-gruppi separati da un divider verticale sottile. Gruppo 'contesto' = ScopeSwitcher (sempre presente, su <sm collassa a icona con label nel menu). Gruppo 'sistema' = Notifiche (bell con badge tokenizzato) + ThemeToggle + UserMenu (avatar). Gap-2 tra item, gap-3 tra gruppi -> respiro garantito anche con 4 affordance.\n\nB) SIDEBAR (rail/expanded) larghezza tokenizzata: --rail 3.5rem (collapsed) / --side 16rem (expanded), bg-card/70 backdrop-blur IDENTICO alla topbar (stesso piano-vetro). \n  - HEADER sidebar: collapse-button ANCORATO sempre a destra/in alto (posizione fissa in entrambi gli stati, niente salto). In expanded affianca il brand; in collapsed resta nello stesso slot.\n  - NAV a gruppi: in expanded section-title uppercase + spacing arioso; in collapsed i titoli e i divider SPARISCONO entrambi (coerenza) e i gruppi sono separati solo da spacing ridotto (space-y-2 collapsed vs space-y-6 expanded). Unica convenzione di separazione: spacing + (in expanded) micro-label; il footer usa lo stesso pattern, niente border-t speciale.\n  - NAVLINK con active state unico cross-stato: accent-bar sinistra SEMPRE presente (anche in collapsed, come bar full-height a filo del rail) + icona/testo in primary + bg-primary/8; hover con bg-muted visibile e, in collapsed, tooltip che adotta il colore primario quando l'item e attivo.\n  - FOOTER sidebar: account/help nello stesso linguaggio degli item nav (nessun bordo extra).\n\nC) MOBILE DRAWER: width tokenizzata w-[18rem] con max-w-[88vw] e gutter visibile (scrim scuro/blur, panel staccato dal bordo con leggero margine percepito). Header del drawer SENZA secondo border-b (usa lo stesso piano-vetro, separazione affidata allo scroll-shadow). Close (X) con stato hover/active e aria-label esplicito; scrim documentato come gesto secondario.\n\nIA invariata: stessi gruppi/voci della nav esistente (Dashboard, Statistiche/Team, Binary Viewer, Presenze Zoom, Informativa, Admin...). Item filtrati per permesso restano nascosti ma, dove un item e disattivato per rank, mostra stato 'disabled' con tooltip 'Disponibile dal rango X' invece di sparire silenziosamente (solo presentazione, nessuna nuova logica).

### 3) Motivazioni UX
- Tre cluster nella topbar (contesto a sinistra, ricerca al centro, sistema a destra) creano una gerarchia leggibile in <300ms: l'occhio sa sempre dove guardare per identità, azione e account, riducendo il rumore percepito.
- Gap a scala (gap-2 dentro i gruppi, gap-3 tra gruppi + divider) evita il collasso delle 4 affordance su small screen e comunica 'questi appartengono insieme, quelli no' senza testo -> meno carico cognitivo.
- Posizione fissa del collapse-button in entrambi gli stati preserva la memoria muscolare: l'utente lo ritrova sempre nello stesso punto, eliminando il 'salto' che fa percepire l'UI come instabile.
- Coerenza collapsed: rimuovere insieme titoli E divider quando il rail e icons-only elimina le 'linee orfane'; il significato di gruppo passa allo spacing, che e sufficiente in un rail.
- Active-state unificato (accent-bar sempre presente + colore) rende lo stato attivo leggibile identicamente in expanded e collapsed: l'utente non perde l'orientamento quando comprime la sidebar.
- Materiale vetro unico per topbar+sidebar fonde la shell in un solo piano: durante lo scroll non c'e piu il mismatch tra elemento traslucido e opaco, dando la sensazione 'monolitica' tipica dei prodotti premium.
- Search come bottone-trigger esplicito (con hint ⌘K) elimina l'inganno del finto input: l'affordance dichiara 'ti apro qualcosa al click', e funziona a ogni breakpoint, riducendo i click a vuoto.
- Drawer con gutter e scrim blur restituisce 'breathing room' su phone: il pannello e chiaramente un overlay temporaneo, lo scrim segnala l'area di chiusura, il close-button ha stato -> chiusura prevedibile.
- Stato disabled+tooltip sugli item gated trasforma il silenzio in informazione: l'utente capisce che e un limite di permesso e non un bug, aumentando fiducia nel prodotto (solo presentazione dello stato gia calcolato).
- Hamburger e close con aria-pressed/active forniscono feedback immediato e accessibile: l'utente sa sempre se il menu e aperto, riducendo azioni ripetute e disorientamento.
- Spacing differenziato expanded vs collapsed (space-y-6 vs space-y-2) elimina i 'buchi morti' del rail e mantiene l'ariosita dove serve, ottimizzando densita e respiro per stato.

### 4) Miglioramenti UI
- Tokenizzare le misure: introdurre in globals.css/tailwind --shell-icon (20px), --rail-w (3.5rem), --side-w (16rem), --drawer-w (18rem); un solo punto di verita, niente find-replace su 5 file.
- Un solo materiale-vetro: topbar e sidebar entrambe bg-[hsl(var(--card)/0.7)] backdrop-blur-md; separazione tramite hairline border 1px hsl(var(--border)) e shadow-sm che compare solo allo scroll (scroll-aware), non bordi statici doppi.
- Badge notifiche tokenizzato: pillola h-5 min-w-5 rounded-full, posizionata con offset relativi (-top-0.5 -right-0.5 dentro un wrapper relative), padding orizzontale per ospitare '10'/'99+', colore danger con testo ad alto contrasto.
- Workspace pill: avatar org (rounded-md) + nome con truncate reale max-w-[12rem] + chevron-down; rimosso il label ridondante, l'icona comunica la natura switchabile.
- Accent-bar attiva come pseudo-elemento full-height a filo sinistro (assoluto), 2px, rounded-r, bg-primary; identica in expanded/collapsed -> coerenza visiva dell'attivo.
- Hover/focus states ricchi: hover bg-muted/60, focus-visible ring-2 ring-ring ring-offset-2 su tutti i trigger (hamburger, close, nav, toggle), con transition-colors per fluidita.
- Search-trigger pill: bordo border-input, bg-muted/40, testo muted 'Cerca…', kbd '⌘K' in un <kbd> stilizzato (bg-muted, border, text-xs); hover bg-muted/60.
- Drawer: scrim bg-black/40 backdrop-blur-sm, panel con shadow-2xl e rounded-r-xl, animazione slide-in (translate-x) + fade scrim; header senza border-b, usa scroll-shadow.
- Animazione collapse completa: transition su width + opacity/visibility delle label (transition-[width] e transition-opacity duration-200 ease-out), label con opacity-0 + w-0 in collapsed per fade pulito.
- Tooltip coerenti (Radix/shadcn Tooltip) sulle icone del rail collapsed e sugli item disabled, con freccia e delay 150ms; tooltip dell'attivo eredita il colore primary.
- Divider verticale sottile (w-px h-5 bg-border) tra cluster destro 'contesto' e 'sistema' nella topbar per gerarchia senza box.
- Scala spaziatura: topbar px-4 md:px-6, sidebar py-4 px-2 (rail) / px-3 (expanded), nav-item h-9 rounded-lg gap-3, garantendo target tap >=36px.

### 5) Wireframe concettuale
```
DESKTOP — expanded sidebar + topbar (vetro unico)\n+----------------+----------------------------------------------------------+\n| [≡]  ◐ Brand   |  [🅰 Acme Network ▾]   ( 🔍 Cerca…        ⌘K )   │ Scope▾ ▏ 🔔3 ◐ 🅐 |\n|        [⟨]     +----------------------------------------------------------+\n|                |                                                          |\n| GENERALE       |                                                          |\n| ▎▣ Dashboard   |   (contenuto pagina)                                      |\n|   ◫ Statistiche|                                                          |\n|   ⌥ Binary View|                                                          |\n|                |                                                          |\n| OPERATIVITA    |                                                          |\n|   📹 Presenze   |                                                          |\n|   ⓘ Informativa|                                                          |\n|                |                                                          |\n| AMMINISTRAZ.   |                                                          |\n|   ⚙ Admin      |                                                          |\n|   ⊘ Ranghi(lock|<- disabled + tooltip 'Dal rango Gold'                   |\n|                |                                                          |\n|  ── footer ──  |                                                          |\n|   ? Aiuto      |                                                          |\n|   🅐 Account ▾  |                                                          |\n+----------------+----------------------------------------------------------+\n  ▎ = accent-bar attiva (sempre presente)\n\nDESKTOP — collapsed rail (3.5rem, stesso slot per [⟨])\n+------+----------------------------------------------------------------+\n| ◐ [⟨]|  [🅰 Acme ▾]    ( 🔍 ⌘K )            Scope▾ ▏ 🔔3 ◐ 🅐         |\n+------+----------------------------------------------------------------+\n| ▎▣   |  (tooltip 'Dashboard' al hover, colore primary se attivo)       |\n|  ◫   |                                                                |\n|  ⌥   |   spacing ridotto, NESSUN titolo, NESSUN divider orfano        |\n|  📹  |                                                                |\n|  ⓘ   |                                                                |\n|  ⚙   |                                                                |\n|------|                                                                |\n|  ?   |                                                                |\n|  🅐  |                                                                |\n+------+----------------------------------------------------------------+\n\nMOBILE — drawer aperto (gutter + scrim, no doppio bordo)\n+-------------------------------+········· scrim blur ·········\n| ◐ Brand              [✕]      |                            ·\n|-------------------------------|  (X con stato hover/active) ·\n| GENERALE                      |                            ·\n| ▎▣ Dashboard                  |                            ·\n|   ◫ Statistiche               |                            ·\n|   ⌥ Binary Viewer             |                            ·\n| OPERATIVITA                   |                            ·\n|   📹 Presenze Zoom            |                            ·\n|   ⓘ Informativa               |                            ·\n|-------------------------------|                            ·\n|  🅐 Account ▾                  |                            ·\n+-------------------------------+·····························\n  panel w-[18rem]/max 88vw, slide-in + scrim tap = chiudi (secondario)\n\nMOBILE — topbar (search collassa a icona, hamburger con stato)\n+----------------------------------------------------+\n| [≡•]  🅰 Acme ▾                 🔍  🔔3  🅐          |\n+----------------------------------------------------+\n  [≡•] = aria-pressed=true quando drawer aperto (colore primary)
```

### 6) Componenti da utilizzare
- AppShell / layout grid (sidebar + topbar + main) con CSS vars --rail-w/--side-w/--drawer-w
- Topbar (header sticky, bg-card/70 backdrop-blur, scroll-aware shadow) a 3 cluster
- Brand/Logo mark (icona prodotto, dimensione --shell-icon)
- WorkspacePill (avatar org + nome truncate + chevron, dropdown switch — presentazione dello switch esistente)
- CommandSearchTrigger (button pill 'Cerca… ⌘K' con <kbd>, apre command palette)
- kbd (primitivo shortcut hint)
- ScopeSwitcher (dropdown contesto, sempre presente, collassa a icona)
- NotificationsBell + Badge tokenizzato (wrapper relative, pillola danger min-w-5)
- ThemeToggle (icon button)
- UserMenu (DropdownMenu: avatar + displayName + role/rank Badge + Esci)
- Avatar (sizes sm/md, rounded-md per org, rounded-full per utente)
- Divider verticale (w-px bg-border) tra cluster topbar
- Sidebar (aside, bg-card/70 backdrop-blur, rail/expanded)
- SidebarHeader con CollapseToggle ancorato (PanelLeftOpen/Close)
- SidebarNav (gruppi con spacing differenziato per stato)
- NavSectionLabel (uppercase, muted, solo expanded)
- NavLink (icona + label + accent-bar attiva cross-stato + hover/focus ring)
- Tooltip (Radix/shadcn) per rail collapsed e item disabled
- NavItem disabled state (opacity + cursor-not-allowed + tooltip motivazione permesso)
- MobileNav Drawer (Sheet/Dialog: scrim blur + panel slide-in + CloseButton con stato)
- Button / IconButton primitivo (ghost, sizes, focus-visible ring) per hamburger, toggle, close
- Badge (role/rank, status) coerente in tutta la shell
- ScrollArea per nav lunga con scroll-shadow

### 7) Best practice applicate
- Design tokens come single source of truth: dimensioni icona, larghezze rail/sidebar/drawer e raggi/spacing definiti in globals.css + tailwind.config, mai magic value ripetuti inline (scalabilita e accessibilita in un punto solo).
- Materiale coerente per la shell: topbar e sidebar sullo stesso piano-vetro (bg semi-trasparente + backdrop-blur), separazioni con hairline 1px e shadow scroll-aware invece di bordi statici doppi (linguaggio Vercel/Linear).
- Stati interattivi completi su ogni affordance: default / hover / focus-visible (ring-2 ring-ring) / active / aria-pressed / disabled — accessibilita WCAG e feedback prevedibile (no toggle 'muti').
- Coerenza cross-stato dell'active item (accent-bar + colore identici in expanded/collapsed): l'orientamento non si perde comprimendo la sidebar.
- Progressive disclosure: dettagli (label sezioni, nome workspace, ricerca estesa) compaiono ai breakpoint dove c'e spazio; sotto soglia degradano a icona+tooltip senza perdere funzione (responsive graceful).
- Command-first navigation: search come trigger esplicito con hint ⌘K (pattern Raycast/Linear/Notion) invece di finto input, riducendo i click e dando un punto d'accesso rapido coerente.
- Gerarchia per raggruppamento e spaziatura (gap a scala + divider sottili) invece che per box e bordi: meno rumore, piu respiro, peso visivo controllato.
- Motion intenzionale e ridotta: transizioni su width+opacity (200ms ease-out) per il collapse, slide+fade per il drawer, con rispetto di prefers-reduced-motion; animazioni che spiegano il cambiamento, non decorano.
- Touch target >=36–44px, gutter sul drawer e scrim con area di chiusura segnalata: ergonomia tablet/mobile premium.
- Trasparenza dei permessi: stati disabled con tooltip esplicativo invece di item che spariscono in silenzio, aumentando fiducia (presentazione dello stato gia calcolato, nessuna nuova logica).
- Icon system uniforme (lucide, stroke 1.75, size da token) e tipografia a scala coerente per un'estetica enterprise pulita e leggibile.

---

## 2. Dashboard — "Migliori marketer del mese" (/dashboard, RSC). Componenti: app/(app)/dashboard/page.tsx + components/dashboard/top-marketers-card.tsx; dati da lib/data/dashboard.ts (mock fallback). SOLO redesign estetico/UX, nessuna modifica a logica, dati o funzioni.

### 1) Problemi attuali
- Densita card eccessiva: CardHeader p-5 pb-3 comprime icon-chip + CardTitle + descrizione; le righe della classifica usano space-y-1.5 e py-2, troppo strette per scansionare 5 marketer senza affaticamento (verificato in top-marketers-card.tsx).
- Gerarchia di pagina debole: PageHeader rende il titolo a text-2xl (verificato in page-header.tsx) — insufficiente per reggere 3 classifiche parallele; manca una cornice/banda che unifichi le tre come un unico cruscotto del mese.
- Contrasto avatar scarso: le iniziali usano bg-muted + text-muted-foreground (riga 87), grigio su grigio, AA borderline e identificazione lenta del marketer.
- Affordance di click nascosta: la riga e un Link a /team/[id] ma l'unico segnale e l'hover (hover:border-ring/60 hover:bg-muted/50); a riposo nulla suggerisce la cliccabilita, penalizzando touch/tastiera.
- Doppio segnale 'Tu': la riga is_self ha sia border-primary/40 bg-primary/5 sia il badge testuale 'Tu' (righe 76 e 92-96) — ridondanza che appesantisce la gerarchia.
- Varianza semantica non visualizzata: Zoom e Percorsi sono conteggi, Conversione e un ratio 0..1 formattato con formatPercent, ma le tre card hanno layout identico del valore — confonde la lettura della metrica.
- Rank non renderizzato: TopMarketerEntry.rank (MarketerRank) e gia presente nei dati (mock/dashboard.ts riga 17) e c'e gia un componente RankBadge dedicato, ma il rank non viene mostrato — si perde il contesto di seniority.
- Coloring del podio incoerente: l'array podium = [text-warning, text-foreground, text-muted-foreground] (riga 23) e solo tinta del numero e non dialoga con l'evidenziazione is_self (bg-primary/5).
- Manca lo stato di caricamento: la pagina e force-dynamic ma non esiste app/(app)/dashboard/loading.tsx (a differenza di documenti, sette-perche, percorso-prospect) — nessun feedback durante il fetch, pur essendo gia disponibile il primitivo Skeleton.
- Valore non protetto su viewport stretto: il nome usa flex-1 truncate, ma su mobile la combinazione nome lungo + numero rischia compressione; il valore va ancorato con shrink-0 stabile (parzialmente gia presente, da rinforzare).
- Empty state minimale: solo <p> muted centrato con 'Nessun dato per questo mese' (riga 67) — nessuna icona ne percorso alternativo verso Statistiche o Presenze Zoom.
- Semantica a11y insufficiente: solo il nome e testo significativo; posizione (numero nudo), categoria e unita del valore non sono etichettati per screen reader (manca aria-label sulla riga-Link).
- Icon-chip ridondante: ogni card ripete un chip colorato 9x9 (accentChip) anche se le card sono gia separate per categoria — rumore statico ripetuto 3 volte.
- Geometria posizione disarmonica: numero in w-5 + gap-3 (righe 79-86) crea uno stacco non centrato tra posizione e avatar.

### 2) Nuova struttura proposta
Ricostruzione come "Cruscotto del mese" su superficie continua e low-chrome, riusando esclusivamente i dati gia forniti da getMonthlyTopMarketers (zoom, percorsi, conversion) e i componenti esistenti.

1) HEADER DI PAGINA (PageHeader potenziato esteticamente, py-8, arioso):
- Eyebrow "Dashboard" (uppercase text-xs muted) sopra il titolo.
- Titolo piu prominente (scala visiva da text-2xl verso text-3xl tramite className su PageHeader) "Migliori marketer del mese".
- Sottotitolo discorsivo gia presente con il mese (top_subtitle, month formattato it-IT).
- Slot actions a destra (libero per il ConfigNotice/inline demo gia esistente o link a Statistiche, senza nuove funzioni).
- Divider hairline (border-b) sotto l'header per separare senza box.

2) BANDA "PODIO DEL MESE" (sopra le 3 colonne, riusa SOLO il primo elemento gia presente di ogni categoria entries[0]):
- 3 hero-tile piatte affiancate (grid md:grid-cols-3): per Zoom #1 / Percorsi #1 / Conversione #1.
- Ogni tile: micro-etichetta categoria + avatar grande accent-driven + nome (font-medium) + RankBadge + valore formattato con la formatValue gia passata dalla pagina.
- Nessun dato nuovo: e pura ri-presentazione del leader di ciascuna classifica gia disponibile.

3) GRIGLIA 3 CLASSIFICHE (grid-cols-1 md:grid-cols-2 xl:grid-cols-3, gap-6) — ogni classifica diventa una "sezione" leggera invece di una Card pesante:
- Intestazione di colonna: icona Lucide gia usata (Eye/Route/TrendingUp) ridotta a size-4 monocroma accanto al titolo (niente icon-chip colorato), + micro-descrizione su una riga.
- Lista di 5 righe, ognuna Link a tutta larghezza verso /team/[id] (logica invariata):
  RIGA = [posizione] [avatar accent] [nome + RankBadge] .......... [valore formattato].
  - Posizione: per podio 1-3 pill/medaglia con token (warning per oro, neutri per argento/bronzo); dal #4 numero muted tabular-nums; geometria a dimensione fissa allineata con l'avatar.
  - Avatar: cerchio con tinta derivata dal nome (bg accent tenue + testo accent forte) per contrasto reale.
  - Nome (font-medium) su prima riga, RankBadge (variant dot o pill compatta) su seconda — due livelli al posto del badge 'Tu'.
  - Valore a destra tabular-nums, ancorato shrink-0, formattato per tipo (conteggio vs percentuale, gia gestito da formatValue/formatPercent).
  - Chevron destro leggermente visibile a riposo, che si scurisce in hover, per segnalare cliccabilita.
- Riga is_self marcata da UN SOLO segnale: accent-ring sinistro 2px + nome in primary (rimosso il badge 'Tu' e il background pieno).

4) STATI:
- Loading: nuovo app/(app)/dashboard/loading.tsx con skeleton isomorfo (3 colonne x 5 righe: avatar + 2 righe testo + valore), riusando il primitivo Skeleton.
- Empty per singola categoria: blocco centrato con l'icona della categoria in cerchio muted + frase breve + link soft a Statistiche / Presenze Zoom.

Layout responsive: xl 3 colonne, tablet 2, mobile stack a 1 colonna con valore sempre visibile.

### 3) Motivazioni UX
- Superficie continua a 3 sezioni (anziche 3 Card-box) riduce il rumore dei bordi e fa leggere la pagina come un unico cruscotto comparativo, in linea con dashboard Linear/Vercel.
- Maggiore respiro verticale tra righe (da py-2/space-y-1.5 a ~py-3) e altezza riga costante migliorano la scansione: i 5 marketer si leggono in un colpo (prossimita e ritmo).
- Mostrare il rank gia presente nei dati tramite il RankBadge esistente restituisce contesto di seniority (Consultant vs Team Leader) senza aggiungere funzioni, aumentando il valore informativo per riga.
- Riga interamente cliccabile con chevron sempre lievemente visibile comunica l'affordance prima dell'hover: cruciale per touch/tastiera e riduce i click incerti, senza cambiare la destinazione /team/[id].
- Eliminare il doppio segnale per 'Tu' (background + badge) applica il principio del segnale singolo: un solo accent (ring sinistro + nome primary) e piu elegante e meno affaticante.
- Formattare il valore secondo la sua semantica (conteggio vs percentuale, gia disponibile via formatValue) toglie l'ambiguita tra metriche eterogenee e previene letture errate.
- Avatar a tinta derivata dal nome alza il contrasto e crea un'ancora cromatica costante, accelerando il riconoscimento ripetuto dello stesso marketer tra le 3 classifiche.
- Lo skeleton isomorfo (loading.tsx) riduce la percezione d'attesa e il layout-shift su una pagina force-dynamic, dando una sensazione premium e stabile.
- La banda 'podio del mese' porta subito l'attenzione sui #1 (focal point), rispondendo alla domanda principale dell'utente a zero scroll, riusando dati gia caricati.
- Empty state con icona e link soft trasforma un vicolo cieco in un percorso verso Statistiche/Presenze Zoom, riducendo i passi.
- Etichette a11y esplicite (posizione, categoria, valore+unita) rendono ogni riga comprensibile a screen reader, allineando l'esperienza assistiva a quella visiva.

### 4) Miglioramenti UI
- Gerarchia tipografica su 3 livelli: eyebrow uppercase text-xs muted, titolo verso text-3xl font-semibold tracking-tight (via className su PageHeader, gia supportato), titoli sezione text-sm/base font-medium.
- Spaziatura ariosa: header py-8, gap-6 tra colonne, righe ~py-3 e separatori hairline opzionali al posto di space-y-1.5 compresso.
- Sezioni low-chrome: niente Card-box pesante per classifica; eventuale contenitore con bordo hairline e rounded-xl come delimitazione leggera.
- Icona categoria piccola e monocroma (size-4 text-muted-foreground) accanto al titolo, al posto dell'icon-chip 9x9 colorato ridondante.
- Avatar accent-driven: cerchio size-9/10 con bg-[accent]/12 + text-[accent] e iniziali font-medium (sostituisce bg-muted/text-muted-foreground) per contrasto AA.
- Pill posizione podio con token esistenti: 1 = warning (oro), 2/3 = neutri tenui (border/muted), dal #4 numero muted tabular-nums; dimensione fissa allineata con l'avatar.
- Valore con tabular-nums, font-medium e unita/percentuale chiara (Zoom/percorsi/%), gia prodotta da formatValue, per esplicitare la semantica della metrica.
- Riga is_self: accent-ring sinistro 2px in primary + nome in primary, rimossi il bg-primary/5 pieno e il badge 'Tu' — segnale singolo.
- Hover discreto: bg-muted/40 sulla riga, chevron da text-muted-foreground/40 (a riposo) a text-foreground (hover), transizioni ~150ms ease-out.
- Skeleton tokenizzati con il primitivo Skeleton (bg-muted animate-pulse) per avatar + 2 righe testo + valore, replicati 5x su 3 colonne in loading.tsx.
- Empty state con icona della categoria in cerchio muted + titolo breve + Link soft text-primary, coerente con lo stile delle righe.
- Allineamento robusto su mobile/tablet: nome truncate min-w-0, valore shrink-0 ancorato a destra, cosi il numero resta sempre visibile.

### 5) Wireframe concettuale
```
+---------------------------------------------------------------------------------+
|  DASHBOARD                                                  [ slot azioni / demo ]|
|  Migliori marketer del mese                                                     |
|  I migliori del team per maggio 2026, suddivisi per categoria.                  |
+---------------------------------------------------------------------------------+
|                                                                                 |
|  PODIO DEL MESE                                                                  |
|  +-------------------+  +-------------------+  +-------------------+             |
|  | o Zoom  · #1      |  | o Percorsi · #1   |  | o Conversione ·#1 |             |
|  | (AV) Marco Rossi  |  | (AV) Sara Lemmi   |  | (AV) Luca Pini    |             |
|  |  • Team Leader    |  |  • Consultant     |  |  • Team Leader    |             |
|  |          24 Zoom  |  |       14 percorsi |  |           38,0 %  |             |
|  +-------------------+  +-------------------+  +-------------------+             |
|                                                                                 |
+---------------------------------------------------------------------------------+
|                                                                                 |
|  o Piu Zoom di team        o Piu percorsi fatti       o Conversione piu alta    |
|  Chi ha seguito piu Zoom   Chi ha completato piu      Business Info -> Closing  |
|  -----------------------   -----------------------    ------------------------- |
|  (1)(AV) Marco Rossi  24 > (1)(AV) Sara Lemmi  14 >  (1)(AV) Luca Pini  38,0%> |
|       • Team Leader             • Consultant              • Team Leader          |
| |(2)(AV) Sara Lemmi   19 >|(2)(AV) Marco Rossi 12 > |(2)(AV) Sara Lemmi 31,5%>|  <- is_self: ring-left + nome primary
|       • Consultant              • Team Leader             • Consultant           |
|  (3)(AV) Luca Pini    17 > (3)(AV) Luca Pini   11 >  (3)(AV) Marco Rossi 29,2%>|
|       • Team Leader             • Team Leader             • Team Leader          |
|   4 (AV) Anna Verdi   12 >  4 (AV) Gio Tano     8 >   4 (AV) Anna Verdi 24,0%> |
|       • Consultant              • Consultant              • Consultant           |
|   5 (AV) Gio Tano      9 >  5 (AV) Anna Verdi   6 >   5 (AV) Gio Tano   19,1%> |
|       • Distributor             • Distributor             • Distributor          |
|                                                                                 |
+---------------------------------------------------------------------------------+
 Legenda: o = icona categoria mono (size-4)   (AV) = avatar accent (tinta da nome)
          (n) = pill posizione podio (1 oro)   n = numero muted (>3)
          • Rank = RankBadge esistente         > = chevron (riga cliccabile -> /team/[id])
          | = accent-ring sinistro = riga "Tu" (un solo segnale, niente badge)

--- LOADING (loading.tsx, skeleton x3 colonne) ---     --- EMPTY (per categoria) ---
  (#) (oo) ===========  ====      ===                        ( o ) icona categoria
       ----                                                  Nessun dato per questo mese
  (#) (oo) ===========  ====      ===                        Vai a Statistiche ->
       ----
```

### 6) Componenti da utilizzare
- PageHeader (components/crm/page-header.tsx) — riusato; titolo reso piu prominente via className (es. scala verso text-3xl), eyebrow opzionale, slot actions; nessuna nuova prop logica.
- Sezione classifica low-chrome basata su Card/CardContent esistenti ma con chrome ridotto (oppure div + bordo hairline rounded-xl) al posto del CardHeader p-5 pb-3.
- Riga ranking come Next.js Link a tutta larghezza (gia in uso) con hover/focus-visible:ring-ring gia presenti + aria-label descrittivo aggiunto.
- Avatar: usare il primitivo components/ui/avatar.tsx con varianti accent (bg-[accent]/12 + text-[accent]) al posto di bg-muted/text-muted-foreground.
- RankBadge (components/ui/rank-badge.tsx) GIA ESISTENTE — usato per mostrare TopMarketerEntry.rank (variant dot per le righe, badge per il podio); sostituisce il badge testuale 'Tu'.
- Pill posizione: span con token esistenti (warning per oro, border/muted per 2-3, muted-foreground per >3) e tabular-nums; riusa l'array podium gia presente, reso geometricamente coerente.
- Lucide icons gia importate (Eye, Route, TrendingUp) ridotte a size-4 monocrome; ChevronRight (gia usata altrove) per l'affordance di riga.
- Skeleton (components/ui/skeleton.tsx) GIA ESISTENTE — per il nuovo app/(app)/dashboard/loading.tsx, isomorfo al layout.
- EmptyState (components/crm/empty-state.tsx) GIA ESISTENTE — per l'empty di categoria con icona + testo + Link soft a Statistiche/Presenze.
- ConfigNotice variant inline (gia in pagina) mantenuto per la modalita demo, posizionato in modo arioso.
- Token da web/app/globals.css + tailwind.config.ts: primary, muted, border, warning, info, success, rank-* — nessun colore hardcoded.
- Utility gia disponibili: tabular-nums (in globals.css), truncate + min-w-0, shrink-0, e helper initials/formatPercent/cn da lib/utils.

### 7) Best practice applicate
- Dashboard low-chrome (meno box e bordi, piu spazio bianco e separatori hairline) sullo stile Linear/Vercel per abbattere il rumore visivo.
- Scala tipografica modulare con tracking-tight sui titoli e text-muted-foreground per i livelli secondari, per gerarchia chiara e premium.
- Spacing system coerente a multipli di 4 (py-3, gap-6, py-8) per ritmo verticale arioso e prevedibile.
- Affordance esplicita pre-hover (chevron + cursor + focus-visible:ring gia presente) invece di azioni solo-hover, per accessibilita touch/tastiera.
- Segnale singolo per lo stato: un solo accent per la riga 'Tu' e per il podio, evitando il double-encoding ridondante.
- Formattazione numerica semantica con tabular-nums (gia in globals.css) e Intl/formatPercent (it-IT) per conteggi e percentuali allineati.
- Skeleton screens isomorfi (loading.tsx) per minimizzare il CLS e migliorare la velocita percepita su RSC force-dynamic.
- A11y-first: aria-label di riga (nome + posizione + categoria + valore/unita), contrasto AA su avatar e testi, target touch >= 44px.
- Responsive content-first: grid 1/2/3 colonne (mobile/tablet/desktop) con valore sempre ancorato (shrink-0) e nome in truncate min-w-0.
- Color via design token HSL (globals.css + tailwind.config.ts), zero colori hardcoded, dark-mode-ready per costruzione.
- Riuso di componenti esistenti (RankBadge, Skeleton, EmptyState, Avatar) invece di inventarne di nuovi: coerenza col design system e nessuna modifica di logica.
- Microinterazioni discrete (transizioni ~150ms ease-out su hover/chevron) per una sensazione raffinata e non distraente.
- Empty state orientati all'azione (icona + messaggio + link soft) che mantengono l'utente nel flusso anziche in un vicolo cieco.

---

## 3. Statistiche — roster del team (/statistiche → TeamRoster)

### 1) Problemi attuali
- Densita verticale incoerente: header h-11 (44px) contro righe py-2.5 (10px) genera uno stacco brusco e non premium; manca un ritmo verticale costante.
- Gerarchia colonne piatta: tutte le th/td usano px-3 text-left senza priorita; Nome (identita) e Regione (metadato) pesano visivamente uguale.
- Riga senza affordance: hover solo bg-muted/40, nessun cursor pointer ne feedback sull'intera riga come zona cliccabile; solo il nome e il link.
- Link nome indistinguibile a riposo: text-foreground statico, scopri che e un link solo passandoci sopra (hover:underline) — manca segnale di interattivita.
- Avatar generico: initials grigi bg-muted senza l'activity indicator gia disponibile nei token (hot/warm/cold/dormant) e nel dato (campo activity), spreca un segnale di stato gia presente.
- RankBadge troppo desaturato: tone.bg/12 si appiattisce sul card chiaro, il grado (informazione chiave per una rete commerciale) perde rilevanza.
- Package badge invisibile: variant=secondary (bg-muted + muted-foreground) ha contrasto insufficiente e si confonde con i metadati.
- Dati secondari indistinti: Citta, Regione e Iscrizione tutti text-muted-foreground, senza raggruppamento ne respiro, aumentano il rumore.
- Colonna Team poco enfatizzata: numero nudo tabular allineato a destra, senza visual weight per il 'peso di rete', metrica piu strategica della schermata.
- Nessun ordinamento: header non cliccabili, nessun sort indicator, nessun cursor su th — impossibile riordinare per rank o team size.
- Spaziatura non differenziata: space-y-4 uniforme tra header, search, contatore e tabella; nessuna gerarchia tra toolbar e contenuto.
- Contatore membri marginale: text-sm text-muted-foreground in una riga isolata, si perde e non comunica 'X di Y' durante la ricerca.
- Search senza feedback: nessun conteggio risultati live, nessun highlight dei match, nessun pulsante clear sull'input.
- Empty / no-results poco curati: messaggi generici, non un onboarding moment ne un reset rapido della ricerca.
- Nessuno stato di caricamento: RSC senza Suspense boundary, in caso di latenza la schermata resta vuota invece di mostrare uno skeleton tabella.

### 2) Nuova struttura proposta
Ricostruzione su tre fasce verticali con respiro crescente. (A) PAGE HEADER: titolo 'Statistiche' + sottotitolo, e a destra una sintesi 'pill' del roster (totale membri) per dare contesto immediato senza una riga separata. (B) STICKY TOOLBAR (card-like, sopra la tabella): a sinistra la search ridisegnata (max-w-sm, icona Search a sinistra, pulsante clear 'X' a destra quando valorizzata, contatore live 'N di M' a fianco); a destra un gruppo di segment filter opzionali gia esistenti come dati (filtro per attivita hot/warm/cold/dormant e per rank) resi come chip toggla — solo presentazione del dato gia presente, nessuna nuova logica. (C) DATA TABLE in un'unica Card border rounded-xl: thead sticky top-0 con sfondo card/blur, header h-10 cliccabili (sort) con icona chevron; righe a 56px (h-14) con ritmo costante. Priorita colonne: col 1 MEMBRO (avatar+activity dot, nome primary, citta in sottotitolo: fonde Nome+Citta in una cella identitaria a doppia riga), col 2 GRADO (RankBadge piu saturo), col 3 PACCHETTO (badge tonale per tier), col 4 REGIONE (testo secondario), col 5 ISCRIZIONE (data relativa/assoluta, secondaria), col 6 TEAM allineata a destra come metrica enfatizzata (numero grande tabular + label 'membri', con barra/tono opzionale per peso di rete). L'intera riga diventa zona cliccabile (cursor pointer, hover bg-muted/50 + leggero accent sulla cella nome). Su tablet: la tabella collassa la colonna Iscrizione e Regione in una seconda riga della cella Membro (responsive stacking), mantenendo Grado, Pacchetto e Team. Stati: skeleton table (Suspense) durante il fetch; empty-state onboarding con icona Users e CTA; no-results con icona Search e azione 'Azzera ricerca'.

### 3) Motivazioni UX
- Fondere Nome+Citta+activity in una sola cella identitaria riduce il numero di colonne 'scansionate' dall'occhio e crea un'unica ancora visiva per riga, abbassando il carico cognitivo (pattern Linear/Notion list-row).
- Rendere l'intera riga cliccabile con cursor pointer riduce i click e l'imprecisione del target: l'utente non deve mirare al solo testo del nome (Fitts's law).
- Il contatore live 'N di M' accanto alla search da feedback immediato durante il filtro e sostituisce il contatore isolato, chiarendo l'effetto della ricerca.
- Il pulsante clear sulla search accorcia il percorso per ripristinare la lista intera (un click invece di selezionare e cancellare).
- Sort sugli header trasforma una lista statica in uno strumento di analisi (es. ordinare per Team size o per Grado) senza aggiungere pagine o funzioni: usa dati gia presenti.
- Ritmo verticale costante (header h-10, righe h-14) e spaziatura differenziata tra toolbar e tabella danno la sensazione di prodotto curato e 'calmo', riducendo il rumore percepito.
- L'activity dot sull'avatar sfrutta un dato gia disponibile (campo activity) per comunicare a colpo d'occhio chi e attivo, valore alto per chi gestisce una rete commerciale.
- Lo skeleton evita lo schermo bianco in latenza, mantenendo la percezione di reattivita (perceived performance).
- Empty-state come onboarding moment trasforma la lista vuota in un momento guida invece di un vicolo cieco.
- Su tablet lo stacking delle colonne secondarie nella cella Membro preserva le informazioni chiave senza scroll orizzontale, mantenendo l'esperienza premium anche a larghezza ridotta.

### 4) Miglioramenti UI
- Cella MEMBRO a doppia riga: Avatar (con activity dot ring usando StatusDot/token activity-*), nome in font-medium text-foreground + freccia/indizio link, citta in text-xs text-muted-foreground sotto.
- Nome come link-affordance a riposo: peso medium + colore foreground ma con hover:text-primary e transizione, e l'intera riga group-hover che evidenzia la cella nome (group/row pattern).
- RankBadge piu saturo: alzare il fill da /12 a /15-/18 e rendere il dot tono pieno, mantenendo i token rank-* esistenti (nessun nuovo colore).
- Package badge tonale: usare un badge con tono per tier (signature/premium/standard/starter) basato su outline/accent gia disponibili invece di secondary grigio, per dare leggibilita e gerarchia di tier.
- Colonna TEAM enfatizzata: numero in text-base font-semibold tabular-nums allineato a destra con micro-label 'membri' in caption, opzionale mini-bar tonale (branch-global/primary) per peso relativo.
- Header tabella sticky con sfondo card e backdrop-blur, testo text-xs uppercase tracking-wide muted, chevron sort che appare on-hover e diventa solido quando attivo.
- Hover riga: bg-muted/50 + cursor-pointer su tutta la tr; focus-visible ring per navigazione da tastiera (accessibilita).
- Search ridisegnata: icona Search a sinistra, clear X a destra, ring di focus token-driven, e badge 'N di M' a fianco.
- Spaziatura: gap maggiore (space-y-6/gap-4) tra header, toolbar e tabella; padding cella px-4 e altezza riga 56px per respiro.
- Zebra opzionale leggerissima (odd:bg-muted/20) o, in alternativa, divide-y sottile per scansione, con last:border-0.
- Skeleton table: 6-8 righe placeholder con barre per avatar/nome/badge/numero durante Suspense.
- Empty/no-results: card centrata, icona in cerchio muted, titolo, descrizione e Button (outline per 'Azzera ricerca').

### 5) Wireframe concettuale
```
┌──────────────────────────────────────────────────────────────────────────────┐
│  Statistiche                                              ╭───────────────────╮ │
│  L'elenco dei ragazzi del team. Clicca un nome…          │  48 membri del team│ │
│                                                           ╰───────────────────╯ │
├──────────────────────────────────────────────────────────────────────────────┤
│  ┌──────────────────────────────┐    [ Hot ][ Warm ][ Cold ]   [ Tutti i ▾ ] │
│  │ 🔍  Cerca un membro…      ✕  │     12 di 48 risultati          gradi       │
│  └──────────────────────────────┘                                             │
├──────────────────────────────────────────────────────────────────────────────┤
│ ╭────────────────────────────────────────────────────────────────────────────╮│
│ │ MEMBRO ▴            GRADO ⇅      PACCHETTO   REGIONE     ISCRIZIONE    TEAM ⇅ ││  ← sticky
│ ├────────────────────────────────────────────────────────────────────────────┤│
│ │ ⬤MR  Marco Rossi    ●Team Lead.  [Premium]   Lombardia   12 mag 2024    128  ││
│ │ hot  Milano                                                            membri││
│ ├────────────────────────────────────────────────────────────────────────────┤│
│ │ ⬤LB  Luca Bianchi   ●Consultant [Standard]  Lazio       03 gen 2025     54  ││
│ │ warm Roma                                                              membri││
│ ├────────────────────────────────────────────────────────────────────────────┤│
│ │ ⬤GV  Giulia Verdi   ●Executive  [Starter]   Veneto      28 feb 2025     19  ││
│ │ cold Padova                                                            membri││
│ ╰────────────────────────────────────────────────────────────────────────────╯│
└──────────────────────────────────────────────────────────────────────────────┘
  riga intera cliccabile · hover:bg-muted/50 · activity dot = ⬤ (token activity-*)

  ── NO RESULTS ──────────────────         ── LOADING (skeleton) ───────────────
  ┌────────────────────────────┐           │ ▭▭  ▭▭▭▭▭▭   ▭▭▭   ▭▭▭▭   ▭▭   ▭▭ │
  │         ( 🔍 )             │           │ ▭▭  ▭▭▭▭▭▭   ▭▭▭   ▭▭▭▭   ▭▭   ▭▭ │
  │     Nessun risultato        │           │ ▭▭  ▭▭▭▭▭▭   ▭▭▭   ▭▭▭▭   ▭▭   ▭▭ │
  │  Nessun membro corrisponde  │           └───────────────────────────────────
  │    [ Azzera ricerca ]       │
  └────────────────────────────┘
```

### 6) Componenti da utilizzare
- PageHeader (title + subtitle) con slot azioni a destra per il pill di conteggio totale
- Card (web/components/ui/card.tsx) come contenitore tabella rounded-xl border bg-card shadow-sm
- Input (search) con icona Search lucide-react a sinistra + Button ghost size=icon (X / lucide) come clear a destra
- Avatar (web/components/ui/avatar.tsx) con src=avatar_url e fallback initials — gia supporta entrambi
- StatusDot (web/components/ui/status-dot.tsx, tone hot/warm/cold/dormant, pulse per hot) come activity indicator sull'avatar/cella membro
- RankBadge (variant badge, fill piu saturo via className) per la colonna Grado
- Badge (web/components/ui/badge.tsx) con variant tonale per il tier pacchetto (outline/info/default) al posto di secondary
- Button (variant outline/ghost, size sm/icon) per clear search, 'Azzera ricerca' nell'empty e chip filtro
- EmptyState (web/components/crm/empty-state.tsx) per empty e no-results con action Button
- Skeleton (web/components/ui/skeleton.tsx) per lo stato di caricamento della tabella dentro un <Suspense> boundary
- table HTML nativa con thead sticky + header sort (chevron lucide ChevronUp/Down) e tbody divide-y
- Link next/link che avvolge la riga/cella nome (zona cliccabile)
- Token: --activity-*, --rank-*, --branch-global, tabular-nums (gia in globals.css/tailwind.config.ts)

### 7) Best practice applicate
- List-row pattern stile Linear/Notion: cella identitaria a doppia riga (nome + meta) che riduce il numero di colonne percepite e crea una sola ancora visiva.
- Riga interamente cliccabile con cursor-pointer e focus-visible ring (Fitts's law + accessibilita da tastiera).
- Sticky table header con backdrop-blur e sfondo card per mantenere il contesto durante lo scroll (pattern Stripe/Vercel dashboard).
- Ritmo verticale costante e spaziatura differenziata per fasce (header/toolbar/tabella) per un layout 'calmo' e premium.
- Skeleton + Suspense per perceived performance, evitando schermate bianche in latenza.
- Feedback di ricerca in tempo reale (N di M) e clear-button per chiudere il loop interazione.
- Gerarchia tipografica deliberata: identita primaria (foreground), metriche enfatizzate (semibold tabular), metadati secondari (muted) — niente flat hierarchy.
- Uso coerente dei design token gia esistenti (activity/rank/branch ramp) invece di colori arbitrari, per coerenza di sistema.
- Tabular numerals su tutte le metriche (Team, date) per allineamento ottico pulito.
- Empty-state come onboarding moment con CTA, non come vicolo cieco (pattern Stripe/Notion).
- Responsive graceful degradation su tablet: collasso delle colonne secondarie nella cella identita invece di scroll orizzontale.
- Stati interattivi completi (rest/hover/focus/active) e prefers-reduced-motion rispettato per le transizioni e il pulse dell'activity dot.

---

## 4. Profilo marketer /team/[id] - CRM Networker (network marketing SaaS)

### 1) Problemi attuali
- Header profilo piatto: avatar + nome + status badge + metriche binarie (Sinistra/Destra/Team) compressi in una sola riga flex. Su mobile collassa in colonna e perde l'allineamento identita-vs-metriche. I colori branch-left (HSL 265 70% 58%) e branch-right (HSL 170 70% 42%) sono appena percettibili, e i label 'Sinistra'/'Destra' usati come fallback diventano rumore visivo.
- Anagrafica sovraccarica: 9 campi read-only + 9 editable + 1 textarea note in una griglia 3 colonne. Le label uppercase text-xs sono troppo piccole per lo scan, lo spazio label-valore e solo 4px (space-y-1). In edit mode gli input inline (h-9) non cambiano la dimensione/peso della label, creando confusione tra label e campo durante l'editing.
- Edit mode senza confini visivi: EditableField commuta display/children su un booleano `editing`. Nessun feedback di 'modifiche non salvate', nessun bordo/colore che marchi la card come 'in modifica', nessun indizio che i campi grigi siano inline-editable. Chi apre la pagina non capisce cosa e modificabile.
- RankBadge incoerente: renderizzato dentro un <dd> nudo, il badge ha font-semibold mentre tutti gli altri campi hanno value text-sm: il rank 'salta fuori' rispetto al resto. Il pattern ReadField (label text-xs uppercase tracking-wide ripetuto 6 volte) e rigido e poco riusabile.
- Tab Prospects/Centos senza stato visivo chiaro al primo render: il default deriva da parseTab(searchParams) ma non c'e indicatore forte di quale tab e attivo, e il sync con il routing puo risultare ambiguo al reload.
- PersonalFiles 'understated' sotto i tab: le FileCard (7 Perche, 100's list) hanno role=button + onClick/onKeyDown ma niente stato 'focused'/'selected' chiaro oltre a focus-visible:ring-2, niente placeholder quando i dati non sono ancora caricati, e su schermi 320px diventano full-width allungando la pagina.
- WishlistManager senza feedback al limite di 100 item: il bottone Add e disabilitato solo su titolo vuoto o saving, non quando si raggiunge il massimo. Su mobile il form input+select+bottone diventa colonna e il bottone occupa tutta la larghezza. La lista non ha stato vuoto/placeholder e la numerazione puo sembrare confusa durante il salvataggio asincrono.
- Stato di salvataggio monolitico nella Wishlist: `saving` e globale, quindi un toggle/delete su un item disabilita l'intero form di aggiunta. Manca feedback granulare per-item (anti-pattern di loading state unico).
- Flag 'demo' sempre inline e non dismissibile (ConfigNotice): l'intera pagina e marcata demo se anche solo una delle 6 sorgenti dati e demo, ma l'utente non ha un modo di archiviare/ridurre questo avviso, che resta clutter persistente.
- Stati vuoti fuori contesto: EmptyState di SevenWhys/Centos e visibile a page load (fuori dalla Modal) prima ancora che l'utente apra il file, generando clutter visivo. CardHeader dell'Anagrafica usa space-y-0 ridondante e un pb-3 'magico' che rende il layout poco leggibile e non intuitivo.

### 2) Nuova struttura proposta
Ricostruzione in 3 zone gerarchiche su una colonna principale con sidebar contestuale (split 2/3 + 1/3 su desktop/tablet largo; stack su tablet stretto). ZONA 1 - Profile Hero (full-width): banda superiore arioso con avatar grande (64px) a sinistra, nome+sponsor+rank su due righe, e una STAT STRIP separata e dedicata per le metriche binarie (Sinistra / Team / Destra) presentata come 3 stat-cell con divisori sottili, colori branch piu saturi e label discreta sopra il numero. A destra dell'hero un'unica azione primaria (Modifica profilo / Salva-Annulla in edit). ZONA 2 - Colonna principale (sinistra, 2/3): card Anagrafica ridisegnata come 'definition grid' a 2 colonne max (label sopra, valore sotto, riga divisa in gruppi semantici: Identita | Business | Contatti), con sezione Note collassabile/clamp a 3 righe; sotto, un'unica TabBar segmentata (Prospects / Centos) sticky che ospita ProspectBoard e CentosManager. ZONA 3 - Sidebar contestuale (destra, 1/3): 'File personali' promossi da footer a card laterale sempre visibile con due voci compatte a lista (7 Perche, 100's list) ciascuna con icona, titolo, micro-meta e chevron; apertura in Modal invariata. In edit mode l'intera card Anagrafica riceve un anello/bordo accent e una barra di stato 'Modifiche non salvate' sticky in fondo alla card. Su tablet la sidebar scende sotto la colonna principale mantenendo l'ordine: Hero -> Anagrafica -> File -> Tabs.

### 3) Motivazioni UX
- Separare le metriche binarie in una stat-strip dedicata crea una gerarchia chiara (identita vs performance) e rende leggibile a colpo d'occhio l'equilibrio Sinistra/Destra, il dato piu rilevante per un networker, riducendo la dipendenza dai label testuali di fallback.
- Raggruppare i campi anagrafici per significato (Identita/Business/Contatti) e ridurre a 2 colonne abbassa il carico cognitivo e migliora lo scan, sfruttando il raggruppamento Gestalt invece di una griglia indifferenziata a 3 colonne.
- Dare un confine visivo all'edit mode (accent ring + barra 'modifiche non salvate') comunica lo stato del sistema (heuristica di Nielsen #1) e previene perdite di dati e ambiguita su cosa sia modificabile, senza cambiare la logica del booleano editing.
- Promuovere i File personali in sidebar sempre visibile riduce i click e la profondita di navigazione: l'utente vede subito che 7 Perche e 100's list esistono, invece di doverli cercare sotto i tab.
- Una TabBar segmentata con indicatore attivo netto e sticky risolve l'ambiguita di 'quale tab e selezionato' al primo render e mantiene il contesto durante lo scroll di liste lunghe (Prospects/Centos).
- Stati vuoti spostati DENTRO la Modal e placeholder/skeleton coerenti eliminano il clutter a page load e rispettano il principio di 'mostra contenuto solo nel contesto d'uso'.
- Layout piu arioso (spaziatura verticale aumentata, label leggibili) trasmette la sensazione premium attesa da reti commerciali premium, allineandosi al linguaggio Linear/Stripe/Vercel.

### 4) Miglioramenti UI
- Hero con avatar 64px, fallback iniziali su gradiente neutro, nome in text-xl font-semibold tracking-tight, sponsor come riga secondaria text-sm text-muted-foreground; RankBadge spostato accanto al nome come unico elemento 'colorato' permesso (coerenza cromatica).
- Stat-strip metriche: 3 celle con numero in text-2xl tabular-nums, label micro (text-[11px] uppercase tracking-wider text-muted), divisori verticali 1px border, accent branch-left/right portati a saturazione/leggibilita maggiore e usati SOLO come puntino/barra sottile sotto il numero (non come testo).
- Anagrafica: label normalizzate a text-xs font-medium text-muted-foreground (no uppercase aggressivo), valore text-sm text-foreground, gap label-valore portato a 6px; gruppi separati da intestazioni di sezione sottili e divisori hairline; Note con line-clamp-3 e 'Mostra tutto' quando non in edit.
- Edit mode: card con ring-1 ring-primary/30 + bg-primary/[0.02], input con stile uniforme (h-9, focus-visible ring), footer sticky con testo 'Modifiche non salvate' + bottoni Annulla (ghost) / Salva (primary); i campi editabili mostrano in read mode un'affordance discreta (icona matita on-hover) per segnalare l'inline-editing.
- File personali come list-row compatte (icona in tile 40px, titolo + descrizione su due righe, chevron a destra), hover bg-muted/50, focus-visible:ring-2, aria-haspopup=dialog; placeholder skeleton se i dati non sono pronti.
- WishlistManager: contatore 'NN/100' visibile vicino al titolo, bottone Add con stato disabilitato anche al limite e tooltip esplicativo; form responsivo che mantiene il bottone a larghezza auto (non full-width) anche in colonna; spinner per-item sull'azione toggle/delete invece di disabilitare l'intero form.
- TabBar segmentata stile pill con indicatore attivo (bg-background + shadow-sm su track bg-muted), text-sm font-medium; ConfigNotice/demo reso come banner sottile dismissibile con icona info, allineato in cima alla colonna principale.
- Spaziatura e raster: padding card uniformato (p-5), CardHeader pulito senza space-y-0 magico, raggi coerenti (rounded-xl card, rounded-lg control), uso di hairline border (border-border/60) per i divisori invece di blocchi pieni.

### 5) Wireframe concettuale
```
DESKTOP / TABLET LARGO (>= 1024px)
+--------------------------------------------------------------------------------------+
| (i) Dati dimostrativi - alcuni valori sono di esempio                       [ x ]    |
+--------------------------------------------------------------------------------------+
|  HERO                                                                                 |
|  +------+   Marco Rossi   [ Diamante ]                          [  Modifica profilo ] |
|  | MR   |   Sponsor: Giulia Bianchi - reg. 12/03/2024                                 |
|  +------+   Attivo                                                                    |
|  - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - |
|     SINISTRA        |          TEAM           |        DESTRA                         |
|        128          |          512            |          96                          |
|     |  (viola)      |                         |     |  (verde)                       |
+--------------------------------------------------------------------------------------+
|  COLONNA PRINCIPALE (2/3)                       |  SIDEBAR (1/3)                      |
|  +-------------------------------------------+  |  +-------------------------------+  |
|  | Anagrafica                                |  |  | File personali                |  |
|  | IDENTITA                                  |  |  | +---------------------------+ |  |
|  |  Nome            Cognome                  |  |  | | [#] 7 Perche          >   | |  |
|  |  Marco           Rossi                    |  |  | |     Motivazioni profonde  | |  |
|  |  Data nascita    Occupazione              |  |  | +---------------------------+ |  |
|  |  04/1990         Consulente               |  |  | | [*] 100's list        >   | |  |
|  | BUSINESS                                  |  |  | |     0/100 contatti        | |  |
|  |  Pacchetto       Add-on    Click          |  |  | +---------------------------+ |  |
|  |  Premium         Si        24             |  |  +-------------------------------+  |
|  | CONTATTI                                  |  |                                     |
|  |  Citta           Regione                  |  |                                     |
|  |  Milano          Lombardia                |  |                                     |
|  |  Note                                     |  |                                     |
|  |  Lorem ipsum dolor sit amet, consectetu.. |  |                                     |
|  |  Mostra tutto                             |  |                                     |
|  +-------------------------------------------+  |                                     |
|                                                 |                                     |
|  ( Prospects )  ( Centos )   <- segmented, sticky                                     |
|  +-------------------------------------------+                                        |
|  |  [ ProspectBoard / CentosManager ]        |                                        |
|  |  ...                                      |                                        |
|  +-------------------------------------------+                                        |
+--------------------------------------------------------------------------------------+

EDIT MODE (card Anagrafica con accent ring + footer sticky)
  +=============================================+
  | Anagrafica                       (in modifica) |
  |  Pacchetto [ Premium      v ]  Click [ 24  ]   |
  |  Citta     [ Milano        ]  Regione [ ... ]  |
  |  Note      [ ........................... ]     |
  |---------------------------------------------|
  |  o Modifiche non salvate   [Annulla] [ Salva ] |
  +=============================================+

TABLET STRETTO (< 1024): Hero -> Anagrafica -> File personali -> Tabs (stack a colonna unica)
```

### 6) Componenti da utilizzare
- Card / CardHeader / CardTitle / CardContent (riusati per Hero, Anagrafica, sidebar File, contenuto Tabs - padding uniformato a p-5, CardHeader senza space-y-0 magico)
- Badge (status Attivo/Inattivo) + RankBadge (unico elemento cromatico nell'hero, accanto al nome)
- Tabs / TabsList / TabsTrigger / TabsContent (TabBar segmentata con indicatore attivo netto, sticky) per Prospects/Centos
- Modal (apertura 7 Perche e 100's list dalla sidebar; EmptyState spostato DENTRO la Modal)
- Button (cva: primary per Salva/Modifica, ghost per Annulla, icon-only matita on-hover per affordance edit; size sm)
- Input (campi editabili Anagrafica e form Wishlist, stile h-9 uniforme con focus-visible ring)
- FileCard ridisegnata come list-row compatta (tile icona 40px + titolo + meta + chevron, aria-haspopup=dialog)
- EmptyState (per stati vuoti dentro Modal e per Wishlist vuota / dati non pronti)
- Nuovi pattern di composizione (no nuova logica): StatStrip (3 celle metriche binarie con divisori e accent), DefinitionGrid/Field (label+valore normalizzati, riusabile al posto del ReadField ripetuto), SectionHeading (intestazioni Identita/Business/Contatti), UnsavedBar (footer sticky in edit mode), DemoBanner dismissibile - tutti realizzati con i primitivi UI esistenti + token di globals.css/tailwind.config.ts

### 7) Best practice applicate
- Gerarchia tipografica scalare (text-xl/sm/xs con tabular-nums per i numeri) e uso parsimonioso del colore: un solo accento per zona (rank nell'hero, branch nelle stat) per un look premium tipo Linear/Stripe.
- Visibilita dello stato del sistema (Nielsen #1): edit mode con confine visivo + barra 'modifiche non salvate' e feedback per-item nella Wishlist invece di loading monolitico.
- Raggruppamento per legge di prossimita/Gestalt: campi anagrafici clusterizzati per significato con divisori hairline, riduzione del carico cognitivo.
- Layout responsivo content-first con riflusso prevedibile (Hero -> Anagrafica -> File -> Tabs) e CSS container/grid; nessuna metrica che collassa in modo ambiguo su mobile/tablet.
- Spaziatura su scala 4/8px, raggi e bordi coerenti (rounded-xl/lg, border-border/60) e padding card uniformato per un ritmo verticale arioso.
- Accessibilita: focus-visible ring consistente, ruoli/ARIA corretti sulle list-row (aria-haspopup=dialog), label associabili, target touch >= 40px, contrasto verificato sugli accent branch.
- Progressive disclosure: Note con line-clamp + 'Mostra tutto', stati vuoti mostrati solo nel contesto (dentro la Modal), banner demo dismissibile per ridurre clutter persistente.
- Riduzione dei click: File personali promossi in sidebar sempre visibile e TabBar sticky che conserva il contesto durante lo scroll di liste lunghe.

---

## 5. Binary Viewer (albero genealogico binario) — CRM Networker

### 1) Problemi attuali
- DENSITA VERTICALE NEI NODI: la card MarketerNode (248x150px) impila 5 zone (avatar+name+rank, binary counts, KPI grid 3 col, espandi/collapse) con gap-0.5/gap-1 e testi a [10px]/[11px]. Nessuna respirazione: l'occhio non riesce a separare identita da metriche, e su tablet le etichette si troncano.
- CONTRASTO DARK INSUFFICIENTE: binary counts bg-branch-left/10 + text-branch-left (265 65% 68%) e badge team-size text-muted-foreground (65%) su bg scuro falliscono WCAG <4.5:1. Il colore branch e usato sia come testo sia come fill tenue, perdendo leggibilita proprio sull'informazione piu importante (gamba L/R).
- RIDONDANZA DEI DATI BINARI: left/right/total appaiono 3 volte con 3 layout diversi (mini nella card px-1 [11px], expanded nel detail panel p-2.5 base, di nuovo in BranchSummary p-2.5 base). Non c'e progressione: stessa info, tre grammatiche visive, percezione confusa.
- ASSENZA DI PISTA VISIVA L/R: il lato di provenienza e segnalato solo da un border-l-[3px]. Scrollando in verticale l'utente perde il riferimento alla struttura binaria; le linee del canvas (legStroke branch-left/right/global) non hanno eco coerente dentro il nodo.
- SPAZIATURE INCOERENTI NEL DETAIL PANEL: header p-4, body space-y-4, footer space-y-2, sezioni space-y-2, StatRow gap-2: salti tra 8px e 16px senza scala. Il pannello sembra assemblato, non progettato.
- TOOLBAR AMBIGUA: expand/collapse/fit-view in un guscio rounded-lg p-0.5 con icone h-8 w-8 senza label persistente; gli stati disabilitati non sono distinguibili su tablet e i tooltip non sono sempre visibili. L'utente non sa cosa fanno i bottoni.
- EMPTY STATE DEBOLE: l'overlay vuoto (pointer-events-none) non ha animazione di ingresso ne CTA chiara: non si distingue 'albero vuoto' da 'in caricamento', lasciando l'utente sospeso.
- GERARCHIA KPI PIATTA: 3 colonne uguali con icone h-3 w-3 di colori diversi (info/success/warning) ma stessa dimensione; le etichette [10px] truncate. Nessun KPI emerge come primario, il colore e decorativo e non informativo.
- DETAIL PANEL MOBILE/TABLET SENZA SCROLL CONTROLLATO: lo slide-over w-[min(22rem,90vw)] delega l'overflow al genitore; su device con barre di sistema la sezione KPI (flex-1 overflow-y-auto) puo tagliarsi e non gestisce il reflow.
- ADD MEMBER DIALOG SENZA GROUPING: space-y-4 uniforme, first/last name in grid gap-4, select pacchetto con lo stesso gap senza raggruppamento visivo; l'errore inline (text-xs text-danger) sta sotto il gruppo, non e chiaro quale campo e in errore.
- BRANCH SUMMARY SCOLLEGATA: 3 StatPill grid-cols-3 con icon holder h-7 w-7 rounded-md, non coerenti con i nodi (h-9 w-9 rounded-lg). Manca un filo narrativo tra il riepilogo e i nodi sottostanti.
- MINIMAP E SEARCH RIFINITURE: la minimap legge branchLeg ma restituisce HSL non normalizzate, desync col dark mode; il popover di ricerca (w-full sm:w-72) non ha min-width, i nomi lunghi wrappano e mancano divider tra le voci.

### 2) Nuova struttura proposta
Layout a 3 zone fisse + 1 pannello contestuale, pensato desktop-first e tablet-safe. (A) TOPBAR (h-14, sticky): a sinistra titolo 'Binary Viewer' + breadcrumb scope (Io / Team / Globale) come segmented control; al centro la GenealogySearch con popover allargato (w-[clamp(20rem,28vw,26rem)]); a destra un cluster azioni canvas con label-on-hover e divider. (B) RIBBON RIEPILOGO (BranchSummary, h-auto, sotto la topbar, full-width, collassabile): 3 pill orizzontali (Totale rete / Attivi / Iscrizioni) con icon holder unificato h-9 w-9 rounded-lg coerente coi nodi, piu una pill 'Equilibrio L/R' che mostra una barra bilanciamento. Questa diventa l'UNICA istanza ad alta densita dei conteggi binari. (C) CANVAS React Flow centrale: nodi MarketerNode ridisegnati a densita ridotta (vedi punto 4), connettori L/R colorati, AddSlotNode dashed coerente, minimap in basso a destra con colori sincronizzati alle variabili HSL, controls zoom in basso a sinistra. (D) NodeDetailPanel come pannello laterale destro su desktop (w-[clamp(20rem,26vw,24rem)], sticky inset-y) e come bottom-sheet/slide-over a tutta altezza con scroll proprio (h-dvh, overscroll-contain, safe-area-inset) su tablet. Il pannello adotta UNA scala di spazi (4/8/16/24) e una griglia 2 colonne per le stat binarie con etichetta L/R esplicita. Empty state come stato dedicato centrato nel canvas con illustrazione, copy e CTA primaria, con fade/scale in ingresso.

### 3) Motivazioni UX
- Disclosure progressiva: i conteggi binari ad alta densita vivono in UN solo posto (ribbon riepilogo); nei nodi resta solo l'essenziale (L/R sintetici); il dettaglio completo si apre on-demand nel pannello. Elimina la tripla ridondanza e riduce il carico cognitivo (legge di Hick).
- Coerenza spaziale: un'unica scala 4/8/16/24px applicata ovunque crea ritmo prevedibile (legge di prossimita di Gestalt), togliendo i salti 8<->16 che facevano percepire il pannello come non progettato.
- Pista visiva persistente L/R: un indicatore di gamba esplicito e colorato in ogni nodo da continuita con i connettori del canvas, cosi l'utente mantiene il modello mentale della struttura binaria anche scrollando (mappatura percettiva continua).
- Riduzione click: scope come segmented control sempre visibile, azioni canvas etichettate, e detail panel ancorato su desktop (non slide-over) evitano aperture/chiusure ripetute. Il pannello resta aperto mentre si naviga l'albero.
- Affordance chiare: bottoni con label-on-hover + stati disabled visibili e empty state con CTA tolgono l'ambiguita 'cosa fa questo / e vuoto o carica?', riducendo l'incertezza.
- Accessibilita come UX: contrasti AA, target tap >=44px su tablet, focus ring e scroll controllato nel pannello mobile garantiscono usabilita reale su reti commerciali che lavorano molto da tablet.

### 4) Miglioramenti UI
- CONTRASTO: i colori branch-left/right diventano accent strutturali (bordo/indicatore/connettore), non testo. Conteggi in foreground/muted-foreground con shade AA-compliant; le pill usano fill solido tenue ma testo ad alto contrasto (chip con --branch-*-foreground dedicato).
- DENSITA NODO: card portata a ~260x96-110px, 2 zone sole: riga identita (avatar h-9 w-9 rounded-lg + nome 13px medium + rank come micro-badge) e riga metrica con 1 KPI primario + 2 secondari minori; spacing su scala 8/12; testi minimi 12px.
- INDICATORE L/R: barra/pill verticale a sinistra del nodo (4px) nel colore della gamba + micro-label 'L'/'R' su pill 16x16, coerente col connettore in arrivo.
- SCALA TIPOGRAFICA: 11px solo per micro-label uppercase tracking-wide; corpo 12-13px; titoli pannello 15-16px semibold. Niente piu [10px].
- DETAIL PANEL: header 56px con avatar+nome+rank+azioni; body con sezioni a card sottili (rounded-lg border bg-card) e griglia stat 2-col L/R con valore 20px tabular-nums + delta; footer azioni sticky.
- TOOLBAR/AZIONI: gruppo bottoni h-9 w-9 rounded-lg con icona 16px, label visibile in tooltip + a riposo come testo su >=lg; stato disabled con opacity-40 + cursor-not-allowed; separatori sottili tra gruppi.
- EMPTY STATE: contenitore centrato con icona network, titolo, sottotitolo e bottone primario 'Aggiungi membro', con animate-in fade-0 zoom-95 duration-200.
- MINIMAP & SEARCH: minimap con maskColor su token --background/80 e nodeColor da CSS var risolte (sync dark); popover ricerca min-w-[20rem], righe con avatar h-8 + nome truncate max-w + rank chip + divider divide-y.
- MOVIMENTO: hover nodo con ring-1 ring-border -> ring-primary/40 e elevazione shadow-sm->shadow-md (150ms); selezione con ring-2 ring-primary.

### 5) Wireframe concettuale
```
DESKTOP (>= lg)
+--------------------------------------------------------------------------------------+
| Binary Viewer   [ Io | Team | Globale ]      (  search marketer...  )   [-][+][fit][⤢]|
+--------------------------------------------------------------------------------------+
| RETE 248   ATTIVI 191   ISCRIZIONI 37    EQUILIBRIO L/R [######------] 58% L / 42% R  |
+----------------------------------------------------------+---------------------------+
|                          CANVAS                          |   NODE DETAIL  (sticky)   |
|                                                          | +-----------------------+ |
|              +--------------------------+                | | (av) Marco Rossi   x  | |
|              | (av) Tu        ◆ Diamond |                | |      Rank: Diamond    | |
|              | L 124 | R 91  ·  KPI 37↑ |                | +-----------------------+ |
|              +------------+-------------+                | | BINARIO               | |
|             L /                       \ R               | | +--------+  +--------+ | |
|     +----------------+         +----------------+        | | | L  124 |  | R   91 | | |
|  |L | (av) A. Bianchi|      |R | (av) S. Verdi |        | | | left   |  | right  | | |
|     | L 60 | R 42·12↑|         | L 33 | R 18·6↑|        | | +--------+  +--------+ | |
|     +-------+--------+         +-------+--------+        | | Totale rete: 215      | |
|        L/      \R                L/      \ +            | +-----------------------+ |
|   +--------+ +--------+     +--------+  +- - - - +       | | PERFORMANCE           | |
|   |(av)... | |(av)... |     |(av)... |  |   +     |      | | Iscrizioni mese  37↑  | |
|   +--------+ +--------+     +--------+  + - - - - +      | | Volume gamba     1.2k | |
|                                          add slot       | +-----------------------+ |
| [minimap ▭]                                             | [ Apri profilo ] [ +Add ] |
+----------------------------------------------------------+---------------------------+

TABLET (detail come slide-over a tutta altezza, scroll proprio)
+---------------------------------------------+
| Binary  [Io|Team|Glob]  (search)   [⋯ menu] |
+---------------------------------------------+
| RETE 248  ATTIVI 191  ISCR 37  L/R 58/42    |
+---------------------------------------+-----+
|             CANVAS                    | ▌DET|
|     +--------------------+            | ▌av |
|     |(av) Tu   ◆ Diamond |            | ▌Mar|
|     | L124 | R91 · 37↑   |            | ▌--- |
|     +---------+----------+            | ▌L R |
|        L/        \R                   | ▌124 |
|   +--------+  +--------+              | ▌ 91 |
|   |(av)... |  |(av)... |              | ▌--- |
|   +--------+  +--------+              | ▌[Apri]
+---------------------------------------+-----+

EMPTY STATE (animate-in fade zoom)
+-------------------------------------------+
|                  ( ◇ )                    |
|        Nessun membro nella rete           |
|   Aggiungi il primo marketer per iniziare |
|          [  + Aggiungi membro  ]          |
+-------------------------------------------+
```

### 6) Componenti da utilizzare
- Card / surface primitive (web/components/ui) per nodi e sezioni del detail panel (rounded-lg, border, bg-card, shadow-sm)
- Avatar primitive con fallback iniziali (h-9 w-9 rounded-lg) usato in nodo, search e detail header
- Badge / Chip per rank marketer e micro-label L/R (varianti per branch-left/right/global)
- Segmented control / Tabs per lo scope switcher (Io / Team / Globale)
- Button (variant ghost/icon, size sm) per cluster azioni canvas con stati disabled visibili
- Tooltip per label-on-hover dei controlli canvas
- Input + Popover (Command-like) per GenealogySearch con righe divise da divide-y
- Dialog per AddMemberDialog con fieldset/grouping e messaggio errore a livello form
- Sheet / Slide-over per il NodeDetailPanel su tablet (h-dvh, scroll-area interno)
- ScrollArea per il body del detail panel e per il popover di ricerca
- Stat / KPI pill component unificato (icon holder h-9 w-9 rounded-lg, value tabular-nums) condiviso tra BranchSummary e detail panel
- Progress / meter bar per l'indicatore Equilibrio L/R
- Empty state component (icona + titolo + copy + CTA, animate-in)
- Skeleton per stato di caricamento del canvas e del riepilogo
- Separator/Divider per i gruppi di azioni e le righe di ricerca
- Design tokens HSL in globals.css: introdurre --branch-left-foreground / --branch-right-foreground AA-compliant e usare le CSS var risolte per minimap e connettori

### 7) Best practice applicate
- Progressive disclosure: dati binari sintetici nel nodo, completi solo nel detail panel; elimina ridondanza tripla.
- Scala spaziale 4/8/16/24 (4pt grid) applicata in modo coerente su nodi, pannello, dialog e ribbon.
- Contrasto WCAG AA: colori branch come accent strutturali con foreground dedicato; mai testo critico su fill tenue a basso contrasto.
- Densita controllata stile Linear/Stripe: card a 2 righe, tipografia 12-16px, niente font sotto i 11px e solo per micro-label uppercase.
- Tabular-nums e allineamento numerico per tutte le metriche (confronto rapido L vs R).
- Motion discreta e purposeful (150-200ms ease-out) su hover/selezione/empty-in, rispettando prefers-reduced-motion.
- Accessibilita touch: target >=44px su tablet, focus-visible ring, aria-label sui controlli icona, ruoli per tabs/dialog/popover.
- Safe-area e scroll containment (h-dvh, overscroll-contain, env safe-area-inset) per slide-over su device con barre di sistema.
- Token-driven theming: minimap e connettori leggono CSS variables risolte cosi i colori restano sincronizzati al cambio dark/light.
- Affordance esplicite: empty state con CTA, bottoni con stati disabled visibili e label, tooltip persistenti — riduce ambiguita e click.
- Coerenza dei pattern: un unico componente KPI pill condiviso tra riepilogo e dettaglio per dare continuita visiva tra Summary e Nodes.
- Layout responsive desktop/tablet: detail panel ancorato su desktop, slide-over con scroll proprio su tablet, niente dipendenza dall'overflow del genitore.

---

## 6. Presenze Zoom (attendance tracker per le 3 call giornaliere: Wake Up, Golden, Join The Dream)

### 1) Problemi attuali
- Day navigator sovraccarico: prev/next + today + date picker nativo + (eventuali) controlli sessione compressi in una sola riga con flex-wrap, che collassa in modo instabile su tablet generando reflow e salti di layout.
- Contatore presenze con gerarchia debole: usa bg-muted + text-muted-foreground a basso contrasto, quindi il dato piu importante della pagina (quanti presenti su totale) e quasi illeggibile a colpo d'occhio.
- Griglia presenze non scannable: minmax(12rem,1fr) genera celle di larghezza variabile, i nomi sono troncati in text-xs senza tooltip e non si forma un pattern a colonne regolare leggibile in verticale.
- Mancano stati transizionali: il toggle cambia colore senza transition, e durante l'azione ottimista (useTransition/isPending) non c'e nessun feedback di caricamento ne lock sulla cella.
- Ridondanza dei controlli data: tre meccanismi (prev/next, today, date input) per la stessa azione occupano spazio prezioso, soprattutto su tablet, senza dare in cambio leggibilita della data corrente.
- Empty state indistinto: quando il roster e vuoto non c'e spacing o trattamento visivo dedicato, l'assenza di dati si confonde con una pagina semplicemente vuota.
- Contrasto insufficiente in dark mode: bg-success/15 su card 222 22% 11% diventa praticamente invisibile e il testo bianco sopra perde leggibilita, rendendo indistinguibili presente/assente al buio.
- Nessun ordinamento ne ricerca: su team grandi non c'e modo rapido di isolare gli assenti o trovare un membro, costringendo a scorrere tutta la lista.
- Spacing incoerente: space-y-5 tra sezioni call contro space-y-4 nel navigator, padding del contenitore non esplicito per viewport, ritmo verticale non uniforme.
- Accessibilita carente: aria-label combina nome+call ma non comunica lo stato presente/assente, manca role=group attorno al set di celle di un membro e non c'e gestione coerente del focus.

### 2) Nuova struttura proposta
Ricostruzione da zero su tre fasce verticali ariose con larghezza max contenuta (max-w-6xl, px responsivo). FASCIA 1 - Command bar sticky: a sinistra un unico DateStepper compatto (chevron prev | etichetta data leggibile e cliccabile che apre un popover calendario | chevron next) con pill 'Oggi' separata solo se la data non e quella odierna; a destra una SearchInput per filtrare il membro e un Segmented filtro stato (Tutti / Presenti / Assenti). I tre meccanismi data ridondanti collassano in un solo stepper + popover. FASCIA 2 - Summary header a tutta larghezza: tre StatCard affiancate, una per call (Wake Up, Golden, Join The Dream), ciascuna con icona, label, contatore grande 'X/Y' ad alto contrasto e una progress bar sottile che codifica il tasso di presenza; il totale aggregato di giornata vive come dato dominante (numero grande) nella prima card o in una card riassuntiva iniziale. FASCIA 3 - Attendance matrix: una tabella reale (component Table) con colonna sticky a sinistra per il membro (Avatar + nome + rango in Badge) e tre colonne a larghezza fissa uguale, una per call, intestate dal nome sessione + orario. Ogni cella e un toggle presente/assente largo e centrato (check pieno su sfondo success / cerchio vuoto neutro), allineato in colonne perfettamente regolari. Header di colonna e header membro restano sticky allo scroll. L'empty state (team vuoto o filtro senza risultati) e una EmptyState centrata con padding generoso che spezza nettamente il ritmo. Su tablet la matrice resta orizzontale grazie alla colonna membro sticky e allo scroll-x del solo blocco tabella, non dell'intera pagina.

### 3) Motivazioni UX
- Un solo DateStepper con etichetta-data cliccabile riduce 3 controlli a 1 punto d'interazione, abbassa i click e libera spazio orizzontale critico su tablet.
- Promuovere il contatore presenze a StatCard con progress bar trasforma il dato chiave da testo grigio a indicatore scansionabile in <1s, supportando la domanda reale del leader ('quanti hanno partecipato oggi?').
- La matrice a colonne fisse e uguali crea un pattern visivo regolare: l'occhio scorre verticalmente per call e orizzontalmente per membro senza reflow, riducendo il carico cognitivo.
- Ricerca + filtro stato (Presenti/Assenti) rispondono al bisogno operativo di isolare rapidamente gli assenti su team grandi, senza aggiungere logica nuova: e solo presentazione/filtro client dei dati gia presenti.
- La colonna membro sticky e lo scroll confinato alla tabella mantengono il contesto (chi e questa riga, che call e questa colonna) durante lo scorrimento, essenziale su tablet.
- Feedback transizionale sul toggle (transition + stato pending sulla cella) conferma l'azione ottimista e previene doppi tap durante il salvataggio, aumentando la fiducia.
- Empty state con spacing dedicato comunica chiaramente 'nessun dato qui' invece di lasciare l'utente nel dubbio se la pagina stia ancora caricando.
- Gerarchia a tre fasce (controlli, sintesi, dettaglio) segue il flusso naturale: prima scelgo il giorno, poi leggo il riepilogo, poi agisco sulle singole presenze.

### 4) Miglioramenti UI
- Toggle presenza ridisegnato con due stati netti e ad alto contrasto in entrambi i temi: presente = icona check su fill success solido (non /15) con foreground leggibile; assente = ring neutro su sfondo card; transizione transition-colors duration-150 e stato pending con opacity ridotta + cursor-wait.
- Dark mode corretto: sostituire bg-success/15 con un token di superficie dedicato (success solido al ~85% o success/25 con bordo success) cosi presente/assente restano distinguibili anche su card 222 22% 11%.
- Contatori in StatCard con numero in text-2xl/3xl font-semibold tabular-nums e progress bar h-1.5 colorata col token success, eliminando il testo muted a basso contrasto.
- Nomi membri a piena leggibilita: text-sm con truncate + Tooltip sul nome completo, Avatar 32px e Badge rango sotto al nome, niente piu text-xs schiacciato.
- Ritmo verticale unificato a una scala coerente (gap-6 tra fasce, gap-3 interno alle card) e padding contenitore esplicito px-4 md:px-6 con max-w-6xl mx-auto per layout arioso.
- DateStepper con bottoni icon-only quadrati (h-9 w-9) e label data centrale in font-medium tabular-nums; popover calendario themed al posto dell'input[type=date] nativo non stilizzato.
- Header di colonna sticky con sfondo card/blur e bordo inferiore sottile; intestazione sessione con icona dedicata (alba/sole/luna o orario) per riconoscimento immediato della call.
- Hover di riga sottile (bg-muted/40) per facilitare il tracciamento orizzontale tra nome e celle su righe lunghe.

### 5) Wireframe concettuale
```
+--------------------------------------------------------------------------+
|  Presenze Zoom                                                            |
|  Registra le partecipazioni alle 3 call giornaliere                      |
+--------------------------------------------------------------------------+
| [<]  Lunedi 31 maggio 2026  [>]   (Oggi)      [ Cerca membro... ]  [Tutti|Presenti|Assenti] |
+--------------------------------------------------------------------------+
|  +----------------+  +----------------+  +----------------+              |
|  | (sun) Wake Up  |  | (star) Golden  |  | (moon) Join Dr.|              |
|  |  18 / 24       |  |  21 / 24       |  |  15 / 24       |              |
|  |  ============- |  |  ==============|  |  =========---- |  75%  87%  62%|
|  +----------------+  +----------------+  +----------------+              |
+--------------------------------------------------------------------------+
| MEMBRO                  | Wake Up 06:30 | Golden 12:00 | Join Dr. 21:00 ||
|-------------------------+---------------+--------------+----------------|
| (A) Marco Rossi         |     [check]   |    [check]   |    ( o )       ||
|     Diamond             |               |             |                ||
|-------------------------+---------------+--------------+----------------|
| (A) Sara Bianchi        |     ( o )     |    [check]   |    [check]     ||
|     Gold                |               |             |                ||
|-------------------------+---------------+--------------+----------------|
| (A) Luca Verdi  (...)   |     [check]   |    [check]   |    [check]     ||
|     Silver              |               |             |                ||
|-------------------------+---------------+--------------+----------------|
| ... colonna MEMBRO sticky, header colonne sticky, scroll-x sul blocco   |
+--------------------------------------------------------------------------+

[check] = presente: icona check su fill SUCCESS solido (leggibile light+dark)
( o )   = assente: ring neutro su sfondo card; transition-colors 150ms; pending = opacity-60 cursor-wait

-- Empty state (team vuoto o filtro senza risultati) --
+--------------------------------------------------------------------------+
|                                                                          |
|                         (CalendarDays icon)                              |
|                    Nessun membro da mostrare                             |
|              Modifica i filtri o aggiungi membri al team                 |
|                                                                          |
+--------------------------------------------------------------------------+
```

### 6) Componenti da utilizzare
- PageHeader (titolo + sottotitolo, invariato)
- ConfigNotice (banner demo-safe, invariato)
- DateStepper costruito con Button variant=ghost size=icon (chevron prev/next) + label data + Popover calendario
- Input (web/components/ui/input.tsx) con icona lucide Search per la ricerca membro
- Segmented (web/components/ui/segmented.tsx) per il filtro stato Tutti/Presenti/Assenti
- StatCard (web/components/ui/stat-card.tsx) x3, una per call, con contatore + progress bar
- Card (web/components/ui/card.tsx) come contenitore della matrice
- Table (web/components/ui/table.tsx) con header e colonna membro sticky
- Avatar (web/components/ui/avatar.tsx) per il membro
- Badge (web/components/ui/badge.tsx) per il rango
- Tooltip (web/components/ui/tooltip.tsx) sui nomi troncati e sullo stato della cella
- Toggle presenza custom (role=checkbox, aria-checked) basato su token --success e --border
- EmptyState (web/components/ui/empty-state.tsx) con icona CalendarDays
- Skeleton (web/components/ui/skeleton.tsx) per il loading delle righe
- Icone lucide-react: ChevronLeft, ChevronRight, Search, Sunrise, Sun, Moon, Check, CalendarDays

### 7) Best practice applicate
- Data table con colonna identificativa e header sticky: pattern standard SaaS (Linear/Stripe) per matrici scansionabili senza perdere il contesto durante lo scroll.
- Token semantici per gli stati (success/border/muted) invece di opacita arbitrarie, con verifica di contrasto AA in light e dark mode (no bg-success/15 su card scura).
- Optimistic UI con feedback esplicito: stato pending visibile sulla cella, transizioni 120-180ms, prevenzione doppio-tap durante il salvataggio.
- Riduzione dei controlli ridondanti (3 input data -> 1 stepper + popover) secondo il principio 'less chrome, more content'.
- tabular-nums e gerarchia tipografica forte per i contatori KPI, cosi i numeri restano allineati e leggibili a colpo d'occhio.
- Scala di spacing coerente a 4px (gap-3/gap-6) e contenitore con max-width centrato per layout ariosi su desktop e tablet.
- Accessibilita: role=group per il set di celle di un membro, aria-checked sul toggle, aria-label che esplicita 'presente/assente', focus-visible ring con il token --ring, target touch >=44px.
- Progressive disclosure dei filtri: ricerca e filtro stato sempre visibili ma non invasivi, calendario completo solo on-demand nel popover.
- Responsive senza media-query fragili: scroll-x confinato al blocco tabella + colonna membro sticky, evitando il flex-wrap instabile dell'attuale day navigator.
- Mobile/tablet-first touch ergonomics: celle toggle ampie e centrate, hover di riga per il tracking orizzontale, stati visivi indipendenti dal solo colore (icona check vs ring).

---

## 7. Informativa (prezzi pacchetti + materiali PDF/link) - web/app/(app)/informativa/page.tsx

### 1) Problemi attuali
- Tier in evidenza poco distinto: Signature (featured, '$ 1.799') ha solo 'border-primary/50 ring-1 ring-primary/20', troppo sottile per uno standard SaaS premium (Stripe/Linear usano elevazione + accento + badge). Non emerge nella scansione visiva.
- Gerarchia tipografica del prezzo debole: il suffisso '+ IVA' a text-xs e' visivamente staccato dalla cifra (text-2xl) pur essendo in flex items-baseline; manca peso e raggruppamento netto.
- Le card pacchetto hanno SOLO CardHeader (nome + prezzo): nessun CardContent ne' descrizione, quindi sono mezze card vuote con CTA assente. Spazio sprecato e dead-end dopo la lettura del prezzo.
- Le due sezioni (pacchetti + materiali) sono isolate con 'space-y-8', senza legame narrativo ne' continuita' visiva: due blocchi giustapposti.
- Padding incoerente: header materiali 'p-5 pb-3' e contenuto 'p-5 pt-0'; le card pacchetto 'p-5' senza contenuto. Ritmo verticale irregolare (stuttering).
- Materiali compressi: tre contenitori annidati (Card -> ul -> li) con 'gap-3 p-3' stretti e 'space-y-2' tra item: percezione densa, soprattutto la folder GPS con 4 item.
- Icona cartella in contenitore h-9 w-9 (36px) con Folder 18px: peso visivo del badge cartella sproporzionato rispetto al titolo della folder.
- Azioni 'Scarica' (pdf) e 'Apri' (link) sono identiche: stesso buttonVariants outline size sm, nessuna distinzione visiva; l'utente non scansiona rapidamente l'azione attesa per pdf vs link.
- URL placeholder tutti '#': i link sono cliccabili ma non funzionali; il codice gia' evita target=_blank su '#', ma manca uno stato disabilitato o un badge 'in arrivo' visibile, quindi resta un click a vuoto.
- Link esterni senza indicatore di destinazione: il LinkIcon e' solo a sinistra come tipo; sul pulsante 'Apri' non c'e' icona external-link che chiarisca l'apertura in nuova scheda.
- Nessuno stato di feedback: nessun loading sul download, nessuna conferma, nessuna gestione visiva dei materiali mancanti.
- La sezione materiali non ha accenti cromatici: ogni item usa 'border bg-background' identico; pdf e link si distinguono solo per la piccola icona text-muted-foreground.
- Heading di sezione sottotono: 'text-lg font-semibold tracking-tight' identico ad altre aree del CRM; la sezione pacchetti non ha nemmeno il sottotitolo (solo pdf_subtitle esiste).
- Bordi card di default e spenti: basso contrasto in light mode, nessuna shadow e nessun accento primario per dare profondita' premium.
- Griglia poco responsiva: materiali 'lg:grid-cols-3' lascia un vuoto su tablet (768-1024, resta a 1 colonna); pacchetti saltano da 'sm:grid-cols-2' a 'xl:grid-cols-4' senza passaggio su tablet largo.
- Rischio troncamento: il titolo materiale usa 'truncate', quindi nomi lunghi come 'Linktree materiale post Business Info' vengono tagliati senza tooltip.
- Item materiali senza metadati: nessun tipo esplicito a parole, peso o descrizione; l'utente non valuta il contenuto prima del click.
- Nessun sistema di badge per i placeholder: il design system ha gia' Badge con varianti warning/success/secondary, ma non vengono usati per segnalare 'In arrivo' / 'Aggiornato'.
- Le icone hanno aria-hidden senza fallback testuale forte (il tipo pdf/link non e' annunciato): accessibilita' debole nella distinzione semantica.
- Metafora cartella debole: Business Info / Follow Up / GPS sono folder reali nei dati ma presentate come semplici card con icona generica, senza gerarchia editoriale chiara di categoria.

### 2) Nuova struttura proposta
Ricostruzione su contenitore centrato (max-w-6xl mx-auto) con un'unica narrazione verticale e respiro generoso (space-y-12 tra sezioni). SOLO riorganizzazione di cio' che gia' esiste nei dati: 4 PackageInfo (key/price/featured) + 3 MaterialFolder (Business Info, Follow Up, GPS) con item pdf/link. Nessuna nuova funzione, nessuna modifica di logica o dei dati.

1) PAGEHEADER (riuso): title 'Informativa' + subtitle gia' tradotti. Invariato a livello copy.

2) SEZIONE PACCHETTI (Pricing) — prima ancora visiva. Heading di sezione potenziato: eyebrow 'PACCHETTI' + titolo (packages_title) + un sottotitolo (riusando una stringa gia' presente o muted). Griglia ordinata dal piu' basso al piu' alto valore per leggibilita' della scala: grid-cols-1 / sm:grid-cols-2 / lg:grid-cols-4 (i dati restano l'array PACKAGE_INFO esistente, eventualmente solo riordinato in render). Ogni pricing card riusa i campi esistenti: nome (STARTING_PACKAGE_LABELS[p.key]) come eyebrow/titolo, blocco prezzo coeso (cifra grande tabular-nums + '+ IVA' come unita' inline sulla stessa baseline). La card 'featured' (Signature) diventa la card-anchor: shadow-lg + ring-2 ring-primary + border-primary + Badge 'Consigliato' in alto. Le altre: border soft + shadow-sm + hover:shadow-md. Padding uniforme p-6 ovunque. (Non si aggiungono CTA o feature list nuove: si valorizza solo cio' che c'e'; lo spazio sotto il prezzo resta pulito e bilanciato.)

3) DIVIDER NARRATIVO: Separator con micro-label centrale ('Materiali ufficiali') che lega le due sezioni invece del semplice gap, dando continuita'.

4) SEZIONE MATERIALI — da lista densa a griglia di tessere ariose, valorizzando le folder come categorie editoriali. Heading coerente coi pacchetti (eyebrow 'MATERIALI' + pdf_title + pdf_subtitle). Ogni folder (Business Info, Follow Up, GPS) e' un blocco con sub-heading leggero (icona Folder piccola + titolo), sotto cui gli item diventano tessere su griglia grid-cols-1 / md:grid-cols-2 / xl:grid-cols-3 (riempie il gap tablet, gestisce bene anche i 4 item di GPS). Ogni tessera riusa title/type/url esistenti: contenitore icona quadrato 40px (PDF FileText su tinta accent, link LinkIcon su tinta primary), titolo su massimo 2 righe (line-clamp invece di truncate), e una sola riga azione con gerarchia: 'Scarica' (Button default sm + Download icon) per i pdf, 'Apri' (Button outline/ghost sm + ArrowUpRight) per i link.

5) STATO PLACEHOLDER: poiche' tutti gli url sono '#', ogni tessera mostra un Badge 'In arrivo' (variant warning) e l'azione in stato disabilitato (estetica only: opacity ridotta + pointer-events-none, nessun cambio di logica). Quando l'url reale comparira', l'azione si riattiva senza modifiche strutturali.

Layout pienamente adatto a desktop e tablet: padding card uniforme p-6, gap-6 tra tessere, ritmo verticale costante space-y-12 / space-y-6.

### 3) Motivazioni UX
- Una sola narrazione verticale (prezzi -> materiali) con divider etichettato crea continuita' e supera la percezione di due blocchi scollegati, guidando l'occhio in un flusso unico.
- Evidenziare Signature (l'unico featured) con elevazione + accento primary + Badge 'Consigliato' sfrutta l'anchor pricing tipico di Stripe/Linear: l'utente identifica l'offerta di punta in meno di un secondo.
- Raggruppare il prezzo in un blocco coeso (cifra + '+ IVA' sulla stessa baseline, con peso ribilanciato) rispetta la legge di prossimita' di Gestalt: il suffisso viene letto come parte del prezzo, non come nota staccata.
- Trasformare la lista densa di materiali in tessere ariose riduce il carico cognitivo (legge di Hick): meno rumore visivo, scansione piu' rapida, percezione premium - utile soprattutto sulla folder GPS che ha 4 item.
- Distinguere azione primaria 'Scarica' (pieno) da 'Apri' (outline/ghost) crea un gradiente di prominenza: l'utente capisce a colpo d'occhio cosa fa il pulsante senza leggere parola per parola.
- L'icona external-link (ArrowUpRight) sul pulsante 'Apri' imposta l'aspettativa di apertura in nuova scheda, riducendo la sorpresa e aumentando la fiducia.
- Lo stato 'In arrivo' + azione disabilitata sui placeholder '#' elimina il click verso un'ancora vuota: nessun vicolo cieco, prodotto percepito come curato e onesto.
- Valorizzare Business Info / Follow Up / GPS come categorie editoriali con sub-heading rende leggibile la metafora cartella senza aggiungere funzioni.
- La griglia con breakpoint intermedio (md:grid-cols-2) elimina il vuoto su tablet, superficie chiave per reti commerciali in mobilita'.
- Padding e ritmo verticale uniformi rimuovono lo stuttering, restituendo l'allineamento ordinato tipico dei prodotti enterprise.

### 4) Miglioramenti UI
- Pricing card anchor (Signature): shadow-lg + ring-2 ring-primary + border-primary + Badge 'Consigliato' (variant default = bg-primary/10 text-primary, o pieno) in alto; le altre card border soft + shadow-sm + hover:shadow-md transition-shadow.
- Blocco prezzo coeso: cifra in text-3xl/4xl font-semibold tabular-nums, '+ IVA' in text-sm font-medium text-muted-foreground allineato alla baseline; eyebrow nome fascia in text-xs uppercase tracking-wide text-muted-foreground sopra il prezzo.
- Padding card uniforme p-6 (eliminare il mix p-5 / pb-3 / pt-0); ritmo interno space-y-2/3 coerente in tutte le card.
- Tessere materiali: contenitore icona quadrato h-10 w-10 rounded-lg con bg soft (bg-accent o accent/10 per PDF, bg-primary/10 per link) e icona h-5 w-5 tintata; al posto del badge Folder 36px generico.
- Tipizzazione cromatica entro i token HSL esistenti: PDF su accent tint, link su primary tint - nessun colore fuori sistema.
- Azioni con gerarchia: 'Scarica' come Button variant default size sm + icona Download; 'Apri' come Button variant outline size sm + ArrowUpRight; etichette con whitespace-nowrap per evitare troncamenti.
- Badge stato: 'In arrivo' (variant warning) in alto a destra della tessera, predisposto anche 'Aggiornato' (variant success); area azione disabilitata con opacity-60 + pointer-events-none + aria-disabled.
- Titolo materiale su line-clamp-2 invece di truncate, cosi 'Linktree materiale post Business Info' resta leggibile su due righe.
- Heading di sezione potenziati: eyebrow uppercase text-xs + titolo text-xl/2xl font-semibold + sottotitolo text-sm text-muted-foreground, per gerarchia superiore al resto del CRM.
- Bordi e superfici: border-border piu' definito + shadow-sm su tutte le card, hover:border-primary/40 come affordance; bg-card coerente in dark mode.
- Divider etichettato (Separator con label centrale) tra le due sezioni per il legame narrativo.
- Griglia responsiva: pacchetti 1/2/4 colonne, materiali 1/2/3 colonne con gap-6; contenuto centrato max-w-6xl mx-auto per non disperdere lo sguardo su monitor larghi.
- Sub-heading per ciascuna folder (Business Info / Follow Up / GPS) con icona Folder piccola h-4 w-4 + ChevronRight decorativo, per valorizzare la categoria.

### 5) Wireframe concettuale
```
+==========================================================================+
|  Informativa                                                             |
|  Prezzi dei pacchetti e materiali ufficiali del team.                   |
+==========================================================================+

  PACCHETTI
  I pacchetti di avvio (prezzi in USD, + IVA)
  ------------------------------------------------------------------------

  +----------------+  +----------------+  +----------------+  +================+
  | STARTER        |  | STANDARD       |  | PREMIUM        |  | SIGNATURE      |
  |                |  |                |  |                |  | [Consigliato]  |
  |  $ 199  + IVA  |  |  $ 499  + IVA  |  |  $ 999  + IVA  |  | $ 1.799 + IVA  |
  |                |  |                |  |                |  | (ring primary) |
  +----------------+  +----------------+  +----------------+  +================+
   (shadow-sm)         (shadow-sm)         (shadow-sm)         (shadow-lg,ring)

  ----------------------- Materiali ufficiali ------------------------------

  MATERIALI
  Documenti e link ufficiali, organizzati per fase
  ------------------------------------------------------------------------

  []  Business Info
  +--------------------------+  +--------------------------+
  | [PDF] Business Info      |  | [>] Linktree materiale   |
  |                          |  |     post Business Info   |
  |  ----------------------   |  |  ----------------------   |
  |  [ Scarica v ][In arrivo] |  |  ( Apri ^ )  [In arrivo]  |
  +--------------------------+  +--------------------------+

  []  Follow Up
  +--------------------------+  +--------------------------+
  | [PDF] Follow Up          |  | [>] Linktree materiale   |
  |                          |  |     post Follow Up       |
  |  ----------------------   |  |  ----------------------   |
  |  [ Scarica v ][In arrivo] |  |  ( Apri ^ )  [In arrivo]  |
  +--------------------------+  +--------------------------+

  []  GPS
  +--------------------+  +--------------------+  +--------------------+
  | [PDF] GPS 1        |  | [PDF] GPS 2        |  | [PDF] GPS 3        |
  |  ----------------   |  |  ----------------   |  |  ----------------   |
  |  [Scarica v][n.d.] |  |  [Scarica v][n.d.] |  |  [Scarica v][n.d.] |
  +--------------------+  +--------------------+  +--------------------+
  +--------------------+
  | [PDF] GPS Freddi   |
  |  ----------------   |
  |  [Scarica v][n.d.] |
  +--------------------+

  Legenda: [ Scarica v ] = primaria piena (pdf, icona Download)
           ( Apri ^ )    = secondaria outline (link, icona ArrowUpRight)
           [PDF]/[>] = icona tipizzata 40px   [In arrivo] = Badge warning
```

### 6) Componenti da utilizzare
- PageHeader (riuso: components/crm/page-header)
- Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter (ui/card, padding uniforme p-6) - CardDescription e CardFooter gia' esistono nel barrel ma oggi non usati
- Badge (ui/badge): variant default per 'Consigliato', variant warning per 'In arrivo', variant success per eventuale 'Aggiornato', variant secondary per metadati
- Button / buttonVariants (ui/button): variant default per 'Scarica' (primaria), variant outline per 'Apri' (secondaria), size sm
- Separator (ui/separator) per il divider etichettato tra sezioni
- Tooltip (ui/tooltip) opzionale sull'azione disabilitata ('Disponibile a breve') e sul titolo line-clamp
- Lucide icons: FileText (PDF, gia' usato), LinkIcon (link, gia' usato), Folder + ChevronRight (categorie folder, ChevronRight gia' citato nei componenti attuali), Download (azione scarica), ArrowUpRight o ExternalLink (azione apri/link esterno)
- next-intl getTranslations (riuso integrale: title, subtitle, packages_title, pdf_title, pdf_subtitle, vat, download, open) + STARTING_PACKAGE_LABELS
- cn() utility (composizione classi condizionali per featured e stato placeholder)
- Token HSL da app/globals.css + tailwind.config.ts (primary, accent, muted, border, card, warning, success) - tutti gia' esistenti, nessun colore fuori sistema

### 7) Best practice applicate
- Anchor pricing in stile Stripe/Linear: un solo tier in evidenza (Signature) con elevazione + accento + badge per orientare la scelta in meno di un secondo.
- Spaziatura su griglia 8pt: padding card uniforme (p-6) e gap regolari (gap-6, space-y-12 / space-y-6) per un ritmo enterprise.
- Tipografia tabular-nums sui prezzi e raggruppamento prezzo+unita' coeso (legge di prossimita' di Gestalt).
- Gerarchia di azione esplicita: primaria piena 'Scarica' vs secondaria outline 'Apri', per scansione rapida (prominenza visiva).
- Affordance dei link esterni con icona ArrowUpRight/ExternalLink per impostare l'aspettativa di apertura in nuova scheda.
- Stati onesti per contenuti non pronti: Badge 'In arrivo' + azione disabilitata invece di link '#' che portano a un'ancora vuota.
- Responsive con breakpoint intermedi (md:grid-cols-2) per coprire il range tablet 768-1024 senza vuoti.
- Accessibilita': testo del tipo accanto alle icone, aria-disabled sulle azioni placeholder, contrasto AA sui token, focus-visible sui bottoni, line-clamp+tooltip per i titoli lunghi.
- Riduzione del rumore visivo: meno contenitori annidati (no Card->ul->li annidato), superfici pulite, bordi soft + shadow-sm per profondita' discreta.
- Coerenza col design system: solo token e primitivi esistenti (Card, Badge, Button, Separator, Tooltip), nessun componente o colore fuori sistema, per consistenza cross-area del CRM.
- Categorie editoriali (folder come gruppi con sub-heading) e microcopy chiara per ridurre il carico cognitivo e i click inutili.
- Larghezza di lettura contenuta (max-w-6xl mx-auto) per evitare dispersione dello sguardo su monitor larghi, mantenendo desktop e tablet ottimali.

---

## 8. Percorso Prospect — Funnel Kanban (board /prospects) + Dettaglio Prospect (/prospects/[id])

### 1) Problemi attuali
- Densita visiva incoerente sulla board: BoardColumn usa space-y-2 tra le card ma le card hanno padding interno p-1.5, e ProspectCard usa a sua volta space-y-2 interno: i tre ritmi (gap esterno, padding, gap interno) non condividono una scala unica, quindi nome/owner/meta risultano schiacciati e le card 'galleggiano' in modo irregolare nella colonna.
- Gerarchia debole nel dettaglio: i metadati (responsabile, in fase da, nel funnel da) sono tutti text-sm con lo stesso peso e stesso colore, quindi il dato azionabile (responsabile/owner) ha lo stesso rilievo del dato di servizio (durata in fase). L'occhio non trova un punto di ingresso.
- Leggibilita compromessa dal token muted-foreground (220 9% 46%): la riga meta della card usa text-xs muted per 'oggi'/giorni; su tablet e con tema chiaro il contrasto e sotto soglia AA, rendendo invisibile l'informazione temporale piu importante (da quanto il prospect e fermo).
- Timeline annidata e piatta: JourneyTimeline impila StatusPill, timecode, note e responsabile tutti in xs/sm dentro lo stesso blocco space-y-1.5, senza distinzione tra evento (cosa e successo) e dettaglio (nota/chi). Con molte transizioni diventa un muro di testo difficile da scansionare.
- Attrito nel form di creazione: NewProspectSheet mostra il select 'Da un contatto' anche quando non ci sono contatti, e nel select dello stage concatena inline il numero (1-6) con la STAGE_LABEL, producendo voci lunghe, non allineate e con il numero che compete visivamente con l'etichetta.
- Affordance del drag invisibile: il grip handle della ProspectCard e a text-muted-foreground/40 (40% opacita) e compare di fatto solo all'hover desktop; su tablet (no hover) il riordino per drag e di fatto non scopribile, e su desktop si scopre solo per caso.
- Ridondanza di stato nel dettaglio: convivono FunnelProgress (6-step) e JourneyTimeline che comunicano entrambi 'fase attuale'. Per prospect con molte transizioni la pagina duplica il concetto e si allunga senza aggiungere valore.
- Ritmo dei Separator incoerente nella card di dettaglio: i Separator sono inseriti tra alcune sezioni (pills, calls) ma non prima della griglia metadata, creando asimmetria verticale e blocchi che 'iniziano' senza una regola costante.
- Contrasto dei badge di stage sulla board: i badge usano il colore stage-specific come background con testo 11px font-semibold; su stage 'iscrizione' (verde 142 64% 42% in light) il numero/etichetta in foreground scende sotto contrasto leggibile.
- Feedback di drag fuorviante: la card nel DragOverlay mostra prospect.outcome (esito corrente) ma lo stage di destinazione non e ancora applicato durante il trascinamento; l'utente vede un esito che non riflette la colonna su cui sta per rilasciare.
- Call history poco integrata: ProspectCalls e una lista piatta (icona + testo) che occupa lg:col-span-2 senza gerarchia di recency ne enfasi sull'outcome (successo/fallimento), con un badge piccolo inline; la cronologia chiamate, che e il segnale di attivita piu forte, sembra secondaria.

### 2) Nuova struttura proposta
BOARD (/prospects) — Ricostruzione su una scala spaziale unica (4px base). Header sticky leggero: titolo + sottotitolo, a destra una toolbar compatta (ricerca, filtro responsabile, toggle vista) e la CTA primaria 'Nuovo prospect'. Sotto, una fascia 'Funnel summary' con 6 micro-KPI orizzontali (uno per stage: conteggio + barra di riempimento sottile), che sostituisce visivamente l'idea ripetuta di FunnelProgress e da il colpo d'occhio sul funnel senza scrollare. Sotto, il kanban a 6 colonne con scroll orizzontale fluido: ogni colonna ha un header coerente (pastiglia colore stage 6px + nome stage in maiuscoletto + counter neutro in pill grigia), corpo con scala costante (gap 8px tra card, padding card 12px, gap interno 8px) e un footer 'ghost' tratteggiato 'Aggiungi qui' per aprire il create pre-impostato sullo stage. La ProspectCard diventa: riga 1 nome (text-sm font-medium) + grip sempre visibile a riposo (dots a opacita 60); riga 2 avatar owner + nome owner; riga 3 una sola meta-riga con icona orologio e 'fermo da N gg' in colore semantico (verde/ambra/rosso per anzianita in fase) invece del grigio invisibile. DETTAGLIO (/prospects/[id]) — Layout a 2 colonne 8/4. Header pagina: breadcrumb 'Prospect / Nome', nome H1, sotto una riga meta a chip (responsabile come chip avatar, stage corrente come StatusPill, 'fermo da N gg'), a destra lo StageChanger come CTA primaria 'Avanza fase' + menu. Subito sotto, una sola barra di stato: lo stepper 6-fasi orizzontale (ex FunnelProgress) come unico indicatore di 'dove siamo' — la timeline non duplica piu lo stato corrente ma diventa puramente storica. Colonna sinistra (principale): card 'Attivita' che fonde visivamente la JourneyTimeline e ProspectCalls in un'unica timeline unificata ordinata per recency (eventi di stage e chiamate sullo stesso asse), con tipizzazione chiara per evento. Colonna destra (sidebar sticky): card 'Riepilogo' con metadati a gerarchia esplicita (responsabile in evidenza, durate in fase secondarie) e card 'Prossimo passo' con l'azione di avanzamento. Niente nuove funzioni: si riusano FunnelProgress, JourneyTimeline, ProspectCalls, StageChanger, solo ricomposti e ri-spaziati.

### 3) Motivazioni UX
- Una scala spaziale unica (multipli di 4px) elimina i tre ritmi in conflitto della board e produce la regolarita percepita come 'premium' (Linear/Stripe): il cervello legge colonne calme invece di card che galleggiano.
- Il 'Funnel summary' in cima alla board sostituisce la ripetizione dell'indicatore di funnel e da il colpo d'occhio sul collo di bottiglia in un colpo solo, riducendo lo scroll e i click necessari per capire la salute della pipeline.
- Codificare l'anzianita in fase con colore semantico (non grigio muted) trasforma il dato temporale piu importante — da quanto un prospect e fermo — in un segnale d'azione immediato, risolvendo sia il problema di contrasto sia la gerarchia debole.
- Unificare timeline di stage e chiamate su un unico asse cronologico elimina la duplicazione concettuale dello stato e riduce il carico cognitivo: l'utente segue una sola narrazione 'cosa e successo a questo prospect', invece di saltare tra due liste.
- Rendere il grip e l'affordance di drag visibili a riposo (e fornire l'alternativa 'Avanza fase' come CTA) garantisce scopribilita su tablet (no hover) e accessibilita, senza affidarsi a interazioni nascoste.
- Una gerarchia tipografica a 3 livelli (titolo / dato primario / dato di servizio) crea un punto d'ingresso visivo certo nel dettaglio, accelerando la scansione e dando la sensazione di ordine editoriale tipica dei prodotti enterprise.
- Footer 'Aggiungi qui' per colonna pre-imposta lo stage e riduce i click nel flusso piu frequente (aggiungere un prospect direttamente nella fase giusta), togliendo passaggi al create form.
- Layout a 2 colonne con sidebar sticky tiene l'azione primaria ('Avanza fase' / 'Prossimo passo') sempre a portata mentre si scorre la storia, riducendo il movimento del mouse e i click di ritorno verso l'alto.

### 4) Miglioramenti UI
- Scala spaziale unica 4px su tutta l'area: card padding 12px, gap card 8px, gap interno 8px, gap colonne 16px; raggi coerenti (--radius-lg per le card, --radius-md per i chip).
- Badge di stage sulla board ridisegnati come 'soft pill': sfondo a bassa saturazione (colore stage al ~12% alpha) + testo nel colore stage pieno, anziche fondo pieno + testo chiaro, per garantire contrasto AA su tutti e 6 gli stage incluso iscrizione/verde.
- Anzianita in fase con scala semantica: verde (recente) / ambra (in attesa) / rosso (stallo), usando i token success/warning/destructive gia presenti, al posto di text-muted-foreground per il dato temporale.
- Grip drag visibile a riposo (dots a opacita ~60, hover a 100) e cursore grab; affordance ridondante via CTA 'Avanza fase' nel dettaglio.
- Tipografia a 3 livelli nel dettaglio: H1 nome 24px/semibold, label metadati 11px uppercase tracking-wide muted, valore 14px medium; il responsabile in 14px con avatar, le durate in 12px secondarie.
- Avatar owner con anello sottile e iniziali coerenti (riuso Avatar) per ancorare visivamente la card e dare identita al prospect senza foto.
- DragOverlay neutralizzato: durante il trascinamento la card mostra solo nome + owner + stage di destinazione (la colonna sotto il cursore), nascondendo l'esito che non e ancora valido, per un feedback non fuorviante.
- Ritmo dei Separator reso costante: un solo Separator hairline (1px, border al ~60%) tra ogni macro-sezione della card di dettaglio, mai mezzo dentro e mezzo fuori.
- Colonna kanban con header sticky interno e ombra di scroll (mask gradient) per segnalare lo scorrimento orizzontale, e larghezza colonna fissa ~300px per leggibilita su tablet.
- Timeline unificata con asse verticale a 'rail' sottile, nodo per evento (cerchio per chiamata, segno di spunta per transizione), timecode allineato a destra in caption, nota/responsabile come riga secondaria rientrata.

### 5) Wireframe concettuale
```
BOARD  /prospects
+--------------------------------------------------------------------------------+
| Prospect                                  [ Cerca ] [Responsabile v] [+ Nuovo] |
| Pipeline del tuo team                                                           |
+--------------------------------------------------------------------------------+
| FUNNEL  Conosc.4 |==  Present.3 |=  Follow.5 |===  Decis.2 |  Iscr.1 | Onb.2   |
+--------------------------------------------------------------------------------+
|                                                                                |
| * CONOSCITIVA  4   | * PRESENTAZ. 3  | * FOLLOW-UP 5  | * DECISIONE 2  |  >>   |
| +----------------+ | +-------------+ | +------------+ | +------------+ |       |
| | Mario Rossi  : | | | L. Bianchi: | | | A. Verdi  :| | | C. Neri  : | |       |
| | (A) A. Conti   | | | (A) S. Po   | | | (A) M. Lo  | | | (A) R. Fa  | |       |
| | (clock) 2 gg   | | | (clock)6 gg | | | (clock)1 g | | |(clock)9 gg | |       |
| +----------------+ | +-------------+ | +------------+ | +------------+ |       |
| | Anna Gallo   : | | | ...         | | | ...        | | + Aggiungi   | |       |
| | (A) A. Conti   | | +-------------+ | +------------+ | +------------+ |       |
| |(clock) 11 gg ! | | + Aggiungi qui  | + Aggiungi qui                  |       |
| +----------------+ |                 |                                 |       |
| + Aggiungi qui     |                 |                                 |       |
+--------------------------------------------------------------------------------+

DETTAGLIO  /prospects/[id]
+--------------------------------------------------------------------------------+
| Prospect / Mario Rossi                                                         |
| Mario Rossi                                  [ Avanza fase v ]  [ Cambia ...]  |
| (A) A. Conti   * Conoscitiva   (clock) fermo da 2 gg                           |
+--------------------------------------------------------------------------------+
| (1)Conosc --(2)Present --(3)Follow --(4)Decis --(5)Iscr --(6)Onboard          |
|  =====O- - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -      |
+----------------------------------------------+---------------------------------+
| ATTIVITA  (timeline unificata, recency)      | RIEPILOGO                       |
|                                              | RESPONSABILE                    |
|  (v) Stage -> Conoscitiva      oggi 09:12     | (A) Alessandro Conti           |
|      nota: primo contatto fiera               | -------------------------------|
|      - A. Conti                               | NEL FUNNEL DA      12 gg        |
|  (o) Chiamata  Esito: positivo  ieri 18:40    | IN FASE DA          2 gg        |
|      Wake Up call - interessato                | ULTIMO CONTATTO    ieri        |
|  (o) Chiamata  Esito: no risp.  3 gg fa       +---------------------------------+
|      -                                        | PROSSIMO PASSO                  |
|  (v) Creato                    12 gg fa       | [ Avanza a Presentazione  -> ] |
|                                              | [ Registra chiamata         ]   |
+----------------------------------------------+---------------------------------+
Legenda:  *=pastiglia stage  (A)=Avatar  (v)=transizione  (o)=chiamata  !=stallo
```

### 6) Componenti da utilizzare
- Card + CardHeader + CardContent + CardTitle (riuso per colonna kanban, card di riepilogo, card attivita)
- ProspectCard / ProspectCardBody (ricomposta su scala 4px, grip visibile, meta-riga unica con anzianita semantica)
- BoardColumn (header sticky con soft-pill stage + counter neutro, footer ghost 'Aggiungi qui')
- ProspectBoard (DragOverlay neutralizzato che mostra stage di destinazione, non l'outcome)
- StatusPill (riusata in variante 'soft' per badge stage ad alto contrasto e per esiti chiamata)
- FunnelProgress (riusata come stepper unico nel dettaglio + come micro-KPI nella fascia Funnel summary della board)
- JourneyTimeline + ProspectCalls (fuse visivamente in un'unica timeline 'Attivita' ordinata per recency con tipizzazione nodo)
- StageChanger (promossa a CTA primaria 'Avanza fase' nell'header dettaglio e nella card 'Prossimo passo')
- NewProspectSheet / FormSheet (slide-over con stage pre-selezionato dal footer colonna, select stage allineato numero+label, contatto nascosto quando vuoto)
- Avatar (owner sulla card e chip responsabile nel dettaglio, con anello sottile)
- Button (varianti primary per avanzamento, ghost per 'Aggiungi qui' e azioni secondarie)
- Separator (hairline costante tra macro-sezioni)
- DropdownMenu (menu secondario dello StageChanger), Input/Select del form

### 7) Best practice applicate
- 8pt/4px spacing system: scala spaziale unica e coerente su board e dettaglio per ritmo verticale regolare (pattern Linear/Vercel).
- Gerarchia tipografica a 3 livelli con label uppercase 11px tracking-wide per i metadati, stile data-grid enterprise (Stripe Dashboard).
- Colore semantico per i segnali d'azione (anzianita/stallo) invece del grigio muted, con contrasto AA garantito su tema chiaro e scuro.
- Soft pill / tinted badge (fondo a bassa alpha + testo nel colore pieno) per badge accessibili e calmi al posto dei fondi pieni saturi.
- Progressive disclosure: stepper unico per lo stato corrente, timeline relegata alla sola storia, niente duplicazione dell'informazione.
- Sticky sidebar con azione primaria sempre raggiungibile e riduzione dei click nel flusso piu frequente (CTA 'Avanza fase' / 'Aggiungi qui' pre-contestualizzata).
- Affordance esplicite e accessibili per il drag (handle visibile a riposo) con alternativa non-drag per dispositivi touch/tablet, in linea con WCAG e mobile-first.
- Feedback di drag onesto: l'overlay mostra solo informazioni valide (stage di destinazione) per evitare stati transitori fuorvianti.
- Scroll affordance orizzontale (mask gradient + colonne a larghezza fissa) per leggibilita su tablet senza perdere la metafora kanban.
- Unificazione di flussi correlati (transizioni + chiamate) in un singolo asse cronologico per ridurre il carico cognitivo e dare una narrazione coerente del prospect.

---

## 9. CRM: Contatti / Chiamate / Documenti / Impostazioni (profilo marketer)

### 1) Problemi attuali
- Tabella Contatti troppo densa (7+ colonne: Nome, Contatto, Stato, Fonte, Tag, Follow-up, Ultima interazione, Azioni) senza priorità responsive: su tablet va in overflow orizzontale e le colonne critiche (Nome, Stato, Follow-up) competono con quelle secondarie invece di prevalere.
- Lo stato Follow-up scaduto (testo rosso + AlertTriangle) si fonde con lo sfondo riga e con l'hover: contrasto insufficiente, l'urgenza non emerge a colpo d'occhio nella scansione verticale.
- Overflow dei tag: TagList tronca a max 3 con badge '+N' senza alcun modo di vedere il resto in tabella; l'utente deve aprire il detail sheet per una semplice informazione di lettura.
- Barra di selezione multipla (ContactBulkBar) con gerarchia debole (bg-primary/5 + border-primary/30): poco visibile, non ancorata, facilmente ignorata quando si selezionano righe.
- Colonna azioni a 48px con dropdown solo-icona: target di tocco troppo stretto su tablet e azioni frequenti (Modifica/Elimina) sepolte in un menu a 2-3 livelli senza alcun hint di scorciatoie.
- CallStatsStrip ricalcola sui dati filtrati ma resta visivamente identica allo stato non filtrato: l'utente non capisce che le metriche riflettono il periodo/filtro attivo.
- Pill di esito chiamata semanticamente confuse: 'connesso' e 'appuntamento' usano lo stesso tono success; manca distinzione cromatica tra esito tecnico (connesso) e esito di valore (appuntamento) e tra negativi (no answer, rifiutato).
- Nella tabella Chiamate la colonna 'target' tronca i nomi (max-w-18rem) senza tooltip, e la colonna Note (spesso vuota, '—') ruba spazio senza essere prioritaria; la durata '45 min' non ha unita/contesto chiaro.
- Layout documenti a due pannelli (lg:grid-cols-[20rem_1fr]) si rompe su tablet a 1024px: sidebar libreria fissa a 320px, editor compresso a ~704px; la ricerca della libreria scorre via (non sticky) e il toggle Archiviati non mostra quanti documenti sono nascosti.
- VersionHistorySheet elenca le versioni senza evidenziare quella corrente/attiva; l'editor (Tiptap, React.lazy) mostra un'area vuota in caricamento senza skeleton.
- Area Impostazioni/Profilo: MarketerAnagrafica senza max-width (si dilata su schermi 4K), sezione Account con dl/dt/dd a spaziatura stretta che impacca su mobile, card 'Aspetto' isolata e vuota con il solo theme toggle, e nessuno skeleton durante il fetch del profilo.
- Pattern globali deboli: header di pagina (PageHeader) non sticky che scrolla via perdendo contesto; chip filtri attivi a basso contrasto; empty state centrati in spazi larghi senza max-width; nessun skeleton durante il primo fetch; overlay di FormSheet/ConfirmDialog con backdrop-blur che causa jank su device lenti.

### 2) Nuova struttura proposta
Architettura unificata a 3 livelli condivisa dalle quattro aree (Contatti, Chiamate, Documenti, Impostazioni), per coerenza e meno rumore.

LIVELLO 1 - Shell sticky condivisa: una AppBar sticky che fonde PageHeader + tab di sezione + ricerca + azione primaria. Resta ancorata in alto durante lo scroll (titolo sezione sempre visibile). Sotto, una riga FilterBar sticky con chip filtri ad alto contrasto e una pill di 'periodo attivo' (es. 'Maggio 2026') che esplicita su cosa stanno calcolando le metriche.

LIVELLO 2 - Contenuto per area:
- CONTATTI: DataTable ridisegnata a colonne prioritizzate. Visibili sempre: Contatto (avatar+nome+canale primario su due righe), Stato (StatusPill), Follow-up (con trattamento d'urgenza dedicato). Comprimibili/nascoste su tablet: Fonte, Tag, Ultima interazione, raccolte in una cella 'meta' o nel detail. Riga con altezza maggiore (56-64px) per respiro e target tocco. ContactBulkBar diventa toolbar flottante sticky in basso, centrata, con sfondo primario pieno. Click su riga apre ContactDetailSheet (read) ; matita esplicita apre ContactFormSheet (edit).
- CHIAMATE: CallStatsStrip ridisegnata come fila di stat-card con etichetta di periodo e micro-delta; tabella ridotta alle colonne essenziali (Quando, Target con avatar, Esito, Durata con label 'durata chiamata'), Note spostate nel detail/espansione riga. Esiti con StatusPill a toni semantici distinti.
- DOCUMENTI: layout a due pannelli con sidebar libreria COLLASSABILE. Su tablet la sidebar diventa un drawer/overlay attivabile, l'editor occupa tutta la larghezza. Header libreria con ricerca sticky e toggle Archiviati con badge conteggio. Editor con skeleton durante il lazy-load; VersionHistorySheet con marcatore 'Versione corrente'.
- IMPOSTAZIONI/PROFILO: colonna centrata con max-width (~880px). MarketerAnagrafica come hero card compatta; Account come lista chiave-valore a stack verticale arioso; 'Aspetto' fuso in una card 'Preferenze' unica con il theme toggle e altri controlli display già esistenti.

LIVELLO 3 - Overlay: FormSheet/DetailSheet/VersionHistorySheet come side-sheet da destra (max-width contenuta), ConfirmDialog centrato, entrambi con overlay a tinta solida semitrasparente (no backdrop-blur). EmptyState con max-width e allineamento a sinistra su schermi larghi.

### 3) Motivazioni UX
- Header e filtri sticky mantengono il contesto durante lo scroll di liste lunghe: l'utente sa sempre in quale sezione e con quali filtri sta lavorando, riducendo il carico cognitivo e gli errori di interpretazione dei dati.
- La prioritizzazione delle colonne segue la legge di Hick e la gerarchia dell'attenzione: mostrare prima cio che guida la decisione (Chi, In che stato, Cosa fare dopo) accelera la scansione e riduce l'overflow su tablet senza nascondere nulla (il resto vive nel detail o in espansione).
- Il trattamento d'urgenza del Follow-up scaduto (tinta di sfondo + bordo sinistro) sfrutta la pre-attenzione cromatica: l'occhio individua le righe in ritardo prima ancora di leggerle, supportando il triage quotidiano del marketer.
- La toolbar di selezione flottante e ad alto contrasto rispetta la legge di Fitts (azione vicina, target ampio) e il principio di feedback: quando selezioni, il sistema risponde in modo inequivocabile, evitando azioni mancate.
- Esplicitare il periodo/filtro nelle statistiche chiamate elimina l'ambiguita 'i numeri sono totali o filtrati?', rafforzando la fiducia nei dati (trasparenza del sistema).
- Toni semantici distinti per gli esiti chiamata sfruttano la codifica per colore coerente: connesso (info/neutro positivo) vs appuntamento (accento di valore) vs negativi (warning/danger) comunicano significato senza leggere il testo.
- La sidebar libreria collassabile risolve il conflitto di spazio su tablet dando all'editor la larghezza necessaria per scrivere comodamente (misura di riga ottimale), seguendo il principio di progressive disclosure.
- Skeleton e stati di caricamento espliciti migliorano la performance percepita (l'utente vede struttura, non vuoto) e riducono l'incertezza durante i lazy-load di Tiptap e i fetch di profilo/liste.
- Centrare e vincolare la larghezza delle aree Impostazioni e degli empty state preserva una misura leggibile e un'estetica compatta premium anche su monitor molto larghi, evitando la sensazione di 'pagina vuota e dispersa'.
- Sostituire backdrop-blur con overlay a tinta solida garantisce transizioni fluide su hardware modesto, mantenendo la sensazione di reattivita tipica di prodotti premium (Linear/Stripe).

### 4) Miglioramenti UI
- Densita e respiro: righe tabella piu alte (56-64px), spaziatura verticale coerente su scala 4px, separatori sottili a basso contrasto invece di bordi pieni, per un aspetto piu arioso e ordinato.
- Cella 'Contatto' a due righe (nome in alto, canale primario/email sotto in muted) con avatar/iniziali: condensa informazione e libera colonne.
- Follow-up scaduto con bordo sinistro accent danger 2-3px + tinta di sfondo riga molto leggera (danger/8) e icona allineata: urgenza leggibile anche in hover.
- Tag: in tabella mostra max 2 tag + '+N' come trigger di tooltip/popover che rivela tutti i tag al hover, senza aprire il detail.
- ContactBulkBar: toolbar flottante centrata in basso, sfondo primario pieno, testo su contrasto AA, conteggio selezione + azioni con label, ombra morbida per stacco.
- Colonna azioni allargata (60-64px) con trigger piu generoso e, accanto, una matita 'Modifica' a icona singola per l'azione piu frequente (resto nel menu).
- CallStatsStrip come stat-card uniformi: valore grande, label, micro-indicatore di periodo (es. badge 'Maggio'), allineamento a griglia.
- StatusPill esiti chiamata a toni distinti: connesso = info, appuntamento = accent/success forte, no answer = neutral/warning, rifiutato = danger soft.
- Durata con icona orologio e label 'durata chiamata'; nomi target con truncation + tooltip nativo; Note rimosse dalla tabella e mostrate in riga espandibile o detail.
- Documenti: barra ricerca libreria sticky, toggle Archiviati con Badge conteggio, marcatore 'Corrente' (Badge accent) sulla versione attiva, skeleton dell'editor durante il load.
- Impostazioni: MarketerAnagrafica come hero card con max-width, lista Account a coppie chiave/valore impilate con buona interlinea, card 'Preferenze' unica per il theme toggle (niente card isolata).
- Chip filtri attivi con saturazione/contrasto aumentati (Badge tono primario), barra filtri con sfondo leggermente piu chiaro per stacco; empty state con max-width ~420px e allineamento sinistra su lg.
- Overlay sheet/dialog a tinta solida (es. background/70) senza blur; animazioni di entrata da destra brevi (150-200ms) con easing morbido.

### 5) Wireframe concettuale
```
DESKTOP - CONTATTI
+--------------------------------------------------------------------------+
| Contatti        [Contatti][Chiamate][Documenti][Impostazioni]  (sticky)  |
|  Gestisci la rete                              [Cerca...]  [+ Contatto]   |
+--------------------------------------------------------------------------+
| Filtri:  (Stato v) (Fonte v) (Tag v)   * Periodo: Maggio 2026   [Pulisci]| sticky
+--------------------------------------------------------------------------+
| [ ] CONTATTO              STATO       FOLLOW-UP        AZIONI             |
|--------------------------------------------------------------------------|
| [ ] (MR) Mario Rossi      [Attivo]    18 mag           [/]  [...]         |
|         +39 333 ...        info       fra 3 giorni                        |
|--------------------------------------------------------------------------|
||[ ] (LB) Luca Bianchi     [Lead]      ! SCADUTO 2 gg   [/]  [...]   <-- bordo sx danger + tinta
||        luca@mail.it       warning     12 mag                             |
|--------------------------------------------------------------------------|
| [x] (GV) Giada Verdi      [Cliente]   28 mag    Tag: vip  premium  +2(?) |
|         +39 340 ...        success                  hover -> popover tag  |
+--------------------------------------------------------------------------+
              +----------------------------------------------+
              | 1 selezionato   [Assegna] [Tag] [Elimina] x  |  <- bulk bar flottante (primary pieno)
              +----------------------------------------------+

DESKTOP - DOCUMENTI (sidebar collassabile)
+--------------------------------------------------------------------------+
| Documenti          [<<]  [Cerca libreria...] (sticky)   [Archiviati (3)] |
+----------------+---------------------------------------------------------+
| LIBRERIA       |  7 Perche - bozza            [Versioni] [Salva]         |
|  > 7 Perche  * |  +---------------------------------------------------+  |
|    100's list  |  |  B  I  U   H1 H2   * lista                        |  |
|    Informativa |  |  __________________________________________       |  |
|    ...         |  |  (editor Tiptap)                                  |  |
|  [skeleton...] |  |  [skeleton durante lazy-load]                     |  |
|                |  +---------------------------------------------------+  |
+----------------+---------------------------------------------------------+

TABLET - CHIAMATE
+--------------------------------------------------+
| Chiamate                          [+ Chiamata]   |
+--------------------------------------------------+
| [Tot 42]  [Connesse 28]  [Appunt. 9]  (Maggio)   |  <- stat-card con periodo
+--------------------------------------------------+
| QUANDO      TARGET           ESITO      DURATA    |
|--------------------------------------------------|
| Oggi 10:12  (MR) Mario R...  [Appunt.]  (o)12 min|
| Ieri 16:40  (LB) Luca B...   [Connesso] (o)45 min|
| Ieri 09:05  (GV) Giada V...  [No answ.] (o) 1 min|
+--------------------------------------------------+  (Note -> riga espandibile / detail)
```

### 6) Componenti da utilizzare
- PageHeader (reso sticky, fuso con tab di sezione e azione primaria)
- FilterBar (chip ad alto contrasto + pill periodo attivo, sticky)
- DataTable (colonne prioritizzate/comprimibili, righe piu alte, cella Contatto a due righe, riga espandibile per note)
- StatusPill (riuso per stati contatto e per esiti chiamata con toni semantici distinti)
- TagList (max 2 + '+N' come trigger di Tooltip/Popover invece di sola troncatura)
- ContactBulkBar (ridisegnata come toolbar flottante sticky, sfondo primary pieno)
- ContactFormSheet / ContactDetailSheet / CallFormSheet / VersionHistorySheet (su FormSheet con overlay a tinta solida)
- FormSheet (overlay solido senza backdrop-blur, ingresso da destra, max-width contenuta)
- CallStatsStrip (stat-card uniformi con etichetta di periodo)
- DocumentLibrary / DocumentPane / DocumentEditor (sidebar collassabile, ricerca sticky, skeleton editor)
- EmptyState (max-width + allineamento sinistra su schermi larghi)
- MarketerAnagrafica (hero card con max-width, lista Account a stack)
- Skeleton (nuovo uso dei primitivi UI per fetch lista/profilo e lazy-load editor)
- Badge (conteggio archiviati, marcatore 'Versione corrente', chip filtri)
- Tooltip / Popover (rivelazione tag e nomi target troncati)
- Design tokens di globals.css (HSL: primary, muted, danger/warning/info/success) e tailwind.config.ts per i toni semantici

### 7) Best practice applicate
- Progressive disclosure: dettagli secondari (tag completi, note, meta) rivelati on-demand via tooltip/popover/detail sheet invece di affollare la tabella.
- Responsive column priority: colonne critiche sempre visibili, secondarie comprimibili/nascoste su tablet, niente overflow orizzontale forzato.
- Performance percepita: skeleton loaders per fetch iniziali e lazy-load (Tiptap), evitando aree vuote; transizioni brevi 150-200ms.
- Codifica semantica coerente per colore: toni distinti e riusabili per stati ed esiti (info/success/warning/danger) allineati ai design token HSL.
- Trattamento dedicato all'urgenza: stati critici (follow-up scaduto) segnalati con bordo+tinta pre-attentivi, non solo con colore del testo.
- Contesto persistente: header e barra filtri sticky, periodo attivo esplicito sulle metriche per evitare ambiguita dei dati.
- Accessibilita e target di tocco: aree cliccabili >= 44px, contrasto AA su pill/chip/bulk bar, hint visivi sulle azioni frequenti.
- Misura di lettura ottimale: max-width sulle colonne di contenuto (Impostazioni, editor, empty state) per leggibilita e compattezza premium su schermi larghi.
- Riduzione del costo computazionale dell'UI: overlay a tinta solida al posto di backdrop-blur per fluidita su hardware modesto.
- Coerenza sistemica: una sola shell, una sola gerarchia di overlay (side-sheet + confirm dialog) e un set di primitivi riusati nelle 4 aree per un linguaggio visivo unico stile Linear/Stripe/Vercel.
- Riduzione dei click: click-riga per il detail, matita dedicata per la modifica frequente, azione primaria sempre nell'header sticky.
- Empty states utili e gerarchizzati: icona+titolo+descrizione con CTA, vincolati e allineati per non disperdersi nello spazio.

---

## 10. Design System attuale (token + primitivi UI) — CRM Networker

### 1) Problemi attuali
- Token HSL piatti: ogni semantic (primary, success, warning, danger, info) ha un solo valore di saturazione/lightness, senza scala 50→900. Impossibile creare tints/shades coerenti per gerarchia, hover, fill soft e bordi: la profondita visiva e affidata a opacita arbitrarie (/12, /90) sparse nei componenti.
- Contrasto A11y non verificato: danger 0 72% 58% e i badge warning/info in dark mode (con lift di L ~5%) rischiano un contrast ratio < 4.5:1 su card-foreground. Nessun token 'on-color' (foreground garantito leggibile sopra ogni semantic).
- Stati interattivi incompleti e incoerenti: i componenti hanno solo :hover, manca :active per il tap feedback (invisibile su tablet/mobile). I focus-visible sono incoerenti: DropdownMenuItem usa solo focus:bg-muted senza ring, il Button link non mostra alcun focus visibile, l'Input usa ring-offset-2 che sparisce su bg custom (card).
- Varianti mancanti nei primitivi: Button non ha 'secondary-outline' ne stati hover/active marcati su destructive; Card e monolitica (manca elevated vs bordered); Input non ha varianti cva error/success/disabled (gestite a className); Badge non ha variante 'outlined' (border = text-color); Label non ha 'required'; Separator non ha dashed/gradient.
- Token di size assenti e densita non parametrica: Tabs/TabsList hardcoded h-9, RankBadge px-2.5 py-0.5 fisso, Card padding p-6 con override manuali (TopMarketersCard p-5), nessun token card.dense/spacious. Le icone hanno size incoerenti tra componenti (size-4, h-4 w-4, h-[18px]).
- Tipografia di header rigida: CardTitle fisso text-base font-semibold, CardDescription fisso text-sm. Nessuna scala (sm/lg/xl) per adattare la gerarchia tra card dense e hero card.
- Overlay e motion fragili: Tooltip renderizzato inline z-50 senza portal (clipping dentro container scrollabili come Binary Viewer/tabelle); animazioni slide-in/pulse hardcoded senza rispetto di prefers-reduced-motion; StatusDot usa sempre animate-ping senza controllo di intensita.
- Composabilita e robustezza cross-browser carenti: Modal/FormSheet non espongono Header/Body/Footer (padding inline ridondante), FormSheet ha maxWidth hardcoded non responsive (no full-width <sm), ScrollArea usa scrollbar-width:thin senza fallback affidabile, Avatar usa lo stesso bg-muted per tutte le iniziali (nessun hashing colore).

### 2) Nuova struttura proposta
Ricostruzione del design system su tre layer, presentata come una pagina di documentazione viva ('Foundations' page) navigabile, senza aggiungere funzioni applicative — solo riorganizzazione di token e primitivi gia esistenti. LAYER 1 — Foundations (tokens): introdurre scale di tono 50/100/200/300/400/500/600/700/800/900 per ogni semantic gia esistente (primary, success, warning, danger, info, neutral), piu token 'on-*' (foreground leggibile), token di elevation (shadow-xs/sm/md), token di radius (sm/md/lg/full), token di spacing-densita (space-compact/cozy/comfortable), token icon-size (xs 14 / sm 16 / md 18 / lg 20) e token di motion (duration-fast/base + easing 'standard'/'emphasized' con media-query reduced-motion). Tutto come variabili CSS in globals.css + esposizione in tailwind.config: nessun nuovo colore inventato, solo derivazione delle stesse hue su una scala. LAYER 2 — Primitives: ogni componente passa interamente a cva con assi 'variant' e 'size' coerenti e un set di stati standard (hover/active/focus-visible/disabled) condivisi via un mixin di classi. Button (+ secondary-outline, size sm/md/lg/icon quadrato vero), Card (variant elevated/bordered/ghost, density dense/default/spacious, CardTitle con size sm/md/lg/xl), Input/Textarea/Select (state default/error/success/disabled via variant, ring-offset-background corretto), Badge (+ outlined), Label (required), Tabs (size sm/md/lg + underline/pill), RankBadge/StatusDot (size + pulse subtle/strong), Avatar (hashing iniziali su palette derivata dai token), Skeleton (shape text/line/circle/bar), Separator (solid/dashed/gradient), Tooltip e DropdownMenu in portal con focus ring, Modal/FormSheet con sub-parts Header/Body/Footer e FormSheet full-width su mobile. LAYER 3 — Patterns: showcase delle combinazioni reali del dominio (riga roster del team, card 'migliori marketer del mese', riga presenza Zoom, RankBadge in tabella) per documentare densita e gerarchia. La pagina Foundations ha una sidebar di ancore (Tokens / Colore / Tipografia / Spaziatura & Densita / Primitivi / Pattern) e un toggle tema in alto a destra per validare light/dark e contrasto.

### 3) Motivazioni UX
- Una scala di tono per semantic crea gerarchia prevedibile (fill soft = 50/100, testo = 700/800, bordo = 200/300) eliminando le opacita arbitrarie sparse nei file: il sistema diventa autoesplicativo e riduce le decisioni a chi compone le schermate.
- Token 'on-color' e contrasto verificato garantiscono leggibilita AA su entrambi i temi: in un CRM usato quotidianamente da reti commerciali, badge di rango e stati Zoom devono restare leggibili a colpo d'occhio senza affaticamento.
- Stati interattivi completi e coerenti (active + focus-visible uniforme + portal per overlay) danno feedback affidabile su desktop e tablet touch, riducono gli errori di click e rendono l'app navigabile da tastiera — percezione immediata di solidita 'enterprise'.
- Token di densita e size parametrici permettono layout ariosi nelle viste hero (dashboard, profilo marketer) e compatti nelle tabelle (roster, presenze) senza override manuali: meno rumore, meno incoerenze, ritmo verticale costante.
- Sub-parts composabili (ModalHeader/Body/Footer, CardTitle scalabile) e Skeleton tipizzati riducono il boilerplate e gli spazi 'a occhio': l'interfaccia appare curata e premium perche le proporzioni sono sistemiche, non improvvisate.
- Rispetto di prefers-reduced-motion e pulse calibrato comunicano attenzione e maturita del prodotto, allineandosi al posizionamento Linear/Stripe/Revolut atteso dal target.

### 4) Miglioramenti UI
- Palette derivata: stesse hue dei token attuali espanse in scale 50→900 + neutral grigio-freddo; uso disciplinato (soft fill 50/100, bordi 200, testo 700) per badge rango, stati Zoom (Wake Up/Golden/Join The Dream) e card top marketer, con verifica contrasto AA in light e dark.
- Elevation a 3 livelli con shadow-xs/sm/md morbide a bassa opacita e radius coerenti (card lg, controlli md, pill full): superfici pulite, niente bordi duri, look Stripe/Vercel.
- Stati unificati: focus-visible ring 2px con ring-offset-background su tutti i controlli, :active con micro-scale/compressione, transizioni 150ms easing 'standard'; destructive con hover/active piu marcati e leggibili.
- Densita governata da token: tabelle roster/presenze in modalita compact, card hero in comfortable; allineamento ottico delle iniziali Avatar con colore derivato per persona; icone tutte allineate alla scala (16/18/20).
- Badge 'outlined' (border = text, fill trasparente) accanto al soft-fill per ridurre il peso visivo nelle liste fitte; RankBadge con size sm/md/lg per tabella vs profilo; StatusDot con pulse subtle/strong selezionabile.
- Overlay sempre in portal con riposizionamento entro viewport (Tooltip, Dropdown, Modal), FormSheet responsive (full-width sotto sm, slide-over su desktop), Separator dashed/gradient per sezionare blocchi complessi senza linee pesanti.
- Tipografia: scala di header CardTitle xl/lg/md/sm con line-height proporzionato e CardDescription con colore muted-foreground a contrasto verificato; tabular-nums per numeri di volume/ranking.

### 5) Wireframe concettuale
```
+---------------------------------------------------------------------------+
|  Design System  ·  Foundations                         [ Light | Dark ]   |
+----------------+----------------------------------------------------------+
| SEZIONI        |  COLORE — scale derivate (no nuovi colori)               |
|                |                                                          |
| > Tokens       |  primary  [50][100][200][300][400][500][600][700][800]   |
|   Colore       |  success  [50][100][200][300][400][500][600][700][800]   |
|   Tipografia   |  warning  [50][100][200][300][400][500][600][700][800]   |
|   Spaz.&Dens.  |  danger   [50][100][200][300][400][500][600][700][800]   |
|   Primitivi    |  info     [50][100][200][300][400][500][600][700][800]   |
|   Pattern      |  neutral  [50][100][200] ........... [700][800][900]     |
|                |  on-color  Aa  AA verificato  ·  light / dark            |
|                +----------------------------------------------------------+
|                |  TIPOGRAFIA            |  SPAZIATURA & DENSITA           |
|                |  Title xl  Aa          |  compact  cozy  comfortable    |
|                |  Title lg  Aa          |  [#][#][#]  radius sm/md/lg     |
|                |  Title md  Aa          |  shadow xs / sm / md           |
|                |  Body / muted-fg  Aa   |  icon 14 16 18 20              |
|                +----------------------------------------------------------+
|                |  PRIMITIVI (variant x size, con stati)                   |
|                |                                                          |
|                |  Button  [Primary][Secondary][Outline][Sec-Outline]      |
|                |          [Ghost][Destructive][Link]   sm · md · lg · []  |
|                |          hover / active / focus-ring / disabled           |
|                |                                                          |
|                |  Badge   (Rango) (Attivo) (In attesa) (Sospeso)          |
|                |          soft-fill  ·  outlined                          |
|                |  Card    +-----------+  +-----------+  +-----------+      |
|                |          | elevated  |  | bordered  |  | ghost     |     |
|                |          | Title md  |  | Title sm  |  | Title lg  |     |
|                |          | desc...   |  | desc...   |  | desc...   |     |
|                |          +-----------+  +-----------+  +-----------+      |
|                |  Input   [ default ] [ error! ] [ success ] [disabled]   |
|                |  Avatar  (AV)(MR)(GS)  Skeleton  [oo][====][--- ]        |
|                +----------------------------------------------------------+
|                |  PATTERN — uso reale nel dominio                         |
|                |  (AV) Andrea Verdi    Diamond   ● Attivo   vol 12.480    |
|                |  (MR) Marco Rossi     Gold      ● In call  vol  8.120    |
+----------------+----------------------------------------------------------+
```

### 6) Componenti da utilizzare
- Token CSS (globals.css): scale semantic 50-900 + on-color, neutral, elevation, radius, spacing-density, icon-size, motion (duration/easing + reduced-motion)
- tailwind.config.ts: mapping delle scale e dei token di size/spacing/shadow/radius per uso utility-first coerente
- Button (variant: primary/secondary/outline/secondary-outline/ghost/destructive/link; size: sm/md/lg/icon; stati hover/active/focus-visible/disabled)
- Card + CardHeader/CardTitle(size sm-xl)/CardDescription/CardContent/CardFooter (variant elevated/bordered/ghost, density dense/default/spacious)
- Badge (default/secondary/outline/outlined/success/warning/danger/info/branch) con soft-fill e outlined
- Input/Label (Input variant default/error/success/disabled via cva; Label con required indicator)
- Tabs/TabsList/TabsTrigger/TabsContent (size sm/md/lg, stile underline/pill)
- DropdownMenu (+ portal e focus-visible ring su DropdownMenuItem)
- Modal + ModalHeader/ModalBody/ModalFooter e FormSheet + sub-parts (responsive full-width su mobile)
- Tooltip in portal con riposizionamento viewport
- RankBadge (size sm/md/lg + dot) e StatusDot (pulse subtle/strong)
- Avatar (hashing iniziali su palette derivata) e Skeleton (shape text/line/circle/bar)
- Separator (solid/dashed/gradient), ScrollArea (fallback scrollbar cross-browser), ThemeToggle (aria-pressed)

### 7) Best practice applicate
- Token-first / tiered tokens: scale di tono semantiche e token 'on-color' come unica fonte di verita, eliminando opacita magiche nei componenti (modello Stripe/Radix).
- API a due assi (variant + size) con cva su tutti i primitivi e set di stati condiviso (hover/active/focus-visible/disabled) per coerenza e riuso.
- Accessibilita AA: contrasto verificato in light/dark, focus-visible ring con ring-offset-background su ogni controllo, aria-pressed sul ThemeToggle, focus ring nei menu da tastiera.
- Overlay in portal con collision/viewport adjustment (Tooltip, Dropdown, Modal) per evitare clipping in container scrollabili.
- Motion responsabile: durate brevi + easing standardizzati e supporto prefers-reduced-motion su slide-in e pulse.
- Densita parametrica e ritmo verticale su scala di spacing (compact/cozy/comfortable) invece di override manuali, per layout ariosi e prevedibili.
- Composabilita (Header/Body/Footer per Modal e FormSheet, CardTitle scalabile) e design responsive mobile-first (FormSheet full-width sotto sm) per riuso senza wrapper ad hoc.
- Documentazione viva: pagina Foundations con showcase di token, primitivi e pattern reali del dominio come single source of truth verificabile in entrambi i temi.

---

## Design System unificato

### Palette
- BASE — riusa i token esistenti come 'core', nessuna hue inventata. Light: --background 0 0% 100%, --foreground 222 22% 11%, --card 0 0% 100%, --muted 220 16% 96%, --muted-foreground 220 9% 46%, --border 220 14% 90%, --input 220 14% 90%, --ring 222 80% 56%.
- BASE Dark: --background 222 24% 8%, --foreground 210 20% 96%, --card 222 22% 11%, --muted 222 16% 17%, --muted-foreground 217 12% 65%, --border 222 16% 20%, --ring 222 90% 66%. Mantenere il salto card/background per dare profondità su dark (stile Linear).
- PRIMARY (accent unico, brand): --primary 222 80% 56% (light) / 222 90% 66% (dark), --primary-foreground 0 0% 100% / 222 47% 11%. È l'unico colore d'azione. NUOVI derivati (solo derivazione della stessa hue 222): --primary-50 222 90% 97%, --primary-100 222 88% 93%, --primary-600 222 80% 48%, --primary-700 222 80% 40%; usati per soft-fill (bg-primary/8..12), hover (-600), pressed (-700).
- SCALE TONALI semantiche (Layer 1 — derivare 50/100/600/700 per ogni semantic esistente, stessa hue): success base 142 64% 38%; success-soft-bg = success/12, success-fg = success. warning base 38 92% 50%. danger base 0 72% 51%. info base 210 90% 56%. Pattern uniforme: soft-fill = colore/12, testo = colore, border = colore/25. Dark usa le varianti dark già definite.
- ON-COLOR (foreground leggibili AA su fill pieni): --on-primary 0 0% 100%, --on-success 0 0% 100%, --on-warning 222 22% 11% (scuro su giallo per contrasto), --on-danger 0 0% 100%, --on-info 0 0% 100%. Da introdurre come token espliciti per evitare testo bianco su warning.
- FUNNEL STAGE ramp (invariata, già coerente cool→warm): --stage-conoscitiva 210 85% 60%, --stage-business-info 200 80% 52%, --stage-follow-up 265 70% 60%, --stage-closing 38 92% 52%, --stage-check-soldi 25 90% 55%, --stage-iscrizione 142 64% 42%. Uso: pastiglia 6px header colonna kanban + stepper 6 fasi + StatusPill stage (soft-fill).
- BRANCH identity (Binary Viewer): --branch-global 222 80% 56%, --branch-left 265 70% 58%, --branch-right 170 70% 42%. NUOVI da introdurre per AA su testo/connettori: --branch-left-foreground 265 70% 42% (light)/ 265 65% 78% (dark), --branch-right-foreground 170 70% 30% (light)/ 170 60% 62% (dark). Usare le CSS var risolte per minimap e connettori React Flow.
- RANK ramp (invariata, ascending seniority): --rank-executive 220 9% 46%, --rank-consultant 199 89% 48%, --rank-team-leader 158 64% 40%, --rank-senior-team-leader 262 70% 56%, --rank-executive-team-leader 25 90% 52%, --rank-vice-president 42 95% 47%. Consumata da RankBadge (soft-fill dot in tabella, badge pieno in hero).
- ACTIVITY indicator (StatusDot roster/nodi): --activity-hot 0 72% 51% (pulse), --activity-warm 38 92% 50%, --activity-cold 210 90% 56%, --activity-dormant 220 9% 60%. Invariati.
- AVATAR accent (derivati dal nome via hashing): generare bg = hue/12 (soft) + text = hue forte, attingendo SOLO alla palette dei token rank/stage/branch già definiti (no random hue) per restare nel sistema. Es. set di 6 accent = le 6 hue rank.
- PODIO/medaglie (Dashboard): oro = warning (38 92% 50%) soft-fill, argento/bronzo = neutri (border + muted-foreground) — niente nuovo colore, posizioni 4+ in muted-foreground tabular-nums.

### Tipografia
- FONT: --font-sans (Inter / Geist-like grotesque, già mappato in tailwind fontFamily.sans) come unico font UI. --font-mono per kbd/ID/timestamp tecnici. Attivare font-feature-settings 'cv01','ss01' opzionali + 'rlig','calt' già presenti.
- SCALA TIPOGRAFICA (modulare ~1.2, low-contrast premium): display 30px/36 (text-3xl) -700 — titolo Dashboard hero; h1 24px/32 (text-2xl) -600 — PageHeader titolo standard; h2 18px/26 (text-lg) -600 — CardTitle sezione; h3 16px/24 (text-base) -600 — sub-heading; body 14px/22 (text-sm) -400 — testo UI di default (densità SaaS); meta 13px/18 -400; caption 12px/16 (text-xs) -500; eyebrow 11px/16 uppercase tracking-wide -600 muted-foreground.
- PESI: 400 body, 500 label/meta/medium nelle righe tabella, 600 titoli e numeri-metrica, 700 solo display/podio. Niente 800+. Coerenza Linear/Stripe: pochi pesi, contrasto dato da colore+size non da bold.
- NUMERI METRICA: sempre .tabular-nums (già in globals.css) per valori classifiche, counter presenze 'X/Y', conteggi team, prezzi pacchetti (cifra grande tabular + '+ IVA' inline sulla stessa baseline a size minore -500).
- TITOLI PAGINA: eyebrow uppercase muted sopra il titolo (es. 'DASHBOARD', 'PACCHETTI', 'MATERIALI'); titolo h1/display via className su PageHeader (nessuna nuova prop). Sottotitolo discorsivo in text-sm muted-foreground.
- TRUNCATION: nomi/titoli con truncate + min-w-0 nelle righe (roster, righe ranking); titoli tessere materiali con line-clamp-2 (non truncate); note anagrafica clamp a 3 righe. Tooltip su testo troncato.
- LINE-HEIGHT generoso su sottotitoli/empty copy (leading-relaxed) per respiro editoriale nelle sezioni Informativa e EmptyState.
- kbd primitivo: font-mono 11px, px-1.5 py-0.5, bg-muted, border, rounded-sm, shadow-[inset_0_-1px_0] — usato nel CommandSearchTrigger '⌘K'.

### Spacing / Radius / Ombre
- SCALA SPAZIO base 4px (multipli 4/8/12/16/24/32/48): space-1=4, space-2=8, space-3=12, space-4=16, space-6=24, space-8=32, space-12=48. Convenzione unica cross-schermata: gap card-interno 8, padding card 20 (p-5) standard / 24 (p-6) per pricing e hero, gap tra card 24 (gap-6), ritmo verticale sezioni 48 (space-y-12) nelle pagine editoriali (Informativa), 32 (space-y-8) nelle pagine dato.
- TOKEN DENSITÀ (Layer 1): --space-compact (py-1.5 righe dense), --space-cozy (py-2.5 default), --space-comfortable (py-3.5). Card density: dense=p-3, default=p-5, spacious=p-6.
- ALTEZZE riga/controlli normalizzate: input/button h-9 (36px) default, h-8 sm, h-10 lg; righe tabella roster/presenze h-14 (56px) per target tocco + respiro; header tabella h-10 sticky; topbar h-14; navlink h-9.
- SHELL tokens (CSS vars): --rail-w 3.5rem (collapsed), --side-w 16rem (expanded), --drawer-w 18rem (max-w-[88vw]), --shell-icon 1.125rem, --topbar-h 3.5rem. Sidebar e topbar condividono lo stesso 'piano-vetro' bg-card/70 backdrop-blur.
- RADIUS (token esistenti, mantenere): --radius 0.625rem → lg=0.625rem, md=calc(-2px), sm=calc(-4px), xl=calc(+0.25rem), full=9999px. Convenzione: card/sezioni rounded-xl, controlli/badge rounded-md, pill/avatar-utente rounded-full, avatar-org e icon-holder nodi rounded-lg, tessere/icon-holder 40px rounded-lg.
- OMBRE (scala token, low-chrome): shadow-xs 0 1px 2px rgba(16,24,40,.04); shadow-sm 0 1px 3px rgba(16,24,40,.06) — card di default; shadow-md 0 4px 12px rgba(16,24,40,.08) — hover card/tessere e dropdown; shadow-lg 0 12px 32px rgba(16,24,40,.12) — featured pricing, modali, sheet. Dark: ombre quasi nulle, profondità affidata a border + salto card/background.
- ELEVAZIONE coerente: superfici a riposo = border hairline + shadow-sm; hover interattivo = shadow-md + leggero translate-y-[-1px]; overlay (modal/sheet/dropdown) = shadow-lg + scrim. Topbar/sidebar NON usano border statico ma scroll-aware shadow-sm progressiva.
- HAIRLINE come separatore primario al posto di box pesanti: border-b sotto PageHeader, divide-y nelle liste/tabelle, Separator (solid/dashed/gradient) tra macro-sezioni. Niente doppi bordi (drawer/sidebar header senza border-t/b extra).

### Componenti
- CARD: cva variant elevated(shadow-sm)/bordered(border, shadow-none)/ghost(no border/shadow); density dense(p-3)/default(p-5)/spacious(p-6); sub-parts CardHeader/CardTitle(size sm/md/lg/xl)/CardDescription/CardFooter (CardDescription+CardFooter già nel barrel, da attivare in Informativa). Pattern 'sezione low-chrome' = div rounded-xl border bg-card al posto di CardHeader pesante. rounded-xl, hover:shadow-md solo se interattiva.
- BUTTON: cva variant primary(bg-primary text-on-primary, hover -600, active -700)/secondary(bg-muted)/outline(border bg-transparent)/ghost(hover bg-muted)/destructive(bg-danger)/link; size sm(h-8)/md(h-9)/lg(h-10)/icon(quadrato vero h-9 w-9). Stati condivisi: focus-visible ring-2 ring-ring ring-offset-2 ring-offset-background, disabled opacity-50 cursor-not-allowed. IconButton ghost per hamburger/collapse/close con aria-label.
- BADGE: cva variant default(primary soft)/secondary/outline/outlined/success/warning/danger/info/branch — tutti soft-fill (colore/12 bg + colore text + colore/25 border per outlined). 'Consigliato'=default, 'In arrivo'=warning, 'Aggiornato'=success, 'Versione corrente'=info. min-w per badge numerici (notifiche). rounded-md, text-xs -500.
- RANKBADGE (esistente): size sm/md/lg + variant dot(soft-fill, per righe tabella/dashboard) e badge(pieno saturo, per hero/profilo). Consuma --rank-*. Sostituisce ogni badge testuale 'Tu' (rimpiazzato da accent-ring + nome in primary).
- STATUSPILL / STATUSDOT: StatusPill soft per stage prospect/esiti chiamata/stato contatto (toni semantici distinti, alto contrasto). StatusDot tone hot/warm/cold/dormant con pulse subtle/strong (hot=pulse) come activity indicator su avatar/cella membro.
- TAG: TagList max 2 visibili + '+N' come trigger Tooltip/Popover (non sola troncatura). Soft-fill secondary, rounded-md.
- TABELLE: table nativa, thead sticky top-0 bg-card/blur, header h-10 cliccabili sort (ChevronUp/Down), tbody divide-y, righe h-14 hover:bg-muted/50 cursor-pointer, intera riga = Link. Colonna identitaria a doppia riga (avatar+dot / nome primary + sottotitolo muted). Colonna metrica allineata destra tabular-nums shrink-0. Responsive: collassa colonne secondarie nella cella identità su tablet. Matrice presenze: colonna membro sticky-left + scroll-x del solo blocco tabella, celle toggle role=checkbox aria-checked (check pieno su success / cerchio vuoto border).
- MODALI / SHEET: Modal + ModalHeader/Body/Footer centrato con scrim a tinta solida semitrasparente (no backdrop-blur per overlay contenuto). FormSheet/DetailSheet/VersionHistorySheet = side-sheet da destra (slide-in-right), max-width contenuta, full-width su mobile, sub-parts Header/Body/Footer. NodeDetailPanel = sheet h-dvh con scroll proprio su tablet, pannello laterale sticky su desktop. Focus-trap + Esc + aria-modal.
- DROPDOWN: DropdownMenu in portal, shadow-md, rounded-md, item h-9 con focus-visible ring e hover bg-muted, separator hairline. Usato per UserMenu (avatar+displayName+rank Badge+Esci), WorkspacePill switch, ScopeSwitcher, StageChanger menu secondario.
- SIDEBAR: aside bg-card/70 backdrop-blur, larghezza --rail-w/--side-w. Header con CollapseToggle ancorato (slot fisso in entrambi gli stati, PanelLeftOpen/Close). NavLink con active-state unico cross-stato: accent-bar sinistra 2px sempre presente (anche collapsed, full-height a filo rail) + icona/testo primary + bg-primary/8; hover bg-muted; collapsed→tooltip (colore primario se attivo). NavSectionLabel uppercase muted solo expanded; collapsed = solo spacing (titoli/divider spariscono). NavItem disabled: opacity + cursor-not-allowed + tooltip 'Disponibile dal rango X'. Footer (account/help) stesso linguaggio nav, niente border-t.
- NAVBAR/TOPBAR: header sticky h-14 bg-card/70 backdrop-blur, scroll-aware shadow-sm. 3 cluster (gap-2 item / gap-3 gruppi): SX brand+WorkspacePill(avatar org rounded-md + nome truncate + chevron); CENTRO CommandSearchTrigger pill 'Cerca… ⌘K' (button non input, max-w-md, su mobile→icona lente); DX ScopeSwitcher | divider verticale w-px bg-border | NotificationsBell+Badge, ThemeToggle, UserMenu. Mobile drawer w-[18rem] max-w-[88vw], scrim blur, panel staccato dal bordo, CloseButton con stato + aria-label.
- AVATAR: size sm/md/lg, rounded-full utente / rounded-lg org+nodi(h-9 w-9). src=avatar_url con fallback initials su accent derivato dal nome (hashing su palette token). Anello sottile su chip responsabile/owner.
- INPUT/SELECT/TEXTAREA: cva state default/error/success/disabled, h-9, focus-visible ring-2 ring-ring ring-offset-background. Search: icona Search a SX + Button ghost icon X clear a DX quando valorizzato + contatore live 'N di M'. Label con required indicator.
- STAT-CARD / KPI PILL: componente unificato icon-holder h-9 w-9 rounded-lg + label discreta + value tabular grande + progress bar sottile (tasso). Condiviso tra Dashboard podio, Presenze summary (3 call), BranchSummary ribbon, CallStatsStrip. Progress/meter bar anche per Equilibrio L/R.
- TABS / SEGMENTED: Tabs size sm/md/lg, stile underline/pill, indicatore attivo netto, sticky dove ospita board (Prospects/Centos). Segmented per filtri stato (Tutti/Presenti/Assenti), scope switcher (Io/Team/Globale), toggle vista. Stesso linguaggio cromatico (bg-muted track, knob bg-card shadow-sm, testo primary su attivo).
- SKELETON: shape text/line/circle/bar, shimmer keyframe. Loading isomorfo al layout (3 col x 5 righe dashboard; table rows roster/presenze; editor documenti lazy-load). SEPARATOR: solid/dashed/gradient + variante con micro-label centrale ('Materiali ufficiali').

### Microinterazioni
- HOVER righe/card: bg-muted/50 su righe tabella e nav; card interattive shadow-md + translate-y-[-1px] (transition 150ms ease-out, durata --duration-base). Chevron destro righe ranking/file: muted a riposo → foreground in hover, segnala cliccabilità senza rumore.
- FOCUS-VISIBLE: ring-2 ring-ring ring-offset-2 ring-offset-background coerente su tutti i controlli (button, navlink, input, riga-Link, toggle presenza, dropdown item). Mai outline-none senza ring sostitutivo.
- ACTIVE/PRESSED: bottoni primary → primary-700, scale 0.98 (transition 80ms). Toggle presenza: transizione fill success con scale-in del check (120ms).
- ANIMAZIONI ESISTENTI (riusare keyframes già in config): fade-in 150ms ease-out (mount sezioni/empty), scale-in 120ms ease-out (popover/dropdown/podio), slide-in-right 200ms cubic-bezier(.16,1,.3,1) (FormSheet/DetailSheet/NodeDetailPanel). Empty state canvas Binary: fade+scale in ingresso.
- LOADING: skeleton shimmer (translateX) isomorfo; Suspense boundary su tabelle/editor; bottoni async con spinner inline + label invariata (no layout shift). Topbar/sidebar scroll-shadow progressiva (shadow-sm appare allo scroll).
- EMPTY STATE: icona di dominio in cerchio muted + titolo breve + copy leading-relaxed + CTA/Link soft (es. EmptyState categoria Dashboard→Statistiche/Presenze; roster onboarding Users+CTA; no-results Search+'Azzera ricerca'; Presenze CalendarDays; canvas Binary illustrazione+CTA). Max-width + allineamento sinistra su schermi larghi.
- SUCCESS/FEEDBACK: salvataggio anagrafica → UnsavedBar sticky in fondo card (entra con slide-up) in edit mode + anello accent sulla card; conferma con micro check + fade della barra. Toast/inline a tinta success soft, mai full-screen.
- NOTIFICHE/BADGE: badge danger min-w-5 con scale-in all'incremento. NavLink attivo: accent-bar che resta stabile cross-collapse (nessun salto/animazione brusca al cambio stato sidebar).
- TOOLTIP: fade+scale 120ms, in portal, riposiziona a viewport; appare su rail collapsed, item disabled (motivazione rango), testo troncato, stato cella presenza. DRAG (kanban): DragOverlay neutralizzato che mostra lo stage di destinazione, non l'outcome; grip dots visibili a riposo (opacità 60) → pieni in hover.
- REDUCED-MOTION: media-query prefers-reduced-motion disabilita translate/scale/slide, mantiene solo opacity fade. Token motion: --duration-fast 80ms, --duration-base 150ms, easing standard cubic-bezier(.2,0,0,1) / emphasized (.16,1,.3,1).

### Architettura delle informazioni
- SHELL globale a 3 zone (invariata come IA, unificata come grammatica): Topbar sticky + Sidebar rail/expanded + Main. Un solo 'materiale vetro' (bg-card/70 backdrop-blur) condiviso da topbar e sidebar. Stessi gruppi/voci nav esistenti.
- NAV PRIMARIA (sidebar, gruppi con micro-label uppercase solo in expanded): [Operatività] Dashboard, Statistiche/Team, Percorso Prospect; [Rete] Binary Viewer, Presenze Zoom; [Risorse] Informativa; [Gestione] Admin/Impostazioni. Item filtrati per permesso restano nascosti; item bloccati per rango mostrati in stato disabled con tooltip 'Disponibile dal rango X'.
- RICERCA GLOBALE: CommandSearchTrigger al centro topbar (⌘K) apre command palette overlay — punto unico di navigazione rapida. Su mobile collassa a icona-lente.
- CONTESTO vs SISTEMA in topbar destra (divider verticale): contesto = ScopeSwitcher (Io/Team/Globale, sempre presente); sistema = Notifiche + Tema + UserMenu. Separazione chiara delle due responsabilità.
- GERARCHIA PAGINA standard: PageHeader (eyebrow + titolo + sottotitolo + slot actions) → hairline border-b → [toolbar/filtri sticky se data-page] → contenuto. Coerente su Dashboard, Statistiche, Presenze, Informativa, Prospects, CRM.
- DRILL-DOWN: roster /statistiche → riga cliccabile → profilo /team/[id] (Hero → Anagrafica → File → Tabs Prospects/Centos). Board /prospects → card → /prospects/[id] (header + stepper 6-fasi + timeline unificata + sidebar Riepilogo/Prossimo passo). Binary canvas → nodo → NodeDetailPanel laterale/sheet.
- PATTERN TABELLA-vs-DETTAGLIO unificato (Contatti/Chiamate/Documenti): AppBar sticky (header+tab+ricerca+azione) → FilterBar sticky (chip + pill periodo attivo) → DataTable a colonne prioritizzate → click riga = DetailSheet read, matita = FormSheet edit. Overlay sempre side-sheet da destra.
- RESPONSIVE IA: desktop sidebar expanded + multi-colonna (xl 3col dashboard, 2/3+1/3 profilo, 8/4 prospect detail); tablet sidebar rail + colonne collassate/stack, tabelle con scroll-x del solo blocco; mobile drawer nav + stack 1 colonna + valori/metriche sempre visibili. Bottom-sheet per pannelli contestuali su tablet/mobile.
- FOUNDATIONS page (doc viva, opzionale, no logica): sidebar di ancore Tokens/Colore/Tipografia/Spaziatura&Densità/Primitivi/Pattern + ThemeToggle per validare light/dark e contrasto AA.

### Roadmap di implementazione (solo estetica)
- FASE 0 — Baseline sicura (no UI change): snapshot del build verde (npm run build / typecheck), screenshot delle schermate chiave light+dark come riferimento visivo di regressione. Nessun file toccato.
- FASE 1 — TOKENS (globals.css + tailwind.config.ts, additivi e non-breaking): aggiungere SOLO nuove CSS var senza rimuovere le esistenti — scale derivate 50/100/600/700 per primary+semantici, token on-* (on-warning scuro), --branch-left-foreground/--branch-right-foreground AA, token elevation (shadow-xs/sm/md/lg), motion (--duration-fast/base, easing, reduced-motion), shell vars (--rail-w/--side-w/--drawer-w/--topbar-h/--shell-icon), icon-size, spacing-densità. Mappare in tailwind.config.extend (colors/boxShadow/transitionDuration/spacing). Verifica: build verde, zero diff visivo (token non ancora consumati).
- FASE 2 — PRIMITIVI UI (web/components/ui/*, cva additivo): estendere le cva con nuovi assi variant/size MANTENENDO i default attuali identici (es. Button.size default = comportamento odierno). Aggiungere: Button variant outline/secondary + size icon quadrato; Card variant/density + attivare CardDescription/CardFooter; Badge outlined + warning/success già presenti; Input state error/success; Tabs size/stile; RankBadge size+dot; Avatar hashing su palette token; Skeleton shapes; Separator dashed/gradient; kbd. Nessuna prop rimossa/rinominata. Verifica per-primitivo: render snapshot, default invariati, build verde.
- FASE 3 — SHELL (AppShell/Sidebar/Topbar/MobileDrawer): applicare piano-vetro condiviso, scroll-aware shadow, NavLink active-state cross-stato, CollapseToggle ancorato, WorkspacePill/CommandSearchTrigger/ScopeSwitcher/UserMenu, drawer tokenizzato. Solo classi/markup di presentazione, IA e routing invariati. Verifica: navigazione, collapse, mobile drawer, focus/tooltip, light/dark.
- FASE 4 — SCHERMATE data-light a basso rischio (riuso massimo): Dashboard (podio + classifiche low-chrome + loading.tsx skeleton + empty), Informativa (pricing ordinato + materiali a tessere + 'In arrivo' disabled estetico), Presenze Zoom (command bar + 3 StatCard + matrice sticky). Nessuna modifica a data-layer/funzioni. Verifica per-schermata: stati loading/empty/no-results, responsive tablet, tabular-nums.
- FASE 5 — SCHERMATE relazionali: Statistiche (toolbar sticky + DataTable a doppia riga + sort presentazionale), Profilo /team/[id] (Hero+StatStrip, DefinitionGrid, TabBar, sidebar File, UnsavedBar in edit), Percorso Prospect (board funnel-summary + kanban ricomposto + dettaglio 8/4 timeline unificata). Riuso di FunnelProgress/JourneyTimeline/ProspectCalls/StageChanger senza nuova logica. Verifica: drag&drop invariato, edit/save flow invariato.
- FASE 6 — Binary Viewer (più sensibile per React Flow): topbar+scope, BranchSummary ribbon con KPI pill unificata, MarketerNode a densità ridotta, connettori/minimap che consumano le CSS var risolte (branch-*-foreground AA), NodeDetailPanel laterale/sheet, empty state animato. Verifica: zoom/pan/add-member invariati, contrasto AA L/R, performance canvas.
- FASE 7 — CRM tabellari (Contatti/Chiamate/Documenti/Impostazioni): AppBar+FilterBar sticky, DataTable colonne prioritizzate, BulkBar flottante, side-sheet read/edit con overlay solido, CallStatsStrip, DocumentLibrary collassabile, Impostazioni colonna centrata. Verifica: bulk actions, sheet read/edit, lazy-load editor skeleton.
- FASE 8 — Foundations page + hardening: pagina doc viva (ancore + ThemeToggle) per validare il sistema; audit AA contrasto su tutti i fill semantici e branch; sweep reduced-motion; rimozione eventuali colori hardcoded residui sostituiti da token. Verifica finale: build verde, lighthouse a11y, parità funzionale 1:1 con baseline Fase 0.
- REGOLA TRASVERSALE per ogni fase: branch dedicato, modifiche SOLO estetiche (className/markup/token/cva additivi), nessun cambio a logica/dati/handler/props-contract; ogni fase chiude con build verde + diff visivo rivisto prima del merge; rollback per-fase isolato.
