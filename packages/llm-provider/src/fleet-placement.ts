import { createHash } from 'node:crypto';

export const FLEET_PLACEMENT_MANIFEST_SCHEMA = 'fleet-placement-manifest/v1' as const;
export const FLEET_WORKER_CAPABILITY_SCHEMA = 'fleet-worker-capability/v1' as const;
export const FLEET_PLACEMENT_RECEIPT_SCHEMA = 'fleet-placement.receipt.v1' as const;
export const FLEET_PLACEMENT_ALGORITHM = 'fleet-placement/warm-only-plan-v1' as const;

const SHA256_RE = /^sha256:[0-9a-f]{64}$/u;
const PORTABLE_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/u;
const RFC3339_UTC_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/u;

type JsonRecord = Record<string, unknown>;

export interface FleetPlacementPolicy {
  artifactMode: 'warm_only';
  dataPlane: 'direct_worker';
  parallelScope: 'single_worker';
  spend: 'forbidden';
  provisioning: 'forbidden';
  remoteCode: false;
  genericRpc: false;
  interWorkerTensorTransport: false;
}

export const DEFAULT_FLEET_PLACEMENT_POLICY: Readonly<FleetPlacementPolicy> = Object.freeze({
  artifactMode: 'warm_only',
  dataPlane: 'direct_worker',
  parallelScope: 'single_worker',
  spend: 'forbidden',
  provisioning: 'forbidden',
  remoteCode: false,
  genericRpc: false,
  interWorkerTensorTransport: false,
});

export interface FleetPlacementResources {
  gpuCount: number;
  gpuMemoryMiB: number;
  hostMemoryMiB: number;
  scratchBytes: number;
  slots: number;
}

export interface FleetPlacementManifest {
  schema: typeof FLEET_PLACEMENT_MANIFEST_SCHEMA;
  requestId: string;
  idempotencyKey: string;
  upstreamAttestationReceiptDigest: string;
  laneId: string;
  laneManifestDigest: string;
  modelReleaseDigest: string;
  runtimeProfileDigest: string;
  licensePolicyDigest: string;
  resources: FleetPlacementResources;
  /** Exact static worker specifications admitted for this placement request. */
  admittedWorkerSpecDigests: string[];
  allowedCustodyTiers: string[];
  dataClass: string;
  policy: FleetPlacementPolicy;
}

export type FleetWorkerState = 'ready' | 'draining' | 'busy' | 'unhealthy';

export interface FleetWorkerFreshness {
  bootId: string;
  sequence: number;
  acceptedAt: string;
  expiresAt: string;
}

export interface FleetWorkerIsland {
  islandId: string;
  gpuCount: number;
  gpuMemoryTotalMiB: number;
  gpuMemoryFreeMiB: number;
  hostMemoryFreeMiB: number;
  scratchFreeBytes: number;
  availableSlots: number;
  activeLeaseCount: number;
  lastAssignedOrdinal: number;
  dataEndpointId: string;
  runtimeProfileDigests: string[];
  residentReleaseDigests: string[];
  admittedLicensePolicyDigests: string[];
  allowedDataClasses: string[];
}

export interface FleetWorkerCapability {
  schema: typeof FLEET_WORKER_CAPABILITY_SCHEMA;
  workerId: string;
  laneId: string;
  laneManifestDigest: string;
  /** Digest of the worker's admitted static hardware/runtime specification. */
  specDigest: string;
  custodyTier: string;
  signingSeat: string;
  attestationReceiptDigest: string;
  freshness: FleetWorkerFreshness;
  state: FleetWorkerState;
  islands: FleetWorkerIsland[];
}

export interface FleetPlacementOptions {
  decisionTime: string;
  leaseLedgerVersion: number;
  manifest: FleetPlacementManifest;
  capabilities: readonly FleetWorkerCapability[];
}

export type FleetPlacementStatus = 'placed' | 'unplaced' | 'invalid';

export type FleetPlacementOutcomeCode =
  | 'PLACED'
  | 'NO_CANDIDATES'
  | 'NO_ELIGIBLE_CANDIDATE'
  | 'INVALID_INPUT';

export type FleetPlacementRejectionCode =
  | 'WORKER_NOT_READY'
  | 'CAPABILITY_NOT_YET_VALID'
  | 'CAPABILITY_STALE'
  | 'LANE_ID_MISMATCH'
  | 'LANE_MANIFEST_MISMATCH'
  | 'WORKER_SPEC_NOT_ADMITTED'
  | 'CUSTODY_TIER_DENIED'
  | 'DATA_CLASS_DENIED'
  | 'LICENSE_POLICY_NOT_ADMITTED'
  | 'RUNTIME_PROFILE_NOT_ADMITTED'
  | 'MODEL_RELEASE_NOT_RESIDENT'
  | 'NO_AVAILABLE_SLOT'
  | 'INSUFFICIENT_GPU_COUNT'
  | 'INSUFFICIENT_GPU_MEMORY'
  | 'INSUFFICIENT_HOST_MEMORY'
  | 'INSUFFICIENT_SCRATCH';

export type FleetPlacementInvalidCode =
  | 'INVALID_OPTIONS'
  | 'INVALID_DECISION_TIME'
  | 'INVALID_MANIFEST'
  | 'INVALID_DIGEST'
  | 'UNSAFE_POLICY'
  | 'INVALID_CAPABILITY'
  | 'DUPLICATE_WORKER_ID'
  | 'DUPLICATE_ISLAND_ID'
  | 'DUPLICATE_VALUE';

export interface FleetPlacementValidationError {
  code: FleetPlacementInvalidCode;
  path: string;
  message: string;
}

/**
 * Best-fit tuple, compared left-to-right. String members use UTF-8 byte order.
 */
export type FleetPlacementRank = readonly [
  activeLeaseCount: number,
  gpuMemorySlackMiB: number,
  lastAssignedOrdinal: number,
  workerId: string,
  islandId: string,
];

export interface FleetPlacementCandidate {
  workerId: string;
  islandId: string;
  capabilityDigest: string;
  eligible: boolean;
  rejectionCodes: FleetPlacementRejectionCode[];
  rank: FleetPlacementRank | null;
}

export interface FleetPlacementSelection {
  workerId: string;
  islandId: string;
  dataEndpointId: string;
  capabilityDigest: string;
  rank: FleetPlacementRank;
}

export interface FleetPlacementSideEffects {
  planOnly: true;
  stateMutated: false;
  leaseIssued: false;
  provisioningAttempted: false;
  spendAttempted: false;
  networkAccessed: false;
  artifactsFetched: false;
  remoteRpcAttempted: false;
  tensorTrafficAttempted: false;
}

export interface FleetPlacementAttestationSummary {
  required: true;
  requestReceiptDigest: string | null;
  workerReceiptDigests: string[];
  digestReferencesValidated: boolean;
  signatureVerificationPerformed: false;
  signatureVerified: false;
  verificationScope: 'digest-reference-only';
}

export interface FleetPlacementReceipt {
  schema: typeof FLEET_PLACEMENT_RECEIPT_SCHEMA;
  algorithm: typeof FLEET_PLACEMENT_ALGORITHM;
  status: FleetPlacementStatus;
  outcomeCode: FleetPlacementOutcomeCode;
  decisionTime: string | null;
  leaseLedgerVersion: number | null;
  requestDigest: string | null;
  policyDigest: string;
  capabilitySnapshotDigest: string | null;
  attestation: FleetPlacementAttestationSummary;
  candidates: FleetPlacementCandidate[];
  selected: FleetPlacementSelection | null;
  errors: FleetPlacementValidationError[];
  sideEffects: FleetPlacementSideEffects;
  receiptDigest: string;
}

const PLAN_ONLY_SIDE_EFFECTS: FleetPlacementSideEffects = Object.freeze({
  planOnly: true,
  stateMutated: false,
  leaseIssued: false,
  provisioningAttempted: false,
  spendAttempted: false,
  networkAccessed: false,
  artifactsFetched: false,
  remoteRpcAttempted: false,
  tensorTrafficAttempted: false,
});

function compareUtf8(left: string, right: string): number {
  return Buffer.compare(Buffer.from(left, 'utf8'), Buffer.from(right, 'utf8'));
}

function isStrictRecord(value: unknown): value is JsonRecord {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  if (Object.getOwnPropertySymbols(value).length !== 0) return false;
  return Object.keys(value).every((key) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor?.enumerable === true && 'value' in descriptor;
  });
}

function hasExactKeys(value: JsonRecord, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort(compareUtf8);
  const wanted = [...expected].sort(compareUtf8);
  return actual.length === wanted.length && actual.every((key, index) => key === wanted[index]);
}

function canonicalJson(value: unknown, seen = new Set<object>()): string {
  if (value === null) return 'null';
  if (typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value))
      throw new Error('canonical JSON numbers must be safe integers');
    return JSON.stringify(value);
  }
  if (typeof value !== 'object') throw new Error('value is not canonical JSON');
  if (seen.has(value)) throw new Error('cyclic canonical JSON value');
  seen.add(value);
  try {
    if (Array.isArray(value)) {
      return `[${value.map((entry) => canonicalJson(entry, seen)).join(',')}]`;
    }
    if (!isStrictRecord(value)) throw new Error('object is not a strict JSON record');
    const fields = Object.keys(value)
      .sort(compareUtf8)
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key], seen)}`);
    return `{${fields.join(',')}}`;
  } finally {
    seen.delete(value);
  }
}

function sha256(value: unknown): string {
  return `sha256:${createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex')}`;
}

function parseInstant(value: unknown): { iso: string; milliseconds: number } | null {
  if (typeof value !== 'string' || !RFC3339_UTC_RE.test(value)) return null;
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds)) return null;
  return { iso: new Date(milliseconds).toISOString(), milliseconds };
}

function portableId(value: unknown): value is string {
  return typeof value === 'string' && PORTABLE_ID_RE.test(value);
}

function safeInteger(value: unknown, minimum: number): value is number {
  return Number.isSafeInteger(value) && Number(value) >= minimum;
}

function addError(
  errors: FleetPlacementValidationError[],
  code: FleetPlacementInvalidCode,
  path: string,
  message: string
): void {
  errors.push({ code, path, message });
}

function normalizedUniqueStrings(
  value: unknown,
  path: string,
  errors: FleetPlacementValidationError[],
  predicate: (entry: unknown) => entry is string,
  allowEmpty: boolean,
  invalidCode: FleetPlacementInvalidCode = 'INVALID_DIGEST'
): string[] | null {
  if (!Array.isArray(value) || (!allowEmpty && value.length === 0)) {
    addError(
      errors,
      'INVALID_MANIFEST',
      path,
      `expected ${allowEmpty ? 'an' : 'a non-empty'} array`
    );
    return null;
  }
  const output: string[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const entry = value[index];
    if (!predicate(entry)) {
      addError(errors, invalidCode, `${path}[${index}]`, 'value has an invalid format');
      continue;
    }
    output.push(entry);
  }
  const unique = new Set(output);
  if (unique.size !== output.length) {
    addError(errors, 'DUPLICATE_VALUE', path, 'set-like arrays must not contain duplicates');
  }
  return [...unique].sort(compareUtf8);
}

function validatePolicy(
  value: unknown,
  errors: FleetPlacementValidationError[]
): FleetPlacementPolicy | null {
  const path = 'manifest.policy';
  const keys = [
    'artifactMode',
    'dataPlane',
    'parallelScope',
    'spend',
    'provisioning',
    'remoteCode',
    'genericRpc',
    'interWorkerTensorTransport',
  ] as const;
  if (!isStrictRecord(value) || !hasExactKeys(value, keys)) {
    addError(errors, 'UNSAFE_POLICY', path, 'policy must contain only the v1 safety fields');
    return null;
  }
  for (const key of keys) {
    if (value[key] !== DEFAULT_FLEET_PLACEMENT_POLICY[key]) {
      addError(
        errors,
        'UNSAFE_POLICY',
        `${path}.${key}`,
        `v1 requires ${JSON.stringify(DEFAULT_FLEET_PLACEMENT_POLICY[key])}`
      );
    }
  }
  if (errors.some((error) => error.path.startsWith(path))) return null;
  return { ...DEFAULT_FLEET_PLACEMENT_POLICY };
}

function validateResources(
  value: unknown,
  errors: FleetPlacementValidationError[]
): FleetPlacementResources | null {
  const path = 'manifest.resources';
  const keys = ['gpuCount', 'gpuMemoryMiB', 'hostMemoryMiB', 'scratchBytes', 'slots'] as const;
  if (!isStrictRecord(value) || !hasExactKeys(value, keys)) {
    addError(errors, 'INVALID_MANIFEST', path, 'resources must contain exactly the v1 fields');
    return null;
  }
  if (!safeInteger(value.gpuCount, 1))
    addError(errors, 'INVALID_MANIFEST', `${path}.gpuCount`, 'must be a positive safe integer');
  if (!safeInteger(value.gpuMemoryMiB, 1))
    addError(errors, 'INVALID_MANIFEST', `${path}.gpuMemoryMiB`, 'must be a positive safe integer');
  if (!safeInteger(value.hostMemoryMiB, 1))
    addError(
      errors,
      'INVALID_MANIFEST',
      `${path}.hostMemoryMiB`,
      'must be a positive safe integer'
    );
  if (!safeInteger(value.scratchBytes, 0))
    addError(
      errors,
      'INVALID_MANIFEST',
      `${path}.scratchBytes`,
      'must be a non-negative safe integer'
    );
  if (!safeInteger(value.slots, 1))
    addError(errors, 'INVALID_MANIFEST', `${path}.slots`, 'must be a positive safe integer');
  if (errors.some((error) => error.path.startsWith(path))) return null;
  return {
    gpuCount: value.gpuCount as number,
    gpuMemoryMiB: value.gpuMemoryMiB as number,
    hostMemoryMiB: value.hostMemoryMiB as number,
    scratchBytes: value.scratchBytes as number,
    slots: value.slots as number,
  };
}

function validateManifest(
  value: unknown,
  errors: FleetPlacementValidationError[]
): FleetPlacementManifest | null {
  const keys = [
    'schema',
    'requestId',
    'idempotencyKey',
    'upstreamAttestationReceiptDigest',
    'laneId',
    'laneManifestDigest',
    'modelReleaseDigest',
    'runtimeProfileDigest',
    'licensePolicyDigest',
    'resources',
    'admittedWorkerSpecDigests',
    'allowedCustodyTiers',
    'dataClass',
    'policy',
  ] as const;
  if (!isStrictRecord(value) || !hasExactKeys(value, keys)) {
    addError(errors, 'INVALID_MANIFEST', 'manifest', 'manifest must contain exactly the v1 fields');
    return null;
  }
  if (value.schema !== FLEET_PLACEMENT_MANIFEST_SCHEMA)
    addError(
      errors,
      'INVALID_MANIFEST',
      'manifest.schema',
      `must be ${FLEET_PLACEMENT_MANIFEST_SCHEMA}`
    );
  if (!portableId(value.requestId))
    addError(errors, 'INVALID_MANIFEST', 'manifest.requestId', 'must be a portable identifier');
  if (!portableId(value.idempotencyKey))
    addError(
      errors,
      'INVALID_MANIFEST',
      'manifest.idempotencyKey',
      'must be a portable identifier'
    );
  if (!portableId(value.laneId))
    addError(errors, 'INVALID_MANIFEST', 'manifest.laneId', 'must be a portable identifier');
  if (!portableId(value.dataClass))
    addError(errors, 'INVALID_MANIFEST', 'manifest.dataClass', 'must be a portable identifier');

  for (const key of [
    'upstreamAttestationReceiptDigest',
    'laneManifestDigest',
    'modelReleaseDigest',
    'runtimeProfileDigest',
    'licensePolicyDigest',
  ] as const) {
    if (typeof value[key] !== 'string' || !SHA256_RE.test(value[key] as string)) {
      addError(
        errors,
        'INVALID_DIGEST',
        `manifest.${key}`,
        'must be an exact lowercase sha256 digest'
      );
    }
  }

  const resources = validateResources(value.resources, errors);
  const admittedWorkerSpecDigests = normalizedUniqueStrings(
    value.admittedWorkerSpecDigests,
    'manifest.admittedWorkerSpecDigests',
    errors,
    (entry): entry is string => typeof entry === 'string' && SHA256_RE.test(entry),
    false
  );
  const allowedCustodyTiers = normalizedUniqueStrings(
    value.allowedCustodyTiers,
    'manifest.allowedCustodyTiers',
    errors,
    portableId,
    false,
    'INVALID_MANIFEST'
  );
  const policy = validatePolicy(value.policy, errors);
  if (
    errors.length > 0 ||
    !resources ||
    !admittedWorkerSpecDigests ||
    !allowedCustodyTiers ||
    !policy
  )
    return null;

  return {
    schema: FLEET_PLACEMENT_MANIFEST_SCHEMA,
    requestId: value.requestId as string,
    idempotencyKey: value.idempotencyKey as string,
    upstreamAttestationReceiptDigest: value.upstreamAttestationReceiptDigest as string,
    laneId: value.laneId as string,
    laneManifestDigest: value.laneManifestDigest as string,
    modelReleaseDigest: value.modelReleaseDigest as string,
    runtimeProfileDigest: value.runtimeProfileDigest as string,
    licensePolicyDigest: value.licensePolicyDigest as string,
    resources,
    admittedWorkerSpecDigests,
    allowedCustodyTiers,
    dataClass: value.dataClass as string,
    policy,
  };
}

function validateFreshness(
  value: unknown,
  path: string,
  errors: FleetPlacementValidationError[]
): FleetWorkerFreshness | null {
  const keys = ['bootId', 'sequence', 'acceptedAt', 'expiresAt'] as const;
  if (!isStrictRecord(value) || !hasExactKeys(value, keys)) {
    addError(errors, 'INVALID_CAPABILITY', path, 'freshness must contain exactly the v1 fields');
    return null;
  }
  if (!portableId(value.bootId))
    addError(errors, 'INVALID_CAPABILITY', `${path}.bootId`, 'must be a portable identifier');
  if (!safeInteger(value.sequence, 0))
    addError(
      errors,
      'INVALID_CAPABILITY',
      `${path}.sequence`,
      'must be a non-negative safe integer'
    );
  const accepted = parseInstant(value.acceptedAt);
  const expires = parseInstant(value.expiresAt);
  if (!accepted)
    addError(errors, 'INVALID_CAPABILITY', `${path}.acceptedAt`, 'must be a UTC RFC3339 timestamp');
  if (!expires)
    addError(errors, 'INVALID_CAPABILITY', `${path}.expiresAt`, 'must be a UTC RFC3339 timestamp');
  if (accepted && expires && accepted.milliseconds >= expires.milliseconds) {
    addError(errors, 'INVALID_CAPABILITY', path, 'acceptedAt must be earlier than expiresAt');
  }
  if (errors.some((error) => error.path.startsWith(path))) return null;
  return {
    bootId: value.bootId as string,
    sequence: value.sequence as number,
    acceptedAt: accepted!.iso,
    expiresAt: expires!.iso,
  };
}

function validateIsland(
  value: unknown,
  path: string,
  errors: FleetPlacementValidationError[]
): FleetWorkerIsland | null {
  const keys = [
    'islandId',
    'gpuCount',
    'gpuMemoryTotalMiB',
    'gpuMemoryFreeMiB',
    'hostMemoryFreeMiB',
    'scratchFreeBytes',
    'availableSlots',
    'activeLeaseCount',
    'lastAssignedOrdinal',
    'dataEndpointId',
    'runtimeProfileDigests',
    'residentReleaseDigests',
    'admittedLicensePolicyDigests',
    'allowedDataClasses',
  ] as const;
  if (!isStrictRecord(value) || !hasExactKeys(value, keys)) {
    addError(errors, 'INVALID_CAPABILITY', path, 'island must contain exactly the v1 fields');
    return null;
  }
  if (!portableId(value.islandId))
    addError(errors, 'INVALID_CAPABILITY', `${path}.islandId`, 'must be a portable identifier');
  if (!safeInteger(value.gpuCount, 1))
    addError(errors, 'INVALID_CAPABILITY', `${path}.gpuCount`, 'must be a positive safe integer');
  if (!safeInteger(value.gpuMemoryTotalMiB, 1))
    addError(
      errors,
      'INVALID_CAPABILITY',
      `${path}.gpuMemoryTotalMiB`,
      'must be a positive safe integer'
    );
  if (!safeInteger(value.gpuMemoryFreeMiB, 0))
    addError(
      errors,
      'INVALID_CAPABILITY',
      `${path}.gpuMemoryFreeMiB`,
      'must be a non-negative safe integer'
    );
  if (
    safeInteger(value.gpuMemoryTotalMiB, 1) &&
    safeInteger(value.gpuMemoryFreeMiB, 0) &&
    value.gpuMemoryFreeMiB > value.gpuMemoryTotalMiB
  ) {
    addError(
      errors,
      'INVALID_CAPABILITY',
      `${path}.gpuMemoryFreeMiB`,
      'must not exceed total GPU memory'
    );
  }
  if (!safeInteger(value.hostMemoryFreeMiB, 0))
    addError(
      errors,
      'INVALID_CAPABILITY',
      `${path}.hostMemoryFreeMiB`,
      'must be a non-negative safe integer'
    );
  if (!safeInteger(value.scratchFreeBytes, 0))
    addError(
      errors,
      'INVALID_CAPABILITY',
      `${path}.scratchFreeBytes`,
      'must be a non-negative safe integer'
    );
  if (!safeInteger(value.availableSlots, 0))
    addError(
      errors,
      'INVALID_CAPABILITY',
      `${path}.availableSlots`,
      'must be a non-negative safe integer'
    );
  if (!safeInteger(value.activeLeaseCount, 0))
    addError(
      errors,
      'INVALID_CAPABILITY',
      `${path}.activeLeaseCount`,
      'must be a non-negative safe integer'
    );
  if (!safeInteger(value.lastAssignedOrdinal, 0))
    addError(
      errors,
      'INVALID_CAPABILITY',
      `${path}.lastAssignedOrdinal`,
      'must be a non-negative safe integer'
    );
  if (!portableId(value.dataEndpointId))
    addError(
      errors,
      'INVALID_CAPABILITY',
      `${path}.dataEndpointId`,
      'must be an opaque portable identifier'
    );
  const runtimeProfileDigests = normalizedUniqueStrings(
    value.runtimeProfileDigests,
    `${path}.runtimeProfileDigests`,
    errors,
    (entry: unknown): entry is string => typeof entry === 'string' && SHA256_RE.test(entry),
    true
  );
  const residentReleaseDigests = normalizedUniqueStrings(
    value.residentReleaseDigests,
    `${path}.residentReleaseDigests`,
    errors,
    (entry: unknown): entry is string => typeof entry === 'string' && SHA256_RE.test(entry),
    true
  );
  const admittedLicensePolicyDigests = normalizedUniqueStrings(
    value.admittedLicensePolicyDigests,
    `${path}.admittedLicensePolicyDigests`,
    errors,
    (entry: unknown): entry is string => typeof entry === 'string' && SHA256_RE.test(entry),
    true
  );
  const allowedDataClasses = normalizedUniqueStrings(
    value.allowedDataClasses,
    `${path}.allowedDataClasses`,
    errors,
    portableId,
    true,
    'INVALID_CAPABILITY'
  );
  if (
    errors.some((error) => error.path === path || error.path.startsWith(`${path}.`)) ||
    !runtimeProfileDigests ||
    !residentReleaseDigests ||
    !admittedLicensePolicyDigests ||
    !allowedDataClasses
  ) {
    return null;
  }
  return {
    islandId: value.islandId as string,
    gpuCount: value.gpuCount as number,
    gpuMemoryTotalMiB: value.gpuMemoryTotalMiB as number,
    gpuMemoryFreeMiB: value.gpuMemoryFreeMiB as number,
    hostMemoryFreeMiB: value.hostMemoryFreeMiB as number,
    scratchFreeBytes: value.scratchFreeBytes as number,
    availableSlots: value.availableSlots as number,
    activeLeaseCount: value.activeLeaseCount as number,
    lastAssignedOrdinal: value.lastAssignedOrdinal as number,
    dataEndpointId: value.dataEndpointId as string,
    runtimeProfileDigests,
    residentReleaseDigests,
    admittedLicensePolicyDigests,
    allowedDataClasses,
  };
}

function validateCapability(
  value: unknown,
  index: number,
  errors: FleetPlacementValidationError[]
): FleetWorkerCapability | null {
  const path = `capabilities[${index}]`;
  const keys = [
    'schema',
    'workerId',
    'laneId',
    'laneManifestDigest',
    'specDigest',
    'custodyTier',
    'signingSeat',
    'attestationReceiptDigest',
    'freshness',
    'state',
    'islands',
  ] as const;
  if (!isStrictRecord(value) || !hasExactKeys(value, keys)) {
    addError(errors, 'INVALID_CAPABILITY', path, 'capability must contain exactly the v1 fields');
    return null;
  }
  if (value.schema !== FLEET_WORKER_CAPABILITY_SCHEMA)
    addError(
      errors,
      'INVALID_CAPABILITY',
      `${path}.schema`,
      `must be ${FLEET_WORKER_CAPABILITY_SCHEMA}`
    );
  for (const key of ['workerId', 'laneId', 'custodyTier', 'signingSeat'] as const) {
    if (!portableId(value[key]))
      addError(errors, 'INVALID_CAPABILITY', `${path}.${key}`, 'must be a portable identifier');
  }
  for (const key of ['laneManifestDigest', 'specDigest', 'attestationReceiptDigest'] as const) {
    if (typeof value[key] !== 'string' || !SHA256_RE.test(value[key] as string))
      addError(
        errors,
        'INVALID_DIGEST',
        `${path}.${key}`,
        'must be an exact lowercase sha256 digest'
      );
  }
  const stateValues: readonly FleetWorkerState[] = ['ready', 'draining', 'busy', 'unhealthy'];
  if (!stateValues.includes(value.state as FleetWorkerState))
    addError(errors, 'INVALID_CAPABILITY', `${path}.state`, 'is not a supported worker state');
  const freshness = validateFreshness(value.freshness, `${path}.freshness`, errors);
  if (!Array.isArray(value.islands)) {
    addError(errors, 'INVALID_CAPABILITY', `${path}.islands`, 'must be an array');
    return null;
  }
  const islands = value.islands
    .map((island, islandIndex) => validateIsland(island, `${path}.islands[${islandIndex}]`, errors))
    .filter((island): island is FleetWorkerIsland => island !== null);
  const islandIds = islands.map((island) => island.islandId);
  if (new Set(islandIds).size !== islandIds.length) {
    addError(
      errors,
      'DUPLICATE_ISLAND_ID',
      `${path}.islands`,
      'island IDs must be unique per worker'
    );
  }
  if (
    errors.some((error) => error.path === path || error.path.startsWith(`${path}.`)) ||
    !freshness
  ) {
    return null;
  }
  islands.sort((left, right) => compareUtf8(left.islandId, right.islandId));
  return {
    schema: FLEET_WORKER_CAPABILITY_SCHEMA,
    workerId: value.workerId as string,
    laneId: value.laneId as string,
    laneManifestDigest: value.laneManifestDigest as string,
    specDigest: value.specDigest as string,
    custodyTier: value.custodyTier as string,
    signingSeat: value.signingSeat as string,
    attestationReceiptDigest: value.attestationReceiptDigest as string,
    freshness,
    state: value.state as FleetWorkerState,
    islands,
  };
}

function validateCapabilities(
  value: unknown,
  errors: FleetPlacementValidationError[]
): FleetWorkerCapability[] | null {
  if (!Array.isArray(value)) {
    addError(errors, 'INVALID_OPTIONS', 'capabilities', 'must be an array');
    return null;
  }
  const capabilities = value
    .map((entry, index) => validateCapability(entry, index, errors))
    .filter((entry): entry is FleetWorkerCapability => entry !== null);
  const workerIds = capabilities.map((capability) => capability.workerId);
  if (new Set(workerIds).size !== workerIds.length) {
    addError(errors, 'DUPLICATE_WORKER_ID', 'capabilities', 'worker IDs must be unique');
  }
  if (errors.length > 0 || capabilities.length !== value.length) return null;
  capabilities.sort((left, right) => compareUtf8(left.workerId, right.workerId));
  return capabilities;
}

function sortedErrors(errors: FleetPlacementValidationError[]): FleetPlacementValidationError[] {
  return [...errors].sort(
    (left, right) =>
      compareUtf8(left.path, right.path) ||
      compareUtf8(left.code, right.code) ||
      compareUtf8(left.message, right.message)
  );
}

function compareRanks(left: FleetPlacementRank, right: FleetPlacementRank): number {
  for (let index = 0; index < 3; index += 1) {
    const difference = (left[index] as number) - (right[index] as number);
    if (difference !== 0) return difference;
  }
  return compareUtf8(left[3], right[3]) || compareUtf8(left[4], right[4]);
}

function candidateFor(
  manifest: FleetPlacementManifest,
  capability: FleetWorkerCapability,
  island: FleetWorkerIsland,
  capabilityDigest: string,
  decisionMilliseconds: number
): FleetPlacementCandidate {
  const rejectionCodes: FleetPlacementRejectionCode[] = [];
  const acceptedMilliseconds = Date.parse(capability.freshness.acceptedAt);
  const expiresMilliseconds = Date.parse(capability.freshness.expiresAt);

  if (capability.state !== 'ready') rejectionCodes.push('WORKER_NOT_READY');
  if (decisionMilliseconds < acceptedMilliseconds) rejectionCodes.push('CAPABILITY_NOT_YET_VALID');
  if (decisionMilliseconds >= expiresMilliseconds) rejectionCodes.push('CAPABILITY_STALE');
  if (capability.laneId !== manifest.laneId) rejectionCodes.push('LANE_ID_MISMATCH');
  if (capability.laneManifestDigest !== manifest.laneManifestDigest)
    rejectionCodes.push('LANE_MANIFEST_MISMATCH');
  if (!manifest.admittedWorkerSpecDigests.includes(capability.specDigest))
    rejectionCodes.push('WORKER_SPEC_NOT_ADMITTED');
  if (!manifest.allowedCustodyTiers.includes(capability.custodyTier))
    rejectionCodes.push('CUSTODY_TIER_DENIED');
  if (!island.allowedDataClasses.includes(manifest.dataClass))
    rejectionCodes.push('DATA_CLASS_DENIED');
  if (!island.admittedLicensePolicyDigests.includes(manifest.licensePolicyDigest))
    rejectionCodes.push('LICENSE_POLICY_NOT_ADMITTED');
  if (!island.runtimeProfileDigests.includes(manifest.runtimeProfileDigest))
    rejectionCodes.push('RUNTIME_PROFILE_NOT_ADMITTED');
  if (!island.residentReleaseDigests.includes(manifest.modelReleaseDigest))
    rejectionCodes.push('MODEL_RELEASE_NOT_RESIDENT');
  if (island.availableSlots < manifest.resources.slots) rejectionCodes.push('NO_AVAILABLE_SLOT');
  if (island.gpuCount < manifest.resources.gpuCount) rejectionCodes.push('INSUFFICIENT_GPU_COUNT');
  if (island.gpuMemoryFreeMiB < manifest.resources.gpuMemoryMiB)
    rejectionCodes.push('INSUFFICIENT_GPU_MEMORY');
  if (island.hostMemoryFreeMiB < manifest.resources.hostMemoryMiB)
    rejectionCodes.push('INSUFFICIENT_HOST_MEMORY');
  if (island.scratchFreeBytes < manifest.resources.scratchBytes)
    rejectionCodes.push('INSUFFICIENT_SCRATCH');

  const eligible = rejectionCodes.length === 0;
  const rank: FleetPlacementRank | null = eligible
    ? [
        island.activeLeaseCount,
        island.gpuMemoryFreeMiB - manifest.resources.gpuMemoryMiB,
        island.lastAssignedOrdinal,
        capability.workerId,
        island.islandId,
      ]
    : null;

  return {
    workerId: capability.workerId,
    islandId: island.islandId,
    capabilityDigest,
    eligible,
    rejectionCodes,
    rank,
  };
}

function attestationSummary(
  manifest: FleetPlacementManifest | null,
  capabilities: FleetWorkerCapability[] | null
): FleetPlacementAttestationSummary {
  return {
    required: true,
    requestReceiptDigest: manifest?.upstreamAttestationReceiptDigest ?? null,
    workerReceiptDigests:
      capabilities?.map((capability) => capability.attestationReceiptDigest).sort(compareUtf8) ??
      [],
    digestReferencesValidated: manifest !== null && capabilities !== null,
    signatureVerificationPerformed: false,
    signatureVerified: false,
    verificationScope: 'digest-reference-only',
  };
}

function deepFreeze<T>(value: T, seen = new Set<object>()): T {
  if (value === null || typeof value !== 'object' || seen.has(value)) return value;
  seen.add(value);
  for (const child of Object.values(value)) deepFreeze(child, seen);
  return Object.freeze(value);
}

function sealReceipt(receipt: Omit<FleetPlacementReceipt, 'receiptDigest'>): FleetPlacementReceipt {
  return deepFreeze({ ...receipt, receiptDigest: sha256(receipt) });
}

function invalidReceipt({
  decisionTime,
  leaseLedgerVersion,
  manifest,
  capabilities,
  errors,
}: {
  decisionTime: string | null;
  leaseLedgerVersion: number | null;
  manifest: FleetPlacementManifest | null;
  capabilities: FleetWorkerCapability[] | null;
  errors: FleetPlacementValidationError[];
}): FleetPlacementReceipt {
  return sealReceipt({
    schema: FLEET_PLACEMENT_RECEIPT_SCHEMA,
    algorithm: FLEET_PLACEMENT_ALGORITHM,
    status: 'invalid',
    outcomeCode: 'INVALID_INPUT',
    decisionTime,
    leaseLedgerVersion,
    requestDigest: manifest ? sha256(manifest) : null,
    policyDigest: sha256(DEFAULT_FLEET_PLACEMENT_POLICY),
    capabilitySnapshotDigest: capabilities ? sha256(capabilities) : null,
    attestation: attestationSummary(manifest, capabilities),
    candidates: [],
    selected: null,
    errors: sortedErrors(errors),
    sideEffects: PLAN_ONLY_SIDE_EFFECTS,
  });
}

/**
 * Produce a deterministic, side-effect-free placement plan.
 *
 * The planner validates attestation receipt digest references and binds them into
 * its receipt. It intentionally performs no signature verification, lease write,
 * artifact fetch, provisioning, spend, networking, RPC, or tensor transport.
 */
export function planFleetPlacement(options: FleetPlacementOptions): FleetPlacementReceipt {
  const errors: FleetPlacementValidationError[] = [];
  const rawOptions: unknown = options;
  const optionKeys = ['decisionTime', 'leaseLedgerVersion', 'manifest', 'capabilities'] as const;
  if (!isStrictRecord(rawOptions) || !hasExactKeys(rawOptions, optionKeys)) {
    addError(
      errors,
      'INVALID_OPTIONS',
      'options',
      'options must contain exactly decisionTime, leaseLedgerVersion, manifest, and capabilities'
    );
    return invalidReceipt({
      decisionTime: null,
      leaseLedgerVersion: null,
      manifest: null,
      capabilities: null,
      errors,
    });
  }

  const decision = parseInstant(rawOptions.decisionTime);
  if (!decision) {
    addError(errors, 'INVALID_DECISION_TIME', 'decisionTime', 'must be a UTC RFC3339 timestamp');
  }
  const leaseLedgerVersion = safeInteger(rawOptions.leaseLedgerVersion, 0)
    ? rawOptions.leaseLedgerVersion
    : null;
  if (leaseLedgerVersion === null) {
    addError(
      errors,
      'INVALID_OPTIONS',
      'leaseLedgerVersion',
      'must be a non-negative safe integer'
    );
  }
  const manifestErrors: FleetPlacementValidationError[] = [];
  const manifest = validateManifest(rawOptions.manifest, manifestErrors);
  errors.push(...manifestErrors);
  const capabilityErrors: FleetPlacementValidationError[] = [];
  const capabilities = validateCapabilities(rawOptions.capabilities, capabilityErrors);
  errors.push(...capabilityErrors);

  if (errors.length > 0 || !decision || !manifest || !capabilities) {
    return invalidReceipt({
      decisionTime: decision?.iso ?? null,
      leaseLedgerVersion,
      manifest,
      capabilities,
      errors,
    });
  }

  const capabilityDigests = new Map(
    capabilities.map((capability) => [capability.workerId, sha256(capability)] as const)
  );
  const candidates = capabilities
    .flatMap((capability) =>
      capability.islands.map((island) =>
        candidateFor(
          manifest,
          capability,
          island,
          capabilityDigests.get(capability.workerId)!,
          decision.milliseconds
        )
      )
    )
    .sort(
      (left, right) =>
        compareUtf8(left.workerId, right.workerId) || compareUtf8(left.islandId, right.islandId)
    );
  const eligible = candidates
    .filter(
      (candidate): candidate is FleetPlacementCandidate & { rank: FleetPlacementRank } =>
        candidate.eligible && candidate.rank !== null
    )
    .sort((left, right) => compareRanks(left.rank, right.rank));
  const chosen = eligible[0] ?? null;
  const chosenIsland = chosen
    ? (capabilities
        .find((capability) => capability.workerId === chosen.workerId)
        ?.islands.find((island) => island.islandId === chosen.islandId) ?? null)
    : null;
  const status: FleetPlacementStatus = chosen ? 'placed' : 'unplaced';
  const outcomeCode: FleetPlacementOutcomeCode = chosen
    ? 'PLACED'
    : candidates.length === 0
      ? 'NO_CANDIDATES'
      : 'NO_ELIGIBLE_CANDIDATE';
  const selected: FleetPlacementSelection | null = chosen
    ? {
        workerId: chosen.workerId,
        islandId: chosen.islandId,
        dataEndpointId: chosenIsland!.dataEndpointId,
        capabilityDigest: chosen.capabilityDigest,
        rank: chosen.rank,
      }
    : null;

  return sealReceipt({
    schema: FLEET_PLACEMENT_RECEIPT_SCHEMA,
    algorithm: FLEET_PLACEMENT_ALGORITHM,
    status,
    outcomeCode,
    decisionTime: decision.iso,
    leaseLedgerVersion,
    requestDigest: sha256(manifest),
    policyDigest: sha256(manifest.policy),
    capabilitySnapshotDigest: sha256(capabilities),
    attestation: attestationSummary(manifest, capabilities),
    candidates,
    selected,
    errors: [],
    sideEffects: PLAN_ONLY_SIDE_EFFECTS,
  });
}
