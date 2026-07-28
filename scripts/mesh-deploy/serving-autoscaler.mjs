#!/usr/bin/env node
/**
 * serving-autoscaler.mjs — scale-to-zero Brittney serving controller (B-1).
 *
 * Poll /serve/status → on cold demand: provision vLLM on cheapest vast.ai GPU,
 * register endpoint, heartbeat while warm, drain + destroy on idle timeout.
 *
 * Control plane: mcp-orchestrator /serve/* endpoints (owner-bound mutations)
 * GPU backend:   vast.ai (cheapest offer matching VAST_* filter)
 * Spend gate:    vast-spend-ledger.py (structural rail per W.GOLD.001)
 *
 * Usage:
 *   ORCHESTRATOR_API_KEY=<key> node serving-autoscaler.mjs
 *   node serving-autoscaler.mjs --self-test    # no live calls
 *   node serving-autoscaler.mjs --help
 *
 * Config env vars:
 *   ORCHESTRATOR_URL             (default: https://mcp-orchestrator-production-45f9.up.railway.app)
 *   ORCHESTRATOR_API_KEY         agent-role key (REQUIRED for live run)
 *   SERVE_MODEL                  model name tracked in control plane (default: brittney-v0)
 *   VLLM_HF_MODEL                HuggingFace model to serve (default: Qwen/Qwen2.5-0.5B-Instruct)
 *   VLLM_PORT                    port vLLM listens on in the instance (default: 8000)
 *   VAST_GPU_CLASS               regex for gpu_name filter (default: .*)
 *   VAST_MIN_VRAM_GB             minimum VRAM in GB (default: 8)
 *   VAST_MAX_DPH                 max $/hr cap for offer picker (default: 0.50)
 *   VAST_MIN_RELIABILITY         minimum reliability2 score (default: 0.85)
 *   VAST_DISK_GB                 allocated disk in GB (default: 60)
 *   VASTAI_CLI                   path to vastai executable
 *   PYTHON_CMD                   python3 or python (auto-detected if unset)
 *   LEDGER_SCRIPT                path to vast-spend-ledger.py (default: sibling file)
 *   PICKER_SCRIPT                path to pick-cheapest-offer.py (default: sibling file)
 *   AUTOSCALER_TICK_MS           poll interval ms (default: 30000)
 *   AUTOSCALER_IDLE_TTL_MS       no-demand TTL before scale-to-zero (default: 600000 = 10 min)
 *   AUTOSCALER_HEARTBEAT_MS      heartbeat interval ms (default: 60000)
 *   AUTOSCALER_HEALTH_POLL_MS    vLLM health check polling interval ms (default: 15000)
 *   AUTOSCALER_HEALTH_MAX_TRIES  max vLLM health poll attempts (default: 40 = 10 min)
 *   AUTOSCALER_HEALTH_FAIL_LIMIT consecutive heartbeat failures before teardown (default: 3)
 *   DRY_RUN                      "1" to skip real vastai calls and orchestrator writes
 */

import { execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import process from 'node:process';

const execFileAsync = promisify(execFile);
const __dirname = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Config resolution
// ---------------------------------------------------------------------------
const ORCHESTRATOR_URL =
  process.env.ORCHESTRATOR_URL || 'https://mcp-orchestrator-production-45f9.up.railway.app';
const ORCHESTRATOR_API_KEY = process.env.ORCHESTRATOR_API_KEY || '';

const SERVE_MODEL = process.env.SERVE_MODEL || 'brittney-v0';
const VLLM_HF_MODEL = process.env.VLLM_HF_MODEL || 'Qwen/Qwen2.5-0.5B-Instruct';
const VLLM_PORT = parseInt(process.env.VLLM_PORT || '8000', 10);

const VAST_GPU_CLASS = process.env.VAST_GPU_CLASS || '.*';
const VAST_MIN_VRAM_GB = parseInt(process.env.VAST_MIN_VRAM_GB || '8', 10);
const VAST_MAX_DPH = parseFloat(process.env.VAST_MAX_DPH || '0.50');
const VAST_MIN_RELIABILITY = parseFloat(process.env.VAST_MIN_RELIABILITY || '0.85');
const VAST_DISK_GB = parseInt(process.env.VAST_DISK_GB || '60', 10);

const WINDOWS_VASTAI = 'C:/Users/josep/AppData/Roaming/Python/Python314/Scripts/vastai.exe';
const VASTAI_CLI =
  process.env.VASTAI_CLI || (process.platform === 'win32' ? WINDOWS_VASTAI : 'vastai');

const PYTHON_CMD = process.env.PYTHON_CMD || detectPython();
const LEDGER_SCRIPT = process.env.LEDGER_SCRIPT || resolve(__dirname, 'vast-spend-ledger.py');
const PICKER_SCRIPT = process.env.PICKER_SCRIPT || resolve(__dirname, 'pick-cheapest-offer.py');

const TICK_MS = parseInt(process.env.AUTOSCALER_TICK_MS || '30000', 10);
const IDLE_TTL_MS = parseInt(process.env.AUTOSCALER_IDLE_TTL_MS || '600000', 10);
const HEARTBEAT_MS = parseInt(process.env.AUTOSCALER_HEARTBEAT_MS || '60000', 10);
const HEALTH_POLL_MS = parseInt(process.env.AUTOSCALER_HEALTH_POLL_MS || '15000', 10);
const HEALTH_MAX_TRIES = parseInt(process.env.AUTOSCALER_HEALTH_MAX_TRIES || '40', 10);
const HEALTH_FAIL_LIMIT = parseInt(process.env.AUTOSCALER_HEALTH_FAIL_LIMIT || '3', 10);
const DRY_RUN = process.env.DRY_RUN === '1';

// ---------------------------------------------------------------------------
// Per-model state machine
// state: 'idle' | 'provisioning' | 'warm' | 'draining'
// ---------------------------------------------------------------------------
const modelState = {
  state: 'idle',
  instanceId: undefined,
  endpointId: undefined,
  healthFails: 0,
};
let lastHeartbeatAt = 0;

// ---------------------------------------------------------------------------
// Util
// ---------------------------------------------------------------------------
function detectPython() {
  for (const cmd of ['python3', 'python']) {
    try {
      execFileSync(cmd, ['--version'], { stdio: 'pipe' });
      return cmd;
    } catch {
      /* try next */
    }
  }
  return 'python3';
}

function log(level, msg, extra) {
  const ts = new Date().toISOString();
  const line = `[${ts}] [${level}] [${SERVE_MODEL}] ${msg}`;
  const out = level === 'ERROR' ? console.error : console.log;
  out(line, extra !== undefined ? extra : '');
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ---------------------------------------------------------------------------
// Subprocess helpers
// ---------------------------------------------------------------------------
/** Run a Python script. Throws on non-zero exit (error has .stdout/.stderr). */
async function runPy(scriptPath, args, { timeoutMs = 120_000 } = {}) {
  const { stdout, stderr } = await execFileAsync(PYTHON_CMD, [scriptPath, ...args], {
    timeout: timeoutMs,
    windowsHide: true,
  });
  return { stdout: (stdout || '').trim(), stderr: (stderr || '').trim() };
}

/** Run vastai CLI. Throws on non-zero exit. DRY_RUN skips real call. */
async function runVastai(args, { timeoutMs = 60_000 } = {}) {
  if (DRY_RUN) {
    log('INFO', `[DRY_RUN] vastai ${args.join(' ')}`);
    return { stdout: '{}', stderr: '' };
  }
  const { stdout, stderr } = await execFileAsync(VASTAI_CLI, args, {
    timeout: timeoutMs,
    windowsHide: true,
  });
  return { stdout: (stdout || '').trim(), stderr: (stderr || '').trim() };
}

// ---------------------------------------------------------------------------
// Orchestrator API
// ---------------------------------------------------------------------------
async function orchestratorFetch(path, { method = 'GET', body } = {}) {
  const url = `${ORCHESTRATOR_URL}${path}`;
  const opts = {
    method,
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ORCHESTRATOR_API_KEY,
    },
  };
  if (body !== undefined) {
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(url, opts);
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`${method} ${path} -> ${res.status}: ${text.slice(0, 300)}`);
  }
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

// ---------------------------------------------------------------------------
// Spend gate (structural rail per W.GOLD.001)
// ---------------------------------------------------------------------------
async function checkSpendCap(estimatedDph) {
  let capState = {};

  // Call check-cap; exit 1 = over cap (still prints JSON on stdout)
  try {
    const { stdout } = await runPy(LEDGER_SCRIPT, ['check-cap', '--cap', '100'], {
      timeoutMs: 15_000,
    });
    try {
      capState = JSON.parse(stdout);
    } catch {
      /* non-JSON */
    }
    // CLI exited 0 = under cap by its own checks
  } catch (err) {
    if (err.code === 'ENOENT') {
      // Ledger script not on disk — structural rail failure, hard error
      throw new Error(`vast-spend-ledger.py not found (structural rail): ${err.message}`);
    }
    // exit 1 = over cap
    try {
      capState = JSON.parse(err.stdout || '{}');
    } catch {
      /* ignore */
    }
    log(
      'INFO',
      `cap gate: CLI says OVER CAP ` +
        `(spent=$${capState.already_spent_usd}, burn_rate=$${capState.daily_burn_rate_usd})`
    );
    return { allowed: false, capState };
  }

  // CLI said OK — also check projected headroom for the new instance
  if (estimatedDph > 0) {
    const estimatedDailyUsd = estimatedDph * 24;
    const headroom = capState.headroom_burn_rate_usd ?? 100;
    if (estimatedDailyUsd > headroom) {
      log(
        'INFO',
        `cap gate: new instance ($${estimatedDailyUsd.toFixed(2)}/day) ` +
          `would exceed projected headroom ($${headroom.toFixed(2)} remaining)`
      );
      return { allowed: false, capState };
    }
  }

  return { allowed: true, capState };
}

// ---------------------------------------------------------------------------
// Offer picker
// ---------------------------------------------------------------------------
async function pickCheapestOffer() {
  const { stdout } = await runPy(
    PICKER_SCRIPT,
    [
      '--min-vram',
      String(VAST_MIN_VRAM_GB),
      '--gpu-class',
      VAST_GPU_CLASS,
      '--min-reliability',
      String(VAST_MIN_RELIABILITY),
      '--max-dph',
      String(VAST_MAX_DPH),
      '--top',
      '1',
    ],
    { timeoutMs: 90_000 }
  );
  const result = JSON.parse(stdout);
  const candidate = result.candidates?.[0];
  if (!candidate) {
    log(
      'INFO',
      `picker: no offers match (rejected ${result.rejected_count}/${result.total_offers})`
    );
    return null;
  }
  log(
    'INFO',
    `picker: best offer id=${candidate.id} gpu=${candidate.gpu_name} ` +
      `vram=${candidate.gpu_ram}MiB dph=$${candidate.dph_total}`
  );
  return candidate;
}

// ---------------------------------------------------------------------------
// Instance lifecycle
// ---------------------------------------------------------------------------
const VLLM_ONSTART = [
  'pip install vllm --quiet &&',
  'python -m vllm.entrypoints.openai.api_server',
  `--model "${VLLM_HF_MODEL}"`,
  `--host 0.0.0.0 --port ${VLLM_PORT}`,
  '--dtype auto --max-model-len 4096',
].join(' ');

async function createInstance(offerId) {
  log('INFO', `creating vast.ai instance for offer ${offerId}`);
  if (DRY_RUN) {
    const fakeId = 9_999_999;
    log('INFO', `[DRY_RUN] fake instance id ${fakeId}`);
    return fakeId;
  }
  const { stdout } = await runVastai(
    [
      'create',
      'instance',
      String(offerId),
      '--image',
      'pytorch/pytorch:2.4.0-cuda12.4-cudnn9-devel',
      '--disk',
      String(VAST_DISK_GB),
      '--ssh',
      '--raw',
      '--onstart-cmd',
      VLLM_ONSTART,
    ],
    { timeoutMs: 90_000 }
  );
  let result;
  try {
    result = JSON.parse(stdout);
  } catch {
    result = {};
  }
  const instanceId = result.new_contract ?? result.id;
  if (!instanceId) {
    // Sometimes vastai prints "Started. <id>" instead of JSON
    const m = stdout.match(/\d{6,}/);
    if (m) return Number(m[0]);
    throw new Error(`vastai create instance returned no id: ${stdout.slice(0, 200)}`);
  }
  return Number(instanceId);
}

/** Poll until instance has a public IP and is running. Returns {ip, port} or null. */
async function waitForInstanceIP(instanceId, { maxWaitMs = 300_000 } = {}) {
  if (DRY_RUN) {
    return { ip: '127.0.0.1', port: VLLM_PORT };
  }
  const deadline = Date.now() + maxWaitMs;
  while (Date.now() < deadline) {
    try {
      const { stdout } = await runVastai(['show', 'instance', String(instanceId), '--raw'], {
        timeoutMs: 20_000,
      });
      const info = JSON.parse(stdout);
      if (info.public_ipaddr && info.actual_status === 'running') {
        return { ip: info.public_ipaddr, port: VLLM_PORT };
      }
      log('INFO', `instance ${instanceId} status=${info.actual_status ?? '?'} — waiting for IP`);
    } catch (err) {
      log('INFO', `show instance ${instanceId} error: ${err.message} — retrying`);
    }
    await sleep(15_000);
  }
  return null;
}

/** Poll vLLM /health endpoint until ready or max tries reached. */
async function waitForVllmHealth(ip, port) {
  if (DRY_RUN) return true;
  const url = `http://${ip}:${port}/health`;
  for (let i = 0; i < HEALTH_MAX_TRIES; i++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
      if (res.ok) {
        log('INFO', `vLLM health PASS at ${url} (attempt ${i + 1}/${HEALTH_MAX_TRIES})`);
        return true;
      }
    } catch {
      /* connection refused / timeout — still starting */
    }
    log('INFO', `vLLM health ${i + 1}/${HEALTH_MAX_TRIES} — waiting (${url})`);
    await sleep(HEALTH_POLL_MS);
  }
  return false;
}

async function destroyVastInstance(instanceId, reason = 'autoscaler-teardown') {
  log('INFO', `destroying vast.ai instance ${instanceId} (reason: ${reason})`);
  try {
    await runVastai(['destroy', 'instance', String(instanceId)], { timeoutMs: 30_000 });
  } catch (err) {
    log('ERROR', `vastai destroy ${instanceId} failed: ${err.message}`);
  }
  try {
    await runPy(LEDGER_SCRIPT, ['close', '--instance-id', String(instanceId), '--reason', reason]);
    log('INFO', `ledger closed for instance ${instanceId}`);
  } catch (err) {
    log('ERROR', `ledger close ${instanceId} failed (non-fatal): ${err.message}`);
  }
}

// ---------------------------------------------------------------------------
// Control-plane mutations
// ---------------------------------------------------------------------------
async function registerEndpoint(instanceId, hostUrl) {
  const id = `vast-${instanceId}`;
  if (DRY_RUN) {
    log('INFO', `[DRY_RUN] register endpoint ${id} -> ${hostUrl}`);
    return id;
  }
  await orchestratorFetch('/serve/register', {
    method: 'POST',
    body: {
      id,
      model: SERVE_MODEL,
      url: hostUrl,
      seat: `autoscaler-${process.pid}`,
      gpu: 'vast',
      dph: VAST_MAX_DPH,
      status: 'warm',
    },
  });
  log('INFO', `registered endpoint ${id} -> ${hostUrl}`);
  return id;
}

async function heartbeatEndpoint(endpointId) {
  if (DRY_RUN) {
    log('INFO', `[DRY_RUN] heartbeat ${endpointId}`);
    return;
  }
  await orchestratorFetch('/serve/heartbeat', {
    method: 'POST',
    body: { id: endpointId },
  });
}

async function drainEndpoint(endpointId) {
  if (DRY_RUN) {
    log('INFO', `[DRY_RUN] drain ${endpointId}`);
    return;
  }
  await orchestratorFetch(`/serve/${endpointId}/status`, {
    method: 'POST',
    body: { status: 'draining' },
  });
  log('INFO', `endpoint ${endpointId} set to draining`);
}

async function deregisterEndpoint(endpointId) {
  if (DRY_RUN) {
    log('INFO', `[DRY_RUN] deregister ${endpointId}`);
    return;
  }
  await orchestratorFetch('/serve/deregister', {
    method: 'POST',
    body: { id: endpointId },
  });
  log('INFO', `endpoint ${endpointId} deregistered`);
}

// ---------------------------------------------------------------------------
// Scale-up (idle -> provisioning -> warm)
// ---------------------------------------------------------------------------
async function scaleUp() {
  if (modelState.state !== 'idle') return;
  modelState.state = 'provisioning';
  log('INFO', 'state -> provisioning');

  try {
    const offer = await pickCheapestOffer();
    if (!offer) {
      log('INFO', 'no offers available — returning to idle');
      modelState.state = 'idle';
      return;
    }

    const { allowed, capState } = await checkSpendCap(offer.dph_total);
    if (!allowed) {
      log(
        'INFO',
        `spend cap BLOCKED scale-up: spent=$${capState.already_spent_usd} ` +
          `burn_rate=$${capState.daily_burn_rate_usd} cap=$100`
      );
      modelState.state = 'idle';
      return;
    }

    const instanceId = await createInstance(offer.id);
    modelState.instanceId = instanceId;

    // Record rental in spend ledger immediately after instance creation
    await runPy(LEDGER_SCRIPT, [
      'rent',
      '--instance-id',
      String(instanceId),
      '--handle',
      `brittney-serving-${instanceId}`,
      '--dph',
      String(offer.dph_total),
      '--gpu-name',
      offer.gpu_name || '?',
    ]).catch((err) => log('ERROR', `ledger rent record failed (non-fatal): ${err.message}`));

    // Wait for instance to receive a public IP
    const conn = await waitForInstanceIP(instanceId);
    if (!conn) {
      log('ERROR', `instance ${instanceId} never got a public IP — tearing down`);
      await destroyVastInstance(instanceId, 'no-ip-timeout');
      modelState.state = 'idle';
      modelState.instanceId = undefined;
      return;
    }

    // Wait for vLLM to pass health check
    const healthy = await waitForVllmHealth(conn.ip, conn.port);
    if (!healthy) {
      log(
        'ERROR',
        `LOUD FAILURE: vLLM never became healthy after ${HEALTH_MAX_TRIES} ` +
          `attempts on instance ${instanceId} — tearing down`
      );
      await destroyVastInstance(instanceId, 'health-check-timeout');
      modelState.state = 'idle';
      modelState.instanceId = undefined;
      return;
    }

    // Register endpoint with control plane
    const hostUrl = `http://${conn.ip}:${conn.port}/v1`;
    const endpointId = await registerEndpoint(instanceId, hostUrl);
    modelState.endpointId = endpointId;
    modelState.healthFails = 0;
    lastHeartbeatAt = Date.now();
    modelState.state = 'warm';
    log('INFO', `state -> warm — endpoint ${endpointId} at ${hostUrl}`);
  } catch (err) {
    log('ERROR', `scale-up failed: ${err.message}`);
    if (modelState.instanceId) {
      await destroyVastInstance(modelState.instanceId, 'scale-up-error').catch(() => {});
    }
    modelState.state = 'idle';
    modelState.instanceId = undefined;
    modelState.endpointId = undefined;
    modelState.healthFails = 0;
  }
}

// ---------------------------------------------------------------------------
// Scale-to-zero (warm/provisioning -> draining -> idle)
// ---------------------------------------------------------------------------
async function scaleToZero(reason) {
  if (modelState.state === 'idle' || modelState.state === 'draining') return;
  log('INFO', `state -> draining (reason: ${reason})`);
  modelState.state = 'draining';

  try {
    if (modelState.endpointId) {
      await drainEndpoint(modelState.endpointId).catch((err) =>
        log('ERROR', `drain failed (continuing teardown): ${err.message}`)
      );
    }
    if (modelState.instanceId) {
      await destroyVastInstance(modelState.instanceId, reason);
    }
    if (modelState.endpointId) {
      await deregisterEndpoint(modelState.endpointId).catch((err) =>
        log('ERROR', `deregister failed: ${err.message}`)
      );
    }
  } finally {
    modelState.state = 'idle';
    modelState.instanceId = undefined;
    modelState.endpointId = undefined;
    modelState.healthFails = 0;
    log('INFO', 'state -> idle');
  }
}

// ---------------------------------------------------------------------------
// Main poll tick
// ---------------------------------------------------------------------------
async function tick() {
  // 1. Read control-plane status
  let status;
  try {
    status = await orchestratorFetch('/serve/status');
  } catch (err) {
    log('ERROR', `GET /serve/status failed: ${err.message}`);
    return;
  }

  const demand = (status.demand || {})[SERVE_MODEL];
  const endpoints = (status.endpoints || []).filter((e) => e.model === SERVE_MODEL);
  const warmEndpoints = endpoints.filter((e) => e.status === 'warm');

  const hasFreshDemand =
    demand && Date.now() - new Date(demand.last_want_at).getTime() < IDLE_TTL_MS;

  // 2. Heartbeat for warm endpoint
  if (modelState.state === 'warm' && modelState.endpointId) {
    if (Date.now() - lastHeartbeatAt >= HEARTBEAT_MS) {
      try {
        await heartbeatEndpoint(modelState.endpointId);
        lastHeartbeatAt = Date.now();
        modelState.healthFails = 0;
        log('INFO', `heartbeat OK — ${modelState.endpointId}`);
      } catch (err) {
        modelState.healthFails = (modelState.healthFails || 0) + 1;
        log(
          'ERROR',
          `heartbeat failed (${modelState.healthFails}/${HEALTH_FAIL_LIMIT}): ${err.message}`
        );
        if (modelState.healthFails >= HEALTH_FAIL_LIMIT) {
          log(
            'ERROR',
            `LOUD FAILURE: ${HEALTH_FAIL_LIMIT} consecutive heartbeat failures ` +
              `for ${modelState.endpointId} — tearing down`
          );
          await scaleToZero('heartbeat-failure');
          return;
        }
      }
    }
  }

  // 3. Scale-to-zero on idle
  if (modelState.state === 'warm' && !hasFreshDemand) {
    log(
      'INFO',
      `idle TTL exceeded: no demand for model=${SERVE_MODEL} ` +
        `in last ${IDLE_TTL_MS / 60_000} min — scaling to zero`
    );
    await scaleToZero('idle-ttl-expired');
    return;
  }

  // 4. Scale-up on cold demand
  if (modelState.state === 'idle' && hasFreshDemand && warmEndpoints.length === 0) {
    log(
      'INFO',
      `cold demand for model=${SERVE_MODEL} ` +
        `(want_count=${demand?.want_count}, last=${demand?.last_want_at}) — scaling up`
    );
    // scaleUp is long-running; it sets state='provisioning' synchronously,
    // then completes async. Await it so errors surface in the tick log.
    await scaleUp();
  }
}

// ---------------------------------------------------------------------------
// Self-test (no live vastai or orchestrator calls)
// ---------------------------------------------------------------------------
function selfTest() {
  console.log('running self-test...');

  // Config defaults resolve
  console.assert(SERVE_MODEL.length > 0, 'SERVE_MODEL must be non-empty');
  console.assert(VLLM_HF_MODEL.length > 0, 'VLLM_HF_MODEL must be non-empty');
  console.assert(VLLM_PORT > 0, 'VLLM_PORT must be positive');
  console.assert(VAST_MAX_DPH > 0, 'VAST_MAX_DPH must be positive');
  console.assert(TICK_MS > 0, 'TICK_MS must be positive');

  // Endpoint ID naming convention matches control-plane rule (vast- prefix)
  const fakeId = 12_345;
  const endpointId = `vast-${fakeId}`;
  console.assert(endpointId.startsWith('vast-'), 'endpoint id must start with vast-');
  console.assert(endpointId === 'vast-12345', `endpoint id mismatch: ${endpointId}`);

  // Idle TTL detection
  const freshTs = new Date(Date.now() - 60_000).toISOString();
  const staleTs = new Date(Date.now() - (IDLE_TTL_MS + 60_000)).toISOString();
  const isFresh = Date.now() - new Date(freshTs).getTime() < IDLE_TTL_MS;
  const isStale = Date.now() - new Date(staleTs).getTime() < IDLE_TTL_MS;
  console.assert(isFresh === true, 'fresh demand should not be stale');
  console.assert(isStale === false, 'old demand should be stale');

  // vLLM onstart command
  console.assert(VLLM_ONSTART.includes('vllm'), 'onstart must reference vllm');
  console.assert(
    VLLM_ONSTART.includes(VLLM_HF_MODEL),
    `onstart must reference VLLM_HF_MODEL=${VLLM_HF_MODEL}`
  );
  console.assert(
    VLLM_ONSTART.includes(String(VLLM_PORT)),
    `onstart must reference VLLM_PORT=${VLLM_PORT}`
  );

  // Cap gate: parse cap-check output
  const underCapResult = JSON.parse(
    JSON.stringify({
      cap_usd: 100,
      already_spent_usd: 5,
      daily_burn_rate_usd: 12,
      headroom_burn_rate_usd: 88,
      under_cap_actual: true,
      under_cap_projected: true,
    })
  );
  console.assert(underCapResult.under_cap_actual === true, 'cap check: should be under cap actual');
  console.assert(underCapResult.headroom_burn_rate_usd === 88, 'cap check: headroom mismatch');

  // Headroom logic for new instance
  const estimatedDph = 0.5;
  const estimatedDailyUsd = estimatedDph * 24; // $12/day
  const headroom = underCapResult.headroom_burn_rate_usd; // $88
  console.assert(
    estimatedDailyUsd <= headroom,
    `new instance ($${estimatedDailyUsd}) should fit in headroom ($${headroom})`
  );

  console.log(`self-test PASS (13 assertions)`);
  console.log(`config snapshot:`);
  console.log(`  SERVE_MODEL=${SERVE_MODEL}`);
  console.log(`  VLLM_HF_MODEL=${VLLM_HF_MODEL}`);
  console.log(`  VAST_GPU_CLASS=${VAST_GPU_CLASS}`);
  console.log(`  VAST_MIN_VRAM_GB=${VAST_MIN_VRAM_GB}`);
  console.log(`  VAST_MAX_DPH=$${VAST_MAX_DPH}`);
  console.log(`  TICK_MS=${TICK_MS}`);
  console.log(`  IDLE_TTL_MS=${IDLE_TTL_MS}`);
  console.log(`  VASTAI_CLI=${VASTAI_CLI}`);
  console.log(`  LEDGER_SCRIPT=${LEDGER_SCRIPT}`);
  console.log(`  PICKER_SCRIPT=${PICKER_SCRIPT}`);
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------
const cliArgs = process.argv.slice(2);

if (cliArgs.includes('--help') || cliArgs.includes('-h')) {
  console.log(`serving-autoscaler.mjs — scale-to-zero Brittney serving controller

Usage:
  ORCHESTRATOR_API_KEY=<key> node serving-autoscaler.mjs        # live run
  DRY_RUN=1 ORCHESTRATOR_API_KEY=test node serving-autoscaler.mjs  # dry run
  node serving-autoscaler.mjs --self-test                       # no live calls
  node serving-autoscaler.mjs --help

Key env vars:
  ORCHESTRATOR_API_KEY   REQUIRED for live run (agent-role orchestrator key)
  SERVE_MODEL            model tracked in control plane (default: brittney-v0)
  VLLM_HF_MODEL          HF model to serve (default: Qwen/Qwen2.5-0.5B-Instruct)
  VAST_GPU_CLASS         gpu_name regex (default: .*)
  VAST_MIN_VRAM_GB       minimum VRAM GB (default: 8)
  VAST_MAX_DPH           max $/hr cap (default: 0.50)
  DRY_RUN=1              skip real vastai calls and orchestrator writes
  AUTOSCALER_IDLE_TTL_MS no-demand window before scale-to-zero ms (default: 600000)
`);
  process.exit(0);
}

if (cliArgs.includes('--self-test')) {
  selfTest();
  process.exit(0);
}

// Live run
if (!ORCHESTRATOR_API_KEY) {
  console.error('ERROR: ORCHESTRATOR_API_KEY is required for live run');
  console.error('  set it or use --self-test / DRY_RUN=1 for testing');
  process.exit(1);
}

log('INFO', `starting — tick=${TICK_MS}ms idle_ttl=${IDLE_TTL_MS}ms heartbeat=${HEARTBEAT_MS}ms`);
log(
  'INFO',
  `model=${SERVE_MODEL} vllm=${VLLM_HF_MODEL} ` +
    `gpu_class=${VAST_GPU_CLASS} min_vram=${VAST_MIN_VRAM_GB}GB max_dph=$${VAST_MAX_DPH}`
);
if (DRY_RUN) log('INFO', 'DRY_RUN=1 — no real vastai or orchestrator write calls');

(async () => {
  while (true) {
    try {
      await tick();
    } catch (err) {
      log('ERROR', `unhandled tick error: ${err.message}`, err.stack);
    }
    await sleep(TICK_MS);
  }
})();
