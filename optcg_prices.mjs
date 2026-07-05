// FASE 2 — Fetch prezzi giornaliero da cardmarketapi.com (rotazione nel budget).
//
// Priorità: (1) JP mai fetchati, (2) EN mai fetchati, (3) tier basso stale, (4) resto.
// Non si ferma al N-esimo errore: 502 Cardmarket = pausa breve e continua.
import {
  CONFIG, apiGet, BudgetGuard, loadJson, saveJson,
  buildRawItems, tierOf, keyOf, EXTRA_ITEMS,
} from "./optcg_cmapi.mjs";

const sleep = ms => new Promise(r => setTimeout(r, ms));

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

const jobs = [];
for (const [key, e] of Object.entries(map.entries)) {
  const baseTier = tierByKey.get(key) ?? 4;
  if (e.en_id) {
    const tier = effectiveTier(baseTier, e.en_id);
    jobs.push({ id: e.en_id, lang: e.extra ? (e.lang === "JP" ? "japanese" : "english") : "english", tier });
  }
  if (e.jp_id) {
    const tier = effectiveTier(baseTier, e.jp_id);
    jobs.push({ id: e.jp_id, lang: "japanese", tier, isJp: true });
  }
}

const seen = new Set();
const uniq = jobs.filter(j => !seen.has(j.id) && seen.add(j.id));

const daysSince = id => {
  const at = store.prices[id]?.fetched_at;
  if (!at) return Infinity;
  return (Date.now() - new Date(at).getTime()) / 864e5;
};

const refreshDays = tier => REFRESH_DAYS[tier] ?? REFRESH_DAYS[4] ?? 3;
const needsRefresh = j => daysSince(j.id) >= refreshDays(j.tier);
const neverFetched = id => !store.prices[id]?.fetched_at;

// Priorità: JP mai visti > EN mai visti > stale per tier
const queue = uniq.filter(j => neverFetched(j.id) || needsRefresh(j))
  .sort((a, b) => {
    const aN = neverFetched(a.id), bN = neverFetched(b.id);
    if (aN && a.isJp && !(bN && b.isJp)) return -1;
    if (bN && b.isJp && !(aN && a.isJp)) return 1;
    if (aN !== bN) return aN ? -1 : 1;
    return a.tier - b.tier || daysSince(b.id) - daysSince(a.id);
  });

const staleByTier = t => queue.filter(j => j.tier === t).length;
const jpNever = queue.filter(j => j.isJp && neverFetched(j.id)).length;
const enNever = queue.filter(j => !j.isJp && neverFetched(j.id)).length;
console.log(`[prices] job totali=${uniq.length} · da fare oggi=${queue.length} (jp_mai=${jpNever}, en_mai=${enNever}, t1=${staleByTier(1)}, t2=${staleByTier(2)}, t3=${staleByTier(3)}, t4=${staleByTier(4)})`);

// Con 502 frequenti: meno parallelismo riduce il carico sull'API upstream.
const CONCURRENCY = Number(process.env.PRICES_CONCURRENCY || 3);
const PAUSE_AFTER_CONSEC = Number(process.env.PRICES_PAUSE_AFTER || 20);
const PAUSE_MS = Number(process.env.PRICES_PAUSE_MS || 45000);

let done = 0, errors = 0, skipped = 0, stopped = false, qi = 0;
let consecutive = 0;

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
    const j = queue[qi++];
    if (!j) return;
    if (!(await guard.allow())) { stopped = true; return; }
    try {
      await handleJob(j);
      done++;
      consecutive = 0;
    } catch (err) {
      errors++;
      consecutive++;
      console.log(`[prices] ERRORE id=${j.id}: ${err.message}`);
      if (/502|503|network error/i.test(err.message) && consecutive >= PAUSE_AFTER_CONSEC) {
        console.log(`[prices] pausa ${PAUSE_MS / 1000}s dopo ${consecutive} errori consecutivi (API instabile)`);
        await sleep(PAUSE_MS);
        consecutive = 0;
      }
    }
    if (done % 20 === 0 && done > 0) saveJson(PRICES_FILE, store);
    if (done % 50 === 0 && done > 0) console.log(`[prices] ${done}/${queue.length} · ~${guard.estimate} richieste usate · errori=${errors}`);
  }
}

await Promise.all(Array.from({ length: CONCURRENCY }, worker));

store.updated = new Date().toISOString();
saveJson(PRICES_FILE, store);
const u1 = await getFinalUsage();
async function getFinalUsage() { try { return await apiGet("/api/v1/usage"); } catch { return {}; } }
console.log(`[prices] FINE ${stopped ? "(cap raggiunto, il resto domani)" : ""} · scaricati=${done} · errori=${errors} · saltati=${skipped} · usage=${u1.used_today}/${u1.daily_limit}`);
