/**
 * Internal fenced-executor transition into `running` plus heartbeat refresh.
 *
 * A committed running acknowledgement authorizes an outbox consumer to begin
 * executor work. It still does not prove provider reservation, GPU possession,
 * kernel dispatch, completion, cost, or payment.
 */

import { createHash } from 'crypto';
import {
  authorizeComputeCapacityLeaseUse,
  prepareComputeJobTransition,
  verifyComputeBudgetEvidence,
  type ComputeEvidenceTrustAnchor,
} from '@holoscript/core/world-model';
import type { ComputeJobAdmissionSigner } from './compute-job-admission';
import {
  COMPUTE_EXECUTION_OWNERSHIP_SCHEMA_VERSION,
  buildComputeExecutionOwnershipOutboxEnvelope,
  createComputeExecutionOwnershipEnvelope,
  prepareAndSignComputeExecutionOwnership,
  validateComputeExecutionOwnershipReceipt,
  type ComputeExecutionOwnershipReceipt,
} from './compute-execution-ownership';
import {
  assertComputeExecutorIdentityActive,
  buildComputeTransitionCommand,
  computeExecutorHolderDigest,
  ComputeJobDispatchError,
  readComputePlacementContext,
  type ComputeDispatchStore,
  type ComputeExecutorIdentity,
} from './compute-job-dispatch-service';
import {
  ComputeJobStoreAdmissionError,
  ComputeJobStoreConflictError,
  ComputeJobStoreNotFoundError,
  ComputeJobStoreReadbackError,
  ComputeJobStoreUnavailableError,
  type ComputeBudgetEvidenceEnvelope,
  type ComputeJobProjection,
  type ComputeLeaseUseGuard,
} from './compute-job-store';

const SHA256_LABEL = /^sha256:[a-f0-9]{64}$/;
const RUNNING_DOMAIN = 'holomesh.compute-running-acknowledgement.v1';
const DEFAULT_ADMISSION_TTL_MS = 20_000;
const DEFAULT_HEARTBEAT_TTL_MS = 30_000;
const MAX_FENCING_TOKEN_BYTES = 512;
const MAX_HEARTBEAT_CLOCK_SKEW_MS = 60_000;

type JsonObject = Record<string, unknown>;

export type ComputeJobRunningErrorCode =
  | 'invalid_request'
  | 'executor_identity_invalid'
  | 'job_not_starting'
  | 'job_not_running'
  | 'lease_unauthorized'
  | 'budget_unavailable'
  | 'ownership_conflict'
  | 'service_unavailable'
  | 'committed_readback_failed';

export class ComputeJobRunningError extends Error {
  constructor(
    readonly code: ComputeJobRunningErrorCode,
    message: string,
    readonly details?: readonly string[],
    readonly committed = false
  ) {
    super(message);
    this.name = 'ComputeJobRunningError';
  }
}

export interface MarkComputeJobRunningInput {
  readonly jobId: string;
  readonly attempt: number;
  readonly leaseReceiptId: string;
  /** Caller-owned bytes. The caller remains responsible for zeroing its copy. */
  readonly fencingToken: Uint8Array;
}

export interface HeartbeatComputeJobInput extends MarkComputeJobRunningInput {
  readonly previousOwnershipReceiptId: string;
  /** Executor clock used to make an exact retry deterministic. */
  readonly heartbeatAt: string;
}

export interface MarkComputeJobRunningResult {
  readonly disposition: 'committed' | 'replayed';
  readonly publicResponseBytes: string;
  readonly transitionReceiptId: string;
  readonly jobReceiptId: string;
  readonly state: 'running';
  readonly ownershipReceiptId: string;
  readonly heartbeatAt: string;
  readonly heartbeatValidUntil: string;
  readonly startPermission: 'outbox_after_commit';
  readonly providerReservation: 'not_asserted';
  readonly execution: 'not_asserted';
}

export interface HeartbeatComputeJobResult {
  readonly disposition: 'committed' | 'replayed';
  readonly state: 'running';
  readonly ownershipReceiptId: string;
  readonly sequence: number;
  readonly heartbeatAt: string;
  readonly heartbeatValidUntil: string;
  readonly providerReservation: 'not_asserted';
  readonly execution: 'not_asserted';
}

export interface CreateComputeJobRunningServiceOptions {
  readonly store: ComputeDispatchStore;
  readonly executorIdentity: ComputeExecutorIdentity;
  readonly evidenceTrustAnchors: readonly ComputeEvidenceTrustAnchor[];
  readonly admissionSigner: ComputeJobAdmissionSigner;
  readonly admissionTrustPolicyDigest: string;
  readonly admissionKeyValidUntil: string;
  readonly now?: () => string;
  readonly admissionTtlMs?: number;
  readonly heartbeatTtlMs?: number;
}

export interface ComputeJobRunningService {
  markRunning(input: MarkComputeJobRunningInput): Promise<MarkComputeJobRunningResult>;
  heartbeat(input: HeartbeatComputeJobInput): Promise<HeartbeatComputeJobResult>;
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

function digestBytes(value: string | Uint8Array): string {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function canonicalTimestamp(value: unknown, label: string): string {
  if (typeof value !== 'string') {
    throw new ComputeJobRunningError('service_unavailable', `${label} is not configured`);
  }
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== value) {
    throw new ComputeJobRunningError('invalid_request', `${label} must be a canonical timestamp`);
  }
  return value;
}

function minTimestamp(...values: string[]): string {
  return new Date(Math.min(...values.map((value) => Date.parse(value)))).toISOString();
}

function validateSelector(
  input: MarkComputeJobRunningInput,
  expectedKeys: readonly string[]
): void {
  if (
    !isRecord(input) ||
    canonicalJson(Object.keys(input).sort()) !== canonicalJson(expectedKeys)
  ) {
    throw new ComputeJobRunningError(
      'invalid_request',
      `executor selector accepts only ${expectedKeys.join(', ')}`
    );
  }
  if (!SHA256_LABEL.test(input.jobId) || !SHA256_LABEL.test(input.leaseReceiptId)) {
    throw new ComputeJobRunningError(
      'invalid_request',
      'jobId and leaseReceiptId must be sha256 labels'
    );
  }
  if (!Number.isSafeInteger(input.attempt) || input.attempt < 1) {
    throw new ComputeJobRunningError('invalid_request', 'attempt must be a positive safe integer');
  }
  if (
    !(input.fencingToken instanceof Uint8Array) ||
    input.fencingToken.byteLength < 1 ||
    input.fencingToken.byteLength > MAX_FENCING_TOKEN_BYTES
  ) {
    throw new ComputeJobRunningError(
      'invalid_request',
      'fencingToken must contain bounded binary capability material'
    );
  }
}

function runningIdempotencyKey(input: {
  readonly identity: ComputeExecutorIdentity;
  readonly holderDigest: string;
  readonly jobId: string;
  readonly attempt: number;
  readonly leaseReceiptId: string;
  readonly ownershipReceiptId: string;
}): string {
  return canonicalJson({
    domain: RUNNING_DOMAIN,
    teamId: input.identity.teamId,
    executorId: input.identity.executorId,
    seatId: input.identity.seatId,
    holderDigest: input.holderDigest,
    jobId: input.jobId,
    attempt: input.attempt,
    leaseReceiptId: input.leaseReceiptId,
    ownershipReceiptId: input.ownershipReceiptId,
  });
}

function mapRunningError(error: unknown): never {
  if (error instanceof ComputeJobRunningError) throw error;
  if (error instanceof ComputeJobDispatchError) {
    throw new ComputeJobRunningError(
      error.code === 'executor_identity_invalid'
        ? 'executor_identity_invalid'
        : 'service_unavailable',
      error.message,
      error.details,
      error.committed
    );
  }
  if (error instanceof ComputeJobStoreNotFoundError) {
    throw new ComputeJobRunningError(
      error.resource === 'budget_hold' ? 'budget_unavailable' : 'lease_unauthorized',
      error.message
    );
  }
  if (error instanceof ComputeJobStoreAdmissionError) {
    throw new ComputeJobRunningError('lease_unauthorized', error.message, error.reasonCodes);
  }
  if (error instanceof ComputeJobStoreConflictError) {
    throw new ComputeJobRunningError('ownership_conflict', error.message, [error.code]);
  }
  if (error instanceof ComputeJobStoreReadbackError) {
    throw new ComputeJobRunningError('committed_readback_failed', error.message, undefined, true);
  }
  if (error instanceof ComputeJobStoreUnavailableError) {
    throw new ComputeJobRunningError('service_unavailable', error.message);
  }
  throw error;
}

export function createComputeJobRunningService(
  options: CreateComputeJobRunningServiceOptions
): ComputeJobRunningService {
  if (!SHA256_LABEL.test(options.admissionTrustPolicyDigest)) {
    throw new ComputeJobRunningError(
      'service_unavailable',
      'admission trust policy digest is not configured'
    );
  }
  const admissionKeyValidUntil = canonicalTimestamp(
    options.admissionKeyValidUntil,
    'admissionKeyValidUntil'
  );
  const admissionTtlMs = options.admissionTtlMs ?? DEFAULT_ADMISSION_TTL_MS;
  const heartbeatTtlMs = options.heartbeatTtlMs ?? DEFAULT_HEARTBEAT_TTL_MS;
  if (!Number.isSafeInteger(admissionTtlMs) || admissionTtlMs < 1 || admissionTtlMs > 60_000) {
    throw new ComputeJobRunningError('service_unavailable', 'admissionTtlMs is invalid');
  }
  if (!Number.isSafeInteger(heartbeatTtlMs) || heartbeatTtlMs < 1 || heartbeatTtlMs > 5 * 60_000) {
    throw new ComputeJobRunningError('service_unavailable', 'heartbeatTtlMs is invalid');
  }
  const now = options.now ?? (() => new Date().toISOString());
  const holderDigest = computeExecutorHolderDigest(options.executorIdentity);

  async function authorize(
    input: MarkComputeJobRunningInput,
    state: 'starting' | 'running',
    authorizedAt: string,
    fencingToken: Buffer
  ): Promise<{
    readonly job: ComputeJobProjection;
    readonly context: Awaited<ReturnType<typeof readComputePlacementContext>>;
    readonly activeBudgetHold?: ComputeBudgetEvidenceEnvelope;
    readonly leaseUseGuard: ComputeLeaseUseGuard;
  }> {
    assertComputeExecutorIdentityActive(options.executorIdentity, authorizedAt);
    const teamId = options.executorIdentity.teamId;
    const job = await options.store.readJob({
      teamId,
      jobId: input.jobId,
      attempt: input.attempt,
    });
    const lease = job.receipt.lease;
    if (
      job.receipt.state !== state ||
      !lease ||
      lease.receiptId !== input.leaseReceiptId ||
      lease.holderDigest !== holderDigest
    ) {
      throw new ComputeJobRunningError(
        state === 'starting' ? 'job_not_starting' : 'job_not_running',
        `job is not ${state} under this registered executor lease`
      );
    }
    const context = await readComputePlacementContext(options.store, teamId, job);
    if (!context.lease || !context.leaseEnvelope || context.lease.receiptId !== lease.receiptId) {
      throw new ComputeJobRunningError(
        'lease_unauthorized',
        'durable signed lease evidence does not match the current job'
      );
    }
    const leaseAuthorization = {
      principalDigest: job.receipt.principalDigest,
      jobId: input.jobId,
      attempt: input.attempt,
      holderDigest,
      workUnit: context.workUnit.contract,
      capacitySnapshot: context.capacitySnapshot,
      ...(context.bridgeAdmission ? { bridgeAdmission: context.bridgeAdmission } : {}),
      plan: context.plan,
      lease: context.lease,
      at: authorizedAt,
      trustAnchors: options.evidenceTrustAnchors,
      presentedFencingToken: fencingToken,
      allocationCursor: context.capacity.projection.cursor,
    };
    const authorization = authorizeComputeCapacityLeaseUse(leaseAuthorization);
    if (!authorization.valid) {
      throw new ComputeJobRunningError(
        'lease_unauthorized',
        `lease use authorization failed: ${authorization.errors.join('; ')}`
      );
    }

    let activeBudgetHold: ComputeBudgetEvidenceEnvelope | undefined;
    if (context.workUnit.contract.compute.budget.maxCostMinorUnits > 0) {
      activeBudgetHold = await options.store.readActiveBudgetHold({
        teamId,
        jobId: input.jobId,
        attempt: input.attempt,
      });
      const hold = activeBudgetHold.receipt;
      const verification = verifyComputeBudgetEvidence({
        evidence: hold,
        teamId,
        budgetRailId: hold.budgetRailId,
        principalDigest: job.receipt.principalDigest,
        jobId: input.jobId,
        attempt: input.attempt,
        workUnitDigest: context.workUnit.digest,
        currency: context.workUnit.contract.compute.budget.currency,
        maxAmountMinorUnits: context.workUnit.contract.compute.budget.maxCostMinorUnits,
        policyDigest: hold.policyDigest,
        periodDigest: hold.periodDigest,
        nonceDigest: hold.nonceDigest,
        idempotencyKeyHash: hold.idempotencyKeyHash,
        verifiedAt: authorizedAt,
        trustAnchors: options.evidenceTrustAnchors,
      });
      if (
        canonicalJson(hold) !== activeBudgetHold.bytes ||
        !verification.valid ||
        hold.status !== 'held' ||
        hold.heldAmountMinorUnits !== hold.maxAmountMinorUnits ||
        hold.settledAmountMinorUnits !== 0
      ) {
        throw new ComputeJobRunningError(
          'budget_unavailable',
          'active signed budget hold does not authorize this paid lease'
        );
      }
    }
    return {
      job,
      context,
      ...(activeBudgetHold ? { activeBudgetHold } : {}),
      leaseUseGuard: {
        holderDigest,
        verifiedFencingTokenHash: digestBytes(fencingToken),
        allocation: context.capacity.projection,
        ...(activeBudgetHold ? { activeBudgetHold } : {}),
      },
    };
  }

  async function markRunning(
    input: MarkComputeJobRunningInput
  ): Promise<MarkComputeJobRunningResult> {
    validateSelector(input, ['attempt', 'fencingToken', 'jobId', 'leaseReceiptId']);
    const acknowledgedAt = canonicalTimestamp(now(), 'now()');
    const fencingToken = Buffer.from(input.fencingToken);
    try {
      const authorized = await authorize(input, 'starting', acknowledgedAt, fencingToken);
      const lease = authorized.context.lease;
      const leaseEnvelope = authorized.context.leaseEnvelope;
      if (!lease || !leaseEnvelope) {
        throw new ComputeJobRunningError('lease_unauthorized', 'lease evidence is unavailable');
      }
      const heartbeatValidUntil = minTimestamp(
        admissionKeyValidUntil,
        options.executorIdentity.validUntil,
        lease.expiresAt,
        new Date(Date.parse(acknowledgedAt) + heartbeatTtlMs).toISOString()
      );
      if (Date.parse(heartbeatValidUntil) <= Date.parse(acknowledgedAt)) {
        throw new ComputeJobRunningError(
          'lease_unauthorized',
          'executor ownership has no positive heartbeat window'
        );
      }
      const ownership = createComputeExecutionOwnershipEnvelope(
        prepareAndSignComputeExecutionOwnership(
          {
            kind: 'running_acknowledgement',
            teamId: options.executorIdentity.teamId,
            principalDigest: authorized.job.receipt.principalDigest,
            jobId: input.jobId,
            attempt: input.attempt,
            workUnitDigest: authorized.context.workUnit.digest,
            leaseReceiptId: lease.receiptId,
            holderDigest,
            fencingTokenHash: lease.fencingTokenHash,
            capacityRef: lease.capacityRef,
            fencingEpoch: lease.fencingEpoch,
            sequence: 0,
            acknowledgedAt,
            heartbeatAt: acknowledgedAt,
            heartbeatValidUntil,
            trustPolicyDigest: options.admissionTrustPolicyDigest,
            issuer: options.admissionSigner.issuer,
            keyId: options.admissionSigner.keyId,
          },
          options.admissionSigner
        )
      );
      const prepared = prepareComputeJobTransition({
        expectedJob: authorized.job.receipt,
        action: 'mark_running',
        leaseAuthorization: {
          principalDigest: authorized.job.receipt.principalDigest,
          jobId: input.jobId,
          attempt: input.attempt,
          holderDigest,
          workUnit: authorized.context.workUnit.contract,
          capacitySnapshot: authorized.context.capacitySnapshot,
          ...(authorized.context.bridgeAdmission
            ? { bridgeAdmission: authorized.context.bridgeAdmission }
            : {}),
          plan: authorized.context.plan,
          lease,
          at: acknowledgedAt,
          trustAnchors: options.evidenceTrustAnchors,
          presentedFencingToken: fencingToken,
          allocationCursor: authorized.context.capacity.projection.cursor,
        },
        transitionedAt: acknowledgedAt,
        idempotencyKey: runningIdempotencyKey({
          identity: options.executorIdentity,
          holderDigest,
          jobId: input.jobId,
          attempt: input.attempt,
          leaseReceiptId: input.leaseReceiptId,
          ownershipReceiptId: ownership.receiptId,
        }),
      });
      const admissionValidUntil = minTimestamp(
        admissionKeyValidUntil,
        options.executorIdentity.validUntil,
        lease.expiresAt,
        heartbeatValidUntil,
        new Date(Date.parse(acknowledgedAt) + admissionTtlMs).toISOString()
      );
      const command = buildComputeTransitionCommand({
        operation: 'compute_job.mark_running',
        teamId: options.executorIdentity.teamId,
        expectedJob: authorized.job,
        prepared,
        workUnit: authorized.context.workUnit,
        evidence: [leaseEnvelope],
        admissionSigner: options.admissionSigner,
        admissionTrustPolicyDigest: options.admissionTrustPolicyDigest,
        admissionValidUntil,
        leaseUseGuard: authorized.leaseUseGuard,
        executionOwnership: ownership,
      });
      const committed = await options.store.commitTransition(command);
      if (
        committed.transitionReceiptId !== prepared.transition.receiptId ||
        committed.readBack.jobReceiptId !== prepared.nextJob.receiptId ||
        !committed.readBack.evidenceReceiptIds.includes(ownership.receiptId) ||
        committed.readBack.outboxEventIds.length !== 2
      ) {
        throw new ComputeJobRunningError(
          'committed_readback_failed',
          'running ownership did not read back as the exact committed custody artifacts',
          undefined,
          true
        );
      }
      return {
        disposition: committed.disposition,
        publicResponseBytes: committed.publicResponseBytes,
        transitionReceiptId: committed.transitionReceiptId,
        jobReceiptId: committed.readBack.jobReceiptId,
        state: 'running',
        ownershipReceiptId: ownership.receiptId,
        heartbeatAt: ownership.receipt.heartbeatAt,
        heartbeatValidUntil: ownership.receipt.heartbeatValidUntil,
        startPermission: 'outbox_after_commit',
        providerReservation: 'not_asserted',
        execution: 'not_asserted',
      };
    } catch (error) {
      mapRunningError(error);
    } finally {
      fencingToken.fill(0);
    }
  }

  async function heartbeat(input: HeartbeatComputeJobInput): Promise<HeartbeatComputeJobResult> {
    validateSelector(input, [
      'attempt',
      'fencingToken',
      'heartbeatAt',
      'jobId',
      'leaseReceiptId',
      'previousOwnershipReceiptId',
    ]);
    if (!SHA256_LABEL.test(input.previousOwnershipReceiptId)) {
      throw new ComputeJobRunningError(
        'invalid_request',
        'previousOwnershipReceiptId must be a sha256 label'
      );
    }
    const heartbeatAt = canonicalTimestamp(input.heartbeatAt, 'heartbeatAt');
    const serviceNow = canonicalTimestamp(now(), 'now()');
    if (
      Date.parse(heartbeatAt) > Date.parse(serviceNow) + MAX_HEARTBEAT_CLOCK_SKEW_MS ||
      Date.parse(heartbeatAt) < Date.parse(serviceNow) - heartbeatTtlMs
    ) {
      throw new ComputeJobRunningError(
        'invalid_request',
        'heartbeatAt is outside the bounded executor clock window'
      );
    }
    const fencingToken = Buffer.from(input.fencingToken);
    try {
      const authorized = await authorize(input, 'running', serviceNow, fencingToken);
      const lease = authorized.context.lease;
      if (!lease) throw new ComputeJobRunningError('lease_unauthorized', 'lease is unavailable');
      const previousEvidence = await options.store.readEvidence({
        teamId: options.executorIdentity.teamId,
        jobId: input.jobId,
        attempt: input.attempt,
        receiptIds: [input.previousOwnershipReceiptId],
      });
      const previousEnvelope = previousEvidence[0];
      if (
        !previousEnvelope ||
        previousEnvelope.schemaVersion !== COMPUTE_EXECUTION_OWNERSHIP_SCHEMA_VERSION
      ) {
        throw new ComputeJobRunningError(
          'ownership_conflict',
          'previous execution ownership receipt is unavailable'
        );
      }
      const previous = JSON.parse(previousEnvelope.bytes) as unknown;
      const previousValidation = validateComputeExecutionOwnershipReceipt(previous);
      if (!previousValidation.valid) {
        throw new ComputeJobRunningError(
          'ownership_conflict',
          'previous execution ownership receipt is structurally invalid',
          previousValidation.errors
        );
      }
      const previousReceipt = previous as ComputeExecutionOwnershipReceipt;
      if (
        previousReceipt.receiptId !== input.previousOwnershipReceiptId ||
        previousReceipt.teamId !== options.executorIdentity.teamId ||
        previousReceipt.jobId !== input.jobId ||
        previousReceipt.attempt !== input.attempt ||
        previousReceipt.leaseReceiptId !== lease.receiptId ||
        previousReceipt.holderDigest !== holderDigest ||
        previousReceipt.fencingTokenHash !== lease.fencingTokenHash ||
        previousReceipt.capacityRef !== lease.capacityRef ||
        previousReceipt.fencingEpoch !== lease.fencingEpoch ||
        Date.parse(heartbeatAt) <= Date.parse(previousReceipt.heartbeatAt)
      ) {
        throw new ComputeJobRunningError(
          'ownership_conflict',
          'heartbeat does not advance this executor ownership chain'
        );
      }
      const heartbeatValidUntil = minTimestamp(
        admissionKeyValidUntil,
        options.executorIdentity.validUntil,
        lease.expiresAt,
        new Date(Date.parse(heartbeatAt) + heartbeatTtlMs).toISOString()
      );
      if (Date.parse(heartbeatValidUntil) <= Date.parse(serviceNow)) {
        throw new ComputeJobRunningError('lease_unauthorized', 'heartbeat window is expired');
      }
      const ownership = createComputeExecutionOwnershipEnvelope(
        prepareAndSignComputeExecutionOwnership(
          {
            kind: 'heartbeat',
            teamId: options.executorIdentity.teamId,
            principalDigest: authorized.job.receipt.principalDigest,
            jobId: input.jobId,
            attempt: input.attempt,
            workUnitDigest: authorized.context.workUnit.digest,
            leaseReceiptId: lease.receiptId,
            holderDigest,
            fencingTokenHash: lease.fencingTokenHash,
            capacityRef: lease.capacityRef,
            fencingEpoch: lease.fencingEpoch,
            sequence: previousReceipt.sequence + 1,
            previousReceiptId: previousReceipt.receiptId,
            acknowledgedAt: previousReceipt.acknowledgedAt,
            heartbeatAt,
            heartbeatValidUntil,
            trustPolicyDigest: options.admissionTrustPolicyDigest,
            issuer: options.admissionSigner.issuer,
            keyId: options.admissionSigner.keyId,
          },
          options.admissionSigner
        )
      );
      const committed = await options.store.commitExecutionHeartbeat({
        expectedJob: authorized.job,
        expectedWorkUnit: authorized.context.workUnit,
        previousOwnershipReceiptId: previousReceipt.receiptId,
        ownership,
        leaseUseGuard: authorized.leaseUseGuard,
        outbox: [buildComputeExecutionOwnershipOutboxEnvelope(ownership.receipt)],
      });
      return {
        disposition: committed.disposition,
        state: 'running',
        ownershipReceiptId: committed.ownershipReceiptId,
        sequence: committed.sequence,
        heartbeatAt: committed.heartbeatAt,
        heartbeatValidUntil: committed.heartbeatValidUntil,
        providerReservation: 'not_asserted',
        execution: 'not_asserted',
      };
    } catch (error) {
      mapRunningError(error);
    } finally {
      fencingToken.fill(0);
    }
  }

  return { markRunning, heartbeat };
}
