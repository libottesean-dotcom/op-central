import { createRequire } from 'node:module';
const require = createRequire('c:/Users/libot/Desktop/COMMAND DECK/db/package.json');
const postgres = require('postgres');

const url = process.env.DATABASE_URL;
if (!url) { console.error('DATABASE_URL mancante'); process.exit(1); }
const sql = postgres(url, { prepare: false, max: 1 });

const EMAIL = 'opcentral@deck.local';
const PASSWORD = 'OPCentral2026!';

try {
  // tabelle OP Central (HTML app)
  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS public.opc_vault_items (
      item_key text PRIMARY KEY,
      bucket text CHECK (bucket IN ('none', 'watch', 'coll')),
      qty integer NOT NULL DEFAULT 1 CHECK (qty >= 0),
      target numeric,
      paid numeric CHECK (paid IS NULL OR paid >= 0),
      updated_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS public.opc_price_snapshots (
      snapshot_date date NOT NULL,
      product_id text NOT NULL,
      price_from numeric,
      trend numeric,
      avg30 numeric,
      available integer,
      PRIMARY KEY (snapshot_date, product_id)
    );

    CREATE INDEX IF NOT EXISTS opc_price_snapshots_date_idx ON public.opc_price_snapshots (snapshot_date DESC);

    ALTER TABLE public.opc_vault_items ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.opc_price_snapshots ENABLE ROW LEVEL SECURITY;
  `);

  await sql.unsafe(`
    DROP POLICY IF EXISTS opc_vault_select ON public.opc_vault_items;
    DROP POLICY IF EXISTS opc_vault_insert ON public.opc_vault_items;
    DROP POLICY IF EXISTS opc_vault_update ON public.opc_vault_items;
    DROP POLICY IF EXISTS opc_vault_delete ON public.opc_vault_items;
    DROP POLICY IF EXISTS opc_history_select ON public.opc_price_snapshots;
    DROP POLICY IF EXISTS opc_history_insert ON public.opc_price_snapshots;

    CREATE POLICY opc_vault_select ON public.opc_vault_items FOR SELECT TO authenticated USING (true);
    CREATE POLICY opc_vault_insert ON public.opc_vault_items FOR INSERT TO authenticated WITH CHECK (true);
    CREATE POLICY opc_vault_update ON public.opc_vault_items FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
    CREATE POLICY opc_vault_delete ON public.opc_vault_items FOR DELETE TO authenticated USING (true);
    CREATE POLICY opc_history_select ON public.opc_price_snapshots FOR SELECT TO authenticated USING (true);
    CREATE POLICY opc_history_insert ON public.opc_price_snapshots FOR INSERT TO authenticated WITH CHECK (true);
  `);

  const existing = await sql`
    SELECT id FROM auth.users WHERE email = ${EMAIL} LIMIT 1
  `;

  if (!existing.length) {
    await sql.unsafe(`CREATE EXTENSION IF NOT EXISTS pgcrypto;`);
    const [user] = await sql.unsafe(`
      INSERT INTO auth.users (
        instance_id, id, aud, role, email, encrypted_password,
        email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
        created_at, updated_at, confirmation_token, email_change,
        email_change_token_new, recovery_token, is_sso_user, is_anonymous
      ) VALUES (
        '00000000-0000-0000-0000-000000000000'::uuid,
        gen_random_uuid(),
        'authenticated',
        'authenticated',
        '${EMAIL.replace(/'/g, "''")}',
        crypt('${PASSWORD.replace(/'/g, "''")}', gen_salt('bf')),
        now(),
        '{"provider":"email","providers":["email"]}'::jsonb,
        '{"name":"OP Central Team"}'::jsonb,
        now(), now(), '', '', '', '', false, false
      )
      RETURNING id::text AS id, email
    `);
    await sql.unsafe(`
      INSERT INTO auth.identities (
        id, user_id, identity_data, provider, provider_id,
        last_sign_in_at, created_at, updated_at
      ) VALUES (
        gen_random_uuid(),
        '${user.id}'::uuid,
        '{"sub":"${user.id}","email":"${EMAIL.replace(/"/g, '\\"')}"}'::jsonb,
        'email',
        '${user.id}',
        now(), now(), now()
      )
    `);
    console.log('account creato:', EMAIL);
  } else {
    await sql.unsafe(`
      UPDATE auth.users
      SET encrypted_password = crypt('${PASSWORD.replace(/'/g, "''")}', gen_salt('bf')),
          email_confirmed_at = coalesce(email_confirmed_at, now()),
          updated_at = now()
      WHERE email = '${EMAIL.replace(/'/g, "''")}'
    `);
    console.log('account aggiornato:', EMAIL);
  }

  // prova a leggere chiavi dal vault (se accessibile)
  try {
    const secrets = await sql`
      SELECT name FROM vault.secrets WHERE name IN ('anon_key', 'service_role_key', 'jwt_secret')
    `;
    console.log('vault secrets names:', secrets.map(s => s.name));
  } catch (e) {
    console.log('vault non accessibile (ok)');
  }

  // jwt secret → genera anon key per opc-config.js
  try {
    const jwt = await sql`select current_setting('app.settings.jwt_secret', true) as s`;
    const secret = jwt[0]?.s;
    if (secret) {
      const { createHmac } = await import('node:crypto');
      const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
      const now = Math.floor(Date.now() / 1000);
      const payload = Buffer.from(JSON.stringify({
        iss: 'supabase', ref: 'pozrwrigqusihofeydux', role: 'anon', iat: now, exp: now + 60 * 60 * 24 * 365 * 10,
      })).toString('base64url');
      const sig = createHmac('sha256', secret).update(`${header}.${payload}`).digest('base64url');
      console.log('ANON_KEY', `${header}.${payload}.${sig}`);
    }
  } catch (_) {}

  console.log('OK tabelle + auth');
  console.log('CRED_EMAIL', EMAIL);
  console.log('CRED_PASS', PASSWORD);
} catch (e) {
  console.error(e);
  process.exit(1);
} finally {
  await sql.end();
}
