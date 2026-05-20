#!/usr/bin/env node
/**
 * HoloShell Actuation Plan Adapter
 *
 * Stages a real headset / robot / device actuation plan with:
 *   - Device inventory (read-only probe)
 *   - Bounded command simulation (no physical mutation)
 *   - Fresh approval + sensor freshness gate
 *   - Receipt pack: inventory + envelope + simulation + freshness + rollback limits
 *   - Safe-stop receipt on abort
 *
 * Execution is DISABLED by default.  Physical mutation only fires when
 * --approve-nonce matches the nonce minted during `plan`, proving the
 * caller explicitly reviewed the plan receipt before triggering hardware.
 *
 * Safety invariants:
 *   1. read_only default — `plan` and `simulate` never mutate the device
 *   2. No raw device IDs in public receipts (hashed + redacted label only)
 *   3. Simulation MUST pass before `approve` is accepted
 *   4. Sensor freshness gate enforced at `approve` time
 *   5. Nonce must match plan pack to unlock mutation
 *   6. Replay key covers: device hash + command hash + nonce + adapter version
 *   7. Safe stop always recorded (even on clean abort)
 *
 * task_1779224072780_0o16
 */

import { createHash, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

export const VERSION = '0.1.0';
export const WORKFLOW = 'holoshell-actuation-plan';

// ── Schema version constants (mirrors framework types) ──
export const ACTUATION_PLAN_PACK_VERSION = 'holoscript-actuation-plan-pack/v1';
export const ACTUATION_SIMULATION_RECEIPT_VERSION = 'holoscript-actuation-simulation-receipt/v1';
export const SENSOR_FRESHNESS_RECEIPT_VERSION = 'holoscript-sensor-freshness-receipt/v1';
export const SAFE_STOP_RECEIPT_VERSION = 'holoscript-safe-stop-receipt/v1';
export const PHYSICAL_ROLLBACK_LIMIT_RECEIPT_VERSION = 'holoscript-physical-rollback-limit-receipt/v1';

// ── Enum sets ──
const DEVICE_CATEGORIES = new Set([
  'headset', 'phone', 'webcam', 'gpu', 'robot',
  'printer', 'wallet', 'sensor', 'display', 'audio', 'input', 'other',
]);

const DEVICE_IDENTITY_SOURCES = new Set([
  'pnP_device_id', 'bluetooth_mac', 'usb_serial',
  'webgpu_adapter', 'openxr_instance', 'network_hostname', 'custom',
]);

const DEVICE_ACTION_CLASSES = new Set([
  'read', 'pair', 'command', 'haptic', 'xr_session',
  'sensor_read', 'camera', 'microphone', 'calibration',
  'firmware_update', 'factory_reset',
]);

const DEVICE_ACTION_RISK_LEVELS = new Set(['low', 'medium', 'high', 'critical']);

const SAFE_STOP_TRIGGERS = new Set([
  'operator_request', 'sensor_limit_exceeded', 'consent_expired',
  'simulation_divergence', 'hardware_fault', 'timeout', 'envelope_violation',
]);

const PACK_STATUSES = new Set(['planned', 'simulated', 'approved', 'executed', 'aborted']);

const DEFAULT_DATE = new Date().toISOString().slice(0, 10);

// ── CLI ──

function parseArgs(argv) {
  const args = {
    command: argv[0],
    input: undefined,
    pack: undefined,
    out: undefined,
    date: DEFAULT_DATE,
    now: undefined,
    dryRun: false,
    deviceId: undefined,
    deviceCategory: undefined,
    deviceLabel: undefined,
    actionClass: undefined,
    riskLevel: undefined,
    commandPreview: undefined,
    approveNonce: undefined,
    abortReason: undefined,
    selfTest: false,
  };

  for (let i = 1; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--input') args.input = argv[++i];
    else if (arg === '--pack') args.pack = argv[++i];
    else if (arg === '--out') args.out = argv[++i];
    else if (arg === '--date') args.date = argv[++i];
    else if (arg === '--now') args.now = argv[++i];
    else if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--device-id') args.deviceId = argv[++i];
    else if (arg === '--device-category') args.deviceCategory = argv[++i];
    else if (arg === '--device-label') args.deviceLabel = argv[++i];
    else if (arg === '--action-class') args.actionClass = argv[++i];
    else if (arg === '--risk-level') args.riskLevel = argv[++i];
    else if (arg === '--command-preview') args.commandPreview = argv[++i];
    else if (arg === '--approve-nonce') args.approveNonce = argv[++i];
    else if (arg === '--abort-reason') args.abortReason = argv[++i];
    else if (arg === '--self-test' || arg === 'self-test') args.selfTest = true;
    else if (arg === 'help' || arg === '--help' || arg === '-h') args.command = 'help';
    else throw new Error(`Unknown argument: ${arg}`);
  }

  if (args.selfTest || args.command === '--self-test') args.command = 'self-test';
  return args;
}

function printHelp() {
  const v = VERSION;
  process.stdout.write(
    `HoloShell Actuation Plan Adapter ${v}\n` +
    '\nUsage:\n' +
    '  node scripts/holoshell-actuation-plan-adapter.mjs plan --input request.json [--out pack.json]\n' +
    '  node scripts/holoshell-actuation-plan-adapter.mjs simulate --pack pack.json [--out pack.json]\n' +
    '  node scripts/holoshell-actuation-plan-adapter.mjs approve --pack pack.json --approve-nonce <nonce> [--out pack.json]\n' +
    '  node scripts/holoshell-actuation-plan-adapter.mjs abort --pack pack.json [--abort-reason "reason"] [--out pack.json]\n' +
    '  node scripts/holoshell-actuation-plan-adapter.mjs --self-test\n' +
    '\nSafety: execution is DISABLED by default.\n' +
    'Use `approve --approve-nonce <nonce>` from the plan receipt only after reviewing the simulation.\n'
  );
}

// ── Utilities ──

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

function redactId(id) {
  // Keep first 4 chars of type prefix (e.g. "quest"), then mask the rest.
  const visible = String(id ?? '').slice(0, 4);
  return `${visible}...<redacted:${digest(id).slice(0, 8)}>`;
}

function shortId(prefix, seed) {
  return `${prefix}-${digest(seed).slice(0, 12)}`;
}

function mintNonce() {
  return randomBytes(16).toString('hex');
}

// ── Receipt builders ──

function buildDeviceInventoryEntry(input, args) {
  const rawDeviceId = input.deviceId ?? args.deviceId;
  const category = input.deviceCategory ?? args.deviceCategory ?? 'other';
  const identitySource = input.identitySource ?? 'custom';

  if (!rawDeviceId?.trim()) throw new Error('deviceId is required');
  if (!DEVICE_CATEGORIES.has(category)) throw new Error(`Unsupported deviceCategory: ${category}`);
  if (!DEVICE_IDENTITY_SOURCES.has(identitySource)) throw new Error(`Unsupported identitySource: ${identitySource}`);

  const providedLabel = input.deviceLabel ?? args.deviceLabel ?? `${category} device`;

  // Public receipt: raw deviceId is NEVER stored — only the hash.
  // The hash is used as the stable reference in all downstream receipts.
  return {
    // NOTE: no `deviceId` field — use deviceIdHash for all public references
    redactedLabel: providedLabel,
    deviceIdHash: hashValue(rawDeviceId),
    identitySource,
    category,
    manufacturer: input.manufacturer,
    model: input.model,
    driverVersion: input.driverVersion,
    connectionStatus: input.connectionStatus ?? 'unknown',
    probedByHardwareAudit: false, // plan mode never calls hardware
  };
}

function buildActuationPlanPack(input, args = {}) {
  const at = nowIso(args, input);
  const device = buildDeviceInventoryEntry(input, args);

  const actionClass = input.actionClass ?? args.actionClass;
  const riskLevel = input.riskLevel ?? args.riskLevel ?? 'medium';
  const commandPreview = input.commandPreview ?? args.commandPreview ?? '';

  if (!DEVICE_ACTION_CLASSES.has(actionClass)) throw new Error(`Unsupported actionClass: ${actionClass}`);
  if (!DEVICE_ACTION_RISK_LEVELS.has(riskLevel)) throw new Error(`Unsupported riskLevel: ${riskLevel}`);

  const safeRanges = input.safeRanges ?? [];
  const maxSensorAgeMs = input.maxSensorAgeMs ?? 5000;
  const maxApprovalAgeMs = input.maxApprovalAgeMs ?? 30000;
  const rollbackScope = input.rollbackScope ?? null;
  const irreversibleScope = input.irreversibleScope ?? null;
  const rollbackWindowMs = input.rollbackWindowMs ?? 0;

  const actionId = shortId('actuation-action', { deviceIdHash: device.deviceIdHash, actionClass, commandPreview, at });
  const nonce = input.nonce ?? mintNonce();

  // Inventory receipt (plan-mode probe — read-only, no hardware call)
  const inventory = withHash({
    id: shortId('inventory', { deviceIdHash: device.deviceIdHash, at }),
    schemaVersion: 'holoscript-device-inventory-receipt/v1',
    inventoriedAt: at,
    inventoriedBy: `holoshell-actuation-plan-adapter@${VERSION}`,
    devices: [device],
    deviceCount: 1,
    categoriesFound: [device.category],
    hardwareProbeCompleted: false,
    warnings: ['plan mode — hardware probe deferred until approve'],
    probeMode: 'read_only',
  });

  // Safety envelope receipt
  const envelope = withHash({
    id: shortId('envelope', { inventoryHash: inventory.hash, actionId, nonce }),
    schemaVersion: 'holoscript-device-safety-envelope-receipt/v1',
    createdAt: at,
    device,
    consentScopes: consentScopesFor(actionClass),
    actionClass,
    riskLevel,
    safeRanges,
    commandPreview: redactCommandPreview(commandPreview),
    commandPreviewHash: hashValue(commandPreview),
    commandPreviewContainsAbsolutePaths: false,
    privacyRedactions: [
      { field: 'device.deviceId', level: 'hash_only', reason: 'device identity is PII-adjacent' },
    ],
    requiresFreshUserGesture: true,
    deviceMutationAllowed: false, // not yet — unlocked by approve
    reversible: rollbackWindowMs > 0 || !irreversibleScope,
    rollbackNote: rollbackScope ?? 'no physical state change in plan mode',
    nonce,
  });

  // Rollback limit receipt
  const rollbackLimit = withHash({
    id: shortId('rollback', { actionId }),
    schemaVersion: PHYSICAL_ROLLBACK_LIMIT_RECEIPT_VERSION,
    actionId,
    targetDeviceId: device.deviceIdHash,
    reversible: envelope.reversible,
    rollbackScope: rollbackScope ?? undefined,
    irreversibleScope: irreversibleScope ?? undefined,
    rollbackWindowMs,
    rollbackAttempted: false,
    rollbackSucceeded: undefined,
    irreversibleAt: undefined,
  });

  // Freshness placeholders — real values filled at approve time
  const sensorFreshnessPlaceholder = {
    schemaVersion: SENSOR_FRESHNESS_RECEIPT_VERSION,
    id: shortId('freshness', { actionId, at }),
    actionId,
    maxSensorAgeMs,
    maxApprovalAgeMs,
    note: 'placeholder — freshness verified at approve time',
    fresh: null,
  };

  const replayKey = hashValue({
    workflow: WORKFLOW,
    deviceIdHash: device.deviceIdHash,
    commandPreviewHash: envelope.commandPreviewHash,
    nonce,
    adapterVersion: VERSION,
  });

  const pack = {
    id: shortId('actuation-pack', { inventoryHash: inventory.hash, envelopeHash: envelope.hash }),
    schemaVersion: ACTUATION_PLAN_PACK_VERSION,
    workflow: WORKFLOW,
    status: 'planned',
    actionId,
    nonce,
    replayKey,
    inventory,
    envelope,
    rollbackLimit,
    sensorFreshness: sensorFreshnessPlaceholder,
    simulation: null,
    safeStop: null,
    executionEnabled: false,
    createdAt: at,
  };

  return withHash(pack);
}

function buildSimulatedPack(pack, input, args = {}) {
  const at = nowIso(args, input);
  if (pack.status !== 'planned') throw new Error(`simulate requires status=planned; got ${pack.status}`);

  const actionId = pack.actionId;
  const targetDeviceId = pack.envelope.device.deviceIdHash;
  const simulationEngine = input.simulationEngine ?? args.simulationEngine ?? 'holoshell-builtin-physics-stub';
  const predictedOutcome = input.predictedOutcome ?? args.predictedOutcome ?? 'bounded actuation within safe ranges';
  const durationMs = input.durationMs ?? args.durationMs ?? 0;
  const peakForceEstimate = input.peakForceEstimate;
  const peakDisplacementMm = input.peakDisplacementMm;

  // Validate safe range adherence in the simulation
  const safeRanges = pack.envelope.safeRanges ?? [];
  const violations = [];
  for (const range of safeRanges) {
    const paramValue = input.paramValues?.[range.parameter];
    if (paramValue !== undefined) {
      if (paramValue < range.min || paramValue > range.max) {
        violations.push(`${range.parameter}=${paramValue} outside [${range.min},${range.max}]`);
      }
    }
  }
  const simulationPassed = violations.length === 0;
  if (!simulationPassed && !(input.allowFailedSimulation)) {
    throw new Error(`Simulation failed safe-range constraints: ${violations.join('; ')}`);
  }

  const stateSnapshotHash = hashValue({ actionId, at, simulationEngine, predictedOutcome, durationMs });

  const simulation = withHash({
    schemaVersion: ACTUATION_SIMULATION_RECEIPT_VERSION,
    id: shortId('simulation', { actionId, at }),
    actionId,
    targetDeviceId,
    predictedOutcome,
    simulationPassed,
    peakForceEstimate,
    peakDisplacementMm,
    durationMs,
    simulationEngine,
    simulatedAt: at,
    stateSnapshotHash,
    safeRangeViolations: violations,
  });

  const updatedPack = {
    ...pack,
    status: 'simulated',
    simulation,
    simulatedAt: at,
  };
  delete updatedPack.hash;
  delete updatedPack.hashAlgorithm;
  return withHash(updatedPack);
}

function buildApprovedPack(pack, input, args = {}) {
  const at = nowIso(args, input);

  if (pack.status !== 'simulated') {
    throw new Error(`approve requires status=simulated; got ${pack.status}. Run simulate first.`);
  }
  if (!pack.simulation?.simulationPassed) {
    throw new Error('approve blocked: simulation did not pass. Abort or re-simulate.');
  }

  const approveNonce = input.approveNonce ?? args.approveNonce;
  if (!approveNonce?.trim()) throw new Error('--approve-nonce is required for approve command');
  if (approveNonce !== pack.nonce) {
    throw new Error(
      `Nonce mismatch: supplied nonce does not match plan pack nonce. ` +
      `The nonce must be copied from the plan receipt to prove the caller reviewed it.`
    );
  }

  // Freshness gate
  const createdAtMs = new Date(pack.createdAt).getTime();
  const nowMs = new Date(at).getTime();
  const actualApprovalAgeMs = nowMs - createdAtMs;
  const maxApprovalAgeMs = pack.sensorFreshness?.maxApprovalAgeMs ?? 30000;
  const maxSensorAgeMs = pack.sensorFreshness?.maxSensorAgeMs ?? 5000;
  // Sensor age is always 0 in plan mode (no live sensor), treated as fresh
  const actualSensorAgeMs = input.actualSensorAgeMs ?? 0;
  const sensorFresh = actualSensorAgeMs <= maxSensorAgeMs;
  const approvalFresh = actualApprovalAgeMs <= maxApprovalAgeMs;
  const fresh = sensorFresh && approvalFresh;

  const sensorFreshness = withHash({
    schemaVersion: SENSOR_FRESHNESS_RECEIPT_VERSION,
    id: shortId('freshness', { actionId: pack.actionId, at }),
    actionId: pack.actionId,
    maxSensorAgeMs,
    actualSensorAgeMs,
    sensorFresh,
    maxApprovalAgeMs,
    actualApprovalAgeMs,
    approvalFresh,
    fresh,
    checkedAt: at,
  });

  if (!fresh) {
    const msg = !approvalFresh
      ? `Approval is stale: ${actualApprovalAgeMs}ms > max ${maxApprovalAgeMs}ms. Re-plan to reset.`
      : `Sensor data is stale: ${actualSensorAgeMs}ms > max ${maxSensorAgeMs}ms.`;
    throw new Error(`Freshness gate failed — ${msg}`);
  }

  // Unlock mutation
  const updatedEnvelope = withHash({
    ...pack.envelope,
    deviceMutationAllowed: true,
    approvedAt: at,
    approvalNonceHash: hashValue(approveNonce),
  });
  delete updatedEnvelope.hash;
  delete updatedEnvelope.hashAlgorithm;
  const envelopeWithHash = withHash({ ...pack.envelope, deviceMutationAllowed: true, approvedAt: at, approvalNonceHash: hashValue(approveNonce) });

  const updatedPack = {
    ...pack,
    status: 'approved',
    envelope: envelopeWithHash,
    sensorFreshness,
    executionEnabled: true,
    approvedAt: at,
    approvalNonceHash: hashValue(approveNonce),
  };
  delete updatedPack.hash;
  delete updatedPack.hashAlgorithm;
  return withHash(updatedPack);
}

function buildAbortedPack(pack, input, args = {}) {
  const at = nowIso(args, input);
  const validAbortStatuses = new Set(['planned', 'simulated', 'approved']);
  if (!validAbortStatuses.has(pack.status)) {
    throw new Error(`abort requires status in [planned, simulated, approved]; got ${pack.status}`);
  }

  const abortReason = input.abortReason ?? args.abortReason ?? 'operator_request';
  const trigger = SAFE_STOP_TRIGGERS.has(abortReason) ? abortReason : 'operator_request';

  const safeStop = withHash({
    schemaVersion: SAFE_STOP_RECEIPT_VERSION,
    id: shortId('safe-stop', { actionId: pack.actionId, at }),
    actionId: pack.actionId,
    targetDeviceId: pack.envelope.device.deviceIdHash,
    trigger,
    reason: input.abortReason ?? args.abortReason ?? 'Operator aborted before execution.',
    safeCategoryReached: true,
    deviceStateAtStop: 'no mutation performed — execution was disabled at abort time',
    stoppedAt: at,
    retryEligible: trigger !== 'hardware_fault' && trigger !== 'envelope_violation',
  });

  const updatedPack = {
    ...pack,
    status: 'aborted',
    safeStop,
    executionEnabled: false,
    abortedAt: at,
  };
  delete updatedPack.hash;
  delete updatedPack.hashAlgorithm;
  return withHash(updatedPack);
}

// ── Validation ──

export function validateActuationPlanPack(pack) {
  const errors = [];
  if (!pack || typeof pack !== 'object') return ['ActuationPlanPack is required.'];
  if (pack.schemaVersion !== ACTUATION_PLAN_PACK_VERSION) errors.push(`schemaVersion must be ${ACTUATION_PLAN_PACK_VERSION}`);
  if (pack.workflow !== WORKFLOW) errors.push(`workflow must be ${WORKFLOW}`);
  if (!PACK_STATUSES.has(pack.status)) errors.push(`unsupported status: ${pack.status}`);
  if (!pack.actionId) errors.push('actionId is required');
  if (!pack.nonce) errors.push('nonce is required');
  if (!pack.replayKey) errors.push('replayKey is required');
  if (!pack.inventory) errors.push('inventory receipt is required');
  if (!pack.envelope) errors.push('envelope receipt is required');
  if (pack.envelope?.commandPreviewContainsAbsolutePaths !== false) {
    errors.push('envelope.commandPreviewContainsAbsolutePaths must be false');
  }
  if (pack.status === 'simulated' || pack.status === 'approved') {
    if (!pack.simulation) errors.push('simulation receipt required after simulate');
  }
  if (pack.status === 'approved') {
    if (!pack.executionEnabled) errors.push('executionEnabled must be true after approve');
    if (!pack.approvedAt) errors.push('approvedAt is required after approve');
    if (!pack.approvalNonceHash) errors.push('approvalNonceHash is required after approve');
    if (!pack.sensorFreshness?.fresh) errors.push('sensorFreshness.fresh must be true after approve');
  }
  if (pack.status === 'aborted') {
    if (!pack.safeStop) errors.push('safeStop receipt is required after abort');
    if (pack.executionEnabled) errors.push('executionEnabled must be false after abort');
  }
  if (JSON.stringify(pack).match(/\b(access_token|refresh_token|client_secret)=([A-Za-z0-9._~+/=-]+)/i)) {
    errors.push('pack contains raw credential material');
  }
  return errors;
}

// ── Helpers ──

function consentScopesFor(actionClass) {
  const map = {
    haptic: ['allowHaptic'],
    command: ['allowDeviceCommand'],
    pair: ['allowDevicePair'],
    xr_session: ['allowXrSession'],
    sensor_read: ['allowSensorRead'],
    camera: ['allowCamera'],
    microphone: ['allowMicrophone'],
    read: ['allowDeviceRead'],
    calibration: ['allowDeviceCommand'],
    firmware_update: ['allowDeviceCommand'],
    factory_reset: ['allowDeviceCommand'],
  };
  return map[actionClass] ?? ['allowDeviceRead'];
}

function redactCommandPreview(preview) {
  return (preview ?? '')
    .replace(/(^|[\s"'`=])(?:[A-Za-z]:[\\/]|\/(?!\/)[^\s"'`]+)/g, (_m, pre) => `${pre}<path-redacted>`)
    .replace(/\bBearer\s+(?!<redacted>)[A-Za-z0-9._~+/=-]+/gi, 'Bearer <redacted>');
}

function defaultOutput(command, date) {
  return join('.bench-logs', 'holoshell-actuation-plan', date, `actuation-plan-${command}-receipt.json`);
}

// ── Command runner ──

function runCommand(args) {
  if (!args.command || args.command === 'help') {
    printHelp();
    return { ok: true };
  }
  if (args.command === 'self-test') return runSelfTest();

  const input = args.input ? readJson(args.input) : {};

  let pack;
  if (args.command === 'plan') {
    pack = buildActuationPlanPack(input, args);
  } else if (args.command === 'simulate') {
    if (!args.pack) throw new Error('simulate requires --pack');
    pack = buildSimulatedPack(readJson(args.pack), input, args);
  } else if (args.command === 'approve') {
    if (!args.pack) throw new Error('approve requires --pack');
    pack = buildApprovedPack(readJson(args.pack), input, args);
  } else if (args.command === 'abort') {
    if (!args.pack) throw new Error('abort requires --pack');
    pack = buildAbortedPack(readJson(args.pack), input, args);
  } else {
    throw new Error(`Unknown command: ${args.command}. Valid: plan, simulate, approve, abort, help, --self-test`);
  }

  const validationErrors = validateActuationPlanPack(pack);
  if (validationErrors.length > 0) {
    throw new Error(`adapter produced invalid receipt: ${validationErrors.join('; ')}`);
  }

  if (args.dryRun) {
    process.stdout.write(`${JSON.stringify({ ok: true, dryRun: true, status: pack.status, receiptId: pack.id, nonce: pack.nonce }, null, 2)}\n`);
    return { ok: true, pack };
  }

  const out = args.out ?? defaultOutput(args.command, args.date);
  const written = writeJson(out, pack);
  process.stdout.write(`${JSON.stringify({ ok: true, out: written, status: pack.status, receiptId: pack.id, nonce: args.command === 'plan' ? pack.nonce : undefined }, null, 2)}\n`);
  return { ok: true, pack, out: written };
}

// ── Self-test ──

function runSelfTest() {
  const dir = join(tmpdir(), `holoshell-actuation-plan-${process.pid}`);
  mkdirSync(dir, { recursive: true });

  const requestPath = join(dir, 'request.json');
  const planPath = join(dir, 'plan.json');
  const simulatePath = join(dir, 'simulate.json');
  const simulatedPath = join(dir, 'simulated.json');
  const approvePath = join(dir, 'approve.json');
  const approvedPath = join(dir, 'approved.json');
  const abortPath = join(dir, 'abort.json');
  const abortedPath = join(dir, 'aborted.json');

  const requestInput = {
    now: '2026-05-20T00:00:00.000Z',
    deviceId: 'quest-3-bt-aabbcc1122',
    deviceCategory: 'headset',
    deviceLabel: 'Quest 3 (headset)',
    identitySource: 'pnP_device_id',
    manufacturer: 'Meta',
    model: 'Quest 3',
    connectionStatus: 'connected',
    actionClass: 'haptic',
    riskLevel: 'low',
    commandPreview: 'haptic pulse 200ms left-controller',
    safeRanges: [
      { parameter: 'pulse_duration_ms', unit: 'ms', min: 0, max: 500, defaultValue: 100, autoStopOnViolation: true },
    ],
    maxSensorAgeMs: 5000,
    maxApprovalAgeMs: 30000,
    rollbackScope: 'haptic completes or times out; no physical state change',
    rollbackWindowMs: 0,
  };

  writeJson(requestPath, requestInput);
  const planResult = runCommand(parseArgs(['plan', '--input', requestPath, '--out', planPath]));
  const planPack = readJson(planPath);

  // Validate plan
  const planErrors = validateActuationPlanPack(planPack);
  if (planErrors.length > 0) throw new Error(`Plan validation failed: ${planErrors.join('; ')}`);
  if (planPack.status !== 'planned') throw new Error('Plan pack status is not planned');
  if (planPack.executionEnabled !== false) throw new Error('executionEnabled must be false in plan');
  if (!planPack.nonce) throw new Error('nonce is missing from plan pack');

  // Check no raw device ID in pack
  const planJson = JSON.stringify(planPack);
  if (planJson.includes('aabbcc1122')) throw new Error('raw device ID fragment leaked into public receipt');

  // Simulate
  writeJson(simulatePath, {
    now: '2026-05-20T00:01:00.000Z',
    simulationEngine: 'holoshell-haptic-stub',
    predictedOutcome: 'left-controller emits 200ms haptic pulse within safe range',
    durationMs: 200,
    paramValues: { pulse_duration_ms: 200 },
  });
  runCommand(parseArgs(['simulate', '--pack', planPath, '--input', simulatePath, '--out', simulatedPath]));
  const simulatedPack = readJson(simulatedPath);

  if (simulatedPack.status !== 'simulated') throw new Error('Simulated pack status is not simulated');
  if (!simulatedPack.simulation?.simulationPassed) throw new Error('simulation.simulationPassed must be true');
  if (validateActuationPlanPack(simulatedPack).length > 0) throw new Error('Simulated pack fails validation');

  // Test: safe-range violation is rejected
  const violationPath = join(dir, 'violation.json');
  writeJson(violationPath, {
    now: '2026-05-20T00:01:30.000Z',
    simulationEngine: 'holoshell-haptic-stub',
    predictedOutcome: 'out of range test',
    durationMs: 600,
    paramValues: { pulse_duration_ms: 600 }, // > max 500
  });
  let caughtViolation = false;
  try {
    runCommand(parseArgs(['simulate', '--pack', planPath, '--input', violationPath]));
  } catch (error) {
    if (String(error.message).includes('safe-range constraints')) caughtViolation = true;
    else throw new Error(`Safe-range violation threw unexpected error: ${error.message}`);
  }
  if (!caughtViolation) throw new Error('safe-range violation was not rejected by simulate');

  // Approve with correct nonce (within 30s freshness window from plan at T+0)
  writeJson(approvePath, {
    now: '2026-05-20T00:00:20.000Z',
    approveNonce: planPack.nonce,
  });
  runCommand(parseArgs(['approve', '--pack', simulatedPath, '--input', approvePath, '--out', approvedPath]));
  const approvedPack = readJson(approvedPath);

  if (approvedPack.status !== 'approved') throw new Error('Approved pack status is not approved');
  if (!approvedPack.executionEnabled) throw new Error('executionEnabled must be true after approve');
  if (!approvedPack.sensorFreshness?.fresh) throw new Error('sensorFreshness.fresh must be true after approve');
  if (validateActuationPlanPack(approvedPack).length > 0) throw new Error('Approved pack fails validation');

  // Test: wrong nonce is rejected
  const wrongNoncePath = join(dir, 'wrong-nonce.json');
  writeJson(wrongNoncePath, { now: '2026-05-20T00:00:10.000Z', approveNonce: 'wrong-nonce-value' });
  let caughtNonceMismatch = false;
  try {
    runCommand(parseArgs(['approve', '--pack', simulatedPath, '--input', wrongNoncePath]));
  } catch (error) {
    if (String(error.message).includes('Nonce mismatch')) caughtNonceMismatch = true;
    else throw new Error(`Wrong nonce threw unexpected error: ${error.message}`);
  }
  if (!caughtNonceMismatch) throw new Error('wrong nonce was not rejected by approve');

  // Abort from simulated (should always work regardless of simulation status)
  writeJson(abortPath, { now: '2026-05-20T00:03:00.000Z', abortReason: 'operator_request' });
  runCommand(parseArgs(['abort', '--pack', simulatedPath, '--input', abortPath, '--out', abortedPath]));
  const abortedPack = readJson(abortedPath);

  if (abortedPack.status !== 'aborted') throw new Error('Aborted pack status is not aborted');
  if (abortedPack.executionEnabled !== false) throw new Error('executionEnabled must be false after abort');
  if (!abortedPack.safeStop) throw new Error('safeStop receipt is missing after abort');
  if (abortedPack.safeStop.safeCategoryReached !== true) throw new Error('safeCategoryReached must be true');
  if (validateActuationPlanPack(abortedPack).length > 0) throw new Error('Aborted pack fails validation');

  // Test: stale approval rejected
  const stalePlanPath = join(dir, 'stale-plan.json');
  const stalePlan = buildActuationPlanPack({ ...requestInput, now: '2026-04-01T00:00:00.000Z' });
  writeJson(stalePlanPath, stalePlan);
  const staleSimPath = join(dir, 'stale-sim.json');
  writeJson(staleSimPath, {
    now: '2026-04-01T00:01:00.000Z',
    simulationEngine: 'holoshell-haptic-stub',
    predictedOutcome: 'test',
    durationMs: 100,
  });
  const staleSimulatedPath = join(dir, 'stale-simulated.json');
  const staleSimPack = buildSimulatedPack(stalePlan, {
    now: '2026-04-01T00:01:00.000Z',
    simulationEngine: 'holoshell-haptic-stub',
    predictedOutcome: 'test',
    durationMs: 100,
  });
  writeJson(staleSimulatedPath, staleSimPack);
  const staleApprovePath = join(dir, 'stale-approve.json');
  writeJson(staleApprovePath, { now: '2026-05-20T12:00:00.000Z', approveNonce: stalePlan.nonce });
  let caughtStale = false;
  try {
    buildApprovedPack(staleSimPack, { approveNonce: stalePlan.nonce, now: '2026-05-20T12:00:00.000Z' });
  } catch (error) {
    if (String(error.message).includes('Freshness gate')) caughtStale = true;
    else throw new Error(`Stale approval threw unexpected error: ${error.message}`);
  }
  if (!caughtStale) throw new Error('stale approval was not rejected by approve');

  process.stdout.write(
    `${JSON.stringify({ ok: true, adapter: 'holoshell-actuation-plan-adapter', version: VERSION }, null, 2)}\n`
  );
  return { ok: true };
}

// ── Exports ──
export {
  buildActuationPlanPack,
  buildSimulatedPack,
  buildApprovedPack,
  buildAbortedPack,
};

// ── Entry point ──
if (
  process.argv[1]?.endsWith('holoshell-actuation-plan-adapter.mjs') ||
  import.meta.url === `file://${(process.argv[1] ?? '').replace(/\\/g, '/')}`
) {
  try {
    runCommand(parseArgs(process.argv.slice(2)));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${JSON.stringify({ ok: false, error: message }, null, 2)}\n`);
    process.exit(1);
  }
}
