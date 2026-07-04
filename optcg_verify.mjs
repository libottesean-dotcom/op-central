// Verifica headless di catalog.js: esegue il file come farebbe il browser,
// poi controlla prezzi watchlist, campi del modal, voci JP e dedupe extra.
import { readFileSync } from "node:fs";

const src = readFileSync("catalog.js", "utf8");
const window = {};
new Function("window", src)(window); // stesso effetto di <script src="catalog.js">
const ITEMS = window.CATALOG_ITEMS;
let fail = 0;
const ok = (cond, msg) => { console.log((cond ? "PASS" : "FAIL") + " · " + msg); if (!cond) fail++; };

ok(Array.isArray(ITEMS) && ITEMS.length > 500, `catalog caricato senza errori JS (${ITEMS?.length} voci)`);

// wlKey identico all'HTML
const wlKey = it => {
  const set = String(it.set || "").replace("-", "");
  let code = String(it.code || "").trim(), ver = it.ver || null;
  const m = code.match(/^(.*?)\s+(V\.\d+)$/);
  if (m) { code = m[1]; ver = ver || m[2]; }
  return `${set}|${code}|${ver || ""}`;
};
const find = (set, code, ver, lang) => ITEMS.find(it => wlKey(it) === `${set}|${code}|${ver || ""}` && (!lang || it.lang === lang));

// 1) watchlist EN con campi modal popolati
const ace = find("OP13", "OP13-119", "V.4", "EN");
ok(!!ace, "OP13-119 V.4 EN presente");
if (ace) {
  ok(ace.cm != null && ace.cm !== 1.8, `prezzo aggiornato dall'API: cm=€${ace.cm}`);
  ok(ace.trend != null, `campo modal trend=€${ace.trend}`);
  ok(ace.avg30 != null, `campo modal avg30=€${ace.avg30}`);
  ok(ace.avg5 != null, `campo modal avg5=€${ace.avg5}`);
  ok(ace.available != null, `campo modal available=${ace.available}`);
  ok(Array.isArray(ace.listings) && ace.listings.length > 0 && ace.listings[0].price != null, `listings (${ace.listings?.length}) con price/cond/lang/country`);
  ok(!!ace.fetched_at, `fetched_at=${ace.fetched_at}`);
}

// 2) voce JP gemella con prezzo proprio
const aceJP = find("OP13", "OP13-119", "V.4", "JP");
ok(!!aceJP, "OP13-119 V.4 JP emessa");
if (aceJP) {
  ok(aceJP.cm != null && aceJP.cm !== ace?.cm, `prezzo JP distinto: EN=€${ace?.cm} vs JP=€${aceJP.cm}`);
  ok((aceJP.listings || []).every(l => l.lang === "Japanese"), "inserzioni JP in lingua giapponese");
}
const jpAll = ITEMS.filter(it => it.lang === "JP");
ok(jpAll.length > 0, `voci JP totali nel catalogo: ${jpAll.length}`);

// 2b) le voci JP gemelle usano l'immagine del prodotto GIAPPONESE, non quella EN
const jpTwins = ITEMS.filter(it => it.lang === "JP" && it.type === "Carta" && /cardmarketapi\.com\/cards\/\d+\/image/.test(it.img || ""));
const jpTcggo = ITEMS.filter(it => it.lang === "JP" && it.type === "Carta" && /tcggo/.test(it.img || ""));
ok(jpTwins.length > 0, `voci JP con immagine del prodotto giapponese: ${jpTwins.length} (immagine EN riciclata: ${jpTcggo.length})`);
if (aceJP) ok(/cardmarketapi\.com\/cards\/845679\/image/.test(aceJP.img || ""), `img JP di OP13-119 V.4 punta al prodotto JP 845679: ${aceJP.img}`);

// 3) box/case watchlist con prezzo API
const box1 = ITEMS.find(it => it.set === "OP01" && it.type === "Box");
ok(box1 && box1.trend != null && box1.fetched_at, `OP01 Box prezzata dall'API: cm=€${box1?.cm} trend=€${box1?.trend}`);
const case5 = ITEMS.find(it => it.set === "OP05" && it.type === "Case");
ok(case5 && case5.cm != null && case5.fetched_at, `OP05 Case prezzato dall'API: cm=€${case5?.cm}`);

// 4) extra watchlist emessi in catalog (l'HTML dedup-a le sue copie hardcoded)
for (const [set, code, ver, name] of [
  ["OP09", "OP09-001", "V.1", "Shanks Leader Promo"],
  ["OP09", "OP09-004", "V.4", "Shanks Manga"],
  ["OP05", "OP05-098", null, "Enel 25th"],
  ["OP03", "OP03-122", "V.3", "Sogeking"],
  ["P110", "One Piece Day '25", null, "Luffy LEGO"],
  ["P041", "World Tour 23-24", null, "Luffy P-041"],
]) {
  const it = find(set, code, ver);
  ok(it && it.cm != null && it.fetched_at, `extra ${name}: cm=€${it?.cm} trend=€${it?.trend}`);
}

// 5) doppioni per (wlKey, lang, cmId): JP spesso ha ver=null su più prodotti distinti
const seen = new Map(); let dup = 0;
for (const it of ITEMS) {
  const k = wlKey(it) + "|" + it.lang + (it.cmId ? "|cm" + it.cmId : "");
  if (seen.has(k) && !(it.type !== "Carta" || /sleeved|pre-errata/i.test(it.char || "") || it.rarity === "DON")) dup++;
  seen.set(k, it);
}
ok(dup === 0, `nessun doppione inatteso wlKey+lang (${dup})`);

// 6) link Cardmarket: niente ?idProduct= da solo, slug nel path
let urlBad = 0;
for (const it of ITEMS) {
  if (!it.url) { urlBad++; continue; }
  if (/[?&]idProduct=\d+/.test(it.url) && !/\/Singles\/[^/?]+-/.test(it.url)) urlBad++;
}
ok(urlBad === 0, `link Cardmarket slug ok (${ITEMS.length - urlBad}/${ITEMS.length})`);
const caseSearch = ITEMS.filter(it => it.type === "Case" && /Products\/Search/i.test(it.url || ""));
ok(caseSearch.length === 0, `case senza link ricerca (${caseSearch.length} search fallback)`);
if (case5) ok(!/Products\/Search/i.test(case5.url || ""), `OP05 Case link diretto: ${case5.url}`);

console.log(fail ? `\n${fail} CONTROLLI FALLITI` : "\nTUTTI I CONTROLLI PASSATI");
process.exit(fail ? 1 : 0);
