// Config client OP Central — progetto op-command-deck
window.OPC_CONFIG = {
  supabaseUrl: "https://pozrwrigqusihofeydux.supabase.co",
  // Sync: stesso host del browser (LAN o localhost), porta 8778
  get syncUrl() {
    const host = (typeof location !== "undefined" && location.hostname) ? location.hostname : "127.0.0.1";
    return `http://${host}:8778`;
  },
  auth: {
    email: "opcentral@deck.local",
    password: "OPCentral2026!",
  },
};
