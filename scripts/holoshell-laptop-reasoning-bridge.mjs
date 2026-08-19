#!/usr/bin/env node
/**
 * HoloShell laptop reasoning bridge.
 *
 * Autonomously consumes staged laptop_reasoning_job dispatch receipts, runs the
 * read-only laptop result worker, and optionally mirrors result receipts back to
 * the Jetson HoloShell surface over SSH/SCP.
 */
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
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

import {
  buildResultReceipt,
  persistResultReceipt,
  readDispatchReceipt,
} from './holoshell-laptop-reasoning-worker.mjs';

export const LAPTOP_REASONING_BRIDGE_SCHEMA = 'hololand.holoshell.laptop-reasoning-bridge.v0.1.0';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '..');
const DEFAULT_TMP = path.join('.tmp', 'holoshell');
const DEFAULT_DISPATCH_DIR = path.join(DEFAULT_TMP, 'agent-dispatches');
const DEFAULT_INBOX_DIR = path.join(DEFAULT_TMP, 'laptop-reasoning-inbox');
const DEFAULT_RESULT_DIR = path.join(DEFAULT_TMP, 'laptop-reasoning-results');
const DEFAULT_RESULT_OUTPUT = path.join(DEFAULT_TMP, 'laptop-reasoning-result-latest.json');
const DEFAULT_BRIDGE_OUTPUT = path.join(DEFAULT_TMP, 'laptop-reasoning-bridge-latest.json');
const DEFAULT_STATE = path.join(DEFAULT_TMP, 'laptop-reasoning-bridge-state.json');
const DEFAULT_REMOTE_ROOT = '/mnt/nvme/holo/holoshell-surface/.tmp/holoshell';
const SOURCE_REF = 'apps/holoshell/source/holoshell-laptop-reasoning-bridge.hsplus';
const WORKER_SOURCE_REF = 'apps/holoshell/source/holoshell-laptop-reasoning-worker.hsplus';
const SCRIPT_REF = 'scripts/holoshell-laptop-reasoning-bridge.mjs';
const WORKER_SCRIPT_REF = 'scripts/holoshell-laptop-reasoning-worker.mjs';

function usage() {
  return `HoloShell laptop reasoning bridge

Usage:
  node scripts/holoshell-laptop-reasoning-bridge.mjs --once --json
  node scripts/holoshell-laptop-reasoning-bridge.mjs --once --remote-host username@192.168.0.119 --ssh-key C:\\Users\\josep\\.ssh\\jetson_ed25519 --pull-remote --push-remote

Options:
  --once                  Process currently available dispatches and exit.
  --watch                 Poll continuously.
  --interval-ms <n>       Watch interval. Defaults to 10000.
  --dispatch-dir <path>   Local dispatch directory. Defaults to .tmp/holoshell/agent-dispatches.
  --inbox-dir <path>      Pulled remote dispatch inbox. Defaults to .tmp/holoshell/laptop-reasoning-inbox.
  --result-dir <path>     Result archive directory. Defaults to .tmp/holoshell/laptop-reasoning-results.
  --result-output <path>  Latest result receipt. Defaults to .tmp/holoshell/laptop-reasoning-result-latest.json.
  --bridge-output <path>  Latest bridge run receipt. Defaults to .tmp/holoshell/laptop-reasoning-bridge-latest.json.
  --state <path>          Processed-dispatch state file.
  --result-text <text>    Optional text placed into worker result receipts.
  --remote-host <host>    SSH target, e.g. username@192.168.0.119.
  --remote-root <path>    Remote HoloShell tmp root. Defaults to ${DEFAULT_REMOTE_ROOT}.
  --ssh-key <path>        SSH private key for ssh/scp.
  --pull-remote           Pull remote Jetson dispatch receipts before processing.
  --push-remote           Push generated result receipts back to the remote result dir.
  --created-at <iso>      Stable timestamp for tests.
  --self-test             Run deterministic local self-test.
  --json                  Print JSON bridge receipt.
`;
}

export function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    once: false,
    watch: false,
    intervalMs: 10_000,
    dispatchDir: DEFAULT_DISPATCH_DIR,
    inboxDir: DEFAULT_INBOX_DIR,
    resultDir: DEFAULT_RESULT_DIR,
    resultOutput: DEFAULT_RESULT_OUTPUT,
    bridgeOutput: DEFAULT_BRIDGE_OUTPUT,
    statePath: DEFAULT_STATE,
    resultText: '',
    remoteHost: '',
    remoteRoot: DEFAULT_REMOTE_ROOT,
    sshKey: '',
    pullRemote: false,
    pushRemote: false,
    createdAt: '',
    selfTest: false,
    json: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--') continue;
    if (arg === '--once') args.once = true;
    else if (arg === '--watch') args.watch = true;
    else if (arg === '--interval-ms') args.intervalMs = Number(argv[++index] || args.intervalMs);
    else if (arg === '--dispatch-dir') args.dispatchDir = argv[++index] || args.dispatchDir;
    else if (arg === '--inbox-dir') args.inboxDir = argv[++index] || args.inboxDir;
    else if (arg === '--result-dir') args.resultDir = argv[++index] || args.resultDir;
    else if (arg === '--result-output') args.resultOutput = argv[++index] || args.resultOutput;
    else if (arg === '--bridge-output') args.bridgeOutput = argv[++index] || args.bridgeOutput;
    else if (arg === '--state') args.statePath = argv[++index] || args.statePath;
    else if (arg === '--result-text') args.resultText = argv[++index] || '';
    else if (arg === '--remote-host') args.remoteHost = argv[++index] || '';
    else if (arg === '--remote-root') args.remoteRoot = argv[++index] || DEFAULT_REMOTE_ROOT;
    else if (arg === '--ssh-key') args.sshKey = argv[++index] || '';
    else if (arg === '--pull-remote') args.pullRemote = true;
    else if (arg === '--push-remote') args.pushRemote = true;
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

  if (!args.once && !args.watch && !args.selfTest) args.once = true;
  if (!Number.isFinite(args.intervalMs) || args.intervalMs < 1000) throw new Error('--interval-ms must be >= 1000');
  if ((args.pullRemote || args.pushRemote) && !args.remoteHost) throw new Error('--remote-host is required for remote sync');
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

function readJson(filePath, fallback = null) {
  const resolved = resolveRepoPath(filePath);
  if (!existsSync(resolved)) return fallback;
  try {
    return JSON.parse(readFileSync(resolved, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(filePath, value) {
  const resolved = resolveRepoPath(filePath);
  mkdirSync(path.dirname(resolved), { recursive: true });
  writeFileSync(resolved, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  return resolved;
}

function readState(options = {}) {
  return readJson(options.statePath || DEFAULT_STATE, {
    schemaVersion: 'hololand.holoshell.laptop-reasoning-bridge-state.v0.1.0',
    processedDispatchIds: {},
    pushedResultIds: {},
  });
}

function writeState(state, options = {}) {
  return writeJson(options.statePath || DEFAULT_STATE, state);
}

function safeRemotePath(remotePath) {
  const normalized = String(remotePath || '').replace(/\\/g, '/');
  if (!normalized.startsWith('/')) throw new Error(`remote path must be absolute: ${remotePath}`);
  if (/[\r\n\0]/u.test(normalized)) throw new Error('remote path contains forbidden characters');
  return normalized;
}

function shellQuote(text) {
  return `'${String(text).replace(/'/g, `'\\''`)}'`;
}

function sshOptionArgs(options = {}) {
  const connectTimeoutSeconds = Number.isFinite(Number(options.sshConnectTimeoutSeconds))
    ? Math.max(1, Number(options.sshConnectTimeoutSeconds))
    : 10;
  const args = [];
  if (options.sshKey) args.push('-i', options.sshKey);
  args.push('-o', 'BatchMode=yes');
  args.push('-o', `ConnectTimeout=${connectTimeoutSeconds}`);
  args.push('-o', 'StrictHostKeyChecking=accept-new');
  return args;
}

function sshBaseArgs(options = {}) {
  const args = sshOptionArgs(options);
  args.push(options.remoteHost);
  return args;
}

function runSsh(remoteCommand, options = {}) {
  const result = spawnSync('ssh.exe', [...sshBaseArgs(options), remoteCommand], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    windowsHide: true,
    timeout: options.timeoutMs || 60_000,
  });
  if (result.status !== 0) {
    throw new Error(`ssh failed: ${(result.stderr || result.stdout || result.error?.message || '').trim()}`);
  }
  return result.stdout || '';
}

function runScp(from, to, options = {}) {
  const args = sshOptionArgs(options);
  args.push(from, to);
  const result = spawnSync('scp.exe', args, {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    windowsHide: true,
    timeout: options.timeoutMs || 60_000,
  });
  if (result.status !== 0) {
    throw new Error(`scp failed: ${(result.stderr || result.stdout || result.error?.message || '').trim()}`);
  }
}

function scpLocalPath(filePath) {
  const resolved = resolveRepoPath(filePath);
  const relative = path.relative(REPO_ROOT, resolved);
  if (relative && !relative.startsWith('..') && !path.isAbsolute(relative)) return relative.replace(/\\/g, '/');
  return resolved;
}

function jsonFiles(dirPath) {
  const resolved = resolveRepoPath(dirPath);
  if (!existsSync(resolved)) return [];
  return readdirSync(resolved, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .map((entry) => path.join(resolved, entry.name));
}

function readExistingResultIndex(resultDir = DEFAULT_RESULT_DIR) {
  const index = new Map();
  for (const resultPath of jsonFiles(resultDir)) {
    try {
      const receipt = JSON.parse(readFileSync(resultPath, 'utf8'));
      if (receipt.schemaVersion !== 'hololand.holoshell.laptop-reasoning-result.v0.1.0') continue;
      const dispatchId = receipt.inputDispatch?.dispatchId || receipt.summary?.dispatchId || '';
      if (!dispatchId) continue;
      const candidate = {
        dispatchId,
        resultId: receipt.resultId || receipt.summary?.resultId || path.basename(resultPath, '.json'),
        status: receipt.status || receipt.summary?.status || 'unknown',
        generatedAt: receipt.generatedAt || '',
        generatedAtMs: Date.parse(receipt.generatedAt || '') || 0,
        resultPath: normalizeReceiptPath(resultPath),
      };
      const previous = index.get(dispatchId);
      if (!previous || candidate.generatedAtMs >= previous.generatedAtMs) index.set(dispatchId, candidate);
    } catch {
      // Ignore malformed historical receipts; processPendingDispatches reports
      // parse errors only for active dispatch inputs, not archival result scans.
    }
  }
  return index;
}

function isLaptopReasoningDispatch(receipt = {}) {
  return receipt.summary?.capabilityId === 'laptop_reasoning_job'
    && receipt.summary?.dispatchKind === 'reasoning_job'
    && receipt.dispatch?.body?.targetHost === 'laptop_windows';
}

function listRemoteDispatchNames(options = {}) {
  const remoteDispatchDir = safeRemotePath(path.posix.join(options.remoteRoot || DEFAULT_REMOTE_ROOT, 'agent-dispatches'));
  const output = runSsh(
    `find ${shellQuote(remoteDispatchDir)} -maxdepth 1 -type f -name '*.json' -printf '%f\\n' 2>/dev/null | sort`,
    options
  );
  return output.split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((name) => /^[A-Za-z0-9_.-]+\.json$/u.test(name));
}

function pullRemoteDispatches(options = {}, state = {}) {
  if (!options.pullRemote) return [];
  const inboxDir = resolveRepoPath(options.inboxDir || DEFAULT_INBOX_DIR);
  mkdirSync(inboxDir, { recursive: true });
  const remoteDispatchDir = safeRemotePath(path.posix.join(options.remoteRoot || DEFAULT_REMOTE_ROOT, 'agent-dispatches'));
  const pulled = [];
  for (const name of listRemoteDispatchNames(options)) {
    const localPath = path.join(inboxDir, name);
    if (existsSync(localPath) && state.remotePulled?.[name]) continue;
    runScp(`${options.remoteHost}:${remoteDispatchDir}/${name}`, localPath, options);
    pulled.push({ name, localPath: normalizeReceiptPath(localPath) });
  }
  return pulled;
}

function pushResultToRemote(resultReceipt, options = {}) {
  if (!options.pushRemote) return null;
  const remoteResultDir = safeRemotePath(path.posix.join(options.remoteRoot || DEFAULT_REMOTE_ROOT, 'laptop-reasoning-results'));
  runSsh(`mkdir -p ${shellQuote(remoteResultDir)}`, options);
  const archivePath = resultReceipt.output?.archivePath;
  if (!archivePath || !existsSync(archivePath)) throw new Error('result archive path missing for remote push');
  const remoteArchive = `${remoteResultDir}/${path.basename(archivePath)}`;
  runScp(scpLocalPath(archivePath), `${options.remoteHost}:${remoteArchive}`, options);
  if (resultReceipt.output?.latestPath && existsSync(resultReceipt.output.latestPath)) {
    runScp(scpLocalPath(resultReceipt.output.latestPath), `${options.remoteHost}:${safeRemotePath(path.posix.join(options.remoteRoot || DEFAULT_REMOTE_ROOT, 'laptop-reasoning-result-latest.json'))}`, options);
  }
  return {
    remoteArchivePath: remoteArchive,
    remoteLatestPath: safeRemotePath(path.posix.join(options.remoteRoot || DEFAULT_REMOTE_ROOT, 'laptop-reasoning-result-latest.json')),
  };
}

function collectDispatchPaths(options = {}) {
  return [
    ...jsonFiles(options.dispatchDir || DEFAULT_DISPATCH_DIR),
    ...jsonFiles(options.inboxDir || DEFAULT_INBOX_DIR),
  ];
}

export function processPendingDispatches(options = {}) {
  const at = generatedAt(options);
  const state = readState(options);
  state.processedDispatchIds ||= {};
  state.pushedResultIds ||= {};
  state.remotePulled ||= {};
  state.migratedDispatchIds ||= {};
  const existingResults = readExistingResultIndex(options.resultDir || DEFAULT_RESULT_DIR);
  const pulled = pullRemoteDispatches(options, state);
  for (const item of pulled) state.remotePulled[item.name] = at;

  const processed = [];
  const migrated = [];
  const skipped = [];
  const errors = [];
  for (const dispatchPath of collectDispatchPaths(options)) {
    try {
      const { receipt: dispatchReceipt, path: resolvedDispatchPath } = readDispatchReceipt(dispatchPath);
      if (!isLaptopReasoningDispatch(dispatchReceipt)) {
        skipped.push({ dispatchPath: normalizeReceiptPath(resolvedDispatchPath), reason: 'not_laptop_reasoning_job' });
        continue;
      }
      const dispatchId = dispatchReceipt.dispatchId || '';
      if (!dispatchId) {
        skipped.push({ dispatchPath: normalizeReceiptPath(resolvedDispatchPath), reason: 'missing_dispatch_id' });
        continue;
      }
      if (state.processedDispatchIds[dispatchId]) {
        skipped.push({ dispatchId, dispatchPath: normalizeReceiptPath(resolvedDispatchPath), reason: 'already_processed' });
        continue;
      }
      const existingResult = existingResults.get(dispatchId);
      if (existingResult) {
        const reason = existingResult.status === 'blocked'
          ? 'retired_existing_blocked_result'
          : 'migrated_existing_result_receipt';
        const migratedItem = {
          dispatchId,
          resultId: existingResult.resultId,
          status: existingResult.status,
          dispatchPath: normalizeReceiptPath(resolvedDispatchPath),
          resultPath: existingResult.resultPath,
          reason,
        };
        state.processedDispatchIds[dispatchId] = {
          processedAt: existingResult.generatedAt || at,
          resultId: existingResult.resultId,
          status: existingResult.status,
          migratedAt: at,
          migratedFrom: existingResult.resultPath,
          migrationReason: reason,
        };
        state.migratedDispatchIds[dispatchId] = {
          migratedAt: at,
          resultId: existingResult.resultId,
          status: existingResult.status,
          resultPath: existingResult.resultPath,
          reason,
        };
        migrated.push(migratedItem);
        skipped.push(migratedItem);
        continue;
      }

      const result = buildResultReceipt(dispatchReceipt, {
        createdAt: options.createdAt,
        dispatchPath: resolvedDispatchPath,
        resultText: options.resultText,
      });
      const persisted = persistResultReceipt(result, {
        output: options.resultOutput || DEFAULT_RESULT_OUTPUT,
        resultDir: options.resultDir || DEFAULT_RESULT_DIR,
      });
      let remote = null;
      if (options.pushRemote) remote = pushResultToRemote(persisted, options);
      state.processedDispatchIds[dispatchId] = {
        processedAt: at,
        resultId: persisted.resultId,
        status: persisted.status,
      };
      if (remote) state.pushedResultIds[persisted.resultId] = { pushedAt: at, ...remote };
      processed.push({
        dispatchId,
        resultId: persisted.resultId,
        status: persisted.status,
        dispatchPath: normalizeReceiptPath(resolvedDispatchPath),
        resultPath: normalizeReceiptPath(persisted.output.archivePath),
        lane: persisted.summary?.lane || persisted.inputDispatch?.lane || '',
        modelInvocationPerformed: Boolean(persisted.summary?.modelInvocationPerformed),
        laptopGpuStatus: persisted.summary?.laptopGpuStatus || '',
        laptopGpuSummary: persisted.summary?.laptopGpuSummary || '',
        brittneyPingbackStatus: persisted.summary?.brittneyPingbackStatus || persisted.brittneyPingback?.status || '',
        remote,
      });
    } catch (error) {
      errors.push({
        dispatchPath: normalizeReceiptPath(dispatchPath),
        error: String(error.message || error),
      });
    }
  }

  writeState(state, options);
  const blockedResultCount = processed.filter((item) => item.status === 'blocked').length;
  const partialResultCount = processed.filter((item) => item.status === 'partial').length;
  const retiredBlockedResultCount = migrated.filter((item) => item.reason === 'retired_existing_blocked_result').length;
  const bridgeStatus = errors.length
    ? (processed.length ? 'partial' : 'blocked')
    : (blockedResultCount ? 'partial' : 'completed');
  const bridgeReceipt = {
    schemaVersion: LAPTOP_REASONING_BRIDGE_SCHEMA,
    bridgeId: stableId('laptop_reasoning_bridge', { at, processed, errors }),
    generatedAt: at,
    status: bridgeStatus,
    sourceAnchors: {
      source: SOURCE_REF,
      bridgeScript: SCRIPT_REF,
      workerSource: WORKER_SOURCE_REF,
      workerScript: WORKER_SCRIPT_REF,
    },
    mode: {
      once: Boolean(options.once),
      watch: Boolean(options.watch),
      pullRemote: Boolean(options.pullRemote),
      pushRemote: Boolean(options.pushRemote),
      remoteHostConfigured: Boolean(options.remoteHost),
      remoteRoot: options.remoteRoot || DEFAULT_REMOTE_ROOT,
    },
    host: {
      platform: process.platform,
      arch: process.arch,
      hostname: os.hostname(),
      node: process.version,
    },
    inputs: {
      dispatchDir: normalizeReceiptPath(resolveRepoPath(options.dispatchDir || DEFAULT_DISPATCH_DIR)),
      inboxDir: normalizeReceiptPath(resolveRepoPath(options.inboxDir || DEFAULT_INBOX_DIR)),
      resultDir: normalizeReceiptPath(resolveRepoPath(options.resultDir || DEFAULT_RESULT_DIR)),
      resultOutput: normalizeReceiptPath(resolveRepoPath(options.resultOutput || DEFAULT_RESULT_OUTPUT)),
      statePath: normalizeReceiptPath(resolveRepoPath(options.statePath || DEFAULT_STATE)),
    },
    pulled,
    processed,
    migrated,
    skipped,
    errors,
    summary: {
      status: bridgeStatus,
      pulledCount: pulled.length,
      processedCount: processed.length,
      migratedCount: migrated.length,
      skippedCount: skipped.length,
      errorCount: errors.length,
      blockedResultCount,
      partialResultCount,
      retiredBlockedResultCount,
      pushedCount: processed.filter((item) => item.remote).length,
      latestResultId: processed.at(-1)?.resultId || '',
      latestDispatchId: processed.at(-1)?.dispatchId || '',
      latestLane: processed.at(-1)?.lane || '',
      latestLaptopGpuStatus: processed.at(-1)?.laptopGpuStatus || '',
      latestLaptopGpuSummary: processed.at(-1)?.laptopGpuSummary || '',
      latestBrittneyPingbackStatus: processed.at(-1)?.brittneyPingbackStatus || '',
      latestModelInvocationPerformed: Boolean(processed.at(-1)?.modelInvocationPerformed),
      destructiveActionsTaken: false,
      desktopAutomationExecuted: false,
      receiptRequired: true,
    },
  };
  const bridgeOutput = writeJson(options.bridgeOutput || DEFAULT_BRIDGE_OUTPUT, bridgeReceipt);
  return { ...bridgeReceipt, output: { bridgeOutput } };
}

export function runSelfTest(options = {}) {
  const tmpRoot = mkdtempSync(path.join(os.tmpdir(), 'holoshell-laptop-reasoning-bridge-'));
  const dispatchDir = path.join(tmpRoot, 'agent-dispatches');
  const goldRoot = path.join(tmpRoot, 'GOLD');
  mkdirSync(dispatchDir, { recursive: true });
  for (const name of ['wisdom', 'patterns', 'gotchas']) mkdirSync(path.join(goldRoot, name), { recursive: true });
  const dispatch = {
    schemaVersion: 'hololand.holoshell.agent-dispatch.v0.1.0',
    dispatchId: 'hsdispatch-bridge-selftest',
    summary: {
      status: 'ready_to_stage',
      dispatchKind: 'reasoning_job',
      capabilityId: 'laptop_reasoning_job',
      route: '/workflow/laptop-reasoning-job',
    },
    dispatch: {
      body: {
        sourceHost: 'jetson_holoshell_surface',
        targetHost: 'laptop_windows',
        lane: 'laptop-hardware',
        agentLane: 'local',
        canonicalProviderId: 'laptop-sovereign',
        workload: 'heavy_reasoning',
        permissionEnvelope: 'read_only',
        reuseBeforeBuild: true,
        duplicateWorkPolicy: 'consume_gold_codebase_sovereign_peer_context_studio_and_fleet_surfaces_before_new_builds',
        prompt: 'Bridge self-test prompt.',
        promptHash: 'bridge-self-test-prompt',
        reasonCodes: ['explicit_laptop_reasoning_request'],
        requestedReturn: 'reasoned_summary_with_receipt',
        receiptRequired: true,
        workloadFocus: {
          local: [{ id: 'jetson-orchestrator' }, { id: 'laptop-reasoning' }, { id: 'vast-local-overflow' }],
          cloud: [{ id: 'managed-provider-or-family-seat' }],
        },
        canonicalSurfaces: {
          goldDrive: { root: normalizeReceiptPath(goldRoot), readOnly: true },
          codebaseBridge: { sourceAnchors: ['scripts/holoshell-holoscript-gold-codebase-bridge.mjs'] },
          sovereignPeerContext: { route: '/workflow/sovereign-room-marathon' },
          studioBrittney: {
            serviceOrchestrator: 'packages/brittney/service/src/orchestrator.ts',
            modelRouter: 'packages/brittney/service/src/model-router.ts',
            fleetBridge: 'packages/shared/inference/src/integrations/spatial-fleet-bridge.ts',
          },
          providerRouting: { sourceAnchors: ['C:/Users/josep/.ai-ecosystem/config/provider-routing-registry.json'] },
          vastFleet: {
            spendRail: 'purchased_compute',
            requires: ['active_lane_manifest', 'daily_current_job_budget_fields', 'output_contract', 'teardown_receipt'],
          },
        },
        budgetPolicy: { capRaiseRequiresApprovalRef: true },
      },
    },
  };
  writeJson(path.join(dispatchDir, 'hsdispatch-bridge-selftest.json'), dispatch);
  const receipt = processPendingDispatches({
    once: true,
    dispatchDir,
    inboxDir: path.join(tmpRoot, 'inbox'),
    resultDir: path.join(tmpRoot, 'results'),
    resultOutput: path.join(tmpRoot, 'latest-result.json'),
    bridgeOutput: path.join(tmpRoot, 'bridge.json'),
    statePath: path.join(tmpRoot, 'state.json'),
    resultText: 'Bridge self-test processed the dispatch.',
    createdAt: options.createdAt || '2026-06-28T00:00:00.000Z',
  });
  if (receipt.summary.processedCount !== 1) throw new Error('self-test expected one processed dispatch');
  if (receipt.summary.errorCount !== 0) throw new Error('self-test expected zero errors');
  const second = processPendingDispatches({
    once: true,
    dispatchDir,
    inboxDir: path.join(tmpRoot, 'inbox'),
    resultDir: path.join(tmpRoot, 'results'),
    resultOutput: path.join(tmpRoot, 'latest-result.json'),
    bridgeOutput: path.join(tmpRoot, 'bridge-2.json'),
    statePath: path.join(tmpRoot, 'state.json'),
    createdAt: options.createdAt || '2026-06-28T00:00:00.000Z',
  });
  if (second.summary.processedCount !== 0) throw new Error('self-test expected idempotent second run');
  return receipt;
}

async function main() {
  const args = parseArgs();
  if (args.selfTest) {
    const receipt = runSelfTest(args);
    if (args.json) console.log(JSON.stringify(receipt, null, 2));
    else console.log(`HoloShell laptop reasoning bridge self-test passed: ${receipt.bridgeId}`);
    return;
  }
  const runOnce = () => {
    const receipt = processPendingDispatches(args);
    if (args.json || args.once) console.log(JSON.stringify(receipt, null, 2));
    return receipt;
  };
  if (args.once) {
    runOnce();
    return;
  }
  while (args.watch) {
    runOnce();
    await new Promise((resolve) => setTimeout(resolve, args.intervalMs));
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(`holoshell-laptop-reasoning-bridge failed: ${error.message}`);
    process.exit(1);
  });
}
