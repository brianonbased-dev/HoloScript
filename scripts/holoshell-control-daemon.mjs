#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '..');
const DEFAULT_TMP = path.join('.tmp', 'holoshell');
const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 4747;
const MAX_BODY_BYTES = 64 * 1024;

const REQUEST_FLAG_MAP = {
  actor: '--actor',
  capture: '--capture',
  programRegistry: '--program-registry',
  targetWindowId: '--target-window-id',
  windowTitle: '--window-title',
  processName: '--process-name',
  handle: '--handle',
  targetControlId: '--target-control-id',
  controlName: '--control-name',
  text: '--text',
  url: '--url',
  filePath: '--path',
  app: '--app',
  hotkey: '--hotkey',
  x: '--x',
  y: '--y',
};

function parseArgs(argv) {
  const args = {
    host: process.env.HOLOSHELL_CONTROL_HOST || DEFAULT_HOST,
    port: Number(process.env.HOLOSHELL_CONTROL_PORT || DEFAULT_PORT),
    tmpDir: DEFAULT_TMP,
    maxApps: 250,
    enableExecute: false,
    enableTrustedExecute: false,
    json: false,
    selfTest: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--host') args.host = argv[++index] || DEFAULT_HOST;
    else if (arg === '--port') args.port = Number(argv[++index] || DEFAULT_PORT);
    else if (arg === '--tmp-dir') args.tmpDir = argv[++index] || DEFAULT_TMP;
    else if (arg === '--max-apps') args.maxApps = Number(argv[++index] || 250);
    else if (arg === '--enable-execute') args.enableExecute = true;
    else if (arg === '--enable-trusted-execute') args.enableTrustedExecute = true;
    else if (arg === '--json') args.json = true;
    else if (arg === '--self-test') args.selfTest = true;
    else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!Number.isFinite(args.port) || args.port <= 0) throw new Error('Invalid --port value.');
  if (!Number.isFinite(args.maxApps) || args.maxApps <= 0) throw new Error('Invalid --max-apps value.');
  return args;
}

function printHelp() {
  console.log(`HoloShell local control daemon

Usage:
  node scripts/holoshell-control-daemon.mjs [options]

Options:
  --host <host>        Bind host. Defaults to 127.0.0.1.
  --port <port>        Bind port. Defaults to 4747.
  --enable-execute     Allow approved mutation execution. Disabled by default.
  --enable-trusted-execute
                       Mark trusted autonomy execution support as enabled after --enable-execute.
  --max-apps <count>   Program registry scan cap. Defaults to 250.
  --self-test          Run route and receipt checks without starting a server.
  --json               Print JSON in self-test mode.
  -h, --help           Show this help.

Routes:
  GET  /health
  GET  /feed
  GET  /registry
  GET  /action/latest
  GET  /approval/latest
  GET  /trust/ledger
  GET  /workflow/latest
  GET  /workflow/approval/latest
  GET  /workflow/intent-gate/latest
  GET  /workflow/grok-build/setup
  GET  /agents/grok-heartbeat
  GET  /services/supervisor
  GET  /workflow/founder-command/latest
  GET  /workflow/holoclaw-runtime-bridge/latest
  GET  /dispatch/latest
  GET  /workflow/laptop-reasoning/latest
  GET  /workflow/conversation-plan-dispatch/latest
  GET  /workflow/sovereign-room-marathon/latest
  POST /action
  POST /approval/execute
  POST /workflow/agent-dispatch
  POST /workflow/laptop-reasoning-job
  POST /workflow/conversation-plan-dispatch
  POST /workflow/room-marathon
  POST /workflow/sovereign-room-marathon
  POST /workflow/grok-build
  POST /workflow/holoclaw-runtime-bridge
  POST /workflow/founder-command
  POST /workflow/approval
  POST /workflow/intent-gate
  POST /workflow/execute
`);
}

function resolveRepoPath(filePath) {
  return path.isAbsolute(filePath) ? filePath : path.resolve(REPO_ROOT, filePath);
}

function readJson(filePath, fallback = {}) {
  const resolved = resolveRepoPath(filePath);
  if (!existsSync(resolved)) return fallback;
  return JSON.parse(readFileSync(resolved, 'utf8'));
}

function jsonResponse(response, statusCode, payload) {
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Cache-Control': 'no-store',
  });
  response.end(`${JSON.stringify(payload, null, 2)}\n`);
}

function isLoopbackAddress(address = '') {
  return address === '127.0.0.1'
    || address === '::1'
    || address === '::ffff:127.0.0.1'
    || address === 'localhost';
}

function runNode(args, options = {}) {
  const result = spawnSync(process.execPath, args, {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    windowsHide: true,
    maxBuffer: 10 * 1024 * 1024,
    ...options,
  });
  return {
    ok: result.status === 0,
    status: result.status,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    error: result.error ? result.error.message : '',
  };
}

function runChecked(args) {
  const result = runNode(args);
  if (!result.ok) {
    const detail = result.stderr.trim() || result.stdout.trim() || result.error || `exit ${result.status}`;
    throw new Error(detail);
  }
  return result;
}

function parseJsonFromStdout(stdout, label) {
  const text = String(stdout || '');
  const jsonStart = text.indexOf('{');
  if (jsonStart < 0) throw new Error(`${label} did not print a JSON receipt.`);
  try {
    return JSON.parse(text.slice(jsonStart));
  } catch (error) {
    throw new Error(`${label} printed invalid JSON: ${error.message}`);
  }
}

function refreshRegistry(args) {
  return runChecked([
    'scripts/holoshell-program-registry.mjs',
    '--max-apps',
    String(args.maxApps),
  ]);
}

function refreshNetworkFreshness() {
  const sentinel = runChecked(['scripts/holoshell-network-change-sentinel.mjs', '--once']);
  runChecked(['scripts/holoshell-network-sentinel-service.mjs', '--status']);
  return sentinel;
}

function refreshGrokHeartbeat() {
  return runChecked(['scripts/holoshell-grok-heartbeat.mjs', '--refresh-setup', '--refresh-agent-lanes']);
}

function refreshServiceSupervisor() {
  return runChecked(['scripts/holoshell-service-supervisor.mjs', '--status', '--skip-control-probe']);
}

function refreshLiveFeed() {
  refreshNetworkFreshness();
  refreshGrokHeartbeat();
  refreshServiceSupervisor();
  refreshShellObjects();
  return runChecked(['scripts/holoshell-live-feed.mjs']);
}

function approvalBundle() {
  return runChecked(['scripts/holoshell-approval-bundle.mjs']);
}

function trustLedger() {
  return runChecked(['scripts/holoshell-trust-ledger.mjs']);
}

function refreshShellObjects() {
  return runChecked(['scripts/holoshell-shell-objects.mjs']);
}

function workflowApprovalBundle() {
  return runChecked(['scripts/holoshell-workflow-approval-bundle.mjs']);
}

function workflowIntentGate(strict = false) {
  const cli = ['scripts/holoshell-brain-intent-gate.mjs'];
  if (strict) cli.push('--strict');
  return runNode(cli);
}

function roomMarathonWorkflow(body = {}) {
  const cli = ['scripts/holoshell-room-marathon-workflow.mjs'];
  const add = (flag, value) => {
    if (value !== undefined && value !== null && value !== '') cli.push(flag, String(value));
  };
  add('--model', body.model);
  add('--model-route', body.modelRoute);
  add('--task-lane', body.taskLane);
  add('--task-tag', body.taskTag);
  if (body.cloudEscalationAllowed === true) cli.push('--cloud-escalation-allowed');
  add('--terminal-app', body.terminalApp);
  add('--browser-app', body.browserApp);
  add('--lofi-url', body.lofiUrl);
  add('--room-command', body.roomCommand);
  return runChecked(cli);
}

function sovereignRoomMarathon(body = {}) {
  const cli = ['scripts/holoshell-sovereign-room-marathon.mjs'];
  const add = (flag, value) => {
    if (value !== undefined && value !== null && value !== '') cli.push(flag, String(value));
  };
  add('--task-lane', body.taskLane);
  add('--task-tag', body.taskTag);
  add('--max-candidates', body.maxCandidates);
  add('--output', body.output);
  add('--js-output', body.jsOutput);
  add('--receipt-dir', body.receiptDir);
  if (body.cloudEscalationAllowed === true) cli.push('--cloud-escalation-allowed');
  if (body.claim === true) cli.push('--claim');
  add('--claim-task-id', body.claimTaskId || body.selectedTaskId || body.taskId);
  if (
    body.confirmClaim === true
    || body.confirmLocalClaim === true
    || body.claimConfirmation === 'local_room_task'
    || body.guard === 'local_room_task_claim'
  ) {
    cli.push('--confirm-claim');
  }
  cli.push('--json');
  const result = runChecked(cli);
  return {
    result,
    receipt: parseJsonFromStdout(result.stdout, 'sovereign room marathon'),
  };
}

function grokBuildWorkflow(body = {}) {
  const cli = ['scripts/holoshell-grok-build-workflow.mjs'];
  const add = (flag, value) => {
    if (value !== undefined && value !== null && value !== '') cli.push(flag, String(value));
  };
  add('--actor', body.actor);
  add('--mode', body.mode);
  add('--prompt', body.prompt || body.task || body.text);
  add('--model', body.model);
  add('--effort', body.effort);
  add('--reasoning-effort', body.reasoningEffort);
  add('--permission-mode', body.permissionMode);
  add('--sandbox', body.sandbox);
  add('--max-turns', body.maxTurns);
  add('--cwd', body.cwd);
  if (body.disableWebSearch === true) cli.push('--disable-web-search');
  if (body.noSubagents === true) cli.push('--no-subagents');
  if (body.noMemory === true) cli.push('--no-memory');
  if (body.noAltScreen === true) cli.push('--no-alt-screen');
  if (body.continueSession === true) cli.push('--continue');
  return runChecked(cli);
}

function holoclawRuntimeBridge(body = {}) {
  const cli = ['scripts/holoshell-holoclaw-runtime-bridge.mjs'];
  const add = (flag, value) => {
    if (value !== undefined && value !== null && value !== '') cli.push(flag, String(value));
  };
  add('--actor', body.actor);
  add('--intent', body.intent || body.text || body.ask || body.request);
  add('--prompt', body.prompt || body.task || body.chatPrompt);
  add('--runtime-mode', body.runtimeMode);
  add('--agent-handle', body.agentHandle);
  add('--provider', body.provider);
  add('--model', body.model);
  add('--selected-skill', body.selectedSkill || body.skill);
  return runChecked(cli);
}

function agentDispatch(body = {}) {
  const cli = ['scripts/holoshell-agent-dispatch.mjs'];
  const intent = body.intent || body.text || body.ask || body.request || '';
  const add = (flag, value) => {
    if (value !== undefined && value !== null && value !== '') cli.push(flag, String(value));
  };
  add('--actor', body.actor);
  add('--intent', intent);
  add('--prompt', body.prompt || body.chatPrompt);
  return runChecked(cli);
}

function founderCommand(body = {}) {
  const cli = ['scripts/holoshell-founder-command.mjs'];
  const add = (flag, value) => {
    if (value !== undefined && value !== null && value !== '') cli.push(flag, String(value));
  };
  add('--actor', body.actor);
  add('--intent', body.intent || body.text || body.ask || body.request);
  add('--model', body.model);
  add('--model-route', body.modelRoute);
  add('--task-lane', body.taskLane);
  add('--task-tag', body.taskTag);
  if (body.cloudEscalationAllowed === true) cli.push('--cloud-escalation-allowed');
  add('--lofi-url', body.lofiUrl);
  return runChecked(cli);
}

function laptopReasoningJob(args, body = {}) {
  const cli = [
    'scripts/holoshell-laptop-reasoning-bridge.mjs',
    '--once',
    '--dispatch-dir',
    path.join(args.tmpDir, 'agent-dispatches'),
    '--inbox-dir',
    path.join(args.tmpDir, 'laptop-reasoning-inbox'),
    '--result-dir',
    path.join(args.tmpDir, 'laptop-reasoning-results'),
    '--result-output',
    path.join(args.tmpDir, 'laptop-reasoning-result-latest.json'),
    '--bridge-output',
    path.join(args.tmpDir, 'laptop-reasoning-bridge-latest.json'),
    '--state',
    path.join(args.tmpDir, 'laptop-reasoning-bridge-state.json'),
  ];
  const resultText = body.resultText || body.answer || '';
  if (resultText) cli.push('--result-text', String(resultText));
  return runChecked(cli);
}

function conversationPlanDispatchWorkflow(args, body = {}) {
  const mode = String(body.executionMode || 'plan_only');
  const allowedModes = new Set(['plan_only', 'dry_run_room_tasks', 'execute_room_tasks']);
  if (!allowedModes.has(mode)) {
    const error = new Error(`Unsupported conversation plan executionMode: ${mode}`);
    error.statusCode = 400;
    throw error;
  }

  const wantsDryRun = body.dryRunRoomTasks === true || mode === 'dry_run_room_tasks';
  const wantsExecute = body.executeRoomTasks === true || mode === 'execute_room_tasks';
  if (wantsDryRun && wantsExecute) {
    const error = new Error('Conversation plan dry-run and execute flags are mutually exclusive.');
    error.statusCode = 400;
    throw error;
  }
  if (body.executeClaim === true && !body.claimTaskId) {
    const error = new Error('Conversation plan claim execution requires claimTaskId.');
    error.statusCode = 400;
    throw error;
  }

  const cli = ['scripts/holoshell-conversation-plan-dispatcher.mjs'];
  const add = (flag, value) => {
    if (value !== undefined && value !== null && value !== '') cli.push(flag, String(value));
  };
  add('--plan', body.plan || body.planReceipt || body.planPath || tmpPath(args, 'brittney-conversation-plan-latest.json'));
  add('--output', body.output || body.dispatchReceipt || tmpPath(args, 'conversation-plan-dispatch-latest.json'));
  add('--js-output', body.jsOutput || tmpPath(args, 'conversation-plan-dispatch-latest.js'));
  add('--dispatch-dir', body.dispatchDir || path.join(args.tmpDir, 'conversation-plan-dispatches'));
  add('--room-task-output', body.roomTaskOutput || tmpPath(args, 'conversation-plan-room-tasks-latest.json'));
  if (wantsDryRun) cli.push('--dry-run-room-tasks');
  if (wantsExecute) cli.push('--execute-room-tasks');
  if (body.executeClaim === true) {
    cli.push('--execute-claim');
    add('--claim-task-id', body.claimTaskId);
  }
  cli.push('--json');
  const result = runChecked(cli);
  return {
    result,
    receipt: parseJsonFromStdout(result.stdout, 'conversation plan dispatcher'),
  };
}

function tmpPath(args, fileName) {
  return path.join(args.tmpDir, fileName);
}

function safeActionArgs(body = {}) {
  const action = String(body.action || '').trim();
  if (!action) throw new Error('POST /action requires an action.');
  const cliArgs = ['scripts/holoshell-action-executor.mjs', '--action', action];
  for (const [key, flag] of Object.entries(REQUEST_FLAG_MAP)) {
    if (body[key] === undefined || body[key] === null || body[key] === '') continue;
    cliArgs.push(flag, String(body[key]));
  }
  return cliArgs;
}

function stageAction(args, body = {}) {
  refreshRegistry(args);
  const actionResult = runChecked(safeActionArgs(body));
  const trustResult = trustLedger();
  approvalBundle();
  refreshLiveFeed();
  return {
    ok: true,
    action: readJson(tmpPath(args, 'action-latest.json'), {}),
    approval: readJson(tmpPath(args, 'approval-latest.json'), {}),
    trustLedger: readJson(tmpPath(args, 'trust-ledger.json'), {}),
    feed: readJson(tmpPath(args, 'live-feed.json'), {}),
    logs: {
      action: actionResult.stdout.trim(),
      trust: trustResult.stdout.trim(),
    },
  };
}

function latestSnapshot(args) {
  return {
    feed: readJson(tmpPath(args, 'live-feed.json'), {}),
    registry: readJson(tmpPath(args, 'program-registry.json'), {}),
    shellObjects: readJson(tmpPath(args, 'shell-objects.json'), {}),
    action: readJson(tmpPath(args, 'action-latest.json'), {}),
    approval: readJson(tmpPath(args, 'approval-latest.json'), {}),
    trustLedger: readJson(tmpPath(args, 'trust-ledger.json'), {}),
    workflow: readJson(tmpPath(args, 'workflow-latest.json'), {}),
    workflowApproval: readJson(tmpPath(args, 'workflow-approval-latest.json'), {}),
    workflowIntentGate: readJson(tmpPath(args, 'brain-intent-gate-latest.json'), {}),
    grokBuildSetup: readJson(tmpPath(args, 'grok-build-setup.json'), {}),
    grokHeartbeat: readJson(tmpPath(args, 'grok-heartbeat.json'), {}),
    serviceSupervisor: readJson(tmpPath(args, 'service-supervisor.json'), {}),
    founderCommand: readJson(tmpPath(args, 'founder-command-latest.json'), {}),
    sovereignRoomMarathon: readJson(tmpPath(args, 'sovereign-room-marathon-latest.json'), {}),
    holoclawRuntimeBridge: readJson(tmpPath(args, 'holoclaw-runtime-bridge-latest.json'), {}),
    agentDispatch: readJson(tmpPath(args, 'agent-dispatch-latest.json'), {}),
    laptopReasoningBridge: readJson(tmpPath(args, 'laptop-reasoning-bridge-latest.json'), {}),
    laptopReasoningResult: readJson(tmpPath(args, 'laptop-reasoning-result-latest.json'), {}),
    conversationPlanDispatch: readJson(tmpPath(args, 'conversation-plan-dispatch-latest.json'), {}),
  };
}

function commandFromApprovalBundle(bundle) {
  const command = Array.isArray(bundle.execution?.command) ? bundle.execution.command : [];
  if (!bundle.execution?.allowed || command.length < 2) {
    throw new Error(bundle.execution?.blockedReason || 'Approval bundle does not contain an executable command.');
  }
  const first = String(command[0] || '').toLowerCase();
  const script = String(command[1] || '').replaceAll('/', path.sep);
  if (first !== 'node' || !script.endsWith(`scripts${path.sep}holoshell-action-executor.mjs`)) {
    throw new Error('Approval command is not a HoloShell action executor command.');
  }
  return command.slice(1);
}

function executeApproval(args, body = {}) {
  if (!args.enableExecute) {
    const disabled = new Error('Execution is disabled. Restart the daemon with --enable-execute to allow approved mutations.');
    disabled.statusCode = 403;
    throw disabled;
  }
  if (body.confirm !== 'execute') {
    const confirmation = new Error('POST /approval/execute requires confirm: "execute".');
    confirmation.statusCode = 400;
    throw confirmation;
  }
  const bundle = readJson(body.approvalBundle || tmpPath(args, 'approval-latest.json'), null);
  if (!bundle) throw new Error('Approval bundle was not found.');
  if (!body.approvalId || body.approvalId !== bundle.approvalId) throw new Error('Approval id mismatch.');
  if (!body.nonce || body.nonce !== bundle.nonce) throw new Error('Approval nonce mismatch.');
  const command = commandFromApprovalBundle(bundle);
  const executeResult = runChecked(command);
  const trustResult = trustLedger();
  approvalBundle();
  refreshLiveFeed();
  return {
    ok: true,
    action: readJson(tmpPath(args, 'action-latest.json'), {}),
    approval: readJson(tmpPath(args, 'approval-latest.json'), {}),
    trustLedger: readJson(tmpPath(args, 'trust-ledger.json'), {}),
    feed: readJson(tmpPath(args, 'live-feed.json'), {}),
    logs: {
      execute: executeResult.stdout.trim(),
      trust: trustResult.stdout.trim(),
    },
  };
}

function commandFromWorkflowApprovalBundle(bundle) {
  const command = Array.isArray(bundle.execution?.command) ? bundle.execution.command : [];
  if (!bundle.execution?.allowed || command.length < 2) {
    throw new Error(bundle.execution?.blockedReason || 'Workflow approval bundle does not contain an executable command.');
  }
  const first = String(command[0] || '').toLowerCase();
  const script = String(command[1] || '').replaceAll('/', path.sep);
  const allowedWorkflowScripts = [
    `scripts${path.sep}holoshell-room-marathon-workflow.mjs`,
    `scripts${path.sep}holoshell-grok-build-workflow.mjs`,
    `scripts${path.sep}holoshell-holoclaw-runtime-bridge.mjs`,
  ];
  if (first !== 'node' || !allowedWorkflowScripts.some((allowed) => script.endsWith(allowed))) {
    throw new Error('Workflow approval command is not a HoloShell workflow command.');
  }
  if (!command.includes('--execute-workflow')) {
    throw new Error('Workflow approval command is not marked for execution.');
  }
  return command.slice(1);
}

function executeWorkflow(args, body = {}) {
  if (!args.enableExecute) {
    const disabled = new Error('Execution is disabled. Restart the daemon with --enable-execute to allow approved workflow mutations.');
    disabled.statusCode = 403;
    throw disabled;
  }
  if (body.confirm !== 'execute') {
    const confirmation = new Error('POST /workflow/execute requires confirm: "execute".');
    confirmation.statusCode = 400;
    throw confirmation;
  }
  const bundle = readJson(body.workflowApprovalBundle || tmpPath(args, 'workflow-approval-latest.json'), null);
  if (!bundle) throw new Error('Workflow approval bundle was not found.');
  if (!body.approvalId || body.approvalId !== bundle.approvalId) throw new Error('Workflow approval id mismatch.');
  if (!body.nonce || body.nonce !== (bundle.nonce || bundle.execution?.nonce)) throw new Error('Workflow approval nonce mismatch.');
  const adapter = String(bundle.sourceAnchors?.adapter || '').replaceAll('/', path.sep);
  const localApprovalGateCases = new Map([
    [`scripts${path.sep}holoshell-grok-build-workflow.mjs`, 'holoshell-grok-build-local-approval.v0'],
    [`scripts${path.sep}holoshell-holoclaw-runtime-bridge.mjs`, 'holoshell-holoclaw-runtime-bridge.v0'],
  ]);
  const localApprovalGateCase = [...localApprovalGateCases.entries()]
    .find(([script]) => adapter.endsWith(script))?.[1] || '';
  const usesLocalApprovalGate = Boolean(localApprovalGateCase);
  let intentGateResult = { ok: true, stdout: 'Workflow uses its local approval gate.', stderr: '' };
  let intentGate = readJson(tmpPath(args, 'brain-intent-gate-latest.json'), {});
  if (usesLocalApprovalGate) {
    if (
      intentGate.summary?.caseId !== localApprovalGateCase
      || intentGate.summary?.runtimeBlocking !== false
      || !intentGate.summary?.executionAllowed
      || (intentGate.summary?.workflowId && intentGate.summary.workflowId !== bundle.workflowId)
    ) {
      const blocked = new Error(intentGate.summary?.blockedReason || 'Local approval gate is missing or blocked. Restage the workflow.');
      blocked.statusCode = 403;
      throw blocked;
    }
  } else {
    intentGateResult = workflowIntentGate(true);
    intentGate = readJson(tmpPath(args, 'brain-intent-gate-latest.json'), {});
    if (!intentGateResult.ok || !intentGate.summary?.executionAllowed) {
      const blocked = new Error(intentGate.summary?.blockedReason || intentGateResult.stderr.trim() || 'Brain intent runtime gate blocked workflow execution.');
      blocked.statusCode = 403;
      throw blocked;
    }
  }
  const command = commandFromWorkflowApprovalBundle(bundle);
  const executeResult = runChecked(command);
  if (String(command[0] || '').replaceAll('/', path.sep).endsWith(`scripts${path.sep}holoshell-room-marathon-workflow.mjs`)) {
    workflowApprovalBundle();
  }
  refreshLiveFeed();
  return {
    ok: true,
    workflow: readJson(tmpPath(args, 'workflow-latest.json'), {}),
    workflowApproval: readJson(tmpPath(args, 'workflow-approval-latest.json'), {}),
    workflowIntentGate: intentGate,
    feed: readJson(tmpPath(args, 'live-feed.json'), {}),
    logs: {
      intentGate: intentGateResult.stdout.trim(),
      execute: executeResult.stdout.trim(),
    },
  };
}

function stageRoomMarathon(args, body = {}) {
  refreshRegistry(args);
  const workflowResult = roomMarathonWorkflow(body);
  const workflowApprovalResult = workflowApprovalBundle();
  const workflowIntentGateResult = workflowIntentGate(false);
  refreshLiveFeed();
  return {
    ok: true,
    workflow: readJson(tmpPath(args, 'workflow-latest.json'), {}),
    workflowApproval: readJson(tmpPath(args, 'workflow-approval-latest.json'), {}),
    workflowIntentGate: readJson(tmpPath(args, 'brain-intent-gate-latest.json'), {}),
    feed: readJson(tmpPath(args, 'live-feed.json'), {}),
    logs: {
      workflow: workflowResult.stdout.trim(),
      workflowApproval: workflowApprovalResult.stdout.trim(),
      workflowIntentGate: workflowIntentGateResult.stdout.trim(),
    },
  };
}

function stageSovereignRoomMarathon(args, body = {}) {
  const room = sovereignRoomMarathon(body);
  refreshLiveFeed();
  return {
    ok: room.receipt?.summary?.status !== 'blocked_queue_unavailable'
      && room.receipt?.summary?.status !== 'claim_failed',
    sovereignRoomMarathon: readJson(tmpPath(args, 'sovereign-room-marathon-latest.json'), room.receipt || {}),
    feed: readJson(tmpPath(args, 'live-feed.json'), {}),
    logs: {
      sovereignRoomMarathon: room.result.stdout.trim(),
    },
  };
}

function stageGrokBuild(args, body = {}) {
  refreshRegistry(args);
  const workflowResult = grokBuildWorkflow(body);
  refreshLiveFeed();
  return {
    ok: true,
    grokBuildSetup: readJson(tmpPath(args, 'grok-build-setup.json'), {}),
    grokHeartbeat: readJson(tmpPath(args, 'grok-heartbeat.json'), {}),
    workflow: readJson(tmpPath(args, 'workflow-latest.json'), {}),
    workflowApproval: readJson(tmpPath(args, 'workflow-approval-latest.json'), {}),
    workflowIntentGate: readJson(tmpPath(args, 'brain-intent-gate-latest.json'), {}),
    feed: readJson(tmpPath(args, 'live-feed.json'), {}),
    logs: {
      workflow: workflowResult.stdout.trim(),
      workflowApproval: 'Grok Build workflow wrote its nonce-bound approval bundle.',
      workflowIntentGate: 'Grok Build workflow wrote a local approval gate.',
    },
  };
}

function stageHoloClawRuntimeBridge(args, body = {}) {
  refreshRegistry(args);
  const bridgeResult = holoclawRuntimeBridge(body);
  const workflowApprovalResult = workflowApprovalBundle();
  refreshLiveFeed();
  return {
    ok: true,
    holoclawRuntimeBridge: readJson(tmpPath(args, 'holoclaw-runtime-bridge-latest.json'), {}),
    workflow: readJson(tmpPath(args, 'workflow-latest.json'), {}),
    workflowApproval: readJson(tmpPath(args, 'workflow-approval-latest.json'), {}),
    workflowIntentGate: readJson(tmpPath(args, 'brain-intent-gate-latest.json'), {}),
    feed: readJson(tmpPath(args, 'live-feed.json'), {}),
    logs: {
      holoclawRuntimeBridge: bridgeResult.stdout.trim(),
      workflowApproval: workflowApprovalResult.stdout.trim(),
      workflowIntentGate: 'HoloClaw bridge wrote a local runtime gate.',
    },
  };
}

function stageFounderCommand(args, body = {}) {
  refreshRegistry(args);
  const commandResult = founderCommand(body);
  refreshLiveFeed();
  return {
    ok: true,
    founderCommand: readJson(tmpPath(args, 'founder-command-latest.json'), {}),
    dispatch: readJson(tmpPath(args, 'agent-dispatch-latest.json'), {}),
    workflow: readJson(tmpPath(args, 'workflow-latest.json'), {}),
    workflowApproval: readJson(tmpPath(args, 'workflow-approval-latest.json'), {}),
    workflowIntentGate: readJson(tmpPath(args, 'brain-intent-gate-latest.json'), {}),
    feed: readJson(tmpPath(args, 'live-feed.json'), {}),
    logs: {
      founderCommand: commandResult.stdout.trim(),
    },
  };
}

function stageLaptopReasoningJob(args, body = {}) {
  const bridgeResult = laptopReasoningJob(args, body);
  refreshLiveFeed();
  return {
    ok: true,
    laptopReasoningBridge: readJson(tmpPath(args, 'laptop-reasoning-bridge-latest.json'), {}),
    laptopReasoningResult: readJson(tmpPath(args, 'laptop-reasoning-result-latest.json'), {}),
    feed: readJson(tmpPath(args, 'live-feed.json'), {}),
    logs: {
      laptopReasoningBridge: bridgeResult.stdout.trim(),
    },
  };
}

function stageConversationPlanDispatch(args, body = {}) {
  const dispatch = conversationPlanDispatchWorkflow(args, body);
  const receipt = dispatch.receipt || {};
  const validationPassed = receipt.validation?.status === 'passed';
  return {
    ok: validationPassed && receipt.summary?.status !== 'blocked',
    conversationPlanDispatch: receipt,
    dispatchReceipt: receipt,
    downstreamReceiptsRequired: receipt.downstreamReceipts?.required === true,
    completionClaimAllowed: receipt.summary?.completionClaimAllowed === true,
    logs: {
      conversationPlanDispatch: dispatch.result.stdout.trim(),
    },
  };
}

function stageAgentDispatch(args, body = {}) {
  refreshRegistry(args);
  const dispatchResult = agentDispatch(body);
  const dispatch = readJson(tmpPath(args, 'agent-dispatch-latest.json'), {});
  if (dispatch.summary?.status !== 'ready_to_stage') {
    refreshLiveFeed();
    return {
      ok: false,
      dispatch,
      feed: readJson(tmpPath(args, 'live-feed.json'), {}),
      logs: {
        dispatch: dispatchResult.stdout.trim(),
      },
    };
  }

  const route = dispatch.dispatch?.route || '';
  const routedBody = dispatch.dispatch?.body || {};
  let downstream;
  if (route === '/workflow/grok-build') downstream = stageGrokBuild(args, routedBody);
  else if (route === '/workflow/holoclaw-runtime-bridge') downstream = stageHoloClawRuntimeBridge(args, routedBody);
  else if (route === '/workflow/founder-command') downstream = stageFounderCommand(args, routedBody);
  else if (route === '/workflow/room-marathon') downstream = stageRoomMarathon(args, routedBody);
  else if (route === '/workflow/sovereign-room-marathon') downstream = stageSovereignRoomMarathon(args, routedBody);
  else if (route === '/workflow/laptop-reasoning-job') downstream = stageLaptopReasoningJob(args, routedBody);
  else if (route === '/workflow/conversation-plan-dispatch') downstream = stageConversationPlanDispatch(args, routedBody);
  else if (route === '/action') downstream = stageAction(args, routedBody);
  else {
    const error = new Error(`Agent dispatch selected unsupported route: ${route || 'none'}`);
    error.statusCode = 422;
    throw error;
  }

  return {
    ok: true,
    dispatch,
    routedTo: dispatch.dispatch,
    action: downstream.action,
    approval: downstream.approval,
    workflow: downstream.workflow,
    workflowApproval: downstream.workflowApproval,
    workflowIntentGate: downstream.workflowIntentGate,
    grokBuildSetup: downstream.grokBuildSetup,
    holoclawRuntimeBridge: downstream.holoclawRuntimeBridge,
    founderCommand: downstream.founderCommand,
    laptopReasoningBridge: downstream.laptopReasoningBridge,
    laptopReasoningResult: downstream.laptopReasoningResult,
    conversationPlanDispatch: downstream.conversationPlanDispatch,
    sovereignRoomMarathon: downstream.sovereignRoomMarathon,
    dispatchReceipt: downstream.dispatchReceipt,
    downstreamReceiptsRequired: downstream.downstreamReceiptsRequired,
    completionClaimAllowed: downstream.completionClaimAllowed,
    feed: downstream.feed || readJson(tmpPath(args, 'live-feed.json'), {}),
    logs: {
      dispatch: dispatchResult.stdout.trim(),
      downstream: downstream.logs || {},
    },
  };
}

function routeGet(args, pathname) {
  if (pathname === '/health') {
    return {
      ok: true,
      schemaVersion: 'hololand.holoshell.control-daemon.v0.1.0',
      status: 'online',
      executeEnabled: args.enableExecute,
      trustedExecuteEnabled: Boolean(args.enableExecute && args.enableTrustedExecute),
      workflowIntentGateRequired: true,
      host: args.host,
      port: args.port,
      pid: process.pid,
      platform: process.platform,
      arch: process.arch,
      release: os.release(),
    };
  }
  if (pathname === '/feed') return readJson(tmpPath(args, 'live-feed.json'), {});
  if (pathname === '/registry') return readJson(tmpPath(args, 'program-registry.json'), {});
  if (pathname === '/action/latest') return readJson(tmpPath(args, 'action-latest.json'), {});
  if (pathname === '/approval/latest') return readJson(tmpPath(args, 'approval-latest.json'), {});
  if (pathname === '/trust/ledger') return readJson(tmpPath(args, 'trust-ledger.json'), {});
  if (pathname === '/workflow/latest') return readJson(tmpPath(args, 'workflow-latest.json'), {});
  if (pathname === '/workflow/approval/latest') return readJson(tmpPath(args, 'workflow-approval-latest.json'), {});
  if (pathname === '/workflow/intent-gate/latest') return readJson(tmpPath(args, 'brain-intent-gate-latest.json'), {});
  if (pathname === '/workflow/grok-build/setup') return readJson(tmpPath(args, 'grok-build-setup.json'), {});
  if (pathname === '/workflow/holoclaw-runtime-bridge/latest') {
    return readJson(tmpPath(args, 'holoclaw-runtime-bridge-latest.json'), {});
  }
  if (pathname === '/agents/grok-heartbeat') return readJson(tmpPath(args, 'grok-heartbeat.json'), {});
  if (pathname === '/services/supervisor') return readJson(tmpPath(args, 'service-supervisor.json'), {});
  if (pathname === '/workflow/founder-command/latest') return readJson(tmpPath(args, 'founder-command-latest.json'), {});
  if (pathname === '/workflow/sovereign-room-marathon/latest') return readJson(tmpPath(args, 'sovereign-room-marathon-latest.json'), {});
  if (pathname === '/dispatch/latest') return readJson(tmpPath(args, 'agent-dispatch-latest.json'), {});
  if (pathname === '/workflow/conversation-plan-dispatch/latest') {
    return readJson(tmpPath(args, 'conversation-plan-dispatch-latest.json'), {});
  }
  if (pathname === '/workflow/laptop-reasoning/latest') {
    return {
      bridge: readJson(tmpPath(args, 'laptop-reasoning-bridge-latest.json'), {}),
      result: readJson(tmpPath(args, 'laptop-reasoning-result-latest.json'), {}),
    };
  }
  const error = new Error(`Unknown route: ${pathname}`);
  error.statusCode = 404;
  throw error;
}

function routePost(args, pathname, body) {
  if (pathname === '/action') return stageAction(args, body);
  if (pathname === '/approval/execute') return executeApproval(args, body);
  if (pathname === '/workflow/agent-dispatch') return stageAgentDispatch(args, body);
  if (pathname === '/workflow/laptop-reasoning-job') return stageLaptopReasoningJob(args, body);
  if (pathname === '/workflow/conversation-plan-dispatch') return stageConversationPlanDispatch(args, body);
  if (pathname === '/workflow/room-marathon') return stageRoomMarathon(args, body);
  if (pathname === '/workflow/sovereign-room-marathon') return stageSovereignRoomMarathon(args, body);
  if (pathname === '/workflow/grok-build') return stageGrokBuild(args, body);
  if (pathname === '/workflow/holoclaw-runtime-bridge') return stageHoloClawRuntimeBridge(args, body);
  if (pathname === '/workflow/founder-command') return stageFounderCommand(args, body);
  if (pathname === '/workflow/approval') {
    const activeWorkflow = readJson(tmpPath(args, 'workflow-latest.json'), {});
    const activeAdapter = String(activeWorkflow.sourceAnchors?.adapter || '').replaceAll('/', path.sep);
    const workflowOwnsApproval =
      activeAdapter.endsWith(`scripts${path.sep}holoshell-grok-build-workflow.mjs`);
    if (!workflowOwnsApproval) workflowApprovalBundle();
    refreshLiveFeed();
    return {
      ok: true,
      workflowApproval: readJson(tmpPath(args, 'workflow-approval-latest.json'), {}),
      feed: readJson(tmpPath(args, 'live-feed.json'), {}),
    };
  }
  if (pathname === '/workflow/intent-gate') {
    const intentGateResult = workflowIntentGate(false);
    refreshLiveFeed();
    return {
      ok: true,
      workflowIntentGate: readJson(tmpPath(args, 'brain-intent-gate-latest.json'), {}),
      feed: readJson(tmpPath(args, 'live-feed.json'), {}),
      logs: {
        workflowIntentGate: intentGateResult.stdout.trim(),
      },
    };
  }
  if (pathname === '/workflow/execute') return executeWorkflow(args, body);
  const error = new Error(`Unknown route: ${pathname}`);
  error.statusCode = 404;
  throw error;
}

async function readBody(request) {
  const chunks = [];
  let total = 0;
  for await (const chunk of request) {
    total += chunk.length;
    if (total > MAX_BODY_BYTES) throw new Error('Request body is too large.');
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  const text = Buffer.concat(chunks).toString('utf8').trim();
  return text ? JSON.parse(text) : {};
}

function createServer(args) {
  return http.createServer(async (request, response) => {
    try {
      if (!isLoopbackAddress(request.socket.remoteAddress)) {
        jsonResponse(response, 403, { ok: false, error: 'Loopback access only.' });
        return;
      }
      if (request.method === 'OPTIONS') {
        jsonResponse(response, 204, {});
        return;
      }
      const url = new URL(request.url || '/', `http://${args.host}:${args.port}`);
      if (request.method === 'GET') {
        jsonResponse(response, 200, routeGet(args, url.pathname));
        return;
      }
      if (request.method === 'POST') {
        const body = await readBody(request);
        jsonResponse(response, 200, routePost(args, url.pathname, body));
        return;
      }
      jsonResponse(response, 405, { ok: false, error: 'Method not allowed.' });
    } catch (error) {
      jsonResponse(response, error.statusCode || 500, { ok: false, error: error.message });
    }
  });
}

function runSelfTest(args) {
  const health = routeGet(args, '/health');
  const snapshot = latestSnapshot(args);
  const staged = stageAction(args, { action: 'list_programs' });
  const trust = routeGet(args, '/trust/ledger');
  const executeBlocked = (() => {
    try {
      executeApproval(args, { approvalId: 'missing', nonce: 'missing', confirm: 'execute' });
      return false;
    } catch (error) {
      return error.statusCode === 403;
    }
  })();
  const workflowExecuteBlocked = (() => {
    try {
      executeWorkflow(args, { approvalId: 'missing', nonce: 'missing', confirm: 'execute' });
      return false;
    } catch (error) {
      return error.statusCode === 403;
    }
  })();
  const intentGate = (() => {
    const result = workflowIntentGate(false);
    if (!result.ok) return null;
    return readJson(tmpPath(args, 'brain-intent-gate-latest.json'), null);
  })();
  const failures = [];
  if (health.status !== 'online') failures.push('health route did not report online');
  if (!staged.action?.summary) failures.push('stage action did not write an action receipt');
  if (!trust?.summary) failures.push('trust ledger route did not return a summary');
  if (!routeGet(args, '/workflow/sovereign-room-marathon/latest')) failures.push('sovereign room marathon route did not return a payload');
  if (!staged.feed?.summary) failures.push('stage action did not refresh the live feed');
  if (!executeBlocked) failures.push('execution should be blocked without --enable-execute');
  if (!workflowExecuteBlocked) failures.push('workflow execution should be blocked without --enable-execute');
  if (!intentGate?.summary?.runtimeBlocking) failures.push('brain intent gate should produce a runtime-blocking receipt');
  if (!intentGate?.summary?.executionAllowed) failures.push('brain intent gate should allow the fixture HoloShell workflow');
  if (failures.length) throw new Error(`Self-test failed:\n- ${failures.join('\n- ')}`);
  return {
    ok: true,
    health,
    before: {
      actionStatus: snapshot.action?.summary?.status || 'unknown',
      approvalStatus: snapshot.approval?.summary?.status || 'unknown',
    },
    after: {
      actionStatus: staged.action?.summary?.status || 'unknown',
      approvalStatus: staged.approval?.summary?.status || 'unknown',
      trustStatus: trust?.summary?.status || 'unknown',
      workflowIntentGateStatus: intentGate?.summary?.status || 'unknown',
    },
  };
}

try {
  const args = parseArgs(process.argv.slice(2));
  if (args.selfTest) {
    const result = runSelfTest(args);
    if (args.json) console.log(JSON.stringify(result, null, 2));
    else {
      console.log('HoloShell control daemon self-test: pass');
      console.log(`Health: ${result.health.status}`);
      console.log(`Execute enabled: ${result.health.executeEnabled ? 'yes' : 'no'}`);
      console.log(`Latest action after self-test: ${result.after.actionStatus}`);
      console.log(`Latest approval after self-test: ${result.after.approvalStatus}`);
    }
  } else {
    const server = createServer(args);
    server.listen(args.port, args.host, () => {
      console.log(`HoloShell control daemon: http://${args.host}:${args.port}`);
      console.log(`Execute enabled: ${args.enableExecute ? 'yes' : 'no'}`);
    });
  }
} catch (error) {
  console.error(`holoshell-control-daemon failed: ${error.message}`);
  process.exit(1);
}
