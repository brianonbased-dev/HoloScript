#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCHEMA_VERSION = 'hololand.holoshell.founder-evidence-demo.v0.1.0';
const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '..');
const DEFAULT_TMP = path.join('.tmp', 'holoshell');
const DEFAULT_OUTPUT = path.join(DEFAULT_TMP, 'founder-evidence-demo-latest.json');
const DEFAULT_JS_OUTPUT = path.join(DEFAULT_TMP, 'founder-evidence-demo-latest.js');
const DEFAULT_RECEIPT_DIR = path.join(DEFAULT_TMP, 'founder-evidence-demo-receipts');
const DEFAULT_INTENT = 'Brittney, open one real app, show me what changed, and save the receipt.';
const DEFAULT_URL = 'https://example.com/';

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    intent: DEFAULT_INTENT,
    actor: 'brittney',
    action: 'open_url',
    app: '',
    url: DEFAULT_URL,
    output: DEFAULT_OUTPUT,
    jsOutput: DEFAULT_JS_OUTPUT,
    receiptDir: DEFAULT_RECEIPT_DIR,
    tmpDir: DEFAULT_TMP,
    executeApproved: false,
    confirm: '',
    json: false,
    selfTest: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--') continue;
    if (arg === '--intent') args.intent = argv[++index] || DEFAULT_INTENT;
    else if (arg === '--actor') args.actor = argv[++index] || args.actor;
    else if (arg === '--action') args.action = argv[++index] || args.action;
    else if (arg === '--app') args.app = argv[++index] || '';
    else if (arg === '--url') args.url = argv[++index] || '';
    else if (arg === '--tmp-dir') args.tmpDir = argv[++index] || DEFAULT_TMP;
    else if (arg === '--output') args.output = argv[++index] || args.output;
    else if (arg === '--js-output') args.jsOutput = argv[++index] || args.jsOutput;
    else if (arg === '--receipt-dir') args.receiptDir = argv[++index] || args.receiptDir;
    else if (arg === '--execute-approved') args.executeApproved = true;
    else if (arg === '--confirm') args.confirm = argv[++index] || '';
    else if (arg === '--json') args.json = true;
    else if (arg === '--self-test') args.selfTest = true;
    else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (args.selfTest) {
    args.tmpDir = path.join(DEFAULT_TMP, 'self-test');
    args.output = path.join(args.tmpDir, 'founder-evidence-demo-latest.json');
    args.jsOutput = path.join(args.tmpDir, 'founder-evidence-demo-latest.js');
    args.receiptDir = path.join(args.tmpDir, 'founder-evidence-demo-receipts');
  }

  if (!['open_url', 'launch_app'].includes(args.action)) {
    throw new Error('Founder evidence demo supports --action open_url or launch_app.');
  }
  if (args.action === 'open_url' && !args.url) throw new Error('open_url requires --url.');
  if (args.action === 'launch_app' && !args.app) throw new Error('launch_app requires --app.');
  return args;
}

function printHelp() {
  console.log(`HoloShell Founder evidence demo

Usage:
  node scripts/holoshell-founder-evidence-demo.mjs
  node scripts/holoshell-founder-evidence-demo.mjs --execute-approved --confirm execute-founder-demo

Options:
  --intent <text>       Natural command. Defaults to the Founder evidence demo anchor.
  --action <kind>       open_url or launch_app. Defaults to open_url.
  --url <url>           URL for open_url. Defaults to https://example.com/.
  --app <name>          App name for launch_app.
  --execute-approved    Execute the generated nonce-bound approval bundle.
  --confirm <text>      Must be execute-founder-demo when executing.
  --json                Print the receipt.
  --self-test           Use fixture action executor receipts; no hardware mutation.
  -h, --help            Show this help.
`);
}

function resolveRepoPath(filePath) {
  return path.isAbsolute(filePath) ? filePath : path.resolve(REPO_ROOT, filePath);
}

function toRepoPath(filePath) {
  const resolved = resolveRepoPath(filePath);
  const relative = path.relative(REPO_ROOT, resolved);
  return relative && !relative.startsWith('..') ? relative.replace(/\\/g, '/') : path.basename(resolved);
}

function readJson(filePath, fallback = null) {
  const resolved = resolveRepoPath(filePath);
  if (!existsSync(resolved)) return fallback;
  return JSON.parse(readFileSync(resolved, 'utf8'));
}

function atomicWrite(filePath, text) {
  const resolved = resolveRepoPath(filePath);
  mkdirSync(path.dirname(resolved), { recursive: true });
  const tempPath = `${resolved}.${process.pid}.${Date.now().toString(36)}.${crypto.randomBytes(4).toString('hex')}.tmp`;
  writeFileSync(tempPath, text, 'utf8');
  renameSync(tempPath, resolved);
  return resolved;
}

function writeJson(filePath, data) {
  return atomicWrite(filePath, `${JSON.stringify(data, null, 2)}\n`);
}

function writeBrowserBootstrap(filePath, receipt) {
  const payload = JSON.stringify(receipt, null, 2).replace(/<\/script/gi, '<\\/script');
  return atomicWrite(filePath, `window.HOLOSHELL_FOUNDER_EVIDENCE_DEMO = ${payload};\n`);
}

function hashValue(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function shortHash(value, length = 12) {
  return hashValue(value).slice(0, length);
}

function runNode(cli, args) {
  const result = spawnSync(process.execPath, cli, {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    windowsHide: true,
    maxBuffer: 10 * 1024 * 1024,
  });
  return {
    ok: result.status === 0,
    status: result.status,
    stdout: (result.stdout || '').trim(),
    stderr: (result.stderr || '').trim(),
    cli,
    label: args?.label || '',
  };
}

function compactRun(run) {
  return {
    label: run.label || '',
    ok: run.ok,
    status: run.status,
    stdoutTail: run.stdout.slice(-900),
    stderrTail: run.stderr.slice(-900),
    command: run.cli,
  };
}

function fixtureAction(kind, status = 'completed') {
  const actionKind = kind || 'open_url';
  return {
    schemaVersion: 'hololand.holoshell.hardware-action.v0.1.0',
    generatedAt: new Date().toISOString(),
    actionId: `hwa-fixture-${actionKind}`,
    request: {
      actor: 'brittney',
      actionKind,
      url: actionKind === 'open_url' ? DEFAULT_URL : '',
      app: actionKind === 'launch_app' ? 'Fixture App' : '',
    },
    summary: {
      status,
      actionKind,
      permissionEnvelope: actionKind === 'list_windows' ? 'read_only' : 'guarded_execute',
      approvalRequired: actionKind !== 'list_windows',
      approved: status === 'completed',
      executeRequested: status === 'completed',
      executionPerformed: status === 'completed',
      mutatingActionExecuted: status === 'completed',
      targetAppName: actionKind === 'launch_app' ? 'Fixture App' : '',
      targetWindowTitle: status === 'completed' ? 'Fixture App Window' : '',
      targetProcessName: status === 'completed' ? 'fixture' : '',
      windowCount: status === 'completed' ? 2 : 1,
    },
    witness: {
      beforeCaptureHash: 'fixture-before',
      afterCaptureHash: status === 'completed' ? 'fixture-after' : 'fixture-before',
      changed: status === 'completed',
      secretsCaptured: false,
    },
    output: {
      latestPath: resolveRepoPath(path.join(DEFAULT_TMP, 'self-test', 'action-latest.json')),
      receiptPath: resolveRepoPath(path.join(DEFAULT_TMP, 'self-test', 'action-receipts', `fixture-${actionKind}.json`)),
    },
  };
}

function fixtureApproval() {
  return {
    schemaVersion: 'hololand.holoshell.hardware-approval.v0.1.0',
    generatedAt: new Date().toISOString(),
    approvalId: 'hwap-fixture',
    nonce: 'fixture-nonce',
    status: 'pending_user_approval',
    summary: {
      status: 'pending_user_approval',
      actionKind: 'open_url',
      target: 'example.com',
      executionAllowed: true,
      approvalRequired: true,
      trustLevel: 'guarded',
    },
    approval: {
      approvalRequired: true,
      requiresFreshUserGesture: true,
      expiresAt: new Date(Date.now() + 600000).toISOString(),
    },
    execution: {
      allowed: true,
      commandPreview: 'node scripts\\holoshell-action-executor.mjs --action open_url --execute ...',
    },
  };
}

function actionCli(args, extra = []) {
  const cli = [
    'scripts/holoshell-action-executor.mjs',
    '--actor',
    args.actor,
    '--action',
    args.action,
    '--output',
    path.join(args.tmpDir, 'action-latest.json'),
    '--js-output',
    path.join(args.tmpDir, 'action-latest.js'),
    '--receipt-dir',
    path.join(args.tmpDir, 'action-receipts'),
  ];
  if (args.action === 'open_url') cli.push('--url', args.url);
  if (args.action === 'launch_app') cli.push('--app', args.app);
  return [...cli, ...extra];
}

function readLatestAction(args) {
  return readJson(path.join(args.tmpDir, 'action-latest.json'), {});
}

function stageDemo(args) {
  if (args.selfTest) {
    return {
      before: fixtureAction('list_windows', 'completed'),
      plan: fixtureAction(args.action, 'approval_required'),
      approval: fixtureApproval(),
      execute: null,
      after: fixtureAction('list_windows', 'completed'),
      runs: [],
    };
  }

  const beforeRun = runNode([
    'scripts/holoshell-action-executor.mjs',
    '--actor',
    args.actor,
    '--action',
    'list_windows',
    '--output',
    path.join(args.tmpDir, 'founder-evidence-before-action.json'),
    '--js-output',
    path.join(args.tmpDir, 'founder-evidence-before-action.js'),
    '--receipt-dir',
    path.join(args.tmpDir, 'action-receipts'),
  ], { label: 'before_window_witness' });
  const before = readJson(path.join(args.tmpDir, 'founder-evidence-before-action.json'), {});

  const planRun = runNode(actionCli(args), { label: 'plan_guarded_action' });
  const plan = readLatestAction(args);

  const approvalRun = runNode([
    'scripts/holoshell-approval-bundle.mjs',
    '--action-receipt',
    plan.output?.receiptPath || path.join(args.tmpDir, 'action-latest.json'),
    '--output',
    path.join(args.tmpDir, 'approval-latest.json'),
    '--js-output',
    path.join(args.tmpDir, 'approval-latest.js'),
    '--bundle-dir',
    path.join(args.tmpDir, 'approval-bundles'),
  ], { label: 'mint_approval_bundle' });
  const approval = readJson(path.join(args.tmpDir, 'approval-latest.json'), {});

  let executeRun = null;
  let execute = null;
  if (args.executeApproved) {
    if (args.confirm !== 'execute-founder-demo') {
      throw new Error('--execute-approved requires --confirm execute-founder-demo');
    }
    const bundlePath = path.join(args.tmpDir, 'approval-bundles', `${approval.approvalId}.json`);
    executeRun = runNode(actionCli(args, [
      '--approval-bundle',
      bundlePath,
      '--approval-id',
      approval.approvalId,
      '--approval-nonce',
      approval.nonce,
      '--execute',
    ]), { label: 'execute_approved_action' });
    execute = readLatestAction(args);
  }

  const afterRun = runNode([
    'scripts/holoshell-action-executor.mjs',
    '--actor',
    args.actor,
    '--action',
    'list_windows',
    '--output',
    path.join(args.tmpDir, 'founder-evidence-after-action.json'),
    '--js-output',
    path.join(args.tmpDir, 'founder-evidence-after-action.js'),
    '--receipt-dir',
    path.join(args.tmpDir, 'action-receipts'),
  ], { label: 'after_window_witness' });
  const after = readJson(path.join(args.tmpDir, 'founder-evidence-after-action.json'), {});

  return {
    before,
    plan,
    approval,
    execute,
    after,
    runs: [beforeRun, planRun, approvalRun, executeRun, afterRun].filter(Boolean).map(compactRun),
  };
}

function buildReceipt(args) {
  const generatedAt = new Date().toISOString();
  const demoId = `hsfed-${Date.now().toString(36)}-${shortHash({ intent: args.intent, action: args.action, target: args.url || args.app })}`;
  const staged = stageDemo(args);
  const executed = Boolean(staged.execute?.summary?.executionPerformed);
  const beforeCount = staged.before?.summary?.windowCount || 0;
  const afterCount = staged.after?.summary?.windowCount || 0;
  const browserNavigation =
    staged.execute?.witness?.browserNavigation || staged.execute?.result?.browserNavigation || null;
  const visibleChange = executed
    ? Boolean(staged.execute?.summary?.shellVisibleChange) ||
      beforeCount !== afterCount ||
      Boolean(
        staged.execute?.witness?.changed ||
          staged.execute?.summary?.targetWindowTitle ||
          browserNavigation?.dispatchAccepted
      )
    : false;
  const approvalAllowed = Boolean(staged.approval?.execution?.allowed || staged.approval?.summary?.executionAllowed);
  const status = executed
    ? 'approved_execution_receipted'
    : approvalAllowed
      ? 'pending_user_approval'
      : 'blocked';
  const targetLabel = args.action === 'open_url' ? new URL(args.url).host : args.app;
  const afterState = {
    windowCount: afterCount,
    targetWindowTitle: staged.execute?.summary?.targetWindowTitle || '',
    targetProcessName: staged.execute?.summary?.targetProcessName || '',
    targetUrlHost: staged.execute?.summary?.targetUrlHost || browserNavigation?.targetHost || '',
    visibleWitnessKind: staged.execute?.summary?.visibleWitnessKind || '',
    browserNavigation,
    witnessHash: staged.after?.witness?.afterCaptureHash || staged.after?.witness?.beforeCaptureHash || '',
  };

  return {
    schemaVersion: SCHEMA_VERSION,
    generatedAt,
    demoId,
    sourceAnchors: {
      source: 'apps/holoshell/source/holoshell-founder-command-pipeline.hs',
      adapter: 'scripts/holoshell-founder-evidence-demo.mjs',
      actionExecutor: 'scripts/holoshell-action-executor.mjs',
      approvalBundle: 'scripts/holoshell-approval-bundle.mjs',
      flagshipDoc: 'apps/holoshell/docs/FOUNDER_OS_FLAGSHIP_DEMO.md',
    },
    host: {
      platform: process.platform,
      arch: process.arch,
      release: os.release(),
      hostname: os.hostname(),
    },
    command: {
      naturalIntent: args.intent,
      actor: args.actor,
      targetAction: args.action,
      targetLabel,
      permissionEnvelope: staged.plan?.summary?.permissionEnvelope || 'guarded_execute',
    },
    evidenceLadder: {
      sourceSpec: true,
      receipt: true,
      visibleShellUx: true,
      approvedExecution: executed,
      trustedExecution: false,
      currentRung: executed ? 'approved_execution' : 'visible_shell_ux',
    },
    plan: {
      status: staged.plan?.summary?.status || 'unknown',
      actionId: staged.plan?.actionId || '',
      actionKind: staged.plan?.summary?.actionKind || args.action,
      approvalRequired: Boolean(staged.plan?.summary?.approvalRequired),
      executionPerformed: false,
      targetLabel,
    },
    approval: {
      status: staged.approval?.summary?.status || staged.approval?.status || 'unknown',
      approvalId: staged.approval?.approvalId || '',
      nonceBound: Boolean(staged.approval?.nonce),
      executionAllowed: approvalAllowed,
      approvalRequired: Boolean(staged.approval?.summary?.approvalRequired || staged.approval?.approval?.approvalRequired),
      commandPreview: staged.approval?.execution?.commandPreview || '',
    },
    execution: {
      requested: Boolean(args.executeApproved),
      performed: executed,
      actionId: staged.execute?.actionId || '',
      status: staged.execute?.summary?.status || (args.executeApproved ? 'not_performed' : 'not_requested'),
      visibleChange,
      beforeWindowCount: beforeCount,
      afterWindowCount: afterCount,
      afterState,
      rollback: args.action === 'open_url' ? 'close_browser_tab_or_window_manually' : 'close_launched_app_manually',
    },
    shellUpdate: {
      liveFeedRefreshRequired: true,
      shellObjectsRefreshRequired: true,
      receiptPath: toRepoPath(args.output),
      browserBootstrap: toRepoPath(args.jsOutput),
      visibleChangeClaim: executed
        ? visibleChange
          ? staged.execute?.summary?.visibleWitnessKind || 'observed_or_target_visible'
          : 'execution_receipted_no_window_delta'
        : 'pending_approval',
    },
    trust: {
      latestLevel: 'read_only',
      trustedExecutionClaimed: false,
      promotionPolicy: 'requires_repeated_success_receipts',
    },
    runs: staged.runs,
    receipt: {
      receiptHash: shortHash({ generatedAt, demoId, status, targetLabel }, 32),
      secretsCaptured: false,
      rawCommandLineIncluded: false,
      localMutationPerformed: executed,
    },
    summary: {
      status,
      intent: args.intent,
      targetAction: args.action,
      targetLabel,
      approvalRequired: true,
      approvalId: staged.approval?.approvalId || '',
      executionAllowed: approvalAllowed,
      executionPerformed: executed,
      visibleShellChange: visibleChange,
      visibleWitnessKind: staged.execute?.summary?.visibleWitnessKind || '',
      beforeWindowCount: beforeCount,
      afterWindowCount: afterCount,
      evidenceRung: executed ? 'approved_execution' : 'visible_shell_ux',
      nextMove: executed ? 'refresh_live_feed_and_review_receipt' : 'approve_and_execute_one_real_app',
    },
  };
}

function assertSelfTest(receipt) {
  const failures = [];
  if (receipt.schemaVersion !== SCHEMA_VERSION) failures.push('schemaVersion mismatch');
  if (receipt.summary.status !== 'pending_user_approval') failures.push(`unexpected status ${receipt.summary.status}`);
  if (!receipt.summary.approvalId) failures.push('missing approval id');
  if (!receipt.approval.nonceBound) failures.push('approval must be nonce-bound');
  if (receipt.summary.executionPerformed) failures.push('self-test must not perform execution');
  if (receipt.evidenceLadder.trustedExecution) failures.push('trusted execution must not be claimed');
  if (receipt.receipt.secretsCaptured) failures.push('demo must not capture secrets');
  if (failures.length) throw new Error(`Self-test failed:\n- ${failures.join('\n- ')}`);
}

try {
  const args = parseArgs();
  const receipt = buildReceipt(args);
  if (args.selfTest) assertSelfTest(receipt);
  const output = writeJson(args.output, receipt);
  const jsOutput = writeBrowserBootstrap(args.jsOutput, receipt);
  mkdirSync(resolveRepoPath(args.receiptDir), { recursive: true });
  const receiptPath = writeJson(path.join(args.receiptDir, `${receipt.demoId}.json`), receipt);

  if (args.json) {
    console.log(JSON.stringify(receipt, null, 2));
  } else {
    console.log(`Founder evidence demo: ${output}`);
    console.log(`Founder evidence bootstrap: ${jsOutput}`);
    console.log(`Receipt: ${receiptPath}`);
    console.log(`Status: ${receipt.summary.status}`);
    console.log(`Target: ${receipt.summary.targetLabel}`);
    console.log(`Approval required: ${receipt.summary.approvalRequired ? 'yes' : 'no'}`);
    console.log(`Execution performed: ${receipt.summary.executionPerformed ? 'yes' : 'no'}`);
    console.log(`Evidence rung: ${receipt.summary.evidenceRung}`);
  }
} catch (error) {
  console.error(`holoshell-founder-evidence-demo failed: ${error.message}`);
  process.exit(1);
}
