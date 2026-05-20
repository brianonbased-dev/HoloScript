#!/usr/bin/env node
/**
 * HoloShell Permission Gate Adapter
 *
 * Native receipt adapter for provider, app, connector, OS, and device
 * permission grants. It never stores raw credentials: public receipts carry
 * redacted subject labels, redacted command/URL previews, and token reference
 * hashes only.
 */

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

export const VERSION = '0.1.0';
export const RECEIPT_VERSION = 'hololand.holoshell.permission-gate.v0.1.0';
export const WORKFLOW = 'provider-app-device-permission-gate';

const SUBJECT_KINDS = new Set([
  'provider_account',
  'oauth_app',
  'browser_profile',
  'os_app_permission',
  'device',
  'connector',
  'cloud_service',
  'local_app',
]);

const ENVELOPES = new Set(['read_only', 'guarded_grant', 'break_glass_permission', 'revoke_only']);
const STATUSES = new Set(['planned', 'requested', 'granted', 'verified', 'revoked', 'blocked', 'failed']);
const VERIFICATION_METHODS = new Set([
  'oauth_tokeninfo',
  'provider_settings',
  'os_permission_probe',
  'device_permission_probe',
  'connector_probe',
  'manual_redacted_witness',
]);

const DEFAULT_DATE = new Date().toISOString().slice(0, 10);

function parseArgs(argv) {
  const args = {
    command: argv[0],
    input: undefined,
    pack: undefined,
    out: undefined,
    date: DEFAULT_DATE,
    now: undefined,
    dryRun: false,
    scopes: [],
    minimumScopes: [],
    grantedScopes: [],
    deniedScopes: [],
    neverScopes: [],
  };

  for (let i = 1; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--input') args.input = argv[++i];
    else if (arg === '--pack') args.pack = argv[++i];
    else if (arg === '--out') args.out = argv[++i];
    else if (arg === '--date') args.date = argv[++i];
    else if (arg === '--now') args.now = argv[++i];
    else if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--scope') args.scopes.push(argv[++i]);
    else if (arg === '--minimum-scope') args.minimumScopes.push(argv[++i]);
    else if (arg === '--granted-scope') args.grantedScopes.push(argv[++i]);
    else if (arg === '--denied-scope') args.deniedScopes.push(argv[++i]);
    else if (arg === '--never-scope') args.neverScopes.push(argv[++i]);
    else if (arg.startsWith('--')) {
      const key = arg.slice(2).replace(/-([a-z])/g, (_m, letter) => letter.toUpperCase());
      args[key] = argv[++i];
    } else if (arg === 'help') {
      args.command = 'help';
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return args;
}

function printHelp() {
  process.stdout.write(`HoloShell Permission Gate Adapter ${VERSION}

Usage:
  node scripts/holoshell-permission-gate-adapter.mjs plan --input request.json [--out pack.json]
  node scripts/holoshell-permission-gate-adapter.mjs verify --pack pack.json --input verify.json [--out pack.json]
  node scripts/holoshell-permission-gate-adapter.mjs revoke --pack pack.json --input revoke.json [--out pack.json]
  node scripts/holoshell-permission-gate-adapter.mjs --self-test

Scope format for CLI flags:
  --scope "drive.file|Read approved HoloLand files|medium|true|Provider label"

Credential rule:
  Prefer --token-reference-hash or input.tokenReferenceHash. If a raw
  tokenReference is supplied, this adapter hashes it and never writes the raw
  value to the public receipt.
`);
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function writeJson(path, value) {
  const absolute = resolve(path);
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  return absolute;
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, v]) => v !== undefined)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, canonical(v)])
    );
  }
  return value;
}

function sha256Text(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

function digest(value) {
  return sha256Text(typeof value === 'string' ? value : JSON.stringify(canonical(value)));
}

function hashValue(value) {
  return `sha256:${digest(value)}`;
}

function withHash(receipt) {
  const base = { ...receipt, hashAlgorithm: 'sha256' };
  return { ...base, hash: hashValue(base) };
}

function nowIso(argsOrInput, input) {
  const value = argsOrInput?.now ?? input?.now ?? new Date().toISOString();
  if (Number.isNaN(Date.parse(value))) throw new Error(`Invalid ISO timestamp: ${value}`);
  return value;
}

function normalizeScopeName(scope) {
  return String(scope ?? '').trim().toLowerCase();
}

function parseScopeSpec(spec) {
  const [scope, purpose = 'Permission needed for the approved HoloShell operation.', riskLevel = 'medium', required = 'true', providerLabel] =
    String(spec).split('|');
  if (!scope?.trim()) throw new Error(`Invalid scope spec: ${spec}`);
  return {
    scope: scope.trim(),
    purpose: purpose.trim(),
    required: required.trim().toLowerCase() !== 'false',
    riskLevel: riskLevel.trim(),
    ...(providerLabel?.trim() ? { providerLabel: providerLabel.trim() } : {}),
  };
}

function scopesFromInput(rawScopes, fallback = []) {
  if (Array.isArray(rawScopes) && rawScopes.length > 0) {
    return rawScopes.map((scope) => (typeof scope === 'string' ? parseScopeSpec(scope) : { ...scope }));
  }
  return fallback.map((scope) => ({ ...scope }));
}

function forbiddenScopeReason(scope, neverScopes = []) {
  const normalized = normalizeScopeName(scope);
  const explicitNever = neverScopes.map(normalizeScopeName);
  if (explicitNever.includes(normalized)) return 'is listed in neverScopes';
  if (normalized === '*' || normalized.includes('*')) return 'uses a wildcard';
  if (/\b(admin|billing|owner|delete|full_access|write_all|manage_all)\b/.test(normalized)) {
    return 'requests broad administrative authority';
  }
  return undefined;
}

function buildScopeDiff({ requestedScopes, minimumRequiredScopes, grantedScopes = [], neverScopes = [] }) {
  const requestedNames = new Set(requestedScopes.map((scope) => normalizeScopeName(scope.scope)).filter(Boolean));
  const grantedNames = new Set(grantedScopes.map((scope) => normalizeScopeName(scope.scope)).filter(Boolean));
  const minimumNames = new Set(minimumRequiredScopes.map((scope) => normalizeScopeName(scope.scope)).filter(Boolean));
  const requiredMinimum = minimumRequiredScopes.filter((scope) => scope.required);
  const missingRequestedRequiredScopes = requiredMinimum
    .map((scope) => scope.scope)
    .filter((scope) => !requestedNames.has(normalizeScopeName(scope)));
  const missingGrantedRequiredScopes = requiredMinimum
    .map((scope) => scope.scope)
    .filter((scope) => !grantedNames.has(normalizeScopeName(scope)));
  const extraGrantedScopes = grantedScopes
    .map((scope) => scope.scope)
    .filter((scope) => !minimumNames.has(normalizeScopeName(scope)));
  const forbiddenRequestedScopes = requestedScopes
    .map((scope) => ({ scope: scope.scope, normalizedScope: normalizeScopeName(scope.scope), reason: forbiddenScopeReason(scope.scope, neverScopes) }))
    .filter((scope) => scope.reason)
    .map((scope) => ({ ...scope, allowed: false }));
  const forbiddenGrantedScopes = grantedScopes
    .map((scope) => ({ scope: scope.scope, normalizedScope: normalizeScopeName(scope.scope), reason: forbiddenScopeReason(scope.scope, neverScopes) }))
    .filter((scope) => scope.reason)
    .map((scope) => ({ ...scope, allowed: false }));

  return {
    requestedScopes: requestedScopes.map((scope) => scope.scope),
    minimumRequiredScopes: minimumRequiredScopes.map((scope) => scope.scope),
    grantedScopes: grantedScopes.map((scope) => scope.scope),
    missingRequestedRequiredScopes,
    missingGrantedRequiredScopes,
    extraGrantedScopes,
    forbiddenRequestedScopes,
    forbiddenGrantedScopes,
    minimumScopeSatisfied:
      missingRequestedRequiredScopes.length === 0 &&
      missingGrantedRequiredScopes.length === 0 &&
      forbiddenRequestedScopes.length === 0 &&
      forbiddenGrantedScopes.length === 0,
    excessScopesAbsent: extraGrantedScopes.length === 0,
  };
}

function redactPreview(value) {
  const original = value ?? '';
  let preview = original;
  preview = preview.replace(/(^|[\s"'`=])(?:[A-Za-z]:[\\/]|\/(?!\/)[^\s"'`]+)/g, (_match, prefix) => {
    return `${prefix}<absolute-path-redacted>`;
  });
  preview = preview.replace(
    /\b(access_token|refresh_token|id_token|client_secret|authorization|cookie|code)=([^&\s]+)/gi,
    (_match, key, currentValue) => `${key}=${currentValue === '<redacted>' ? '<redacted>' : '<redacted>'}`
  );
  preview = preview.replace(/\bBearer\s+([A-Za-z0-9._~+/=-]+|<redacted>)/gi, 'Bearer <redacted>');
  return preview;
}

function publicSubjectLabel(provider, subjectKind, subjectLabel, redactedSubjectLabel) {
  if (redactedSubjectLabel?.trim()) return redactPreview(redactedSubjectLabel.trim());
  const hash = digest(subjectLabel || `${provider}:${subjectKind}`).slice(0, 10);
  return `${provider} ${subjectKind} <redacted:${hash}>`;
}

function defaultVerificationMethod(subjectKind) {
  if (subjectKind === 'device') return 'device_permission_probe';
  if (subjectKind === 'os_app_permission' || subjectKind === 'local_app') return 'os_permission_probe';
  if (subjectKind === 'connector' || subjectKind === 'cloud_service') return 'connector_probe';
  return 'oauth_tokeninfo';
}

function defaultRevocationInstruction(provider, subjectKind) {
  if (subjectKind === 'device') return `Open the device permission panel for ${provider} and revoke the approved capability.`;
  if (subjectKind === 'os_app_permission' || subjectKind === 'local_app') {
    return `Open OS application permissions for ${provider} and revoke the approved permission.`;
  }
  if (subjectKind === 'connector' || subjectKind === 'cloud_service') {
    return `Open connector settings for ${provider} and remove the approved integration scope.`;
  }
  return `Open ${provider} account permissions and remove the approved HoloLand/HoloShell access.`;
}

function buildPlanPack(input, args = {}) {
  const at = nowIso(args, input);
  const subjectKind = input.subjectKind ?? args.subjectKind;
  const provider = input.provider ?? args.provider;
  const subjectLabel = input.subjectLabel ?? args.subjectLabel ?? `${provider}:${subjectKind}`;
  const argScopes = Array.isArray(args.scopes) ? args.scopes.map(parseScopeSpec) : [];
  const argMinimumScopes = Array.isArray(args.minimumScopes) ? args.minimumScopes.map(parseScopeSpec) : [];
  const requestedScopes = scopesFromInput(input.requestedScopes ?? input.scopes, argScopes);
  const minimumRequiredScopes = scopesFromInput(
    input.minimumRequiredScopes ?? input.minimumScopes,
    argMinimumScopes.length > 0 ? argMinimumScopes : requestedScopes.filter((scope) => scope.required)
  );
  const neverScopes = input.neverScopes ?? args.neverScopes ?? ['*', 'admin', 'billing', 'delete', 'full_access', 'write_all', 'manage_all'];
  const permissionEnvelope = input.permissionEnvelope ?? args.permissionEnvelope ?? 'guarded_grant';
  const purpose = input.purpose ?? args.purpose ?? 'Approve the minimum permission needed for a HoloShell operation.';

  if (!SUBJECT_KINDS.has(subjectKind)) throw new Error(`Unsupported subjectKind: ${subjectKind}`);
  if (!provider?.trim()) throw new Error('provider is required');
  if (!requestedScopes.length) throw new Error('at least one requested scope is required');
  if (!minimumRequiredScopes.length) throw new Error('at least one minimum required scope is required');
  if (!ENVELOPES.has(permissionEnvelope)) throw new Error(`Unsupported permissionEnvelope: ${permissionEnvelope}`);

  const diff = buildScopeDiff({ requestedScopes, minimumRequiredScopes, neverScopes });
  if (diff.missingRequestedRequiredScopes.length > 0 || diff.forbiddenRequestedScopes.length > 0) {
    throw new Error(`Requested scopes violate permission policy: ${JSON.stringify(diff)}`);
  }

  const subjectId = `permission-subject-${digest({ provider, subjectKind, subjectLabel }).slice(0, 12)}`;
  const requestId = `permission-request-${digest({ subjectId, requestedScopes, minimumRequiredScopes, purpose, at }).slice(0, 12)}`;
  const approvalId = input.approvalId ?? args.approvalId ?? `approval-${digest({ subjectId, requestId, at }).slice(0, 12)}`;
  const commandOrUrlPreview = redactPreview(input.commandOrUrlPreview ?? args.commandOrUrlPreview ?? '');

  const subject = withHash({
    id: subjectId,
    schemaVersion: RECEIPT_VERSION,
    subjectKind,
    provider,
    redactedSubjectLabel: publicSubjectLabel(provider, subjectKind, subjectLabel, input.redactedSubjectLabel ?? args.redactedSubjectLabel),
    subjectLabelHash: hashValue(subjectLabel),
    ...(input.accountLabel ? { accountLabelHash: hashValue(input.accountLabel) } : {}),
    ...(input.browserProfile ? { browserProfile: redactPreview(input.browserProfile) } : {}),
    ...(input.appIdentifier ? { appIdentifier: redactPreview(input.appIdentifier) } : {}),
    ...(input.deviceId ? { deviceIdHash: hashValue(input.deviceId) } : {}),
    credentialAdjacent: input.credentialAdjacent ?? true,
    publicReceiptMayContainAbsolutePath: false,
    credentialExtrusionAllowed: false,
    createdAt: at,
  });

  const request = withHash({
    id: requestId,
    schemaVersion: RECEIPT_VERSION,
    subjectReceiptId: subject.id,
    requestedScopes,
    minimumRequiredScopes,
    neverScopes,
    purpose,
    permissionEnvelope,
    requiresFreshUserGesture: permissionEnvelope === 'read_only' ? (input.requiresFreshUserGesture ?? false) : true,
    approvalId,
    ...(commandOrUrlPreview ? { commandOrUrlPreview } : {}),
    commandPreviewContainsAbsolutePaths: false,
    requestedAt: at,
    ...(input.expiresAt ? { expiresAt: input.expiresAt } : {}),
  });

  const replay = withHash({
    id: `permission-replay-${digest({ subjectId: subject.id, requestId: request.id, status: 'planned', at }).slice(0, 12)}`,
    schemaVersion: RECEIPT_VERSION,
    workflow: WORKFLOW,
    status: 'planned',
    subjectReceiptId: subject.id,
    requestReceiptId: request.id,
    replayKey: hashValue({ workflow: WORKFLOW, subject: subject.hash, request: request.hash, adapterVersion: VERSION }),
    rawCredentialCaptured: false,
    overbroadScopeAccepted: false,
    readyForHoloLand: false,
    createdAt: at,
  });

  return withHash({
    id: `permission-gate-pack-${digest({ subject: subject.hash, request: request.hash }).slice(0, 12)}`,
    schemaVersion: RECEIPT_VERSION,
    workflow: WORKFLOW,
    status: 'planned',
    subject,
    request,
    replay,
  });
}

function buildVerifiedPack(pack, input, args = {}) {
  const at = nowIso(args, input);
  const argGrantedScopes = Array.isArray(args.grantedScopes) ? args.grantedScopes.map(parseScopeSpec) : [];
  const grantedScopes = scopesFromInput(input.grantedScopes, argGrantedScopes);
  if (!grantedScopes.length) throw new Error('verify requires grantedScopes or --granted-scope');
  const deniedScopes = input.deniedScopes ?? args.deniedScopes ?? [];
  const diff = buildScopeDiff({
    requestedScopes: pack.request.requestedScopes,
    minimumRequiredScopes: pack.request.minimumRequiredScopes,
    grantedScopes,
    neverScopes: pack.request.neverScopes,
  });
  if (!diff.minimumScopeSatisfied || !diff.excessScopesAbsent) {
    throw new Error(`Grant rejected by minimum-scope policy: ${JSON.stringify(diff)}`);
  }

  const tokenReferenceHash = input.tokenReferenceHash ?? args.tokenReferenceHash ?? (input.tokenReference ? hashValue(input.tokenReference) : undefined);
  const grant = withHash({
    id: `permission-grant-${digest({ request: pack.request.hash, grantedScopes, at }).slice(0, 12)}`,
    schemaVersion: RECEIPT_VERSION,
    requestReceiptId: pack.request.id,
    grantedScopes,
    deniedScopes,
    missingRequiredScopes: [],
    extraScopes: [],
    grantObservedAt: at,
    freshUserGesture: input.freshUserGesture ?? true,
    hiddenAutomationUsed: false,
    rawCredentialCaptured: false,
    ...(tokenReferenceHash ? { tokenReferenceHash } : {}),
    ...(input.refreshChainHash ? { refreshChainHash: input.refreshChainHash } : {}),
    ...(input.expiresAt ? { expiresAt: input.expiresAt } : {}),
    revocationInstruction: input.revocationInstruction ?? defaultRevocationInstruction(pack.subject.provider, pack.subject.subjectKind),
    ...(input.revocationUrl ? { revocationUrlHash: hashValue(input.revocationUrl) } : {}),
  });

  const verificationMethod = input.verificationMethod ?? defaultVerificationMethod(pack.subject.subjectKind);
  if (!VERIFICATION_METHODS.has(verificationMethod)) {
    throw new Error(`Unsupported verificationMethod: ${verificationMethod}`);
  }

  const verification = withHash({
    id: `permission-verification-${digest({ grant: grant.hash, method: verificationMethod, at }).slice(0, 12)}`,
    schemaVersion: RECEIPT_VERSION,
    grantReceiptId: grant.id,
    verificationMethod,
    verifiedAt: at,
    minimumScopeSatisfied: true,
    excessScopesAbsent: true,
    verifiedScopes: grantedScopes,
    scopeDiffHash: hashValue(diff),
    readyForHoloLand: true,
    credentialExtrusionAllowed: false,
    publicReceiptMayContainAbsolutePath: false,
  });

  const replay = withHash({
    id: `permission-replay-${digest({ previous: pack.replay.hash, grant: grant.hash, verification: verification.hash, at }).slice(0, 12)}`,
    schemaVersion: RECEIPT_VERSION,
    workflow: WORKFLOW,
    status: 'verified',
    subjectReceiptId: pack.subject.id,
    requestReceiptId: pack.request.id,
    grantReceiptId: grant.id,
    verificationReceiptId: verification.id,
    replayKey: hashValue({
      previousReplayKey: pack.replay.replayKey,
      grant: grant.hash,
      verification: verification.hash,
      adapterVersion: VERSION,
    }),
    rawCredentialCaptured: false,
    overbroadScopeAccepted: false,
    readyForHoloLand: true,
    createdAt: at,
  });

  return withHash({
    ...pack,
    status: 'verified',
    grant,
    verification,
    replay,
  });
}

function buildRevokedPack(pack, input, args = {}) {
  const at = nowIso(args, input);
  if (!pack.grant) throw new Error('revoke requires a pack with a grant receipt');
  const revokeVerified = input.revokeVerified ?? args.revokeVerified === 'true' ?? false;
  const revocation = withHash({
    id: `permission-revocation-${digest({ grant: pack.grant.hash, at }).slice(0, 12)}`,
    schemaVersion: RECEIPT_VERSION,
    grantReceiptId: pack.grant.id,
    ...(revokeVerified ? { revokedAt: at } : {}),
    revokeVerified: Boolean(revokeVerified),
    revocationMethod: input.revocationMethod ?? args.revocationMethod ?? 'provider_settings',
    requiresFreshUserGesture: true,
    hiddenAutomationUsed: false,
    ...(input.residualAccessWarning ? { residualAccessWarning: input.residualAccessWarning } : {}),
    rollbackNote: input.rollbackNote ?? 'Permission revoked or revocation path recorded; residual provider sessions may expire asynchronously.',
  });

  const replay = withHash({
    id: `permission-replay-${digest({ previous: pack.replay.hash, revocation: revocation.hash, at }).slice(0, 12)}`,
    schemaVersion: RECEIPT_VERSION,
    workflow: WORKFLOW,
    status: 'revoked',
    subjectReceiptId: pack.subject.id,
    requestReceiptId: pack.request.id,
    grantReceiptId: pack.grant.id,
    ...(pack.verification ? { verificationReceiptId: pack.verification.id } : {}),
    revocationReceiptId: revocation.id,
    replayKey: hashValue({ previousReplayKey: pack.replay.replayKey, revocation: revocation.hash, adapterVersion: VERSION }),
    rawCredentialCaptured: false,
    overbroadScopeAccepted: false,
    readyForHoloLand: false,
    createdAt: at,
  });

  return withHash({
    ...pack,
    status: 'revoked',
    revocation,
    replay,
  });
}

function validatePack(pack) {
  const errors = [];
  if (!pack || typeof pack !== 'object') return ['HoloShellPermissionGateReceiptPack is required.'];
  if (pack.schemaVersion !== RECEIPT_VERSION) errors.push(`schemaVersion must be ${RECEIPT_VERSION}`);
  if (pack.workflow !== WORKFLOW) errors.push(`workflow must be ${WORKFLOW}`);
  if (!STATUSES.has(pack.status)) errors.push(`unsupported status: ${pack.status}`);
  if (pack.status !== pack.replay?.status) errors.push('pack status must match replay status');
  if (pack.subject?.publicReceiptMayContainAbsolutePath !== false) errors.push('subject may not expose absolute paths');
  if (pack.subject?.credentialExtrusionAllowed !== false) errors.push('subject may not allow credential extrusion');
  if (pack.request?.commandPreviewContainsAbsolutePaths !== false) errors.push('request command preview path flag must be false');
  if (JSON.stringify(pack).match(/\b(access_token|refresh_token|client_secret|id_token)=([A-Za-z0-9._~+/=-]+)/i)) {
    errors.push('public receipt contains raw credential query material');
  }
  if (JSON.stringify(pack).match(/\bBearer\s+(?!<redacted>)[A-Za-z0-9._~+/=-]+/i)) {
    errors.push('public receipt contains raw bearer credential material');
  }
  if ((pack.status === 'granted' || pack.status === 'verified' || pack.status === 'revoked') && !pack.grant) {
    errors.push('grant receipt is required after grant');
  }
  if ((pack.status === 'verified' || pack.replay?.readyForHoloLand) && !pack.verification) {
    errors.push('verification receipt is required before readiness');
  }
  if (pack.status === 'revoked' && !pack.revocation) errors.push('revocation receipt is required for revoked status');
  if (pack.grant && pack.grant.rawCredentialCaptured !== false) errors.push('grant rawCredentialCaptured must be false');
  if (pack.grant && pack.grant.hiddenAutomationUsed !== false) errors.push('grant hiddenAutomationUsed must be false');
  if (pack.replay?.overbroadScopeAccepted !== false) errors.push('replay overbroadScopeAccepted must be false');
  if (pack.replay?.rawCredentialCaptured !== false) errors.push('replay rawCredentialCaptured must be false');
  if (pack.verification?.readyForHoloLand && (!pack.verification.minimumScopeSatisfied || !pack.verification.excessScopesAbsent)) {
    errors.push('verification readiness requires minimum scope and no excess scopes');
  }
  return errors;
}

function defaultOutput(command, date) {
  return join('.bench-logs', 'holoshell-human-os-frontier', date, `permission-gate-${command}-receipt.json`);
}

function readInput(args) {
  return args.input ? readJson(args.input) : {};
}

function runCommand(args) {
  if (!args.command || args.command === '--help' || args.command === '-h' || args.command === 'help') {
    printHelp();
    return { ok: true };
  }
  if (args.command === '--self-test' || args.selfTest) return runSelfTest();

  const input = readInput(args);
  let pack;
  if (args.command === 'plan') {
    pack = buildPlanPack(input, args);
  } else if (args.command === 'verify') {
    if (!args.pack) throw new Error('verify requires --pack');
    pack = buildVerifiedPack(readJson(args.pack), input, args);
  } else if (args.command === 'revoke') {
    if (!args.pack) throw new Error('revoke requires --pack');
    pack = buildRevokedPack(readJson(args.pack), input, args);
  } else {
    throw new Error(`Unknown command: ${args.command}`);
  }

  const validationErrors = validatePack(pack);
  if (validationErrors.length > 0) throw new Error(`adapter produced invalid receipt: ${validationErrors.join('; ')}`);

  if (args.dryRun) {
    process.stdout.write(`${JSON.stringify({ ok: true, dryRun: true, status: pack.status, receiptId: pack.id }, null, 2)}\n`);
    return { ok: true, pack };
  }
  const out = args.out ?? defaultOutput(args.command, args.date);
  const written = writeJson(out, pack);
  process.stdout.write(`${JSON.stringify({ ok: true, out: written, status: pack.status, receiptId: pack.id }, null, 2)}\n`);
  return { ok: true, pack, out: written };
}

function runSelfTest() {
  const dir = join(tmpdir(), `holoshell-permission-gate-${process.pid}`);
  mkdirSync(dir, { recursive: true });
  const requestPath = join(dir, 'request.json');
  const planPath = join(dir, 'plan.json');
  const verifyPath = join(dir, 'verify.json');
  const verifiedPath = join(dir, 'verified.json');
  const revokePath = join(dir, 'revoke.json');
  const revokedPath = join(dir, 'revoked.json');

  writeJson(requestPath, {
    now: '2026-05-20T00:00:00.000Z',
    subjectKind: 'provider_account',
    provider: 'google',
    subjectLabel: 'joseph@example.com',
    browserProfile: 'Default',
    requestedScopes: [
      {
        scope: 'drive.file',
        purpose: 'Read and update only HoloLand-created world files.',
        required: true,
        riskLevel: 'medium',
        providerLabel: 'Google Drive per-file access',
      },
    ],
    minimumRequiredScopes: [
      {
        scope: 'drive.file',
        purpose: 'Read and update only HoloLand-created world files.',
        required: true,
        riskLevel: 'medium',
        providerLabel: 'Google Drive per-file access',
      },
    ],
    neverScopes: ['*', 'drive', 'admin', 'billing', 'delete', 'full_access'],
    purpose: 'Build a HoloLand world from an approved Drive file.',
    commandOrUrlPreview: 'https://accounts.google.com/o/oauth2/v2/auth?access_token=secret&scope=drive.file',
  });
  runCommand(parseArgs(['plan', '--input', requestPath, '--out', planPath]));

  writeJson(verifyPath, {
    now: '2026-05-20T00:01:00.000Z',
    grantedScopes: ['drive.file|Read and update only HoloLand-created world files.|medium|true|Google Drive per-file access'],
    tokenReference: 'raw-token-never-written',
    verificationMethod: 'oauth_tokeninfo',
    revocationInstruction: 'Open Google account app permissions and revoke HoloLand Builder.',
    revocationUrl: 'https://myaccount.google.com/permissions',
  });
  runCommand(parseArgs(['verify', '--pack', planPath, '--input', verifyPath, '--out', verifiedPath]));

  writeJson(revokePath, {
    now: '2026-05-20T00:02:00.000Z',
    revokeVerified: true,
    revocationMethod: 'provider_settings',
  });
  runCommand(parseArgs(['revoke', '--pack', verifiedPath, '--input', revokePath, '--out', revokedPath]));

  const plan = readJson(planPath);
  const verified = readJson(verifiedPath);
  const revoked = readJson(revokedPath);
  const errors = [
    ...validatePack(plan),
    ...validatePack(verified),
    ...validatePack(revoked),
  ];
  const publicJson = JSON.stringify({ plan, verified, revoked });
  if (publicJson.includes('joseph@example.com')) errors.push('raw subject label leaked');
  if (publicJson.includes('raw-token-never-written')) errors.push('raw token reference leaked');
  if (publicJson.includes('access_token=secret')) errors.push('raw access token leaked');
  if (!verified.grant?.tokenReferenceHash?.startsWith('sha256:')) errors.push('token reference hash missing');
  if (revoked.status !== 'revoked' || revoked.revocation?.revokeVerified !== true) errors.push('revoked receipt missing');

  try {
    const overbroadPath = join(dir, 'overbroad.json');
    writeJson(overbroadPath, {
      now: '2026-05-20T00:03:00.000Z',
      grantedScopes: ['drive.file|ok|medium|true', 'drive.readonly|too broad|medium|false'],
    });
    runCommand(parseArgs(['verify', '--pack', planPath, '--input', overbroadPath, '--dry-run']));
    errors.push('overbroad grant unexpectedly verified');
  } catch (error) {
    if (!String(error.message).includes('Grant rejected by minimum-scope policy')) {
      errors.push(`overbroad grant failed for wrong reason: ${error.message}`);
    }
  }

  if (errors.length > 0) throw new Error(`Self-test failures:\n${errors.join('\n')}`);
  process.stdout.write(`${JSON.stringify({ ok: true, adapter: 'holoshell-permission-gate-adapter', version: VERSION }, null, 2)}\n`);
  return { ok: true };
}

if (import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}` || process.argv[1]?.endsWith('holoshell-permission-gate-adapter.mjs')) {
  try {
    runCommand(parseArgs(process.argv.slice(2)));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${JSON.stringify({ ok: false, error: message }, null, 2)}\n`);
    process.exit(1);
  }
}

export {
  buildPlanPack,
  buildRevokedPack,
  buildScopeDiff,
  buildVerifiedPack,
  parseScopeSpec,
  redactPreview,
  validatePack,
};
