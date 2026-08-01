/**
 * User-facing @compute admission service backed by HoloMesh Fleet evidence.
 *
 * This is deliberately a control-plane service. It compiles authored HoloScript,
 * authenticates the caller, normalizes a current Fleet observation, and commits
 * durable lifecycle custody. It does not reserve provider capacity or assert that
 * execution occurred.
 */

import {
  createHash,
  createPrivateKey,
  createPublicKey,
  sign as signMessage,
  type KeyObject,
} from 'crypto';
import { Pool } from 'pg';
import {
  compileComputeWorkUnits,
  computeWorkUnitDigest,
  type ComputeDataClassification,
  type ComputeWorkUnitContract,
} from '@holoscript/core/compiler';
import { parseHoloStrict } from '@holoscript/core/parser';
import {
  buildComputeBridgeAdmission,
  buildComputeCapacitySnapshot,
  computeCapacityAllocationEtag,
  computeJobIdempotencyKeyHash,
  planComputePlacement,
  prepareComputeJob,
  prepareComputeJobTransition,
  type ComputeCapacityAllocationCursor,
  type ComputeEvidenceRole,
  type ComputeEvidenceSigner,
  type ComputeEvidenceTrustAnchor,
} from '@holoscript/core/world-model';
import {
  COMPUTE_JOB_ADMISSION_TRUST_ANCHOR_SCHEMA_VERSION,
  createComputeJobAdmissionEnvelope,
  prepareAndSignComputeJobAdmission,
  type ComputeJobAdmissionSigner,
  type ComputeJobAdmissionTrustAnchor,
} from './compute-job-admission';
import {
  buildComputeJobOutboxEnvelope,
  buildComputeJobPublicResponseBytes,
  ComputeJobStoreConflictError,
  ComputeJobStoreNotFoundError,
  ComputeJobStoreReadbackError,
  ComputeJobStoreUnavailableError,
  PostgresComputeJobStore,
  type CommitComputeJobTransitionCommand,
  type ComputeJobStorePool,
  type ComputeWorkUnitEnvelope,
  type CreateComputeJobCommand,
  type ReadComputeJobInput,
  type RegisterComputeCapacityCommand,
  type RegisteredComputeCapacity,
} from './compute-job-store';
import {
  normalizeComputeFleetCapacity,
  type ComputeFleetDataPolicy,
  type ComputeFleetResourceEligibilityBinding,
} from './compute-fleet-adapter';
import { createHoloMeshPostgresPoolOptions } from './postgres-pool-options';
import { teamStore } from './state';
import type { TeamFleetSnapshotRecord } from './types';

const SHA256_LABEL = /^sha256:[a-f0-9]{64}$/;
const MAX_SOURCE_BYTES = 256 * 1024;
const DEFAULT_ADMISSION_TTL_MS = 20_000;
const DEFAULT_QUOTE_TTL_MS = 30_000;
const COMPUTE_PRINCIPAL_DOMAIN = 'holomesh.compute-principal.v1';
const COMPUTE_JOB_ID_DOMAIN = 'holomesh.compute-job-id.v1';
const COMPUTE_SEMANTIC_REQUEST_DOMAIN = 'holomesh.compute-submit-request.v1';
const ALL_EVIDENCE_ROLES: readonly ComputeEvidenceRole[] = [
  'capacity_observer',
  'bridge_admitter',
  'placement_planner',
  'lease_issuer',
  'execution_attestor',
];
const DATA_CLASSIFICATIONS = new Set<ComputeDataClassification>([
  'public',
  'internal',
  'confidential',
  'restricted',
]);

type JsonObject = Record<string, unknown>;

export type ComputeJobServiceErrorCode =
  | 'invalid_request'
  | 'invalid_source'
  | 'ambiguous_work_unit'
  | 'identity_unavailable'
  | 'job_not_found'
  | 'job_hidden'
  | 'job_conflict'
  | 'capacity_unavailable'
  | 'placement_rejected'
  | 'running_cancellation_requires_executor_evidence'
  | 'service_unavailable'
  | 'committed_readback_failed';

export class ComputeJobServiceError extends Error {
  constructor(
    readonly code: ComputeJobServiceErrorCode,
    message: string,
    readonly details?: readonly string[],
    readonly committed = false
  ) {
    super(message);
    this.name = 'ComputeJobServiceError';
  }
}

export interface ComputeJobCaller {
  readonly teamId: string;
  readonly agentId: string;
  readonly walletAddress: string;
  readonly canOperate: boolean;
}

export interface SubmitComputeJobInput extends ComputeJobCaller {
  /** Exact authored HoloScript source. The server compiles the WorkUnit. */
  readonly sourceText: string;
  readonly idempotencyKey: string;
}

export interface ReadComputeJobStatusInput extends ComputeJobCaller {
  readonly jobId: string;
  readonly attempt: number;
}

export interface CancelComputeJobInput extends ReadComputeJobStatusInput {
  readonly expectedJobReceiptId: string;
  readonly idempotencyKey: string;
}

export interface ComputeJobUserService {
  submit(input: SubmitComputeJobInput): Promise<string>;
  status(input: ReadComputeJobStatusInput): Promise<string>;
  cancel(input: CancelComputeJobInput): Promise<string>;
}

export interface ComputeCapacityBindingConfig {
  readonly teamId: string;
  readonly capacityRef: string;
  readonly instanceId: number;
  readonly allowedDataClassifications: readonly ComputeDataClassification[];
  readonly eligibilityValidUntil: string;
  readonly dataPolicyValidUntil: string;
}

interface ComputeCustodyStore {
  readJob(input: ReadComputeJobInput): ReturnType<PostgresComputeJobStore['readJob']>;
  readWorkUnit(teamId: string, digest: string): Promise<ComputeWorkUnitEnvelope>;
  readRegisteredCapacity(input: {
    readonly teamId: string;
    readonly capacityRef: string;
  }): Promise<RegisteredComputeCapacity>;
  registerCapacity(
    command: RegisterComputeCapacityCommand
  ): ReturnType<PostgresComputeJobStore['registerCapacity']>;
  createJob(command: CreateComputeJobCommand): ReturnType<PostgresComputeJobStore['createJob']>;
  commitTransition(
    command: CommitComputeJobTransitionCommand
  ): ReturnType<PostgresComputeJobStore['commitTransition']>;
}

export interface CreateComputeJobUserServiceOptions {
  readonly storeFor: (scope: {
    readonly teamId: string;
    readonly principalDigest: string;
  }) => Promise<ComputeCustodyStore>;
  readonly getFleetRecord: (teamId: string) => TeamFleetSnapshotRecord | undefined;
  readonly getCapacityBinding: (teamId: string) => ComputeCapacityBindingConfig | undefined;
  readonly allowedFleetSources: readonly string[];
  readonly allowedFleetPublisherAgentIds: readonly string[];
  readonly evidenceSigner: ComputeEvidenceSigner;
  readonly evidencePublicKeyPem: string;
  readonly evidenceKeyValidFrom: string;
  readonly evidenceKeyValidUntil: string;
  readonly admissionSigner: ComputeJobAdmissionSigner;
  readonly admissionTrustPolicyDigest: string;
  readonly now?: () => string;
  readonly admissionTtlMs?: number;
  readonly quoteTtlMs?: number;
}

function isRecord(value: unknown): value is JsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function canonicalize(value: unknown): unknown {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value))
      throw new TypeError('canonical JSON cannot contain non-finite numbers');
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

function digestCanonical(value: unknown): string {
  return digestBytes(canonicalJson(value));
}

function canonicalTimestamp(value: string, label: string): string {
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds) || new Date(milliseconds).toISOString() !== value) {
    throw new ComputeJobServiceError(
      'service_unavailable',
      `${label} must be a canonical timestamp`
    );
  }
  return value;
}

function requiredText(value: string, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new ComputeJobServiceError('invalid_request', `${label} is required`);
  }
  return value.trim();
}

/** Stable across bearer-key rotation; no token material enters the digest. */
export function computeCallerPrincipalDigest(input: {
  readonly teamId: string;
  readonly agentId: string;
  readonly walletAddress: string;
}): string {
  const teamId = requiredText(input.teamId, 'teamId');
  const agentId = requiredText(input.agentId, 'agentId');
  const walletAddress = requiredText(input.walletAddress, 'walletAddress').toLowerCase();
  return digestCanonical({
    domain: COMPUTE_PRINCIPAL_DOMAIN,
    teamId,
    agentId,
    walletAddress,
  });
}

function computeJobId(input: {
  readonly teamId: string;
  readonly principalDigest: string;
  readonly idempotencyKeyDigest: string;
}): string {
  return digestCanonical({ domain: COMPUTE_JOB_ID_DOMAIN, ...input });
}

function compileSingleWorkUnit(sourceText: string): ComputeWorkUnitContract {
  if (typeof sourceText !== 'string' || Buffer.byteLength(sourceText, 'utf8') > MAX_SOURCE_BYTES) {
    throw new ComputeJobServiceError(
      'invalid_source',
      `source_text must be UTF-8 HoloScript no larger than ${MAX_SOURCE_BYTES} bytes`
    );
  }
  try {
    const composition = parseHoloStrict(sourceText);
    const units = compileComputeWorkUnits(composition, { sourceText });
    if (units.length !== 1) {
      throw new ComputeJobServiceError(
        'ambiguous_work_unit',
        'source_text must compile to exactly one intent-bearing @compute WorkUnit'
      );
    }
    return units[0].workUnit;
  } catch (error) {
    if (error instanceof ComputeJobServiceError) throw error;
    throw new ComputeJobServiceError(
      'invalid_source',
      `source_text did not compile to a compute WorkUnit: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

function evidenceEnvelope(value: { readonly receiptId: string; readonly schemaVersion: string }) {
  return {
    receiptId: value.receiptId,
    schemaVersion: value.schemaVersion,
    bytes: canonicalJson(value),
  };
}

function workUnitEnvelope(workUnit: ComputeWorkUnitContract): ComputeWorkUnitEnvelope {
  return {
    digest: computeWorkUnitDigest(workUnit),
    contract: workUnit,
    bytes: canonicalJson(workUnit),
  };
}

function eligibilityFrom(
  binding: ComputeCapacityBindingConfig
): ComputeFleetResourceEligibilityBinding {
  return {
    schemaVersion: 'holoscript.compute-fleet-resource-eligibility.v1',
    capacityRef: binding.capacityRef,
    provider: 'vast.ai',
    instanceId: binding.instanceId,
    eligible: true,
    validUntil: binding.eligibilityValidUntil,
  };
}

function dataPolicyFrom(binding: ComputeCapacityBindingConfig): ComputeFleetDataPolicy {
  return {
    schemaVersion: 'holoscript.compute-fleet-data-policy.v1',
    capacityRef: binding.capacityRef,
    allowedDataClassifications: [...binding.allowedDataClassifications],
    validUntil: binding.dataPolicyValidUntil,
  };
}

function initialAllocation(capacityRef: string): ComputeCapacityAllocationCursor {
  const body = {
    capacityRef,
    slotState: 'available' as const,
    currentEpoch: 0,
    version: 0,
  };
  return { ...body, etag: computeCapacityAllocationEtag(body) };
}

function evidenceTrustAnchor(
  options: CreateComputeJobUserServiceOptions,
  principalDigest: string,
  capacityRef: string
): ComputeEvidenceTrustAnchor {
  return {
    issuer: options.evidenceSigner.issuer,
    keyId: options.evidenceSigner.keyId,
    algorithm: 'ed25519',
    roles: ALL_EVIDENCE_ROLES,
    principalDigests: [principalDigest],
    lanes: ['managed_bridge'],
    capacityRefs: [capacityRef],
    validFrom: options.evidenceKeyValidFrom,
    validUntil: options.evidenceKeyValidUntil,
    publicKeyPem: options.evidencePublicKeyPem,
  };
}

function minTimestamp(...values: string[]): string {
  return new Date(Math.min(...values.map((value) => Date.parse(value)))).toISOString();
}

function serviceError(error: unknown): never {
  if (error instanceof ComputeJobServiceError) throw error;
  if (error instanceof ComputeJobStoreNotFoundError) {
    throw new ComputeJobServiceError(
      error.resource === 'job' ? 'job_not_found' : 'capacity_unavailable',
      error.message
    );
  }
  if (error instanceof ComputeJobStoreConflictError) {
    throw new ComputeJobServiceError('job_conflict', error.message, [error.code]);
  }
  if (error instanceof ComputeJobStoreReadbackError) {
    throw new ComputeJobServiceError('committed_readback_failed', error.message, undefined, true);
  }
  if (error instanceof ComputeJobStoreUnavailableError) {
    throw new ComputeJobServiceError('service_unavailable', error.message);
  }
  throw error;
}

async function readRegisteredOrInitialCapacity(
  store: ComputeCustodyStore,
  teamId: string,
  binding: ComputeCapacityBindingConfig
): Promise<{ capacity: RegisteredComputeCapacity; needsRegistration: boolean }> {
  try {
    return {
      capacity: await store.readRegisteredCapacity({ teamId, capacityRef: binding.capacityRef }),
      needsRegistration: false,
    };
  } catch (error) {
    if (!(error instanceof ComputeJobStoreNotFoundError) || error.resource !== 'capacity')
      throw error;
    const eligibility = eligibilityFrom(binding);
    const dataPolicy = dataPolicyFrom(binding);
    const cursor = initialAllocation(binding.capacityRef);
    return {
      capacity: {
        projection: {
          teamId,
          lane: 'managed_bridge',
          cursor,
          bytes: canonicalJson(cursor),
        },
        eligibility: eligibility as RegisteredComputeCapacity['eligibility'],
        eligibilityBytes: canonicalJson(eligibility),
        dataPolicy,
        dataPolicyBytes: canonicalJson(dataPolicy),
      },
      needsRegistration: true,
    };
  }
}

export function createComputeJobUserService(
  options: CreateComputeJobUserServiceOptions
): ComputeJobUserService {
  if (!Array.isArray(options.allowedFleetSources) || options.allowedFleetSources.length === 0) {
    throw new ComputeJobServiceError(
      'service_unavailable',
      'allowed Fleet sources are not configured'
    );
  }
  if (
    !Array.isArray(options.allowedFleetPublisherAgentIds) ||
    options.allowedFleetPublisherAgentIds.length === 0
  ) {
    throw new ComputeJobServiceError(
      'service_unavailable',
      'allowed Fleet publishers are not configured'
    );
  }
  if (!SHA256_LABEL.test(options.admissionTrustPolicyDigest)) {
    throw new ComputeJobServiceError(
      'service_unavailable',
      'admission trust policy digest is not configured'
    );
  }
  canonicalTimestamp(options.evidenceKeyValidFrom, 'evidenceKeyValidFrom');
  canonicalTimestamp(options.evidenceKeyValidUntil, 'evidenceKeyValidUntil');
  const now = options.now ?? (() => new Date().toISOString());
  const admissionTtlMs = options.admissionTtlMs ?? DEFAULT_ADMISSION_TTL_MS;
  const quoteTtlMs = options.quoteTtlMs ?? DEFAULT_QUOTE_TTL_MS;
  if (!Number.isSafeInteger(admissionTtlMs) || admissionTtlMs < 1 || admissionTtlMs > 60_000) {
    throw new ComputeJobServiceError('service_unavailable', 'admissionTtlMs is invalid');
  }
  if (!Number.isSafeInteger(quoteTtlMs) || quoteTtlMs < 1 || quoteTtlMs > 60_000) {
    throw new ComputeJobServiceError('service_unavailable', 'quoteTtlMs is invalid');
  }

  async function submit(input: SubmitComputeJobInput): Promise<string> {
    const principalDigest = computeCallerPrincipalDigest(input);
    const idempotencyKey = requiredText(input.idempotencyKey, 'idempotency_key');
    const idempotencyKeyDigest = computeJobIdempotencyKeyHash(idempotencyKey);
    const workUnit = compileSingleWorkUnit(input.sourceText);
    const semanticRequestDigest = digestCanonical({
      domain: COMPUTE_SEMANTIC_REQUEST_DOMAIN,
      teamId: input.teamId,
      principalDigest,
      sourceDigest: digestBytes(input.sourceText),
    });
    const binding = options.getCapacityBinding(input.teamId);
    const record = options.getFleetRecord(input.teamId);
    if (!binding || !record) {
      throw new ComputeJobServiceError(
        'capacity_unavailable',
        'no current server-admitted Fleet capacity is configured for this team'
      );
    }
    const preparedAt = canonicalTimestamp(now(), 'now()');
    const store = await options.storeFor({ teamId: input.teamId, principalDigest });
    try {
      const registered = await readRegisteredOrInitialCapacity(store, input.teamId, binding);
      const normalization = normalizeComputeFleetCapacity({
        record,
        allowedSources: options.allowedFleetSources,
        allowedPublisherAgentIds: options.allowedFleetPublisherAgentIds,
        resourceEligibility: registered.capacity.eligibility,
        workUnit,
        dataPolicy: registered.capacity.dataPolicy,
        allocationCursor: registered.capacity.projection.cursor,
        signer: options.evidenceSigner,
        now: preparedAt,
        quoteExpiresAt: new Date(Date.parse(preparedAt) + quoteTtlMs).toISOString(),
      });
      if (!normalization.ok) {
        throw new ComputeJobServiceError(
          'placement_rejected',
          'current Fleet evidence did not admit this WorkUnit',
          normalization.reasonCodes
        );
      }
      const capacitySnapshot = buildComputeCapacitySnapshot(normalization.capacityInput);
      if (registered.needsRegistration) {
        await store.registerCapacity({
          projection: registered.capacity.projection,
          eligibility: registered.capacity.eligibility,
          eligibilityBytes: registered.capacity.eligibilityBytes,
          dataPolicy: registered.capacity.dataPolicy,
          dataPolicyBytes: registered.capacity.dataPolicyBytes,
          registeredAt: preparedAt,
        });
      }

      const trustAnchors = [evidenceTrustAnchor(options, principalDigest, binding.capacityRef)];
      const bridgeAdmission = buildComputeBridgeAdmission({
        principalDigest,
        bridgeRef: binding.capacityRef,
        workUnitDigest: computeWorkUnitDigest(workUnit),
        dataClassification: workUnit.compute.policy.dataClassification,
        budget: {
          currency: workUnit.compute.budget.currency,
          maxCostMinorUnits: workUnit.compute.budget.maxCostMinorUnits,
        },
        verdict: 'admitted',
        reason: 'policy_admitted',
        issuedAt: preparedAt,
        validUntil: capacitySnapshot.validUntil,
        signer: options.evidenceSigner,
      });
      const plan = planComputePlacement({
        principalDigest,
        workUnit,
        capacitySnapshot,
        bridgeAdmission,
        checkedAt: preparedAt,
        trustAnchors,
        signer: options.evidenceSigner,
      });
      if (plan.verdict !== 'admitted') {
        throw new ComputeJobServiceError(
          'placement_rejected',
          'placement plan rejected this WorkUnit',
          plan.reasonCodes
        );
      }
      const jobId = computeJobId({
        teamId: input.teamId,
        principalDigest,
        idempotencyKeyDigest,
      });
      const prepared = prepareComputeJob({
        principalDigest,
        jobId,
        attempt: 1,
        workUnit,
        placementVerification: {
          principalDigest,
          workUnit,
          capacitySnapshot,
          bridgeAdmission,
          plan,
          checkedAt: plan.checkedAt,
          verifiedAt: preparedAt,
          trustAnchors,
        },
        preparedAt,
        idempotencyKey,
      });
      const evidence = [capacitySnapshot, bridgeAdmission, plan].map(evidenceEnvelope);
      const admissionValidUntil = minTimestamp(
        plan.validUntil,
        options.evidenceKeyValidUntil,
        new Date(Date.parse(preparedAt) + admissionTtlMs).toISOString()
      );
      const admission = createComputeJobAdmissionEnvelope(
        prepareAndSignComputeJobAdmission(
          {
            teamId: input.teamId,
            principalDigest,
            jobId,
            attempt: 1,
            operation: 'compute_job.create',
            requestDigest: prepared.requestBinding.requestHash,
            workUnit,
            evidence,
            trustPolicyDigest: options.admissionTrustPolicyDigest,
            lifecycle: { kind: 'create', createdJobReceiptId: prepared.job.receiptId },
            verifiedAt: preparedAt,
            validUntil: admissionValidUntil,
            issuer: options.admissionSigner.issuer,
            keyId: options.admissionSigner.keyId,
          },
          options.admissionSigner
        )
      );
      const jobProjection = {
        teamId: input.teamId,
        receipt: prepared.job,
        bytes: canonicalJson(prepared.job),
      };
      const artifacts = { job: prepared.job };
      const command: CreateComputeJobCommand = {
        operation: 'compute_job.create',
        idempotencyKeyDigest,
        semanticRequestDigest,
        requestDigest: prepared.requestBinding.requestHash,
        job: jobProjection,
        workUnit: workUnitEnvelope(workUnit),
        evidence,
        admission,
        outbox: [buildComputeJobOutboxEnvelope(artifacts)],
        publicResponseBytes: buildComputeJobPublicResponseBytes(artifacts),
      };
      return (await store.createJob(command)).publicResponseBytes;
    } catch (error) {
      serviceError(error);
    }
  }

  async function status(input: ReadComputeJobStatusInput): Promise<string> {
    if (
      !SHA256_LABEL.test(input.jobId) ||
      !Number.isSafeInteger(input.attempt) ||
      input.attempt < 1
    ) {
      throw new ComputeJobServiceError('invalid_request', 'jobId or attempt is invalid');
    }
    const principalDigest = computeCallerPrincipalDigest(input);
    const store = await options.storeFor({ teamId: input.teamId, principalDigest });
    try {
      const job = await store.readJob({
        teamId: input.teamId,
        jobId: input.jobId,
        attempt: input.attempt,
      });
      if (job.receipt.principalDigest !== principalDigest && !input.canOperate) {
        throw new ComputeJobServiceError('job_hidden', 'compute job not found');
      }
      return buildComputeJobPublicResponseBytes({ job: job.receipt });
    } catch (error) {
      serviceError(error);
    }
  }

  async function cancel(input: CancelComputeJobInput): Promise<string> {
    if (!SHA256_LABEL.test(input.expectedJobReceiptId)) {
      throw new ComputeJobServiceError('invalid_request', 'expected_job_receipt_id is invalid');
    }
    const principalDigest = computeCallerPrincipalDigest(input);
    const idempotencyKey = requiredText(input.idempotencyKey, 'idempotency_key');
    const store = await options.storeFor({ teamId: input.teamId, principalDigest });
    try {
      const expected = await store.readJob({
        teamId: input.teamId,
        jobId: input.jobId,
        attempt: input.attempt,
      });
      if (expected.receipt.principalDigest !== principalDigest && !input.canOperate) {
        throw new ComputeJobServiceError('job_hidden', 'compute job not found');
      }
      if (expected.receipt.receiptId !== input.expectedJobReceiptId) {
        throw new ComputeJobServiceError(
          'job_conflict',
          'expected_job_receipt_id is not the current durable job receipt'
        );
      }
      if (['succeeded', 'failed', 'cancelled'].includes(expected.receipt.state)) {
        return buildComputeJobPublicResponseBytes({ job: expected.receipt });
      }
      if (expected.receipt.state !== 'preflighted' && expected.receipt.state !== 'queued') {
        throw new ComputeJobServiceError(
          'running_cancellation_requires_executor_evidence',
          'leased, starting, or running jobs require the executor acknowledgement path'
        );
      }
      const operationStore =
        expected.receipt.principalDigest === principalDigest
          ? store
          : await options.storeFor({
              teamId: input.teamId,
              principalDigest: expected.receipt.principalDigest,
            });
      const transitionedAt = canonicalTimestamp(now(), 'now()');
      const prepared = prepareComputeJobTransition({
        expectedJob: expected.receipt,
        action: 'cancel',
        reasonCode: 'user_cancelled',
        transitionedAt,
        idempotencyKey,
      });
      const workUnit = await operationStore.readWorkUnit(
        input.teamId,
        expected.receipt.workUnit.digest
      );
      const requestDigest = prepared.transition.request.requestHash;
      const admissionValidUntil = minTimestamp(
        options.evidenceKeyValidUntil,
        new Date(Date.parse(transitionedAt) + admissionTtlMs).toISOString()
      );
      const admission = createComputeJobAdmissionEnvelope(
        prepareAndSignComputeJobAdmission(
          {
            teamId: input.teamId,
            principalDigest: expected.receipt.principalDigest,
            jobId: input.jobId,
            attempt: input.attempt,
            operation: 'compute_job.cancel',
            requestDigest,
            workUnit: workUnit.contract,
            evidence: [],
            trustPolicyDigest: options.admissionTrustPolicyDigest,
            lifecycle: {
              kind: 'transition',
              expectedJobReceiptId: expected.receipt.receiptId,
              nextJobReceiptId: prepared.nextJob.receiptId,
              transitionReceiptId: prepared.transition.receiptId,
            },
            verifiedAt: transitionedAt,
            validUntil: admissionValidUntil,
            issuer: options.admissionSigner.issuer,
            keyId: options.admissionSigner.keyId,
          },
          options.admissionSigner
        )
      );
      const artifacts = { job: prepared.nextJob, transition: prepared.transition };
      const command: CommitComputeJobTransitionCommand = {
        operation: 'compute_job.cancel',
        idempotencyKeyDigest: prepared.transition.request.idempotencyKeyHash,
        requestDigest,
        expectedJob: expected,
        nextJob: {
          teamId: input.teamId,
          receipt: prepared.nextJob,
          bytes: canonicalJson(prepared.nextJob),
        },
        expectedWorkUnit: workUnit,
        evidence: [],
        admission,
        transition: {
          receipt: prepared.transition,
          bytes: canonicalJson(prepared.transition),
        },
        outbox: [buildComputeJobOutboxEnvelope(artifacts)],
        publicResponseBytes: buildComputeJobPublicResponseBytes(artifacts),
      };
      return (await operationStore.commitTransition(command)).publicResponseBytes;
    } catch (error) {
      serviceError(error);
    }
  }

  return { submit, status, cancel };
}

interface EnvironmentCapacityBinding {
  teamId?: unknown;
  capacityRef?: unknown;
  instanceId?: unknown;
  allowedDataClassifications?: unknown;
  eligibilityValidUntil?: unknown;
  dataPolicyValidUntil?: unknown;
}

function environmentList(name: string): string[] {
  return (process.env[name] ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

function environmentText(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new ComputeJobServiceError('service_unavailable', `${name} is required`);
  return value;
}

function privateKeyFromEnvironment(): KeyObject {
  const base64 = process.env.HOLOMESH_COMPUTE_ED25519_PRIVATE_KEY_B64?.trim();
  const pem = process.env.HOLOMESH_COMPUTE_ED25519_PRIVATE_KEY_PEM;
  try {
    const key = base64
      ? createPrivateKey({ key: Buffer.from(base64, 'base64'), format: 'der', type: 'pkcs8' })
      : createPrivateKey((pem ?? '').replace(/\\n/g, '\n'));
    if (key.asymmetricKeyType !== 'ed25519') throw new Error('key is not Ed25519');
    return key;
  } catch (error) {
    throw new ComputeJobServiceError(
      'service_unavailable',
      `compute signing key is unavailable: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

function capacityBindingsFromEnvironment(): Map<string, ComputeCapacityBindingConfig> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(environmentText('HOLOMESH_COMPUTE_CAPACITY_BINDINGS_JSON'));
  } catch (error) {
    if (error instanceof ComputeJobServiceError) throw error;
    throw new ComputeJobServiceError(
      'service_unavailable',
      'HOLOMESH_COMPUTE_CAPACITY_BINDINGS_JSON is invalid JSON'
    );
  }
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new ComputeJobServiceError(
      'service_unavailable',
      'at least one capacity binding is required'
    );
  }
  const result = new Map<string, ComputeCapacityBindingConfig>();
  for (const raw of parsed as EnvironmentCapacityBinding[]) {
    const teamId = typeof raw.teamId === 'string' ? raw.teamId.trim() : '';
    const capacityRef = typeof raw.capacityRef === 'string' ? raw.capacityRef : '';
    const instanceId = raw.instanceId;
    const eligibilityValidUntil =
      typeof raw.eligibilityValidUntil === 'string' ? raw.eligibilityValidUntil : '';
    const dataPolicyValidUntil =
      typeof raw.dataPolicyValidUntil === 'string' ? raw.dataPolicyValidUntil : '';
    const rawClassifications = Array.isArray(raw.allowedDataClassifications)
      ? raw.allowedDataClassifications
      : [];
    const classifications = rawClassifications.filter(
      (entry): entry is ComputeDataClassification =>
        typeof entry === 'string' && DATA_CLASSIFICATIONS.has(entry as ComputeDataClassification)
    );
    if (
      !teamId ||
      !SHA256_LABEL.test(capacityRef) ||
      !Number.isSafeInteger(instanceId) ||
      (instanceId as number) < 1 ||
      classifications.length === 0 ||
      classifications.length !== rawClassifications.length ||
      result.has(teamId)
    ) {
      throw new ComputeJobServiceError('service_unavailable', 'capacity binding is invalid');
    }
    canonicalTimestamp(eligibilityValidUntil, 'eligibilityValidUntil');
    canonicalTimestamp(dataPolicyValidUntil, 'dataPolicyValidUntil');
    result.set(teamId, {
      teamId,
      capacityRef,
      instanceId: instanceId as number,
      allowedDataClassifications: [...new Set(classifications)].sort(),
      eligibilityValidUntil,
      dataPolicyValidUntil,
    });
  }
  return result;
}

let defaultServicePromise: Promise<ComputeJobUserService> | undefined;

/**
 * Fail-closed production bootstrap. No ephemeral key or in-memory custody fallback
 * is created when deployment configuration is absent.
 */
export function getDefaultComputeJobUserService(): Promise<ComputeJobUserService> {
  defaultServicePromise ??= (async () => {
    const databaseUrl = environmentText('DATABASE_URL');
    const issuer = environmentText('HOLOMESH_COMPUTE_SIGNING_ISSUER');
    const keyId = environmentText('HOLOMESH_COMPUTE_SIGNING_KEY_ID');
    const keyValidFrom = canonicalTimestamp(
      environmentText('HOLOMESH_COMPUTE_KEY_VALID_FROM'),
      'HOLOMESH_COMPUTE_KEY_VALID_FROM'
    );
    const keyValidUntil = canonicalTimestamp(
      environmentText('HOLOMESH_COMPUTE_KEY_VALID_UNTIL'),
      'HOLOMESH_COMPUTE_KEY_VALID_UNTIL'
    );
    const admissionTrustPolicyDigest = environmentText(
      'HOLOMESH_COMPUTE_ADMISSION_TRUST_POLICY_DIGEST'
    );
    if (!SHA256_LABEL.test(admissionTrustPolicyDigest)) {
      throw new ComputeJobServiceError(
        'service_unavailable',
        'HOLOMESH_COMPUTE_ADMISSION_TRUST_POLICY_DIGEST must be a sha256 label'
      );
    }
    const capacityBindings = capacityBindingsFromEnvironment();
    const privateKey = privateKeyFromEnvironment();
    const publicKey = createPublicKey(privateKey);
    const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
    const evidenceSigner: ComputeEvidenceSigner = {
      issuer,
      keyId,
      sign: (message) => signMessage(null, Buffer.from(message), privateKey).toString('base64'),
    };
    const admissionSigner: ComputeJobAdmissionSigner = { issuer, keyId, privateKey };
    const pool = new Pool(createHoloMeshPostgresPoolOptions(databaseUrl));
    const stores = new Map<string, Promise<PostgresComputeJobStore>>();

    const storeFor = (scope: {
      readonly teamId: string;
      readonly principalDigest: string;
    }): Promise<PostgresComputeJobStore> => {
      const cacheKey = `${scope.teamId}\0${scope.principalDigest}`;
      let store = stores.get(cacheKey);
      if (!store) {
        const admissionTrustAnchor: ComputeJobAdmissionTrustAnchor = {
          schemaVersion: COMPUTE_JOB_ADMISSION_TRUST_ANCHOR_SCHEMA_VERSION,
          issuer,
          keyId,
          algorithm: 'Ed25519',
          publicKey,
          allowedTeamIds: [scope.teamId],
          allowedPrincipalDigests: [scope.principalDigest],
          allowedTrustPolicyDigests: [admissionTrustPolicyDigest],
          validFrom: keyValidFrom,
          validUntil: keyValidUntil,
        };
        store = PostgresComputeJobStore.create({
          pool: pool as unknown as ComputeJobStorePool,
          admissionTrustAnchors: [admissionTrustAnchor],
          admissionTrustPolicyDigest,
        });
        stores.set(cacheKey, store);
      }
      return store;
    };

    return createComputeJobUserService({
      storeFor,
      getFleetRecord: (teamId) => teamStore.get(teamId)?.fleetSnapshot,
      getCapacityBinding: (teamId) => capacityBindings.get(teamId),
      allowedFleetSources: environmentList('HOLOMESH_COMPUTE_ALLOWED_FLEET_SOURCES'),
      allowedFleetPublisherAgentIds: environmentList('HOLOMESH_COMPUTE_ALLOWED_FLEET_PUBLISHERS'),
      evidenceSigner,
      evidencePublicKeyPem: publicKeyPem,
      evidenceKeyValidFrom: keyValidFrom,
      evidenceKeyValidUntil: keyValidUntil,
      admissionSigner,
      admissionTrustPolicyDigest,
    });
  })();
  return defaultServicePromise;
}

/** Test-only reset; production callers use the process-wide fail-closed singleton. */
export function resetDefaultComputeJobUserServiceForTests(): void {
  defaultServicePromise = undefined;
}
