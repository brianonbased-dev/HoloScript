#!/usr/bin/env node
/**
 * HoloShell laptop reasoning worker.
 *
 * Consumes a Jetson-staged laptop_reasoning_job dispatch and writes the laptop
 * side result receipt. This worker is intentionally read-only: it proves the
 * laptop consumed the canonical resource plan, checks local surfaces such as
 * GOLD, and records the routing verdict without mutating the OS or launching a
 * model/provider by itself.
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const LAPTOP_REASONING_RESULT_SCHEMA = 'hololand.holoshell.laptop-reasoning-result.v0.1.0';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '..');
const DEFAULT_TMP = path.join('.tmp', 'holoshell');
const DEFAULT_DISPATCH = path.join(DEFAULT_TMP, 'agent-dispatch-latest.json');
const DEFAULT_OUTPUT = path.join(DEFAULT_TMP, 'laptop-reasoning-result-latest.json');
const DEFAULT_RESULT_DIR = path.join(DEFAULT_TMP, 'laptop-reasoning-results');
const SOURCE_REF = 'apps/holoshell/source/holoshell-laptop-reasoning-worker.hsplus';
const DISPATCH_SOURCE_REF = 'apps/holoshell/source/holoshell-agent-dispatch.hsplus';
const SCRIPT_REF = 'scripts/holoshell-laptop-reasoning-worker.mjs';
const DISPATCH_SCRIPT_REF = 'scripts/holoshell-agent-dispatch.mjs';
const GOLD_CODEBASE_SOURCE_REF = 'apps/holoshell/source/holoshell-holoscript-gold-codebase-bridge.hsplus';
const GOLD_CODEBASE_SCRIPT_REF = 'scripts/holoshell-holoscript-gold-codebase-bridge.mjs';
const SOVEREIGN_PEER_CONTEXT_REF = 'scripts/holoshell-laptop-reasoning-worker.mjs';
const STUDIO_ORCHESTRATOR_REF = 'packages/brittney/service/src/orchestrator.ts';
const STUDIO_MODEL_ROUTER_REF = 'packages/brittney/service/src/model-router.ts';
const STUDIO_FLEET_BRIDGE_REF = 'packages/shared/inference/src/integrations/spatial-fleet-bridge.ts';
const PROVIDER_ROUTING_REGISTRY_REF = 'C:/Users/josep/.ai-ecosystem/config/provider-routing-registry.json';
const SPEND_POLICY_REF = 'C:/Users/josep/.ai-ecosystem/SPEND.md';
const VAST_ESCALATION_GATE_REF = 'C:/Users/josep/.ai-ecosystem/scripts/vast-escalation-gate.mjs';
const FLEET_OUTPUT_CONTRACT_REF = 'C:/Users/josep/.ai-ecosystem/docs/contracts/fleet-output-contract.v2.schema.json';
const LAPTOP_REASONING_LANE = 'laptop-hardware';
const ACCEPTED_CAPABILITY_IDS = new Set([
  'laptop_reasoning_job',
  'laptop_reasoning_receipt_freshness',
]);
const ACCEPTED_SOURCE_HOSTS = new Set([
  'jetson_holoshell_surface',
  'holoshell_team_automation',
]);

function usage() {
  return `HoloShell laptop reasoning worker

Usage:
  node scripts/holoshell-laptop-reasoning-worker.mjs --dispatch .tmp/holoshell/agent-dispatch-latest.json --json

Options:
  --dispatch <path>       Jetson/laptop dispatch receipt. Defaults to .tmp/holoshell/agent-dispatch-latest.json
  --output <path>         Latest result receipt. Defaults to .tmp/holoshell/laptop-reasoning-result-latest.json
  --result-dir <path>     Archived result receipt directory. Defaults to .tmp/holoshell/laptop-reasoning-results
  --result-text <text>    Optional reasoning answer text to include in the result receipt
  --created-at <iso>      Stable timestamp for tests
  --self-test             Run deterministic read-only self-test
  --json                  Print JSON receipt
  -h, --help              Show this help
`;
}

export function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    dispatch: DEFAULT_DISPATCH,
    output: DEFAULT_OUTPUT,
    resultDir: DEFAULT_RESULT_DIR,
    resultText: '',
    createdAt: '',
    selfTest: false,
    json: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--') continue;
    if (arg === '--dispatch') args.dispatch = argv[++index] || args.dispatch;
    else if (arg === '--output') args.output = argv[++index] || args.output;
    else if (arg === '--result-dir') args.resultDir = argv[++index] || args.resultDir;
    else if (arg === '--result-text') args.resultText = argv[++index] || '';
    else if (arg === '--created-at') args.createdAt = argv[++index] || '';
    else if (arg === '--self-test') args.selfTest = true;
    else if (arg === '--json') args.json = true;
    else if (arg === '--help' || arg === '-h') {
      console.log(usage());
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return args;
}

function generatedAt(options = {}) {
  return options.createdAt || new Date().toISOString();
}

function resolveRepoPath(filePath) {
  return path.isAbsolute(filePath) ? filePath : path.resolve(REPO_ROOT, filePath);
}

function normalizeReceiptPath(filePath) {
  return String(filePath || '').replace(/\\/g, '/');
}

function hashValue(value) {
  return createHash('sha256').update(JSON.stringify(value), 'utf8').digest('hex');
}

function stableId(prefix, value) {
  return `${prefix}_${hashValue(value).slice(0, 12)}`;
}

function safeString(value, fallback = '') {
  const text = String(value ?? '').trim();
  return text || fallback;
}

function redactPrompt(text) {
  return String(text || '')
    .replace(/(password|passphrase|token|secret|api key|api-key|private key)\s*[:=]\s*\S+/gi, '$1=[redacted]')
    .slice(0, 360);
}

function normalizeHostPath(filePath) {
  const raw = safeString(filePath, '');
  if (!raw) return '';
  if (process.platform === 'win32') return raw.replace(/\//g, '\\');
  return raw;
}

function existsOnHost(filePath) {
  const hostPath = normalizeHostPath(filePath);
  return Boolean(hostPath && existsSync(hostPath));
}

function inspectGoldRoot(root) {
  const hostPath = normalizeHostPath(root);
  if (!hostPath || !existsSync(hostPath)) {
    return {
      root: normalizeReceiptPath(root),
      hostPath,
      status: process.platform === 'win32' ? 'missing_on_laptop' : 'not_mounted_on_this_host',
      usable: false,
      topLevelEntryCount: 0,
      sampledTopLevelEntries: [],
    };
  }
  let entries = [];
  try {
    entries = readdirSync(hostPath, { withFileTypes: true })
      .map((entry) => goldEntryForReceipt(entry))
      .filter((entry) => !entry.name.startsWith('.'))
      .sort((left, right) => left.name.localeCompare(right.name));
  } catch {
    return {
      root: normalizeReceiptPath(root),
      hostPath,
      status: 'mounted_on_laptop_read_failed',
      usable: false,
      topLevelEntryCount: 0,
      sampledTopLevelEntries: [],
    };
  }
  return {
    root: normalizeReceiptPath(root),
    hostPath,
    status: 'mounted_on_laptop',
    usable: true,
    topLevelEntryCount: entries.length,
    sampledTopLevelEntries: entries.slice(0, 16),
  };
}

function goldEntryForReceipt(entry) {
  const sensitiveName = /(credential|secret|token|wallet|api[-_ ]?key|password|private|^\.env$)/iu.test(entry.name);
  return {
    name: sensitiveName ? '[redacted-sensitive-name]' : entry.name,
    kind: entry.isDirectory() ? 'directory' : 'file',
    ...(sensitiveName ? { redacted: true } : {}),
  };
}

function inspectRepoRoot() {
  return {
    root: normalizeReceiptPath(REPO_ROOT),
    status: existsSync(path.join(REPO_ROOT, 'package.json')) ? 'available' : 'missing_package_json',
    sourceContractExists: existsSync(path.join(REPO_ROOT, SOURCE_REF)),
    dispatchScriptExists: existsSync(path.join(REPO_ROOT, DISPATCH_SCRIPT_REF)),
  };
}

function parseOptionalInteger(value) {
  const parsed = Number.parseInt(String(value || '').replace(/[^\d-]/g, ''), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseOptionalFloat(value) {
  const parsed = Number.parseFloat(String(value || '').replace(/[^.\d-]/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
}

function laptopGpuSummary(gpus, processes) {
  if (!gpus.length) return 'Laptop GPU telemetry was not reported by nvidia-smi on this host';
  return gpus.map((gpu) => {
    const util = Number.isFinite(gpu.utilizationGpuPercent) ? `${gpu.utilizationGpuPercent}% GPU` : 'GPU util not reported';
    const memory = Number.isFinite(gpu.memoryUsedMiB) && Number.isFinite(gpu.memoryTotalMiB)
      ? `${gpu.memoryUsedMiB}/${gpu.memoryTotalMiB} MiB`
      : 'memory not reported';
    const power = Number.isFinite(gpu.powerDrawW) ? `, ${gpu.powerDrawW}W` : '';
    const active = processes.length ? `, ${processes.length} compute process(es)` : ', no compute process reported';
    return `${gpu.name || `GPU ${gpu.index}`}: ${util}, ${memory}${power}${active}`;
  }).join('; ');
}

function laptopGpuSnapshot() {
  try {
    const raw = execFileSync('nvidia-smi', [
      '--query-gpu=index,name,utilization.gpu,memory.used,memory.total,power.draw',
      '--format=csv,noheader,nounits',
    ], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 5_000,
    }).trim();
    const gpus = raw
      ? raw.split(/\r?\n/u)
        .map((line) => line.split(',').map((part) => part.trim()))
        .filter((parts) => parts.length >= 5)
        .map(([index, name, utilizationGpu, memoryUsed, memoryTotal, powerDraw]) => ({
          index: parseOptionalInteger(index),
          name,
          utilizationGpuPercent: parseOptionalInteger(utilizationGpu),
          memoryUsedMiB: parseOptionalInteger(memoryUsed),
          memoryTotalMiB: parseOptionalInteger(memoryTotal),
          powerDrawW: parseOptionalFloat(powerDraw),
        }))
      : [];
    let computeProcesses = [];
    try {
      const processRaw = execFileSync('nvidia-smi', [
        '--query-compute-apps=pid,process_name,used_memory',
        '--format=csv,noheader,nounits',
      ], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
        timeout: 5_000,
      }).trim();
      computeProcesses = processRaw
        ? processRaw.split(/\r?\n/u)
          .map((line) => line.split(',').map((part) => part.trim()))
          .filter((parts) => parts.length >= 3 && parts[0])
          .map(([pid, processName, usedMemory]) => ({
            pid: parseOptionalInteger(pid),
            processName: String(processName || '').slice(0, 80),
            usedMemoryMiB: parseOptionalInteger(usedMemory),
          }))
        : [];
    } catch {
      computeProcesses = [];
    }
    const summary = laptopGpuSummary(gpus, computeProcesses);
    const firstGpu = gpus[0] || {};
    return {
      status: gpus.length ? 'reported' : 'not_reported',
      source: 'nvidia-smi',
      gpus,
      computeProcesses,
      activeComputeProcessCount: computeProcesses.length,
      utilizationGpuPercent: Number.isFinite(firstGpu.utilizationGpuPercent) ? firstGpu.utilizationGpuPercent : null,
      memoryUsedMiB: Number.isFinite(firstGpu.memoryUsedMiB) ? firstGpu.memoryUsedMiB : null,
      memoryTotalMiB: Number.isFinite(firstGpu.memoryTotalMiB) ? firstGpu.memoryTotalMiB : null,
      summary,
    };
  } catch (error) {
    return {
      status: 'not_reported',
      source: 'nvidia-smi',
      gpus: [],
      computeProcesses: [],
      activeComputeProcessCount: 0,
      utilizationGpuPercent: null,
      memoryUsedMiB: null,
      memoryTotalMiB: null,
      error: String(error.message || error).slice(0, 180),
      summary: 'Laptop GPU telemetry was not reported by nvidia-smi on this host',
    };
  }
}

function hostSnapshot() {
  const cpus = os.cpus() || [];
  return {
    platform: process.platform,
    arch: process.arch,
    release: os.release(),
    hostname: os.hostname(),
    node: process.version,
    cpuCount: cpus.length,
    cpuModel: cpus[0]?.model || '',
    totalMemBytes: os.totalmem(),
    freeMemBytes: os.freemem(),
  };
}

export function readDispatchReceipt(dispatchPath = DEFAULT_DISPATCH) {
  const resolved = resolveRepoPath(dispatchPath);
  if (!existsSync(resolved)) throw new Error(`dispatch receipt not found: ${resolved}`);
  const receipt = JSON.parse(readFileSync(resolved, 'utf8'));
  return { receipt, path: resolved };
}

function requiredSurfaceChecks(dispatch = {}) {
  const body = dispatch.dispatch?.body || {};
  const surfaces = body.canonicalSurfaces || {};
  const vastRequires = surfaces.vastFleet?.requires || [];
  return [
    ['capability_id', ACCEPTED_CAPABILITY_IDS.has(dispatch.summary?.capabilityId)],
    ['dispatch_kind', dispatch.summary?.dispatchKind === 'reasoning_job'],
    ['dispatch_status', dispatch.summary?.status === 'ready_to_stage'],
    ['permission_envelope', body.permissionEnvelope === 'read_only'],
    ['target_host', body.targetHost === 'laptop_windows'],
    ['source_host', ACCEPTED_SOURCE_HOSTS.has(body.sourceHost)],
    ['lane', body.lane === LAPTOP_REASONING_LANE],
    ['agent_lane', body.agentLane === 'local'],
    ['canonical_provider_id', body.canonicalProviderId === 'laptop-sovereign'],
    ['reuse_before_build', body.reuseBeforeBuild === true],
    ['gold_drive_root', Boolean(surfaces.goldDrive?.root)],
    ['gold_drive_read_only', surfaces.goldDrive?.readOnly === true],
    ['codebase_bridge', Boolean(surfaces.codebaseBridge?.sourceAnchors?.includes(GOLD_CODEBASE_SCRIPT_REF))],
    ['sovereign_peer_context_route', surfaces.sovereignPeerContext?.route === '/workflow/laptop-reasoning-job'],
    ['studio_orchestrator', surfaces.studioBrittney?.serviceOrchestrator === STUDIO_ORCHESTRATOR_REF],
    ['studio_model_router', surfaces.studioBrittney?.modelRouter === STUDIO_MODEL_ROUTER_REF],
    ['studio_fleet_bridge', surfaces.studioBrittney?.fleetBridge === STUDIO_FLEET_BRIDGE_REF],
    ['provider_routing_registry', Boolean(surfaces.providerRouting?.sourceAnchors?.includes(PROVIDER_ROUTING_REGISTRY_REF))],
    ['vast_spend_rail', surfaces.vastFleet?.spendRail === 'purchased_compute'],
    ['vast_active_manifest', vastRequires.includes('active_lane_manifest')],
    ['vast_daily_budget', vastRequires.includes('daily_current_job_budget_fields')],
    ['vast_output_contract', vastRequires.includes('output_contract')],
    ['vast_teardown_receipt', vastRequires.includes('teardown_receipt')],
    ['budget_cap_raise_approval', body.budgetPolicy?.capRaiseRequiresApprovalRef === true],
  ].map(([id, ok]) => ({ id, ok: Boolean(ok) }));
}

function defaultReasonedSummary(dispatch = {}, checks = {}) {
  const reasonCodes = dispatch.dispatch?.body?.reasonCodes || dispatch.summary?.reasonCodes || [];
  const reasonText = reasonCodes.length ? reasonCodes.join(', ') : 'router_threshold';
  return [
    `Laptop consumed the Jetson reasoning dispatch ${dispatch.dispatchId || 'unknown_dispatch'} (${reasonText}).`,
    'Route the answer locally first with repo, GOLD, codebase bridge, Studio/Brittney, and sovereign peer-context receipts available for reuse.',
    'Keep the Jetson as the always-on HoloShell router and use Vast only after the spend, manifest, output, and teardown gates are receipted.',
    checks.gold?.usable ? 'GOLD is mounted on the laptop for read-only context.' : 'GOLD was not usable on this host, so the receipt marks the job partial.',
  ].join(' ');
}

export function buildResultReceipt(dispatchReceipt, options = {}) {
  const at = generatedAt(options);
  const body = dispatchReceipt.dispatch?.body || {};
  const surfaces = body.canonicalSurfaces || {};
  const checks = requiredSurfaceChecks(dispatchReceipt);
  const failedChecks = checks.filter((check) => !check.ok);
  const gold = inspectGoldRoot(surfaces.goldDrive?.root || 'D:/GOLD');
  const repo = inspectRepoRoot();
  const gpu = laptopGpuSnapshot();
  const validDispatch = failedChecks.length === 0;
  const status = !validDispatch ? 'blocked' : (gold.usable ? 'completed' : 'partial');
  const resultText = safeString(options.resultText, '') || defaultReasonedSummary(dispatchReceipt, { gold });
  const resultId = stableId('laptop_reasoning_result', {
    at,
    dispatchId: dispatchReceipt.dispatchId,
    promptHash: body.promptHash,
    failedChecks,
    goldStatus: gold.status,
  });
  const localFocus = body.workloadFocus?.local || [];
  const cloudFocus = body.workloadFocus?.cloud || [];

  return {
    schemaVersion: LAPTOP_REASONING_RESULT_SCHEMA,
    resultId,
    generatedAt: at,
    status,
    sourceAnchors: {
      source: SOURCE_REF,
      workerScript: SCRIPT_REF,
      dispatchSource: DISPATCH_SOURCE_REF,
      dispatchScript: DISPATCH_SCRIPT_REF,
      goldCodebaseBridge: GOLD_CODEBASE_SOURCE_REF,
      goldCodebaseAdapter: GOLD_CODEBASE_SCRIPT_REF,
      sovereignPeerContext: SOVEREIGN_PEER_CONTEXT_REF,
      studioOrchestrator: STUDIO_ORCHESTRATOR_REF,
      studioModelRouter: STUDIO_MODEL_ROUTER_REF,
      studioFleetBridge: STUDIO_FLEET_BRIDGE_REF,
      providerRoutingRegistry: PROVIDER_ROUTING_REGISTRY_REF,
      spendPolicy: SPEND_POLICY_REF,
      vastEscalationGate: VAST_ESCALATION_GATE_REF,
      fleetOutputContract: FLEET_OUTPUT_CONTRACT_REF,
    },
    inputDispatch: {
      dispatchId: dispatchReceipt.dispatchId || '',
      dispatchReceiptPath: normalizeReceiptPath(options.dispatchPath || dispatchReceipt.output?.dispatchReceiptPath || ''),
      schemaVersion: dispatchReceipt.schemaVersion || '',
      capabilityId: dispatchReceipt.summary?.capabilityId || '',
      dispatchKind: dispatchReceipt.summary?.dispatchKind || '',
      route: dispatchReceipt.summary?.route || '',
      targetHost: body.targetHost || '',
      sourceHost: body.sourceHost || '',
      lane: body.lane || '',
      agentLane: body.agentLane || '',
      canonicalProviderId: body.canonicalProviderId || '',
      workload: body.workload || '',
      permissionEnvelope: body.permissionEnvelope || '',
      promptHash: body.promptHash || '',
      promptPreview: redactPrompt(body.prompt || ''),
      reasonCodes: body.reasonCodes || [],
      requestedReturn: body.requestedReturn || '',
      receiptRequired: Boolean(body.receiptRequired),
    },
    validation: {
      status: validDispatch ? 'passed' : 'failed',
      checks,
      failedChecks,
      destructiveActionsTaken: false,
      desktopAutomationExecuted: false,
    },
    consumedResourcePlan: {
      reuseBeforeBuild: Boolean(body.reuseBeforeBuild),
      duplicateWorkPolicy: body.duplicateWorkPolicy || '',
      workloadFocus: body.workloadFocus || { local: [], cloud: [] },
      canonicalSurfaces: {
        goldDrive: {
          ...surfaces.goldDrive,
          root: normalizeReceiptPath(surfaces.goldDrive?.root || 'D:/GOLD'),
          laptopRuntimeStatus: gold.status,
          usableOnLaptop: gold.usable,
          sampledTopLevelEntries: gold.sampledTopLevelEntries,
          topLevelEntryCount: gold.topLevelEntryCount,
        },
        codebaseBridge: surfaces.codebaseBridge || null,
        sovereignPeerContext: surfaces.sovereignPeerContext || null,
        studioBrittney: surfaces.studioBrittney || null,
        providerRouting: surfaces.providerRouting || null,
        vastFleet: surfaces.vastFleet || null,
      },
      budgetPolicy: body.budgetPolicy || {},
    },
    targetHostChecks: {
      host: hostSnapshot(),
      repo,
      gold,
      gpu,
      laptopCanCarryHeavyReasoning: os.totalmem() >= 8 * 1024 * 1024 * 1024 && (os.cpus() || []).length >= 4,
    },
    routingVerdict: {
      accepted: validDispatch,
      useLocalLaptopFirst: validDispatch,
      goldUsable: gold.usable,
      goldUsage: gold.usable ? 'read_only_context_before_new_builds' : 'blocked_until_gold_mount_verified',
      useSovereignPeerContextWhenNeeded: validDispatch && surfaces.sovereignPeerContext?.route === '/workflow/laptop-reasoning-job',
      reuseStudioBrittneyRouter: validDispatch && surfaces.studioBrittney?.serviceOrchestrator === STUDIO_ORCHESTRATOR_REF,
      managedCloudReservedForCoordination: cloudFocus.length > 0,
      useVastOnlyWithSpendGuard: validDispatch && surfaces.vastFleet?.requires?.includes('daily_current_job_budget_fields'),
      vastOverflowDefault: 'not_escalated_for_this_result_receipt',
      freeFirstPolicy: body.budgetPolicy?.paidComputeRule || '',
      localFocusCount: localFocus.length,
      cloudFocusCount: cloudFocus.length,
      nextReceiptExpectedByJetson: 'laptop_reasoning_result',
      laptopGpuObserved: gpu.status === 'reported',
      laptopGpuActiveDuringReceipt: (gpu.activeComputeProcessCount || 0) > 0 || (Number.isFinite(gpu.utilizationGpuPercent) && gpu.utilizationGpuPercent > 0),
      reasoningExecutionMode: 'receipt_consumption_only',
    },
    result: {
      ok: status === 'completed',
      reasoningEngine: 'laptop_hardware_receipt_worker',
      modelInvocationPerformed: false,
      deterministicReceiptOnly: true,
      reasoningExecutionMode: 'receipt_consumption_only',
      gpuTelemetry: gpu,
      gpuUseClaim: 'not_claimed_by_worker',
      text: resultText,
    },
    brittneyPingback: {
      status: status === 'blocked' ? 'blocked' : 'ready_for_brittney',
      channel: 'laptop_reasoning_result',
      target: 'brittney_holoshell_turn',
      dispatchId: dispatchReceipt.dispatchId || '',
      resultId,
      lane: body.lane || '',
      targetHost: body.targetHost || '',
      modelInvocationPerformed: false,
      deterministicReceiptOnly: true,
      gpuStatus: gpu.status,
      gpuSummary: gpu.summary,
      message: `Laptop hardware ${status} receipt ${resultId} is ready for Brittney; modelInvocationPerformed=false; ${gpu.summary}.`,
      receiptRequired: true,
    },
    summary: {
      status,
      resultId,
      dispatchId: dispatchReceipt.dispatchId || '',
      capabilityId: dispatchReceipt.summary?.capabilityId || '',
      targetHost: body.targetHost || '',
      lane: body.lane || '',
      agentLane: body.agentLane || '',
      canonicalProviderId: body.canonicalProviderId || '',
      workload: body.workload || '',
      permissionEnvelope: body.permissionEnvelope || '',
      reasoningExecutionMode: 'receipt_consumption_only',
      modelInvocationPerformed: false,
      deterministicReceiptOnly: true,
      laptopGpuStatus: gpu.status,
      laptopGpuSummary: gpu.summary,
      laptopGpuUtilizationPercent: gpu.utilizationGpuPercent,
      laptopGpuMemoryUsedMiB: gpu.memoryUsedMiB,
      laptopGpuMemoryTotalMiB: gpu.memoryTotalMiB,
      laptopGpuProcessCount: gpu.activeComputeProcessCount || 0,
      brittneyPingbackStatus: status === 'blocked' ? 'blocked' : 'ready_for_brittney',
      reuseBeforeBuild: Boolean(body.reuseBeforeBuild),
      goldRoot: normalizeReceiptPath(surfaces.goldDrive?.root || 'D:/GOLD'),
      goldRootStatus: gold.status,
      goldUsable: gold.usable,
      sovereignPeerContextRoute: surfaces.sovereignPeerContext?.route || '',
      studioOrchestrator: surfaces.studioBrittney?.serviceOrchestrator || '',
      vastSpendRail: surfaces.vastFleet?.spendRail || '',
      vastSpendGuardAttached: Boolean(surfaces.vastFleet?.requires?.includes('daily_current_job_budget_fields')),
      localFocusCount: localFocus.length,
      cloudFocusCount: cloudFocus.length,
      failedCheckCount: failedChecks.length,
      destructiveActionsTaken: false,
      desktopAutomationExecuted: false,
      receiptRequired: true,
    },
  };
}

function writeJson(filePath, value) {
  const resolved = resolveRepoPath(filePath);
  mkdirSync(path.dirname(resolved), { recursive: true });
  writeFileSync(resolved, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  return resolved;
}

export function persistResultReceipt(receipt, options = {}) {
  const archivePath = path.join(options.resultDir || DEFAULT_RESULT_DIR, `${receipt.resultId}.json`);
  const withOutput = {
    ...receipt,
    output: {
      latestPath: resolveRepoPath(options.output || DEFAULT_OUTPUT),
      archivePath: resolveRepoPath(archivePath),
    },
  };
  writeJson(options.output || DEFAULT_OUTPUT, withOutput);
  writeJson(archivePath, withOutput);
  return withOutput;
}

export function runSelfTest(options = {}) {
  const tmpRoot = mkdtempSync(path.join(os.tmpdir(), 'holoshell-laptop-reasoning-worker-'));
  const goldRoot = path.join(tmpRoot, 'GOLD');
  for (const name of ['wisdom', 'patterns', 'gotchas', 'architectures', 'protocols', 'graduated']) {
    mkdirSync(path.join(goldRoot, name), { recursive: true });
  }
  const normalizedGold = normalizeReceiptPath(goldRoot);
  const dispatch = {
    schemaVersion: 'hololand.holoshell.agent-dispatch.v0.1.0',
    dispatchId: 'hsdispatch-selftest-laptop-reasoning',
    generatedAt: options.createdAt || '2026-06-28T00:00:00.000Z',
    summary: {
      status: 'ready_to_stage',
      dispatchKind: 'reasoning_job',
      capabilityId: 'laptop_reasoning_job',
      route: '/workflow/laptop-reasoning-job',
    },
    dispatch: {
      status: 'ready_to_stage',
      route: '/workflow/laptop-reasoning-job',
      dispatchKind: 'reasoning_job',
      permissionEnvelope: 'read_only',
      body: {
        sourceHost: 'jetson_holoshell_surface',
        targetHost: 'laptop_windows',
        lane: LAPTOP_REASONING_LANE,
        agentLane: 'local',
        canonicalProviderId: 'laptop-sovereign',
        workload: 'heavy_reasoning',
        permissionEnvelope: 'read_only',
        reuseBeforeBuild: true,
        duplicateWorkPolicy: 'consume_gold_codebase_studio_holomesh_and_fleet_surfaces_before_new_builds',
        prompt: 'Have the laptop reason through the Jetson autonomy seams.',
        promptHash: hashValue('self-test-prompt'),
        reasonCodes: ['explicit_laptop_reasoning_request'],
        requestedReturn: 'reasoned_summary_with_receipt',
        receiptRequired: true,
        workloadFocus: {
          local: [
            { id: 'jetson-orchestrator' },
            { id: 'laptop-reasoning' },
            { id: 'vast-local-overflow' },
          ],
          cloud: [{ id: 'cloud-tagged-room-tasks' }],
        },
        canonicalSurfaces: {
          goldDrive: {
            id: 'gold.drive.read',
            root: normalizedGold,
            readOnly: true,
            sourceAnchors: ['AGENTS.md', GOLD_CODEBASE_SOURCE_REF],
          },
          codebaseBridge: {
            id: 'holoshell.holoscript_gold_codebase_bridge',
            sourceAnchors: [GOLD_CODEBASE_SOURCE_REF, GOLD_CODEBASE_SCRIPT_REF],
          },
          sovereignPeerContext: {
            id: 'workflow.laptop-reasoning-job',
            route: '/workflow/laptop-reasoning-job',
            sourceAnchors: [SOVEREIGN_PEER_CONTEXT_REF],
          },
          studioBrittney: {
            id: 'studio.brittney.chat_and_fleet',
            serviceOrchestrator: STUDIO_ORCHESTRATOR_REF,
            modelRouter: STUDIO_MODEL_ROUTER_REF,
            fleetBridge: STUDIO_FLEET_BRIDGE_REF,
          },
          providerRouting: {
            id: 'provider-routing-registry',
            sourceAnchors: [PROVIDER_ROUTING_REGISTRY_REF],
          },
          vastFleet: {
            id: 'vast.local_overflow',
            spendRail: 'purchased_compute',
            requires: [
              'free_first_or_owned_metal_unavailable_receipt',
              'active_lane_manifest',
              'daily_current_job_budget_fields',
              'output_contract',
              'teardown_receipt',
            ],
          },
        },
        budgetPolicy: {
          paidComputeRule: 'free_first_then_active_cap_spend_guard_then_receipted_output',
          capRaiseRequiresApprovalRef: true,
        },
      },
    },
    output: {
      dispatchReceiptPath: path.join(tmpRoot, 'dispatch.json'),
    },
  };
  const receipt = buildResultReceipt(dispatch, {
    createdAt: options.createdAt || '2026-06-28T00:00:00.000Z',
    dispatchPath: dispatch.output.dispatchReceiptPath,
    resultText: 'Self-test laptop reasoning receipt consumed the canonical plan.',
  });
  const persisted = persistResultReceipt(receipt, {
    output: path.join(tmpRoot, 'latest.json'),
    resultDir: path.join(tmpRoot, 'results'),
  });
  if (persisted.status !== 'completed') throw new Error(`self-test expected completed, got ${persisted.status}`);
  if (!persisted.routingVerdict.goldUsable) throw new Error('self-test expected GOLD usable');
  if (persisted.summary.lane !== LAPTOP_REASONING_LANE) throw new Error(`self-test expected ${LAPTOP_REASONING_LANE} lane`);
  if (persisted.summary.brittneyPingbackStatus !== 'ready_for_brittney') throw new Error('self-test expected Brittney pingback');
  if (!existsOnHost(persisted.output.latestPath)) throw new Error('self-test did not write latest receipt');
  if (!existsOnHost(persisted.output.archivePath)) throw new Error('self-test did not write archived receipt');
  return persisted;
}

function isMain() {
  return process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
}

if (isMain()) {
  try {
    const args = parseArgs();
    if (args.selfTest) {
      const receipt = runSelfTest(args);
      if (args.json) console.log(JSON.stringify(receipt, null, 2));
      else console.log(`HoloShell laptop reasoning worker self-test passed: ${receipt.resultId}`);
      process.exit(0);
    }
    const { receipt: dispatchReceipt, path: dispatchPath } = readDispatchReceipt(args.dispatch);
    const result = buildResultReceipt(dispatchReceipt, {
      createdAt: args.createdAt,
      dispatchPath,
      resultText: args.resultText,
    });
    const persisted = persistResultReceipt(result, args);
    if (args.json) console.log(JSON.stringify(persisted, null, 2));
    else {
      console.log(`HoloShell laptop reasoning result: ${persisted.output.latestPath}`);
      console.log(`Status: ${persisted.summary.status}`);
      console.log(`Dispatch: ${persisted.summary.dispatchId}`);
      console.log(`GOLD: ${persisted.summary.goldRootStatus}`);
      console.log(`GPU: ${persisted.summary.laptopGpuSummary}`);
    }
  } catch (error) {
    console.error(`holoshell-laptop-reasoning-worker failed: ${error.message}`);
    process.exit(1);
  }
}
