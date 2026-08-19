#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import crypto from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCHEMA_VERSION = 'hololand.holoshell.workflow-approval.v0.1.0';
const WORKFLOW_SCHEMA_VERSION = 'hololand.holoshell.workflow.v0.1.0';
const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '..');
const DEFAULT_TMP = path.join('.tmp', 'holoshell');
const DEFAULT_WORKFLOW = path.join(DEFAULT_TMP, 'workflow-latest.json');
const DEFAULT_OUTPUT = path.join(DEFAULT_TMP, 'workflow-approval-latest.json');
const DEFAULT_JS_OUTPUT = path.join(DEFAULT_TMP, 'workflow-approval-latest.js');
const DEFAULT_BUNDLE_DIR = path.join(DEFAULT_TMP, 'workflow-approval-bundles');

function parseArgs(argv) {
  const args = {
    json: false,
    selfTest: false,
    workflow: DEFAULT_WORKFLOW,
    output: DEFAULT_OUTPUT,
    jsOutput: DEFAULT_JS_OUTPUT,
    bundleDir: DEFAULT_BUNDLE_DIR,
    ttlMinutes: 10,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--json') args.json = true;
    else if (arg === '--self-test') args.selfTest = true;
    else if (arg === '--workflow') args.workflow = argv[++index];
    else if (arg === '--output') args.output = argv[++index];
    else if (arg === '--js-output') args.jsOutput = argv[++index];
    else if (arg === '--bundle-dir') args.bundleDir = argv[++index];
    else if (arg === '--ttl-minutes') args.ttlMinutes = Number(argv[++index] || args.ttlMinutes);
    else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!Number.isFinite(args.ttlMinutes) || args.ttlMinutes < 1) args.ttlMinutes = 10;
  return args;
}

function printHelp() {
  console.log(`HoloShell workflow approval bundle

Usage:
  node scripts/holoshell-workflow-approval-bundle.mjs [options]

Options:
  --workflow <path>       Workflow receipt. Defaults to .tmp/holoshell/workflow-latest.json.
  --output <path>         Latest approval output. Defaults to .tmp/holoshell/workflow-approval-latest.json.
  --js-output <path>      Browser bootstrap JS. Defaults to .tmp/holoshell/workflow-approval-latest.js.
  --bundle-dir <path>     Archive bundle dir. Defaults to .tmp/holoshell/workflow-approval-bundles.
  --ttl-minutes <n>       Approval expiry. Defaults to 10.
  --self-test             Run fixture assertions.
  --json                  Print JSON.
  -h, --help              Show this help.
`);
}

function resolveRepoPath(filePath) {
  return path.isAbsolute(filePath) ? filePath : path.resolve(REPO_ROOT, filePath);
}

function readJson(filePath, fallback = null) {
  const resolved = resolveRepoPath(filePath);
  if (!existsSync(resolved)) return fallback;
  return JSON.parse(readFileSync(resolved, 'utf8'));
}

function writeJson(filePath, value) {
  const resolved = resolveRepoPath(filePath);
  mkdirSync(path.dirname(resolved), { recursive: true });
  writeFileSync(resolved, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  return resolved;
}

function writeBrowserBootstrap(filePath, bundle) {
  const resolved = resolveRepoPath(filePath);
  mkdirSync(path.dirname(resolved), { recursive: true });
  const payload = JSON.stringify(bundle, null, 2).replace(/<\/script/gi, '<\\/script');
  writeFileSync(resolved, `window.HOLOSHELL_WORKFLOW_APPROVAL = ${payload};\n`, 'utf8');
  return resolved;
}

function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
}

function hashValue(value) {
  return crypto.createHash('sha256').update(stableStringify(value)).digest('hex');
}

function shortHash(value, length = 12) {
  return hashValue(value).slice(0, length);
}

function shellArg(value) {
  const text = String(value ?? '');
  if (/^[A-Za-z0-9_./:=@-]+$/.test(text)) return text;
  return `"${text.replace(/"/g, '\\"')}"`;
}

function fixtureWorkflow() {
  return {
    schemaVersion: WORKFLOW_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    workflowId: 'hswf-fixture-room-marathon',
    profile: 'room_marathon_lofi',
    title: 'Room Marathon with Lofi',
    modelRoute: {
      provider: 'sovereign',
      route: 'sovereign_local',
      model: 'sovereign-local',
      taskLane: 'local',
      taskTag: 'local',
      cloudEscalationAllowed: false,
    },
    media: { url: 'https://www.youtube.com/watch?v=jfKfPfyJRdk' },
    steps: [
      { id: 'resolve-sovereign-room', status: 'resolved', permissionEnvelope: 'read_only', approvalRequired: false, targetResolved: true },
      { id: 'open-terminal', status: 'approval_required', permissionEnvelope: 'guarded_execute', approvalRequired: true, targetResolved: true, action: { action: 'launch_app', app: 'wt' } },
      { id: 'stage-room-command', status: 'approval_required', permissionEnvelope: 'guarded_execute', approvalRequired: true, targetResolved: true, action: { action: 'type_text', processName: 'WindowsTerminal', text: 'node hooks\\team-connect.mjs --queue' } },
      { id: 'submit-room-command', status: 'approval_required', permissionEnvelope: 'guarded_execute', approvalRequired: true, targetResolved: true, action: { action: 'hotkey', processName: 'WindowsTerminal', hotkey: 'Enter' } },
      { id: 'open-browser', status: 'approval_required', permissionEnvelope: 'guarded_execute', approvalRequired: true, targetResolved: true, action: { action: 'launch_app', app: 'Chrome' } },
      { id: 'play-lofi-youtube', status: 'approval_required', permissionEnvelope: 'guarded_execute', approvalRequired: true, targetResolved: true, action: { action: 'open_url', url: 'https://www.youtube.com/watch?v=jfKfPfyJRdk' } },
    ],
    summary: {
      status: 'pending_user_approval',
      stepCount: 6,
      guardedStepCount: 5,
      pendingApprovalCount: 5,
      targetResolvedCount: 6,
      stageErrorCount: 0,
      model: 'sovereign-local',
      modelRoute: 'sovereign_local',
      taskLane: 'local',
      taskTag: 'local',
      cloudEscalationAllowed: false,
      mutationExecuted: false,
    },
  };
}

function workflowRequest(workflow) {
  if (workflow.summary?.workflowKind === 'holoclaw_runtime_bridge') {
    return {
      profile: workflow.profile || 'holoclaw_runtime_bridge',
      intent: workflow.request?.intentPreview || '',
      prompt: '',
      runtimeMode: workflow.holoclawRuntime?.runtimeMode || 'tick',
      agentHandle: workflow.holoclawRuntime?.envPlan?.HOLOSCRIPT_AGENT_HANDLE || 'holoclaw',
      provider: workflow.modelRoute?.provider || 'sovereign',
      model: workflow.summary?.model || workflow.modelRoute?.model || 'sovereign-local',
      selectedSkill: workflow.holoclawRuntime?.skills?.[0]?.name || '',
    };
  }
  const byId = Object.fromEntries((workflow.steps || []).map((step) => [step.id, step]));
  return {
    profile: workflow.profile || 'room_marathon_lofi',
    model: workflow.summary?.model || workflow.modelRoute?.model || 'sovereign-local',
    modelRoute: workflow.summary?.modelRoute || workflow.modelRoute?.route || 'sovereign_local',
    taskLane: workflow.summary?.taskLane || workflow.modelRoute?.taskLane || 'local',
    taskTag: workflow.summary?.taskTag || workflow.modelRoute?.taskTag || 'local',
    cloudEscalationAllowed: workflow.summary?.cloudEscalationAllowed === true || workflow.modelRoute?.cloudEscalationAllowed === true,
    terminalApp: byId['open-terminal']?.action?.app || 'wt',
    browserApp: byId['open-browser']?.action?.app || 'Chrome',
    lofiUrl: byId['play-lofi-youtube']?.action?.url || workflow.media?.url || '',
    roomCommand: byId['stage-room-command']?.action?.text || '',
  };
}

function executeCommand(approvalId, nonce, bundlePath, workflow) {
  if (workflow?.summary?.workflowKind === 'holoclaw_runtime_bridge') {
    return [
      'node',
      'scripts\\holoshell-holoclaw-runtime-bridge.mjs',
      '--workflow-approval-bundle',
      bundlePath,
      '--workflow-approval-id',
      approvalId,
      '--workflow-approval-nonce',
      nonce,
      '--execute-workflow',
    ];
  }
  return [
    'node',
    'scripts\\holoshell-room-marathon-workflow.mjs',
    '--workflow-approval-bundle',
    bundlePath,
    '--workflow-approval-id',
    approvalId,
    '--workflow-approval-nonce',
    nonce,
    '--execute-workflow',
  ];
}

function buildBundle(args) {
  const now = new Date();
  const generatedAt = now.toISOString();
  const workflow = args.selfTest ? fixtureWorkflow() : readJson(args.workflow, null);
  if (!workflow) {
    return {
      schemaVersion: SCHEMA_VERSION,
      generatedAt,
      approvalId: `hswap-empty-${Date.now().toString(36)}`,
      status: 'empty',
      summary: { status: 'empty', executionAllowed: false, pendingApprovalCount: 0 },
      execution: { allowed: false, blockedReason: 'No workflow receipt was available.' },
    };
  }

  const approvalId = `hswap-${Date.now().toString(36)}-${shortHash(workflow.workflowId || workflow)}`;
  const nonce = crypto.randomBytes(16).toString('hex');
  const expiresAt = new Date(now.getTime() + args.ttlMinutes * 60 * 1000).toISOString();
  const pending = Number(workflow.summary?.pendingApprovalCount || 0);
  const targetResolved = Number(workflow.summary?.targetResolvedCount || 0);
  const stepCount = Number(workflow.summary?.stepCount || 0);
  const stageErrors = Number(workflow.summary?.stageErrorCount || 0);
  const mutationExecuted = Boolean(workflow.summary?.mutationExecuted);
  const executionAllowed = pending > 0 && !mutationExecuted && stageErrors === 0 && targetResolved === stepCount;
  const bundlePath = resolveRepoPath(path.join(args.bundleDir, `${approvalId}.json`));
  const command = executeCommand(approvalId, nonce, bundlePath, workflow);
  const workflowAdapter = workflow.summary?.workflowKind === 'holoclaw_runtime_bridge'
    ? 'scripts/holoshell-holoclaw-runtime-bridge.mjs'
    : 'scripts/holoshell-room-marathon-workflow.mjs';
  const status = executionAllowed ? 'pending_user_approval' : pending > 0 ? 'blocked' : 'not_required';

  return {
    schemaVersion: SCHEMA_VERSION,
    generatedAt,
    approvalId,
    nonce,
    status,
    sourceAnchors: {
      source: 'apps/holoshell/source/holoshell-hardware-control.hsplus',
      adapter: 'scripts/holoshell-workflow-approval-bundle.mjs',
      workflowAdapter,
      workflowReceipt: workflow.output?.latestPath || resolveRepoPath(args.workflow),
    },
    host: {
      platform: process.platform,
      arch: process.arch,
      release: os.release(),
      hostname: os.hostname(),
    },
    sourceWorkflow: {
      workflowId: workflow.workflowId || '',
      title: workflow.title || 'HoloShell workflow',
      status: workflow.summary?.status || 'unknown',
      stepCount,
      pendingApprovalCount: pending,
      model: workflow.summary?.model || '',
      modelRoute: workflow.summary?.modelRoute || '',
      mutationExecuted,
    },
    workflowRequest: workflowRequest(workflow),
    approval: {
      approvalRequired: pending > 0,
      requiresFreshUserGesture: true,
      expiresAt,
      ttlMinutes: args.ttlMinutes,
      approvalText: `Approve ${workflow.title || 'HoloShell workflow'} (${pending} guarded steps)`,
      risk: workflow.summary?.workflowKind === 'holoclaw_runtime_bridge'
        ? 'starts a local HoloClaw AgentRunner tick after runtime/env checks pass'
        : 'opens programs, types a room command, submits it, and opens YouTube media',
      rollback: 'manual_or_app_specific',
    },
    execution: {
      allowed: executionAllowed,
      command: executionAllowed ? command : [],
      commandPreview: executionAllowed ? command.map(shellArg).join(' ') : '',
      blockedReason: executionAllowed
        ? ''
        : mutationExecuted
          ? 'Workflow already executed.'
          : stageErrors > 0
            ? 'Workflow has staged action errors.'
            : targetResolved !== stepCount
              ? 'Not all workflow targets resolved.'
              : 'Workflow does not require approval.',
    },
    witness: {
      workflowHash: hashValue(workflow),
      secretsCaptured: false,
    },
    summary: {
      status,
      workflowId: workflow.workflowId || '',
      title: workflow.title || 'HoloShell workflow',
      pendingApprovalCount: pending,
      stepCount,
      executionAllowed,
      expiresAt,
      mutationExecuted,
    },
  };
}

function assertSelfTest(bundle) {
  const failures = [];
  if (bundle.schemaVersion !== SCHEMA_VERSION) failures.push('schemaVersion mismatch');
  if (bundle.status !== 'pending_user_approval') failures.push('expected pending approval');
  if (!bundle.execution.allowed) failures.push('expected executable fixture workflow');
  if (!bundle.execution.commandPreview.includes('--workflow-approval-nonce')) failures.push('expected nonce-bound workflow command');
  if (bundle.witness.secretsCaptured) failures.push('workflow approval must not capture secrets');
  if (failures.length) throw new Error(`Self-test failed:\n- ${failures.join('\n- ')}`);
}

function writeOutputs(args, bundle) {
  const bundlePath = bundle.approvalId && bundle.status !== 'empty'
    ? path.join(resolveRepoPath(args.bundleDir), `${bundle.approvalId}.json`)
    : null;
  const outputPath = resolveRepoPath(args.output);
  const jsOutputPath = resolveRepoPath(args.jsOutput);
  const withOutput = {
    ...bundle,
    output: {
      latestPath: outputPath,
      bundlePath,
      browserBootstrap: jsOutputPath,
    },
  };
  if (bundlePath) writeJson(bundlePath, withOutput);
  writeJson(args.output, withOutput);
  writeBrowserBootstrap(args.jsOutput, withOutput);
  return withOutput;
}

try {
  const args = parseArgs(process.argv.slice(2));
  const bundle = buildBundle(args);
  if (args.selfTest) assertSelfTest(bundle);
  const written = writeOutputs(args, bundle);
  if (args.json) {
    console.log(JSON.stringify(written, null, 2));
  } else {
    console.log(`HoloShell workflow approval: ${written.output.latestPath}`);
    if (written.output.bundlePath) console.log(`Bundle: ${written.output.bundlePath}`);
    console.log(`Status: ${written.summary.status}`);
    console.log(`Workflow: ${written.summary.title}`);
    console.log(`Pending approvals: ${written.summary.pendingApprovalCount}`);
    console.log(`Executable: ${written.summary.executionAllowed ? 'yes' : 'no'}`);
  }
} catch (error) {
  console.error(`holoshell-workflow-approval-bundle failed: ${error.message}`);
  process.exit(1);
}
