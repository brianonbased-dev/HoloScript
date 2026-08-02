/**
 * Internal HoloMesh Fleet dispatcher for compiler-authored @compute jobs.
 *
 * This service may queue a preflighted job and acquire one durable logical
 * capacity lease. It does not contact a provider, reserve a physical GPU, or
 * assert execution. The fencing secret is derived from server-held key
 * material and exists outside durable/public artifacts only long enough to be
 * sealed directly to a registered headless executor's X25519 PoP key.
 */

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  createPrivateKey,
  createPublicKey,
  diffieHellman,
  generateKeyPairSync,
  hkdfSync,
  randomBytes,
  type KeyObject,
} from 'crypto';
import { computeWorkUnitDigest } from '@holoscript/core/compiler';
import {
  buildComputeBudgetEvidence,
  prepareComputeCapacityLease,
  prepareComputeJobTransition,
  type ComputeBridgeAdmission,
  type ComputeBudgetEvidence,
  type ComputeCapacityLease,
  type ComputeCapacitySnapshot,
  type ComputeEvidenceSigner,
  type ComputeEvidenceTrustAnchor,
  type ComputeJobReceipt,
  type ComputePlacementPlan,
} from '@holoscript/core/world-model';
import {
  createComputeJobAdmissionEnvelope,
  prepareAndSignComputeJobAdmission,
  type ComputeJobAdmissionOperation,
  type ComputeJobAdmissionSigner,
} from './compute-job-admission';
import {
  buildComputeExecutionOwnershipOutboxEnvelope,
  type ComputeExecutionOwnershipEnvelope,
} from './compute-execution-ownership';
import {
  buildComputeJobOutboxEnvelope,
  buildComputeJobPublicResponseBytes,
  ComputeJobStoreConflictError,
  ComputeJobStoreNotFoundError,
  ComputeJobStoreReadbackError,
  ComputeJobStoreUnavailableError,
  type CommitComputeJobTransitionCommand,
  type CommitComputeExecutionHeartbeatCommand,
  type CommitComputeExecutionHeartbeatResult,
  type ComputeBudgetEvidenceEnvelope,
  type ComputeDurableEnvelope,
  type ComputeExecutionRecoveryGuard,
  type ComputeJobProjection,
  type ComputeLeaseUseGuard,
  type ComputeWorkUnitEnvelope,
  type ReadActiveComputeBudgetHoldInput,
  type ReadComputeEvidenceInput,
  type ReadComputeJobInput,
  type ReadRegisteredComputeBudgetInput,
  type ReadRegisteredComputeCapacityInput,
  type RegisteredComputeBudget,
  type RegisteredComputeCapacity,
} from './compute-job-store';

export const COMPUTE_EXECUTOR_GRANT_SCHEMA_VERSION = 'holomesh.compute-executor-grant.v1' as const;
export const COMPUTE_EXECUTOR_GRANT_ENVELOPE_SCHEMA_VERSION =
  'holomesh.compute-executor-grant-envelope.v1' as const;
export const COMPUTE_EXECUTOR_GRANT_ALGORITHM = 'X25519-HKDF-SHA256-AES-256-GCM' as const;

const SHA256_LABEL = /^sha256:[a-f0-9]{64}$/;
const GRANT_HKDF_INFO = Buffer.from('holomesh.compute-executor-grant.v1', 'utf8');
const DISPATCH_DOMAIN = 'holomesh.compute-dispatch.v1';
const FENCING_DOMAIN = 'holomesh.compute-fencing-token.v1';
const BUDGET_NONCE_DOMAIN = 'holomesh.compute-budget-hold.v1';
const DEFAULT_LEASE_TTL_MS = 30_000;
const DEFAULT_ADMISSION_TTL_MS = 20_000;
const AES_KEY_BYTES = 32;
const AES_IV_BYTES = 12;
const AES_TAG_BYTES = 16;

type JsonObject = Record<string, unknown>;

export type ComputeJobDispatchErrorCode =
  | 'invalid_request'
  | 'executor_identity_invalid'
  | 'job_not_dispatchable'
  | 'dispatch_conflict'
  | 'capacity_unavailable'
  | 'budget_unavailable'
  | 'service_unavailable'
  | 'committed_readback_failed';

export class ComputeJobDispatchError extends Error {
  constructor(
    readonly code: ComputeJobDispatchErrorCode,
    message: string,
    readonly details?: readonly string[],
    readonly committed = false
  ) {
    super(message);
    this.name = 'ComputeJobDispatchError';
  }
}

/** Server-registered identity. This is never populated from request fields. */
export interface ComputeExecutorIdentity {
  readonly kind: 'headless_executor';
  readonly surface: 'headless';
  readonly source: 'registered_pop_key';
  readonly teamId: string;
  readonly executorId: string;
  readonly seatId: string;
  readonly capabilities: readonly ['compute:dispatch', 'compute:execute'];
  readonly recipientKeyThumbprint: string;
  readonly fencingKeyId: string;
  readonly validFrom: string;
  readonly validUntil: string;
  readonly revokedAt?: string;
}

export interface DispatchComputeJobInput {
  readonly jobId: string;
  readonly attempt: number;
}

export interface ComputeBudgetAccountRef {
  readonly budgetRailId: string;
  readonly currency: 'USD';
  readonly periodDigest: string;
}

export interface ComputeDispatchStore {
  readJob(input: ReadComputeJobInput): Promise<ComputeJobProjection>;
  readWorkUnit(teamId: string, digest: string): Promise<ComputeWorkUnitEnvelope>;
  readEvidence(input: ReadComputeEvidenceInput): Promise<readonly ComputeDurableEnvelope[]>;
  readCurrentExecutionOwnership(
    input: ReadComputeJobInput
  ): Promise<ComputeExecutionOwnershipEnvelope>;
  readRegisteredCapacity(
    input: ReadRegisteredComputeCapacityInput
  ): Promise<RegisteredComputeCapacity>;
  readRegisteredBudget(input: ReadRegisteredComputeBudgetInput): Promise<RegisteredComputeBudget>;
  readActiveBudgetHold(
    input: ReadActiveComputeBudgetHoldInput
  ): Promise<ComputeBudgetEvidenceEnvelope>;
  commitTransition(command: CommitComputeJobTransitionCommand): Promise<{
    readonly disposition: 'committed' | 'replayed';
    readonly publicResponseBytes: string;
    readonly transitionReceiptId: string;
    readonly allocationCommitReceiptId?: string;
    readonly budgetEvidenceReceiptId?: string;
    readonly readBack: {
      readonly jobReceiptId: string;
      readonly admissionReceiptId: string;
      readonly allocationEtag?: string;
      readonly budgetEvidenceReceiptId?: string;
      readonly evidenceReceiptIds: readonly string[];
      readonly outboxEventIds: readonly string[];
    };
  }>;
  commitExecutionHeartbeat(
    command: CommitComputeExecutionHeartbeatCommand
  ): Promise<CommitComputeExecutionHeartbeatResult>;
}

export interface ComputeExecutorGrantCiphertext {
  readonly algorithm: typeof COMPUTE_EXECUTOR_GRANT_ALGORITHM;
  readonly recipientKeyThumbprint: string;
  readonly ephemeralPublicKeyBase64: string;
  readonly saltBase64: string;
  readonly ivBase64: string;
  readonly ciphertextBase64: string;
  readonly authTagBase64: string;
}

export interface ComputeExecutorGrantSealer {
  readonly algorithm: typeof COMPUTE_EXECUTOR_GRANT_ALGORITHM;
  readonly recipientKeyThumbprint: string;
  seal(
    plaintextBytes: Uint8Array,
    additionalAuthenticatedData: Uint8Array
  ): Promise<ComputeExecutorGrantCiphertext>;
}

interface ComputeExecutorGrantPublicBinding {
  readonly schemaVersion: typeof COMPUTE_EXECUTOR_GRANT_ENVELOPE_SCHEMA_VERSION;
  readonly verificationScope: 'sealed_logical_lease_material_only';
  readonly holderDigest: string;
  readonly teamId: string;
  readonly jobId: string;
  readonly attempt: number;
  readonly jobReceiptId: string;
  readonly leaseReceiptId: string;
  readonly capacityRef: string;
  readonly fencingEpoch: number;
  readonly allocationEtag: string;
  readonly budgetEvidenceReceiptId?: string;
  readonly issuedAt: string;
  readonly expiresAt: string;
  readonly grantDigest: string;
  readonly recipientKeyThumbprint: string;
  readonly algorithm: typeof COMPUTE_EXECUTOR_GRANT_ALGORITHM;
  readonly providerReservation: 'not_asserted';
  readonly execution: 'not_asserted';
}

export interface SealedComputeExecutorGrant extends ComputeExecutorGrantPublicBinding {
  readonly aadDigest: string;
  readonly ephemeralPublicKeyBase64: string;
  readonly saltBase64: string;
  readonly ivBase64: string;
  readonly ciphertextBase64: string;
  readonly authTagBase64: string;
}

export interface DispatchComputeJobResult {
  readonly publicResponseBytes: string;
  readonly grant: SealedComputeExecutorGrant;
}

export interface CreateComputeJobDispatchServiceOptions {
  readonly store: ComputeDispatchStore;
  readonly executorIdentity: ComputeExecutorIdentity;
  readonly budgetAccount: ComputeBudgetAccountRef;
  readonly evidenceSigner: ComputeEvidenceSigner;
  readonly budgetSigner: ComputeEvidenceSigner;
  readonly evidenceTrustAnchors: readonly ComputeEvidenceTrustAnchor[];
  readonly admissionSigner: ComputeJobAdmissionSigner;
  readonly admissionTrustPolicyDigest: string;
  readonly admissionKeyValidUntil: string;
  /** Stable server-held key used as a PRF, never persisted or sent to the executor. */
  readonly fencingKey: Uint8Array;
  readonly grantSealer: ComputeExecutorGrantSealer;
  readonly now?: () => string;
  readonly leaseTtlMs?: number;
  readonly admissionTtlMs?: number;
}

export interface ComputeJobDispatchService {
  dispatch(input: DispatchComputeJobInput): Promise<DispatchComputeJobResult>;
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

function requiredText(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim() !== value || value.length === 0) {
    throw new ComputeJobDispatchError(
      'invalid_request',
      `${label} must be non-empty canonical text`
    );
  }
  return value;
}

function canonicalTimestamp(value: unknown, label: string): string {
  if (typeof value !== 'string') {
    throw new ComputeJobDispatchError(
      'service_unavailable',
      `${label} must be a canonical timestamp`
    );
  }
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== value) {
    throw new ComputeJobDispatchError(
      'service_unavailable',
      `${label} must be a canonical timestamp`
    );
  }
  return value;
}

function canonicalBase64(value: string, label: string): Buffer {
  const decoded = Buffer.from(value, 'base64');
  if (decoded.length === 0 || decoded.toString('base64') !== value) {
    throw new TypeError(`${label} must be canonical non-empty base64`);
  }
  return decoded;
}

function publicX25519Key(value: string | KeyObject): KeyObject {
  const key = typeof value === 'string' ? createPublicKey(value) : value;
  if (key.type !== 'public' || key.asymmetricKeyType !== 'x25519') {
    throw new TypeError('recipient public key must be an X25519 public key');
  }
  return key;
}

function privateX25519Key(value: string | KeyObject): KeyObject {
  const key = typeof value === 'string' ? createPrivateKey(value) : value;
  if (key.type !== 'private' || key.asymmetricKeyType !== 'x25519') {
    throw new TypeError('recipient private key must be an X25519 private key');
  }
  return key;
}

function keyThumbprint(key: KeyObject): string {
  const publicKey = key.type === 'public' ? key : createPublicKey(key);
  const bytes = publicKey.export({ type: 'spki', format: 'der' });
  return digestBytes(bytes as Buffer);
}

export function createX25519ComputeExecutorGrantSealer(
  recipientPublicKey: string | KeyObject
): ComputeExecutorGrantSealer {
  const recipient = publicX25519Key(recipientPublicKey);
  const recipientKeyThumbprint = keyThumbprint(recipient);
  return {
    algorithm: COMPUTE_EXECUTOR_GRANT_ALGORITHM,
    recipientKeyThumbprint,
    async seal(plaintextBytes, additionalAuthenticatedData) {
      if (plaintextBytes.byteLength === 0 || additionalAuthenticatedData.byteLength === 0) {
        throw new TypeError('grant plaintext and authenticated context must be non-empty');
      }
      const ephemeral = generateKeyPairSync('x25519');
      const sharedSecret = diffieHellman({
        privateKey: ephemeral.privateKey,
        publicKey: recipient,
      });
      const salt = randomBytes(AES_KEY_BYTES);
      const key = Buffer.from(
        hkdfSync('sha256', sharedSecret, salt, GRANT_HKDF_INFO, AES_KEY_BYTES)
      );
      const iv = randomBytes(AES_IV_BYTES);
      try {
        const cipher = createCipheriv('aes-256-gcm', key, iv, { authTagLength: AES_TAG_BYTES });
        cipher.setAAD(Buffer.from(additionalAuthenticatedData));
        const ciphertext = Buffer.concat([
          cipher.update(Buffer.from(plaintextBytes)),
          cipher.final(),
        ]);
        return {
          algorithm: COMPUTE_EXECUTOR_GRANT_ALGORITHM,
          recipientKeyThumbprint,
          ephemeralPublicKeyBase64: (
            ephemeral.publicKey.export({ type: 'spki', format: 'der' }) as Buffer
          ).toString('base64'),
          saltBase64: salt.toString('base64'),
          ivBase64: iv.toString('base64'),
          ciphertextBase64: ciphertext.toString('base64'),
          authTagBase64: cipher.getAuthTag().toString('base64'),
        };
      } finally {
        sharedSecret.fill(0);
        key.fill(0);
      }
    },
  };
}

function grantAad(binding: ComputeExecutorGrantPublicBinding): Buffer {
  return Buffer.from(canonicalJson(binding), 'utf8');
}

/** Executor-side primitive. The caller must independently validate the public binding. */
export function openX25519ComputeExecutorGrant(
  envelope: SealedComputeExecutorGrant,
  recipientPrivateKey: string | KeyObject
): Uint8Array {
  const privateKey = privateX25519Key(recipientPrivateKey);
  if (keyThumbprint(privateKey) !== envelope.recipientKeyThumbprint) {
    throw new TypeError('executor grant recipient key does not match the envelope');
  }
  const {
    aadDigest,
    ephemeralPublicKeyBase64,
    saltBase64,
    ivBase64,
    ciphertextBase64,
    authTagBase64,
    ...binding
  } = envelope;
  const aad = grantAad(binding);
  if (digestBytes(aad) !== aadDigest) throw new TypeError('executor grant AAD digest is invalid');
  const ephemeralPublicKey = createPublicKey({
    key: canonicalBase64(ephemeralPublicKeyBase64, 'ephemeralPublicKeyBase64'),
    type: 'spki',
    format: 'der',
  });
  if (ephemeralPublicKey.asymmetricKeyType !== 'x25519') {
    throw new TypeError('executor grant ephemeral key is not X25519');
  }
  const sharedSecret = diffieHellman({ privateKey, publicKey: ephemeralPublicKey });
  const salt = canonicalBase64(saltBase64, 'saltBase64');
  const key = Buffer.from(hkdfSync('sha256', sharedSecret, salt, GRANT_HKDF_INFO, AES_KEY_BYTES));
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, canonicalBase64(ivBase64, 'ivBase64'), {
      authTagLength: AES_TAG_BYTES,
    });
    decipher.setAAD(aad);
    decipher.setAuthTag(canonicalBase64(authTagBase64, 'authTagBase64'));
    const plaintext = Buffer.concat([
      decipher.update(canonicalBase64(ciphertextBase64, 'ciphertextBase64')),
      decipher.final(),
    ]);
    if (digestBytes(plaintext) !== envelope.grantDigest) {
      throw new TypeError('executor grant plaintext digest is invalid');
    }
    return plaintext;
  } finally {
    sharedSecret.fill(0);
    key.fill(0);
  }
}

export function computeExecutorHolderDigest(identity: ComputeExecutorIdentity): string {
  return digestCanonical({
    domain: DISPATCH_DOMAIN,
    kind: identity.kind,
    surface: identity.surface,
    source: identity.source,
    teamId: identity.teamId,
    executorId: identity.executorId,
    seatId: identity.seatId,
    capabilities: [...identity.capabilities],
    recipientKeyThumbprint: identity.recipientKeyThumbprint,
    fencingKeyId: identity.fencingKeyId,
  });
}

export function assertComputeExecutorIdentityActive(
  identity: ComputeExecutorIdentity,
  at: string
): void {
  requiredText(identity.teamId, 'executorIdentity.teamId');
  requiredText(identity.executorId, 'executorIdentity.executorId');
  requiredText(identity.seatId, 'executorIdentity.seatId');
  requiredText(identity.fencingKeyId, 'executorIdentity.fencingKeyId');
  if (
    identity.kind !== 'headless_executor' ||
    identity.surface !== 'headless' ||
    identity.source !== 'registered_pop_key' ||
    canonicalJson(identity.capabilities) !==
      canonicalJson(['compute:dispatch', 'compute:execute']) ||
    !SHA256_LABEL.test(identity.recipientKeyThumbprint)
  ) {
    throw new ComputeJobDispatchError(
      'executor_identity_invalid',
      'dispatcher requires one registered headless PoP executor with exact compute scopes'
    );
  }
  const validFrom = Date.parse(
    canonicalTimestamp(identity.validFrom, 'executorIdentity.validFrom')
  );
  const validUntil = Date.parse(
    canonicalTimestamp(identity.validUntil, 'executorIdentity.validUntil')
  );
  const now = Date.parse(at);
  const revokedAt = identity.revokedAt
    ? Date.parse(canonicalTimestamp(identity.revokedAt, 'executorIdentity.revokedAt'))
    : undefined;
  if (
    validUntil <= validFrom ||
    now < validFrom ||
    now >= validUntil ||
    (revokedAt !== undefined && now >= revokedAt)
  ) {
    throw new ComputeJobDispatchError(
      'executor_identity_invalid',
      'registered executor identity is not active'
    );
  }
}

function validateIdentity(
  identity: ComputeExecutorIdentity,
  sealer: ComputeExecutorGrantSealer,
  at: string
): void {
  assertComputeExecutorIdentityActive(identity, at);
  if (
    identity.recipientKeyThumbprint !== sealer.recipientKeyThumbprint ||
    sealer.algorithm !== COMPUTE_EXECUTOR_GRANT_ALGORITHM
  ) {
    throw new ComputeJobDispatchError(
      'executor_identity_invalid',
      'dispatcher requires one registered headless PoP executor with exact compute scopes'
    );
  }
}

function exactDispatchInput(input: DispatchComputeJobInput): void {
  if (
    !isRecord(input) ||
    canonicalJson(Object.keys(input).sort()) !== canonicalJson(['attempt', 'jobId'])
  ) {
    throw new ComputeJobDispatchError(
      'invalid_request',
      'dispatch selector accepts only jobId and attempt'
    );
  }
  if (typeof input.jobId !== 'string' || !SHA256_LABEL.test(input.jobId)) {
    throw new ComputeJobDispatchError('invalid_request', 'jobId must be a sha256 label');
  }
  if (!Number.isSafeInteger(input.attempt) || input.attempt < 1) {
    throw new ComputeJobDispatchError('invalid_request', 'attempt must be a positive safe integer');
  }
}

function evidenceEnvelope(value: { readonly receiptId: string; readonly schemaVersion: string }) {
  return {
    receiptId: value.receiptId,
    schemaVersion: value.schemaVersion,
    bytes: canonicalJson(value),
  };
}

function parseEvidence<T extends { readonly receiptId: string; readonly schemaVersion: string }>(
  envelope: ComputeDurableEnvelope,
  expectedSchemaVersion: string,
  label: string
): T {
  if (envelope.schemaVersion !== expectedSchemaVersion) {
    throw new ComputeJobDispatchError('capacity_unavailable', `${label} has the wrong schema`);
  }
  let value: unknown;
  try {
    value = JSON.parse(envelope.bytes);
  } catch {
    throw new ComputeJobDispatchError('capacity_unavailable', `${label} bytes are not JSON`);
  }
  if (
    !isRecord(value) ||
    canonicalJson(value) !== envelope.bytes ||
    value.receiptId !== envelope.receiptId ||
    value.schemaVersion !== envelope.schemaVersion
  ) {
    throw new ComputeJobDispatchError(
      'capacity_unavailable',
      `${label} exact bytes do not match its durable receipt`
    );
  }
  return value as unknown as T;
}

export interface ComputePlacementContext {
  readonly workUnit: ComputeWorkUnitEnvelope;
  readonly evidence: readonly ComputeDurableEnvelope[];
  readonly capacitySnapshot: ComputeCapacitySnapshot;
  readonly bridgeAdmission?: ComputeBridgeAdmission;
  readonly plan: ComputePlacementPlan;
  readonly capacity: RegisteredComputeCapacity;
  readonly lease?: ComputeCapacityLease;
  readonly leaseEnvelope?: ComputeDurableEnvelope;
}

export async function readComputePlacementContext(
  store: ComputeDispatchStore,
  teamId: string,
  job: ComputeJobProjection
): Promise<ComputePlacementContext> {
  const workUnit = await store.readWorkUnit(teamId, job.receipt.workUnit.digest);
  if (
    workUnit.digest !== job.receipt.workUnit.digest ||
    computeWorkUnitDigest(workUnit.contract) !== workUnit.digest
  ) {
    throw new ComputeJobDispatchError(
      'capacity_unavailable',
      'durable WorkUnit does not match the job binding'
    );
  }
  const receiptIds = [
    job.receipt.placement.capacitySnapshotReceiptId,
    ...(job.receipt.placement.bridgeAdmissionReceiptId
      ? [job.receipt.placement.bridgeAdmissionReceiptId]
      : []),
    job.receipt.placement.planReceiptId,
  ];
  const evidence = await store.readEvidence({
    teamId,
    jobId: job.receipt.jobId,
    attempt: job.receipt.attempt,
    receiptIds,
  });
  const byId = new Map(evidence.map((item) => [item.receiptId, item]));
  const capacitySnapshot = parseEvidence<ComputeCapacitySnapshot>(
    byId.get(job.receipt.placement.capacitySnapshotReceiptId) as ComputeDurableEnvelope,
    'holoscript.compute-capacity-snapshot.v1',
    'capacity snapshot'
  );
  const bridgeAdmission = job.receipt.placement.bridgeAdmissionReceiptId
    ? parseEvidence<ComputeBridgeAdmission>(
        byId.get(job.receipt.placement.bridgeAdmissionReceiptId) as ComputeDurableEnvelope,
        'holoscript.compute-bridge-admission.v1',
        'bridge admission'
      )
    : undefined;
  const plan = parseEvidence<ComputePlacementPlan>(
    byId.get(job.receipt.placement.planReceiptId) as ComputeDurableEnvelope,
    'holoscript.compute-placement-plan.v1',
    'placement plan'
  );
  const capacity = await store.readRegisteredCapacity({
    teamId,
    capacityRef: plan.capacityRef,
  });
  let lease: ComputeCapacityLease | undefined;
  let leaseEnvelope: ComputeDurableEnvelope | undefined;
  if (job.receipt.lease) {
    const leaseEvidence = await store.readEvidence({
      teamId,
      jobId: job.receipt.jobId,
      attempt: job.receipt.attempt,
      receiptIds: [job.receipt.lease.receiptId],
    });
    leaseEnvelope = leaseEvidence[0];
    lease = parseEvidence<ComputeCapacityLease>(
      leaseEnvelope,
      'holoscript.compute-capacity-lease.v1',
      'capacity lease'
    );
  }
  return {
    workUnit,
    evidence,
    capacitySnapshot,
    bridgeAdmission,
    plan,
    capacity,
    ...(lease ? { lease } : {}),
    ...(leaseEnvelope ? { leaseEnvelope } : {}),
  };
}

function transitionIdempotencyKey(
  identity: ComputeExecutorIdentity,
  job: ComputeJobReceipt,
  action: 'queue' | 'acquire_lease'
): string {
  return canonicalJson({
    domain: DISPATCH_DOMAIN,
    action,
    teamId: identity.teamId,
    jobId: job.jobId,
    attempt: job.attempt,
    holderDigest: computeExecutorHolderDigest(identity),
  });
}

function minTimestamp(...values: string[]): string {
  return new Date(Math.min(...values.map((value) => Date.parse(value)))).toISOString();
}

export function buildComputeTransitionCommand(input: {
  readonly operation: ComputeJobAdmissionOperation;
  readonly teamId: string;
  readonly expectedJob: ComputeJobProjection;
  readonly prepared: ReturnType<typeof prepareComputeJobTransition>;
  readonly workUnit: ComputeWorkUnitEnvelope;
  readonly evidence: readonly ComputeDurableEnvelope[];
  readonly admissionSigner: ComputeJobAdmissionSigner;
  readonly admissionTrustPolicyDigest: string;
  readonly admissionValidUntil: string;
  readonly allocation?: {
    readonly capacity: RegisteredComputeCapacity;
    readonly expectedAllocation: ReturnType<
      typeof prepareComputeCapacityLease
    >['expectedAllocation'];
    readonly nextAllocation: ReturnType<typeof prepareComputeCapacityLease>['nextAllocation'];
  };
  readonly budgetEvidence?: ComputeBudgetEvidence;
  readonly leaseUseGuard?: ComputeLeaseUseGuard;
  readonly executionOwnership?: ComputeExecutionOwnershipEnvelope;
  readonly executionRecoveryGuard?: ComputeExecutionRecoveryGuard;
}): CommitComputeJobTransitionCommand {
  const requestDigest = input.prepared.transition.request.requestHash;
  const evidence: readonly ComputeDurableEnvelope[] = input.executionOwnership
    ? [
        ...input.evidence,
        {
          receiptId: input.executionOwnership.receiptId,
          schemaVersion: input.executionOwnership.schemaVersion,
          bytes: input.executionOwnership.bytes,
        },
      ]
    : input.evidence;
  const admission = createComputeJobAdmissionEnvelope(
    prepareAndSignComputeJobAdmission(
      {
        teamId: input.teamId,
        principalDigest: input.expectedJob.receipt.principalDigest,
        jobId: input.expectedJob.receipt.jobId,
        attempt: input.expectedJob.receipt.attempt,
        operation: input.operation,
        requestDigest,
        workUnit: input.workUnit.contract,
        evidence,
        trustPolicyDigest: input.admissionTrustPolicyDigest,
        lifecycle: {
          kind: 'transition',
          expectedJobReceiptId: input.expectedJob.receipt.receiptId,
          nextJobReceiptId: input.prepared.nextJob.receiptId,
          transitionReceiptId: input.prepared.transition.receiptId,
        },
        verifiedAt: input.prepared.transition.transitionedAt,
        validUntil: input.admissionValidUntil,
        issuer: input.admissionSigner.issuer,
        keyId: input.admissionSigner.keyId,
      },
      input.admissionSigner
    )
  );
  const artifacts = {
    job: input.prepared.nextJob,
    transition: input.prepared.transition,
    ...(input.prepared.allocatorCommit ? { allocationCommit: input.prepared.allocatorCommit } : {}),
  };
  return {
    operation: input.operation,
    idempotencyKeyDigest: input.prepared.transition.request.idempotencyKeyHash,
    requestDigest,
    expectedJob: input.expectedJob,
    nextJob: {
      teamId: input.teamId,
      receipt: input.prepared.nextJob,
      bytes: canonicalJson(input.prepared.nextJob),
    },
    expectedWorkUnit: input.workUnit,
    evidence,
    admission,
    transition: {
      receipt: input.prepared.transition,
      bytes: canonicalJson(input.prepared.transition),
    },
    ...(input.allocation && input.prepared.allocatorCommit
      ? {
          expectedAllocation: {
            teamId: input.teamId,
            lane: input.allocation.capacity.projection.lane,
            cursor: input.allocation.expectedAllocation,
            bytes: canonicalJson(input.allocation.expectedAllocation),
          },
          nextAllocation: {
            teamId: input.teamId,
            lane: input.allocation.capacity.projection.lane,
            cursor: input.allocation.nextAllocation,
            bytes: canonicalJson(input.allocation.nextAllocation),
          },
          expectedCapacityEligibilityBytes: input.allocation.capacity.eligibilityBytes,
          expectedCapacityDataPolicyBytes: input.allocation.capacity.dataPolicyBytes,
          allocationCommit: {
            receipt: input.prepared.allocatorCommit,
            bytes: canonicalJson(input.prepared.allocatorCommit),
          },
        }
      : {}),
    ...(input.budgetEvidence
      ? {
          budgetEvidence: {
            receipt: input.budgetEvidence,
            bytes: canonicalJson(input.budgetEvidence),
          },
        }
      : {}),
    ...(input.leaseUseGuard ? { leaseUseGuard: input.leaseUseGuard } : {}),
    ...(input.executionRecoveryGuard
      ? { executionRecoveryGuard: input.executionRecoveryGuard }
      : {}),
    outbox: [
      buildComputeJobOutboxEnvelope(artifacts),
      ...(input.executionOwnership
        ? [buildComputeExecutionOwnershipOutboxEnvelope(input.executionOwnership.receipt)]
        : []),
    ],
    publicResponseBytes: buildComputeJobPublicResponseBytes(artifacts),
  };
}

function dispatchError(error: unknown): never {
  if (error instanceof ComputeJobDispatchError) throw error;
  if (error instanceof ComputeJobStoreNotFoundError) {
    const code =
      error.resource === 'budget' || error.resource === 'budget_hold'
        ? 'budget_unavailable'
        : error.resource === 'job'
          ? 'job_not_dispatchable'
          : 'capacity_unavailable';
    throw new ComputeJobDispatchError(code, error.message);
  }
  if (error instanceof ComputeJobStoreConflictError) {
    throw new ComputeJobDispatchError('dispatch_conflict', error.message, [error.code]);
  }
  if (error instanceof ComputeJobStoreReadbackError) {
    throw new ComputeJobDispatchError('committed_readback_failed', error.message, undefined, true);
  }
  if (error instanceof ComputeJobStoreUnavailableError) {
    throw new ComputeJobDispatchError('service_unavailable', error.message);
  }
  throw error;
}

function deriveFencingToken(input: {
  readonly fencingKey: Buffer;
  readonly identity: ComputeExecutorIdentity;
  readonly principalDigest: string;
  readonly jobId: string;
  readonly attempt: number;
  readonly capacityRef: string;
  readonly fencingEpoch: number;
  readonly holderDigest: string;
}): Buffer {
  return createHmac('sha256', input.fencingKey)
    .update(
      canonicalJson({
        domain: FENCING_DOMAIN,
        fencingKeyId: input.identity.fencingKeyId,
        teamId: input.identity.teamId,
        principalDigest: input.principalDigest,
        jobId: input.jobId,
        attempt: input.attempt,
        capacityRef: input.capacityRef,
        fencingEpoch: input.fencingEpoch,
        holderDigest: input.holderDigest,
      })
    )
    .digest();
}

function grantPlaintext(input: {
  readonly identity: ComputeExecutorIdentity;
  readonly holderDigest: string;
  readonly job: ComputeJobReceipt;
  readonly workUnit: ComputeWorkUnitEnvelope;
  readonly allocation: RegisteredComputeCapacity;
  readonly fencingToken: Buffer;
  readonly budgetEvidence?: ComputeBudgetEvidence;
}): Buffer {
  const lease = input.job.lease;
  if (!lease) throw new TypeError('leased grant requires a lease binding');
  return Buffer.from(
    canonicalJson({
      schemaVersion: COMPUTE_EXECUTOR_GRANT_SCHEMA_VERSION,
      verificationScope: 'sealed_logical_lease_material_only',
      executorId: input.identity.executorId,
      seatId: input.identity.seatId,
      holderDigest: input.holderDigest,
      teamId: input.identity.teamId,
      principalDigest: input.job.principalDigest,
      jobId: input.job.jobId,
      attempt: input.job.attempt,
      jobReceiptId: input.job.receiptId,
      workUnitDigest: input.workUnit.digest,
      leaseReceiptId: lease.receiptId,
      capacityRef: lease.capacityRef,
      fencingEpoch: lease.fencingEpoch,
      allocationEtag: input.allocation.projection.cursor.etag,
      allocationVersion: input.allocation.projection.cursor.version,
      budget: input.budgetEvidence
        ? {
            evidenceReceiptId: input.budgetEvidence.receiptId,
            railId: input.budgetEvidence.budgetRailId,
            currency: input.budgetEvidence.currency,
            policyDigest: input.budgetEvidence.policyDigest,
            periodDigest: input.budgetEvidence.periodDigest,
            maxAmountMinorUnits: input.budgetEvidence.maxAmountMinorUnits,
          }
        : { state: 'not_applicable' },
      fencingTokenBase64: input.fencingToken.toString('base64'),
      issuedAt: lease.issuedAt,
      expiresAt: lease.expiresAt,
      providerReservation: 'not_asserted',
      execution: 'not_asserted',
    }),
    'utf8'
  );
}

async function sealGrant(input: {
  readonly sealer: ComputeExecutorGrantSealer;
  readonly identity: ComputeExecutorIdentity;
  readonly holderDigest: string;
  readonly job: ComputeJobReceipt;
  readonly workUnit: ComputeWorkUnitEnvelope;
  readonly capacity: RegisteredComputeCapacity;
  readonly fencingToken: Buffer;
  readonly budgetEvidence?: ComputeBudgetEvidence;
}): Promise<SealedComputeExecutorGrant> {
  const lease = input.job.lease;
  if (!lease) throw new TypeError('sealed grant requires a leased job');
  const plaintext = grantPlaintext({
    identity: input.identity,
    holderDigest: input.holderDigest,
    job: input.job,
    workUnit: input.workUnit,
    allocation: input.capacity,
    fencingToken: input.fencingToken,
    budgetEvidence: input.budgetEvidence,
  });
  try {
    const binding: ComputeExecutorGrantPublicBinding = {
      schemaVersion: COMPUTE_EXECUTOR_GRANT_ENVELOPE_SCHEMA_VERSION,
      verificationScope: 'sealed_logical_lease_material_only',
      holderDigest: input.holderDigest,
      teamId: input.identity.teamId,
      jobId: input.job.jobId,
      attempt: input.job.attempt,
      jobReceiptId: input.job.receiptId,
      leaseReceiptId: lease.receiptId,
      capacityRef: lease.capacityRef,
      fencingEpoch: lease.fencingEpoch,
      allocationEtag: input.capacity.projection.cursor.etag,
      ...(input.budgetEvidence ? { budgetEvidenceReceiptId: input.budgetEvidence.receiptId } : {}),
      issuedAt: lease.issuedAt,
      expiresAt: lease.expiresAt,
      grantDigest: digestBytes(plaintext),
      recipientKeyThumbprint: input.identity.recipientKeyThumbprint,
      algorithm: COMPUTE_EXECUTOR_GRANT_ALGORITHM,
      providerReservation: 'not_asserted',
      execution: 'not_asserted',
    };
    const aad = grantAad(binding);
    const ciphertext = await input.sealer.seal(plaintext, aad);
    if (
      ciphertext.algorithm !== binding.algorithm ||
      ciphertext.recipientKeyThumbprint !== binding.recipientKeyThumbprint
    ) {
      throw new ComputeJobDispatchError(
        'executor_identity_invalid',
        'grant sealer does not bind the registered executor key'
      );
    }
    return { ...binding, aadDigest: digestBytes(aad), ...ciphertext };
  } finally {
    plaintext.fill(0);
  }
}

export function createComputeJobDispatchService(
  options: CreateComputeJobDispatchServiceOptions
): ComputeJobDispatchService {
  if (!SHA256_LABEL.test(options.admissionTrustPolicyDigest)) {
    throw new ComputeJobDispatchError(
      'service_unavailable',
      'admission trust policy digest is not configured'
    );
  }
  const admissionKeyValidUntil = canonicalTimestamp(
    options.admissionKeyValidUntil,
    'admissionKeyValidUntil'
  );
  const fencingKey = Buffer.from(options.fencingKey);
  if (fencingKey.byteLength < AES_KEY_BYTES) {
    throw new ComputeJobDispatchError(
      'service_unavailable',
      'fencingKey must contain at least 32 bytes'
    );
  }
  requiredText(options.budgetAccount.budgetRailId, 'budgetAccount.budgetRailId');
  if (
    options.budgetAccount.currency !== 'USD' ||
    !SHA256_LABEL.test(options.budgetAccount.periodDigest)
  ) {
    throw new ComputeJobDispatchError('service_unavailable', 'budgetAccount is invalid');
  }
  const leaseTtlMs = options.leaseTtlMs ?? DEFAULT_LEASE_TTL_MS;
  const admissionTtlMs = options.admissionTtlMs ?? DEFAULT_ADMISSION_TTL_MS;
  if (!Number.isSafeInteger(leaseTtlMs) || leaseTtlMs < 1 || leaseTtlMs > 5 * 60_000) {
    throw new ComputeJobDispatchError('service_unavailable', 'leaseTtlMs is invalid');
  }
  if (!Number.isSafeInteger(admissionTtlMs) || admissionTtlMs < 1 || admissionTtlMs > 60_000) {
    throw new ComputeJobDispatchError('service_unavailable', 'admissionTtlMs is invalid');
  }
  const now = options.now ?? (() => new Date().toISOString());
  const holderDigest = computeExecutorHolderDigest(options.executorIdentity);

  async function recoverLeased(
    job: ComputeJobProjection,
    dispatchedAt: string
  ): Promise<DispatchComputeJobResult> {
    validateIdentity(options.executorIdentity, options.grantSealer, dispatchedAt);
    const lease = job.receipt.lease;
    if (!lease || job.receipt.state !== 'leased' || lease.holderDigest !== holderDigest) {
      throw new ComputeJobDispatchError(
        'job_not_dispatchable',
        'job is not leased to this registered executor'
      );
    }
    if (Date.parse(dispatchedAt) >= Date.parse(lease.expiresAt)) {
      throw new ComputeJobDispatchError(
        'job_not_dispatchable',
        'logical capacity lease is expired'
      );
    }
    const workUnit = await options.store.readWorkUnit(
      options.executorIdentity.teamId,
      job.receipt.workUnit.digest
    );
    const capacity = await options.store.readRegisteredCapacity({
      teamId: options.executorIdentity.teamId,
      capacityRef: lease.capacityRef,
    });
    const cursor = capacity.projection.cursor;
    if (
      cursor.slotState !== 'leased' ||
      cursor.currentLeaseReceiptId !== lease.receiptId ||
      cursor.currentEpoch !== lease.fencingEpoch
    ) {
      throw new ComputeJobDispatchError(
        'capacity_unavailable',
        'durable allocator cursor no longer authorizes this lease'
      );
    }
    const fencingToken = deriveFencingToken({
      fencingKey,
      identity: options.executorIdentity,
      principalDigest: job.receipt.principalDigest,
      jobId: job.receipt.jobId,
      attempt: job.receipt.attempt,
      capacityRef: lease.capacityRef,
      fencingEpoch: lease.fencingEpoch,
      holderDigest,
    });
    try {
      if (digestBytes(fencingToken) !== lease.fencingTokenHash) {
        throw new ComputeJobDispatchError(
          'executor_identity_invalid',
          'active lease cannot be recovered with the registered fencing key'
        );
      }
      const budgetEvidence =
        workUnit.contract.compute.budget.maxCostMinorUnits > 0
          ? (
              await options.store.readActiveBudgetHold({
                teamId: options.executorIdentity.teamId,
                jobId: job.receipt.jobId,
                attempt: job.receipt.attempt,
              })
            ).receipt
          : undefined;
      const grant = await sealGrant({
        sealer: options.grantSealer,
        identity: options.executorIdentity,
        holderDigest,
        job: job.receipt,
        workUnit,
        capacity,
        fencingToken,
        budgetEvidence,
      });
      return {
        publicResponseBytes: buildComputeJobPublicResponseBytes({ job: job.receipt }),
        grant,
      };
    } finally {
      fencingToken.fill(0);
    }
  }

  async function dispatch(input: DispatchComputeJobInput): Promise<DispatchComputeJobResult> {
    exactDispatchInput(input);
    const teamId = options.executorIdentity.teamId;
    const dispatchedAt = canonicalTimestamp(now(), 'now()');
    validateIdentity(options.executorIdentity, options.grantSealer, dispatchedAt);
    try {
      let job = await options.store.readJob({ teamId, jobId: input.jobId, attempt: input.attempt });
      if (job.receipt.state === 'leased') return await recoverLeased(job, dispatchedAt);
      if (job.receipt.state !== 'preflighted' && job.receipt.state !== 'queued') {
        throw new ComputeJobDispatchError(
          'job_not_dispatchable',
          `job state ${job.receipt.state} is not dispatchable`
        );
      }

      let context = await readComputePlacementContext(options.store, teamId, job);
      if (job.receipt.state === 'preflighted') {
        const prepared = prepareComputeJobTransition({
          expectedJob: job.receipt,
          action: 'queue',
          placementVerification: {
            principalDigest: job.receipt.principalDigest,
            workUnit: context.workUnit.contract,
            capacitySnapshot: context.capacitySnapshot,
            bridgeAdmission: context.bridgeAdmission,
            plan: context.plan,
            checkedAt: context.plan.checkedAt,
            verifiedAt: dispatchedAt,
            trustAnchors: options.evidenceTrustAnchors,
          },
          transitionedAt: dispatchedAt,
          idempotencyKey: transitionIdempotencyKey(options.executorIdentity, job.receipt, 'queue'),
        });
        const admissionValidUntil = minTimestamp(
          admissionKeyValidUntil,
          options.executorIdentity.validUntil,
          new Date(Date.parse(dispatchedAt) + admissionTtlMs).toISOString()
        );
        await options.store.commitTransition(
          buildComputeTransitionCommand({
            operation: 'compute_job.queue',
            teamId,
            expectedJob: job,
            prepared,
            workUnit: context.workUnit,
            evidence: context.evidence,
            admissionSigner: options.admissionSigner,
            admissionTrustPolicyDigest: options.admissionTrustPolicyDigest,
            admissionValidUntil,
          })
        );
        job = await options.store.readJob({ teamId, jobId: input.jobId, attempt: input.attempt });
        if (
          job.receipt.receiptId !== prepared.nextJob.receiptId ||
          job.receipt.state !== 'queued'
        ) {
          throw new ComputeJobDispatchError(
            'committed_readback_failed',
            'queued job did not read back as the exact committed receipt',
            undefined,
            true
          );
        }
        context = await readComputePlacementContext(options.store, teamId, job);
      }

      if (job.receipt.state !== 'queued') {
        throw new ComputeJobDispatchError('job_not_dispatchable', 'job did not resolve to queued');
      }
      const cursor = context.capacity.projection.cursor;
      if (cursor.slotState !== 'available') {
        throw new ComputeJobDispatchError(
          'capacity_unavailable',
          'logical capacity slot is not available'
        );
      }
      const expiresAt = minTimestamp(
        new Date(Date.parse(dispatchedAt) + leaseTtlMs).toISOString(),
        options.executorIdentity.validUntil,
        context.plan.validUntil,
        context.bridgeAdmission?.validUntil ?? context.plan.validUntil,
        job.receipt.deadlineAt ?? context.plan.validUntil
      );
      if (Date.parse(expiresAt) <= Date.parse(dispatchedAt)) {
        throw new ComputeJobDispatchError(
          'capacity_unavailable',
          'no positive lease validity remains'
        );
      }
      const fencingEpoch = cursor.currentEpoch + 1;
      const fencingToken = deriveFencingToken({
        fencingKey,
        identity: options.executorIdentity,
        principalDigest: job.receipt.principalDigest,
        jobId: job.receipt.jobId,
        attempt: job.receipt.attempt,
        capacityRef: context.plan.capacityRef,
        fencingEpoch,
        holderDigest,
      });
      try {
        const preparedLease = prepareComputeCapacityLease({
          principalDigest: job.receipt.principalDigest,
          jobId: job.receipt.jobId,
          attempt: job.receipt.attempt,
          holderDigest,
          workUnit: context.workUnit.contract,
          capacitySnapshot: context.capacitySnapshot,
          bridgeAdmission: context.bridgeAdmission,
          plan: context.plan,
          issuedAt: dispatchedAt,
          expiresAt,
          fencingToken,
          allocationCursor: cursor,
          trustAnchors: options.evidenceTrustAnchors,
          signer: options.evidenceSigner,
        });
        const prepared = prepareComputeJobTransition({
          expectedJob: job.receipt,
          action: 'acquire_lease',
          preparedLease,
          leaseVerification: {
            principalDigest: job.receipt.principalDigest,
            jobId: job.receipt.jobId,
            attempt: job.receipt.attempt,
            holderDigest,
            workUnit: context.workUnit.contract,
            capacitySnapshot: context.capacitySnapshot,
            bridgeAdmission: context.bridgeAdmission,
            plan: context.plan,
            lease: preparedLease.lease,
            at: dispatchedAt,
            trustAnchors: options.evidenceTrustAnchors,
          },
          transitionedAt: dispatchedAt,
          idempotencyKey: transitionIdempotencyKey(
            options.executorIdentity,
            job.receipt,
            'acquire_lease'
          ),
        });
        const maxAmountMinorUnits = context.workUnit.contract.compute.budget.maxCostMinorUnits;
        let budgetEvidence: ComputeBudgetEvidence | undefined;
        if (maxAmountMinorUnits > 0) {
          const registered = await options.store.readRegisteredBudget({
            teamId,
            ...options.budgetAccount,
          });
          const budget = registered.projection;
          if (
            budget.teamId !== teamId ||
            budget.budgetRailId !== options.budgetAccount.budgetRailId ||
            budget.currency !== context.workUnit.contract.compute.budget.currency ||
            budget.periodDigest !== options.budgetAccount.periodDigest
          ) {
            throw new ComputeJobDispatchError(
              'budget_unavailable',
              'registered budget does not match server dispatch policy'
            );
          }
          const remaining =
            budget.limitAmountMinorUnits -
            budget.account.heldAmountMinorUnits -
            budget.account.settledAmountMinorUnits;
          if (remaining < maxAmountMinorUnits) {
            throw new ComputeJobDispatchError(
              'budget_unavailable',
              'registered budget has insufficient unheld capacity'
            );
          }
          budgetEvidence = buildComputeBudgetEvidence({
            teamId,
            budgetRailId: budget.budgetRailId,
            principalDigest: job.receipt.principalDigest,
            jobId: job.receipt.jobId,
            attempt: job.receipt.attempt,
            workUnitDigest: context.workUnit.digest,
            currency: budget.currency,
            maxAmountMinorUnits,
            policyDigest: budget.policyDigest,
            periodDigest: budget.periodDigest,
            nonceDigest: digestCanonical({
              domain: BUDGET_NONCE_DOMAIN,
              teamId,
              jobId: job.receipt.jobId,
              attempt: job.receipt.attempt,
              transitionReceiptId: prepared.transition.receiptId,
              periodDigest: budget.periodDigest,
            }),
            idempotencyKeyHash: prepared.transition.request.idempotencyKeyHash,
            status: 'held',
            heldAmountMinorUnits: maxAmountMinorUnits,
            settledAmountMinorUnits: 0,
            accountBefore: budget.account,
            accountAfter: {
              heldAmountMinorUnits: budget.account.heldAmountMinorUnits + maxAmountMinorUnits,
              settledAmountMinorUnits: budget.account.settledAmountMinorUnits,
              version: budget.account.version + 1,
            },
            issuedAt: dispatchedAt,
            validFrom: dispatchedAt,
            validUntil: minTimestamp(
              budget.validUntil,
              options.executorIdentity.validUntil,
              expiresAt
            ),
            signer: options.budgetSigner,
          });
        }
        const leaseEnvelope = evidenceEnvelope(preparedLease.lease);
        const commandEvidence = [...context.evidence, leaseEnvelope];
        const admissionValidUntil = minTimestamp(
          admissionKeyValidUntil,
          options.executorIdentity.validUntil,
          expiresAt,
          new Date(Date.parse(dispatchedAt) + admissionTtlMs).toISOString()
        );
        const command = buildComputeTransitionCommand({
          operation: 'compute_job.acquire_lease',
          teamId,
          expectedJob: job,
          prepared,
          workUnit: context.workUnit,
          evidence: commandEvidence,
          admissionSigner: options.admissionSigner,
          admissionTrustPolicyDigest: options.admissionTrustPolicyDigest,
          admissionValidUntil,
          allocation: {
            capacity: context.capacity,
            expectedAllocation: preparedLease.expectedAllocation,
            nextAllocation: preparedLease.nextAllocation,
          },
          budgetEvidence,
        });
        const committed = await options.store.commitTransition(command);
        if (
          committed.transitionReceiptId !== prepared.transition.receiptId ||
          committed.readBack.jobReceiptId !== prepared.nextJob.receiptId ||
          committed.allocationCommitReceiptId !== prepared.allocatorCommit?.receiptId ||
          committed.readBack.allocationEtag !== preparedLease.nextAllocation.etag ||
          committed.budgetEvidenceReceiptId !== budgetEvidence?.receiptId ||
          committed.readBack.budgetEvidenceReceiptId !== budgetEvidence?.receiptId
        ) {
          throw new ComputeJobDispatchError(
            'committed_readback_failed',
            'leased job did not read back as the exact committed custody artifacts',
            undefined,
            true
          );
        }
        const leasedCapacity: RegisteredComputeCapacity = {
          ...context.capacity,
          projection: {
            ...context.capacity.projection,
            cursor: preparedLease.nextAllocation,
            bytes: canonicalJson(preparedLease.nextAllocation),
          },
        };
        const grant = await sealGrant({
          sealer: options.grantSealer,
          identity: options.executorIdentity,
          holderDigest,
          job: prepared.nextJob,
          workUnit: context.workUnit,
          capacity: leasedCapacity,
          fencingToken,
          budgetEvidence,
        });
        return { publicResponseBytes: committed.publicResponseBytes, grant };
      } finally {
        fencingToken.fill(0);
      }
    } catch (error) {
      dispatchError(error);
    }
  }

  return { dispatch };
}
