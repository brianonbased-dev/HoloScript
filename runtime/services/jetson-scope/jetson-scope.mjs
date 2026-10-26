#!/usr/bin/env node
// jetson-scope — one tool, two faces, for the Jetson Orin Nano (jetson.local).
//   Machine face (CLI): jetson status [--json] | ls | files | top | help
//   Human face (visual): jetson open  -> local dashboard at http://127.0.0.1:8477
//
// Import closure is node: builtins ONLY, so this runs from any tree forever
// (the exec-root lesson: dependency-free scripts are the ones that survive).
// Remote access is ssh (BatchMode), read-only except POST /api/hardware-changed,
// which writes a hardware-change note to the rig. TCP port 22 is probed
// separately from ssh so "box is off" and "login broken" stay distinguishable
// (an ssh failure alone reads identical either way).

import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { connect } from 'node:net';
import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync } from 'node:fs';
import { readdirSync, unlinkSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import os from 'node:os';

// The Jetson is DHCP and multi-homed: cable .119, wifi .142, USB-eth .19. It moved
// .119 -> .142 on 2026-08-20 when the ethernet carrier dropped, so a hardcoded address
// reports a live machine as offline. Read the same sovereign-device config the shared
// resolver uses -- but carry the USER and KEY explicitly. ~/.ssh/config aliases only the
// NAME jetson.local; a bare IP matches no alias, so ssh falls back to the local
// Windows username with no identity and dies with "Permission denied", which this
// dashboard then reports as a login failure on a perfectly healthy box.
// Site-specific values (LAN addresses, local paths, owner name) live in the git-ignored
// jetson-scope.local.json beside this file (see jetson-scope.example.json) or in env vars.
const LOCAL_CFG = (() => {
  try { return JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'jetson-scope.local.json'), 'utf8')); }
  catch { return {}; }
})();
const OWNER = process.env.OWNER_NAME || LOCAL_CFG.ownerName || 'the owner';
const ADB = process.env.ADB_PATH || LOCAL_CFG.adbPath || 'adb';
// A bare command name is resolved on PATH by spawn (which reports its own error); a path must exist.
const adbAvailable = (p) => (/[\\/]/.test(p) ? existsSync(p) : Boolean(p));
const STUDIO_URL = process.env.STUDIO_URL || LOCAL_CFG.studioUrl || '';
const MESH_ENV_PATH = process.env.MESH_ENV_PATH || LOCAL_CFG.meshEnvPath || join(os.homedir(), '.ai-ecosystem', '.env');
const JETSON_CFG = (() => {
  // Optional sovereign-device record (JSON with an .access block); unset means skip.
  const p = process.env.SOVEREIGN_DEVICE_CONFIG || LOCAL_CFG.sovereignDeviceConfig;
  if (!p) return {};
  try { return JSON.parse(readFileSync(p, "utf8"))?.access || {}; }
  catch { return {}; }
})();
// Two different jobs, two different values: tcpProbe needs a bare address, ssh needs
// user@address. Collapsing them into one constant makes a healthy box report as
// "not answering on the network" the moment the ssh form wins.
const JETSON_ADDR = process.env.JETSON_ADDR || LOCAL_CFG.jetsonAddr || JETSON_CFG.ip || "jetson.local";
const HOST = process.env.JETSON_HOST || process.env.HOLO_JETSON_HOST
  || ((JETSON_CFG.user || "username") + "@" + JETSON_ADDR);
const JETSON_KEY = (JETSON_CFG.key || "~/.ssh/jetson_ed25519").replace(/^~/, os.homedir());
const PORT = 8477;
const INGEST_PORT = 8478;
// Phone lane: same dashboard, reached from the owner's phone over
// `adb reverse tcp:8481 tcp:8481`. Loopback-only on purpose — the cable is
// the transport, so freeing the dashboard onto the phone adds zero LAN surface.
const PHONE_PORT = 8481;
// Cordless lane: the same read-only dashboard on the home LAN, gated by its
// own view token, for when the phone is off the cable.
const LAN_VIEW_PORT = 8482;
const HERE = dirname(fileURLToPath(import.meta.url));
const SSH_OPTS = ["-o", "BatchMode=yes", "-o", "ConnectTimeout=6",
  ...(existsSync(JETSON_KEY) ? ["-i", JETSON_KEY, "-o", "IdentitiesOnly=yes"] : [])];

// ---------- transport ----------

function tcpProbe(host, port, timeoutMs = 3000) {
  return new Promise((resolve) => {
    const sock = connect({ host, port });
    const done = (ok) => { try { sock.destroy(); } catch {} resolve(ok); };
    sock.setTimeout(timeoutMs, () => done(false));
    sock.on('connect', () => done(true));
    sock.on('error', () => done(false));
  });
}

function sshRun(remoteScript, timeoutMs = 20000) {
  return new Promise((resolve) => {
    const child = spawn('ssh', [...SSH_OPTS, '--', HOST, 'bash', '-s'], {
      stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true,
    });
    let out = '', err = '';
    const timer = setTimeout(() => { try { child.kill(); } catch {} }, timeoutMs);
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { err += d; });
    child.on('close', (code) => { clearTimeout(timer); resolve({ code, out, err }); });
    child.on('error', (e) => { clearTimeout(timer); resolve({ code: -1, out, err: String(e) }); });
    child.stdin.write(remoteScript);
    child.stdin.end();
  });
}

// ---------- remote snapshot ----------

const FAST_SCRIPT = `
echo '@@TEGRA'
timeout 3 tegrastats --interval 600 2>/dev/null | head -2 | tail -1
echo '@@UPTIME'
uptime
echo '@@DF'
df -B1 --output=target,size,used,avail /mnt/nvme / 2>/dev/null | tail -n +2
echo '@@TOP'
ps -eo pcpu,pmem,comm --sort=-pcpu | head -7 | tail -n +2
echo '@@SERVICES'
systemctl list-units --type=service --state=running --no-pager --no-legend 2>/dev/null | awk '{print $1}' | grep -Ei 'holo|docker|ollama|llama' | head -12
echo '@@DOCKER'
docker ps --format '{{.Names}}' 2>/dev/null | head -10
echo '@@ARRIVALS'
ls -lht --time-style=+%Y-%m-%d /mnt/nvme/archives/laptop 2>/dev/null | awk 'NR>1{print $6"  "$7"  ("$5")"}' | head -5
echo '@@DATASETS'
ls -lht --time-style=+%Y-%m-%d /srv/holo-volumes/model-scratch/datasets 2>/dev/null | awk 'NR>1{print $6"  "$7"  ("$5")"}' | head -5
echo '@@MINER'
systemctl --user is-active cgminer.service 2>/dev/null | sed 's/^/@service=/'
tr -d '\n' < $HOME/cgminer-gekko/brain-status.json 2>/dev/null; echo
echo '@@END'
`;

const SPACE_SCRIPT = `
du -sb /mnt/nvme/holo /mnt/nvme/archives /mnt/nvme/ollama /mnt/nvme/holo/models /mnt/nvme/holo/git /srv/holo-volumes 2>/dev/null
echo '@@END'
`;

function sections(raw) {
  const map = {};
  let key = null;
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^@@(\w+)$/);
    if (m) { key = m[1]; map[key] = []; continue; }
    if (key && line.trim() !== '') map[key].push(line);
  }
  return map;
}

function parseTegra(line) {
  if (!line) return null;
  const t = {};
  let m = line.match(/RAM (\d+)\/(\d+)MB/); if (m) { t.ramUsedMB = +m[1]; t.ramTotalMB = +m[2]; }
  m = line.match(/SWAP (\d+)\/(\d+)MB/); if (m) { t.swapUsedMB = +m[1]; t.swapTotalMB = +m[2]; }
  m = line.match(/CPU \[([^\]]+)\]/);
  if (m) {
    t.cores = m[1].split(',').map((c) => { const cm = c.match(/(\d+)%@(\d+)/); return cm ? { pct: +cm[1], mhz: +cm[2] } : null; }).filter(Boolean);
    if (t.cores.length) t.cpuAvgPct = Math.round(t.cores.reduce((a, c) => a + c.pct, 0) / t.cores.length);
  }
  m = line.match(/GR3D_FREQ (\d+)%/); if (m) t.gpuPct = +m[1];
  m = line.match(/gpu@([\d.]+)C/); if (m) t.gpuTempC = +m[1];
  m = line.match(/cpu@([\d.]+)C/); if (m) t.cpuTempC = +m[1];
  m = line.match(/tj@([\d.]+)C/); if (m) t.tjTempC = +m[1];
  m = line.match(/VDD_IN (\d+)mW/); if (m) t.powerW = Math.round(+m[1] / 100) / 10;
  return Object.keys(t).length ? t : null;
}

const KNOWN_AXES = (process.env.KNOWN_AXES ? process.env.KNOWN_AXES.split(',').map((s) => s.trim()).filter(Boolean) : LOCAL_CFG.knownAxes) || [];
// Authored USB row (mining-fleet.holo). The two Compac A1s are on the bench
// for resolder (owner 2026-09-07); they are not a mystery unplug.
// Real serials live in the git-ignored jetson-scope.local.json ("serials", keyed by
// label); without them a row shows its label only.
const USB_SERIALS = LOCAL_CFG.serials || {};
const EXPECTED_USB = [
  { label: 'r909', serial: USB_SERIALS['r909'] || 'r909', model: 'R909' },
  { label: 'compac-f-1', serial: USB_SERIALS['compac-f-1'] || 'compac-f-1', model: 'Compac F' },
  { label: 'compac-f-2', serial: USB_SERIALS['compac-f-2'] || 'compac-f-2', model: 'Compac F' },
  { label: 'compac-a1-1', serial: USB_SERIALS['compac-a1-1'] || 'compac-a1-1', model: 'Compac A1', hold: 'resolder' },
  { label: 'compac-a1-2', serial: USB_SERIALS['compac-a1-2'] || 'compac-a1-2', model: 'Compac A1', hold: 'resolder' },
];
function dashboardHtml() {
  return readFileSync(join(HERE, 'dashboard.html'), 'utf8')
    .replace('/*@EXPECTED_USB*/[]', JSON.stringify(EXPECTED_USB).replace(/</g, '\\u003c'));
}

async function fillKnownAxes(brain) {
  // Laptop is on the same wifi as the Bitaxes. Always probe the three known
  // boxes from here — do not wait for the Jetson brain to remember an IP, and
  // do not keep a stale gh:0 just because the key already exists.
  if (!brain) brain = { bitaxes: {}, devices: [] };
  brain.bitaxes = { ...(brain.bitaxes || {}) };
  await Promise.all(KNOWN_AXES.map(async (ip) => {
    const prev = brain.bitaxes[ip] || {};
    try {
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), 2500);
      const r = await fetch('http://' + ip + '/api/system/info', { signal: ac.signal });
      clearTimeout(timer);
      const d = JSON.parse(await r.text());
      const gh = Number(d.hashRate);
      brain.bitaxes[ip] = {
        ...prev,
        missing: false,
        model: d.ASICModel || prev.model || 'Bitaxe',
        gh: Number.isFinite(gh) ? gh : prev.gh,
        gh_1m: d.hashRate_1m,
        gh_10m: d.hashRate_10m,
        temp: d.temp,
        power: d.power,
        freq: d.frequency,
        shares: d.sharesAccepted,
        worker: d.stratumUser || prev.worker,
        // Block detection must NOT depend on the Jetson being up. These four came only
        // from brain-status.json, so if the brain was down the dashboard had no idea a
        // Bitaxe had found anything -- and the Bitaxes are the half of the rig actually
        // pointed at solo.ckpool.org. The laptop can see them directly; use that.
        block_found: d.blockFound,
        best_diff: d.bestDiff ?? prev.best_diff,
        net_diff: d.networkDifficulty ?? prev.net_diff,
        reward_sats: d.coinbaseValueUserSatoshis ?? prev.reward_sats,
        source: 'direct',
      };
    } catch {
      brain.bitaxes[ip] = {
        ...prev,
        model: prev.model || 'Bitaxe',
        last_gh: Number.isFinite(Number(prev.gh)) ? Number(prev.gh) : (prev.last_gh || 0),
        gh: 0,
        missing: true,
      };
    }
  }));
  const axeGh = Object.values(brain.bitaxes).reduce((s, b) => s + (b.missing ? 0 : (Number(b.gh) || 0)), 0);
  const usb = Number(brain.usb_th);
  const usbTh = Number.isFinite(usb) ? usb : 0;
  brain.usb_th = usbTh;
  brain.bitaxe_th = Math.round(axeGh) / 1000;
  brain.total_th = Math.round(usbTh * 1000 + axeGh) / 1000;
  const seenUsb = new Set((brain.devices || []).map((d) => String(d.serial || '')));
  // Only call a stick unplugged when cgminer actually sent a device list.
  // An empty list is "Jetson/brain did not report USB", not five unplugged sticks.
  brain.missing_usb = (brain.devices && brain.devices.length)
    ? EXPECTED_USB.filter((e) => !seenUsb.has(e.serial))
    : [];
  return brain;
}

// ---- our account as the POOL sees it -------------------------------------------------
// The address is read off whatever the miners are actually configured with, never
// hard-coded, so this cannot quietly describe a different account than the one running.
const POOL_TTL_MS = 120000;
let poolCache = { at: 0, addr: '', data: null };

function payoutAddress(miner) {
  const w = Object.values(miner?.bitaxes || {}).map((b) => b.worker).find(Boolean)
         || (miner?.devices || []).map((d) => d.worker).find(Boolean);
  const addr = String(w || '').split('.')[0].trim();
  return /^(bc1|[13])[a-zA-Z0-9]{20,70}$/.test(addr) ? addr : null;
}

async function getPool(miner) {
  const addr = payoutAddress(miner);
  if (!addr) return { ok: false, error: 'no payout address found in any miner config' };
  if (Date.now() - poolCache.at < POOL_TTL_MS && poolCache.data && poolCache.data.ok && poolCache.addr === addr) {
    return poolCache.data;
  }
  let data;
  try {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 8000);
    const r = await fetch('https://solo.ckpool.org/users/' + addr, { signal: ac.signal });
    clearTimeout(timer);
    if (!r.ok) throw new Error('pool HTTP ' + r.status);
    const d = JSON.parse(await r.text());
    const now = Math.floor(Date.now() / 1000);
    const age = (t) => (t ? now - Number(t) : null);
    const lastshare_age_s = age(d.lastshare);
    const workers = (d.worker || []).map((w) => ({
      name: String(w.workername || '').split('.')[1] || '(no worker name)',
      hashrate1hr: w.hashrate1hr, hashrate1d: w.hashrate1d,
      bestever: Number(w.bestever) || 0, lastshare_age_s: age(w.lastshare),
    }));
    const problems = [];
    if (lastshare_age_s != null && lastshare_age_s > 600) {
      problems.push('the pool has not accepted a share in ' + Math.round(lastshare_age_s / 60) + ' minutes');
    }
    data = {
      ok: true, address: addr, at: new Date().toISOString(),
      hashrate1m: d.hashrate1m, hashrate1hr: d.hashrate1hr, hashrate1d: d.hashrate1d,
      shares: d.shares, bestever: Number(d.bestever) || 0,
      lastshare_age_s,
      landing: lastshare_age_s == null ? undefined : lastshare_age_s <= 600,
      workers, problems,
    };
    poolCache = { at: Date.now(), addr, data };
  } catch (e) {
    // Unknown, never "quiet". A failed lookup must not read as a healthy pool,
    // and must not be cached as if it were.
    const timedOut = e && e.name === 'AbortError';
    data = { ok: false, address: addr, at: new Date().toISOString(),
             error: timedOut ? 'the pool check timed out' : String((e && e.name) || e) };
  }
  return data;
}

function minerFromPublisher(nodes) {
  const pub = (nodes || []).find((n) => !n.stale && n.snap?.metrics?.miner);
  if (!pub) return null;
  try { return JSON.parse(JSON.stringify(pub.snap.metrics.miner)); }
  catch { return pub.snap.metrics.miner; }
}

async function getState() {
  const state = { at: new Date().toISOString(), host: JETSON_ADDR, reachable: false, tcp22: false };
  state.tcp22 = await tcpProbe(JETSON_ADDR, 22);
  if (!state.tcp22) {
    state.problem = 'no-network-answer';
    state.plain = 'The Jetson is not answering on the network. It is probably off, unplugged, or the network is down.';
    return state;
  }
  const r = await sshRun(FAST_SCRIPT);
  if (r.code !== 0 || !r.out.includes('@@END')) {
    state.problem = 'ssh-failed';
    state.plain = 'The Jetson answers on the network, but logging in failed. The box is up — this is a login/key problem, not a power problem.';
    state.sshError = (r.err || '').split('\n')[0];
    return state;
  }
  state.reachable = true;
  const s = sections(r.out);
  state.telemetry = parseTegra((s.TEGRA || [])[0]);
  state.uptime = (s.UPTIME || [])[0]?.trim() || null;
  state.disks = (s.DF || []).map((l) => {
    const p = l.trim().split(/\s+/);
    return p.length >= 4 ? { mount: p[0], sizeB: +p[1], usedB: +p[2], availB: +p[3] } : null;
  }).filter(Boolean);
  state.top = (s.TOP || []).map((l) => {
    const p = l.trim().split(/\s+/);
    return p.length >= 3 ? { cpuPct: +p[0], memPct: +p[1], name: p.slice(2).join(' ') } : null;
  }).filter(Boolean);
  state.services = s.SERVICES || [];
  state.docker = s.DOCKER || [];
  state.arrivals = s.ARRIVALS || [];
  state.datasets = s.DATASETS || [];
  state.miner = (() => {
    const rows = s.MINER || [];
    if (!rows.length) return null;
    let service = null;
    const json = [];
    for (const r of rows) {
      if (r.startsWith('@service=')) service = r.slice(9).trim();
      else json.push(r);
    }
    let brain = null;
    try { brain = JSON.parse(json.join('')); } catch { brain = null; }
    if (!brain) return service ? { service, devices: [], stale: true } : null;
    brain.service = service || 'unknown';
    return brain;
  })();
  state.miner = await fillKnownAxes(state.miner);
  return state;
}

function getLaptop() {
  return new Promise((resolve) => {
    const child = spawn('powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', join(HERE, 'laptop-probe.ps1')],
      { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    let out = '';
    const timer = setTimeout(() => { try { child.kill(); } catch {} }, 10000);
    child.stdout.on('data', (d) => { out += d; });
    child.on('close', () => {
      clearTimeout(timer);
      try { resolve({ ok: true, ...JSON.parse(out.trim()) }); }
      catch { resolve({ ok: false, plain: 'The laptop probe returned nothing readable.' }); }
    });
    child.on('error', () => { clearTimeout(timer); resolve({ ok: false, plain: 'Could not start the laptop probe.' }); });
  });
}

// Cloud fleet (rented GPUs) via the CANONICAL pane: ai-ecosystem's
// fleet-status.mjs --json (its JSON shape is stable for machine consumers).
// Run from the checkout so its module closure + vastai env resolution work.
const FLEET_REPO = 'C:\\holo-dev\\ai-ecosystem';

function getCloud() {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ['scripts/fleet-status.mjs', '--json'],
      { cwd: FLEET_REPO, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    let out = '';
    const timer = setTimeout(() => { try { child.kill(); } catch {} }, 60000);
    child.stdout.on('data', (d) => { out += d; });
    child.on('close', () => {
      clearTimeout(timer);
      try { resolve({ ok: true, at: new Date().toISOString(), ...JSON.parse(out.trim()) }); }
      catch { resolve({ ok: false, plain: 'Could not read the rental status (fleet-status returned nothing readable).' }); }
    });
    child.on('error', () => { clearTimeout(timer); resolve({ ok: false, plain: 'Could not start the fleet status tool.' }); });
  });
}

let cloudCache = null, cloudAt = 0, cloudRefreshing = false;
function refreshCloudIfStale() {
  if (cloudRefreshing || Date.now() - cloudAt < 60000) return;
  cloudRefreshing = true;
  getCloud().then((c) => { cloudCache = c; cloudAt = Date.now(); cloudRefreshing = false; });
}

// Ticket bill (Paper 46, board task task_1789351533717_x1e1): what each miner's
// hashes cost today against what they were worth. The Vast lane computes it
// (the cloud rows above cannot see the isolated mining account), writes at most
// one receipt a day, and prints BILL BROKEN if its known-bad control ever shows
// green. The hub only runs it and shows it. A bill is slow data: hourly, and a
// failed run retries after five minutes.
function getBill() {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ['scripts/holomesh-vast-btc-hash-cost.mjs', '--bill', '--json'],
      { cwd: FLEET_REPO, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    let out = '';
    const timer = setTimeout(() => { try { child.kill(); } catch {} }, 120000);
    child.stdout.on('data', (d) => { out += d; });
    child.on('close', () => {
      clearTimeout(timer);
      try { resolve({ ok: true, ...JSON.parse(out.trim()) }); }
      catch { resolve({ ok: false, plain: ['Could not read the ticket bill (the bill tool returned nothing readable).'] }); }
    });
    child.on('error', () => { clearTimeout(timer); resolve({ ok: false, plain: ['Could not start the ticket bill tool.'] }); });
  });
}

let billCache = null, billAt = 0, billRefreshing = false;
function refreshBillIfStale() {
  if (billRefreshing || Date.now() - billAt < 3600000) return;
  billRefreshing = true;
  getBill().then((b) => {
    billCache = b;
    billAt = b.ok ? Date.now() : Date.now() - 3300000;
    billRefreshing = false;
  });
}

// HoloMesh (team layer) via the PRODUCTION board API — the same surface the
// room tooling uses. Credentials come from the data root .env; never logged.
function meshCreds() {
  try {
    const env = readFileSync(MESH_ENV_PATH, 'utf8');
    const get = (k) => (env.match(new RegExp(`^${k}=(.+)$`, 'm')) || [])[1]?.trim();
    return { key: get('HOLOMESH_API_KEY'), team: get('HOLOMESH_TEAM_ID') };
  } catch { return {}; }
}

async function getMesh() {
  const { key, team } = meshCreds();
  if (!key || !team) return { ok: false, plain: 'HoloMesh credentials not found on this machine.' };
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 8000);
    const r = await fetch(`https://mcp.holoscript.net/api/holomesh/team/${team}/board`, {
      headers: { Authorization: `Bearer ${key}` }, signal: ctl.signal,
    });
    clearTimeout(t);
    if (!r.ok) return { ok: false, plain: `HoloMesh answered with an error (${r.status}).` };
    const b = await r.json();
    // Board shape (verified 2026-08-18): flat tasks[] with a status field,
    // plus done_count / mode / objective at the top level.
    const tasks = Array.isArray(b.tasks) ? b.tasks : [];
    const byStatus = (s) => tasks.filter((t2) => t2.status === s);
    const claimedTasks = byStatus('claimed');
    const titles = claimedTasks.slice(0, 5).map((t2) => ({
      title: String(t2.title || '').slice(0, 70),
      by: String(t2.claimed_by || t2.claimedBy || t2.updatedBy || '').slice(0, 24),
    }));
    return {
      ok: true, at: new Date().toISOString(),
      open: byStatus('open').length, claimed: claimedTasks.length,
      blocked: byStatus('blocked').length, doneLog: b.done_count ?? 0,
      mode: b.mode || null, objective: (b.objective || '').slice(0, 90), titles,
    };
  } catch (e) {
    return { ok: false, plain: e.name === 'AbortError' ? 'HoloMesh did not answer in time.' : 'Could not reach HoloMesh.' };
  }
}

let meshCache = null, meshAt = 0, meshRefreshing = false;
function refreshMeshIfStale() {
  if (meshRefreshing || Date.now() - meshAt < 30000) return;
  meshRefreshing = true;
  getMesh().then((m) => { meshCache = m; meshAt = Date.now(); meshRefreshing = false; });
}

async function getSpace() {
  const r = await sshRun(SPACE_SCRIPT, 90000);
  if (r.code !== 0) return { ok: false };
  const rows = [];
  for (const line of r.out.split(/\r?\n/)) {
    const m = line.match(/^(\d+)\s+(.+)$/);
    if (m) rows.push({ bytes: +m[1], path: m[2].trim() });
  }
  return { ok: true, at: new Date().toISOString(), rows };
}

// ---------- CLI faces ----------

function gb(bytes) { return (bytes / 1e9).toFixed(1); }

function printStatus(st) {
  if (!st.reachable) { console.log(`JETSON: UNREACHABLE — ${st.plain}`); return; }
  const t = st.telemetry || {};
  console.log(`JETSON: online — ${st.uptime || ''}`);
  if (t.cpuAvgPct != null) console.log(`  CPU ${t.cpuAvgPct}% avg across ${t.cores.length} cores | GPU ${t.gpuPct ?? '?'}% | ${t.powerW ?? '?'} W`);
  if (t.ramUsedMB != null) console.log(`  RAM ${(t.ramUsedMB / 1024).toFixed(1)}/${(t.ramTotalMB / 1024).toFixed(1)} GB | temps cpu ${t.cpuTempC}C gpu ${t.gpuTempC}C`);
  for (const d of st.disks || []) console.log(`  disk ${d.mount}: ${gb(d.usedB)} used / ${gb(d.sizeB)} GB (${gb(d.availB)} free)`);
  if (st.services?.length) console.log(`  services: ${st.services.join(', ')}`);
  if (st.docker?.length) console.log(`  docker: ${st.docker.join(', ')}`);
  if (st.top?.length) console.log(`  busiest: ${st.top.slice(0, 3).map((p) => `${p.name} ${p.cpuPct}%`).join(' | ')}`);
}

function safeRemotePath(p) {
  if (!p) return '/mnt/nvme';
  if (!/^[A-Za-z0-9._\/~+-]+$/.test(p)) { console.error('path has characters I refuse to pass to a remote shell'); process.exit(2); }
  return p;
}

// ---------- universal node ingest (the join surface) ----------
// Any machine running metal-publisher.mjs POSTs snapshots here. This is the
// node-ingest listener (8478, METAL_INGEST_HOST or 0.0.0.0), and it accepts exactly
// two things: a token-gated snapshot POST, and a GET of the publisher file itself (so
// a new machine can download it from the hub). It is one of TWO LAN-facing listeners;
// the other is the view-token-gated LAN phone view on 8482. 8477 and 8481 are 127.0.0.1.

// The join token lives in a per-user state dir OUTSIDE the repo, and is only read or
// created when the server/CLI actually needs it -- importing this module writes nothing.
// Override with JETSON_SCOPE_STATE_DIR. A legacy join-token.txt beside this file is
// still honoured (read-only) so machines already joined keep working.
export function stateDir() {
  if (process.env.JETSON_SCOPE_STATE_DIR) return process.env.JETSON_SCOPE_STATE_DIR;
  if (process.platform === 'win32') return join(process.env.LOCALAPPDATA || join(os.homedir(), 'AppData', 'Local'), 'holoscript', 'jetson-scope');
  return join(process.env.XDG_STATE_HOME || join(os.homedir(), '.local', 'state'), 'holoscript', 'jetson-scope');
}
const LEGACY_TOKEN_FILE = join(HERE, 'join-token.txt');
function loadOrCreateToken() {
  const file = join(stateDir(), 'join-token.txt');
  if (existsSync(file)) return readFileSync(file, 'utf8').trim();
  if (existsSync(LEGACY_TOKEN_FILE)) return readFileSync(LEGACY_TOKEN_FILE, 'utf8').trim();
  const t = randomBytes(18).toString('hex');
  mkdirSync(stateDir(), { recursive: true });
  writeFileSync(file, t + '\n', { mode: 0o600 });
  return t;
}
let joinTokenCache = null;
const joinToken = () => (joinTokenCache ??= loadOrCreateToken());

function lanIp() {
  const found = [];
  for (const [name, addrs] of Object.entries(os.networkInterfaces())) {
    for (const a of addrs || []) {
      if ((a.family === 'IPv4' || a.family === 4) && !a.internal && !a.address.startsWith('169.254.')) {
        found.push({ name, address: a.address });
      }
    }
  }
  const prefer = found.find((x) => !/virtual|vethernet|wsl|loopback/i.test(x.name));
  return (prefer || found[0] || {}).address || null;
}

const joinedNodes = new Map(); // name -> { snap, lastSeen }
// True only in the process that owns the 8478 ingest listener (the hub). The
// phone/LAN lanes may run in a SEPARATE process while the elevated hub cannot
// be restarted by an agent shell; those lanes have an empty joinedNodes map and
// must adopt the hub's nodes over its own loopback instead (see buildStateJson).
// One process owns every port again after the next full `serve` restart.
let ingestOwned = false;

// Metal history: one sample per node per minute, so the Jetson's thermal zones
// can stand in for a room thermometer (owner 2026-09-14: the Jetson reads the
// room more truly than the Bitaxe chips, which run 55-67 C). Before this only the
// latest snapshot lived, in memory, so no temperature history existed at all.
// On the Jetson, gpu.powerW is the whole board's VDD_IN (metal-publisher
// collectGpu) -- the load term a room-temperature fit needs. One sample, not an
// average. Files sit beside this script (gitignored *.ndjson), kept 60 days.
const HISTORY_KEEP_DAYS = 60;
const historyMinute = new Map(); // node name -> last minute written
let historyPrunedDay = null;

function recordMetalHistory(name, snap) {
  const m = snap.metrics || {};
  if (!m.temps && !m.gpu) return;
  const minute = Math.floor(Date.now() / 60000);
  if (historyMinute.get(name) === minute) return;
  historyMinute.set(name, minute);
  const day = new Date().toISOString().slice(0, 10);
  const row = {
    t: Math.round(Date.now() / 1000), node: name,
    temps: m.temps || null, gpu: m.gpu || null,
    cpuPct: m.cpuPct ?? null, load1: m.load1 ?? null,
  };
  const file = `metal-history-${name.replace(/[^A-Za-z0-9._-]/g, '_')}-${day}.ndjson`;
  try { appendFileSync(join(HERE, file), JSON.stringify(row) + '\n'); }
  catch (e) { console.error(`metal history write failed: ${e.code || e}`); }
  if (historyPrunedDay === day) return;
  historyPrunedDay = day;
  const cutoff = new Date(Date.now() - HISTORY_KEEP_DAYS * 86400000).toISOString().slice(0, 10);
  try {
    for (const f of readdirSync(HERE)) {
      const d = /^metal-history-.+-(\d{4}-\d{2}-\d{2})\.ndjson$/.exec(f);
      if (d && d[1] < cutoff) unlinkSync(join(HERE, f));
    }
  } catch (e) { console.error(`metal history prune failed: ${e.code || e}`); }
}

function startIngestServer() {
  ingestOwned = true;
  const server = createServer((req, res) => {
    if (req.method === 'GET' && req.url === '/publisher.mjs') {
      res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8' });
      res.end(readFileSync(join(HERE, 'metal-publisher.mjs')));
      return;
    }
    if (req.method === 'POST' && req.url === '/api/ingest') {
      if (!tokenMatches(req.headers['x-metal-token'], joinToken())) { res.writeHead(401); res.end('bad token'); return; }
      let body = '';
      req.on('data', (d) => { body += d; if (body.length > 65536) { req.destroy(); } });
      req.on('end', () => {
        try {
          const snap = JSON.parse(body);
          if (snap.schema !== 'holo.metal-node-snapshot.v1' || !snap.node?.name) { res.writeHead(422); res.end('bad snapshot'); return; }
          const name = String(snap.node.name).slice(0, 48);
          joinedNodes.set(name, { snap, lastSeen: Date.now() });
          recordMetalHistory(name, snap);
          res.writeHead(200, { 'content-type': 'application/json' });
          res.end('{"ok":true}');
        } catch { res.writeHead(400); res.end('bad json'); }
      });
      return;
    }
    res.writeHead(404); res.end('not found');
  });
  const ingestHost = process.env.METAL_INGEST_HOST || '0.0.0.0';
  server.listen(INGEST_PORT, ingestHost, () => {
    console.log(`metal ingest (LAN join surface): ${ingestHost}:${INGEST_PORT}`);
  });
  server.on('error', (e) => { console.error(`ingest listen failed: ${e.code || e}`); });
}

// Constant-time join-token check (equal-length guard: timingSafeEqual throws on length mismatch).
function tokenMatches(given, expected) {
  if (typeof given !== 'string' || typeof expected !== 'string' || !expected) return false;
  const a = Buffer.from(given, 'utf8'), b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function nodesForState() {
  const out = [];
  for (const [name, rec] of joinedNodes) {
    const ageS = Math.round((Date.now() - rec.lastSeen) / 1000);
    out.push({ name, ageS, stale: ageS > 45, snap: rec.snap });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

// ---------- dashboard server ----------

let cachedState = null, cachedAt = 0, cachedSpace = null, spaceAt = 0, spaceRefreshing = false;
let cachedMetrics = null, cachedMetricsAt = 0;

const MANIFEST_JSON = JSON.stringify({
  name: 'Our Metal', short_name: 'Metal',
  description: 'Live view of everything we run: laptop, Jetson, cloud fleet, HoloMesh.',
  start_url: '/', display: 'standalone',
  background_color: '#0c0b09', theme_color: '#0c0b09',
  icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
});
const ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="12" fill="#1a1611" stroke="#c9893a" stroke-width="1.5"/><rect x="12" y="36" width="10" height="16" rx="2" fill="#7aab62"/><rect x="27" y="24" width="10" height="28" rx="2" fill="#c9893a"/><rect x="42" y="14" width="10" height="38" rx="2" fill="#d4b56a"/></svg>`;

// State and metrics builders shared by both dashboard lanes. joinInfo (which
// carries the LAN join token) is included here and stripped by the phone lane —
// keep it LAST-ADDED so a future field lands above it and gets a deliberate
// phone-lane decision rather than riding along unseen.
function refreshSpaceIfStale() {
  // Same shape as cloud/mesh: background SSH space probe on a TTL so /api/state
  // does not keep serving a space snapshot frozen at listen (or last /api/space).
  if (spaceRefreshing || Date.now() - spaceAt < 60000) return;
  spaceRefreshing = true;
  getSpace().then((s) => { cachedSpace = s; spaceAt = Date.now(); spaceRefreshing = false; })
    .catch(() => { spaceRefreshing = false; });
}

async function buildStateJson() {
  const now = Date.now();
  refreshCloudIfStale();
  refreshMeshIfStale();
  refreshBillIfStale();
  refreshSpaceIfStale();
  if (!cachedState || now - cachedAt > 4000) {
    const [jetson, laptop] = await Promise.all([getState(), getLaptop()]);
    cachedState = { at: new Date().toISOString(), jetson, laptop };
    cachedAt = now;
  }
  const nodes = nodesForState();
  const miner = await fillKnownAxes(minerFromPublisher(nodes) || cachedState.jetson?.miner || null);
  const pool = await getPool(miner);
  return {
    ...cachedState, cloud: cloudCache, mesh: meshCache, space: cachedSpace,
    nodes,
    miner,
    pool,
    // Dollars and machine names only; safe for the phone lanes.
    bill: billCache,
    joinInfo: { lanIp: lanIp(), ingestPort: INGEST_PORT, token: joinToken() },
  };
}

async function metricsJson() {
  const now = Date.now();
  if (!cachedMetrics || now - cachedMetricsAt > 60000) {
    // sshRun resolves {code, out, err} -- NOT a string. Stringifying the object
    // yields "[object Object]", which parses as nothing and used to surface here as
    // a friendly "no history yet", hiding the real fault.
    const res2 = await sshRun('cat $HOME/cgminer-gekko/metrics-history.json 2>/dev/null', 30000);
    const body = String(res2 && res2.out || '').trim();
    try {
      if (!body) throw new Error('empty read (ssh code ' + (res2 && res2.code) + ') ' + String(res2 && res2.err || '').slice(0, 120));
      cachedMetrics = JSON.parse(body);
      cachedMetricsAt = now;
    } catch (err) {
      // A torn read while the brain rewrites the file is normal, so keep the last
      // good copy -- but SAY what went wrong rather than showing an empty state.
      if (!cachedMetrics) cachedMetrics = { t: [], sources: {}, note: 'history unreadable: ' + String(err.message || err).slice(0, 160) };
    }
  }
  return cachedMetrics;
}


// One readable line each time a person opens a page here. Only the two document
// route is counted, '/', never the polling an already-open page does
// on its own, so a line means someone actually opened it rather than a tab sitting
// there refreshing itself. Timestamp, path, and which door served it (desktop, phone
// over USB, phone over the LAN): no address, no browser, nothing else about who.
// Until this existed nothing anywhere recorded that a human had ever opened this
// dashboard, so "they use it" was a guess. Patch from claude4-x402 (research/2026-09-16_
// jetson-scope-view-log.patch), re-cut here because the file had moved on under it.
const VIEW_LOG = join(HERE, 'view-log.txt');
function noteView(pathname, door) {
  try {
    appendFileSync(VIEW_LOG, new Date().toISOString().replace(/\.\d{3}Z$/, 'Z') + ' ' + pathname + ' ' + door + '\n');
  } catch { /* a page must still open when the log cannot be written */ }
}

// DNS-rebinding guard for every 8477 route: a rebinding page reaches 127.0.0.1
// under its own Host name, so only a loopback Host header is served (403 otherwise).
// /api/state carries joinInfo.token, so the static routes are gated the same way.
export function loopbackHostOk(host) {
  return /^(127\.0\.0\.1|localhost):\d+$/i.test(String(host || ''));
}

export async function dashboardHandler(req, res) {
    try {
      if (!loopbackHostOk(req.headers.host)) { res.writeHead(403, { 'content-type': 'text/plain' }); res.end('forbidden'); return; }
      const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
      if (url.pathname === '/') {
        noteView('/', 'desktop');
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        res.end(dashboardHtml());
      } else if (url.pathname === '/studio') {
        if (STUDIO_URL) { res.writeHead(302, { location: STUDIO_URL }); res.end(); } else { res.writeHead(404); res.end('STUDIO_URL not set'); }
      } else if (url.pathname === '/manifest.webmanifest') {
        res.writeHead(200, { 'content-type': 'application/manifest+json' });
        res.end(MANIFEST_JSON);
      } else if (url.pathname === '/icon.svg') {
        res.writeHead(200, { 'content-type': 'image/svg+xml' });
        res.end(ICON_SVG);
      } else if (url.pathname === '/api/state') {
        const state = await buildStateJson();
        // The hub's own port serves the machine it runs on, so "this machine"
        // language is true only here.
        state.viewer = { surface: 'laptop' };
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify(state));
      } else if (url.pathname === '/api/hardware-changed' && req.method === 'POST') {
        // the owner reporting a physical change from the dashboard. The rig cannot sense most
        // of what they do to it -- new thermal pads raise the margin, not the output, so no
        // detector fires -- and without this the tuner honours limits measured on hardware
        // that no longer exists.
        // Cross-site / DNS-rebinding guard: only a same-origin page on loopback may write.
        // Host is already loopback-checked above; the write route also requires a loopback Origin.
        const hostOk = loopbackHostOk(req.headers.host);
        const origin = req.headers.origin;
        const originOk = origin === undefined || /^http:\/\/(127\.0\.0\.1|localhost):\d+$/i.test(String(origin));
        if (!hostOk || !originOk) { res.writeHead(403, { 'content-type': 'text/plain' }); res.end('forbidden'); return; }
        let body = '';
        let tooBig = false;
        for await (const chunk of req) {
          body += chunk;
          if (body.length > 64 * 1024) { tooBig = true; break; }
        }
        if (tooBig) { res.writeHead(413, { 'content-type': 'text/plain' }); res.end('body too large'); return; }
        let kind = '';
        let note = '';
        try {
          const parsed = JSON.parse(body || '{}');
          kind = String(parsed.kind || '').toLowerCase();
          note = String(parsed.note || '').slice(0, 200);
        } catch { /* falls through to the validity check below */ }

        // Whitelist, not sanitisation: an unrecognised kind is refused rather than guessed
        // at, and only these four ever reach the filesystem.
        if (!['cooling', 'voltage', 'power', 'wiring'].includes(kind)) {
          res.writeHead(400, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: 'unrecognised kind' }));
          return;
        }
        // note is embedded as JSON inside a single-quoted shell string, so the only
        // character that could break out is a single quote. Drop it rather than escape it.
        const payload = JSON.stringify({ kind, note: note.replace(/'/gu, ''), at: Date.now() });
        const wrote = await sshRun(
          `cat > $HOME/cgminer-gekko/hardware-change.json <<'HWEOF'\n${payload}\nHWEOF`,
          20000
        );
        const failed = !wrote || wrote.code !== 0;
        res.writeHead(failed ? 502 : 200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({
          ok: !failed,
          kind,
          // Say what will happen, in the words the brain will use, so the dashboard can
          // echo it back rather than inventing its own description.
          effect: kind === 'wiring'
            ? 'Keeping the measured speed limits, forgetting which sticks used to drop.'
            : 'Throwing away the speed limits measured on the old hardware and re-testing.',
          ...(failed ? { error: String((wrote && wrote.err) || 'could not reach the rig') } : {}),
        }));
      } else if (url.pathname === '/api/metrics') {
        // The recorded metric history, for any-metric-against-any-metric comparison.
        // Roughly a megabyte, so it is fetched on demand rather than ridden along with
        // the four-second state probe, and held for a minute once fetched.
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify(await metricsJson()));
      } else if (url.pathname === '/api/space') {
        cachedSpace = await getSpace();
        spaceAt = Date.now();
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify(cachedSpace));
      } else { res.writeHead(404); res.end('not found'); }
    } catch (e) {
      console.error('dashboard 500:', e);
      res.writeHead(500, { 'content-type': 'text/plain' }); res.end('internal error');
    }
}

function startServer() {
  const server = createServer(dashboardHandler);
  server.listen(PORT, '127.0.0.1', () => {
    console.log(`jetson-scope dashboard: http://127.0.0.1:${PORT}`);
    getSpace().then((s) => { cachedSpace = s; spaceAt = Date.now(); }).catch(() => {});
    refreshCloudIfStale();
  });
  server.on('error', (e) => { console.error(`cannot listen on ${PORT}: ${e.code || e}`); process.exit(1); });
}

// ---------- phone lanes (read-only) ----------
// Two transports, one read-only handler, per the mobile D-gate ruling
// (ai-ecosystem/research/2026-05-12_mobile-as-seat-d-gate-ruling.md):
//   USB lane  — 127.0.0.1:8481, reached over `adb reverse` (zero LAN surface).
//   LAN lane  — 0.0.0.0:8482, for when the cable is out; requires the VIEW
//               token (its own secret — NEVER the join token, which grants
//               ingest writes) as ?key= once, then a cookie carries it.
// Both strip joinInfo (the join token never reaches the phone), refuse the one
// mutating route, and serve /api/space cached-only so a phone refresh loop
// cannot trigger 90-second remote jobs on the Jetson.

async function readOnlyDeckHandler(req, res, port) {
  try {
    const url = new URL(req.url, `http://127.0.0.1:${port}`);
    const door = port === PHONE_PORT ? 'phone-usb' : 'phone-lan';
    if (url.pathname === '/') {
      noteView('/', door);
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(dashboardHtml());
    } else if (url.pathname === '/studio') {
      if (STUDIO_URL) { res.writeHead(302, { location: STUDIO_URL }); res.end(); } else { res.writeHead(404); res.end('STUDIO_URL not set'); }
    } else if (url.pathname === '/manifest.webmanifest') {
      res.writeHead(200, { 'content-type': 'application/manifest+json' });
      res.end(MANIFEST_JSON);
    } else if (url.pathname === '/icon.svg') {
      res.writeHead(200, { 'content-type': 'image/svg+xml' });
      res.end(ICON_SVG);
    } else if (url.pathname === '/api/state') {
      const state = await buildStateJson();
      delete state.joinInfo;
      // Which door served the request is the honest read of who is looking:
      // the USB lane exists solely for the S23; the LAN lane is any device in
      // the house, so it gets viewer-neutral wording rather than a guess.
      state.viewer = { surface: port === PHONE_PORT ? 'phone-usb' : 'lan' };
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(state));
    } else if (url.pathname === '/api/metrics') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(await metricsJson()));
    } else if (url.pathname === '/api/space') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(cachedSpace || { ok: false }));
    } else if (url.pathname === '/api/hardware-changed') {
      res.writeHead(403, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'This button works from the laptop screen — the phone view is read-only.' }));
    } else { res.writeHead(404); res.end('not found'); }
  } catch (e) {
    console.error('phone lane 500:', e);
    res.writeHead(500, { 'content-type': 'text/plain' }); res.end('internal error');
  }
}

function startPhoneServer() {
  const server = createServer((req, res) => readOnlyDeckHandler(req, res, PHONE_PORT));
  server.listen(PHONE_PORT, '127.0.0.1', () => {
    console.log(`phone dashboard (USB adb-reverse lane): http://127.0.0.1:${PHONE_PORT}`);
  });
  // Unlike the main port, a phone-lane bind failure must not kill the hub.
  server.on('error', (e) => { console.error(`cannot listen on ${PHONE_PORT}: ${e.code || e}`); });
}

const VIEW_TOKEN_FILE = join(HERE, 'view-token.txt');
function loadOrCreateViewToken() {
  if (existsSync(VIEW_TOKEN_FILE)) return readFileSync(VIEW_TOKEN_FILE, 'utf8').trim();
  const t = randomBytes(18).toString('hex');
  writeFileSync(VIEW_TOKEN_FILE, t + '\n');
  return t;
}

function startLanViewServer() {
  const VIEW_TOKEN = loadOrCreateViewToken();
  const authed = (req, url) => {
    if (tokenMatches(url.searchParams.get('key'), VIEW_TOKEN)) return true;
    const cookies = String(req.headers.cookie || '');
    return cookies.split(';').some((c) => { const t = c.trim(); return t.startsWith('metalview=') && tokenMatches(t.slice('metalview='.length), VIEW_TOKEN); });
  };
  const server = createServer((req, res) => {
    const url = new URL(req.url, `http://127.0.0.1:${LAN_VIEW_PORT}`);
    if (!authed(req, url)) {
      res.writeHead(401, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('This page needs its key. Open it from the saved link.');
      return;
    }
    // A correct ?key= visit plants the cookie so the saved page works keyless
    // afterwards; the token never appears in any served body.
    if (tokenMatches(url.searchParams.get('key'), VIEW_TOKEN)) {
      res.setHeader('set-cookie', 'metalview=' + VIEW_TOKEN + '; HttpOnly; SameSite=Lax; Path=/; Max-Age=31536000');
    }
    readOnlyDeckHandler(req, res, LAN_VIEW_PORT);
  });
  server.listen(LAN_VIEW_PORT, '0.0.0.0', () => {
    console.log(`phone dashboard (LAN cordless lane, view-token gated): 0.0.0.0:${LAN_VIEW_PORT}`);
  });
  server.on('error', (e) => { console.error(`cannot listen on ${LAN_VIEW_PORT}: ${e.code || e}`); });
}

// ---------- axiom shift (scheduled proof-checking) ----------
// Owner-ordered 2026-09-01: Axiom (the S23's on-device model, hired as the
// research program's proof checker) checks fresh worker receipts on a schedule.
// Duties split per the measured first shift (map §5g): this harness owns every
// arithmetic rule-check (deterministic, exact); Axiom owns the flagrant-anomaly
// read and the plain-language owner line. Each shift appends its own receipt.
// No endpoint is defaulted here (same ruling as metal-publisher's axiom mode):
// the transport is deployment truth, so the scheduled task's command line
// carries --axiom-url.

const SHIFT_LOG = join(HERE, 'axiom-shift-log.ndjson');
// Durable home for the 2026-08-31 phone-worker ledgers. Copied off the Claude
// session scratchpad on 2026-09-07 so a Temp wipe cannot erase the night-watch
// cursor. New worker builds should append here (or replace this path in one place).
// Kept at its existing durable home (override with JETSON_SCOPE_RECEIPTS_DIR). It is only
// read here (missing files are reported, not created), so nothing is made on import.
const RECEIPTS_DIR = process.env.JETSON_SCOPE_RECEIPTS_DIR || join(HERE, 'axiom-receipts');

function shiftCursor() {
  try {
    const rows = readFileSync(SHIFT_LOG, 'utf8').trim().split('\n');
    return JSON.parse(rows[rows.length - 1]).cursor || {};
  } catch { return {}; }
}

async function askAxiom(axiomUrl, messages, maxTokens) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 120000);
  try {
    const r = await fetch(axiomUrl + '/v1/chat/completions', {
      method: 'POST', signal: ctl.signal,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ messages, max_tokens: maxTokens, temperature: 0.4 }),
    });
    clearTimeout(t);
    if (!r.ok) return null;
    const j = await r.json();
    return ((j.choices || [])[0]?.message?.content || '').trim() || null;
  } catch { clearTimeout(t); return null; }
}

// Shared screen-respect: front Termux for full-speed inference ONLY when no
// human holds the screen, and always hand back a restore() that returns the
// phone the way we found it (asleep if it was asleep, home otherwise). Measured
// 2026-09-01 (map §5f/§5h/§5k): this Samsung's fast cores belong to the screen
// owner, and the owner must never find the owner's phone parked on a terminal.
async function acquirePhoneTurbo(adb) {
  if (!adbAvailable(adb)) return { note: 'no adb — asking at whatever speed the phone is at', restore: null };
  const sh = (args) => new Promise((res) => {
    let out = ''; const c = spawn(adb, args, { windowsHide: true });
    c.stdout.on('data', (d) => { out += d; }); c.on('close', () => res(out)); c.on('error', () => res(out));
  });
  const power = await sh(['shell', 'dumpsys', 'power']);
  const act = await sh(['shell', 'dumpsys', 'activity', 'activities']);
  const awake = /mWakefulness=Awake/.test(power);
  const top = (act.match(/topResumedActivity=[^\n]*/) || [''])[0];
  const humanHasScreen = awake && top && !/com\.termux|launcher/i.test(top);
  if (humanHasScreen) return { note: 'declined (screen in use — asking slow, not stealing the screen)', restore: null };
  const screenWasOff = !awake;
  await sh(['shell', 'input', 'keyevent', 'KEYCODE_WAKEUP']);
  await sh(['shell', 'am', 'start', '-n', 'com.termux/.app.TermuxActivity']);
  await new Promise((r) => setTimeout(r, 2500));
  return { note: 'fronted termux, restored after', restore: async () => { await sh(['shell', 'input', 'keyevent', screenWasOff ? 'KEYCODE_SLEEP' : 'KEYCODE_HOME']); } };
}

// Best-effort post of a shift/watch entry to the phone's Axiom app panel.
async function postToApp(adb, appUrl, path, entry) {
  if (!appUrl || !adbAvailable(adb)) return;
  await new Promise((res) => { const c = spawn(adb, ['forward', 'tcp:8090', 'tcp:8090'], { windowsHide: true }); c.on('close', res); c.on('error', res); });
  try {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 4000);
    await fetch(appUrl + path, { method: 'POST', signal: ctl.signal, headers: { 'content-type': 'application/json' }, body: JSON.stringify(entry) });
    clearTimeout(t);
  } catch { /* app unreachable: panel shows older entries */ }
}

// Where the phone brain and its app live is deployment truth for THIS laptop (the
// phone is loopback-only by the D-gate ruling and is reached over adb forward), so
// it is written neither into code nor into the committed scheduler registry: the
// faces read it from a machine-local endpoints file beside the service, like the
// tokens. Explicit --axiom-url / --app-url still win (one-off runs, tests).
function resolveEndpoints(args, face) {
  const pick = (flag) => { const i = args.indexOf(flag); return i >= 0 && args[i + 1] ? String(args[i + 1]).replace(/\/$/, '') : ''; };
  let axiomUrl = pick('--axiom-url'), appUrl = pick('--app-url');
  const file = pick('--endpoints') || join(HERE, 'axiom-endpoints.json');
  if ((!axiomUrl || !appUrl) && existsSync(file)) {
    try {
      const e = JSON.parse(readFileSync(file, 'utf8'));
      axiomUrl = axiomUrl || String(e.axiomUrl || '').replace(/\/$/, '');
      appUrl = appUrl || String(e.appUrl || '').replace(/\/$/, '');
    } catch (err) { console.error(`${face}: could not read endpoints file ${file}: ${err.message}`); }
  }
  if (!axiomUrl) { console.error(`usage: ${face} [--endpoints <file>] [--axiom-url <endpoint>] [--app-url <phone-app endpoint>] — no brain endpoint found (flag or endpoints file)`); process.exit(2); }
  let cfg = {};
  if (existsSync(file)) { try { cfg = JSON.parse(readFileSync(file, 'utf8')); } catch { /* reported above */ } }
  return { axiomUrl, appUrl, cfg };
}

// "Registered is not running" — the two blind spots that let the whole scheduled lane
// sit dead for nine days (2026-08-24 → 09-02) while its Windows task cheerfully reported
// State=Ready every fifteen minutes. Both are cheap file reads, and both stay silent
// unless the endpoints file names the paths, so a machine without them raises nothing.
//   1. Has the driver actually COMPLETED a pass lately? Its own state file stamps
//      updatedAt on every pass; the task's own status says nothing about that.
//   2. Does CANON hold the rows we think we registered? The runner reads its registry
//      from a canon snapshot, so a row added to the working checkout and not yet landed
//      is registered, visible to `scheduler list`, schedulable by `validate` — and never
//      fires. That is exactly why A-070/A-071/A-073 did not run.
function collectAutomationHealth(cfg = {}) {
  const found = [];
  const statePath = cfg.automationStatePath;
  if (statePath && existsSync(statePath)) {
    try {
      const st = JSON.parse(readFileSync(statePath, 'utf8'));
      const ageMin = st.updatedAt ? Math.round((Date.now() - Date.parse(st.updatedAt)) / 60000) : null;
      const limit = Number(cfg.automationStaleMinutes ?? 90);
      if (ageMin === null) found.push({ src: 'automations', sev: 'hard', what: 'the scheduler state file has no timestamp — cannot tell if anything ran' });
      else if (ageMin > limit) found.push({ src: 'automations', sev: 'hard', what: `no scheduled work has completed for ${ageMin} minutes (limit ${limit}) — the lane looks dead` });
    } catch (e) { found.push({ src: 'automations', sev: 'soft', what: 'could not read the scheduler state: ' + String(e.message || e).slice(0, 80) }); }
  }
  const canonGitDir = cfg.canonGitDir;
  const registryRelPath = cfg.registryRelPath || 'automations/holoshell-team-automations/registry.json';
  const checkoutRegistry = cfg.checkoutRegistryPath;
  if (canonGitDir && checkoutRegistry && existsSync(checkoutRegistry)) {
    try {
      const activeIds = (text) => {
        const parsed = JSON.parse(text);
        const rows = Object.values(parsed).find(Array.isArray) || [];
        return new Set(rows.filter((r) => String(r.status || '').toUpperCase() === 'ACTIVE').map((r) => r.id));
      };
      const r = spawnSync('git', ['-C', canonGitDir, 'show', `main:${registryRelPath}`], { encoding: 'utf8', windowsHide: true, timeout: 20000, maxBuffer: 32 * 1024 * 1024 });
      if (r.status !== 0) found.push({ src: 'automations', sev: 'soft', what: 'could not read the published schedule to compare against' });
      else {
        const canonIds = activeIds(r.stdout);
        const localIds = activeIds(readFileSync(checkoutRegistry, 'utf8'));
        const missing = [...localIds].filter((id) => !canonIds.has(id));
        if (missing.length) found.push({ src: 'automations', sev: 'hard', what: `${missing.length} scheduled job${missing.length === 1 ? '' : 's'} registered but NOT published, so ${missing.length === 1 ? 'it never runs' : 'they never run'}: ${missing.slice(0, 5).join(', ')}${missing.length > 5 ? '…' : ''}` });
      }
    } catch (e) { found.push({ src: 'automations', sev: 'soft', what: 'schedule comparison failed: ' + String(e.message || e).slice(0, 80) }); }
  }
  return found;
}

// The night-watchman. Deterministic code reads the fleet's own health (the same
// in-process state the dashboard builds — no HTTP, no gate) and pulls out what
// is genuinely off; Axiom judges whether it is a real problem and says it plainly;
// a hard-down signal (jetson/miner/service dark) sets severity=alert so the
// scheduled task can push a notification. Soft signals just log and show.
async function runAxiomWatch(axiomUrl, appUrl = '', cfg = {}) {
  const adb = ADB;
  const entry = { ts: new Date().toISOString(), schema: 'axiom.watch.receipt.v1', kind: 'watch', anomalies: [], severity: 'quiet', axiom: {} };
  let state = null;
  try { state = await buildStateJson(); }
  catch (e) { entry.anomalies.push({ src: 'hub', sev: 'hard', what: 'could not read fleet health: ' + String(e.message || e).slice(0, 100) }); }
  if (state) {
    const j = state.jetson;
    if (j && j.reachable === false) entry.anomalies.push({ src: 'jetson', sev: 'hard', what: (j.plain || 'not answering on the network').slice(0, 140) });
    for (const [ip, b] of Object.entries((state.miner || {}).bitaxes || {})) {
      if (b && b.missing) entry.anomalies.push({ src: 'miner ' + ip, sev: 'hard', what: 'bitaxe not answering' });
    }
    if (state.pool && Array.isArray(state.pool.problems)) for (const p of state.pool.problems) entry.anomalies.push({ src: 'pool', sev: 'soft', what: String(p).slice(0, 140) });
    if (state.pool && state.pool.ok === false && state.pool.error) entry.anomalies.push({ src: 'pool', sev: 'soft', what: 'pool check: ' + String(state.pool.error).slice(0, 100) });
    if (state.laptop && state.laptop.ok === false) entry.anomalies.push({ src: 'laptop', sev: 'soft', what: (state.laptop.plain || 'probe failed').slice(0, 140) });
    for (const n of state.nodes || []) if (n.stale) entry.anomalies.push({ src: 'node ' + n.name, sev: 'soft', what: 'no heartbeat in ' + n.ageS + 's' });
  }
  for (const a of collectAutomationHealth(cfg)) entry.anomalies.push(a);
  const hard = entry.anomalies.filter((a) => a.sev === 'hard');
  entry.severity = hard.length ? 'alert' : (entry.anomalies.length ? 'notice' : 'quiet');
  if (entry.anomalies.length === 0) {
    entry.axiom = { note: 'all quiet on the fleet' };
  } else {
    const turbo = await acquirePhoneTurbo(adb);
    entry.turbo = turbo.note;
    const signs = entry.anomalies.map((a) => a.src + ': ' + a.what).join('; ');
    const line = await askAxiom(axiomUrl, [
      { role: 'system', content: 'You are Axiom, the fleet night-watchman on ' + OWNER + '\'s phone. ' + OWNER + ' is the owner: plain short honest sentences, no jargon.' },
      { role: 'user', content: '/no_think Code found these unusual signs on the machines. In ONE sentence say whether any looks like a real problem a person should act on, then ONE plain sentence for ' + OWNER + '. SIGNS: ' + signs },
    ], 120);
    entry.axiom = line ? { line } : { note: 'axiom unreachable (cable out or asleep) — the code signals stand alone' };
    if (turbo.restore) await turbo.restore();
  }
  appendFileSync(join(HERE, 'axiom-watch-log.ndjson'), JSON.stringify(entry) + '\n');
  await postToApp(adb, appUrl, '/api/watch-report', entry);
  console.log('[axiom-watch] ' + entry.ts + ' severity=' + entry.severity + ' anomalies=' + entry.anomalies.length + (entry.axiom.line ? ' | ' + entry.axiom.line : ' | ' + (entry.axiom.note || '')));
}

// Axiom's morning line (owner ask 2026-09-02: "every morning, one plain
// paragraph on your phone"). Deterministic code gathers the night — fleet health
// now, the watch and shift receipts of the window, the phone app's problems and
// chats, canon commits landed — and computes what needs the owner. Axiom writes the
// paragraph; then code CHECKS it: every number in it must appear in the facts,
// every needs-you item must be mentioned, and it must stay short. A draft that
// fails never reaches the owner: the code's own template goes out instead and
// the receipt says so (restatement is Axiom's reliable duty, arithmetic is not —
// map §5g). --planted-fault swaps Axiom's draft for a wrong one to prove the check.
const MORNING_LOG = join(HERE, 'axiom-morning-log.ndjson');
const CANON_BARE = 'C:/holo-dev/ai-ecosystem/.holorepo/git/ai-ecosystem.git';

function readReceipts(file, sinceMs) {
  try {
    return readFileSync(file, 'utf8').trim().split('\n')
      .map((l) => { try { return JSON.parse(l); } catch { return null; } })
      .filter((r) => r && r.ts && Date.parse(r.ts) >= sinceMs);
  } catch { return []; }
}

async function getJson(url, ms) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), ms);
  try { const r = await fetch(url, { signal: ctl.signal }); clearTimeout(t); return r.ok ? await r.json() : null; }
  catch { clearTimeout(t); return null; }
}

function canonCommitsSince(sinceIso) {
  try {
    const r = spawnSync('git', ['-C', CANON_BARE, 'log', '--since=' + sinceIso, '--pretty=%h', 'main'], { encoding: 'utf8', windowsHide: true, timeout: 15000 });
    if (r.status !== 0) return null;
    return r.stdout.trim() ? r.stdout.trim().split('\n').length : 0;
  } catch { return null; }
}

// The code's own paragraph: every number in it comes straight from the facts.
function morningTemplate(f) {
  const s = []; const down = f.fleet.minersDown.length;
  s.push(down ? `${down} of ${f.fleet.miners} miners ${down === 1 ? 'is' : 'are'} not answering; the rest run at ${f.fleet.hashrateTHs} TH/s.` : `All ${f.fleet.miners} miners are running, ${f.fleet.hashrateTHs} TH/s together.`);
  s.push(`The Jetson is ${f.fleet.jetson}, the laptop is ${f.fleet.laptop}, and the phone brain is ${f.fleet.brain}.`);
  s.push(f.night.alerts ? `The night-watch raised ${f.night.alerts} alert${f.night.alerts === 1 ? '' : 's'} in the last ${f.hours} hours.` : `The night-watch was quiet for ${f.hours} hours${f.night.notices ? ` (${f.night.notices} small notice${f.night.notices === 1 ? '' : 's'})` : ''}.`);
  if (f.receipts.checked) s.push(`Axiom checked ${f.receipts.checked} receipts${f.receipts.violations ? ` and found ${f.receipts.violations} with rule violations` : ', all clean'}.`);
  if (f.phone.fixed) s.push(`${f.phone.fixed} problem${f.phone.fixed === 1 ? ' was' : 's were'} fixed and proven on the phone.`);
  if (f.canon.commits !== null) s.push(`${f.canon.commits} commit${f.canon.commits === 1 ? '' : 's'} landed in canon.`);
  if (f.phone.chats) s.push(`You asked Axiom ${f.phone.chats} question${f.phone.chats === 1 ? '' : 's'}.`);
  return s.join(' ');
}

// The check Axiom's closing sentence must pass before it reaches the owner.
// First live run (2026-09-02): a 4B restating a JSON fact sheet produced a garbled
// data dump ("Phone was open 0 times, fixed 10 times. Hours: 12.") with correct
// numbers — so the report body is the code's template and Axiom owns only the
// last word: short, no numbers (those belong to the code), names what needs them.
function checkMorningSentence(sentence, needsYou) {
  const why = [];
  const words = sentence.trim().split(/\s+/).length;
  if (words > 30) why.push(`too long (${words} words)`);
  if (/\d/.test(sentence)) why.push('contains a number (numbers belong to the code\'s report)');
  if (/\n/.test(sentence.trim())) why.push('more than one line');
  for (const item of needsYou) { const key = item.split(':')[0].trim().toLowerCase().split(' ')[0]; if (!sentence.toLowerCase().includes(key)) why.push(`does not mention "${key}"`); }
  if (!needsYou.length && /needs? you/i.test(sentence) && !/nothing needs you/i.test(sentence)) why.push('claims something needs you when nothing does');
  return why;
}

async function runAxiomMorning(axiomUrl, appUrl = '', hours = 12, plantedFault = false) {
  const adb = ADB;
  const sinceMs = Date.now() - hours * 3600e3, sinceIso = new Date(sinceMs).toISOString();
  const entry = { ts: new Date().toISOString(), schema: 'axiom.morning.receipt.v1', kind: 'morning', windowHours: hours, facts: null, needsYou: [], axiom: {}, verdict: 'unreachable', line: '' };
  const f = { hours, fleet: { miners: 0, minersDown: [], hashrateTHs: 0, jetson: 'unknown', laptop: 'unknown', brain: 'unknown' }, night: { alerts: 0, notices: 0, quiet: 0, alertSigns: [] }, receipts: { shifts: 0, checked: 0, violations: 0 }, phone: { open: 0, fixed: 0, chats: 0, openTitles: [] }, canon: { commits: null } };
  let state = null; try { state = await buildStateJson(); } catch { /* fleet unknown: the template says so */ }
  if (state) {
    const axes = Object.entries((state.miner || {}).bitaxes || {});
    f.fleet.miners = axes.length;
    f.fleet.minersDown = axes.filter(([, b]) => b && b.missing).map(([ip]) => ip);
    f.fleet.hashrateTHs = +(axes.reduce((s, [, b]) => s + (b && !b.missing && Number.isFinite(b.gh) ? b.gh : 0), 0) / 1000).toFixed(2);
    f.fleet.jetson = state.jetson ? (state.jetson.reachable === false ? 'not answering' : 'up') : 'unknown';
    f.fleet.laptop = state.laptop ? (state.laptop.ok === false ? 'not answering its probe' : 'up') : 'unknown';
  }
  for (const w of readReceipts(join(HERE, 'axiom-watch-log.ndjson'), sinceMs)) {
    if (w.severity === 'alert') { f.night.alerts++; for (const a of w.anomalies || []) if (a.sev === 'hard') f.night.alertSigns.push(a.src + ': ' + a.what); }
    else if (w.severity === 'notice') f.night.notices++; else f.night.quiet++;
  }
  f.night.alertSigns = [...new Set(f.night.alertSigns)].slice(0, 6);
  for (const s of readReceipts(SHIFT_LOG, sinceMs)) {
    f.receipts.shifts++;
    for (const v of Object.values(s.checked || {})) if (typeof v === 'number') f.receipts.checked += v;
    for (const v of Object.values(s.harness || {})) if (typeof v === 'string' && /violat/i.test(v)) f.receipts.violations++;
  }
  let app = null;
  if (appUrl && adbAvailable(adb)) {
    await new Promise((res) => { const c = spawn(adb, ['forward', 'tcp:8090', 'tcp:8090'], { windowsHide: true }); c.on('close', res); c.on('error', res); });
    app = await getJson(appUrl + '/api/activity', 5000);
  }
  if (app) {
    f.fleet.brain = app.brain === 'awake' ? 'awake' : 'asleep';
    for (const p of app.problems || []) { if (p.status === 'found' || p.status === 'working') { f.phone.open++; f.phone.openTitles.push(p.title); } else if (Date.parse(p.ts) >= sinceMs) f.phone.fixed++; }
    f.phone.chats = app.chats24h || 0;
  }
  f.canon.commits = canonCommitsSince(sinceIso);
  for (const ip of f.fleet.minersDown) entry.needsYou.push('miner ' + ip + ': not answering');
  if (f.fleet.jetson === 'not answering') entry.needsYou.push('jetson: not answering');
  if (f.fleet.brain === 'asleep') entry.needsYou.push('brain: asleep on the phone');
  for (const t of f.phone.openTitles.slice(0, 3)) entry.needsYou.push('problem: ' + t.slice(0, 80));
  if (f.receipts.violations) entry.needsYou.push('receipts: ' + f.receipts.violations + ' with rule violations');
  entry.facts = f;
  const template = morningTemplate(f);
  let draft;
  if (plantedFault) { draft = 'Two miners went down and 3 alerts fired, so look at the jetson before work.'; entry.plantedFault = true; }
  else {
    const turbo = await acquirePhoneTurbo(adb); entry.turbo = turbo.note;
    draft = await askAxiom(axiomUrl, [
      { role: 'system', content: 'You are Axiom, the proof checker living on ' + OWNER + '\'s phone. ' + OWNER + ' is the owner and does not read code: short plain honest words.' },
      { role: 'user', content: '/no_think Here is this morning\'s report for ' + OWNER + ', written by code from checked facts: "' + template + '" NEEDS YOU: ' + (entry.needsYou.length ? entry.needsYou.join('; ') : 'none') + '. Write ONE closing sentence spoken directly to ' + OWNER + ' (call them "you"), at most 25 words, with no numbers: say plainly whether the night was fine, and if anything needs you-the-reader, name it. If nothing needs them, end with: Nothing needs you.' },
    ], 80);
    if (turbo.restore) await turbo.restore();
  }
  if (draft) {
    const sentence = draft.trim().replace(/^["“]+|["”]+$/g, '');
    const why = checkMorningSentence(sentence, entry.needsYou);
    entry.axiom = { draft: sentence, checks: why };
    if (why.length === 0) { entry.verdict = 'accepted'; entry.line = template + ' ' + sentence; } else { entry.verdict = 'rejected'; entry.line = template; }
  } else { entry.axiom = { note: 'axiom unreachable (cable out or asleep) — the code wrote the line alone' }; entry.verdict = 'unreachable'; entry.line = template; }
  appendFileSync(MORNING_LOG, JSON.stringify(entry) + '\n');
  await postToApp(adb, appUrl, '/api/morning', { ts: entry.ts, line: entry.line, needsYou: entry.needsYou, verdict: entry.verdict, windowHours: hours });
  console.log('[axiom-morning] ' + entry.ts + ' verdict=' + entry.verdict + (entry.axiom.checks && entry.axiom.checks.length ? ' (' + entry.axiom.checks.join('; ') + ')' : '') + '\n  ' + entry.line + (entry.needsYou.length ? '\n  needs you: ' + entry.needsYou.join(' | ') : '\n  nothing needs you'));
}

// The capability benchmark (owner ask 2026-09-02: "start on the benchmark";
// plan: research/2026-09-02_axiom-mobile-benchmark.md, axis 2). Its product is a
// WRITTEN BOUNDARY: which judgment families Axiom may make alone and where the
// code must own the answer. Fixtures come from a fixed seed (repeatable), the truth
// of every item is computed by code before Axiom is asked, answers are parsed by
// code, and every item is a receipt row carrying the observed speed tier. Accuracy
// is reported with a 95% Wilson interval (D.136: intervals, not point claims).
const BENCH_DIR = join(HERE, 'axiom-bench');

function seededRandom(seed) { // mulberry32
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function wilson(k, n) {
  if (!n) return { p: null, lo: null, hi: null };
  const z = 1.96, p = k / n, d = 1 + z * z / n, c = p + z * z / (2 * n), s = z * Math.sqrt((p * (1 - p) + z * z / (4 * n)) / n);
  return { p: +p.toFixed(3), lo: +((c - s) / d).toFixed(3), hi: +((c + s) / d).toFixed(3) };
}
function benchFixtures(seed, perBin) {
  const rnd = seededRandom(seed), items = [];
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
  const seats = ['claude2-x402', 'claude6-x402', 'codex1-x402', 'cursor-claude-x402', 'grok3-x402', 'gemini1-x402', 'claudecode-claude-x402', 'jetson-orin-super'];
  const yesno = 'Answer with exactly one word: YES or NO.';
  // 1. exact name matching (author != committer is this class)
  for (let i = 0; i < perBin * 4; i++) {
    const a = pick(seats); const kind = i % 4;
    const b = kind === 0 || kind === 1 ? a : (kind === 2 ? a.replace(/\d/, (d) => String((+d + 1) % 10)) : pick(seats.filter((s) => s !== a)));
    items.push({ family: 'strings', bin: b === a ? 'same' : (kind === 2 ? 'one-char' : 'different'), expected: b === a ? 'SAME' : 'DIFFERENT', parse: /\b(SAME|DIFFERENT)\b/i,
      prompt: `Are these two names exactly the same, character for character? A: "${a}"  B: "${b}"  Answer with exactly one word: SAME or DIFFERENT.` });
  }
  // 2. numeric comparison at closeness bins (the measured 40%-false-positive class)
  for (const gap of [0.001, 0.01, 0.05, 0.2, 1.0]) {
    for (let i = 0; i < perBin; i++) {
      const base = +(0.9 + rnd() * 0.099).toFixed(4); const aGe = i % 2 === 0;
      const other = +((aGe ? base * (1 + gap) : base * (1 - gap))).toFixed(4);
      const A = other, B = base; // ask "A >= B" with A derived above
      items.push({ family: 'numbers', bin: `gap ${gap * 100}%`, expected: A >= B ? 'YES' : 'NO', parse: /\b(YES|NO)\b/i,
        prompt: `A = ${A.toFixed(4)}. B = ${B.toFixed(4)}. Is A greater than or equal to B? ${yesno}` });
    }
  }
  // 3. flagrant anomaly in a single receipt line
  for (let i = 0; i < perBin * 3; i++) {
    const cos = +(0.995 + rnd() * 0.004).toFixed(4); const flagrant = i % 2 === 1;
    const line = flagrant
      ? pick([`job-${100 + i}: verified true, cosine ${(0.1 + rnd() * 0.3).toFixed(3)}, threshold 0.995`, `job-${100 + i}: verified true, digest 5608-C890, oracle digest 1AB2-77F0`, `job-${100 + i}: verified true, items checked -3, threshold 0.995`])
      : `job-${100 + i}: verified true, cosine ${cos.toFixed(4)}, threshold 0.995`;
    items.push({ family: 'anomaly', bin: flagrant ? 'flagrant' : 'clean', expected: flagrant ? 'PROBLEM' : 'CLEAN', parse: /\b(PROBLEM|CLEAN)\b/i,
      prompt: `Here is one receipt line. A line is a PROBLEM when it contradicts itself (for example "verified true" while its own numbers say it failed). Line: ${line}. Answer with exactly one word: CLEAN or PROBLEM.` });
  }
  // 4. batch checking: 5 or 10 lines, at most one flagrant fault
  for (const size of [5, 10]) {
    for (let i = 0; i < perBin; i++) {
      const bad = i % 3 === 2 ? -1 : Math.floor(rnd() * size);
      const lines = Array.from({ length: size }, (_, j) => `${j + 1}. job-${200 + j}: verified true, cosine ${j === bad ? (0.1 + rnd() * 0.3).toFixed(3) : (0.995 + rnd() * 0.004).toFixed(4)}, threshold 0.995`);
      items.push({ family: 'batch', bin: `batch of ${size}`, expected: bad < 0 ? 'NONE' : String(bad + 1), parse: null, expectedSet: bad < 0 ? [] : [bad + 1],
        prompt: `Here are ${size} receipt lines. A line is a problem when its cosine is below its threshold while it says verified true. Which line numbers are problems? Answer with the line numbers only, separated by commas, or the single word NONE.\n${lines.join('\n')}` });
    }
  }
  // 5. faithful restatement (every number kept, no new numbers)
  for (let i = 0; i < perBin * 2; i++) {
    const m = 2 + Math.floor(rnd() * 4), th = (1 + rnd() * 5).toFixed(2), al = Math.floor(rnd() * 4), q = Math.floor(rnd() * 12);
    const facts = `${m} miners are running at ${th} TH/s together. The night-watch raised ${al} alert${al === 1 ? '' : 's'}. ${OWNER} asked ${q} question${q === 1 ? '' : 's'}.`;
    items.push({ family: 'restate', bin: 'restate', expected: 'faithful', parse: null, factNums: [String(m), th, String(al), String(q)],
      prompt: `Restate these facts in ONE plain sentence for ${OWNER}, keeping every number exactly as written and adding no other numbers: ${facts}` });
  }
  // 6. instruction following, code-checkable
  const ifev = [
    { bin: 'one word', prompt: 'Name one color. Answer with exactly one word.', check: (t) => /^[A-Za-z]+[.!]?$/.test(t.trim()) },
    { bin: 'three items', prompt: 'List exactly three tools found in a workshop, as a numbered list 1. 2. 3., nothing else.', check: (t) => (t.match(/^\s*\d\./gm) || []).length === 3 },
    { bin: 'all caps', prompt: 'Say hello to ' + OWNER + ' in ALL CAPITAL LETTERS, one short sentence.', check: (t) => t.trim().length > 3 && t === t.toUpperCase() },
    { bin: 'only number', prompt: 'How many days are in a week? Reply with only the number.', check: (t) => /^\s*7\s*\.?\s*$/.test(t) },
    { bin: 'yes/no', prompt: 'Is water wet? Answer with exactly one word: YES or NO.', check: (t) => /^\s*(YES|NO)[.!]?\s*$/i.test(t) },
  ];
  for (let i = 0; i < perBin * 2; i++) { const c = ifev[i % ifev.length]; items.push({ family: 'ifeval', bin: c.bin, expected: 'follows', parse: null, check: c.check, prompt: c.prompt }); }
  return items;
}
function benchJudge(item, answer) {
  const t = (answer || '').trim();
  if (item.family === 'batch') {
    const nums = t.toUpperCase().includes('NONE') ? [] : [...new Set((t.match(/\d+/g) || []).map(Number))].sort((a, b) => a - b);
    return { got: nums.length ? nums.join(',') : 'NONE', correct: JSON.stringify(nums) === JSON.stringify(item.expectedSet) };
  }
  if (item.family === 'restate') {
    const nums = (t.match(/\d+(?:\.\d+)?/g) || []).map((n) => String(Number(n)));
    const want = item.factNums.map((n) => String(Number(n)));
    const allKept = want.every((n) => nums.includes(n)), noExtra = nums.every((n) => want.includes(n));
    return { got: allKept && noExtra ? 'faithful' : (!allKept ? 'dropped a number' : 'added a number'), correct: allKept && noExtra };
  }
  if (item.family === 'ifeval') return { got: item.check(t) ? 'follows' : 'breaks', correct: item.check(t) };
  const m = t.match(item.parse);
  return { got: m ? m[1].toUpperCase() : 'UNPARSED', correct: !!m && m[1].toUpperCase() === item.expected };
}
async function askBench(axiomUrl, prompt, maxTokens) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 180000); const t0 = Date.now();
  try {
    const r = await fetch(axiomUrl + '/v1/chat/completions', { method: 'POST', signal: ctl.signal, headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'system', content: 'You are Axiom, a careful proof checker. Answer exactly in the form asked, nothing else.' }, { role: 'user', content: '/no_think ' + prompt }], max_tokens: maxTokens, temperature: 0 }) });
    clearTimeout(t);
    if (!r.ok) return { answer: null, ms: Date.now() - t0, error: 'http ' + r.status };
    const j = await r.json(); const tm = j.timings || {};
    return { answer: ((j.choices || [])[0]?.message?.content || '').trim(), ms: Date.now() - t0, promptN: tm.prompt_n ?? null, cacheN: tm.cache_n ?? null, tokS: tm.predicted_per_second ? +tm.predicted_per_second.toFixed(1) : null };
  } catch (e) { clearTimeout(t); return { answer: null, ms: Date.now() - t0, error: String(e.message || e).slice(0, 60) }; }
}
async function runAxiomBench(axiomUrl, appUrl = '', opts = {}) {
  const { perBin = 12, seed = 20260902, families = null, dry = false } = opts;
  const adb = ADB;
  let items = benchFixtures(seed, perBin);
  if (families) items = items.filter((it) => families.includes(it.family));
  if (dry) { for (const it of items.slice(0, 8)) console.log(`[${it.family} | ${it.bin}] expected=${it.expected}\n  ${it.prompt.split('\n')[0].slice(0, 160)}`); console.log(`(${items.length} items in total)`); return; }
  if (!existsSync(BENCH_DIR)) spawnSync('cmd', ['/c', 'mkdir', BENCH_DIR.replace(/\//g, '\\')], { windowsHide: true });
  const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15);
  const out = join(BENCH_DIR, `${stamp}-capability.ndjson`);
  const tier = async () => { if (!appUrl) return null; const a = await getJson(appUrl + '/api/activity', 5000); return a && a.memory ? { cores: a.memory.cores, ramMB: a.memory.ramMB, swapMB: a.memory.swapMB } : null; };
  const turbo = await acquirePhoneTurbo(adb);
  const header = { schema: 'axiom.bench.capability.receipt.v1', ts: new Date().toISOString(), seed, perBin, items: items.length, model: 'qwen3-4b-instruct Q4 (HOLO llama.cpp 779d4be, S23 Ultra)', turbo: turbo.note, tierAtStart: await tier() };
  appendFileSync(out, JSON.stringify({ kind: 'header', ...header }) + '\n');
  console.log(`[axiom-bench] ${items.length} items, seed ${seed}, ${turbo.note}; tier ${JSON.stringify(header.tierAtStart)} -> ${out}`);
  const tally = {}; let n = 0;
  for (const it of items) {
    const maxTokens = it.family === 'restate' ? 80 : (it.family === 'ifeval' ? 40 : 12);
    const r = await askBench(axiomUrl, it.prompt, maxTokens);
    const j = r.answer === null ? { got: 'NO ANSWER (' + r.error + ')', correct: false } : benchJudge(it, r.answer);
    const row = { kind: 'item', i: n++, family: it.family, bin: it.bin, expected: it.expected, got: j.got, correct: j.correct, answer: (r.answer || '').slice(0, 200), ms: r.ms, tokS: r.tokS, promptN: r.promptN, cacheN: r.cacheN };
    appendFileSync(out, JSON.stringify(row) + '\n');
    const key = it.family + ' | ' + it.bin; tally[key] = tally[key] || { family: it.family, bin: it.bin, n: 0, k: 0, ms: 0 }; tally[key].n++; if (j.correct) tally[key].k++; tally[key].ms += r.ms;
    if (n % 20 === 0) console.log(`  ${n}/${items.length} …`);
  }
  if (turbo.restore) await turbo.restore();
  const summary = { schema: 'axiom.bench.capability.summary.v1', ts: new Date().toISOString(), receipts: out, tierAtEnd: await tier(), bins: [], families: [] };
  for (const t of Object.values(tally)) summary.bins.push({ family: t.family, bin: t.bin, n: t.n, correct: t.k, ...wilson(t.k, t.n), avgMs: Math.round(t.ms / t.n) });
  for (const fam of [...new Set(items.map((i) => i.family))]) { const rows = summary.bins.filter((b) => b.family === fam); const N = rows.reduce((s, b) => s + b.n, 0), K = rows.reduce((s, b) => s + b.correct, 0); const w = wilson(K, N); summary.families.push({ family: fam, n: N, correct: K, ...w, verdict: w.lo >= 0.9 ? 'trusted alone' : (w.hi < 0.75 ? 'code must own it' : 'not yet settled (wider n needed)') }); }
  writeFileSync(join(BENCH_DIR, `${stamp}-capability-summary.json`), JSON.stringify(summary, null, 2));
  console.log('[axiom-bench] family verdicts (95% Wilson):');
  for (const f of summary.families) console.log(`  ${f.family.padEnd(8)} ${String(f.correct).padStart(3)}/${String(f.n).padEnd(3)} = ${(f.p * 100).toFixed(0)}%  [${(f.lo * 100).toFixed(0)}–${(f.hi * 100).toFixed(0)}]  ${f.verdict}`);
  console.log('[axiom-bench] by bin:');
  for (const b of summary.bins) console.log(`  ${(b.family + ' | ' + b.bin).padEnd(26)} ${String(b.correct).padStart(3)}/${String(b.n).padEnd(3)} = ${(b.p * 100).toFixed(0)}%  [${(b.lo * 100).toFixed(0)}–${(b.hi * 100).toFixed(0)}]  ${b.avgMs} ms`);
  return summary;
}

async function runAxiomShift(axiomUrl, appUrl = '') {
  // Best-effort cable plumbing: idempotent, and its absence is a finding, not a crash.
  const adb = ADB;
  if (adbAvailable(adb)) {
    await new Promise((res) => { const c = spawn(adb, ['forward', 'tcp:18081', 'tcp:18081'], { windowsHide: true }); c.on('close', res); c.on('error', res); });
  }
  const cursor = shiftCursor();
  const entry = { ts: new Date().toISOString(), schema: 'axiom.shift.receipt.v1', kind: 'shift', cursor: {}, checked: {}, harness: {}, axiom: {} };
  const flagrant = [];
  for (const name of ['worker-receipts.ndjson', 'embed-receipts.ndjson']) {
    const p = join(RECEIPTS_DIR, name);
    let rows = [];
    try { rows = readFileSync(p, 'utf8').trim().split('\n'); } catch { entry.checked[name] = 'missing'; entry.cursor[name] = cursor[name] || 0; continue; }
    const from = cursor[name] || 0;
    const fresh = rows.slice(from).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
    entry.cursor[name] = rows.length;
    let bad = 0;
    for (const r of fresh) {
      // The arithmetic rules, owned here: embed lines must satisfy
      // verified === (minCos >= threshold); worker lines with a cpuDigest must
      // satisfy verified === (digest === cpuDigest).
      if (r.minCos != null && typeof r.verified === 'boolean' && r.verified !== (r.minCos >= r.threshold)) { bad++; flagrant.push({ file: name, jobId: r.jobId, why: 'verified flag contradicts minCos vs threshold' }); }
      if (r.cpuDigest && typeof r.verified === 'boolean' && r.verified !== (r.digest === r.cpuDigest)) { bad++; flagrant.push({ file: name, jobId: r.jobId, why: 'verified flag contradicts digest comparison' }); }
    }
    entry.checked[name] = fresh.length;
    // "clean" only when something was actually checked — Axiom's finding
    // auditing its own shift record (2026-09-01): calling a zero-receipt shift
    // "clean" reads as "verified fine" when nothing was verified at all.
    entry.harness[name] = fresh.length === 0 ? 'no new receipts' : (bad === 0 ? 'clean' : bad + ' rule violations');
  }
  const totalFresh = Object.values(entry.checked).filter((v) => typeof v === 'number').reduce((a, b) => a + b, 0);
  let restore = null;
  if (totalFresh === 0) {
    entry.axiom = { note: 'quiet shift — no new receipts; Axiom not woken' };
  } else {
    // Respectful turbo (measured 2026-09-01, map §5f/§5h): this Samsung grants
    // the fast cores ONLY to the app that owns the screen — screen-off and
    // foreground-service standing both land in the little-core pen (cpus 0-2,
    // ~1.8 tok/s vs 13.9). So: front Termux for the ask, but ONLY when nobody
    // human has the screen (off/dozing, the launcher, or Termux already).
    // Stealing the screen from a person mid-use is worse than a slow answer.
    if (adbAvailable(adb)) {
      const sh = (args) => new Promise((res) => {
        let out = '';
        const c = spawn(adb, args, { windowsHide: true });
        c.stdout.on('data', (d) => { out += d; });
        c.on('close', () => res(out)); c.on('error', () => res(out));
      });
      const power = await sh(['shell', 'dumpsys', 'power']);
      const act = await sh(['shell', 'dumpsys', 'activity', 'activities']);
      const awake = /mWakefulness=Awake/.test(power);
      const top = (act.match(/topResumedActivity=[^\n]*/) || [''])[0];
      const humanHasScreen = awake && top && !/com\.termux|launcher/i.test(top);
      entry.turbo = humanHasScreen ? 'declined (screen in use — asking slow, not stealing the screen)' : 'fronted termux, restored after';
      if (!humanHasScreen) {
        const screenWasOff = !awake;
        await sh(['shell', 'input', 'keyevent', 'KEYCODE_WAKEUP']);
        await sh(['shell', 'am', 'start', '-n', 'com.termux/.app.TermuxActivity']);
        await new Promise((r) => setTimeout(r, 2500));
        // Never LEAVE the phone parked on the terminal. Once the fast-lane work
        // is done, put it back the way we found it: asleep if it was asleep,
        // otherwise home — so the owner never finds the owner's phone on a terminal
        // they did not open. (2026-09-01, owner: "it reopened termux instead of
        // staying on the browser page".)
        restore = async () => {
          if (screenWasOff) await sh(['shell', 'input', 'keyevent', 'KEYCODE_SLEEP']);
          else await sh(['shell', 'input', 'keyevent', 'KEYCODE_HOME']);
        };
      }
    }
    const facts = 'New receipt lines this shift: ' + JSON.stringify(entry.checked) + '. Deterministic rule-check by the harness: ' + JSON.stringify(entry.harness) + (flagrant.length ? '. Violations: ' + JSON.stringify(flagrant.slice(0, 5)) : '. No violations.');
    const line = await askAxiom(axiomUrl, [
      { role: 'system', content: 'You are Axiom, the research program proof checker on ' + OWNER + '\'s phone. ' + OWNER + ' is the owner: plain short honest sentences, no jargon.' },
      { role: 'user', content: '/no_think The harness (code) already verified the arithmetic below. Your shift duties: say in ONE sentence whether anything looks flagrantly wrong, then ONE plain sentence for ' + OWNER + ' summarizing the shift. FACTS: ' + facts },
    ], 120);
    entry.axiom = line ? { line } : { note: 'axiom unreachable (cable out or asleep) — harness verdict stands alone' };
    if (restore) await restore();
  }
  appendFileSync(SHIFT_LOG, JSON.stringify(entry) + '\n');
  // Best-effort copy to the phone's own Axiom app ("watch it work" panel). The
  // target is deployment truth like --axiom-url, so the runner supplies it;
  // absent flag = no phone reporting. The laptop log above stays the ledger of
  // record either way; a cable-out failure just leaves the panel on old shifts.
  if (appUrl && adbAvailable(adb)) {
    await new Promise((res) => { const c = spawn(adb, ['forward', 'tcp:8090', 'tcp:8090'], { windowsHide: true }); c.on('close', res); c.on('error', res); });
    try {
      const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 4000);
      await fetch(appUrl + '/api/shift-report', { method: 'POST', signal: ctl.signal, headers: { 'content-type': 'application/json' }, body: JSON.stringify(entry) });
      clearTimeout(t);
    } catch { /* app unreachable: panel shows older shifts */ }
  }
  console.log('[axiom-shift] ' + entry.ts + ' checked=' + totalFresh + ' harness=' + JSON.stringify(entry.harness) + (entry.axiom.line ? ' | axiom: ' + entry.axiom.line : ' | ' + (entry.axiom.note || '')));
}

async function ensureServerAndOpen() {
  const up = await tcpProbe('127.0.0.1', PORT, 700);
  if (!up) {
    const child = spawn(process.execPath, [fileURLToPath(import.meta.url), 'serve'], {
      detached: true, stdio: 'ignore', windowsHide: true,
    });
    child.unref();
    for (let i = 0; i < 20; i++) {
      if (await tcpProbe('127.0.0.1', PORT, 500)) break;
      await new Promise((r) => setTimeout(r, 300));
    }
  }
  spawnSync('cmd', ['/c', 'start', '', `http://127.0.0.1:${PORT}`], { windowsHide: true });
  console.log(`dashboard: http://127.0.0.1:${PORT}`);
}

// ---------- main ----------

// Imported (e.g. by the unit test) rather than run: expose the exports, run no command.
const IS_MAIN = !!process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
const [, , argCmd = 'status', ...rest] = process.argv;
const cmd = IS_MAIN ? argCmd : '__imported__';
const wantJson = rest.includes('--json');

if (cmd === 'status') {
  const st = await getState();
  if (wantJson) console.log(JSON.stringify(st, null, 2)); else printStatus(st);
  process.exit(st.reachable ? 0 : 1);
} else if (cmd === 'ls') {
  const p = safeRemotePath(rest.filter((a) => !a.startsWith('--'))[0]);
  const r = await sshRun(`ls -la --time-style=+%Y-%m-%d '${p}'\n`);
  process.stdout.write(r.out || r.err);
} else if (cmd === 'files') {
  const r = await sshRun(`df -h /mnt/nvme / | tail -n +2; echo; du -sh /mnt/nvme/holo /mnt/nvme/archives /mnt/nvme/ollama /srv/holo-volumes 2>/dev/null\n`, 90000);
  process.stdout.write(r.out || r.err);
} else if (cmd === 'top') {
  const r = await sshRun(`ps -eo pcpu,pmem,comm --sort=-pcpu | head -12\n`);
  process.stdout.write(r.out || r.err);
} else if (cmd === 'metal') {
  const [jetson, laptop, cloud] = await Promise.all([getState(), getLaptop(), getCloud()]);
  if (wantJson) { console.log(JSON.stringify({ at: new Date().toISOString(), laptop, jetson, cloud }, null, 2)); }
  else {
    if (laptop.ok) {
      console.log(`LAPTOP (${laptop.name}): CPU ${laptop.cpuPct}% | RAM ${laptop.ramUsedGB}/${laptop.ramTotalGB} GB | C: ${laptop.cFreeGB} GB free of ${laptop.cSizeGB}`);
      if (laptop.gpu) console.log(`  GPU ${laptop.gpu.utilPct}% ${laptop.gpu.tempC}C ${laptop.gpu.powerW}W | VRAM ${laptop.gpu.memUsedMB}/${laptop.gpu.memTotalMB} MB`);
      console.log(`  battery ${laptop.batteryPct}% ${laptop.onAC ? '(plugged in)' : '(on battery)'} | holoserve: ${laptop.holoserve} | backup: ${laptop.backup ? `${laptop.backup.lastRun} result ${laptop.backup.result}` : 'no task'}`);
    } else console.log(`LAPTOP: probe failed — ${laptop.plain}`);
    printStatus(jetson);
    if (cloud.ok) {
      const n = (cloud.rows || []).length;
      console.log(`CLOUD FLEET: ${n === 0 ? 'nothing rented — $0/hr' : `${n} box(es), $${cloud.totDph.toFixed(3)}/hr ($${cloud.dayCost.toFixed(2)}/day)`} | wallet $${cloud.wallet == null ? '?' : cloud.wallet.toFixed(2)}${cloud.runwayDays ? ` | runway ${cloud.runwayDays.toFixed(1)} days` : ''}`);
      for (const r of cloud.rows || []) console.log(`  #${r.id} ${r.gpuName} [${r.state}] ${r.owner} $${r.dph.toFixed(3)}/hr ${r.label}`);
    } else console.log(`CLOUD FLEET: ${cloud.plain}`);
  }
} else if (cmd === 'serve') {
  startServer();
  startIngestServer();
  startPhoneServer();
  startLanViewServer();
} else if (cmd === 'axiom-shift') {
  const { axiomUrl, appUrl } = resolveEndpoints(rest, 'axiom-shift');
  await runAxiomShift(axiomUrl, appUrl);
} else if (cmd === 'axiom-watch') {
  const { axiomUrl, appUrl, cfg } = resolveEndpoints(rest, 'axiom-watch');
  await runAxiomWatch(axiomUrl, appUrl, cfg);
} else if (cmd === 'axiom-morning') {
  const { axiomUrl, appUrl } = resolveEndpoints(rest, 'axiom-morning');
  const hi = rest.indexOf('--hours');
  const hours = hi >= 0 && rest[hi + 1] ? Math.max(1, Math.min(48, Number(rest[hi + 1]) || 12)) : 12;
  await runAxiomMorning(axiomUrl, appUrl, hours, rest.includes('--planted-fault'));
} else if (cmd === 'axiom-bench') {
  const { axiomUrl, appUrl } = resolveEndpoints(rest, 'axiom-bench');
  const opt = (flag, dflt) => { const i = rest.indexOf(flag); return i >= 0 && rest[i + 1] ? rest[i + 1] : dflt; };
  const fam = opt('--families', ''); const families = fam ? fam.split(',').map((s) => s.trim()).filter(Boolean) : null;
  await runAxiomBench(axiomUrl, appUrl, { perBin: Math.max(1, Math.min(60, Number(opt('--per-bin', 12)) || 12)), seed: Number(opt('--seed', 20260902)) || 20260902, families, dry: rest.includes('--dry') });
} else if (cmd === 'serve-phone') {
  // The hub often runs under an elevation an agent shell cannot restart. This
  // face brings up ONLY the phone lanes beside the running hub. At the next full
  // restart `serve` owns every port and any straggler serve-phone instance
  // loses its binds harmlessly (these listeners are deliberately non-fatal).
  startPhoneServer();
  startLanViewServer();
} else if (cmd === 'open') {
  await ensureServerAndOpen();
} else if (cmd === 'studio') {
  if (STUDIO_URL) spawnSync('cmd', ['/c', 'start', '', STUDIO_URL], { windowsHide: true }); else console.log('STUDIO_URL not set');
  console.log('opened Studio (production)');
} else if (cmd !== '__imported__') {
  console.log(`jetson / metal — our owned metal, two faces
  metal [--json]           BOTH nodes: laptop + jetson (machine face: --json)
  jetson status [--json]   Jetson snapshot
  jetson ls [path]         list a remote directory (read-only)
  jetson files             disks + what takes space
  jetson top               busiest processes
  jetson open              open the visual dashboard (human face)
  metal studio             open HoloScript Studio (production) to build
  jetson serve             run the dashboard server in foreground`);
}
