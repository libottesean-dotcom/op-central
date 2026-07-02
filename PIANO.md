# PIANO — OP Central (One Piece TCG · Market & Collection)
> **Unica fonte di verità del progetto.** Si aggiorna a ogni sessione. Ultimo aggiornamento: **02/07/2026**.

---

## 1. Stato attuale (cosa è stato fatto)

### App (`chase-tracker (2).html`)
- [x] 4 tab: **Esplora / Watchlist / Collezione / News**
- [x] Filtri ovunque: ricerca, set, tipo, lingua, rarità
- [x] Dropdown rarità ordinato per scarsità reale (fonti: guide ufficiali OPTCG 2026): Manga Rare → Treasure Rare → SP → Special → Secret Rare → Alt-art → Super Rare → Leader → Rare → Promo → DON
- [x] Watchlist con colonne ordinabili + tracking quantità
- [x] Grafico Collezione con timeframe
- [x] News: 9 elementi / 24h, prezzo minimo €5, bottone "Apri carta"
- [x] Modal dettaglio carta: grafico trend, prezzi medi, inserzioni, link Cardmarket
- [x] Immagini carte a piena risoluzione
- [x] Persistenza in localStorage (chiave `optcg_vault_v3`)
- [x] Ordinamento set: OP01..OP17, EB, PRB, ST
- [x] Etichette "Portfolio" rinominate "Collezione"
- [x] Funzione contabilità: costruita e poi **rimossa completamente** su richiesta
- [x] **FASE A (02/07 sera)**: grafico scheda carta leggibile (etichette 11.5px chiare + valori € sui punti + tooltip hover), storico prezzi REALE (`history:[{d,p}]` in catalog.js, grafico e sparkline usano la serie vera da 2+ giorni), campo "Pagato" + P&L per riga e nella hero Collezione, scroll infinito in Esplora (via il cap a 600)

### Pipeline dati (script Node in questa cartella)
- [x] `optcg_build.mjs` — download catalogo da RapidAPI tcggo, riprendibile (stato in `optcg_state.json`)
- [x] `optcg_catalog.mjs` — genera `catalog.js`; esegue pulito (verificato 02/07)
- [x] **Link diretti Cardmarket**: singole `/Singles/{Espansione}/{Nome}-{codice}-Vn` (verificati 22/22), box `/Booster-Boxes/...`; i case restano su URL di ricerca
- [x] **Filtro DON €1**: attivo e verificato (vedi §2) — 104 DON grezze → 79 tenute, 25 scartate (prezzo noto < €1), 0 DON sotto €1 residue; le non-DON economiche (es. Common €0,02) restano; le DON costose (Boa Hancock €87, Blackbeard €65, PRB02/EB03) restano
- [x] `optcg_daily.bat` + task pianificato **"OPTCG Catalog Daily"** (ogni giorno ore **05:30**, così alle 07:30 è tutto pronto): build + map + prezzi + **snapshot storico** (`optcg_history.mjs`) + rigenerazione catalogo, log in `optcg_daily.log`
- [x] Prodotti sigillati: **completi** (147: 24 Box + 30 Case nel catalogo)
- [x] Episodi: completi (53)
- [x] **FASE 2 attiva (02/07)**: `optcg_config.json` (API key, budget), `optcg_cmapi.mjs` (client + budget guard), `optcg_map.mjs` (mapping id riprendibile → `optcg_cmmap.json`), `optcg_prices.mjs` (prezzi giornalieri EN/JP → `optcg_prices.json`), `optcg_verify.mjs` (verifica headless di catalog.js)

### Numeri catalogo al 02/07/2026 (sera, dopo pulizia rarità + FASE 2)
| Voce | Valore |
|---|---|
| Carte scaricate (grezze tcggo) | **1600 / 4273** (riprende da pagina 2/214) |
| Voci in `catalog.js` | **1148** = 979 singole (+109 JP) + 24 Box + 30 Case + 6 extra |
| Mapping id Cardmarket | 823/881 entries con id EN · 110 id JP |
| Prezzi API | **895** prodotti in cache · oggi 1729/2000 richieste usate |
| Set presenti | OP01–OP17, EB01/02/03/05, PRB01/02, P-041/P-110 (Starter Deck ST esclusi) |
| Stima a catalogo completo | ~1.800–2.000 voci |
| Dimensione `chase-tracker (2).html` | **~92 KB** (era 662 KB: rimossi base64 + fallback in FASE 3) |

---

## 2. Decisioni fisse (non si ridiscutono)

1. **Una sola fonte prezzi: cardmarketapi.com** — piano Starter $49,99/mese, 2000 richieste/giorno. Niente eBay. tcggo resta SOLO come lista catalogo (quali carte esistono, nomi, immagini, set), MAI come fonte prezzi.
2. **Rarità escluse dal catalogo**: Common e Uncommon FUORI (tutte, sempre); DON!! fuori solo se prezzo noto < €1 (le DON senza prezzo si tengono). Tutte le altre rarità (Rare comprese) si tengono a qualunque prezzo. Box/Case mai filtrati.
3. **Webapp privata**, prezzi in **EUR**, prezzi **EN e JP distinti** per ogni carta.
4. **Niente Starter Deck** — tutti i set ST (ST22, ST23, …) sono esclusi dal catalogo, sia carte che prodotti.
5. **NO confronto EN/JP affiancato nella scheda carta** — proposto e rifiutato esplicitamente dall'utente il 02/07: non riproporre.
6. **NO contabilità pesante** (registri acquisti/vendite): bocciata e rimossa. Il tracking economico della Collezione è SOLO campo "Pagato" unitario + P&L.

---

## 3. Cosa manca (roadmap verso il go-live)

### ⭐ ROADMAP APPROVATA dall'utente (02/07 sera) — FASI A/B/C

**FASE A — Qualità app · 🟢 COMPLETATA (02/07 sera)**
| Item | Stato |
|---|---|
| Fix leggibilità grafico scheda carta (etichette 11.5px chiare, valori € sui punti, tooltip hover sui punti) | ✅ |
| Storico prezzi reale: `optcg_history.mjs` + snapshot giornaliero + `history:[{d,p}]` in catalog.js + grafico/sparkline sulla serie vera (primo snapshot 02/07 salvato: 654 prodotti) | ✅ |
| Guadagno/perdita in Collezione: campo "Pagato" per riga (localStorage) + P&L per riga (€ e %, verde/rosso) + "Costo totale" e "P&L totale" nella hero (solo righe col pagato impostato) | ✅ |
| Esplora senza cap a 600: scroll infinito (IntersectionObserver, batch da 200), filtri resettano la lista | ✅ |

**FASE B — Condivisione coi soci · 🟡 PARZIALE (honest status 02/07 notte)**
| Item | Stato REALE |
|---|---|
| Progetto Supabase **op-command-deck** | ✅ |
| Tabelle DB + account condiviso | ✅ |
| Sync collezione/watchlist (server locale porta 8778) | ✅ **solo se PC acceso + optcg_start.bat** |
| Storico prezzi nel DB | ✅ 1 giorno salvato (serve accumulo) |
| `optcg_start.bat` | ✅ |
| **Soci da remoto (internet)** | ❌ NON FATTO — serve deploy Render/VPS |
| **GitHub Actions attivo** | ✅ Repo https://github.com/libottesean-dotcom/op-central · secrets `DATABASE_URL` + `CARDMARKET_API_KEY` · cron 05:30 UTC+2 |
| **Aggiornamento senza PC acceso** | 🟡 GitHub Actions fa build/map/prezzi/storico/catalog ogni mattina; **catalog.js** va ancora servito (Pages/Render static) |

**FASE C — Alert + mobile · 🟡 PARZIALE**
| Item | Stato REALE |
|---|---|
| Script Telegram | 🟡 file pronto, **disabilitato** — manca bot_token + chat_id |
| PWA (manifest + sw) | 🟡 base minima — **non testata** su telefono reale |

**FASE D — Qualità dati · 🔴 IN CORSO**
| Item | Stato REALE |
|---|---|
| Catalogo carte tcggo | 🔴 **1600 / 4273** (~37%) — mancano ~2673 carte |
| Voci in catalog.js | 🔴 **938** su ~1800-2000 attese |
| Prezzi Cardmarket aggiornati | 🔴 **655 prodotti** su ~938+ — non tutto il catalogo |
| Mapping Cardmarket completo | 🔴 tier 3-4 ancora da finire |
| Tutti i prodotti aggiornati ogni 24h | 🟡 **Ora sì** (~931 prodotti mappati < 2000 req/g). Quando catalogo pieno EN+JP (~2500 req) serve rotazione tier 4 o meno mapping nello stesso giorno |
| Promo set "P" completi | ❌ da verificare |
| EB04 normalizzazione | ❌ da verificare |
| Storico 7/14/30g reale | ❌ serve 7+ giorni di snapshot (oggi: 1 solo giorno) |

**FASE 4 — Go-live · ❌ NON INIZIATA**
| Item | Stato |
|---|---|
| Progetto fuori da Downloads | ❌ |
| Git repo | ❌ |
| Hosting su dominio | ❌ |
| Login davanti a tutto (internet) | ❌ |
| Pipeline cloud 05:30 senza PC | ❌ |

### FASE 1 — Catalogo completo · 🟡 in corso, automatico
| Passo | Stato |
|---|---|
| Scaricare le ~2673 carte restanti (tcggo, quota free ~100 req/g... ma il batch scarica ~800/run) | 🟡 riprende da solo ogni giorno alle 05:30 col task pianificato → completo in **~3-4 giorni**. Deciso il 02/07: si procede gratis, senza fretta |
| A download completo: verificare presenza set Promo "P" ed EB04 | ⬜ |
| **Anomalia nota**: le carte EB04 già scaricate arrivano da tcggo con `set = OP14/OP15` (es. EB04-011 → set OP14). Verificare/normalizzare quando il set EB04 vero arriva | ⬜ |

### FASE 2 — Pipeline prezzi cardmarketapi.com · 🟢 ATTIVA (dal 02/07/2026)
**API key Starter configurata in `optcg_config.json` (2000 req/giorno — la chiave sta SOLO lì, mai nell'HTML/catalog.js).**

**Scoperta chiave (verificata 02/07):** il `cm_id` di tcggo **È** il product id di Cardmarket usato da cardmarketapi.com → gli id EN di ~1418 singole e di tutti i 54 box/case sono arrivati GRATIS, senza ricerche. Le ricerche a pagamento servono solo per: id JP, versioni senza `cm_id`, item extra della watchlist.

| Passo | Stato |
|---|---|
| [x] Script di mapping `optcg_map.mjs` (riprendibile, salva ogni 20 ricerche in `optcg_cmmap.json`) | 🟢 tier 1-2 completati il 02/07 (watchlist+collezione + singole ≥€20); i tier 3-4 (~340 code) proseguono da soli col task delle 05:30 |
| [x] Script fetch prezzi giornaliero `optcg_prices.mjs` → `optcg_prices.json` | 🟢 attivo: EN/JP distinti in EUR, trend/avg30/avg5/available/listings(max 10) + storico giornaliero per le serie 7/14/30g |
| [x] Rotazione priorità nel budget | tier 1 = watchlist+collezione SEMPRE, poi ≥€20, poi ≥€5, poi il resto round-robin; cap giornaliero 1800 (oggi 1400, per lasciare margine), gestione 429/502 |
| [x] Integrato in `optcg_daily.bat` | ordine: build tcggo → map → prices → catalog |
| [x] Campi del modal collegati | `optcg_catalog.mjs` fonde mappa+prezzi in catalog.js: cm=prices.from, trend, avg30, avg5, available, listings, fetched_at |
| [x] Split EN/JP reale | per ogni carta col prodotto JP mappato e prezzato viene emessa la voce gemella lang:"JP" (prezzi dalle inserzioni giapponesi) |
| [x] **Fix versione/rarità delle voci JP (02/07 sera)** | **Cardmarket versiona i prodotti JP indipendentemente dall'EN** (es. OP13-118: manga rare = EN V.5 ma JP V.4): `optcg_map.mjs` accoppiava i jp_id per ordine di id (i nomi JP della ricerca non hanno "(V.n)") e `optcg_catalog.mjs` faceva ereditare ver/rarity dall'EN → il Luffy JP manga da €13.000 appariva "V.3 · Special". Ora in `optcg_catalog.mjs`: **ver JP = versione parsata dal NOME del prodotto JP** (da `/card/{id}`), **rarità dalla versione EN corrispondente per fascia di prezzo** (media geometrica trend×from; match per rango se JP ed EN sono in pari numero, altrimenti V.1/V.2 → stessa versione EN e per il resto nearest-neighbor log-prezzo; oltre 12x di distanza la rarità resta vuota). Guardia anti-doppioni: ogni jp_id emesso una sola volta. 7 voci JP rietichettate (OP12-118 invariata, OP13-042 ok, OP13-118/119/120 corrette). Regola documentata nel commento del pass 2 in `optcg_catalog.mjs` |
| [x] **Fix URL Cardmarket delle voci JP (02/07 sera)** | i link JP davano "Error: invalid expansion": (1) `expansionSlug` puliva la punteggiatura per-parola e collassava "Non-English" in "NonEnglish" (lo slug vero è `...-Non-English`: ora lo slug divide anche sui trattini); (2) l'espansione JP veniva indovinata appendendo " Non-English" al setName EN, ma il marker vero varia per set ("(Non-English)" per OP12/OP13, "(Japanese)" per Pillars of Strength): ora `jpSingleUrl` usa il campo `expansion` REALE del prodotto JP salvato in `optcg_prices.json`. Verificati sul sito: JP OP13-118 V.3, JP versionless Gol.D.Roger OP09-118, Sogeking OP03-122 V.3 (Japanese), EN OP13-118 V.5, Box OP13 — tutti sulla pagina prodotto giusta, 0 chiamate API |
| [x] **Immagine giapponese per le voci JP** | fatto il 02/07: le voci lang:"JP" usano l'immagine del prodotto giapponese (`https://cardmarketapi.com/cards/{jp_id}/image`, URL pubblico e deterministico — 0 richieste API extra); tutte le 58 voci JP hanno già la grafica JP. `optcg_prices.mjs` ora salva anche `image_url` |
| [x] Guardia anti-id-sbagliati | alcuni `cm_id` tcggo sono errati (id scambiati su EB04/PRB02, un id Pokémon su OP16-060): se il nome del prodotto API non contiene il code della carta, il prezzo API viene ignorato e resta il placeholder tcggo (6 casi bloccati) |
| ⬜ JP per i set recenti (es. OP16) | su cardmarketapi i prodotti OP16 "extra" risultano "Asia Region Legal", non "(Non-English)": nessun prodotto JP separato trovato per ora — da ricontrollare più avanti |
| [x] **Storico prezzi REALE (02/07 sera, FASE A)** | nuovo `optcg_history.mjs`: dopo il fetch prezzi salva lo snapshot del giorno in `optcg_history/YYYY-MM-DD.json` (un file per data, mai riscritti i giorni passati; rieseguito nello stesso giorno sovrascrive solo il file di oggi = dedupe). Primo snapshot **02/07: 654 prodotti**, 0 chiamate API. `optcg_catalog.mjs` fonde snapshot + `dayHistory` in `history:[{d,p}]` (p = trend, fallback from; max 60 giorni) su ogni voce prezzata; grafico scheda e sparkline usano la serie vera da 2+ giorni, prima resta il fallback sintetico. Integrato in `optcg_daily.bat` (dopo optcg_prices, prima di optcg_catalog) |
| ⬜ Storico 7/14/30g dai dati veri | si popola da solo man mano che snapshot/`dayHistory` accumulano giorni (t7 dopo 7 giorni, ecc.) |

### FASE 3 — Rifiniture app · 🟢 COMPLETATA (02/07 sera)
| Passo | Note |
|---|---|
| ✅ Rimosso il fallback hardcoded dall'HTML (02/07) | via i blob base64 `IMG.*`, `FALLBACK_ITEMS` (ora `[]`) ed `EXTRA_WATCHLIST_ITEMS` (ora `[]` — le 6 promo/extra sono in catalog.js con prezzi e immagini API, verificato). HTML: **662 KB → 92 KB**. Se `catalog.js` manca la pagina mostra uno stato vuoto ("Catalogo non trovato") senza crashare. Il dedupe `wlKey` e il `WATCHLIST_SEED` (identità+target) restano per i browser nuovi |
| ✅ Sanity pass News/ticker con i prezzi veri (02/07) | nuova metrica robusta: il "prezzo corrente" per i movimenti è il **trend Cardmarket** (`curPx`), non più `cm`=prices.from (ask minimo, volatile). mov30 = trend vs avg30 (media vendite reale); per le voci senza t7 (JP, sealed) la news/ticker usa il movimento 30g etichettato "30 giorni". Voci JP marcate "(JP)" nel titolo news e nel ticker. Cap sui sealed illiquidi (max 3 nel ticker e nelle news) per non monopolizzare coi ±150% di box/case. Sempre 9 news e soglia €5. **Caso "Ace €2100 +1356%" diagnosticato**: OP13-119 V.3 ha from=€2100 (5 inserzioni €2100-4000) contro trend €122/avg30 €145 → il vecchio mov7 (cm vs t7) esplodeva; col trend il movimento è -15% |
| ✅ Fix modale dettaglio carta con dati API reali (02/07) | il CSS globale `table { min-width:1815px; table-layout:fixed }` + `tbody td { height:68px }` si applicava anche alla tabella inserzioni del modale → righe giganti/vuote e link Cardmarket fuori schermo; ora `.cd-listings` ha regole proprie e il footer resta su una riga |
| ✅ Marcatura lingua JP | attiva dal 02/07 (86+ carte al primo giro); dal 02/07 sera anche news e ticker etichettano "(JP)" |
| ✅ Spot-check qualità prezzi (02/07) | 5 prodotti diversi (Shanks Manga OP09-004 V.4, Ace JP OP13-119 V.4, Box OP01, Case OP09, Shanks PRB02 OP06-007 V.2): listings ascendenti, listings[0]=cm, avg5 = media delle 5 inserzioni più economiche (verificato al centesimo), cm/trend in banda [⅓, 3×]. Unico flag: Ace OP13-119 V.3 EN (cm/trend = 17×, vedi diagnosi sopra) — dato Cardmarket reale (inserzioni gonfiate), non bug della pipeline. Nota: Cardmarket blocca il fetch diretto (403), validata la coerenza interna |

### FASE 4 — Go-live: webapp condivisa con i soci · ⬜ (requisiti definiti il 02/07)
**Requisito**: la webapp è usata da PIÙ SOCI con collezione IN COMUNE → **1 account unico condiviso** con pagina di **login**, e **dati condivisi**: collezione/watchlist/quantità/target NON più in localStorage ma in un database, così le modifiche di uno le vedono tutti.

| Passo | Note |
|---|---|
| ⬜ Spostare il progetto fuori da `Downloads` in una cartella dedicata (es. `C:\Progetti\optcg-tracker`) e aggiornare percorso nel `.bat` e nel task pianificato | consigliato appena possibile |
| ⬜ Mettere sotto **git** | storia delle modifiche, rollback |
| ⬜ **Backend: Supabase** (gratis per questo uso) — Auth con 1 account condiviso + pagina di login, e tabella `vault` per lo stato condiviso al posto di localStorage | scelto dall'utente il 02/07 ("anche Supabase poco mi frega") |
| ⬜ Migrare lo stato: localStorage `optcg_vault_v3` → Supabase (import una tantum dei dati esistenti, poi lettura/scrittura condivisa) | |
| ⬜ Hosting su **dominio** con login davanti a tutto | dominio da scegliere |
| ⬜ **Aggiornamento giornaliero NEL CLOUD**: gli script (build catalogo, mapping, prezzi) si spostano su un job cloud gratuito (GitHub Actions cron o Supabase Edge Function) alle 05:30 — **il PC dell'utente NON deve essere acceso, non serve più a nulla** | il task locale resta solo finché non si va live |

---

## 4. Come lavoriamo (regole)

- Questo file si aggiorna **a ogni sessione** (cosa fatto, cosa deciso, cosa resta).
- **Una sola fonte prezzi** (cardmarketapi.com). Nessuna eccezione.
- Nessuna feature nuova senza aggiornare questo file.

---

## 5. ROADMAP DETTAGLIATA giorno per giorno

### 📅 OGGI — gio 2 luglio (fatto/in corso)
| Step | Dettaglio | Stato |
|---|---|---|
| 2.1 | Chiave API Starter comprata e configurata (`optcg_config.json`) | ✅ |
| 2.2 | Scoperta: `cm_id` tcggo = id Cardmarket → ~1418 id EN gratis senza ricerche | ✅ |
| 2.3 | Mapping tier 1-2: watchlist (46) + collezione (2) + singole ≥€20, incl. id JP | ✅ |
| 2.4 | Primo giro prezzi EN/JP reali → dentro `catalog.js` (86+ voci JP emesse) | ✅ |
| 2.5 | Pulizia rarità: via Common/Uncommon, DON <€1, Starter Deck; ordine rarità ufficiale | ✅ |
| 2.6 | Task giornaliero spostato alle 05:30 | ✅ |

### 📅 VEN 3 luglio — 05:30 automatico (PC acceso)
| Step | Dettaglio |
|---|---|
| 3.1 | tcggo: +800 carte grezze (→ ~2400/4273) |
| 3.2 | Mapping automatico dei nuovi arrivi + tier 3-4 (~340 code rimasti) |
| 3.3 | Prezzi: watchlist+collezione SEMPRE, poi ≥€20, ≥€5, resto a rotazione (cap 1800) |
| 3.4 | 07:30 → app aggiornata |

### 📅 SAB 4 – DOM 5 luglio — 05:30 automatico
| Step | Dettaglio |
|---|---|
| 4.1 | tcggo completa il download (4273/4273) → catalogo finale ~1.800-2.000 voci |
| 4.2 | Verifica set Promo "P" ed EB04 (anomalia OP14/OP15 da normalizzare) |
| 4.3 | Mapping completo di tutto il catalogo |
| 4.4 | Da qui: REGIME — ogni mattina tutto aggiornato senza toccare nulla |

### 📅 FASE 3: rifiniture — ✅ FATTA IN ANTICIPO (02/07 sera)
| Step | Dettaglio | Stato |
|---|---|---|
| 5.1 | Rimozione fallback hardcoded dall'HTML (662 KB → 92 KB) | ✅ |
| 5.2 | Sanity pass su News/ticker con i prezzi veri (metrica trend-based, JP marcati, cap sealed) | ✅ |
| 5.3 | Controllo qualità: spot-check su 5 prodotti (coerenza interna: Cardmarket blocca il fetch diretto) — unico anomalo: Ace OP13-119 V.3 (inserzioni gonfiate vs trend) | ✅ |

### 📅 A SEGUIRE — FASE 4: go-live condiviso con i soci (2-3 sessioni)
| Step | Dettaglio | Serve da te |
|---|---|---|
| 6.1 | Progetto in cartella dedicata + git | — |
| 6.2 | Supabase: progetto + Auth (1 account condiviso) + tabella `vault` per lo stato condiviso | — |
| 6.3 | App: login davanti a tutto + stato letto/scritto su Supabase invece di localStorage (import una tantum dei dati attuali) | — |
| 6.4 | Aggiornamento giornaliero spostato NEL CLOUD (GitHub Actions cron 05:30) → **PC non serve più** | — |
| 6.5 | Pubblicazione su dominio | **nome dominio da scegliere** |
| 6.6 | Test finale con i soci: login, modifiche condivise, prezzi freschi | credenziali da distribuire ai soci |

### Budget API (promemoria)
2.000 req/giorno (Starter) · cap operativo 1.800 · watchlist/collezione sempre aggiornate ogni giorno, resto a rotazione ogni 2-3 giorni · lo storico 7/14/30g si costruisce da solo giorno dopo giorno.
