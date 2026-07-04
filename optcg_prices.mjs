// FASE 2 — Fetch prezzi giornaliero da cardmarketapi.com (rotazione nel budget).
//
// Legge optcg_cmmap.json e scarica /api/v1/card/{id} con la lingua giusta:
//   en_id -> language=english · jp_id -> language=japanese
//
// Rotazione per tier (refresh_days in optcg_config.json):
//   tier 1-2 (watchlist + >=€20): ogni 24h — sempre aggiornati
//   tier 3 (>=€5): ogni 48h
//   tier 4 (resto): ogni 72h
// Con ~2800 product id e cap ~1950/giorno, l'intero catalogo ruota in 48-72h
// mentre le carte rare restano fresche ogni giorno.
//
// Output optcg_prices.json: prices[product_id] = { lang, from, avg5, trend, avg30,
//   available, listings (max 10), fetched_at, dayHistory: [{d, trend, from}] }.
import {
  CONFIG, apiGet, BudgetGuard, loadJson, saveJson,
  buildRawItems, tierOf, keyOf, EXTRA_ITEMS,
} from "./optcg_cmapi.mjs";

const MAP_FILE = "optcg_cmmap.json";
const PRICES_FILE = "optcg_prices.json";
const map = loadJson(MAP_FILE, null);
if (!map) { console.log("[prices] optcg_cmmap.json assente: eseguire prima optcg_map.mjs"); process.exit(0); }
const store = loadJson(PRICES_FILE, { prices: {} });
store.prices ||= {};

const today = new Date().toISOString().slice(0, 10);
const B = CONFIG.budget || {};
const cap = (B.hard_cap_date === today && B.hard_cap_today) ? B.hard_cap_today : (B.daily_cap ?? 1800);
const REFRESH_DAYS = B.refresh_days || { 1: 1, 2: 1, 3: 2, 4: 3 };
const guard = new BudgetGuard(cap);
const u0 = await guard.init();
console.log(`[prices] usate oggi=${u0.used_today}/${u0.daily_limit} · cap=${cap}`);
console.log(`[prices] refresh: t1=${REFRESH_DAYS[1]}d t2=${REFRESH_DAYS[2]}d t3=${REFRESH_DAYS[3]}d t4=${REFRESH_DAYS[4]}d`);

// ---- costruzione lista fetch: (product_id, lang, tier) ----
const { singles, sealed } = buildRawItems();
const tierByKey = new Map();
for (const it of [...singles, ...sealed]) tierByKey.set(it.key, tierOf(it));
for (const x of EXTRA_ITEMS) tierByKey.set(keyOf(x.set, x.code, x.ver), 1);

const priceRef = id => {
  const p = store.prices[id];
  if (!p) return null;
  const t = p.trend, f = p.from;
  if (t > 0 && f > 0) return Math.sqrt(t * f);
  return t > 0 ? t : (f > 0 ? f : null);
};

const effectiveTier = (baseTier, id) => {
  if (baseTier <= 2) return baseTier;
  const p = priceRef(id);
  if (p != null && p >= 20) return 2;
  if (p != null && p >= 5) return 3;
  return baseTier;
};

const jobs = []; // { id, lang, tier }
for (const [key, e] of Object.entries(map.entries)) {
  const baseTier = tierByKey.get(key) ?? 4;
  if (e.en_id) {
    const tier = effectiveTier(baseTier, e.en_id);
    jobs.push({ id: e.en_id, lang: e.extra ? (e.lang === "JP" ? "japanese" : "english") : "english", tier });
  }
  if (e.jp_id) {
    const tier = effectiveTier(baseTier, e.jp_id);
    jobs.push({ id: e.jp_id, lang: "japanese", tier });
  }
}
// dedupe per id (reprints possono condividere il prodotto)
const seen = new Set();
const uniq = jobs.filter(j => !seen.has(j.id) && seen.add(j.id));

const daysSince = id => {
  const at = store.prices[id]?.fetched_at;
  if (!at) return Infinity;
  return (Date.now() - new Date(at).getTime()) / 864e5;
};
const refreshDays = tier => REFRESH_DAYS[tier] ?? REFRESH_DAYS[4] ?? 3;
const needsRefresh = j => daysSince(j.id) >= refreshDays(j.tier);

// Priorità: tier basso prima; a parità, i più vecchi prima (round-robin naturale)
const queue = uniq.filter(needsRefresh)
  .sort((a, b) => a.tier - b.tier || daysSince(b.id) - daysSince(a.id));

const staleByTier = t => queue.filter(j => j.tier === t).length;
console.log(`[prices] job totali=${uniq.length} · da fare oggi=${queue.length} (t1=${staleByTier(1)}, t2=${staleByTier(2)}, t3=${staleByTier(3)}, t4=${staleByTier(4)})`);

// L'API scrape-a Cardmarket live (~10-15s a carta non in cache): si lavora con
// un piccolo pool di worker paralleli. 429 gestito in apiGet (attende Retry-After).
const CONCURRENCY = Number(process.env.PRICES_CONCURRENCY || 6);
let done = 0, errors = 0, stopped = false, qi = 0;

async function handleJob(j) {
  const d = await apiGet(`/api/v1/card/${j.id}?language=${j.lang}`);
  guard.count();
  const p = d.prices || {};
  const prev = store.prices[j.id] || {};
  const hist = Array.isArray(prev.dayHistory) ? prev.dayHistory : [];
  if (!hist.some(h => h.d === today)) hist.push({ d: today, trend: p.trend ?? null, from: p.from ?? null });
  store.prices[j.id] = {
    lang: j.lang, name: d.name, expansion: d.expansion,
    image_url: d.image_url || null,
    from: p.from ?? null, avg5: p.avg5 ?? null, trend: p.trend ?? null,
    avg30: p.avg30 ?? null, available: p.available ?? null,
    listings: (d.listings || []).slice(0, 10),
    fetched_at: d.fetched_at || new Date().toISOString(),
    dayHistory: hist.slice(-60),
  };
}

async function worker() {
  while (true) {
    if (errors > 30) return;
    const j = queue[qi++];
    if (!j) return;
    if (!(await guard.allow())) { stopped = true; return; }
    try {
      await handleJob(j);
      done++;
    } catch (err) {
      errors++;
      console.log(`[prices] ERRORE id=${j.id}: ${err.message}`);
    }
    if (done % 20 === 0 && done > 0) saveJson(PRICES_FILE, store);
    if (done % 100 === 0 && done > 0) console.log(`[prices] ${done}/${queue.length} · ~${guard.estimate} richieste usate`);
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker));
if (errors > 30) console.log("[prices] troppi errori, stop");

store.updated = new Date().toISOString();
saveJson(PRICES_FILE, store);
const u1 = await getFinalUsage();
async function getFinalUsage() { try { return await apiGet("/api/v1/usage"); } catch { return {}; } }
console.log(`[prices] FINE ${stopped ? "(cap raggiunto, il resto domani)" : ""} · scaricati=${done} · errori=${errors} · usage=${u1.used_today}/${u1.daily_limit}`);
