// FASE 2 — Mapping (una tantum, RIPRENDIBILE) verso i product id di cardmarketapi.com.
//
// IPOTESI VERIFICATA il 02/07/2026: il cm_id di tcggo È il product id di Cardmarket
// usato da cardmarketapi.com (test su Kikunojo EB04-012 V.1 e Booster Box OP14: match esatti).
// => gli id EN arrivano GRATIS da cm_id per ~1418/1492 singole e tutti i 54 box/case.
// Le ricerche a pagamento servono SOLO per: id JP, versioni senza cm_id, item EXTRA watchlist.
//
// Output: optcg_cmmap.json
//   entries[set|code|ver] = { en_id, jp_id, en_name, jp_name, setName, kind, ... }
//   codes_done[set||code] = true  (ricerca già eseguita, non si ripete)
// Riprendibile: salva ogni 20 ricerche; sicuro rilanciarlo (il task giornaliero lo fa).
import {
  CONFIG, apiGet, BudgetGuard, loadJson, saveJson,
  buildRawItems, tierOf, EXTRA_ITEMS, keyOf, verNum, parseVerFromName,
} from "./optcg_cmapi.mjs";

const MAP_FILE = "optcg_cmmap.json";
const map = loadJson(MAP_FILE, { entries: {}, codes_done: {}, notes: [] });
map.entries ||= {}; map.codes_done ||= {}; map.notes ||= [];

const { singles, sealed } = buildRawItems();

// ---- cap di budget: hard cap del giorno se configurato per OGGI, altrimenti daily_cap ----
const today = new Date().toISOString().slice(0, 10);
const B = CONFIG.budget || {};
const cap = (B.hard_cap_date === today && B.hard_cap_today) ? B.hard_cap_today : (B.daily_cap ?? 1800);
const reserve = B.map_reserve ?? 500; // richieste lasciate libere per optcg_prices.mjs
const guard = new BudgetGuard(cap - reserve);
const u0 = await guard.init();
console.log(`[map] piano=${u0.plan} usate oggi=${u0.used_today}/${u0.daily_limit} · cap mapping=${cap - reserve} (riserva prezzi=${reserve})`);

// ---- Fase A (GRATIS): en_id da cm_id tcggo ----
let fromCmId = 0;
for (const it of [...singles, ...sealed]) {
  const e = map.entries[it.key] ||= { kind: it.kind, set: it.set, code: it.code || null, ver: it.ver || null, setName: it.setName };
  if (!e.en_id && it.cmId) { e.en_id = String(it.cmId); e.en_name = it.name; e.en_src = "tcggo_cm_id"; fromCmId++; }
  e.setName = it.setName;
}
console.log(`[map] en_id assegnati da cm_id tcggo (gratis): ${fromCmId} nuovi · entries totali: ${Object.keys(map.entries).length}`);

// Invalida cm_id tcggo verificati sbagliati (nome prodotto API ≠ code carta)
const PRICES = loadJson("optcg_prices.json", { prices: {} }).prices;
let badCmId = 0;
for (const it of singles) {
  const e = map.entries[it.key];
  if (!e?.en_id || e.en_src !== "tcggo_cm_id" || !it.code) continue;
  const rec = PRICES[e.en_id];
  if (rec?.name && !rec.name.includes(it.code)) {
    delete e.en_id;
    delete e.en_name;
    delete e.en_src;
    delete map.codes_done[it.code];
    badCmId++;
  }
}
if (badCmId) console.log(`[map] cm_id tcggo invalidati (nome API ≠ code): ${badCmId}`);

const normTxt = s => (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
// Cardmarket marca i prodotti JP con "(Non-English)" oppure "(Japanese)" nell'expansion
const isJPExp = exp => /\((non-english|japanese)\)/i.test(exp || "");
const stripJPMark = exp => (exp || "").replace(/\((non-english|japanese)\)/i, "");

// ---- gruppi di ricerca: una ricerca per code; risultati distribuiti per expansion==setName ----
const byCode = new Map(); // code -> [singles...]
for (const it of singles) {
  if (!byCode.has(it.code)) byCode.set(it.code, []);
  byCode.get(it.code).push(it);
}

// un code va cercato se qualche sua versione non ha en_id o non ha jp_id risolto/escluso
const codeNeedsSearch = code => {
  if (map.codes_done[code]) return false;
  return byCode.get(code).some(it => {
    const e = map.entries[it.key];
    return !e?.en_id || e.jp_id === undefined;
  });
};

// priorità: tier minimo tra le versioni del code
const codeTier = code => Math.min(...byCode.get(code).map(tierOf));
const queue = [...byCode.keys()].filter(codeNeedsSearch).sort((a, b) => codeTier(a) - codeTier(b));
const maxTier = Number(process.env.MAP_MAX_TIER || 4); // opzionale: limita ai tier bassi
const queueT = queue.filter(c => codeTier(c) <= maxTier);
console.log(`[map] code da cercare: ${queueT.length} (tier<=${maxTier}) su ${byCode.size} totali`);

let searches = 0, jpFound = 0, enFilled = 0, stopped = false;

async function searchCode(code) {
  const res = await apiGet(`/api/v1/search?q=${encodeURIComponent(code)}&game=one-piece&limit=50`);
  guard.count();
  searches++;
  return res.results || [];
}

function assignFromResults(code, results) {
  const groups = byCode.get(code);
  // set di setName presenti per questo code (di norma 1; reprints => più d'uno)
  const bySetName = new Map();
  for (const it of groups) {
    const k = normTxt(it.setName);
    if (!bySetName.has(k)) bySetName.set(k, []);
    bySetName.get(k).push(it);
  }
  for (const [snKey, items] of bySetName) {
    const enCand = results.filter(r => !isJPExp(r.expansion) && normTxt(r.expansion) === snKey)
      .map(r => ({ id: String(r.id), name: r.name })).sort((a, b) => Number(a.id) - Number(b.id));
    const jpCand = results.filter(r => isJPExp(r.expansion) && normTxt(stripJPMark(r.expansion)) === snKey)
      .map(r => ({ id: String(r.id), name: r.name })).sort((a, b) => Number(a.id) - Number(b.id));

    const sorted = items.slice().sort((a, b) => (verNum(a.ver) ?? 0) - (verNum(b.ver) ?? 0));

    // matching per versione: prima col marker "(V.n)" nel nome (se presente),
    // altrimenti primo candidato libero in ordine di id (id crescente == V.n crescente,
    // verificato su 346/363 code multi-versione tcggo). Consuma i candidati usati.
    const pickForVer = (cands, used, ver) => {
      const avail = cands.filter(c => !used.has(c.id));
      if (ver) {
        const exact = avail.find(c => parseVerFromName(c.name) === ver);
        if (exact) return exact;
      }
      return avail[0] || null;
    };

    // EN mancanti (quasi tutti già coperti da cm_id tcggo)
    const usedEn = new Set(sorted.map(it => map.entries[it.key]?.en_id).filter(Boolean));
    for (const it of sorted) {
      const e = map.entries[it.key];
      if (e.en_id) continue;
      const pick = pickForVer(enCand, usedEn, it.ver);
      if (pick) { e.en_id = pick.id; e.en_name = pick.name; e.en_src = "search"; usedEn.add(pick.id); enFilled++; }
    }
    // JP: stesso criterio
    const usedJp = new Set();
    for (const it of sorted) {
      const e = map.entries[it.key];
      const pick = pickForVer(jpCand, usedJp, it.ver);
      if (pick) { e.jp_id = pick.id; e.jp_name = pick.name; usedJp.add(pick.id); jpFound++; }
      else e.jp_id = null;
    }
    if (!enCand.length && !jpCand.length) {
      map.notes.push(`${code} [${items[0].setName}]: nessun risultato con expansion combaciante`);
      for (const it of items) if (map.entries[it.key].jp_id === undefined) map.entries[it.key].jp_id = null;
    }
  }
  map.codes_done[code] = true;
}

// ---- Fase B: ricerche per le singole ----
for (const code of queueT) {
  if (!(await guard.allow())) { stopped = true; break; }
  try {
    const results = await searchCode(code);
    assignFromResults(code, results);
  } catch (err) {
    console.log(`[map] ERRORE su ${code}: ${err.message}`);
    map.notes.push(`${code}: errore ${err.message}`);
  }
  if (searches % 20 === 0) { saveJson(MAP_FILE, map); console.log(`[map] ${searches} ricerche · ~${guard.estimate} richieste usate`); }
}

// ---- Fase C: item EXTRA watchlist (promo ecc.) ----
for (const x of EXTRA_ITEMS) {
  const key = keyOf(x.set, x.code, x.ver);
  const e = map.entries[key] ||= { kind: "extra", set: x.set, code: x.code, ver: x.ver, setName: "", extra: true };
  e.lang = x.lang; e.char = x.char; e.rarity = x.rarity; e.url = x.url; e.note = x.note; e.target = x.target;
  if (e.en_id || e.searched) continue;
  if (stopped || !(await guard.allow())) { stopped = true; break; }
  try {
    const results = await searchCode(x.searchQ);
    let cand = results.filter(r => x.expMatch ? x.expMatch.test(r.expansion || "") : true);
    if (x.nameMatch) cand = cand.filter(r => x.nameMatch.test(r.name || ""));
    // un extra EN non deve mai agganciare il prodotto JP "(Non-English)"/"(Japanese)"
    if (x.lang !== "JP") cand = cand.filter(r => !isJPExp(r.expansion));
    cand.sort((a, b) => Number(a.id) - Number(b.id));
    // verRank: n-esima versione (es. V.4 => indice 3)
    const pick = x.verRank ? cand[x.verRank - 1] : (x.ver ? cand[verNum(x.ver) - 1] : cand[0]);
    if (pick) { e.en_id = String(pick.id); e.en_name = pick.name; e.en_src = "search_extra"; }
    else map.notes.push(`EXTRA ${x.searchQ} (${x.char}): nessun candidato (${results.length} risultati)`);
    e.searched = true;
    e.jp_id = null; // gli extra sono prodotti singoli, la lingua giusta è in e.lang
  } catch (err) {
    console.log(`[map] ERRORE extra ${x.searchQ}: ${err.message}`);
  }
}

// ---- Sealed: JP non mappato (prodotti JP separati, best effort futuro) ----
for (const it of sealed) if (map.entries[it.key].jp_id === undefined) map.entries[it.key].jp_id = null;

map.updated = new Date().toISOString();
saveJson(MAP_FILE, map);

const ents = Object.values(map.entries);
const done = ents.filter(e => e.en_id).length;
const jp = ents.filter(e => e.jp_id).length;
console.log(`[map] FINE ${stopped ? "(budget esaurito, riprende domani)" : "(coda completata)"}`);
console.log(`[map] ricerche oggi: ${searches} · entries con en_id: ${done}/${ents.length} · jp_id trovati: ${jp} · code cercati: ${Object.keys(map.codes_done).length}/${byCode.size}`);
