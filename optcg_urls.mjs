// Audit link Cardmarket di ogni voce in catalog.js.
import { readFileSync, existsSync } from "node:fs";
import { urlFromCmRec, sealedBoosterUrl, boosterBoxUrl } from "./optcg_cmapi.mjs";

const src = readFileSync("catalog.js", "utf8");
const window = {};
new Function("window", src)(window);
const ITEMS = window.CATALOG_ITEMS || [];
const PRICES = existsSync("optcg_prices.json")
  ? JSON.parse(readFileSync("optcg_prices.json", "utf8")).prices || {}
  : {};

let ok = 0, warn = 0, fail = 0;
const issues = [];

for (const it of ITEMS) {
  const id = it.cmId != null ? String(it.cmId) : null;
  const rec = id ? PRICES[id] : null;
  const recOk = rec && (
    it.type !== "Carta" || !it.code || !rec.name || rec.name.includes(it.code)
  );
  const expected = recOk
    ? urlFromCmRec(rec, it.note || null)
    : (it.type === "Box" ? boosterBoxUrl(it.note) : it.type === "Case" ? sealedBoosterUrl(it.char, it.note) : null);

  if (!it.url) {
    fail++;
    issues.push({ level: "FAIL", char: it.char, reason: "url mancante" });
    continue;
  }

  if (/[?&]idProduct=\d+/.test(it.url) && !/\/Singles\/[^/?]+-/.test(it.url)) {
    fail++;
    issues.push({ level: "FAIL", char: it.char, reason: "solo idProduct (rotto su Cardmarket)", url: it.url });
    continue;
  }

  if (/Products\/Search/i.test(it.url)) {
    const level = (it.type === "Case" || it.type === "Box") ? "FAIL" : "WARN";
    if (level === "FAIL") fail++; else warn++;
    issues.push({ level, char: it.char, reason: "fallback ricerca", url: it.url });
    if (level === "WARN") ok++;
    continue;
  }

  if (expected && it.url !== expected) {
    warn++;
    issues.push({ level: "WARN", char: it.char, reason: "slug diverso da API", url: it.url, expected });
  }

  ok++;
}

console.log(`[urls] voci=${ITEMS.length} · OK=${ok} · WARN=${warn} · FAIL=${fail}`);
if (issues.length) {
  console.log("\nPrimi 20 problemi:");
  for (const i of issues.slice(0, 20)) console.log(`  ${i.level} · ${i.char} — ${i.reason}${i.url ? "\n    " + i.url : ""}`);
}
if (fail) process.exit(1);
