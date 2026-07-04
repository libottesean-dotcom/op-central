#!/usr/bin/env node
// Check TOTALE: tcggo grezzo, catalog.js, rarità Limitless, set, filtri, link CM.
import { readFileSync, existsSync } from "node:fs";
import { cleanRar } from "./optcg_rarity_lib.mjs";

const FAIL = [];
const WARN = [];
const fail = (m) => FAIL.push(m);
const warn = (m) => WARN.push(m);

// ---- regole catalogo (allineate a optcg_catalog.mjs) ----
const ALLOWED_RARITIES = new Set([
  "Leader", "Super Rare", "Secret Rare", "Special Rare", "Rare",
  "Alt-art", "Manga Rare", "Treasure Rare", "SP", "SP CARD", "Promo", "DON", "",
]);
const BANNED_RAW = new Set(["Common", "Uncommon"]);
const CMMAP = JSON.parse(readFileSync("optcg_cmmap.json", "utf8")).entries || {};

function lookupRarity(it, db) {
  const { byCmId, byCodeVer, entries } = db;
  const lang = it.lang || "EN";
  if (it.cmId != null) {
    const ex = Object.values(CMMAP).find(e => e.extra && String(e.en_id) === String(it.cmId));
    if (ex?.rarity) return cleanRar(ex.rarity);
  }
  if (it.cmId != null && byCmId?.[String(it.cmId)]) return byCmId[String(it.cmId)];
  const cv = `${it.code}|${it.ver || ""}`;
  if (lang === "JP" && byCodeVer?.[`${cv}|JP`]) return byCodeVer[`${cv}|JP`];
  if (byCodeVer?.[cv]) return byCodeVer[cv];
  const lk = `${it.code}|${it.ver || ""}|${lang}`;
  if (entries?.[lk]) return entries[lk];
  return null;
}

function wlKey(it) {
  const set = String(it.set || "").replace("-", "");
  let code = String(it.code || "").trim(), ver = it.ver || null;
  const m = code.match(/^(.*?)\s+(V\.\d+)$/);
  if (m) { code = m[1]; ver = ver || m[2]; }
  return `${set}|${code}|${ver || ""}|${it.lang || "EN"}`;
}

// === 1. TCGGO GREZZO ===
const state = JSON.parse(readFileSync("optcg_state.json", "utf8"));
const rawN = Object.keys(JSON.parse(readFileSync("optcg_cards_raw.json", "utf8"))).length;
console.log("=== 1. TCGGO GREZZO ===");
console.log(`  carte: ${rawN} / 4273 · cardsDone: ${state.cardsDone} · pagina: ${state.cardsPage}/214`);
if (rawN !== 4273) fail(`tcggo incompleto: ${rawN}/4273`);
if (!state.cardsDone) fail("state.cardsDone = false");

// === 2. CATALOG.JS ===
const w = {};
new Function("window", readFileSync("catalog.js", "utf8"))(w);
const ITEMS = w.CATALOG_ITEMS;
const db = JSON.parse(readFileSync("optcg_rarity.json", "utf8"));
console.log("\n=== 2. CATALOG.JS ===");
console.log(`  voci totali: ${ITEMS.length}`);

const carte = ITEMS.filter(i => i.type === "Carta");
const sealed = ITEMS.filter(i => i.type === "Box" || i.type === "Case");

// === 3. FILTRI RARITÀ / SET ===
console.log("\n=== 3. FILTRI (solo rarità ammesse, no Common/Uncommon/ST) ===");
let badRarity = 0, badSet = 0, stLeak = 0, commonLeak = 0;
for (const it of carte) {
  if (BANNED_RAW.has(it.rarity) || /^(Common|Uncommon)$/i.test(it.rarity)) commonLeak++;
  if (!ALLOWED_RARITIES.has(it.rarity)) badRarity++;
  if (/^ST\d/i.test(it.set) || /^ST\d/i.test(it.code)) stLeak++;
  if (it.code && it.set && !it.code.toUpperCase().startsWith(it.set.replace("-", "").substring(0, 3)) && !/^P-\d/i.test(it.code) && !/PRB|World Tour|One Piece Day/i.test(it.code + it.char)) {
    // set/code mismatch soft check
    const setNorm = it.set.replace(/[^A-Z0-9]/gi, "");
    if (!it.code.toUpperCase().includes(setNorm.substring(0, 3)) && !/^P/.test(it.code)) badSet++;
  }
}
if (commonLeak) fail(`Common/Uncommon in catalogo: ${commonLeak}`);
if (stLeak) fail(`Starter Deck in catalogo: ${stLeak}`);
if (badRarity) fail(`Rarità non ammessa: ${badRarity}`);
if (badSet > 5) warn(`Possibile set/code mismatch: ${badSet}`);

// === 4. RARITÀ vs LIMITLESS ===
console.log("\n=== 4. RARITÀ vs LIMITLESS ===");
let rMatch = 0, rWrong = 0, rNoSource = 0, rTcggoOnly = 0;
const wrongSamples = [];
for (const it of carte) {
  const truth = lookupRarity(it, db);
  if (truth) {
    if (it.rarity === truth) rMatch++;
    else { rWrong++; if (wrongSamples.length < 15) wrongSamples.push(`${it.set} ${it.code} ${it.ver || ""} cat=${it.rarity} ok=${truth}`); }
  } else {
    rNoSource++;
    if (it.ver && it.ver !== "V.1") fail(`V.2+ senza Limitless: ${it.set} ${it.code} ${it.ver} → ${it.rarity}`);
    else rTcggoOnly++;
  }
}
console.log(`  match Limitless: ${rMatch}`);
console.log(`  errati (con fonte): ${rWrong}`);
console.log(`  solo tcggo V.1: ${rTcggoOnly}`);
console.log(`  senza fonte: ${rNoSource}`);
if (rTcggoOnly) warn(`V.1 solo tcggo (attesi 0 con filtro Limitless): ${rTcggoOnly}`);
if (rNoSource) fail(`Senza fonte rarità: ${rNoSource}`);
if (rWrong) { fail(`${rWrong} rarità errate vs Limitless`); wrongSamples.forEach(s => console.log("   ·", s)); }

// === 5. LINK / CAMPI ===
console.log("\n=== 5. LINK CARDMARKET & CAMPI ===");
let noUrl = 0, badUrl = 0, noLang = 0, noPrice = 0;
for (const it of ITEMS) {
  if (!it.url) noUrl++;
  else if (!/cardmarket\.com.*\/(Singles|Products)\//i.test(it.url)) badUrl++;
  if (!it.lang) noLang++;
  if (it.cm == null) noPrice++;
}
if (noUrl) fail(`Senza link CM: ${noUrl}`);
if (badUrl) fail(`Link CM malformati: ${badUrl}`);
if (noLang) fail(`Senza lang: ${noLang}`);

// doppioni
const seen = new Map();
let dup = 0;
for (const it of ITEMS) {
  const k = wlKey(it);
  if (seen.has(k) && !(it.type !== "Carta" || /sleeved|pre-errata/i.test(it.char || "") || it.rarity === "DON")) dup++;
  seen.set(k, it);
}
if (dup) fail(`Doppioni wlKey: ${dup}`);

// === 6. SET INCLUSI ===
const sets = [...new Set(ITEMS.map(i => i.set))].sort();
console.log(`\n=== 6. SET (${sets.length}) ===`);
console.log(" ", sets.join(", "));

// === RIEPILOGO ===
console.log("\n" + "=".repeat(50));
if (FAIL.length) {
  console.log("❌ FAIL (" + FAIL.length + "):");
  FAIL.forEach(f => console.log("  ·", f));
} else console.log("✅ NESSUN FAIL CRITICO");
if (WARN.length) {
  console.log("⚠ WARN (" + WARN.length + "):");
  WARN.forEach(w => console.log("  ·", w));
}
console.log(`\nPrezzi: ${ITEMS.length - noPrice}/${ITEMS.length} · Senza prezzo: ${noPrice}`);
process.exit(FAIL.length ? 1 : 0);
