#!/usr/bin/env node
/**
 * HoloShell Cloud Drive Cleanup Adapter
 *
 * Read-only connected-app inventory normalizer for cloud-drive permission
 * cleanup. It accepts exported/manual provider app records and emits public,
 * redacted inventory receipts. It never reads cookies or stores raw credentials.
 */

import { createHash } from 'node:crypto';
import { dirname, resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

export const VERSION = '0.1.0';
export const RECEIPT_VERSION = 'hololand.holoshell.cloud-drive-cleanup.v0.1.0';
export const WORKFLOW = 'cloud-drive-permission-cleanup';

const PROVIDERS = new Set(['google', 'microsoft', 'other']);
const STATES = new Set(['minimum_required', 'stale', 'overbroad', 'unknown', 'revoked']);
const DEFAULT_NEVER_SCOPES = [
  '*',
  'drive',
  'drive.readonly',
  'files.readwrite.all',
  'admin',
  'billing',
  'delete',
  'full_access',
];
const DEFAULT_MINIMUM_SCOPES = ['drive.file', 'files.read.selected'];

function parseArgs(argv) {
  const args = {
    command: argv[0],
    input: undefined,
    out: undefined,
    now: undefined,
    dryRun: false,
  };

  for (let i = 1; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--input') args.input = argv[++i];
    else if (arg === '--out') args.out = argv[++i];
    else if (arg === '--now') args.now = argv[++i];
    else if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--self-test') args.command = '--self-test';
    else if (arg === '--help' || arg === '-h') args.command = 'help';
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

function printHelp() {
  process.stdout.write(`HoloShell Cloud Drive Cleanup Adapter ${VERSION}

Usage:
  node scripts/holoshell-cloud-drive-cleanup-adapter.mjs inventory --input connected-apps.json --out inventory.json
  node scripts/holoshell-cloud-drive-cleanup-adapter.mjs pack --input connected-apps.json --out pack.json
  node scripts/holoshell-cloud-drive-cleanup-adapter.mjs --self-test

Input shape:
  {
    "provider": "google",
    "accountLabel": "private@example.com",
    "browserProfile": "Default",
    "minimumScopes": ["drive.file"],
    "neverScopes": ["*", "drive", "drive.readonly"],
    "apps": [
      {"appLabel": "HoloLand Builder", "scopes": ["drive.file"]},
      {"appLabel": "Old Builder", "scopes": ["drive"]}
    ]
  }
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

function digest(value) {
  return createHash('sha256')
    .update(typeof value === 'string' ? value : JSON.stringify(canonical(value)), 'utf8')
    .digest('hex');
}

function hashValue(value) {
  return `sha256:${digest(value)}`;
}

function withHash(receipt) {
  const base = { ...receipt, hashAlgorithm: 'sha256' };
  return { ...base, hash: hashValue(base) };
}

function nowIso(args, input) {
  const value = args.now ?? input.now ?? new Date().toISOString();
  if (Number.isNaN(Date.parse(value))) throw new Error(`Invalid ISO timestamp: ${value}`);
  return value;
}

function normalizeScopeName(scope) {
  return String(scope ?? '')
    .trim()
    .toLowerCase();
}

function riskForScope(scope, neverScopes) {
  const normalized = normalizeScopeName(scope);
  if (neverScopes.includes(normalized)) return 'critical';
  if (/\b(admin|billing|owner|delete|full_access|write_all|manage_all)\b/.test(normalized)) {
    return 'critical';
  }
  if (normalized.includes('write') || normalized.includes('readwrite') || normalized === 'drive') {
    return 'high';
  }
  if (normalized.includes('file') || normalized.includes('selected')) return 'medium';
  return 'low';
}

function redactLabel(label, fallback) {
  const value = String(label || fallback || 'unknown').trim();
  if (!value) return 'unknown <redacted>';
  const maybeEmail = value.match(/^([^@]{1,2})[^@]*(@.+)$/);
  if (maybeEmail) return `${maybeEmail[1]}***${maybeEmail[2]}`;
  return `${value.replace(/[A-Za-z0-9._%+-]{3,}/g, (segment) => `${segment.slice(0, 2)}***`)} <redacted>`;
}

function coerceScopeRecord(scope, minimumScopes, neverScopes) {
  const scopeName = typeof scope === 'string' ? scope : scope.scope;
  const normalizedScope = normalizeScopeName(scopeName);
  const minimumRequired = minimumScopes.includes(normalizedScope);
  const riskLevel =
    typeof scope === 'string'
      ? riskForScope(scopeName, neverScopes)
      : (scope.riskLevel ?? riskForScope(scopeName, neverScopes));
  const overbroad = neverScopes.includes(normalizedScope) || riskLevel === 'critical';
  return {
    scope: String(scopeName),
    providerLabel:
      typeof scope === 'string' ? String(scopeName) : (scope.providerLabel ?? String(scopeName)),
    normalizedScope,
    purpose:
      typeof scope === 'string'
        ? 'Observed provider connected-app scope.'
        : (scope.purpose ?? 'Observed provider connected-app scope.'),
    riskLevel,
    minimumRequired,
    overbroad,
  };
}

function classifyApp(scopes, explicitState) {
  if (explicitState && STATES.has(explicitState)) return explicitState;
  if (scopes.some((scope) => scope.overbroad)) return 'overbroad';
  if (scopes.some((scope) => scope.minimumRequired)) return 'minimum_required';
  if (scopes.length === 0) return 'unknown';
  return 'stale';
}

function buildInventoryReceipt(input, args = {}) {
  const observedAt = nowIso(args, input);
  const provider = input.provider ?? 'other';
  if (!PROVIDERS.has(provider)) throw new Error(`Unsupported provider: ${provider}`);
  const accountLabel = input.accountLabel ?? input.redactedAccountLabel ?? `${provider}:account`;
  const minimumScopes = (input.minimumScopes ?? DEFAULT_MINIMUM_SCOPES).map(normalizeScopeName);
  const neverScopes = (input.neverScopes ?? DEFAULT_NEVER_SCOPES).map(normalizeScopeName);
  const apps = Array.isArray(input.apps) ? input.apps : [];
  const connectedApps = apps.map((app, index) => {
    const scopes = (Array.isArray(app.scopes) ? app.scopes : []).map((scope) =>
      coerceScopeRecord(scope, minimumScopes, neverScopes)
    );
    const state = classifyApp(scopes, app.state);
    return {
      appIdHash: hashValue(app.appId ?? app.appLabel ?? `app-${index}`),
      redactedAppLabel: redactLabel(app.appLabel, `app-${index}`),
      state,
      scopes,
      ...(app.lastSeenAt ? { lastSeenAt: app.lastSeenAt } : {}),
      revokeCandidate: state === 'stale' || state === 'overbroad',
      ...(state === 'overbroad'
        ? {
            residualAccessWarning:
              app.residualAccessWarning ??
              'Provider sessions may remain valid until browser refresh.',
          }
        : {}),
    };
  });

  return withHash({
    id: `cloud-drive-inventory-${digest({ provider, accountLabel, observedAt, connectedApps }).slice(0, 12)}`,
    schemaVersion: RECEIPT_VERSION,
    workflow: WORKFLOW,
    provider,
    redactedAccountLabel: redactLabel(
      input.redactedAccountLabel ?? accountLabel,
      `${provider}:account`
    ),
    accountLabelHash: hashValue(accountLabel),
    browserProfile: input.browserProfile
      ? redactLabel(input.browserProfile, 'browser-profile')
      : 'browser profile <redacted>',
    observedAt,
    connectedApps,
    staleGrantCount: connectedApps.filter((app) => app.state === 'stale').length,
    overbroadGrantCount: connectedApps.filter((app) => app.state === 'overbroad').length,
    rawCredentialCaptured: false,
    cookieExported: false,
    publicReceiptMayContainAbsolutePath: false,
  });
}

function buildPermissionGateSubPack(input, inventory, args = {}) {
  const PG_VERSION = 'hololand.holoshell.permission-gate.v0.1.0';
  const PG_WORKFLOW = 'provider-app-device-permission-gate';
  const PG_SUBJECT_KINDS = new Set(['provider_account', 'oauth_app', 'browser_profile', 'os_app_permission', 'device', 'connector', 'cloud_service', 'local_app']);
  const PG_ENVELOPES = new Set(['read_only', 'guarded_grant', 'break_glass_permission', 'revoke_only']);
  const PG_STATUSES = new Set(['planned', 'requested', 'granted', 'verified', 'revoked', 'blocked', 'failed']);
  const PG_VERIFICATION_METHODS = new Set(['oauth_tokeninfo', 'provider_settings', 'os_permission_probe', 'device_permission_probe', 'connector_probe', 'manual_redacted_witness']);
  const NEVER = ['*', 'admin', 'billing', 'delete', 'full_access', 'write_all', 'manage_all'];
  const at = inventory.observedAt;

  const provider = inventory.provider;
  const subjectKind = 'cloud_service';
  const subjectLabel = `${provider}:cloud-drive-cleanup`;

  // Collect scopes from inventory for the permission gate
  const requestedScopes = inventory.connectedApps.flatMap((app) =>
    app.scopes.map((scope) => ({
      scope: scope.scope,
      purpose: scope.purpose,
      riskLevel: scope.riskLevel,
      required: scope.minimumRequired,
      providerLabel: scope.providerLabel,
    }))
  );
  const minimumRequiredScopes = requestedScopes.filter((s) => s.required);
  const permissionEnvelope = 'read_only';
  const purpose = `Cloud drive connected-app inventory for ${inventory.redactedAccountLabel}`;

  const subjectId = `permission-subject-${digest({ provider, subjectKind, subjectLabel }).slice(0, 12)}`;
  const requestId = `permission-request-${digest({ subjectId, requestedScopes, minimumRequiredScopes, purpose, at }).slice(0, 12)}`;
  const approvalId = `approval-${digest({ subjectId, requestId, at }).slice(0, 12)}`;

  const subject = withHash({
    id: subjectId,
    schemaVersion: PG_VERSION,
    subjectKind,
    provider,
    redactedSubjectLabel: inventory.redactedAccountLabel,
    subjectLabelHash: inventory.accountLabelHash,
    accountLabelHash: inventory.accountLabelHash,
    browserProfile: inventory.browserProfile,
    credentialAdjacent: true,
    publicReceiptMayContainAbsolutePath: false,
    credentialExtrusionAllowed: false,
    createdAt: at,
  });

  const request = withHash({
    id: requestId,
    schemaVersion: PG_VERSION,
    subjectReceiptId: subject.id,
    requestedScopes,
    minimumRequiredScopes,
    neverScopes: NEVER,
    purpose,
    permissionEnvelope,
    requiresFreshUserGesture: false,
    approvalId,
    commandPreviewContainsAbsolutePaths: false,
    requestedAt: at,
  });

  const gateReplay = withHash({
    id: `permission-replay-${digest({ subjectId: subject.id, requestId: request.id, status: 'planned', at }).slice(0, 12)}`,
    schemaVersion: PG_VERSION,
    workflow: PG_WORKFLOW,
    status: 'planned',
    subjectReceiptId: subject.id,
    requestReceiptId: request.id,
    replayKey: hashValue({ workflow: PG_WORKFLOW, subject: subject.hash, request: request.hash, adapterVersion: VERSION }),
    rawCredentialCaptured: false,
    overbroadScopeAccepted: false,
    readyForHoloLand: false,
    createdAt: at,
  });

  return withHash({
    id: `permission-gate-pack-${digest({ subject: subject.hash, request: request.hash }).slice(0, 12)}`,
    schemaVersion: PG_VERSION,
    workflow: PG_WORKFLOW,
    status: 'planned',
    subject,
    request,
    replay: gateReplay,
  });
}

function buildCleanupPack(input, args = {}) {
  const inventory = buildInventoryReceipt(input, args);
  const permissionGate = buildPermissionGateSubPack(input, inventory, args);
  const at = inventory.observedAt;

  const replay = withHash({
    id: `cloud-cleanup-replay-${digest({ inventoryId: inventory.id, permissionPackId: permissionGate.id, at }).slice(0, 12)}`,
    schemaVersion: RECEIPT_VERSION,
    workflow: WORKFLOW,
    status: 'inventoried',
    inventoryReceiptId: inventory.id,
    permissionPackId: permissionGate.id,
    revocationReceiptIds: [],
    replayKey: hashValue({ workflow: WORKFLOW, inventory: inventory.hash, permissionGate: permissionGate.hash, adapterVersion: VERSION }),
    rawCredentialCaptured: false,
    sourceCloudDataMutated: false,
    previewOnlyImport: true,
    readyForHoloLandPreview: false,
    createdAt: at,
  });

  return withHash({
    id: `cloud-drive-cleanup-pack-${digest({ inventory: inventory.hash, permissionGate: permissionGate.hash }).slice(0, 12)}`,
    schemaVersion: RECEIPT_VERSION,
    workflow: WORKFLOW,
    status: 'inventoried',
    inventory,
    permissionGate,
    revocations: [],
    replay,
  });
}

function validateInventoryReceipt(receipt) {
  const errors = [];
  if (!receipt?.id) errors.push('CloudDriveConnectedAppInventoryReceipt.id is required.');
  if (receipt?.schemaVersion !== RECEIPT_VERSION)
    errors.push(`schemaVersion must be ${RECEIPT_VERSION}.`);
  if (receipt?.workflow !== WORKFLOW) errors.push(`workflow must be ${WORKFLOW}.`);
  if (!PROVIDERS.has(receipt?.provider))
    errors.push(`provider is unsupported: ${receipt?.provider}.`);
  if (!receipt?.redactedAccountLabel) errors.push('redactedAccountLabel is required.');
  if (!receipt?.accountLabelHash) errors.push('accountLabelHash is required.');
  if (!receipt?.browserProfile) errors.push('browserProfile is required.');
  if (Number.isNaN(Date.parse(receipt?.observedAt)))
    errors.push('observedAt must be a valid ISO timestamp.');
  if (!Array.isArray(receipt?.connectedApps)) errors.push('connectedApps must be an array.');
  for (const [index, app] of (receipt?.connectedApps ?? []).entries()) {
    if (!app.appIdHash) errors.push(`connectedApps[${index}].appIdHash is required.`);
    if (!app.redactedAppLabel) errors.push(`connectedApps[${index}].redactedAppLabel is required.`);
    if (!STATES.has(app.state))
      errors.push(`connectedApps[${index}].state is unsupported: ${app.state}.`);
    if (typeof app.revokeCandidate !== 'boolean') {
      errors.push(`connectedApps[${index}].revokeCandidate must be a boolean.`);
    }
    for (const [scopeIndex, scope] of (app.scopes ?? []).entries()) {
      if (!scope.scope)
        errors.push(`connectedApps[${index}].scopes[${scopeIndex}].scope is required.`);
      if (!scope.normalizedScope) {
        errors.push(`connectedApps[${index}].scopes[${scopeIndex}].normalizedScope is required.`);
      }
    }
  }
  if (receipt?.rawCredentialCaptured !== false) errors.push('rawCredentialCaptured must be false.');
  if (receipt?.cookieExported !== false) errors.push('cookieExported must be false.');
  if (receipt?.publicReceiptMayContainAbsolutePath !== false) {
    errors.push('publicReceiptMayContainAbsolutePath must be false.');
  }
  const publicJson = JSON.stringify(receipt);
  if (/\b(access_token|refresh_token|client_secret|id_token)=/i.test(publicJson)) {
    errors.push('public receipt contains credential query material.');
  }
  return errors;
}

function runCommand(args) {
  if (!args.command || args.command === 'help') {
    printHelp();
    return { ok: true };
  }
  if (args.command === '--self-test') return runSelfTest();
  if (args.command === 'pack') {
    if (!args.input) throw new Error('pack requires --input');
    const pack = buildCleanupPack(readJson(args.input), args);
    const invErrors = validateInventoryReceipt(pack.inventory);
    if (invErrors.length > 0)
      throw new Error(`adapter produced invalid inventory in pack: ${invErrors.join('; ')}`);
    if (args.dryRun) {
      process.stdout.write(
        `${JSON.stringify({ ok: true, dryRun: true, packId: pack.id, inventoryId: pack.inventory.id, permissionPackId: pack.permissionGate.id }, null, 2)}\n`
      );
      return { ok: true, pack };
    }
    const out = args.out ?? join('.bench-logs', 'holoshell-human-os-frontier', new Date().toISOString().slice(0, 10), 'cloud-drive-cleanup-pack.json');
    const written = writeJson(out, pack);
    process.stdout.write(
      `${JSON.stringify({ ok: true, out: written, packId: pack.id, inventoryId: pack.inventory.id, permissionPackId: pack.permissionGate.id, status: pack.status }, null, 2)}\n`
    );
    return { ok: true, pack, out: written };
  }
  if (args.command !== 'inventory') throw new Error(`Unknown command: ${args.command}`);
  if (!args.input) throw new Error('inventory requires --input');
  const receipt = buildInventoryReceipt(readJson(args.input), args);
  const errors = validateInventoryReceipt(receipt);
  if (errors.length > 0)
    throw new Error(`adapter produced invalid inventory: ${errors.join('; ')}`);
  if (args.dryRun) {
    process.stdout.write(
      `${JSON.stringify({ ok: true, dryRun: true, receiptId: receipt.id }, null, 2)}\n`
    );
    return { ok: true, receipt };
  }
  const out = args.out ?? join('.bench-logs', 'holoshell-cloud-drive-cleanup-inventory.json');
  const written = writeJson(out, receipt);
  process.stdout.write(
    `${JSON.stringify({ ok: true, out: written, receiptId: receipt.id }, null, 2)}\n`
  );
  return { ok: true, receipt, out: written };
}

function runSelfTest() {
  const dir = join(tmpdir(), `holoshell-cloud-drive-cleanup-${process.pid}`);
  mkdirSync(dir, { recursive: true });
  const inputPath = join(dir, 'connected-apps.json');
  const invOutPath = join(dir, 'inventory.json');
  const packOutPath = join(dir, 'pack.json');
  const testInput = {
    now: '2026-05-21T10:00:00.000Z',
    provider: 'google',
    accountLabel: 'private-human@example.com',
    browserProfile: 'Default',
    minimumScopes: ['drive.file'],
    neverScopes: ['*', 'drive', 'drive.readonly', 'admin', 'billing', 'delete', 'full_access'],
    apps: [
      { appLabel: 'HoloLand Builder', appId: 'app-1', scopes: ['drive.file'] },
      { appLabel: 'Old Builder', appId: 'app-2', scopes: ['drive'] },
    ],
  };
  writeJson(inputPath, testInput);

  // Test inventory command
  const { receipt } = runCommand(parseArgs(['inventory', '--input', inputPath, '--out', invOutPath]));
  let errors = validateInventoryReceipt(receipt);
  const publicJson = JSON.stringify(receipt);
  if (publicJson.includes('private-human@example.com')) errors.push('raw account label leaked');
  if (receipt.overbroadGrantCount !== 1) errors.push('expected one overbroad grant');
  if (!receipt.connectedApps[1].revokeCandidate)
    errors.push('overbroad app should be revoke candidate');

  // Test pack command
  const { pack } = runCommand(parseArgs(['pack', '--input', inputPath, '--out', packOutPath]));
  if (!pack.inventory) errors.push('pack.inventory is missing');
  if (!pack.permissionGate) errors.push('pack.permissionGate is missing');
  if (!pack.replay) errors.push('pack.replay is missing');
  if (pack.revocations.length !== 0) errors.push('pack should start with empty revocations');
  if (pack.schemaVersion !== RECEIPT_VERSION) errors.push(`pack.schemaVersion mismatch: ${pack.schemaVersion}`);
  if (pack.workflow !== WORKFLOW) errors.push(`pack.workflow mismatch: ${pack.workflow}`);
  if (pack.status !== 'inventoried') errors.push(`pack.status should be inventoried, got ${pack.status}`);
  if (pack.replay.inventoryReceiptId !== pack.inventory.id) errors.push('replay.inventoryReceiptId must match inventory.id');
  if (pack.replay.permissionPackId !== pack.permissionGate.id) errors.push('replay.permissionPackId must match permissionGate.id');
  if (pack.replay.rawCredentialCaptured !== false) errors.push('replay.rawCredentialCaptured must be false');
  if (pack.replay.sourceCloudDataMutated !== false) errors.push('replay.sourceCloudDataMutated must be false');
  if (pack.replay.previewOnlyImport !== true) errors.push('replay.previewOnlyImport must be true');

  // Verify no credential leak in pack JSON
  const packJson = JSON.stringify(pack);
  if (packJson.includes('private-human@example.com')) errors.push('pack leaks raw account label');
  if (packJson.includes('app-1') || packJson.includes('app-2')) errors.push('pack leaks raw app IDs');
  if (/\b(access_token|refresh_token|client_secret|id_token)=/i.test(packJson)) errors.push('pack contains credential material');

  // Verify permission gate sub-pack integrity
  const pg = pack.permissionGate;
  if (pg.schemaVersion !== 'hololand.holoshell.permission-gate.v0.1.0') errors.push('permission gate schema version mismatch');
  if (pg.subject.subjectKind !== 'cloud_service') errors.push('permission gate subject kind must be cloud_service');
  if (pg.request.permissionEnvelope !== 'read_only') errors.push('permission gate envelope must be read_only for inventory');
  if (pg.replay.rawCredentialCaptured !== false) errors.push('permission gate replay must not capture credentials');

  if (errors.length > 0) throw new Error(`Self-test failures:\n${errors.join('\n')}`);
  process.stdout.write(
    `${JSON.stringify({ ok: true, adapter: 'holoshell-cloud-drive-cleanup-adapter', version: VERSION }, null, 2)}\n`
  );
  return { ok: true, receipt, pack };
}

if (
  import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}` ||
  process.argv[1]?.endsWith('holoshell-cloud-drive-cleanup-adapter.mjs')
) {
  try {
    runCommand(parseArgs(process.argv.slice(2)));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${JSON.stringify({ ok: false, error: message }, null, 2)}\n`);
    process.exit(1);
  }
}

export { buildInventoryReceipt, buildCleanupPack, normalizeScopeName, validateInventoryReceipt };
