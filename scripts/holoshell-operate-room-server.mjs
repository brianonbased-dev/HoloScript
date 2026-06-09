#!/usr/bin/env node
/**
 * HoloShell Operate-Room HTTP Server
 *
 * Two roles:
 * 1. LOCAL API (port HOLOSHELL_PORT, default 8747):
 *    GET  /api/stale-processes      -- stale git processes
 *    GET  /api/pending-consents     -- preflight receipts awaiting consent
 *    GET  /api/execution-history    -- completed execution receipts
 *    POST /api/consent/approve      -- approve a preflight
 *    GET  /api/machine-state        -- current machine snapshot (Win32/GPU)
 *    GET  /health                   -- liveness
 *
 * 2. REMOTE PUBLISHER (every PUBLISH_INTERVAL_MS, default 120000):
 *    PUTs machine snapshot to prod MCP server at
 *    /api/holomesh/machine-state/<seat-id>
 *    so Studio can read it remotely.
 *
 * Architecture note (D.081 + /founder ruling 2026-06-08):
 *   Win32_Process CIM, nvidia-smi, Win32_OperatingSystem are Windows-native
 *   APIs that cannot run on Railway. This local server IS the prod service
 *   for local-machine introspection. The remote publisher closes the gap that
 *   Phase-C task_1780652771385_6hgu filed: machine state must also reach a
 *   prod endpoint. Phase D commit 26d033d77 ratified HOLOSHELL_API_URL for
 *   the same reason.
 *
 * Environment:
 *   HOLOSHELL_PORT         local HTTP port (default 8747)
 *   HOLOSHELL_SEAT_ID      seat id for remote publish (default: HOLOMESH_AGENT_SURFACE or local-win-x64)
 *   HOLOSCRIPT_API_KEY     auth key for remote MCP server publish
 *   MCP_HOLOSCRIPT_URL     MCP server base URL (default https://mcp.holoscript.net)
 *   PUBLISH_INTERVAL_MS    remote publish interval ms (default 120000)
 *   HOLOSHELL_RECEIPTS_DIR receipts directory
 */

import http from 'node:http';
import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// -- Load .env ----------------------------------------------------------------
const ENV_PATHS = [
  resolve(__dirname, '../.env'),
  'C:/Users/Josep/.ai-ecosystem/.env',
  (process.env.HOME ?? '') + '/.ai-ecosystem/.env',
];
for (const p of ENV_PATHS) {
  if (existsSync(p)) {
    try {
      const lines = readFileSync(p, 'utf8').split('\n');
      for (const line of lines) {
        const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
        if (m && !process.env[m[1]]) {
          process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '').trim();
        }
      }
    } catch { /* non-fatal */ }
    break;
  }
}

// -- Config ------------------------------------------------------------------
const PORT = Number(process.env.HOLOSHELL_PORT) || 8747;
const SEAT_ID = process.env.HOLOSHELL_SEAT_ID || process.env.HOLOMESH_AGENT_SURFACE || 'local-win-x64';
const MCP_BASE = (process.env.MCP_HOLOSCRIPT_URL || 'https://mcp.holoscript.net').replace(/\/$/, '');
const PUBLISH_INTERVAL_MS = Number(process.env.PUBLISH_INTERVAL_MS) || 120_000;
const API_KEY = process.env.HOLOSCRIPT_API_KEY || process.env.HOLOMESH_API_KEY || '';
const BIND_ADDR = '127.0.0.1';

// -- Import holoshell execution engine ---------------------------------------
const enginePath = new URL('./holoshell-execute-receipt.mjs', import.meta.url).href;
const { scanStaleProcesses, listPendingReceipts, listRecentExecutions, executeReceipt } =
  await import(enginePath);

const consentPath = new URL('./holoshell-consent-contract.mjs', import.meta.url).href;
const { classifyConsentRequirement, issueConsentToken } = await import(consentPath);

// -- Machine-state snapshot --------------------------------------------------
function collectMachineSnapshot() {
  const base = {
    schema: 'holoshell.machine-state.snapshot.v1',
    collectedAt: new Date().toISOString(),
    platform: process.platform,
    nodeVersion: process.version,
  };

  // GPU via nvidia-smi
  let gpu = null;
  try {
    const smiRaw = execSync(
      'nvidia-smi --query-gpu=name,memory.total,memory.free,memory.used,utilization.gpu --format=csv,noheader,nounits',
      { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 5_000 }
    ).trim();
    if (smiRaw) {
      const [name, totalMB, freeMB, usedMB, utilPct] = smiRaw.split(',').map(s => s.trim());
      gpu = { name, totalMB: Number(totalMB), freeMB: Number(freeMB), usedMB: Number(usedMB), utilizationPct: Number(utilPct) };
    }
  } catch { /* no GPU */ }

  // Host memory via Win32_OperatingSystem (Windows-only)
  let hostMemory = null;
  try {
    const psCmd = 'Get-CimInstance Win32_OperatingSystem | Select-Object TotalVisibleMemorySize,FreePhysicalMemory | ConvertTo-Json -Compress';
    const raw = execSync(
      `powershell -NonInteractive -Command "${psCmd}"`,
      { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 8_000 }
    ).trim();
    if (raw) {
      const parsed = JSON.parse(raw);
      const totalMB = Math.round(Number(parsed.TotalVisibleMemorySize) / 1024);
      const freeMB = Math.round(Number(parsed.FreePhysicalMemory) / 1024);
      hostMemory = { totalMB, freeMB, usedMB: totalMB - freeMB, source: 'win32_operating_system' };
    }
  } catch {
    const m = process.memoryUsage();
    hostMemory = {
      nodeHeapUsedMB: Math.round(m.heapUsed / 1024 / 1024),
      nodeHeapTotalMB: Math.round(m.heapTotal / 1024 / 1024),
      source: 'node_process',
    };
  }

  let staleProcessCount = 0;
  try { staleProcessCount = scanStaleProcesses({ minAgeMs: 5 * 60 * 1000 }).length; } catch { /* non-fatal */ }

  return { ...base, gpu, hostMemory, staleProcessCount };
}

// -- HTTP utilities ----------------------------------------------------------
function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    'Access-Control-Allow-Origin': '*',
  });
  res.end(payload);
}

async function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => (data += chunk));
    req.on('end', () => { try { resolve(data ? JSON.parse(data) : {}); } catch { resolve({}); } });
    req.on('error', reject);
  });
}

// -- Request router ----------------------------------------------------------
async function handleRequest(req, res) {
  const url = new URL(req.url, `http://${BIND_ADDR}:${PORT}`);
  const path = url.pathname;
  const method = req.method;

  if (method === 'OPTIONS') {
    res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS' });
    res.end();
    return;
  }

  try {
    if (path === '/api/stale-processes' && method === 'GET') {
      const minAgeMs = Number(url.searchParams.get('minAgeMs')) || 5 * 60 * 1000;
      const raw = scanStaleProcesses({ minAgeMs });
      const items = raw.map(p => ({ pid: p.pid, reason: p.reason, ageSec: Math.round(p.ageMs / 1000), command: p.command }));
      sendJson(res, 200, { success: true, items });
      return;
    }

    if (path === '/api/pending-consents' && method === 'GET') {
      const pending = listPendingReceipts();
      const items = pending.map(pf => ({ id: pf.id, operation: pf.operation, targetCount: pf.targets?.length ?? 0, timestamp: pf.timestamp }));
      sendJson(res, 200, { success: true, items });
      return;
    }

    if (path === '/api/execution-history' && method === 'GET') {
      const executions = listRecentExecutions({ limit: 20 });
      const items = executions.map(e => ({
        id: e.id, preflightId: e.preflightId, operation: e.operation,
        executedAt: e.executedAt,
        executedAtShort: e.executedAt ? new Date(e.executedAt).toLocaleString() : '-',
        summary: { killed: e.killed ?? 0, errors: e.errors ?? 0 },
      }));
      sendJson(res, 200, { success: true, items });
      return;
    }

    if (path === '/api/consent/approve' && method === 'POST') {
      const body = await readBody(req);
      const { preflightId } = body;
      if (!preflightId || typeof preflightId !== 'string') { sendJson(res, 400, { error: 'preflightId required' }); return; }
      const classification = classifyConsentRequirement({ operation: 'stale_process_cleanup' });
      const token = issueConsentToken({ preflightId, lane: classification.lane, issuedBy: 'studio-founder' });
      const result = executeReceipt({ consentToken: token, preflightId });
      sendJson(res, result.outcome === 'success' ? 200 : 500, { success: result.outcome === 'success', ...result });
      return;
    }

    if (path === '/api/machine-state' && method === 'GET') {
      const snapshot = collectMachineSnapshot();
      sendJson(res, 200, { success: true, snapshot });
      return;
    }

    if (path === '/health' && method === 'GET') {
      sendJson(res, 200, { status: 'ok', seatId: SEAT_ID, uptime: Math.round(process.uptime()), publishIntervalMs: PUBLISH_INTERVAL_MS });
      return;
    }

    sendJson(res, 404, { error: `unknown path: ${path}` });
  } catch (err) {
    sendJson(res, 500, { error: 'internal error', details: String(err?.message ?? err).slice(0, 200) });
  }
}

// -- Remote publisher --------------------------------------------------------
async function publishSnapshot() {
  if (!API_KEY) return;
  let snapshot;
  try { snapshot = collectMachineSnapshot(); }
  catch (err) { console.error('[holoshell-server] snapshot failed:', err?.message ?? err); return; }
  const target = `${MCP_BASE}/api/holomesh/machine-state/${encodeURIComponent(SEAT_ID)}`;
  try {
    const r = await fetch(target, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'x-mcp-api-key': API_KEY, Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify(snapshot),
      signal: AbortSignal.timeout(15_000),
    });
    if (r.ok) {
      console.log(`[holoshell-server] published snapshot for ${SEAT_ID} at ${new Date().toISOString()}`);
    } else {
      const text = await r.text().catch(() => '');
      console.warn(`[holoshell-server] publish HTTP ${r.status}: ${text.slice(0, 120)}`);
    }
  } catch (err) { console.warn('[holoshell-server] publish error:', err?.message ?? err); }
}

// -- Main --------------------------------------------------------------------
const server = http.createServer(handleRequest);
server.listen(PORT, BIND_ADDR, () => {
  console.log(`[holoshell-server] listening on http://${BIND_ADDR}:${PORT}`);
  console.log(`[holoshell-server] seat: ${SEAT_ID} | remote: ${MCP_BASE}/api/holomesh/machine-state/${SEAT_ID}`);
  publishSnapshot();
  setInterval(publishSnapshot, PUBLISH_INTERVAL_MS);
});
server.on('error', err => {
  if (err.code === 'EADDRINUSE') { console.error(`[holoshell-server] port ${PORT} in use -- set HOLOSHELL_PORT`); }
  else { console.error('[holoshell-server] error:', err?.message ?? err); }
  process.exit(1);
});
process.on('SIGINT', () => { server.close(() => process.exit(0)); });