import { readFileSync } from "node:fs";
const cards = Object.values(JSON.parse(readFileSync("optcg_cards_raw.json", "utf8")));
const products = Object.values(JSON.parse(readFileSync("optcg_products_raw.json", "utf8")));
const episodes = Object.values(JSON.parse(readFileSync("optcg_episodes_raw.json", "utf8")));

console.log("=== RARITÀ nelle carte scaricate (", cards.length, ") ===");
const rar = {};
cards.forEach(c => { rar[c.rarity] = (rar[c.rarity] || 0) + 1; });
Object.entries(rar).sort((a,b)=>b[1]-a[1]).forEach(([k,v]) => console.log(`  ${v}\t${k}`));

console.log("\n=== SET presenti (codici) ===");
console.log([...new Set(cards.map(c => c.set))].join(", "));

console.log("\n=== PRODUCTS (147) — nomi (per capire Box/Case/Deck) ===");
products.slice(0, 40).forEach(p => console.log(`  [${p.set}] ${p.name}`));
console.log("  ... (mostrati 40 su", products.length, ")");

console.log("\n=== OP17 presente? ===");
console.log("episodi OP17:", episodes.filter(e => /OP.?17|world's strongest/i.test(e.code + " " + e.name)).map(e=>e.code+" "+e.name));
console.log("products OP17:", products.filter(p => /OP.?17/i.test((p.set||"")+" "+p.name)).map(p=>p.name));

console.log("\n=== esempio carta con prezzo ===");
const wp = cards.find(c => c.cm && c.cm.low != null);
console.log(JSON.stringify(wp, null, 1));
