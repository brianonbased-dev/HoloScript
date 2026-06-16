#!/usr/bin/env node
/**
 * vllm-autoscaler.mjs — Scale-to-zero vLLM serving controller.
 *
 * Control loop (every POLL_MS):
 *   1. GET /serve/status  → find models with demand and no warm endpoint
 *   2. Provision cheapest interruptible Vast.ai GPU (≥MIN_VRAM_GB, ≤MAX_DPH)
 *   3. Poll instance until running + vLLM /v1/models responds
 *   4. POST /serve/register
 *   5. POST /serve/heartbeat every HEARTBEAT_MS while endpoint is warm
 *   6. After IDLE_TTL_MS with no demand: drain → destroy → deregister
 *
 * Environment (required unless noted):
 *   HOLOSCRIPT_API_KEY     orchestrator agent key (x-mcp-api-key header)
 *   VASTAI_API_KEY         Vast.ai API key (query param, scrubbed from logs)
 *   VLLM_INFERENCE_KEY     key for vLLM --api-key (optional — random UUID if unset)
 *   FLEET_REGISTRY_URL     orchestrator base (default: Railway production URL)
 *   FLEET_MODEL            model to serve (default: Qwen2.5-Coder-7B-Instruct-AWQ)
 *   SERVE_MAX_DPH          max $/hr per GPU (default: 1.00)
 *   SERVE_MIN_VRAM_GB      min VRAM GB (default: 10)
 *   SERVE_IDLE_TTL_MS      idle before teardown (default: 300000 — 5 min)
 *   SERVE_COLD_BUDGET_MS   max time to wait for warm vLLM (default: 600000 — 10 min)
 *   AUTOSCALER_INTERVAL_MS poll interval (default: 30000 — 30 s)
 *   HEARTBEAT_MS           heartbeat interval (default: 45000 — 45 s)
 *   DRY_RUN                '1' to skip actual Vast.ai calls
 *
 * Task: task_1780427973212_uszr
 */

import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LEDGER_PY = join(__dirname, 'vast-spend-ledger.py');

// ── config ────────────────────────────────────────────────────────────────────

const ORCH_URL =
  process.env.FLEET_REGISTRY_URL ||
  'https://mcp-orchestrator-production-45f9.up.railway.app';
const ORCH_KEY = process.env.HOLOSCRIPT_API_KEY;
const VASTAI_KEY = process.env.VASTAI_API_KEY || process.env.VAST_API_KEY;
const INFERENCE_KEY = process.env.VLLM_INFERENCE_KEY || randomUUID();

const MODEL =
  process.env.FLEET_MODEL ||
  'Qwen/Qwen2.5-Coder-7B-Instruct-AWQ';
const MAX_DPH = parseFloat(process.env.SERVE_MAX_DPH || '1.00');
const MIN_VRAM_GB = parseInt(process.env.SERVE_MIN_VRAM_GB || '10', 10);
const IDLE_TTL_MS = parseInt(process.env.SERVE_IDLE_TTL_MS || '300000', 10);
const COLD_BUDGET_MS = parseInt(process.env.SERVE_COLD_BUDGET_MS || '600000', 10);
const POLL_MS = parseInt(process.env.AUTOSCALER_INTERVAL_MS || '30000', 10);
const HEARTBEAT_MS = parseInt(process.env.HEARTBEAT_MS || '45000', 10);
const DRY_RUN = process.env.DRY_RUN === '1' || process.argv.includes('--dry-run');

const VAST_API = 'https://console.vast.ai/api/v0';
// Internal vLLM port; Vast.ai maps it to a random external port
const VLLM_INTERNAL_PORT = 8000;
// Model fits in 10GB VRAM with AWQ quantization
const VLLM_MAX_MODEL_LEN = 4096;
// vLLM Docker image with OpenAI-compatible server pre-installed
const VLLM_IMAGE = 'vllm/vllm-openai:v0.8.5';
const VLLM_DISK_GB = 40;

// ── state ─────────────────────────────────────────────────────────────────────

/**
 * @typedef {{
 *   endpointId: string,
 *   vastInstanceId: number,
 *   model: string,
 *   lastDemandAt: number,
 *   heartbeatTimer: ReturnType<typeof setInterval>,
 *   status: 'provisioning' | 'warm' | 'draining',
 * }} ManagedEndpoint
 */

/** @type {Map<string, ManagedEndpoint>} keyed by endpointId */
const managed = new Map();

// ── logging ───────────────────────────────────────────────────────────────────

const tag = '[autoscaler]';
function log(...args) { console.log(new Date().toISOString(), tag, ...args); }
function warn(...args) { console.warn(new Date().toISOString(), tag, 'WARN', ...args); }
function err(...args) { console.error(new Date().toISOString(), tag, 'ERROR', ...args); }

/** Scrub api_key from Vast.ai URLs before logging (W.721/F.106). */
function scrubUrl(url) {
  return url.replace(/([?&])api_key=[^&]*/g, '$1api_key=REDACTED');
}

// ── orchestrator API ──────────────────────────────────────────────────────────

async function orchFetch(method, path, body) {
  const res = await fetch(`${ORCH_URL}${path}`, {
    method,
    headers: {
      'x-mcp-api-key': ORCH_KEY,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(15_000),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${text}`);
  return text ? JSON.parse(text) : null;
}

async function getServeStatus() {
  return orchFetch('GET', '/serve/status');
}

async function registerEndpoint({ id, model, url, gpu, dph }) {
  return orchFetch('POST', '/serve/register', { id, model, url, gpu, dph });
}

async function heartbeat(id) {
  return orchFetch('POST', '/serve/heartbeat', { id });
}

async function setDraining(id) {
  return orchFetch('POST', `/serve/${id}/status`, { status: 'draining' });
}

async function deregister(id) {
  return orchFetch('POST', '/serve/deregister', { id });
}

// ── spend ledger ─────────────────────────────────────────────────────────────

/**
 * Call vast-spend-ledger.py. Non-fatal — logs a warning on failure.
 * @param {string[]} args
 */
function ledger(...args) {
  if (DRY_RUN) { log(`[dry-run] ledger ${args.join(' ')}`); return; }
  const r = spawnSync('python3', [LEDGER_PY, ...args], { encoding: 'utf8', timeout: 10_000 });
  if (r.status !== 0)
    warn(`vast-spend-ledger.py ${args[0]} returned ${r.status}: ${(r.stderr || '').slice(0, 200)}`);
}

/** Returns false and logs a warning if today's spend is at/above the daily cap. */
function checkCap() {
  if (DRY_RUN) return true;
  const r = spawnSync('python3', [LEDGER_PY, 'check-cap'], { encoding: 'utf8', timeout: 10_000 });
  if (r.status === 0) return true;
  warn(`Daily spend cap reached — refusing new Vast.ai rental: ${(r.stdout || r.stderr || '').trim()}`);
  return false;
}

// ── Vast.ai API ───────────────────────────────────────────────────────────────

function vastUrl(path, extra = {}) {
  const params = new URLSearchParams({ api_key: VASTAI_KEY, ...extra });
  return `${VAST_API}${path}?${params}`;
}

async function vastFetch(method, path, body, extra = {}) {
  const url = vastUrl(path, extra);
  const res = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(30_000),
  });
  const text = await res.text();
  if (!res.ok)
    throw new Error(
      `Vast.ai ${method} ${scrubUrl(url)} → ${res.status}: ${text.slice(0, 300)}`
    );
  return text ? JSON.parse(text) : null;
}

/**
 * Search for the cheapest interruptible GPU offer meeting our constraints.
 * Returns the best offer object, or null if none found.
 */
async function findCheapestOffer() {
  const q = JSON.stringify({
    rentable: { eq: true },
    num_gpus: { eq: 1 },
    gpu_ram: { gte: MIN_VRAM_GB * 1024 },
    dph_total: { lte: MAX_DPH },
    reliability2: { gte: 0.9 },
    cuda_max_good: { gte: 12 },
  });
  const data = await vastFetch('GET', '/bundles/', undefined, { q, order_by: 'dph_total', limit: '5' });
  const offers = data?.offers ?? [];
  if (!offers.length) return null;
  return offers[0];
}

/**
 * Provision a new Vast.ai instance with vLLM pre-started via onstart command.
 * Returns the new instance ID (number).
 */
async function provisionInstance(offerId, endpointId) {
  const envStr = [
    `-e VLLM_MODEL=${MODEL}`,
    `-e VLLM_INFERENCE_KEY=${INFERENCE_KEY}`,
    `-e SERVE_ENDPOINT_ID=${endpointId}`,
    `-e ORCH_URL=${ORCH_URL}`,
    `-p ${VLLM_INTERNAL_PORT}:${VLLM_INTERNAL_PORT}`,
  ].join(' ');

  const onstart = [
    `python3 -m vllm.entrypoints.openai.api_server`,
    `--model "${MODEL}"`,
    `--port ${VLLM_INTERNAL_PORT}`,
    `--api-key "${INFERENCE_KEY}"`,
    `--host 0.0.0.0`,
    `--max-model-len ${VLLM_MAX_MODEL_LEN}`,
    `--dtype auto`,
    `--trust-remote-code`,
  ].join(' ');

  const body = {
    client_id: 'me',
    image: VLLM_IMAGE,
    disk: VLLM_DISK_GB,
    label: `holoscript-vllm-${endpointId}`,
    runtype: 'batch',
    env: envStr,
    onstart,
  };

  if (DRY_RUN) {
    log(`[dry-run] Would PUT /asks/${offerId}/ with label holoscript-vllm-${endpointId}`);
    return -1;
  }

  const res = await vastFetch('PUT', `/asks/${offerId}/`, body);
  if (!res?.new_contract)
    throw new Error(`Vast.ai create instance returned no new_contract: ${JSON.stringify(res)}`);
  return res.new_contract;
}

/**
 * Poll a Vast.ai instance until `actual_status` is "running".
 * Returns { publicIp, externalPort } once running.
 */
async function waitForRunning(vastInstanceId, endpointId) {
  const deadline = Date.now() + COLD_BUDGET_MS;
  log(`Waiting for Vast.ai instance ${vastInstanceId} to enter "running" status...`);
  while (Date.now() < deadline) {
    await sleep(15_000);
    const data = await vastFetch('GET', '/instances/', undefined, { owner: 'me' });
    const inst = (data?.instances ?? []).find((i) => i.id === vastInstanceId);
    if (!inst) { warn(`Instance ${vastInstanceId} not found in Vast.ai — may have been destroyed`); return null; }
    log(`  instance ${vastInstanceId} status=${inst.actual_status}`);
    if (inst.actual_status === 'running') {
      const pubIp = inst.public_ipaddr;
      const portMap = inst.ports?.[`${VLLM_INTERNAL_PORT}/tcp`];
      const extPort = portMap?.[0]?.HostPort ?? VLLM_INTERNAL_PORT;
      return { publicIp: pubIp, externalPort: Number(extPort), gpuName: inst.gpu_name, dph: inst.dph_total };
    }
    if (inst.actual_status === 'destroyed' || inst.actual_status === 'stopped') {
      warn(`Instance ${vastInstanceId} entered ${inst.actual_status} before becoming healthy`);
      return null;
    }
  }
  warn(`Cold-start budget exhausted for endpoint ${endpointId} (instance ${vastInstanceId})`);
  return null;
}

/**
 * Poll the vLLM /v1/models endpoint until it responds 200.
 * Returns true when healthy.
 */
async function waitForVllmHealth(publicIp, externalPort) {
  const url = `http://${publicIp}:${externalPort}/v1/models`;
  const deadline = Date.now() + COLD_BUDGET_MS;
  log(`Polling vLLM health at ${url} ...`);
  while (Date.now() < deadline) {
    await sleep(10_000);
    try {
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${INFERENCE_KEY}` },
        signal: AbortSignal.timeout(8_000),
      });
      if (res.ok) {
        log(`vLLM healthy at ${url}`);
        return true;
      }
    } catch {
      /* still loading */
    }
  }
  return false;
}

/**
 * Destroy a Vast.ai instance. Non-fatal on failure.
 */
async function destroyInstance(vastInstanceId) {
  if (DRY_RUN) { log(`[dry-run] Would DELETE /instances/${vastInstanceId}/`); return; }
  try {
    await vastFetch('DELETE', `/instances/${vastInstanceId}/`);
    log(`Vast.ai instance ${vastInstanceId} destroyed`);
    ledger('close', '--instance-id', String(vastInstanceId));
  } catch (e) {
    warn(`Failed to destroy Vast.ai instance ${vastInstanceId}:`, e.message);
  }
}

// ── endpoint lifecycle ────────────────────────────────────────────────────────

async function teardownEndpoint(ep) {
  if (ep.status === 'draining') return; // already in progress
  ep.status = 'draining';
  clearInterval(ep.heartbeatTimer);
  log(`Tearing down endpoint ${ep.endpointId} (Vast.ai instance ${ep.vastInstanceId})`);

  try { await setDraining(ep.endpointId); } catch (e) { warn('drain status update failed:', e.message); }
  await destroyInstance(ep.vastInstanceId);
  try { await deregister(ep.endpointId); } catch (e) { warn('deregister failed:', e.message); }
  managed.delete(ep.endpointId);
  log(`Endpoint ${ep.endpointId} fully decommissioned`);
}

async function spawnEndpoint(model) {
  if (!VASTAI_KEY && !DRY_RUN) throw new Error('VASTAI_API_KEY is required to provision GPU instances');

  // Hard gate: refuse if today's fleet-wide Vast.ai spend is at cap
  if (!checkCap()) return;

  const endpointId = `vast-${model.replace(/[^a-z0-9]/gi, '-').toLowerCase()}-${Date.now()}`;
  log(`Provisioning new endpoint ${endpointId} for model "${model}"`);

  let offerId = 0;
  let offerDph = 0;
  if (!DRY_RUN) {
    const offer = await findCheapestOffer();
    if (!offer) throw new Error(`No Vast.ai offer available (≥${MIN_VRAM_GB}GB VRAM, ≤$${MAX_DPH}/hr)`);
    log(`Selected offer ${offer.id}: ${offer.gpu_name} @ $${offer.dph_total}/hr (${Math.round(offer.gpu_ram / 1024)}GB VRAM)`);
    offerId = offer.id;
    offerDph = offer.dph_total;
  }

  const vastInstanceId = await provisionInstance(offerId, endpointId);
  if (vastInstanceId > 0) {
    ledger('rent', '--instance-id', String(vastInstanceId), '--handle', endpointId, '--dph', String(offerDph));
  }

  // Track immediately as 'provisioning' so we don't double-provision
  /** @type {ManagedEndpoint} */
  const ep = {
    endpointId,
    vastInstanceId,
    model,
    lastDemandAt: Date.now(),
    heartbeatTimer: null,
    status: 'provisioning',
  };
  managed.set(endpointId, ep);

  if (DRY_RUN) {
    log(`[dry-run] Skipping instance wait; endpoint ${endpointId} registered as dry-run placeholder`);
    ep.status = 'warm';
    ep.heartbeatTimer = setInterval(() => {
      heartbeat(endpointId).catch((e) => warn(`heartbeat failed for ${endpointId}:`, e.message));
    }, HEARTBEAT_MS);
    return;
  }

  // Wait in background — keeps the control loop unblocked
  (async () => {
    try {
      const running = await waitForRunning(vastInstanceId, endpointId);
      if (!running) { managed.delete(endpointId); await destroyInstance(vastInstanceId); return; }

      const { publicIp, externalPort, gpuName, dph } = running;
      const healthy = await waitForVllmHealth(publicIp, externalPort);
      if (!healthy) {
        warn(`vLLM failed health check for ${endpointId}; tearing down`);
        managed.delete(endpointId);
        await destroyInstance(vastInstanceId);
        return;
      }

      const serveUrl = `http://${publicIp}:${externalPort}`;
      await registerEndpoint({ id: endpointId, model, url: serveUrl, gpu: gpuName, dph });
      ep.status = 'warm';
      log(`Endpoint ${endpointId} warm at ${serveUrl} (${gpuName})`);

      ep.heartbeatTimer = setInterval(async () => {
        try {
          await heartbeat(endpointId);
        } catch (e) {
          warn(`heartbeat failed for ${endpointId}:`, e.message);
        }
      }, HEARTBEAT_MS);
    } catch (e) {
      err(`Spawn failed for ${endpointId}:`, e.message);
      managed.delete(endpointId);
      await destroyInstance(vastInstanceId).catch(() => {});
    }
  })();
}

// ── control loop ──────────────────────────────────────────────────────────────

async function tick() {
  let status;
  try {
    status = await getServeStatus();
  } catch (e) {
    warn('GET /serve/status failed:', e.message);
    return;
  }

  const { endpoints = [], demand = [] } = status;
  const warmModels = new Set(
    endpoints.filter((e) => e.status === 'warm').map((e) => e.model)
  );

  // Update demand timestamps for managed endpoints
  for (const d of demand) {
    for (const [, ep] of managed) {
      if (ep.model === d.model) ep.lastDemandAt = Math.max(ep.lastDemandAt, d.last_want_at ?? 0);
    }
  }

  // 1. Provision for models with demand but no warm endpoint
  const modelsWithDemand = demand.map((d) => d.model);
  for (const model of modelsWithDemand) {
    if (warmModels.has(model)) continue; // already served
    const alreadyProvisioning = [...managed.values()].some(
      (ep) => ep.model === model && ep.status === 'provisioning'
    );
    if (alreadyProvisioning) continue;

    try {
      await spawnEndpoint(model);
    } catch (e) {
      err(`Failed to spawn endpoint for "${model}":`, e.message);
    }
  }

  // 2. Tear down warm endpoints that have been idle past the TTL
  const now = Date.now();
  for (const [, ep] of [...managed.entries()]) {
    if (ep.status !== 'warm') continue;
    const idleMs = now - ep.lastDemandAt;
    if (idleMs >= IDLE_TTL_MS) {
      log(`Endpoint ${ep.endpointId} idle for ${Math.round(idleMs / 1000)}s — tearing down`);
      await teardownEndpoint(ep);
    }
  }
}

// ── entry point ───────────────────────────────────────────────────────────────

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function main() {
  if (!ORCH_KEY) { err('HOLOSCRIPT_API_KEY is required'); process.exit(1); }
  if (!VASTAI_KEY && !DRY_RUN) { err('VASTAI_API_KEY is required (or set DRY_RUN=1)'); process.exit(1); }

  log(
    `Starting (model=${MODEL}, maxDph=$${MAX_DPH}, minVram=${MIN_VRAM_GB}GB,`,
    `idleTTL=${IDLE_TTL_MS / 1000}s, poll=${POLL_MS / 1000}s, dryRun=${DRY_RUN})`
  );

  // Graceful shutdown
  for (const sig of ['SIGINT', 'SIGTERM']) {
    process.on(sig, async () => {
      log(`${sig} received — draining all managed endpoints`);
      await Promise.allSettled([...managed.values()].map(teardownEndpoint));
      process.exit(0);
    });
  }

  // Run immediately on start, then on interval
  await tick();
  setInterval(() => { tick().catch((e) => err('tick failed:', e.message)); }, POLL_MS);
}

main().catch((e) => { err('fatal:', e); process.exit(1); });
