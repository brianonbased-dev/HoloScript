/**
 * Internal one-time redemption of a sealed logical GPU lease into `starting`.
 *
 * The caller must already possess the fencing preimage recovered from the
 * executor's X25519 envelope. This service validates it in memory, zeros its
 * private copy, and commits only a hash plus exact allocator/budget guards.
 * It does not contact a provider, reserve hardware, or assert GPU execution.
 */

import { createHash } from 'crypto';
import {
  prepareComputeJobTransition,
  verifyComputeBudgetEvidence,
  type ComputeEvidenceTrustAnchor,
} from '@holoscript/core/world-model';
import type { ComputeJobAdmissionSigner } from './compute-job-admission';
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
  ComputeJobStoreConflictError,
  ComputeJobStoreNotFoundError,
  ComputeJobStoreReadbackError,
  ComputeJobStoreUnavailableError,
} from './compute-job-store';

const SHA256_LABEL = /^sha256:[a-f0-9]{64}$/;
const START_DOMAIN = 'holomesh.compute-start-redemption.v1';
const DEFAULT_ADMISSION_TTL_MS = 20_000;
const MAX_FENCING_TOKEN_BYTES = 512;

type JsonObject = Record<string, unknown>;

export type ComputeJobStartErrorCode =
  | 'invalid_request'
  | 'executor_identity_invalid'
  | 'grant_not_redeemable'
  | 'lease_unauthorized'
  | 'budget_unavailable'
  | 'start_conflict'
  | 'service_unavailable'
  | 'committed_readback_failed';

export class ComputeJobStartError extends Error {
  constructor(
    readonly code: ComputeJobStartErrorCode,
    message: string,
    readonly details?: readonly string[],
    readonly committed = false
  ) {
    super(message);
    this.name = 'ComputeJobStartError';
  }
}

export interface StartComputeJobInput {
  readonly jobId: string;
  readonly attempt: number;
  readonly leaseReceiptId: string;
  /** Caller-owned bytes. The caller remains responsible for zeroing its copy. */
  readonly fencingToken: Uint8Array;
}

export interface StartComputeJobResult {
  readonly disposition: 'committed' | 'replayed';
  readonly publicResponseBytes: string;
  readonly transitionReceiptId: string;
  readonly jobReceiptId: string;
  readonly state: 'starting';
  readonly providerReservation: 'not_asserted';
  readonly execution: 'not_asserted';
}

export interface CreateComputeJobStartServiceOptions {
  readonly store: ComputeDispatchStore;
  readonly executorIdentity: ComputeExecutorIdentity;
  readonly evidenceTrustAnchors: readonly ComputeEvidenceTrustAnchor[];
  readonly admissionSigner: ComputeJobAdmissionSigner;
  readonly admissionTrustPolicyDigest: string;
  readonly admissionKeyValidUntil: string;
  readonly now?: () => string;
  readonly admissionTtlMs?: number;
}

export interface ComputeJobStartService {
  start(input: StartComputeJobInput): Promise<StartComputeJobResult>;
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
    throw new ComputeJobStartError('service_unavailable', `${label} is not configured`);
  }
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== value) {
    throw new ComputeJobStartError('service_unavailable', `${label} must be a canonical timestamp`);
  }
  return value;
}

function minTimestamp(...values: string[]): string {
  return new Date(Math.min(...values.map((value) => Date.parse(value)))).toISOString();
}

function validateInput(input: StartComputeJobInput): void {
  if (
    !isRecord(input) ||
    canonicalJson(Object.keys(input).sort()) !==
      canonicalJson(['attempt', 'fencingToken', 'jobId', 'leaseReceiptId'])
  ) {
    throw new ComputeJobStartError(
      'invalid_request',
      'start selector accepts only jobId, attempt, leaseReceiptId, and fencingToken'
    );
  }
  if (!SHA256_LABEL.test(input.jobId) || !SHA256_LABEL.test(input.leaseReceiptId)) {
    throw new ComputeJobStartError(
      'invalid_request',
      'jobId and leaseReceiptId must be sha256 labels'
    );
  }
  if (!Number.isSafeInteger(input.attempt) || input.attempt < 1) {
    throw new ComputeJobStartError('invalid_request', 'attempt must be a positive safe integer');
  }
  if (
    !(input.fencingToken instanceof Uint8Array) ||
    input.fencingToken.byteLength < 1 ||
    input.fencingToken.byteLength > MAX_FENCING_TOKEN_BYTES
  ) {
    throw new ComputeJobStartError(
      'invalid_request',
      'fencingToken must contain bounded binary capability material'
    );
  }
}

function startIdempotencyKey(input: {
  readonly identity: ComputeExecutorIdentity;
  readonly holderDigest: string;
  readonly jobId: string;
  readonly attempt: number;
  readonly leaseReceiptId: string;
}): string {
  return canonicalJson({
    domain: START_DOMAIN,
    teamId: input.identity.teamId,
    executorId: input.identity.executorId,
    seatId: input.identity.seatId,
    holderDigest: input.holderDigest,
    jobId: input.jobId,
    attempt: input.attempt,
    leaseReceiptId: input.leaseReceiptId,
  });
}

function mapStartError(error: unknown): never {
  if (error instanceof ComputeJobStartError) throw error;
  if (error instanceof ComputeJobDispatchError) {
    throw new ComputeJobStartError(
      error.code === 'executor_identity_invalid'
        ? 'executor_identity_invalid'
        : 'service_unavailable',
      error.message,
      error.details,
      error.committed
    );
  }
  if (error instanceof ComputeJobStoreNotFoundError) {
    throw new ComputeJobStartError(
      error.resource === 'budget_hold' ? 'budget_unavailable' : 'grant_not_redeemable',
      error.message
    );
  }
  if (error instanceof ComputeJobStoreConflictError) {
    throw new ComputeJobStartError('start_conflict', error.message, [error.code]);
  }
  if (error instanceof ComputeJobStoreReadbackError) {
    throw new ComputeJobStartError('committed_readback_failed', error.message, undefined, true);
  }
  if (error instanceof ComputeJobStoreUnavailableError) {
    throw new ComputeJobStartError('service_unavailable', error.message);
  }
  throw error;
}

export function createComputeJobStartService(
  options: CreateComputeJobStartServiceOptions
): ComputeJobStartService {
  if (!SHA256_LABEL.test(options.admissionTrustPolicyDigest)) {
    throw new ComputeJobStartError(
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
    throw new ComputeJobStartError('service_unavailable', 'admissionTtlMs is invalid');
  }
  const now = options.now ?? (() => new Date().toISOString());
  const holderDigest = computeExecutorHolderDigest(options.executorIdentity);

  async function start(input: StartComputeJobInput): Promise<StartComputeJobResult> {
    validateInput(input);
    const startedAt = canonicalTimestamp(now(), 'now()');
    try {
      assertComputeExecutorIdentityActive(options.executorIdentity, startedAt);
      const teamId = options.executorIdentity.teamId;
      const job = await options.store.readJob({
        teamId,
        jobId: input.jobId,
        attempt: input.attempt,
      });
      const lease = job.receipt.lease;
      if (
        job.receipt.state !== 'leased' ||
        !lease ||
        lease.receiptId !== input.leaseReceiptId ||
        lease.holderDigest !== holderDigest
      ) {
        throw new ComputeJobStartError(
          'grant_not_redeemable',
          'grant does not match one current lease held by this registered executor'
        );
      }
      const context = await readComputePlacementContext(options.store, teamId, job);
      if (!context.lease || !context.leaseEnvelope || context.lease.receiptId !== lease.receiptId) {
        throw new ComputeJobStartError(
          'lease_unauthorized',
          'durable signed lease evidence does not match the current job'
        );
      }

      let activeBudgetHold;
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
          verifiedAt: startedAt,
          trustAnchors: options.evidenceTrustAnchors,
        });
        if (
          canonicalJson(hold) !== activeBudgetHold.bytes ||
          !verification.valid ||
          hold.status !== 'held' ||
          hold.heldAmountMinorUnits !== hold.maxAmountMinorUnits ||
          hold.settledAmountMinorUnits !== 0
        ) {
          throw new ComputeJobStartError(
            'budget_unavailable',
            'active signed budget hold does not authorize this paid lease'
          );
        }
      }

      const fencingToken = Buffer.from(input.fencingToken);
      try {
        let prepared;
        try {
          prepared = prepareComputeJobTransition({
            expectedJob: job.receipt,
            action: 'start',
            leaseAuthorization: {
              principalDigest: job.receipt.principalDigest,
              jobId: input.jobId,
              attempt: input.attempt,
              holderDigest,
              workUnit: context.workUnit.contract,
              capacitySnapshot: context.capacitySnapshot,
              ...(context.bridgeAdmission ? { bridgeAdmission: context.bridgeAdmission } : {}),
              plan: context.plan,
              lease: context.lease,
              at: startedAt,
              trustAnchors: options.evidenceTrustAnchors,
              presentedFencingToken: fencingToken,
              allocationCursor: context.capacity.projection.cursor,
            },
            transitionedAt: startedAt,
            idempotencyKey: startIdempotencyKey({
              identity: options.executorIdentity,
              holderDigest,
              jobId: input.jobId,
              attempt: input.attempt,
              leaseReceiptId: input.leaseReceiptId,
            }),
          });
        } catch (error) {
          throw new ComputeJobStartError(
            'lease_unauthorized',
            `lease start authorization failed: ${(error as Error).message}`
          );
        }
        const admissionValidUntil = minTimestamp(
          admissionKeyValidUntil,
          options.executorIdentity.validUntil,
          lease.expiresAt,
          new Date(Date.parse(startedAt) + admissionTtlMs).toISOString()
        );
        const command = buildComputeTransitionCommand({
          operation: 'compute_job.start',
          teamId,
          expectedJob: job,
          prepared,
          workUnit: context.workUnit,
          evidence: [context.leaseEnvelope],
          admissionSigner: options.admissionSigner,
          admissionTrustPolicyDigest: options.admissionTrustPolicyDigest,
          admissionValidUntil,
          leaseUseGuard: {
            holderDigest,
            verifiedFencingTokenHash: digestBytes(fencingToken),
            allocation: context.capacity.projection,
            ...(activeBudgetHold ? { activeBudgetHold } : {}),
          },
        });
        const committed = await options.store.commitTransition(command);
        if (
          committed.transitionReceiptId !== prepared.transition.receiptId ||
          committed.readBack.jobReceiptId !== prepared.nextJob.receiptId ||
          committed.readBack.admissionReceiptId !== command.admission.receipt.receiptId
        ) {
          throw new ComputeJobStartError(
            'committed_readback_failed',
            'starting job did not read back as the exact committed custody artifacts',
            undefined,
            true
          );
        }
        return {
          disposition: committed.disposition,
          publicResponseBytes: committed.publicResponseBytes,
          transitionReceiptId: committed.transitionReceiptId,
          jobReceiptId: committed.readBack.jobReceiptId,
          state: 'starting',
          providerReservation: 'not_asserted',
          execution: 'not_asserted',
        };
      } finally {
        fencingToken.fill(0);
      }
    } catch (error) {
      mapStartError(error);
    }
  }

  return { start };
}
