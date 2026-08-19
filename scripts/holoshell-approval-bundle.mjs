#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import crypto from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCHEMA_VERSION = 'hololand.holoshell.hardware-approval.v0.1.0';
const ACTION_SCHEMA_VERSION = 'hololand.holoshell.hardware-action.v0.1.0';
const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '..');
const DEFAULT_TMP = path.join('.tmp', 'holoshell');
const DEFAULT_ACTION_RECEIPT = path.join(DEFAULT_TMP, 'action-latest.json');
const DEFAULT_OUTPUT = path.join(DEFAULT_TMP, 'approval-latest.json');
const DEFAULT_JS_OUTPUT = path.join(DEFAULT_TMP, 'approval-latest.js');
const DEFAULT_BUNDLE_DIR = path.join(DEFAULT_TMP, 'approval-bundles');
const DEFAULT_TRUST_LEDGER = path.join(DEFAULT_TMP, 'trust-ledger.json');

function parseArgs(argv) {
  const args = {
    json: false,
    selfTest: false,
    actionReceipt: DEFAULT_ACTION_RECEIPT,
    output: DEFAULT_OUTPUT,
    jsOutput: DEFAULT_JS_OUTPUT,
    bundleDir: DEFAULT_BUNDLE_DIR,
    trustLedger: DEFAULT_TRUST_LEDGER,
    ttlMinutes: 10,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--json') args.json = true;
    else if (arg === '--self-test') args.selfTest = true;
    else if (arg === '--action-receipt') args.actionReceipt = argv[++index];
    else if (arg === '--output') args.output = argv[++index];
    else if (arg === '--js-output') args.jsOutput = argv[++index];
    else if (arg === '--bundle-dir') args.bundleDir = argv[++index];
    else if (arg === '--trust-ledger') args.trustLedger = argv[++index];
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
  console.log(`HoloShell hardware approval bundle

Usage:
  node scripts/holoshell-approval-bundle.mjs [options]

Options:
  --json                    Print the approval bundle.
  --self-test               Run fixture assertions.
  --action-receipt <path>   Hardware action receipt. Defaults to .tmp/holoshell/action-latest.json.
  --output <path>           Write latest bundle. Defaults to .tmp/holoshell/approval-latest.json.
  --js-output <path>        Write browser bootstrap JS. Defaults to .tmp/holoshell/approval-latest.js.
  --bundle-dir <path>       Archive bundles. Defaults to .tmp/holoshell/approval-bundles.
  --trust-ledger <path>     Trusted autonomy ledger. Defaults to .tmp/holoshell/trust-ledger.json.
  --ttl-minutes <n>         Approval expiry. Defaults to 10.
  -h, --help                Show this help.
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
  atomicWriteFile(resolved, `${JSON.stringify(value, null, 2)}\n`);
  return resolved;
}

function writeBrowserBootstrap(filePath, bundle) {
  const resolved = resolveRepoPath(filePath);
  mkdirSync(path.dirname(resolved), { recursive: true });
  const payload = JSON.stringify(bundle, null, 2).replace(/<\/script/gi, '<\\/script');
  atomicWriteFile(resolved, `window.HOLOSHELL_HARDWARE_APPROVAL = ${payload};\n`);
  return resolved;
}

function atomicWriteFile(resolvedPath, text) {
  const tempPath = `${resolvedPath}.${process.pid}.${Date.now().toString(36)}.${crypto.randomBytes(4).toString('hex')}.tmp`;
  writeFileSync(tempPath, text, 'utf8');
  renameSync(tempPath, resolvedPath);
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

function toPublicPath(filePath, fallbackPrefix = 'artifact') {
  const text = String(filePath || '');
  if (!text) return '';
  const resolved = resolveRepoPath(text);
  const relative = path.relative(REPO_ROOT, resolved);
  if (relative && !relative.startsWith('..') && !path.isAbsolute(relative)) {
    return relative.replace(/\\/g, '/');
  }
  return `${fallbackPrefix}-${shortHash(text)}`;
}

function hasAbsolutePath(value) {
  return /(^|[\s"'`=])(?:[A-Za-z]:[\\/]|\/(?!\/)[^\s"'`]+)/.test(String(value || ''));
}

function hostOnlyUrl(url) {
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.host}/[redacted-path]`;
  } catch {
    return '[redacted-url]';
  }
}

function publicArg(value) {
  const text = String(value ?? '');
  if (!text) return text;
  if (hasAbsolutePath(text)) return `[redacted-local-path:${shortHash(text)}]`;
  return text;
}

function addFlag(args, flag, value) {
  if (value === undefined || value === null || value === '') return;
  args.push(flag, String(value));
}

function actionNeedsRedactedManualReview(receipt) {
  return receipt?.request?.actionKind === 'type_text' && receipt?.request?.text?.provided;
}

function riskFor(receipt) {
  if (receipt?.permission?.breakGlass) return 'break_glass_blocked';
  if (receipt?.request?.actionKind === 'launch_app') return 'opens a local program on this computer';
  if (receipt?.request?.actionKind === 'focus_window') return 'changes foreground focus on this computer';
  if (receipt?.request?.actionKind === 'hotkey') return 'sends a keyboard shortcut to the target window';
  if (receipt?.request?.actionKind === 'click_control' || receipt?.request?.actionKind === 'invoke_control') return 'clicks or invokes a captured UI control';
  if (receipt?.request?.actionKind === 'type_text') return 'types text into the target window';
  return 'mutates local machine state';
}

function normalize(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

function targetHost(url) {
  try {
    return new URL(url).host;
  } catch {
    return '';
  }
}

function targetFor(receipt = {}) {
  const request = receipt.request || {};
  const summary = receipt.summary || {};
  const target = receipt.target || {};
  const program = target.program || {};
  if (request.actionKind === 'open_url') {
    return { kind: 'url', label: targetHost(request.url) || 'web', privateHash: shortHash(request.url || 'url') };
  }
  if (request.actionKind === 'open_path') {
    return { kind: 'path', label: 'local path', privateHash: shortHash(request.path || '') };
  }
  const app = summary.targetAppName || program.displayName || request.targetProgramName || request.app || '';
  if (app) return { kind: 'program', label: app, privateHash: shortHash(app) };
  const windowTitle = summary.targetWindowTitle || target.title || request.targetWindowTitle || '';
  const processName = summary.targetProcessName || target.processName || request.targetProcessName || '';
  if (processName || windowTitle) return { kind: 'window', label: processName || 'window', privateHash: shortHash(`${processName}:${windowTitle}`) };
  return { kind: 'machine', label: 'local computer', privateHash: shortHash('local computer') };
}

function approvalTargetFor(receipt = {}) {
  const request = receipt.request || {};
  const boundary = receipt.browserBoundary || {};
  if (request.actionKind === 'open_url') {
    const host = boundary.host || targetHost(request.url) || 'web';
    const profile = boundary.profileBoundary || request.browserProfile || '';
    return profile ? `${host} via ${profile}` : host;
  }
  return targetFor(receipt).label;
}

function fingerprintFor(receipt = {}) {
  const request = receipt.request || {};
  const permission = receipt.permission || {};
  const target = targetFor(receipt);
  const payload = {
    actionKind: request.actionKind || receipt.summary?.actionKind || '',
    targetKind: target.kind,
    targetLabel: normalize(target.label),
    targetHash: target.privateHash,
    permissionEnvelope: permission.envelope || receipt.summary?.permissionEnvelope || 'unknown',
  };
  return `trust-${shortHash(payload, 16)}`;
}

function trustForReceipt(args, receipt) {
  const ledger = readJson(args.trustLedger, {});
  const fingerprint = fingerprintFor(receipt);
  const record = ledger.records?.[fingerprint] || null;
  const level = record?.trustLevel || (
    receipt.permission?.envelope === 'read_only'
      ? 'read_only'
      : receipt.permission?.breakGlass
        ? 'break_glass'
        : 'guarded'
  );
  return {
    ledgerStatus: ledger.summary?.status || 'missing',
    fingerprint,
    level,
    trustedAutonomyEligible: Boolean(record?.trustedAutonomyEligible),
    approvedSuccessCount: record?.approvedSuccessCount || 0,
    failureCount: record?.failureCount || 0,
    successesUntilTrusted: record?.successesUntilTrusted ?? ledger.policy?.promotionThreshold ?? 3,
    promotionThreshold: ledger.policy?.promotionThreshold || 3,
    explanation: record?.explanation || 'No prior trust record has been recorded for this action.',
  };
}

function fixtureActionReceipt() {
  return {
    schemaVersion: ACTION_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    actionId: 'hwa-fixture-launch',
    request: {
      actor: 'holoshell',
      actionKind: 'launch_app',
      targetProgramName: 'Fixture Browser',
      app: 'Fixture Browser',
      approved: false,
      executeRequested: false,
      secretsIncluded: false,
      receiptRequired: true,
    },
    permission: {
      envelope: 'guarded_execute',
      approvalRequired: true,
      approved: false,
      executeRequested: false,
      mutating: true,
      breakGlass: false,
      receiptRequired: true,
    },
    target: {
      windowId: '',
      title: '',
      processName: '',
      program: {
        programId: 'program-fixture-browser',
        displayName: 'Fixture Browser',
        capabilityClass: 'browser',
        launchable: true,
        targetPath: 'C:/Fixture/browser.exe',
      },
    },
    summary: {
      status: 'approval_required',
      actionKind: 'launch_app',
      permissionEnvelope: 'guarded_execute',
      approvalRequired: true,
      approved: false,
      executeRequested: false,
      executionPerformed: false,
      mutatingActionExecuted: false,
      targetAppName: 'Fixture Browser',
      targetWindowTitle: '',
      targetProcessName: '',
      error: '',
    },
    witness: {
      beforeCaptureHash: 'fixture-before',
      afterCaptureHash: 'fixture-before',
      secretsCaptured: false,
    },
    browserBoundary: {
      boundaryVersion: 'hololand.holoshell.browser-boundary.v0.1.0',
      applies: true,
      browser: 'Fixture Browser',
      browserDeclared: true,
      profileBoundary: 'system_default_public_ok',
      sessionBoundary: 'default_or_temporary_public',
      urlClassification: 'public_web',
      publicBrowsing: true,
      credentialAdjacent: false,
      accountMutation: false,
      cookiePolicy: 'may_use_default_browser_cookies_if_user_approves_open',
      screenshotPolicy: 'local_receipts_allowed',
      screenshotLocality: 'local_receipt_only',
      receiptsRequired: ['browser_boundary_receipt', 'hardware_action_receipt', 'approval_bundle'],
    },
    output: {
      latestPath: resolveRepoPath(DEFAULT_ACTION_RECEIPT),
      receiptPath: resolveRepoPath(path.join(DEFAULT_TMP, 'action-receipts', 'hwa-fixture-launch.json')),
    },
  };
}

function buildExecuteArgs(receipt, approvalId, nonce, bundlePath) {
  const request = receipt.request || {};
  const actionArgs = ['node', 'scripts\\holoshell-action-executor.mjs'];
  addFlag(actionArgs, '--action', request.actionKind);
  addFlag(actionArgs, '--target-window-id', request.targetWindowId);
  addFlag(actionArgs, '--window-title', request.targetWindowTitle);
  addFlag(actionArgs, '--process-name', request.targetProcessName);
  addFlag(actionArgs, '--handle', request.targetHandle);
  addFlag(actionArgs, '--target-control-id', request.targetControlId);
  addFlag(actionArgs, '--control-name', request.targetControlName);
  addFlag(actionArgs, '--url', request.url);
  addFlag(actionArgs, '--path', request.path);
  addFlag(actionArgs, '--app', request.app || request.targetProgramName);
  addFlag(actionArgs, '--hotkey', request.hotkey);
  addFlag(actionArgs, '--browser-profile', request.browserProfile);
  addFlag(actionArgs, '--browser-session', request.browserSession);
  addFlag(actionArgs, '--approval-bundle', bundlePath);
  addFlag(actionArgs, '--approval-id', approvalId);
  addFlag(actionArgs, '--approval-nonce', nonce);
  actionArgs.push('--execute');
  return actionArgs;
}

function buildPublicExecuteArgs(receipt, approvalId) {
  const request = receipt.request || {};
  const actionArgs = ['node', 'scripts\\holoshell-action-executor.mjs'];
  addFlag(actionArgs, '--action', request.actionKind);
  addFlag(actionArgs, '--target-window-id', request.targetWindowId);
  addFlag(actionArgs, '--window-title', request.targetWindowTitle);
  addFlag(actionArgs, '--process-name', request.targetProcessName);
  addFlag(actionArgs, '--handle', request.targetHandle);
  addFlag(actionArgs, '--target-control-id', request.targetControlId);
  addFlag(actionArgs, '--control-name', request.targetControlName);
  if (request.url) addFlag(actionArgs, '--url', hostOnlyUrl(request.url));
  if (request.path) addFlag(actionArgs, '--path', `[local-path:${shortHash(request.path)}]`);
  addFlag(actionArgs, '--app', request.app || request.targetProgramName);
  addFlag(actionArgs, '--hotkey', request.hotkey);
  addFlag(actionArgs, '--browser-profile', request.browserProfile);
  addFlag(actionArgs, '--browser-session', request.browserSession);
  addFlag(actionArgs, '--approval-bundle', `[approval-bundle:${approvalId}]`);
  addFlag(actionArgs, '--approval-id', approvalId);
  addFlag(actionArgs, '--approval-nonce', '[nonce-bound]');
  actionArgs.push('--execute');
  return actionArgs.map(publicArg);
}

function buildBundle(args) {
  const now = new Date();
  const actionReceipt = args.selfTest ? fixtureActionReceipt() : readJson(args.actionReceipt, null);
  const generatedAt = now.toISOString();

  if (!actionReceipt) {
    return {
      schemaVersion: SCHEMA_VERSION,
      generatedAt,
      approvalId: `hwap-empty-${Date.now().toString(36)}`,
      status: 'empty',
      summary: {
        status: 'empty',
        approvalRequired: false,
        actionKind: '',
        target: '',
        risk: 'none',
      },
      execution: {
        allowed: false,
        reason: 'No hardware action receipt was available.',
      },
    };
  }

  const approvalId = `hwap-${Date.now().toString(36)}-${shortHash(actionReceipt.actionId || actionReceipt)}`;
  const nonce = crypto.randomBytes(16).toString('hex');
  const expiresAt = new Date(now.getTime() + args.ttlMinutes * 60 * 1000).toISOString();
  const target = approvalTargetFor(actionReceipt);
  const actionStatus = actionReceipt.summary?.status || 'unknown';
  const approvalRequired = Boolean(actionReceipt.permission?.approvalRequired || actionReceipt.summary?.approvalRequired);
  const breakGlass = Boolean(actionReceipt.permission?.breakGlass);
  const manualReview = actionNeedsRedactedManualReview(actionReceipt);
  const pending = approvalRequired && !actionReceipt.summary?.mutatingActionExecuted && ['approval_required', 'planned'].includes(actionStatus);
  const bundlePath = resolveRepoPath(path.join(args.bundleDir, `${approvalId}.json`));
  const executeArgs = buildExecuteArgs(actionReceipt, approvalId, nonce, bundlePath);
  const publicExecuteArgs = buildPublicExecuteArgs(actionReceipt, approvalId);
  const executionAllowed = pending && !breakGlass && !manualReview;
  const trust = trustForReceipt(args, actionReceipt);
  const trustedAutonomyEligible = executionAllowed && trust.trustedAutonomyEligible && trust.level === 'trusted';
  const status = breakGlass
    ? 'blocked'
    : manualReview
      ? 'manual_review_required'
      : pending
        ? 'pending_user_approval'
        : 'not_required';

  return {
    schemaVersion: SCHEMA_VERSION,
    generatedAt,
    approvalId,
    nonce,
    status,
    sourceAnchors: {
      source: 'apps/holoshell/source/holoshell-hardware-control.hsplus',
      adapter: 'scripts/holoshell-approval-bundle.mjs',
      actionExecutor: 'scripts/holoshell-action-executor.mjs',
      actionReceipt: toPublicPath(actionReceipt.output?.receiptPath || args.actionReceipt, 'action-receipt'),
    },
    host: {
      platform: process.platform,
      arch: process.arch,
      release: os.release(),
      hostname: os.hostname(),
    },
    sourceAction: {
      actionId: actionReceipt.actionId || '',
      status: actionStatus,
      actionKind: actionReceipt.summary?.actionKind || actionReceipt.request?.actionKind || '',
      permissionEnvelope: actionReceipt.summary?.permissionEnvelope || actionReceipt.permission?.envelope || 'unknown',
      target,
      targetAppName: actionReceipt.summary?.targetAppName || actionReceipt.target?.program?.displayName || '',
      targetWindowTitle: actionReceipt.summary?.targetWindowTitle || actionReceipt.target?.title || '',
      mutatingActionExecuted: Boolean(actionReceipt.summary?.mutatingActionExecuted),
    },
    browserBoundary: actionReceipt.browserBoundary || null,
    approval: {
      approvalRequired,
      requiresFreshUserGesture: true,
      expiresAt,
      ttlMinutes: args.ttlMinutes,
      approvalText: `Approve ${actionReceipt.request?.actionKind || 'hardware action'} for ${target}`,
      risk: riskFor(actionReceipt),
      rollback: actionReceipt.rollback || 'manual_or_app_specific',
      browserBoundaryRequired: Boolean(actionReceipt.browserBoundary),
      browserBoundarySummary: actionReceipt.browserBoundary
        ? `${actionReceipt.browserBoundary.urlClassification}; ${actionReceipt.browserBoundary.profileBoundary}`
        : '',
    },
    trust,
    execution: {
      allowed: executionAllowed,
      trustedAutonomyEligible,
      trustedAutonomyRequiresDaemonFlag: trustedAutonomyEligible,
      trustedAutonomyDefault: 'off',
      command: executionAllowed ? publicExecuteArgs : [],
      publicCommand: executionAllowed ? publicExecuteArgs : [],
      privateCommandHash: executionAllowed ? hashValue(executeArgs) : '',
      commandPreview: executionAllowed ? publicExecuteArgs.map(shellArg).join(' ') : '',
      blockedReason: executionAllowed
        ? ''
        : breakGlass
          ? 'Break-glass hardware actions remain blocked.'
          : manualReview
            ? 'The action contains redacted typed text and requires a richer in-shell review.'
            : 'The latest action does not require approval.',
    },
    witness: {
      actionReceiptHash: hashValue(actionReceipt),
      beforeCaptureHash: actionReceipt.witness?.beforeCaptureHash || '',
      secretsCaptured: false,
    },
    summary: {
      status,
      approvalRequired,
      actionKind: actionReceipt.summary?.actionKind || actionReceipt.request?.actionKind || '',
      target,
      permissionEnvelope: actionReceipt.summary?.permissionEnvelope || actionReceipt.permission?.envelope || 'unknown',
      browserBoundaryStatus: actionReceipt.browserBoundary?.urlClassification || '',
      browserProfileBoundary: actionReceipt.browserBoundary?.profileBoundary || '',
      expiresAt,
      executionAllowed,
      trustLevel: trust.level,
      trustedAutonomyEligible,
      successesUntilTrusted: trust.successesUntilTrusted,
    },
  };
}

function assertSelfTest(bundle) {
  const failures = [];
  const serialized = JSON.stringify(bundle);
  if (bundle.schemaVersion !== SCHEMA_VERSION) failures.push('schemaVersion mismatch');
  if (bundle.status !== 'pending_user_approval') failures.push('expected pending approval');
  if (!bundle.execution.allowed) failures.push('expected executable fixture bundle');
  if (!bundle.execution.commandPreview.includes('--approval-nonce')) failures.push('expected nonce-bound command');
  if (!bundle.sourceAction.targetAppName) failures.push('expected target app');
  if (bundle.browserBoundary?.urlClassification !== 'public_web') failures.push('expected browser boundary to carry into approval bundle');
  if (!bundle.approval.browserBoundarySummary) failures.push('expected browser boundary approval summary');
  if (hasAbsolutePath(bundle.execution.commandPreview)) failures.push('public command preview leaked an absolute path');
  if (hasAbsolutePath(serialized)) failures.push('public approval bundle leaked an absolute path');
  if (bundle.witness.secretsCaptured) failures.push('approval bundle must not capture secrets');
  if (failures.length) throw new Error(`Self-test failed:\n- ${failures.join('\n- ')}`);
}

function writeOutputs(args, bundle) {
  const privateBundlePath = bundle.approvalId && bundle.status !== 'empty'
    ? path.join(resolveRepoPath(args.bundleDir), `${bundle.approvalId}.json`)
    : null;
  const outputPath = resolveRepoPath(args.output);
  const jsOutputPath = resolveRepoPath(args.jsOutput);
  const withOutput = {
    ...bundle,
    output: {
      latestPath: toPublicPath(outputPath, 'approval-latest'),
      bundlePath: privateBundlePath ? toPublicPath(privateBundlePath, 'approval-bundle') : null,
      browserBootstrap: toPublicPath(jsOutputPath, 'approval-bootstrap'),
    },
  };

  if (privateBundlePath) writeJson(privateBundlePath, withOutput);
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
    console.log(`HoloShell approval bundle: ${written.output.latestPath}`);
    if (written.output.bundlePath) console.log(`Bundle: ${written.output.bundlePath}`);
    console.log(`Status: ${written.summary.status}`);
    console.log(`Action: ${written.summary.actionKind || 'none'}`);
    console.log(`Target: ${written.summary.target || 'none'}`);
    console.log(`Executable: ${written.summary.executionAllowed ? 'yes' : 'no'}`);
  }
} catch (error) {
  console.error(`holoshell-approval-bundle failed: ${error.message}`);
  process.exit(1);
}
