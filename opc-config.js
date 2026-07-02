// Config client OP Central — progetto op-command-deck
window.OPC_CONFIG = {
  supabaseUrl: "https://pozrwrigqusihofeydux.supabase.co",
  syncUrlProd: "https://op-central-sync.onrender.com",
  get syncUrl() {
    const h = typeof location !== "undefined" ? location.hostname : "";
    if (!h || h === "localhost" || h === "127.0.0.1") return `http://${h || "127.0.0.1"}:8778`;
    if (h.endsWith(".onrender.com") && window.OPC_CONFIG.syncUrlProd) return window.OPC_CONFIG.syncUrlProd;
    return window.OPC_CONFIG.syncUrlProd || `http://${h}:8778`;
  },
  auth: {
    // Email precompilata in produzione; password NON nel client (login manuale)
    email: "opcentral@deck.local",
    get password() {
      const h = typeof location !== "undefined" ? location.hostname : "";
      if (h === "localhost" || h === "127.0.0.1") return "OPCentral2026!";
      return "";
    },
  },
};
