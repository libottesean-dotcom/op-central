# PIANO — OP Central (One Piece TCG · Market & Collection)
> **Fonte di verità del progetto.** Ultimo aggiornamento: **03/07/2026**.

---

## 1. Stato attuale

### Produzione
| Servizio | URL |
|---|---|
| **App web** | https://op-central-app.onrender.com |
| **Sync collezione/watchlist** | https://op-central-sync.onrender.com |
| **Repo** | https://github.com/libottesean-dotcom/op-central |

Login condiviso: `opcentral@deck.local` (password impostata manualmente in produzione).

### Completato ✅
- App 4 tab: Esplora / Watchlist / Collezione / News
- Prezzi Cardmarket EN/JP via cardmarketapi.com (unica fonte prezzi)
- **1162 voci** in catalog.js · **917 (79%)** con prezzo API live
- **Link Cardmarket 1162/1162** — slug diretti, zero Search, zero `?idProduct=` rotto
- Case watchlist (OP01–OP16) → pagina prodotto Booster-Boxes specifica
- Sync Supabase + login condiviso
- GitHub Actions `optcg-daily.yml` — pipeline + commit automatico + deploy Render
- Script verifica: `optcg_verify.mjs`, audit URL: `optcg_urls.mjs`
- Scroll mobile modale carta fixato
- **NO eBay** (colonna rimossa)
- **NO Telegram alert**
- **NO app mobile / PWA installabile** — sito responsive via browser, dominio Render OK

### Numeri catalogo (03/07/2026)
| Voce | Valore |
|---|---|
| Carte grezze tcggo | **1960 / 4273** (~46%) — limite quota download |
| Voci catalog.js | **1162** (997 EN + 111 JP carte + 24 Box + 30 Case) |
| Prezzi API applicati | **917 / 1162 (79%)** |
| Mapping Cardmarket | 823 en_id · 110 jp_id |
| Snapshot storico | **1 giorno** (cresce automaticamente ogni notte) |

---

## 2. Decisioni fisse

1. **Una sola fonte prezzi**: cardmarketapi.com (Starter 2000 req/g).
2. **NO eBay** — colonna e pipeline rimosse dall'UI.
3. **NO Telegram alert**.
4. **NO app mobile** — solo sito web responsive su Render.
5. **Dominio**: `op-central-app.onrender.com` (OK così).
6. **Webapp privata**, EUR, EN/JP distinti, no Starter Deck.
7. **NO contabilità pesante** — solo campo "Pagato" + P&L in Collezione.

---

## 3. Cosa resta (roadmap al 100%)

### 🔴 Automatico — in corso (non richiede intervento)
| # | Task | ETA | Note |
|---|---|---|---|
| A1 | Completare download tcggo (4273 carte) | ~3-4 giorni | ~800 carte/giorno via GHA 05:30, limite API tcggo |
| A2 | Mapping tier 3-4 restante | con A1 | Prosegue nel job notturno |
| A3 | Prezzi API → 100% voci mappate | con A1 | Budget 2000 req/g, rotazione tier |
| A4 | Storico prezzi reale 7/14/30g | 7-30 giorni | 1 snapshot/giorno, grafici migliorano da soli |

### 🟡 Qualità dati — da fare quando catalogo cresce
| # | Task | Note |
|---|---|---|
| B1 | Fix ~6 cm_id tcggo errati (EB04 Jinbe, Boa, Don OP16…) | Guardia attiva: prezzo API ignorato se code non combacia. Serve re-search mapping |
| B2 | Normalizzazione EB04 (tcggo assegna set OP14) | Quando EB04 completo in download |
| B3 | Verifica set Promo "P" | A catalogo completo |

### 🟢 Ops — configurazione una tantum
| # | Task | Stato |
|---|---|---|
| C1 | GitHub Secrets: `CARDMARKET_API_KEY`, `DATABASE_URL` | Verificare su repo |
| C2 | GitHub Secrets opzionali: `RENDER_API_KEY`, `RENDER_SERVICE_ID` | Backup deploy trigger |
| C3 | Render autoDeploy su push master | ✅ attivo |

### ❌ Escluso (decisione utente)
- eBay
- Telegram alert
- App mobile / PWA installabile
- Dominio custom
- GitHub Pages (rimosso workflow rotto)

---

## 4. Automazione giornaliera (05:30 Roma)

```
GitHub Actions optcg-daily.yml
  → optcg_build.mjs      (download tcggo, riprendibile)
  → optcg_map.mjs        (mapping id Cardmarket)
  → optcg_prices.mjs     (prezzi EN/JP)
  → optcg_history.mjs    (snapshot giornaliero)
  → optcg_history_db.mjs (storico su Supabase)
  → optcg_catalog.mjs    (genera catalog.js)
  → optcg_urls.mjs       (audit link)
  → optcg_verify.mjs     (test headless)
  → git commit + push    (Render auto-deploy)
```

**Il PC non serve più acceso** per aggiornamenti quotidiani.

---

## 5. Completamento stimato

| Area | % |
|---|---|
| App + deploy + link + sync | **95%** |
| Catalogo + prezzi completi | **~50%** (limitato da tcggo) |
| Storico grafici reali | **~10%** (tempo) |
| **Totale progetto** | **~65%** → **100% in ~2-4 settimane** automatici |

---

## 6. Comandi utili (locale)

```bat
optcg_start.bat          REM sync server locale (dev)
node optcg_catalog.mjs   REM rigenera catalog.js
node optcg_verify.mjs    REM test qualità
node optcg_urls.mjs      REM audit link Cardmarket
node optcg_site_build.mjs REM prepara public/ per Render
```
