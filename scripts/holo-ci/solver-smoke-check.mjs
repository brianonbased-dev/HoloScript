#!/usr/bin/env node
/**
 * solver-smoke-check.mjs — fail loud if the deployed solver path is broken.
 *
 * The default deployed-health endpoint is an exact, zero-spend GET route that
 * accepts no caller input and returns a hash-bound receipt from one real solver
 * step. Any paid/arbitrary non-loopback MCP request remains unreachable until
 * the host HoloShell gate emits a registered-seat-signed receipt bound to the
 * endpoint, tool, request hash, board task, free-first proof, persisted cap,
 * and ledger headroom. Only after that receipt exists does this process resolve
 * HOLOSCRIPT_MCP_API_KEY.
 *
 * Default deployed-health usage:
 *   pnpm check:solver-smoke
 *
 * Local zero-spend usage (the endpoint is structurally pinned to loopback
 * before an optional local-auth key is resolved):
 *   node scripts/holo-ci/solver-smoke-check.mjs \
 *     --endpoint http://127.0.0.1:7411/mcp --zero-spend-local
 *
 * Paid/deployed usage:
 *   node scripts/holo-ci/solver-smoke-check.mjs \
 *     --endpoint https://mcp.holoscript.net/mcp \
 *     --task-id <task> --max-spend-usd <n> \
 *     --free-first-receipt <exact-json> --admission-surface <surface>
 *
 * Exit 0 = solver healthy. Exit 1 = broken/degraded. Exit 2 = admission/key/usage.
 */

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export const CONFIG = {
  gridResolution: [3, 3, 3],
  domainSize: [1, 1, 1],
  timeStep: 0.01,
  materials: {},
  defaultMaterial: 'water',
  boundaryConditions: [],
  sources: [],
  initialTemperature: 20,
};

export const PUBLIC_SOLVER_HEALTH_ENDPOINT = 'https://mcp.holoscript.net/api/health/solver';
export const SOLVER_HEALTH_SCHEMA = 'holoscript.solver-health.v1';

export class SmokeFail extends Error {
  constructor(message, detail, code = 1) {
    super(message);
    this.code = code;
    this.detail = detail;
  }
}

function argVal(args, flag, fallback = '') {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : fallback;
}

export function resolveKey({ env = process.env, home = homedir(), cwd = process.cwd() } = {}) {
  if (env.HOLOSCRIPT_MCP_API_KEY) return env.HOLOSCRIPT_MCP_API_KEY.trim();
  const candidates = [join(home, '.ai-ecosystem', '.env'), join(cwd, '.env')];
  for (const filePath of candidates) {
    if (!existsSync(filePath)) continue;
    const line = readFileSync(filePath, 'utf8')
      .split(/\r?\n/u)
      .find((candidate) => candidate.startsWith('HOLOSCRIPT_MCP_API_KEY='));
    if (!line) continue;
    return line
      .slice('HOLOSCRIPT_MCP_API_KEY='.length)
      .replace(/^["']|["']$/gu, '')
      .trim();
  }
  return null;
}

export function resolveLocalKey({ env = process.env, home = homedir(), cwd = process.cwd() } = {}) {
  for (const name of ['HOLOSCRIPT_LOCAL_MCP_API_KEY', 'HOLOSCRIPT_API_KEY', 'MCP_API_KEY']) {
    if (env[name]) return env[name].trim();
  }
  const candidates = [join(cwd, '.env'), join(home, '.ai-ecosystem', '.env')];
  for (const filePath of candidates) {
    if (!existsSync(filePath)) continue;
    const lines = readFileSync(filePath, 'utf8').split(/\r?\n/u);
    for (const name of ['HOLOSCRIPT_LOCAL_MCP_API_KEY', 'HOLOSCRIPT_API_KEY', 'MCP_API_KEY']) {
      const line = lines.find((candidate) => candidate.startsWith(`${name}=`));
      if (!line) continue;
      return line
        .slice(name.length + 1)
        .replace(/^["']|["']$/gu, '')
        .trim();
    }
  }
  return null;
}

function canonicalize(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`)
    .join(',')}}`;
}

function sha256(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

export function buildSolverRequest(endpoint) {
  const body = {
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/call',
    params: { name: 'solve_thermal', arguments: { config: CONFIG } },
  };
  return {
    body,
    requestHash: sha256(
      canonicalize({
        endpoint,
        method: body.method,
        tool: body.params.name,
        arguments: body.params.arguments,
      })
    ),
  };
}

export function buildSolverHealthRequest(endpoint = PUBLIC_SOLVER_HEALTH_ENDPOINT) {
  return {
    requestHash: sha256(
      canonicalize({
        endpoint,
        method: 'GET',
        schemaVersion: SOLVER_HEALTH_SCHEMA,
      })
    ),
  };
}

export function isLoopbackEndpoint(endpoint) {
  try {
    const hostname = new URL(endpoint).hostname.toLowerCase();
    return ['127.0.0.1', 'localhost', '[::1]', '::1'].includes(hostname);
  } catch {
    return false;
  }
}

export function isPublicSolverHealthEndpoint(endpoint) {
  try {
    const candidate = new URL(endpoint);
    const expected = new URL(PUBLIC_SOLVER_HEALTH_ENDPOINT);
    return (
      candidate.protocol === expected.protocol &&
      candidate.hostname === expected.hostname &&
      candidate.port === expected.port &&
      candidate.pathname === expected.pathname &&
      candidate.username === '' &&
      candidate.password === '' &&
      candidate.search === '' &&
      candidate.hash === ''
    );
  } catch {
    return false;
  }
}

function validateSolverResult(result, raw) {
  if (result.success !== true) {
    throw new SmokeFail('solver returned success!=true', result.error || JSON.stringify(result));
  }
  const trace = result.caelTraceId || result.cael_trace_id;
  if (typeof trace !== 'string' || !trace.startsWith('cael')) {
    throw new SmokeFail(
      'no real caelTraceId (solver did not genuinely execute)',
      JSON.stringify(result).slice(0, 300)
    );
  }
  const device = result._device || result.device || result?.result_summary?.device;
  if (typeof device !== 'string' || device.length === 0 || device === 'CPU-stub') {
    throw new SmokeFail(
      device === 'CPU-stub'
        ? 'solver fell back to CPU-stub (no real physics ran — billing edge)'
        : 'solver response did not identify its execution device',
      raw.slice(0, 300)
    );
  }
  return { trace, device };
}

function validateHealthReceipt(receipt, raw) {
  if (
    receipt?.schemaVersion !== SOLVER_HEALTH_SCHEMA ||
    receipt?.status !== 'healthy' ||
    receipt?.zeroSpend !== true ||
    receipt?.spendUsd !== 0 ||
    receipt?.credentialUsed !== false ||
    receipt?.steps !== 1
  ) {
    throw new SmokeFail('invalid zero-spend solver health receipt', raw.slice(0, 600));
  }
  if (!/^sha256:[a-f0-9]{64}$/u.test(String(receipt.receiptHash || ''))) {
    throw new SmokeFail('solver health receipt has no valid receiptHash', raw.slice(0, 600));
  }
  const { receiptHash, ...payload } = receipt;
  const expectedReceiptHash = sha256(canonicalize(payload));
  if (receiptHash !== expectedReceiptHash) {
    throw new SmokeFail(
      'solver health receipt hash mismatch',
      `expected=${expectedReceiptHash} actual=${receiptHash}`
    );
  }
  return validateSolverResult(receipt, raw);
}

function sanitizedAdmissionEnv(surface, handle, env = process.env, home = homedir()) {
  return Object.fromEntries(
    Object.entries({
      SystemRoot: env.SystemRoot,
      WINDIR: env.WINDIR,
      COMSPEC: env.COMSPEC,
      PATH: env.PATH,
      USERPROFILE: home,
      HOME: home,
      HOLOMESH_AGENT_SURFACE: surface,
      CODEX_WINDOW_HANDLE: handle || undefined,
    }).filter(([, value]) => typeof value === 'string' && value.length > 0)
  );
}

export function runHostAdmission(options = {}, dependencies = {}) {
  const required = [
    ['task-id', options.taskId],
    ['max-spend-usd', options.maxSpendUsd],
    ['free-first-receipt', options.freeFirstReceipt],
    ['admission-surface', options.admissionSurface],
  ];
  const missing = required.filter(([, value]) => !String(value || '').trim()).map(([name]) => name);
  if (missing.length) {
    throw new SmokeFail(
      `paid solver admission requires --${missing.join(', --')}`,
      'The MCP credential was not resolved and no network request was made.',
      2
    );
  }

  const home = dependencies.home || homedir();
  const admissionScript = join(home, '.ai-ecosystem', 'scripts', 'solver-smoke-admission.mjs');
  if (!existsSync(admissionScript)) {
    throw new SmokeFail(
      `host admission script missing: ${admissionScript}`,
      'The MCP credential was not resolved and no network request was made.',
      2
    );
  }

  const result = (dependencies.spawnImpl || spawnSync)(
    process.execPath,
    [
      admissionScript,
      '--endpoint',
      options.endpoint,
      '--tool',
      'solve_thermal',
      '--request-hash',
      options.requestHash,
      '--task-id',
      options.taskId,
      '--max-spend-usd',
      String(options.maxSpendUsd),
      '--free-first-receipt',
      options.freeFirstReceipt,
      '--surface',
      options.admissionSurface,
      ...(options.admissionHandle ? ['--handle', options.admissionHandle] : []),
      ...(options.admissionOut ? ['--out', options.admissionOut] : []),
    ],
    {
      cwd: join(home, '.ai-ecosystem'),
      env: sanitizedAdmissionEnv(
        options.admissionSurface,
        options.admissionHandle,
        dependencies.env || process.env,
        home
      ),
      encoding: 'utf8',
      timeout: Math.min(Number(options.timeoutMs) || 60_000, 60_000),
      windowsHide: true,
    }
  );
  if (result.error || result.status !== 0) {
    throw new SmokeFail(
      'host spend/credential admission refused',
      result.error?.message ||
        String(result.stderr || result.stdout || 'unknown admission failure'),
      2
    );
  }

  let receipt;
  try {
    receipt = JSON.parse(String(result.stdout || '').trim());
  } catch {
    throw new SmokeFail('host admission output was not JSON', result.stdout, 2);
  }
  if (
    receipt?.ok !== true ||
    !/^sha256:[a-f0-9]{64}$/u.test(String(receipt.receiptHash || '')) ||
    !String(receipt.receiptPath || '').trim() ||
    !/^0x[a-fA-F0-9]{40}$/u.test(String(receipt.signerAddress || ''))
  ) {
    throw new SmokeFail('host admission did not emit a valid signed receipt', result.stdout, 2);
  }
  return receipt;
}

export async function runSolverSmoke(options = {}, dependencies = {}) {
  const endpoint = options.endpoint || PUBLIC_SOLVER_HEALTH_ENDPOINT;
  const timeoutMs = Number(options.timeoutMs || 60_000);
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new SmokeFail('timeout-ms must be a positive number', null, 2);
  }

  const zeroSpendLocal = options.zeroSpendLocal === true;
  const zeroSpendHealth = isPublicSolverHealthEndpoint(endpoint);
  if (zeroSpendLocal && !isLoopbackEndpoint(endpoint)) {
    throw new SmokeFail(
      '--zero-spend-local is restricted to loopback endpoints',
      'The MCP credential was not resolved and no network request was made.',
      2
    );
  }

  const request = zeroSpendHealth
    ? buildSolverHealthRequest(endpoint)
    : buildSolverRequest(endpoint);
  const admission =
    zeroSpendLocal || zeroSpendHealth
      ? null
      : await (dependencies.admitImpl || runHostAdmission)(
          {
            ...options,
            endpoint,
            timeoutMs,
            requestHash: request.requestHash,
          },
          dependencies
        );

  let key = null;
  if (!zeroSpendHealth) {
    const keyResolver = zeroSpendLocal
      ? dependencies.resolveLocalKeyImpl || resolveLocalKey
      : dependencies.resolveKeyImpl || resolveKey;
    key = keyResolver({
      env: dependencies.env || process.env,
      home: dependencies.home || homedir(),
      cwd: dependencies.cwd || process.cwd(),
    });
    if (!zeroSpendLocal && !key) {
      throw new SmokeFail(
        'no HOLOSCRIPT_MCP_API_KEY (env, ~/.ai-ecosystem/.env, or <repo>/.env)',
        null,
        2
      );
    }
  }

  const headers = zeroSpendHealth
    ? { Accept: 'application/json' }
    : { 'Content-Type': 'application/json' };
  if (key) headers['x-mcp-api-key'] = key;
  if (admission) {
    headers['x-holoshell-admission-receipt'] = admission.receiptHash;
    headers['x-holoshell-admission-signer'] = admission.signerAddress;
  }

  let response;
  try {
    response = await (dependencies.fetchImpl || fetch)(endpoint, {
      method: zeroSpendHealth ? 'GET' : 'POST',
      headers,
      ...(zeroSpendHealth ? {} : { body: JSON.stringify(request.body) }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    throw new SmokeFail(
      error?.name === 'TimeoutError' ? `timeout after ${timeoutMs}ms` : 'request threw',
      error?.message || String(error)
    );
  }

  const raw = await response.text();
  if (!response.ok) throw new SmokeFail(`HTTP ${response.status} from ${endpoint}`, raw);

  let envelope;
  try {
    envelope = JSON.parse(raw);
  } catch {
    throw new SmokeFail('response was not JSON', raw);
  }

  if (zeroSpendHealth) {
    const { trace, device } = validateHealthReceipt(envelope, raw);
    return {
      ok: true,
      trace,
      device,
      requestHash: request.requestHash,
      receiptHash: envelope.receiptHash,
      zeroSpendHealth: true,
      zeroSpendLocal: false,
      admission: null,
    };
  }

  if (envelope.error) {
    throw new SmokeFail('JSON-RPC error envelope', JSON.stringify(envelope.error));
  }

  const text = envelope?.result?.content?.[0]?.text;
  if (!text) throw new SmokeFail('no result.content[0].text in envelope', raw);
  let result;
  try {
    result = JSON.parse(text);
  } catch {
    throw new SmokeFail('inner result text not JSON', text);
  }

  if (result.success !== true) {
    throw new SmokeFail('solver returned success!=true', result.error || JSON.stringify(result));
  }
  const trace = result.caelTraceId || result.cael_trace_id;
  if (typeof trace !== 'string' || !trace.startsWith('cael')) {
    throw new SmokeFail(
      'no real caelTraceId (solver did not genuinely execute)',
      JSON.stringify(result).slice(0, 300)
    );
  }
  const device = result._device || result.device || result?.result_summary?.device;
  if (device === 'CPU-stub') {
    throw new SmokeFail(
      'solver fell back to CPU-stub (no real physics ran — billing edge)',
      JSON.stringify(result).slice(0, 300)
    );
  }

  return {
    ok: true,
    trace,
    device: device || null,
    requestHash: request.requestHash,
    zeroSpendHealth: false,
    zeroSpendLocal,
    admission,
  };
}

function parseArgs(args = process.argv.slice(2)) {
  return {
    endpoint: argVal(args, '--endpoint', PUBLIC_SOLVER_HEALTH_ENDPOINT),
    timeoutMs: Number(argVal(args, '--timeout-ms', '60000')),
    taskId: argVal(args, '--task-id'),
    maxSpendUsd: argVal(args, '--max-spend-usd'),
    freeFirstReceipt: argVal(args, '--free-first-receipt'),
    admissionSurface: argVal(args, '--admission-surface', process.env.HOLOMESH_AGENT_SURFACE || ''),
    admissionHandle: argVal(args, '--admission-handle', process.env.CODEX_WINDOW_HANDLE || ''),
    admissionOut: argVal(args, '--admission-out'),
    zeroSpendLocal: args.includes('--zero-spend-local'),
  };
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  runSolverSmoke(parseArgs())
    .then((result) => {
      const admission = result.admission
        ? ` admission=${result.admission.receiptHash} signer=${result.admission.signerAddress}`
        : result.zeroSpendHealth
          ? ` zero-spend-health=true receipt=${result.receiptHash}`
          : ' zero-spend-local=true';
      console.log(
        `[solver-smoke] OK — solve_thermal genuine execution. caelTraceId=${result.trace}` +
          `${result.device ? ` device=${result.device}` : ''}${admission}`
      );
      process.exitCode = 0;
    })
    .catch((error) => {
      const code = error instanceof SmokeFail ? error.code : 1;
      console.error(`[solver-smoke] FAIL(${code}): ${error.message}`);
      if (error.detail) console.error(`  ${String(error.detail).slice(0, 600)}`);
      process.exitCode = code;
    });
}
