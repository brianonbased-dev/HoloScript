/**
 * Signed, content-addressed custody for a fenced compute executor.
 *
 * These receipts acknowledge who owns the right to launch a running job and
 * refresh that ownership. They do not assert provider reservation, active GPU
 * possession, kernel dispatch, completion, cost, or payment.
 */

import {
  createHash,
  createPrivateKey,
  createPublicKey,
  sign as signMessage,
  verify as verifyMessage,
  type KeyObject,
} from 'crypto';
import type {
  ComputeJobAdmissionSigner,
  ComputeJobAdmissionTrustAnchor,
} from './compute-job-admission';

export const COMPUTE_EXECUTION_OWNERSHIP_SCHEMA_VERSION =
  'holomesh.compute-execution-ownership.v1' as const;
export const COMPUTE_EXECUTION_OWNERSHIP_OUTBOX_SCHEMA_VERSION =
  'holomesh.compute-execution-ownership-outbox.v1' as const;
export const COMPUTE_EXECUTION_HEARTBEAT_MAX_TTL_MS = 5 * 60 * 1_000;

const SHA256_LABEL = /^sha256:[a-f0-9]{64}$/;
const MAX_FUTURE_SKEW_MS = 60_000;

type JsonObject = Record<string, unknown>;

export type ComputeExecutionOwnershipKind = 'running_acknowledgement' | 'heartbeat';

interface ComputeExecutionOwnershipBody {
  readonly schemaVersion: typeof COMPUTE_EXECUTION_OWNERSHIP_SCHEMA_VERSION;
  readonly verificationScope: 'service_attested_fenced_executor_ownership';
  readonly providerReservation: 'not_asserted';
  readonly execution: 'not_asserted';
  readonly startPermission: 'outbox_after_commit';
  readonly kind: ComputeExecutionOwnershipKind;
  readonly teamId: string;
  readonly principalDigest: string;
  readonly jobId: string;
  readonly attempt: number;
  readonly workUnitDigest: string;
  readonly leaseReceiptId: string;
  readonly holderDigest: string;
  readonly fencingTokenHash: string;
  readonly capacityRef: string;
  readonly fencingEpoch: number;
  readonly sequence: number;
  readonly previousReceiptId?: string;
  readonly acknowledgedAt: string;
  readonly heartbeatAt: string;
  readonly heartbeatValidUntil: string;
  readonly trustPolicyDigest: string;
  readonly issuer: string;
  readonly keyId: string;
  readonly signatureAlgorithm: 'Ed25519';
}

export interface PreparedComputeExecutionOwnership extends ComputeExecutionOwnershipBody {}

export interface ComputeExecutionOwnershipReceipt extends PreparedComputeExecutionOwnership {
  readonly receiptId: string;
  readonly signatureBase64: string;
}

export interface ComputeExecutionOwnershipEnvelope {
  readonly receiptId: string;
  readonly schemaVersion: typeof COMPUTE_EXECUTION_OWNERSHIP_SCHEMA_VERSION;
  readonly receipt: ComputeExecutionOwnershipReceipt;
  readonly bytes: string;
}

export interface PrepareComputeExecutionOwnershipInput {
  readonly kind: ComputeExecutionOwnershipKind;
  readonly teamId: string;
  readonly principalDigest: string;
  readonly jobId: string;
  readonly attempt: number;
  readonly workUnitDigest: string;
  readonly leaseReceiptId: string;
  readonly holderDigest: string;
  readonly fencingTokenHash: string;
  readonly capacityRef: string;
  readonly fencingEpoch: number;
  readonly sequence: number;
  readonly previousReceiptId?: string;
  readonly acknowledgedAt: string;
  readonly heartbeatAt: string;
  readonly heartbeatValidUntil: string;
  readonly trustPolicyDigest: string;
  readonly issuer: string;
  readonly keyId: string;
}

export interface VerifyComputeExecutionOwnershipExpected {
  readonly kind?: ComputeExecutionOwnershipKind;
  readonly teamId: string;
  readonly principalDigest: string;
  readonly jobId: string;
  readonly attempt: number;
  readonly workUnitDigest: string;
  readonly leaseReceiptId: string;
  readonly holderDigest: string;
  readonly fencingTokenHash: string;
  readonly capacityRef: string;
  readonly fencingEpoch: number;
  readonly trustPolicyDigest: string;
  readonly sequence?: number;
  readonly previousReceiptId?: string;
}

export interface VerifyComputeExecutionOwnershipInput {
  readonly receipt: unknown;
  readonly receiptBytes?: string;
  readonly expected: VerifyComputeExecutionOwnershipExpected;
  readonly trustAnchors: readonly ComputeJobAdmissionTrustAnchor[];
  readonly at: string;
}

export type ComputeExecutionOwnershipVerification =
  | {
      readonly valid: true;
      readonly receipt: ComputeExecutionOwnershipReceipt;
      readonly canonicalReceiptBytes: string;
      readonly effectiveValidUntil: string;
    }
  | { readonly valid: false; readonly errors: readonly string[] };

export interface ComputeExecutionOwnershipOutboxEnvelope {
  readonly eventId: string;
  readonly aggregateKind: 'compute_execution';
  readonly aggregateId: string;
  readonly eventType: 'compute_execution.claimed' | 'compute_execution.heartbeat';
  readonly bytes: string;
}

function isRecord(value: unknown): value is JsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function canonicalize(value: unknown): unknown {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || Object.is(value, -0)) {
      throw new TypeError('canonical JSON requires finite non-negative-zero numbers');
    }
    return value;
  }
  if (Array.isArray(value)) return value.map(canonicalize);
  if (isRecord(value)) {
    const result: JsonObject = {};
    for (const key of Object.keys(value).sort()) {
      if (value[key] === undefined) throw new TypeError('canonical JSON cannot contain undefined');
      result[key] = canonicalize(value[key]);
    }
    return result;
  }
  throw new TypeError(`canonical JSON cannot contain ${typeof value}`);
}

export function canonicalComputeExecutionOwnershipJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function contentDigest(value: unknown): string {
  return `sha256:${createHash('sha256')
    .update(canonicalComputeExecutionOwnershipJson(value), 'utf8')
    .digest('hex')}`;
}

function timestamp(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value ? parsed : null;
}

function hasText(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value === value.trim();
}

function canonicalSignature(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try {
    const bytes = Buffer.from(value, 'base64');
    return bytes.byteLength === 64 && bytes.toString('base64') === value;
  } catch {
    return false;
  }
}

function unsignedReceipt(receipt: ComputeExecutionOwnershipReceipt): ComputeExecutionOwnershipBody {
  const { receiptId: _receiptId, signatureBase64: _signatureBase64, ...body } = receipt;
  return body;
}

function signedReceiptBody(
  receipt: ComputeExecutionOwnershipReceipt
): Omit<ComputeExecutionOwnershipReceipt, 'receiptId'> {
  const { receiptId: _receiptId, ...body } = receipt;
  return body;
}

function expectedKeys(receipt: JsonObject): string[] {
  return [
    'schemaVersion',
    'verificationScope',
    'providerReservation',
    'execution',
    'startPermission',
    'kind',
    'teamId',
    'principalDigest',
    'jobId',
    'attempt',
    'workUnitDigest',
    'leaseReceiptId',
    'holderDigest',
    'fencingTokenHash',
    'capacityRef',
    'fencingEpoch',
    'sequence',
    ...(receipt.previousReceiptId === undefined ? [] : ['previousReceiptId']),
    'acknowledgedAt',
    'heartbeatAt',
    'heartbeatValidUntil',
    'trustPolicyDigest',
    'issuer',
    'keyId',
    'signatureAlgorithm',
    'receiptId',
    'signatureBase64',
  ].sort();
}

export function validateComputeExecutionOwnershipReceipt(value: unknown): {
  readonly valid: boolean;
  readonly errors: readonly string[];
} {
  const errors: string[] = [];
  if (!isRecord(value)) return { valid: false, errors: ['ownership receipt must be an object'] };
  const actualKeys = Object.keys(value).sort();
  if (
    canonicalComputeExecutionOwnershipJson(actualKeys) !==
    canonicalComputeExecutionOwnershipJson(expectedKeys(value))
  ) {
    errors.push('ownership receipt contains missing or unknown fields');
  }
  if (value.schemaVersion !== COMPUTE_EXECUTION_OWNERSHIP_SCHEMA_VERSION) {
    errors.push(`schemaVersion must be ${COMPUTE_EXECUTION_OWNERSHIP_SCHEMA_VERSION}`);
  }
  if (value.verificationScope !== 'service_attested_fenced_executor_ownership') {
    errors.push('verificationScope is invalid');
  }
  if (value.providerReservation !== 'not_asserted' || value.execution !== 'not_asserted') {
    errors.push('ownership receipt cannot assert provider reservation or execution');
  }
  if (value.startPermission !== 'outbox_after_commit') errors.push('startPermission is invalid');
  if (value.kind !== 'running_acknowledgement' && value.kind !== 'heartbeat') {
    errors.push('kind is invalid');
  }
  if (!hasText(value.teamId)) errors.push('teamId is invalid');
  for (const field of [
    'principalDigest',
    'jobId',
    'workUnitDigest',
    'leaseReceiptId',
    'holderDigest',
    'fencingTokenHash',
    'capacityRef',
    'trustPolicyDigest',
    'receiptId',
  ] as const) {
    if (typeof value[field] !== 'string' || !SHA256_LABEL.test(value[field])) {
      errors.push(`${field} must be a sha256 label`);
    }
  }
  if (!Number.isSafeInteger(value.attempt) || (value.attempt as number) < 1) {
    errors.push('attempt must be a positive safe integer');
  }
  if (!Number.isSafeInteger(value.fencingEpoch) || (value.fencingEpoch as number) < 1) {
    errors.push('fencingEpoch must be a positive safe integer');
  }
  if (!Number.isSafeInteger(value.sequence) || (value.sequence as number) < 0) {
    errors.push('sequence must be a nonnegative safe integer');
  }
  if (!hasText(value.issuer) || !hasText(value.keyId)) errors.push('issuer and keyId are required');
  if (value.signatureAlgorithm !== 'Ed25519') errors.push('signatureAlgorithm must be Ed25519');
  if (!canonicalSignature(value.signatureBase64)) errors.push('signatureBase64 is invalid');

  const acknowledgedAt = timestamp(value.acknowledgedAt);
  const heartbeatAt = timestamp(value.heartbeatAt);
  const heartbeatValidUntil = timestamp(value.heartbeatValidUntil);
  if (acknowledgedAt === null || heartbeatAt === null || heartbeatValidUntil === null) {
    errors.push('ownership timestamps must be canonical ISO timestamps');
  } else {
    if (heartbeatAt < acknowledgedAt) errors.push('heartbeatAt precedes acknowledgedAt');
    if (heartbeatValidUntil <= heartbeatAt) errors.push('heartbeat validity must be half-open');
    if (heartbeatValidUntil - heartbeatAt > COMPUTE_EXECUTION_HEARTBEAT_MAX_TTL_MS) {
      errors.push('heartbeat TTL exceeds the maximum');
    }
  }
  if (value.kind === 'running_acknowledgement') {
    if (value.sequence !== 0 || value.previousReceiptId !== undefined) {
      errors.push('running acknowledgement must begin ownership sequence zero');
    }
    if (value.acknowledgedAt !== value.heartbeatAt) {
      errors.push('running acknowledgement must also be the initial heartbeat');
    }
  }
  if (value.kind === 'heartbeat') {
    if ((value.sequence as number) < 1 || !SHA256_LABEL.test(String(value.previousReceiptId))) {
      errors.push('heartbeat must advance one prior ownership receipt');
    }
  }
  if (errors.length === 0) {
    const typed = value as unknown as ComputeExecutionOwnershipReceipt;
    if (contentDigest(signedReceiptBody(typed)) !== typed.receiptId) {
      errors.push('receiptId does not match the canonical ownership body');
    }
  }
  return { valid: errors.length === 0, errors };
}

function privateEd25519Key(value: string | KeyObject): KeyObject {
  const key = typeof value === 'string' ? createPrivateKey(value) : value;
  if (key.type !== 'private' || key.asymmetricKeyType !== 'ed25519') {
    throw new TypeError('ownership signer must use an Ed25519 private key');
  }
  return key;
}

export function prepareComputeExecutionOwnership(
  input: PrepareComputeExecutionOwnershipInput
): PreparedComputeExecutionOwnership {
  const body: ComputeExecutionOwnershipBody = {
    schemaVersion: COMPUTE_EXECUTION_OWNERSHIP_SCHEMA_VERSION,
    verificationScope: 'service_attested_fenced_executor_ownership',
    providerReservation: 'not_asserted',
    execution: 'not_asserted',
    startPermission: 'outbox_after_commit',
    kind: input.kind,
    teamId: input.teamId,
    principalDigest: input.principalDigest,
    jobId: input.jobId,
    attempt: input.attempt,
    workUnitDigest: input.workUnitDigest,
    leaseReceiptId: input.leaseReceiptId,
    holderDigest: input.holderDigest,
    fencingTokenHash: input.fencingTokenHash,
    capacityRef: input.capacityRef,
    fencingEpoch: input.fencingEpoch,
    sequence: input.sequence,
    ...(input.previousReceiptId ? { previousReceiptId: input.previousReceiptId } : {}),
    acknowledgedAt: input.acknowledgedAt,
    heartbeatAt: input.heartbeatAt,
    heartbeatValidUntil: input.heartbeatValidUntil,
    trustPolicyDigest: input.trustPolicyDigest,
    issuer: input.issuer,
    keyId: input.keyId,
    signatureAlgorithm: 'Ed25519',
  };
  return body;
}

export function signComputeExecutionOwnership(
  prepared: PreparedComputeExecutionOwnership,
  signer: ComputeJobAdmissionSigner
): ComputeExecutionOwnershipReceipt {
  if (prepared.issuer !== signer.issuer || prepared.keyId !== signer.keyId) {
    throw new TypeError('ownership signer does not match the prepared issuer');
  }
  const signatureBase64 = signMessage(
    null,
    Buffer.from(canonicalComputeExecutionOwnershipJson(prepared), 'utf8'),
    privateEd25519Key(signer.privateKey)
  ).toString('base64');
  const signedBody = { ...prepared, signatureBase64 };
  const receipt = { ...signedBody, receiptId: contentDigest(signedBody) };
  const validation = validateComputeExecutionOwnershipReceipt(receipt);
  if (!validation.valid) throw new TypeError(validation.errors.join('; '));
  return receipt;
}

export function prepareAndSignComputeExecutionOwnership(
  input: PrepareComputeExecutionOwnershipInput,
  signer: ComputeJobAdmissionSigner
): ComputeExecutionOwnershipReceipt {
  return signComputeExecutionOwnership(prepareComputeExecutionOwnership(input), signer);
}

export function createComputeExecutionOwnershipEnvelope(
  receipt: ComputeExecutionOwnershipReceipt
): ComputeExecutionOwnershipEnvelope {
  const validation = validateComputeExecutionOwnershipReceipt(receipt);
  if (!validation.valid) throw new TypeError(validation.errors.join('; '));
  return {
    receiptId: receipt.receiptId,
    schemaVersion: COMPUTE_EXECUTION_OWNERSHIP_SCHEMA_VERSION,
    receipt,
    bytes: canonicalComputeExecutionOwnershipJson(receipt),
  };
}

function anchorExpiry(anchor: ComputeJobAdmissionTrustAnchor): string {
  const candidates = [anchor.validUntil, ...(anchor.revokedAt ? [anchor.revokedAt] : [])];
  return new Date(Math.min(...candidates.map((value) => Date.parse(value)))).toISOString();
}

export function verifyComputeExecutionOwnership(
  input: VerifyComputeExecutionOwnershipInput
): ComputeExecutionOwnershipVerification {
  const errors: string[] = [];
  const structural = validateComputeExecutionOwnershipReceipt(input.receipt);
  if (!structural.valid) return { valid: false, errors: structural.errors };
  const receipt = input.receipt as ComputeExecutionOwnershipReceipt;
  const canonicalReceiptBytes = canonicalComputeExecutionOwnershipJson(receipt);
  if (input.receiptBytes !== undefined && input.receiptBytes !== canonicalReceiptBytes) {
    errors.push('receipt bytes are not exact canonical ownership bytes');
  }
  const expected = input.expected;
  for (const [label, actual, wanted] of [
    ['teamId', receipt.teamId, expected.teamId],
    ['principalDigest', receipt.principalDigest, expected.principalDigest],
    ['jobId', receipt.jobId, expected.jobId],
    ['attempt', receipt.attempt, expected.attempt],
    ['workUnitDigest', receipt.workUnitDigest, expected.workUnitDigest],
    ['leaseReceiptId', receipt.leaseReceiptId, expected.leaseReceiptId],
    ['holderDigest', receipt.holderDigest, expected.holderDigest],
    ['fencingTokenHash', receipt.fencingTokenHash, expected.fencingTokenHash],
    ['capacityRef', receipt.capacityRef, expected.capacityRef],
    ['fencingEpoch', receipt.fencingEpoch, expected.fencingEpoch],
    ['trustPolicyDigest', receipt.trustPolicyDigest, expected.trustPolicyDigest],
  ] as const) {
    if (actual !== wanted) errors.push(`${label} does not match expected ownership context`);
  }
  if (expected.kind !== undefined && receipt.kind !== expected.kind) errors.push('kind mismatch');
  if (expected.sequence !== undefined && receipt.sequence !== expected.sequence) {
    errors.push('sequence mismatch');
  }
  if (
    expected.previousReceiptId !== undefined &&
    receipt.previousReceiptId !== expected.previousReceiptId
  ) {
    errors.push('previousReceiptId mismatch');
  }

  const anchors = input.trustAnchors.filter(
    (anchor) => anchor.issuer === receipt.issuer && anchor.keyId === receipt.keyId
  );
  if (anchors.length !== 1) {
    errors.push('ownership trust anchor is not unique');
    return { valid: false, errors };
  }
  const anchor = anchors[0];
  const heartbeatAt = Date.parse(receipt.heartbeatAt);
  const at = timestamp(input.at);
  const validFrom = timestamp(anchor.validFrom);
  const validUntil = timestamp(anchor.validUntil);
  const revokedAt = anchor.revokedAt ? timestamp(anchor.revokedAt) : null;
  if (
    anchor.schemaVersion !== 'holomesh.compute-job-admission-trust-anchor.v1' ||
    anchor.algorithm !== 'Ed25519' ||
    at === null ||
    validFrom === null ||
    validUntil === null ||
    (anchor.revokedAt !== undefined && revokedAt === null)
  ) {
    errors.push('ownership trust anchor or verification time is invalid');
  } else {
    if (!anchor.allowedTeamIds.includes(receipt.teamId)) errors.push('team is not allowed');
    if (!anchor.allowedPrincipalDigests.includes(receipt.principalDigest)) {
      errors.push('principal is not allowed');
    }
    if (!anchor.allowedTrustPolicyDigests.includes(receipt.trustPolicyDigest)) {
      errors.push('trust policy is not allowed');
    }
    if (
      heartbeatAt < validFrom ||
      heartbeatAt >= validUntil ||
      (revokedAt && heartbeatAt >= revokedAt)
    ) {
      errors.push('ownership signer was not active at heartbeat time');
    }
    if (heartbeatAt > at + MAX_FUTURE_SKEW_MS) errors.push('heartbeat is future-dated');
    const effectiveValidUntil = Math.min(
      Date.parse(receipt.heartbeatValidUntil),
      Date.parse(anchorExpiry(anchor))
    );
    if (at >= effectiveValidUntil) errors.push('ownership heartbeat or signer is expired');
    if (Date.parse(receipt.heartbeatValidUntil) > Date.parse(anchorExpiry(anchor))) {
      errors.push('ownership heartbeat outlives its signer');
    }
  }

  try {
    const key =
      typeof anchor.publicKey === 'string' ? createPublicKey(anchor.publicKey) : anchor.publicKey;
    if (
      key.type !== 'public' ||
      key.asymmetricKeyType !== 'ed25519' ||
      !verifyMessage(
        null,
        Buffer.from(canonicalComputeExecutionOwnershipJson(unsignedReceipt(receipt)), 'utf8'),
        key,
        Buffer.from(receipt.signatureBase64, 'base64')
      )
    ) {
      errors.push('ownership signature is invalid');
    }
  } catch {
    errors.push('ownership signature is invalid');
  }
  if (errors.length > 0) return { valid: false, errors };
  return {
    valid: true,
    receipt,
    canonicalReceiptBytes,
    effectiveValidUntil: new Date(
      Math.min(Date.parse(receipt.heartbeatValidUntil), Date.parse(anchorExpiry(anchor)))
    ).toISOString(),
  };
}

export function buildComputeExecutionOwnershipOutboxEnvelope(
  receipt: ComputeExecutionOwnershipReceipt
): ComputeExecutionOwnershipOutboxEnvelope {
  const validation = validateComputeExecutionOwnershipReceipt(receipt);
  if (!validation.valid) throw new TypeError(validation.errors.join('; '));
  const eventType =
    receipt.kind === 'running_acknowledgement'
      ? ('compute_execution.claimed' as const)
      : ('compute_execution.heartbeat' as const);
  const body = {
    schemaVersion: COMPUTE_EXECUTION_OWNERSHIP_OUTBOX_SCHEMA_VERSION,
    verificationScope: 'fenced_executor_ownership_only',
    providerReservation: 'not_asserted',
    execution: 'not_asserted',
    aggregateKind: 'compute_execution' as const,
    aggregateId: receipt.jobId,
    eventType,
    ownershipReceiptId: receipt.receiptId,
    jobId: receipt.jobId,
    attempt: receipt.attempt,
    leaseReceiptId: receipt.leaseReceiptId,
    holderDigest: receipt.holderDigest,
    fencingEpoch: receipt.fencingEpoch,
    sequence: receipt.sequence,
    heartbeatAt: receipt.heartbeatAt,
    heartbeatValidUntil: receipt.heartbeatValidUntil,
    startPermission: receipt.startPermission,
  };
  const eventId = contentDigest({
    domain: COMPUTE_EXECUTION_OWNERSHIP_OUTBOX_SCHEMA_VERSION,
    event: body,
  });
  return {
    eventId,
    aggregateKind: 'compute_execution',
    aggregateId: receipt.jobId,
    eventType,
    bytes: canonicalComputeExecutionOwnershipJson({ ...body, eventId }),
  };
}
