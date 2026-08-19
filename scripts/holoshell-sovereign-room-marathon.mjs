#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');
const AI_ECOSYSTEM_ROOT = process.env.AI_ECOSYSTEM_ROOT || 'C:/Users/josep/.ai-ecosystem';
const SCHEMA_VERSION = 'hololand.holoshell.sovereign-room-marathon.v0.1.0';
const DEFAULT_OUTPUT = '.tmp/holoshell/sovereign-room-marathon-latest.json';
const DEFAULT_JS_OUTPUT = '.tmp/holoshell/sovereign-room-marathon-latest.js';
const DEFAULT_RECEIPT_DIR = '.tmp/holoshell/sovereign-room-marathons';

function usage() {
  return `Usage: node scripts/holoshell-sovereign-room-marathon.mjs [options]

Options:
  --task-lane <local|cloud>        Room lane to consume. Default: local
  --task-tag <tag>                 Task tag to match. Default: local
  --cloud-escalation-allowed       Permit cloud-tagged task selection.
  --claim                          Claim the selected task after queue receipt.
  --claim-task-id <task-id>        Explicit local task id to claim. Required with --claim.
  --confirm-claim                  Explicit local confirmation required with --claim.
  --done, --mark-done              Mark a claimed local task done after evidence gates.
  --done-task-id <task-id>         Claimed local task id to close.
  --done-commit <hash>             Commit hash for the done receipt.
  --done-evidence <text>           Test or validation evidence for the done receipt.
  --done-summary <text>            Completion summary for the done receipt.
  --done-paths <paths>             Comma-separated touched paths for bullhorn radar.
  --execution-receipt <path>       Existing local execution receipt JSON/path.
  --confirm-done                   Explicit local confirmation for board close.
  --max-candidates <n>             Candidate count to keep. Default: 8
  --queue-fixture <path>           Read queue JSON from a fixture.
  --output <path>                  Latest JSON receipt path.
  --js-output <path>               Browser bootstrap path.
  --receipt-dir <path>             Receipt archive directory.
  --json                           Print receipt JSON.
  --self-test                      Run adapter self-test.
  -h, --help                       Show this help.
`;
}

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    taskLane: 'local',
    taskTag: 'local',
    cloudEscalationAllowed: false,
    claim: false,
    claimTaskId: '',
    confirmClaim: false,
    done: false,
    doneTaskId: '',
    doneCommit: '',
    doneEvidence: '',
    doneSummary: '',
    donePaths: '',
    executionReceipt: '',
    confirmDone: false,
    maxCandidates: 8,
    queueFixture: '',
    output: DEFAULT_OUTPUT,
    jsOutput: DEFAULT_JS_OUTPUT,
    receiptDir: DEFAULT_RECEIPT_DIR,
    json: false,
    selfTest: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--') continue;
    if (arg === '--task-lane') args.taskLane = argv[++index] || args.taskLane;
    else if (arg === '--task-tag') args.taskTag = argv[++index] || args.taskTag;
    else if (arg === '--cloud-escalation-allowed') args.cloudEscalationAllowed = true;
    else if (arg === '--claim') args.claim = true;
    else if (arg === '--claim-task-id' || arg === '--selected-task-id') args.claimTaskId = argv[++index] || '';
    else if (arg === '--confirm-claim') args.confirmClaim = true;
    else if (arg === '--done' || arg === '--mark-done') args.done = true;
    else if (arg === '--done-task-id' || arg === '--task-id') args.doneTaskId = argv[++index] || '';
    else if (arg === '--done-commit' || arg === '--commit') args.doneCommit = argv[++index] || '';
    else if (arg === '--done-evidence' || arg === '--evidence' || arg === '--verify') args.doneEvidence = argv[++index] || '';
    else if (arg === '--done-summary' || arg === '--summary') args.doneSummary = argv[++index] || '';
    else if (arg === '--done-paths' || arg === '--paths') args.donePaths = argv[++index] || '';
    else if (arg === '--execution-receipt') args.executionReceipt = argv[++index] || '';
    else if (arg === '--confirm-done') args.confirmDone = true;
    else if (arg === '--max-candidates') args.maxCandidates = Number(argv[++index] || args.maxCandidates);
    else if (arg === '--queue-fixture') args.queueFixture = argv[++index] || '';
    else if (arg === '--output') args.output = argv[++index] || args.output;
    else if (arg === '--js-output') args.jsOutput = argv[++index] || args.jsOutput;
    else if (arg === '--receipt-dir') args.receiptDir = argv[++index] || args.receiptDir;
    else if (arg === '--json') args.json = true;
    else if (arg === '--self-test') args.selfTest = true;
    else if (arg === '--help' || arg === '-h') {
      console.log(usage());
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (!Number.isFinite(args.maxCandidates) || args.maxCandidates < 1) {
    throw new Error('--max-candidates must be >= 1');
  }
  if (args.claim && args.done) {
    throw new Error('claim_and_done_must_be_separate_guarded_steps');
  }
  args.taskLane = normalizeTag(args.taskLane);
  args.taskTag = normalizeTag(args.taskTag || args.taskLane);
  return args;
}

function resolveRepoPath(filePath) {
  if (!filePath) return filePath;
  return path.isAbsolute(filePath) ? filePath : path.resolve(REPO_ROOT, filePath);
}

function readJson(filePath) {
  return JSON.parse(readFileSync(resolveRepoPath(filePath), 'utf8'));
}

function writeJson(filePath, payload) {
  const resolved = resolveRepoPath(filePath);
  mkdirSync(path.dirname(resolved), { recursive: true });
  writeFileSync(resolved, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  return resolved;
}

function writeJs(filePath, payload) {
  const resolved = resolveRepoPath(filePath);
  mkdirSync(path.dirname(resolved), { recursive: true });
  writeFileSync(resolved, `window.HOLOSHELL_SOVEREIGN_ROOM_MARATHON = ${JSON.stringify(payload, null, 2)};\n`, 'utf8');
  return resolved;
}

function normalizeTag(value) {
  const text = String(value || 'unknown')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  if (!text) return 'unknown';
  if (['sovereign', 'local', 'owned_metal', 'owned_hardware', 'on_device', 'offline'].includes(text)) return text === 'sovereign' ? 'local' : text;
  if (['cloud', 'managed_cloud', 'provider_cloud', 'external_provider'].includes(text)) return 'cloud';
  return text;
}

function textOfTask(task) {
  return [
    task?.title,
    task?.name,
    task?.description,
    task?.body,
    task?.task,
    task?.summary,
    Array.isArray(task?.tags) ? task.tags.join(' ') : '',
    Array.isArray(task?.labels) ? task.labels.join(' ') : '',
    task?.taskTag,
    task?.taskLane,
    task?.lane,
  ].filter(Boolean).join(' ').toLowerCase();
}

function tagsOfTask(task) {
  const tags = [
    ...(Array.isArray(task?.tags) ? task.tags : []),
    ...(Array.isArray(task?.labels) ? task.labels : []),
    task?.taskTag,
    task?.taskLane,
    task?.lane,
  ].filter(Boolean).map(normalizeTag);
  return [...new Set(tags)];
}

function classifyTask(task) {
  const tags = tagsOfTask(task);
  const text = textOfTask(task);
  if (tags.includes('cloud') || /\[(cloud)\]|\bcloud[-_ ]tagged\b|\bcloud lane\b|\bprovider cloud\b/.test(text)) return 'cloud';
  if (
    tags.includes('local')
    || tags.includes('owned_metal')
    || tags.includes('owned_hardware')
    || tags.includes('on_device')
    || tags.includes('native')
    || tags.includes('native_first')
    || tags.includes('native_capabilities')
    || tags.includes('jetson')
    || tags.includes('holoshell')
    || tags.includes('holoai')
    || tags.includes('holoqr')
    || tags.includes('laptop')
    || /\[(local|sovereign|repo-harvest|brittney-native|holoshell|jetson|native-[a-z0-9_-]+)\]|\blocal[-_ ]tagged\b|\bsovereign\b|\bowned[-_ ](metal|hardware)\b|\bon[-_ ]device\b/.test(text)
    || /\bnative[-_ ]first\b|\bnative[-_ ]capabilit(?:y|ies)\b|\bjetson\b|\bholoshell\b|\bholoai\b|\bholoqr\b|\blaptop[-_ ]hardware\b/.test(text)
  ) return 'local';
  return 'unknown';
}

function isClaimable(task) {
  const status = String(task?.status || '').toLowerCase();
  if (task?.claimable === false) return false;
  if (['claimed', 'done', 'complete', 'completed', 'blocked', 'cancelled'].includes(status)) return false;
  return true;
}

function priorityOf(task) {
  const priority = Number(task?.priority ?? task?.score ?? 0);
  return Number.isFinite(priority) ? priority : 0;
}

function normalizeTask(task) {
  const classification = classifyTask(task);
  return {
    id: String(task?.id || task?.taskId || task?.key || '').trim(),
    title: String(task?.title || task?.name || task?.task || task?.summary || 'Untitled room task').trim(),
    status: String(task?.status || 'open'),
    classification,
    claimable: isClaimable(task),
    priority: priorityOf(task),
    tags: tagsOfTask(task),
    raw: task,
  };
}

function queueTasks(queue) {
  if (Array.isArray(queue?.tasks)) return queue.tasks;
  if (Array.isArray(queue?.openTasks)) return queue.openTasks;
  if (Array.isArray(queue?.queue?.tasks)) return queue.queue.tasks;
  if (Array.isArray(queue?.board?.tasks)) return queue.board.tasks;
  return [];
}

function readQueue(args) {
  if (args.queueFixture) {
    return {
      status: 'fixture',
      queue: readJson(args.queueFixture),
      command: 'fixture',
      stdout: '',
      stderr: '',
    };
  }
  const command = path.join(AI_ECOSYSTEM_ROOT, 'hooks', 'team-connect.mjs');
  const result = spawnSync(process.execPath, [command, '--queue'], {
    cwd: AI_ECOSYSTEM_ROOT,
    encoding: 'utf8',
    timeout: 30000,
    maxBuffer: 1024 * 1024 * 8,
    windowsHide: true,
  });
  const stdout = String(result.stdout || '');
  const stderr = String(result.stderr || '');
  if (result.error || result.status !== 0) {
    return {
      status: 'error',
      queue: {},
      command: `node ${command} --queue`,
      stdout,
      stderr: result.error?.message || stderr,
    };
  }
  try {
    return {
      status: 'ready',
      queue: JSON.parse(stdout),
      command: `node ${command} --queue`,
      stdout,
      stderr,
    };
  } catch (error) {
    return {
      status: 'error',
      queue: {},
      command: `node ${command} --queue`,
      stdout,
      stderr: error.message,
    };
  }
}

function selectCandidates(queue, args) {
  const requestedLane = normalizeTag(args.taskLane || args.taskTag);
  const tasks = queueTasks(queue)
    .map(normalizeTask)
    .filter((task) => task.id && task.claimable);
  const candidates = tasks
    .filter((task) => task.classification === requestedLane || (requestedLane === 'local' && task.tags.includes('sovereign')))
    .sort((left, right) => priorityOf(right) - priorityOf(left) || left.title.localeCompare(right.title));
  return candidates.slice(0, args.maxCandidates);
}

function allQueueTasks(queue) {
  return queueTasks(queue)
    .map(normalizeTask)
    .filter((task) => task.id);
}

function findTaskById(queue, taskId) {
  const requestedId = String(taskId || '').trim();
  if (!requestedId) return null;
  return allQueueTasks(queue).find((task) => task.id === requestedId) || null;
}

function inspectExecutionReceipt(filePath) {
  const requestedPath = String(filePath || '').trim();
  if (!requestedPath) {
    return {
      path: '',
      resolvedPath: '',
      exists: false,
      parseStatus: 'not_provided',
      sha256: '',
      byteLength: 0,
      summaryStatus: '',
      verificationCommand: '',
    };
  }
  const resolvedPath = resolveRepoPath(requestedPath);
  if (!existsSync(resolvedPath)) {
    return {
      path: requestedPath,
      resolvedPath,
      exists: false,
      parseStatus: 'missing',
      sha256: '',
      byteLength: 0,
      summaryStatus: '',
      verificationCommand: '',
    };
  }
  const text = readFileSync(resolvedPath, 'utf8');
  let parsed = null;
  let parseStatus = 'not_json';
  try {
    parsed = JSON.parse(text);
    parseStatus = 'json';
  } catch {
    parsed = null;
  }
  return {
    path: requestedPath,
    resolvedPath,
    exists: true,
    parseStatus,
    sha256: createHash('sha256').update(text).digest('hex'),
    byteLength: Buffer.byteLength(text, 'utf8'),
    summaryStatus: String(parsed?.summary?.status || parsed?.status || ''),
    verificationCommand: String(parsed?.summary?.verificationCommand || parsed?.verification?.command || parsed?.verificationCommand || ''),
  };
}

function validateDoneGate(args, task, executionReceipt) {
  const blockers = [];
  const requestedLane = normalizeTag(args.taskLane || 'local');
  const requestedTag = normalizeTag(args.taskTag || requestedLane);
  const taskStatus = String(task?.status || '').toLowerCase();
  if (!args.confirmDone) blockers.push('local_room_done_requires_confirmDone_true');
  if (!args.doneTaskId) blockers.push('local_room_done_requires_done_task_id');
  if (!task) blockers.push('local_room_done_task_not_found');
  if (task && task.classification !== 'local') blockers.push('local_room_done_only_supports_local_tasks');
  if (task && taskStatus !== 'claimed') blockers.push('local_room_done_requires_claimed_task_status');
  if (requestedLane !== 'local' || requestedTag === 'cloud') blockers.push('local_room_done_only_supports_local_lane');
  if (args.cloudEscalationAllowed) blockers.push('local_room_done_cannot_use_cloud_escalation');
  if (!executionReceipt.exists) blockers.push('local_room_done_requires_existing_execution_receipt');
  if (!String(args.doneCommit || '').trim()) blockers.push('local_room_done_requires_commit');
  if (!String(args.doneEvidence || '').trim()) blockers.push('local_room_done_requires_validation_evidence');
  if (!String(args.doneSummary || '').trim()) blockers.push('local_room_done_requires_summary');
  return {
    allowed: blockers.length === 0,
    blockers,
    status: blockers.length === 0 ? 'ready_to_mark_done' : 'blocked_done_guard_required',
  };
}

function validateClaimGate(args, task) {
  const blockers = [];
  const requestedLane = normalizeTag(args.taskLane || 'local');
  const requestedTag = normalizeTag(args.taskTag || requestedLane);
  const taskStatus = String(task?.status || '').toLowerCase();
  if (!args.confirmClaim) blockers.push('local_room_claim_requires_confirmClaim_true');
  if (!String(args.claimTaskId || '').trim()) blockers.push('local_room_claim_requires_claim_task_id');
  if (!task) blockers.push('local_room_claim_task_not_found');
  if (task && task.classification !== 'local') blockers.push('local_room_claim_only_supports_local_tasks');
  if (task && !task.claimable) blockers.push('local_room_claim_requires_claimable_task');
  if (task && taskStatus !== 'open') blockers.push('local_room_claim_requires_open_task_status');
  if (requestedLane !== 'local' || requestedTag === 'cloud') blockers.push('local_room_claim_only_supports_local_lane');
  if (args.cloudEscalationAllowed) blockers.push('local_room_claim_cannot_use_cloud_escalation');
  return {
    allowed: blockers.length === 0,
    blockers,
    status: blockers.length === 0 ? 'ready_to_claim' : 'blocked_claim_guard_required',
  };
}

function claimSelectedTask(task) {
  const joinScript = path.join(AI_ECOSYSTEM_ROOT, 'scripts', 'codex-team-daemon.mjs');
  const patchScript = path.join(AI_ECOSYSTEM_ROOT, 'scripts', 'room-patch-task.mjs');
  const join = spawnSync(process.execPath, [joinScript, 'join'], {
    cwd: AI_ECOSYSTEM_ROOT,
    encoding: 'utf8',
    timeout: 30000,
    maxBuffer: 1024 * 1024 * 4,
    windowsHide: true,
  });
  if (join.error || join.status !== 0) {
    return {
      status: 'failed',
      attempted: true,
      succeeded: false,
      command: `node ${joinScript} join`,
      stdout: String(join.stdout || ''),
      stderr: join.error?.message || String(join.stderr || ''),
    };
  }
  const claim = spawnSync(process.execPath, [patchScript, 'claim', task.id], {
    cwd: AI_ECOSYSTEM_ROOT,
    encoding: 'utf8',
    timeout: 30000,
    maxBuffer: 1024 * 1024 * 4,
    windowsHide: true,
  });
  return {
    status: claim.error || claim.status !== 0 ? 'failed' : 'claimed',
    attempted: true,
    succeeded: !(claim.error || claim.status !== 0),
    command: `node ${patchScript} claim ${task.id}`,
    stdout: String(claim.stdout || ''),
    stderr: claim.error?.message || String(claim.stderr || ''),
  };
}

function markSelectedTaskDone(task, args) {
  const joinScript = path.join(AI_ECOSYSTEM_ROOT, 'scripts', 'codex-team-daemon.mjs');
  const bullhornScript = path.join(AI_ECOSYSTEM_ROOT, 'scripts', 'bullhorn.mjs');
  const join = spawnSync(process.execPath, [joinScript, 'join'], {
    cwd: AI_ECOSYSTEM_ROOT,
    encoding: 'utf8',
    timeout: 30000,
    maxBuffer: 1024 * 1024 * 4,
    windowsHide: true,
  });
  if (join.error || join.status !== 0) {
    return {
      status: 'failed',
      attempted: true,
      succeeded: false,
      command: `node ${joinScript} join`,
      stdout: String(join.stdout || ''),
      stderr: join.error?.message || String(join.stderr || ''),
    };
  }
  const bullhornArgs = [
    bullhornScript,
    'done',
    task.id,
    String(args.doneCommit || ''),
    '--evidence',
    String(args.doneEvidence || ''),
    '--summary',
    String(args.doneSummary || ''),
  ];
  const donePaths = String(args.donePaths || args.executionReceipt || '').trim();
  if (donePaths) bullhornArgs.push('--paths', donePaths);
  const done = spawnSync(process.execPath, bullhornArgs, {
    cwd: AI_ECOSYSTEM_ROOT,
    encoding: 'utf8',
    timeout: 120000,
    maxBuffer: 1024 * 1024 * 8,
    windowsHide: true,
  });
  return {
    status: done.error || done.status !== 0 ? 'failed' : 'done',
    attempted: true,
    succeeded: !(done.error || done.status !== 0),
    command: `node ${bullhornScript} done ${task.id} ${args.doneCommit} --evidence <redacted> --summary <redacted>`,
    stdout: String(done.stdout || ''),
    stderr: done.error?.message || String(done.stderr || ''),
  };
}

function buildReceipt(args, queueResult = readQueue(args), claimRunner = claimSelectedTask, doneRunner = markSelectedTaskDone) {
  const generatedAt = new Date().toISOString();
  const requestedLane = normalizeTag(args.taskLane || 'local');
  const requestedTag = normalizeTag(args.taskTag || requestedLane);
  const cloudRequested = requestedLane === 'cloud' || requestedTag === 'cloud';
  const doneTask = args.done ? findTaskById(queueResult.queue, args.doneTaskId) : null;
  const claimTask = args.claim ? findTaskById(queueResult.queue, args.claimTaskId) : null;
  const executionReceipt = inspectExecutionReceipt(args.executionReceipt);
  const doneGate = args.done
    ? validateDoneGate(args, doneTask, executionReceipt)
    : { allowed: false, blockers: [], status: 'not_requested' };
  const claimGate = args.claim
    ? validateClaimGate(args, claimTask)
    : { allowed: false, blockers: [], status: 'not_requested' };
  const candidates = cloudRequested && !args.cloudEscalationAllowed
    ? []
    : selectCandidates(queueResult.queue, args);
  const selectedTask = doneTask || claimTask || (args.claim ? null : candidates[0]) || null;
  const displayedCandidates = (args.done && doneTask) || (args.claim && claimTask)
    ? [selectedTask]
    : candidates;
  let claimReceipt = {
    status: 'not_requested',
    attempted: false,
    succeeded: false,
    stdout: '',
    stderr: '',
  };
  if (args.claim && selectedTask && claimGate.allowed) {
    claimReceipt = claimRunner(selectedTask, args);
  }
  let doneReceipt = {
    status: args.done ? doneGate.status : 'not_requested',
    attempted: false,
    succeeded: false,
    blockers: doneGate.blockers,
    stdout: '',
    stderr: '',
  };
  if (args.done && doneGate.allowed && selectedTask) {
    doneReceipt = {
      ...doneRunner(selectedTask, args, executionReceipt),
      blockers: [],
    };
  }
  const queue = queueResult.queue || {};
  const queueOpenCount = Number(queue.openCount ?? queue.summary?.openCount ?? queueTasks(queue).filter((task) => String(task.status || '').toLowerCase() === 'open').length ?? 0);
  const queueClaimableOpenCount = Number(queue.claimableOpenCount ?? queue.summary?.claimableOpenCount ?? queue.claimableOpenTaskCount ?? 0);
  let status = 'empty';
  let nextAction = 'room_empty_scavenge_or_wait';
  if (queueResult.status === 'error') {
    status = 'blocked_queue_unavailable';
    nextAction = 'repair_room_queue_access';
  } else if (cloudRequested && !args.cloudEscalationAllowed) {
    status = 'blocked_cloud_escalation_receipt_required';
    nextAction = 'emit_cloud_escalation_receipt_before_cloud_task_selection';
  } else if (args.claim && !claimGate.allowed) {
    status = 'blocked_claim_guard_required';
    nextAction = claimGate.blockers[0] || 'provide_explicit_local_claim_confirmation';
  } else if (selectedTask && args.claim && claimReceipt.succeeded) {
    status = 'claimed';
    nextAction = 'execute_claimed_task_locally_and_mark_done_only_with_downstream_evidence';
  } else if (selectedTask && args.claim) {
    status = 'claim_failed';
    nextAction = 'inspect_room_claim_receipt_and_retry_after_repair';
  } else if (args.done && doneReceipt.succeeded) {
    status = 'done';
    nextAction = 'room_task_closed_with_commit_and_execution_receipt';
  } else if (args.done && doneGate.allowed) {
    status = 'done_failed';
    nextAction = 'inspect_room_done_receipt_and_retry_after_repair';
  } else if (args.done) {
    status = 'blocked_done_guard_required';
    nextAction = doneGate.blockers[0] || 'provide_claimed_task_commit_evidence_and_execution_receipt';
  } else if (selectedTask) {
    status = 'ready_to_claim';
    nextAction = 'rerun_with_claim_after_guarded_workflow_approval';
  }
  const receiptId = `hsrm-${Date.now().toString(36)}`;
  const receipt = {
    schemaVersion: SCHEMA_VERSION,
    receiptId,
    generatedAt,
    sourceAnchors: {
      source: 'apps/holoshell/source/holoshell-sovereign-room-marathon.hsplus',
      adapter: 'scripts/holoshell-sovereign-room-marathon.mjs',
      roomQueue: 'C:/Users/josep/.ai-ecosystem/hooks/team-connect.mjs --queue',
    },
    summary: {
      status,
      taskLane: requestedLane,
      taskTag: requestedTag,
      cloudEscalationAllowed: Boolean(args.cloudEscalationAllowed),
      queueStatus: queueResult.status,
      queueOpenCount,
      queueClaimableOpenCount,
      matchedCandidateCount: displayedCandidates.length,
      selectedTaskId: selectedTask?.id || '',
      selectedTaskTitle: selectedTask?.title || '',
      selectedTaskTag: selectedTask?.classification || 'unknown',
      claimRequested: Boolean(args.claim),
      claimTaskIdRequested: String(args.claimTaskId || ''),
      claimConfirmationObserved: Boolean(args.confirmClaim),
      claimAttempted: Boolean(claimReceipt.attempted),
      claimSucceeded: Boolean(claimReceipt.succeeded),
      claimBlockedReason: claimGate.blockers[0] || '',
      doneRequested: Boolean(args.done),
      doneAttempted: Boolean(doneReceipt.attempted),
      doneSucceeded: Boolean(doneReceipt.succeeded),
      doneBlockedReason: doneGate.blockers[0] || '',
      executionReceiptObserved: Boolean(executionReceipt.exists),
      completionClaimAllowed: Boolean(args.done && doneGate.allowed && doneReceipt.succeeded),
      sovereignConsumptionDefault: requestedLane === 'local',
      destructiveActionsTaken: false,
      desktopAutomationExecuted: false,
      nextAction,
    },
    candidates: displayedCandidates.map(({ raw, ...task }) => task),
    selectedTask: selectedTask ? (({ raw, ...task }) => task)(selectedTask) : null,
    taskSelection: {
      claimTaskId: String(args.claimTaskId || ''),
      doneTaskId: String(args.doneTaskId || ''),
      selectedTaskId: selectedTask?.id || '',
      selectionSource: args.done
        ? 'done-task-id'
        : args.claim
          ? 'claim-task-id'
          : 'candidate-priority',
      explicitSelectionRequiredForClaim: true,
    },
    queue: {
      command: queueResult.command,
      stdoutHashPresent: Boolean(queueResult.stdout),
      stderr: queueResult.stderr ? String(queueResult.stderr).slice(0, 1200) : '',
    },
    claim: {
      ...claimReceipt,
      gate: claimGate,
    },
    done: {
      ...doneReceipt,
      gate: doneGate,
      executionReceipt,
      commit: args.done ? String(args.doneCommit || '') : '',
      evidencePresent: Boolean(String(args.doneEvidence || '').trim()),
      summaryPresent: Boolean(String(args.doneSummary || '').trim()),
    },
    output: {
      latestPath: args.output,
      jsPath: args.jsOutput,
      receiptDir: args.receiptDir,
      receiptPath: path.join(args.receiptDir, `${receiptId}.json`).replace(/\\/g, '/'),
    },
  };
  return receipt;
}

function persistReceipt(args, receipt) {
  const latestPath = writeJson(args.output, receipt);
  const receiptPath = writeJson(receipt.output.receiptPath, receipt);
  const jsPath = writeJs(args.jsOutput, receipt);
  receipt.output = {
    ...receipt.output,
    latestResolvedPath: latestPath,
    receiptResolvedPath: receiptPath,
    jsResolvedPath: jsPath,
  };
  writeJson(args.output, receipt);
  writeJson(receipt.output.receiptPath, receipt);
  writeJs(args.jsOutput, receipt);
  return receipt;
}

function fixtureQueue() {
  return {
    openCount: 3,
    claimableOpenCount: 3,
    tasks: [
      { id: 'task_cloud_high', title: '[cloud] provider deploy receipt', status: 'open', priority: 90, tags: ['cloud'], claimable: true },
      { id: 'task_local_mid', title: '[local] wire HoloShell sovereign runner', status: 'open', priority: 70, tags: ['local', 'sovereign'], claimable: true },
      { id: 'task_unknown', title: 'untagged housekeeping', status: 'open', priority: 20, tags: [], claimable: true },
      { id: 'task_claimed', title: '[local] already claimed work', status: 'claimed', priority: 80, tags: ['local'], claimable: false },
    ],
  };
}

function assertSelfTest() {
  const failures = [];
  const local = buildReceipt(
    { ...parseArgs([]), taskLane: 'local', taskTag: 'local', claim: false },
    { status: 'fixture', queue: fixtureQueue(), command: 'fixture' },
  );
  if (local.summary.status !== 'ready_to_claim') failures.push('expected local lane ready_to_claim');
  if (local.summary.selectedTaskId !== 'task_local_mid') failures.push('expected local task selection');
  if (local.summary.claimAttempted) failures.push('receipt-only default attempted claim');
  const cloudBlocked = buildReceipt(
    { ...parseArgs([]), taskLane: 'cloud', taskTag: 'cloud', claim: false },
    { status: 'fixture', queue: fixtureQueue(), command: 'fixture' },
  );
  if (cloudBlocked.summary.status !== 'blocked_cloud_escalation_receipt_required') failures.push('expected cloud escalation block');
  const cloudAllowed = buildReceipt(
    { ...parseArgs([]), taskLane: 'cloud', taskTag: 'cloud', cloudEscalationAllowed: true, claim: false },
    { status: 'fixture', queue: fixtureQueue(), command: 'fixture' },
  );
  if (cloudAllowed.summary.selectedTaskId !== 'task_cloud_high') failures.push('expected cloud task only after escalation flag');
  const claimed = buildReceipt(
    { ...parseArgs([]), taskLane: 'local', taskTag: 'local', claim: true, confirmClaim: true, claimTaskId: 'task_local_mid' },
    { status: 'fixture', queue: fixtureQueue(), command: 'fixture' },
    () => ({ status: 'claimed', attempted: true, succeeded: true, stdout: 'claimed', stderr: '' }),
  );
  if (claimed.summary.status !== 'claimed') failures.push('expected claimed status');
  if (claimed.summary.completionClaimAllowed) failures.push('done should require downstream evidence');
  const blockedClaim = buildReceipt(
    { ...parseArgs([]), taskLane: 'local', taskTag: 'local', claim: true, confirmClaim: false },
    { status: 'fixture', queue: fixtureQueue(), command: 'fixture' },
    () => ({ status: 'claimed', attempted: true, succeeded: true, stdout: 'claimed', stderr: '' }),
  );
  if (blockedClaim.summary.status !== 'blocked_claim_guard_required') failures.push('expected claim guard block without confirmation');
  if (blockedClaim.summary.claimAttempted) failures.push('claim must not attempt without confirmClaim');
  const blockedMissingClaimTask = buildReceipt(
    { ...parseArgs([]), taskLane: 'local', taskTag: 'local', claim: true, confirmClaim: true },
    { status: 'fixture', queue: fixtureQueue(), command: 'fixture' },
    () => ({ status: 'claimed', attempted: true, succeeded: true, stdout: 'claimed', stderr: '' }),
  );
  if (blockedMissingClaimTask.summary.claimBlockedReason !== 'local_room_claim_requires_claim_task_id') failures.push('claim must require explicit claimTaskId');
  if (blockedMissingClaimTask.summary.claimAttempted) failures.push('missing claimTaskId must not attempt claim');
  const blockedCloudClaimTask = buildReceipt(
    { ...parseArgs([]), taskLane: 'local', taskTag: 'local', claim: true, confirmClaim: true, claimTaskId: 'task_cloud_high' },
    { status: 'fixture', queue: fixtureQueue(), command: 'fixture' },
    () => ({ status: 'claimed', attempted: true, succeeded: true, stdout: 'claimed', stderr: '' }),
  );
  if (blockedCloudClaimTask.summary.claimBlockedReason !== 'local_room_claim_only_supports_local_tasks') failures.push('local claim must reject cloud target id');
  const done = buildReceipt(
    {
      ...parseArgs([]),
      taskLane: 'local',
      taskTag: 'local',
      done: true,
      doneTaskId: 'task_claimed',
      doneCommit: 'abc1234',
      doneEvidence: 'node scripts/__tests__/holoshell-sovereign-room-marathon.test.mjs',
      doneSummary: 'Closed claimed local fixture task with test evidence.',
      executionReceipt: 'package.json',
      confirmDone: true,
    },
    { status: 'fixture', queue: fixtureQueue(), command: 'fixture' },
    claimSelectedTask,
    () => ({ status: 'done', attempted: true, succeeded: true, stdout: 'done', stderr: '' }),
  );
  if (done.summary.status !== 'done') failures.push('expected done status after guarded evidence path');
  if (!done.summary.completionClaimAllowed) failures.push('done path should allow completion only after evidence gate succeeds');
  const blockedDone = buildReceipt(
    {
      ...parseArgs([]),
      taskLane: 'local',
      taskTag: 'local',
      done: true,
      doneTaskId: 'task_claimed',
      doneCommit: 'abc1234',
      doneEvidence: 'node scripts/__tests__/holoshell-sovereign-room-marathon.test.mjs',
      doneSummary: 'Closed claimed local fixture task with test evidence.',
      executionReceipt: 'package.json',
      confirmDone: false,
    },
    { status: 'fixture', queue: fixtureQueue(), command: 'fixture' },
  );
  if (blockedDone.summary.status !== 'blocked_done_guard_required') failures.push('expected done guard block without confirmation');
  return { ok: failures.length === 0, failures, local, cloudBlocked, cloudAllowed, claimed, blockedClaim, done, blockedDone };
}

async function main() {
  const args = parseArgs();
  if (args.selfTest) {
    const result = assertSelfTest();
    if (args.json) console.log(JSON.stringify(result, null, 2));
    else console.log(result.ok ? 'Sovereign room marathon self-test passed.' : result.failures.join('\n'));
    process.exit(result.ok ? 0 : 1);
  }
  const receipt = persistReceipt(args, buildReceipt(args));
  if (args.json) console.log(JSON.stringify(receipt, null, 2));
  else console.log(`Sovereign room marathon ${receipt.summary.status}: ${receipt.summary.nextAction}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  main().catch((error) => {
    console.error(error.stack || error.message);
    process.exit(1);
  });
}

export {
  buildReceipt,
  classifyTask,
  fixtureQueue,
  inspectExecutionReceipt,
  normalizeTag,
  parseArgs,
  selectCandidates,
  validateDoneGate,
};
