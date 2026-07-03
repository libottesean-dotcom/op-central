// Trigger esterno per la pipeline giornaliera (Render Cron / cron-job.org / task locale).
// Env: CRON_DISPATCH_TOKEN (PAT con repo + actions), GITHUB_REPOSITORY (owner/repo)
import { exit } from "node:process";

const REPO = process.env.GITHUB_REPOSITORY || "libottesean-dotcom/op-central";
const TOKEN = process.env.CRON_DISPATCH_TOKEN;
const SOURCE = process.env.CRON_SOURCE || "external";

if (!TOKEN) {
  console.error("[cron] CRON_DISPATCH_TOKEN mancante");
  exit(1);
}

const [owner, repo] = REPO.split("/");
const headers = {
  Authorization: `Bearer ${TOKEN}`,
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
};

const romeToday = () => new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Rome" });
const runDay = run =>
  new Date(run.created_at).toLocaleDateString("en-CA", { timeZone: "Europe/Rome" });

/** Run nella finestra giornaliera 04:30–23:59 (Roma) — esclude trigger manuali notturni. */
const isDailyWindowRun = run => {
  const t = new Date(run.created_at);
  if (runDay(run) !== romeToday()) return false;
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Rome",
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  }).formatToParts(t);
  const h = Number(parts.find(p => p.type === "hour")?.value || 0);
  const m = Number(parts.find(p => p.type === "minute")?.value || 0);
  return h > 4 || (h === 4 && m >= 30);
};

async function listRuns() {
  const url = `https://api.github.com/repos/${owner}/${repo}/actions/workflows/optcg-daily.yml/runs?per_page=15`;
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`list runs HTTP ${res.status}: ${await res.text()}`);
  return (await res.json()).workflow_runs || [];
}

async function dispatch() {
  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/dispatches`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ event_type: "daily-run", client_payload: { source: SOURCE } }),
  });
  if (res.status !== 204) throw new Error(`dispatch HTTP ${res.status}: ${await res.text()}`);
}

const today = romeToday();
const runs = await listRuns();

if (runs.some(r => runDay(r) === today && r.status === "in_progress")) {
  console.log(`[cron] Pipeline già in corso (${today}) — skip`);
  exit(0);
}
if (runs.some(r => isDailyWindowRun(r) && r.status === "completed" && r.conclusion === "success")) {
  console.log(`[cron] Pipeline già OK oggi (${today}, finestra 04:30+ Roma) — skip`);
  exit(0);
}

await dispatch();
console.log(`[cron] Dispatched daily-run (${SOURCE}) → optcg-daily via repository_dispatch`);
