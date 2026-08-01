/**
 * Short-lived, authenticated admission receipts for durable compute jobs.
 *
 * A valid receipt proves that an allowlisted issuer authenticated one exact
 * compute admission decision and its durable evidence bytes. It does not prove
 * provider reservation, provider possession, job start, or execution.
 */

import {
  createHash,
  createPrivateKey,
  createPublicKey,
  sign as signMessage,
  verify as verifyMessage,
  type KeyObject,
} from 'crypto';
import {
  computeWorkUnitDigest,
  validateComputeWorkUnitContract,
  type ComputeDataClassification,
  type ComputeWorkUnitContract,
} from '@holoscript/core/compiler';

export const COMPUTE_JOB_ADMISSION_SCHEMA_VERSION = 'holomesh.compute-job-admission.v1' as const;
export const COMPUTE_JOB_ADMISSION_TRUST_ANCHOR_SCHEMA_VERSION =
  'holomesh.compute-job-admission-trust-anchor.v1' as const;
export const COMPUTE_JOB_ADMISSION_MAX_TTL_MS = 5 * 60 * 1_000;

const SHA256_LABEL = /^sha256:[a-f0-9]{64}$/;
const ADMISSION_OPERATIONS = [
  'compute_job.create',
  'compute_job.queue',
  'compute_job.acquire_lease',
  'compute_job.start',
  'compute_job.mark_running',
  'compute_job.succeed',
  'compute_job.fail',
  'compute_job.cancel',
] as const;
const ADMISSION_OPERATION_SET = new Set<string>(ADMISSION_OPERATIONS);
const DATA_CLASSIFICATIONS = new Set<ComputeDataClassification>([
  'public',
  'internal',
  'confidential',
  'restricted',
]);

export type ComputeJobAdmissionOperation = (typeof ADMISSION_OPERATIONS)[number];

/** Store-compatible exact evidence envelope. `bytes` must be canonical JSON. */
export interface ComputeJobAdmissionEvidence {
  readonly receiptId: string;
  readonly schemaVersion: string;
  readonly bytes: string;
}

export interface ComputeJobAdmissionEvidenceBinding {
  readonly receiptId: string;
  readonly schemaVersion: string;
  /** SHA-256 over the exact UTF-8 bytes, including the evidence receiptId. */
  readonly canonicalBytesDigest: string;
}

export type ComputeJobAdmissionLifecycleBinding =
  | {
      readonly kind: 'create';
      readonly createdJobReceiptId: string;
    }
  | {
      readonly kind: 'transition';
      readonly expectedJobReceiptId: string;
      readonly nextJobReceiptId: string;
      readonly transitionReceiptId: string;
    };

interface ComputeJobAdmissionBody {
  readonly schemaVersion: typeof COMPUTE_JOB_ADMISSION_SCHEMA_VERSION;
  readonly verificationScope: 'authenticated_admission_only';
  readonly providerReservation: 'not_proven';
  readonly execution: 'not_proven';
  readonly teamId: string;
  readonly principalDigest: string;
  readonly jobId: string;
  readonly attempt: number;
  readonly operation: ComputeJobAdmissionOperation;
  readonly requestDigest: string;
  readonly workUnitDigest: string;
  readonly dataClassification: ComputeDataClassification;
  readonly evidenceBindings: readonly ComputeJobAdmissionEvidenceBinding[];
  readonly trustPolicyDigest: string;
  readonly lifecycle: ComputeJobAdmissionLifecycleBinding;
  readonly verifiedAt: string;
  readonly validUntil: string;
  readonly issuer: string;
  readonly keyId: string;
  readonly signatureAlgorithm: 'Ed25519';
}

export interface PreparedComputeJobAdmission extends ComputeJobAdmissionBody {
  /** Content address of the body above, before receiptId or signature are added. */
  readonly receiptId: string;
}

export interface ComputeJobAdmissionReceipt extends PreparedComputeJobAdmission {
  /** Ed25519 signature over the exact canonical PreparedComputeJobAdmission bytes. */
  readonly signatureBase64: string;
}

/** Exact canonical receipt bytes suitable for immutable durable persistence. */
export interface ComputeJobAdmissionEnvelope {
  readonly receipt: ComputeJobAdmissionReceipt;
  readonly bytes: string;
}

export interface ComputeJobAdmissionSigner {
  readonly issuer: string;
  readonly keyId: string;
  readonly privateKey: string | KeyObject;
}

export interface ComputeJobAdmissionTrustAnchor {
  readonly schemaVersion: typeof COMPUTE_JOB_ADMISSION_TRUST_ANCHOR_SCHEMA_VERSION;
  readonly issuer: string;
  readonly keyId: string;
  readonly algorithm: 'Ed25519';
  /** PEM-encoded Ed25519 public key or a public KeyObject. */
  readonly publicKey: string | KeyObject;
  readonly allowedTeamIds: readonly string[];
  readonly allowedPrincipalDigests: readonly string[];
  readonly allowedTrustPolicyDigests: readonly string[];
  readonly validFrom: string;
  readonly validUntil: string;
  /** Revocation is effective at this instant (half-open validity). */
  readonly revokedAt?: string;
}

export interface PrepareComputeJobAdmissionInput {
  readonly teamId: string;
  readonly principalDigest: string;
  readonly jobId: string;
  readonly attempt: number;
  readonly operation: ComputeJobAdmissionOperation;
  readonly requestDigest: string;
  readonly workUnit: ComputeWorkUnitContract;
  readonly evidence: readonly ComputeJobAdmissionEvidence[];
  readonly trustPolicyDigest: string;
  readonly lifecycle: ComputeJobAdmissionLifecycleBinding;
  readonly verifiedAt: string;
  readonly validUntil: string;
  readonly issuer: string;
  readonly keyId: string;
}

export interface VerifyComputeJobAdmissionExpectedContext {
  readonly teamId: string;
  readonly principalDigest: string;
  readonly jobId: string;
  readonly attempt: number;
  readonly operation: ComputeJobAdmissionOperation;
  readonly requestDigest: string;
  readonly trustPolicyDigest: string;
  readonly lifecycle: ComputeJobAdmissionLifecycleBinding;
}

export interface VerifyComputeJobAdmissionInput {
  readonly receipt: unknown;
  /** When supplied, must be the exact canonical UTF-8 JSON for `receipt`. */
  readonly receiptBytes?: string;
  readonly evidence: readonly ComputeJobAdmissionEvidence[];
  readonly workUnit: ComputeWorkUnitContract;
  readonly expected: VerifyComputeJobAdmissionExpectedContext;
  readonly trustAnchors: readonly ComputeJobAdmissionTrustAnchor[];
  /** Canonical verification instant. Admission and anchor windows are half-open. */
  readonly at: string;
}

const VERIFICATION_REASONS = [
  'verification_input_invalid',
  'verification_time_invalid',
  'receipt_invalid',
  'receipt_ttl_invalid',
  'receipt_bytes_mismatch',
  'receipt_content_address_invalid',
  'receipt_signature_invalid',
  'evidence_invalid',
  'evidence_bindings_noncanonical',
  'evidence_bytes_mismatch',
  'work_unit_invalid',
  'work_unit_mismatch',
  'context_mismatch',
  'unknown_key',
  'ambiguous_key',
  'trust_anchor_invalid',
  'team_not_allowed',
  'principal_not_allowed',
  'trust_policy_not_allowed',
  'anchor_not_current_at_admission',
  'anchor_not_current_at_verification',
  'anchor_revoked_at_admission',
  'anchor_revoked_at_verification',
  'admission_verified_at_future',
  'admission_expired',
] as const;

export type ComputeJobAdmissionVerificationReason = (typeof VERIFICATION_REASONS)[number];

export type ComputeJobAdmissionVerificationResult =
  | {
      readonly valid: true;
      readonly receipt: ComputeJobAdmissionReceipt;
      /** Canonical bytes verified above; safe to compare with durable readback. */
      readonly canonicalReceiptBytes: string;
      readonly verification: {
        readonly scope: 'authenticated_admission_only';
        readonly admissionAuthenticated: true;
        readonly providerReservationVerified: false;
        readonly executionVerified: false;
      };
    }
  | {
      readonly valid: false;
      readonly reasonCodes: readonly ComputeJobAdmissionVerificationReason[];
    };

type VerificationReasons = Set<ComputeJobAdmissionVerificationReason>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function nonEmptyCanonicalText(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value === value.trim();
}

function nonNegativeInteger(value: unknown): value is number {
  return (
    typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && !Object.is(value, -0)
  );
}

function canonicalTimestamp(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== value) return null;
  return parsed;
}

function canonicalize(value: unknown): unknown {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || Object.is(value, -0)) {
      throw new TypeError('canonical JSON cannot contain non-canonical numbers');
    }
    return value;
  }
  if (Array.isArray(value)) return value.map(canonicalize);
  if (isRecord(value)) {
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) {
      if (value[key] === undefined) {
        throw new TypeError('canonical JSON cannot contain undefined');
      }
      result[key] = canonicalize(value[key]);
    }
    return result;
  }
  throw new TypeError(`canonical JSON cannot contain ${typeof value}`);
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function sha256Bytes(value: string): string {
  return `sha256:${createHash('sha256').update(Buffer.from(value, 'utf8')).digest('hex')}`;
}

function contentAddress(value: unknown): string {
  return sha256Bytes(canonicalJson(value));
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  return actual.length === wanted.length && actual.every((key, index) => key === wanted[index]);
}

function sameCanonicalValue(left: unknown, right: unknown): boolean {
  try {
    return canonicalJson(left) === canonicalJson(right);
  } catch {
    return false;
  }
}

function isCanonicalSortedUnique(values: readonly string[]): boolean {
  if (values.length === 0 || new Set(values).size !== values.length) return false;
  return values.every((value, index) => index === 0 || values[index - 1] < value);
}

function evidenceBindingOrder(
  left: ComputeJobAdmissionEvidenceBinding,
  right: ComputeJobAdmissionEvidenceBinding
): number {
  const compare = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
  return (
    compare(left.receiptId, right.receiptId) ||
    compare(left.schemaVersion, right.schemaVersion) ||
    compare(left.canonicalBytesDigest, right.canonicalBytesDigest)
  );
}

function validateLifecycleBinding(
  operation: unknown,
  value: unknown
): value is ComputeJobAdmissionLifecycleBinding {
  if (!isRecord(value)) return false;
  if (operation === 'compute_job.create') {
    return (
      exactKeys(value, ['kind', 'createdJobReceiptId']) &&
      value.kind === 'create' &&
      typeof value.createdJobReceiptId === 'string' &&
      SHA256_LABEL.test(value.createdJobReceiptId)
    );
  }
  if (!ADMISSION_OPERATION_SET.has(String(operation))) return false;
  return (
    exactKeys(value, ['kind', 'expectedJobReceiptId', 'nextJobReceiptId', 'transitionReceiptId']) &&
    value.kind === 'transition' &&
    typeof value.expectedJobReceiptId === 'string' &&
    SHA256_LABEL.test(value.expectedJobReceiptId) &&
    typeof value.nextJobReceiptId === 'string' &&
    SHA256_LABEL.test(value.nextJobReceiptId) &&
    typeof value.transitionReceiptId === 'string' &&
    SHA256_LABEL.test(value.transitionReceiptId) &&
    value.expectedJobReceiptId !== value.nextJobReceiptId
  );
}

function validateEvidenceBinding(value: unknown): value is ComputeJobAdmissionEvidenceBinding {
  return (
    isRecord(value) &&
    exactKeys(value, ['receiptId', 'schemaVersion', 'canonicalBytesDigest']) &&
    typeof value.receiptId === 'string' &&
    SHA256_LABEL.test(value.receiptId) &&
    nonEmptyCanonicalText(value.schemaVersion) &&
    typeof value.canonicalBytesDigest === 'string' &&
    SHA256_LABEL.test(value.canonicalBytesDigest)
  );
}

function prepareEvidenceBindings(
  evidence: readonly ComputeJobAdmissionEvidence[]
): ComputeJobAdmissionEvidenceBinding[] {
  if (!Array.isArray(evidence)) throw new TypeError('evidence must be an array');
  const bindings: ComputeJobAdmissionEvidenceBinding[] = [];
  const seen = new Set<string>();
  for (const [index, envelope] of evidence.entries()) {
    if (
      !isRecord(envelope) ||
      !exactKeys(envelope, ['receiptId', 'schemaVersion', 'bytes']) ||
      typeof envelope.receiptId !== 'string' ||
      !SHA256_LABEL.test(envelope.receiptId) ||
      !nonEmptyCanonicalText(envelope.schemaVersion) ||
      typeof envelope.bytes !== 'string'
    ) {
      throw new TypeError(`evidence[${index}] is invalid`);
    }
    if (seen.has(envelope.receiptId)) {
      throw new TypeError(`evidence receiptId ${envelope.receiptId} is duplicated`);
    }
    seen.add(envelope.receiptId);

    let parsed: unknown;
    try {
      parsed = JSON.parse(envelope.bytes) as unknown;
    } catch {
      throw new TypeError(`evidence[${index}].bytes is not JSON`);
    }
    if (!isRecord(parsed) || canonicalJson(parsed) !== envelope.bytes) {
      throw new TypeError(`evidence[${index}].bytes is not exact canonical JSON`);
    }
    if (
      parsed.receiptId !== envelope.receiptId ||
      parsed.schemaVersion !== envelope.schemaVersion
    ) {
      throw new TypeError(`evidence[${index}] metadata does not match its exact bytes`);
    }
    const { receiptId: _receiptId, ...body } = parsed;
    if (contentAddress(body) !== envelope.receiptId) {
      throw new TypeError(`evidence[${index}] is not content-addressed by receiptId`);
    }
    bindings.push({
      receiptId: envelope.receiptId,
      schemaVersion: envelope.schemaVersion,
      canonicalBytesDigest: sha256Bytes(envelope.bytes),
    });
  }
  return bindings.sort(evidenceBindingOrder);
}

function receiptBody(
  receipt: PreparedComputeJobAdmission | ComputeJobAdmissionReceipt
): ComputeJobAdmissionBody {
  const {
    receiptId: _receiptId,
    signatureBase64: _signatureBase64,
    ...body
  } = receipt as
    | ComputeJobAdmissionReceipt
    | (PreparedComputeJobAdmission & { readonly signatureBase64?: undefined });
  return body;
}

function unsignedReceipt(receipt: ComputeJobAdmissionReceipt): PreparedComputeJobAdmission {
  const { signatureBase64: _signatureBase64, ...prepared } = receipt;
  return prepared;
}

function canonicalBase64Signature(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try {
    const bytes = Buffer.from(value, 'base64');
    return bytes.length === 64 && bytes.toString('base64') === value;
  } catch {
    return false;
  }
}

function validateReceiptStructure(
  value: unknown,
  reasons: VerificationReasons
): ComputeJobAdmissionReceipt | null {
  const expectedKeys = [
    'schemaVersion',
    'verificationScope',
    'providerReservation',
    'execution',
    'receiptId',
    'teamId',
    'principalDigest',
    'jobId',
    'attempt',
    'operation',
    'requestDigest',
    'workUnitDigest',
    'dataClassification',
    'evidenceBindings',
    'trustPolicyDigest',
    'lifecycle',
    'verifiedAt',
    'validUntil',
    'issuer',
    'keyId',
    'signatureAlgorithm',
    'signatureBase64',
  ];
  if (!isRecord(value) || !exactKeys(value, expectedKeys)) {
    reasons.add('receipt_invalid');
    return null;
  }
  try {
    value = JSON.parse(canonicalJson(value)) as unknown;
  } catch {
    reasons.add('receipt_invalid');
    return null;
  }
  if (!isRecord(value) || !exactKeys(value, expectedKeys)) {
    reasons.add('receipt_invalid');
    return null;
  }

  const verifiedAtMs = canonicalTimestamp(value.verifiedAt);
  const validUntilMs = canonicalTimestamp(value.validUntil);
  const primitivesValid =
    value.schemaVersion === COMPUTE_JOB_ADMISSION_SCHEMA_VERSION &&
    value.verificationScope === 'authenticated_admission_only' &&
    value.providerReservation === 'not_proven' &&
    value.execution === 'not_proven' &&
    typeof value.receiptId === 'string' &&
    SHA256_LABEL.test(value.receiptId) &&
    nonEmptyCanonicalText(value.teamId) &&
    typeof value.principalDigest === 'string' &&
    SHA256_LABEL.test(value.principalDigest) &&
    nonEmptyCanonicalText(value.jobId) &&
    nonNegativeInteger(value.attempt) &&
    typeof value.operation === 'string' &&
    ADMISSION_OPERATION_SET.has(value.operation) &&
    typeof value.requestDigest === 'string' &&
    SHA256_LABEL.test(value.requestDigest) &&
    typeof value.workUnitDigest === 'string' &&
    SHA256_LABEL.test(value.workUnitDigest) &&
    typeof value.dataClassification === 'string' &&
    DATA_CLASSIFICATIONS.has(value.dataClassification as ComputeDataClassification) &&
    typeof value.trustPolicyDigest === 'string' &&
    SHA256_LABEL.test(value.trustPolicyDigest) &&
    verifiedAtMs !== null &&
    validUntilMs !== null &&
    nonEmptyCanonicalText(value.issuer) &&
    nonEmptyCanonicalText(value.keyId) &&
    value.signatureAlgorithm === 'Ed25519' &&
    canonicalBase64Signature(value.signatureBase64) &&
    validateLifecycleBinding(value.operation, value.lifecycle);
  if (!primitivesValid) {
    reasons.add('receipt_invalid');
    return null;
  }

  if (!Array.isArray(value.evidenceBindings)) {
    reasons.add('receipt_invalid');
    return null;
  }
  const bindings = value.evidenceBindings;
  if (!bindings.every(validateEvidenceBinding)) {
    reasons.add('receipt_invalid');
    return null;
  }
  const typedBindings = bindings as ComputeJobAdmissionEvidenceBinding[];
  const sortedBindings = [...typedBindings].sort(evidenceBindingOrder);
  const uniqueReceiptIds = new Set(typedBindings.map((binding) => binding.receiptId));
  if (
    uniqueReceiptIds.size !== typedBindings.length ||
    !sameCanonicalValue(typedBindings, sortedBindings)
  ) {
    reasons.add('evidence_bindings_noncanonical');
  }

  if (
    verifiedAtMs === null ||
    validUntilMs === null ||
    validUntilMs <= verifiedAtMs ||
    validUntilMs - verifiedAtMs > COMPUTE_JOB_ADMISSION_MAX_TTL_MS
  ) {
    reasons.add('receipt_ttl_invalid');
  }

  const receipt = value as unknown as ComputeJobAdmissionReceipt;
  if (contentAddress(receiptBody(receipt)) !== receipt.receiptId) {
    reasons.add('receipt_content_address_invalid');
  }
  return receipt;
}

function assertPrepareInput(input: PrepareComputeJobAdmissionInput): void {
  if (!nonEmptyCanonicalText(input.teamId)) throw new TypeError('teamId is invalid');
  if (!SHA256_LABEL.test(input.principalDigest)) throw new TypeError('principalDigest is invalid');
  if (!nonEmptyCanonicalText(input.jobId)) throw new TypeError('jobId is invalid');
  if (!nonNegativeInteger(input.attempt)) throw new TypeError('attempt is invalid');
  if (!ADMISSION_OPERATION_SET.has(input.operation)) throw new TypeError('operation is invalid');
  if (!SHA256_LABEL.test(input.requestDigest)) throw new TypeError('requestDigest is invalid');
  if (!SHA256_LABEL.test(input.trustPolicyDigest)) {
    throw new TypeError('trustPolicyDigest is invalid');
  }
  if (!validateLifecycleBinding(input.operation, input.lifecycle)) {
    throw new TypeError('lifecycle binding is invalid for operation');
  }
  if (!nonEmptyCanonicalText(input.issuer)) throw new TypeError('issuer is invalid');
  if (!nonEmptyCanonicalText(input.keyId)) throw new TypeError('keyId is invalid');
  const verifiedAtMs = canonicalTimestamp(input.verifiedAt);
  const validUntilMs = canonicalTimestamp(input.validUntil);
  if (
    verifiedAtMs === null ||
    validUntilMs === null ||
    validUntilMs <= verifiedAtMs ||
    validUntilMs - verifiedAtMs > COMPUTE_JOB_ADMISSION_MAX_TTL_MS
  ) {
    throw new TypeError('admission validity window is invalid');
  }
  const workUnitValidation = validateComputeWorkUnitContract(input.workUnit);
  if (!workUnitValidation.valid) {
    throw new TypeError(`workUnit is invalid: ${workUnitValidation.errors.join('; ')}`);
  }
}

/** Prepare a content-addressed receipt without taking custody of a signing key. */
export function prepareComputeJobAdmission(
  input: PrepareComputeJobAdmissionInput
): PreparedComputeJobAdmission {
  assertPrepareInput(input);
  const body: ComputeJobAdmissionBody = {
    schemaVersion: COMPUTE_JOB_ADMISSION_SCHEMA_VERSION,
    verificationScope: 'authenticated_admission_only',
    providerReservation: 'not_proven',
    execution: 'not_proven',
    teamId: input.teamId,
    principalDigest: input.principalDigest,
    jobId: input.jobId,
    attempt: input.attempt,
    operation: input.operation,
    requestDigest: input.requestDigest,
    workUnitDigest: computeWorkUnitDigest(input.workUnit),
    dataClassification: input.workUnit.compute.policy.dataClassification,
    evidenceBindings: prepareEvidenceBindings(input.evidence),
    trustPolicyDigest: input.trustPolicyDigest,
    lifecycle: input.lifecycle,
    verifiedAt: input.verifiedAt,
    validUntil: input.validUntil,
    issuer: input.issuer,
    keyId: input.keyId,
    signatureAlgorithm: 'Ed25519',
  };
  return { ...body, receiptId: contentAddress(body) };
}

function privateEd25519Key(value: string | KeyObject): KeyObject {
  const key = typeof value === 'string' ? createPrivateKey(value) : value;
  if (key.type !== 'private' || key.asymmetricKeyType !== 'ed25519') {
    throw new TypeError('signer privateKey must be an Ed25519 private key');
  }
  return key;
}

/** Sign an already-prepared receipt. Revalidates all content before signing. */
export function signComputeJobAdmission(
  prepared: PreparedComputeJobAdmission,
  signer: ComputeJobAdmissionSigner
): ComputeJobAdmissionReceipt {
  const placeholder = Buffer.alloc(64).toString('base64');
  const reasons: VerificationReasons = new Set();
  const inspected = validateReceiptStructure(
    { ...prepared, signatureBase64: placeholder },
    reasons
  );
  if (inspected === null || reasons.size > 0) {
    throw new TypeError(`prepared admission is invalid: ${[...reasons].join(', ')}`);
  }
  if (
    !nonEmptyCanonicalText(signer.issuer) ||
    !nonEmptyCanonicalText(signer.keyId) ||
    signer.issuer !== prepared.issuer ||
    signer.keyId !== prepared.keyId
  ) {
    throw new TypeError('signer identity does not match the prepared admission');
  }
  const key = privateEd25519Key(signer.privateKey);
  const signatureBase64 = signMessage(
    null,
    Buffer.from(canonicalJson(prepared), 'utf8'),
    key
  ).toString('base64');
  return { ...prepared, signatureBase64 };
}

/** Convenience API for callers whose signer is already in process. */
export function prepareAndSignComputeJobAdmission(
  input: PrepareComputeJobAdmissionInput,
  signer: ComputeJobAdmissionSigner
): ComputeJobAdmissionReceipt {
  return signComputeJobAdmission(prepareComputeJobAdmission(input), signer);
}

/** Serialize a structurally valid signed receipt into its exact durable bytes. */
export function createComputeJobAdmissionEnvelope(
  receipt: ComputeJobAdmissionReceipt
): ComputeJobAdmissionEnvelope {
  const reasons: VerificationReasons = new Set();
  const inspected = validateReceiptStructure(receipt, reasons);
  if (inspected === null || reasons.size > 0) {
    throw new TypeError(`signed admission is invalid: ${[...reasons].join(', ')}`);
  }
  return { receipt: inspected, bytes: canonicalJson(inspected) };
}

interface ValidatedTrustAnchor {
  readonly anchor: ComputeJobAdmissionTrustAnchor;
  readonly publicKey: KeyObject;
  readonly validFromMs: number;
  readonly validUntilMs: number;
  readonly revokedAtMs: number | null;
}

function publicEd25519Key(value: string | KeyObject): KeyObject | null {
  try {
    if (typeof value === 'string' && /PRIVATE KEY/.test(value)) return null;
    if (typeof value !== 'string' && value.type !== 'public') return null;
    const key = typeof value === 'string' ? createPublicKey(value) : value;
    return key.type === 'public' && key.asymmetricKeyType === 'ed25519' ? key : null;
  } catch {
    return null;
  }
}

function validateTrustAnchor(value: unknown): ValidatedTrustAnchor | null {
  if (!isRecord(value)) return null;
  const expectedKeys = [
    'schemaVersion',
    'issuer',
    'keyId',
    'algorithm',
    'publicKey',
    'allowedTeamIds',
    'allowedPrincipalDigests',
    'allowedTrustPolicyDigests',
    'validFrom',
    'validUntil',
    ...(Object.prototype.hasOwnProperty.call(value, 'revokedAt') ? ['revokedAt'] : []),
  ];
  if (!exactKeys(value, expectedKeys)) return null;
  const validFromMs = canonicalTimestamp(value.validFrom);
  const validUntilMs = canonicalTimestamp(value.validUntil);
  const revokedAtMs = value.revokedAt === undefined ? null : canonicalTimestamp(value.revokedAt);
  const publicKey = publicEd25519Key(value.publicKey as string | KeyObject);
  if (
    value.schemaVersion !== COMPUTE_JOB_ADMISSION_TRUST_ANCHOR_SCHEMA_VERSION ||
    !nonEmptyCanonicalText(value.issuer) ||
    !nonEmptyCanonicalText(value.keyId) ||
    value.algorithm !== 'Ed25519' ||
    publicKey === null ||
    !Array.isArray(value.allowedTeamIds) ||
    !value.allowedTeamIds.every(nonEmptyCanonicalText) ||
    !isCanonicalSortedUnique(value.allowedTeamIds) ||
    !Array.isArray(value.allowedPrincipalDigests) ||
    !value.allowedPrincipalDigests.every(
      (digest): digest is string => typeof digest === 'string' && SHA256_LABEL.test(digest)
    ) ||
    !isCanonicalSortedUnique(value.allowedPrincipalDigests) ||
    !Array.isArray(value.allowedTrustPolicyDigests) ||
    !value.allowedTrustPolicyDigests.every(
      (digest): digest is string => typeof digest === 'string' && SHA256_LABEL.test(digest)
    ) ||
    !isCanonicalSortedUnique(value.allowedTrustPolicyDigests) ||
    validFromMs === null ||
    validUntilMs === null ||
    validUntilMs <= validFromMs ||
    (value.revokedAt !== undefined && revokedAtMs === null)
  ) {
    return null;
  }
  return {
    anchor: value as unknown as ComputeJobAdmissionTrustAnchor,
    publicKey,
    validFromMs,
    validUntilMs,
    revokedAtMs,
  };
}

function validateExpectedContext(
  value: unknown
): value is VerifyComputeJobAdmissionExpectedContext {
  return (
    isRecord(value) &&
    exactKeys(value, [
      'teamId',
      'principalDigest',
      'jobId',
      'attempt',
      'operation',
      'requestDigest',
      'trustPolicyDigest',
      'lifecycle',
    ]) &&
    nonEmptyCanonicalText(value.teamId) &&
    typeof value.principalDigest === 'string' &&
    SHA256_LABEL.test(value.principalDigest) &&
    nonEmptyCanonicalText(value.jobId) &&
    nonNegativeInteger(value.attempt) &&
    typeof value.operation === 'string' &&
    ADMISSION_OPERATION_SET.has(value.operation) &&
    typeof value.requestDigest === 'string' &&
    SHA256_LABEL.test(value.requestDigest) &&
    typeof value.trustPolicyDigest === 'string' &&
    SHA256_LABEL.test(value.trustPolicyDigest) &&
    validateLifecycleBinding(value.operation, value.lifecycle)
  );
}

function failure(
  reasons: ReadonlySet<ComputeJobAdmissionVerificationReason>
): ComputeJobAdmissionVerificationResult {
  return {
    valid: false,
    reasonCodes: VERIFICATION_REASONS.filter((reason) => reasons.has(reason)),
  };
}

function checkAnchorTime(
  anchor: ValidatedTrustAnchor,
  atMs: number,
  notCurrentReason: 'anchor_not_current_at_admission' | 'anchor_not_current_at_verification',
  revokedReason: 'anchor_revoked_at_admission' | 'anchor_revoked_at_verification',
  reasons: VerificationReasons
): void {
  if (atMs < anchor.validFromMs || atMs >= anchor.validUntilMs) {
    reasons.add(notCurrentReason);
  }
  if (anchor.revokedAtMs !== null && atMs >= anchor.revokedAtMs) {
    reasons.add(revokedReason);
  }
}

/**
 * Verify one receipt against exact caller context, exact evidence bytes, the
 * compiler-produced WorkUnit, and a current allowlisted Ed25519 trust anchor.
 */
export function verifyComputeJobAdmission(
  input: VerifyComputeJobAdmissionInput
): ComputeJobAdmissionVerificationResult {
  const reasons: VerificationReasons = new Set();
  try {
    if (!isRecord(input) || !Array.isArray(input.trustAnchors)) {
      reasons.add('verification_input_invalid');
      return failure(reasons);
    }
    const atMs = canonicalTimestamp(input.at);
    if (atMs === null) reasons.add('verification_time_invalid');

    const receipt = validateReceiptStructure(input.receipt, reasons);
    if (receipt === null) return failure(reasons);
    const canonicalReceiptBytes = canonicalJson(receipt);
    if (input.receiptBytes !== undefined) {
      if (typeof input.receiptBytes !== 'string') {
        reasons.add('receipt_bytes_mismatch');
      } else {
        let parsedReceiptBytes: unknown = null;
        try {
          parsedReceiptBytes = JSON.parse(input.receiptBytes) as unknown;
        } catch {
          parsedReceiptBytes = null;
        }
        if (
          parsedReceiptBytes === null ||
          input.receiptBytes !== canonicalReceiptBytes ||
          !sameCanonicalValue(parsedReceiptBytes, receipt)
        ) {
          reasons.add('receipt_bytes_mismatch');
        }
      }
    }

    const verifiedAtMs = canonicalTimestamp(receipt.verifiedAt);
    const validUntilMs = canonicalTimestamp(receipt.validUntil);
    if (atMs !== null && verifiedAtMs !== null && verifiedAtMs > atMs) {
      reasons.add('admission_verified_at_future');
    }
    if (atMs !== null && validUntilMs !== null && atMs >= validUntilMs) {
      reasons.add('admission_expired');
    }

    if (!validateExpectedContext(input.expected)) {
      reasons.add('verification_input_invalid');
    } else if (
      receipt.teamId !== input.expected.teamId ||
      receipt.principalDigest !== input.expected.principalDigest ||
      receipt.jobId !== input.expected.jobId ||
      receipt.attempt !== input.expected.attempt ||
      receipt.operation !== input.expected.operation ||
      receipt.requestDigest !== input.expected.requestDigest ||
      receipt.trustPolicyDigest !== input.expected.trustPolicyDigest ||
      !sameCanonicalValue(receipt.lifecycle, input.expected.lifecycle)
    ) {
      reasons.add('context_mismatch');
    }

    const workUnitValidation = validateComputeWorkUnitContract(input.workUnit);
    if (!workUnitValidation.valid) {
      reasons.add('work_unit_invalid');
    } else if (
      computeWorkUnitDigest(input.workUnit) !== receipt.workUnitDigest ||
      input.workUnit.compute.policy.dataClassification !== receipt.dataClassification
    ) {
      reasons.add('work_unit_mismatch');
    }

    try {
      const exactBindings = prepareEvidenceBindings(input.evidence);
      if (!sameCanonicalValue(exactBindings, receipt.evidenceBindings)) {
        reasons.add('evidence_bytes_mismatch');
      }
    } catch {
      reasons.add('evidence_invalid');
    }

    const matchingAnchors = input.trustAnchors.filter(
      (anchor) =>
        isRecord(anchor) && anchor.keyId === receipt.keyId && anchor.issuer === receipt.issuer
    );
    let trusted: ValidatedTrustAnchor | null = null;
    if (matchingAnchors.length === 0) {
      reasons.add('unknown_key');
    } else if (matchingAnchors.length !== 1) {
      reasons.add('ambiguous_key');
    } else {
      trusted = validateTrustAnchor(matchingAnchors[0]);
      if (trusted === null) reasons.add('trust_anchor_invalid');
    }

    if (trusted !== null) {
      if (!trusted.anchor.allowedTeamIds.includes(receipt.teamId)) {
        reasons.add('team_not_allowed');
      }
      if (!trusted.anchor.allowedPrincipalDigests.includes(receipt.principalDigest)) {
        reasons.add('principal_not_allowed');
      }
      if (!trusted.anchor.allowedTrustPolicyDigests.includes(receipt.trustPolicyDigest)) {
        reasons.add('trust_policy_not_allowed');
      }
      if (verifiedAtMs !== null) {
        checkAnchorTime(
          trusted,
          verifiedAtMs,
          'anchor_not_current_at_admission',
          'anchor_revoked_at_admission',
          reasons
        );
      }
      if (atMs !== null) {
        checkAnchorTime(
          trusted,
          atMs,
          'anchor_not_current_at_verification',
          'anchor_revoked_at_verification',
          reasons
        );
      }
      let signatureValid = false;
      try {
        signatureValid = verifyMessage(
          null,
          Buffer.from(canonicalJson(unsignedReceipt(receipt)), 'utf8'),
          trusted.publicKey,
          Buffer.from(receipt.signatureBase64, 'base64')
        );
      } catch {
        signatureValid = false;
      }
      if (!signatureValid) reasons.add('receipt_signature_invalid');
    }

    if (reasons.size > 0) return failure(reasons);
    return {
      valid: true,
      receipt,
      canonicalReceiptBytes,
      verification: {
        scope: 'authenticated_admission_only',
        admissionAuthenticated: true,
        providerReservationVerified: false,
        executionVerified: false,
      },
    };
  } catch {
    reasons.add('verification_input_invalid');
    return failure(reasons);
  }
}
