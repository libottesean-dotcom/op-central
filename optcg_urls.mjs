// Audit link Cardmarket di ogni voce in catalog.js.
// Controlla: idProduct quando c'è cmId, slug coerente con API, assenza di link vuoti.
import { readFileSync, existsSync } from "node:fs";
import { cmIdUrl, urlFromCmRec } from "./optcg_cmapi.mjs";

const src = readFileSync("catalog.js", "utf8");
const window = {};
new Function("window", src)(window);
const ITEMS = window.CATALOG_ITEMS || [];
const PRICES = existsSync("optcg_prices.json")
  ? JSON.parse(readFileSync("optcg_prices.json", "utf8")).prices || {}
  : {};

const wlKey = it => `${String(it.set || "").replace(/-/g, "")}|${it.code}|${it.ver || ""}|${it.lang || "EN"}`;

let ok = 0, warn = 0, fail = 0;
const issues = [];

for (const it of ITEMS) {
  const key = wlKey(it);
  const id = it.cmId != null ? String(it.cmId) : null;
  const rec = id ? PRICES[id] : null;
  const expected = id ? cmIdUrl(id, it.type) : null;
  const slugFromApi = rec ? urlFromCmRec(rec) : null;

  if (!it.url) {
    fail++;
    issues.push({ level: "FAIL", key, char: it.char, reason: "url mancante" });
    continue;
  }

  if (id) {
    const hasId = it.url.includes(`idProduct=${id}`);
    if (!hasId) {
      fail++;
      issues.push({ level: "FAIL", key, char: it.char, reason: `cmId ${id} ma url senza idProduct`, url: it.url });
      continue;
    }
    if (expected && it.url !== expected) {
      warn++;
      issues.push({ level: "WARN", key, char: it.char, reason: "url idProduct con categoria diversa dall'atteso", url: it.url, expected });
      continue;
    }
  } else if (/Products\/Search/i.test(it.url)) {
    warn++;
    issues.push({ level: "WARN", key, char: it.char, reason: "solo ricerca (no cmId)", url: it.url });
    continue;
  }

  if (slugFromApi && !it.url.includes("idProduct=")) {
    const slugPath = slugFromApi.split("/Products/")[1];
    if (slugPath && !it.url.includes(slugPath.split("?")[0])) {
      warn++;
      issues.push({ level: "WARN", key, char: it.char, reason: "slug diverso da API (idProduct ok se presente)", slugFromApi });
    }
  }

  ok++;
}

console.log(`[urls] voci=${ITEMS.length} · OK=${ok} · WARN=${warn} · FAIL=${fail}`);
if (issues.length) {
  console.log("\nPrimi 30 problemi:");
  for (const i of issues.slice(0, 30)) console.log(`  ${i.level} · ${i.char} (${i.key}) — ${i.reason}${i.url ? "\n    " + i.url : ""}`);
}
if (fail) process.exit(1);
