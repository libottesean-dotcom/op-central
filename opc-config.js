// Config client OP Central — progetto op-command-deck
window.OPC_CONFIG = {
  supabaseUrl: "https://pozrwrigqusihofeydux.supabase.co",
  // Locale: sync sulla stessa macchina. Produzione Render: vedi syncUrlProd sotto.
  syncUrlProd: "https://op-central-sync.onrender.com",
  get syncUrl() {
    const h = typeof location !== "undefined" ? location.hostname : "";
    if (!h || h === "localhost" || h === "127.0.0.1") return `http://${h || "127.0.0.1"}:8778`;
    if (h.endsWith(".onrender.com") && window.OPC_CONFIG.syncUrlProd) return window.OPC_CONFIG.syncUrlProd;
    return window.OPC_CONFIG.syncUrlProd || `http://${h}:8778`;
  },
  auth: {
    email: "opcentral@deck.local",
    password: "OPCentral2026!",
  },
};