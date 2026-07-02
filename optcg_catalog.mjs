// Trasforma i dati grezzi (optcg_*_raw.json) nel file catalog.js consumato dalla pagina.
// Genera window.CATALOG_ITEMS con: singole delle rarità target (coppia EN + JP) + Box/Case (incl. OP17).
// FASE 2: fonde optcg_cmmap.json (id prodotto Cardmarket) + optcg_prices.json (prezzi
// cardmarketapi.com EN/JP in EUR) — i prezzi API sovrascrivono i placeholder tcggo.
import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import {
  cmSearchUrl, singleSlugUrl, expansionSlug, urlFromCmRec, bestCmUrl,
  sealedBoosterUrl, boosterBoxUrl,
} from "./optcg_cmapi.mjs";

const cards = Object.values(JSON.parse(readFileSync("optcg_cards_raw.json", "utf8")));
const products = Object.values(JSON.parse(readFileSync("optcg_products_raw.json", "utf8")));

// ---- FASE 2: mapping + prezzi (file opzionali: senza, restano i placeholder tcggo) ----
const loadOpt = p => existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : null;
const CMMAP = loadOpt("optcg_cmmap.json")?.entries || {};
const PRICES = loadOpt("optcg_prices.json")?.prices || {};
const keyOf = (set, code, ver) => `${String(set || "").replace(/-/g, "")}|${code}|${ver || ""}`;

// ---- Storico prezzi REALE (snapshot giornalieri di optcg_history.mjs) ----
// optcg_history/YYYY-MM-DD.json -> per ogni prodotto una serie [{d, p}] (p = trend,
// fallback from). Massimo 60 giorni. Con 1 solo giorno l'app usa ancora il fallback
// sintetico; da 2+ giorni il grafico della scheda e le sparkline diventano reali.
const HIST_DIR = "optcg_history";
const HISTORY = new Map(); // productId -> [{d, p}]
if (existsSync(HIST_DIR)) {
  const files = readdirSync(HIST_DIR).filter(f => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort().slice(-60);
  for (const f of files) {
    try {
      const snap = JSON.parse(readFileSync(`${HIST_DIR}/${f}`, "utf8"));
      const d = snap.date || f.slice(0, 10);
      for (const [id, r] of Object.entries(snap.prices || {})) {
        const p = r.trend ?? r.from;
        if (p == null) continue;
        if (!HISTORY.has(id)) HISTORY.set(id, []);
        HISTORY.get(id).push({ d, p: Math.round(p * 100) / 100 });
      }
    } catch { /* snapshot corrotto: si ignora quel giorno */ }
  }
}

// t7/t30 dallo storico giornaliero (quando accumulato): trend più vicino a N giorni fa
const histAt = (rec, daysAgo) => {
  const hist = rec?.dayHistory || [];
  if (hist.length < 2) return null;
  const target = new Date(Date.now() - daysAgo * 864e5).toISOString().slice(0, 10);
  const past = hist.filter(h => h.d <= target);
  const h = past[past.length - 1];
  if (!h) return null;
  return h.trend ?? h.from ?? null;
};

// serie storica reale di un prodotto: snapshot giornalieri (HISTORY) uniti al
// dayHistory accumulato in optcg_prices.json (union per data, snapshot vince)
function historyOf(id, rec) {
  const byDate = new Map();
  for (const h of (rec?.dayHistory || [])) {
    const p = h.trend ?? h.from;
    if (h.d && p != null) byDate.set(h.d, Math.round(p * 100) / 100);
  }
  for (const h of (id != null ? HISTORY.get(String(id)) : null) || []) byDate.set(h.d, h.p);
  return [...byDate.entries()].sort((a, b) => a[0] < b[0] ? -1 : 1).slice(-60)
    .map(([d, p]) => ({ d, p }));
}

// applica i dati prezzi API a un item del catalogo (campi letti dal modal dell'app)
function applyPrices(item, rec, id) {
  if (!rec) return false;
  if (rec.from != null) { item.cm = rec.from; item.target = item.target || Math.round(rec.from); }
  item.trend = rec.trend ?? null;
  item.avg30 = rec.avg30 ?? null;
  item.avg5 = rec.avg5 ?? null;
  item.available = rec.available ?? null;
  item.listings = rec.listings || [];
  item.fetched_at = rec.fetched_at || null;
  const hist = historyOf(id, rec);
  if (hist.length) item.history = hist; // serie reale [{d, p}] per grafico/sparkline
  const t7 = histAt(rec, 7), t30 = histAt(rec, 30), t14 = histAt(rec, 14);
  if (t7 != null) item.t7 = t7;
  if (t14 != null) item.t14 = t14;
  if (t30 != null) item.t30 = t30; else if (item.t30 == null && rec.avg30 != null) item.t30 = rec.avg30;
  const apiUrl = urlFromCmRec(rec, item.note || null);
  if (apiUrl) item.url = apiUrl;
  return true;
}

// Price floor (EUR): SOLO le DON con prezzo NOTO sotto questa soglia vengono escluse (junk).
// Le DON senza prezzo restano; tutte le altre rarità e box/case non sono filtrati.
const MIN_PRICE = 1;

// etichette rarità pulite (tutte le carte incluse)
const RLABEL = {
  "LEADER": "Leader",
  "SECRET RARE": "Secret Rare",
  "Manga Rare": "Manga Rare",
  "Alternate Art": "Alt-art",
  "Special Rare": "Special",
  "SP CARD": "SP",
  "Treasure Rare": "Treasure Rare",
  "Promo": "Promo",
  "SUPER RARE": "Super Rare",
  "rare": "Rare",
  "Common": "Common",
  "Uncommon": "Uncommon",
  "DON!!": "DON",
};
const cleanRar = r => RLABEL[r] || r || "";

const normSet = s => (s || "").replace(/[^A-Za-z0-9]/g, "").toUpperCase(); // "OP-16"->"OP16"

const items = [];

// ---- SINGOLE (coppia EN + JP) ----
// UNA voce per versione reale (V.1..V.n), NIENTE doppioni.
// Lingua ricavata dal marchio "-JP" nei dati veri (card_code_number / name_numbered) quando presente.
const isJP = c => /(-JP\b|\bJP\b)/i.test(c.ccn || "") || /(-JP\b|\bJP\b)/i.test(c.numbered || "");

// URL della versione JP (prodotto Cardmarket separato). L'espansione viene presa
// dal campo `expansion` VERO restituito dall'API per il prodotto JP (es. "Carrying
// on his Will (Non-English)" oppure "Pillars of Strength (Japanese)": il marker
// cambia da set a set, quindi NON va indovinato appendendo "Non-English" a mano).
// Fallback: setName + " (Non-English)"; senza nulla, ricerca per code.
const jpSingleUrl = (jpExpansion, setName, name, code, version) => {
  const exp = jpExpansion || (setName ? setName + " (Non-English)" : null);
  return exp ? singleSlugUrl(exp, name, code, version) : cmSearchUrl(code);
};

// ---- Risoluzione versione/rarità dei GEMELLI JP (per code, non per versione EN) ----
// Cardmarket versiona i prodotti JP INDIPENDENTEMENTE dall'EN: le sequenze JP sono
// più corte/ordinate diversamente (es. OP13-118: il manga rare è EN V.5 ma JP V.4).
// optcg_map.mjs accoppia i jp_id agli EN per ordine di id (il nome JP dei risultati
// di ricerca NON contiene "(V.n)", quindi il match esatto per nome non scatta mai),
// perciò ver/rarity della versione EN NON vanno MAI ereditati dal gemello JP.
// Regola implementata qui:
//   1. ver del gemello JP = versione parsata dal NOME del prodotto JP restituito da
//      /card/{id} ("Monkey.D.Luffy (OP13-118) (V.4)" -> "V.4"); se il nome non ha
//      "(V.n)" il prodotto JP è a versione unica -> si eredita la ver dell'unica
//      versione EN (caso reprint a versione singola).
//   2. rarity: derivata dalla versione EN corrispondente per ARTE, individuata così
//      (prezzo di riferimento = media geometrica trend×from; il prezzo è l'evidenza
//      più affidabile dell'arte: base << alt-art << manga):
//      a) prodotti JP prezzati TANTI QUANTE le versioni EN -> match per RANGO di
//         prezzo (n-esimo JP più economico = n-esima EN più economica). Robusto
//         anche quando i JP costano molto meno degli EN allo stesso tier
//         (validato su OP12-118 e OP13-118).
//      b) JP parziali con versione propria V.1/V.2 -> stessa versione EN se esiste:
//         le posizioni base (V.1) e alt-art (V.2) coincidono tra le due lingue in
//         tutti i casi osservati; è dal V.3 in su che le sequenze divergono
//         (validato su OP13-042: JP V.2 alt-art a €3.5 che il prezzo da solo
//         confonderebbe col base EN).
//      c) JP parziali V.3+ -> nearest-neighbor greedy in spazio log dal JP più
//         caro (validato su OP13-119 e OP13-120). Se il match più vicino dista
//         più di 12x, la rarità resta VUOTA piuttosto che sbagliata.
const parseVerFromName = n => { const m = /\(V\.(\d+)\)/.exec(n || ""); return m ? "V." + m[1] : null; };
const recCodeOk = (rec, code) => !!rec && (!rec.name || rec.name.includes(code));
// prezzo di riferimento per il matching: media geometrica trend×from (smorza sia i
// listing-civetta di "from" sia il ritardo di "trend" sui prodotti poco scambiati)
const refPrice = rec => {
  const t = rec?.trend, f = rec?.from;
  if (t > 0 && f > 0) return Math.sqrt(t * f);
  return t > 0 ? t : (f > 0 ? f : null);
};

// pass 1: stesso filtro carte del loop principale
const keptCards = [];
for (const c of cards) {
  if (!c.code || !c.set) continue;
  if (/^ST\d/.test(normSet(c.set))) continue;
  if (c.rarity === "Common" || c.rarity === "Uncommon") continue;
  const cm = c.cm || {};
  const price = cm.it ?? cm.eu ?? cm.low ?? null;
  if (c.rarity === "DON!!" && price != null && price < MIN_PRICE) continue;
  keptCards.push({ c, price });
}

// pass 2: per ogni set|code, pool JP a livello di CODE e assegnazione ver/rarity
const jpTwinInfo = new Map(); // jp_id -> { ver, rarity }
{
  const byCodeGroup = new Map();
  for (const k of keptCards) {
    const gk = `${normSet(k.c.set)}|${k.c.code}`;
    if (!byCodeGroup.has(gk)) byCodeGroup.set(gk, []);
    byCodeGroup.get(gk).push(k);
  }
  for (const group of byCodeGroup.values()) {
    const code = group[0].c.code;
    const enVers = group.map(({ c, price }) => {
      const mapEntry = CMMAP[keyOf(c.set, c.code, c.version)];
      const enId = c.cm_id != null ? String(c.cm_id) : mapEntry?.en_id;
      let rec = enId ? PRICES[enId] : null;
      if (!recCodeOk(rec, code)) rec = null;
      return { ver: c.version || null, rarity: cleanRar(c.rarity), price: refPrice(rec) ?? price };
    });
    const seenJp = new Set();
    const jps = [];
    for (const { c } of group) {
      const jpId = CMMAP[keyOf(c.set, c.code, c.version)]?.jp_id;
      if (!jpId || seenJp.has(jpId)) continue;
      seenJp.add(jpId);
      const rec = PRICES[jpId];
      if (!recCodeOk(rec, code)) continue;
      jps.push({ id: jpId, ver: parseVerFromName(rec.name), price: refPrice(rec) });
    }
    if (!jps.length) continue;
    if (enVers.length === 1 && jps.length === 1) { // corrispondenza diretta, nessuna ambiguità
      jpTwinInfo.set(jps[0].id, { ver: jps[0].ver ?? enVers[0].ver, rarity: enVers[0].rarity });
      continue;
    }
    const enPool = enVers.map(e => ({ ...e, used: false }));
    // (a) stessi conteggi e tutti prezzati -> match per rango di prezzo
    if (jps.length === enPool.length && jps.every(j => j.price > 0) && enPool.every(e => e.price > 0)) {
      const enByPrice = enPool.slice().sort((a, b) => a.price - b.price);
      const jpByPrice = jps.slice().sort((a, b) => a.price - b.price);
      jpByPrice.forEach((j, i) => jpTwinInfo.set(j.id, { ver: j.ver, rarity: enByPrice[i].rarity }));
      continue;
    }
    // (b) JP V.1/V.2 -> versione EN omologa (posizioni base/alt-art coincidenti)
    const rest = [];
    for (const j of jps) {
      const vn = j.ver ? Number(j.ver.replace(/\D/g, "")) : null;
      const en = (vn === 1 || vn === 2) ? enPool.find(e => !e.used && e.ver === j.ver) : null;
      if (en) { en.used = true; jpTwinInfo.set(j.id, { ver: j.ver, rarity: en.rarity }); }
      else rest.push(j);
    }
    // (c) nearest-neighbor greedy in log-prezzo, dal JP più caro
    const MAX_LOG_DIST = Math.log(12);
    for (const j of rest.sort((a, b) => (b.price ?? 0) - (a.price ?? 0))) {
      let best = null, bestD = Infinity;
      if (j.price > 0) for (const en of enPool) {
        if (en.used || !(en.price > 0)) continue;
        const d = Math.abs(Math.log(j.price / en.price));
        if (d < bestD) { bestD = d; best = en; }
      }
      if (best && bestD <= MAX_LOG_DIST) {
        best.used = true;
        jpTwinInfo.set(j.id, { ver: j.ver, rarity: best.rarity });
      } else {
        jpTwinInfo.set(j.id, { ver: j.ver, rarity: "" }); // meglio vuota che sbagliata
      }
    }
  }
}

let singles = 0, singlesJP = 0, pricedEN = 0, jpEmitted = 0;
const jpEmittedIds = new Set(); // guardia: un prodotto JP compare UNA volta sola nel catalogo
for (const { c, price } of keptCards) {
  const cm = c.cm || {};
  const jp = isJP(c);
  if (jp) singlesJP++;
  const mapEntry = CMMAP[keyOf(c.set, c.code, c.version)];
  const item = {
    set: normSet(c.set),
    code: c.code,
    ver: c.version || null,     // distingue le versioni della stessa carta
    char: c.name,
    type: "Carta",
    rarity: cleanRar(c.rarity),
    lang: jp ? "JP" : "EN",
    cm: price,
    t30: cm.a30 ?? null,
    t14: null,
    t7: cm.a7 ?? null,
    ebay: null,
    target: price != null ? Math.round(price) : 0,
    note: `${c.setName || ""}${c.version ? " · " + c.version : ""}`.trim(),
    url: singleSlugUrl(c.setName, c.name, c.code, c.version),
    img: c.image || null,
    err: false,
    cmId: c.cm_id || null,
  };
  // override coi prezzi EN reali di cardmarketapi (se già scaricati).
  // Il cm_id proprio ha precedenza sulla mappa: alcuni code collidono (es. doppioni tcggo)
  // e la mappa non può distinguerli, il cm_id sì (cm_id == product id, verificato).
  // GUARDIA: il nome del prodotto API deve contenere il code della carta — alcuni cm_id
  // tcggo sono sbagliati (id scambiati EB04/PRB02, un id Pokémon su OP16-060): meglio
  // il placeholder tcggo che un prezzo di un'altra carta.
  const codeMatches = rec => !!rec && (!rec.name || rec.name.includes(c.code));
  const enId = c.cm_id != null ? String(c.cm_id) : (mapEntry?.en_id || null);
  let enRec = enId ? PRICES[enId] : null;
  if (!codeMatches(enRec)) enRec = null;
  if (applyPrices(item, enRec, enId)) pricedEN++;
  items.push(item);
  singles++;

  // voce JP gemella: emessa solo se il prodotto JP è mappato E ha prezzi scaricati
  // (stessa guardia sul code del prodotto). ver/rarity NON ereditate dall'EN:
  // arrivano da jpTwinInfo (versione PROPRIA del prodotto JP + rarità per fascia
  // di prezzo — vedi commento sopra al pass 2).
  if (!jp && mapEntry?.jp_id && codeMatches(PRICES[mapEntry.jp_id]) && !jpEmittedIds.has(mapEntry.jp_id)) {
    jpEmittedIds.add(mapEntry.jp_id);
    const jpRec = PRICES[mapEntry.jp_id];
    const jpInfo = jpTwinInfo.get(mapEntry.jp_id) || { ver: parseVerFromName(jpRec.name), rarity: "" };
    const jpItem = {
      ...item,
      lang: "JP",
      ver: jpInfo.ver,
      rarity: jpInfo.rarity,
      cm: null, t30: null, t14: null, t7: null, target: 0,
      trend: null, avg30: null, avg5: null, available: null, listings: [], fetched_at: null,
      note: `${c.setName || ""} (JP)${jpInfo.ver ? " · " + jpInfo.ver : ""}`.trim(),
      url: bestCmUrl(jpRec, jpSingleUrl(jpRec.expansion, c.setName, c.name, c.code, jpInfo.ver)),
      // immagine del prodotto GIAPPONESE (grafica JP), non quella EN riciclata:
      // l'URL immagine di cardmarketapi è pubblico e deterministico per product id
      img: jpRec.image_url || `https://cardmarketapi.com/cards/${mapEntry.jp_id}/image`,
      cmId: Number(mapEntry.jp_id) || null,
    };
    applyPrices(jpItem, PRICES[mapEntry.jp_id], mapEntry.jp_id);
    if (jpItem.cm != null) {
      jpItem.target = Math.round(jpItem.cm);
      items.push(jpItem);
      jpEmitted++; singlesJP++;
    }
  }
}

// ---- BOX / CASE (incl. OP17) ----
let boxes = 0, cases = 0;
for (const p of products) {
  const name = p.name || "";
  const isCase = /case/i.test(name);
  const isBox = /booster box/i.test(name) && !isCase;
  if (!isCase && !isBox) continue; // solo box e case
  if (/^ST\d/.test(normSet(p.set))) continue; // NIENTE prodotti Starter Deck
  const set = normSet(p.set);
  const sealedItem = {
    set,
    code: `${set}-${isCase ? "CASE" : "BOX"}`,
    char: name,
    type: isCase ? "Case" : "Box",
    rarity: "",
    cm: p.cm_low ?? null,
    t30: null, t14: null, t7: null,
    ebay: null,
    target: p.cm_low != null ? Math.round(p.cm_low) : 0,
    note: p.setName || "",
    // Box/Case: pagina diretta Booster-Boxes (slug dal nome prodotto API quando disponibile).
    url: isBox
      ? (boosterBoxUrl(p.setName) || sealedBoosterUrl(name, p.setName) || cmSearchUrl(name))
      : (sealedBoosterUrl(name, p.setName) || cmSearchUrl(name)),
    img: p.image || null,
    err: false,
    cmId: p.cm_id || null,
  };
  // stesso criterio delle singole: cm_id proprio prima della mappa (i code SET-CASE
  // collidono tra "Booster Box Case" e "Sleeved Pack Case": prezzi distinti)
  const sealedMap = CMMAP[keyOf(set, sealedItem.code, null)];
  const sealedId = p.cm_id != null ? String(p.cm_id) : (sealedMap?.en_id || null);
  const sealedRec = sealedId ? PRICES[sealedId] : null;
  if (applyPrices(sealedItem, sealedRec, sealedId)) pricedEN++;
  items.push(sealedItem);
  if (isCase) cases++; else boxes++;
}

// ---- EXTRA WATCHLIST (promo/set speciali mappati via ricerca, fuori dai dati tcggo) ----
// Emessi in catalog.js SOLO quando hanno prezzi API: l'HTML li dedup-a via wlKey e
// scarta la sua copia hardcoded, quindi set/code/ver/char/lang DEVONO combaciare.
let extras = 0;
for (const e of Object.values(CMMAP)) {
  if (!e.extra || !e.en_id) continue;
  const rec = PRICES[e.en_id];
  if (!rec || rec.from == null) continue;
  const x = {
    set: e.set, code: e.code, ver: e.ver || null,
    char: e.char, type: "Carta", rarity: e.rarity || "Promo",
    lang: e.lang || "EN",
    cm: null, t30: null, t14: null, t7: null, ebay: null,
    target: e.target ?? 0,
    note: e.note || "",
    url: bestCmUrl(rec, e.url || null),
    img: `https://cardmarketapi.com/cards/${e.en_id}/image`,
    err: false,
    cmId: Number(e.en_id) || null,
  };
  applyPrices(x, rec, e.en_id);
  items.push(x);
  extras++;
}

const header = `// Generato automaticamente da optcg_catalog.mjs — NON modificare a mano.
// Fonte catalogo: cardmarket-api-tcg (RapidAPI). Prezzi: cardmarketapi.com (EUR, EN/JP
// distinti) per gli item già mappati; placeholder tcggo per il resto.
// Solo le DON con prezzo noto sotto €1 sono escluse (tutte le altre rarità restano).\n`;
writeFileSync("catalog.js", header + "window.CATALOG_ITEMS = " + JSON.stringify(items) + ";\n");

console.log(`Singole (versioni reali): ${singles} · di cui marcate JP: ${singlesJP}`);
console.log(`Box: ${boxes} · Case: ${cases} · Extra watchlist: ${extras}`);
console.log(`Prezzi API applicati (EN): ${pricedEN} · voci JP emesse dai prezzi API: ${jpEmitted}`);
console.log(`TOTALE voci in catalog.js: ${items.length}`);
console.log(`Set inclusi: ${[...new Set(items.map(i => i.set))].sort().join(", ")}`);
