// Audit rarità catalog vs atteso (Limitless + tcggo + cm_id)
import { readFileSync } from "node:fs";
import { expectedRarity, loadRarityContext } from "./optcg_rarity_lookup.mjs";

loadRarityContext();
const db = JSON.parse(readFileSync("optcg_rarity.json", "utf8"));
const cat = JSON.parse(readFileSync("catalog.js", "utf8").replace(/^[\s\S]*?\[/, "[").replace(/\];[\s\S]*$/, "]"));
const CMMAP = JSON.parse(readFileSync("optcg_cmmap.json", "utf8")).entries || {};
const cards = cat.filter(c => c.type === "Carta");

let ok = 0, bad = [], noSource = 0;
for (const it of cards) {
  const truth = expectedRarity(it, db);
  if (!truth) { noSource++; continue; }
  if (it.rarity === truth) ok++;
  else bad.push({ code: it.code, ver: it.ver, set: it.set, lang: it.lang, cat: it.rarity, truth });
}

const en = cards.filter(c => c.lang === "EN" && c.ver);
const jp = cards.filter(c => c.lang === "JP");

const noSourceEn = cards.filter(c => c.lang === "EN" && !expectedRarity(c, db)).length;
const noSourceJp = cards.filter(c => c.lang === "JP" && !expectedRarity(c, db)).length;

console.log("=== AUDIT RARITÀ ===");
console.log("Carte:", cards.length, "| match:", ok, "| ERR:", bad.length, "| no fonte EN:", noSourceEn, "| no fonte JP:", noSourceJp);
console.log("EN con ver:", en.length, "| JP:", jp.length);
if (bad.length) console.log("Errori (max 15):", bad.slice(0, 15));

const empty = cards.filter(c => !c.rarity);
console.log("Rarità vuote:", empty.length);

const jpIds = new Set(Object.values(CMMAP).map(e => e.jp_id).filter(Boolean));
const jpInDb = [...jpIds].filter(id => db.byCmId[String(id)]).length;
console.log("JP cmmap ids con rarità:", jpInDb, "/", jpIds.size);

// Fallisce solo se rarità SBAGLIATA o EN senza fonte. JP eredita rarità EN: ok senza Limitless.
process.exit(bad.length || noSourceEn || empty.length ? 1 : 0);
