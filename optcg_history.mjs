// FASE A — Storico prezzi giornaliero (0 chiamate API: legge solo optcg_prices.json).
//
// Dopo il fetch prezzi, salva uno snapshot del giorno in optcg_history/YYYY-MM-DD.json:
//   { date, saved_at, count, prices: { productId: { from, trend, avg30, available } } }
// Formato scelto: UNA directory con un file per data (mai riscritti i giorni passati,
// robusto contro corruzioni; rieseguito due volte nello stesso giorno = sovrascrive
// solo il file di oggi -> dedupe naturale). optcg_catalog.mjs legge tutta la directory
// e costruisce la serie reale history:[{d,p}] per ogni prodotto.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";

const PRICES_FILE = "optcg_prices.json";
const HIST_DIR = "optcg_history";

if (!existsSync(PRICES_FILE)) {
  console.log("[history] optcg_prices.json assente: eseguire prima optcg_prices.mjs");
  process.exit(0);
}
const store = JSON.parse(readFileSync(PRICES_FILE, "utf8"));
const prices = store.prices || {};
const ids = Object.keys(prices);
if (!ids.length) { console.log("[history] nessun prezzo in optcg_prices.json, niente da salvare"); process.exit(0); }

if (!existsSync(HIST_DIR)) mkdirSync(HIST_DIR);

const today = new Date().toISOString().slice(0, 10);
const snap = { date: today, saved_at: new Date().toISOString(), count: 0, prices: {} };
for (const [id, rec] of Object.entries(prices)) {
  // si salvano solo prodotti con almeno un prezzo (from o trend)
  if (rec.from == null && rec.trend == null) continue;
  snap.prices[id] = {
    from: rec.from ?? null,
    trend: rec.trend ?? null,
    avg30: rec.avg30 ?? null,
    available: rec.available ?? null,
  };
  snap.count++;
}

const outFile = `${HIST_DIR}/${today}.json`;
const existed = existsSync(outFile);
writeFileSync(outFile, JSON.stringify(snap));
console.log(`[history] snapshot ${today}: ${snap.count} prodotti -> ${outFile}${existed ? " (sovrascritto, stesso giorno)" : ""}`);
