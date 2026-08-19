#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import crypto from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCHEMA_VERSION = 'hololand.holoshell.trust-ledger.v0.1.0';
const ACTION_SCHEMA_VERSION = 'hololand.holoshell.hardware-action.v0.1.0';
const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '..');
const DEFAULT_TMP = path.join('.tmp', 'holoshell');
const DEFAULT_ACTION_RECEIPT = path.join(DEFAULT_TMP, 'action-latest.json');
const DEFAULT_OUTPUT = path.join(DEFAULT_TMP, 'trust-ledger.json');
const DEFAULT_JS_OUTPUT = path.join(DEFAULT_TMP, 'trust-ledger.js');
const DEFAULT_PROMOTION_THRESHOLD = 3;
const MAX_HISTORY = 24;

function parseArgs(argv) {
  const args = {
    json: false,
    selfTest: false,
    reset: false,
    actionReceipt: DEFAULT_ACTION_RECEIPT,
    output: DEFAULT_OUTPUT,
    jsOutput: DEFAULT_JS_OUTPUT,
    promotionThreshold: DEFAULT_PROMOTION_THRESHOLD,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--json') args.json = true;
    else if (arg === '--self-test') args.selfTest = true;
    else if (arg === '--reset') args.reset = true;
    else if (arg === '--action-receipt') args.actionReceipt = argv[++index];
    else if (arg === '--output') args.output = argv[++index];
    else if (arg === '--js-output') args.jsOutput = argv[++index];
    else if (arg === '--promotion-threshold') args.promotionThreshold = Number(argv[++index] || args.promotionThreshold);
    else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!Number.isFinite(args.promotionThreshold) || args.promotionThreshold < 1) {
    args.promotionThreshold = DEFAULT_PROMOTION_THRESHOLD;
  }
  return args;
}

function printHelp() {
  console.log(`HoloShell trusted autonomy ledger

Usage:
  node scripts/holoshell-trust-ledger.mjs [options]

Options:
  --json                       Print the ledger.
  --self-test                  Run fixture assertions.
  --reset                      Rebuild the ledger from the supplied action receipt only.
  --action-receipt <path>      Hardware action receipt. Defaults to .tmp/holoshell/action-latest.json.
  --output <path>              Ledger JSON. Defaults to .tmp/holoshell/trust-ledger.json.
  --js-output <path>           Browser bootstrap JS. Defaults to .tmp/holoshell/trust-ledger.js.
  --promotion-threshold <n>    Approved successes before trusted eligibility. Defaults to 3.
  -h, --help                   Show this help.
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

function writeBrowserBootstrap(filePath, ledger) {
  const resolved = resolveRepoPath(filePath);
  mkdirSync(path.dirname(resolved), { recursive: true });
  const payload = JSON.stringify(ledger, null, 2).replace(/<\/script/gi, '<\\/script');
  writeFileSync(resolved, `window.HOLOSHELL_TRUST_LEDGER = ${payload};\n`, 'utf8');
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

function shortHash(value, length = 14) {
  return hashValue(value).slice(0, length);
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
    return {
      kind: 'url',
      label: targetHost(request.url) || 'web',
      privateHash: shortHash(request.url || 'url'),
    };
  }
  if (request.actionKind === 'open_path') {
    return {
      kind: 'path',
      label: 'local path',
      privateHash: shortHash(request.path || ''),
    };
  }
  const app = summary.targetAppName || program.displayName || request.targetProgramName || request.app || '';
  if (app) {
    return { kind: 'program', label: app, privateHash: shortHash(app) };
  }
  const windowTitle = summary.targetWindowTitle || target.title || request.targetWindowTitle || '';
  const processName = summary.targetProcessName || target.processName || request.targetProcessName || '';
  if (processName || windowTitle) {
    return {
      kind: 'window',
      label: processName || 'window',
      privateHash: shortHash(`${processName}:${windowTitle}`),
    };
  }
  return { kind: 'machine', label: 'local computer', privateHash: shortHash('local computer') };
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
  return {
    id: `trust-${shortHash(payload, 16)}`,
    ...payload,
    targetLabel: target.label,
  };
}

function emptyLedger(args) {
  return {
    schemaVersion: SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    sourceAnchors: {
      source: 'apps/holoshell/source/holoshell-trusted-autonomy.hsplus',
      adapter: 'scripts/holoshell-trust-ledger.mjs',
      actionExecutor: 'scripts/holoshell-action-executor.mjs',
    },
    host: {
      platform: process.platform,
      arch: process.arch,
      release: os.release(),
      hostname: os.hostname(),
    },
    policy: {
      promotionThreshold: args.promotionThreshold,
      levels: ['read_only', 'guarded', 'trusted', 'break_glass'],
      trustedAutonomyRequiresDaemonFlag: true,
      breakGlassPromotesNever: true,
      receiptRequired: true,
    },
    records: {},
    latestAction: null,
    summary: {
      status: 'empty',
      recordCount: 0,
      trustedRecordCount: 0,
      guardedRecordCount: 0,
      readOnlyRecordCount: 0,
      breakGlassRecordCount: 0,
      latestTrustLevel: 'unknown',
      latestActionKind: '',
      latestTarget: '',
      latestActionFingerprint: '',
      trustedAutonomyEligible: false,
      successesUntilTrusted: args.promotionThreshold,
    },
  };
}

function eventTypeFor(receipt) {
  const status = receipt.summary?.status || 'unknown';
  const envelope = receipt.permission?.envelope || receipt.summary?.permissionEnvelope || 'unknown';
  if (envelope === 'break_glass') return 'break_glass';
  if (['blocked', 'error', 'target_not_found'].includes(status)) return 'failure';
  if (status === 'completed') return 'success';
  if (['approval_required', 'planned'].includes(status)) return 'staged';
  return 'observed';
}

function levelFor(record, threshold) {
  if (record.permissionEnvelope === 'break_glass' || record.breakGlassCount > 0) return 'break_glass';
  if (record.permissionEnvelope === 'read_only') return 'read_only';
  if (record.permissionEnvelope !== 'guarded_execute') return 'guarded';
  if (record.failureCount > 0) return 'guarded';
  if (record.approvedSuccessCount >= threshold) return 'trusted';
  return 'guarded';
}

function explain(record, threshold) {
  if (!record) return 'No matching action has been observed yet.';
  if (record.trustLevel === 'read_only') return 'Read-only actions run quietly with receipts.';
  if (record.trustLevel === 'break_glass') return 'Break-glass actions never promote to trusted autonomy.';
  if (record.trustLevel === 'trusted') return `This action has ${record.approvedSuccessCount} approved successful receipt(s) and no failures.`;
  const remaining = Math.max(0, threshold - (record.approvedSuccessCount || 0));
  if (record.failureCount > 0) return `${record.failureCount} failure receipt(s) keep this action guarded.`;
  return `${remaining} more approved successful receipt(s) needed before trusted autonomy eligibility.`;
}

function compactRecord(record, threshold) {
  const trustLevel = levelFor(record, threshold);
  const successesUntilTrusted = trustLevel === 'trusted' || trustLevel === 'read_only' || trustLevel === 'break_glass'
    ? 0
    : Math.max(0, threshold - record.approvedSuccessCount);
  return {
    ...record,
    trustLevel,
    successesUntilTrusted,
    trustedAutonomyEligible: trustLevel === 'trusted',
    explanation: explain({ ...record, trustLevel }, threshold),
  };
}

function updateRecord(existing, receipt, threshold) {
  const fingerprint = fingerprintFor(receipt);
  const actionId = receipt.actionId || shortHash(receipt);
  const eventType = eventTypeFor(receipt);
  const alreadySeen = existing?.receiptIds?.includes(actionId);
  const record = {
    fingerprint: fingerprint.id,
    actionKind: fingerprint.actionKind,
    targetKind: fingerprint.targetKind,
    targetLabel: fingerprint.targetLabel || 'local computer',
    targetHash: fingerprint.targetHash,
    permissionEnvelope: fingerprint.permissionEnvelope,
    firstSeenAt: existing?.firstSeenAt || receipt.generatedAt || new Date().toISOString(),
    lastSeenAt: receipt.generatedAt || new Date().toISOString(),
    stagedCount: existing?.stagedCount || 0,
    successCount: existing?.successCount || 0,
    approvedSuccessCount: existing?.approvedSuccessCount || 0,
    failureCount: existing?.failureCount || 0,
    breakGlassCount: existing?.breakGlassCount || 0,
    observedCount: existing?.observedCount || 0,
    lastStatus: receipt.summary?.status || 'unknown',
    lastActionId: actionId,
    receiptIds: existing?.receiptIds ? [...existing.receiptIds] : [],
    history: existing?.history ? [...existing.history] : [],
  };

  if (!alreadySeen) {
    record.observedCount += 1;
    if (eventType === 'staged') record.stagedCount += 1;
    if (eventType === 'success') record.successCount += 1;
    if (eventType === 'failure') record.failureCount += 1;
    if (eventType === 'break_glass') record.breakGlassCount += 1;
    if (
      eventType === 'success'
      && record.permissionEnvelope === 'guarded_execute'
      && (receipt.summary?.mutatingActionExecuted || receipt.approvalContext?.approvalId)
    ) {
      record.approvedSuccessCount += 1;
    }
    record.receiptIds.unshift(actionId);
    record.history.unshift({
      actionId,
      eventType,
      status: receipt.summary?.status || 'unknown',
      generatedAt: receipt.generatedAt || new Date().toISOString(),
    });
  }

  record.receiptIds = record.receiptIds.slice(0, MAX_HISTORY);
  record.history = record.history.slice(0, MAX_HISTORY);
  return compactRecord(record, threshold);
}

function summarize(records, latestAction, threshold) {
  const values = Object.values(records);
  const trustedRecordCount = values.filter((record) => record.trustLevel === 'trusted').length;
  const guardedRecordCount = values.filter((record) => record.trustLevel === 'guarded').length;
  const readOnlyRecordCount = values.filter((record) => record.trustLevel === 'read_only').length;
  const breakGlassRecordCount = values.filter((record) => record.trustLevel === 'break_glass').length;
  const latestRecord = latestAction?.fingerprint ? records[latestAction.fingerprint] : null;
  return {
    status: values.length ? 'ready' : 'empty',
    recordCount: values.length,
    trustedRecordCount,
    guardedRecordCount,
    readOnlyRecordCount,
    breakGlassRecordCount,
    latestTrustLevel: latestRecord?.trustLevel || 'unknown',
    latestActionKind: latestRecord?.actionKind || '',
    latestTarget: latestRecord?.targetLabel || '',
    latestActionFingerprint: latestRecord?.fingerprint || '',
    trustedAutonomyEligible: Boolean(latestRecord?.trustedAutonomyEligible),
    successesUntilTrusted: latestRecord?.successesUntilTrusted ?? threshold,
    promotionThreshold: threshold,
  };
}

function validActionReceipt(receipt) {
  return receipt?.schemaVersion === ACTION_SCHEMA_VERSION && receipt?.summary;
}

function buildLedger(args, receiptOverride = null) {
  const previous = args.reset ? emptyLedger(args) : readJson(args.output, null) || emptyLedger(args);
  const receipt = receiptOverride || readJson(args.actionReceipt, null);
  const records = {};
  for (const [fingerprint, record] of Object.entries(previous.records || {})) {
    records[fingerprint] = compactRecord(record, args.promotionThreshold);
  }

  let latestAction = previous.latestAction || null;
  if (validActionReceipt(receipt)) {
    const fingerprint = fingerprintFor(receipt);
    records[fingerprint.id] = updateRecord(records[fingerprint.id], receipt, args.promotionThreshold);
    latestAction = {
      actionId: receipt.actionId || '',
      fingerprint: fingerprint.id,
      actionKind: fingerprint.actionKind,
      targetKind: fingerprint.targetKind,
      targetLabel: fingerprint.targetLabel || 'local computer',
      permissionEnvelope: fingerprint.permissionEnvelope,
      status: receipt.summary?.status || 'unknown',
      generatedAt: receipt.generatedAt || new Date().toISOString(),
    };
  }

  return {
    ...emptyLedger(args),
    generatedAt: new Date().toISOString(),
    records,
    latestAction,
    summary: summarize(records, latestAction, args.promotionThreshold),
  };
}

function fixtureReceipt({ actionId, status = 'completed', mutatingActionExecuted = true, envelope = 'guarded_execute' }) {
  return {
    schemaVersion: ACTION_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    actionId,
    request: {
      actionKind: 'launch_app',
      targetProgramName: 'Fixture Editor',
      app: 'Fixture Editor',
    },
    permission: {
      envelope,
      approvalRequired: envelope !== 'read_only',
      mutating: envelope === 'guarded_execute' || envelope === 'break_glass',
      breakGlass: envelope === 'break_glass',
    },
    target: {
      program: { displayName: 'Fixture Editor' },
    },
    approvalContext: mutatingActionExecuted ? { approvalId: `approval-${actionId}` } : null,
    summary: {
      status,
      actionKind: 'launch_app',
      permissionEnvelope: envelope,
      mutatingActionExecuted,
      targetAppName: 'Fixture Editor',
    },
  };
}

function assertSelfTest(args) {
  let ledger = emptyLedger(args);
  const tmpOutput = path.join('.tmp', 'holoshell', `trust-ledger-self-test-${Date.now().toString(36)}.json`);
  const testArgs = { ...args, output: tmpOutput, jsOutput: `${tmpOutput}.js`, promotionThreshold: 3 };
  for (let index = 0; index < 3; index += 1) {
    writeJson(testArgs.output, ledger);
    ledger = buildLedger(testArgs, fixtureReceipt({ actionId: `fixture-${index}` }));
  }
  const record = Object.values(ledger.records)[0];
  const breakGlassLedger = buildLedger({ ...testArgs, output: `${tmpOutput}-break.json` }, fixtureReceipt({ actionId: 'break', envelope: 'break_glass', status: 'blocked', mutatingActionExecuted: false }));
  const failures = [];
  if (ledger.summary.latestTrustLevel !== 'trusted') failures.push('expected trusted promotion after three approved successes');
  if (!ledger.summary.trustedAutonomyEligible) failures.push('expected trusted autonomy eligibility');
  if (record.approvedSuccessCount !== 3) failures.push('expected approved success count');
  if (breakGlassLedger.summary.latestTrustLevel !== 'break_glass') failures.push('break-glass action must not promote');
  if (failures.length) throw new Error(`Self-test failed:\n- ${failures.join('\n- ')}`);
  return ledger;
}

try {
  const args = parseArgs(process.argv.slice(2));
  if (args.selfTest) {
    const ledger = assertSelfTest(args);
    if (args.json) console.log(JSON.stringify(ledger, null, 2));
    else console.log('HoloShell trust ledger self-test passed.');
    process.exit(0);
  }
  const ledger = buildLedger(args);
  const output = writeJson(args.output, ledger);
  const jsOutput = writeBrowserBootstrap(args.jsOutput, ledger);
  if (args.json) {
    console.log(JSON.stringify(ledger, null, 2));
  } else {
    console.log(`HoloShell trust ledger: ${output}`);
    console.log(`Browser bootstrap: ${jsOutput}`);
    console.log(`Status: ${ledger.summary.status}`);
    console.log(`Latest trust level: ${ledger.summary.latestTrustLevel}`);
    console.log(`Trusted records: ${ledger.summary.trustedRecordCount}`);
  }
} catch (error) {
  console.error(`holoshell-trust-ledger failed: ${error.message}`);
  process.exit(1);
}
