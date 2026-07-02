// Audit rarità catalog vs optcg_rarity.json
import { readFileSync } from "node:fs";

const db = JSON.parse(readFileSync("optcg_rarity.json", "utf8"));
const cat = JSON.parse(readFileSync("catalog.js", "utf8").replace(/^[\s\S]*?\[/, "[").replace(/\];[\s\S]*$/, "]"));
const CMMAP = JSON.parse(readFileSync("optcg_cmmap.json", "utf8")).entries || {};
const cards = cat.filter(c => c.type === "Carta");

const en = cards.filter(c => c.lang === "EN" && c.ver);
const jp = cards.filter(c => c.lang === "JP");

let enOk = 0, enMiss = 0, enNoTruth = 0, enBad = [];
for (const it of en) {
  const truth = it.cmId && db.byCmId[String(it.cmId)]
    ? db.byCmId[String(it.cmId)]
    : (db.byCodeVer[`${it.code}|${it.ver}`] || db.entries[`${it.code}|${it.ver}|EN`]);
  if (!truth) { enNoTruth++; continue; }
  if (it.rarity === truth) enOk++;
  else enBad.push({ code: it.code, ver: it.ver, cmId: it.cmId, cat: it.rarity, truth });
}
for (const it of en.filter(c => !c.ver)) {
  const truth = db.byCodeVer[`${it.code}|`] || db.entries[`${it.code}||EN`];
  if (truth && it.rarity !== truth) enBad.push({ code: it.code, ver: null, cat: it.rarity, truth });
}

let jpOk = 0, jpMiss = 0, jpNoId = 0, jpBad = [];
for (const it of jp) {
  if (!it.cmId) { jpNoId++; continue; }
  const truth = db.byCmId[String(it.cmId)];
  if (!truth) { jpMiss++; continue; }
  if (it.rarity === truth) jpOk++;
  else jpBad.push({ code: it.code, ver: it.ver, cmId: it.cmId, cat: it.rarity, truth });
}

console.log("=== AUDIT RARITÀ ===");
console.log("EN con ver:", en.length, "| match:", enOk, "| no fonte:", enNoTruth, "| ERR:", enBad.length);
console.log("JP:", jp.length, "| match byCmId:", jpOk, "| no fonte:", jpMiss, "| no cmId:", jpNoId, "| ERR:", jpBad.length);
if (enBad.length) console.log("EN errori (max 15):", enBad.slice(0, 15));
if (jpBad.length) console.log("JP errori (max 15):", jpBad.slice(0, 15));

const empty = cards.filter(c => !c.rarity);
console.log("Rarità vuote:", empty.length, empty.map(c => `${c.lang} ${c.code} ${c.ver || ""}`));

const jpIds = new Set(Object.values(CMMAP).map(e => e.jp_id).filter(Boolean));
const jpInDb = [...jpIds].filter(id => db.byCmId[String(id)]).length;
console.log("JP cmmap ids con rarità:", jpInDb, "/", jpIds.size);
