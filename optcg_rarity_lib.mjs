// Parsing Limitless TCG card pages → rarità per code + V.n (Cardmarket).
// Usato da optcg_rarity.mjs (build cache) e optcg_catalog.mjs (lookup).

export const RLABEL = {
  LEADER: "Leader",
  "SECRET RARE": "Secret Rare",
  "Secret Rare": "Secret Rare",
  "Manga Rare": "Manga Rare",
  "Alternate Art": "Alt-art",
  "Special Rare": "Special Rare",
  "SP CARD": "SP",
  "Treasure Rare": "Treasure Rare",
  Promo: "Promo",
  "SUPER RARE": "Super Rare",
  "Super Rare": "Super Rare",
  rare: "Rare",
  Rare: "Rare",
  Common: "Common",
  Uncommon: "Uncommon",
  "DON!!": "DON",
  Special: "Special Rare",
  SP: "SP",
};

export const cleanRar = r => RLABEL[r] || r || "";

export const limitlessKey = (code, ver, lang = "EN") =>
  `${code}|${ver || ""}|${lang}`;

const verFromSlug = (slug, hrefV) => {
  const m = /-V(\d+)$/i.exec(slug || "");
  if (m) return `V.${m[1]}`;
  if (hrefV != null && hrefV !== "") return `V.${Number(hrefV) + 1}`;
  return null;
};

const codeFromSlug = slug => {
  if (!slug) return null;
  const p = slug.match(/(P-\d+)/i);
  if (p) return p[1].toUpperCase();
  const m = slug.match(/((?:OP|EB|ST|PRB)\d+-\d+)/i);
  return m ? m[1].toUpperCase() : null;
};

const normBase = s =>
  s.replace(/\s+/g, " ").trim();

function rarityFromPrint(baseRarity, suffix, tcgPath = "") {
  const s = (suffix || "").trim().toLowerCase();
  if (s === "jr") return baseRarity || "Promo"; // artefatto HTML Limitless su alcune promo
  const p = (tcgPath || "").toLowerCase();
  if (!s) return baseRarity;
  if (s === "aa") return "Alt-art";
  if (s === "manga") return "Manga Rare";
  if (s === "wanted") return "Special Rare";
  if (s === "sp") return "SP";
  if (s === "serial") return "Treasure Rare";
  if (/wanted-poster/.test(p)) return "Special Rare";
  if (/parallel|alternate-art/.test(p)) return "Alt-art";
  if (/manga|super-alternate-art|red-super/.test(p)) return "Manga Rare";
  if (/\bsp\b|special-rare/.test(p)) return "Special Rare";
  return baseRarity;
}

/** Estrae stampe EN dalla pagina Limitless (tabella card-prints-versions). */
export function parseLimitlessHtml(html) {
  const baseMatch = html.match(
    /card-prints-current[\s\S]*?<span>\s*([^<]+?)\s*<\/span>\s*<\/div>/,
  );
  const baseRarity = cleanRar(normBase(baseMatch?.[1] || ""));

  const entries = []; // { code, ver, rarity, slug, suffix, setLabel }
  const rowChunks = html.split(/<tr[\s>]/).slice(1);
  for (const row of rowChunks) {
    if (!row.includes("prints-table-card-number")) continue;
    const suffix = (row.match(/prints-table-card-number">([^<]*)/) || [])[1]?.trim() ?? "";
    const slug = (row.match(/Singles\/[^/]+\/([^?"\s<]+)/) || [])[1];
    if (!slug) continue;
    const code = codeFromSlug(slug);
    if (!code) continue;
    const hrefV = (row.match(/\/cards(?:\/jp)?\/[^"?]+\?v=(\d+)/) || [])[1];
    const ver = verFromSlug(slug, hrefV);
    const tcgPath = (row.match(/tcgplayer\.com[^"]*\/product\/\d+\/([^"]+)/) || [])[1] || "";
    const setLabel = (row.match(/<td>\s*<a[^>]*>\s*([^<\n]+)/) || [])[1]?.trim() || "";
    let rarity = rarityFromPrint(baseRarity, suffix, tcgPath);
    if (!rarity && /promo|event pack|championship|best vol|tournament|participation|regional|prize/i.test(setLabel))
      rarity = "Promo";
    if (!rarity && !suffix && baseRarity) rarity = baseRarity;
    if (!ver) continue;
    entries.push({ code, ver, rarity, slug, suffix, setLabel });
  }

  // dedupe per code|ver (teniamo la prima stampa del set principale, non Prize Cards senza prezzo)
  const byKey = new Map();
  for (const e of entries) {
    const k = `${e.code}|${e.ver || ""}`;
    const prev = byKey.get(k);
    if (!prev) { byKey.set(k, e); continue; }
    // preferisci riga con link Cardmarket / prezzo
    if (/Prize Cards/i.test(prev.setLabel) && !/Prize Cards/i.test(e.setLabel)) byKey.set(k, e);
  }
  return { baseRarity, entries: [...byKey.values()] };
}

export function entriesToMaps(entries, lang = "EN") {
  const byKey = {};
  const byCodeVer = {};
  for (const e of entries) {
    if (!e.code || !e.ver) continue;
    const k = limitlessKey(e.code, e.ver, lang);
    byKey[k] = e.rarity;
    if (lang === "JP") byCodeVer[`${e.code}|${e.ver}|JP`] = e.rarity;
    else byCodeVer[`${e.code}|${e.ver}`] = e.rarity;
  }
  return { byKey, byCodeVer };
}

/** Estrae il card number Limitless da record tcggo/catalogo. */
export function limitlessCodeOf(c) {
  const code = String(c.code || "").trim();
  if (/^(P-\d+|OP\d+-\d+|EB\d+-\d+|ST\d+-\d+|PRB\d+-\d+)$/i.test(code)) {
    return code.toUpperCase().replace(/^OP(\d)-/, "OP$1-");
  }
  const ccn = String(c.ccn || c.note || "").trim();
  const fromCcn = ccn.match(/\b(P-\d+|OP\d+-\d+|EB\d+-\d+|ST\d+-\d+|PRB\d+-\d+)\b/i);
  if (fromCcn) return fromCcn[1].toUpperCase();
  return null;
}
