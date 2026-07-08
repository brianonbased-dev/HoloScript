#!/usr/bin/env node
/**
 * Secret-safe readiness gate for making Jetson the primary HoloScript
 * workspace host. The default laptop run is a planning receipt; strict mode
 * fails closed until executed on the target Jetson or against a Jetson receipt.
 */

import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, statfsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import os from 'node:os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..', '..');
const DEFAULT_WORKSPACE_ROOT = '/mnt/nvme2/holo-workspaces/HoloScript';
const DEFAULT_SERVICE_DATA_ROOT = '/mnt/nvme2/holo-volumes';
const DEFAULT_MODEL_OPS_ROOT = '/mnt/nvme1/holo-model-ops';
const SCHEMA = 'holoscript.jetson-main-workspace-readiness.v1';

const args = process.argv.slice(2);

function hasFlag(name) {
  return args.includes(`--${name}`);
}

function valueFor(name) {
  const index = args.indexOf(`--${name}`);
  if (index < 0) return undefined;
  const value = args[index + 1];
  return value && !value.startsWith('--') ? value : undefined;
}

function numberFor(name, fallback) {
  const raw = valueFor(name);
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) throw new Error(`--${name} must be a non-negative number`);
  return value;
}

function gib(bytes) {
  return Number((bytes / 1024 ** 3).toFixed(2));
}

function posixPath(value) {
  return typeof value === 'string' && value.startsWith('/') && !/^[A-Za-z]:/.test(value);
}

function readTextIfExists(file) {
  try {
    if (!existsSync(file)) return '';
    return readFileSync(file, 'utf8');
  } catch {
    return '';
  }
}

function detectJetsonMarker(host) {
  if (host.platform !== 'linux' || host.arch !== 'arm64') return null;
  const deviceTreeModel = readTextIfExists('/proc/device-tree/model').replace(/\0/g, '').trim();
  if (/jetson|nvidia/i.test(deviceTreeModel)) return deviceTreeModel;
  const nvTegra = readTextIfExists('/etc/nv_tegra_release').trim();
  if (nvTegra) return '/etc/nv_tegra_release';
  if (process.env.JETSON_READINESS_ASSUME_JETSON === '1') return 'JETSON_READINESS_ASSUME_JETSON=1';
  if (/jetson|orin|tegra/i.test(host.hostname)) return `hostname:${host.hostname}`;
  return null;
}

function check(id, ok, severity, summary, detail = {}) {
  return { id, ok, severity, summary, detail };
}

function pathStats(path) {
  if (!existsSync(path)) return null;
  try {
    const stats = statfsSync(path);
    const totalBytes = Number(stats.blocks) * Number(stats.bsize);
    const freeBytes = Number(stats.bavail) * Number(stats.bsize);
    return {
      totalGb: gib(totalBytes),
      freeGb: gib(freeBytes),
      freePercent: totalBytes > 0 ? Number(((freeBytes / totalBytes) * 100).toFixed(1)) : 0,
    };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

function gitProbe(workspaceRoot) {
  if (!existsSync(workspaceRoot)) return { available: false, reason: 'workspace root missing' };
  const result = spawnSync('git', ['-C', workspaceRoot, 'status', '--porcelain=v1', '--branch'], {
    encoding: 'utf8',
    windowsHide: true,
    timeout: 10000,
  });
  if (result.error) return { available: false, reason: result.error.message };
  if (result.status !== 0) {
    return {
      available: false,
      reason: (result.stderr || result.stdout || `git exited ${result.status}`).trim(),
    };
  }
  const lines = result.stdout.split(/\r?\n/).filter(Boolean);
  const branch = lines.find((line) => line.startsWith('## ')) || '';
  const changes = lines.filter((line) => !line.startsWith('## '));
  return {
    available: true,
    branch: branch.replace(/^##\s*/, ''),
    dirtyEntries: changes.length,
    clean: changes.length === 0,
  };
}

function configuredEndpoint() {
  return (
    process.env.HOLOLLAMA_JETSON_ENDPOINT ||
    process.env.JETSON_HOLOLLAMA_ENDPOINT ||
    process.env.HOLOLLAMA_ENDPOINT ||
    ''
  );
}

async function probeHoloLlama(endpoint, timeoutMs) {
  if (!endpoint) return { configured: false };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const healthUrl = new URL('/health', endpoint).href;
    const modelsUrl = new URL('/v1/models', endpoint).href;
    const health = await fetch(healthUrl, { signal: controller.signal });
    const models = await fetch(modelsUrl, { signal: controller.signal });
    return {
      configured: true,
      healthOk: health.ok,
      healthStatus: health.status,
      modelsOk: models.ok,
      modelsStatus: models.status,
    };
  } catch (error) {
    return {
      configured: true,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    clearTimeout(timer);
  }
}

function evaluateHost({ requireJetson, host }) {
  const marker = detectJetsonMarker(host);
  const linuxArm64 = host.platform === 'linux' && host.arch === 'arm64';
  const checks = [
    check(
      'host-linux-arm64',
      linuxArm64,
      requireJetson ? 'error' : 'info',
      linuxArm64 ? 'Host is Linux arm64.' : 'Current host is not Linux arm64.',
      { platform: host.platform, arch: host.arch }
    ),
    check(
      'jetson-marker',
      Boolean(marker),
      requireJetson ? 'error' : 'info',
      marker ? 'Jetson marker detected.' : 'No Jetson hardware marker detected on this host.',
      { marker }
    ),
  ];
  return { marker, linuxArm64, checks };
}

function evaluatePathContract(options) {
  const {
    workspaceRoot,
    serviceDataRoot,
    modelOpsRoot,
    requireJetson,
    requireExisting,
    minWorkspaceFreeGb,
    minServiceDataFreeGb,
    minModelOpsFreeGb,
  } = options;

  const checks = [];
  const workspaceStats = pathStats(workspaceRoot);
  const serviceStats = pathStats(serviceDataRoot);
  const modelStats = pathStats(modelOpsRoot);
  const roots = [
    ['workspace-root-posix-nvme2', workspaceRoot, '/mnt/nvme2', 'Workspace root should be under NVMe2.'],
    ['service-data-root-posix-nvme2', serviceDataRoot, '/mnt/nvme2', 'Service data root should be under NVMe2.'],
    ['model-ops-root-posix-nvme1', modelOpsRoot, '/mnt/nvme1', 'Model ops root should remain under NVMe1.'],
  ];

  for (const [id, value, prefix, summary] of roots) {
    const ok = posixPath(value) && value.startsWith(prefix);
    checks.push(check(id, ok, 'error', ok ? summary : `${summary} Got ${value}`, { path: value, expectedPrefix: prefix }));
  }

  for (const [id, value, stats, minFreeGb, label] of [
    ['workspace-root-present', workspaceRoot, workspaceStats, minWorkspaceFreeGb, 'workspace root'],
    ['service-data-root-present', serviceDataRoot, serviceStats, minServiceDataFreeGb, 'service data root'],
    ['model-ops-root-present', modelOpsRoot, modelStats, minModelOpsFreeGb, 'model ops root'],
  ]) {
    const exists = stats !== null;
    checks.push(
      check(
        id,
        exists || (!requireJetson && !requireExisting),
        requireJetson || requireExisting ? 'error' : 'info',
        exists ? `${label} exists.` : `${label} is not present on this host.`,
        { path: value, stats }
      )
    );
    if (exists && !stats.error) {
      checks.push(
        check(
          `${id}-free-space`,
          stats.freeGb >= minFreeGb,
          'error',
          `${label} has ${stats.freeGb} GiB free; minimum is ${minFreeGb} GiB.`,
          { path: value, stats, minFreeGb }
        )
      );
    }
  }

  if (existsSync(workspaceRoot)) {
    checks.push(
      check(
        'workspace-package-json',
        existsSync(join(workspaceRoot, 'package.json')),
        'error',
        'Workspace has package.json.',
        { file: join(workspaceRoot, 'package.json') }
      )
    );
    checks.push(
      check(
        'workspace-agent-contract',
        existsSync(join(workspaceRoot, 'AGENTS.md')),
        'error',
        'Workspace has repo-local AGENTS.md.',
        { file: join(workspaceRoot, 'AGENTS.md') }
      )
    );
    const git = gitProbe(workspaceRoot);
    checks.push(
      check(
        'workspace-git-readable',
        git.available,
        'error',
        git.available ? 'Workspace git status is readable.' : `Workspace git status is not readable: ${git.reason}`,
        git
      )
    );
    if (git.available) {
      checks.push(
        check(
          'workspace-git-clean-caveat',
          true,
          git.clean ? 'info' : 'warning',
          git.clean
            ? 'Workspace is clean at probe time.'
            : 'Workspace has in-flight changes; do not perform cutover while peer work is active.',
          git
        )
      );
    }
  }

  return checks;
}

async function buildReadiness(options = {}) {
  const requireJetson = Boolean(options.requireJetson);
  const requireExisting = Boolean(options.requireExisting);
  const requireHoloLlama = Boolean(options.requireHoloLlama);
  const workspaceRoot = options.workspaceRoot || process.env.JETSON_WORKSPACE_ROOT || DEFAULT_WORKSPACE_ROOT;
  const serviceDataRoot =
    options.serviceDataRoot || process.env.JETSON_SERVICE_DATA_ROOT || DEFAULT_SERVICE_DATA_ROOT;
  const modelOpsRoot = options.modelOpsRoot || process.env.JETSON_MODEL_OPS_ROOT || DEFAULT_MODEL_OPS_ROOT;
  const host = options.host || {
    platform: process.platform,
    arch: process.arch,
    hostname: os.hostname(),
    release: os.release(),
  };
  const hostEval = evaluateHost({ requireJetson, host });
  const checks = [
    ...hostEval.checks,
    ...evaluatePathContract({
      workspaceRoot,
      serviceDataRoot,
      modelOpsRoot,
      requireJetson,
      requireExisting,
      minWorkspaceFreeGb: options.minWorkspaceFreeGb ?? 20,
      minServiceDataFreeGb: options.minServiceDataFreeGb ?? 25,
      minModelOpsFreeGb: options.minModelOpsFreeGb ?? 25,
    }),
  ];

  const endpoint = configuredEndpoint();
  if (options.probeHoloLlama) {
    const proof = await probeHoloLlama(endpoint, options.timeoutMs ?? 5000);
    checks.push(
      check(
        'holollama-jetson-endpoint-live',
        proof.configured && proof.healthOk === true && proof.modelsOk === true,
        requireHoloLlama ? 'error' : 'warning',
        proof.configured
          ? 'HoloLlama Jetson endpoint live probe completed.'
          : 'No HoloLlama Jetson endpoint configured for live probe.',
        proof
      )
    );
  } else {
    checks.push(
      check(
        'holollama-jetson-endpoint-configured',
        Boolean(endpoint) || !requireHoloLlama,
        requireHoloLlama ? 'error' : 'info',
        endpoint
          ? 'HoloLlama Jetson endpoint is configured.'
          : 'HoloLlama Jetson endpoint is not configured in this environment.',
        { configured: Boolean(endpoint) }
      )
    );
  }

  const blocking = checks.filter((item) => item.ok !== true && item.severity === 'error');
  const warnings = checks.filter((item) => item.severity === 'warning').map((item) => item.summary);
  const onTargetJetson = hostEval.linuxArm64 && Boolean(hostEval.marker);
  const disposition =
    blocking.length > 0
      ? 'blocked'
      : onTargetJetson
        ? 'jetson-target-ready'
        : 'planning-only-not-on-jetson';

  return {
    schema: SCHEMA,
    generatedAt: new Date().toISOString(),
    ok: blocking.length === 0,
    disposition,
    host,
    paths: {
      workspaceRoot,
      serviceDataRoot,
      modelOpsRoot,
      contract: {
        nvme2: ['workspaceRoot', 'serviceDataRoot'],
        nvme1: ['modelOpsRoot'],
      },
    },
    checks,
    blockers: blocking.map((item) => `${item.id}: ${item.summary}`),
    warnings,
    nextActions:
      disposition === 'jetson-target-ready'
        ? [
            'Run HoloLlama live lifecycle with systemd and footprint checks before declaring the Jetson appliance operational.',
            'Only cut over the primary workspace when peer work is idle or the target worktree is clean enough for explicit-path staging.',
          ]
        : [
            'Run this gate on the Jetson with --require-jetson after NVMe1/NVMe2 mounts are final.',
            'Keep model ops on NVMe1 and the primary workspace/service data lane on NVMe2.',
          ],
  };
}

function validateReceipt(receipt, requireJetson) {
  const errors = [];
  if (!receipt || typeof receipt !== 'object') errors.push('receipt must be an object');
  if (receipt?.schema !== SCHEMA) errors.push(`unexpected schema: ${receipt?.schema || '<missing>'}`);
  if (receipt?.ok !== true) errors.push('receipt.ok must be true');
  if (requireJetson && receipt?.disposition !== 'jetson-target-ready') {
    errors.push('strict receipt validation requires disposition=jetson-target-ready');
  }
  if (!Array.isArray(receipt?.checks) || receipt.checks.length === 0) {
    errors.push('receipt.checks must be a non-empty array');
  }
  for (const item of receipt?.checks || []) {
    if (!item.id || typeof item.ok !== 'boolean' || !item.severity) {
      errors.push('each receipt check must include id, ok, and severity');
      break;
    }
  }
  return {
    schema: 'holoscript.jetson-main-workspace-receipt-validation.v1',
    ok: errors.length === 0,
    errors,
  };
}

async function runSelfTest() {
  const planning = await buildReadiness({
    host: { platform: 'win32', arch: 'x64', hostname: 'laptop', release: 'test' },
    workspaceRoot: DEFAULT_WORKSPACE_ROOT,
    serviceDataRoot: DEFAULT_SERVICE_DATA_ROOT,
    modelOpsRoot: DEFAULT_MODEL_OPS_ROOT,
  });
  assert.equal(planning.ok, true);
  assert.equal(planning.disposition, 'planning-only-not-on-jetson');

  const blocked = await buildReadiness({
    requireJetson: true,
    host: { platform: 'win32', arch: 'x64', hostname: 'laptop', release: 'test' },
    workspaceRoot: DEFAULT_WORKSPACE_ROOT,
    serviceDataRoot: DEFAULT_SERVICE_DATA_ROOT,
    modelOpsRoot: DEFAULT_MODEL_OPS_ROOT,
  });
  assert.equal(blocked.ok, false);
  assert(blocked.blockers.some((item) => item.includes('host-linux-arm64')));

  const receipt = structuredClone(planning);
  receipt.ok = true;
  receipt.disposition = 'jetson-target-ready';
  receipt.checks = [{ id: 'host-linux-arm64', ok: true, severity: 'info', summary: 'ok', detail: {} }];
  assert.equal(validateReceipt(receipt, true).ok, true);

  const badReceipt = { schema: SCHEMA, ok: true, disposition: 'planning-only-not-on-jetson', checks: [] };
  assert.equal(validateReceipt(badReceipt, true).ok, false);

  const temp = mkdtempSync(join(tmpdir(), 'holoscript-jetson-readiness-'));
  rmSync(temp, { recursive: true, force: true });
  console.log('[jetson-main-workspace-readiness] self-test PASS');
}

if (hasFlag('help')) {
  console.log(`Usage:
  node scripts/holo-ci/check-jetson-main-workspace-readiness.mjs [options]

Options:
  --json                              Emit JSON only.
  --self-test                         Run deterministic unit checks.
  --require-jetson                    Fail unless this is a Jetson target receipt.
  --require-existing                  Require configured roots to exist on this host.
  --workspace-root <path>             Default: ${DEFAULT_WORKSPACE_ROOT}
  --service-data-root <path>          Default: ${DEFAULT_SERVICE_DATA_ROOT}
  --model-ops-root <path>             Default: ${DEFAULT_MODEL_OPS_ROOT}
  --min-workspace-free-gb <n>         Default: 20
  --min-service-data-free-gb <n>      Default: 25
  --min-model-ops-free-gb <n>         Default: 25
  --probe-holollama                   Probe /health and /v1/models on the configured Jetson endpoint.
  --require-holollama                 Make HoloLlama endpoint/probe failures blocking.
  --timeout-ms <n>                    HoloLlama probe timeout. Default: 5000.
  --receipt <file>                    Validate an existing readiness receipt instead of probing.

Environment:
  JETSON_WORKSPACE_ROOT, JETSON_SERVICE_DATA_ROOT, JETSON_MODEL_OPS_ROOT
  HOLOLLAMA_JETSON_ENDPOINT or JETSON_HOLOLLAMA_ENDPOINT
`);
  process.exit(0);
}

if (hasFlag('self-test')) {
  await runSelfTest();
  process.exit(0);
}

const requireJetson = hasFlag('require-jetson');
const receiptFile = valueFor('receipt');
let output;

if (receiptFile) {
  output = validateReceipt(JSON.parse(readFileSync(resolve(receiptFile), 'utf8')), requireJetson);
} else {
  output = await buildReadiness({
    requireJetson,
    requireExisting: hasFlag('require-existing'),
    workspaceRoot: valueFor('workspace-root'),
    serviceDataRoot: valueFor('service-data-root'),
    modelOpsRoot: valueFor('model-ops-root'),
    requireHoloLlama: hasFlag('require-holollama'),
    minWorkspaceFreeGb: numberFor('min-workspace-free-gb', 20),
    minServiceDataFreeGb: numberFor('min-service-data-free-gb', 25),
    minModelOpsFreeGb: numberFor('min-model-ops-free-gb', 25),
    probeHoloLlama: hasFlag('probe-holollama'),
    timeoutMs: numberFor('timeout-ms', 5000),
  });
}

if (hasFlag('json')) {
  console.log(JSON.stringify(output, null, 2));
} else if (output.schema === SCHEMA) {
  for (const item of output.checks) {
    const level = item.ok ? 'PASS' : item.severity.toUpperCase();
    console.log(`[jetson-main-workspace-readiness] ${level}: ${item.id} - ${item.summary}`);
  }
  if (output.ok) {
    console.log(`[jetson-main-workspace-readiness] PASS: ${output.disposition}`);
  } else {
    console.error(`[jetson-main-workspace-readiness] FAIL: ${output.blockers.length} blocker(s)`);
    for (const blocker of output.blockers) console.error(`  - ${blocker}`);
  }
} else {
  if (output.ok) {
    console.log('[jetson-main-workspace-readiness] PASS: receipt is valid.');
  } else {
    console.error('[jetson-main-workspace-readiness] FAIL: receipt validation failed.');
    for (const error of output.errors) console.error(`  - ${error}`);
  }
}

process.exit(output.ok ? 0 : 1);
