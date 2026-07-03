import { loadRapidKeys } from "./optcg_rapid.mjs";

const HOST = "cardmarket-api-tcg.p.rapidapi.com";
const base = "https://" + HOST;
const KEY = loadRapidKeys()[0];

async function get(path) {
  const res = await fetch(base + path, {
    headers: { "x-rapidapi-host": HOST, "x-rapidapi-key": KEY },
  });
  const rl = res.headers.get("x-ratelimit-requests-remaining");
  let json = null;
  try { json = await res.json(); } catch (e) { json = { parseError: String(e) }; }
  return { json, rl, status: res.status };
}

// 1) filtro rarità lato server
const r1 = await get("/one-piece/cards?rarity=LEADER&per_page=20&page=1");
console.log("[rarity=LEADER] status", r1.status, "remaining", r1.rl);
console.log("  paging", JSON.stringify(r1.json.paging), "results", r1.json.results);
console.log("  rarities:", JSON.stringify((r1.json.data||[]).reduce((a,c)=>{a[c.rarity]=(a[c.rarity]||0)+1;return a;},{})));

// 2) prova endpoint prodotti/sealed (box/case)
const r2 = await get("/one-piece/products?per_page=20&page=1");
console.log("[products] status", r2.status, "remaining", r2.rl);
if (r2.json && r2.json.data) {
  console.log("  count", r2.json.data.length, "paging", JSON.stringify(r2.json.paging), "results", r2.json.results);
  console.log("  sample:", JSON.stringify((r2.json.data[0]||{})).slice(0,400));
} else {
  console.log("  body:", JSON.stringify(r2.json).slice(0,300));
}
