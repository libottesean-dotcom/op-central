// Stampa TUTTI i campi restituiti dall'API per un prodotto.
const KEY = "ukmIAAcfAwoXZYJNIfwazKW0HPXcb-_3";
const BASE = "https://cardmarketapi.com/api/v1";
const r = await fetch(BASE + "/card/845674?language=japanese", { headers: { "X-API-Key": KEY } });
console.log("HTTP", r.status, "| quota rimasta:", r.headers.get("x-ratelimit-remaining"));
const j = await r.json();
console.log("=== CHIAVI TOP-LEVEL ===");
console.log(Object.keys(j));
console.log("\n=== JSON COMPLETO ===");
console.log(JSON.stringify(j, null, 2));
