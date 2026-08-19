#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import crypto from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';

const SCHEMA_VERSION = 'hololand.holoshell.run-receipt.v0.1.0';
const REGISTRY_SCHEMA_VERSION = 'hololand.holoshell.run-registry.v0.1.0';
const RECONCILE_SCHEMA_VERSION = 'hololand.holoshell.run-registry-reconcile.v0.1.0';
const REPO_ROOT = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const DEFAULT_REGISTRY = path.join('.tmp', 'holoshell', 'run-registry.json');
const DEFAULT_RECEIPTS_DIR = path.join('.tmp', 'holoshell', 'run-receipts');
const DEFAULT_HEALTH_OUTPUT = path.join('.tmp', 'holoshell', 'process-health.json');
const DEFAULT_NETWORK_REALITY = path.join('.tmp', 'holoshell', 'network-reality.json');
const DEFAULT_RECONCILE_OUTPUT = path.join('.tmp', 'holoshell', 'run-registry-reconcile.json');
const DEFAULT_RECONCILE_JS_OUTPUT = path.join('.tmp', 'holoshell', 'run-registry-reconcile.js');
const HEAVY_RUN_CLASSES = new Set([
  'build',
  'test',
  'browser_audit',
  'dev_server',
  'watcher',
  'install',
  'package_script',
  'long_running',
]);
const BANDWIDTH_SPENDING_INTENTS = new Set([
  'package_install',
  'model_download',
  'large_download',
  'large_upload',
  'remote_sync',
  'fleet_sync',
  'parallel_agent_network_work',
  'video_stream',
]);

function parseArgs(argv) {
  const args = {
    laneId: 'codex-hardware',
    agentKind: 'codex',
    surfaceKind: 'hardware_shell',
    runClass: null,
    expectedMinutes: 30,
    reason: '',
    cwd: REPO_ROOT,
    name: '',
    registry: DEFAULT_REGISTRY,
    receiptsDir: DEFAULT_RECEIPTS_DIR,
    healthOutput: DEFAULT_HEALTH_OUTPUT,
    networkReality: DEFAULT_NETWORK_REALITY,
    json: false,
    dryRun: false,
    selfTest: false,
    reconcileRegistry: false,
    reconcileOutput: DEFAULT_RECONCILE_OUTPUT,
    reconcileJsOutput: DEFAULT_RECONCILE_JS_OUTPUT,
    noHealthGate: false,
    noNetworkGate: false,
    allowWarn: false,
    allowCritical: false,
    ownerNetworkGesture: false,
    command: [],
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--') {
      args.command = argv.slice(index + 1);
      break;
    } else if (arg === '--lane-id') args.laneId = argv[++index];
    else if (arg === '--agent-kind') args.agentKind = argv[++index];
    else if (arg === '--surface-kind') args.surfaceKind = argv[++index];
    else if (arg === '--run-class') args.runClass = argv[++index];
    else if (arg === '--expected-minutes') args.expectedMinutes = Number(argv[++index]);
    else if (arg === '--reason') args.reason = argv[++index];
    else if (arg === '--cwd') args.cwd = argv[++index];
    else if (arg === '--name') args.name = argv[++index];
    else if (arg === '--registry') args.registry = argv[++index];
    else if (arg === '--receipts-dir') args.receiptsDir = argv[++index];
    else if (arg === '--health-output') args.healthOutput = argv[++index];
    else if (arg === '--network-reality') args.networkReality = argv[++index];
    else if (arg === '--json') args.json = true;
    else if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--self-test') args.selfTest = true;
    else if (arg === '--reconcile-registry') args.reconcileRegistry = true;
    else if (arg === '--reconcile-output') args.reconcileOutput = argv[++index];
    else if (arg === '--reconcile-js-output') args.reconcileJsOutput = argv[++index];
    else if (arg === '--no-health-gate') args.noHealthGate = true;
    else if (arg === '--no-network-gate') args.noNetworkGate = true;
    else if (arg === '--allow-warn') args.allowWarn = true;
    else if (arg === '--allow-critical') args.allowCritical = true;
    else if (arg === '--owner-network-gesture' || arg === '--allow-network-spend') args.ownerNetworkGesture = true;
    else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument before --: ${arg}`);
    }
  }

  if (!args.selfTest && !args.reconcileRegistry && args.command.length === 0) {
    throw new Error('Missing command. Pass command after --.');
  }
  if (!args.laneId || !args.agentKind || !args.surfaceKind) {
    throw new Error('lane id, agent kind, and surface kind are required');
  }
  if (!Number.isFinite(args.expectedMinutes) || args.expectedMinutes < 1) {
    throw new Error('--expected-minutes must be a positive number');
  }

  args.cwd = path.resolve(args.cwd || REPO_ROOT);
  args.runClass = args.runClass || inferRunClass(args.command);
  return args;
}

function printHelp() {
  console.log(`HoloShell run custody wrapper

Usage:
  node scripts/holoshell-run.mjs [options] -- <command> [args...]
  node scripts/holoshell-run.mjs --reconcile-registry [options]

Options:
  --lane-id <id>             Agent lane id. Default: codex-hardware.
  --agent-kind <kind>        Agent kind. Default: codex.
  --surface-kind <kind>      Surface kind. Default: hardware_shell.
  --run-class <class>        build, test, browser_audit, dev_server, watcher, install, package_script, long_running, light.
  --expected-minutes <n>     Expected run duration. Default: 30.
  --reason <text>            Required to proceed with warn/critical heavy runs.
  --cwd <path>               Working directory. Default: repo root.
  --name <text>              Optional human run name.
  --allow-warn               Allow heavy run when health risk is warn, with --reason.
  --allow-critical           Allow heavy run when health risk is critical, with --reason.
  --network-reality <path>   Network reality manifest. Default: .tmp/holoshell/network-reality.json.
  --owner-network-gesture    Owner approved spending protected bandwidth; requires --reason.
  --allow-network-spend      Alias for --owner-network-gesture.
  --no-health-gate           Skip pre-run process health gate.
  --no-network-gate          Skip pre-run network policy gate.
  --dry-run                  Write planned receipt without executing.
  --reconcile-registry       Mark overdue active registry runs stale when no visible PID exists. Non-destructive.
  --reconcile-output <path>  Reconcile receipt path. Default: .tmp/holoshell/run-registry-reconcile.json.
  --reconcile-js-output <p>  Browser bootstrap path. Default: .tmp/holoshell/run-registry-reconcile.js.
  --json                     Print final run receipt JSON.
  --self-test                Run an internal harmless command and assert receipts.
  -h, --help                 Show this help.
`);
}

function stableHash(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex').slice(0, 16);
}

function nowIso() {
  return new Date().toISOString();
}

function runIdFor(args) {
  return [
    'run',
    Date.now().toString(36),
    stableHash(`${args.laneId}:${args.command.join('\0')}:${process.pid}`),
  ].join('-');
}

function inferRunClass(command) {
  const text = command.join(' ').toLowerCase();
  if (!text) return 'light';
  if (/\b(build|tsup|next build|vite build)\b/.test(text)) return 'build';
  if (/\b(test|vitest|playwright test)\b/.test(text)) return 'test';
  if (/\b(dev|watch|serve|start)\b/.test(text)) return 'dev_server';
  if (/\b(install|add|remove|update)\b/.test(text)) return 'install';
  if (/\b(browser|playwright|chrome|edge|screenshot)\b/.test(text)) return 'browser_audit';
  if (/\b(pnpm|npm|yarn)\b/.test(text)) return 'package_script';
  return 'light';
}

function isHeavyRun(args) {
  return HEAVY_RUN_CLASSES.has(args.runClass);
}

function commandText(command) {
  return command.map((part) => String(part || '')).join(' ').toLowerCase();
}

function inferNetworkIntent(command, runClass) {
  const text = commandText(command);
  if (!text) return 'none';
  if (runClass === 'install') return 'package_install';
  if (/\b(pnpm|npm|yarn)\b.*\b(install|i|add|update|upgrade|remove)\b/.test(text)) return 'package_install';
  if (/\b(ollama)\b.*\bpull\b/.test(text)) return 'model_download';
  if (/\b(huggingface-cli|hf|modelscope)\b.*\b(download|snapshot-download)\b/.test(text)) return 'model_download';
  if (/\b(git)\b.*\b(clone|fetch|pull|lfs\s+pull|submodule\s+update)\b/.test(text)) return 'remote_sync';
  if (/\b(gh)\b.*\b(repo\s+clone|release\s+download)\b/.test(text)) return 'remote_sync';
  if (/\b(docker|podman)\b.*\b(pull|build)\b/.test(text)) return 'large_download';
  if (/\b(curl|wget|aria2c|invoke-webrequest|iwr)\b/.test(text)) return 'large_download';
  if (/\b(rsync|rclone|scp|sftp)\b/.test(text)) return 'large_upload';
  if (/\b(vast|fleet)\b.*\b(sync|pull|push|download|upload)\b/.test(text)) return 'fleet_sync';
  if (runClass === 'browser_audit') return 'normal_network_work';
  if (runClass === 'package_script' && /\b(download|upload|sync|publish|deploy)\b/.test(text)) {
    return 'parallel_agent_network_work';
  }
  return 'none';
}

function isBandwidthSpendingIntent(intent) {
  return BANDWIDTH_SPENDING_INTENTS.has(intent);
}

function redactCommand(command) {
  return command
    .map((part) => String(part))
    .join(' ')
    .replace(new RegExp(os.homedir().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), '%USERPROFILE%')
    .replace(/[A-Za-z]:\\Users\\[^\\\s"]+/g, '%USERPROFILE%')
    .replace(/(api[-_]?key|token|secret|password|passwd|pwd|authorization)=("[^"]+"|'[^']+'|[^\s]+)/gi, '$1=[redacted]')
    .replace(/Bearer\s+[A-Za-z0-9._~+/-]+=*/gi, 'Bearer [redacted]')
    .replace(/sk-[A-Za-z0-9_-]+/g, 'sk-[redacted]')
    .slice(0, 260);
}

function resolveRepoPath(filePath) {
  return path.isAbsolute(filePath) ? filePath : path.resolve(REPO_ROOT, filePath);
}

function readJson(filePath, fallback) {
  const resolved = resolveRepoPath(filePath);
  if (!existsSync(resolved)) return fallback;
  try {
    return JSON.parse(readFileSync(resolved, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(filePath, data) {
  const resolved = resolveRepoPath(filePath);
  mkdirSync(path.dirname(resolved), { recursive: true });
  writeFileSync(resolved, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  return resolved;
}

function writeBrowserBootstrap(filePath, globalName, data) {
  const resolved = resolveRepoPath(filePath);
  mkdirSync(path.dirname(resolved), { recursive: true });
  const payload = JSON.stringify(data, null, 2).replace(/<\/script/gi, '<\\/script');
  writeFileSync(resolved, `window.${globalName} = ${payload};\n`, 'utf8');
  return resolved;
}

function loadRegistry(registryPath) {
  const registry = readJson(registryPath, {
    schemaVersion: REGISTRY_SCHEMA_VERSION,
    generatedAt: nowIso(),
    updatedAt: nowIso(),
    runs: [],
  });

  if (!Array.isArray(registry.runs)) registry.runs = [];
  registry.schemaVersion = registry.schemaVersion || REGISTRY_SCHEMA_VERSION;
  return registry;
}

function upsertRun(registryPath, run) {
  const registry = loadRegistry(registryPath);
  const index = registry.runs.findIndex((item) => item.runId === run.runId);
  if (index === -1) registry.runs.push(run);
  else registry.runs[index] = { ...registry.runs[index], ...run };
  registry.updatedAt = nowIso();
  writeJson(registryPath, registry);
}

function completeRun(registryPath, runId, patch) {
  const registry = loadRegistry(registryPath);
  const index = registry.runs.findIndex((item) => item.runId === runId);
  if (index !== -1) registry.runs[index] = { ...registry.runs[index], ...patch };
  registry.updatedAt = nowIso();
  writeJson(registryPath, registry);
}

function isActiveRegistryRun(run) {
  return ['planned', 'running'].includes(String(run.status || ''));
}

function parseDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function visiblePidState(run, pidSet) {
  const pid = Number(run.pid);
  const hasPid = Number.isInteger(pid) && pid > 0;
  return {
    pid: hasPid ? pid : null,
    hasPid,
    visible: hasPid && pidSet.has(pid),
  };
}

function staleRegistryReason(run, pidSet, nowMs) {
  if (!isActiveRegistryRun(run)) return null;
  const expectedEnd = parseDate(run.expectedEndAt);
  if (!expectedEnd || expectedEnd.getTime() >= nowMs) return null;
  const pidState = visiblePidState(run, pidSet);
  if (pidState.visible) return null;
  return pidState.hasPid
    ? 'expected_end_passed_without_visible_pid'
    : 'expected_end_passed_without_pid';
}

function registryRunSummary(run, staleReason = null) {
  return {
    runId: run.runId,
    laneId: run.laneId || null,
    agentKind: run.agentKind || null,
    surfaceKind: run.surfaceKind || null,
    runClass: run.runClass || null,
    statusBefore: run.status || null,
    statusAfter: staleReason ? 'stale' : run.status || null,
    pid: Number.isInteger(Number(run.pid)) && Number(run.pid) > 0 ? Number(run.pid) : null,
    expectedEndAt: run.expectedEndAt || null,
    startedAt: run.startedAt || null,
    endedAt: run.endedAt || null,
    commandHash: run.commandHash || null,
    commandPreview: run.commandPreview || null,
    staleReason,
  };
}

function collectHealth(args) {
  if (args.noHealthGate) {
    return {
      skipped: true,
      gate: {
        allowed: true,
        reason: 'Skipped by --no-health-gate',
      },
    };
  }

  const result = spawnSync(process.execPath, [
    'scripts/holoshell-process-health.mjs',
    '--json',
    '--output',
    args.healthOutput,
    '--run-registry',
    args.registry,
  ], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    timeout: 90000,
    windowsHide: true,
  });
  const health = extractJson(result.stdout);
  return {
    skipped: false,
    ok: result.status === 0 && Boolean(health),
    status: result.status,
    stderr: (result.stderr || '').slice(-1200),
    health,
    gate: evaluateGate(args, health),
  };
}

function networkRealitySummary(manifest) {
  if (!manifest) return null;
  return {
    schemaVersion: manifest.schemaVersion || null,
    generatedAt: manifest.generatedAt || null,
    classification: manifest.underlay?.classification || 'unknown',
    confidence: manifest.underlay?.confidence || 'unknown',
    ownerDeclaredKind: manifest.underlay?.ownerDeclaredKind || 'none',
    bandwidthPosture: manifest.policy?.bandwidthPosture || 'unknown',
    heavyWorkPolicy: manifest.policy?.heavyWorkPolicy || 'unknown',
    brittneyStance: manifest.brittney?.stance || 'unknown',
    protectBandwidth: Boolean(manifest.brittney?.protectBandwidth),
    schemaContractStatus: manifest.schemaContract?.validationStatus || 'missing',
    snapshotHash: manifest.receipt?.snapshotHash || null,
  };
}

function collectNetworkReality(args) {
  const intent = inferNetworkIntent(args.command, args.runClass);
  const bandwidthSpending = isBandwidthSpendingIntent(intent);

  if (args.noNetworkGate) {
    return {
      skipped: true,
      intent,
      bandwidthSpending,
      manifest: null,
      summary: null,
      gate: {
        allowed: true,
        reason: 'Skipped by --no-network-gate',
      },
    };
  }

  const manifest = readJson(args.networkReality, null);
  return {
    skipped: false,
    intent,
    bandwidthSpending,
    manifest,
    summary: networkRealitySummary(manifest),
    gate: evaluateNetworkGate(args, manifest, intent),
  };
}

function evaluateNetworkGate(args, manifest, intent) {
  const bandwidthSpending = isBandwidthSpendingIntent(intent);
  if (!bandwidthSpending) {
    return {
      allowed: true,
      intent,
      bandwidthSpending,
      reason: 'Run intent does not spend protected bandwidth.',
    };
  }

  if (!manifest?.policy || !manifest?.underlay) {
    return {
      allowed: false,
      intent,
      bandwidthSpending,
      reason: `Bandwidth-spending intent "${intent}" requires a network reality receipt. Run scripts/holoshell-network-reality.mjs first.`,
    };
  }

  const contractStatus = manifest.schemaContract?.validationStatus || 'missing';
  if (contractStatus !== 'pass') {
    return {
      allowed: false,
      intent,
      bandwidthSpending,
      classification: manifest.underlay.classification || 'unknown',
      reason: `Bandwidth-spending intent "${intent}" requires schemaContract.validationStatus=pass; got ${contractStatus}.`,
    };
  }

  const classification = manifest.underlay.classification || 'unknown_protective';
  const requiredGestures = new Set(manifest.policy.requiresOwnerGesture || []);
  const protectedByPolicy = Boolean(manifest.brittney?.protectBandwidth)
    || ['metered_or_hotspot', 'degraded_link', 'unknown_protective'].includes(classification);
  const listedGestureIntent = requiredGestures.has(intent);

  if (classification === 'offline') {
    return {
      allowed: false,
      intent,
      bandwidthSpending,
      classification,
      reason: `Network is offline; queue "${intent}" until the network returns.`,
    };
  }

  if ((protectedByPolicy || listedGestureIntent) && !(args.ownerNetworkGesture && args.reason)) {
    return {
      allowed: false,
      intent,
      bandwidthSpending,
      classification,
      bandwidthPosture: manifest.policy.bandwidthPosture || 'unknown',
      heavyWorkPolicy: manifest.policy.heavyWorkPolicy || 'unknown',
      reason: `Bandwidth-spending intent "${intent}" is blocked under ${classification}. Use --owner-network-gesture with --reason after owner approval.`,
    };
  }

  if (protectedByPolicy || listedGestureIntent) {
    return {
      allowed: true,
      intent,
      bandwidthSpending,
      classification,
      bandwidthPosture: manifest.policy.bandwidthPosture || 'unknown',
      heavyWorkPolicy: manifest.policy.heavyWorkPolicy || 'unknown',
      reason: `Owner network gesture accepted for "${intent}" under ${classification}.`,
    };
  }

  return {
    allowed: true,
    intent,
    bandwidthSpending,
    classification,
    bandwidthPosture: manifest.policy.bandwidthPosture || 'unknown',
    heavyWorkPolicy: manifest.policy.heavyWorkPolicy || 'unknown',
    reason: `Network policy allows "${intent}" with receipts.`,
  };
}

function extractJson(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {}
  const first = text.indexOf('{');
  const last = text.lastIndexOf('}');
  if (first !== -1 && last > first) {
    try {
      return JSON.parse(text.slice(first, last + 1));
    } catch {}
  }
  return null;
}

function collectVisiblePids() {
  if (process.platform === 'win32') {
    const result = spawnSync('powershell.exe', [
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-Command',
      'Get-CimInstance Win32_Process | Select-Object -ExpandProperty ProcessId | ConvertTo-Json',
    ], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      timeout: 30000,
      windowsHide: true,
    });
    const parsed = extractJson(result.stdout);
    const items = Array.isArray(parsed) ? parsed : parsed ? [parsed] : [];
    const pidSet = new Set(items.map(Number).filter((pid) => Number.isInteger(pid) && pid > 0));
    return {
      ok: result.status === 0 || pidSet.size > 0,
      status: result.status,
      stderr: (result.stderr || '').slice(-1200),
      pidSet,
    };
  }

  const result = spawnSync('ps', ['-axo', 'pid='], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    timeout: 20000,
    windowsHide: true,
  });
  const pidSet = new Set(
    String(result.stdout || '')
      .split(/\r?\n/)
      .map((line) => Number(line.trim()))
      .filter((pid) => Number.isInteger(pid) && pid > 0),
  );
  return {
    ok: result.status === 0 || pidSet.size > 0,
    status: result.status,
    stderr: (result.stderr || '').slice(-1200),
    pidSet,
  };
}

function healthGateCustodySummary(health) {
  const summary = health?.summary || {};
  return {
    actionableCleanupCandidateCount: summary.actionableCleanupCandidateCount || summary.cleanupCandidateCount || 0,
    cleanupStopPlanCount: summary.cleanupStopPlanCount || summary.stopPlanCount || 0,
    ownerHandoffPlanCount: summary.ownerHandoffPlanCount || 0,
    ownerKnownReviewCount: summary.ownerKnownReviewCount || 0,
    ownerUnknownReviewCount: summary.ownerUnknownReviewCount || 0,
    ownerUnknownStaleRunCount: summary.ownerUnknownStaleRunCount || 0,
    laneOwnedStaleRunCount: summary.laneOwnedStaleRunCount || 0,
    ownerUnknownHighMemoryCount: summary.ownerUnknownHighMemoryCount || 0,
    laneOwnedHighMemoryCount: summary.laneOwnedHighMemoryCount || 0,
    ownerUnknownOrphanLikeCount: summary.ownerUnknownOrphanLikeCount || 0,
    laneOwnedOrphanLikeCount: summary.laneOwnedOrphanLikeCount || 0,
  };
}

function gateReason(baseReason, custody) {
  if (!custody) return baseReason;
  const parts = [
    `${custody.actionableCleanupCandidateCount} cleanup candidate(s)`,
    `${custody.ownerHandoffPlanCount} owner handoff(s)`,
  ];
  return `${baseReason} Custody split: ${parts.join(', ')}.`;
}

function reconcileRunRegistry(args, options = {}) {
  const registry = loadRegistry(args.registry);
  const now = options.now || nowIso();
  const nowMs = Date.parse(now);
  const processCollection = options.pidSet
    ? { ok: true, status: 0, stderr: '', pidSet: options.pidSet }
    : collectVisiblePids();
  const pidSet = processCollection.pidSet || new Set();
  const outputPath = resolveRepoPath(args.reconcileOutput);
  const jsOutputPath = resolveRepoPath(args.reconcileJsOutput);
  const activeBefore = registry.runs.filter(isActiveRegistryRun);
  const staleBefore = registry.runs.filter((run) => String(run.status || '') === 'stale');
  const reconciledRuns = [];
  const visibleActiveRuns = [];
  const leftActiveRuns = [];

  registry.runs = registry.runs.map((run) => {
    const active = isActiveRegistryRun(run);
    const reason = staleRegistryReason(run, pidSet, nowMs);
    if (!active) return run;

    const pidState = visiblePidState(run, pidSet);
    if (pidState.visible) visibleActiveRuns.push(registryRunSummary(run));
    if (!reason) {
      leftActiveRuns.push(registryRunSummary(run));
      return run;
    }

    const updatedRun = {
      ...run,
      status: 'stale',
      endedAt: run.endedAt || now,
      exitCode: run.exitCode ?? null,
      signal: run.signal ?? null,
      staleReason: reason,
      statusBeforeReconcile: run.status || null,
      registryReconciledAt: now,
      reconciliationReceiptPath: outputPath,
    };
    reconciledRuns.push(registryRunSummary(run, reason));
    return updatedRun;
  });

  registry.updatedAt = now;
  registry.lastReconciledAt = now;
  registry.reconciliationReceiptPath = outputPath;
  writeJson(args.registry, registry);

  const receipt = {
    schemaVersion: RECONCILE_SCHEMA_VERSION,
    generatedAt: now,
    sourceAnchors: {
      source: 'apps/holoshell/source/holoshell-process-health-room.hsplus',
      doc: 'apps/holoshell/docs/PROCESS_SHELL_RUN_HEALTH.md',
      adapter: 'scripts/holoshell-run.mjs',
    },
    registry: {
      path: resolveRepoPath(args.registry),
      schemaVersion: registry.schemaVersion || REGISTRY_SCHEMA_VERSION,
      registeredRunCount: registry.runs.length,
      activeRunCountBefore: activeBefore.length,
      activeRunCountAfter: registry.runs.filter(isActiveRegistryRun).length,
      staleRunCountBefore: staleBefore.length,
      staleRunCountAfter: registry.runs.filter((run) => String(run.status || '') === 'stale').length,
    },
    processTable: {
      ok: processCollection.ok,
      status: processCollection.status,
      stderr: processCollection.stderr,
      visiblePidCount: pidSet.size,
    },
    summary: {
      reconciledRunCount: reconciledRuns.length,
      visibleActiveRunCount: visibleActiveRuns.length,
      activeRunCountRemaining: registry.runs.filter(isActiveRegistryRun).length,
      destructiveActionsTaken: false,
      terminationPerformed: false,
      rawCommandsIncluded: false,
    },
    safety: {
      nonDestructive: true,
      registryOnly: true,
      processTerminationAllowed: false,
      processTerminationPerformed: false,
      fileDeletionPerformed: false,
      rawCommandLinesIncluded: false,
      receiptRequired: true,
    },
    reconciledRuns,
    visibleActiveRuns,
    remainingActiveRuns: leftActiveRuns,
    output: {
      receiptPath: outputPath,
      browserBootstrap: jsOutputPath,
    },
  };
  writeJson(args.reconcileOutput, receipt);
  writeBrowserBootstrap(args.reconcileJsOutput, 'HOLOSHELL_RUN_REGISTRY_RECONCILE', receipt);
  return receipt;
}

function evaluateGate(args, health) {
  if (!health?.summary) {
    return {
      allowed: !isHeavyRun(args),
      reason: isHeavyRun(args)
        ? 'No process health receipt was available for a heavy run.'
        : 'No process health receipt was available, but run class is light.',
    };
  }

  const risk = health.summary.riskState;
  const custody = healthGateCustodySummary(health);
  if (!isHeavyRun(args)) {
    return {
      allowed: true,
      risk,
      custody,
      reason: 'Run class is light.',
    };
  }

  if (risk === 'pass') {
    return {
      allowed: true,
      risk,
      custody,
      reason: 'Process health is pass.',
    };
  }

  if (risk === 'warn' && args.allowWarn && args.reason) {
    return {
      allowed: true,
      risk,
      custody,
      reason: gateReason('Warn accepted with explicit reason.', custody),
    };
  }

  if (risk === 'critical' && args.allowCritical && args.reason) {
    return {
      allowed: true,
      risk,
      custody,
      reason: gateReason('Critical accepted with explicit reason.', custody),
    };
  }

  return {
    allowed: false,
    risk,
    custody,
    reason: gateReason(
      risk === 'critical'
        ? 'Heavy run blocked under critical process health. Use --allow-critical with --reason only when necessary.'
        : 'Heavy run blocked under warn process health. Use --allow-warn with --reason when necessary.',
      custody,
    ),
  };
}

function baseReceipt(args, runId, healthCheck, networkCheck) {
  const startedAt = nowIso();
  const expectedEndAt = new Date(Date.parse(startedAt) + args.expectedMinutes * 60000).toISOString();
  return {
    schemaVersion: SCHEMA_VERSION,
    runId,
    status: 'planned',
    name: args.name || args.command[0] || 'self-test',
    lane: {
      laneId: args.laneId,
      agentKind: args.agentKind,
      surfaceKind: args.surfaceKind,
    },
    command: {
      cwd: args.cwd,
      argvHash: stableHash(args.command.join('\0')),
      preview: redactCommand(args.command),
      runClass: args.runClass,
      heavy: isHeavyRun(args),
      networkIntent: networkCheck.intent,
      bandwidthSpending: networkCheck.bandwidthSpending,
    },
    timing: {
      plannedAt: startedAt,
      startedAt: null,
      endedAt: null,
      expectedMinutes: args.expectedMinutes,
      expectedEndAt,
      durationMs: null,
    },
    healthGate: {
      skipped: healthCheck.skipped,
      allowed: healthCheck.gate.allowed,
      reason: healthCheck.gate.reason,
      risk: healthCheck.gate.risk || healthCheck.health?.summary?.riskState || null,
      custody: healthCheck.gate.custody || healthGateCustodySummary(healthCheck.health),
      summary: healthCheck.health?.summary || null,
    },
    networkGate: {
      skipped: networkCheck.skipped,
      allowed: networkCheck.gate.allowed,
      reason: networkCheck.gate.reason,
      intent: networkCheck.intent,
      bandwidthSpending: networkCheck.bandwidthSpending,
      classification: networkCheck.gate.classification || networkCheck.summary?.classification || null,
      bandwidthPosture: networkCheck.gate.bandwidthPosture || networkCheck.summary?.bandwidthPosture || null,
      heavyWorkPolicy: networkCheck.gate.heavyWorkPolicy || networkCheck.summary?.heavyWorkPolicy || null,
      ownerGesture: args.ownerNetworkGesture,
      networkRealityPath: resolveRepoPath(args.networkReality),
      summary: networkCheck.summary,
    },
    policy: {
      preRunHealthRequiredForHeavy: true,
      allowWarnRequiresReason: true,
      allowCriticalRequiresReason: true,
      networkRealityRequiredForBandwidthSpending: true,
      ownerNetworkGestureRequiresReason: true,
      receiptRequired: true,
      automaticTerminationAllowed: false,
    },
    process: {
      pid: null,
      signal: null,
      exitCode: null,
    },
    reason: args.reason || null,
  };
}

function registryEntryFromReceipt(receipt, patch = {}) {
  return {
    runId: receipt.runId,
    laneId: receipt.lane.laneId,
    agentKind: receipt.lane.agentKind,
    surfaceKind: receipt.lane.surfaceKind,
    name: receipt.name,
    runClass: receipt.command.runClass,
    status: receipt.status,
    pid: receipt.process.pid,
    cwd: receipt.command.cwd,
    commandHash: receipt.command.argvHash,
    commandPreview: receipt.command.preview,
    expectedEndAt: receipt.timing.expectedEndAt,
    startedAt: receipt.timing.startedAt,
    endedAt: receipt.timing.endedAt,
    exitCode: receipt.process.exitCode,
    signal: receipt.process.signal,
    healthRiskAtStart: receipt.healthGate.risk,
    networkClassificationAtStart: receipt.networkGate.classification,
    networkIntent: receipt.networkGate.intent,
    networkGateAllowed: receipt.networkGate.allowed,
    receiptPath: patch.receiptPath || null,
    ...patch,
  };
}

function resolveCommand(command) {
  if (process.platform !== 'win32') return command;
  if (/[\\/]/.test(command) || path.extname(command)) return command;
  if (['pnpm', 'npm', 'yarn', 'npx'].includes(command.toLowerCase())) return `${command}.cmd`;
  return command;
}

function quoteWindowsArg(arg) {
  const value = String(arg);
  if (value.length === 0) return '""';
  if (!/[ \t&()^|<>"]/.test(value)) return value;
  return `"${value.replace(/(\\*)"/g, '$1$1\\"').replace(/\\+$/g, '$&$&')}"`;
}

function spawnSpecFor(command, commandArgs) {
  const resolved = resolveCommand(command);
  if (process.platform === 'win32' && /\.(cmd|bat)$/i.test(resolved)) {
    return {
      command: process.env.ComSpec || 'cmd.exe',
      args: ['/d', '/s', '/c', [resolved, ...commandArgs].map(quoteWindowsArg).join(' ')],
    };
  }

  return {
    command: resolved,
    args: commandArgs,
  };
}

async function executeRun(args, receipt) {
  if (args.dryRun) {
    return {
      pid: null,
      status: 'dry_run',
      signal: null,
      exitCode: 0,
      durationMs: 0,
    };
  }

  const startedAt = Date.now();
  const spawnSpec = spawnSpecFor(args.command[0], args.command.slice(1));
  let child;
  try {
    child = spawn(spawnSpec.command, spawnSpec.args, {
      cwd: args.cwd,
      stdio: 'inherit',
      windowsHide: true,
      shell: false,
    });
  } catch (error) {
    return {
      pid: null,
      status: 'failed',
      signal: null,
      exitCode: 1,
      error: error.message,
      durationMs: Date.now() - startedAt,
      plannedReceipt: receipt.runId,
    };
  }

  completeRun(args.registry, receipt.runId, {
    pid: child.pid || null,
    status: 'running',
    startedAt: receipt.timing.startedAt,
  });

  return new Promise((resolve) => {
    let spawnError = null;
    child.on('error', (error) => {
      spawnError = error;
    });
    child.on('close', (code, signal) => {
      const endedAt = Date.now();
      resolve({
        pid: child.pid || null,
        status: code === 0 ? 'completed' : 'failed',
        signal: signal || null,
        exitCode: code,
        error: spawnError?.message,
        durationMs: endedAt - startedAt,
        plannedReceipt: receipt.runId,
      });
    });
  });
}

function writeReceipt(args, receipt) {
  const fileName = `${receipt.runId}.json`;
  const receiptPath = path.resolve(REPO_ROOT, args.receiptsDir, fileName);
  mkdirSync(path.dirname(receiptPath), { recursive: true });
  writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
  return receiptPath;
}

function blockedRunReason(receipt) {
  const reasons = [];
  if (!receipt.healthGate.allowed) reasons.push(receipt.healthGate.reason);
  if (!receipt.networkGate.allowed) reasons.push(receipt.networkGate.reason);
  return reasons.filter(Boolean).join(' ');
}

async function runSelfTest() {
  const registry = path.join('.tmp', 'holoshell', 'self-test-run-registry.json');
  const receiptsDir = path.join('.tmp', 'holoshell', 'self-test-run-receipts');
  const args = parseArgs([
    '--lane-id', 'codex-hardware',
    '--agent-kind', 'codex',
    '--surface-kind', 'hardware_shell',
    '--run-class', 'light',
    '--expected-minutes', '1',
    '--registry', registry,
    '--receipts-dir', receiptsDir,
    '--no-health-gate',
    '--',
    process.execPath,
    '-e',
    'process.exit(0)',
  ]);
  const receipt = await runWithCustody(args);
  const failures = [];
  if (receipt.schemaVersion !== SCHEMA_VERSION) failures.push('schemaVersion mismatch');
  if (receipt.status !== 'completed') failures.push(`status=${receipt.status}`);
  if (receipt.process.exitCode !== 0) failures.push(`exitCode=${receipt.process.exitCode}`);
  if (!receipt.output?.receiptPath || !existsSync(receipt.output.receiptPath)) failures.push('receipt file missing');
  const reg = loadRegistry(registry);
  if (!reg.runs.some((item) => item.runId === receipt.runId && item.status === 'completed')) {
    failures.push('registry completion missing');
  }
  const fixtureNow = '2026-05-14T12:00:00.000Z';
  const reconcileRegistryPath = path.join('.tmp', 'holoshell', 'self-test', 'run-registry-reconcile-registry.json');
  const reconcileOutput = path.join('.tmp', 'holoshell', 'self-test', 'run-registry-reconcile.json');
  const reconcileJsOutput = path.join('.tmp', 'holoshell', 'self-test', 'run-registry-reconcile.js');
  writeJson(reconcileRegistryPath, {
    schemaVersion: REGISTRY_SCHEMA_VERSION,
    generatedAt: fixtureNow,
    updatedAt: fixtureNow,
    runs: [
      {
        runId: 'fixture-stale-null-pid',
        laneId: 'codex-hardware',
        agentKind: 'codex',
        surfaceKind: 'hardware_shell',
        runClass: 'build',
        status: 'running',
        pid: null,
        expectedEndAt: '2026-05-14T11:00:00.000Z',
        startedAt: '2026-05-14T10:55:00.000Z',
        endedAt: null,
        commandHash: 'fixture-a',
        commandPreview: 'pnpm build',
      },
      {
        runId: 'fixture-visible-overdue',
        laneId: 'codex-hardware',
        agentKind: 'codex',
        surfaceKind: 'hardware_shell',
        runClass: 'dev_server',
        status: 'running',
        pid: 4242,
        expectedEndAt: '2026-05-14T11:00:00.000Z',
        startedAt: '2026-05-14T10:55:00.000Z',
        endedAt: null,
        commandHash: 'fixture-b',
        commandPreview: 'node server.js',
      },
      {
        runId: 'fixture-future',
        laneId: 'codex-hardware',
        agentKind: 'codex',
        surfaceKind: 'hardware_shell',
        runClass: 'test',
        status: 'planned',
        pid: null,
        expectedEndAt: '2026-05-14T13:00:00.000Z',
        startedAt: null,
        endedAt: null,
        commandHash: 'fixture-c',
        commandPreview: 'pnpm test',
      },
    ],
  });
  const reconcileReceipt = reconcileRunRegistry({
    registry: reconcileRegistryPath,
    reconcileOutput,
    reconcileJsOutput,
  }, {
    now: fixtureNow,
    pidSet: new Set([4242]),
  });
  const reconciledRegistry = loadRegistry(reconcileRegistryPath);
  const staleFixture = reconciledRegistry.runs.find((run) => run.runId === 'fixture-stale-null-pid');
  const visibleFixture = reconciledRegistry.runs.find((run) => run.runId === 'fixture-visible-overdue');
  const futureFixture = reconciledRegistry.runs.find((run) => run.runId === 'fixture-future');
  if (reconcileReceipt.summary.reconciledRunCount !== 1) {
    failures.push(`reconciledRunCount=${reconcileReceipt.summary.reconciledRunCount}`);
  }
  if (staleFixture?.status !== 'stale') failures.push('stale fixture was not marked stale');
  if (staleFixture?.staleReason !== 'expected_end_passed_without_pid') failures.push('stale fixture reason mismatch');
  if (visibleFixture?.status !== 'running') failures.push('visible overdue fixture should stay running');
  if (futureFixture?.status !== 'planned') failures.push('future fixture should stay planned');
  if (!existsSync(resolveRepoPath(reconcileOutput)) || !existsSync(resolveRepoPath(reconcileJsOutput))) {
    failures.push('reconcile outputs missing');
  }
  if (reconcileReceipt.safety.processTerminationPerformed !== false) {
    failures.push('reconcile must not terminate processes');
  }
  const gateFixtureArgs = parseArgs([
    '--run-class', 'build',
    '--allow-warn',
    '--reason', 'fixture gate custody split',
    '--',
    process.execPath,
    '-e',
    'process.exit(0)',
  ]);
  const gateFixture = evaluateGate(gateFixtureArgs, {
    summary: {
      riskState: 'warn',
      actionableCleanupCandidateCount: 2,
      cleanupStopPlanCount: 2,
      ownerHandoffPlanCount: 3,
      ownerUnknownStaleRunCount: 1,
      laneOwnedStaleRunCount: 3,
    },
  });
  if (!gateFixture.allowed) failures.push('warn gate fixture should be allowed with reason');
  if (gateFixture.custody.actionableCleanupCandidateCount !== 2) failures.push('gate cleanup candidate summary missing');
  if (gateFixture.custody.ownerHandoffPlanCount !== 3) failures.push('gate owner handoff summary missing');
  if (!/2 cleanup candidate/.test(gateFixture.reason) || !/3 owner handoff/.test(gateFixture.reason)) {
    failures.push('gate reason must include custody split');
  }
  const hotspotNetworkReality = path.join('.tmp', 'holoshell', 'self-test', 'network-reality-hotspot.json');
  writeJson(hotspotNetworkReality, {
    schemaVersion: 'hololand.holoshell.network-reality.v0.1.0',
    generatedAt: fixtureNow,
    underlay: {
      classification: 'metered_or_hotspot',
      confidence: 'owner_declared',
      ownerDeclaredKind: 'phone_hotspot',
    },
    policy: {
      bandwidthPosture: 'protect_mobile_data',
      heavyWorkPolicy: 'queue_or_ask_before_heavy_transfer',
      requiresOwnerGesture: ['package_install', 'model_download', 'large_upload', 'video_stream', 'fleet_sync'],
    },
    brittney: {
      stance: 'protect_bandwidth',
      protectBandwidth: true,
    },
    schemaContract: {
      validationStatus: 'pass',
    },
    receipt: {
      snapshotHash: 'fixture-network-reality',
    },
  });
  const blockedNetworkArgs = parseArgs([
    '--run-class', 'install',
    '--registry', registry,
    '--receipts-dir', receiptsDir,
    '--network-reality', hotspotNetworkReality,
    '--no-health-gate',
    '--dry-run',
    '--',
    'pnpm',
    'install',
  ]);
  const blockedNetworkReceipt = await runWithCustody(blockedNetworkArgs);
  if (blockedNetworkReceipt.status !== 'blocked') failures.push('hotspot install should block without owner gesture');
  if (blockedNetworkReceipt.networkGate.allowed) failures.push('hotspot network gate should be denied');
  if (blockedNetworkReceipt.networkGate.intent !== 'package_install') failures.push('expected package_install network intent');
  const approvedNetworkArgs = parseArgs([
    '--run-class', 'install',
    '--registry', registry,
    '--receipts-dir', receiptsDir,
    '--network-reality', hotspotNetworkReality,
    '--no-health-gate',
    '--dry-run',
    '--owner-network-gesture',
    '--reason', 'fixture owner approved hotspot package install',
    '--',
    'pnpm',
    'install',
  ]);
  const approvedNetworkReceipt = await runWithCustody(approvedNetworkArgs);
  if (approvedNetworkReceipt.status !== 'dry_run') failures.push('owner-approved hotspot install dry run should pass');
  if (!approvedNetworkReceipt.networkGate.allowed) failures.push('owner-approved hotspot network gate should be allowed');
  if (!approvedNetworkReceipt.networkGate.ownerGesture) failures.push('owner network gesture should be recorded');
  if (failures.length) throw new Error(`Self-test failed:\n- ${failures.join('\n- ')}`);
  return receipt;
}

async function runWithCustody(args) {
  const healthCheck = collectHealth(args);
  const networkCheck = collectNetworkReality(args);
  const runId = runIdFor(args);
  const receipt = baseReceipt(args, runId, healthCheck, networkCheck);

  if (!healthCheck.gate.allowed || !networkCheck.gate.allowed) {
    receipt.status = 'blocked';
    receipt.timing.endedAt = nowIso();
    receipt.output = { receiptPath: writeReceipt(args, receipt) };
    upsertRun(args.registry, registryEntryFromReceipt(receipt, {
      receiptPath: receipt.output.receiptPath,
    }));
    return receipt;
  }

  receipt.status = 'running';
  receipt.timing.startedAt = nowIso();
  upsertRun(args.registry, registryEntryFromReceipt(receipt));

  const result = await executeRun(args, receipt);
  receipt.status = result.status;
  receipt.process.pid = result.pid;
  receipt.process.signal = result.signal;
  receipt.process.exitCode = result.exitCode;
  receipt.process.error = result.error;
  receipt.timing.endedAt = nowIso();
  receipt.timing.durationMs = result.durationMs;
  receipt.output = { receiptPath: writeReceipt(args, receipt) };
  completeRun(args.registry, runId, registryEntryFromReceipt(receipt, {
    receiptPath: receipt.output.receiptPath,
  }));
  return receipt;
}

try {
  const rawArgs = process.argv.slice(2);
  const args = rawArgs.includes('--self-test') ? { selfTest: true } : parseArgs(rawArgs);
  if (args.reconcileRegistry) {
    const receipt = reconcileRunRegistry(args);
    if (args.json) {
      console.log(JSON.stringify(receipt, null, 2));
    } else {
      console.log(`HoloShell run registry reconcile: ${receipt.output.receiptPath}`);
      console.log(`HoloShell run registry reconcile browser bootstrap: ${receipt.output.browserBootstrap}`);
      console.log(`Registered runs: ${receipt.registry.registeredRunCount}`);
      console.log(`Active before: ${receipt.registry.activeRunCountBefore}`);
      console.log(`Active after: ${receipt.registry.activeRunCountAfter}`);
      console.log(`Reconciled stale: ${receipt.summary.reconciledRunCount}`);
      console.log(`Destructive actions: ${receipt.summary.destructiveActionsTaken}`);
    }
    process.exit(0);
  }

  const receipt = args.selfTest ? await runSelfTest() : await runWithCustody(args);
  if (receipt.status === 'blocked') {
    console.error(`holoshell-run blocked: ${blockedRunReason(receipt)}`);
  }
  if (args.json || receipt.status === 'blocked') {
    console.log(JSON.stringify(receipt, null, 2));
  } else {
    console.log(`HoloShell run receipt: ${receipt.output.receiptPath}`);
    console.log(`Run: ${receipt.runId}`);
    console.log(`Status: ${receipt.status}`);
    console.log(`Class: ${receipt.command.runClass}`);
    console.log(`Health: ${receipt.healthGate.risk || 'skipped'}`);
    console.log(`Network: ${receipt.networkGate.classification || 'skipped'} (${receipt.networkGate.intent})`);
    console.log(`Cleanup candidates: ${receipt.healthGate.custody?.actionableCleanupCandidateCount || 0}`);
    console.log(`Owner handoffs: ${receipt.healthGate.custody?.ownerHandoffPlanCount || 0}`);
    console.log(`Exit: ${receipt.process.exitCode}`);
  }
  if (receipt.status === 'blocked' || receipt.status === 'failed') {
    process.exitCode = receipt.process.exitCode || 1;
  }
} catch (error) {
  console.error(`holoshell-run failed: ${error.message}`);
  process.exit(1);
}
