// Modulo condiviso per la pipeline prezzi cardmarketapi.com (FASE 2).
// - client HTTP con gestione 429/502/timeout
// - budget guard basato su /api/v1/usage (gratis)
// - lista item del catalogo + item EXTRA della watchlist (promo ecc.)
// - tier di priorità: 1=watchlist/collezione, 2=>=€20, 3=>=€5, 4=resto
import { readFileSync, writeFileSync, renameSync, existsSync } from "node:fs";

export const CONFIG = JSON.parse(readFileSync("optcg_config.json", "utf8"));
const API = CONFIG.cardmarketapi;

const sleep = ms => new Promise(r => setTimeout(r, ms));

// GET con retry: 429 -> attende Retry-After; 502/503/timeout -> 1 retry.
export async function apiGet(path, { timeoutMs = 90000 } = {}) {
  for (let attempt = 0; attempt < 4; attempt++) {
    let res;
    try {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), timeoutMs);
      res = await fetch(API.base_url + path, { headers: { "X-API-Key": API.api_key }, signal: ctl.signal });
      clearTimeout(t);
    } catch (e) {
      if (attempt >= 2) throw new Error(`network error on ${path}: ${e.message}`);
      await sleep(3000);
      continue;
    }
    if (res.status === 429) {
      const wait = Number(res.headers.get("retry-after")) || 30;
      console.log(`  [429] attendo ${wait}s...`);
      await sleep((wait + 1) * 1000);
      continue;
    }
    if (res.status === 502 || res.status === 503) {
      if (attempt >= 2) throw new Error(`HTTP ${res.status} on ${path}`);
      await sleep(3000);
      continue;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status} on ${path}: ${(await res.text()).slice(0, 200)}`);
    return res.json();
  }
  throw new Error(`troppi retry su ${path}`);
}

export const getUsage = () => apiGet("/api/v1/usage");

// Guard: interrompe quando used_today raggiunge il cap. /usage è gratis.
// Il conteggio locale copre l'intervallo tra due verifiche remote.
export class BudgetGuard {
  constructor(cap) { this.cap = cap; this.used = null; this.local = 0; }
  async init() {
    const u = await getUsage();
    this.used = u.used_today;
    this.plan = u;
    return u;
  }
  // da chiamare PRIMA di ogni richiesta a pagamento; true = ok, false = budget finito
  async allow() {
    if (this.used == null) await this.init();
    if (this.local >= 25) { // ricontrolla il contatore vero ogni 25 chiamate
      const u = await getUsage();
      this.used = u.used_today;
      this.local = 0;
    }
    return (this.used + this.local) < this.cap;
  }
  count() { this.local++; }
  get estimate() { return (this.used ?? 0) + this.local; }
}

export function loadJson(path, fallback) {
  if (!existsSync(path)) return fallback;
  try { return JSON.parse(readFileSync(path, "utf8")); } catch { return fallback; }
}
// scrittura atomica: mai file troncati se il processo muore a metà
export function saveJson(path, obj) {
  writeFileSync(path + ".tmp", JSON.stringify(obj));
  renameSync(path + ".tmp", path);
}

export const normSet = s => (s || "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
// chiave item allineata a wlKey dell'HTML: set senza trattini | code | ver
export const keyOf = (set, code, ver) => `${String(set || "").replace(/-/g, "")}|${code}|${ver || ""}`;

// ---- EXTRA WATCHLIST (item non presenti nei dati tcggo: promo, set speciali) ----
// Identità copiate ESATTAMENTE da EXTRA_WATCHLIST_ITEMS nell'HTML (set/code/ver/char/lang
// devono combaciare perché idOf/wlKey dell'app usano quei campi).
export const EXTRA_ITEMS = [
  { set: "OP09", code: "OP09-001", ver: "V.1", char: "Shanks (Leader Promo)", rarity: "Leader", lang: "EN",
    searchQ: "OP09-001", expMatch: /promo/i, target: 105,
    url: "https://www.cardmarket.com/en/OnePiece/Products/Singles/Unnumbered-Promos/Shanks-OP09-001-V1",
    note: "Watchlist · Unnumbered Promos · Leader" },
  { set: "OP09", code: "OP09-004", ver: "V.4", char: "Shanks (Manga)", rarity: "Manga Rare", lang: "EN",
    searchQ: "OP09-004", expMatch: /emperors/i, target: 1375,
    url: "https://www.cardmarket.com/en/OnePiece/Products/Singles/Emperors-in-the-New-World/Shanks-OP09-004-V4",
    note: "Watchlist · Emperors in the New World · grail" },
  { set: "OP05", code: "OP05-098", ver: null, char: "Enel", rarity: "Special", lang: "EN",
    searchQ: "OP05-098", expMatch: /25th/i, target: 1800,
    url: "https://www.cardmarket.com/en/OnePiece/Products/Singles/Anime-25th-Collection/Enel-OP05-098",
    note: "Watchlist · Anime 25th Collection" },
  { set: "OP03", code: "OP03-122", ver: "V.3", char: "Sogeking (Manga)", rarity: "Manga Rare", lang: "EN",
    searchQ: "OP03-122", expMatch: /pillars/i, target: 450,
    url: "https://www.cardmarket.com/en/OnePiece/Products/Singles/Pillars-of-Strength/Sogeking-OP03-122-V3",
    note: "Watchlist · Pillars of Strength · Manga Rare originale" },
  { set: "P-110", code: "One Piece Day '25", ver: null, char: "Monkey D. Luffy (LEGO Version)", rarity: "Promo", lang: "JP",
    searchQ: "P-110", nameMatch: /luffy/i, target: 210,
    url: "https://www.cardmarket.com/en/OnePiece/Products/Singles/Promos-Japanese/MonkeyDLuffy-P-110",
    note: "Watchlist · Promos Japanese · LEGO" },
  { set: "P-041", code: "World Tour 23-24", ver: null, char: "Monkey D. Luffy (Gear 5) — PSA10", rarity: "Promo", lang: "JP",
    searchQ: "P-041", nameMatch: /luffy/i, verRank: 4, target: 300,
    url: "https://www.cardmarket.com/en/OnePiece/Products/Singles/Promos-Japanese/MonkeyDLuffy-P-041-V4",
    note: "Promo · PSA 10 · prezzo = raw JP" },
];

// ---- WATCHLIST SEED (identità, copiate dal WATCHLIST_SEED dell'HTML) ----
// carte per set|code|ver + box/case OP01..OP16
export const SEED_CARD_KEYS = new Set([
  keyOf("OP09", "OP09-001", "V.1"), keyOf("OP09", "OP09-004", "V.4"),
  keyOf("OP15", "OP15-118", "V.3"), keyOf("OP05", "OP05-098", null),
  keyOf("OP16", "OP16-065", "V.3"), keyOf("OP16", "OP16-073", "V.3"),
  keyOf("OP16", "OP16-063", "V.3"), keyOf("OP03", "OP03-122", "V.3"),
  keyOf("P-110", "One Piece Day '25", null),
  keyOf("OP13", "OP13-119", "V.4"), keyOf("OP13", "OP13-118", "V.3"),
  keyOf("OP13", "OP09-118", null), keyOf("OP13", "OP13-120", "V.3"),
  keyOf("P-041", "World Tour 23-24", null),
]);
export const SEED_SEALED_SETS = new Set(Array.from({ length: 16 }, (_, i) => "OP" + String(i + 1).padStart(2, "0")));

// ---- costruzione lista item dai dati grezzi tcggo (stessi filtri di optcg_catalog.mjs) ----
export function buildRawItems() {
  const cards = Object.values(JSON.parse(readFileSync("optcg_cards_raw.json", "utf8")));
  const products = Object.values(JSON.parse(readFileSync("optcg_products_raw.json", "utf8")));
  const MIN_PRICE = 1;
  const singles = [];
  for (const c of cards) {
    if (!c.code || !c.set) continue;
    if (/^ST\d/.test(normSet(c.set))) continue;
    if (c.rarity === "Common" || c.rarity === "Uncommon") continue; // stessi filtri di optcg_catalog.mjs
    const price = c.cm?.it ?? c.cm?.eu ?? c.cm?.low ?? null;
    if (c.rarity === "DON!!" && price != null && price < MIN_PRICE) continue;
    singles.push({
      kind: "single", key: keyOf(c.set, c.code, c.version),
      set: normSet(c.set), code: c.code, ver: c.version || null,
      name: c.name, setName: c.setName || "", cmId: c.cm_id || null, price,
    });
  }
  const sealed = [];
  for (const p of products) {
    const name = p.name || "";
    const isCase = /case/i.test(name);
    const isBox = /booster box/i.test(name) && !isCase;
    if (!isCase && !isBox) continue;
    if (/^ST\d/.test(normSet(p.set))) continue;
    const set = normSet(p.set);
    // le varianti secondarie (Sleeved Pack Case, Pre-Errata) condividono il code SET-CASE/SET-BOX:
    // chiave mappa distinta per non far collassare prodotti diversi sulla stessa entry
    const isAlt = /sleeved|pre-errata/i.test(name);
    const baseKey = keyOf(set, `${set}-${isCase ? "CASE" : "BOX"}`, null);
    sealed.push({
      kind: isCase ? "case" : "box", key: isAlt ? `${baseKey}ALT${p.cm_id || p.id}` : baseKey,
      set, name, setName: p.setName || "", cmId: p.cm_id || null, price: p.cm_low ?? null,
    });
  }
  return { singles, sealed };
}

// tier: 1 = watchlist/collezione, 2 = >=€20, 3 = >=€5, 4 = resto
export function tierOf(item) {
  if (item.kind === "single" && SEED_CARD_KEYS.has(item.key)) return 1;
  if ((item.kind === "box" || item.kind === "case") && SEED_SEALED_SETS.has(item.set)) return 1;
  if (item.kind !== "single") return 2; // box/case fuori watchlist: pochi, trattati come high-value
  if (item.price != null && item.price >= 20) return 2;
  if (item.price != null && item.price >= 5) return 3;
  return 4;
}

export const parseVerFromName = name => {
  const m = /\(V\.(\d+)\)/.exec(name || "");
  return m ? "V." + m[1] : null;
};
export const verNum = v => v ? Number(String(v).replace(/\D/g, "")) : null;

// ---- URL Cardmarket ----
// Cardmarket NON accetta ?idProduct= da solo (redirect "Invalid product!"): serve lo slug nel path.
// Slug calibrato su URL reali: Tony-TonyChopper, Boa-Hancock, MonkeyDLuffy, ...
export const cmSearchUrl = q =>
  `https://www.cardmarket.com/en/OnePiece/Products/Search?searchString=${encodeURIComponent(q)}`;

const CM_STOPWORDS = new Set(["on", "of", "in", "the", "his", "her", "and", "a", "an", "to"]);

export const nameSlug = name => (name || "")
  .trim()
  .split(/\s+/)
  .map(w => w.replace(/[^A-Za-z0-9-]/g, ""))
  .filter(Boolean)
  .join("-");

export const expansionSlug = setName => (setName || "")
  .trim()
  .split(/[\s-]+/)
  .map((w, i) => {
    const clean = w.replace(/[^A-Za-z0-9]/g, "");
    if (!clean) return "";
    return (i > 0 && CM_STOPWORDS.has(clean.toLowerCase())) ? clean.toLowerCase() : clean;
  })
  .filter(Boolean)
  .join("-");

export const singleSlugUrl = (setName, name, code, version) => {
  const exp = expansionSlug(setName);
  if (!exp) return cmSearchUrl(code);
  const nm = nameSlug(name);
  const ver = version ? "-V" + String(version).replace(/\D/g, "") : "";
  return `https://www.cardmarket.com/en/OnePiece/Products/Singles/${exp}/${nm}-${code}${ver}`;
};

export const parseCmProductName = raw => {
  if (!raw) return null;
  let s = raw.trim();
  let ver = null;
  const verM = s.match(/\s*\(V\.(\d+)\)\s*$/i);
  if (verM) { ver = `V.${verM[1]}`; s = s.slice(0, verM.index).trim(); }
  const codeM = s.match(/^(.+?)\s*\(([A-Za-z0-9-]+)\)\s*$/);
  if (!codeM) return null;
  return { name: codeM[1].trim(), code: codeM[2], ver };
};

export const urlFromCmRec = rec => {
  const p = parseCmProductName(rec?.name);
  if (!p || !rec?.expansion) return null;
  return singleSlugUrl(rec.expansion, p.name, p.code, p.ver);
};

export const bestCmUrl = (rec, fallback) => urlFromCmRec(rec) || fallback || null;
