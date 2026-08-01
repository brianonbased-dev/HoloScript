/**
 * Receipt for one terminal execution of a sovereign @compute WorkUnit.
 *
 * Placement and capacity remain separate runtime evidence. This receipt binds
 * those decisions, the authored WorkUnit, measured quality, and portable
 * hardware metadata without promoting a provider log into language semantics.
 */

import { createHash } from 'crypto';
import {
  validatePortableHardwareReceiptMetadata,
  type PortableHardwareReceiptMetadata,
} from './HardwareReceiptMetadata';

export const COMPUTE_EXECUTION_RECEIPT_SCHEMA_VERSION =
  'holoscript.compute-execution-receipt.v1' as const;

export type ComputeExecutionAccelerator = 'cpu' | 'gpu' | 'npu' | 'other';
export type ComputeExecutionTerminalStatus = 'succeeded' | 'failed' | 'cancelled';
export type ComputeExecutionQualityOperator = 'eq' | 'lte' | 'gte';
export type ComputeExecutionQualityReference = 'none' | 'cpu_reference';
export type ComputeExecutionPlacementOutcome = 'local_device' | 'owned_fleet' | 'external_bridge';
export type ComputeExecutionCost =
  | {
      readonly measurementState: 'measured';
      readonly currency: 'USD';
      readonly actualMinorUnits: number;
    }
  | {
      readonly measurementState: 'not_measured';
      readonly reason: 'meter_unavailable' | 'not_applicable';
    };

export interface ComputeExecutionWorkUnitBinding {
  readonly digest: string;
  readonly sourceEvidence: string;
}

export interface ComputeExecutionPlacementBinding {
  readonly planReceiptId: string;
  readonly capacityLeaseReceiptId: string;
  readonly outcome: ComputeExecutionPlacementOutcome;
}

export interface ComputeExecutionOutcome {
  readonly actualAccelerator: ComputeExecutionAccelerator;
  readonly fallbackAllowed: boolean;
  readonly fallbackUsed: boolean;
  readonly fallbackReason?: string;
  readonly terminalStatus: ComputeExecutionTerminalStatus;
  readonly startedAt: string;
  readonly completedAt: string;
  readonly durationMs: number;
}

export interface ComputeExecutionQualityResult {
  readonly metric: string;
  readonly operator: ComputeExecutionQualityOperator;
  readonly threshold: number;
  readonly reference: ComputeExecutionQualityReference;
  readonly observedValue: number;
  readonly passed: boolean;
}

export interface ComputeExecutionReceipt {
  readonly schemaVersion: typeof COMPUTE_EXECUTION_RECEIPT_SCHEMA_VERSION;
  /** Content-addressed structure only; external evidence verification is a separate admission step. */
  readonly verificationScope: 'structural_only';
  readonly receiptId: string;
  readonly workUnit: ComputeExecutionWorkUnitBinding;
  readonly placement: ComputeExecutionPlacementBinding;
  readonly execution: ComputeExecutionOutcome;
  readonly quality: ComputeExecutionQualityResult;
  readonly cost: ComputeExecutionCost;
  readonly hardware: PortableHardwareReceiptMetadata;
}

export interface BuildComputeExecutionReceiptInput {
  readonly workUnit: ComputeExecutionWorkUnitBinding;
  readonly placement: ComputeExecutionPlacementBinding;
  readonly execution: Omit<ComputeExecutionOutcome, 'durationMs'>;
  readonly quality: ComputeExecutionQualityResult;
  readonly cost: ComputeExecutionCost;
  readonly hardware: PortableHardwareReceiptMetadata;
}

export interface ComputeExecutionReceiptValidation {
  readonly valid: boolean;
  readonly errors: readonly string[];
}

const SHA256_LABEL = /^sha256:[a-f0-9]{64}$/;
const ACCELERATORS = new Set<ComputeExecutionAccelerator>(['cpu', 'gpu', 'npu', 'other']);
const TERMINAL_STATUSES = new Set<ComputeExecutionTerminalStatus>([
  'succeeded',
  'failed',
  'cancelled',
]);
const QUALITY_OPERATORS = new Set<ComputeExecutionQualityOperator>(['eq', 'lte', 'gte']);
const QUALITY_REFERENCES = new Set<ComputeExecutionQualityReference>(['none', 'cpu_reference']);
const PLACEMENT_OUTCOMES = new Set<ComputeExecutionPlacementOutcome>([
  'local_device',
  'owned_fleet',
  'external_bridge',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function finiteNonNegative(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function canonicalize(value: unknown): unknown {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('receipt cannot contain non-finite numbers');
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
  throw new TypeError(`receipt cannot contain ${typeof value}`);
}

function receiptBody(receipt: ComputeExecutionReceipt): Omit<ComputeExecutionReceipt, 'receiptId'> {
  const { receiptId: _receiptId, ...body } = receipt;
  return body;
}

function hashReceiptBody(body: Omit<ComputeExecutionReceipt, 'receiptId'>): string {
  const canonical = JSON.stringify(canonicalize(body));
  return `sha256:${createHash('sha256').update(canonical).digest('hex')}`;
}

function expectedQualityPass(
  operator: ComputeExecutionQualityOperator,
  observed: number,
  threshold: number
): boolean {
  if (operator === 'eq') return observed === threshold;
  if (operator === 'lte') return observed <= threshold;
  return observed >= threshold;
}

function rejectUnknownKeys(
  record: Record<string, unknown>,
  allowed: readonly string[],
  path: string,
  errors: string[]
): void {
  const allowlist = new Set(allowed);
  for (const key of Object.keys(record)) {
    if (!allowlist.has(key)) errors.push(`${path}.${key} is not allowed`);
  }
}

/** Build content-addressed structure; this does not authenticate referenced external evidence. */
export function buildComputeExecutionReceipt(
  input: BuildComputeExecutionReceiptInput
): ComputeExecutionReceipt {
  const startedMs = Date.parse(input.execution.startedAt);
  const completedMs = Date.parse(input.execution.completedAt);
  const body: Omit<ComputeExecutionReceipt, 'receiptId'> = {
    schemaVersion: COMPUTE_EXECUTION_RECEIPT_SCHEMA_VERSION,
    verificationScope: 'structural_only',
    workUnit: input.workUnit,
    placement: input.placement,
    execution: {
      ...input.execution,
      durationMs: completedMs - startedMs,
    },
    quality: input.quality,
    cost: input.cost,
    hardware: input.hardware,
  };
  const receipt: ComputeExecutionReceipt = {
    ...body,
    receiptId: hashReceiptBody(body),
  };
  const validation = validateComputeExecutionReceipt(receipt);
  if (!validation.valid) {
    throw new TypeError(`Invalid compute execution receipt: ${validation.errors.join('; ')}`);
  }
  return receipt;
}

/** Validate structure and receipt ID only; this is not WorkUnit/placement/lease trust verification. */
export function validateComputeExecutionReceipt(value: unknown): ComputeExecutionReceiptValidation {
  const errors: string[] = [];
  if (!isRecord(value)) {
    return { valid: false, errors: ['Compute execution receipt must be an object'] };
  }
  rejectUnknownKeys(
    value,
    [
      'schemaVersion',
      'verificationScope',
      'receiptId',
      'workUnit',
      'placement',
      'execution',
      'quality',
      'cost',
      'hardware',
    ],
    'receipt',
    errors
  );
  if (value.schemaVersion !== COMPUTE_EXECUTION_RECEIPT_SCHEMA_VERSION) {
    errors.push(`schemaVersion must be ${COMPUTE_EXECUTION_RECEIPT_SCHEMA_VERSION}`);
  }
  if (value.verificationScope !== 'structural_only') {
    errors.push('verificationScope must be structural_only');
  }
  if (typeof value.receiptId !== 'string' || !SHA256_LABEL.test(value.receiptId)) {
    errors.push('receiptId must be a sha256 label');
  }

  const workUnit = isRecord(value.workUnit) ? value.workUnit : null;
  if (!workUnit) {
    errors.push('workUnit must be an object');
  } else {
    rejectUnknownKeys(workUnit, ['digest', 'sourceEvidence'], 'workUnit', errors);
    if (typeof workUnit.digest !== 'string' || !SHA256_LABEL.test(workUnit.digest)) {
      errors.push('workUnit.digest must be a sha256 label');
    }
    if (
      typeof workUnit.sourceEvidence !== 'string' ||
      !SHA256_LABEL.test(workUnit.sourceEvidence)
    ) {
      errors.push('workUnit.sourceEvidence must be a sha256 label');
    }
  }

  const placement = isRecord(value.placement) ? value.placement : null;
  if (!placement) {
    errors.push('placement must be an object');
  } else {
    rejectUnknownKeys(
      placement,
      ['planReceiptId', 'capacityLeaseReceiptId', 'outcome'],
      'placement',
      errors
    );
    if (
      typeof placement.planReceiptId !== 'string' ||
      !SHA256_LABEL.test(placement.planReceiptId)
    ) {
      errors.push('placement.planReceiptId must be a sha256 label');
    }
    if (
      typeof placement.capacityLeaseReceiptId !== 'string' ||
      !SHA256_LABEL.test(placement.capacityLeaseReceiptId)
    ) {
      errors.push('placement.capacityLeaseReceiptId must be a sha256 label');
    }
    if (
      typeof placement.outcome !== 'string' ||
      !PLACEMENT_OUTCOMES.has(placement.outcome as ComputeExecutionPlacementOutcome)
    ) {
      errors.push('placement.outcome is invalid');
    }
  }

  const execution = isRecord(value.execution) ? value.execution : null;
  if (!execution) {
    errors.push('execution must be an object');
  } else {
    rejectUnknownKeys(
      execution,
      [
        'actualAccelerator',
        'fallbackAllowed',
        'fallbackUsed',
        'fallbackReason',
        'terminalStatus',
        'startedAt',
        'completedAt',
        'durationMs',
      ],
      'execution',
      errors
    );
    if (
      typeof execution.actualAccelerator !== 'string' ||
      !ACCELERATORS.has(execution.actualAccelerator as ComputeExecutionAccelerator)
    ) {
      errors.push('execution.actualAccelerator is invalid');
    }
    if (typeof execution.fallbackAllowed !== 'boolean') {
      errors.push('execution.fallbackAllowed must be boolean');
    }
    if (typeof execution.fallbackUsed !== 'boolean') {
      errors.push('execution.fallbackUsed must be boolean');
    }
    if (execution.fallbackUsed === true && !hasText(execution.fallbackReason)) {
      errors.push('execution.fallbackReason is required when fallback was used');
    }
    if (
      typeof execution.terminalStatus !== 'string' ||
      !TERMINAL_STATUSES.has(execution.terminalStatus as ComputeExecutionTerminalStatus)
    ) {
      errors.push('execution.terminalStatus is invalid');
    }
    const startedMs =
      typeof execution.startedAt === 'string' ? Date.parse(execution.startedAt) : NaN;
    const completedMs =
      typeof execution.completedAt === 'string' ? Date.parse(execution.completedAt) : NaN;
    if (!Number.isFinite(startedMs)) errors.push('execution.startedAt must be an ISO timestamp');
    if (!Number.isFinite(completedMs))
      errors.push('execution.completedAt must be an ISO timestamp');
    if (Number.isFinite(startedMs) && Number.isFinite(completedMs) && completedMs < startedMs) {
      errors.push('execution.completedAt must not precede startedAt');
    }
    if (!finiteNonNegative(execution.durationMs)) {
      errors.push('execution.durationMs must be a non-negative finite number');
    } else if (
      Number.isFinite(startedMs) &&
      Number.isFinite(completedMs) &&
      execution.durationMs !== completedMs - startedMs
    ) {
      errors.push('execution.durationMs must match the timestamp interval');
    }
    if (
      execution.fallbackUsed === true &&
      execution.fallbackAllowed === false &&
      execution.terminalStatus === 'succeeded'
    ) {
      errors.push('a forbidden fallback cannot produce a succeeded receipt');
    }
  }

  const quality = isRecord(value.quality) ? value.quality : null;
  if (!quality) {
    errors.push('quality must be an object');
  } else {
    rejectUnknownKeys(
      quality,
      ['metric', 'operator', 'threshold', 'reference', 'observedValue', 'passed'],
      'quality',
      errors
    );
    if (!hasText(quality.metric)) errors.push('quality.metric is required');
    const operatorValid =
      typeof quality.operator === 'string' &&
      QUALITY_OPERATORS.has(quality.operator as ComputeExecutionQualityOperator);
    if (!operatorValid) errors.push('quality.operator is invalid');
    if (!finiteNonNegative(quality.threshold)) {
      errors.push('quality.threshold must be a non-negative finite number');
    }
    if (
      typeof quality.reference !== 'string' ||
      !QUALITY_REFERENCES.has(quality.reference as ComputeExecutionQualityReference)
    ) {
      errors.push('quality.reference is invalid');
    }
    if (!finiteNonNegative(quality.observedValue)) {
      errors.push('quality.observedValue must be a non-negative finite number');
    }
    if (typeof quality.passed !== 'boolean') errors.push('quality.passed must be boolean');
    if (
      operatorValid &&
      finiteNonNegative(quality.threshold) &&
      finiteNonNegative(quality.observedValue) &&
      typeof quality.passed === 'boolean' &&
      quality.passed !==
        expectedQualityPass(
          quality.operator as ComputeExecutionQualityOperator,
          quality.observedValue,
          quality.threshold
        )
    ) {
      errors.push('quality.passed must match the observed comparison');
    }
    if (execution?.terminalStatus === 'succeeded' && quality.passed !== true) {
      errors.push('a succeeded receipt requires passing quality evidence');
    }
  }

  const cost = isRecord(value.cost) ? value.cost : null;
  if (!cost) {
    errors.push('cost must be an object');
  } else if (cost.measurementState === 'measured') {
    rejectUnknownKeys(cost, ['measurementState', 'currency', 'actualMinorUnits'], 'cost', errors);
    if (cost.currency !== 'USD') errors.push('measured cost.currency must be USD');
    if (!Number.isSafeInteger(cost.actualMinorUnits) || (cost.actualMinorUnits as number) < 0) {
      errors.push('measured cost.actualMinorUnits must be a non-negative safe integer');
    }
  } else if (cost.measurementState === 'not_measured') {
    rejectUnknownKeys(cost, ['measurementState', 'reason'], 'cost', errors);
    if (cost.reason !== 'meter_unavailable' && cost.reason !== 'not_applicable') {
      errors.push('not_measured cost.reason is invalid');
    }
  } else {
    errors.push('cost.measurementState is invalid');
  }

  const hardwareValidation = validatePortableHardwareReceiptMetadata(value.hardware);
  if (!hardwareValidation.valid) {
    errors.push(...hardwareValidation.errors.map((error) => `hardware: ${error}`));
  } else {
    const hardware = value.hardware as unknown as PortableHardwareReceiptMetadata;
    if (workUnit && hardware.provenance.sourceCompositionHash !== workUnit.sourceEvidence) {
      errors.push('hardware provenance must bind workUnit.sourceEvidence');
    }
    if (execution && hardware.device.accelerator !== execution.actualAccelerator) {
      errors.push('hardware accelerator must match execution.actualAccelerator');
    }
    if (
      execution?.actualAccelerator === 'gpu' &&
      !hardware.measuredResults.some(
        (measurement) => measurement.metric === 'gpu_execution_observed' && measurement.value === 1
      )
    ) {
      errors.push('GPU execution requires gpu_execution_observed=1 hardware evidence');
    }
    if (
      quality &&
      !hardware.measuredResults.some(
        (measurement) =>
          measurement.metric === quality.metric && measurement.value === quality.observedValue
      )
    ) {
      errors.push('hardware measurements must include the quality observation');
    }
  }

  if (typeof value.receiptId === 'string' && SHA256_LABEL.test(value.receiptId)) {
    try {
      const expected = hashReceiptBody(receiptBody(value as unknown as ComputeExecutionReceipt));
      if (value.receiptId !== expected) errors.push('receiptId does not match the canonical body');
    } catch (error) {
      errors.push(
        `receipt body cannot be canonicalized: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  return { valid: errors.length === 0, errors };
}
