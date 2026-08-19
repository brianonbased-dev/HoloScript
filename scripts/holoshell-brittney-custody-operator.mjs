#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const SCHEMA_VERSION = 'hololand.holoshell.brittney-custody-operator.v0.1.0';
const REPO_ROOT = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const DEFAULT_OPERATOR_BRIEF = path.join('.tmp', 'holoshell', 'operator-brief.json');
const DEFAULT_HARDWARE_REALITY = path.join('.tmp', 'holoshell', 'hardware-reality.json');
const DEFAULT_STORE = path.join('.tmp', 'holoshell', 'run-custody-store.json');
const DEFAULT_CUSTODY_OUTPUT = path.join('.tmp', 'holoshell', 'run-custody.json');
const DEFAULT_CUSTODY_JS_OUTPUT = path.join('.tmp', 'holoshell', 'run-custody.js');
const DEFAULT_OUTPUT = path.join('.tmp', 'holoshell', 'brittney-custody-action.json');
const DEFAULT_JS_OUTPUT = path.join('.tmp', 'holoshell', 'brittney-custody-action.js');
const DEFAULT_LANE_ID = 'brittney-holoshell';
const DEFAULT_AGENT_KIND = 'brittney';
const DEFAULT_MINUTES = 120;
const DEFAULT_MAX_RUNS = 6;
const SAFE_CUSTODY_ACTIONS = new Set(['claim', 'extend', 'close', 'mark-stale', 'owner-unknown']);
const AMBIGUOUS_ACTIONS = new Set(['extend-or-close', 'close-or-reclaim', 'verify-closed']);
const ALWAYS_BLOCKED = [
  'kill_process',
  'delete_file',
  'legacy_app_mutation',
  'registry_change',
  'destructive_ui_click',
];

function parseArgs(argv) {
  const args = {
    action: 'auto',
    runId: '',
    pid: null,
    reason: '',
    laneId: DEFAULT_LANE_ID,
    agentKind: DEFAULT_AGENT_KIND,
    minutes: DEFAULT_MINUTES,
    windowId: '',
    windowGroupId: '',
    maxRuns: DEFAULT_MAX_RUNS,
    operatorBrief: DEFAULT_OPERATOR_BRIEF,
    hardwareReality: DEFAULT_HARDWARE_REALITY,
    store: DEFAULT_STORE,
    custodyOutput: DEFAULT_CUSTODY_OUTPUT,
    custodyJsOutput: DEFAULT_CUSTODY_JS_OUTPUT,
    output: DEFAULT_OUTPUT,
    jsOutput: DEFAULT_JS_OUTPUT,
    dryRun: false,
    json: false,
    selfTest: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--') continue;
    else if (arg === '--action') args.action = argv[++index];
    else if (arg === '--run-id') args.runId = argv[++index];
    else if (arg === '--pid') args.pid = Number(argv[++index]);
    else if (arg === '--reason') args.reason = argv[++index];
    else if (arg === '--lane-id') args.laneId = argv[++index];
    else if (arg === '--agent-kind') args.agentKind = argv[++index];
    else if (arg === '--minutes') args.minutes = Number(argv[++index]) || DEFAULT_MINUTES;
    else if (arg === '--window-id') args.windowId = argv[++index] || '';
    else if (arg === '--window-group-id') args.windowGroupId = argv[++index] || '';
    else if (arg === '--max-runs') args.maxRuns = Number(argv[++index]) || DEFAULT_MAX_RUNS;
    else if (arg === '--operator-brief') args.operatorBrief = argv[++index];
    else if (arg === '--hardware-reality') args.hardwareReality = argv[++index];
    else if (arg === '--store') args.store = argv[++index];
    else if (arg === '--custody-output') args.custodyOutput = argv[++index];
    else if (arg === '--custody-js-output') args.custodyJsOutput = argv[++index];
    else if (arg === '--output') args.output = argv[++index];
    else if (arg === '--js-output') args.jsOutput = argv[++index];
    else if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--json') args.json = true;
    else if (arg === '--self-test') args.selfTest = true;
    else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  const normalizedAction = normalizeActionName(args.action);
  if (normalizedAction !== 'auto' && !SAFE_CUSTODY_ACTIONS.has(normalizedAction)) {
    throw new Error(`--action must be auto or one of: ${[...SAFE_CUSTODY_ACTIONS].join(', ')}`);
  }
  args.action = normalizedAction;
  if (args.pid !== null && (!Number.isInteger(args.pid) || args.pid <= 0)) {
    throw new Error('--pid must be a positive integer');
  }
  if (!Number.isFinite(args.minutes) || args.minutes <= 0) {
    throw new Error('--minutes must be a positive number');
  }
  if (!Number.isFinite(args.maxRuns) || args.maxRuns <= 0) {
    throw new Error('--max-runs must be a positive number');
  }
  args.maxRuns = Math.floor(args.maxRuns);
  return args;
}

function printHelp() {
  console.log(`HoloShell Brittney custody operator

Usage:
  node scripts/holoshell-brittney-custody-operator.mjs [options]

Options:
  --action <name>              auto, claim, extend, close, mark-stale, owner-unknown.
  --run-id <id>                Run id from hardware reality.
  --pid <pid>                  PID from hardware reality.
  --reason <text>              Custody reason. Derived from the brief in auto mode.
  --lane-id <id>               Owning lane id. Default: ${DEFAULT_LANE_ID}.
  --agent-kind <kind>          Agent kind. Default: ${DEFAULT_AGENT_KIND}.
  --minutes <n>                Claim/extend duration. Default: ${DEFAULT_MINUTES}.
  --window-id <id>             Select a shell window from operator brief shellCustody.
  --window-group-id <id>       Select a shell window group from operator brief shellCustody.
  --max-runs <n>               Maximum child runs to claim from a shell window group. Default: ${DEFAULT_MAX_RUNS}.
  --operator-brief <path>      Operator brief JSON. Default: .tmp/holoshell/operator-brief.json.
  --hardware-reality <path>    Hardware reality JSON. Default: .tmp/holoshell/hardware-reality.json.
  --store <path>               Custody receipt store. Default: .tmp/holoshell/run-custody-store.json.
  --custody-output <path>      Run custody output JSON. Default: .tmp/holoshell/run-custody.json.
  --custody-js-output <path>   Run custody browser JS. Default: .tmp/holoshell/run-custody.js.
  --output <path>              Output JSON. Default: .tmp/holoshell/brittney-custody-action.json.
  --js-output <path>           Browser bootstrap JS. Default: .tmp/holoshell/brittney-custody-action.js.
  --dry-run                    Build the plan without writing a custody receipt.
  --json                       Print JSON.
  --self-test                  Use synthetic fixtures and assert invariants.
`);
}

function resolveRepoPath(filePath) {
  return path.isAbsolute(filePath) ? filePath : path.resolve(REPO_ROOT, filePath);
}

function readJson(filePath) {
  return JSON.parse(readFileSync(resolveRepoPath(filePath), 'utf8'));
}

function loadRequiredJson(filePath, label) {
  const resolved = resolveRepoPath(filePath);
  if (!existsSync(resolved)) {
    throw new Error(`${label} not found: ${resolved}. Refresh hardware reality, run custody, legacy apps, and operator brief first.`);
  }
  return readJson(filePath);
}

function loadOptionalJson(filePath) {
  return existsSync(resolveRepoPath(filePath)) ? readJson(filePath) : null;
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
  writeFileSync(resolved, `window.HOLOSHELL_BRITTNEY_CUSTODY_ACTION = ${payload};\n`, 'utf8');
  return resolved;
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeString(value) {
  return String(value ?? '').trim();
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function sha256(value) {
  return crypto.createHash('sha256').update(String(value), 'utf8').digest('hex');
}

function normalizeActionName(action) {
  const key = String(action || '').trim().toLowerCase().replace(/_/g, '-');
  const aliases = new Map([
    ['claim-run', 'claim'],
    ['extend-run', 'extend'],
    ['close-run', 'close'],
    ['close-run-receipt', 'close'],
    ['mark-run-stale', 'mark-stale'],
    ['owner-unknown-run', 'owner-unknown'],
  ]);
  return aliases.get(key) || key;
}

function firstMoveFromBrief(brief) {
  const nextAction = safeArray(brief.nextActions)[0] || {};
  return {
    source: nextAction.source || 'brittneyPromptCard',
    priority: nextAction.priority || 'medium',
    raw: String(nextAction.action || brief.brittneyPromptCard?.firstMove || '').trim(),
  };
}

function reasonFromRaw(raw) {
  const index = raw.indexOf(':');
  if (index >= 0) return raw.slice(index + 1).trim();
  return raw ? `Operator brief first move: ${raw}` : 'Operator brief requested safe custody action.';
}

function pidFromText(raw) {
  const match = String(raw).match(/\bpid[-\s:]?(\d+)\b/i);
  return match ? Number(match[1]) : null;
}

function runIdFromText(raw, pid) {
  const match = String(raw).match(/\b(pid-\d+)\b/i);
  if (match) return match[1].toLowerCase();
  return pid ? `pid-${pid}` : '';
}

function shellWindowQueueFromBrief(brief, options = {}) {
  const maxRuns = Math.max(1, Math.floor(Number(options.maxRuns ?? DEFAULT_MAX_RUNS)));
  const groups = new Map();

  for (const shellWindow of safeArray(brief.shellCustody?.windows)) {
    const windowId = normalizeString(shellWindow.windowId) || `window-pid-${shellWindow.pid ?? 'unknown'}`;
    const windowPid = Number(shellWindow.pid);
    const windowGroupId = Number.isInteger(windowPid)
      ? `shell-window-pid-${windowPid}`
      : `shell-window-${windowId}`;
    const group = groups.get(windowGroupId) ?? {
      queueId: windowGroupId,
      windowGroupId,
      windowIds: [],
      windowPid: Number.isInteger(windowPid) ? windowPid : null,
      windowCount: 0,
      candidateRuns: new Map(),
      laneIds: new Set(),
      bindingEvidence: new Set(),
      boundRunCount: 0,
    };

    if (!group.windowIds.includes(windowId)) {
      group.windowIds.push(windowId);
      group.windowCount += 1;
    }
    if (shellWindow.bindingEvidence) group.bindingEvidence.add(String(shellWindow.bindingEvidence));
    for (const laneId of safeArray(shellWindow.laneIds)) group.laneIds.add(String(laneId));
    group.boundRunCount += Number(shellWindow.boundRunCount ?? 0);

    for (const run of safeArray(shellWindow.runs)) {
      if (run.status !== 'owner_unknown') continue;
      const runId = normalizeString(run.runId);
      const pid = Number(run.pid);
      if (!runId && !Number.isInteger(pid)) continue;
      const key = runId || `pid-${pid}`;
      if (group.candidateRuns.has(key)) continue;
      group.candidateRuns.set(key, {
        runId: runId || `pid-${pid}`,
        pid: Number.isInteger(pid) ? pid : null,
        parentPid: Number.isInteger(Number(run.parentPid)) ? Number(run.parentPid) : null,
        processName: run.processName ?? null,
        laneId: run.laneId ?? null,
        laneLabel: run.laneLabel ?? null,
        status: run.status ?? null,
        listeningPorts: safeArray(run.listeningPorts),
      });
    }

    groups.set(windowGroupId, group);
  }

  return Array.from(groups.values())
    .map((group) => {
      const candidateRuns = Array.from(group.candidateRuns.values()).slice(0, maxRuns);
      const runIds = candidateRuns.map((run) => run.runId).filter(Boolean);
      const pids = candidateRuns.map((run) => run.pid).filter((pid) => Number.isInteger(pid));
      const listeningRunCount = candidateRuns.filter((run) => run.listeningPorts.length > 0).length;
      return {
        queueId: group.queueId,
        action: 'claim',
        windowGroupId: group.windowGroupId,
        windowIds: group.windowIds,
        windowPid: group.windowPid,
        windowCount: group.windowCount,
        runIds,
        pids,
        runCount: runIds.length,
        ownerUnknownRunCount: runIds.length,
        boundRunCount: group.boundRunCount,
        listeningRunCount,
        laneIds: Array.from(group.laneIds).sort(),
        bindingEvidence: Array.from(group.bindingEvidence).sort(),
        reason: `Visible shell window group ${group.windowGroupId} has ${runIds.length} child run(s) needing custody.`,
      };
    })
    .filter((entry) => entry.runCount > 0)
    .sort((a, b) => {
      if (b.listeningRunCount !== a.listeningRunCount) return b.listeningRunCount - a.listeningRunCount;
      if (b.ownerUnknownRunCount !== a.ownerUnknownRunCount) return b.ownerUnknownRunCount - a.ownerUnknownRunCount;
      if (b.boundRunCount !== a.boundRunCount) return b.boundRunCount - a.boundRunCount;
      return String(a.windowGroupId).localeCompare(String(b.windowGroupId));
    });
}

function selectShellWindowAction(args, queue) {
  const selected = args.windowGroupId
    ? queue.find((entry) => entry.windowGroupId === args.windowGroupId || entry.queueId === args.windowGroupId)
    : args.windowId
      ? queue.find((entry) => entry.windowIds.includes(args.windowId))
      : queue[0];

  if (!selected) {
    return {
      mode: 'shell_window_auto',
      source: args.windowGroupId || args.windowId ? 'shell_window_custody_requested' : 'shell_window_custody',
      priority: 'high',
      raw: '',
      action: 'claim',
      runId: '',
      pid: null,
      reason: args.reason || 'No eligible shell window custody candidate was found.',
      ambiguous: false,
      shellWindowCluster: true,
      queueId: null,
      windowGroupId: args.windowGroupId || null,
      windowIds: args.windowId ? [args.windowId] : [],
      windowPid: null,
      windowCount: 0,
      runIds: [],
      pids: [],
      runCount: 0,
    };
  }

  return {
    mode: args.windowGroupId || args.windowId ? 'explicit_shell_window' : 'shell_window_auto',
    source: 'shell_window_custody',
    priority: selected.listeningRunCount > 0 ? 'critical' : 'high',
    raw: '',
    action: 'claim',
    runId: selected.runIds[0] || '',
    pid: selected.pids[0] ?? null,
    reason: args.reason || selected.reason,
    ambiguous: false,
    shellWindowCluster: true,
    queueId: selected.queueId,
    windowGroupId: selected.windowGroupId,
    windowIds: selected.windowIds,
    windowPid: selected.windowPid,
    windowCount: selected.windowCount,
    runIds: selected.runIds,
    pids: selected.pids,
    runCount: selected.runCount,
    ownerUnknownRunCount: selected.ownerUnknownRunCount,
    listeningRunCount: selected.listeningRunCount,
    laneIds: selected.laneIds,
    bindingEvidence: selected.bindingEvidence,
  };
}

function selectAction(args, brief) {
  const shellWindowQueue = shellWindowQueueFromBrief(brief, { maxRuns: args.maxRuns });
  if (args.windowGroupId || args.windowId) {
    return selectShellWindowAction(args, shellWindowQueue);
  }

  if (args.action !== 'auto') {
    return {
      mode: 'explicit',
      source: 'cli',
      priority: 'high',
      raw: args.reason || `${args.action} ${args.runId || (args.pid ? `pid-${args.pid}` : '')}`.trim(),
      action: args.action,
      runId: args.runId || (args.pid ? `pid-${args.pid}` : ''),
      pid: args.pid,
      reason: args.reason || `Brittney explicit ${args.action} custody receipt.`,
      ambiguous: false,
    };
  }

  if (shellWindowQueue.length > 0) {
    return selectShellWindowAction(args, shellWindowQueue);
  }

  const firstMove = firstMoveFromBrief(brief);
  const actionMatch = firstMove.raw.match(/^\s*([a-z][a-z_-]*(?:-[a-z]+)*)\b/i);
  const action = normalizeActionName(actionMatch?.[1] || '');
  const pid = pidFromText(firstMove.raw);
  return {
    mode: 'operator_brief_auto',
    source: firstMove.source,
    priority: firstMove.priority,
    raw: firstMove.raw,
    action,
    runId: runIdFromText(firstMove.raw, pid),
    pid,
    reason: reasonFromRaw(firstMove.raw),
    ambiguous: AMBIGUOUS_ACTIONS.has(action),
  };
}

function briefHash(brief) {
  return brief.receipt?.briefHash || sha256(JSON.stringify({
    status: brief.status,
    runs: brief.runs,
    shellCustody: brief.shellCustody,
    legacy: brief.legacy,
    blockedActions: brief.blockedActions,
    safety: brief.safety,
  }));
}

function buildGate(selection, brief) {
  const blockedActions = unique([...safeArray(brief.blockedActions), ...ALWAYS_BLOCKED]);
  const directBlock = blockedActions.includes(selection.action);
  const destructiveAlreadyTaken = Boolean(brief.safety?.destructiveActionsTaken);
  let status = 'ready';
  let blockReason = '';

  if (destructiveAlreadyTaken) {
    status = 'blocked';
    blockReason = 'Operator brief reports a destructive action flag; safe custody execution is paused.';
  } else if (!selection.action) {
    status = 'no_action';
    blockReason = 'Operator brief did not provide a custody action.';
  } else if (selection.ambiguous) {
    status = 'blocked';
    blockReason = `${selection.action} is ambiguous; choose a concrete custody receipt action first.`;
  } else if (!SAFE_CUSTODY_ACTIONS.has(selection.action)) {
    status = 'blocked';
    blockReason = `${selection.action} is outside Brittney safe custody actions.`;
  } else if (directBlock) {
    status = 'blocked';
    blockReason = `${selection.action} appears in blockedActions.`;
  } else if (selection.shellWindowCluster && selection.action !== 'claim') {
    status = 'blocked';
    blockReason = 'Shell window custody clusters only support claim receipts.';
  } else if (selection.shellWindowCluster && safeArray(selection.runIds).length === 0 && safeArray(selection.pids).length === 0) {
    status = 'blocked';
    blockReason = 'Shell window custody cluster has no eligible child runs.';
  } else if (!selection.shellWindowCluster && !selection.runId && !selection.pid) {
    status = 'blocked';
    blockReason = 'Safe custody execution requires a run id or pid.';
  }

  return {
    status,
    canExecute: status === 'ready',
    blockReason,
    allowedSafeCustodyActions: [...SAFE_CUSTODY_ACTIONS],
    ambiguousActionsBlocked: [...AMBIGUOUS_ACTIONS],
    blockedActions,
    destructiveActionsTaken: false,
    terminationAllowed: false,
    mutationAllowed: false,
    rawCommandsIncluded: false,
    directShellCommandAllowed: false,
  };
}

function executeSingleCustodyAction(args, selection, reasonOverride = '') {
  const childArgs = [
    path.join('scripts', 'holoshell-run-custody-actions.mjs'),
    '--action', selection.action,
    '--lane-id', args.laneId,
    '--agent-kind', args.agentKind,
    '--reason', reasonOverride || selection.reason,
    '--minutes', String(args.minutes),
    '--hardware-reality', args.hardwareReality,
    '--store', args.store,
    '--output', args.custodyOutput,
    '--js-output', args.custodyJsOutput,
  ];
  if (selection.runId) childArgs.push('--run-id', selection.runId);
  else childArgs.push('--pid', String(selection.pid));

  const result = spawnSync(process.execPath, childArgs, {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    windowsHide: true,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const detail = (result.stderr || result.stdout || '').trim();
    throw new Error(`run custody adapter failed${detail ? `: ${detail}` : ''}`);
  }

  const updatedCustody = loadRequiredJson(args.custodyOutput, 'updated run custody');
  return {
    updatedCustody,
    execution: {
      attempted: true,
      status: 'executed',
      adapter: 'scripts/holoshell-run-custody-actions.mjs',
      receiptId: updatedCustody.latestAction?.receiptId || null,
      custodyHash: updatedCustody.receipt?.custodyHash || null,
      destructiveActionsTaken: false,
      terminationPerformed: false,
      mutationPerformed: false,
      rawCommandsIncluded: false,
    },
  };
}

function executeCustodyAction(args, selection) {
  if (!selection.shellWindowCluster) {
    const executed = executeSingleCustodyAction(args, selection);
    executed.execution.receiptIds = executed.execution.receiptId ? [executed.execution.receiptId] : [];
    return executed;
  }

  const runIds = safeArray(selection.runIds);
  const pids = safeArray(selection.pids);
  const executions = [];
  const childCount = Math.max(runIds.length, pids.length);

  for (let index = 0; index < childCount; index += 1) {
    const runId = runIds[index] || '';
    const pid = Number.isInteger(pids[index]) ? pids[index] : null;
    if (!runId && !pid) continue;
    const childSelection = {
      ...selection,
      runId,
      pid,
      shellWindowCluster: false,
    };
    const childReason = `${selection.reason} Child run ${runId || `pid-${pid}`}.`;
    executions.push(executeSingleCustodyAction(args, childSelection, childReason).execution);
  }

  const updatedCustody = loadRequiredJson(args.custodyOutput, 'updated run custody');
  const latest = executions.at(-1) || null;
  return {
    updatedCustody,
    execution: {
      attempted: true,
      status: executions.length > 0 ? 'executed' : 'blocked',
      adapter: 'scripts/holoshell-run-custody-actions.mjs',
      receiptId: latest?.receiptId || null,
      receiptIds: executions.map((execution) => execution.receiptId).filter(Boolean),
      custodyHash: updatedCustody.receipt?.custodyHash || null,
      childExecutionCount: executions.length,
      windowGroupId: selection.windowGroupId || null,
      windowIds: selection.windowIds || [],
      runCount: executions.length,
      childExecutions: executions.map((execution) => ({
        status: execution.status,
        receiptId: execution.receiptId,
        custodyHash: execution.custodyHash,
      })),
      destructiveActionsTaken: false,
      terminationPerformed: false,
      mutationPerformed: false,
      rawCommandsIncluded: false,
    },
  };
}

function createResult({ args, brief, selection, gate, execution, updatedCustody }) {
  const shellWindowQueue = shellWindowQueueFromBrief(brief, { maxRuns: args.maxRuns });
  const status = execution.status === 'executed'
    ? 'executed'
    : execution.status === 'dry_run'
      ? 'dry_run'
      : gate.status === 'no_action'
        ? 'no_action'
        : 'blocked';
  const actionSummary = {
    mode: selection.mode,
    source: selection.source,
    priority: selection.priority,
    raw: selection.raw,
    action: selection.action || null,
    runId: selection.runId || null,
    pid: selection.pid || null,
    reason: selection.reason || null,
    ambiguous: selection.ambiguous,
    shellWindowCluster: Boolean(selection.shellWindowCluster),
    queueId: selection.queueId || null,
    windowGroupId: selection.windowGroupId || null,
    windowIds: selection.windowIds || [],
    windowPid: selection.windowPid || null,
    windowCount: selection.windowCount || 0,
    runIds: selection.runIds || [],
    pids: selection.pids || [],
    runCount: selection.runCount || 0,
    ownerUnknownRunCount: selection.ownerUnknownRunCount || 0,
    listeningRunCount: selection.listeningRunCount || 0,
    laneIds: selection.laneIds || [],
    bindingEvidence: selection.bindingEvidence || [],
  };
  const custodySummary = updatedCustody?.summary || null;
  const latestAction = updatedCustody?.latestAction || null;
  const result = {
    schemaVersion: SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    sourceAnchors: {
      source: 'apps/holoshell/source/holoshell-brittney-custody-operator.hsplus',
      adapter: 'scripts/holoshell-brittney-custody-operator.mjs',
      operatorBrief: 'scripts/holoshell-operator-brief.mjs',
      runCustody: 'scripts/holoshell-run-custody-actions.mjs',
    },
    status,
    operatorBrief: {
      status: brief.status || 'unknown',
      generatedAt: brief.generatedAt || null,
      firstMove: selection.raw || null,
      briefHash: briefHash(brief),
    },
    selectedAction: actionSummary,
    shellWindowQueue: {
      count: shellWindowQueue.length,
      maxRuns: args.maxRuns,
      entries: shellWindowQueue.slice(0, 12),
    },
    gate,
    execution,
    updatedCustody: custodySummary ? {
      summary: custodySummary,
      latestAction: latestAction ? {
        receiptId: latestAction.receiptId,
        action: latestAction.action,
        status: latestAction.status,
        runId: latestAction.runId,
        pid: latestAction.pid,
        laneId: latestAction.laneId,
        destructiveActionsTaken: latestAction.destructiveActionsTaken,
        terminationPerformed: latestAction.terminationPerformed,
        mutationPerformed: latestAction.mutationPerformed,
        rawCommandHidden: latestAction.rawCommandHidden,
      } : null,
      custodyHash: updatedCustody.receipt?.custodyHash || null,
    } : null,
    agentConsumption: {
      rest: args.output,
      browserBootstrap: args.jsOutput,
      requiredRefreshOrder: [
        'pnpm run holoshell:hardware-reality',
        'pnpm run holoshell:legacy-windows',
        'pnpm run holoshell:run-custody',
        'pnpm run holoshell:legacy-apps',
        'pnpm run holoshell:operator-brief',
        'pnpm run holoshell:brittney-custody',
        'pnpm run holoshell:run-custody',
        'pnpm run holoshell:operator-brief',
      ],
    },
  };
  return {
    ...result,
    receipt: {
      actionHash: sha256(JSON.stringify({
        status,
        briefHash: result.operatorBrief.briefHash,
        selectedAction: actionSummary,
        custodyHash: result.updatedCustody?.custodyHash || null,
      })),
      destructiveActionsTaken: false,
      terminationPerformed: false,
      mutationPerformed: false,
      rawCommandsIncluded: false,
    },
  };
}

function syntheticHardwareReality() {
  return {
    schemaVersion: 'hololand.holoshell.hardware-reality-bridge.v0.1.0',
    generatedAt: '2026-05-14T00:00:00.000Z',
    summary: {
      riskState: 'warn',
      processCount: 3,
      shellRunCount: 2,
      listenerCount: 1,
      laneCount: 2,
      activeLaneCount: 2,
      legacyAppCount: 1,
      terminationPreflightCount: 3,
    },
    safety: {
      destructiveActionsTaken: false,
      preflightRequiredForTermination: true,
    },
    shellRuns: [
      {
        runId: 'pid-202',
        pid: 202,
        parentPid: 909,
        processName: 'node.exe',
        healthState: 'listening',
        listeningPorts: [4747],
        commandHash: 'fixture-node-command',
        rawCommandHidden: true,
      },
      {
        runId: 'pid-404',
        pid: 404,
        parentPid: 909,
        processName: 'ollama.exe',
        healthState: 'observed',
        listeningPorts: [],
        commandHash: 'fixture-ollama-command',
        rawCommandHidden: true,
      },
    ],
    receipt: {
      snapshotHash: 'brittney-custody-fixture-hardware',
      destructiveActionsTaken: false,
      rawCommandsIncluded: false,
    },
  };
}

function syntheticOperatorBrief() {
  return {
    schemaVersion: 'hololand.holoshell.operator-brief.v0.1.0',
    generatedAt: '2026-05-14T00:00:00.000Z',
    status: 'needs_run_custody',
    runs: {
      observedRunCount: 2,
      claimedRunCount: 0,
      ownerUnknownCount: 2,
      staleRunCount: 0,
      closedRunCount: 0,
      custodyHash: 'custody-fixture',
    },
    legacy: {
      captureCandidateCount: 0,
      preflightRequiredCount: 0,
    },
    shellCustody: {
      status: 'needs_custody',
      shellWindowCount: 1,
      boundShellWindowCount: 1,
      ownerUnknownRunCount: 1,
      windows: [
        {
          windowId: 'fixture-terminal-window',
          title: 'Terminal',
          pid: 909,
          status: 'needs_custody',
          bindingEvidence: 'window_pid_to_run_parent_pid',
          boundRunCount: 2,
          ownerUnknownRunCount: 1,
          laneIds: ['service-node', 'service-ollama'],
          runs: [
            {
              runId: 'pid-202',
              pid: 202,
              parentPid: 909,
              processName: 'node.exe',
              status: 'owner_unknown',
              laneId: 'service-node',
              laneLabel: 'Node service',
              listeningPorts: [4747],
              rawCommandHidden: true,
            },
            {
              runId: 'pid-404',
              pid: 404,
              parentPid: 909,
              processName: 'ollama.exe',
              status: 'lane_observed',
              laneId: 'service-ollama',
              laneLabel: 'Ollama service',
              listeningPorts: [],
              rawCommandHidden: true,
            },
          ],
        },
      ],
    },
    allowedActions: ['observe_hardware', 'claim_run', 'extend_run', 'close_run_receipt'],
    blockedActions: [...ALWAYS_BLOCKED],
    nextActions: [
      {
        source: 'run_custody',
        priority: 'high',
        action: 'claim pid-202: Self-test safe claim.',
      },
    ],
    brittneyPromptCard: {
      role: 'local_hardware_operator',
      firstMove: 'claim pid-202: Self-test safe claim.',
      mustNot: [...ALWAYS_BLOCKED],
    },
    safety: {
      destructiveActionsTaken: false,
      rawCommandsIncluded: false,
      preflightRequiredForTermination: true,
    },
    receipt: {
      briefHash: 'brittney-custody-fixture-brief',
      destructiveActionsTaken: false,
      rawCommandsIncluded: false,
    },
  };
}

function emptyStore() {
  return {
    schemaVersion: 'hololand.holoshell.run-custody-store.v0.1.0',
    generatedAt: '2026-05-14T00:00:00.000Z',
    updatedAt: '2026-05-14T00:00:00.000Z',
    receipts: [],
  };
}

function prepareSelfTest(args) {
  const prefix = path.join('.tmp', 'holoshell', 'brittney-custody-self-test');
  const testArgs = {
    ...args,
    action: 'auto',
    runId: '',
    pid: null,
    reason: '',
    dryRun: false,
    operatorBrief: `${prefix}-operator-brief.json`,
    hardwareReality: `${prefix}-hardware-reality.json`,
    store: `${prefix}-store.json`,
    custodyOutput: `${prefix}-run-custody.json`,
    custodyJsOutput: `${prefix}-run-custody.js`,
    output: args.output === DEFAULT_OUTPUT ? `${prefix}-action.json` : args.output,
    jsOutput: args.jsOutput === DEFAULT_JS_OUTPUT ? `${prefix}-action.js` : args.jsOutput,
  };
  writeJson(testArgs.operatorBrief, syntheticOperatorBrief());
  writeJson(testArgs.hardwareReality, syntheticHardwareReality());
  writeJson(testArgs.store, emptyStore());
  return testArgs;
}

function assertSelfTest(result) {
  const failures = [];
  if (result.schemaVersion !== SCHEMA_VERSION) failures.push('schemaVersion mismatch');
  if (result.status !== 'executed') failures.push('expected executed status');
  if (result.selectedAction?.action !== 'claim') failures.push('expected claim action');
  if (result.selectedAction?.pid !== 202) failures.push('expected pid 202');
  if (result.selectedAction?.windowGroupId !== 'shell-window-pid-909') failures.push('expected shell window group selection');
  if (result.selectedAction?.runCount !== 1) failures.push('expected one shell-window child run claim');
  if (!result.execution?.receiptIds?.length) failures.push('expected child custody receipt id');
  if (!result.gate?.blockedActions?.includes('kill_process')) failures.push('kill_process must stay blocked');
  if (result.execution?.destructiveActionsTaken !== false) failures.push('execution must be non-destructive');
  if (result.execution?.terminationPerformed !== false) failures.push('execution must not terminate');
  if (result.execution?.rawCommandsIncluded !== false) failures.push('raw commands must stay hidden');
  if ((result.updatedCustody?.summary?.claimedRunCount || 0) < 1) failures.push('expected claimed custody summary');
  if (result.updatedCustody?.latestAction?.terminationPerformed !== false) failures.push('latest action must not terminate');
  if (result.receipt?.rawCommandsIncluded !== false) failures.push('receipt must hide raw commands');
  const serialized = JSON.stringify(result);
  if (/commandLine|CommandLine|command_summary|taskkill|Stop-Process|Remove-Item/.test(serialized)) {
    failures.push('raw or destructive command text leaked');
  }
  if (failures.length) {
    throw new Error(`Self-test failed:\n- ${failures.join('\n- ')}`);
  }
}

function main() {
  let args = parseArgs(process.argv.slice(2));
  if (args.selfTest) args = prepareSelfTest(args);

  const brief = loadRequiredJson(args.operatorBrief, 'operator brief');
  const selection = selectAction(args, brief);
  const gate = buildGate(selection, brief);
  let updatedCustody = loadOptionalJson(args.custodyOutput);
  let execution = {
    attempted: false,
    status: gate.status,
    adapter: 'scripts/holoshell-run-custody-actions.mjs',
    receiptId: null,
    receiptIds: [],
    custodyHash: updatedCustody?.receipt?.custodyHash || null,
    blockReason: gate.blockReason,
    destructiveActionsTaken: false,
    terminationPerformed: false,
    mutationPerformed: false,
    rawCommandsIncluded: false,
  };

  if (gate.canExecute && args.dryRun) {
    execution = {
      ...execution,
      status: 'dry_run',
      blockReason: '',
    };
  } else if (gate.canExecute) {
    const executed = executeCustodyAction(args, selection);
    updatedCustody = executed.updatedCustody;
    execution = executed.execution;
  }

  const result = createResult({ args, brief, selection, gate, execution, updatedCustody });
  if (args.selfTest) assertSelfTest(result);
  const output = writeJson(args.output, result);
  const jsOutput = writeBrowserBootstrap(args.jsOutput, result);

  if (args.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`HoloShell Brittney custody action: ${output}`);
    console.log(`HoloShell Brittney custody browser bootstrap: ${jsOutput}`);
    console.log(`Status: ${result.status}`);
    console.log(`Action: ${result.selectedAction.action || 'none'}`);
    console.log(`Run: ${result.selectedAction.windowGroupId || result.selectedAction.runId || result.selectedAction.pid || 'none'}`);
    console.log(`Child receipts: ${result.execution.receiptIds?.length || 0}`);
    console.log(`Receipt: ${result.execution.receiptId || 'none'}`);
    console.log(`Blocked reason: ${result.gate.blockReason || 'none'}`);
    console.log(`Destructive actions: ${result.execution.destructiveActionsTaken}`);
  }
}

try {
  main();
} catch (error) {
  console.error(`holoshell-brittney-custody-operator failed: ${error.message}`);
  process.exit(1);
}
