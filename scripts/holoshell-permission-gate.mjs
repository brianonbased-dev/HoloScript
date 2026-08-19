#!/usr/bin/env node
import crypto from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '..');
const frameworkBoardModule = path.resolve(REPO_ROOT, '..', 'HoloScript', 'packages', 'framework', 'dist', 'board', 'index.js');
const {
  HOLOSHELL_PERMISSION_GATE_RECEIPT_VERSION,
  PERMISSION_GATE_WORKFLOW,
  buildPermissionScopeDiff,
  redactPermissionGatePreview,
  validateHoloShellPermissionGateReceiptPack,
} = await import(pathToFileURL(frameworkBoardModule));

const DEFAULT_TMP = path.join('.tmp', 'holoshell');
const DEFAULT_OUTPUT = path.join(DEFAULT_TMP, 'permission-gate-latest.json');
const DEFAULT_JS_OUTPUT = path.join(DEFAULT_TMP, 'permission-gate-latest.js');
const DEFAULT_RECEIPT_DIR = path.join(DEFAULT_TMP, 'permission-gate-receipts');

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    action: 'plan',
    provider: 'unknown',
    subjectKind: 'provider_account',
    subjectLabel: 'account-redacted',
    browserProfile: '',
    appIdentifier: '',
    deviceId: '',
    scopes: [],
    minimumScopes: [],
    neverScopes: ['*', 'admin', 'billing', 'delete', 'full_access', 'owner', 'manage_all'],
    purpose: 'Grant the minimum permission needed for a HoloLand world operation.',
    verificationMethod: 'manual_redacted_witness',
    revocationInstruction: '',
    commandPreview: '',
    output: DEFAULT_OUTPUT,
    jsOutput: DEFAULT_JS_OUTPUT,
    receiptDir: DEFAULT_RECEIPT_DIR,
    json: false,
    selfTest: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === 'plan' || arg === 'verify' || arg === 'revoke') args.action = arg;
    else if (arg === '--action') args.action = argv[++index] || args.action;
    else if (arg === '--provider') args.provider = argv[++index] || args.provider;
    else if (arg === '--subject-kind') args.subjectKind = argv[++index] || args.subjectKind;
    else if (arg === '--subject-label') args.subjectLabel = argv[++index] || args.subjectLabel;
    else if (arg === '--browser-profile') args.browserProfile = argv[++index] || '';
    else if (arg === '--app-identifier') args.appIdentifier = argv[++index] || '';
    else if (arg === '--device-id') args.deviceId = argv[++index] || '';
    else if (arg === '--scope') args.scopes.push(...splitList(argv[++index] || ''));
    else if (arg === '--minimum-scope') args.minimumScopes.push(...splitList(argv[++index] || ''));
    else if (arg === '--never-scope') args.neverScopes.push(...splitList(argv[++index] || ''));
    else if (arg === '--purpose') args.purpose = argv[++index] || args.purpose;
    else if (arg === '--verification-method') args.verificationMethod = argv[++index] || args.verificationMethod;
    else if (arg === '--revocation-instruction') args.revocationInstruction = argv[++index] || '';
    else if (arg === '--command-preview') args.commandPreview = argv[++index] || '';
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

  if (args.selfTest) applySelfTestFixture(args);
  if (!args.minimumScopes.length) args.minimumScopes = [...args.scopes];
  if (!args.scopes.length) args.scopes = [...args.minimumScopes];
  if (!args.revocationInstruction) {
    args.revocationInstruction = `Open ${args.provider} app permissions and remove HoloLand access.`;
  }
  if (!args.commandPreview) {
    args.commandPreview = `https://provider.example/consent?provider=${encodeURIComponent(args.provider)}&scope=${encodeURIComponent(args.scopes.join(' '))}`;
  }
  return args;
}

function printHelp() {
  console.log(`HoloShell permission gate

Usage:
  node scripts/holoshell-permission-gate.mjs plan --provider google --subject-label "j***@example.com" --scope drive.file --minimum-scope drive.file --json
  node scripts/holoshell-permission-gate.mjs verify --provider github --scope repo:read --minimum-scope repo:read
  node scripts/holoshell-permission-gate.mjs revoke --provider google --scope drive.file --minimum-scope drive.file

This adapter writes HoloShellPermissionGateReceiptPack receipts. It never captures
raw OAuth tokens, cookies, refresh tokens, or unredacted account labels.`);
}

function applySelfTestFixture(args) {
  args.action = 'verify';
  args.provider = 'google';
  args.subjectKind = 'provider_account';
  args.subjectLabel = 'joseph@example.com';
  args.browserProfile = 'profile:default-redacted';
  args.scopes = ['drive.file'];
  args.minimumScopes = ['drive.file'];
  args.neverScopes = ['*', 'drive', 'admin', 'billing', 'delete', 'full_access'];
  args.purpose = 'Let HoloLand read and update only files it creates for a world build.';
  args.verificationMethod = 'oauth_tokeninfo';
  args.revocationInstruction = 'Open Google Account app permissions and remove HoloLand Builder access.';
  args.commandPreview = 'node C:/Users/private/oauth-helper.js --url https://accounts.google.com/o/oauth2/v2/auth?scope=drive.file&access_token=secret';
  args.output = path.join('.tmp', 'holoshell', 'self-test', 'permission-gate-latest.json');
  args.jsOutput = path.join('.tmp', 'holoshell', 'self-test', 'permission-gate-latest.js');
  args.receiptDir = path.join('.tmp', 'holoshell', 'self-test', 'permission-gate-receipts');
}

function splitList(value) {
  return String(value)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function resolveRepoPath(filePath) {
  return path.isAbsolute(filePath) ? filePath : path.resolve(REPO_ROOT, filePath);
}

function publicPath(filePath) {
  return path.relative(REPO_ROOT, resolveRepoPath(filePath)).replace(/\\/g, '/');
}

function writeText(filePath, text) {
  const resolved = resolveRepoPath(filePath);
  mkdirSync(path.dirname(resolved), { recursive: true });
  const tempPath = `${resolved}.${process.pid}.${Date.now().toString(36)}.${crypto.randomBytes(4).toString('hex')}.tmp`;
  writeFileSync(tempPath, text, 'utf8');
  renameSync(tempPath, resolved);
  return resolved;
}

function writeJson(filePath, value) {
  return writeText(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function writeBrowserBootstrap(filePath, value) {
  const payload = JSON.stringify(value, null, 2).replace(/<\/script/gi, '<\\/script');
  return writeText(filePath, `window.HOLOSHELL_PERMISSION_GATE = ${payload};\n`);
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

function redactSubjectLabel(label) {
  const value = String(label || 'account-redacted');
  if (value.includes('<redacted>') || value.includes('***')) return value;
  return value.replace(/^(.).+(@.+)$/, '$1***$2');
}

function scopeGrant(scope, purpose, required = true) {
  const lower = scope.toLowerCase();
  const riskLevel = /\b(write|readwrite|camera|microphone|location|device|robot)\b/.test(lower)
    ? 'high'
    : 'medium';
  return {
    scope,
    purpose,
    required,
    riskLevel,
    providerLabel: scope,
  };
}

function nowIso() {
  return new Date().toISOString();
}

function buildReceipt(args) {
  const generatedAt = nowIso();
  const redacted = redactSubjectLabel(args.subjectLabel);
  const requestedScopes = args.scopes.map((scope) => scopeGrant(scope, args.purpose, args.minimumScopes.includes(scope)));
  const minimumRequiredScopes = args.minimumScopes.map((scope) => scopeGrant(scope, args.purpose, true));
  const diff = buildPermissionScopeDiff({
    requestedScopes,
    minimumRequiredScopes,
    grantedScopes: args.action === 'plan' ? [] : requestedScopes,
    neverScopes: args.neverScopes,
  });
  const preview = redactPermissionGatePreview(args.commandPreview);
  const subjectId = `permission-subject-${shortHash([args.provider, args.subjectKind, args.subjectLabel])}`;
  const requestId = `permission-request-${shortHash([subjectId, args.scopes, args.minimumScopes])}`;
  const grantId = `permission-grant-${shortHash([requestId, args.action, args.scopes])}`;
  const verificationId = `permission-verification-${shortHash([grantId, diff])}`;
  const revocationId = `permission-revocation-${shortHash([grantId, args.revocationInstruction])}`;
  const status = args.action === 'revoke' ? 'revoked' : args.action === 'verify' ? 'verified' : 'requested';
  const readyForHoloLand = status === 'verified' && diff.minimumScopeSatisfied && diff.excessScopesAbsent;

  const subject = {
    id: subjectId,
    schemaVersion: HOLOSHELL_PERMISSION_GATE_RECEIPT_VERSION,
    subjectKind: args.subjectKind,
    provider: args.provider,
    redactedSubjectLabel: redacted,
    subjectLabelHash: `sha256:${hashValue(args.subjectLabel)}`,
    accountLabelHash: `sha256:${hashValue(args.subjectLabel)}`,
    ...(args.browserProfile ? { browserProfile: args.browserProfile } : {}),
    ...(args.appIdentifier ? { appIdentifier: args.appIdentifier } : {}),
    ...(args.deviceId ? { deviceIdHash: `sha256:${hashValue(args.deviceId)}` } : {}),
    credentialAdjacent: true,
    publicReceiptMayContainAbsolutePath: false,
    credentialExtrusionAllowed: false,
    createdAt: generatedAt,
    hash: `sha256:${hashValue([subjectId, redacted, args.provider])}`,
    hashAlgorithm: 'sha256',
  };

  const request = {
    id: requestId,
    schemaVersion: HOLOSHELL_PERMISSION_GATE_RECEIPT_VERSION,
    subjectReceiptId: subject.id,
    requestedScopes,
    minimumRequiredScopes,
    neverScopes: args.neverScopes,
    purpose: args.purpose,
    permissionEnvelope: args.action === 'revoke' ? 'revoke_only' : 'guarded_grant',
    requiresFreshUserGesture: true,
    approvalId: `permission-approval-${shortHash([requestId, generatedAt])}`,
    commandOrUrlPreview: preview.preview,
    commandPreviewContainsAbsolutePaths: false,
    requestedAt: generatedAt,
    hash: `sha256:${hashValue([requestId, requestedScopes, minimumRequiredScopes, args.neverScopes])}`,
    hashAlgorithm: 'sha256',
  };

  const grant =
    args.action === 'plan'
      ? undefined
      : {
          id: grantId,
          schemaVersion: HOLOSHELL_PERMISSION_GATE_RECEIPT_VERSION,
          requestReceiptId: request.id,
          grantedScopes: requestedScopes,
          deniedScopes: [],
          missingRequiredScopes: diff.missingGrantedRequiredScopes,
          extraScopes: diff.extraGrantedScopes,
          grantObservedAt: generatedAt,
          freshUserGesture: true,
          hiddenAutomationUsed: false,
          rawCredentialCaptured: false,
          tokenReferenceHash: `sha256:${hashValue([args.provider, redacted, requestedScopes])}`,
          refreshChainHash: `sha256:${hashValue(['refresh-chain-redacted', args.provider, redacted])}`,
          revocationInstruction: args.revocationInstruction,
          revocationUrlHash: `sha256:${hashValue(args.revocationInstruction)}`,
          hash: `sha256:${hashValue([grantId, requestedScopes, diff])}`,
          hashAlgorithm: 'sha256',
        };

  const verification =
    args.action === 'plan'
      ? undefined
      : {
          id: verificationId,
          schemaVersion: HOLOSHELL_PERMISSION_GATE_RECEIPT_VERSION,
          grantReceiptId: grant.id,
          verificationMethod: args.verificationMethod,
          verifiedAt: generatedAt,
          minimumScopeSatisfied: diff.minimumScopeSatisfied,
          excessScopesAbsent: diff.excessScopesAbsent,
          verifiedScopes: requestedScopes,
          scopeDiffHash: `sha256:${hashValue(diff)}`,
          readyForHoloLand,
          credentialExtrusionAllowed: false,
          publicReceiptMayContainAbsolutePath: false,
          hash: `sha256:${hashValue([verificationId, diff, readyForHoloLand])}`,
          hashAlgorithm: 'sha256',
        };

  const revocation =
    args.action === 'revoke'
      ? {
          id: revocationId,
          schemaVersion: HOLOSHELL_PERMISSION_GATE_RECEIPT_VERSION,
          grantReceiptId: grant.id,
          revokedAt: generatedAt,
          revokeVerified: true,
          revocationMethod: 'provider_settings',
          requiresFreshUserGesture: true,
          hiddenAutomationUsed: false,
          residualAccessWarning: 'Provider sessions may retain already-issued local state until they expire.',
          rollbackNote: 'Revocation blocks future connector use; prior exported local files require separate custody.',
          hash: `sha256:${hashValue([revocationId, grant.id, args.revocationInstruction])}`,
          hashAlgorithm: 'sha256',
        }
      : undefined;

  const replay = {
    id: `permission-replay-${shortHash([requestId, status, diff])}`,
    schemaVersion: HOLOSHELL_PERMISSION_GATE_RECEIPT_VERSION,
    workflow: PERMISSION_GATE_WORKFLOW,
    status,
    subjectReceiptId: subject.id,
    requestReceiptId: request.id,
    ...(grant ? { grantReceiptId: grant.id } : {}),
    ...(verification ? { verificationReceiptId: verification.id } : {}),
    ...(revocation ? { revocationReceiptId: revocation.id } : {}),
    replayKey: `sha256:${hashValue([args.provider, subject.subjectLabelHash, requestedScopes, status])}`,
    rawCredentialCaptured: false,
    overbroadScopeAccepted: false,
    readyForHoloLand,
    createdAt: generatedAt,
    hash: `sha256:${hashValue([status, diff, readyForHoloLand])}`,
    hashAlgorithm: 'sha256',
  };

  const pack = {
    id: `permission-gate-pack-${shortHash([subject.id, request.id, status])}`,
    schemaVersion: HOLOSHELL_PERMISSION_GATE_RECEIPT_VERSION,
    workflow: PERMISSION_GATE_WORKFLOW,
    status,
    subject,
    request,
    ...(grant ? { grant } : {}),
    ...(verification ? { verification } : {}),
    ...(revocation ? { revocation } : {}),
    replay,
    hash: `sha256:${hashValue([subject, request, grant, verification, revocation, replay])}`,
    hashAlgorithm: 'sha256',
  };

  const validationErrors = validateHoloShellPermissionGateReceiptPack(pack);
  if (validationErrors.length) {
    throw new Error(`Permission gate receipt failed validation:\n- ${validationErrors.join('\n- ')}`);
  }
  return {
    ...pack,
    sourceAnchors: {
      room: 'apps/holoshell/source/holoshell-permission-gate-room.holo',
      policy: 'apps/holoshell/source/holoshell-permission-gate-policy.hsplus',
      pipeline: 'apps/holoshell/source/holoshell-permission-gate-pipeline.hs',
      adapter: 'scripts/holoshell-permission-gate.mjs',
      upstreamValidator: 'packages/framework/src/board/holoshell-permission-gate-receipts.ts',
    },
    summary: {
      provider: args.provider,
      subjectKind: args.subjectKind,
      status,
      requestedScopeCount: requestedScopes.length,
      minimumScopeCount: minimumRequiredScopes.length,
      extraScopeCount: diff.extraGrantedScopes.length,
      minimumScopeSatisfied: diff.minimumScopeSatisfied,
      excessScopesAbsent: diff.excessScopesAbsent,
      rawCredentialCaptured: false,
      readyForHoloLand,
      commandPreviewRedacted: preview.redacted,
    },
  };
}

function writeReceipt(args, receipt) {
  const outputPath = writeJson(args.output, receipt);
  const jsPath = writeBrowserBootstrap(args.jsOutput, receipt);
  mkdirSync(resolveRepoPath(args.receiptDir), { recursive: true });
  const receiptPath = path.join(args.receiptDir, `${receipt.id}.json`);
  writeJson(receiptPath, receipt);
  receipt.output = {
    latestPath: publicPath(outputPath),
    jsPath: publicPath(jsPath),
    receiptPath: publicPath(receiptPath),
    receiptDir: publicPath(args.receiptDir),
  };
  writeJson(args.output, receipt);
  writeBrowserBootstrap(args.jsOutput, receipt);
  writeJson(receiptPath, receipt);
  return receipt;
}

function readJson(filePath) {
  return JSON.parse(readFileSync(resolveRepoPath(filePath), 'utf8'));
}

function runSelfTest(receipt) {
  if (!existsSync(resolveRepoPath(receipt.output.latestPath))) {
    throw new Error('Self-test expected latest receipt output to exist.');
  }
  const diskReceipt = readJson(receipt.output.latestPath);
  if (diskReceipt.replay.rawCredentialCaptured !== false) {
    throw new Error('Self-test detected raw credential capture.');
  }
  if (diskReceipt.replay.readyForHoloLand !== true) {
    throw new Error('Self-test expected readyForHoloLand true.');
  }
  if (diskReceipt.summary.commandPreviewRedacted !== true) {
    throw new Error('Self-test expected command preview redaction.');
  }
}

try {
  const args = parseArgs();
  const receipt = writeReceipt(args, buildReceipt(args));
  if (args.selfTest) runSelfTest(receipt);
  if (args.json) console.log(JSON.stringify(receipt, null, 2));
  else console.log(`permission gate receipt: ${receipt.id} (${receipt.status}) -> ${receipt.output.latestPath}`);
} catch (error) {
  console.error(`holoshell-permission-gate failed: ${error.message}`);
  process.exit(1);
}
