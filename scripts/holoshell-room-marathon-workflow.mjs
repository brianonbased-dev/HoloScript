#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCHEMA_VERSION = 'hololand.holoshell.workflow.v0.1.0';
const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '..');
const DEFAULT_TMP = path.join('.tmp', 'holoshell');
const DEFAULT_OUTPUT = path.join(DEFAULT_TMP, 'workflow-latest.json');
const DEFAULT_JS_OUTPUT = path.join(DEFAULT_TMP, 'workflow-latest.js');
const DEFAULT_WORKFLOW_DIR = path.join(DEFAULT_TMP, 'workflows');
const DEFAULT_LOFI_URL = 'https://www.youtube.com/watch?v=jfKfPfyJRdk';
const WORKFLOW_APPROVAL_SCHEMA = 'hololand.holoshell.workflow-approval.v0.1.0';

function parseArgs(argv) {
  const args = {
    profile: 'room_marathon_lofi',
    actor: 'brittney',
    model: 'sovereign-local',
    modelRoute: 'sovereign_local',
    taskLane: 'local',
    taskTag: 'local',
    claimTaskId: '',
    cloudEscalationAllowed: false,
    terminalApp: 'wt',
    browserApp: 'Chrome',
    lofiUrl: DEFAULT_LOFI_URL,
    roomCommand: '',
    stageActions: true,
    executeWorkflow: false,
    workflowApprovalBundle: '',
    workflowApprovalId: '',
    workflowApprovalNonce: '',
    stepDelayMs: 1200,
    json: false,
    selfTest: false,
    output: DEFAULT_OUTPUT,
    jsOutput: DEFAULT_JS_OUTPUT,
    workflowDir: DEFAULT_WORKFLOW_DIR,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--profile') args.profile = argv[++index] || args.profile;
    else if (arg === '--actor') args.actor = argv[++index] || args.actor;
    else if (arg === '--model') args.model = argv[++index] || args.model;
    else if (arg === '--model-route') args.modelRoute = argv[++index] || args.modelRoute;
    else if (arg === '--task-lane') args.taskLane = argv[++index] || args.taskLane;
    else if (arg === '--task-tag') args.taskTag = argv[++index] || args.taskTag;
    else if (arg === '--claim-task-id' || arg === '--selected-task-id') args.claimTaskId = argv[++index] || '';
    else if (arg === '--cloud-escalation-allowed') args.cloudEscalationAllowed = true;
    else if (arg === '--terminal-app') args.terminalApp = argv[++index] || args.terminalApp;
    else if (arg === '--browser-app') args.browserApp = argv[++index] || args.browserApp;
    else if (arg === '--lofi-url') args.lofiUrl = argv[++index] || args.lofiUrl;
    else if (arg === '--room-command') args.roomCommand = argv[++index] || '';
    else if (arg === '--no-stage-actions') args.stageActions = false;
    else if (arg === '--execute-workflow') args.executeWorkflow = true;
    else if (arg === '--workflow-approval-bundle') args.workflowApprovalBundle = argv[++index] || '';
    else if (arg === '--workflow-approval-id') args.workflowApprovalId = argv[++index] || '';
    else if (arg === '--workflow-approval-nonce') args.workflowApprovalNonce = argv[++index] || '';
    else if (arg === '--step-delay-ms') args.stepDelayMs = Number(argv[++index] || args.stepDelayMs);
    else if (arg === '--json') args.json = true;
    else if (arg === '--self-test') args.selfTest = true;
    else if (arg === '--output') args.output = argv[++index];
    else if (arg === '--js-output') args.jsOutput = argv[++index];
    else if (arg === '--workflow-dir') args.workflowDir = argv[++index];
    else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!/^https:\/\/(www\.)?youtube\.com\//i.test(args.lofiUrl)) {
    throw new Error('--lofi-url must be an https://youtube.com URL.');
  }
  args.taskLane = normalizeTaskLane(args.taskLane);
  args.taskTag = normalizeTaskLane(args.taskTag || args.taskLane);
  args.cloudEscalationAllowed = args.taskLane === 'cloud' || args.cloudEscalationAllowed === true;
  if (!Number.isFinite(args.stepDelayMs) || args.stepDelayMs < 0) args.stepDelayMs = 1200;
  return args;
}

function printHelp() {
  console.log(`HoloShell room marathon workflow

Usage:
  node scripts/holoshell-room-marathon-workflow.mjs [options]

Options:
  --model <name>            Model label. Defaults to sovereign-local.
  --model-route <route>     Route label. Defaults to sovereign_local.
  --task-lane <local|cloud> Room task lane. Defaults to local.
  --task-tag <local|cloud>  Room task tag. Defaults to task lane.
  --cloud-escalation-allowed
                            Mark cloud-tagged work as explicitly allowed.
  --terminal-app <name>     App target for terminal. Defaults to wt.
  --browser-app <name>      App target for browser. Defaults to Chrome.
  --lofi-url <url>          YouTube lofi URL.
  --room-command <command>  Command to stage into the terminal.
  --no-stage-actions        Write workflow only; do not mint hardware action receipts.
  --execute-workflow        Execute a nonce-approved workflow.
  --workflow-approval-bundle <path>  Workflow approval bundle.
  --workflow-approval-id <id>        Workflow approval id.
  --workflow-approval-nonce <nonce>  Workflow approval nonce.
  --step-delay-ms <n>       Delay between executed steps. Defaults to 1200.
  --self-test               Run fixture assertions without staging hardware actions.
  --json                    Print the workflow JSON.
  -h, --help                Show this help.
`);
}

function normalizeTaskLane(value) {
  return String(value || 'local').toLowerCase().includes('cloud') ? 'cloud' : 'local';
}

function resolveRepoPath(filePath) {
  return path.isAbsolute(filePath) ? filePath : path.resolve(REPO_ROOT, filePath);
}

function readJson(filePath, fallback = null) {
  const resolved = resolveRepoPath(filePath);
  if (!existsSync(resolved)) return fallback;
  return JSON.parse(readFileSync(resolved, 'utf8'));
}

function applyWorkflowApprovalBundle(args) {
  if (!args.workflowApprovalBundle) return null;
  const bundle = readJson(args.workflowApprovalBundle, null);
  if (!bundle) throw new Error('Workflow approval bundle was not found.');
  if (bundle.schemaVersion !== WORKFLOW_APPROVAL_SCHEMA) throw new Error('Workflow approval bundle schema mismatch.');
  if (!args.workflowApprovalId || bundle.approvalId !== args.workflowApprovalId) throw new Error('Workflow approval id mismatch.');
  if (!args.workflowApprovalNonce || bundle.nonce !== args.workflowApprovalNonce) throw new Error('Workflow approval nonce mismatch.');
  if (bundle.approval?.expiresAt && Date.parse(bundle.approval.expiresAt) <= Date.now()) throw new Error('Workflow approval bundle has expired.');
  if (!bundle.execution?.allowed) throw new Error(bundle.execution?.blockedReason || 'Workflow approval does not allow execution.');
  const request = bundle.workflowRequest || {};
  args.profile = request.profile || args.profile;
  args.model = request.model || args.model;
  args.modelRoute = request.modelRoute || args.modelRoute;
  args.taskLane = normalizeTaskLane(request.taskLane || args.taskLane);
  args.taskTag = normalizeTaskLane(request.taskTag || args.taskTag || args.taskLane);
  args.cloudEscalationAllowed = request.cloudEscalationAllowed === true || args.taskLane === 'cloud';
  args.terminalApp = request.terminalApp || args.terminalApp;
  args.browserApp = request.browserApp || args.browserApp;
  args.lofiUrl = request.lofiUrl || args.lofiUrl;
  args.roomCommand = request.roomCommand || args.roomCommand;
  args.executeWorkflow = true;
  args.workflowApprovalContext = {
    approvalId: bundle.approvalId,
    sourceWorkflowId: bundle.sourceWorkflow?.workflowId || '',
    expiresAt: bundle.approval?.expiresAt || '',
  };
  return args.workflowApprovalContext;
}

function writeJson(filePath, value) {
  const resolved = resolveRepoPath(filePath);
  mkdirSync(path.dirname(resolved), { recursive: true });
  writeFileSync(resolved, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  return resolved;
}

function writeBrowserBootstrap(filePath, workflow) {
  const resolved = resolveRepoPath(filePath);
  mkdirSync(path.dirname(resolved), { recursive: true });
  const payload = JSON.stringify(workflow, null, 2).replace(/<\/script/gi, '<\\/script');
  writeFileSync(resolved, `window.HOLOSHELL_WORKFLOW = ${payload};\n`, 'utf8');
  return resolved;
}

function shortHash(value, length = 10) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, length);
}

function defaultRoomCommand(args) {
  const tag = normalizeTaskLane(args.taskTag || args.taskLane);
  const escalation = args.cloudEscalationAllowed ? '1' : '0';
  const escalationFlag = args.cloudEscalationAllowed ? ' --cloud-escalation-allowed' : '';
  const claimTaskId = String(args.claimTaskId || '<selectedTaskId>').replace(/"/g, '\\"');
  const guidance = `Sovereign HoloShell room marathon: claim ${tag}-tagged tasks first; keep local tasks on owned hardware; cloud-tagged work requires an explicit receipt.`;
  const escapedGuidance = guidance.replace(/"/g, '\\"');
  return `Set-Location "C:\\Users\\josep\\.ai-ecosystem"; $env:HOLOSHELL_ROOM_MODE="marathon"; $env:HOLOSHELL_TASK_TAG="${tag}"; $env:HOLOSHELL_CONSUMPTION="sovereign"; $env:HOLOSHELL_CLOUD_ESCALATION_ALLOWED="${escalation}"; node scripts\\codex-team-daemon.mjs join; node hooks\\team-connect.mjs --queue; Set-Location "C:\\Users\\josep\\Documents\\GitHub\\HoloLand"; node scripts\\holoshell-sovereign-room-marathon.mjs --task-lane "${tag}" --task-tag "${tag}" --claim --confirm-claim --claim-task-id "${claimTaskId}"${escalationFlag} --json; Write-Host "${escapedGuidance}"`;
}

function findCommand(command) {
  const result = spawnSync('where.exe', [command], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    windowsHide: true,
  });
  if (result.status !== 0) return '';
  return String(result.stdout || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean)[0] || '';
}

function step(id, label, kind, detail, action = null) {
  return {
    id,
    label,
    kind,
    detail,
    permissionEnvelope: action ? 'guarded_execute' : 'read_only',
    approvalRequired: Boolean(action),
    status: 'planned',
    action,
    receiptPath: '',
    actionId: '',
    targetResolved: false,
    mutationExecuted: false,
  };
}

function createSteps(args) {
  const command = args.roomCommand || defaultRoomCommand(args);
  const nodePath = findCommand('node');
  const roomStep = step(
    'resolve-sovereign-room',
    'Resolve Sovereign Room',
    'room_surface',
    nodePath ? `Node is available at ${nodePath}; room scripts can be staged locally.` : 'Node was not found on PATH for local room scripts.',
  );
  roomStep.status = nodePath ? 'resolved' : 'not_found';
  roomStep.targetResolved = Boolean(nodePath);
  return [
    roomStep,
    step(
      'open-terminal',
      'Open Terminal',
      'program_surface',
      'Open Windows Terminal for the room marathon command.',
      { action: 'launch_app', app: args.terminalApp },
    ),
    step(
      'stage-room-command',
      'Stage Room Marathon',
      'room_command',
      `Type the sovereign room marathon command for ${args.taskTag}-tagged tasks.`,
      { action: 'type_text', processName: 'WindowsTerminal', text: command },
    ),
    step(
      'submit-room-command',
      'Submit Room Marathon',
      'room_command',
      'Press Enter in terminal after the command is staged.',
      { action: 'hotkey', processName: 'WindowsTerminal', hotkey: 'Enter' },
    ),
    step(
      'open-browser',
      'Open Browser',
      'browser_surface',
      'Open the browser as a shell object.',
      { action: 'launch_app', app: args.browserApp },
    ),
    step(
      'play-lofi-youtube',
      'Play YouTube Lofi',
      'media_surface',
      'Open a YouTube lofi stream for ambient work audio.',
      { action: 'open_url', url: args.lofiUrl },
    ),
  ];
}

function cliArgsForStep(args, workflowId, item, index) {
  const action = item.action || {};
  const safeStep = item.id.replace(/[^a-z0-9-]/gi, '-');
  const actionOutput = path.join(args.workflowDir, workflowId, 'actions', `${String(index + 1).padStart(2, '0')}-${safeStep}.json`);
  const jsOutput = actionOutput.replace(/\.json$/i, '.js');
  const cli = [
    'scripts/holoshell-action-executor.mjs',
    '--actor',
    args.actor,
    '--action',
    action.action,
    '--output',
    actionOutput,
    '--js-output',
    jsOutput,
  ];
  if (action.app) cli.push('--app', action.app);
  if (action.url) cli.push('--url', action.url);
  if (action.processName) cli.push('--process-name', action.processName);
  if (action.windowTitle) cli.push('--window-title', action.windowTitle);
  if (action.text) cli.push('--text', action.text);
  if (action.hotkey) cli.push('--hotkey', action.hotkey);
  return { cli, actionOutput };
}

function runNode(cli) {
  const result = spawnSync(process.execPath, cli, {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    windowsHide: true,
    maxBuffer: 10 * 1024 * 1024,
  });
  return {
    ok: result.status === 0,
    status: result.status,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    error: result.error ? result.error.message : '',
  };
}

function sleepMs(ms) {
  if (!ms) return;
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function applyReceiptToStep(item, receiptPath, result) {
  const receipt = readJson(receiptPath, null);
  if (!receipt) {
    return {
      ...item,
      status: result.ok ? 'receipt_missing' : 'stage_error',
      error: result.stderr.trim() || result.error || '',
    };
  }
  const targetResolved = item.action?.action === 'launch_app'
    ? Boolean(receipt.target?.program?.launchable)
    : item.action?.action === 'type_text' || item.action?.action === 'hotkey'
      ? Boolean(receipt.target?.windowId || receipt.target?.title)
      : true;
  return {
    ...item,
    status: receipt.summary?.status || 'unknown',
    receiptPath: receipt.output?.latestPath || resolveRepoPath(receiptPath),
    actionId: receipt.actionId || '',
    targetResolved,
    mutationExecuted: Boolean(receipt.summary?.mutatingActionExecuted),
    error: receipt.summary?.error || '',
  };
}

function refreshProgramRegistry() {
  runNode(['scripts/holoshell-program-registry.mjs', '--max-apps', '250']);
}

function runWorkflowActions(args, workflowId, steps, execute = false) {
  const executed = [];
  for (let index = 0; index < steps.length; index += 1) {
    const item = steps[index];
    if (!item.action) {
      executed.push(item);
      continue;
    }
    refreshProgramRegistry();
    const { cli, actionOutput } = cliArgsForStep(args, workflowId, item, index);
    if (execute) cli.push('--approved', '--execute');
    const result = runNode(cli);
    if (!result.ok) {
      executed.push({
        ...item,
        status: 'stage_error',
        error: result.stderr.trim() || result.stdout.trim() || result.error || `exit ${result.status}`,
      });
      if (execute) break;
    } else {
      executed.push(applyReceiptToStep(item, actionOutput, result));
    }
    if (execute) sleepMs(args.stepDelayMs);
  }
  return [...executed, ...steps.slice(executed.length)];
}

function stageWorkflowActions(args, workflowId, steps) {
  return runWorkflowActions(args, workflowId, steps, false);
}

function executeWorkflowActions(args, workflowId, steps) {
  return runWorkflowActions(args, workflowId, steps, true);
}

function buildWorkflow(args) {
  const generatedAt = new Date().toISOString();
  const workflowId = `hswf-${Date.now().toString(36)}-${shortHash(args)}`;
  const plannedSteps = createSteps(args);
  const steps = args.executeWorkflow && !args.selfTest
    ? executeWorkflowActions(args, workflowId, plannedSteps)
    : args.stageActions && !args.selfTest
    ? stageWorkflowActions(args, workflowId, plannedSteps)
    : plannedSteps;
  const guardedSteps = steps.filter((item) => item.permissionEnvelope === 'guarded_execute');
  const pendingSteps = steps.filter((item) => item.approvalRequired && ['approval_required', 'planned'].includes(item.status));
  const targetResolvedSteps = steps.filter((item) => item.targetResolved);
  const stageErrors = steps.filter((item) => item.status === 'stage_error' || item.error);
  const roomStep = steps.find((item) => item.id === 'resolve-sovereign-room');

  return {
    schemaVersion: SCHEMA_VERSION,
    generatedAt,
    workflowId,
    profile: args.profile,
    title: 'Room Marathon with Lofi',
    sourceAnchors: {
      source: 'apps/holoshell/source/holoshell-hardware-control.hsplus',
      home: 'apps/holoshell/source/holoshell-home.hsplus',
      adapter: 'scripts/holoshell-room-marathon-workflow.mjs',
      sovereignRoomMarathon: 'apps/holoshell/source/holoshell-sovereign-room-marathon.hsplus',
      sovereignRoomMarathonAdapter: 'scripts/holoshell-sovereign-room-marathon.mjs',
      actionExecutor: 'scripts/holoshell-action-executor.mjs',
      roomSkill: 'C:/Users/josep/.agents/skills/room/SKILL.md',
    },
    host: {
      platform: process.platform,
      arch: process.arch,
      release: os.release(),
      hostname: os.hostname(),
    },
    modelRoute: {
      provider: 'sovereign',
      route: args.modelRoute,
      model: args.model,
      taskLane: args.taskLane,
      taskTag: args.taskTag,
      cloudEscalationAllowed: args.cloudEscalationAllowed,
      secretsCaptured: false,
    },
    tools: {
      sovereignRoomAvailable: Boolean(roomStep?.targetResolved),
      sovereignRoomDetail: roomStep?.detail || '',
    },
    media: {
      provider: 'youtube',
      url: args.lofiUrl,
      label: 'lofi music',
    },
    executionPolicy: {
      default: args.executeWorkflow ? 'approved_execute' : 'stage_only',
      requiresUserApproval: true,
      daemonExecuteRequired: true,
      workflowApprovalId: args.workflowApprovalContext?.approvalId || '',
      mutationExecuted: steps.some((item) => item.mutationExecuted),
    },
    steps,
    summary: {
      status: stageErrors.length ? 'needs_attention' : pendingSteps.length ? 'pending_user_approval' : 'planned',
      stepCount: steps.length,
      guardedStepCount: guardedSteps.length,
      pendingApprovalCount: pendingSteps.length,
      targetResolvedCount: targetResolvedSteps.length,
      stageErrorCount: stageErrors.length,
      model: args.model,
      modelRoute: args.modelRoute,
      taskLane: args.taskLane,
      taskTag: args.taskTag,
      cloudEscalationAllowed: args.cloudEscalationAllowed,
      sovereignRoomMarathonReceipt: '.tmp/holoshell/sovereign-room-marathon-latest.json',
      musicTarget: 'youtube_lofi',
      roomCommandStaged: steps.some((item) => item.id === 'stage-room-command' && item.status !== 'stage_error'),
      mutationExecuted: steps.some((item) => item.mutationExecuted),
    },
  };
}

function assertSelfTest(workflow) {
  const failures = [];
  if (workflow.schemaVersion !== SCHEMA_VERSION) failures.push('schemaVersion mismatch');
  if (workflow.summary.stepCount !== 6) failures.push('expected six workflow steps');
  if (workflow.summary.guardedStepCount !== 5) failures.push('expected five guarded hardware steps');
  if (!workflow.steps.some((item) => item.id === 'play-lofi-youtube')) failures.push('missing lofi step');
  if (!workflow.steps.some((item) => item.id === 'stage-room-command')) failures.push('missing room command step');
  const roomCommand = workflow.steps.find((item) => item.id === 'stage-room-command')?.action?.text || '';
  if (!roomCommand.includes('holoshell-sovereign-room-marathon.mjs')) failures.push('room command does not run sovereign room marathon adapter');
  if (!roomCommand.includes('--claim')) failures.push('guarded room command should claim the selected task');
  if (!roomCommand.includes('--confirm-claim')) failures.push('guarded room command should confirm local claim explicitly');
  if (!roomCommand.includes('--claim-task-id')) failures.push('guarded room command should require selected task id');
  if (workflow.executionPolicy.mutationExecuted) failures.push('self-test should not execute mutations');
  if (failures.length) throw new Error(`Self-test failed:\n- ${failures.join('\n- ')}`);
}

try {
  const args = parseArgs(process.argv.slice(2));
  applyWorkflowApprovalBundle(args);
  const workflow = buildWorkflow(args);
  if (args.selfTest) assertSelfTest(workflow);
  const output = writeJson(args.output, workflow);
  const jsOutput = writeBrowserBootstrap(args.jsOutput, workflow);
  if (args.json) {
    console.log(JSON.stringify(workflow, null, 2));
  } else {
    console.log(`HoloShell workflow: ${output}`);
    console.log(`HoloShell browser bootstrap: ${jsOutput}`);
    console.log(`Workflow: ${workflow.title}`);
    console.log(`Status: ${workflow.summary.status}`);
    console.log(`Steps: ${workflow.summary.stepCount}`);
    console.log(`Pending approvals: ${workflow.summary.pendingApprovalCount}`);
    console.log(`Model route: ${workflow.summary.modelRoute}/${workflow.summary.model}`);
    console.log(`Mutation executed: ${workflow.summary.mutationExecuted ? 'yes' : 'no'}`);
  }
} catch (error) {
  console.error(`holoshell-room-marathon-workflow failed: ${error.message}`);
  process.exit(1);
}
