# PIANO — OP Central (One Piece TCG · Market & Collection)
> **Fonte di verità del progetto.** Ultimo aggiornamento: **04/07/2026 ~10:05**.  
> Panoramica repo: [README.md](./README.md)

---

## 1. Stato attuale

### Produzione
| Servizio | URL |
|---|---|
| **App web** | https://op-central-app.onrender.com |
| **Sync collezione/watchlist** | https://op-central-sync.onrender.com |
| **Repo** | https://github.com/libottesean-dotcom/op-central |

### Completato ✅
- **1800 voci** live (1746 carte chase + 24 box + 30 case) · verify + audit **100% PASS**
- **tcggo grezzo 4273/4273** completo · filtri: no Common/Uncommon/ST · solo rarità chase + fonte Limitless
- Prezzi API ~**92%** (1658/1800) · link Cardmarket · sync Supabase
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

### Numeri (04/07/2026)
| Voce | Valore |
|---|---|
| Carte tcggo grezzo | **4273 / 4273** ✅ completo |
| Catalogo app (chase) | **1800 voci** · 1746 carte · 25 set |
| Prezzi API live | **1658 / 1800** (~92%) |
| Rarità vs Limitless | **0 errori** · 0 Common/Uncommon · 0 tcggo-only |
| Mapping Cardmarket | cresce ogni notte (cron 05:30) |
| Storico prezzi | snapshot giornalieri → grafici 7/30g |

---

## 2. Cosa resta (automatico, job notturno)

| Task | ETA | Come |
|---|---|---|
| Prezzi API ~100% | pochi giorni | ~142 voci senza prezzo · budget Cardmarket |
| Storico 7/14/30g | 7–30 giorni | 1 snapshot/giorno (cron 05:30) |
| Mapping en_id restanti | prossimi giorni | tier search in `optcg_map.mjs` |

---

## 3. Completamento ~80% → 100% in 2–4 settimane automatiche

Comandi locali (opzionali): `node optcg_verify.mjs` · `node optcg_catalog.mjs` · `optcg_start.bat`
