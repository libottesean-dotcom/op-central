# OP Central

Web app personale per **One Piece TCG**: catalogo, prezzi Cardmarket (EN/JP), collezione, watchlist e P&L.

**Live:** https://op-central-app.onrender.com  
**Repo:** https://github.com/libottesean-dotcom/op-central

---

## Fonte di verità

Tutto lo stato del progetto (numeri, cron, roadmap, cosa resta) è in **[PIANO.md](./PIANO.md)**.  
Aggiornare sempre `PIANO.md` quando cambia qualcosa di rilevante.

---

## Stack (attuale)

| Parte | Tecnologia |
|---|---|
| Frontend | `chase-tracker (2).html` → build statico `public/` |
| Catalogo / prezzi | Node (`optcg_*.mjs`) + `catalog.js` |
| Sync collezione | Supabase + `optcg_sync_server.mjs` su Render |
| Deploy app | Render (static) · auto-deploy su push `master` |
| Automazione | GitHub Actions — **05:30 Roma** (daily) · **dom 04:00** (rarità) |

Nessun backup 06:00 · nessun cron Render per la pipeline dati.

---

## Comandi utili

```bash
npm install
node optcg_verify.mjs          # controlli integrità catalogo
node optcg_site_build.mjs      # genera public/ per deploy locale
node optcg_catalog.mjs         # rigenera catalog.js (con API configurate)
optcg_start.bat                # menu Windows pipeline locale
```

---

## Visione futura (non deployata)

I file `OP_Command_Deck_SPEC*.md` (cartella locale) descrivono un progetto più ampio: Pokémon, tre mercati US/EU/JP, arbitraggio, Telegram, ecc.  
**OP Central** è il sottoinsieme già live: solo One Piece, Cardmarket EU/JP, HTML statico + sync Supabase.

Per lo stato reale del deploy, usare sempre **PIANO.md**.
