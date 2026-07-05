# PIANO — OP Central · Completamento catalogo EN/JP
> **Fonte di verità.** Aggiornato: **05/07/2026 ~19:00**

---

## Obiettivo

Catalogo **1:1 EN/JP** per singole, box e case.

| Categoria | EN target | JP target | Totale |
|-----------|-----------|-----------|--------|
| Singole chase | 1.642 | 1.642 | 3.284 |
| Box | 24 | 24 | 48 |
| Case | 30 | 30 | 60 |
| **Totale** | **1.696** | **1.696** | **3.392** |

Promo/extra watchlist (~6): fuori dal conteggio 1:1.

---

## Stato adesso (live 05/07 sera)

| Metrica | Valore | Target | Gap |
|---------|--------|--------|-----|
| Voci catalogo | **2.795** | 3.392 | **597** |
| Carte JP | 1.020 | 1.642 | 622 |
| Box+Case JP | 21 | 54 | 33 |
| Mapping JP singole | 1.430 / 2.026 | 100% | 596 |
| Prezzi JP con € | **103** | ~1.041 | **938 n/d** |

**Completamento catalogo visibile: ~82%**  
**Completamento prezzi JP: ~10%**

---

## I 5 problemi (e fix applicati oggi)

### 1. Prezzi: API Cardmarket 502 → 0 fetch/giorno
**Sintomo:** 4 e 5 luglio, job prezzi scarica **0** prodotti e si ferma.  
**Causa:** troppi 502 consecutivi + stop a 36 errori + troppo parallelismo (6 worker).  
**Fix (05/07):**
- `apiGet`: retry 502 con backoff esponenziale fino a 60s (8 tentativi)
- `optcg_prices.mjs`: **no stop** a N errori; pausa 45s e continua
- Parallelismo ridotto a **3** worker
- **Priorità JP mai fetchati** prima di tutto
- **Secondo cron pomeriggio** (14:30 Roma) solo prezzi

### 2. Mapping JP lento (596 singole + 33 sealed)
**Sintomo:** restano ~629 prodotti JP da trovare su Cardmarket.  
**Fix (05/07):**
- Riserva prezzi **dinamica**: backlog >400 → riserva solo 100 req (1850 per mapping)
- `MAP_RESERVE=100` forzato nel cron mattutino

**Stima:** mapping completo in **1–2 notti** (6–7 luglio).

### 3. Cron parte alle 08:30–09:00, non 05:30
**Sintomo:** GitHub Actions ritarda 1–3 ore; timezone spesso ignorato.  
**Fix (05/07):** cron spostato a **`30 3 * * *` UTC** (= 05:30 Roma estate).

### 4. Foto JP placeholder
**Fix (04/07):** fallback immagine EN tcggo finché Cardmarket non cache-a il prodotto.  
Quando il prezzo viene fetchato → passa immagine JP ufficiale.

### 5. Gemelli JP duplicati / mancanti
**Fix (04/07):** pass 3 catalogo per JP mappati ma non emessi.  
Nota: più versioni EN possono condividere **un solo** prodotto JP → conteggio JP < voci cmmap (normale).

---

## Pipeline automatica (dopo fix)

```
MATTINA ~05:30 Roma (03:30 UTC + ritardo GitHub)
  optcg_build → optcg_map (1850 req) → optcg_prices (3 worker, JP first)
  → history → catalog → verify → push → Render

POMERIGGIO ~14:30 Roma (12:30 UTC)
  optcg_prices (budget residuo ~1100 req) → catalog → push → Render
```

Budget API: **~1950 req/giorno** (cardmarketapi starter 2000).

| Fase | Budget tipico | Cosa fa |
|------|---------------|---------|
| Mapping mattina | fino a 1850 | ~600 code/giorno quando backlog alto |
| Prezzi mattina | ~500 | JP mai visti + tier 1-2 |
| Prezzi pomeriggio | ~1100 | JP restanti + refresh EN |

---

## Timeline realistica (post-fix)

| Milestone | Data stimata | Note |
|-----------|--------------|------|
| Mapping JP 100% | **6–7 luglio** | ~629 ricerche, 1–2 notti |
| Catalogo 3.392 voci | **7 luglio** | gemelli + sealed JP emessi |
| Prezzi JP >50% | **8–9 luglio** | se API stabile + doppio cron |
| Prezzi JP >90% | **10–12 luglio** | rotazione tier 4 |
| Tutto completo | **~12 luglio** | dipende da 502 Cardmarket |

Se l'API Cardmarket resta down: **catalogo visibile** comunque entro ~7 lug; **prezzi** restano indietro.

---

## Checklist operativa

- [x] Mapping Asia Region Legal
- [x] Sealed JP mapping code
- [x] Pass gemelli JP catalogo
- [x] Fix foto JP placeholder
- [x] Fix verify pre-deploy JP
- [x] Retry 502 prezzi + priorità JP
- [x] Cron 03:30 UTC + pass pomeriggio prezzi
- [ ] Mapping JP 100% (~596)
- [ ] Sealed JP 54/54
- [ ] Prezzi JP >90%
- [ ] eBay.it sold (PIANO_EBAY.md — opzionale)

---

## Comandi manuali (emergenza)

```bash
node optcg_map.mjs          # mapping JP
node optcg_prices.mjs       # prezzi (JP first)
node optcg_catalog.mjs      # rigenera catalog.js
node optcg_verify.mjs       # verifica
node optcg_site_build.mjs   # public/ locale
```

GitHub Actions → **workflow_dispatch** su:
- `OP Central — aggiornamento giornaliero`
- `OP Central — prezzi pomeriggio`

---

## File chiave

| File | Ruolo |
|------|-------|
| `optcg_map.mjs` | Trova jp_id Cardmarket |
| `optcg_prices.mjs` | Scarica prezzi + image_url |
| `optcg_catalog.mjs` | Genera catalog.js |
| `optcg_cmapi.mjs` | HTTP client + retry |
| `.github/workflows/optcg-daily.yml` | Cron mattina |
| `.github/workflows/optcg-prices-afternoon.yml` | Cron pomeriggio prezzi |
