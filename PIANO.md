# PIANO — OP Central · Completamento catalogo EN/JP + API
> **Fonte di verità.** Aggiornato: **04/07/2026 ~11:30**

---

## Obiettivo

Catalogo **1:1 EN/JP** per singole, box e case. Budget API **1950 req/giorno** organizzato per tier.

### Target finale (verità dati)

| Categoria | EN | JP | Product id totali |
|-----------|-----|-----|-------------------|
| Singole chase | **1.642** | **1.642** | **3.284** |
| Box | **24** | **24** | **48** |
| Case | **30** | **30** | **60** |
| **Totale** | **1.696** | **1.696** | **3.392** |

Promo/extra watchlist (~6): fuori dal conteggio 1:1.

---

## Fasi

### Fase A — Mapping Cardmarket (`optcg_map.mjs`) ✅ in corso

**Singole**
- JP riconosciuto con `(Non-English)`, `(Japanese)`, `(Asia Region Legal)`
- Accoppiamento per **code carta + versione**, non nome set
- Recupero automatico: **600 code/giorno** con `jp_id` null

**Box/Case** (implementato oggi)
- Ricerca per set (`OP14 Booster Box` ecc.)
- JP scelto per tipo prodotto (box / box-case / sleeved-case / pre-errata)

**Budget mapping:** `daily_cap - map_reserve` = **1450 req/giorno** (500 riservate ai prezzi se stesso giorno)

| Stato oggi | Valore |
|------------|--------|
| Singole `jp_id` | ~1369 / ~2026 cmmap (~1642 catalogo) |
| Sealed `jp_id` | 0 → 54 (in corso) |
| Code cercati | ~880 / 999 |

**ETA mapping completo:** 1–2 notti (cron 05:30 Roma)

---

### Fase B — Catalogo (`optcg_catalog.mjs`) ✅

- JP emesso **anche senza prezzo** (placeholder)
- Rarità JP: fallback gemella EN
- Gemelli JP per **box e case** (implementato oggi)

**Target catalog.js:** ~**3392 voci** (1642+1642 carte + 108 sealed)

---

### Fase C — Prezzi API (`optcg_prices.mjs`) ✅

Rotazione per tier (`refresh_days` in config):

| Tier | Criterio | Refresh |
|------|----------|---------|
| 1 | Watchlist / collezione seed | **24h** |
| 2 | Carte ≥ €20 (o prezzo API) | **24h** |
| 3 | Carte ≥ €5 | **48h** |
| 4 | Resto | **72h** |

**Cap:** 1950/giorno · se mapping gira stesso giorno: ~1450 ai prezzi.

**Copertura:**
- Rare (t1–t2): **ogni giorno**
- Catalogo intero: **48–72h** a rotazione
- 3392 id ÷ 1950 ≈ **2 giorni** per ciclo pieno se solo prezzi

---

### Fase D — Pipeline giornaliera (automatica)

```
05:30 Roma → optcg_build.mjs
          → optcg_map.mjs      (mapping EN/JP, max budget)
          → optcg_prices.mjs   (prezzi tier rotation)
          → optcg_history.mjs
          → optcg_catalog.mjs    (catalog.js)
          → optcg_verify.mjs
          → push → Render deploy
```

Nessun intervento manuale richiesto dopo push.

---

## Checklist completamento

- [x] Fix matching JP `(Asia Region Legal)`
- [x] Catalogo JP senza prezzo obbligatorio
- [x] Rotazione prezzi tier 24/48/72h
- [ ] Mapping singole JP al 100% (~273 mancanti su target catalogo)
- [ ] Mapping sealed JP 54/54
- [ ] Catalog.js ≥ 3300 voci (EN=JP)
- [ ] Prezzi API copertura crescente (rotazione automatica)

---

## Produzione

| Servizio | URL |
|----------|-----|
| App | https://op-central-app.onrender.com |
| Sync | https://op-central-sync.onrender.com |
| Repo | https://github.com/libottesean-dotcom/op-central |
