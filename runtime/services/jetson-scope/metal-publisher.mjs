#!/usr/bin/env node
// metal-publisher — the universal node publisher. Run this on ANY machine
// (Windows / Linux / Mac / Jetson, Node 18+) and it joins a Metal hub:
//
//   node metal-publisher.mjs --hub http://<hub>:8478 --token <TOKEN> [--name <label>] [--interval 10]
//
// Push model: this makes OUTBOUND requests only — no listening port, no
// firewall changes on the joining machine. Collectors are best-effort and
// soft-fail: a machine reports whatever it can measure (CPU/RAM always via
// node builtins; disks, GPU, battery, temps when the platform offers them).
// Import closure is node: builtins ONLY, so the single file is the download.
//
// Schema: holo.metal-node-snapshot.v1 (token-joined; per-node signing is the
// named upgrade in the HoloShell-native build — field reserved).

import os from 'node:os';
import { execFile } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2);
function argVal(name, dflt) {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : dflt;
}
// No --hub means "join the hub on this same machine": target our own
// hostname on the ingest port (the hub listens on all interfaces).
const DEFAULT_LOCAL_HUB = `http://${os.hostname()}:8478`;
const HUB = (argVal('--hub', DEFAULT_LOCAL_HUB) || '').replace(/\/$/, '');
let TOKEN = argVal('--token', '');
const TOKEN_FILE = argVal('--token-file', '');
if (!TOKEN && TOKEN_FILE) {
  try { TOKEN = readFileSync(TOKEN_FILE, 'utf8').trim(); } catch { /* falls through to usage */ }
}
const NAME = argVal('--name', os.hostname());
const INTERVAL_S = Math.max(3, Number(argVal('--interval', '10')) || 10);
// Axiom proxy mode: publish the S23 phone's on-device language model (it named
// itself Axiom; owner-approved 2026-08-31) as its OWN node. The phone cannot
// hold the join token (mobile D-gate ruling, ai-ecosystem/research/
// 2026-05-12_mobile-as-seat-d-gate-ruling.md), so the laptop publishes on its
// behalf and the snapshot says so. No endpoint is defaulted here on purpose:
// the transport (an adb-forwarded loopback today) is deployment truth, so the
// runner must state it with --axiom-url. In this mode NO laptop metrics are
// collected — the node must never wear the wrong body.
const AXIOM_ONLY = args.includes('--axiom-only');
const AXIOM_URL = (argVal('--axiom-url', '') || '').replace(/\/$/, '');
if (AXIOM_ONLY && !AXIOM_URL) {
  console.error('usage: --axiom-only requires --axiom-url <endpoint> (the forwarded loopback of the phone brain)');
  process.exit(2);
}

if (!HUB || !TOKEN) {
  console.error('usage: node metal-publisher.mjs --hub http://<hub>:8478 (--token <TOKEN> | --token-file <path>) [--name <label>] [--interval 10]');
  process.exit(2);
}

function run(cmd, cmdArgs, timeoutMs = 6000) {
  return new Promise((resolve) => {
    execFile(cmd, cmdArgs, { timeout: timeoutMs, windowsHide: true, encoding: 'utf8' },
      (err, stdout, stderr) => resolve({ err, stdout: stdout || '', stderr: stderr || '' }));
  });
}

// CPU busy% from two os.cpus() samples — works everywhere, no shell.
function cpuTimes() {
  let idle = 0, total = 0;
  for (const c of os.cpus()) { for (const k in c.times) { total += c.times[k]; } idle += c.times.idle; }
  return { idle, total };
}
async function cpuBusyPct(sampleMs = 600) {
  const a = cpuTimes();
  await new Promise((r) => setTimeout(r, sampleMs));
  const b = cpuTimes();
  const dt = b.total - a.total;
  return dt > 0 ? Math.round(100 * (1 - (b.idle - a.idle) / dt)) : null;
}

async function collectDisks() {
  try {
    if (process.platform === 'win32') {
      const r = await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
        'Get-PSDrive -PSProvider FileSystem | Where-Object Used | Select-Object Name,Used,Free | ConvertTo-Json -Compress']);
      let d = JSON.parse(r.stdout.trim() || '[]');
      if (!Array.isArray(d)) d = [d];
      return d.map((x) => ({ mount: x.Name + ':', usedB: x.Used, freeB: x.Free, sizeB: x.Used + x.Free }));
    }
    const r = await run('df', ['-kP']);
    return r.stdout.split('\n').slice(1).map((l) => l.trim().split(/\s+/))
      .filter((p) => p.length >= 6 && p[0].startsWith('/dev/'))
      .map((p) => ({ mount: p[5], usedB: +p[2] * 1024, freeB: +p[3] * 1024, sizeB: +p[1] * 1024 }))
      .filter((d) => d.sizeB > 2e9)
      .slice(0, 4);
  } catch { return []; }
}

async function collectGpu() {
  // NVIDIA discrete first (Windows/Linux), then Jetson tegrastats.
  const smi = await run('nvidia-smi', ['--query-gpu=name,utilization.gpu,temperature.gpu,power.draw,memory.used,memory.total', '--format=csv,noheader,nounits']);
  if (!smi.err && smi.stdout.trim()) {
    const p = smi.stdout.trim().split('\n')[0].split(/,\s*/);
    // A Jetson ships an nvidia-smi that names the GPU ("Orin (nvgpu)") and answers
    // [N/A] for every number. Taking that row hid tegrastats -- and with it the
    // board's VDD_IN watts -- from every Jetson snapshot. Only a row with a real
    // utilization reading counts; anything else falls through to tegrastats.
    if (p.length >= 6 && Number.isFinite(+p[1])) return { name: p[0], utilPct: +p[1], tempC: +p[2], powerW: +p[3], memUsedMB: +p[4], memTotalMB: +p[5] };
  }
  if (process.platform === 'linux') {
    const tg = await run('timeout', ['3', 'tegrastats', '--interval', '600'], 5000);
    const line = tg.stdout.trim().split('\n').pop() || '';
    const util = line.match(/GR3D_FREQ (\d+)%/);
    if (util) {
      const t = line.match(/gpu@([\d.]+)C/);
      const pw = line.match(/VDD_IN (\d+)mW/);
      return { name: 'Jetson integrated', utilPct: +util[1], tempC: t ? +t[1] : null, powerW: pw ? Math.round(+pw[1] / 100) / 10 : null };
    }
  }
  return null;
}

async function collectBattery() {
  try {
    if (process.platform === 'win32') {
      const r = await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
        '(Get-CimInstance Win32_Battery | Select-Object EstimatedChargeRemaining,BatteryStatus | ConvertTo-Json -Compress)']);
      const b = JSON.parse(r.stdout.trim() || 'null');
      return b ? { pct: b.EstimatedChargeRemaining, onAC: b.BatteryStatus === 2 } : null;
    }
    if (process.platform === 'linux') {
      const base = '/sys/class/power_supply';
      for (const d of readdirSync(base)) {
        if (d.startsWith('BAT')) {
          const pct = +readFileSync(`${base}/${d}/capacity`, 'utf8').trim();
          let onAC = null;
          try { onAC = readFileSync(`${base}/${d}/status`, 'utf8').trim() !== 'Discharging'; } catch {}
          return { pct, onAC };
        }
      }
    }
  } catch {}
  return null;
}

// Optional miner tracking: if this machine is the Jetson rig supervisor,
// brain-status.json is already the compact fleet picture (USB ASICs + Bitaxes).
// Other machines have no such file and report null — the hub ignores that.
async function collectMiner() {
  const p = join(os.homedir(), 'cgminer-gekko', 'brain-status.json');
  try {
    const raw = readFileSync(p, 'utf8');
    if (raw.length > 48000) return { note: 'miner status too large to publish', bytes: raw.length };
    const brain = JSON.parse(raw);
    if (!brain || typeof brain !== 'object') return null;
    if (brain.service == null && process.platform === 'linux') {
      const r = await run('systemctl', ['--user', 'is-active', 'cgminer.service']);
      brain.service = String(r.stdout || '').trim() || 'unknown';
    }
    return brain;
  } catch {
    return null;
  }
}

function collectTemps() {
  if (process.platform !== 'linux') return null;
  try {
    const base = '/sys/class/thermal';
    // Read every zone, then keep the first 10 that answer: cutting the directory
    // list first let dead zones crowd live ones out of the snapshot.
    const zones = readdirSync(base).filter((z) => z.startsWith('thermal_zone'));
    const out = [];
    for (const z of zones) {
      try {
        const type = readFileSync(`${base}/${z}/type`, 'utf8').trim();
        const t = +readFileSync(`${base}/${z}/temp`, 'utf8').trim() / 1000;
        if (t > 1 && t < 150) out.push({ zone: type, tempC: Math.round(t * 10) / 10 });
      } catch {}
    }
    return out.length ? out.slice(0, 10) : null;
  } catch { return null; }
}

async function collectAxiom() {
  const get = async (path, ms = 3000) => {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), ms);
    try { const r = await fetch(AXIOM_URL + path, { signal: ctl.signal }); clearTimeout(t); return r.ok ? r : null; }
    catch { clearTimeout(t); return null; }
  };
  const h = await get('/health');
  if (!h) return null;
  let health = null; try { health = await h.json(); } catch {}
  if (!health || health.status !== 'ok') return null;
  // Role granted by the owner ("hired", 2026-09-01) after Axiom asked for it.
  const out = { status: 'awake', name: 'Axiom', role: 'proof checker' };
  const props = await get('/props');
  if (props) {
    try {
      const p = await props.json();
      out.model = (p['default_generation_settings']?.model || p.model_path || '').split(/[\\/]/).pop() || null;
      out.ctx = p['default_generation_settings']?.n_ctx ?? p.n_ctx ?? null;
    } catch {}
  }
  return out;
}

async function axiomSnapshot() {
  const axiom = await collectAxiom();
  if (!axiom) return null;
  return {
    schema: 'holo.metal-node-snapshot.v1',
    signature: null,
    node: { name: NAME, hostname: 'SM-S918U (Termux)', platform: 'android', arch: 'aarch64', release: 'termux' },
    collected_at: new Date().toISOString(),
    uptimeS: null,
    metrics: { axiom, proxiedVia: 'laptop-usb-forward' },
  };
}

async function snapshot() {
  if (AXIOM_ONLY) return axiomSnapshot();
  const [cpuPct, disks, gpu, battery, miner] = await Promise.all([cpuBusyPct(), collectDisks(), collectGpu(), collectBattery(), collectMiner()]);
  return {
    schema: 'holo.metal-node-snapshot.v1',
    signature: null,
    node: { name: NAME, hostname: os.hostname(), platform: process.platform, arch: os.arch(), release: os.release() },
    collected_at: new Date().toISOString(),
    uptimeS: Math.round(os.uptime()),
    metrics: {
      cpuPct,
      cores: os.cpus().length,
      cpuModel: (os.cpus()[0] || {}).model || null,
      ramUsedB: os.totalmem() - os.freemem(),
      ramTotalB: os.totalmem(),
      load1: process.platform === 'win32' ? null : os.loadavg()[0],
      disks, gpu, battery,
      temps: collectTemps(),
      miner,
    },
  };
}

// Service discipline: never exit on push failure — a permanent service that
// dies when the hub reboots defeats itself. Back off to 60s while the hub is
// away, snap back to the normal interval on the first success.
let consecutiveFails = 0;
async function push() {
  try {
    const snap = await snapshot();
    if (!snap) { process.stdout.write('axiom not answering (cable out or asleep) — nothing pushed\n'); return; }
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 8000);
    const r = await fetch(`${HUB}/api/ingest`, {
      method: 'POST', signal: ctl.signal,
      headers: { 'content-type': 'application/json', 'x-metal-token': TOKEN },
      body: JSON.stringify(snap),
    });
    clearTimeout(t);
    if (r.ok) { consecutiveFails = 0; process.stdout.write(`pushed ${snap.node.name} @ ${snap.collected_at}\n`); }
    else { consecutiveFails++; console.error(`hub said ${r.status}${r.status === 401 ? ' (bad token)' : ''}`); }
  } catch (e) {
    consecutiveFails++;
    console.error(`push failed: ${e.name === 'AbortError' ? 'timeout' : e.message}`);
  }
}

async function loop() {
  for (;;) {
    await push();
    const delayS = consecutiveFails > 0 ? Math.min(60, INTERVAL_S * Math.min(6, consecutiveFails)) : INTERVAL_S;
    await new Promise((r) => setTimeout(r, delayS * 1000));
  }
}

console.log(`metal-publisher: ${NAME} (${process.platform}/${os.arch()}) -> ${HUB} every ${INTERVAL_S}s`);
await loop();
