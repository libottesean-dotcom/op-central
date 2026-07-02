// Server sync OP Central → op-command-deck (Postgres diretto, niente chiave anon).
// Avvia: node optcg_sync_server.mjs   (porta 8778 in locale, PORT su Render)
import postgres from 'postgres';
import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';

const PORT = Number(process.env.PORT) || 8778;
const HOST = process.env.HOST || "0.0.0.0";
const DATABASE_URL = process.env.DATABASE_URL
  || (existsSync('c:/Users/libot/Desktop/COMMAND DECK/.env')
    ? readFileSync('c:/Users/libot/Desktop/COMMAND DECK/.env', 'utf8').match(/^DATABASE_URL=(.+)$/m)?.[1]
    : null);

if (!DATABASE_URL) { console.error('[sync] DATABASE_URL mancante'); process.exit(1); }

const sql = postgres(DATABASE_URL, { prepare: false, max: 4 });
const sessions = new Map(); // token -> { exp }

function json(res, code, body) {
  res.writeHead(code, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,OPTIONS',
  });
  res.end(JSON.stringify(body));
}

async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return {}; }
}

function auth(req) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : '';
  const s = sessions.get(token);
  if (!s || s.exp < Date.now()) return null;
  return token;
}

async function login(email, password) {
  const rows = await sql`
    SELECT id::text AS id, email
    FROM auth.users
    WHERE email = ${email}
      AND encrypted_password = crypt(${password}, encrypted_password)
    LIMIT 1
  `;
  if (!rows.length) return null;
  const token = randomBytes(32).toString('hex');
  sessions.set(token, { exp: Date.now() + 7 * 24 * 3600 * 1000, user: rows[0].email });
  return token;
}

async function getVault() {
  const rows = await sql`SELECT item_key, bucket, qty, target, paid FROM public.opc_vault_items`;
  const state = {};
  for (const r of rows) {
    state[r.item_key] = {
      bucket: r.bucket || undefined,
      qty: r.qty != null ? r.qty : undefined,
      target: r.target != null ? Number(r.target) : undefined,
      paid: r.paid != null ? Number(r.paid) : undefined,
    };
  }
  return state;
}

async function putVault(items) {
  const rows = [];
  for (const [item_key, val] of Object.entries(items || {})) {
    if (!val || typeof val !== 'object') continue;
    if (!val.bucket && val.qty == null && val.target == null && val.paid == null) continue;
    rows.push({
      item_key,
      bucket: val.bucket || null,
      qty: val.qty != null ? val.qty : 1,
      target: val.target != null ? val.target : null,
      paid: val.paid != null ? val.paid : null,
    });
  }
  if (!rows.length) return 0;
  await sql`
    INSERT INTO public.opc_vault_items ${sql(rows, 'item_key', 'bucket', 'qty', 'target', 'paid')}
    ON CONFLICT (item_key) DO UPDATE SET
      bucket = EXCLUDED.bucket,
      qty = EXCLUDED.qty,
      target = EXCLUDED.target,
      paid = EXCLUDED.paid,
      updated_at = now()
  `;
  return rows.length;
}

createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  if (req.method === 'OPTIONS') return json(res, 204, {});

  try {
    if (req.method === 'POST' && url.pathname === '/auth/login') {
      const body = await readBody(req);
      const token = await login(String(body.email || ''), String(body.password || ''));
      if (!token) return json(res, 401, { error: 'Credenziali non valide' });
      return json(res, 200, { token });
    }

    if (req.method === 'GET' && url.pathname === '/health') {
      return json(res, 200, { ok: true, project: 'op-command-deck' });
    }

    if (!auth(req)) return json(res, 401, { error: 'Non autenticato' });

    if (req.method === 'GET' && url.pathname === '/vault') {
      return json(res, 200, { state: await getVault() });
    }

    if (req.method === 'PUT' && url.pathname === '/vault') {
      const body = await readBody(req);
      const n = await putVault(body.state || body);
      return json(res, 200, { saved: n });
    }

    return json(res, 404, { error: 'Not found' });
  } catch (e) {
    console.error('[sync]', e);
    return json(res, 500, { error: e.message || 'Errore server' });
  }
}).listen(PORT, HOST, () => {
  console.log(`[sync] OP Central sync server → http://${HOST}:${PORT}`);
});
