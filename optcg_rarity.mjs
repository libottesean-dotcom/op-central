// Scarica rarità EN + JP da Limitless TCG. Output: optcg_rarity.json
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import {
  parseLimitlessHtml, entriesToMaps, limitlessKey, cleanRar, limitlessCodeOf,
} from "./optcg_rarity_lib.mjs";

const OUT = "optcg_rarity.json";
const CARDS_FILE = "optcg_cards_raw.json";
const DELAY_MS = Number(process.env.RARITY_DELAY_MS || 350);
const MAX_NEW = Number(process.env.RARITY_MAX_NEW || 9999);
const REFETCH_JP = process.env.RARITY_REFETCH_JP === "1";

const sleep = ms => new Promise(r => setTimeout(r, ms));
const parseVerFromName = n => { const m = /\(V\.(\d+)\)/.exec(n || ""); return m ? "V." + m[1] : null; };
const refPrice = rec => {
  const t = rec?.trend, f = rec?.from;
  if (t > 0 && f > 0) return Math.sqrt(t * f);
  return t > 0 ? t : (f > 0 ? f : null);
};

const cards = Object.values(JSON.parse(readFileSync(CARDS_FILE, "utf8")));
const CMMAP = existsSync("optcg_cmmap.json") ? JSON.parse(readFileSync("optcg_cmmap.json", "utf8")).entries || {} : {};
const PRICES = existsSync("optcg_prices.json") ? JSON.parse(readFileSync("optcg_prices.json", "utf8")).prices || {} : {};

function collectCodes() {
  const codes = new Set();
  const add = c => { if (c) codes.add(c.toUpperCase()); };

  for (const c of cards) {
    if (!c.set || /^ST/i.test(String(c.set).replace(/-/g, ""))) continue;
    if (c.rarity === "Common" || c.rarity === "Uncommon") continue;
    add(limitlessCodeOf(c));
    if (c.code && /^(OP|EB|P|ST|PRB)/i.test(c.code)) add(c.code.toUpperCase());
  }

  if (existsSync("catalog.js")) {
    const catRaw = readFileSync("catalog.js", "utf8");
    const items = JSON.parse(catRaw.replace(/^[\s\S]*?\[/, "[").replace(/\];[\s\S]*$/, "]"));
    for (const it of items) {
      if (it.type !== "Carta") continue;
      add(it.code);
    }
  }

  return [...codes].filter(Boolean).sort();
}

async function fetchHtml(path) {
  const res = await fetch(`https://onepiece.limitlesstcg.com${path}`, {
    headers: { "User-Agent": "OPCentral-RarityBot/1.0 (+https://op-central-app.onrender.com)" },
  });
  return { status: res.status, html: res.ok ? await res.text() : "" };
}

function mergePrints(code, prints, lang, entries, byCodeVer) {
  if (!prints.length) return;
  const maps = entriesToMaps(prints, lang);
  Object.assign(entries, maps.byKey);
  Object.assign(byCodeVer, maps.byCodeVer);
}

function attachCmIdsFromPrices(PRICES, byCodeVer, entries, byCmId) {
  for (const [id, rec] of Object.entries(PRICES)) {
    if (!rec?.name) continue;
    const codeM = rec.name.match(/\((OP\d+-\d+|EB\d+-\d+|P-\d+|ST\d+-\d+|PRB\d+-\d+)\)/i);
    const verM = /\(V\.(\d+)\)/.exec(rec.name);
    if (!codeM) continue;
    const code = codeM[1].toUpperCase();
    const ver = verM ? `V.${verM[1]}` : "";
    const r = byCodeVer[`${code}|${ver}`]
      || entries[limitlessKey(code, ver || null, "EN")]
      || entries[limitlessKey(code, ver || null, "JP")];
    if (r) byCmId[id] = r;
  }
}

function attachEnCmIds(prints, cards, byCmId) {
  for (const p of prints) {
    const raw = cards.find(c =>
      limitlessCodeOf(c) === p.code &&
      (c.version || null) === (p.ver || null) &&
      !/(^|-)JP\b/i.test(c.ccn || "") &&
      !/(^|-)JP\b/i.test(c.numbered || ""),
    );
    if (raw?.cm_id) byCmId[String(raw.cm_id)] = p.rarity;
  }
}

function baseRarityOf(code, entries, byCodeVer) {
  return entries[limitlessKey(code, "", "EN")]
    || entries[limitlessKey(code, "", "JP")]
    || byCodeVer[`${code}|`]
    || null;
}

function buildJpCmIds(byCodeVer, entries, byCmId) {
  const enByCode = new Map();
  for (const [k, r] of Object.entries(byCodeVer)) {
    if (k.endsWith("|JP")) continue;
    const pipe = k.lastIndexOf("|");
    const code = k.slice(0, pipe);
    const ver = k.slice(pipe + 1);
    if (!ver) continue;
    if (!enByCode.has(code)) enByCode.set(code, []);
    enByCode.get(code).push({ ver, rarity: r, price: null });
  }

  for (const c of cards) {
    if (!c.code || !c.version) continue;
    const code = limitlessCodeOf(c) || c.code;
    const list = enByCode.get(code) || enByCode.get(c.code);
    if (!list) continue;
    const mapEntry = CMMAP[`${String(c.set || "").replace(/-/g, "")}|${c.code}|${c.version || ""}`];
    const enId = c.cm_id != null ? String(c.cm_id) : mapEntry?.en_id;
    const rec = enId ? PRICES[enId] : null;
    const row = list.find(x => x.ver === c.version);
    if (row) row.price = refPrice(rec) ?? c.cm?.eu ?? c.cm?.low ?? row.price;
  }

  const seenJp = new Set();
  const jpByCode = new Map();
  for (const [key, e] of Object.entries(CMMAP)) {
    if (!e.jp_id || seenJp.has(String(e.jp_id))) continue;
    seenJp.add(String(e.jp_id));
    const code = key.split("|")[1];
    const rec = PRICES[String(e.jp_id)];
    if (!rec?.name || !code) continue;
    if (!jpByCode.has(code)) jpByCode.set(code, []);
    jpByCode.get(code).push({
      id: String(e.jp_id),
      ver: parseVerFromName(rec.name),
      price: refPrice(rec),
    });
  }

  for (const [code, jpList] of jpByCode) {
    const lk = limitlessCodeOf({ code }) || code;
    for (const j of jpList) {
      if (!j.ver) {
        const base = baseRarityOf(lk, entries, byCodeVer) || baseRarityOf(code, entries, byCodeVer);
        const enList = enByCode.get(lk) || enByCode.get(code) || [];
        const enR = base || enList.find(e => e.ver === "V.1")?.rarity || enList[0]?.rarity;
        if (enR) byCmId[j.id] = enR;
        continue;
      }
      const fromJp = entries[limitlessKey(lk, j.ver, "JP")]
        || byCodeVer[`${lk}|${j.ver}|JP`]
        || byCodeVer[`${code}|${j.ver}|JP`];
      if (fromJp) { byCmId[j.id] = fromJp; continue; }
      const enList = enByCode.get(lk) || enByCode.get(code) || [];
      const enSame = enList.find(e => e.ver === j.ver);
      if (enSame?.rarity) { byCmId[j.id] = enSame.rarity; continue; }
    }
    const still = jpList.filter(j => !byCmId[j.id] && j.price > 0);
    const enPriced = (enByCode.get(lk) || enByCode.get(code) || [])
      .filter(e => e.price > 0 && e.rarity)
      .sort((a, b) => a.price - b.price);
    if (still.length && still.length === enPriced.length) {
      still.sort((a, b) => a.price - b.price);
      still.forEach((j, i) => { byCmId[j.id] = enPriced[i].rarity; });
    }
  }
}

const codes = collectCodes();
const prev = existsSync(OUT) ? JSON.parse(readFileSync(OUT, "utf8")) : { version: 2, fetched: {}, entries: {}, byCodeVer: {}, byCmId: {} };
const fetched = { ...(prev.fetched || {}) };
const entries = { ...(prev.entries || {}) };
const byCodeVer = { ...(prev.byCodeVer || {}) };
const byCmId = { ...(prev.byCmId || {}) };

let addedEn = 0, addedJp = 0, skipped = 0, failed = 0;

const persist = () => writeFileSync(OUT, JSON.stringify({
  version: 2,
  updated: new Date().toISOString(),
  stats: {
    codes: codes.length,
    entries: Object.keys(entries).length,
    enKeys: Object.keys(entries).filter(k => k.endsWith("|EN")).length,
    jpKeys: Object.keys(entries).filter(k => k.endsWith("|JP")).length,
    byCmId: Object.keys(byCmId).length,
  },
  fetched, entries, byCodeVer, byCmId,
}, null, 0));

for (const [code, state] of Object.entries(fetched)) {
  if (state.ok && !state.en) fetched[code] = { ...state, en: true, enPrints: state.prints ?? 0 };
}

for (const code of codes) {
  const state = fetched[code] || {};
  const needEn = !state.en || state.enPrints === 0;
  const needJp = REFETCH_JP || !state.jp;
  if (!needEn && !needJp) { skipped++; continue; }
  if (addedEn + addedJp >= MAX_NEW) break;

  try {
    if (needEn) {
      const { status, html } = await fetchHtml(`/cards/${encodeURIComponent(code)}?display=full`);
      if (status === 404) {
        fetched[code] = { ...state, en: false, en404: true, at: new Date().toISOString() };
        failed++;
      } else if (status === 200) {
        const { baseRarity, entries: prints } = parseLimitlessHtml(html);
        if (!prints.length) {
          entries[limitlessKey(code, "", "EN")] = baseRarity;
          byCodeVer[`${code}|`] = baseRarity;
        } else {
          mergePrints(code, prints, "EN", entries, byCodeVer);
          attachEnCmIds(prints, cards, byCmId);
        }
        fetched[code] = { ...state, en: true, enPrints: prints?.length || 0, at: new Date().toISOString() };
        addedEn++;
      }
      await sleep(DELAY_MS);
    }

    if (needJp) {
      const { status, html } = await fetchHtml(`/cards/jp/${encodeURIComponent(code)}?display=full`);
      if (status === 200) {
        const { entries: jpPrints } = parseLimitlessHtml(html);
        mergePrints(code, jpPrints, "JP", entries, byCodeVer);
        fetched[code] = { ...(fetched[code] || state), jp: true, jpPrints: jpPrints.length, at: new Date().toISOString() };
        addedJp++;
      } else {
        fetched[code] = { ...(fetched[code] || state), jp: false, at: new Date().toISOString() };
      }
      await sleep(DELAY_MS);
    }
  } catch (e) {
    fetched[code] = { ...(fetched[code] || state), error: String(e.message || e), at: new Date().toISOString() };
    failed++;
    console.warn(`[rarity] FAIL ${code}:`, e.message || e);
  }

  if ((addedEn + addedJp) % 20 === 0 && (addedEn + addedJp) > 0) {
    persist();
    console.log(`[rarity] +${addedEn} EN +${addedJp} JP · entries ${Object.keys(entries).length}`);
  }
}

for (const c of cards) {
  if (!c.code || !c.version) continue;
  const lk = limitlessCodeOf(c) || c.code;
  const k = `${lk}|${c.version}`;
  if (byCodeVer[k]) continue;
  const group = cards.filter(x => (limitlessCodeOf(x) || x.code) === lk);
  if (new Set(group.map(x => x.rarity)).size <= 1) continue;
  byCodeVer[k] = cleanRar(c.rarity);
  entries[limitlessKey(lk, c.version, "EN")] = cleanRar(c.rarity);
  if (c.cm_id) byCmId[String(c.cm_id)] = cleanRar(c.rarity);
}

buildJpCmIds(byCodeVer, entries, byCmId);

// Promo P-xxx: re-merge con parser aggiornato
for (const code of codes.filter(c => /^P-\d+$/.test(c))) {
  const { status, html } = await fetchHtml(`/cards/${encodeURIComponent(code)}?display=full`);
  if (status !== 200) continue;
  const { entries: prints } = parseLimitlessHtml(html);
  if (prints.length) {
    mergePrints(code, prints, "EN", entries, byCodeVer);
    attachEnCmIds(prints, cards, byCmId);
  }
  await sleep(120);
}
buildJpCmIds(byCodeVer, entries, byCmId);

// Fonte autorevole per cm_id: V.n nel NOME prodotto Cardmarket (non version tcggo, può essere invertita)
attachCmIdsFromPrices(PRICES, byCodeVer, entries, byCmId);

persist();

console.log("\n=== optcg_rarity.mjs ===");
console.log("codes target:", codes.length);
console.log("new EN:", addedEn, "new JP:", addedJp, "skipped:", skipped, "failed:", failed);
console.log("entries:", Object.keys(entries).length,
  "(EN:", Object.keys(entries).filter(k => k.endsWith("|EN")).length,
  "JP:", Object.keys(entries).filter(k => k.endsWith("|JP")).length + ")");
console.log("byCmId:", Object.keys(byCmId).length,
  "JP cm_ids:", Object.values(CMMAP).filter(e => e.jp_id).length);
console.log("written:", OUT);
