/**
 * Privacy-preserving discovery signals for sovereign compute utility.
 *
 * Local observations contain only content addresses and coarse buckets. Exportable
 * aggregates remove those addresses and suppress groups smaller than ten. This
 * module has no transport and never accepts identity, prompt, source, provider, or
 * raw hardware fields.
 */

import { createHash } from 'crypto';
import {
  computeWorkUnitDigest,
  validateComputeWorkUnitContract,
  type ComputeAccelerator,
  type ComputeWorkUnitContract,
} from '../compiler/ComputeWorkUnitCompiler';
import {
  validateComputeExecutionReceipt,
  type ComputeExecutionPlacementOutcome,
  type ComputeExecutionReceipt,
  type ComputeExecutionTerminalStatus,
} from './ComputeExecutionReceipt';

export const COMPUTE_UTILITY_OBSERVATION_SCHEMA_VERSION =
  'holoscript.compute-utility-observation.v1' as const;
export const COMPUTE_UTILITY_AGGREGATE_SCHEMA_VERSION =
  'holoscript.compute-utility-aggregate.v1' as const;
export const COMPUTE_UTILITY_MINIMUM_AGGREGATE = 10 as const;

export type ComputeUtilityNotMeasuredReason =
  | 'analytics_unset'
  | 'analytics_disabled'
  | 'consent_unset'
  | 'consent_denied';
export type ComputeUtilityFallbackBucket =
  | 'not_allowed'
  | 'allowed_not_used'
  | 'used_cpu'
  | 'used_gpu'
  | 'used_npu'
  | 'used_other';
export type ComputeUtilityQualityBucket = 'passed' | 'failed';
export type ComputeUtilityLatencyBucket =
  | 'lt_100ms'
  | '100ms_to_lt_1s'
  | '1s_to_lt_10s'
  | '10s_to_lt_60s'
  | '60s_plus';
export type ComputeUtilityCostBucket =
  | 'not_measured'
  | 'zero'
  | 'minor_1_10'
  | 'minor_11_100'
  | 'minor_101_1000'
  | 'minor_1001_plus';

export interface ComputeUtilityBuckets {
  readonly requestedAccelerator: ComputeAccelerator;
  readonly placementOutcome: ComputeExecutionPlacementOutcome;
  readonly fallback: ComputeUtilityFallbackBucket;
  readonly terminalStatus: ComputeExecutionTerminalStatus;
  readonly quality: ComputeUtilityQualityBucket;
  readonly latency: ComputeUtilityLatencyBucket;
  readonly cost: ComputeUtilityCostBucket;
}

export interface ComputeUtilityObservation {
  readonly schemaVersion: typeof COMPUTE_UTILITY_OBSERVATION_SCHEMA_VERSION;
  readonly privacyClass: 'local_private';
  readonly evidenceScope: 'structural_only';
  readonly observationId: string;
  readonly workUnitDigest: string;
  readonly executionReceiptId: string;
  readonly buckets: ComputeUtilityBuckets;
}

export interface BuildComputeUtilityObservationInput {
  readonly analyticsEnabled?: boolean;
  readonly consentGranted?: boolean;
  readonly workUnit: ComputeWorkUnitContract;
  readonly executionReceipt: ComputeExecutionReceipt;
}

export type ComputeUtilityMeasurementResult =
  | {
      readonly measurementState: 'not_measured';
      readonly reason: ComputeUtilityNotMeasuredReason;
    }
  | {
      readonly measurementState: 'measured';
      readonly observation: ComputeUtilityObservation;
    };

export interface ComputeUtilityAggregateBucket extends ComputeUtilityBuckets {
  readonly count: number;
}

export interface ComputeUtilityAggregate {
  readonly schemaVersion: typeof COMPUTE_UTILITY_AGGREGATE_SCHEMA_VERSION;
  readonly privacyClass: 'aggregate_only';
  readonly evidenceScope: 'structural_only';
  readonly aggregateId: string;
  readonly minimumBucketCount: typeof COMPUTE_UTILITY_MINIMUM_AGGREGATE;
  readonly buckets: readonly ComputeUtilityAggregateBucket[];
}

export type ComputeUtilityAggregateResult =
  | { readonly measurementState: 'not_measured'; readonly reason: 'no_observations' }
  | {
      readonly measurementState: 'measured_suppressed';
      readonly reason: 'minimum_aggregate_not_met';
    }
  | { readonly measurementState: 'measured'; readonly aggregate: ComputeUtilityAggregate };

export interface ComputeUtilityValidation {
  readonly valid: boolean;
  readonly errors: readonly string[];
}

const SHA256_LABEL = /^sha256:[a-f0-9]{64}$/;
const ACCELERATORS = new Set<ComputeAccelerator>(['cpu', 'gpu', 'npu', 'other']);
const PLACEMENTS = new Set<ComputeExecutionPlacementOutcome>([
  'local_device',
  'owned_fleet',
  'external_bridge',
]);
const FALLBACKS = new Set<ComputeUtilityFallbackBucket>([
  'not_allowed',
  'allowed_not_used',
  'used_cpu',
  'used_gpu',
  'used_npu',
  'used_other',
]);
const TERMINAL_STATUSES = new Set<ComputeExecutionTerminalStatus>([
  'succeeded',
  'failed',
  'cancelled',
]);
const QUALITIES = new Set<ComputeUtilityQualityBucket>(['passed', 'failed']);
const LATENCIES = new Set<ComputeUtilityLatencyBucket>([
  'lt_100ms',
  '100ms_to_lt_1s',
  '1s_to_lt_10s',
  '10s_to_lt_60s',
  '60s_plus',
]);
const COSTS = new Set<ComputeUtilityCostBucket>([
  'not_measured',
  'zero',
  'minor_1_10',
  'minor_11_100',
  'minor_101_1000',
  'minor_1001_plus',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function canonicalize(value: unknown): unknown {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value))
      throw new TypeError('utility evidence cannot contain non-finite numbers');
    return value;
  }
  if (Array.isArray(value)) return value.map(canonicalize);
  if (isRecord(value)) {
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) {
      if (value[key] !== undefined) result[key] = canonicalize(value[key]);
    }
    return result;
  }
  throw new TypeError(`utility evidence cannot contain ${typeof value}`);
}

function sha256Body(value: unknown): string {
  return `sha256:${createHash('sha256')
    .update(JSON.stringify(canonicalize(value)))
    .digest('hex')}`;
}

function rejectUnknownKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  path: string,
  errors: string[]
): void {
  const allowlist = new Set(allowed);
  for (const key of Object.keys(value)) {
    if (!allowlist.has(key)) errors.push(`${path}.${key} is not allowed`);
  }
}

function latencyBucket(durationMs: number): ComputeUtilityLatencyBucket {
  if (durationMs < 100) return 'lt_100ms';
  if (durationMs < 1_000) return '100ms_to_lt_1s';
  if (durationMs < 10_000) return '1s_to_lt_10s';
  if (durationMs < 60_000) return '10s_to_lt_60s';
  return '60s_plus';
}

function costBucket(receipt: ComputeExecutionReceipt): ComputeUtilityCostBucket {
  if (receipt.cost.measurementState === 'not_measured') return 'not_measured';
  const amount = receipt.cost.actualMinorUnits;
  if (amount === 0) return 'zero';
  if (amount <= 10) return 'minor_1_10';
  if (amount <= 100) return 'minor_11_100';
  if (amount <= 1_000) return 'minor_101_1000';
  return 'minor_1001_plus';
}

function fallbackBucket(
  workUnit: ComputeWorkUnitContract,
  receipt: ComputeExecutionReceipt
): ComputeUtilityFallbackBucket {
  if (!workUnit.compute.policy.allowFallback) return 'not_allowed';
  if (!receipt.execution.fallbackUsed) return 'allowed_not_used';
  return `used_${receipt.execution.actualAccelerator}`;
}

function requestedPlacementOutcome(
  workUnit: ComputeWorkUnitContract
): ComputeExecutionPlacementOutcome {
  switch (workUnit.compute.policy.placement) {
    case 'local_only':
      return 'local_device';
    case 'owned_fleet':
      return 'owned_fleet';
    case 'external_bridge_requested':
      return 'external_bridge';
  }
}

function bucketKey(buckets: ComputeUtilityBuckets): string {
  return JSON.stringify(canonicalize(buckets));
}

function observationBody(
  observation: ComputeUtilityObservation
): Omit<ComputeUtilityObservation, 'observationId'> {
  const { observationId: _observationId, ...body } = observation;
  return body;
}

function aggregateBody(
  aggregate: ComputeUtilityAggregate
): Omit<ComputeUtilityAggregate, 'aggregateId'> {
  const { aggregateId: _aggregateId, ...body } = aggregate;
  return body;
}

function validateBuckets(
  value: unknown,
  path: string,
  errors: string[]
): value is ComputeUtilityBuckets {
  if (!isRecord(value)) {
    errors.push(`${path} must be an object`);
    return false;
  }
  rejectUnknownKeys(
    value,
    [
      'requestedAccelerator',
      'placementOutcome',
      'fallback',
      'terminalStatus',
      'quality',
      'latency',
      'cost',
    ],
    path,
    errors
  );
  if (!ACCELERATORS.has(value.requestedAccelerator as ComputeAccelerator)) {
    errors.push(`${path}.requestedAccelerator is invalid`);
  }
  if (!PLACEMENTS.has(value.placementOutcome as ComputeExecutionPlacementOutcome)) {
    errors.push(`${path}.placementOutcome is invalid`);
  }
  if (!FALLBACKS.has(value.fallback as ComputeUtilityFallbackBucket)) {
    errors.push(`${path}.fallback is invalid`);
  }
  if (!TERMINAL_STATUSES.has(value.terminalStatus as ComputeExecutionTerminalStatus)) {
    errors.push(`${path}.terminalStatus is invalid`);
  }
  if (!QUALITIES.has(value.quality as ComputeUtilityQualityBucket)) {
    errors.push(`${path}.quality is invalid`);
  }
  if (!LATENCIES.has(value.latency as ComputeUtilityLatencyBucket)) {
    errors.push(`${path}.latency is invalid`);
  }
  if (!COSTS.has(value.cost as ComputeUtilityCostBucket)) errors.push(`${path}.cost is invalid`);
  return true;
}

export function buildComputeUtilityObservation(
  input: BuildComputeUtilityObservationInput
): ComputeUtilityMeasurementResult {
  if (input.analyticsEnabled === undefined) {
    return { measurementState: 'not_measured', reason: 'analytics_unset' };
  }
  if (input.analyticsEnabled !== true) {
    return { measurementState: 'not_measured', reason: 'analytics_disabled' };
  }
  if (input.consentGranted === undefined) {
    return { measurementState: 'not_measured', reason: 'consent_unset' };
  }
  if (input.consentGranted !== true) {
    return { measurementState: 'not_measured', reason: 'consent_denied' };
  }

  const workUnitValidation = validateComputeWorkUnitContract(input.workUnit);
  if (!workUnitValidation.valid) {
    throw new TypeError(`Invalid compute WorkUnit: ${workUnitValidation.errors.join('; ')}`);
  }
  const receiptValidation = validateComputeExecutionReceipt(input.executionReceipt);
  if (!receiptValidation.valid) {
    throw new TypeError(
      `Invalid compute execution receipt: ${receiptValidation.errors.join('; ')}`
    );
  }

  const workUnitDigest = computeWorkUnitDigest(input.workUnit);
  if (input.executionReceipt.workUnit.digest !== workUnitDigest) {
    throw new TypeError('execution receipt does not bind the supplied WorkUnit digest');
  }
  if (input.executionReceipt.workUnit.sourceEvidence !== input.workUnit.source_evidence) {
    throw new TypeError('execution receipt does not bind the supplied WorkUnit source evidence');
  }
  const policy = input.workUnit.compute.policy;
  const quality = input.workUnit.compute.quality;
  const execution = input.executionReceipt.execution;
  if (execution.fallbackAllowed !== policy.allowFallback) {
    throw new TypeError('execution fallback policy does not match the supplied WorkUnit');
  }
  if (execution.fallbackUsed && !policy.allowFallback) {
    throw new TypeError('execution used fallback forbidden by the supplied WorkUnit');
  }
  if (!policy.allowedAccelerators.includes(execution.actualAccelerator)) {
    throw new TypeError('execution accelerator is not allowed by the supplied WorkUnit');
  }
  const placementOutcome = input.executionReceipt.placement.outcome;
  if (policy.placement === 'local_only' && placementOutcome !== 'local_device') {
    throw new TypeError('execution placement is not allowed by local_only policy');
  }
  if (policy.placement === 'owned_fleet' && placementOutcome === 'external_bridge') {
    throw new TypeError('execution placement is not allowed by owned_fleet policy');
  }
  if (
    policy.placement === 'external_bridge_requested' &&
    placementOutcome !== 'external_bridge' &&
    !policy.allowFallback
  ) {
    throw new TypeError('execution placement requires a WorkUnit-authorized fallback');
  }
  const deviatedFromRequestedAccelerator =
    execution.actualAccelerator !== policy.allowedAccelerators[0];
  const deviatedFromRequestedPlacement =
    placementOutcome !== requestedPlacementOutcome(input.workUnit);
  if (
    (deviatedFromRequestedAccelerator || deviatedFromRequestedPlacement) &&
    !execution.fallbackUsed
  ) {
    throw new TypeError('execution deviated from the requested route without recording fallback');
  }
  if (
    input.executionReceipt.quality.metric !== quality.metric ||
    input.executionReceipt.quality.operator !== quality.operator ||
    input.executionReceipt.quality.threshold !== quality.threshold ||
    input.executionReceipt.quality.reference !== quality.reference
  ) {
    throw new TypeError('execution quality contract does not match the supplied WorkUnit');
  }
  if (
    input.executionReceipt.cost.measurementState === 'measured' &&
    input.executionReceipt.cost.actualMinorUnits > input.workUnit.compute.budget.maxCostMinorUnits
  ) {
    throw new TypeError('measured execution cost exceeds the supplied WorkUnit budget');
  }

  const body: Omit<ComputeUtilityObservation, 'observationId'> = {
    schemaVersion: COMPUTE_UTILITY_OBSERVATION_SCHEMA_VERSION,
    privacyClass: 'local_private',
    evidenceScope: 'structural_only',
    workUnitDigest,
    executionReceiptId: input.executionReceipt.receiptId,
    buckets: {
      requestedAccelerator: policy.allowedAccelerators[0],
      placementOutcome: input.executionReceipt.placement.outcome,
      fallback: fallbackBucket(input.workUnit, input.executionReceipt),
      terminalStatus: execution.terminalStatus,
      quality: input.executionReceipt.quality.passed ? 'passed' : 'failed',
      latency: latencyBucket(execution.durationMs),
      cost: costBucket(input.executionReceipt),
    },
  };
  const observation: ComputeUtilityObservation = {
    ...body,
    observationId: sha256Body(body),
  };
  const validation = validateComputeUtilityObservation(observation);
  if (!validation.valid) {
    throw new TypeError(`Invalid compute utility observation: ${validation.errors.join('; ')}`);
  }
  return { measurementState: 'measured', observation };
}

export function validateComputeUtilityObservation(value: unknown): ComputeUtilityValidation {
  const errors: string[] = [];
  if (!isRecord(value)) return { valid: false, errors: ['observation must be an object'] };
  rejectUnknownKeys(
    value,
    [
      'schemaVersion',
      'privacyClass',
      'evidenceScope',
      'observationId',
      'workUnitDigest',
      'executionReceiptId',
      'buckets',
    ],
    'observation',
    errors
  );
  if (value.schemaVersion !== COMPUTE_UTILITY_OBSERVATION_SCHEMA_VERSION) {
    errors.push(`schemaVersion must be ${COMPUTE_UTILITY_OBSERVATION_SCHEMA_VERSION}`);
  }
  if (value.privacyClass !== 'local_private') errors.push('privacyClass must be local_private');
  if (value.evidenceScope !== 'structural_only') {
    errors.push('evidenceScope must be structural_only');
  }
  for (const key of ['observationId', 'workUnitDigest', 'executionReceiptId'] as const) {
    if (typeof value[key] !== 'string' || !SHA256_LABEL.test(value[key])) {
      errors.push(`${key} must be a sha256 label`);
    }
  }
  validateBuckets(value.buckets, 'buckets', errors);
  if (typeof value.observationId === 'string' && SHA256_LABEL.test(value.observationId)) {
    try {
      const expected = sha256Body(observationBody(value as unknown as ComputeUtilityObservation));
      if (expected !== value.observationId)
        errors.push('observationId does not match canonical body');
    } catch (error) {
      errors.push(`observation cannot be canonicalized: ${String(error)}`);
    }
  }
  return { valid: errors.length === 0, errors };
}

export function aggregateComputeUtilityObservations(
  observations: readonly ComputeUtilityObservation[]
): ComputeUtilityAggregateResult {
  const uniqueByExecution = new Map<string, ComputeUtilityObservation>();
  for (const observation of observations) {
    const validation = validateComputeUtilityObservation(observation);
    if (!validation.valid) {
      throw new TypeError(`Invalid compute utility observation: ${validation.errors.join('; ')}`);
    }
    const prior = uniqueByExecution.get(observation.executionReceiptId);
    if (prior && prior.observationId !== observation.observationId) {
      throw new TypeError('conflicting observations bind the same execution receipt');
    }
    uniqueByExecution.set(observation.executionReceiptId, observation);
  }
  if (uniqueByExecution.size === 0) {
    return { measurementState: 'not_measured', reason: 'no_observations' };
  }

  const groups = new Map<string, { buckets: ComputeUtilityBuckets; count: number }>();
  for (const observation of uniqueByExecution.values()) {
    const key = bucketKey(observation.buckets);
    const prior = groups.get(key);
    groups.set(key, {
      buckets: observation.buckets,
      count: (prior?.count ?? 0) + 1,
    });
  }
  const buckets: ComputeUtilityAggregateBucket[] = [...groups.entries()]
    .filter(([, group]) => group.count >= COMPUTE_UTILITY_MINIMUM_AGGREGATE)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([, group]) => ({ ...group.buckets, count: group.count }));
  if (buckets.length === 0) {
    return {
      measurementState: 'measured_suppressed',
      reason: 'minimum_aggregate_not_met',
    };
  }

  const body: Omit<ComputeUtilityAggregate, 'aggregateId'> = {
    schemaVersion: COMPUTE_UTILITY_AGGREGATE_SCHEMA_VERSION,
    privacyClass: 'aggregate_only',
    evidenceScope: 'structural_only',
    minimumBucketCount: COMPUTE_UTILITY_MINIMUM_AGGREGATE,
    buckets,
  };
  const aggregate: ComputeUtilityAggregate = { ...body, aggregateId: sha256Body(body) };
  const validation = validateComputeUtilityAggregate(aggregate);
  if (!validation.valid) {
    throw new TypeError(`Invalid compute utility aggregate: ${validation.errors.join('; ')}`);
  }
  return { measurementState: 'measured', aggregate };
}

export function validateComputeUtilityAggregate(value: unknown): ComputeUtilityValidation {
  const errors: string[] = [];
  if (!isRecord(value)) return { valid: false, errors: ['aggregate must be an object'] };
  rejectUnknownKeys(
    value,
    [
      'schemaVersion',
      'privacyClass',
      'evidenceScope',
      'aggregateId',
      'minimumBucketCount',
      'buckets',
    ],
    'aggregate',
    errors
  );
  if (value.schemaVersion !== COMPUTE_UTILITY_AGGREGATE_SCHEMA_VERSION) {
    errors.push(`schemaVersion must be ${COMPUTE_UTILITY_AGGREGATE_SCHEMA_VERSION}`);
  }
  if (value.privacyClass !== 'aggregate_only') errors.push('privacyClass must be aggregate_only');
  if (value.evidenceScope !== 'structural_only') {
    errors.push('evidenceScope must be structural_only');
  }
  if (value.minimumBucketCount !== COMPUTE_UTILITY_MINIMUM_AGGREGATE) {
    errors.push(`minimumBucketCount must be ${COMPUTE_UTILITY_MINIMUM_AGGREGATE}`);
  }
  if (typeof value.aggregateId !== 'string' || !SHA256_LABEL.test(value.aggregateId)) {
    errors.push('aggregateId must be a sha256 label');
  }
  if (!Array.isArray(value.buckets) || value.buckets.length === 0) {
    errors.push('buckets must be a non-empty array');
  } else {
    let previousKey = '';
    for (const [index, bucket] of value.buckets.entries()) {
      if (!isRecord(bucket)) {
        errors.push(`buckets[${index}] must be an object`);
        continue;
      }
      rejectUnknownKeys(
        bucket,
        [
          'requestedAccelerator',
          'placementOutcome',
          'fallback',
          'terminalStatus',
          'quality',
          'latency',
          'cost',
          'count',
        ],
        `buckets[${index}]`,
        errors
      );
      const bucketFields = Object.fromEntries(
        Object.entries(bucket).filter(([key]) => key !== 'count')
      );
      validateBuckets(bucketFields, `buckets[${index}]`, errors);
      if (
        !Number.isSafeInteger(bucket.count) ||
        (bucket.count as number) < COMPUTE_UTILITY_MINIMUM_AGGREGATE
      ) {
        errors.push(`buckets[${index}].count must meet the minimum aggregate`);
      }
      const currentKey = bucketKey(bucketFields as unknown as ComputeUtilityBuckets);
      if (previousKey && currentKey <= previousKey) {
        errors.push('aggregate buckets must be unique and canonically sorted');
      }
      previousKey = currentKey;
    }
  }
  if (typeof value.aggregateId === 'string' && SHA256_LABEL.test(value.aggregateId)) {
    try {
      const expected = sha256Body(aggregateBody(value as unknown as ComputeUtilityAggregate));
      if (expected !== value.aggregateId) errors.push('aggregateId does not match canonical body');
    } catch (error) {
      errors.push(`aggregate cannot be canonicalized: ${String(error)}`);
    }
  }
  return { valid: errors.length === 0, errors };
}
