/**
 * Pure, provider-neutral lifecycle receipts for sovereign compute jobs.
 *
 * These helpers prepare content-addressed job state and allocator CAS
 * projections. They do not persist idempotency records, reserve or release
 * capacity, start work, or prove that a transaction committed. A durable
 * adapter must atomically compare the expected job/allocation records and
 * persist every returned artifact before calling a mutation committed.
 * A durable store must never independently supersede an allocation; allocation
 * changes remain coupled to these job-state CAS projections. Reconciliation is
 * intentionally outside this V1 lifecycle rather than a hidden transition.
 */

import { createHash } from 'crypto';
import {
  computeWorkUnitDigest,
  validateComputeWorkUnitContract,
  type ComputeAccelerator,
  type ComputeWorkUnitContract,
} from '../compiler/ComputeWorkUnitCompiler';
import {
  authorizeComputeCapacityLeaseUse,
  computeCapacityAllocationEtag,
  validateComputeCapacityAllocationCursor,
  verifyComputeCapacityLeaseReceipt,
  verifyComputeExecutionEvidence,
  verifyComputePlacementPlan,
  type AuthorizeComputeCapacityLeaseUseInput,
  type ComputeCapacityAllocationCursor,
  type ComputeCapacityLane,
  type PreparedComputeCapacityLease,
  type VerifyComputeCapacityLeaseReceiptInput,
  type VerifyComputeExecutionEvidenceInput,
  type VerifyComputePlacementPlanInput,
} from './ComputePlacementEvidence';

export const COMPUTE_JOB_SCHEMA_VERSION = 'holoscript.compute-job.v1' as const;
export const COMPUTE_JOB_TRANSITION_SCHEMA_VERSION =
  'holoscript.compute-job-transition.v1' as const;
export const COMPUTE_ALLOCATOR_COMMIT_SCHEMA_VERSION =
  'holoscript.compute-allocator-commit.v1' as const;
export const COMPUTE_JOB_REQUEST_SCHEMA_VERSION = 'holoscript.compute-job-request.v1' as const;

export type ComputeJobState =
  | 'preflighted'
  | 'queued'
  | 'leased'
  | 'starting'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'cancelled';
export type ComputeJobTerminalState = 'succeeded' | 'failed' | 'cancelled';
export type ComputeJobTransitionAction =
  | 'queue'
  | 'acquire_lease'
  | 'start'
  | 'mark_running'
  | 'succeed'
  | 'fail'
  | 'cancel';
export type ComputeJobFailureReason =
  | 'queue_rejected'
  | 'lease_unavailable'
  | 'lease_expired'
  | 'start_failed'
  | 'executor_lost'
  | 'execution_failed'
  | 'deadline_exceeded'
  | 'receipt_unavailable'
  | 'system_failed';
export type ComputeJobCancellationReason =
  | 'user_cancelled'
  | 'policy_cancelled'
  | 'system_cancelled';
export type ComputeJobReasonCode =
  | 'execution_succeeded'
  | ComputeJobFailureReason
  | ComputeJobCancellationReason;
export type ComputeJobExecutionUnobservedReason =
  | 'executor_lost'
  | 'lease_expired'
  | 'receipt_unavailable';
export type ComputeJobCompletionDisposition =
  | 'work_unit_succeeded'
  | 'terminal_execution_observed'
  | 'execution_not_started'
  | 'execution_unobserved';
export type ComputeAllocatorCommitOperation = 'acquire' | 'release';

export interface ComputeJobRequest {
  readonly schemaVersion: typeof COMPUTE_JOB_REQUEST_SCHEMA_VERSION;
  readonly operation: 'create' | 'transition';
  readonly principalDigest: string;
  readonly jobId: string;
  readonly attempt: number;
  readonly expectedJobReceiptId?: string;
  readonly expectedJobVersion?: number;
  readonly action?: ComputeJobTransitionAction;
  readonly reasonCode?: ComputeJobReasonCode;
  readonly executionUnobservedReason?: ComputeJobExecutionUnobservedReason;
  readonly evidenceReceiptIds: readonly string[];
  readonly expectedAllocationEtag?: string;
}

export interface ComputeJobRequestBinding {
  readonly idempotencyKeyHash: string;
  readonly requestHash: string;
}

export interface ComputeJobWorkUnitBinding {
  readonly digest: string;
  readonly sourceEvidence: string;
}

export interface ComputeJobPlacementBinding {
  readonly capacitySnapshotReceiptId: string;
  readonly bridgeAdmissionReceiptId?: string;
  readonly planReceiptId: string;
}

export interface ComputeJobLeaseBinding {
  readonly receiptId: string;
  readonly holderDigest: string;
  readonly capacityRef: string;
  readonly lane: ComputeCapacityLane;
  readonly accelerator: ComputeAccelerator;
  readonly issuedAt: string;
  readonly expiresAt: string;
  readonly fencingEpoch: number;
  readonly fencingTokenHash: string;
}

export type ComputeJobTerminalEvidence =
  | {
      readonly kind: 'attested_execution';
      readonly executionReceiptId: string;
      readonly executionAttestationReceiptId: string;
    }
  | {
      readonly kind: 'execution_not_started';
      readonly reasonCode: ComputeJobFailureReason | ComputeJobCancellationReason;
    }
  | {
      readonly kind: 'execution_unobserved';
      readonly reasonCode: ComputeJobExecutionUnobservedReason;
    };

export interface ComputeJobTerminal {
  readonly state: ComputeJobTerminalState;
  readonly at: string;
  readonly reasonCode: ComputeJobReasonCode;
  readonly completionDisposition: ComputeJobCompletionDisposition;
  readonly evidence: ComputeJobTerminalEvidence;
}

/** A content-addressed current-state receipt. receiptId is also the durable CAS ETag. */
export interface ComputeJobReceipt {
  readonly schemaVersion: typeof COMPUTE_JOB_SCHEMA_VERSION;
  readonly verificationScope: 'structural_only';
  readonly receiptId: string;
  readonly principalDigest: string;
  readonly jobId: string;
  readonly attempt: number;
  readonly version: number;
  readonly previousJobReceiptId?: string;
  readonly state: ComputeJobState;
  readonly createdAt: string;
  readonly updatedAt: string;
  /** Null preserves WorkUnit V1 deadlineMs=0 as no deadline constraint. */
  readonly deadlineAt: string | null;
  readonly workUnit: ComputeJobWorkUnitBinding;
  readonly placement: ComputeJobPlacementBinding;
  readonly request: ComputeJobRequestBinding;
  readonly lease?: ComputeJobLeaseBinding;
  readonly executionStartedAt?: string;
  readonly terminal?: ComputeJobTerminal;
}

export interface ComputeJobStateReference {
  readonly state: ComputeJobState;
  readonly version: number;
  readonly receiptId: string;
}

export interface ComputeJobTransitionReceipt {
  readonly schemaVersion: typeof COMPUTE_JOB_TRANSITION_SCHEMA_VERSION;
  readonly verificationScope: 'structural_only';
  readonly receiptId: string;
  readonly principalDigest: string;
  readonly jobId: string;
  readonly attempt: number;
  readonly workUnitDigest: string;
  readonly action: ComputeJobTransitionAction;
  readonly from: ComputeJobStateReference;
  readonly to: ComputeJobStateReference;
  readonly request: ComputeJobRequestBinding;
  readonly transitionedAt: string;
  readonly evidenceReceiptIds: readonly string[];
  readonly allocatorCommitReceiptId?: string;
}

/**
 * A prepared allocator CAS projection. Content addressing proves structure,
 * not that a durable allocator committed it.
 */
export interface ComputeAllocatorCommitReceipt {
  readonly schemaVersion: typeof COMPUTE_ALLOCATOR_COMMIT_SCHEMA_VERSION;
  readonly verificationScope: 'prepared_cas';
  readonly receiptId: string;
  readonly operation: ComputeAllocatorCommitOperation;
  readonly principalDigest: string;
  readonly jobId: string;
  readonly attempt: number;
  readonly fromJobReceiptId: string;
  readonly toJobReceiptId: string;
  readonly leaseReceiptId: string;
  readonly capacityRef: string;
  readonly fencingEpoch: number;
  readonly expectedAllocation: ComputeCapacityAllocationCursor;
  readonly nextAllocation: ComputeCapacityAllocationCursor;
  readonly preparedAt: string;
}

export interface PrepareComputeJobInput {
  readonly principalDigest: string;
  readonly jobId: string;
  readonly attempt: number;
  readonly workUnit: ComputeWorkUnitContract;
  readonly placementVerification: VerifyComputePlacementPlanInput;
  readonly preparedAt: string;
  readonly idempotencyKey: string | Uint8Array;
}

export interface PreparedComputeJob {
  readonly job: ComputeJobReceipt;
  readonly requestBinding: ComputeJobRequestBinding;
}

interface PrepareComputeJobTransitionBase {
  readonly expectedJob: ComputeJobReceipt;
  readonly transitionedAt: string;
  readonly idempotencyKey: string | Uint8Array;
}

export interface PrepareQueueComputeJobInput extends PrepareComputeJobTransitionBase {
  readonly action: 'queue';
  readonly placementVerification: VerifyComputePlacementPlanInput;
}

export interface PrepareLeaseComputeJobInput extends PrepareComputeJobTransitionBase {
  readonly action: 'acquire_lease';
  readonly preparedLease: PreparedComputeCapacityLease;
  readonly leaseVerification: VerifyComputeCapacityLeaseReceiptInput;
}

export interface PrepareStartComputeJobInput extends PrepareComputeJobTransitionBase {
  readonly action: 'start';
  readonly leaseAuthorization: AuthorizeComputeCapacityLeaseUseInput;
}

export interface PrepareRunningComputeJobInput extends PrepareComputeJobTransitionBase {
  readonly action: 'mark_running';
  readonly leaseAuthorization: AuthorizeComputeCapacityLeaseUseInput;
}

export interface PrepareSucceededComputeJobInput extends PrepareComputeJobTransitionBase {
  readonly action: 'succeed';
  readonly executionVerification: VerifyComputeExecutionEvidenceInput;
  readonly allocationCursor: ComputeCapacityAllocationCursor;
}

export interface PrepareFailedComputeJobInput extends PrepareComputeJobTransitionBase {
  readonly action: 'fail';
  readonly reasonCode: ComputeJobFailureReason;
  readonly executionVerification?: VerifyComputeExecutionEvidenceInput;
  readonly executionUnobservedReason?: ComputeJobExecutionUnobservedReason;
  readonly allocationCursor?: ComputeCapacityAllocationCursor;
}

export interface PrepareCancelledComputeJobInput extends PrepareComputeJobTransitionBase {
  readonly action: 'cancel';
  readonly reasonCode: ComputeJobCancellationReason;
  readonly executionVerification?: VerifyComputeExecutionEvidenceInput;
  readonly executionUnobservedReason?: ComputeJobExecutionUnobservedReason;
  readonly allocationCursor?: ComputeCapacityAllocationCursor;
}

export type PrepareComputeJobTransitionInput =
  | PrepareQueueComputeJobInput
  | PrepareLeaseComputeJobInput
  | PrepareStartComputeJobInput
  | PrepareRunningComputeJobInput
  | PrepareSucceededComputeJobInput
  | PrepareFailedComputeJobInput
  | PrepareCancelledComputeJobInput;

export interface PreparedComputeJobTransition {
  readonly expectedJob: ComputeJobReceipt;
  readonly nextJob: ComputeJobReceipt;
  readonly transition: ComputeJobTransitionReceipt;
  readonly allocatorCommit?: ComputeAllocatorCommitReceipt;
}

export interface VerifyComputeJobTransitionInput {
  readonly expectedJob: ComputeJobReceipt;
  readonly nextJob: ComputeJobReceipt;
  readonly transition: ComputeJobTransitionReceipt;
  readonly allocatorCommit?: ComputeAllocatorCommitReceipt;
}

export interface ComputeJobLifecycleValidation {
  readonly valid: boolean;
  readonly errors: readonly string[];
}

const SHA256_LABEL = /^sha256:[a-f0-9]{64}$/;
const MAX_IDEMPOTENCY_KEY_BYTES = 512;
const MAX_CANONICAL_DATE_MILLISECONDS = 8_640_000_000_000_000;
const STATES = new Set<ComputeJobState>([
  'preflighted',
  'queued',
  'leased',
  'starting',
  'running',
  'succeeded',
  'failed',
  'cancelled',
]);
const TERMINAL_STATES = new Set<ComputeJobTerminalState>(['succeeded', 'failed', 'cancelled']);
const ACTIONS = new Set<ComputeJobTransitionAction>([
  'queue',
  'acquire_lease',
  'start',
  'mark_running',
  'succeed',
  'fail',
  'cancel',
]);
const FAILURE_REASONS = new Set<ComputeJobFailureReason>([
  'queue_rejected',
  'lease_unavailable',
  'lease_expired',
  'start_failed',
  'executor_lost',
  'execution_failed',
  'deadline_exceeded',
  'receipt_unavailable',
  'system_failed',
]);
const FAILURE_REASONS_BY_STATE: Readonly<
  Record<Exclude<ComputeJobState, ComputeJobTerminalState>, ReadonlySet<ComputeJobFailureReason>>
> = {
  preflighted: new Set<ComputeJobFailureReason>([
    'queue_rejected',
    'system_failed',
    'deadline_exceeded',
  ]),
  queued: new Set<ComputeJobFailureReason>([
    'lease_unavailable',
    'deadline_exceeded',
    'system_failed',
  ]),
  leased: new Set<ComputeJobFailureReason>([
    'start_failed',
    'lease_expired',
    'deadline_exceeded',
    'system_failed',
  ]),
  starting: new Set<ComputeJobFailureReason>([
    'start_failed',
    'executor_lost',
    'lease_expired',
    'deadline_exceeded',
    'system_failed',
  ]),
  running: new Set<ComputeJobFailureReason>([
    'executor_lost',
    'execution_failed',
    'deadline_exceeded',
    'receipt_unavailable',
    'lease_expired',
    'system_failed',
  ]),
};
const CANCELLATION_REASONS = new Set<ComputeJobCancellationReason>([
  'user_cancelled',
  'policy_cancelled',
  'system_cancelled',
]);
const UNOBSERVED_REASONS = new Set<ComputeJobExecutionUnobservedReason>([
  'executor_lost',
  'lease_expired',
  'receipt_unavailable',
]);
const LANES = new Set<ComputeCapacityLane>(['local_device', 'owned_fleet', 'managed_bridge']);
const ACCELERATORS = new Set<ComputeAccelerator>(['cpu', 'gpu', 'npu', 'other']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function safeNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function canonicalize(value: unknown): unknown {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value))
      throw new TypeError('lifecycle receipt cannot contain non-finite numbers');
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
  throw new TypeError(`lifecycle receipt cannot contain ${typeof value}`);
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function sameOptionalCanonical(left: unknown, right: unknown): boolean {
  if (left === undefined || right === undefined) return left === right;
  return canonicalJson(left) === canonicalJson(right);
}

function sha256Value(value: unknown): string {
  return `sha256:${createHash('sha256').update(canonicalJson(value)).digest('hex')}`;
}

function sha256Bytes(value: string | Uint8Array): string {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function withoutReceiptId<T extends { readonly receiptId: string }>(
  value: T
): Omit<T, 'receiptId'> {
  const { receiptId: _receiptId, ...body } = value;
  return body;
}

function isCanonicalIso(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value;
}

function deriveDeadlineAt(preparedAt: string, deadlineMs: number): string | null {
  if (!isCanonicalIso(preparedAt)) {
    throw new TypeError('preparedAt must be a canonical ISO timestamp');
  }
  if (!Number.isSafeInteger(deadlineMs) || deadlineMs < 0) {
    throw new TypeError('compute job deadlineMs must be a non-negative safe integer');
  }
  if (deadlineMs === 0) return null;

  const deadlineTimestamp = Date.parse(preparedAt) + deadlineMs;
  if (
    !Number.isSafeInteger(deadlineTimestamp) ||
    deadlineTimestamp > MAX_CANONICAL_DATE_MILLISECONDS
  ) {
    throw new TypeError('compute job deadline overflows the canonical ISO timestamp range');
  }
  return new Date(deadlineTimestamp).toISOString();
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

function validateSha(value: unknown, path: string, errors: string[]): void {
  if (typeof value !== 'string' || !SHA256_LABEL.test(value)) {
    errors.push(`${path} must be a sha256 label`);
  }
}

function sortedUniqueReceiptIds(values: readonly string[]): string[] {
  const result = [...new Set(values)].sort();
  for (const value of result) {
    if (!SHA256_LABEL.test(value))
      throw new TypeError('evidence receipt IDs must be sha256 labels');
  }
  return result;
}

function validateRequestBinding(
  value: unknown,
  path: string,
  errors: string[]
): value is ComputeJobRequestBinding {
  if (!isRecord(value)) {
    errors.push(`${path} must be an object`);
    return false;
  }
  rejectUnknownKeys(value, ['idempotencyKeyHash', 'requestHash'], path, errors);
  validateSha(value.idempotencyKeyHash, `${path}.idempotencyKeyHash`, errors);
  validateSha(value.requestHash, `${path}.requestHash`, errors);
  return true;
}

function validateComputeJobRequest(value: unknown): ComputeJobLifecycleValidation {
  const errors: string[] = [];
  if (!isRecord(value)) return { valid: false, errors: ['job request must be an object'] };
  rejectUnknownKeys(
    value,
    [
      'schemaVersion',
      'operation',
      'principalDigest',
      'jobId',
      'attempt',
      'expectedJobReceiptId',
      'expectedJobVersion',
      'action',
      'reasonCode',
      'executionUnobservedReason',
      'evidenceReceiptIds',
      'expectedAllocationEtag',
    ],
    'request',
    errors
  );
  if (value.schemaVersion !== COMPUTE_JOB_REQUEST_SCHEMA_VERSION) {
    errors.push(`request.schemaVersion must be ${COMPUTE_JOB_REQUEST_SCHEMA_VERSION}`);
  }
  if (value.operation !== 'create' && value.operation !== 'transition') {
    errors.push('request.operation is invalid');
  }
  validateSha(value.principalDigest, 'request.principalDigest', errors);
  validateSha(value.jobId, 'request.jobId', errors);
  if (!Number.isSafeInteger(value.attempt) || (value.attempt as number) < 1) {
    errors.push('request.attempt must be a positive safe integer');
  }
  if (!Array.isArray(value.evidenceReceiptIds)) {
    errors.push('request.evidenceReceiptIds must be an array');
  } else {
    const receipts = value.evidenceReceiptIds;
    if (receipts.some((entry) => typeof entry !== 'string' || !SHA256_LABEL.test(entry))) {
      errors.push('request.evidenceReceiptIds must contain sha256 labels');
    }
    if (
      new Set(receipts).size !== receipts.length ||
      [...receipts].sort().some((v, i) => v !== receipts[i])
    ) {
      errors.push('request.evidenceReceiptIds must be sorted and unique');
    }
  }
  if (value.operation === 'create') {
    for (const key of [
      'expectedJobReceiptId',
      'expectedJobVersion',
      'action',
      'reasonCode',
      'executionUnobservedReason',
      'expectedAllocationEtag',
    ]) {
      if (value[key] !== undefined) errors.push(`request.${key} is not allowed for create`);
    }
  } else {
    validateSha(value.expectedJobReceiptId, 'request.expectedJobReceiptId', errors);
    if (!safeNonNegativeInteger(value.expectedJobVersion)) {
      errors.push('request.expectedJobVersion must be a non-negative safe integer');
    }
    if (
      typeof value.action !== 'string' ||
      !ACTIONS.has(value.action as ComputeJobTransitionAction)
    ) {
      errors.push('request.action is invalid');
    }
    const action = value.action as ComputeJobTransitionAction;
    if (action === 'fail') {
      if (
        typeof value.reasonCode !== 'string' ||
        !FAILURE_REASONS.has(value.reasonCode as ComputeJobFailureReason)
      ) {
        errors.push('request.reasonCode must be a failure reason for fail');
      }
    } else if (action === 'cancel') {
      if (
        typeof value.reasonCode !== 'string' ||
        !CANCELLATION_REASONS.has(value.reasonCode as ComputeJobCancellationReason)
      ) {
        errors.push('request.reasonCode must be a cancellation reason for cancel');
      }
    } else if (action === 'succeed') {
      if (value.reasonCode !== 'execution_succeeded') {
        errors.push('request.reasonCode must be execution_succeeded for succeed');
      }
    } else if (value.reasonCode !== undefined) {
      errors.push('request.reasonCode is only allowed for terminal transitions');
    }
    if (value.executionUnobservedReason !== undefined) {
      if (action !== 'fail' && action !== 'cancel') {
        errors.push('request.executionUnobservedReason is only allowed for fail or cancel');
      }
      if (
        typeof value.executionUnobservedReason !== 'string' ||
        !UNOBSERVED_REASONS.has(
          value.executionUnobservedReason as ComputeJobExecutionUnobservedReason
        )
      ) {
        errors.push('request.executionUnobservedReason is invalid');
      }
    }
    if (value.expectedAllocationEtag !== undefined) {
      validateSha(value.expectedAllocationEtag, 'request.expectedAllocationEtag', errors);
    }
  }
  return { valid: errors.length === 0, errors };
}

/** Hash an opaque key without serializing it into lifecycle receipts. */
export function computeJobIdempotencyKeyHash(key: string | Uint8Array): string {
  const bytes = typeof key === 'string' ? Buffer.from(key, 'utf8') : Buffer.from(key);
  if (bytes.byteLength < 1 || bytes.byteLength > MAX_IDEMPOTENCY_KEY_BYTES) {
    throw new TypeError(`idempotency key must contain 1-${MAX_IDEMPOTENCY_KEY_BYTES} bytes`);
  }
  return sha256Bytes(
    Buffer.concat([Buffer.from('holoscript.compute-job-idempotency.v1\0'), bytes])
  );
}

/** Hash only stable semantic request fields; server-selected timestamps are deliberately absent. */
export function computeJobRequestHash(request: ComputeJobRequest): string {
  const validation = validateComputeJobRequest(request);
  if (!validation.valid)
    throw new TypeError(`Invalid compute job request: ${validation.errors.join('; ')}`);
  return sha256Value({ domain: COMPUTE_JOB_REQUEST_SCHEMA_VERSION, request });
}

function makeRequestBinding(
  request: ComputeJobRequest,
  idempotencyKey: string | Uint8Array
): ComputeJobRequestBinding {
  return {
    idempotencyKeyHash: computeJobIdempotencyKeyHash(idempotencyKey),
    requestHash: computeJobRequestHash(request),
  };
}

function assembleJobReceipt(body: Omit<ComputeJobReceipt, 'receiptId'>): ComputeJobReceipt {
  const receipt: ComputeJobReceipt = { ...body, receiptId: sha256Value(body) };
  const validation = validateComputeJobReceipt(receipt);
  if (!validation.valid)
    throw new TypeError(`Invalid compute job receipt: ${validation.errors.join('; ')}`);
  return receipt;
}

function validateWorkUnitBinding(value: unknown, path: string, errors: string[]): void {
  if (!isRecord(value)) {
    errors.push(`${path} must be an object`);
    return;
  }
  rejectUnknownKeys(value, ['digest', 'sourceEvidence'], path, errors);
  validateSha(value.digest, `${path}.digest`, errors);
  validateSha(value.sourceEvidence, `${path}.sourceEvidence`, errors);
}

function validatePlacementBinding(value: unknown, path: string, errors: string[]): void {
  if (!isRecord(value)) {
    errors.push(`${path} must be an object`);
    return;
  }
  rejectUnknownKeys(
    value,
    ['capacitySnapshotReceiptId', 'bridgeAdmissionReceiptId', 'planReceiptId'],
    path,
    errors
  );
  validateSha(value.capacitySnapshotReceiptId, `${path}.capacitySnapshotReceiptId`, errors);
  validateSha(value.planReceiptId, `${path}.planReceiptId`, errors);
  if (value.bridgeAdmissionReceiptId !== undefined) {
    validateSha(value.bridgeAdmissionReceiptId, `${path}.bridgeAdmissionReceiptId`, errors);
  }
}

function validateLeaseBinding(value: unknown, path: string, errors: string[]): void {
  if (!isRecord(value)) {
    errors.push(`${path} must be an object`);
    return;
  }
  rejectUnknownKeys(
    value,
    [
      'receiptId',
      'holderDigest',
      'capacityRef',
      'lane',
      'accelerator',
      'issuedAt',
      'expiresAt',
      'fencingEpoch',
      'fencingTokenHash',
    ],
    path,
    errors
  );
  for (const key of ['receiptId', 'holderDigest', 'capacityRef', 'fencingTokenHash'] as const) {
    validateSha(value[key], `${path}.${key}`, errors);
  }
  if (typeof value.lane !== 'string' || !LANES.has(value.lane as ComputeCapacityLane)) {
    errors.push(`${path}.lane is invalid`);
  }
  if (
    typeof value.accelerator !== 'string' ||
    !ACCELERATORS.has(value.accelerator as ComputeAccelerator)
  ) {
    errors.push(`${path}.accelerator is invalid`);
  }
  if (!isCanonicalIso(value.issuedAt))
    errors.push(`${path}.issuedAt must be a canonical ISO timestamp`);
  if (!isCanonicalIso(value.expiresAt))
    errors.push(`${path}.expiresAt must be a canonical ISO timestamp`);
  if (
    isCanonicalIso(value.issuedAt) &&
    isCanonicalIso(value.expiresAt) &&
    Date.parse(value.expiresAt) <= Date.parse(value.issuedAt)
  ) {
    errors.push(`${path}.expiresAt must follow issuedAt`);
  }
  if (!Number.isSafeInteger(value.fencingEpoch) || (value.fencingEpoch as number) < 1) {
    errors.push(`${path}.fencingEpoch must be a positive safe integer`);
  }
}

function validateTerminal(value: unknown, job: Record<string, unknown>, errors: string[]): void {
  if (!isRecord(value)) {
    errors.push('job.terminal must be an object');
    return;
  }
  rejectUnknownKeys(
    value,
    ['state', 'at', 'reasonCode', 'completionDisposition', 'evidence'],
    'job.terminal',
    errors
  );
  if (
    typeof value.state !== 'string' ||
    !TERMINAL_STATES.has(value.state as ComputeJobTerminalState)
  ) {
    errors.push('job.terminal.state is invalid');
  }
  if (value.state !== job.state) errors.push('job.terminal.state must match job.state');
  if (!isCanonicalIso(value.at)) errors.push('job.terminal.at must be a canonical ISO timestamp');
  if (value.at !== job.updatedAt) errors.push('job.terminal.at must match job.updatedAt');
  if (!isRecord(value.evidence)) {
    errors.push('job.terminal.evidence must be an object');
    return;
  }
  const evidence = value.evidence;
  if (evidence.kind === 'attested_execution') {
    rejectUnknownKeys(
      evidence,
      ['kind', 'executionReceiptId', 'executionAttestationReceiptId'],
      'job.terminal.evidence',
      errors
    );
    validateSha(evidence.executionReceiptId, 'job.terminal.evidence.executionReceiptId', errors);
    validateSha(
      evidence.executionAttestationReceiptId,
      'job.terminal.evidence.executionAttestationReceiptId',
      errors
    );
    const expectedDisposition =
      value.state === 'succeeded' ? 'work_unit_succeeded' : 'terminal_execution_observed';
    if (value.completionDisposition !== expectedDisposition) {
      errors.push(`job.terminal.completionDisposition must be ${expectedDisposition}`);
    }
    if (job.executionStartedAt === undefined) {
      errors.push('attested terminal execution requires executionStartedAt');
    }
    if (job.lease === undefined) {
      errors.push('attested terminal execution requires a complete lease binding');
    }
  } else if (evidence.kind === 'execution_not_started') {
    rejectUnknownKeys(evidence, ['kind', 'reasonCode'], 'job.terminal.evidence', errors);
    if (
      typeof evidence.reasonCode !== 'string' ||
      (!FAILURE_REASONS.has(evidence.reasonCode as ComputeJobFailureReason) &&
        !CANCELLATION_REASONS.has(evidence.reasonCode as ComputeJobCancellationReason))
    ) {
      errors.push('job.terminal.evidence.reasonCode is invalid');
    }
    if (value.completionDisposition !== 'execution_not_started') {
      errors.push('job.terminal.completionDisposition must be execution_not_started');
    }
    if (job.executionStartedAt !== undefined) {
      errors.push('execution_not_started is forbidden after executionStartedAt');
    }
    if (evidence.reasonCode !== value.reasonCode) {
      errors.push('execution_not_started reasonCode must match the terminal reasonCode');
    }
  } else if (evidence.kind === 'execution_unobserved') {
    rejectUnknownKeys(evidence, ['kind', 'reasonCode'], 'job.terminal.evidence', errors);
    if (
      typeof evidence.reasonCode !== 'string' ||
      !UNOBSERVED_REASONS.has(evidence.reasonCode as ComputeJobExecutionUnobservedReason)
    ) {
      errors.push('job.terminal.evidence.reasonCode is invalid');
    }
    if (value.completionDisposition !== 'execution_unobserved') {
      errors.push('job.terminal.completionDisposition must be execution_unobserved');
    }
    if (job.executionStartedAt === undefined) {
      errors.push('execution_unobserved requires executionStartedAt');
    }
    if (job.lease === undefined) {
      errors.push('execution_unobserved requires a complete lease binding');
    }
  } else {
    errors.push('job.terminal.evidence.kind is invalid');
  }
  if (value.state === 'succeeded') {
    if (value.reasonCode !== 'execution_succeeded') {
      errors.push('succeeded job reasonCode must be execution_succeeded');
    }
    if (evidence.kind !== 'attested_execution') {
      errors.push('succeeded job requires attested execution evidence');
    }
  } else if (value.state === 'failed') {
    if (
      typeof value.reasonCode !== 'string' ||
      !FAILURE_REASONS.has(value.reasonCode as ComputeJobFailureReason)
    ) {
      errors.push('failed job reasonCode is invalid');
    }
  } else if (value.state === 'cancelled') {
    if (
      typeof value.reasonCode !== 'string' ||
      !CANCELLATION_REASONS.has(value.reasonCode as ComputeJobCancellationReason)
    ) {
      errors.push('cancelled job reasonCode is invalid');
    }
  }
}

export function validateComputeJobReceipt(value: unknown): ComputeJobLifecycleValidation {
  const errors: string[] = [];
  if (!isRecord(value)) return { valid: false, errors: ['compute job receipt must be an object'] };
  rejectUnknownKeys(
    value,
    [
      'schemaVersion',
      'verificationScope',
      'receiptId',
      'principalDigest',
      'jobId',
      'attempt',
      'version',
      'previousJobReceiptId',
      'state',
      'createdAt',
      'updatedAt',
      'deadlineAt',
      'workUnit',
      'placement',
      'request',
      'lease',
      'executionStartedAt',
      'terminal',
    ],
    'job',
    errors
  );
  if (value.schemaVersion !== COMPUTE_JOB_SCHEMA_VERSION) {
    errors.push(`job.schemaVersion must be ${COMPUTE_JOB_SCHEMA_VERSION}`);
  }
  if (value.verificationScope !== 'structural_only') {
    errors.push('job.verificationScope must be structural_only');
  }
  for (const key of ['receiptId', 'principalDigest', 'jobId'] as const) {
    validateSha(value[key], `job.${key}`, errors);
  }
  if (!Number.isSafeInteger(value.attempt) || (value.attempt as number) < 1) {
    errors.push('job.attempt must be a positive safe integer');
  }
  if (!safeNonNegativeInteger(value.version)) {
    errors.push('job.version must be a non-negative safe integer');
  }
  if (value.version === 0) {
    if (value.previousJobReceiptId !== undefined) {
      errors.push('initial job cannot have previousJobReceiptId');
    }
    if (value.state !== 'preflighted') {
      errors.push('initial job state must be preflighted');
    }
    if (value.createdAt !== value.updatedAt) {
      errors.push('initial job createdAt and updatedAt must match');
    }
  } else {
    validateSha(value.previousJobReceiptId, 'job.previousJobReceiptId', errors);
  }
  if (typeof value.state !== 'string' || !STATES.has(value.state as ComputeJobState)) {
    errors.push('job.state is invalid');
  }
  if (value.state === 'preflighted' && value.version !== 0) {
    errors.push('preflighted job must be the initial version');
  }
  if (!isCanonicalIso(value.createdAt))
    errors.push('job.createdAt must be a canonical ISO timestamp');
  if (!isCanonicalIso(value.updatedAt))
    errors.push('job.updatedAt must be a canonical ISO timestamp');
  if (value.deadlineAt !== null && !isCanonicalIso(value.deadlineAt)) {
    errors.push('job.deadlineAt must be null or a canonical ISO timestamp');
  }
  if (
    isCanonicalIso(value.createdAt) &&
    isCanonicalIso(value.updatedAt) &&
    Date.parse(value.updatedAt) < Date.parse(value.createdAt)
  ) {
    errors.push('job.updatedAt must not precede createdAt');
  }
  if (
    isCanonicalIso(value.createdAt) &&
    isCanonicalIso(value.deadlineAt) &&
    Date.parse(value.deadlineAt) <= Date.parse(value.createdAt)
  ) {
    errors.push('job.deadlineAt must follow createdAt');
  }
  validateWorkUnitBinding(value.workUnit, 'job.workUnit', errors);
  validatePlacementBinding(value.placement, 'job.placement', errors);
  validateRequestBinding(value.request, 'job.request', errors);

  const state = value.state as ComputeJobState;
  if (value.lease !== undefined) validateLeaseBinding(value.lease, 'job.lease', errors);
  if (state === 'leased' || state === 'starting' || state === 'running') {
    if (value.lease === undefined) errors.push(`${state} job requires a complete lease binding`);
  }
  if ((state === 'preflighted' || state === 'queued') && value.lease !== undefined) {
    errors.push(`${state} job cannot have a lease binding`);
  }
  if (value.executionStartedAt !== undefined && !isCanonicalIso(value.executionStartedAt)) {
    errors.push('job.executionStartedAt must be a canonical ISO timestamp');
  }
  if (value.executionStartedAt !== undefined && value.lease === undefined) {
    errors.push('job.executionStartedAt requires a complete lease binding');
  }
  if (state === 'running' && value.executionStartedAt === undefined) {
    errors.push('running job requires executionStartedAt');
  }
  if (
    (state === 'preflighted' || state === 'queued' || state === 'leased' || state === 'starting') &&
    value.executionStartedAt !== undefined
  ) {
    errors.push(`${state} job cannot have executionStartedAt`);
  }
  if (
    value.executionStartedAt !== undefined &&
    isCanonicalIso(value.executionStartedAt) &&
    isCanonicalIso(value.updatedAt) &&
    Date.parse(value.executionStartedAt) > Date.parse(value.updatedAt)
  ) {
    errors.push('job.executionStartedAt must not follow updatedAt');
  }
  if (TERMINAL_STATES.has(state as ComputeJobTerminalState)) {
    validateTerminal(value.terminal, value, errors);
  } else if (value.terminal !== undefined) {
    errors.push('non-terminal job cannot have terminal evidence');
  }
  if (typeof value.receiptId === 'string' && SHA256_LABEL.test(value.receiptId)) {
    try {
      const expected = sha256Value(withoutReceiptId(value as unknown as ComputeJobReceipt));
      if (expected !== value.receiptId) errors.push('job.receiptId does not match canonical body');
    } catch (error) {
      errors.push(`job cannot be canonicalized: ${String(error)}`);
    }
  }
  return { valid: errors.length === 0, errors };
}

function placementReceiptIds(input: VerifyComputePlacementPlanInput): string[] {
  return sortedUniqueReceiptIds([
    input.capacitySnapshot.receiptId,
    input.plan.receiptId,
    ...(input.bridgeAdmission ? [input.bridgeAdmission.receiptId] : []),
  ]);
}

function assertPlacementMatchesJob(
  job: ComputeJobReceipt,
  verification: VerifyComputePlacementPlanInput
): void {
  const workUnitValidation = validateComputeWorkUnitContract(verification.workUnit);
  if (!workUnitValidation.valid) {
    throw new TypeError(`Invalid compute WorkUnit: ${workUnitValidation.errors.join('; ')}`);
  }
  if (
    job.principalDigest !== verification.principalDigest ||
    job.workUnit.digest !== computeWorkUnitDigest(verification.workUnit) ||
    job.workUnit.sourceEvidence !== verification.workUnit.source_evidence ||
    job.placement.capacitySnapshotReceiptId !== verification.capacitySnapshot.receiptId ||
    job.placement.planReceiptId !== verification.plan.receiptId ||
    job.placement.bridgeAdmissionReceiptId !== verification.bridgeAdmission?.receiptId
  ) {
    throw new TypeError('placement evidence does not bind the expected job');
  }
}

function leaseBindingFrom(input: VerifyComputeCapacityLeaseReceiptInput): ComputeJobLeaseBinding {
  const lease = input.lease;
  return {
    receiptId: lease.receiptId,
    holderDigest: lease.holderDigest,
    capacityRef: lease.capacityRef,
    lane: lease.lane,
    accelerator: lease.accelerator,
    issuedAt: lease.issuedAt,
    expiresAt: lease.expiresAt,
    fencingEpoch: lease.fencingEpoch,
    fencingTokenHash: lease.fencingTokenHash,
  };
}

function assertLeaseMatchesJob(
  job: ComputeJobReceipt,
  verification: VerifyComputeCapacityLeaseReceiptInput
): void {
  assertPlacementMatchesJob(job, {
    principalDigest: verification.principalDigest,
    workUnit: verification.workUnit,
    capacitySnapshot: verification.capacitySnapshot,
    bridgeAdmission: verification.bridgeAdmission,
    plan: verification.plan,
    checkedAt: verification.plan.checkedAt,
    verifiedAt: verification.at,
    trustAnchors: verification.trustAnchors,
  });
  if (
    job.jobId !== verification.jobId ||
    job.attempt !== verification.attempt ||
    verification.lease.principalDigest !== job.principalDigest
  ) {
    throw new TypeError('lease evidence does not bind the expected job attempt');
  }
  if (job.lease && canonicalJson(job.lease) !== canonicalJson(leaseBindingFrom(verification))) {
    throw new TypeError('lease evidence does not match the job lease binding');
  }
}

function assertExecutionMatchesJob(
  job: ComputeJobReceipt,
  verification: VerifyComputeExecutionEvidenceInput
): void {
  assertLeaseMatchesJob(job, {
    principalDigest: verification.principalDigest,
    jobId: verification.jobId,
    attempt: verification.attempt,
    holderDigest: verification.holderDigest,
    workUnit: verification.workUnit,
    capacitySnapshot: verification.capacitySnapshot,
    bridgeAdmission: verification.bridgeAdmission,
    plan: verification.plan,
    lease: verification.lease,
    at: verification.executionReceipt.execution.startedAt,
    trustAnchors: verification.trustAnchors,
  });
  if (
    !job.lease ||
    canonicalJson(job.lease) !==
      canonicalJson(
        leaseBindingFrom({
          principalDigest: verification.principalDigest,
          jobId: verification.jobId,
          attempt: verification.attempt,
          holderDigest: verification.holderDigest,
          workUnit: verification.workUnit,
          capacitySnapshot: verification.capacitySnapshot,
          bridgeAdmission: verification.bridgeAdmission,
          plan: verification.plan,
          lease: verification.lease,
          at: verification.executionReceipt.execution.startedAt,
          trustAnchors: verification.trustAnchors,
        })
      )
  ) {
    throw new TypeError('execution evidence does not bind the expected job lease');
  }
  if (job.executionStartedAt !== verification.executionReceipt.execution.startedAt) {
    throw new TypeError('execution receipt startedAt does not match the running job');
  }
}

export function prepareComputeJob(input: PrepareComputeJobInput): PreparedComputeJob {
  if (!SHA256_LABEL.test(input.principalDigest) || !SHA256_LABEL.test(input.jobId)) {
    throw new TypeError('job principalDigest and jobId must be sha256 labels');
  }
  if (!Number.isSafeInteger(input.attempt) || input.attempt < 1) {
    throw new TypeError('job attempt must be a positive safe integer');
  }
  if (!isCanonicalIso(input.preparedAt))
    throw new TypeError('preparedAt must be a canonical ISO timestamp');
  const workUnitValidation = validateComputeWorkUnitContract(input.workUnit);
  if (!workUnitValidation.valid) {
    throw new TypeError(`Invalid compute WorkUnit: ${workUnitValidation.errors.join('; ')}`);
  }
  const deadlineAt = deriveDeadlineAt(input.preparedAt, input.workUnit.compute.budget.deadlineMs);
  if (
    input.placementVerification.principalDigest !== input.principalDigest ||
    computeWorkUnitDigest(input.placementVerification.workUnit) !==
      computeWorkUnitDigest(input.workUnit) ||
    input.placementVerification.verifiedAt !== input.preparedAt
  ) {
    throw new TypeError(
      'preflight verification must bind the supplied principal, WorkUnit, and preparedAt'
    );
  }
  const placement = verifyComputePlacementPlan(input.placementVerification);
  if (!placement.valid) {
    throw new TypeError(`Invalid compute placement preflight: ${placement.errors.join('; ')}`);
  }
  const request: ComputeJobRequest = {
    schemaVersion: COMPUTE_JOB_REQUEST_SCHEMA_VERSION,
    operation: 'create',
    principalDigest: input.principalDigest,
    jobId: input.jobId,
    attempt: input.attempt,
    evidenceReceiptIds: placementReceiptIds(input.placementVerification),
  };
  const requestBinding = makeRequestBinding(request, input.idempotencyKey);
  const job = assembleJobReceipt({
    schemaVersion: COMPUTE_JOB_SCHEMA_VERSION,
    verificationScope: 'structural_only',
    principalDigest: input.principalDigest,
    jobId: input.jobId,
    attempt: input.attempt,
    version: 0,
    state: 'preflighted',
    createdAt: input.preparedAt,
    updatedAt: input.preparedAt,
    deadlineAt,
    workUnit: {
      digest: computeWorkUnitDigest(input.workUnit),
      sourceEvidence: input.workUnit.source_evidence,
    },
    placement: {
      capacitySnapshotReceiptId: input.placementVerification.capacitySnapshot.receiptId,
      ...(input.placementVerification.bridgeAdmission
        ? { bridgeAdmissionReceiptId: input.placementVerification.bridgeAdmission.receiptId }
        : {}),
      planReceiptId: input.placementVerification.plan.receiptId,
    },
    request: requestBinding,
  });
  return { job, requestBinding };
}

function targetState(from: ComputeJobState, action: ComputeJobTransitionAction): ComputeJobState {
  if (TERMINAL_STATES.has(from as ComputeJobTerminalState)) {
    throw new TypeError('terminal compute jobs cannot transition');
  }
  if (action === 'fail') return 'failed';
  if (action === 'cancel') return 'cancelled';
  if (from === 'preflighted' && action === 'queue') return 'queued';
  if (from === 'queued' && action === 'acquire_lease') return 'leased';
  if (from === 'leased' && action === 'start') return 'starting';
  if (from === 'starting' && action === 'mark_running') return 'running';
  if (from === 'running' && action === 'succeed') return 'succeeded';
  throw new TypeError(`transition ${action} is forbidden from ${from}`);
}

function failureReasonErrors(
  state: ComputeJobState,
  reason: ComputeJobFailureReason,
  transitionedAt: string,
  lease: ComputeJobLeaseBinding | undefined,
  deadlineAt: string | null
): string[] {
  if (TERMINAL_STATES.has(state as ComputeJobTerminalState)) {
    return ['terminal compute jobs cannot fail again'];
  }
  const admitted =
    FAILURE_REASONS_BY_STATE[state as Exclude<ComputeJobState, ComputeJobTerminalState>];
  const errors: string[] = [];
  if (!admitted.has(reason)) {
    errors.push(`failure reason ${reason} is forbidden from ${state}`);
  }
  if (reason === 'lease_expired') {
    if (!lease) {
      errors.push('lease_expired requires a bound lease');
    } else if (Date.parse(transitionedAt) < Date.parse(lease.expiresAt)) {
      errors.push('lease_expired cannot be asserted before the bound lease expires');
    }
  }
  if (reason === 'deadline_exceeded') {
    if (deadlineAt === null) {
      errors.push('deadline_exceeded requires a bound deadlineAt');
    } else if (Date.parse(transitionedAt) < Date.parse(deadlineAt)) {
      errors.push('deadline_exceeded cannot be asserted before deadlineAt');
    }
  }
  return errors;
}

function executionUnobservedErrors(
  action: 'fail' | 'cancel',
  state: ComputeJobState,
  lifecycleReason: ComputeJobFailureReason | ComputeJobCancellationReason,
  unobservedReason: ComputeJobExecutionUnobservedReason,
  transitionedAt: string,
  lease: ComputeJobLeaseBinding | undefined
): string[] {
  const errors: string[] = [];
  if (state !== 'running') {
    errors.push('executionUnobservedReason is only valid for a running job');
  }
  if (action === 'fail') {
    if (UNOBSERVED_REASONS.has(lifecycleReason as ComputeJobExecutionUnobservedReason)) {
      if (lifecycleReason !== unobservedReason) {
        errors.push('unobserved execution reason must match the lifecycle failure reason');
      }
    } else if (lifecycleReason !== 'system_failed') {
      errors.push(
        'unobserved running failure requires executor_lost, lease_expired, receipt_unavailable, or system_failed'
      );
    }
  }
  if (unobservedReason === 'lease_expired') {
    if (!lease) {
      errors.push('unobserved lease_expired requires a bound lease');
    } else if (Date.parse(transitionedAt) < Date.parse(lease.expiresAt)) {
      errors.push('unobserved lease_expired cannot be asserted before the bound lease expires');
    }
  }
  return errors;
}

function leaseActivityErrors(
  lease: ComputeJobLeaseBinding | undefined,
  transitionedAt: string,
  action: ComputeJobTransitionAction
): string[] {
  if (!lease) return [`${action} requires a complete lease binding`];
  const at = Date.parse(transitionedAt);
  if (at < Date.parse(lease.issuedAt) || at >= Date.parse(lease.expiresAt)) {
    return [`${action} transition must occur within the half-open lease interval`];
  }
  return [];
}

function stateReference(job: ComputeJobReceipt): ComputeJobStateReference {
  return { state: job.state, version: job.version, receiptId: job.receiptId };
}

function buildAllocatorCommit(
  operation: ComputeAllocatorCommitOperation,
  expectedJob: ComputeJobReceipt,
  nextJob: ComputeJobReceipt,
  lease: ComputeJobLeaseBinding,
  expectedAllocation: ComputeCapacityAllocationCursor,
  nextAllocation: ComputeCapacityAllocationCursor,
  preparedAt: string
): ComputeAllocatorCommitReceipt {
  const body: Omit<ComputeAllocatorCommitReceipt, 'receiptId'> = {
    schemaVersion: COMPUTE_ALLOCATOR_COMMIT_SCHEMA_VERSION,
    verificationScope: 'prepared_cas',
    operation,
    principalDigest: expectedJob.principalDigest,
    jobId: expectedJob.jobId,
    attempt: expectedJob.attempt,
    fromJobReceiptId: expectedJob.receiptId,
    toJobReceiptId: nextJob.receiptId,
    leaseReceiptId: lease.receiptId,
    capacityRef: lease.capacityRef,
    fencingEpoch: lease.fencingEpoch,
    expectedAllocation,
    nextAllocation,
    preparedAt,
  };
  const receipt = { ...body, receiptId: sha256Value(body) };
  const validation = validateComputeAllocatorCommitReceipt(receipt);
  if (!validation.valid) {
    throw new TypeError(`Invalid compute allocator projection: ${validation.errors.join('; ')}`);
  }
  return receipt;
}

function releaseProjection(
  job: ComputeJobReceipt,
  allocation: ComputeCapacityAllocationCursor
): ComputeCapacityAllocationCursor {
  if (!job.lease) throw new TypeError('allocator release requires a job lease binding');
  const validation = validateComputeCapacityAllocationCursor(allocation);
  if (!validation.valid) {
    throw new TypeError(`Invalid capacity allocation cursor: ${validation.errors.join('; ')}`);
  }
  if (
    allocation.slotState !== 'leased' ||
    allocation.capacityRef !== job.lease.capacityRef ||
    allocation.currentLeaseReceiptId !== job.lease.receiptId ||
    allocation.currentEpoch !== job.lease.fencingEpoch
  ) {
    throw new TypeError('allocator cursor does not hold the expected job lease and fencing epoch');
  }
  if (allocation.version === Number.MAX_SAFE_INTEGER) {
    throw new TypeError('capacity allocation version cannot advance beyond safe integers');
  }
  const body: Omit<ComputeCapacityAllocationCursor, 'etag'> = {
    capacityRef: allocation.capacityRef,
    slotState: 'available',
    currentEpoch: allocation.currentEpoch,
    version: allocation.version + 1,
  };
  return { ...body, etag: computeCapacityAllocationEtag(body) };
}

function terminalAllocation(
  input: PrepareComputeJobTransitionInput
): ComputeCapacityAllocationCursor | undefined {
  if (input.action === 'succeed') return input.allocationCursor;
  if (input.action === 'fail' || input.action === 'cancel') return input.allocationCursor;
  return undefined;
}

function executionReceiptIds(verification: VerifyComputeExecutionEvidenceInput): string[] {
  return [verification.executionReceipt.receiptId, verification.executionAttestation.receiptId];
}

function transitionEvidenceIds(input: PrepareComputeJobTransitionInput): string[] {
  if (input.action === 'queue') return placementReceiptIds(input.placementVerification);
  if (input.action === 'acquire_lease') {
    return sortedUniqueReceiptIds([
      ...placementReceiptIds({
        principalDigest: input.leaseVerification.principalDigest,
        workUnit: input.leaseVerification.workUnit,
        capacitySnapshot: input.leaseVerification.capacitySnapshot,
        bridgeAdmission: input.leaseVerification.bridgeAdmission,
        plan: input.leaseVerification.plan,
        checkedAt: input.leaseVerification.plan.checkedAt,
        verifiedAt: input.leaseVerification.at,
        trustAnchors: input.leaseVerification.trustAnchors,
      }),
      input.preparedLease.lease.receiptId,
    ]);
  }
  if (input.action === 'start' || input.action === 'mark_running') {
    return sortedUniqueReceiptIds([input.leaseAuthorization.lease.receiptId]);
  }
  if (input.action === 'succeed')
    return sortedUniqueReceiptIds(executionReceiptIds(input.executionVerification));
  if (input.executionVerification) {
    return sortedUniqueReceiptIds(executionReceiptIds(input.executionVerification));
  }
  return [];
}

function terminalForInput(
  input:
    | PrepareSucceededComputeJobInput
    | PrepareFailedComputeJobInput
    | PrepareCancelledComputeJobInput,
  expectedJob: ComputeJobReceipt
): ComputeJobTerminal {
  const state: ComputeJobTerminalState =
    input.action === 'succeed' ? 'succeeded' : input.action === 'fail' ? 'failed' : 'cancelled';
  const reasonCode: ComputeJobReasonCode =
    input.action === 'succeed' ? 'execution_succeeded' : input.reasonCode;
  if (input.action === 'succeed') {
    return {
      state,
      at: input.transitionedAt,
      reasonCode,
      completionDisposition: 'work_unit_succeeded',
      evidence: {
        kind: 'attested_execution',
        executionReceiptId: input.executionVerification.executionReceipt.receiptId,
        executionAttestationReceiptId: input.executionVerification.executionAttestation.receiptId,
      },
    };
  }
  if (expectedJob.state !== 'running') {
    if (input.executionVerification || input.executionUnobservedReason) {
      throw new TypeError('pre-start terminal transition cannot claim execution evidence');
    }
    return {
      state,
      at: input.transitionedAt,
      reasonCode,
      completionDisposition: 'execution_not_started',
      evidence: { kind: 'execution_not_started', reasonCode: input.reasonCode },
    };
  }
  if (input.executionVerification && input.executionUnobservedReason) {
    throw new TypeError('running terminal transition must choose observed or unobserved execution');
  }
  if (input.executionVerification) {
    return {
      state,
      at: input.transitionedAt,
      reasonCode,
      completionDisposition: 'terminal_execution_observed',
      evidence: {
        kind: 'attested_execution',
        executionReceiptId: input.executionVerification.executionReceipt.receiptId,
        executionAttestationReceiptId: input.executionVerification.executionAttestation.receiptId,
      },
    };
  }
  if (!input.executionUnobservedReason) {
    throw new TypeError(
      'running terminal transition requires observed or explicitly unobserved execution'
    );
  }
  return {
    state,
    at: input.transitionedAt,
    reasonCode,
    completionDisposition: 'execution_unobserved',
    evidence: { kind: 'execution_unobserved', reasonCode: input.executionUnobservedReason },
  };
}

function validateActionEvidence(input: PrepareComputeJobTransitionInput): void {
  const expected = input.expectedJob;
  if (input.action === 'queue') {
    if (input.placementVerification.verifiedAt !== input.transitionedAt) {
      throw new TypeError('queue placement verification time must match transitionedAt');
    }
    assertPlacementMatchesJob(expected, input.placementVerification);
    const placement = verifyComputePlacementPlan(input.placementVerification);
    if (!placement.valid || input.placementVerification.plan.verdict !== 'admitted') {
      throw new TypeError(
        `queue requires a current admitted placement: ${placement.errors.join('; ')}`
      );
    }
    return;
  }
  if (input.action === 'acquire_lease') {
    if (input.leaseVerification.at !== input.transitionedAt) {
      throw new TypeError('lease verification time must match transitionedAt');
    }
    assertLeaseMatchesJob(expected, input.leaseVerification);
    const lease = verifyComputeCapacityLeaseReceipt(input.leaseVerification);
    if (!lease.valid) throw new TypeError(`lease evidence is invalid: ${lease.errors.join('; ')}`);
    if (input.preparedLease.lease.receiptId !== input.leaseVerification.lease.receiptId) {
      throw new TypeError('prepared lease does not match the verified lease');
    }
    const expectedAllocation = validateComputeCapacityAllocationCursor(
      input.preparedLease.expectedAllocation
    );
    const nextAllocation = validateComputeCapacityAllocationCursor(
      input.preparedLease.nextAllocation
    );
    if (!expectedAllocation.valid || !nextAllocation.valid) {
      throw new TypeError('prepared lease contains an invalid allocator projection');
    }
    return;
  }
  if (input.action === 'start' || input.action === 'mark_running') {
    if (input.leaseAuthorization.at !== input.transitionedAt) {
      throw new TypeError('lease authorization time must match transitionedAt');
    }
    assertLeaseMatchesJob(expected, input.leaseAuthorization);
    const authorization = authorizeComputeCapacityLeaseUse(input.leaseAuthorization);
    if (!authorization.valid) {
      throw new TypeError(`lease use is unauthorized: ${authorization.errors.join('; ')}`);
    }
    return;
  }
  const execution = input.executionVerification;
  if (execution) {
    if (execution.verifiedAt !== input.transitionedAt) {
      throw new TypeError('execution verification time must match transitionedAt');
    }
    assertExecutionMatchesJob(expected, execution);
    const result = verifyComputeExecutionEvidence(execution);
    if (!result.valid)
      throw new TypeError(`execution evidence is invalid: ${result.errors.join('; ')}`);
    const target =
      input.action === 'succeed' ? 'succeeded' : input.action === 'fail' ? 'failed' : 'cancelled';
    if (execution.executionReceipt.execution.terminalStatus !== target) {
      throw new TypeError(
        'execution receipt terminal status does not match the lifecycle transition'
      );
    }
  } else if (input.action === 'succeed') {
    throw new TypeError('succeeded transition requires authenticated execution evidence');
  }
}

export function prepareComputeJobTransition(
  input: PrepareComputeJobTransitionInput
): PreparedComputeJobTransition {
  const expectedValidation = validateComputeJobReceipt(input.expectedJob);
  if (!expectedValidation.valid) {
    throw new TypeError(`Invalid expected compute job: ${expectedValidation.errors.join('; ')}`);
  }
  if (!isCanonicalIso(input.transitionedAt)) {
    throw new TypeError('transitionedAt must be a canonical ISO timestamp');
  }
  if (Date.parse(input.transitionedAt) < Date.parse(input.expectedJob.updatedAt)) {
    throw new TypeError('transitionedAt must not precede the current job state');
  }
  if (input.expectedJob.version === Number.MAX_SAFE_INTEGER) {
    throw new TypeError('job version cannot advance beyond safe integers');
  }
  const nextState = targetState(input.expectedJob.state, input.action);
  if (input.action === 'fail') {
    const reasonErrors = failureReasonErrors(
      input.expectedJob.state,
      input.reasonCode,
      input.transitionedAt,
      input.expectedJob.lease,
      input.expectedJob.deadlineAt
    );
    if (reasonErrors.length > 0) throw new TypeError(reasonErrors.join('; '));
  }
  if ((input.action === 'fail' || input.action === 'cancel') && input.executionUnobservedReason) {
    const unobservedErrors = executionUnobservedErrors(
      input.action,
      input.expectedJob.state,
      input.reasonCode,
      input.executionUnobservedReason,
      input.transitionedAt,
      input.expectedJob.lease
    );
    if (unobservedErrors.length > 0) throw new TypeError(unobservedErrors.join('; '));
  }
  validateActionEvidence(input);

  const hasLease = input.expectedJob.lease !== undefined;
  const allocation = terminalAllocation(input);
  if (TERMINAL_STATES.has(nextState as ComputeJobTerminalState)) {
    if (hasLease && !allocation)
      throw new TypeError('terminal transition must prepare release of held capacity');
    if (!hasLease && allocation)
      throw new TypeError('terminal transition without a lease cannot mutate capacity');
  }

  const evidenceReceiptIds = transitionEvidenceIds(input);
  const expectedAllocationEtag =
    input.action === 'acquire_lease'
      ? input.preparedLease.expectedAllocation.etag
      : allocation?.etag;
  const reasonCode: ComputeJobReasonCode | undefined =
    input.action === 'succeed'
      ? 'execution_succeeded'
      : input.action === 'fail' || input.action === 'cancel'
        ? input.reasonCode
        : undefined;
  const request: ComputeJobRequest = {
    schemaVersion: COMPUTE_JOB_REQUEST_SCHEMA_VERSION,
    operation: 'transition',
    principalDigest: input.expectedJob.principalDigest,
    jobId: input.expectedJob.jobId,
    attempt: input.expectedJob.attempt,
    expectedJobReceiptId: input.expectedJob.receiptId,
    expectedJobVersion: input.expectedJob.version,
    action: input.action,
    ...(reasonCode ? { reasonCode } : {}),
    ...((input.action === 'fail' || input.action === 'cancel') && input.executionUnobservedReason
      ? { executionUnobservedReason: input.executionUnobservedReason }
      : {}),
    evidenceReceiptIds,
    ...(expectedAllocationEtag ? { expectedAllocationEtag } : {}),
  };
  const requestBinding = makeRequestBinding(request, input.idempotencyKey);

  let lease = input.expectedJob.lease;
  if (input.action === 'acquire_lease') lease = leaseBindingFrom(input.leaseVerification);
  const executionStartedAt =
    input.action === 'mark_running' ? input.transitionedAt : input.expectedJob.executionStartedAt;
  const terminal =
    input.action === 'succeed' || input.action === 'fail' || input.action === 'cancel'
      ? terminalForInput(input, input.expectedJob)
      : undefined;

  const nextJob = assembleJobReceipt({
    schemaVersion: COMPUTE_JOB_SCHEMA_VERSION,
    verificationScope: 'structural_only',
    principalDigest: input.expectedJob.principalDigest,
    jobId: input.expectedJob.jobId,
    attempt: input.expectedJob.attempt,
    version: input.expectedJob.version + 1,
    previousJobReceiptId: input.expectedJob.receiptId,
    state: nextState,
    createdAt: input.expectedJob.createdAt,
    updatedAt: input.transitionedAt,
    deadlineAt: input.expectedJob.deadlineAt,
    workUnit: input.expectedJob.workUnit,
    placement: input.expectedJob.placement,
    request: requestBinding,
    ...(lease ? { lease } : {}),
    ...(executionStartedAt ? { executionStartedAt } : {}),
    ...(terminal ? { terminal } : {}),
  });

  let allocatorCommit: ComputeAllocatorCommitReceipt | undefined;
  if (input.action === 'acquire_lease') {
    if (!lease) throw new TypeError('acquire_lease did not produce a lease binding');
    allocatorCommit = buildAllocatorCommit(
      'acquire',
      input.expectedJob,
      nextJob,
      lease,
      input.preparedLease.expectedAllocation,
      input.preparedLease.nextAllocation,
      input.transitionedAt
    );
  } else if (allocation && input.expectedJob.lease) {
    const nextAllocation = releaseProjection(input.expectedJob, allocation);
    allocatorCommit = buildAllocatorCommit(
      'release',
      input.expectedJob,
      nextJob,
      input.expectedJob.lease,
      allocation,
      nextAllocation,
      input.transitionedAt
    );
  }

  const transitionBody: Omit<ComputeJobTransitionReceipt, 'receiptId'> = {
    schemaVersion: COMPUTE_JOB_TRANSITION_SCHEMA_VERSION,
    verificationScope: 'structural_only',
    principalDigest: input.expectedJob.principalDigest,
    jobId: input.expectedJob.jobId,
    attempt: input.expectedJob.attempt,
    workUnitDigest: input.expectedJob.workUnit.digest,
    action: input.action,
    from: stateReference(input.expectedJob),
    to: stateReference(nextJob),
    request: requestBinding,
    transitionedAt: input.transitionedAt,
    evidenceReceiptIds,
    ...(allocatorCommit ? { allocatorCommitReceiptId: allocatorCommit.receiptId } : {}),
  };
  const transition: ComputeJobTransitionReceipt = {
    ...transitionBody,
    receiptId: sha256Value(transitionBody),
  };
  const verification = verifyComputeJobTransition({
    expectedJob: input.expectedJob,
    nextJob,
    transition,
    allocatorCommit,
  });
  if (!verification.valid) {
    throw new TypeError(
      `Invalid prepared compute job transition: ${verification.errors.join('; ')}`
    );
  }
  return { expectedJob: input.expectedJob, nextJob, transition, allocatorCommit };
}

export function validateComputeJobTransitionReceipt(value: unknown): ComputeJobLifecycleValidation {
  const errors: string[] = [];
  if (!isRecord(value))
    return { valid: false, errors: ['job transition receipt must be an object'] };
  rejectUnknownKeys(
    value,
    [
      'schemaVersion',
      'verificationScope',
      'receiptId',
      'principalDigest',
      'jobId',
      'attempt',
      'workUnitDigest',
      'action',
      'from',
      'to',
      'request',
      'transitionedAt',
      'evidenceReceiptIds',
      'allocatorCommitReceiptId',
    ],
    'transition',
    errors
  );
  if (value.schemaVersion !== COMPUTE_JOB_TRANSITION_SCHEMA_VERSION) {
    errors.push(`transition.schemaVersion must be ${COMPUTE_JOB_TRANSITION_SCHEMA_VERSION}`);
  }
  if (value.verificationScope !== 'structural_only') {
    errors.push('transition.verificationScope must be structural_only');
  }
  for (const key of ['receiptId', 'principalDigest', 'jobId', 'workUnitDigest'] as const) {
    validateSha(value[key], `transition.${key}`, errors);
  }
  if (!Number.isSafeInteger(value.attempt) || (value.attempt as number) < 1) {
    errors.push('transition.attempt must be a positive safe integer');
  }
  if (
    typeof value.action !== 'string' ||
    !ACTIONS.has(value.action as ComputeJobTransitionAction)
  ) {
    errors.push('transition.action is invalid');
  }
  for (const key of ['from', 'to'] as const) {
    const reference = value[key];
    if (!isRecord(reference)) {
      errors.push(`transition.${key} must be an object`);
      continue;
    }
    rejectUnknownKeys(reference, ['state', 'version', 'receiptId'], `transition.${key}`, errors);
    if (typeof reference.state !== 'string' || !STATES.has(reference.state as ComputeJobState)) {
      errors.push(`transition.${key}.state is invalid`);
    }
    if (!safeNonNegativeInteger(reference.version)) {
      errors.push(`transition.${key}.version must be a non-negative safe integer`);
    }
    validateSha(reference.receiptId, `transition.${key}.receiptId`, errors);
  }
  if (
    isRecord(value.from) &&
    isRecord(value.to) &&
    safeNonNegativeInteger(value.from.version) &&
    value.to.version !== value.from.version + 1
  ) {
    errors.push('transition.to.version must advance exactly once');
  }
  validateRequestBinding(value.request, 'transition.request', errors);
  if (!isCanonicalIso(value.transitionedAt)) {
    errors.push('transition.transitionedAt must be a canonical ISO timestamp');
  }
  if (!Array.isArray(value.evidenceReceiptIds)) {
    errors.push('transition.evidenceReceiptIds must be an array');
  } else {
    const receipts = value.evidenceReceiptIds;
    if (receipts.some((entry) => typeof entry !== 'string' || !SHA256_LABEL.test(entry))) {
      errors.push('transition.evidenceReceiptIds must contain sha256 labels');
    }
    if (
      new Set(receipts).size !== receipts.length ||
      [...receipts].sort().some((v, i) => v !== receipts[i])
    ) {
      errors.push('transition.evidenceReceiptIds must be sorted and unique');
    }
  }
  if (value.allocatorCommitReceiptId !== undefined) {
    validateSha(value.allocatorCommitReceiptId, 'transition.allocatorCommitReceiptId', errors);
  }
  if (typeof value.receiptId === 'string' && SHA256_LABEL.test(value.receiptId)) {
    const expected = sha256Value(withoutReceiptId(value as unknown as ComputeJobTransitionReceipt));
    if (expected !== value.receiptId)
      errors.push('transition.receiptId does not match canonical body');
  }
  return { valid: errors.length === 0, errors };
}

export function validateComputeAllocatorCommitReceipt(
  value: unknown
): ComputeJobLifecycleValidation {
  const errors: string[] = [];
  if (!isRecord(value))
    return { valid: false, errors: ['allocator projection receipt must be an object'] };
  rejectUnknownKeys(
    value,
    [
      'schemaVersion',
      'verificationScope',
      'receiptId',
      'operation',
      'principalDigest',
      'jobId',
      'attempt',
      'fromJobReceiptId',
      'toJobReceiptId',
      'leaseReceiptId',
      'capacityRef',
      'fencingEpoch',
      'expectedAllocation',
      'nextAllocation',
      'preparedAt',
    ],
    'allocator',
    errors
  );
  if (value.schemaVersion !== COMPUTE_ALLOCATOR_COMMIT_SCHEMA_VERSION) {
    errors.push(`allocator.schemaVersion must be ${COMPUTE_ALLOCATOR_COMMIT_SCHEMA_VERSION}`);
  }
  if (value.verificationScope !== 'prepared_cas') {
    errors.push('allocator.verificationScope must be prepared_cas');
  }
  if (value.operation !== 'acquire' && value.operation !== 'release') {
    errors.push('allocator.operation is invalid');
  }
  for (const key of [
    'receiptId',
    'principalDigest',
    'jobId',
    'fromJobReceiptId',
    'toJobReceiptId',
    'leaseReceiptId',
    'capacityRef',
  ] as const) {
    validateSha(value[key], `allocator.${key}`, errors);
  }
  if (!Number.isSafeInteger(value.attempt) || (value.attempt as number) < 1) {
    errors.push('allocator.attempt must be a positive safe integer');
  }
  if (!Number.isSafeInteger(value.fencingEpoch) || (value.fencingEpoch as number) < 1) {
    errors.push('allocator.fencingEpoch must be a positive safe integer');
  }
  if (!isCanonicalIso(value.preparedAt)) {
    errors.push('allocator.preparedAt must be a canonical ISO timestamp');
  }
  const expectedValidation = validateComputeCapacityAllocationCursor(value.expectedAllocation);
  const nextValidation = validateComputeCapacityAllocationCursor(value.nextAllocation);
  errors.push(...expectedValidation.errors.map((error) => `allocator.expected: ${error}`));
  errors.push(...nextValidation.errors.map((error) => `allocator.next: ${error}`));
  if (expectedValidation.valid && nextValidation.valid) {
    const expected = value.expectedAllocation as unknown as ComputeCapacityAllocationCursor;
    const next = value.nextAllocation as unknown as ComputeCapacityAllocationCursor;
    if (expected.capacityRef !== value.capacityRef || next.capacityRef !== value.capacityRef) {
      errors.push('allocator cursors must bind capacityRef');
    }
    if (next.version !== expected.version + 1) {
      errors.push('allocator next version must advance exactly once');
    }
    if (value.operation === 'acquire') {
      if (
        expected.slotState !== 'available' ||
        next.slotState !== 'leased' ||
        next.currentEpoch !== expected.currentEpoch + 1 ||
        next.currentLeaseReceiptId !== value.leaseReceiptId ||
        next.currentEpoch !== value.fencingEpoch
      ) {
        errors.push('allocator acquire projection is inconsistent');
      }
    } else if (
      expected.slotState !== 'leased' ||
      expected.currentLeaseReceiptId !== value.leaseReceiptId ||
      expected.currentEpoch !== value.fencingEpoch ||
      next.slotState !== 'available' ||
      next.currentLeaseReceiptId !== undefined ||
      next.currentEpoch !== expected.currentEpoch
    ) {
      errors.push('allocator release projection is inconsistent');
    }
  }
  if (typeof value.receiptId === 'string' && SHA256_LABEL.test(value.receiptId)) {
    const expected = sha256Value(
      withoutReceiptId(value as unknown as ComputeAllocatorCommitReceipt)
    );
    if (expected !== value.receiptId)
      errors.push('allocator.receiptId does not match canonical body');
  }
  return { valid: errors.length === 0, errors };
}

/**
 * Verify canonical structure and cross-receipt bindings only. This cannot prove
 * that idempotency or allocator compare-and-swap operations committed.
 */
export function verifyComputeJobTransition(
  input: VerifyComputeJobTransitionInput
): ComputeJobLifecycleValidation {
  const errors: string[] = [];
  const expectedValidation = validateComputeJobReceipt(input.expectedJob);
  const nextValidation = validateComputeJobReceipt(input.nextJob);
  const transitionValidation = validateComputeJobTransitionReceipt(input.transition);
  errors.push(...expectedValidation.errors.map((error) => `expected job: ${error}`));
  errors.push(...nextValidation.errors.map((error) => `next job: ${error}`));
  errors.push(...transitionValidation.errors.map((error) => `transition: ${error}`));
  if (input.allocatorCommit) {
    const allocatorValidation = validateComputeAllocatorCommitReceipt(input.allocatorCommit);
    errors.push(...allocatorValidation.errors.map((error) => `allocator: ${error}`));
  }
  if (errors.length > 0) return { valid: false, errors };
  let expectedTarget: ComputeJobState | undefined;
  try {
    expectedTarget = targetState(input.expectedJob.state, input.transition.action);
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }
  if (input.nextJob.state !== expectedTarget)
    errors.push('next job state does not match transition action');
  if (
    input.nextJob.principalDigest !== input.expectedJob.principalDigest ||
    input.nextJob.jobId !== input.expectedJob.jobId ||
    input.nextJob.attempt !== input.expectedJob.attempt ||
    input.nextJob.createdAt !== input.expectedJob.createdAt ||
    input.nextJob.deadlineAt !== input.expectedJob.deadlineAt ||
    canonicalJson(input.nextJob.workUnit) !== canonicalJson(input.expectedJob.workUnit) ||
    canonicalJson(input.nextJob.placement) !== canonicalJson(input.expectedJob.placement)
  ) {
    errors.push('next job mutates immutable identity or evidence bindings');
  }
  if (
    input.nextJob.version !== input.expectedJob.version + 1 ||
    input.nextJob.previousJobReceiptId !== input.expectedJob.receiptId
  ) {
    errors.push('next job does not advance the expected content-addressed state');
  }
  if (Date.parse(input.nextJob.updatedAt) < Date.parse(input.expectedJob.updatedAt)) {
    errors.push('next job timestamp predates the expected state');
  }
  if (input.transition.action === 'acquire_lease') {
    if (input.expectedJob.lease !== undefined || input.nextJob.lease === undefined) {
      errors.push('acquire_lease must add the first complete lease binding');
    }
  } else if (!sameOptionalCanonical(input.nextJob.lease, input.expectedJob.lease)) {
    errors.push('transition mutates the existing lease binding');
  }
  if (input.transition.action === 'acquire_lease') {
    errors.push(
      ...leaseActivityErrors(
        input.nextJob.lease,
        input.transition.transitionedAt,
        input.transition.action
      )
    );
  } else if (input.transition.action === 'start' || input.transition.action === 'mark_running') {
    errors.push(
      ...leaseActivityErrors(
        input.expectedJob.lease,
        input.transition.transitionedAt,
        input.transition.action
      )
    );
  }
  if (input.transition.action === 'mark_running') {
    if (
      input.expectedJob.executionStartedAt !== undefined ||
      input.nextJob.executionStartedAt !== input.transition.transitionedAt
    ) {
      errors.push('mark_running must bind executionStartedAt to the transition time');
    }
  } else if (input.nextJob.executionStartedAt !== input.expectedJob.executionStartedAt) {
    errors.push('transition mutates executionStartedAt outside mark_running');
  }
  if (
    canonicalJson(input.transition.from) !== canonicalJson(stateReference(input.expectedJob)) ||
    canonicalJson(input.transition.to) !== canonicalJson(stateReference(input.nextJob))
  ) {
    errors.push('transition does not bind the supplied job receipts');
  }
  if (
    input.transition.principalDigest !== input.expectedJob.principalDigest ||
    input.transition.jobId !== input.expectedJob.jobId ||
    input.transition.attempt !== input.expectedJob.attempt ||
    input.transition.workUnitDigest !== input.expectedJob.workUnit.digest ||
    canonicalJson(input.transition.request) !== canonicalJson(input.nextJob.request) ||
    input.transition.transitionedAt !== input.nextJob.updatedAt
  ) {
    errors.push('transition does not bind the supplied job identity, request, and time');
  }

  const placementIds = sortedUniqueReceiptIds([
    input.expectedJob.placement.capacitySnapshotReceiptId,
    input.expectedJob.placement.planReceiptId,
    ...(input.expectedJob.placement.bridgeAdmissionReceiptId
      ? [input.expectedJob.placement.bridgeAdmissionReceiptId]
      : []),
  ]);
  let expectedEvidenceReceiptIds: string[] = [];
  if (input.transition.action === 'queue') {
    expectedEvidenceReceiptIds = placementIds;
  } else if (input.transition.action === 'acquire_lease' && input.nextJob.lease) {
    expectedEvidenceReceiptIds = sortedUniqueReceiptIds([
      ...placementIds,
      input.nextJob.lease.receiptId,
    ]);
  } else if (
    (input.transition.action === 'start' || input.transition.action === 'mark_running') &&
    input.expectedJob.lease
  ) {
    expectedEvidenceReceiptIds = [input.expectedJob.lease.receiptId];
  } else if (input.nextJob.terminal?.evidence.kind === 'attested_execution') {
    expectedEvidenceReceiptIds = sortedUniqueReceiptIds([
      input.nextJob.terminal.evidence.executionReceiptId,
      input.nextJob.terminal.evidence.executionAttestationReceiptId,
    ]);
  }
  if (
    canonicalJson(input.transition.evidenceReceiptIds) !== canonicalJson(expectedEvidenceReceiptIds)
  ) {
    errors.push('transition evidence receipt IDs do not match the state evidence');
  }

  if (input.transition.action === 'fail' && input.nextJob.terminal?.state === 'failed') {
    errors.push(
      ...failureReasonErrors(
        input.expectedJob.state,
        input.nextJob.terminal.reasonCode as ComputeJobFailureReason,
        input.transition.transitionedAt,
        input.expectedJob.lease,
        input.expectedJob.deadlineAt
      )
    );
  }
  const executionUnobservedReason =
    input.nextJob.terminal?.evidence.kind === 'execution_unobserved'
      ? input.nextJob.terminal.evidence.reasonCode
      : undefined;
  if (executionUnobservedReason !== undefined) {
    if (input.transition.action !== 'fail' && input.transition.action !== 'cancel') {
      errors.push('unobserved execution evidence requires a fail or cancel transition');
    } else if (!input.nextJob.terminal) {
      errors.push('unobserved execution evidence requires a terminal job');
    } else {
      errors.push(
        ...executionUnobservedErrors(
          input.transition.action,
          input.expectedJob.state,
          input.nextJob.terminal.reasonCode as
            | ComputeJobFailureReason
            | ComputeJobCancellationReason,
          executionUnobservedReason,
          input.transition.transitionedAt,
          input.expectedJob.lease
        )
      );
    }
  }

  const reconstructedRequest: ComputeJobRequest = {
    schemaVersion: COMPUTE_JOB_REQUEST_SCHEMA_VERSION,
    operation: 'transition',
    principalDigest: input.expectedJob.principalDigest,
    jobId: input.expectedJob.jobId,
    attempt: input.expectedJob.attempt,
    expectedJobReceiptId: input.expectedJob.receiptId,
    expectedJobVersion: input.expectedJob.version,
    action: input.transition.action,
    ...(input.nextJob.terminal ? { reasonCode: input.nextJob.terminal.reasonCode } : {}),
    ...(executionUnobservedReason ? { executionUnobservedReason } : {}),
    evidenceReceiptIds: expectedEvidenceReceiptIds,
    ...(input.allocatorCommit
      ? { expectedAllocationEtag: input.allocatorCommit.expectedAllocation.etag }
      : {}),
  };
  if (input.transition.request.requestHash !== computeJobRequestHash(reconstructedRequest)) {
    errors.push('transition requestHash does not bind the supplied state and evidence');
  }

  const allocatorRequired =
    input.transition.action === 'acquire_lease' ||
    (TERMINAL_STATES.has(input.nextJob.state as ComputeJobTerminalState) &&
      input.expectedJob.lease !== undefined);
  if (allocatorRequired !== (input.allocatorCommit !== undefined)) {
    errors.push('allocator projection presence does not match the state transition');
  }
  if (input.allocatorCommit) {
    const expectedOperation = input.transition.action === 'acquire_lease' ? 'acquire' : 'release';
    if (
      input.allocatorCommit.operation !== expectedOperation ||
      input.allocatorCommit.principalDigest !== input.expectedJob.principalDigest ||
      input.allocatorCommit.jobId !== input.expectedJob.jobId ||
      input.allocatorCommit.attempt !== input.expectedJob.attempt ||
      input.allocatorCommit.fromJobReceiptId !== input.expectedJob.receiptId ||
      input.allocatorCommit.toJobReceiptId !== input.nextJob.receiptId ||
      input.transition.allocatorCommitReceiptId !== input.allocatorCommit.receiptId ||
      input.allocatorCommit.leaseReceiptId !==
        (expectedOperation === 'acquire'
          ? input.nextJob.lease?.receiptId
          : input.expectedJob.lease?.receiptId) ||
      input.allocatorCommit.capacityRef !==
        (expectedOperation === 'acquire'
          ? input.nextJob.lease?.capacityRef
          : input.expectedJob.lease?.capacityRef) ||
      input.allocatorCommit.fencingEpoch !==
        (expectedOperation === 'acquire'
          ? input.nextJob.lease?.fencingEpoch
          : input.expectedJob.lease?.fencingEpoch) ||
      input.allocatorCommit.preparedAt !== input.transition.transitionedAt
    ) {
      errors.push('allocator projection does not bind the supplied job transition');
    }
  } else if (input.transition.allocatorCommitReceiptId !== undefined) {
    errors.push('transition references an allocator projection that was not supplied');
  }
  return { valid: errors.length === 0, errors };
}
