#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCHEMA_VERSION = 'hololand.holoshell.receipt-control.v0.1.0';
const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '..');
const DEFAULT_TMP = path.join('.tmp', 'holoshell');
const DEFAULT_SOURCE = path.join(DEFAULT_TMP, 'founder-evidence-demo-latest.json');
const DEFAULT_OUTPUT = path.join(DEFAULT_TMP, 'receipt-control-latest.json');
const DEFAULT_JS_OUTPUT = path.join(DEFAULT_TMP, 'receipt-control-latest.js');
const DEFAULT_RECEIPT_DIR = path.join(DEFAULT_TMP, 'receipt-control-receipts');

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    tmpDir: DEFAULT_TMP,
    source: DEFAULT_SOURCE,
    output: DEFAULT_OUTPUT,
    jsOutput: DEFAULT_JS_OUTPUT,
    receiptDir: DEFAULT_RECEIPT_DIR,
    json: false,
    selfTest: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--') continue;
    if (arg === '--tmp-dir') args.tmpDir = argv[++index] || DEFAULT_TMP;
    else if (arg === '--source') args.source = argv[++index] || args.source;
    else if (arg === '--output') args.output = argv[++index] || args.output;
    else if (arg === '--js-output') args.jsOutput = argv[++index] || args.jsOutput;
    else if (arg === '--receipt-dir') args.receiptDir = argv[++index] || args.receiptDir;
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
    args.tmpDir = path.join(DEFAULT_TMP, 'self-test', 'receipt-control');
    args.source = path.join(args.tmpDir, 'founder-evidence-demo-latest.json');
    args.output = path.join(args.tmpDir, 'receipt-control-latest.json');
    args.jsOutput = path.join(args.tmpDir, 'receipt-control-latest.js');
    args.receiptDir = path.join(args.tmpDir, 'receipt-control-receipts');
  }
  return args;
}

function printHelp() {
  console.log(`HoloShell receipt control

Usage:
  node scripts/holoshell-receipt-control.mjs
  node scripts/holoshell-receipt-control.mjs --self-test

Options:
  --source <path>       Source receipt. Defaults to .tmp/holoshell/founder-evidence-demo-latest.json.
  --output <path>       Latest receipt-control JSON output.
  --js-output <path>    Browser bootstrap output.
  --receipt-dir <path>  Append-only receipt-control directory.
  --json                Print the receipt-control receipt.
  --self-test           Use a fixture Founder evidence receipt.
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
  return atomicWrite(filePath, `window.HOLOSHELL_RECEIPT_CONTROL = ${payload};\n`);
}

function hashValue(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function shortHash(value, length = 12) {
  return hashValue(value).slice(0, length);
}

function fixtureFounderEvidence() {
  return {
    schemaVersion: 'hololand.holoshell.founder-evidence-demo.v0.1.0',
    generatedAt: new Date().toISOString(),
    demoId: 'founder-evidence-fixture',
    command: {
      targetAction: 'open_url',
      targetLabel: 'example.com',
      permissionEnvelope: 'guarded_execute',
    },
    approval: {
      approvalId: 'hwap-receipt-control-fixture',
      executionAllowed: true,
      commandPreview: 'node scripts\\holoshell-action-executor.mjs --action open_url --url https://example.com/ --execute',
    },
    execution: {
      performed: true,
      status: 'completed',
      beforeWindowCount: 12,
      afterWindowCount: 12,
      rollback: 'close_browser_tab_or_window_manually',
      afterState: {
        targetUrlHost: 'example.com',
        visibleWitnessKind: 'browser_navigation_dispatched',
        browserNavigation: {
          targetUrl: 'https://example.com/',
          targetHost: 'example.com',
          targetOrigin: 'https://example.com',
          targetPath: '/',
          dispatchAccepted: true,
          witnessKind: 'browser_navigation_dispatched',
        },
        targetWindowTitle: '',
        targetProcessName: '',
        witnessHash: 'fixture-witness-hash',
      },
    },
    shellUpdate: {
      receiptPath: '.tmp/holoshell/founder-evidence-demo-latest.json',
      visibleChangeClaim: 'browser_navigation_dispatched',
    },
    summary: {
      status: 'approved_execution_receipted',
      targetAction: 'open_url',
      targetLabel: 'example.com',
      evidenceRung: 'approved_execution',
      approvalRequired: true,
      approvalId: 'hwap-receipt-control-fixture',
      executionAllowed: true,
      executionPerformed: true,
      visibleShellChange: true,
      visibleWitnessKind: 'browser_navigation_dispatched',
      beforeWindowCount: 12,
      afterWindowCount: 12,
    },
  };
}

function sourceReceiptId(source) {
  return source.demoId || source.actionId || source.workflowId || source.generatedAt || shortHash(source);
}

function targetUrlFor(source) {
  const afterState = source.execution?.afterState || {};
  const fromNavigation = afterState.browserNavigation?.targetUrl;
  if (fromNavigation) return fromNavigation;
  const label = source.summary?.targetLabel || source.command?.targetLabel || afterState.targetUrlHost || '';
  if (/^https?:\/\//.test(label)) return label;
  return label ? `https://${label}/` : '';
}

function targetLabelFor(source) {
  return source.summary?.targetLabel || source.command?.targetLabel || source.execution?.afterState?.targetUrlHost || 'local computer';
}

function exactIdentity(source) {
  const afterState = source.execution?.afterState || {};
  const title = afterState.targetWindowTitle || '';
  const processName = afterState.targetProcessName || '';
  const witnessHash = afterState.witnessHash || '';
  const proved = Boolean(title && processName && witnessHash);
  return {
    status: proved ? 'proved' : 'not_proved',
    targetWindowTitle: title,
    targetProcessName: processName,
    witnessHash,
    reason: proved ? 'target_window_process_and_witness_hash_present' : 'browser_navigation_dispatched_without_exact_tab_identity',
  };
}

function buildReceiptControl(source, args) {
  const generatedAt = new Date().toISOString();
  const receiptId = sourceReceiptId(source);
  const targetLabel = targetLabelFor(source);
  const targetUrl = targetUrlFor(source);
  const exact = exactIdentity(source);
  const rollback = source.execution?.rollback || 'manual_or_app_specific';
  const sourcePath = toRepoPath(args.source);
  const receiptControlId = `hsrc-${Date.now().toString(36)}-${shortHash({ receiptId, targetLabel, generatedAt })}`;
  const replayBody = {
    action: source.summary?.targetAction || source.command?.targetAction || 'open_url',
    url: targetUrl,
    replayOf: receiptId,
    sourceReceiptPath: sourcePath,
    requiresFreshApproval: true,
  };
  const rollbackExecutable = exact.status === 'proved';
  const rollbackBlockReason = rollbackExecutable ? '' : 'exact_browser_tab_identity_not_proved';
  const taskTitle = `[holoshell][receipt-control] Make Founder evidence replay/rollback deterministic for ${targetLabel}`;

  return {
    schemaVersion: SCHEMA_VERSION,
    generatedAt,
    receiptControlId,
    sourceAnchors: {
      source: 'apps/holoshell/source/holoshell-receipt-control.hsplus',
      adapter: 'scripts/holoshell-receipt-control.mjs',
      sourceReceipt: sourcePath,
      founderEvidenceDemo: 'scripts/holoshell-founder-evidence-demo.mjs',
      actionExecutor: 'scripts/holoshell-action-executor.mjs',
      prototype: 'apps/holoshell/prototype/local-capability-room.html',
    },
    host: {
      platform: os.platform(),
      release: os.release(),
      hostname: os.hostname(),
    },
    source: {
      schemaVersion: source.schemaVersion || '',
      receiptId,
      status: source.summary?.status || 'unknown',
      receiptPath: sourcePath,
      evidenceRung: source.summary?.evidenceRung || '',
      approvalId: source.summary?.approvalId || source.approval?.approvalId || '',
    },
    target: {
      label: targetLabel,
      action: source.summary?.targetAction || source.command?.targetAction || '',
      url: targetUrl,
      urlHost: source.execution?.afterState?.targetUrlHost || source.execution?.afterState?.browserNavigation?.targetHost || '',
      visibleShellChange: Boolean(source.summary?.visibleShellChange),
      visibleWitnessKind: source.summary?.visibleWitnessKind || source.execution?.afterState?.visibleWitnessKind || '',
      beforeWindowCount: source.execution?.beforeWindowCount || source.summary?.beforeWindowCount || 0,
      afterWindowCount: source.execution?.afterWindowCount || source.summary?.afterWindowCount || 0,
      exactIdentity: exact,
    },
    controls: [
      {
        id: 'replay_with_approval',
        label: 'Replay with approval',
        kind: 'replay_intent',
        permissionEnvelope: 'guarded_execute',
        approvalRequired: true,
        executableNow: false,
        receiptRequired: true,
      },
      {
        id: 'inspect_receipt',
        label: 'Inspect receipt',
        kind: 'read_only',
        permissionEnvelope: 'read_only',
        approvalRequired: false,
        executableNow: true,
        receiptRequired: true,
      },
      {
        id: 'rollback_steps',
        label: 'Rollback steps',
        kind: rollbackExecutable ? 'rollback_intent' : 'rollback_guidance',
        permissionEnvelope: rollbackExecutable ? 'guarded_execute' : 'read_only',
        approvalRequired: rollbackExecutable,
        executableNow: rollbackExecutable,
        receiptRequired: true,
      },
      {
        id: 'file_task_packet',
        label: 'File task packet',
        kind: 'task_packet',
        permissionEnvelope: 'read_only',
        approvalRequired: false,
        executableNow: true,
        receiptRequired: true,
      },
    ],
    replayIntent: {
      status: targetUrl ? 'ready_requires_fresh_approval' : 'blocked_missing_target',
      route: '/action',
      method: 'POST',
      body: replayBody,
      commandPreview: `POST /action ${JSON.stringify(replayBody)}`,
      priorApprovalReusable: false,
      freshApprovalRequired: true,
    },
    inspectIntent: {
      status: 'ready',
      receiptPath: sourcePath,
      fields: ['schemaVersion', 'summary.status', 'summary.targetLabel', 'summary.visibleWitnessKind', 'execution.rollback'],
    },
    rollbackIntent: {
      status: rollbackExecutable ? 'ready_requires_approval' : 'advisory_only',
      requestedRollback: rollback,
      executable: rollbackExecutable,
      blockReason: rollbackBlockReason,
      manualSteps: rollbackExecutable
        ? []
        : ['Find the browser tab/window opened for the target URL.', 'Close it manually.', 'Refresh HoloShell receipts so the shell records the post-rollback state.'],
      exactIdentityRequired: true,
    },
    taskPacket: {
      status: 'ready',
      title: taskTitle,
      affectedRepoPath: 'C:/Users/josep/Documents/GitHub/Hololand',
      likelyOwnerSurface: 'HoloShell hardware-wrapper',
      category: 'deterministic UX/receipt gap',
      evidence: {
        sourceReceipt: sourcePath,
        sourceStatus: source.summary?.status || 'unknown',
        visibleWitnessKind: source.summary?.visibleWitnessKind || '',
        exactIdentityStatus: exact.status,
      },
      expectedBehavior: 'Replay creates a fresh approval receipt; rollback is executable only after exact target identity is proved.',
      reproduction: `Run node scripts/holoshell-receipt-control.mjs --source ${sourcePath} and inspect rollbackIntent.status.`,
    },
    output: {
      latestPath: toRepoPath(args.output),
      browserBootstrap: toRepoPath(args.jsOutput),
      receiptPath: `${toRepoPath(args.receiptDir)}/${receiptControlId}.json`,
    },
    summary: {
      status: targetUrl ? 'ready' : 'blocked_missing_target',
      sourceStatus: source.summary?.status || 'unknown',
      sourceReceiptId: receiptId,
      targetLabel,
      targetUrl,
      replayAvailable: Boolean(targetUrl),
      replayRequiresFreshApproval: true,
      inspectAvailable: true,
      rollbackExecutable,
      rollbackBlockReason,
      taskPacketReady: true,
      controlCount: 4,
      exactTargetIdentityStatus: exact.status,
      visibleWitnessKind: source.summary?.visibleWitnessKind || source.execution?.afterState?.visibleWitnessKind || '',
    },
  };
}

function writeReceiptControl(receipt, args) {
  writeJson(args.output, receipt);
  writeBrowserBootstrap(args.jsOutput, receipt);
  writeJson(path.join(args.receiptDir, `${receipt.receiptControlId}.json`), receipt);
}

function runSelfTest(args) {
  const source = fixtureFounderEvidence();
  writeJson(args.source, source);
  const receipt = buildReceiptControl(source, args);
  writeReceiptControl(receipt, args);
  assert.equal(receipt.schemaVersion, SCHEMA_VERSION);
  assert.equal(receipt.summary.status, 'ready');
  assert.equal(receipt.summary.replayRequiresFreshApproval, true);
  assert.equal(receipt.summary.rollbackExecutable, false);
  assert.equal(receipt.rollbackIntent.status, 'advisory_only');
  assert.equal(receipt.taskPacket.category, 'deterministic UX/receipt gap');
  assert.equal(existsSync(resolveRepoPath(args.output)), true);
  assert.equal(existsSync(resolveRepoPath(args.jsOutput)), true);
  return receipt;
}

function main() {
  const args = parseArgs();
  if (args.selfTest) {
    const receipt = runSelfTest(args);
    if (args.json) console.log(JSON.stringify(receipt, null, 2));
    else console.log(`Receipt control self-test passed: ${receipt.summary.status}`);
    return;
  }
  const source = readJson(args.source, null);
  if (!source?.schemaVersion) {
    throw new Error(`Source receipt missing or invalid: ${args.source}`);
  }
  const receipt = buildReceiptControl(source, args);
  writeReceiptControl(receipt, args);
  if (args.json) console.log(JSON.stringify(receipt, null, 2));
  else console.log(`Receipt control: ${receipt.summary.status}; replay ${receipt.summary.replayAvailable ? 'ready' : 'blocked'}; rollback ${receipt.summary.rollbackExecutable ? 'executable' : 'advisory'}`);
}

try {
  main();
} catch (error) {
  console.error(`holoshell-receipt-control failed: ${error.message}`);
  process.exit(1);
}
