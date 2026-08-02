/**
 * Internal control-plane recovery for an expired fenced executor heartbeat.
 *
 * Reaping terminates only HoloMesh's logical execution ownership and releases
 * the logical allocator slot. It does not assert that a provider reservation
 * existed or that external GPU work stopped. Paid holds remain untouched until
 * measured execution evidence or an explicit reconciliation path exists.
 */

import { prepareComputeJobTransition } from '@holoscript/core/world-model';
import type { ComputeJobAdmissionSigner } from './compute-job-admission';
import {
  COMPUTE_EXECUTION_OWNERSHIP_SCHEMA_VERSION,
  validateComputeExecutionOwnershipReceipt,
  type ComputeExecutionOwnershipReceipt,
} from './compute-execution-ownership';
import {
  buildComputeTransitionCommand,
  type ComputeDispatchStore,
} from './compute-job-dispatch-service';
import {
  ComputeJobStoreAdmissionError,
  ComputeJobStoreConflictError,
  ComputeJobStoreNotFoundError,
  ComputeJobStoreReadbackError,
  ComputeJobStoreUnavailableError,
  type ComputeBudgetEvidenceEnvelope,
  type ComputeDurableEnvelope,
} from './compute-job-store';

const SHA256_LABEL = /^sha256:[a-f0-9]{64}$/;
const REAP_DOMAIN = 'holomesh.compute-execution-reap.v1';
const DEFAULT_ADMISSION_TTL_MS = 20_000;

type JsonObject = Record<string, unknown>;

export interface ComputeExecutionReaperIdentity {
  readonly kind: 'execution_reaper';
  readonly surface: 'headless';
  readonly source: 'registered_service_key';
  readonly teamId: string;
  readonly reaperId: string;
  readonly capabilities: readonly ['compute:reap'];
  readonly validFrom: string;
  readonly validUntil: string;
  readonly revokedAt?: string;
}

export interface ReapExpiredComputeJobInput {
  readonly jobId: string;
  readonly attempt: number;
  readonly expectedJobReceiptId: string;
  readonly expectedOwnershipReceiptId: string;
}

export interface ReapExpiredComputeJobResult {
  readonly disposition: 'committed' | 'replayed';
  readonly publicResponseBytes: string;
  readonly transitionReceiptId: string;
  readonly jobReceiptId: string;
  readonly state: 'failed';
  readonly reasonCode: 'executor_lost' | 'lease_expired';
  readonly completionDisposition: 'execution_unobserved';
  readonly ownershipReceiptId: string;
  readonly allocationEtag: string;
  readonly leaseDisposition: 'logical_slot_released';
  readonly budgetDisposition: 'retained_for_reconciliation' | 'not_applicable';
  readonly providerReservation: 'not_asserted';
  readonly execution: 'not_asserted';
}

export type ComputeJobReapingErrorCode =
  | 'invalid_request'
  | 'reaper_identity_invalid'
  | 'job_not_running'
  | 'heartbeat_current'
  | 'ownership_conflict'
  | 'budget_unavailable'
  | 'reaping_conflict'
  | 'service_unavailable'
  | 'committed_readback_failed';

export class ComputeJobReapingError extends Error {
  constructor(
    readonly code: ComputeJobReapingErrorCode,
    message: string,
    readonly details?: readonly string[],
    readonly committed = false
  ) {
    super(message);
    this.name = 'ComputeJobReapingError';
  }
}

export interface CreateComputeJobReapingServiceOptions {
  readonly store: ComputeDispatchStore;
  readonly reaperIdentity: ComputeExecutionReaperIdentity;
  readonly admissionSigner: ComputeJobAdmissionSigner;
  readonly admissionTrustPolicyDigest: string;
  readonly admissionKeyValidUntil: string;
  readonly now?: () => string;
  readonly admissionTtlMs?: number;
}

export interface ComputeJobReapingService {
  reap(input: ReapExpiredComputeJobInput): Promise<ReapExpiredComputeJobResult>;
}

function isRecord(value: unknown): value is JsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function canonicalize(value: unknown): unknown {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('canonical JSON requires finite numbers');
    return value;
  }
  if (Array.isArray(value)) return value.map(canonicalize);
  if (isRecord(value)) {
    const result: JsonObject = {};
    for (const key of Object.keys(value).sort()) {
      if (value[key] !== undefined) result[key] = canonicalize(value[key]);
    }
    return result;
  }
  throw new TypeError(`canonical JSON cannot contain ${typeof value}`);
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function canonicalTimestamp(value: unknown, label: string): string {
  if (typeof value !== 'string') {
    throw new ComputeJobReapingError('service_unavailable', `${label} is not configured`);
  }
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== value) {
    throw new ComputeJobReapingError('service_unavailable', `${label} is not canonical`);
  }
  return value;
}

function minTimestamp(...values: string[]): string {
  return new Date(Math.min(...values.map((value) => Date.parse(value)))).toISOString();
}

function validateSelector(input: ReapExpiredComputeJobInput): void {
  const expectedKeys = ['attempt', 'expectedJobReceiptId', 'expectedOwnershipReceiptId', 'jobId'];
  if (
    !isRecord(input) ||
    canonicalJson(Object.keys(input).sort()) !== canonicalJson(expectedKeys)
  ) {
    throw new ComputeJobReapingError(
      'invalid_request',
      'reaping selector accepts only jobId, attempt, expectedJobReceiptId, and expectedOwnershipReceiptId'
    );
  }
  if (
    !SHA256_LABEL.test(input.jobId) ||
    !SHA256_LABEL.test(input.expectedJobReceiptId) ||
    !SHA256_LABEL.test(input.expectedOwnershipReceiptId)
  ) {
    throw new ComputeJobReapingError(
      'invalid_request',
      'reaping receipt ids must be sha256 labels'
    );
  }
  if (!Number.isSafeInteger(input.attempt) || input.attempt < 1) {
    throw new ComputeJobReapingError('invalid_request', 'attempt must be a positive safe integer');
  }
}

function assertReaperIdentityActive(identity: ComputeExecutionReaperIdentity, at: string): void {
  const keys = Object.keys(identity).sort();
  const expectedKeys = [
    'capabilities',
    'kind',
    'reaperId',
    ...(identity.revokedAt === undefined ? [] : ['revokedAt']),
    'source',
    'surface',
    'teamId',
    'validFrom',
    'validUntil',
  ].sort();
  const activeAt = Date.parse(at);
  const validFrom = Date.parse(identity.validFrom);
  const validUntil = Date.parse(identity.validUntil);
  const revokedAt = identity.revokedAt ? Date.parse(identity.revokedAt) : null;
  if (
    canonicalJson(keys) !== canonicalJson(expectedKeys) ||
    identity.kind !== 'execution_reaper' ||
    identity.surface !== 'headless' ||
    identity.source !== 'registered_service_key' ||
    !identity.teamId ||
    !identity.reaperId ||
    canonicalJson(identity.capabilities) !== canonicalJson(['compute:reap']) ||
    !Number.isFinite(validFrom) ||
    !Number.isFinite(validUntil) ||
    activeAt < validFrom ||
    activeAt >= validUntil ||
    (revokedAt !== null && activeAt >= revokedAt)
  ) {
    throw new ComputeJobReapingError(
      'reaper_identity_invalid',
      'registered execution reaper identity is not active'
    );
  }
}

function mapReapingError(error: unknown): never {
  if (error instanceof ComputeJobReapingError) throw error;
  if (error instanceof ComputeJobStoreNotFoundError) {
    const code =
      error.resource === 'budget_hold'
        ? 'budget_unavailable'
        : error.resource === 'execution_ownership'
          ? 'ownership_conflict'
          : error.resource === 'job'
            ? 'job_not_running'
            : 'service_unavailable';
    throw new ComputeJobReapingError(code, error.message);
  }
  if (error instanceof ComputeJobStoreAdmissionError) {
    const heartbeatCurrent = error.reasonCodes.includes(
      'execution_ownership_not_expired_at_database_clock'
    );
    throw new ComputeJobReapingError(
      heartbeatCurrent ? 'heartbeat_current' : 'service_unavailable',
      error.message,
      error.reasonCodes
    );
  }
  if (error instanceof ComputeJobStoreConflictError) {
    throw new ComputeJobReapingError(
      error.code === 'execution_ownership_conflict' ? 'ownership_conflict' : 'reaping_conflict',
      error.message,
      [error.code]
    );
  }
  if (error instanceof ComputeJobStoreReadbackError) {
    throw new ComputeJobReapingError('committed_readback_failed', error.message, undefined, true);
  }
  if (error instanceof ComputeJobStoreUnavailableError) {
    throw new ComputeJobReapingError('service_unavailable', error.message);
  }
  throw error;
}

export function createComputeJobReapingService(
  options: CreateComputeJobReapingServiceOptions
): ComputeJobReapingService {
  if (!SHA256_LABEL.test(options.admissionTrustPolicyDigest)) {
    throw new ComputeJobReapingError(
      'service_unavailable',
      'admission trust policy digest is not configured'
    );
  }
  const admissionKeyValidUntil = canonicalTimestamp(
    options.admissionKeyValidUntil,
    'admissionKeyValidUntil'
  );
  const admissionTtlMs = options.admissionTtlMs ?? DEFAULT_ADMISSION_TTL_MS;
  if (!Number.isSafeInteger(admissionTtlMs) || admissionTtlMs < 1 || admissionTtlMs > 60_000) {
    throw new ComputeJobReapingError('service_unavailable', 'admissionTtlMs is invalid');
  }
  const now = options.now ?? (() => new Date().toISOString());

  async function reap(input: ReapExpiredComputeJobInput): Promise<ReapExpiredComputeJobResult> {
    validateSelector(input);
    const reapedAt = canonicalTimestamp(now(), 'now()');
    assertReaperIdentityActive(options.reaperIdentity, reapedAt);
    try {
      const teamId = options.reaperIdentity.teamId;
      const job = await options.store.readJob({
        teamId,
        jobId: input.jobId,
        attempt: input.attempt,
      });
      const lease = job.receipt.lease;
      if (
        job.receipt.state !== 'running' ||
        job.receipt.receiptId !== input.expectedJobReceiptId ||
        !lease
      ) {
        throw new ComputeJobReapingError(
          'job_not_running',
          'job is not the expected running lease owner'
        );
      }

      const ownership = await options.store.readCurrentExecutionOwnership({
        teamId,
        jobId: input.jobId,
        attempt: input.attempt,
      });
      const ownershipValidation = validateComputeExecutionOwnershipReceipt(ownership.receipt);
      const receipt = ownership.receipt as ComputeExecutionOwnershipReceipt;
      if (
        !ownershipValidation.valid ||
        ownership.schemaVersion !== COMPUTE_EXECUTION_OWNERSHIP_SCHEMA_VERSION ||
        ownership.bytes !== canonicalJson(receipt) ||
        ownership.receiptId !== input.expectedOwnershipReceiptId ||
        receipt.receiptId !== input.expectedOwnershipReceiptId ||
        receipt.teamId !== teamId ||
        receipt.principalDigest !== job.receipt.principalDigest ||
        receipt.jobId !== input.jobId ||
        receipt.attempt !== input.attempt ||
        receipt.workUnitDigest !== job.receipt.workUnit.digest ||
        receipt.leaseReceiptId !== lease.receiptId ||
        receipt.holderDigest !== lease.holderDigest ||
        receipt.fencingTokenHash !== lease.fencingTokenHash ||
        receipt.capacityRef !== lease.capacityRef ||
        receipt.fencingEpoch !== lease.fencingEpoch
      ) {
        throw new ComputeJobReapingError(
          'ownership_conflict',
          'latest execution ownership does not bind the expected running lease',
          ownershipValidation.errors
        );
      }
      if (Date.parse(reapedAt) < Date.parse(receipt.heartbeatValidUntil)) {
        throw new ComputeJobReapingError(
          'heartbeat_current',
          'execution heartbeat is still current'
        );
      }

      const workUnit = await options.store.readWorkUnit(teamId, job.receipt.workUnit.digest);
      const capacity = await options.store.readRegisteredCapacity({
        teamId,
        capacityRef: lease.capacityRef,
      });
      let activeBudgetHold: ComputeBudgetEvidenceEnvelope | undefined;
      if (workUnit.contract.compute.budget.maxCostMinorUnits > 0) {
        activeBudgetHold = await options.store.readActiveBudgetHold({
          teamId,
          jobId: input.jobId,
          attempt: input.attempt,
        });
      }
      const reasonCode =
        Date.parse(reapedAt) >= Date.parse(lease.expiresAt)
          ? ('lease_expired' as const)
          : ('executor_lost' as const);
      const idempotencyKey = canonicalJson({
        domain: REAP_DOMAIN,
        teamId,
        reaperId: options.reaperIdentity.reaperId,
        jobId: input.jobId,
        attempt: input.attempt,
        expectedJobReceiptId: input.expectedJobReceiptId,
        expectedOwnershipReceiptId: input.expectedOwnershipReceiptId,
        reasonCode,
      });
      const prepared = prepareComputeJobTransition({
        expectedJob: job.receipt,
        action: 'fail',
        reasonCode,
        executionUnobservedReason: reasonCode,
        allocationCursor: capacity.projection.cursor,
        transitionedAt: reapedAt,
        idempotencyKey,
      });
      const allocator = prepared.allocatorCommit;
      if (!allocator) {
        throw new ComputeJobReapingError(
          'service_unavailable',
          'expired execution did not prepare a logical allocator release'
        );
      }
      const admissionValidUntil = minTimestamp(
        admissionKeyValidUntil,
        options.reaperIdentity.validUntil,
        new Date(Date.parse(reapedAt) + admissionTtlMs).toISOString()
      );
      if (Date.parse(admissionValidUntil) <= Date.parse(reapedAt)) {
        throw new ComputeJobReapingError(
          'reaper_identity_invalid',
          'execution reaper has no positive admission window'
        );
      }
      const ownershipEvidence: ComputeDurableEnvelope = {
        receiptId: ownership.receiptId,
        schemaVersion: ownership.schemaVersion,
        bytes: ownership.bytes,
      };
      const command = buildComputeTransitionCommand({
        operation: 'compute_job.fail',
        teamId,
        expectedJob: job,
        prepared,
        workUnit,
        evidence: [ownershipEvidence],
        admissionSigner: options.admissionSigner,
        admissionTrustPolicyDigest: options.admissionTrustPolicyDigest,
        admissionValidUntil,
        allocation: {
          capacity,
          expectedAllocation: allocator.expectedAllocation,
          nextAllocation: allocator.nextAllocation,
        },
        executionRecoveryGuard: {
          expiredOwnership: ownership,
          ...(activeBudgetHold ? { activeBudgetHold } : {}),
        },
      });
      const committed = await options.store.commitTransition(command);
      if (
        committed.transitionReceiptId !== prepared.transition.receiptId ||
        committed.readBack.jobReceiptId !== prepared.nextJob.receiptId ||
        committed.readBack.allocationEtag !== allocator.nextAllocation.etag ||
        committed.budgetEvidenceReceiptId !== undefined ||
        committed.readBack.budgetEvidenceReceiptId !== undefined ||
        canonicalJson(committed.readBack.evidenceReceiptIds) !==
          canonicalJson([ownership.receiptId]) ||
        committed.readBack.outboxEventIds.length !== 1
      ) {
        throw new ComputeJobReapingError(
          'committed_readback_failed',
          'execution recovery did not read back exact terminal, allocation, hold, and ownership custody',
          undefined,
          true
        );
      }
      return {
        disposition: committed.disposition,
        publicResponseBytes: committed.publicResponseBytes,
        transitionReceiptId: committed.transitionReceiptId,
        jobReceiptId: committed.readBack.jobReceiptId,
        state: 'failed',
        reasonCode,
        completionDisposition: 'execution_unobserved',
        ownershipReceiptId: ownership.receiptId,
        allocationEtag: allocator.nextAllocation.etag,
        leaseDisposition: 'logical_slot_released',
        budgetDisposition: activeBudgetHold ? 'retained_for_reconciliation' : 'not_applicable',
        providerReservation: 'not_asserted',
        execution: 'not_asserted',
      };
    } catch (error) {
      mapReapingError(error);
    }
  }

  return { reap };
}
