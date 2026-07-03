# PIANO — OP Central (One Piece TCG · Market & Collection)
> **Fonte di verità del progetto.** Ultimo aggiornamento: **03/07/2026 ~10:00**.

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
- Prezzi API ~**94%** (1104/1181) · link Cardmarket · sync Supabase
- **Cron unico 05:30 Roma** (GitHub Actions) · deploy Render automatico su push
- Refresh rarità **domenica 04:00 Roma** (settimanale)
- UI griglia card allineata (titoli, Pagato/P&L, bottoni in fondo)
- NO eBay · NO Telegram · NO PWA installabile

### Automazione
| Job | Quando | Cosa fa |
|---|---|---|
| `optcg-daily.yml` | **05:30** Europe/Rome | build, mapping, prezzi, storico, catalogo, verify, push |
| `optcg-rarity-weekly.yml` | **dom 04:00** Europe/Rome | refresh completo rarità Limitless |
| Render | su ogni push `master` | `optcg_site_build.mjs` → app statica live |

**Nessun backup 06:00 · nessun cron Render.** Il PC non serve acceso.

### Numeri (03/07/2026)
| Voce | Valore |
|---|---|
| Carte tcggo | **1980 / 4273** (~46%) — pagina **100/214**, cresce ogni notte |
| Prezzi API live | **1104 / 1181** (~94%) |
| Mapping Cardmarket | **1006 en_id** / 1072 entry · **110 jp_id** · **66** en_id restanti |
| Storico prezzi | **2 giorni** → grafici 7/30g tra 1–4 settimane |
| Rarità audit | **0 errori** EN/JP |

---

## 2. Cosa resta (automatico, job notturno)

| Task | ETA | Come |
|---|---|---|
| Catalogo tcggo completo | ~3–4 giorni | build pagina 100→214 (budget RapidAPI) |
| Prezzi API ~100% | pochi giorni | ~77 voci senza prezzo · budget 2000 req/g Cardmarket |
| Storico 7/14/30g | 7–30 giorni | 1 snapshot/giorno (cron 05:30) |
| 66 en_id da mappare | prossimi giorni | tier search giornaliero in `optcg_map.mjs` |

---

## 3. Completamento ~80% → 100% in 2–4 settimane automatiche

Comandi locali (opzionali): `node optcg_verify.mjs` · `node optcg_catalog.mjs` · `optcg_start.bat`
