// Carica lo snapshot giornaliero (optcg_history/) in opc_price_snapshots su op-command-deck.
import { readFileSync, existsSync, readdirSync } from "node:fs";
import postgres from "postgres";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) { console.log("[history-db] DATABASE_URL assente, skip"); process.exit(0); }

const HIST_DIR = "optcg_history";
if (!existsSync(HIST_DIR)) { console.log("[history-db] nessuna cartella optcg_history, skip"); process.exit(0); }

const today = new Date().toISOString().slice(0, 10);
const file = `${HIST_DIR}/${today}.json`;
if (!existsSync(file)) {
  const files = readdirSync(HIST_DIR).filter(f => f.endsWith(".json")).sort();
  if (!files.length) { console.log("[history-db] nessuno snapshot, skip"); process.exit(0); }
  console.log(`[history-db] snapshot di oggi assente, uso ultimo: ${files.at(-1)}`);
}
const snapFile = existsSync(file) ? file : `${HIST_DIR}/${readdirSync(HIST_DIR).filter(f => f.endsWith(".json")).sort().at(-1)}`;
const snap = JSON.parse(readFileSync(snapFile, "utf8"));
const prices = snap.prices || {};
const ids = Object.keys(prices);
if (!ids.length) { console.log("[history-db] snapshot vuoto"); process.exit(0); }

const sql = postgres(DATABASE_URL, { prepare: false, max: 1 });
try {
  const rows = ids.map(id => ({
    snapshot_date: snap.date,
    product_id: id,
    price_from: prices[id].from ?? null,
    trend: prices[id].trend ?? null,
    avg30: prices[id].avg30 ?? null,
    available: prices[id].available ?? null,
  }));
  let n = 0;
  for (let i = 0; i < rows.length; i += 200) {
    const batch = rows.slice(i, i + 200);
    await sql`
      INSERT INTO public.opc_price_snapshots ${sql(batch, "snapshot_date", "product_id", "price_from", "trend", "avg30", "available")}
      ON CONFLICT (snapshot_date, product_id) DO UPDATE SET
        price_from = EXCLUDED.price_from,
        trend = EXCLUDED.trend,
        avg30 = EXCLUDED.avg30,
        available = EXCLUDED.available
    `;
    n += batch.length;
  }
  console.log(`[history-db] ${n} righe salvate per ${snap.date} (da ${snapFile})`);
} finally {
  await sql.end();
}
