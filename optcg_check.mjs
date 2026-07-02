import { readFileSync } from "node:fs";
const cards = Object.values(JSON.parse(readFileSync("optcg_cards_raw.json", "utf8")));

// 1) guarda la carta OP13-118 (Luffy Manga Rare) e altre target con prezzo
const luffy = cards.find(c => c.code === "OP13-118");
console.log("OP13-118:", JSON.stringify(luffy, null, 1));

// 2) distribuzione prezzi low per rarità target
const TARGET = new Set(["LEADER","SECRET RARE","Manga Rare","Alternate Art","Special Rare","SP CARD","Treasure Rare","Promo"]);
const tcards = cards.filter(c => TARGET.has(c.rarity) && c.cm);
const lows = tcards.map(c => c.cm.low).filter(v => v != null).sort((a,b)=>a-b);
console.log("\ntarget con prezzo:", lows.length);
console.log("min", lows[0], "mediana", lows[Math.floor(lows.length/2)], "max", lows[lows.length-1]);
console.log("esempi cari:", tcards.filter(c=>c.cm.low>100).slice(0,5).map(c=>`${c.code} ${c.name} low=${c.cm.low} a7=${c.cm.a7} a30=${c.cm.a30}`));

// 3) test caricamento immagine (referer / hotlink?)
const url = luffy?.image || cards.find(c=>c.image)?.image;
console.log("\nIMG url:", url);
try {
  const r1 = await fetch(url, { method: "GET" });
  console.log("no-referer:", r1.status, r1.headers.get("content-type"), r1.headers.get("content-length"));
} catch(e){ console.log("no-referer err", String(e)); }
try {
  const r2 = await fetch(url, { headers: { Referer: "http://localhost:8777/" } });
  console.log("with-localhost-referer:", r2.status, r2.headers.get("content-type"));
} catch(e){ console.log("ref err", String(e)); }
