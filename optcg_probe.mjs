// Segue i link "external/cm" delle due versioni per vedere il prodotto Cardmarket reale (lingua).
const links = [
  ["V.4", "https://www.tcggo.com/external/cm/28320"],
  ["V.5", "https://www.tcggo.com/external/cm/28323"],
];

for (const [ver, u] of links) {
  try {
    const r = await fetch(u, { headers: { "user-agent": "Mozilla/5.0" }, redirect: "follow" });
    console.log("===", ver, "===");
    console.log(" URL finale:", r.url);
    console.log(" status:", r.status);
    // prova a leggere il titolo/nome prodotto dalla pagina Cardmarket
    const h = await r.text();
    const title = (h.match(/<title>([^<]+)<\/title>/i) || [])[1];
    console.log(" title:", title ? title.trim().slice(0, 140) : "(nessuno)");
  } catch (e) {
    console.log("ERR", ver, e.message);
  }
}
