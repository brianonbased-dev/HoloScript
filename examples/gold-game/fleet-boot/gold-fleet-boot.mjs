#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// GOLD DRIVE FLEET-BOOT — the ignition that runs when the GOLD drive is plugged in.
//
// Founder idea (2026-05-25): "whenever the GOLD-GAME and GOLD drive is plugged in
// it runs the fleet to make everything run." This composes the EXISTING launcher
// layer (gold-game server.cjs / index.html) and fleet layer (ai-ecosystem
// scripts/*) into one idempotent, tiered ignition.
//
//   node gold-fleet-boot.mjs [boot|status|stop] [--tier offline|local|cloud] [--dry-run]
//
// TIERS (read from fleet-manifest.json):
//   offline — open the game launcher            (no deps, no spend)
//   local   — live vault server + fleet monitor  (no spend)
//   cloud   — wake the vast.ai GPU fleet          (SPENDS $$ — HARD-GATED on a
//             positive budgetCapUsd; disabled by default; refuses without a cap)
//
// Idempotent: re-running won't double-start (port + pid checks). `status` reports
// what's live; `stop` stops what this script started. Reality check: Windows
// killed true autorun-on-insert — `PLUG-IN-START.bat` + the per-PC setup ps1 are
// how the plug-in actually fires this; this script is the ignition they call.
// ═══════════════════════════════════════════════════════════════════════════
import { readFileSync, existsSync, writeFileSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { spawn, execSync } from 'node:child_process';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import net from 'node:net';

const HERE = dirname(fileURLToPath(import.meta.url));
const _mArg = process.argv.indexOf('--manifest');
const MANIFEST =
  _mArg >= 0
    ? resolve(process.argv[_mArg + 1])
    : process.env.FLEET_MANIFEST
      ? resolve(process.env.FLEET_MANIFEST)
      : join(HERE, 'fleet-manifest.json');
const log = (...a) => console.log('[fleet-boot]', ...a);
const warn = (...a) => console.warn('[fleet-boot][warn]', ...a);

function loadManifest() {
  const m = JSON.parse(readFileSync(MANIFEST, 'utf8'));
  return m;
}
function pidDir(m) {
  const d = resolve(HERE, m.runtime?.pidDir || '.fleet-run');
  if (!existsSync(d)) mkdirSync(d, { recursive: true });
  return d;
}
const firstExisting = (cands) => cands.find((c) => c && existsSync(c)) || null;

function detectGoldGameBuild(m) {
  if (m.paths?.goldGameBuild && m.paths.goldGameBuild !== 'auto') return m.paths.goldGameBuild;
  return firstExisting([
    'D:/GOLD-GAME',
    'D:/GOLD/assets/game/gold-game',
    join(HERE, '..', 'assets', 'game', 'gold-game'),
    join(HERE, '..', '..', 'GOLD-GAME'),
  ]);
}
function detectEcosystemScripts(m) {
  if (m.paths?.aiEcosystemScripts && m.paths.aiEcosystemScripts !== 'auto')
    return m.paths.aiEcosystemScripts;
  return firstExisting([
    join(homedir(), '.ai-ecosystem', 'scripts'),
    'C:/Users/Josep/.ai-ecosystem/scripts',
  ]);
}

function portInUse(port, host = '127.0.0.1', timeout = 600) {
  return new Promise((res) => {
    const s = new net.Socket();
    let done = false;
    const finish = (v) => {
      if (!done) {
        done = true;
        s.destroy();
        res(v);
      }
    };
    s.setTimeout(timeout);
    s.once('connect', () => finish(true));
    s.once('timeout', () => finish(false));
    s.once('error', () => finish(false));
    s.connect(port, host);
  });
}
async function orchestratorHealthy(url) {
  if (!url) return null;
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(5000) });
    return r.ok;
  } catch {
    return false;
  }
}

function openLauncher(file, dryRun) {
  if (dryRun) {
    log('[dry-run] would open launcher', file);
    return;
  }
  const p = process.platform;
  try {
    if (p === 'win32')
      spawn('cmd', ['/c', 'start', '', file], { detached: true, stdio: 'ignore' }).unref();
    else if (p === 'darwin') spawn('open', [file], { detached: true, stdio: 'ignore' }).unref();
    else spawn('xdg-open', [file], { detached: true, stdio: 'ignore' }).unref();
    log('opened launcher', file);
  } catch (e) {
    warn('could not open launcher:', e.message);
  }
}

function recordPid(dir, name, info) {
  writeFileSync(
    join(dir, name + '.json'),
    JSON.stringify({ name, ...info, startedAt: new Date().toISOString() }, null, 2)
  );
}
function pidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
function readPidIfAlive(dir, name) {
  const f = join(dir, name + '.json');
  if (!existsSync(f)) return null;
  try {
    const r = JSON.parse(readFileSync(f, 'utf8'));
    return r.pid && pidAlive(r.pid) ? r : null;
  } catch {
    return null;
  }
}

// ── tiers ────────────────────────────────────────────────────────────────────
async function tierOffline(m, dryRun) {
  const t = m.tiers.offline;
  if (!t?.enabled) return { tier: 'offline', skipped: true };
  const build = detectGoldGameBuild(m);
  if (!build) {
    warn('offline: no gold-game build found');
    return { tier: 'offline', ok: false, reason: 'no build' };
  }
  const launcher =
    t.launcher !== 'auto'
      ? t.launcher
      : firstExisting([join(build, 'index.html'), join(build, 'PLAY THE GOLD GAME.bat')]);
  if (!launcher) {
    warn('offline: no launcher in', build);
    return { tier: 'offline', ok: false, reason: 'no launcher' };
  }
  openLauncher(launcher, dryRun);
  return { tier: 'offline', ok: true, launcher };
}

async function tierLocal(m, dryRun) {
  const t = m.tiers.local;
  if (!t?.enabled) return { tier: 'local', skipped: true };
  const dir = pidDir(m);
  const out = { tier: 'local', ok: true, started: [], health: {} };
  // 1. live vault server (idempotent on port)
  const build = detectGoldGameBuild(m);
  const server =
    build && (t.server !== 'auto' ? t.server : firstExisting([join(build, 'server.cjs')]));
  const port = t.serverPort || 8787; // server.cjs binds 8787 by default (auto-increments on conflict)
  if (server) {
    if (await portInUse(port)) {
      log(`local: server already live on :${port} (idempotent skip)`);
      out.started.push({ server, port, already: true });
    } else if (dryRun) {
      log('[dry-run] would start', server, 'on', port);
    } else {
      const child = spawn(process.execPath, [server], {
        cwd: build,
        detached: true,
        stdio: 'ignore',
      });
      child.unref();
      recordPid(dir, 'vault-server', { pid: child.pid, port, cmd: server });
      log(`local: started vault server pid=${child.pid} on :${port}`);
      out.started.push({ server, port, pid: child.pid });
    }
  } else warn('local: no server.cjs found — offline launcher still works');
  // 2. local fleet health supervisor (no spend)
  const scripts = detectEcosystemScripts(m);
  const monitor =
    scripts && existsSync(join(scripts, 'fleet-health-monitor.mjs'))
      ? join(scripts, 'fleet-health-monitor.mjs')
      : null;
  if (t.healthMonitor && monitor) {
    const existing = readPidIfAlive(dir, 'fleet-health-monitor');
    if (existing) {
      log(`local: fleet-health-monitor already running pid=${existing.pid} (idempotent skip)`);
      out.started.push({ monitor, pid: existing.pid, already: true });
    } else if (dryRun) log('[dry-run] would start fleet-health-monitor');
    else {
      const child = spawn(process.execPath, [monitor], { detached: true, stdio: 'ignore' });
      child.unref();
      recordPid(dir, 'fleet-health-monitor', { pid: child.pid, cmd: monitor });
      log('local: started fleet-health-monitor pid=' + child.pid);
      out.started.push({ monitor, pid: child.pid });
    }
  } else if (t.healthMonitor)
    warn('local: fleet-health-monitor.mjs not found (ai-ecosystem absent on this machine)');
  // 3. orchestrator reachability (read-only)
  out.health.orchestrator = await orchestratorHealthy(t.orchestratorHealth);
  log('local: MCP orchestrator healthy =', out.health.orchestrator);
  return out;
}

async function tierCloud(m, dryRun) {
  const t = m.tiers.cloud;
  if (!t?.enabled) return { tier: 'cloud', skipped: true, reason: 'disabled (default)' };
  // ── HARD GATE: never spend without a positive budget cap ──
  if (!(typeof t.budgetCapUsd === 'number' && t.budgetCapUsd > 0)) {
    throw new Error(
      'REFUSED: cloud tier enabled but budgetCapUsd is not a positive cap — refusing to wake the GPU fleet without a spend cap.'
    );
  }
  const missing = (t.requireKeys || []).filter((k) => !process.env[k]);
  if (missing.length) {
    warn('cloud: required keys missing, skipping wake:', missing.join(','));
    return { tier: 'cloud', ok: false, reason: 'missing keys: ' + missing.join(',') };
  }
  const scripts = detectEcosystemScripts(m);
  const boot =
    scripts &&
    (t.vastBootstrap !== 'auto'
      ? t.vastBootstrap
      : firstExisting([join(scripts, 'gpu-worker-bootstrap.sh')]));
  if (!boot) {
    warn('cloud: gpu-worker-bootstrap.sh not found');
    return { tier: 'cloud', ok: false, reason: 'no bootstrap script' };
  }
  const args = [boot, '--budget-cap-usd', String(t.budgetCapUsd)];
  if (dryRun) {
    log('[dry-run] would wake vast.ai fleet:', 'bash', args.join(' '), `(cap $${t.budgetCapUsd})`);
    return { tier: 'cloud', ok: true, dryRun: true, budgetCapUsd: t.budgetCapUsd };
  }
  const dir = pidDir(m);
  const child = spawn('bash', args, { detached: true, stdio: 'ignore' });
  child.unref();
  recordPid(dir, 'vast-fleet', { pid: child.pid, cmd: boot, budgetCapUsd: t.budgetCapUsd });
  log(`cloud: waking vast.ai fleet pid=${child.pid} under $${t.budgetCapUsd} cap`);
  return { tier: 'cloud', ok: true, pid: child.pid, budgetCapUsd: t.budgetCapUsd };
}

// ── commands ───────────────────────────────────────────────────────────────
async function boot(m, only, dryRun) {
  const results = [];
  const order = ['offline', 'local', 'cloud'];
  for (const name of order) {
    if (only && only !== name) continue;
    const fn = { offline: tierOffline, local: tierLocal, cloud: tierCloud }[name];
    results.push(await fn(m, dryRun));
  }
  log('boot complete:', JSON.stringify(results));
  return results;
}
function status(m) {
  const dir = pidDir(m);
  const files = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.json')) : [];
  const rows = files.map((f) => {
    const r = JSON.parse(readFileSync(join(dir, f), 'utf8'));
    return { ...r, alive: r.pid ? pidAlive(r.pid) : null };
  });
  console.log(JSON.stringify({ running: rows }, null, 2));
  return rows;
}
function stop(m) {
  const dir = pidDir(m);
  const files = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.json')) : [];
  for (const f of files) {
    const r = JSON.parse(readFileSync(join(dir, f), 'utf8'));
    if (r.pid && pidAlive(r.pid)) {
      try {
        process.kill(r.pid);
        log('stopped', r.name, r.pid);
      } catch (e) {
        warn('stop failed', r.name, e.message);
      }
    }
    rmSync(join(dir, f));
  }
}

const argv = process.argv.slice(2);
const cmd = argv.find((a) => !a.startsWith('--')) || 'boot';
const only = argv.includes('--tier') ? argv[argv.indexOf('--tier') + 1] : null;
const dryRun = argv.includes('--dry-run');
const m = loadManifest();
if (cmd === 'boot')
  boot(m, only, dryRun).catch((e) => {
    console.error('[fleet-boot][ERROR]', e.message);
    process.exit(1);
  });
else if (cmd === 'status') status(m);
else if (cmd === 'stop') stop(m);
else {
  console.error(
    'usage: gold-fleet-boot.mjs [boot|status|stop] [--tier offline|local|cloud] [--dry-run]'
  );
  process.exit(1);
}
