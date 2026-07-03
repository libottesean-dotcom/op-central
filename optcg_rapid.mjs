// Chiavi RapidAPI (cardmarket-api-tcg). Env: CM_RAPID_KEY oppure CM_RAPID_KEYS=key1,key2,...
import { exit } from "node:process";

export function loadRapidKeys() {
  const fromList = (process.env.CM_RAPID_KEYS || "")
    .split(",")
    .map(s => s.trim())
    .filter(Boolean);
  const single = (process.env.CM_RAPID_KEY || "").trim();
  const keys = fromList.length ? fromList : single ? [single] : [];
  if (!keys.length) {
    console.error("[rapid] CM_RAPID_KEY (o CM_RAPID_KEYS) mancante — aggiungi il secret su GitHub o export locale");
    exit(1);
  }
  return keys;
}
