// Axiom — the phone's own app. Runs INSIDE Termux beside the brain and serves
// a chat window + live work log on the phone's loopback, so it works with or
// without the cable. The laptop's hourly shift posts its verdicts to
// /api/shift-report over the forwarded port; everything else is on-device.
import { createServer } from "node:http";
import { appendFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import { execSync } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";
const OWNER = process.env.OWNER_NAME || "the owner";

const PORT = 8090;
const BRAIN = "http://127.0.0.1:18081";
const DATA = join(homedir(), ".axiom-app");
mkdirSync(DATA, { recursive: true });
const SHIFTS = join(DATA, "shift-log.ndjson");
const WATCHES = join(DATA, "watch-log.ndjson");
const CHATS = join(DATA, "chat-log.ndjson");

const PROBLEMS = join(DATA, "problems-log.ndjson"); // live feed of bugs/problems being worked, posted by the laptop as it works
const MORNING = join(DATA, "morning-log.ndjson"); // Axiom's morning line: one checked paragraph a day, posted by the laptop's axiom-morning face

// --- keep-warm + memory health (measured 2026-09-02 after a phone restart: Samsung's reclaimer swapped
// 2.7 GB of the idle brain's weights to storage and three real requests did not bring them back; prompt
// speed fell 3x). Every answer touches every weight, so a one-word ask every few minutes while idle keeps
// the weights "recently used" and the reclaimer takes colder pages instead. The panel shows the truth.
const WARM_EVERY_MS = 5 * 60 * 1000;
let lastChatAt = 0;
let warm = { last: null, ms: null, ok: null };
async function keepWarm() {
  if (Date.now() - lastChatAt < WARM_EVERY_MS) return; // real chats keep it warm; do not disturb their cache
  const t0 = Date.now();
  try {
    const r = await fetch(BRAIN + "/v1/chat/completions", {
      method: "POST", headers: { "content-type": "application/json" }, signal: AbortSignal.timeout(180000),
      body: JSON.stringify({ messages: [{ role: "system", content: SYSTEM_PROMPT }, { role: "user", content: "/no_think Reply with the single word: warm." }], max_tokens: 2, temperature: 0 }),
    });
    warm = { last: new Date().toISOString(), ms: Date.now() - t0, ok: r.ok };
  } catch { warm = { last: new Date().toISOString(), ms: Date.now() - t0, ok: false }; }
  console.log(`[axiom-app] keep-warm ${warm.ok ? "ok" : "FAILED"} in ${warm.ms} ms`);
}
// Re-warm on detect (2026-09-02, seen on the panel: 0.6 GB pushed out one minute after a heartbeat while the
// owner was using the phone). A fixed cadence cannot beat an active reclaimer; checking every minute and
// warming the moment anything is swapped out — while idle — means the next real question never pays for it.
// Bytes swapped is NOT the alarm: the model's word table (150k rows, a few hundred ever touched) is cold by
// nature and the reclaimer parks it harmlessly — a heartbeat still ran in ~3 s with 0.6 GB "out". What hurts
// is NEW pages being pushed out (the working set) — so warm when the swapped amount GROWS, or when the last
// heartbeat itself turned slow, and otherwise keep the 5-minute baseline touch.
const SWAP_GROWTH_MB = 150, SLOW_WARM_MS = 6000;
let warmInFlight = false, lastSwapMB = null;
async function checkAndWarm() {
  if (warmInFlight) return;
  const m = brainMemory();
  const grew = m && lastSwapMB !== null && m.swapMB - lastSwapMB > SWAP_GROWTH_MB;
  if (m) lastSwapMB = m.swapMB;
  const slow = warm.ms !== null && warm.ms > SLOW_WARM_MS;
  const stale = !warm.last || Date.now() - new Date(warm.last).getTime() > WARM_EVERY_MS;
  if (!grew && !slow && !stale) return;
  warmInFlight = true;
  try { if (grew || slow) console.log(`[axiom-app] re-warming now (${grew ? "swap grew to " + m.swapMB + " MB" : "last warm took " + warm.ms + " ms"})`); await keepWarm(); }
  finally { warmInFlight = false; }
}
setTimeout(checkAndWarm, 60 * 1000);
setInterval(checkAndWarm, 60 * 1000);
// --- keeper of the brain (owner ask 2026-09-02: "Axiom that never needs you to revive it").
// runit (termux-services) restarts the brain the moment its PROCESS exits; this keeper covers what runit
// cannot see: a brain that is alive but hung, stuck loading, or busy with no progress at all. It tells
// "busy" from "hung" by the brain's own counters (/metrics): work in flight whose token counters have not
// moved for 4 minutes is hung; a long answer that keeps producing tokens is left alone. Every revival is
// a card on the owner's panel, and after 3 revivals in 30 minutes it stops and says a person is needed.
const PREFIX = join(homedir(), "..", "usr");
const SV = join(PREFIX, "bin", "sv");
const SVDIR = join(PREFIX, "var", "service");
const keeper = { revivals: [], lastReason: null, healthMisses: 0, loadingSince: null, lastProgress: { tokens: null, prompt: null, at: 0 }, busy: false };
function sv(verb) {
  try { return execSync(`"${SV}" ${verb} axiom-brain`, { encoding: "utf8", env: { ...process.env, SVDIR }, timeout: 20000 }).trim(); }
  catch (e) { return "sv error: " + String(e.stdout || e.message).slice(0, 100); }
}
async function brainHealth() {
  try { const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 5000); const r = await fetch(BRAIN + "/health", { signal: ctl.signal }); clearTimeout(t); return r.status; }
  catch { return 0; }
}
async function brainProgress() {
  try {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 5000);
    const r = await fetch(BRAIN + "/metrics", { signal: ctl.signal }); clearTimeout(t); const txt = await r.text();
    const g = (k) => { const m = txt.match(new RegExp("^llamacpp:" + k + " (\\d+)", "m")); return m ? +m[1] : null; };
    return { processing: g("requests_processing"), tokens: g("tokens_predicted_total"), prompt: g("prompt_tokens_total") };
  } catch { return null; }
}
function recordProblem(id, title, status, note) {
  appendFileSync(PROBLEMS, JSON.stringify({ ts: new Date().toISOString(), id, title, status, note, by: "Axiom app (on the phone)" }) + "\n");
}
async function revive(reason) {
  const recent = keeper.revivals.filter((r) => Date.now() - r.at < 30 * 60 * 1000);
  if (recent.length >= 3) {
    if (keeper.lastReason !== "gave-up") { recordProblem("brain-needs-human", "The brain keeps failing and the app has stopped reviving it (3 tries in 30 minutes)", "found", "Last reason: " + reason + ". A person needs to look."); keeper.lastReason = "gave-up"; }
    return;
  }
  console.log(`[axiom-app] reviving the brain: ${reason}`);
  keeper.revivals.push({ at: Date.now(), reason }); keeper.lastReason = reason;
  keeper.healthMisses = 0; keeper.loadingSince = null; keeper.lastProgress = { tokens: null, prompt: null, at: 0 };
  const out = sv("force-restart"); // TERM, then KILL after 7 s — a hung process needs the KILL
  let ok = false; const t0 = Date.now();
  for (let i = 0; i < 40; i++) { await new Promise((r) => setTimeout(r, 3000)); if ((await brainHealth()) === 200) { ok = true; break; } }
  let pulseMs = null;
  if (ok) {
    const t1 = Date.now();
    try { const r = await fetch(BRAIN + "/v1/chat/completions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ messages: [{ role: "user", content: "hi" }], max_tokens: 1 }), signal: AbortSignal.timeout(120000) }); if (r.ok) pulseMs = Date.now() - t1; } catch { /* pulse failed: reported below */ }
  }
  const secs = Math.round((Date.now() - t0) / 1000);
  const id = "brain-revive-" + new Date().toISOString().replace(/[-:T]/g, "").slice(0, 12);
  if (ok && pulseMs !== null) recordProblem(id, "The brain stopped answering and was brought back on its own", "verified", `Reason: ${reason}. Back and answering in ${secs} seconds; nobody had to touch the phone.`);
  else recordProblem(id, "The brain stopped answering and the app tried to bring it back", "working", `Reason: ${reason}. ${ok ? "It answers health checks but not questions yet." : "Still not answering after 2 minutes."} (${out.slice(0, 60)})`);
  console.log(`[axiom-app] revive ${ok && pulseMs !== null ? "ok" : "INCOMPLETE"} in ${secs}s (${reason})`);
  if (ok) keepWarm().catch(() => {});
}
async function keepBrain() {
  if (keeper.busy) return; keeper.busy = true;
  try {
    const st = sv("status");
    if (/^down:/.test(st) || /sv error/.test(st)) return; // not under runit yet, or deliberately stopped: not ours to touch
    const h = await brainHealth();
    if (h === 200) {
      keeper.healthMisses = 0; keeper.loadingSince = null;
      const p = await brainProgress();
      if (p && p.processing >= 1 && keeper.lastProgress.at && keeper.lastProgress.tokens === p.tokens && keeper.lastProgress.prompt === p.prompt) {
        if (Date.now() - keeper.lastProgress.at > 4 * 60 * 1000) await revive("busy for 4 minutes with no progress (hung)");
      } else keeper.lastProgress = { tokens: p ? p.tokens : null, prompt: p ? p.prompt : null, at: Date.now() };
    } else if (h === 503) {
      if (!keeper.loadingSince) keeper.loadingSince = Date.now();
      else if (Date.now() - keeper.loadingSince > 180 * 1000) await revive("stuck loading for 3 minutes");
    } else {
      keeper.healthMisses++;
      if (keeper.healthMisses >= 2) await revive(`not answering health checks (${keeper.healthMisses} in a row)`);
    }
  } finally { keeper.busy = false; }
}
setInterval(keepBrain, 30 * 1000);
function brainMemory() {
  // same uid as the brain, so /proc is readable: how much of the brain is in RAM vs swapped out
  try {
    const pid = execSync("pgrep -f 'llama-serve[r]' | head -1", { encoding: "utf8" }).trim();
    if (!pid) return null;
    const st = readFileSync(`/proc/${pid}/status`, "utf8");
    const kb = (k) => +(st.match(new RegExp(`^${k}:\\s+(\\d+)`, "m")) || [])[1] || 0;
    return { pid: +pid, ramMB: Math.round(kb("VmRSS") / 1024), swapMB: Math.round(kb("VmSwap") / 1024), cores: (st.match(/^Cpus_allowed_list:\s+(\S+)/m) || [])[1] || null };
  } catch { return null; }
}
const SYSTEM_PROMPT = "You are Axiom, the language model living on " + OWNER + "'s phone. You named yourself; " + OWNER + ", the owner, hired you as the research program's proof checker. You are part of his machine fleet: a laptop, a Jetson, three bitcoin miners, and you. Speak in short plain honest sentences, no jargon. If you don't know something, say so.";

function tailLines(file, n) {
  try { const rows = readFileSync(file, "utf8").trim().split("\n"); return rows.slice(-n).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean); }
  catch { return []; }
}

async function brainGet(path, ms = 3000) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), ms);
  try { const r = await fetch(BRAIN + path, { signal: ctl.signal }); clearTimeout(t); return r.ok ? await r.json() : null; }
  catch { clearTimeout(t); return null; }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  try {
    if (url.pathname === "/") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      return res.end(PAGE);
    }
    if (url.pathname === "/manifest.webmanifest") {
      res.writeHead(200, { "content-type": "application/manifest+json" });
      return res.end(JSON.stringify({ name: "Axiom", short_name: "Axiom", description: "The phone's brain: chat with it, watch it work.", start_url: "/", display: "standalone", background_color: "#0b0f14", theme_color: "#0b0f14", icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }] }));
    }
    if (url.pathname === "/icon.svg") {
      res.writeHead(200, { "content-type": "image/svg+xml" });
      return res.end(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#141b24"/><circle cx="32" cy="26" r="10" fill="none" stroke="#a78bfa" stroke-width="3"/><circle cx="32" cy="26" r="3.5" fill="#a78bfa"/><path d="M16 50 L32 40 L48 50" fill="none" stroke="#22c55e" stroke-width="3" stroke-linecap="round"/></svg>`);
    }
    if (url.pathname === "/sw.js") {
      res.writeHead(200, { "content-type": "text/javascript" });
      return res.end(`self.addEventListener('install',e=>self.skipWaiting());self.addEventListener('activate',e=>self.clients.claim());self.addEventListener('fetch',e=>{if(e.request.mode==='navigate'){e.respondWith(fetch(e.request).catch(()=>new Response('<h1 style=\"font-family:sans-serif;color:#888;text-align:center;margin-top:40vh\">Axiom is waking up…</h1>',{headers:{'content-type':'text/html'}})))}});`);
    }
    if (url.pathname === "/api/chat" && req.method === "POST") {
      let raw = ""; for await (const c of req) { raw += c; if (raw.length > 65536) req.destroy(); }
      let body; try { body = JSON.parse(raw); } catch { res.writeHead(400); return res.end("bad json"); }
      // The brain's window is a WALL, not a slope (measured 2026-09-02): past 2048 tokens it refuses
      // with exceed_context_size_error, never silently forgets. So the app keeps the newest turns
      // that fit (chars/3 is a conservative token estimate) and says the honest thing at the wall.
      const CTX_TOKENS = 2048, ANSWER_TOKENS = 300, MARGIN_TOKENS = 64, MAX_MSG_CHARS = 4000;
      const est = (s) => Math.ceil(String(s || "").length / 3);
      let hist = (body.messages || []).slice(-24);
      // One message can be too big on its own — and a huge single message can also keep the brain busy for
      // minutes (measured 2026-09-02: a 9000-char message tokenized small enough to fit, then cost the brain
      // ~2 minutes per ask). Refuse it here, honestly, without ever calling the brain.
      if (!hist.length || String(hist.at(-1).content || "").length > MAX_MSG_CHARS) { res.writeHead(413, { "content-type": "text/plain" }); return res.end("that message is too long for me to read at once. Please send a shorter one."); }
      const fits = () => est(SYSTEM_PROMPT) + hist.reduce((n, m) => n + est(m.content) + 4, 0) <= CTX_TOKENS - ANSWER_TOKENS - MARGIN_TOKENS;
      let trimmed = 0;
      // Trim in BLOCKS (oldest half at a time), not one message per turn: a window that slides every turn
      // changes the prompt prefix every turn and throws away the brain's prefix cache (only the system prompt
      // survives). A block drop keeps the prefix stable for many turns, so each turn costs only its new tokens.
      while (hist.length > 1 && !fits()) { const drop = Math.max(1, Math.ceil(hist.length / 2)); hist = hist.slice(drop); trimmed += drop; }
      const ask = (h) => fetch(BRAIN + "/v1/chat/completions", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages: [{ role: "system", content: SYSTEM_PROMPT }, ...h], max_tokens: ANSWER_TOKENS, temperature: 0.7, stream: true }),
      }).catch(() => null);
      let upstream = await ask(hist);
      if (upstream && upstream.status === 400) {
        const why = await upstream.text().catch(() => "");
        if (/exceed_context_size/.test(why)) {
          // belt to the suspenders: the estimate was short — keep only the newest message and try once more
          trimmed += hist.length - 1; hist = hist.slice(-1); upstream = await ask(hist);
          if (upstream && upstream.status === 400) { res.writeHead(413, { "content-type": "text/plain" }); return res.end("that message is too long for me to read at once. Please send a shorter one."); }
        }
      }
      if (!upstream || !upstream.ok) { res.writeHead(502, { "content-type": "text/plain" }); return res.end("the brain is not answering"); }
      res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-store" });
      const reader = upstream.body.getReader();
      let full = "";
      const t0 = Date.now();
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          const text = Buffer.from(value).toString("utf8");
          res.write(text);
          for (const line of text.split("\n")) {
            const m = line.match(/^data: (\{.*\})/);
            if (m) { try { full += JSON.parse(m[1]).choices?.[0]?.delta?.content || ""; } catch {} }
          }
        }
      } catch {}
      res.end();
      const secs = (Date.now() - t0) / 1000;
      appendFileSync(CHATS, JSON.stringify({ ts: new Date().toISOString(), q: (body.messages || []).at(-1)?.content?.slice(0, 300), a: full.slice(0, 1200), secs: Math.round(secs), trimmed }) + "\n");
      return;
    }
    if (url.pathname === "/api/activity") {
      const [health, props] = await Promise.all([brainGet("/health"), brainGet("/props")]);
      res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
      return res.end(JSON.stringify({
        brain: health?.status === "ok" ? "awake" : "asleep",
        model: (props?.model_path || props?.default_generation_settings?.model || "").split(/[\\/]/).pop().replace(".gguf", "") || null,
        shifts: tailLines(SHIFTS, 8).reverse(),
        watches: tailLines(WATCHES, 8).reverse(),
        chats: tailLines(CHATS, 3).reverse().map((c) => ({ ts: c.ts, q: c.q, secs: c.secs })),
        warm, memory: brainMemory(),
        morning: tailLines(MORNING, 1)[0] || null,
        keeper: { supervised: !/sv error/.test(sv("status")), revivals24h: keeper.revivals.filter((r) => Date.now() - r.at < 86400000).map((r) => ({ at: new Date(r.at).toISOString(), reason: r.reason })), lastReason: keeper.lastReason },
        chats24h: tailLines(CHATS, 500).filter((c) => c.ts && Date.now() - Date.parse(c.ts) < 86400000).length,
        // latest status per problem id, newest activity first
        problems: Object.values(tailLines(PROBLEMS, 200).reduce((m, p) => { m[p.id] = p; return m; }, {})).sort((a, b) => (a.ts < b.ts ? 1 : -1)).slice(0, 12),
      }));
    }
    if (url.pathname === "/api/shift-report" && req.method === "POST") {
      let raw = ""; for await (const c of req) { raw += c; if (raw.length > 32768) req.destroy(); }
      try { JSON.parse(raw); } catch { res.writeHead(400); return res.end("bad json"); }
      appendFileSync(SHIFTS, raw.trim() + "\n");
      res.writeHead(200); return res.end("ok");
    }
    if (url.pathname === "/api/watch-report" && req.method === "POST") {
      let raw = ""; for await (const c of req) { raw += c; if (raw.length > 32768) req.destroy(); }
      let entry; try { entry = JSON.parse(raw); } catch { res.writeHead(400); return res.end("bad json"); }
      appendFileSync(WATCHES, raw.trim() + "\n");
      // Leftover 3: night-watch severity=alert -> Termux:API termux-notification (same class as leftover 1 termux-open-url).
      if (entry && entry.severity === "alert") {
        try {
          const title = "Axiom night-watch alert";
          const content = String((entry.axiom && (entry.axiom.line || entry.axiom.note)) || ((entry.anomalies || []).map((a) => a.src + ": " + a.what).join("; ")) || "fleet alert").slice(0, 500);
          execSync("termux-notification --id axiom-night-watch --title " + JSON.stringify(title) + " --content " + JSON.stringify(content), { encoding: "utf8", timeout: 15000 });
          console.log("[axiom-app] termux-notification severity=alert");
        } catch (e) {
          console.log("[axiom-app] termux-notification failed: " + String(e.stderr || e.message || e).slice(0, 160));
        }
      }
      res.writeHead(200); return res.end("ok");
    }
    if (url.pathname === "/api/morning" && req.method === "POST") {
      // {ts, line, needsYou:[], verdict:'accepted'|'rejected'|'unreachable', facts?} from the laptop's axiom-morning face
      let raw = ""; for await (const c of req) { raw += c; if (raw.length > 16384) req.destroy(); }
      let m; try { m = JSON.parse(raw); } catch { res.writeHead(400); return res.end("bad json"); }
      if (!m.line || !m.ts) { res.writeHead(400); return res.end("need ts, line"); }
      appendFileSync(MORNING, JSON.stringify({ ts: m.ts, line: String(m.line).slice(0, 900), needsYou: (m.needsYou || []).slice(0, 8).map((s) => String(s).slice(0, 160)), verdict: String(m.verdict || "").slice(0, 24), window: m.windowHours || null }) + "\n");
      res.writeHead(200); return res.end("ok");
    }
    if (url.pathname === "/api/problem" && req.method === "POST") {
      // {id, title, status: found|working|fixed|verified, note?, by?} — posting the same id again updates its status
      let raw = ""; for await (const c of req) { raw += c; if (raw.length > 8192) req.destroy(); }
      let p; try { p = JSON.parse(raw); } catch { res.writeHead(400); return res.end("bad json"); }
      if (!p.id || !p.title || !["found", "working", "fixed", "verified"].includes(p.status)) { res.writeHead(400); return res.end("need id, title, status"); }
      appendFileSync(PROBLEMS, JSON.stringify({ ts: new Date().toISOString(), id: String(p.id).slice(0, 64), title: String(p.title).slice(0, 200), status: p.status, note: String(p.note || "").slice(0, 400), by: String(p.by || "laptop").slice(0, 40) }) + "\n");
      res.writeHead(200); return res.end("ok");
    }
    res.writeHead(404); res.end("not found");
  } catch (e) { res.writeHead(500); res.end(String(e)); }
});

const PAGE = `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Axiom</title>
<link rel="manifest" href="/manifest.webmanifest"><link rel="icon" href="/icon.svg">
<style>
  :root{--bg:#0b0f14;--card:#141b24;--ink:#e8eef5;--dim:#8fa3b8;--violet:#a78bfa;--green:#22c55e;}
  *{box-sizing:border-box;margin:0;padding:0}
  body{background:var(--bg);color:var(--ink);font-family:system-ui,Roboto,sans-serif;display:flex;flex-direction:column;height:100dvh}
  header{display:flex;align-items:center;gap:10px;padding:14px 16px 10px}
  header img{width:30px;height:30px}
  h1{font-size:20px;letter-spacing:1px}
  #state{margin-left:auto;font-size:12.5px;color:var(--dim)}
  #tabs{display:flex;gap:6px;padding:0 16px 8px}
  #tabs button{flex:1;background:var(--card);color:var(--dim);border:1px solid #1f2937;border-radius:10px;padding:8px;font-size:13px}
  #tabs button.on{color:var(--ink);border-color:var(--violet)}
  main{flex:1;overflow-y:auto;padding:8px 16px;-webkit-overflow-scrolling:touch}
  .msg{max-width:88%;margin:6px 0;padding:10px 13px;border-radius:14px;font-size:15.5px;line-height:1.45;white-space:pre-wrap}
  .me{background:#1e293b;margin-left:auto;border-bottom-right-radius:4px}
  .ax{background:var(--card);border:1px solid #1f2937;border-bottom-left-radius:4px}
  .ax.thinking::after{content:'▋';animation:blink 1s infinite;color:var(--violet)}
  @keyframes blink{50%{opacity:0}}
  .shift{background:var(--card);border:1px solid #1f2937;border-radius:12px;padding:10px 12px;margin:8px 0;font-size:13.5px}
  .shift .t{color:var(--dim);font-size:11.5px}
  .shift .v{margin-top:4px}
  .ok{color:var(--green)}
  .sev-alert{border-color:#ef4444}
  .sev-alert .t::before{content:'● ';color:#ef4444}
  .sev-notice .t::before{content:'● ';color:#f59e0b}
  .sev-quiet .t::before{content:'● ';color:var(--green)}
  .bad{color:#ef4444}
  footer{padding:8px 12px calc(10px + env(safe-area-inset-bottom));display:flex;gap:8px}
  #inp{flex:1;background:var(--card);color:var(--ink);border:1px solid #1f2937;border-radius:22px;padding:11px 16px;font-size:15.5px;outline:none}
  #send{background:var(--violet);color:#14092e;border:0;border-radius:22px;padding:0 18px;font-weight:700;font-size:15px}
  #send:disabled{opacity:.5}
  .note{color:var(--dim);font-size:12.5px;text-align:center;padding:4px 0}
</style></head><body>
<header><img src="/icon.svg" alt=""><h1>AXIOM</h1><span id="state">…</span></header>
<div id="tabs"><button id="tabChat" class="on">Chat</button><button id="tabWork">Watch it work</button></div>
<main id="chat"><div class="msg ax">I'm Axiom — tthe owner's phone's brain. Ask me anything, or open "Watch it work" to see my shifts.</div></main>
<main id="work" style="display:none"></main>
<footer><input id="inp" placeholder="Ask Axiom…" autocomplete="off"><button id="send">Ask</button></footer>
<script>
const $=id=>document.getElementById(id);
if('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js');
const hist=[];
let busy=false;
function add(cls,text){const d=document.createElement('div');d.className='msg '+cls;d.textContent=text;$('chat').appendChild(d);d.scrollIntoView({block:'end'});return d;}
async function ask(){
  const q=$('inp').value.trim(); if(!q||busy) return;
  busy=true;$('send').disabled=true;$('inp').value='';
  add('me',q); hist.push({role:'user',content:'/no_think '+q});
  const d=add('ax thinking','');
  const t0=Date.now();
  try{
    const r=await fetch('/api/chat',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({messages:hist})});
    if(!r.ok) throw new Error(await r.text());
    const rd=r.body.getReader(); const dec=new TextDecoder(); let buf='',out='';
    for(;;){const {done,value}=await rd.read(); if(done)break; buf+=dec.decode(value,{stream:true});
      let i; while((i=buf.indexOf('\\n'))>=0){const line=buf.slice(0,i);buf=buf.slice(i+1);
        const m=line.match(/^data: (\\{.*\\})/); if(m){try{out+=JSON.parse(m[1]).choices?.[0]?.delta?.content||'';d.textContent=out;d.scrollIntoView({block:'end'});}catch{}}}}
    d.classList.remove('thinking');
    hist.push({role:'assistant',content:out});
    const secs=(Date.now()-t0)/1000, tps=out.split(/\\s+/).length/Math.max(1,secs);
    $('state').textContent=tps>3?'full speed':'sharing the screen — slower but thinking';
  }catch(e){d.classList.remove('thinking');d.textContent='(the brain did not answer: '+e.message+')';}
  busy=false;$('send').disabled=false;
}
$('send').onclick=ask; $('inp').addEventListener('keydown',e=>{if(e.key==='Enter')ask();});
$('tabChat').onclick=()=>{$('chat').style.display='';$('work').style.display='none';$('tabChat').classList.add('on');$('tabWork').classList.remove('on');};
$('tabWork').onclick=()=>{$('chat').style.display='none';$('work').style.display='';$('tabWork').classList.add('on');$('tabChat').classList.remove('on');refreshWork();};
async function refreshWork(){
  try{
    const a=await (await fetch('/api/activity',{cache:'no-store'})).json();
    $('state').textContent=a.brain==='awake'?'awake':'asleep'; // was keeping a stale 'asleep' once set — caught by eye on the phone 2026-09-02
    let h='<div class="note">'+(a.brain==='awake'?'Brain awake · '+(a.model||''):'Brain asleep')+'</div>';
    if(a.memory){const m=a.memory;const w=a.warm||{};const slow=w.ms!==null&&w.ms>6000;const big=m.swapMB>1024;
      const warmth=slow?'<span class=bad>⚠ slow to answer right now ('+(w.ms/1000).toFixed(0)+' s to wake) — warming it back up</span>':(w.last?'<span class=ok>warm ✓</span> (woke in '+(w.ms/1000).toFixed(1)+' s, '+Math.round((Date.now()-new Date(w.last))/60000)+' min ago)':'warming up…');
      h+='<div class="note">Brain memory: '+(m.ramMB/1024).toFixed(1)+' GB in RAM'+(m.swapMB>0?(' · '+(big?'<span class=bad>':'')+(m.swapMB/1024).toFixed(1)+' GB parked in storage'+(big?' ⚠</span>':' (idle pages)')):'')+' · '+warmth+(w.ok===false?' <span class=bad>(last warm failed)</span>':'')+'</div>';}
    if(a.keeper){const k=a.keeper;const n=(k.revivals24h||[]).length;const last=n?k.revivals24h[n-1]:null;
      h+='<div class="note">'+(k.supervised?'<span class=ok>Keeps itself alive ✓</span> — the phone restarts the brain by itself if it dies or hangs':'<span class=bad>Not under the phone’s own supervisor yet</span>')+(n?(' · revived '+n+'× today (last: '+last.reason+', '+new Date(last.at).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'})+')'):' · no revivals needed today')+(k.lastReason==='gave-up'?' · <span class=bad>⚠ gave up — a person is needed</span>':'')+'</div>';}
    const M=a.morning; if(M&&M.line&&Date.now()-new Date(M.ts)<20*3600e3){
      const who=M.verdict==='accepted'?'Code wrote the facts; Axiom added the last word ✓':(M.verdict==='rejected'?'Code wrote it (Axiom’s closing line was off, so it was dropped)':'Code wrote it (Axiom was not reachable)');
      h+='<div class="note">This morning</div><div class="shift sev-'+((M.needsYou||[]).length?'notice':'quiet')+'"><div class="t">'+new Date(M.ts).toLocaleString()+' · '+who+'</div><div class="v">'+M.line+
        ((M.needsYou||[]).length?('<br><b>Needs you:</b> '+M.needsYou.join(' · ')):'<br><span class=ok>Nothing needs you.</span>')+'</div></div>';}
    const P=a.problems||[];
    h+='<div class="note">Problems being worked right now (live from the laptop)</div>';
    if(!P.length) h+='<div class="shift">Nothing open. When the laptop finds a bug it shows up here as it is worked.</div>';
    for(const p of P){
      const st=p.status==='verified'?'<span class=ok>Fixed and proven ✓</span>':p.status==='fixed'?'<span class=ok>Fixed — proving it</span>':p.status==='working'?'Working on it…':'<span class=bad>Found</span>';
      h+='<div class="shift sev-'+(p.status==='found'?'alert':p.status==='working'?'notice':'quiet')+'"><div class="t">'+new Date(p.ts).toLocaleString()+' · '+st+'</div><div class="v">'+p.title+(p.note?('<br><span style="color:var(--dim)">'+p.note+'</span>'):'')+'</div></div>';
    }
    const w=a.watches||[];
    h+='<div class="note">Night-watch on the machines (newest first)</div>';
    if(!w.length) h+='<div class="shift">No watch reports yet — the laptop posts them here.</div>';
    for(const s of w){
      const sev=s.severity||'quiet';
      const label=sev==='alert'?'<span class=bad>Something needs you</span>':sev==='notice'?'Something to note':'<span class=ok>All quiet ✓</span>';
      h+='<div class="shift sev-'+sev+'"><div class="t">'+new Date(s.ts).toLocaleString()+'</div><div class="v">'+label+
        (s.anomalies&&s.anomalies.length?(' — '+s.anomalies.map(x=>x.src+': '+x.what).join('; ')):'')+
        (s.axiom&&s.axiom.line?('<br>“'+s.axiom.line+'”'):'')+'</div></div>';
    }
    h+='<div class="note">Hourly receipt-checking shifts (newest first)</div>';
    if(!a.shifts.length) h+='<div class="shift">No shift reports yet — the laptop posts them here each hour.</div>';
    for(const s of a.shifts){
      const checked=Object.values(s.checked||{}).filter(v=>typeof v==='number').reduce((x,y)=>x+y,0);
      const clean=Object.values(s.harness||{}).every(v=>v==='clean');
      h+='<div class="shift"><div class="t">'+new Date(s.ts).toLocaleString()+'</div><div class="v">'+
        (checked===0?'Quiet shift — nothing new to check.':('Checked '+checked+' receipts — '+(clean?'<span class=ok>all clean ✓</span>':'⚠ rule violations — see the board')))+
        (s.axiom&&s.axiom.line?('<br>“'+s.axiom.line+'”'):'')+'</div></div>';
    }
    if(a.chats.length){h+='<div class="note">Recent questions</div>';for(const c of a.chats){h+='<div class="shift"><div class="t">'+new Date(c.ts).toLocaleString()+' · answered in '+c.secs+'s</div><div class="v">'+(c.q||'')+'</div></div>';}}
    $('work').innerHTML=h;
  }catch(e){$('work').innerHTML='<div class="shift">Could not read activity: '+e.message+'</div>';}
}
setInterval(()=>{if($('work').style.display!=='none')refreshWork();},7000);
if(location.hash==='#work') $('tabWork').onclick();
fetch('/api/activity').then(r=>r.json()).then(a=>{$('state').textContent=a.brain==='awake'?'awake':'asleep';
  const M=a.morning; if(M&&M.line&&Date.now()-new Date(M.ts)<20*3600e3){const g=document.querySelector('#chat .msg.ax'); if(g) g.textContent='Good morning. '+M.line+((M.needsYou||[]).length?(' Needs you: '+M.needsYou.join('; ')+'.'):'');}
}).catch(()=>{});
</script></body></html>`;

server.listen(PORT, "127.0.0.1", () => {
  console.log(`[axiom-app] serving on ${PORT}`);
  // Do not termux-open-url here. Owner 2026-09-01: the phone must not be
  // yanked onto a terminal or this page just because the keeper restarted.
  // Alerts still use termux-notification on /api/watch-report severity=alert.
});
