#!/usr/bin/env node
import crypto from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const SCHEMA_VERSION = 'hololand.holoshell.run-custody.v0.1.0';
const STORE_SCHEMA = 'hololand.holoshell.run-custody-store.v0.1.0';
const REPO_ROOT = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const DEFAULT_HARDWARE_REALITY = path.join('.tmp', 'holoshell', 'hardware-reality.json');
const DEFAULT_PROCESS_HEALTH = path.join('.tmp', 'holoshell', 'process-health.json');
const DEFAULT_OUTPUT = path.join('.tmp', 'holoshell', 'run-custody.json');
const DEFAULT_JS_OUTPUT = path.join('.tmp', 'holoshell', 'run-custody.js');
const DEFAULT_STORE = path.join('.tmp', 'holoshell', 'run-custody-store.json');
const DEFAULT_LANE_ID = 'codex-hardware';
const DEFAULT_AGENT_KIND = 'codex';
const DEFAULT_EXTEND_MINUTES = 120;
const ACTIONS = new Set(['snapshot', 'claim', 'extend', 'close', 'mark-stale', 'owner-unknown']);

function parseArgs(argv) {
  const args = {
    action: 'snapshot',
    runId: '',
    pid: null,
    laneId: DEFAULT_LANE_ID,
    agentKind: DEFAULT_AGENT_KIND,
    reason: '',
    minutes: DEFAULT_EXTEND_MINUTES,
    hardwareReality: DEFAULT_HARDWARE_REALITY,
    processHealth: DEFAULT_PROCESS_HEALTH,
    store: DEFAULT_STORE,
    output: DEFAULT_OUTPUT,
    jsOutput: DEFAULT_JS_OUTPUT,
    json: false,
    selfTest: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--') continue;
    else if (arg === '--action') args.action = argv[++index];
    else if (arg === '--run-id') args.runId = argv[++index];
    else if (arg === '--pid') args.pid = Number(argv[++index]);
    else if (arg === '--lane-id') args.laneId = argv[++index];
    else if (arg === '--agent-kind') args.agentKind = argv[++index];
    else if (arg === '--reason') args.reason = argv[++index];
    else if (arg === '--minutes') args.minutes = Number(argv[++index]) || DEFAULT_EXTEND_MINUTES;
    else if (arg === '--hardware-reality') args.hardwareReality = argv[++index];
    else if (arg === '--process-health') args.processHealth = argv[++index];
    else if (arg === '--store') args.store = argv[++index];
    else if (arg === '--output') args.output = argv[++index];
    else if (arg === '--js-output') args.jsOutput = argv[++index];
    else if (arg === '--json') args.json = true;
    else if (arg === '--self-test') args.selfTest = true;
    else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!ACTIONS.has(args.action)) {
    throw new Error(`--action must be one of: ${[...ACTIONS].join(', ')}`);
  }
  if (args.pid !== null && (!Number.isInteger(args.pid) || args.pid <= 0)) {
    throw new Error('--pid must be a positive integer');
  }
  if (!Number.isFinite(args.minutes) || args.minutes <= 0) {
    throw new Error('--minutes must be a positive number');
  }
  return args;
}

function printHelp() {
  console.log(`HoloShell run custody actions

Usage:
  node scripts/holoshell-run-custody-actions.mjs [options]

Options:
  --action <name>             snapshot, claim, extend, close, mark-stale, owner-unknown.
  --run-id <id>               Run id from hardware reality.
  --pid <pid>                 PID from hardware reality.
  --lane-id <id>              Owning lane id. Default: ${DEFAULT_LANE_ID}.
  --agent-kind <kind>         Agent kind. Default: ${DEFAULT_AGENT_KIND}.
  --reason <text>             Required for custody actions.
  --minutes <n>               Extend/claim duration. Default: ${DEFAULT_EXTEND_MINUTES}.
  --hardware-reality <path>   Hardware reality JSON. Default: .tmp/holoshell/hardware-reality.json.
  --process-health <path>     Process health JSON. Default: .tmp/holoshell/process-health.json.
  --store <path>              Custody receipt store. Default: .tmp/holoshell/run-custody-store.json.
  --output <path>             Snapshot output. Default: .tmp/holoshell/run-custody.json.
  --js-output <path>          Browser bootstrap JS. Default: .tmp/holoshell/run-custody.js.
  --json                      Print custody snapshot JSON.
  --self-test                 Use synthetic fixture and assert invariants.
`);
}

function resolveRepoPath(filePath) {
  return path.isAbsolute(filePath) ? filePath : path.resolve(REPO_ROOT, filePath);
}

function readJson(filePath) {
  return JSON.parse(readFileSync(resolveRepoPath(filePath), 'utf8'));
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function sha256(value) {
  return crypto.createHash('sha256').update(String(value), 'utf8').digest('hex');
}

function nowIso() {
  return new Date().toISOString();
}

function addMinutes(dateIso, minutes) {
  const base = dateIso ? new Date(dateIso) : new Date();
  const baseMs = Number.isNaN(base.getTime()) ? Date.now() : base.getTime();
  return new Date(baseMs + minutes * 60_000).toISOString();
}

function extensionBaseIso(previousReceipt, generatedAt) {
  const previous = previousReceipt?.expectedEndAt ? new Date(previousReceipt.expectedEndAt) : null;
  const generated = new Date(generatedAt);
  const generatedMs = Number.isNaN(generated.getTime()) ? Date.now() : generated.getTime();
  if (previous && !Number.isNaN(previous.getTime()) && previous.getTime() > generatedMs) {
    return previous.toISOString();
  }
  return new Date(generatedMs).toISOString();
}

function syntheticHardwareReality() {
  return {
    schemaVersion: 'hololand.holoshell.hardware-reality-bridge.v0.1.0',
    generatedAt: '2026-05-14T00:00:00.000Z',
    summary: {
      riskState: 'pass',
      processCount: 4,
      shellRunCount: 2,
      listenerCount: 1,
      laneCount: 2,
      activeLaneCount: 2,
      legacyAppCount: 1,
      terminationPreflightCount: 4,
    },
    safety: {
      destructiveActionsTaken: false,
      preflightRequiredForTermination: true,
    },
    lanes: [
      { laneId: 'codex', label: 'Codex', surfaceKind: 'codex', pidCount: 1, runCount: 1 },
      { laneId: 'ollama', label: 'Ollama', surfaceKind: 'ollama', pidCount: 1, runCount: 1 },
    ],
    shellRuns: [
      {
        runId: 'pid-202',
        pid: 202,
        parentPid: 900,
        processName: 'node.exe',
        healthState: 'listening',
        listeningPorts: [4747],
        commandHash: 'fixture-node-command',
        rawCommandHidden: true,
      },
      {
        runId: 'pid-404',
        pid: 404,
        parentPid: 901,
        processName: 'ollama.exe',
        healthState: 'listening',
        listeningPorts: [11434],
        commandHash: 'fixture-ollama-command',
        ownerLaneId: 'ollama',
        ownerLaneLabel: 'Ollama',
        ownerSurfaceKind: 'ollama',
        ownerColorHint: 'gray',
        ownerEvidence: 'direct_pid',
        ownerTrustState: 'observed_by_holoshell_mcp',
        rawCommandHidden: true,
      },
      {
        runId: 'pid-405',
        pid: 405,
        parentPid: 404,
        processName: 'cmd.exe',
        healthState: 'observed',
        listeningPorts: [],
        commandHash: 'fixture-child-command',
        rawCommandHidden: true,
      },
      {
        runId: 'pid-407',
        pid: 407,
        parentPid: 777,
        processName: 'node.exe',
        healthState: 'observed',
        listeningPorts: [],
        commandHash: 'fixture-process-health-owner-command',
        rawCommandHidden: true,
      },
      {
        runId: 'pid-406',
        pid: 406,
        parentPid: 405,
        processName: 'node.exe',
        healthState: 'observed',
        listeningPorts: [],
        commandHash: 'fixture-grandchild-command',
        rawCommandHidden: true,
      },
    ],
    receipt: {
      snapshotHash: 'fixture-snapshot-hash',
      rawCommandsIncluded: false,
      destructiveActionsTaken: false,
    },
  };
}

function syntheticProcessHealth() {
  return {
    schemaVersion: 'hololand.holoshell.process-health.v0.1.0',
    summary: {
      laneAttributedProcessCount: 1,
      ownerUnknownReviewCount: 0,
    },
    processIndex: {
      visiblePids: [202, 404, 405, 406, 407],
    },
    shellRuns: [
      {
        pid: 407,
        ppid: 777,
        name: 'node.exe',
        shellRunCandidate: true,
        commandHash: 'fixture-process-health-owner-command',
        custody: {
          state: 'lane_observed',
          ownerLane: 'codex',
          ownerLaneLabel: 'Codex',
          ownerAgentKind: 'codex',
          ownerSurfaceKind: 'agent_process',
          ownerColorHint: 'cyan',
          ownerEvidence: 'ancestor_pid',
          ownerParentPid: 700,
          ownerTrustState: 'inferred_from_local_process_table',
        },
      },
    ],
  };
}

function loadHardwareReality(args) {
  if (args.selfTest) return syntheticHardwareReality();
  const resolved = resolveRepoPath(args.hardwareReality);
  if (!existsSync(resolved)) {
    throw new Error(`Hardware reality not found: ${resolved}. Run pnpm run holoshell:hardware-reality first.`);
  }
  return readJson(resolved);
}

function loadProcessHealth(args) {
  if (args.selfTest) return syntheticProcessHealth();
  const resolved = resolveRepoPath(args.processHealth);
  return existsSync(resolved) ? readJson(resolved) : {};
}

function emptyStore() {
  return {
    schemaVersion: STORE_SCHEMA,
    generatedAt: nowIso(),
    updatedAt: nowIso(),
    receipts: [],
  };
}

function loadStore(args) {
  if (args.selfTest) return emptyStore();
  const resolved = resolveRepoPath(args.store);
  if (!existsSync(resolved)) return emptyStore();
  const store = readJson(resolved);
  return {
    ...emptyStore(),
    ...store,
    receipts: safeArray(store.receipts),
  };
}

function writeJson(filePath, data) {
  const resolved = resolveRepoPath(filePath);
  mkdirSync(path.dirname(resolved), { recursive: true });
  writeFileSync(resolved, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  return resolved;
}

function writeBrowserBootstrap(filePath, data) {
  const resolved = resolveRepoPath(filePath);
  mkdirSync(path.dirname(resolved), { recursive: true });
  const payload = JSON.stringify(data, null, 2).replace(/<\/script/gi, '<\\/script');
  writeFileSync(resolved, `window.HOLOSHELL_RUN_CUSTODY = ${payload};\n`, 'utf8');
  return resolved;
}

function processHealthOwnerIndex(processHealth) {
  const ownerByPid = new Map();
  const rows = [
    ...safeArray(processHealth.shellRuns),
    ...safeArray(processHealth.processes),
  ];
  for (const row of rows) {
    const pid = Number(row.pid);
    const custody = row.custody || {};
    if (!Number.isInteger(pid) || pid <= 0 || !custody.ownerLane) continue;
    ownerByPid.set(pid, {
      ownerLaneId: custody.ownerLane,
      ownerLaneLabel: custody.ownerLaneLabel || custody.ownerLane,
      ownerSurfaceKind: custody.ownerSurfaceKind || custody.ownerAgentKind || null,
      ownerColorHint: custody.ownerColorHint || null,
      ownerEvidence: custody.ownerEvidence || 'process_health',
      ownerParentPid: custody.ownerParentPid || null,
      ownerTrustState: custody.ownerTrustState || 'observed_by_process_health',
    });
  }
  return ownerByPid;
}

function processHealthVisiblePidSet(processHealth) {
  const pids = safeArray(processHealth.processIndex?.visiblePids)
    .map(Number)
    .filter((pid) => Number.isInteger(pid) && pid > 0);
  return new Set(pids);
}

function applyProcessHealthOwnership(run, ownerByPid) {
  if (run.ownerLaneId) return run;
  const directOwner = ownerByPid.get(run.pid);
  if (directOwner) {
    return {
      ...run,
      ...directOwner,
      ownerEvidence: 'process_health_direct_pid',
      ownerParentPid: directOwner.ownerParentPid || run.pid,
      ownerTrustState: directOwner.ownerTrustState || 'observed_by_process_health',
    };
  }
  const parentOwner = ownerByPid.get(run.parentPid);
  if (parentOwner) {
    return {
      ...run,
      ...parentOwner,
      ownerEvidence: 'process_health_parent_pid',
      ownerParentPid: run.parentPid,
      ownerTrustState: parentOwner.ownerTrustState || 'observed_by_process_health',
    };
  }
  return run;
}

function visibleRuns(hardwareReality, processHealth = {}) {
  const ownerByPid = processHealthOwnerIndex(processHealth);
  const visiblePids = processHealthVisiblePidSet(processHealth);
  return safeArray(hardwareReality.shellRuns).map((run) => applyProcessHealthOwnership({
    runId: run.runId || `pid-${run.pid}`,
    pid: Number(run.pid),
    parentPid: Number.isInteger(Number(run.parentPid)) ? Number(run.parentPid) : null,
    processName: run.processName || 'process',
    healthState: run.healthState || 'observed',
    listeningPorts: safeArray(run.listeningPorts),
    commandHash: run.commandHash || null,
    ownerLaneId: run.ownerLaneId || null,
    ownerLaneLabel: run.ownerLaneLabel || null,
    ownerSurfaceKind: run.ownerSurfaceKind || null,
    ownerColorHint: run.ownerColorHint || null,
    ownerEvidence: run.ownerEvidence || null,
    ownerParentPid: run.ownerParentPid || null,
    ownerTrustState: run.ownerTrustState || null,
    rawCommandHidden: true,
  }, ownerByPid)).filter((run) => Number.isInteger(run.pid) && (!visiblePids.size || visiblePids.has(run.pid)));
}

function ownerInfoFromRun(run, evidence = run.ownerEvidence || 'direct_pid') {
  if (!run?.ownerLaneId) return null;
  return {
    ownerLaneId: run.ownerLaneId,
    ownerLaneLabel: run.ownerLaneLabel,
    ownerSurfaceKind: run.ownerSurfaceKind,
    ownerColorHint: run.ownerColorHint,
    ownerEvidence: evidence,
    ownerParentPid: run.ownerParentPid || run.pid,
    ownerTrustState: evidence === 'parent_chain'
      ? 'inferred_parent_chain'
      : run.ownerTrustState || 'observed_by_holoshell_mcp',
  };
}

function inferParentChainOwnership(runs) {
  const byPid = new Map(runs.map((run) => [run.pid, run]));
  const ownerByPid = new Map();
  for (const run of runs) {
    const owner = ownerInfoFromRun(run);
    if (owner) ownerByPid.set(run.pid, owner);
  }

  let changed = true;
  while (changed) {
    changed = false;
    for (const run of runs) {
      if (ownerByPid.has(run.pid)) continue;
      const parent = byPid.get(run.parentPid);
      const parentOwner = parent ? ownerByPid.get(parent.pid) : null;
      if (!parentOwner) continue;
      ownerByPid.set(run.pid, {
        ...parentOwner,
        ownerEvidence: 'parent_chain',
        ownerParentPid: parent.pid,
        ownerTrustState: 'inferred_parent_chain',
      });
      changed = true;
    }
  }

  return ownerByPid;
}

function applyParentChainOwnership(runs) {
  const ownerByPid = inferParentChainOwnership(runs);
  return runs.map((run) => {
    if (run.ownerLaneId) return run;
    const owner = ownerByPid.get(run.pid);
    return owner ? { ...run, ...owner } : run;
  });
}

function latestReceipts(store) {
  const latest = new Map();
  for (const receipt of safeArray(store.receipts)) {
    const key = receipt.runId || `pid-${receipt.pid}`;
    if (!key) continue;
    const previous = latest.get(key);
    if (!previous || String(receipt.generatedAt).localeCompare(String(previous.generatedAt)) > 0) {
      latest.set(key, receipt);
    }
  }
  return latest;
}

function findRun(hardwareReality, processHealth, args) {
  const runs = visibleRuns(hardwareReality, processHealth);
  if (args.runId) return runs.find((run) => run.runId === args.runId);
  if (args.pid) return runs.find((run) => run.pid === args.pid);
  return null;
}

function requireActionInput(args, hardwareReality, processHealth) {
  if (args.action === 'snapshot') return null;
  const run = findRun(hardwareReality, processHealth, args);
  if (!run) throw new Error('Custody action requires --run-id or --pid matching a visible shell run');
  if (!args.reason.trim()) throw new Error('Custody action requires --reason');
  return run;
}

function createReceipt(args, run, previousReceipt) {
  const generatedAt = nowIso();
  const statusByAction = {
    claim: 'claimed',
    extend: 'claimed',
    close: 'closed',
    'mark-stale': 'stale',
    'owner-unknown': 'owner_unknown',
  };
  const expectedEndAt = ['claim', 'extend'].includes(args.action)
    ? addMinutes(args.action === 'extend' ? extensionBaseIso(previousReceipt, generatedAt) : generatedAt, args.minutes)
    : previousReceipt?.expectedEndAt || null;
  const basis = JSON.stringify({
    action: args.action,
    runId: run.runId,
    pid: run.pid,
    laneId: args.laneId,
    generatedAt,
    commandHash: run.commandHash,
  });

  return {
    schemaVersion: `${SCHEMA_VERSION}.receipt`,
    receiptId: `custody-${args.action}-${run.pid}-${sha256(basis).slice(0, 12)}`,
    generatedAt,
    action: args.action,
    status: statusByAction[args.action],
    runId: run.runId,
    pid: run.pid,
    parentPid: run.parentPid,
    processName: run.processName,
    laneId: args.laneId,
    agentKind: args.agentKind,
    reason: args.reason.trim(),
    expectedEndAt,
    previousReceiptId: previousReceipt?.receiptId || null,
    commandHash: run.commandHash,
    rawCommandHidden: true,
    destructiveActionsTaken: false,
    terminationPerformed: false,
    mutationPerformed: false,
    receiptRequired: true,
  };
}

function applyAction(args, hardwareReality, processHealth, store) {
  const run = requireActionInput(args, hardwareReality, processHealth);
  if (!run) return null;
  const latest = latestReceipts(store);
  const receipt = createReceipt(args, run, latest.get(run.runId));
  store.receipts.push(receipt);
  store.updatedAt = receipt.generatedAt;
  return receipt;
}

function statusForRun(run, latest) {
  const receipt = latest.get(run.runId);
  const observedLaneStatus = run.ownerLaneId ? 'lane_observed' : 'owner_unknown';
  return {
    runId: run.runId,
    pid: run.pid,
    parentPid: run.parentPid,
    processName: run.processName,
    healthState: run.healthState,
    listeningPorts: run.listeningPorts,
    commandHash: run.commandHash,
    status: receipt?.status || observedLaneStatus,
    laneId: receipt?.laneId || run.ownerLaneId || null,
    laneLabel: receipt?.laneId ? null : run.ownerLaneLabel || null,
    agentKind: receipt?.agentKind || run.ownerSurfaceKind || null,
    ownerEvidence: receipt ? 'receipt' : run.ownerEvidence || null,
    ownerParentPid: receipt ? null : run.ownerParentPid || null,
    ownerTrustState: receipt ? 'receipt' : run.ownerTrustState || null,
    expectedEndAt: receipt?.expectedEndAt || null,
    lastReceiptId: receipt?.receiptId || null,
    rawCommandHidden: true,
    receiptRequired: true,
  };
}

function isOverdue(runStatus) {
  if (!runStatus.expectedEndAt) return false;
  const date = new Date(runStatus.expectedEndAt);
  return !Number.isNaN(date.getTime()) && date.getTime() < Date.now() && runStatus.status !== 'closed';
}

function buildRecommendations(runStatuses) {
  const recommendations = [];
  for (const run of runStatuses) {
    if (run.status === 'closed') {
      recommendations.push({
        action: 'verify-closed',
        runId: run.runId,
        pid: run.pid,
        priority: 'medium',
        reason: 'Run is marked closed but is still visible in the hardware snapshot.',
        requiresUserConfirmation: false,
        receiptRequired: true,
      });
      continue;
    }
    if (isOverdue(run)) {
      const claimedOrObserved = ['claimed', 'lane_observed'].includes(run.status);
      recommendations.push({
        action: claimedOrObserved ? 'extend' : 'extend-or-close',
        runId: run.runId,
        pid: run.pid,
        priority: 'high',
        reason: claimedOrObserved
          ? 'Claim has passed its expected end time while the PID is still visible. Extend the non-destructive custody receipt.'
          : 'Claim has passed its expected end time. Extend the receipt or close the run without terminating it.',
        requiresUserConfirmation: false,
        receiptRequired: true,
      });
      continue;
    }
    if (run.status === 'stale') {
      recommendations.push({
        action: 'close-or-reclaim',
        runId: run.runId,
        pid: run.pid,
        priority: 'medium',
        reason: 'Run is marked stale. Ask the owner lane to close it or reclaim with a fresh reason.',
        requiresUserConfirmation: false,
        receiptRequired: true,
      });
      continue;
    }
    if (run.status === 'owner_unknown') {
      recommendations.push({
        action: 'claim',
        runId: run.runId,
        pid: run.pid,
        priority: run.listeningPorts.length ? 'high' : 'medium',
        reason: run.listeningPorts.length
          ? 'Listening shell run has no custody owner.'
          : 'Visible shell run has no custody owner.',
        requiresUserConfirmation: false,
        receiptRequired: true,
      });
    }
  }
  return recommendations.slice(0, 24);
}

function createBrittneyBrief(snapshot) {
  const summary = snapshot.summary;
  const first = snapshot.recommendations[0] || null;
  return {
    status: summary.ownerUnknownCount || summary.staleRunCount ? 'needs_triage' : 'ready',
    summary: `${summary.observedRunCount} shell run(s), ${summary.claimedRunCount} claimed, ${summary.observedOwnerCount} lane observed, ${summary.ownerUnknownCount} owner unknown, ${summary.staleRunCount} stale, ${summary.closedRunCount} closed.`,
    requiredNextAction: first ? `${first.action} ${first.runId}: ${first.reason}` : 'No custody action required before low-risk read-only work.',
    allowedActions: ['claim', 'extend', 'close', 'mark-stale', 'owner-unknown', 'snapshot'],
    blockedActions: ['kill_process', 'delete_file', 'legacy_app_mutation', 'registry_change'],
    operatorRule: 'Run custody actions do not terminate processes. Destructive operations require separate HoloShell MCP preflight tools.',
  };
}

function createSnapshot(hardwareReality, processHealth, store, actionReceipt = null) {
  const runs = applyParentChainOwnership(visibleRuns(hardwareReality, processHealth));
  const latest = latestReceipts(store);
  const runStatuses = runs.map((run) => statusForRun(run, latest));
  const claimed = runStatuses.filter((run) => run.status === 'claimed');
  const observedOwner = runStatuses.filter((run) => run.status === 'lane_observed');
  const stale = runStatuses.filter((run) => run.status === 'stale' || isOverdue(run));
  const closed = runStatuses.filter((run) => run.status === 'closed');
  const ownerUnknown = runStatuses.filter((run) => run.status === 'owner_unknown');
  const recommendations = buildRecommendations(runStatuses);
  const snapshot = {
    schemaVersion: SCHEMA_VERSION,
    generatedAt: nowIso(),
    sourceAnchors: {
      source: 'apps/holoshell/source/holoshell-run-custody-actions.hsplus',
      adapter: 'scripts/holoshell-run-custody-actions.mjs',
      hardwareReality: 'scripts/holoshell-hardware-reality-bridge.mjs',
      processHealth: 'scripts/holoshell-process-health.mjs',
    },
    summary: {
      observedRunCount: runs.length,
      claimedRunCount: claimed.length,
      observedOwnerCount: observedOwner.length,
      staleRunCount: stale.length,
      ownerUnknownCount: ownerUnknown.length,
      closedRunCount: closed.length,
      actionReceiptCount: safeArray(store.receipts).length,
      recommendationCount: recommendations.length,
      processHealthOwnerCount: processHealthOwnerIndex(processHealth).size,
      processHealthVisiblePidCount: processHealthVisiblePidSet(processHealth).size,
    },
    safety: {
      readOnlySnapshot: true,
      destructiveActionsTaken: false,
      terminationPerformed: false,
      mutationPerformed: false,
      rawCommandsIncluded: false,
      separatePreflightRequiredForTermination: true,
    },
    hardwareReality: {
      generatedAt: hardwareReality.generatedAt || null,
      riskState: hardwareReality.summary?.riskState || 'unknown',
      snapshotHash: hardwareReality.receipt?.snapshotHash || null,
    },
    processHealth: {
      generatedAt: processHealth.generatedAt || null,
      riskState: processHealth.summary?.riskState || 'unknown',
      laneAttributedProcessCount: processHealth.summary?.laneAttributedProcessCount || 0,
      ownerUnknownReviewCount: processHealth.summary?.ownerUnknownReviewCount || 0,
      visiblePidCount: processHealthVisiblePidSet(processHealth).size,
    },
    runs: runStatuses.slice(0, 80),
    recommendations,
    latestAction: actionReceipt,
    recentReceipts: safeArray(store.receipts).slice(-20).reverse(),
    receipt: {
      custodyHash: sha256(JSON.stringify({
        runs: runStatuses.map((run) => [run.runId, run.status, run.lastReceiptId]),
        receiptCount: safeArray(store.receipts).length,
        hardwareSnapshotHash: hardwareReality.receipt?.snapshotHash || null,
      })),
      destructiveActionsTaken: false,
      rawCommandsIncluded: false,
    },
  };
  return {
    ...snapshot,
    brittneyBrief: createBrittneyBrief(snapshot),
  };
}

function assertSelfTest(snapshot, actionReceipt) {
  const failures = [];
  if (snapshot.schemaVersion !== SCHEMA_VERSION) failures.push('schemaVersion mismatch');
  if (snapshot.summary.observedRunCount < 2) failures.push('expected synthetic runs');
  if (snapshot.summary.actionReceiptCount < 1) failures.push('expected custody receipt');
  if (snapshot.summary.observedOwnerCount < 1) failures.push('expected lane observed synthetic run');
  const inheritedGrandchild = snapshot.runs.find((run) => run.pid === 406);
  if (inheritedGrandchild?.status !== 'lane_observed') failures.push('expected inherited grandchild lane observation');
  if (inheritedGrandchild?.laneId !== 'ollama') failures.push('expected inherited grandchild owner lane');
  if (inheritedGrandchild?.ownerEvidence !== 'parent_chain') failures.push('expected parent-chain owner evidence');
  const processHealthOwnedRun = snapshot.runs.find((run) => run.pid === 407);
  if (processHealthOwnedRun?.status !== 'lane_observed') failures.push('expected process-health owned run to be lane observed');
  if (processHealthOwnedRun?.laneId !== 'codex') failures.push('expected process-health owned run to inherit codex lane');
  if (processHealthOwnedRun?.ownerEvidence !== 'process_health_direct_pid') failures.push('expected process-health owner evidence');
  if (!snapshot.runs.some((run) => run.parentPid === 900)) failures.push('expected parent pid for shell-window binding');
  if (!actionReceipt || actionReceipt.destructiveActionsTaken !== false) failures.push('action receipt must be non-destructive');
  if (snapshot.safety.destructiveActionsTaken !== false) failures.push('snapshot must be non-destructive');
  if (snapshot.safety.rawCommandsIncluded !== false) failures.push('raw commands must stay hidden');
  if (!snapshot.brittneyBrief?.blockedActions?.includes('kill_process')) failures.push('Brittney brief must block termination');
  const generatedAt = new Date().toISOString();
  const staleExpectedEnd = new Date(Date.now() - 60_000).toISOString();
  if (extensionBaseIso({ expectedEndAt: staleExpectedEnd }, generatedAt) !== generatedAt) {
    failures.push('overdue extension should restart from generatedAt');
  }
  const futureExpectedEnd = new Date(Date.now() + 60_000).toISOString();
  if (extensionBaseIso({ expectedEndAt: futureExpectedEnd }, generatedAt) !== futureExpectedEnd) {
    failures.push('future extension should stack from previous expectedEndAt');
  }
  const serialized = JSON.stringify(snapshot);
  if (/commandLine|CommandLine|command_summary/.test(serialized)) failures.push('raw command text leaked');
  if (failures.length) {
    throw new Error(`Self-test failed:\n- ${failures.join('\n- ')}`);
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.selfTest) {
    args.action = args.action === 'snapshot' ? 'claim' : args.action;
    args.pid = args.pid || 202;
    args.reason = args.reason || 'Self-test claim receipt proves non-destructive custody.';
    if (args.output === DEFAULT_OUTPUT) args.output = path.join('.tmp', 'holoshell', 'self-test', 'run-custody.json');
    if (args.jsOutput === DEFAULT_JS_OUTPUT) args.jsOutput = path.join('.tmp', 'holoshell', 'self-test', 'run-custody.js');
    if (args.store === DEFAULT_STORE) args.store = path.join('.tmp', 'holoshell', 'self-test', 'run-custody-store.json');
  }

  const hardwareReality = loadHardwareReality(args);
  const processHealth = loadProcessHealth(args);
  const store = loadStore(args);
  const actionReceipt = applyAction(args, hardwareReality, processHealth, store);
  const snapshot = createSnapshot(hardwareReality, processHealth, store, actionReceipt);
  if (args.selfTest) assertSelfTest(snapshot, actionReceipt);

  if (!args.selfTest) writeJson(args.store, store);
  const output = writeJson(args.output, snapshot);
  const jsOutput = writeBrowserBootstrap(args.jsOutput, snapshot);

  if (args.json) {
    console.log(JSON.stringify(snapshot, null, 2));
  } else {
    console.log(`HoloShell run custody: ${output}`);
    console.log(`HoloShell run custody browser bootstrap: ${jsOutput}`);
    console.log(`Runs: ${snapshot.summary.observedRunCount}`);
    console.log(`Claimed: ${snapshot.summary.claimedRunCount}`);
    console.log(`Lane observed: ${snapshot.summary.observedOwnerCount}`);
    console.log(`Owner unknown: ${snapshot.summary.ownerUnknownCount}`);
    console.log(`Process-health owners: ${snapshot.summary.processHealthOwnerCount}`);
    console.log(`Stale: ${snapshot.summary.staleRunCount}`);
    console.log(`Closed: ${snapshot.summary.closedRunCount}`);
    console.log(`Receipts: ${snapshot.summary.actionReceiptCount}`);
    console.log(`Destructive actions: ${snapshot.safety.destructiveActionsTaken}`);
  }
}

try {
  main();
} catch (error) {
  console.error(`holoshell-run-custody-actions failed: ${error.message}`);
  process.exit(1);
}
