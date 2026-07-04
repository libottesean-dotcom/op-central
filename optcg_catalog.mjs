// Trasforma i dati grezzi (optcg_*_raw.json) nel file catalog.js consumato dalla pagina.
// Genera window.CATALOG_ITEMS con: singole delle rarità target (coppia EN + JP) + Box/Case (incl. OP17).
// FASE 2: fonde optcg_cmmap.json (id prodotto Cardmarket) + optcg_prices.json (prezzi
// cardmarketapi.com EN/JP in EUR) — i prezzi API sovrascrivono i placeholder tcggo.
import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import {
  cmSearchUrl, singleSlugUrl, expansionSlug, urlFromCmRec, bestCmUrl,
  sealedBoosterUrl, boosterBoxUrl,
} from "./optcg_cmapi.mjs";
import { cleanRar, limitlessKey, limitlessCodeOf } from "./optcg_rarity_lib.mjs";

const cards = Object.values(JSON.parse(readFileSync("optcg_cards_raw.json", "utf8")));
const products = Object.values(JSON.parse(readFileSync("optcg_products_raw.json", "utf8")));

// ---- FASE 2: mapping + prezzi (file opzionali: senza, restano i placeholder tcggo) ----
const loadOpt = p => existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : null;
const CMMAP = loadOpt("optcg_cmmap.json")?.entries || {};
const PRICES = loadOpt("optcg_prices.json")?.prices || {};
const RARITY_DB = loadOpt("optcg_rarity.json") || {};
const RARITY_ENTRIES = RARITY_DB.entries || {};
const RARITY_BY_CODE_VER = RARITY_DB.byCodeVer || {};
const RARITY_BY_CMID = RARITY_DB.byCmId || {};
const keyOf = (set, code, ver) => `${String(set || "").replace(/-/g, "")}|${code}|${ver || ""}`;
// cm_id già coperti da EXTRA watchlist: evita doppioni (es. Enel OP05-098 EB02 + OP05)
const EXTRA_CM_IDS = new Set(
  Object.values(CMMAP).filter(e => e.extra && e.en_id).map(e => String(e.en_id)),
);
// extra watchlist: stesso set|code|ver → non emettere anche la copia tcggo
const EXTRA_KEYS = new Set(
  Object.values(CMMAP).filter(e => e.extra).map(e => keyOf(e.set, e.code, e.ver)),
);
// extra watchlist: rarità verificate manualmente (promo fuori Limitless)
const EXTRA_RARITY_BY_CMID = {};
for (const e of Object.values(CMMAP)) {
  if (e.extra && e.en_id && e.rarity) EXTRA_RARITY_BY_CMID[String(e.en_id)] = cleanRar(e.rarity);
}

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
const BANNED_RARITIES = new Set(["Common", "Uncommon"]);
const VALID_CODE = c => /^(OP\d|EB\d|PRB\d|P-\d)/i.test(String(c.code || ""));

// Rarità per versione: Limitless TCG (allineato a Cardmarket V.n) → optcg_rarity.json.
// Fallback: tcggo quando le versioni hanno già rarità distinte.
const codeVerFromUrl = url => {
  if (!url) return null;
  const slug = url.match(/Singles\/[^/]+\/([^/?#]+)/i)?.[1];
  if (!slug) return null;
  const p = slug.match(/(P-\d+)/i);
  const op = slug.match(/((?:OP|EB|ST|PRB)\d+-\d+)/i);
  const code = p ? p[1].toUpperCase() : op ? op[1].toUpperCase() : null;
  const v = slug.match(/-V(\d+)$/i);
  return code ? { code, ver: v ? `V.${v[1]}` : null } : null;
};

const lookupRarity = (code, ver, cmId, lang, url, set = null) => {
  if (cmId != null && EXTRA_RARITY_BY_CMID[String(cmId)]) return EXTRA_RARITY_BY_CMID[String(cmId)];

  const tryCode = (c, v) => {
    if (!c) return null;
    const cv = `${c}|${v || ""}`;
    if (lang === "JP" && RARITY_BY_CODE_VER[`${cv}|JP`]) return RARITY_BY_CODE_VER[`${cv}|JP`];
    if (RARITY_BY_CODE_VER[cv]) return RARITY_BY_CODE_VER[cv];
    const lk = limitlessKey(c, v, lang);
    if (RARITY_ENTRIES[lk]) return RARITY_ENTRIES[lk];
    return null;
  };

  let fromLim = tryCode(code, ver);
  if (!fromLim && url) {
    const fromUrl = codeVerFromUrl(url);
    if (fromUrl) fromLim = tryCode(fromUrl.code, fromUrl.ver ?? ver);
  }

  const fromCm = cmId != null ? RARITY_BY_CMID[String(cmId)] : null;
  const fromTcg = set ? TCGGO_RARITY.get(`${normSet(set)}|${code}|${ver || ""}|${lang}`) : null;

  // cm_id condiviso tra V.n (bug tcggo PRB01): ver vince via tcggo
  if (fromTcg && fromCm && fromTcg !== fromCm) return fromTcg;
  // Limitless vs tcggo: numerazione V.n a volte diverge (OP12) o EB03 SP non in Limitless
  if (fromLim && fromTcg && fromTcg !== fromLim) {
    if (tier(fromTcg) > tier(fromLim)) return fromTcg;
    if (tier(fromLim) > tier(fromTcg) && fromTcg === "Rare") return fromLim;
    return fromTcg;
  }
  if (fromLim) return fromLim;
  if (fromCm) return fromCm;
  return null;
};

const normSet = s => (s || "").replace(/[^A-Za-z0-9]/g, "").toUpperCase(); // "OP-16"->"OP16"
const isJP = c => /(-JP\b|\bJP\b)/i.test(c.ccn || "") || /(-JP\b|\bJP\b)/i.test(c.numbered || "");

// rarità tcggo per set|code|ver — risolve conflitti Limitless/cm_id
const RARITY_TIER = {
  DON: 0, Rare: 1, Leader: 2, "Super Rare": 3, "Secret Rare": 4,
  "Alt-art": 5, "Special Rare": 6, SP: 6, "Manga Rare": 7, "Treasure Rare": 8, Promo: 3,
};
const tier = r => RARITY_TIER[r] ?? 2;
const TCGGO_RARITY = new Map();
for (const c of cards) {
  if (!c.code || !c.set) continue;
  const r = cleanRar(c.rarity);
  if (!r || BANNED_RARITIES.has(r)) continue;
  TCGGO_RARITY.set(`${normSet(c.set)}|${c.code}|${c.version || ""}|${isJP(c) ? "JP" : "EN"}`, r);
}

const items = [];

// ---- SINGOLE (coppia EN + JP) ----
// UNA voce per versione reale (V.1..V.n), NIENTE doppioni.
// Lingua ricavata dal marchio "-JP" nei dati veri (card_code_number / name_numbered) quando presente.

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
  if (!VALID_CODE(c)) continue;
  if (/^ST\d/.test(normSet(c.set)) || /^ST\d/i.test(String(c.code))) continue;
  if (c.rarity === "Common" || c.rarity === "Uncommon") continue;
  if (c.cm_id != null && EXTRA_CM_IDS.has(String(c.cm_id))) continue;
  const cm = c.cm || {};
  const price = cm.it ?? cm.eu ?? cm.low ?? null;
  if (c.rarity === "DON!!" && price != null && price < MIN_PRICE) continue;
  keptCards.push({ c, price });
}

const rarityOfCard = (c, url = null) => {
  const lang = isJP(c) ? "JP" : "EN";
  const lk = limitlessCodeOf(c) || c.code;
  const fromLimitless = lookupRarity(lk, c.version, c.cm_id, lang, url, c.set)
    || lookupRarity(c.code, c.version, c.cm_id, lang, url, c.set);
  if (fromLimitless) return fromLimitless;
  // tcggo solo V.1 / senza versione — V.2+ senza Limitless non si indovina (Alt-art ≠ base)
  if (c.version && c.version !== "V.1") return null;
  const tcg = cleanRar(c.rarity);
  return tcg && !BANNED_RARITIES.has(tcg) ? tcg : null;
};

// pass 2: gemelli JP — ver dal nome prodotto JP; rarità dalla versione EN omologa (V.n)
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
    const enVers = group.filter(({ c }) => !isJP(c)).map(({ c, price }) => {
      const mapEntry = CMMAP[keyOf(c.set, c.code, c.version)];
      const enId = c.cm_id != null ? String(c.cm_id) : mapEntry?.en_id;
      let rec = enId ? PRICES[enId] : null;
      if (!recCodeOk(rec, code)) rec = null;
      return { ver: c.version || null, rarity: rarityOfCard(c), price: refPrice(rec) ?? price };
    });
    const seenJp = new Set();
    const jps = [];
    for (const { c } of group) {
      const jpId = CMMAP[keyOf(c.set, c.code, c.version)]?.jp_id;
      if (!jpId || seenJp.has(jpId)) continue;
      seenJp.add(jpId);
      const rec = PRICES[jpId];
      jps.push({
        id: jpId,
        ver: recCodeOk(rec, code) ? parseVerFromName(rec.name) : null,
        price: recCodeOk(rec, code) ? refPrice(rec) : null,
      });
    }
    if (!jps.length) continue;
    for (const j of jps) {
      const byId = RARITY_BY_CMID[j.id];
      if (byId) { jpTwinInfo.set(j.id, { ver: j.ver, rarity: byId }); continue; }
      const en = enVers.find(e => e.ver === j.ver);
      if (en) jpTwinInfo.set(j.id, { ver: j.ver, rarity: en.rarity });
    }
    if (enVers.length === 1 && jps.length === 1 && !jpTwinInfo.has(jps[0].id)) {
      jpTwinInfo.set(jps[0].id, { ver: jps[0].ver ?? enVers[0].ver, rarity: enVers[0].rarity });
      continue;
    }
    const still = jps.filter(j => !jpTwinInfo.has(j.id));
    if (still.length && still.length === enVers.length && still.every(j => j.price > 0) && enVers.every(e => e.price > 0)) {
      const enByPrice = enVers.slice().sort((a, b) => a.price - b.price);
      const jpByPrice = still.slice().sort((a, b) => a.price - b.price);
      jpByPrice.forEach((j, i) => jpTwinInfo.set(j.id, { ver: j.ver, rarity: enByPrice[i].rarity }));
      continue;
    }
    for (const j of still) {
      if (!jpTwinInfo.has(j.id)) jpTwinInfo.set(j.id, { ver: j.ver, rarity: "" });
    }
  }
}

// stesso code+ver+lang: preferisci record con cm_id (evita DON duplicati tcggo)
keptCards.sort((a, b) => {
  const sk = k => `${normSet(k.c.set)}|${k.c.code}|${k.c.version || ""}|${isJP(k.c) ? "JP" : "EN"}`;
  const ka = sk(a), kb = sk(b);
  if (ka !== kb) return ka.localeCompare(kb);
  return (b.c.cm_id ? 1 : 0) - (a.c.cm_id ? 1 : 0);
});

let singles = 0, singlesJP = 0, pricedEN = 0, jpEmitted = 0;
const jpEmittedIds = new Set(); // guardia: un prodotto JP compare UNA volta sola nel catalogo
const emittedSingles = new Set(); // dedupe DON / doppioni tcggo (code+ver+lang)
for (const { c, price } of keptCards) {
  const cm = c.cm || {};
  const jp = isJP(c);
  if (jp) singlesJP++;
  if (!jp && EXTRA_KEYS.has(keyOf(c.set, c.code, c.version))) continue;
  const singleKey = `${normSet(c.set)}|${c.code}|${c.version || ""}|${jp ? "JP" : "EN"}`;
  if (emittedSingles.has(singleKey)) continue;
  emittedSingles.add(singleKey);
  const rarity = rarityOfCard(c);
  if (!rarity) continue;
  const mapEntry = CMMAP[keyOf(c.set, c.code, c.version)];
  const item = {
    set: normSet(c.set),
    code: c.code,
    ver: c.version || null,     // distingue le versioni della stessa carta
    char: c.name,
    type: "Carta",
    rarity,
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
  if (enId && RARITY_BY_CMID[enId]) item.rarity = RARITY_BY_CMID[enId];
  else {
    const urlRarity = lookupRarity(item.code, item.ver, item.cmId, item.lang, item.url, item.set);
    if (urlRarity) item.rarity = urlRarity;
  }
  const finalR = lookupRarity(item.code, item.ver, item.cmId, item.lang, item.url, item.set);
  if (finalR) item.rarity = cleanRar(finalR);
  else continue;
  if (BANNED_RARITIES.has(item.rarity)) continue;
  items.push(item);
  singles++;

  // voce JP gemella: emessa se mappata (prezzo opzionale — placeholder finché non scaricato)
  if (!jp && mapEntry?.jp_id && !jpEmittedIds.has(mapEntry.jp_id)) {
    jpEmittedIds.add(mapEntry.jp_id);
    const jpRec = PRICES[mapEntry.jp_id] || {};
    const jpInfo = jpTwinInfo.get(mapEntry.jp_id) || {
      ver: parseVerFromName(jpRec.name) || item.ver,
      rarity: item.rarity,
    };
    const jpItem = {
      ...item,
      lang: "JP",
      ver: jpInfo.ver,
      rarity: jpInfo.rarity || item.rarity,
      cm: null, t30: null, t14: null, t7: null, target: 0,
      trend: null, avg30: null, avg5: null, available: null, listings: [], fetched_at: null,
      note: `${c.setName || ""} (JP)${jpInfo.ver ? " · " + jpInfo.ver : ""}`.trim(),
      url: bestCmUrl(jpRec, jpSingleUrl(jpRec.expansion, c.setName, c.name, c.code, jpInfo.ver)),
      img: jpRec.image_url || `https://cardmarketapi.com/cards/${mapEntry.jp_id}/image`,
      cmId: Number(mapEntry.jp_id) || null,
    };
    if (recCodeOk(jpRec, c.code)) applyPrices(jpItem, jpRec, mapEntry.jp_id);
    if (jpItem.cmId && RARITY_BY_CMID[String(jpItem.cmId)]) jpItem.rarity = RARITY_BY_CMID[String(jpItem.cmId)];
    else {
      const jpUrlRarity = lookupRarity(jpItem.code, jpItem.ver, jpItem.cmId, "JP", jpItem.url, jpItem.set);
      if (jpUrlRarity) jpItem.rarity = cleanRar(jpUrlRarity);
    }
    const jpFinal = lookupRarity(jpItem.code, jpItem.ver, jpItem.cmId, "JP", jpItem.url, jpItem.set);
    if (jpFinal) jpItem.rarity = cleanRar(jpFinal);
    else if (!jpItem.rarity) jpItem.rarity = item.rarity;
    if (BANNED_RARITIES.has(jpItem.rarity)) continue;
    items.push(jpItem);
    jpEmitted++; singlesJP++;
  }
}

// pass 3: gemelli JP mancanti (EN già emesse, jp_id in cmmap ma non ancora in catalogo)
for (const enItem of items.filter(it => it.type === "Carta" && it.lang === "EN")) {
  const mapEntry = CMMAP[keyOf(enItem.set, enItem.code, enItem.ver)];
  if (!mapEntry?.jp_id || jpEmittedIds.has(mapEntry.jp_id)) continue;
  if (items.some(it => it.lang === "JP" && String(it.cmId) === String(mapEntry.jp_id))) continue;
  jpEmittedIds.add(mapEntry.jp_id);
  const jpRec = PRICES[mapEntry.jp_id] || {};
  const jpInfo = jpTwinInfo.get(mapEntry.jp_id) || {
    ver: parseVerFromName(jpRec.name) || enItem.ver,
    rarity: enItem.rarity,
  };
  const jpItem = {
    ...enItem,
    lang: "JP",
    ver: jpInfo.ver,
    rarity: jpInfo.rarity || enItem.rarity,
    cm: null, t30: null, t14: null, t7: null, target: 0,
    trend: null, avg30: null, avg5: null, available: null, listings: [], fetched_at: null,
    note: (enItem.note || "").replace(/ · V\.\d+$/, "") + " (JP)" + (jpInfo.ver ? " · " + jpInfo.ver : ""),
    url: bestCmUrl(jpRec, jpSingleUrl(jpRec.expansion, enItem.note, enItem.char, enItem.code, jpInfo.ver)),
    img: jpRec.image_url || `https://cardmarketapi.com/cards/${mapEntry.jp_id}/image`,
    cmId: Number(mapEntry.jp_id) || null,
  };
  if (jpRec.name || jpRec.from != null) applyPrices(jpItem, jpRec.name ? jpRec : null, mapEntry.jp_id);
  if (!jpItem.rarity || BANNED_RARITIES.has(jpItem.rarity)) continue;
  items.push(jpItem);
  jpEmitted++; singlesJP++;
}

// ---- BOX / CASE (incl. OP17) ----
let boxes = 0, cases = 0;
for (const p of products) {
  const name = p.name || "";
  const isSleevedCase = /sleeved.*pack.*case/i.test(name);
  const isBoosterCase = /booster box case/i.test(name);
  const isCase = isSleevedCase || isBoosterCase || (/case/i.test(name) && !/booster box/i.test(name));
  const isBox = /booster box/i.test(name) && !isCase;
  if (!isCase && !isBox) continue; // solo box e case
  if (/^ST\d/.test(normSet(p.set))) continue; // NIENTE prodotti Starter Deck
  const set = normSet(p.set);
  const isPreErrata = /pre-errata/i.test(name);
  const codeSuffix = isBox ? (isPreErrata ? "BOX-PE" : "BOX") : (isSleevedCase ? "SCASE" : "CASE");
  const sealedItem = {
    set,
    code: `${set}-${codeSuffix}`,
    char: name,
    type: isCase ? "Case" : "Box",
    rarity: "",
    lang: "EN",
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
  const sealedMapEntry = Object.values(CMMAP).find(e => p.cm_id != null && String(e.en_id) === String(p.cm_id))
    || CMMAP[keyOf(set, sealedItem.code, null)];
  const sealedId = p.cm_id != null ? String(p.cm_id) : (sealedMapEntry?.en_id || null);
  const sealedRec = sealedId ? PRICES[sealedId] : null;
  if (applyPrices(sealedItem, sealedRec, sealedId)) pricedEN++;
  items.push(sealedItem);
  if (isCase) cases++; else boxes++;

  // gemello JP box/case
  if (sealedMapEntry?.jp_id) {
    const jpRec = PRICES[sealedMapEntry.jp_id] || {};
    const jpSealed = {
      ...sealedItem,
      lang: "JP",
      cm: null, t30: null, t14: null, t7: null, target: 0,
      trend: null, avg30: null, avg5: null, available: null, listings: [], fetched_at: null,
      note: (p.setName || "") + " (JP)",
      url: bestCmUrl(jpRec, sealedItem.url),
      img: jpRec.image_url || `https://cardmarketapi.com/cards/${sealedMapEntry.jp_id}/image`,
      cmId: Number(sealedMapEntry.jp_id) || null,
    };
    if (jpRec.name || jpRec.from != null) applyPrices(jpSealed, jpRec.name ? jpRec : null, sealedMapEntry.jp_id);
    items.push(jpSealed);
    if (isCase) cases++; else boxes++;
  }
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
  if (e.rarity) x.rarity = cleanRar(e.rarity);
  else if (x.cmId && RARITY_BY_CMID[String(x.cmId)]) x.rarity = RARITY_BY_CMID[String(x.cmId)];
  else {
    const xr = lookupRarity(x.code, x.ver, x.cmId, x.lang, x.url, x.set);
    if (xr) x.rarity = cleanRar(xr);
  }
  if (!x.rarity || BANNED_RARITIES.has(x.rarity)) continue;
  items.push(x);
  extras++;
}

const header = `// Generato automaticamente da optcg_catalog.mjs — NON modificare a mano.
// Fonte catalogo: cardmarket-api-tcg (RapidAPI). Rarità: Limitless TCG → optcg_rarity.json.
// Prezzi: cardmarketapi.com (EUR, EN/JP distinti) per gli item già mappati; placeholder tcggo per il resto.
// Solo le DON con prezzo noto sotto €1 sono escluse (tutte le altre rarità restano).\n`;
writeFileSync("catalog.js", header + "window.CATALOG_ITEMS = " + JSON.stringify(items) + ";\n");

console.log(`Singole (versioni reali): ${singles} · di cui marcate JP: ${singlesJP}`);
console.log(`Box: ${boxes} · Case: ${cases} · Extra watchlist: ${extras}`);
console.log(`Prezzi API applicati (EN): ${pricedEN} · voci JP emesse: ${jpEmitted}`);
console.log(`TOTALE voci in catalog.js: ${items.length}`);
console.log(`Set inclusi: ${[...new Set(items.map(i => i.set))].sort().join(", ")}`);
