# PIANO — OP Central (One Piece TCG · Market & Collection)
> **Fonte di verità del progetto.** Ultimo aggiornamento: **03/07/2026 ~09:15**.

---

## 1. Stato attuale

### Produzione
| Servizio | URL |
|---|---|
| **App web** | https://op-central-app.onrender.com |
| **Sync collezione/watchlist** | https://op-central-sync.onrender.com |
| **Repo** | https://github.com/libottesean-dotcom/op-central |

### Completato ✅
- **1181 voci** live · rarità Limitless EN/JP · verify 100% PASS
- Prezzi API ~**78%** · cron **05:30 + backup 06:00** Roma attivi
- Link Cardmarket · sync Supabase · deploy Render automatico
- NO eBay · NO Telegram · NO PWA

### Numeri (03/07/2026)
| Voce | Valore |
|---|---|
| Carte tcggo | **1980 / 4273** (~46%) — cresce ogni notte |
| Prezzi API live | **~922 / 1181** |
| Mapping | **~1000 en_id** · **110 jp_id** |
| Storico | **2 giorni** → grafici 7/30g tra 1–4 settimane |
| Rarità audit | **0 errori** EN/JP |

---

## 2. Cosa resta (automatico, job notturno)

| Task | ETA | Come |
|---|---|---|
| Catalogo tcggo completo | ~3–4 giorni | build pagina 100/214 |
| Prezzi API ~100% | con mapping | budget 2000 req/g |
| Storico 7/14/30g | 7–30 giorni | 1 snapshot/giorno |
| 66 en_id da mappare | prossimi giorni | fix expansion matching ✅ |

**Il PC non serve acceso.**

---

## 3. Completamento ~70% → 100% in 2–4 settimane automatiche

Comandi: `node optcg_verify.mjs` · `node optcg_catalog.mjs` · `optcg_start.bat`
