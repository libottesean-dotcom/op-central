// Alert Telegram: movimenti watchlist oltre soglia % (dopo aggiornamento prezzi).
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire("c:/Users/libot/Desktop/COMMAND DECK/db/package.json");
const postgres = require("postgres");

const CONFIG_FILE = "optcg_config.json";
const cfg = existsSync(CONFIG_FILE) ? JSON.parse(readFileSync(CONFIG_FILE, "utf8")) : {};
const tg = cfg.telegram || {};
if (!tg.enabled || !tg.bot_token || !tg.chat_id) {
  console.log("[telegram] disabilitato o token/chat_id mancanti in optcg_config.json");
  process.exit(0);
}

const THRESH = Number(tg.threshold_pct) || 10;
const DATABASE_URL = process.env.DATABASE_URL
  || (existsSync("c:/Users/libot/Desktop/COMMAND DECK/.env")
    ? readFileSync("c:/Users/libot/Desktop/COMMAND DECK/.env", "utf8").match(/^DATABASE_URL=(.+)$/m)?.[1]
    : null);

// carica catalogo per nomi
let ITEMS = [];
if (existsSync("catalog.js")) {
  const src = readFileSync("catalog.js", "utf8");
  const m = src.match(/window\.CATALOG_ITEMS\s*=\s*(\[[\s\S]*\]);/);
  if (m) ITEMS = Function(`return ${m[1]}`)();
}
const idOf = it => `${it.set}|${it.code}|${it.char}|${it.lang}|${it.ver || ""}`;
const byKey = new Map(ITEMS.map(it => [idOf(it), it]));

// storico: ultimi 2 snapshot
const HIST_DIR = "optcg_history";
const histFiles = existsSync(HIST_DIR)
  ? readdirSync(HIST_DIR).filter(f => f.endsWith(".json")).sort().slice(-2)
  : [];
if (histFiles.length < 2) {
  console.log("[telegram] servono almeno 2 giorni di storico, skip");
  process.exit(0);
}
const prev = JSON.parse(readFileSync(`${HIST_DIR}/${histFiles[0]}`, "utf8"));
const curr = JSON.parse(readFileSync(`${HIST_DIR}/${histFiles[1]}`, "utf8"));

function px(rec) { return rec?.trend ?? rec?.from ?? null; }

async function main() {
  if (!DATABASE_URL) { console.log("[telegram] DATABASE_URL assente"); process.exit(0); }
  const sql = postgres(DATABASE_URL, { prepare: false, max: 1 });
  try {
    const wl = await sql`SELECT item_key FROM public.opc_vault_items WHERE bucket = 'watch'`;
    const alerts = [];
    for (const { item_key } of wl) {
      const it = byKey.get(item_key);
      if (!it?.cmId) continue;
      const id = String(it.cmId);
      const p0 = px(prev.prices?.[id]);
      const p1 = px(curr.prices?.[id]);
      if (p0 == null || p1 == null || p0 <= 0) continue;
      const pct = ((p1 - p0) / p0) * 100;
      if (Math.abs(pct) < THRESH) continue;
      const name = it.char || it.code;
      const lang = it.lang === "JP" ? " (JP)" : "";
      const sign = pct >= 0 ? "+" : "";
      alerts.push(`${sign}${pct.toFixed(1)}% · ${name}${lang} · ${it.code} · €${Math.round(p1).toLocaleString("it-IT")}`);
    }
    if (!alerts.length) { console.log("[telegram] nessun movimento oltre soglia"); return; }
    const text = `📊 OP Central · Watchlist\n\n${alerts.slice(0, 15).join("\n")}`;
    const url = `https://api.telegram.org/bot${tg.bot_token}/sendMessage`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: tg.chat_id, text }),
    });
    const data = await res.json();
    if (!data.ok) console.warn("[telegram] errore API:", data.description);
    else console.log(`[telegram] inviati ${alerts.length} alert`);
  } finally {
    await sql.end();
  }
}

main().catch(e => { console.error("[telegram]", e); process.exit(1); });
