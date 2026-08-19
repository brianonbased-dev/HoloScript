#!/usr/bin/env node
/**
 * HoloShell conversation-plan dispatcher.
 *
 * Consumes Brittney's ready conversation-plan receipt and emits a deterministic
 * dispatch receipt plus a HoloMesh task batch. The default mode is plan-only:
 * it writes receipts but does not mutate the board, claim tasks, start agents,
 * click the desktop, or claim completion.
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const CONVERSATION_PLAN_DISPATCH_SCHEMA = 'hololand.holoshell.conversation-plan-dispatch.v0.1.0';
export const CONVERSATION_PLAN_SCHEMA = 'hololand.holoshell.conversation-plan.v0.1.0';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_TMP = path.join('.tmp', 'holoshell');
const DEFAULT_PLAN = path.join(DEFAULT_TMP, 'brittney-conversation-plan-latest.json');
const DEFAULT_OUTPUT = path.join(DEFAULT_TMP, 'conversation-plan-dispatch-latest.json');
const DEFAULT_JS_OUTPUT = path.join(DEFAULT_TMP, 'conversation-plan-dispatch-latest.js');
const DEFAULT_DISPATCH_DIR = path.join(DEFAULT_TMP, 'conversation-plan-dispatches');
const DEFAULT_ROOM_TASK_OUTPUT = path.join(DEFAULT_TMP, 'conversation-plan-room-tasks-latest.json');

const SOURCE_REF = 'apps/holoshell/source/holoshell-conversation-plan-dispatcher.hsplus';
const BRITTNEY_RUNTIME_SOURCE_REF = 'apps/holoshell/source/holoshell-brittney-runtime-bridge.hsplus';
const BRITTNEY_TURN_SCRIPT_REF = 'scripts/holoshell-brittney-turn.mjs';
const DISPATCHER_SCRIPT_REF = 'scripts/holoshell-conversation-plan-dispatcher.mjs';
const AGENT_DISPATCH_SOURCE_REF = 'apps/holoshell/source/holoshell-agent-dispatch.hsplus';
const AGENT_DISPATCH_SCRIPT_REF = 'scripts/holoshell-agent-dispatch.mjs';
const LAPTOP_REASONING_WORKER_REF = 'scripts/holoshell-laptop-reasoning-worker.mjs';
const METAL_AGENT_REF = 'C:/Users/josep/.ai-ecosystem/scripts/metal-agent.mjs';
const ROOM_ADD_TASKS_REF = 'C:/Users/josep/.ai-ecosystem/scripts/room-add-tasks.mjs';
const ROOM_PATCH_TASK_REF = 'C:/Users/josep/.ai-ecosystem/scripts/room-patch-task.mjs';
const SIGNED_HEARTBEAT_REF = 'C:/Users/josep/.ai-ecosystem/scripts/signed-heartbeat.mjs';
const FLEET_MAP_REF = 'C:/Users/josep/.ai-ecosystem/FLEET_MAP.holo';
const HARDWARE_NORTH_STAR_REF = 'C:/Users/josep/.ai-ecosystem/NORTH_STAR_HARDWARE.md';
const HOLOSCRIPT_SOURCE_CONTRACT_REF = 'docs/HOLOSCRIPT_SOURCE_CONTRACT.md';

function usage() {
  return `HoloShell conversation-plan dispatcher

Usage:
  node scripts/holoshell-conversation-plan-dispatcher.mjs --plan .tmp/holoshell/brittney-conversation-plan-latest.json --json

Options:
  --plan <path>                 Ready conversation-plan receipt
  --output <path>               Latest dispatch receipt path
  --js-output <path>            Browser bootstrap path
  --dispatch-dir <path>         Archived dispatch receipt directory
  --room-task-output <path>     HoloMesh task batch JSON path
  --execute-room-tasks          File generated tasks through room-add-tasks helper
  --dry-run-room-tasks          Call room-add-tasks with --dry-run after writing the batch
  --execute-claim               Claim --claim-task-id through signed room helper
  --claim-task-id <task_id>     Existing HoloMesh task to claim when --execute-claim is set
  --created-at <iso>            Stable timestamp for tests
  --self-test                   Run a deterministic fixture plan
  --json                        Print the dispatch receipt
`;
}

export function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    plan: DEFAULT_PLAN,
    output: DEFAULT_OUTPUT,
    jsOutput: DEFAULT_JS_OUTPUT,
    dispatchDir: DEFAULT_DISPATCH_DIR,
    roomTaskOutput: DEFAULT_ROOM_TASK_OUTPUT,
    executeRoomTasks: false,
    dryRunRoomTasks: false,
    executeClaim: false,
    claimTaskId: '',
    createdAt: '',
    selfTest: false,
    json: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--') continue;
    if (arg === '--plan') args.plan = argv[++index] || args.plan;
    else if (arg === '--output') args.output = argv[++index] || args.output;
    else if (arg === '--js-output') args.jsOutput = argv[++index] || args.jsOutput;
    else if (arg === '--dispatch-dir') args.dispatchDir = argv[++index] || args.dispatchDir;
    else if (arg === '--room-task-output') args.roomTaskOutput = argv[++index] || args.roomTaskOutput;
    else if (arg === '--execute-room-tasks') args.executeRoomTasks = true;
    else if (arg === '--dry-run-room-tasks') args.dryRunRoomTasks = true;
    else if (arg === '--execute-claim') args.executeClaim = true;
    else if (arg === '--claim-task-id') args.claimTaskId = argv[++index] || '';
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

  if (args.executeRoomTasks && args.dryRunRoomTasks) {
    throw new Error('--execute-room-tasks and --dry-run-room-tasks are mutually exclusive');
  }
  if (args.executeClaim && !args.claimTaskId) {
    throw new Error('--execute-claim requires --claim-task-id');
  }
  if (args.selfTest) {
    args.output = path.join(DEFAULT_TMP, 'self-test', 'conversation-plan-dispatch-latest.json');
    args.jsOutput = path.join(DEFAULT_TMP, 'self-test', 'conversation-plan-dispatch-latest.js');
    args.dispatchDir = path.join(DEFAULT_TMP, 'self-test', 'conversation-plan-dispatches');
    args.roomTaskOutput = path.join(DEFAULT_TMP, 'self-test', 'conversation-plan-room-tasks-latest.json');
  }
  return args;
}

function resolveRepoPath(filePath) {
  return path.isAbsolute(filePath) ? filePath : path.resolve(REPO_ROOT, filePath);
}

function normalizePath(filePath) {
  return String(filePath || '').replace(/\\/g, '/');
}

function repoRelative(filePath) {
  const resolved = resolveRepoPath(filePath);
  const relative = path.relative(REPO_ROOT, resolved);
  return relative.startsWith('..') ? normalizePath(resolved) : normalizePath(relative);
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function hashValue(value) {
  return createHash('sha256').update(stableStringify(value), 'utf8').digest('hex');
}

function stableId(prefix, value) {
  return `${prefix}_${hashValue(value).slice(0, 12)}`;
}

function truncate(value, max = 240) {
  const text = String(value || '').replace(/\s+/gu, ' ').trim();
  return text.length <= max ? text : `${text.slice(0, max - 3)}...`;
}

function readJson(filePath) {
  const resolved = resolveRepoPath(filePath);
  if (!existsSync(resolved)) throw new Error(`conversation plan receipt not found: ${resolved}`);
  return JSON.parse(readFileSync(resolved, 'utf8'));
}

function writeJson(filePath, value) {
  const resolved = resolveRepoPath(filePath);
  mkdirSync(path.dirname(resolved), { recursive: true });
  writeFileSync(resolved, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  return resolved;
}

function writeBrowserBootstrap(filePath, receipt) {
  const resolved = resolveRepoPath(filePath);
  mkdirSync(path.dirname(resolved), { recursive: true });
  const payload = JSON.stringify(receipt, null, 2).replace(/<\/script/giu, '<\\/script');
  writeFileSync(resolved, `window.HOLOSHELL_CONVERSATION_PLAN_DISPATCH = ${payload};\n`, 'utf8');
  return resolved;
}

function helperPath(ref) {
  if (ref.startsWith('C:/Users/josep/.ai-ecosystem/')) {
    return path.join(os.homedir(), '.ai-ecosystem', ref.slice('C:/Users/josep/.ai-ecosystem/'.length));
  }
  return ref;
}

function validatePlan(plan = {}) {
  const checks = [
    ['schema', plan.schemaVersion === CONVERSATION_PLAN_SCHEMA],
    ['plan_status', plan.status === 'ready_to_dispatch' && plan.summary?.status === 'ready_to_dispatch'],
    ['dispatch_ready', plan.summary?.dispatchReady === true],
    ['dispatch_operation', plan.summary?.dispatchOperation === 'dispatch_conversation_plan'],
    ['explicit_commence_all', plan.trigger?.commenceAll === true],
    ['permission_envelope', plan.summary?.permissionEnvelope === 'read_only'],
    ['receipt_required', plan.summary?.receiptRequired === true],
    ['destructive_actions', plan.summary?.destructiveActionsTaken === false],
    ['desktop_automation', plan.summary?.desktopAutomationExecuted === false],
    ['model_role', plan.dispatchBoundary?.modelRole === 'voice_and_context_only'],
    ['dispatcher_role', plan.dispatchBoundary?.dispatcherRole === 'receipt_backed_router'],
    ['completion_claims', plan.dispatchBoundary?.completionClaimAllowed === false],
    ['turn_count', Number(plan.summary?.turnCount || 0) >= 2],
  ].map(([id, ok]) => ({ id, ok: Boolean(ok) }));
  const failedChecks = checks.filter((check) => !check.ok);
  return {
    status: failedChecks.length ? 'failed' : 'passed',
    checks,
    failedChecks,
  };
}

function signalSet(plan) {
  return new Set((plan.summary?.signals || []).map((signal) => String(signal || '').trim()).filter(Boolean));
}

function dispatchTargetsFor(plan, validation) {
  if (validation.status !== 'passed') return [];
  const signals = signalSet(plan);
  const targets = [
    {
      id: 'holomesh_room',
      lane: 'room',
      executor: ROOM_ADD_TASKS_REF,
      operation: 'file_conversation_plan_tasks',
      permissionEnvelope: 'guarded_room_mutation',
      mayExecuteByDefault: false,
      requiresExplicitFlag: true,
      receiptRequired: true,
      reason: 'The plan must become visible HoloMesh work instead of remaining Brittney voice context.',
    },
    {
      id: 'receipt_gate',
      lane: 'proof',
      executor: DISPATCHER_SCRIPT_REF,
      operation: 'collect_downstream_receipts',
      permissionEnvelope: 'read_only',
      mayExecuteByDefault: false,
      receiptRequired: true,
      reason: 'Completion claims stay blocked until downstream task or local-agent receipts return.',
    },
  ];

  if (signals.has('native_holoscript')) {
    targets.push({
      id: 'holoscript_source_gate',
      lane: 'native-source',
      executor: 'scripts/holoshell-source-validation.mjs',
      operation: 'validate_native_holoscript_sources',
      permissionEnvelope: 'read_only',
      mayExecuteByDefault: false,
      receiptRequired: true,
      sourceContract: HOLOSCRIPT_SOURCE_CONTRACT_REF,
      reason: 'The plan names native HoloScript gates; source validation must precede product-surface claims.',
    });
  }

  if (signals.has('local_fleet')) {
    targets.push({
      id: 'owned_metal_fleet',
      lane: 'owned-metal',
      executor: METAL_AGENT_REF,
      operation: 'route_to_jetson_or_laptop_agent',
      permissionEnvelope: 'read_only',
      mayExecuteByDefault: false,
      receiptRequired: true,
      sourceAnchors: [FLEET_MAP_REF, HARDWARE_NORTH_STAR_REF],
      reason: 'The plan mentions Jetson, laptop, or owned fleet; local metal receives bounded work before provider-cloud seats.',
    });
  }

  if (signals.has('orchestration')) {
    targets.push({
      id: 'local_agent_router',
      lane: 'agent-dispatch',
      executor: AGENT_DISPATCH_SCRIPT_REF,
      operation: 'route_bounded_agent_work',
      permissionEnvelope: 'read_only',
      mayExecuteByDefault: false,
      receiptRequired: true,
      sourceAnchors: [AGENT_DISPATCH_SOURCE_REF, LAPTOP_REASONING_WORKER_REF],
      reason: 'The plan is about dispatcher/orchestrator follow-through, not Brittney acting as an internal model.',
    });
  }

  if (signals.has('anti_theatre')) {
    targets.push({
      id: 'anti_theatre_gate',
      lane: 'evidence',
      executor: DISPATCHER_SCRIPT_REF,
      operation: 'refuse_completion_without_receipts',
      permissionEnvelope: 'read_only',
      mayExecuteByDefault: false,
      receiptRequired: true,
      reason: 'The plan explicitly rejects theatrical claims and requires receipts.',
    });
  }

  if (signals.has('planning')) {
    targets.push({
      id: 'plan_review_gate',
      lane: 'planning',
      executor: DISPATCHER_SCRIPT_REF,
      operation: 'preserve_question_and_planning_context',
      permissionEnvelope: 'read_only',
      mayExecuteByDefault: false,
      receiptRequired: true,
      reason: 'The prior planning turns are carried forward as context for cold agents.',
    });
  }

  return targets;
}

function roomTasksFor(plan, targets) {
  const planId = plan.planId || 'conversation_plan_unknown';
  const signals = (plan.summary?.signals || []).join(', ') || 'none';
  const sourceTurnIds = (plan.turns || []).map((turn) => turn.turnId).filter(Boolean);
  const promptPreview = truncate(plan.trigger?.promptPreview || '');
  const sharedContext = [
    `Plan id: ${planId}`,
    `Signals: ${signals}`,
    `Commence all: ${Boolean(plan.trigger?.commenceAll)}`,
    `Source turns: ${sourceTurnIds.join(', ') || 'turn receipts in plan packet'}`,
    `Prompt preview: ${promptPreview}`,
    'Completion rule: do not claim completion until downstream receipts are attached.',
  ].join('\n');

  const tasks = [
    {
      title: `[conversation-plan][native] Execute ${planId} through HoloScript gates`,
      description: `${sharedContext}\n\nRead ${SOURCE_REF}, ${BRITTNEY_RUNTIME_SOURCE_REF}, and ${HOLOSCRIPT_SOURCE_CONTRACT_REF}. Execute the native source validation or record the exact blocker. Do not create UI/R3F theatre while this is open.`,
      priority: 2,
      role: 'mesh',
      source: 'holoshell-conversation-plan-dispatcher',
    },
    {
      title: `[conversation-plan][owned-metal] Route ${planId} to local agents`,
      description: `${sharedContext}\n\nUse Jetson/laptop/fleet lanes first. Route bounded local work with receipt expectations; provider-cloud families are review/burst capacity only and cannot become proof of local execution.`,
      priority: 2,
      role: 'mesh',
      source: 'holoshell-conversation-plan-dispatcher',
    },
    {
      title: `[conversation-plan][receipts] Collect downstream receipts for ${planId}`,
      description: `${sharedContext}\n\nRequired targets: ${targets.map((target) => target.id).join(', ')}. Close only after task, source-validation, local-agent, or explicit blocked receipts exist.`,
      priority: 3,
      role: 'mesh',
      source: 'holoshell-conversation-plan-dispatcher',
    },
  ];

  return { tasks };
}

function runHelper(command, args, cwd) {
  const result = spawnSync(process.execPath, [command, ...args], {
    cwd,
    encoding: 'utf8',
    windowsHide: true,
    maxBuffer: 16 * 1024 * 1024,
  });
  return {
    exitCode: result.status,
    ok: result.status === 0,
    stdout: truncate(result.stdout, 4000),
    stderr: truncate(result.stderr, 4000),
  };
}

function runRoomTaskHelper(args, taskBatchPath, validation) {
  if (validation.status !== 'passed') {
    return {
      status: 'not_requested',
      requested: false,
      mutationMode: 'blocked_invalid_plan',
      helper: ROOM_ADD_TASKS_REF,
      mutationExecuted: false,
    };
  }
  if (!args.executeRoomTasks && !args.dryRunRoomTasks) {
    return {
      status: 'not_requested',
      requested: false,
      mutationMode: 'plan_only',
      helper: ROOM_ADD_TASKS_REF,
      mutationExecuted: false,
    };
  }
  const helper = helperPath(ROOM_ADD_TASKS_REF);
  if (!existsSync(helper)) {
    return {
      status: 'blocked',
      requested: true,
      mutationMode: args.dryRunRoomTasks ? 'dry_run' : 'execute_room_tasks',
      helper: ROOM_ADD_TASKS_REF,
      resolvedHelper: normalizePath(helper),
      mutationExecuted: false,
      error: 'room-add-tasks helper not found',
    };
  }
  const helperArgs = [taskBatchPath];
  if (args.dryRunRoomTasks) helperArgs.push('--dry-run');
  const result = runHelper(helper, helperArgs, path.join(os.homedir(), '.ai-ecosystem'));
  return {
    status: result.ok
      ? (args.dryRunRoomTasks ? 'dry_run_passed' : 'room_tasks_filed')
      : 'blocked',
    requested: true,
    mutationMode: args.dryRunRoomTasks ? 'dry_run' : 'execute_room_tasks',
    helper: ROOM_ADD_TASKS_REF,
    resolvedHelper: normalizePath(helper),
    mutationExecuted: args.executeRoomTasks && result.ok,
    result,
  };
}

function runClaimHelper(args, validation) {
  if (validation.status !== 'passed' || !args.executeClaim) {
    return {
      status: 'not_requested',
      requested: false,
      helper: ROOM_PATCH_TASK_REF,
      mutationExecuted: false,
    };
  }
  const heartbeat = helperPath(SIGNED_HEARTBEAT_REF);
  const patch = helperPath(ROOM_PATCH_TASK_REF);
  if (!existsSync(heartbeat) || !existsSync(patch)) {
    return {
      status: 'blocked',
      requested: true,
      helper: ROOM_PATCH_TASK_REF,
      mutationExecuted: false,
      error: 'room claim helpers not found',
      resolvedHeartbeat: normalizePath(heartbeat),
      resolvedPatch: normalizePath(patch),
    };
  }
  const cwd = path.join(os.homedir(), '.ai-ecosystem');
  const heartbeatResult = runHelper(heartbeat, [], cwd);
  if (!heartbeatResult.ok) {
    return {
      status: 'blocked',
      requested: true,
      helper: ROOM_PATCH_TASK_REF,
      mutationExecuted: false,
      heartbeat: heartbeatResult,
    };
  }
  const claimResult = runHelper(patch, ['claim', args.claimTaskId], cwd);
  return {
    status: claimResult.ok ? 'task_claimed' : 'blocked',
    requested: true,
    helper: ROOM_PATCH_TASK_REF,
    taskId: args.claimTaskId,
    mutationExecuted: claimResult.ok,
    heartbeat: heartbeatResult,
    result: claimResult,
  };
}

function statusFor({ validation, roomExecution, claimExecution }) {
  if (validation.status !== 'passed') return 'blocked_invalid_plan';
  if (claimExecution.mutationExecuted) return 'room_task_claimed';
  if (roomExecution.mutationExecuted) return 'room_tasks_filed';
  if (roomExecution.status === 'dry_run_passed') return 'room_task_dry_run';
  return 'ready_to_route';
}

export function buildDispatchReceipt(plan, args = {}) {
  const generatedAt = args.createdAt || new Date().toISOString();
  const validation = validatePlan(plan);
  const targets = dispatchTargetsFor(plan, validation);
  const roomTaskBatch = roomTasksFor(plan, targets);
  const dispatchId = stableId('conversation_plan_dispatch', {
    planId: plan.planId,
    generatedAt,
    targetIds: targets.map((target) => target.id),
    executeRoomTasks: args.executeRoomTasks,
    dryRunRoomTasks: args.dryRunRoomTasks,
    executeClaim: args.executeClaim,
    claimTaskId: args.claimTaskId,
  });
  const roomTaskBatchPath = writeJson(args.roomTaskOutput || DEFAULT_ROOM_TASK_OUTPUT, roomTaskBatch);
  const roomExecution = runRoomTaskHelper(args, roomTaskBatchPath, validation);
  const claimExecution = runClaimHelper(args, validation);
  const status = statusFor({ validation, roomExecution, claimExecution });
  const mutationExecuted = Boolean(roomExecution.mutationExecuted || claimExecution.mutationExecuted);

  return {
    schemaVersion: CONVERSATION_PLAN_DISPATCH_SCHEMA,
    dispatchId,
    generatedAt,
    actor: 'holoshell-conversation-plan-dispatcher',
    status,
    sourceAnchors: {
      source: SOURCE_REF,
      brittneyRuntimeBridge: BRITTNEY_RUNTIME_SOURCE_REF,
      brittneyTurnScript: BRITTNEY_TURN_SCRIPT_REF,
      dispatcherScript: DISPATCHER_SCRIPT_REF,
      agentDispatchSource: AGENT_DISPATCH_SOURCE_REF,
      agentDispatchScript: AGENT_DISPATCH_SCRIPT_REF,
      laptopReasoningWorker: LAPTOP_REASONING_WORKER_REF,
      metalAgent: METAL_AGENT_REF,
      roomAddTasks: ROOM_ADD_TASKS_REF,
      roomPatchTask: ROOM_PATCH_TASK_REF,
      signedHeartbeat: SIGNED_HEARTBEAT_REF,
      fleetMap: FLEET_MAP_REF,
      hardwareNorthStar: HARDWARE_NORTH_STAR_REF,
      holoscriptSourceContract: HOLOSCRIPT_SOURCE_CONTRACT_REF,
    },
    inputPlan: {
      planId: plan.planId || '',
      schemaVersion: plan.schemaVersion || '',
      status: plan.status || '',
      planPath: repoRelative(args.plan || DEFAULT_PLAN),
      generatedAt: plan.generatedAt || '',
      promptPreview: truncate(plan.trigger?.promptPreview || ''),
      commenceAll: Boolean(plan.trigger?.commenceAll),
      signals: plan.summary?.signals || [],
      turnCount: Number(plan.summary?.turnCount || 0),
      questionTurnCount: Number(plan.summary?.questionTurnCount || 0),
      sourceTurnIds: (plan.turns || []).map((turn) => turn.turnId).filter(Boolean),
    },
    validation: {
      ...validation,
      destructiveActionsTaken: false,
      desktopAutomationExecuted: false,
      completionClaimAllowed: false,
    },
    targets,
    roomTaskBatch: {
      path: normalizePath(roomTaskBatchPath),
      taskCount: roomTaskBatch.tasks.length,
      tasks: roomTaskBatch.tasks,
      helper: ROOM_ADD_TASKS_REF,
      helperVerifiesPersistedIds: true,
      defaultMode: 'write_batch_receipt_only',
    },
    execution: {
      defaultMode: 'plan_only',
      executeRoomTasksRequested: Boolean(args.executeRoomTasks),
      dryRunRoomTasksRequested: Boolean(args.dryRunRoomTasks),
      executeClaimRequested: Boolean(args.executeClaim),
      claimTaskId: args.claimTaskId || '',
      roomExecution,
      claimExecution,
      mutationExecuted,
      destructiveActionsTaken: false,
      desktopAutomationExecuted: false,
    },
    downstreamReceipts: {
      required: true,
      completionClaimAllowed: false,
      expected: [
        'room_task_done_receipt',
        'local_agent_result_receipt',
        'holoscript_source_validation_receipt',
      ],
      missingUntilReturned: true,
    },
    output: {
      latestPath: resolveRepoPath(args.output || DEFAULT_OUTPUT),
      browserBootstrap: resolveRepoPath(args.jsOutput || DEFAULT_JS_OUTPUT),
      archivePath: resolveRepoPath(path.join(args.dispatchDir || DEFAULT_DISPATCH_DIR, `${dispatchId}.json`)),
      roomTaskBatchPath,
    },
    summary: {
      status,
      dispatchId,
      planId: plan.planId || '',
      planValidationStatus: validation.status,
      failedCheckCount: validation.failedChecks.length,
      targetCount: targets.length,
      targetIds: targets.map((target) => target.id),
      roomTaskCount: roomTaskBatch.tasks.length,
      roomTasksFiled: roomExecution.status === 'room_tasks_filed',
      roomTaskClaimed: claimExecution.status === 'task_claimed',
      mutationExecuted,
      destructiveActionsTaken: false,
      desktopAutomationExecuted: false,
      permissionEnvelope: mutationExecuted ? 'guarded_room_mutation' : 'read_only',
      completionClaimAllowed: false,
      downstreamReceiptsRequired: true,
      receiptRequired: true,
    },
  };
}

export function persistDispatchReceipt(receipt, args = {}) {
  const latestPath = writeJson(args.output || DEFAULT_OUTPUT, receipt);
  const jsPath = writeBrowserBootstrap(args.jsOutput || DEFAULT_JS_OUTPUT, receipt);
  const archivePath = writeJson(path.join(args.dispatchDir || DEFAULT_DISPATCH_DIR, `${receipt.dispatchId}.json`), receipt);
  return {
    ...receipt,
    output: {
      ...receipt.output,
      latestPath,
      browserBootstrap: jsPath,
      archivePath,
    },
  };
}

function selfTestPlan(createdAt = '2026-06-29T00:00:00.000Z') {
  const generatedAt = createdAt || '2026-06-29T00:00:00.000Z';
  return {
    schemaVersion: CONVERSATION_PLAN_SCHEMA,
    planId: 'conversation_plan_selftest',
    generatedAt,
    status: 'ready_to_dispatch',
    actor: 'brittney',
    trigger: {
      promptHash: 'sha256:selftest',
      promptPreview: 'commence all',
      commenceAll: true,
      signals: ['anti_theatre'],
    },
    summary: {
      status: 'ready_to_dispatch',
      turnCount: 4,
      questionTurnCount: 1,
      signalCount: 5,
      signals: ['anti_theatre', 'local_fleet', 'native_holoscript', 'orchestration', 'planning'],
      dispatchReady: true,
      dispatchOperation: 'dispatch_conversation_plan',
      permissionEnvelope: 'read_only',
      approvalRequired: false,
      receiptRequired: true,
      destructiveActionsTaken: false,
      desktopAutomationExecuted: false,
    },
    turns: [
      { turnId: 'turn-1', promptHash: 'hash-1', promptPreview: 'plan and ask a question', signals: ['planning'] },
      { turnId: 'turn-2', promptHash: 'hash-2', promptPreview: 'use local fleet and native HoloScript', signals: ['local_fleet', 'native_holoscript'] },
      { turnId: 'turn-3', promptHash: 'hash-3', promptPreview: 'prepare dispatcher proposals', signals: ['orchestration', 'anti_theatre'] },
    ],
    dispatchBoundary: {
      modelRole: 'voice_and_context_only',
      dispatcherRole: 'receipt_backed_router',
      followThroughRequires: [
        'conversation_plan_receipt',
        'explicit_commence_all_turn',
        'downstream_receipts_before_completion_claims',
      ],
      completionClaimAllowed: false,
    },
    output: {
      latestPath: DEFAULT_PLAN,
    },
  };
}

export function runSelfTest(args = {}) {
  const tmpRoot = mkdtempSync(path.join(os.tmpdir(), 'holoshell-conversation-plan-dispatch-'));
  const options = {
    ...args,
    plan: path.join(tmpRoot, 'plan.json'),
    output: path.join(tmpRoot, 'dispatch-latest.json'),
    jsOutput: path.join(tmpRoot, 'dispatch-latest.js'),
    dispatchDir: path.join(tmpRoot, 'dispatches'),
    roomTaskOutput: path.join(tmpRoot, 'room-tasks.json'),
    executeRoomTasks: false,
    dryRunRoomTasks: false,
    executeClaim: false,
    claimTaskId: '',
  };
  const plan = selfTestPlan(args.createdAt);
  writeJson(options.plan, plan);
  const receipt = persistDispatchReceipt(buildDispatchReceipt(plan, options), options);
  const failures = [];
  if (receipt.schemaVersion !== CONVERSATION_PLAN_DISPATCH_SCHEMA) failures.push('schema mismatch');
  if (receipt.summary.status !== 'ready_to_route') failures.push(`unexpected status ${receipt.summary.status}`);
  if (receipt.summary.mutationExecuted !== false) failures.push('self-test must not mutate');
  if (receipt.summary.completionClaimAllowed !== false) failures.push('completion claims must stay blocked');
  if (!receipt.summary.targetIds.includes('holomesh_room')) failures.push('missing room target');
  if (!receipt.summary.targetIds.includes('owned_metal_fleet')) failures.push('missing owned metal target');
  if (!receipt.summary.targetIds.includes('holoscript_source_gate')) failures.push('missing source gate');
  if (!existsSync(receipt.output.latestPath)) failures.push('latest receipt missing');
  if (!existsSync(receipt.output.roomTaskBatchPath)) failures.push('room task batch missing');
  if (failures.length) throw new Error(`self-test failed: ${failures.join(', ')}`);
  return receipt;
}

function isMain() {
  return process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
}

if (isMain()) {
  try {
    const args = parseArgs();
    const receipt = args.selfTest
      ? runSelfTest(args)
      : persistDispatchReceipt(buildDispatchReceipt(readJson(args.plan), args), args);
    if (args.json) {
      console.log(JSON.stringify(receipt, null, 2));
    } else {
      console.log(`HoloShell conversation-plan dispatch: ${receipt.output.latestPath}`);
      console.log(`Status: ${receipt.summary.status}`);
      console.log(`Plan: ${receipt.summary.planId}`);
      console.log(`Targets: ${receipt.summary.targetIds.join(', ') || 'none'}`);
      console.log(`Room tasks: ${receipt.output.roomTaskBatchPath}`);
    }
    process.exit(receipt.validation.status === 'passed' ? 0 : 1);
  } catch (error) {
    console.error(`holoshell-conversation-plan-dispatcher failed: ${error.message}`);
    process.exit(1);
  }
}
