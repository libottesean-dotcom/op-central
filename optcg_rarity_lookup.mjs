// Lookup rarità attesa — stessa logica di optcg_catalog.mjs (Limitless + tcggo + cm_id).
import { readFileSync } from "node:fs";
import { cleanRar } from "./optcg_rarity_lib.mjs";

const RARITY_TIER = {
  DON: 0, Rare: 1, Leader: 2, "Super Rare": 3, "Secret Rare": 4,
  "Alt-art": 5, "Special Rare": 6, SP: 6, "Manga Rare": 7, "Treasure Rare": 8, Promo: 3,
};
const tier = r => RARITY_TIER[r] ?? 2;
const normSet = s => (s || "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
const isJP = c => /(-JP\b|\bJP\b)/i.test(c.ccn || "") || /(-JP\b|\bJP\b)/i.test(c.numbered || "");

let _tcggo = null;
let _cmmap = null;

export function loadRarityContext() {
  const cards = Object.values(JSON.parse(readFileSync("optcg_cards_raw.json", "utf8")));
  _cmmap = JSON.parse(readFileSync("optcg_cmmap.json", "utf8")).entries || {};
  _tcggo = new Map();
  for (const c of cards) {
    const r = cleanRar(c.rarity);
    if (!r || r === "Common" || r === "Uncommon") continue;
    _tcggo.set(`${normSet(c.set)}|${c.code}|${c.version || ""}|${isJP(c) ? "JP" : "EN"}`, r);
  }
}

export function expectedRarity(it, db) {
  if (!_tcggo) loadRarityContext();
  const { byCmId, byCodeVer, entries } = db;
  const lang = it.lang || "EN";
  if (it.cmId != null) {
    const ex = Object.values(_cmmap).find(e => e.extra && String(e.en_id) === String(it.cmId));
    if (ex?.rarity) return cleanRar(ex.rarity);
  }
  const cv = `${it.code}|${it.ver || ""}`;
  let fromLim = lang === "JP" && byCodeVer?.[`${cv}|JP`] ? byCodeVer[`${cv}|JP`] : byCodeVer?.[cv];
  if (!fromLim) fromLim = entries?.[`${it.code}|${it.ver || ""}|${lang}`];
  const fromCm = it.cmId != null ? byCmId?.[String(it.cmId)] : null;
  const fromTcg = _tcggo.get(`${normSet(it.set)}|${it.code}|${it.ver || ""}|${lang}`);
  if (fromTcg && fromCm && fromTcg !== fromCm) return fromTcg;
  if (fromLim && fromTcg && fromTcg !== fromLim) {
    if (tier(fromTcg) > tier(fromLim)) return fromTcg;
    if (tier(fromLim) > tier(fromTcg) && fromTcg === "Rare") return fromLim;
    return fromTcg;
  }
  if (fromLim) return fromLim;
  if (fromCm) return fromCm;
  return null;
}
