// Collector ripartibile del catalogo One Piece da cardmarket-api-tcg (RapidAPI).
// Salva i dati grezzi su disco e tiene traccia dell'ultima pagina scaricata,
// così puoi rilanciarlo nei giorni successivi finché non completa (limite 100 req/giorno sul piano free).
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { loadRapidKeys } from "./optcg_rapid.mjs";

const KEYS = loadRapidKeys();
let keyIdx = 0;
const HOST = "cardmarket-api-tcg.p.rapidapi.com";
const base = "https://" + HOST;

const CARDS_FILE = "optcg_cards_raw.json";
const PRODUCTS_FILE = "optcg_products_raw.json";
const EPISODES_FILE = "optcg_episodes_raw.json";
const STATE_FILE = "optcg_state.json";

const load = (f, d) => existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : d;
const save = (f, o) => writeFileSync(f, JSON.stringify(o));
const sleep = ms => new Promise(r => setTimeout(r, ms));

let cards = load(CARDS_FILE, {});      // id -> card (dedupe)
let products = load(PRODUCTS_FILE, {}); // id -> product
let episodes = load(EPISODES_FILE, {}); // id -> episode
let state = load(STATE_FILE, { cardsPage: 1, productsPage: 1, episodesPage: 1, cardsDone: false, productsDone: false, episodesDone: false });

function currentKey() { return KEYS[keyIdx]; }

function rotateKey(reason) {
  if (keyIdx >= KEYS.length - 1) return false;
  keyIdx++;
  console.log(`[build] cambio chiave RapidAPI (${reason}) → key ${keyIdx + 1}/${KEYS.length}`);
  return true;
}

async function get(path) {
  const res = await fetch(base + path, {
    headers: { "x-rapidapi-host": HOST, "x-rapidapi-key": currentKey() },
  });
  const remaining = Number(res.headers.get("x-ratelimit-requests-remaining"));
  let json = null;
  try { json = await res.json(); } catch (e) {}
  return { json, remaining, status: res.status };
}

function trimCard(c) {
  return {
    id: c.id, name: c.name, code: c.card_number || c.card_code_number, rarity: c.rarity,
    ccn: c.card_code_number || null, numbered: c.name_numbered || null, slug: c.slug || null,
    lang: c.language ?? c.lang ?? null, // se l'API lo espone
    color: c.color, version: c.version || null, cm_id: c.cardmarket_id, tcg_id: c.tcgplayer_id,
    cm: c.prices?.cardmarket ? {
      low: c.prices.cardmarket.lowest_near_mint ?? null,
      eu:  c.prices.cardmarket.lowest_near_mint_EU_only ?? null,
      it:  c.prices.cardmarket.lowest_near_mint_IT ?? null,
      fr:  c.prices.cardmarket.lowest_near_mint_FR ?? null,
      de:  c.prices.cardmarket.lowest_near_mint_DE ?? null,
      es:  c.prices.cardmarket.lowest_near_mint_ES ?? null,
      a30: c.prices.cardmarket["30d_average"] ?? null,
      a7:  c.prices.cardmarket["7d_average"] ?? null,
      avail: c.prices.cardmarket.available_items ?? null,
      graded: c.prices.cardmarket.graded ?? null,
    } : null,
    ebay: c.prices?.ebay ?? null,
    tcg: c.prices?.tcg_player?.market_price ?? null,
    set: c.episode?.code || null, setName: c.episode?.name || null,
    released: c.episode?.released_at || null, image: c.image || null,
  };
}
function trimProduct(p) {
  return {
    id: p.id, name: p.name, cm_id: p.cardmarket_id, tcg_id: p.tcgplayer_id,
    cm_low: p.prices?.cardmarket?.lowest ?? null,
    set: p.episode?.code || null, setName: p.episode?.name || null,
    released: p.episode?.released_at || null, image: p.image || p.episode?.logo || null,
  };
}

const MIN_REMAINING = 3; // margine di sicurezza
let stop = false;

console.log(`[build] chiavi RapidAPI: ${KEYS.length}`);

let min429 = 0;
async function pull(kind, file, store, trim, pageKey, doneKey) {
  while (!stop && !state[doneKey]) {
    const page = state[pageKey];
    const { json, remaining, status } = await get(`/one-piece/${kind}?per_page=20&page=${page}`);
    if (status === 429) {
      // limite per-minuto: attendi e riprova la STESSA pagina (senza avanzare)
      if (++min429 > 8) {
        if (rotateKey("429 ripetuti")) { min429 = 0; continue; }
        stop = true; console.log(`[${kind}] troppi 429, mi fermo.`); break;
      }
      console.log(`[${kind}] 429 (limite/minuto) su pagina ${page}, attendo 65s e riprovo...`);
      await sleep(65000);
      continue;
    }
    if (status === 403 || status === 401) {
      if (rotateKey(`HTTP ${status}`)) continue;
      console.log(`[${kind}] stop: auth ${status}`);
      stop = true; break;
    }
    if (status !== 200 || !json || !json.data) {
      console.log(`[${kind}] stop: status ${status}, remaining ${remaining}`);
      stop = true; break;
    }
    min429 = 0;
    json.data.forEach(x => { const t = trim(x); store[t.id] = t; });
    const total = json.paging?.total || page;
    console.log(`[${kind}] pagina ${page}/${total} · elementi tot ${Object.keys(store).length} · quota residua ${remaining} · key ${keyIdx + 1}/${KEYS.length}`);
    if (page >= total) { state[doneKey] = true; }
    else { state[pageKey] = page + 1; }
    save(file, store); save(STATE_FILE, state);
    if (Number.isFinite(remaining) && remaining <= MIN_REMAINING) {
      if (rotateKey("quota giornaliera")) continue;
      stop = true; console.log(`[${kind}] quota esaurita su tutte le chiavi, riprendo domani.`);
    }
    await sleep(2500);
  }
}

// ordine: episodes (piccolo) -> products (piccolo) -> cards (grande)
await pull("episodes", EPISODES_FILE, episodes, e => ({ id: e.id, code: e.code, name: e.name, released: e.released_at, logo: e.logo }), "episodesPage", "episodesDone");
if (!stop) await pull("products", PRODUCTS_FILE, products, trimProduct, "productsPage", "productsDone");
if (!stop) await pull("cards", CARDS_FILE, cards, trimCard, "cardsPage", "cardsDone");

console.log("\n=== RIEPILOGO ===");
console.log("episodes:", Object.keys(episodes).length, state.episodesDone ? "(completo)" : "(parziale)");
console.log("products:", Object.keys(products).length, state.productsDone ? "(completo)" : "(parziale)");
console.log("cards:", Object.keys(cards).length, "/ 4273", state.cardsDone ? "(completo)" : `(parziale, prossima pagina ${state.cardsPage}/214)`);
