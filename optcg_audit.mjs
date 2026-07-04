// Audit completo catalog.js — link Cardmarket, campi, rarità, set, prezzi, doppioni.
import { readFileSync, existsSync } from "node:fs";
import { expectedRarity, loadRarityContext } from "./optcg_rarity_lookup.mjs";

loadRarityContext();

const src = readFileSync("catalog.js", "utf8");
const window = {};
new Function("window", src)(window);
const ITEMS = window.CATALOG_ITEMS;

const RARITY_DB = existsSync("optcg_rarity.json") ? JSON.parse(readFileSync("optcg_rarity.json", "utf8")) : {};
const CMMAP = existsSync("optcg_cmmap.json") ? JSON.parse(readFileSync("optcg_cmmap.json", "utf8")).entries || {} : {};
const STATE = existsSync("optcg_state.json") ? JSON.parse(readFileSync("optcg_state.json", "utf8")) : {};

const wlKey = it => {
  const set = String(it.set || "").replace("-", "");
  let code = String(it.code || "").trim(), ver = it.ver || null;
  const m = code.match(/^(.*?)\s+(V\.\d+)$/);
  if (m) { code = m[1]; ver = ver || m[2]; }
  return `${set}|${code}|${ver || ""}`;
};

const issues = [];
const warn = [];
const note = (msg) => note._list.push(msg);
note._list = [];

const CM_URL = /^https:\/\/(www\.)?cardmarket\.com\/(en|it|de|fr|es)\/OnePiece\//i;
const CM_SLUG_OK = /\/(Singles|Products)\/[^/?#]+\/[^/?#]+/i;
const CM_SEARCH_BAD = /Products\/Search/i;

for (const it of ITEMS) {
  const id = `${it.lang} ${it.set} ${it.code} ${it.ver || ""} · ${it.char}`;
  if (!it.set) issues.push({ id, field: "set", msg: "mancante" });
  if (!it.code && it.type === "Carta") issues.push({ id, field: "code", msg: "mancante" });
  if (!it.char) issues.push({ id, field: "char", msg: "mancante" });
  if (!it.type) issues.push({ id, field: "type", msg: "mancante" });
  if (!it.lang) issues.push({ id, field: "lang", msg: "mancante" });
  if (it.type === "Carta" && !it.rarity) warn.push({ id, field: "rarity", msg: "vuota" });
  if (!it.url) issues.push({ id, field: "url", msg: "link Cardmarket mancante" });
  else {
    if (!CM_URL.test(it.url)) issues.push({ id, field: "url", msg: `dominio/path non valido: ${it.url.slice(0, 80)}` });
    if (!CM_SLUG_OK.test(it.url)) issues.push({ id, field: "url", msg: `slug mancante: ${it.url.slice(0, 100)}` });
    if (/[?&]idProduct=\d+/.test(it.url) && !CM_SLUG_OK.test(it.url)) issues.push({ id, field: "url", msg: "solo idProduct senza slug" });
    if (it.type === "Case" && CM_SEARCH_BAD.test(it.url)) issues.push({ id, field: "url", msg: "Case con link Search" });
  }
  if (it.cm == null) warn.push({ id, field: "cm", msg: "prezzo n/d" });
  if (it.cm != null && it.fetched_at == null && it.type === "Carta") warn.push({ id, field: "fetched_at", msg: "prezzo senza timestamp API" });
}

// doppioni wlKey+lang
const seen = new Map();
let dupUnexpected = 0;
for (const it of ITEMS) {
  const k = wlKey(it) + "|" + it.lang;
  if (seen.has(k) && !(it.type !== "Carta" || /sleeved|pre-errata/i.test(it.char || "") || it.rarity === "DON")) dupUnexpected++;
  seen.set(k, it);
}

// rarità vs atteso (Limitless + tcggo + cm_id)
const cards = ITEMS.filter(c => c.type === "Carta");
let enRarityErr = 0, jpRarityErr = 0, noSource = 0;
const enBad = [], jpBad = [];
for (const it of cards) {
  const truth = expectedRarity(it, RARITY_DB);
  if (!truth) { noSource++; continue; }
  if (it.rarity !== truth) {
    if (it.lang === "JP") { jpRarityErr++; if (jpBad.length < 10) jpBad.push(`${it.code} ${it.ver || ""}: cat=${it.rarity} att=${truth}`); }
    else { enRarityErr++; if (enBad.length < 10) enBad.push(`${it.set} ${it.code} ${it.ver || ""}: cat=${it.rarity} att=${truth}`); }
  }
}

const withCm = ITEMS.filter(i => i.cm != null).length;
const withUrl = ITEMS.filter(i => i.url).length;
const withImg = ITEMS.filter(i => i.img).length;
const withHistory = ITEMS.filter(i => Array.isArray(i.history) && i.history.length >= 2).length;
const sets = [...new Set(ITEMS.map(i => i.set))].sort();
const byType = Object.fromEntries(["Carta", "Box", "Case"].map(t => [t, ITEMS.filter(i => i.type === t).length]));

console.log("=== AUDIT COMPLETO OP CENTRAL ===\n");
console.log("Catalogo:", ITEMS.length, "voci");
console.log("  Carte:", byType.Carta, "| Box:", byType.Box, "| Case:", byType.Case);
console.log("  EN:", ITEMS.filter(i => i.lang === "EN").length, "| JP:", ITEMS.filter(i => i.lang === "JP").length);
console.log("  Set:", sets.length, "→", sets.join(", "));
console.log("  Prezzo cm:", withCm, "/", ITEMS.length, `(${Math.round(1000 * withCm / ITEMS.length) / 10}%)`);
console.log("  Link Cardmarket:", withUrl, "/", ITEMS.length);
console.log("  Immagine:", withImg, "/", ITEMS.length);
console.log("  Storico ≥2gg:", withHistory);
console.log("\ntcggo raw:", existsSync("optcg_cards_raw.json") ? Object.keys(JSON.parse(readFileSync("optcg_cards_raw.json"))).length + "/4273" : "n/d");
console.log("  pagina:", STATE.cardsPage, "/214 · cardsDone:", STATE.cardsDone);

console.log("\n--- ERRORI (bloccanti) ---");
console.log("  Campi/url invalidi:", issues.length);
console.log("  Doppioni inattesi:", dupUnexpected);
console.log("  Rarità EN errate:", enRarityErr);
console.log("  Rarità JP errate:", jpRarityErr);
console.log("  Senza fonte rarità:", noSource);

if (issues.length) {
  console.log("\n  Primi 15 errori url/campi:");
  for (const e of issues.slice(0, 15)) console.log("   ·", e.field, e.id, "→", e.msg);
}
if (enBad.length) console.log("\n  EN rarità:", enBad.join("\n    "));
if (jpBad.length) console.log("\n  JP rarità:", jpBad.join("\n    "));

console.log("\n--- AVVISI (non bloccanti) ---");
console.log("  Senza prezzo:", warn.filter(w => w.field === "cm").length);
console.log("  Senza rarità:", warn.filter(w => w.field === "rarity").length);

const ok = issues.length === 0 && dupUnexpected === 0 && enRarityErr === 0 && jpRarityErr === 0 && noSource === 0;
console.log(ok ? "\n✅ AUDIT OK — tutto coerente" : `\n❌ AUDIT: ${issues.length + dupUnexpected + enRarityErr + jpRarityErr} problemi`);
process.exit(ok ? 0 : 1);
