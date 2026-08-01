/**
 * Provider-neutral placement, admission, and lease evidence for @compute.
 *
 * Every decision is content-addressed and role-attested. Content hashes bind
 * exact bytes; Ed25519 trust anchors authenticate which authority asserted
 * those bytes. This module observes and verifies evidence only. It never
 * reserves capacity, starts work, contacts a provider, or records spend.
 */

import { createHash, createPublicKey, verify as verifySignature } from 'crypto';
import {
  computeWorkUnitDigest,
  validateComputeWorkUnitContract,
  type ComputeAccelerator,
  type ComputeDataClassification,
  type ComputeWorkUnitContract,
} from '../compiler/ComputeWorkUnitCompiler';
import {
  COMPUTE_EXECUTION_RECEIPT_SCHEMA_VERSION,
  validateComputeExecutionReceipt,
  type ComputeExecutionPlacementOutcome,
  type ComputeExecutionReceipt,
} from './ComputeExecutionReceipt';

export const COMPUTE_CAPACITY_SNAPSHOT_SCHEMA_VERSION =
  'holoscript.compute-capacity-snapshot.v1' as const;
export const COMPUTE_BRIDGE_ADMISSION_SCHEMA_VERSION =
  'holoscript.compute-bridge-admission.v1' as const;
export const COMPUTE_PLACEMENT_PLAN_SCHEMA_VERSION =
  'holoscript.compute-placement-plan.v1' as const;
export const COMPUTE_CAPACITY_LEASE_SCHEMA_VERSION =
  'holoscript.compute-capacity-lease.v1' as const;
export const COMPUTE_SUBJECT_ATTESTATION_SCHEMA_VERSION =
  'holoscript.compute-subject-attestation.v1' as const;
export const COMPUTE_BUDGET_EVIDENCE_SCHEMA_VERSION =
  'holoscript.compute-budget-evidence.v1' as const;
export const COMPUTE_CAPACITY_LEASE_MAX_TTL_MS = 24 * 60 * 60 * 1000;
export const COMPUTE_EVIDENCE_MAX_FUTURE_SKEW_MS = 60 * 1000;
export const COMPUTE_CAPACITY_SNAPSHOT_MAX_TTL_MS = 60 * 1000;
export const COMPUTE_BRIDGE_ADMISSION_MAX_TTL_MS = 5 * 60 * 1000;

export type ComputeEvidenceRole =
  | 'capacity_observer'
  | 'bridge_admitter'
  | 'placement_planner'
  | 'lease_issuer'
  | 'execution_attestor'
  | 'budget_ledger_attestor';
export type ComputeCapacityLane = 'local_device' | 'owned_fleet' | 'managed_bridge';
export type ComputeCapacityHealth = 'ready' | 'degraded' | 'unavailable';
export type ComputePlacementVerdict = 'admitted' | 'rejected';
export type ComputeBridgeAdmissionVerdict = 'admitted' | 'rejected';
export type ComputeBridgeAdmissionReason =
  | 'policy_admitted'
  | 'tenant_policy_denied'
  | 'data_classification_denied'
  | 'budget_denied'
  | 'bridge_unavailable';
export type ComputePlacementReason =
  | 'capacity_evidence_untrusted'
  | 'telemetry_future'
  | 'telemetry_stale'
  | 'telemetry_degraded'
  | 'capacity_unavailable'
  | 'placement_forbidden'
  | 'accelerator_unavailable'
  | 'data_classification_unsupported'
  | 'cost_unavailable'
  | 'budget_exceeded'
  | 'bridge_admission_required'
  | 'bridge_admission_invalid'
  | 'bridge_admission_untrusted'
  | 'bridge_admission_future'
  | 'bridge_admission_expired'
  | 'bridge_admission_denied'
  | 'bridge_fallback_unexplained';

export type ComputeCapacityCostEstimate =
  | {
      readonly measurementState: 'measured';
      readonly currency: 'USD';
      readonly estimatedMinorUnits: number;
    }
  | { readonly measurementState: 'not_measured'; readonly reason: 'meter_unavailable' }
  | { readonly measurementState: 'not_applicable' };

export interface ComputeEvidenceSigner {
  readonly issuer: string;
  readonly keyId: string;
  /** Sign the supplied UTF-8 domain-separated attestation statement and return canonical base64. */
  readonly sign: (message: Uint8Array) => string;
}

export interface ComputeEvidenceTrustAnchor {
  readonly issuer: string;
  readonly keyId: string;
  readonly algorithm: 'ed25519';
  readonly roles: readonly ComputeEvidenceRole[];
  readonly principalDigests: readonly string[];
  /** Required when authenticating placement, capacity, lease, or execution evidence. */
  readonly lanes?: readonly ComputeCapacityLane[];
  /** Required when authenticating placement, capacity, lease, or execution evidence. */
  readonly capacityRefs?: readonly string[];
  /** Required when authenticating budget-ledger evidence. */
  readonly teamIds?: readonly string[];
  /** Required when authenticating budget-ledger evidence. */
  readonly budgetRailIds?: readonly string[];
  readonly validFrom: string;
  readonly validUntil: string;
  readonly revokedAt?: string;
  readonly publicKeyPem: string;
}

export interface ComputeIssuerAttestation {
  readonly role: ComputeEvidenceRole;
  readonly issuer: string;
  readonly keyId: string;
  readonly algorithm: 'ed25519';
  readonly claimsDigest: string;
  readonly signature: string;
}

export type ComputeBudgetEvidenceStatus =
  | 'authorized'
  | 'held'
  | 'released'
  | 'settled'
  | 'rejected';

export interface ComputeBudgetAccountProjection {
  readonly heldAmountMinorUnits: number;
  readonly settledAmountMinorUnits: number;
  readonly version: number;
}

export interface ComputeBudgetEvidenceBinding {
  readonly teamId: string;
  readonly budgetRailId: string;
  readonly principalDigest: string;
  readonly jobId: string;
  readonly attempt: number;
  readonly workUnitDigest: string;
  readonly currency: 'USD';
  readonly maxAmountMinorUnits: number;
  readonly policyDigest: string;
  readonly periodDigest: string;
  readonly nonceDigest: string;
  readonly idempotencyKeyHash: string;
}

/**
 * Signed evidence for a prepared enterprise budget-ledger transition.
 *
 * `held` and `settled` authenticate the ledger assertion and its exact CAS
 * projections. They do not prove that a database committed the projection,
 * that a provider reserved capacity, that execution occurred, or that a
 * payment was made. `settled` evidence is metered budget consumption and must
 * bind a separate measured-cost receipt, including when the measured cost is
 * zero.
 */
export interface ComputeBudgetEvidence extends ComputeBudgetEvidenceBinding {
  readonly schemaVersion: typeof COMPUTE_BUDGET_EVIDENCE_SCHEMA_VERSION;
  readonly verificationScope: 'issuer_attested';
  readonly evidenceScope: 'budget_ledger_only';
  readonly receiptId: string;
  readonly status: ComputeBudgetEvidenceStatus;
  readonly heldAmountMinorUnits: number;
  readonly settledAmountMinorUnits: number;
  readonly accountBefore: ComputeBudgetAccountProjection;
  readonly accountAfter: ComputeBudgetAccountProjection;
  readonly measuredCostReceiptId?: string;
  readonly issuedAt: string;
  readonly validFrom: string;
  readonly validUntil: string;
  readonly attestation: ComputeIssuerAttestation;
}

export interface BuildComputeBudgetEvidenceInput extends ComputeBudgetEvidenceBinding {
  readonly status: ComputeBudgetEvidenceStatus;
  readonly heldAmountMinorUnits: number;
  readonly settledAmountMinorUnits: number;
  readonly accountBefore: ComputeBudgetAccountProjection;
  readonly accountAfter: ComputeBudgetAccountProjection;
  readonly measuredCostReceiptId?: string;
  readonly issuedAt: string;
  readonly validFrom: string;
  readonly validUntil: string;
  readonly signer: ComputeEvidenceSigner;
}

export interface VerifyComputeBudgetEvidenceInput extends ComputeBudgetEvidenceBinding {
  readonly evidence: ComputeBudgetEvidence;
  readonly verifiedAt: string;
  readonly trustAnchors: readonly ComputeEvidenceTrustAnchor[];
}

export interface ComputeBudgetEvidenceVerification extends ComputeEvidenceValidation {
  readonly verificationScope: 'issuer_authenticated';
}

export interface ComputeCapacitySnapshot {
  readonly schemaVersion: typeof COMPUTE_CAPACITY_SNAPSHOT_SCHEMA_VERSION;
  readonly verificationScope: 'issuer_attested';
  readonly receiptId: string;
  readonly lane: ComputeCapacityLane;
  readonly capacityRef: string;
  readonly accelerator: ComputeAccelerator;
  readonly health: ComputeCapacityHealth;
  /** V1 models at most one available exclusive logical slot; only a durable allocator can reserve it. */
  readonly availableSlots: number;
  readonly allowedDataClassifications: readonly ComputeDataClassification[];
  readonly observedAt: string;
  readonly validUntil: string;
  readonly estimatedCost: ComputeCapacityCostEstimate;
  readonly attestation: ComputeIssuerAttestation;
}

export interface BuildComputeCapacitySnapshotInput {
  readonly lane: ComputeCapacityLane;
  readonly capacityRef: string;
  readonly accelerator: ComputeAccelerator;
  readonly health: ComputeCapacityHealth;
  readonly availableSlots: number;
  readonly allowedDataClassifications: readonly ComputeDataClassification[];
  readonly observedAt: string;
  readonly validUntil: string;
  readonly estimatedCost: ComputeCapacityCostEstimate;
  readonly signer: ComputeEvidenceSigner;
}

export interface ComputeBridgeAdmission {
  readonly schemaVersion: typeof COMPUTE_BRIDGE_ADMISSION_SCHEMA_VERSION;
  readonly verificationScope: 'issuer_attested';
  readonly receiptId: string;
  readonly principalDigest: string;
  readonly bridgeRef: string;
  readonly workUnitDigest: string;
  readonly dataClassification: ComputeDataClassification;
  readonly budget: { readonly currency: 'USD'; readonly maxCostMinorUnits: number };
  readonly verdict: ComputeBridgeAdmissionVerdict;
  readonly reason: ComputeBridgeAdmissionReason;
  readonly issuedAt: string;
  readonly validUntil: string;
  readonly attestation: ComputeIssuerAttestation;
}

export interface BuildComputeBridgeAdmissionInput {
  readonly principalDigest: string;
  readonly bridgeRef: string;
  readonly workUnitDigest: string;
  readonly dataClassification: ComputeDataClassification;
  readonly budget: { readonly currency: 'USD'; readonly maxCostMinorUnits: number };
  readonly verdict: ComputeBridgeAdmissionVerdict;
  readonly reason: ComputeBridgeAdmissionReason;
  readonly issuedAt: string;
  readonly validUntil: string;
  readonly signer: ComputeEvidenceSigner;
}

export interface ComputePlacementPlan {
  readonly schemaVersion: typeof COMPUTE_PLACEMENT_PLAN_SCHEMA_VERSION;
  readonly verificationScope: 'issuer_attested';
  readonly receiptId: string;
  readonly principalDigest: string;
  readonly workUnitDigest: string;
  readonly sourceEvidence: string;
  readonly capacitySnapshotReceiptId: string;
  readonly bridgeAdmissionReceiptId?: string;
  readonly lane: ComputeCapacityLane;
  readonly capacityRef: string;
  readonly accelerator: ComputeAccelerator;
  readonly estimatedCost: ComputeCapacityCostEstimate;
  readonly verdict: ComputePlacementVerdict;
  readonly reasonCodes: readonly ComputePlacementReason[];
  readonly checkedAt: string;
  readonly validUntil: string;
  readonly attestation: ComputeIssuerAttestation;
}

export interface PlanComputePlacementInput {
  readonly principalDigest: string;
  readonly workUnit: ComputeWorkUnitContract;
  readonly capacitySnapshot: ComputeCapacitySnapshot;
  readonly bridgeAdmission?: ComputeBridgeAdmission;
  readonly checkedAt: string;
  readonly trustAnchors: readonly ComputeEvidenceTrustAnchor[];
  readonly signer: ComputeEvidenceSigner;
}

export interface VerifyComputePlacementPlanInput extends Omit<PlanComputePlacementInput, 'signer'> {
  readonly plan: ComputePlacementPlan;
  readonly verifiedAt: string;
}

export interface ComputeCapacityLease {
  readonly schemaVersion: typeof COMPUTE_CAPACITY_LEASE_SCHEMA_VERSION;
  readonly verificationScope: 'issuer_attested';
  readonly receiptId: string;
  readonly principalDigest: string;
  readonly jobId: string;
  readonly attempt: number;
  readonly holderDigest: string;
  readonly workUnitDigest: string;
  readonly planReceiptId: string;
  readonly capacitySnapshotReceiptId: string;
  readonly lane: ComputeCapacityLane;
  readonly capacityRef: string;
  readonly accelerator: ComputeAccelerator;
  readonly issuedAt: string;
  readonly expiresAt: string;
  readonly fencingEpoch: number;
  readonly fencingTokenHash: string;
  readonly attestation: ComputeIssuerAttestation;
}

export interface ComputeCapacityAllocationCursor {
  readonly capacityRef: string;
  readonly slotState: 'available' | 'leased';
  readonly currentEpoch: number;
  readonly currentLeaseReceiptId?: string;
  readonly version: number;
  readonly etag: string;
}

export interface PrepareComputeCapacityLeaseInput {
  readonly principalDigest: string;
  readonly jobId: string;
  readonly attempt: number;
  readonly holderDigest: string;
  readonly workUnit: ComputeWorkUnitContract;
  readonly capacitySnapshot: ComputeCapacitySnapshot;
  readonly bridgeAdmission?: ComputeBridgeAdmission;
  readonly plan: ComputePlacementPlan;
  readonly issuedAt: string;
  readonly expiresAt: string;
  readonly fencingToken: string | Uint8Array;
  readonly allocationCursor: ComputeCapacityAllocationCursor;
  readonly trustAnchors: readonly ComputeEvidenceTrustAnchor[];
  readonly signer: ComputeEvidenceSigner;
}

export interface PreparedComputeCapacityLease {
  readonly expectedAllocation: ComputeCapacityAllocationCursor;
  readonly nextAllocation: ComputeCapacityAllocationCursor;
  readonly lease: ComputeCapacityLease;
}

export interface VerifyComputeCapacityLeaseReceiptInput extends Omit<
  PrepareComputeCapacityLeaseInput,
  'issuedAt' | 'expiresAt' | 'fencingToken' | 'allocationCursor' | 'signer'
> {
  readonly lease: ComputeCapacityLease;
  readonly at: string;
}

export interface AuthorizeComputeCapacityLeaseUseInput extends VerifyComputeCapacityLeaseReceiptInput {
  readonly presentedFencingToken: string | Uint8Array;
  readonly allocationCursor: ComputeCapacityAllocationCursor;
}

export interface ComputeSubjectAttestation {
  readonly schemaVersion: typeof COMPUTE_SUBJECT_ATTESTATION_SCHEMA_VERSION;
  readonly verificationScope: 'issuer_attested';
  readonly receiptId: string;
  readonly principalDigest: string;
  readonly subject: { readonly schemaVersion: string; readonly receiptId: string };
  readonly issuedAt: string;
  readonly attestation: ComputeIssuerAttestation;
}

export interface AttestComputeExecutionReceiptInput {
  readonly principalDigest: string;
  readonly executionReceipt: ComputeExecutionReceipt;
  readonly issuedAt: string;
  readonly signer: ComputeEvidenceSigner;
}

export interface VerifyComputeExecutionEvidenceInput {
  readonly principalDigest: string;
  readonly jobId: string;
  readonly attempt: number;
  readonly holderDigest: string;
  readonly workUnit: ComputeWorkUnitContract;
  readonly capacitySnapshot: ComputeCapacitySnapshot;
  readonly bridgeAdmission?: ComputeBridgeAdmission;
  readonly plan: ComputePlacementPlan;
  readonly lease: ComputeCapacityLease;
  readonly executionReceipt: ComputeExecutionReceipt;
  readonly executionAttestation: ComputeSubjectAttestation;
  readonly verifiedAt: string;
  readonly trustAnchors: readonly ComputeEvidenceTrustAnchor[];
}

export interface ComputeEvidenceValidation {
  readonly valid: boolean;
  readonly errors: readonly string[];
}

export interface ComputeExecutionEvidenceVerification extends ComputeEvidenceValidation {
  readonly verificationScope: 'issuer_authenticated';
}

const SHA256_LABEL = /^sha256:[a-f0-9]{64}$/;
const ACCELERATORS = new Set<ComputeAccelerator>(['cpu', 'gpu', 'npu', 'other']);
const LANES = new Set<ComputeCapacityLane>(['local_device', 'owned_fleet', 'managed_bridge']);
const HEALTH = new Set<ComputeCapacityHealth>(['ready', 'degraded', 'unavailable']);
const DATA_CLASSES: readonly ComputeDataClassification[] = [
  'public',
  'internal',
  'confidential',
  'restricted',
];
const DATA_CLASS_SET = new Set(DATA_CLASSES);
const ROLES = new Set<ComputeEvidenceRole>([
  'capacity_observer',
  'bridge_admitter',
  'placement_planner',
  'lease_issuer',
  'execution_attestor',
  'budget_ledger_attestor',
]);
const BUDGET_EVIDENCE_STATUSES = new Set<ComputeBudgetEvidenceStatus>([
  'authorized',
  'held',
  'released',
  'settled',
  'rejected',
]);
const BRIDGE_REASONS = new Set<ComputeBridgeAdmissionReason>([
  'policy_admitted',
  'tenant_policy_denied',
  'data_classification_denied',
  'budget_denied',
  'bridge_unavailable',
]);
const PLACEMENT_REASON_ORDER: readonly ComputePlacementReason[] = [
  'capacity_evidence_untrusted',
  'telemetry_future',
  'telemetry_stale',
  'telemetry_degraded',
  'capacity_unavailable',
  'placement_forbidden',
  'accelerator_unavailable',
  'data_classification_unsupported',
  'cost_unavailable',
  'budget_exceeded',
  'bridge_admission_required',
  'bridge_admission_invalid',
  'bridge_admission_untrusted',
  'bridge_admission_future',
  'bridge_admission_expired',
  'bridge_admission_denied',
  'bridge_fallback_unexplained',
];
const PLACEMENT_REASONS = new Set(PLACEMENT_REASON_ORDER);

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function safeNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function canonicalize(value: unknown): unknown {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value))
      throw new TypeError('compute evidence cannot contain non-finite numbers');
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
  throw new TypeError(`compute evidence cannot contain ${typeof value}`);
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function sha256Value(value: unknown): string {
  return `sha256:${createHash('sha256').update(canonicalJson(value)).digest('hex')}`;
}

function sha256Bytes(value: string | Uint8Array): string {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function parseIso(value: unknown): number {
  if (typeof value !== 'string') return NaN;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value ? parsed : NaN;
}

function isCanonicalBase64(value: unknown): value is string {
  if (typeof value !== 'string' || value.length === 0) return false;
  try {
    const decoded = Buffer.from(value, 'base64');
    return decoded.length > 0 && decoded.toString('base64') === value;
  } catch {
    return false;
  }
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

function withoutEnvelope<
  T extends { readonly receiptId: string; readonly attestation: ComputeIssuerAttestation },
>(receipt: T): Omit<T, 'receiptId' | 'attestation'> {
  const { receiptId: _receiptId, attestation: _attestation, ...claims } = receipt;
  return claims;
}

function receiptBody<T extends { readonly receiptId: string }>(receipt: T): Omit<T, 'receiptId'> {
  const { receiptId: _receiptId, ...body } = receipt;
  return body;
}

function attestationStatement(
  role: ComputeEvidenceRole,
  issuer: string,
  keyId: string,
  claimsDigest: string
): object {
  return {
    domain: 'holoscript.compute-evidence-attestation.v1',
    algorithm: 'ed25519',
    claimsDigest,
    issuer,
    keyId,
    role,
  };
}

function makeAttestation(
  claims: unknown,
  role: ComputeEvidenceRole,
  signer: ComputeEvidenceSigner
): ComputeIssuerAttestation {
  if (!hasText(signer.issuer) || !hasText(signer.keyId) || typeof signer.sign !== 'function') {
    throw new TypeError('evidence signer requires issuer, keyId, and sign callback');
  }
  const claimsDigest = sha256Value(claims);
  const signature = signer.sign(
    Buffer.from(
      canonicalJson(attestationStatement(role, signer.issuer, signer.keyId, claimsDigest))
    )
  );
  if (!isCanonicalBase64(signature)) {
    throw new TypeError('evidence signer must return canonical base64');
  }
  return {
    role,
    issuer: signer.issuer,
    keyId: signer.keyId,
    algorithm: 'ed25519',
    claimsDigest,
    signature,
  };
}

function assembleAttestedReceipt<T extends object>(
  claims: T,
  role: ComputeEvidenceRole,
  signer: ComputeEvidenceSigner
): T & { readonly receiptId: string; readonly attestation: ComputeIssuerAttestation } {
  const attestation = makeAttestation(claims, role, signer);
  const body = { ...claims, attestation };
  return { ...body, receiptId: sha256Value(body) };
}

function validateAttestation(
  claims: unknown,
  value: unknown,
  expectedRole: ComputeEvidenceRole,
  path: string,
  errors: string[]
): value is ComputeIssuerAttestation {
  if (!isRecord(value)) {
    errors.push(`${path} must be an object`);
    return false;
  }
  rejectUnknownKeys(
    value,
    ['role', 'issuer', 'keyId', 'algorithm', 'claimsDigest', 'signature'],
    path,
    errors
  );
  if (value.role !== expectedRole) errors.push(`${path}.role must be ${expectedRole}`);
  if (!hasText(value.issuer)) errors.push(`${path}.issuer is required`);
  if (!hasText(value.keyId)) errors.push(`${path}.keyId is required`);
  if (value.algorithm !== 'ed25519') errors.push(`${path}.algorithm must be ed25519`);
  if (typeof value.claimsDigest !== 'string' || !SHA256_LABEL.test(value.claimsDigest)) {
    errors.push(`${path}.claimsDigest must be a sha256 label`);
  } else if (value.claimsDigest !== sha256Value(claims)) {
    errors.push(`${path}.claimsDigest does not match the canonical claims`);
  }
  if (!isCanonicalBase64(value.signature)) {
    errors.push(`${path}.signature must be canonical base64`);
  } else if (Buffer.from(value.signature, 'base64').byteLength !== 64) {
    errors.push(`${path}.signature must decode to exactly 64 bytes for Ed25519`);
  }
  return true;
}

function attestationTrustErrors(
  claims: unknown,
  attestation: ComputeIssuerAttestation,
  expectedRole: ComputeEvidenceRole,
  trustAnchors: readonly ComputeEvidenceTrustAnchor[],
  scope:
    | {
        readonly principalDigest?: string;
        readonly lane: ComputeCapacityLane;
        readonly capacityRef: string;
        readonly assertedAt: string;
        readonly verifiedAt?: string;
      }
    | {
        readonly principalDigest: string;
        readonly teamId: string;
        readonly budgetRailId: string;
        readonly assertedAt: string;
        readonly verifiedAt?: string;
      }
): string[] {
  const errors: string[] = [];
  validateAttestation(claims, attestation, expectedRole, 'attestation', errors);
  if (errors.length > 0) return errors;
  const matchingAnchors = trustAnchors.filter(
    (candidate) => candidate.issuer === attestation.issuer && candidate.keyId === attestation.keyId
  );
  if (matchingAnchors.length !== 1) {
    return [`no trust anchor admits ${expectedRole} ${attestation.issuer}/${attestation.keyId}`];
  }
  const anchor = matchingAnchors[0];
  const commonScopeInvalid =
    anchor.algorithm !== 'ed25519' ||
    !Array.isArray(anchor.roles) ||
    anchor.roles.length === 0 ||
    new Set(anchor.roles).size !== anchor.roles.length ||
    anchor.roles.some((role) => !ROLES.has(role)) ||
    !Array.isArray(anchor.principalDigests) ||
    anchor.principalDigests.length === 0 ||
    new Set(anchor.principalDigests).size !== anchor.principalDigests.length ||
    anchor.principalDigests.some((digest) => !SHA256_LABEL.test(digest));
  const placementScopeInvalid =
    'lane' in scope &&
    (!Array.isArray(anchor.lanes) ||
      anchor.lanes.length === 0 ||
      new Set(anchor.lanes).size !== anchor.lanes.length ||
      anchor.lanes.some((lane) => !LANES.has(lane)) ||
      !Array.isArray(anchor.capacityRefs) ||
      anchor.capacityRefs.length === 0 ||
      new Set(anchor.capacityRefs).size !== anchor.capacityRefs.length ||
      anchor.capacityRefs.some((reference) => !SHA256_LABEL.test(reference)));
  const budgetScopeInvalid =
    'teamId' in scope &&
    (!Array.isArray(anchor.teamIds) ||
      anchor.teamIds.length === 0 ||
      new Set(anchor.teamIds).size !== anchor.teamIds.length ||
      anchor.teamIds.some((teamId) => !hasText(teamId)) ||
      !Array.isArray(anchor.budgetRailIds) ||
      anchor.budgetRailIds.length === 0 ||
      new Set(anchor.budgetRailIds).size !== anchor.budgetRailIds.length ||
      anchor.budgetRailIds.some((budgetRailId) => !hasText(budgetRailId)));
  if (commonScopeInvalid || placementScopeInvalid || budgetScopeInvalid) {
    errors.push('trust anchor scope is invalid');
  }
  if (!anchor.roles.includes(expectedRole)) {
    errors.push(`trust anchor does not admit role ${expectedRole}`);
  }
  if ('lane' in scope) {
    if (!anchor.lanes?.includes(scope.lane)) {
      errors.push(`trust anchor does not admit lane ${scope.lane}`);
    }
    if (!anchor.capacityRefs?.includes(scope.capacityRef)) {
      errors.push('trust anchor does not admit the bound capacity reference');
    }
  } else {
    if (!anchor.teamIds?.includes(scope.teamId)) {
      errors.push('trust anchor does not admit the bound team');
    }
    if (!anchor.budgetRailIds?.includes(scope.budgetRailId)) {
      errors.push('trust anchor does not admit the bound budget rail');
    }
  }
  if (
    scope.principalDigest !== undefined &&
    !anchor.principalDigests.includes(scope.principalDigest)
  ) {
    errors.push('trust anchor does not admit the bound principal');
  }
  const assertedAt = parseIso(scope.assertedAt);
  const anchorValidFrom = parseIso(anchor.validFrom);
  const anchorValidUntil = parseIso(anchor.validUntil);
  const revokedAt = anchor.revokedAt === undefined ? NaN : parseIso(anchor.revokedAt);
  const verifiedAt = parseIso(scope.verifiedAt ?? scope.assertedAt);
  if (
    !Number.isFinite(assertedAt) ||
    !Number.isFinite(anchorValidFrom) ||
    !Number.isFinite(anchorValidUntil) ||
    assertedAt < anchorValidFrom ||
    assertedAt >= anchorValidUntil
  ) {
    errors.push('trust anchor is not valid at the evidence assertion time');
  }
  if (
    !Number.isFinite(verifiedAt) ||
    verifiedAt < anchorValidFrom ||
    verifiedAt >= anchorValidUntil
  ) {
    errors.push('trust anchor is not active at verification time');
  }
  if (anchor.revokedAt !== undefined && !Number.isFinite(revokedAt)) {
    errors.push('trust anchor revokedAt must be an ISO timestamp');
  } else if (Number.isFinite(revokedAt) && assertedAt >= revokedAt) {
    errors.push('trust anchor was revoked at the evidence assertion time');
  }
  if (Number.isFinite(revokedAt) && verifiedAt >= revokedAt) {
    errors.push('trust anchor is revoked at verification time');
  }
  try {
    const publicKey = createPublicKey(anchor.publicKeyPem);
    if (publicKey.asymmetricKeyType !== 'ed25519') {
      errors.push('trust anchor public key must be Ed25519');
      return errors;
    }
    const valid = verifySignature(
      null,
      Buffer.from(
        canonicalJson(
          attestationStatement(
            attestation.role,
            attestation.issuer,
            attestation.keyId,
            attestation.claimsDigest
          )
        )
      ),
      publicKey,
      Buffer.from(attestation.signature, 'base64')
    );
    if (!valid) errors.push(`${expectedRole} signature is invalid`);
  } catch (error) {
    errors.push(
      `${expectedRole} signature cannot be verified: ${error instanceof Error ? error.message : String(error)}`
    );
  }
  return errors;
}

function validateReceiptId(value: Record<string, unknown>, path: string, errors: string[]): void {
  if (typeof value.receiptId !== 'string' || !SHA256_LABEL.test(value.receiptId)) {
    errors.push(`${path}.receiptId must be a sha256 label`);
    return;
  }
  try {
    const expected = sha256Value(receiptBody(value as { receiptId: string }));
    if (expected !== value.receiptId)
      errors.push(`${path}.receiptId does not match canonical body`);
  } catch (error) {
    errors.push(`${path} cannot be canonicalized: ${String(error)}`);
  }
}

function validateBudgetAccountProjection(
  value: unknown,
  path: string,
  errors: string[]
): value is ComputeBudgetAccountProjection {
  const startingErrorCount = errors.length;
  if (!isRecord(value)) {
    errors.push(`${path} must be an object`);
    return false;
  }
  rejectUnknownKeys(
    value,
    ['heldAmountMinorUnits', 'settledAmountMinorUnits', 'version'],
    path,
    errors
  );
  if (!safeNonNegativeInteger(value.heldAmountMinorUnits)) {
    errors.push(`${path}.heldAmountMinorUnits must be a non-negative safe integer`);
  }
  if (!safeNonNegativeInteger(value.settledAmountMinorUnits)) {
    errors.push(`${path}.settledAmountMinorUnits must be a non-negative safe integer`);
  }
  if (!safeNonNegativeInteger(value.version)) {
    errors.push(`${path}.version must be a non-negative safe integer`);
  }
  return errors.length === startingErrorCount;
}

function sameBudgetAccountProjection(
  left: ComputeBudgetAccountProjection,
  right: ComputeBudgetAccountProjection
): boolean {
  return (
    left.heldAmountMinorUnits === right.heldAmountMinorUnits &&
    left.settledAmountMinorUnits === right.settledAmountMinorUnits &&
    left.version === right.version
  );
}

function safeIntegerSum(left: number, right: number): number | undefined {
  const sum = left + right;
  return Number.isSafeInteger(sum) ? sum : undefined;
}

function validateBudgetTransition(
  status: ComputeBudgetEvidenceStatus,
  maxAmountMinorUnits: number,
  heldAmountMinorUnits: number,
  settledAmountMinorUnits: number,
  accountBefore: ComputeBudgetAccountProjection,
  accountAfter: ComputeBudgetAccountProjection,
  errors: string[]
): void {
  if (status === 'authorized' || status === 'rejected') {
    if (heldAmountMinorUnits !== 0 || settledAmountMinorUnits !== 0) {
      errors.push(`${status} evidence cannot claim held or settled amounts`);
    }
    if (!sameBudgetAccountProjection(accountBefore, accountAfter)) {
      errors.push(`${status} evidence cannot mutate the account projection`);
    }
    return;
  }

  if (maxAmountMinorUnits === 0) {
    errors.push(`${status} evidence requires a positive maxAmountMinorUnits hold`);
  }

  const nextVersion = safeIntegerSum(accountBefore.version, 1);
  if (nextVersion === undefined || accountAfter.version !== nextVersion) {
    errors.push(`${status} evidence accountAfter.version must increment exactly once`);
  }

  if (status === 'held') {
    if (heldAmountMinorUnits !== maxAmountMinorUnits) {
      errors.push('held evidence must hold exactly maxAmountMinorUnits');
    }
    if (settledAmountMinorUnits !== 0) {
      errors.push('held evidence cannot claim settled budget consumption');
    }
    const expectedHeld = safeIntegerSum(accountBefore.heldAmountMinorUnits, maxAmountMinorUnits);
    if (expectedHeld === undefined) {
      errors.push('held evidence account projection exceeds the safe-integer range');
    } else if (accountAfter.heldAmountMinorUnits !== expectedHeld) {
      errors.push('held evidence accountAfter.heldAmountMinorUnits must add the exact hold');
    }
    if (accountAfter.settledAmountMinorUnits !== accountBefore.settledAmountMinorUnits) {
      errors.push('held evidence cannot mutate settled account consumption');
    }
    return;
  }

  if (heldAmountMinorUnits !== 0) {
    errors.push(`${status} evidence must report zero remaining heldAmountMinorUnits`);
  }
  if (accountBefore.heldAmountMinorUnits < maxAmountMinorUnits) {
    errors.push(`${status} evidence accountBefore does not contain the exact hold`);
  } else if (
    accountAfter.heldAmountMinorUnits !==
    accountBefore.heldAmountMinorUnits - maxAmountMinorUnits
  ) {
    errors.push(`${status} evidence accountAfter.heldAmountMinorUnits must release the exact hold`);
  }

  if (status === 'released') {
    if (settledAmountMinorUnits !== 0) {
      errors.push('released evidence cannot claim settled budget consumption');
    }
    if (accountAfter.settledAmountMinorUnits !== accountBefore.settledAmountMinorUnits) {
      errors.push('released evidence cannot mutate settled account consumption');
    }
    return;
  }

  if (settledAmountMinorUnits > maxAmountMinorUnits) {
    errors.push('settledAmountMinorUnits must not exceed maxAmountMinorUnits');
  }
  const expectedSettled = safeIntegerSum(
    accountBefore.settledAmountMinorUnits,
    settledAmountMinorUnits
  );
  if (expectedSettled === undefined) {
    errors.push('settled evidence account projection exceeds the safe-integer range');
  } else if (accountAfter.settledAmountMinorUnits !== expectedSettled) {
    errors.push(
      'settled evidence accountAfter.settledAmountMinorUnits must add metered budget consumption'
    );
  }
}

/** Build a signed assertion for a prepared budget-ledger transition. This does not commit it. */
export function buildComputeBudgetEvidence(
  input: BuildComputeBudgetEvidenceInput
): ComputeBudgetEvidence {
  const { signer, ...inputClaims } = input;
  const claims = {
    schemaVersion: COMPUTE_BUDGET_EVIDENCE_SCHEMA_VERSION,
    verificationScope: 'issuer_attested' as const,
    evidenceScope: 'budget_ledger_only' as const,
    ...inputClaims,
  };
  const evidence = assembleAttestedReceipt(claims, 'budget_ledger_attestor', signer);
  const validation = validateComputeBudgetEvidence(evidence);
  if (!validation.valid) {
    throw new TypeError(`Invalid compute budget evidence: ${validation.errors.join('; ')}`);
  }
  return evidence;
}

/** Validate canonical structure, hash, transition arithmetic, and signature envelope shape. */
export function validateComputeBudgetEvidence(value: unknown): ComputeEvidenceValidation {
  const errors: string[] = [];
  if (!isRecord(value)) {
    return { valid: false, errors: ['Compute budget evidence must be an object'] };
  }
  rejectUnknownKeys(
    value,
    [
      'schemaVersion',
      'verificationScope',
      'evidenceScope',
      'receiptId',
      'teamId',
      'budgetRailId',
      'principalDigest',
      'jobId',
      'attempt',
      'workUnitDigest',
      'currency',
      'status',
      'maxAmountMinorUnits',
      'heldAmountMinorUnits',
      'settledAmountMinorUnits',
      'accountBefore',
      'accountAfter',
      'measuredCostReceiptId',
      'policyDigest',
      'periodDigest',
      'nonceDigest',
      'idempotencyKeyHash',
      'issuedAt',
      'validFrom',
      'validUntil',
      'attestation',
    ],
    'budgetEvidence',
    errors
  );
  if (value.schemaVersion !== COMPUTE_BUDGET_EVIDENCE_SCHEMA_VERSION) {
    errors.push(`schemaVersion must be ${COMPUTE_BUDGET_EVIDENCE_SCHEMA_VERSION}`);
  }
  if (value.verificationScope !== 'issuer_attested') {
    errors.push('verificationScope must be issuer_attested');
  }
  if (value.evidenceScope !== 'budget_ledger_only') {
    errors.push('evidenceScope must be budget_ledger_only');
  }
  if (!hasText(value.teamId)) errors.push('teamId is required');
  if (!hasText(value.budgetRailId)) errors.push('budgetRailId is required');
  for (const [field, candidate] of [
    ['principalDigest', value.principalDigest],
    ['jobId', value.jobId],
    ['workUnitDigest', value.workUnitDigest],
    ['policyDigest', value.policyDigest],
    ['periodDigest', value.periodDigest],
    ['nonceDigest', value.nonceDigest],
    ['idempotencyKeyHash', value.idempotencyKeyHash],
  ] as const) {
    if (typeof candidate !== 'string' || !SHA256_LABEL.test(candidate)) {
      errors.push(`${field} must be a sha256 label`);
    }
  }
  if (!Number.isSafeInteger(value.attempt) || (value.attempt as number) < 1) {
    errors.push('attempt must be a positive safe integer');
  }
  if (value.currency !== 'USD') errors.push('currency must be USD');
  const statusValid =
    typeof value.status === 'string' &&
    BUDGET_EVIDENCE_STATUSES.has(value.status as ComputeBudgetEvidenceStatus);
  if (!statusValid) errors.push('status is invalid');
  const maxValid = safeNonNegativeInteger(value.maxAmountMinorUnits);
  const heldValid = safeNonNegativeInteger(value.heldAmountMinorUnits);
  const settledValid = safeNonNegativeInteger(value.settledAmountMinorUnits);
  if (!maxValid) errors.push('maxAmountMinorUnits must be a non-negative safe integer');
  if (!heldValid) errors.push('heldAmountMinorUnits must be a non-negative safe integer');
  if (!settledValid) errors.push('settledAmountMinorUnits must be a non-negative safe integer');
  const accountBeforeValid = validateBudgetAccountProjection(
    value.accountBefore,
    'accountBefore',
    errors
  );
  const accountAfterValid = validateBudgetAccountProjection(
    value.accountAfter,
    'accountAfter',
    errors
  );
  if (
    statusValid &&
    maxValid &&
    heldValid &&
    settledValid &&
    accountBeforeValid &&
    accountAfterValid
  ) {
    validateBudgetTransition(
      value.status as ComputeBudgetEvidenceStatus,
      value.maxAmountMinorUnits as number,
      value.heldAmountMinorUnits as number,
      value.settledAmountMinorUnits as number,
      value.accountBefore as unknown as ComputeBudgetAccountProjection,
      value.accountAfter as unknown as ComputeBudgetAccountProjection,
      errors
    );
  }
  if (
    value.measuredCostReceiptId !== undefined &&
    (typeof value.measuredCostReceiptId !== 'string' ||
      !SHA256_LABEL.test(value.measuredCostReceiptId))
  ) {
    errors.push('measuredCostReceiptId must be a sha256 label');
  }
  if (value.status !== 'settled' && value.measuredCostReceiptId !== undefined) {
    errors.push('measuredCostReceiptId is only allowed for settled evidence');
  }
  if (value.status === 'settled' && value.measuredCostReceiptId === undefined) {
    errors.push('settled evidence requires measuredCostReceiptId');
  }

  const issuedAt = parseIso(value.issuedAt);
  const validFrom = parseIso(value.validFrom);
  const validUntil = parseIso(value.validUntil);
  if (!Number.isFinite(issuedAt)) errors.push('issuedAt must be an ISO timestamp');
  if (!Number.isFinite(validFrom)) errors.push('validFrom must be an ISO timestamp');
  if (!Number.isFinite(validUntil)) errors.push('validUntil must be an ISO timestamp');
  if (Number.isFinite(validFrom) && Number.isFinite(validUntil) && validUntil <= validFrom) {
    errors.push('validUntil must follow validFrom');
  }
  if (
    Number.isFinite(issuedAt) &&
    Number.isFinite(validFrom) &&
    Number.isFinite(validUntil) &&
    (issuedAt < validFrom || issuedAt >= validUntil)
  ) {
    errors.push('issuedAt must fall within the validity interval');
  }

  validateReceiptId(value, 'budgetEvidence', errors);
  if (value.receiptId !== undefined && value.attestation !== undefined) {
    validateAttestation(
      withoutEnvelope(value as unknown as ComputeBudgetEvidence),
      value.attestation,
      'budget_ledger_attestor',
      'budgetEvidence.attestation',
      errors
    );
  } else if (value.attestation === undefined) {
    errors.push('budgetEvidence.attestation must be an object');
  }
  return { valid: errors.length === 0, errors };
}

/** Authenticate a structurally valid budget assertion and bind it to the expected job context. */
export function verifyComputeBudgetEvidence(
  input: VerifyComputeBudgetEvidenceInput
): ComputeBudgetEvidenceVerification {
  const structural = validateComputeBudgetEvidence(input.evidence);
  const errors = [...structural.errors];
  if (!structural.valid) {
    return { valid: false, errors, verificationScope: 'issuer_authenticated' };
  }

  for (const field of [
    'teamId',
    'budgetRailId',
    'principalDigest',
    'jobId',
    'attempt',
    'workUnitDigest',
    'currency',
    'maxAmountMinorUnits',
    'policyDigest',
    'periodDigest',
    'nonceDigest',
    'idempotencyKeyHash',
  ] as const) {
    if (input.evidence[field] !== input[field]) {
      errors.push(`budget evidence does not bind the expected ${field}`);
    }
  }

  const verifiedAt = parseIso(input.verifiedAt);
  if (!Number.isFinite(verifiedAt)) {
    errors.push('verifiedAt must be an ISO timestamp');
  } else {
    const validFrom = parseIso(input.evidence.validFrom);
    const validUntil = parseIso(input.evidence.validUntil);
    if (verifiedAt < validFrom || verifiedAt >= validUntil) {
      errors.push('budget evidence is not active at verification time');
    }
  }

  errors.push(
    ...attestationTrustErrors(
      withoutEnvelope(input.evidence),
      input.evidence.attestation,
      'budget_ledger_attestor',
      input.trustAnchors,
      {
        principalDigest: input.evidence.principalDigest,
        teamId: input.evidence.teamId,
        budgetRailId: input.evidence.budgetRailId,
        assertedAt: input.evidence.issuedAt,
        verifiedAt: input.verifiedAt,
      }
    )
  );

  return {
    valid: errors.length === 0,
    errors,
    verificationScope: 'issuer_authenticated',
  };
}

function validateCostEstimate(
  value: unknown,
  path: string,
  errors: string[]
): value is ComputeCapacityCostEstimate {
  if (!isRecord(value)) {
    errors.push(`${path} must be an object`);
    return false;
  }
  if (value.measurementState === 'measured') {
    rejectUnknownKeys(value, ['measurementState', 'currency', 'estimatedMinorUnits'], path, errors);
    if (value.currency !== 'USD') errors.push(`${path}.currency must be USD`);
    if (!safeNonNegativeInteger(value.estimatedMinorUnits)) {
      errors.push(`${path}.estimatedMinorUnits must be a non-negative safe integer`);
    }
  } else if (value.measurementState === 'not_measured') {
    rejectUnknownKeys(value, ['measurementState', 'reason'], path, errors);
    if (value.reason !== 'meter_unavailable') errors.push(`${path}.reason is invalid`);
  } else if (value.measurementState === 'not_applicable') {
    rejectUnknownKeys(value, ['measurementState'], path, errors);
  } else {
    errors.push(`${path}.measurementState is invalid`);
  }
  return true;
}

function sortedDataClasses(
  values: readonly ComputeDataClassification[]
): ComputeDataClassification[] {
  return DATA_CLASSES.filter((entry) => values.includes(entry));
}

function allocationCursorBody(
  cursor: ComputeCapacityAllocationCursor
): Omit<ComputeCapacityAllocationCursor, 'etag'> {
  const { etag: _etag, ...body } = cursor;
  return body;
}

export function computeCapacityAllocationEtag(
  cursor: Omit<ComputeCapacityAllocationCursor, 'etag'>
): string {
  return sha256Value(cursor);
}

export function validateComputeCapacityAllocationCursor(value: unknown): ComputeEvidenceValidation {
  const errors: string[] = [];
  if (!isRecord(value)) return { valid: false, errors: ['allocation cursor must be an object'] };
  rejectUnknownKeys(
    value,
    ['capacityRef', 'slotState', 'currentEpoch', 'currentLeaseReceiptId', 'version', 'etag'],
    'allocation',
    errors
  );
  for (const key of ['capacityRef', 'etag'] as const) {
    if (typeof value[key] !== 'string' || !SHA256_LABEL.test(value[key])) {
      errors.push(`allocation.${key} must be a sha256 label`);
    }
  }
  if (value.slotState !== 'available' && value.slotState !== 'leased') {
    errors.push('allocation.slotState is invalid');
  }
  if (!safeNonNegativeInteger(value.currentEpoch)) {
    errors.push('allocation.currentEpoch must be a non-negative safe integer');
  }
  if (!safeNonNegativeInteger(value.version)) {
    errors.push('allocation.version must be a non-negative safe integer');
  }
  if (value.slotState === 'leased') {
    if (
      typeof value.currentLeaseReceiptId !== 'string' ||
      !SHA256_LABEL.test(value.currentLeaseReceiptId)
    ) {
      errors.push('a leased allocation requires currentLeaseReceiptId');
    }
  } else if (value.currentLeaseReceiptId !== undefined) {
    errors.push('an available allocation cannot retain currentLeaseReceiptId');
  }
  if (typeof value.etag === 'string' && SHA256_LABEL.test(value.etag)) {
    const expected = computeCapacityAllocationEtag(
      allocationCursorBody(value as unknown as ComputeCapacityAllocationCursor)
    );
    if (expected !== value.etag) errors.push('allocation.etag does not match canonical state');
  }
  return { valid: errors.length === 0, errors };
}

export function buildComputeCapacitySnapshot(
  input: BuildComputeCapacitySnapshotInput
): ComputeCapacitySnapshot {
  const claims = {
    schemaVersion: COMPUTE_CAPACITY_SNAPSHOT_SCHEMA_VERSION,
    verificationScope: 'issuer_attested' as const,
    lane: input.lane,
    capacityRef: input.capacityRef,
    accelerator: input.accelerator,
    health: input.health,
    availableSlots: input.availableSlots,
    allowedDataClassifications: sortedDataClasses(input.allowedDataClassifications),
    observedAt: input.observedAt,
    validUntil: input.validUntil,
    estimatedCost: input.estimatedCost,
  };
  const receipt = assembleAttestedReceipt(claims, 'capacity_observer', input.signer);
  const validation = validateComputeCapacitySnapshot(receipt);
  if (!validation.valid) {
    throw new TypeError(`Invalid compute capacity snapshot: ${validation.errors.join('; ')}`);
  }
  return receipt;
}

export function validateComputeCapacitySnapshot(value: unknown): ComputeEvidenceValidation {
  const errors: string[] = [];
  if (!isRecord(value)) return { valid: false, errors: ['capacity snapshot must be an object'] };
  rejectUnknownKeys(
    value,
    [
      'schemaVersion',
      'verificationScope',
      'receiptId',
      'lane',
      'capacityRef',
      'accelerator',
      'health',
      'availableSlots',
      'allowedDataClassifications',
      'observedAt',
      'validUntil',
      'estimatedCost',
      'attestation',
    ],
    'snapshot',
    errors
  );
  if (value.schemaVersion !== COMPUTE_CAPACITY_SNAPSHOT_SCHEMA_VERSION) {
    errors.push(`snapshot.schemaVersion must be ${COMPUTE_CAPACITY_SNAPSHOT_SCHEMA_VERSION}`);
  }
  if (value.verificationScope !== 'issuer_attested') {
    errors.push('snapshot.verificationScope must be issuer_attested');
  }
  if (!LANES.has(value.lane as ComputeCapacityLane)) errors.push('snapshot.lane is invalid');
  if (typeof value.capacityRef !== 'string' || !SHA256_LABEL.test(value.capacityRef)) {
    errors.push('snapshot.capacityRef must be a sha256 label');
  }
  if (!ACCELERATORS.has(value.accelerator as ComputeAccelerator)) {
    errors.push('snapshot.accelerator is invalid');
  }
  if (!HEALTH.has(value.health as ComputeCapacityHealth)) errors.push('snapshot.health is invalid');
  if (!safeNonNegativeInteger(value.availableSlots) || (value.availableSlots as number) > 1) {
    errors.push('snapshot.availableSlots must be 0 or 1 for the v1 logical-slot contract');
  }
  if (
    !Array.isArray(value.allowedDataClassifications) ||
    value.allowedDataClassifications.length === 0 ||
    value.allowedDataClassifications.some(
      (entry) => !DATA_CLASS_SET.has(entry as ComputeDataClassification)
    ) ||
    canonicalJson(value.allowedDataClassifications) !==
      canonicalJson(
        sortedDataClasses(value.allowedDataClassifications as ComputeDataClassification[])
      )
  ) {
    errors.push('snapshot.allowedDataClassifications must be unique and canonically ordered');
  }
  const observedAt = parseIso(value.observedAt);
  const validUntil = parseIso(value.validUntil);
  if (!Number.isFinite(observedAt)) errors.push('snapshot.observedAt must be an ISO timestamp');
  if (!Number.isFinite(validUntil)) errors.push('snapshot.validUntil must be an ISO timestamp');
  if (Number.isFinite(observedAt) && Number.isFinite(validUntil) && validUntil <= observedAt) {
    errors.push('snapshot.validUntil must follow observedAt');
  } else if (
    Number.isFinite(observedAt) &&
    Number.isFinite(validUntil) &&
    validUntil - observedAt > COMPUTE_CAPACITY_SNAPSHOT_MAX_TTL_MS
  ) {
    errors.push('snapshot validity exceeds the hard freshness window');
  }
  validateCostEstimate(value.estimatedCost, 'snapshot.estimatedCost', errors);
  const claims = withoutEnvelope(value as unknown as ComputeCapacitySnapshot);
  validateAttestation(
    claims,
    value.attestation,
    'capacity_observer',
    'snapshot.attestation',
    errors
  );
  validateReceiptId(value, 'snapshot', errors);
  return { valid: errors.length === 0, errors };
}

export function buildComputeBridgeAdmission(
  input: BuildComputeBridgeAdmissionInput
): ComputeBridgeAdmission {
  const claims = {
    schemaVersion: COMPUTE_BRIDGE_ADMISSION_SCHEMA_VERSION,
    verificationScope: 'issuer_attested' as const,
    principalDigest: input.principalDigest,
    bridgeRef: input.bridgeRef,
    workUnitDigest: input.workUnitDigest,
    dataClassification: input.dataClassification,
    budget: input.budget,
    verdict: input.verdict,
    reason: input.reason,
    issuedAt: input.issuedAt,
    validUntil: input.validUntil,
  };
  const receipt = assembleAttestedReceipt(claims, 'bridge_admitter', input.signer);
  const validation = validateComputeBridgeAdmission(receipt);
  if (!validation.valid) {
    throw new TypeError(`Invalid compute bridge admission: ${validation.errors.join('; ')}`);
  }
  return receipt;
}

export function validateComputeBridgeAdmission(value: unknown): ComputeEvidenceValidation {
  const errors: string[] = [];
  if (!isRecord(value)) return { valid: false, errors: ['bridge admission must be an object'] };
  rejectUnknownKeys(
    value,
    [
      'schemaVersion',
      'verificationScope',
      'receiptId',
      'principalDigest',
      'bridgeRef',
      'workUnitDigest',
      'dataClassification',
      'budget',
      'verdict',
      'reason',
      'issuedAt',
      'validUntil',
      'attestation',
    ],
    'admission',
    errors
  );
  if (value.schemaVersion !== COMPUTE_BRIDGE_ADMISSION_SCHEMA_VERSION) {
    errors.push(`admission.schemaVersion must be ${COMPUTE_BRIDGE_ADMISSION_SCHEMA_VERSION}`);
  }
  if (value.verificationScope !== 'issuer_attested') {
    errors.push('admission.verificationScope must be issuer_attested');
  }
  for (const key of ['receiptId', 'principalDigest', 'bridgeRef', 'workUnitDigest'] as const) {
    if (typeof value[key] !== 'string' || !SHA256_LABEL.test(value[key])) {
      errors.push(`admission.${key} must be a sha256 label`);
    }
  }
  if (!DATA_CLASS_SET.has(value.dataClassification as ComputeDataClassification)) {
    errors.push('admission.dataClassification is invalid');
  }
  if (!isRecord(value.budget)) {
    errors.push('admission.budget must be an object');
  } else {
    rejectUnknownKeys(value.budget, ['currency', 'maxCostMinorUnits'], 'admission.budget', errors);
    if (value.budget.currency !== 'USD') errors.push('admission.budget.currency must be USD');
    if (!safeNonNegativeInteger(value.budget.maxCostMinorUnits)) {
      errors.push('admission.budget.maxCostMinorUnits must be a non-negative safe integer');
    }
  }
  if (value.verdict !== 'admitted' && value.verdict !== 'rejected') {
    errors.push('admission.verdict is invalid');
  }
  if (!BRIDGE_REASONS.has(value.reason as ComputeBridgeAdmissionReason)) {
    errors.push('admission.reason is invalid');
  }
  if (value.verdict === 'admitted' && value.reason !== 'policy_admitted') {
    errors.push('an admitted bridge receipt requires policy_admitted');
  }
  if (value.verdict === 'rejected' && value.reason === 'policy_admitted') {
    errors.push('a rejected bridge receipt cannot use policy_admitted');
  }
  const issuedAt = parseIso(value.issuedAt);
  const validUntil = parseIso(value.validUntil);
  if (!Number.isFinite(issuedAt)) errors.push('admission.issuedAt must be an ISO timestamp');
  if (!Number.isFinite(validUntil)) errors.push('admission.validUntil must be an ISO timestamp');
  if (Number.isFinite(issuedAt) && Number.isFinite(validUntil) && validUntil <= issuedAt) {
    errors.push('admission.validUntil must follow issuedAt');
  } else if (
    Number.isFinite(issuedAt) &&
    Number.isFinite(validUntil) &&
    validUntil - issuedAt > COMPUTE_BRIDGE_ADMISSION_MAX_TTL_MS
  ) {
    errors.push('admission validity exceeds the hard freshness window');
  }
  const claims = withoutEnvelope(value as unknown as ComputeBridgeAdmission);
  validateAttestation(
    claims,
    value.attestation,
    'bridge_admitter',
    'admission.attestation',
    errors
  );
  validateReceiptId(value, 'admission', errors);
  return { valid: errors.length === 0, errors };
}

function placementAllowed(workUnit: ComputeWorkUnitContract, lane: ComputeCapacityLane): boolean {
  switch (workUnit.compute.policy.placement) {
    case 'local_only':
      return lane === 'local_device';
    case 'owned_fleet':
      return (
        lane === 'owned_fleet' || (workUnit.compute.policy.allowFallback && lane === 'local_device')
      );
    case 'external_bridge_requested':
      return lane === 'managed_bridge' || workUnit.compute.policy.allowFallback;
  }
}

function placementReasonList(
  values: ReadonlySet<ComputePlacementReason>
): ComputePlacementReason[] {
  return PLACEMENT_REASON_ORDER.filter((reason) => values.has(reason));
}

function placementClaims(
  input: Omit<PlanComputePlacementInput, 'signer'>
): Omit<ComputePlacementPlan, 'receiptId' | 'attestation'> {
  const workUnitValidation = validateComputeWorkUnitContract(input.workUnit);
  if (!workUnitValidation.valid) {
    throw new TypeError(`Invalid compute WorkUnit: ${workUnitValidation.errors.join('; ')}`);
  }
  if (!SHA256_LABEL.test(input.principalDigest)) {
    throw new TypeError('principalDigest must be a sha256 label');
  }
  const snapshotValidation = validateComputeCapacitySnapshot(input.capacitySnapshot);
  if (!snapshotValidation.valid) {
    throw new TypeError(
      `Invalid compute capacity snapshot: ${snapshotValidation.errors.join('; ')}`
    );
  }
  const checkedAt = parseIso(input.checkedAt);
  if (!Number.isFinite(checkedAt)) throw new TypeError('checkedAt must be an ISO timestamp');

  const reasons = new Set<ComputePlacementReason>();
  const snapshotClaims = withoutEnvelope(input.capacitySnapshot);
  if (
    attestationTrustErrors(
      snapshotClaims,
      input.capacitySnapshot.attestation,
      'capacity_observer',
      input.trustAnchors,
      {
        principalDigest: input.principalDigest,
        lane: input.capacitySnapshot.lane,
        capacityRef: input.capacitySnapshot.capacityRef,
        assertedAt: input.capacitySnapshot.observedAt,
        verifiedAt: input.checkedAt,
      }
    ).length > 0
  ) {
    reasons.add('capacity_evidence_untrusted');
  }
  const observedAt = parseIso(input.capacitySnapshot.observedAt);
  const snapshotValidUntil = parseIso(input.capacitySnapshot.validUntil);
  if (observedAt > checkedAt + COMPUTE_EVIDENCE_MAX_FUTURE_SKEW_MS) {
    reasons.add('telemetry_future');
  }
  if (checkedAt >= snapshotValidUntil) reasons.add('telemetry_stale');
  if (input.capacitySnapshot.health !== 'ready') reasons.add('telemetry_degraded');
  if (input.capacitySnapshot.availableSlots < 1) reasons.add('capacity_unavailable');
  if (!placementAllowed(input.workUnit, input.capacitySnapshot.lane)) {
    reasons.add('placement_forbidden');
  }
  if (
    !input.workUnit.compute.policy.allowedAccelerators.includes(input.capacitySnapshot.accelerator)
  ) {
    reasons.add('accelerator_unavailable');
  } else if (
    input.capacitySnapshot.accelerator !== input.workUnit.compute.policy.allowedAccelerators[0] &&
    !input.workUnit.compute.policy.allowFallback
  ) {
    reasons.add('accelerator_unavailable');
  }
  if (
    !input.capacitySnapshot.allowedDataClassifications.includes(
      input.workUnit.compute.policy.dataClassification
    )
  ) {
    reasons.add('data_classification_unsupported');
  }
  if (input.capacitySnapshot.estimatedCost.measurementState === 'not_measured') {
    reasons.add('cost_unavailable');
  } else if (
    input.capacitySnapshot.lane === 'managed_bridge' &&
    input.capacitySnapshot.estimatedCost.measurementState !== 'measured'
  ) {
    reasons.add('cost_unavailable');
  } else if (
    input.capacitySnapshot.estimatedCost.measurementState === 'measured' &&
    input.capacitySnapshot.estimatedCost.estimatedMinorUnits >
      input.workUnit.compute.budget.maxCostMinorUnits
  ) {
    reasons.add('budget_exceeded');
  }

  let validUntil = input.capacitySnapshot.validUntil;
  let bridgeAdmissionReceiptId: string | undefined;
  if (input.workUnit.compute.policy.placement === 'external_bridge_requested') {
    const admission = input.bridgeAdmission;
    if (!admission) {
      reasons.add('bridge_admission_required');
    } else {
      bridgeAdmissionReceiptId = admission.receiptId;
      const admissionValidation = validateComputeBridgeAdmission(admission);
      if (!admissionValidation.valid) {
        reasons.add('bridge_admission_invalid');
      } else {
        const admissionClaims = withoutEnvelope(admission);
        if (
          attestationTrustErrors(
            admissionClaims,
            admission.attestation,
            'bridge_admitter',
            input.trustAnchors,
            {
              principalDigest: admission.principalDigest,
              lane: 'managed_bridge',
              capacityRef: admission.bridgeRef,
              assertedAt: admission.issuedAt,
              verifiedAt: input.checkedAt,
            }
          ).length > 0
        ) {
          reasons.add('bridge_admission_untrusted');
        }
        const issuedAt = parseIso(admission.issuedAt);
        const admissionValidUntil = parseIso(admission.validUntil);
        if (issuedAt > checkedAt + COMPUTE_EVIDENCE_MAX_FUTURE_SKEW_MS) {
          reasons.add('bridge_admission_future');
        }
        if (checkedAt >= admissionValidUntil) reasons.add('bridge_admission_expired');
        if (
          admission.principalDigest !== input.principalDigest ||
          admission.workUnitDigest !== computeWorkUnitDigest(input.workUnit) ||
          admission.dataClassification !== input.workUnit.compute.policy.dataClassification ||
          admission.budget.currency !== input.workUnit.compute.budget.currency ||
          admission.budget.maxCostMinorUnits !== input.workUnit.compute.budget.maxCostMinorUnits
        ) {
          reasons.add('bridge_admission_invalid');
        }
        if (
          input.capacitySnapshot.lane === 'managed_bridge' &&
          admission.bridgeRef !== input.capacitySnapshot.capacityRef
        ) {
          reasons.add('bridge_admission_invalid');
        }
        if (input.capacitySnapshot.lane === 'managed_bridge' && admission.verdict !== 'admitted') {
          reasons.add('bridge_admission_denied');
        }
        if (input.capacitySnapshot.lane !== 'managed_bridge' && admission.verdict !== 'rejected') {
          reasons.add('bridge_fallback_unexplained');
        }
        if (admissionValidUntil < snapshotValidUntil) validUntil = admission.validUntil;
      }
    }
  }

  const maximumPlanValidUntil = checkedAt + COMPUTE_CAPACITY_SNAPSHOT_MAX_TTL_MS;
  if (parseIso(validUntil) > maximumPlanValidUntil) {
    validUntil = new Date(maximumPlanValidUntil).toISOString();
  }

  const reasonCodes = placementReasonList(reasons);
  return {
    schemaVersion: COMPUTE_PLACEMENT_PLAN_SCHEMA_VERSION,
    verificationScope: 'issuer_attested',
    principalDigest: input.principalDigest,
    workUnitDigest: computeWorkUnitDigest(input.workUnit),
    sourceEvidence: input.workUnit.source_evidence,
    capacitySnapshotReceiptId: input.capacitySnapshot.receiptId,
    ...(bridgeAdmissionReceiptId ? { bridgeAdmissionReceiptId } : {}),
    lane: input.capacitySnapshot.lane,
    capacityRef: input.capacitySnapshot.capacityRef,
    accelerator: input.capacitySnapshot.accelerator,
    estimatedCost: input.capacitySnapshot.estimatedCost,
    verdict: reasonCodes.length === 0 ? 'admitted' : 'rejected',
    reasonCodes,
    checkedAt: input.checkedAt,
    validUntil,
  };
}

export function planComputePlacement(input: PlanComputePlacementInput): ComputePlacementPlan {
  const claims = placementClaims(input);
  const receipt = assembleAttestedReceipt(claims, 'placement_planner', input.signer);
  const validation = validateComputePlacementPlan(receipt);
  if (!validation.valid) {
    throw new TypeError(`Invalid compute placement plan: ${validation.errors.join('; ')}`);
  }
  return receipt;
}

export function validateComputePlacementPlan(value: unknown): ComputeEvidenceValidation {
  const errors: string[] = [];
  if (!isRecord(value)) return { valid: false, errors: ['placement plan must be an object'] };
  rejectUnknownKeys(
    value,
    [
      'schemaVersion',
      'verificationScope',
      'receiptId',
      'principalDigest',
      'workUnitDigest',
      'sourceEvidence',
      'capacitySnapshotReceiptId',
      'bridgeAdmissionReceiptId',
      'lane',
      'capacityRef',
      'accelerator',
      'estimatedCost',
      'verdict',
      'reasonCodes',
      'checkedAt',
      'validUntil',
      'attestation',
    ],
    'plan',
    errors
  );
  if (value.schemaVersion !== COMPUTE_PLACEMENT_PLAN_SCHEMA_VERSION) {
    errors.push(`plan.schemaVersion must be ${COMPUTE_PLACEMENT_PLAN_SCHEMA_VERSION}`);
  }
  if (value.verificationScope !== 'issuer_attested') {
    errors.push('plan.verificationScope must be issuer_attested');
  }
  for (const key of [
    'receiptId',
    'principalDigest',
    'workUnitDigest',
    'sourceEvidence',
    'capacitySnapshotReceiptId',
    'capacityRef',
  ] as const) {
    if (typeof value[key] !== 'string' || !SHA256_LABEL.test(value[key])) {
      errors.push(`plan.${key} must be a sha256 label`);
    }
  }
  if (
    value.bridgeAdmissionReceiptId !== undefined &&
    (typeof value.bridgeAdmissionReceiptId !== 'string' ||
      !SHA256_LABEL.test(value.bridgeAdmissionReceiptId))
  ) {
    errors.push('plan.bridgeAdmissionReceiptId must be a sha256 label when present');
  }
  if (!LANES.has(value.lane as ComputeCapacityLane)) errors.push('plan.lane is invalid');
  if (!ACCELERATORS.has(value.accelerator as ComputeAccelerator))
    errors.push('plan.accelerator is invalid');
  validateCostEstimate(value.estimatedCost, 'plan.estimatedCost', errors);
  if (value.verdict !== 'admitted' && value.verdict !== 'rejected')
    errors.push('plan.verdict is invalid');
  if (
    !Array.isArray(value.reasonCodes) ||
    value.reasonCodes.some((reason) => !PLACEMENT_REASONS.has(reason as ComputePlacementReason)) ||
    canonicalJson(value.reasonCodes) !==
      canonicalJson(placementReasonList(new Set(value.reasonCodes as ComputePlacementReason[])))
  ) {
    errors.push('plan.reasonCodes must be unique and canonically ordered');
  } else if (value.verdict === 'admitted' && value.reasonCodes.length !== 0) {
    errors.push('an admitted plan cannot contain rejection reasons');
  } else if (value.verdict === 'rejected' && value.reasonCodes.length === 0) {
    errors.push('a rejected plan requires at least one reason');
  }
  const checkedAt = parseIso(value.checkedAt);
  const validUntil = parseIso(value.validUntil);
  if (!Number.isFinite(checkedAt)) errors.push('plan.checkedAt must be an ISO timestamp');
  if (!Number.isFinite(validUntil)) errors.push('plan.validUntil must be an ISO timestamp');
  if (
    value.verdict === 'admitted' &&
    Number.isFinite(checkedAt) &&
    Number.isFinite(validUntil) &&
    validUntil <= checkedAt
  ) {
    errors.push('an admitted plan must remain valid after checkedAt');
  } else if (
    value.verdict === 'admitted' &&
    Number.isFinite(checkedAt) &&
    Number.isFinite(validUntil) &&
    validUntil - checkedAt > COMPUTE_CAPACITY_SNAPSHOT_MAX_TTL_MS
  ) {
    errors.push('an admitted plan validity exceeds the hard freshness window');
  }
  const claims = withoutEnvelope(value as unknown as ComputePlacementPlan);
  validateAttestation(claims, value.attestation, 'placement_planner', 'plan.attestation', errors);
  validateReceiptId(value, 'plan', errors);
  return { valid: errors.length === 0, errors };
}

export function verifyComputePlacementPlan(
  input: VerifyComputePlacementPlanInput
): ComputeEvidenceValidation {
  const errors: string[] = [];
  const validation = validateComputePlacementPlan(input.plan);
  if (!validation.valid) errors.push(...validation.errors);
  if (errors.length > 0) return { valid: false, errors };
  errors.push(
    ...attestationTrustErrors(
      withoutEnvelope(input.plan),
      input.plan.attestation,
      'placement_planner',
      input.trustAnchors,
      {
        principalDigest: input.plan.principalDigest,
        lane: input.plan.lane,
        capacityRef: input.plan.capacityRef,
        assertedAt: input.plan.checkedAt,
        verifiedAt: input.verifiedAt,
      }
    ).map((error) => `plan: ${error}`)
  );
  errors.push(
    ...attestationTrustErrors(
      withoutEnvelope(input.capacitySnapshot),
      input.capacitySnapshot.attestation,
      'capacity_observer',
      input.trustAnchors,
      {
        principalDigest: input.principalDigest,
        lane: input.capacitySnapshot.lane,
        capacityRef: input.capacitySnapshot.capacityRef,
        assertedAt: input.capacitySnapshot.observedAt,
        verifiedAt: input.verifiedAt,
      }
    ).map((error) => `capacity: ${error}`)
  );
  if (
    input.workUnit.compute.policy.placement === 'external_bridge_requested' &&
    input.bridgeAdmission
  ) {
    errors.push(
      ...attestationTrustErrors(
        withoutEnvelope(input.bridgeAdmission),
        input.bridgeAdmission.attestation,
        'bridge_admitter',
        input.trustAnchors,
        {
          principalDigest: input.bridgeAdmission.principalDigest,
          lane: 'managed_bridge',
          capacityRef: input.bridgeAdmission.bridgeRef,
          assertedAt: input.bridgeAdmission.issuedAt,
          verifiedAt: input.verifiedAt,
        }
      ).map((error) => `bridge admission: ${error}`)
    );
  }
  if (input.plan.principalDigest !== input.principalDigest) {
    errors.push('plan does not bind the supplied principal');
  }
  const verifiedAt = parseIso(input.verifiedAt);
  if (!Number.isFinite(verifiedAt)) {
    errors.push('plan verifiedAt must be an ISO timestamp');
  } else {
    if (parseIso(input.plan.checkedAt) > verifiedAt + COMPUTE_EVIDENCE_MAX_FUTURE_SKEW_MS) {
      errors.push('plan is future-dated at verification time');
    }
    if (input.plan.verdict === 'admitted' && verifiedAt >= parseIso(input.plan.validUntil)) {
      errors.push('admitted plan is expired at verification time');
    }
  }
  try {
    const expected = placementClaims(input);
    if (canonicalJson(withoutEnvelope(input.plan)) !== canonicalJson(expected)) {
      errors.push('plan claims do not match the verified placement decision');
    }
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }
  return { valid: errors.length === 0, errors };
}

/**
 * Prepare a lease receipt and allocator CAS projection. This pure function does
 * not reserve capacity. A durable adapter must atomically compare
 * expectedAllocation and persist nextAllocation with the lease.
 */
export function prepareComputeCapacityLease(
  input: PrepareComputeCapacityLeaseInput
): PreparedComputeCapacityLease {
  const placement = verifyComputePlacementPlan({
    principalDigest: input.principalDigest,
    workUnit: input.workUnit,
    capacitySnapshot: input.capacitySnapshot,
    bridgeAdmission: input.bridgeAdmission,
    plan: input.plan,
    checkedAt: input.plan.checkedAt,
    verifiedAt: input.issuedAt,
    trustAnchors: input.trustAnchors,
  });
  if (!placement.valid || input.plan.verdict !== 'admitted') {
    throw new TypeError(
      `Cannot lease rejected or invalid placement: ${placement.errors.join('; ') || input.plan.reasonCodes.join(',')}`
    );
  }
  const issuedAt = parseIso(input.issuedAt);
  const expiresAt = parseIso(input.expiresAt);
  if (!Number.isFinite(issuedAt) || !Number.isFinite(expiresAt) || expiresAt <= issuedAt) {
    throw new TypeError('lease timestamps must be ISO and expiresAt must follow issuedAt');
  }
  if (issuedAt < parseIso(input.plan.checkedAt) || issuedAt >= parseIso(input.plan.validUntil)) {
    throw new TypeError('lease must be issued while the placement plan is valid');
  }
  if (
    !SHA256_LABEL.test(input.principalDigest) ||
    !SHA256_LABEL.test(input.jobId) ||
    !SHA256_LABEL.test(input.holderDigest)
  ) {
    throw new TypeError('lease principalDigest, jobId, and holderDigest must be sha256 labels');
  }
  if (!Number.isSafeInteger(input.attempt) || input.attempt < 1) {
    throw new TypeError('lease attempt must be a positive safe integer');
  }
  if (
    expiresAt - issuedAt > COMPUTE_CAPACITY_LEASE_MAX_TTL_MS ||
    (input.workUnit.compute.budget.deadlineMs > 0 &&
      expiresAt - issuedAt > input.workUnit.compute.budget.deadlineMs)
  ) {
    throw new TypeError('lease lifetime exceeds the server or WorkUnit limit');
  }
  if (
    input.plan.lane === 'managed_bridge' &&
    (!input.bridgeAdmission || expiresAt > parseIso(input.bridgeAdmission.validUntil))
  ) {
    throw new TypeError('managed lease cannot outlive bridge admission');
  }
  const allocationValidation = validateComputeCapacityAllocationCursor(input.allocationCursor);
  if (!allocationValidation.valid) {
    throw new TypeError(
      `Invalid capacity allocation cursor: ${allocationValidation.errors.join('; ')}`
    );
  }
  if (
    input.allocationCursor.capacityRef !== input.plan.capacityRef ||
    input.allocationCursor.slotState !== 'available'
  ) {
    throw new TypeError('capacity allocation must be the available cursor for the admitted plan');
  }
  if (
    input.allocationCursor.currentEpoch === Number.MAX_SAFE_INTEGER ||
    input.allocationCursor.version === Number.MAX_SAFE_INTEGER
  ) {
    throw new TypeError('capacity allocation counters cannot advance beyond safe integers');
  }
  const fencingEpoch = input.allocationCursor.currentEpoch + 1;
  const tokenBytes =
    typeof input.fencingToken === 'string'
      ? Buffer.from(input.fencingToken, 'utf8')
      : Buffer.from(input.fencingToken);
  if (tokenBytes.byteLength < 32)
    throw new TypeError('fencingToken must contain at least 32 bytes');
  const claims = {
    schemaVersion: COMPUTE_CAPACITY_LEASE_SCHEMA_VERSION,
    verificationScope: 'issuer_attested' as const,
    principalDigest: input.principalDigest,
    jobId: input.jobId,
    attempt: input.attempt,
    holderDigest: input.holderDigest,
    workUnitDigest: computeWorkUnitDigest(input.workUnit),
    planReceiptId: input.plan.receiptId,
    capacitySnapshotReceiptId: input.capacitySnapshot.receiptId,
    lane: input.plan.lane,
    capacityRef: input.plan.capacityRef,
    accelerator: input.plan.accelerator,
    issuedAt: input.issuedAt,
    expiresAt: input.expiresAt,
    fencingEpoch,
    fencingTokenHash: sha256Bytes(tokenBytes),
  };
  const receipt = assembleAttestedReceipt(claims, 'lease_issuer', input.signer);
  const validation = validateComputeCapacityLease(receipt);
  if (!validation.valid) {
    throw new TypeError(`Invalid compute capacity lease: ${validation.errors.join('; ')}`);
  }
  const nextBody: Omit<ComputeCapacityAllocationCursor, 'etag'> = {
    capacityRef: input.allocationCursor.capacityRef,
    slotState: 'leased',
    currentEpoch: fencingEpoch,
    currentLeaseReceiptId: receipt.receiptId,
    version: input.allocationCursor.version + 1,
  };
  const nextAllocation: ComputeCapacityAllocationCursor = {
    ...nextBody,
    etag: computeCapacityAllocationEtag(nextBody),
  };
  return {
    expectedAllocation: input.allocationCursor,
    nextAllocation,
    lease: receipt,
  };
}

export function validateComputeCapacityLease(value: unknown): ComputeEvidenceValidation {
  const errors: string[] = [];
  if (!isRecord(value)) return { valid: false, errors: ['capacity lease must be an object'] };
  rejectUnknownKeys(
    value,
    [
      'schemaVersion',
      'verificationScope',
      'receiptId',
      'principalDigest',
      'jobId',
      'attempt',
      'holderDigest',
      'workUnitDigest',
      'planReceiptId',
      'capacitySnapshotReceiptId',
      'lane',
      'capacityRef',
      'accelerator',
      'issuedAt',
      'expiresAt',
      'fencingEpoch',
      'fencingTokenHash',
      'attestation',
    ],
    'lease',
    errors
  );
  if (value.schemaVersion !== COMPUTE_CAPACITY_LEASE_SCHEMA_VERSION) {
    errors.push(`lease.schemaVersion must be ${COMPUTE_CAPACITY_LEASE_SCHEMA_VERSION}`);
  }
  if (value.verificationScope !== 'issuer_attested')
    errors.push('lease.verificationScope must be issuer_attested');
  for (const key of [
    'receiptId',
    'principalDigest',
    'jobId',
    'holderDigest',
    'workUnitDigest',
    'planReceiptId',
    'capacitySnapshotReceiptId',
    'capacityRef',
    'fencingTokenHash',
  ] as const) {
    if (typeof value[key] !== 'string' || !SHA256_LABEL.test(value[key])) {
      errors.push(`lease.${key} must be a sha256 label`);
    }
  }
  if (!LANES.has(value.lane as ComputeCapacityLane)) errors.push('lease.lane is invalid');
  if (!ACCELERATORS.has(value.accelerator as ComputeAccelerator))
    errors.push('lease.accelerator is invalid');
  const issuedAt = parseIso(value.issuedAt);
  const expiresAt = parseIso(value.expiresAt);
  if (!Number.isFinite(issuedAt)) errors.push('lease.issuedAt must be an ISO timestamp');
  if (!Number.isFinite(expiresAt)) errors.push('lease.expiresAt must be an ISO timestamp');
  if (Number.isFinite(issuedAt) && Number.isFinite(expiresAt) && expiresAt <= issuedAt) {
    errors.push('lease.expiresAt must follow issuedAt');
  }
  if (!Number.isSafeInteger(value.fencingEpoch) || (value.fencingEpoch as number) < 1) {
    errors.push('lease.fencingEpoch must be a positive safe integer');
  }
  if (!Number.isSafeInteger(value.attempt) || (value.attempt as number) < 1) {
    errors.push('lease.attempt must be a positive safe integer');
  }
  const claims = withoutEnvelope(value as unknown as ComputeCapacityLease);
  validateAttestation(claims, value.attestation, 'lease_issuer', 'lease.attestation', errors);
  validateReceiptId(value, 'lease', errors);
  return { valid: errors.length === 0, errors };
}

export function verifyComputeCapacityLeaseReceipt(
  input: VerifyComputeCapacityLeaseReceiptInput
): ComputeEvidenceValidation {
  const errors: string[] = [];
  const validation = validateComputeCapacityLease(input.lease);
  if (!validation.valid) errors.push(...validation.errors);
  const placement = verifyComputePlacementPlan({
    principalDigest: input.principalDigest,
    workUnit: input.workUnit,
    capacitySnapshot: input.capacitySnapshot,
    bridgeAdmission: input.bridgeAdmission,
    plan: input.plan,
    checkedAt: input.plan.checkedAt,
    verifiedAt: input.lease.issuedAt,
    trustAnchors: input.trustAnchors,
  });
  if (!placement.valid) errors.push(...placement.errors.map((error) => `placement: ${error}`));
  if (errors.length > 0) return { valid: false, errors };
  errors.push(
    ...attestationTrustErrors(
      withoutEnvelope(input.lease),
      input.lease.attestation,
      'lease_issuer',
      input.trustAnchors,
      {
        principalDigest: input.lease.principalDigest,
        lane: input.lease.lane,
        capacityRef: input.lease.capacityRef,
        assertedAt: input.lease.issuedAt,
        verifiedAt: input.at,
      }
    ).map((error) => `lease: ${error}`)
  );
  if (input.plan.verdict !== 'admitted') errors.push('lease requires an admitted plan');
  if (input.lease.workUnitDigest !== computeWorkUnitDigest(input.workUnit)) {
    errors.push('lease does not bind the supplied WorkUnit');
  }
  if (input.lease.planReceiptId !== input.plan.receiptId)
    errors.push('lease does not bind the supplied plan');
  if (
    input.lease.principalDigest !== input.principalDigest ||
    input.lease.jobId !== input.jobId ||
    input.lease.attempt !== input.attempt ||
    input.lease.holderDigest !== input.holderDigest
  ) {
    errors.push('lease does not bind the supplied principal, job attempt, and holder');
  }
  if (input.lease.capacitySnapshotReceiptId !== input.capacitySnapshot.receiptId) {
    errors.push('lease does not bind the supplied capacity snapshot');
  }
  if (
    input.lease.lane !== input.plan.lane ||
    input.lease.capacityRef !== input.plan.capacityRef ||
    input.lease.accelerator !== input.plan.accelerator
  ) {
    errors.push('lease allocation does not match the supplied plan');
  }
  const at = parseIso(input.at);
  if (!Number.isFinite(at)) {
    errors.push('lease verification time must be an ISO timestamp');
  } else if (at < parseIso(input.lease.issuedAt) || at >= parseIso(input.lease.expiresAt)) {
    errors.push('lease is not active at the requested time');
  }
  if (
    parseIso(input.lease.issuedAt) < parseIso(input.plan.checkedAt) ||
    parseIso(input.lease.issuedAt) >= parseIso(input.plan.validUntil)
  ) {
    errors.push('lease was not issued while the plan was valid');
  }
  const leaseDurationMs = parseIso(input.lease.expiresAt) - parseIso(input.lease.issuedAt);
  if (
    leaseDurationMs > COMPUTE_CAPACITY_LEASE_MAX_TTL_MS ||
    (input.workUnit.compute.budget.deadlineMs > 0 &&
      leaseDurationMs > input.workUnit.compute.budget.deadlineMs)
  ) {
    errors.push('lease lifetime exceeds the server or WorkUnit limit');
  }
  if (
    input.lease.lane === 'managed_bridge' &&
    (!input.bridgeAdmission ||
      parseIso(input.lease.expiresAt) > parseIso(input.bridgeAdmission.validUntil))
  ) {
    errors.push('managed lease outlives bridge admission');
  }
  return { valid: errors.length === 0, errors };
}

export function authorizeComputeCapacityLeaseUse(
  input: AuthorizeComputeCapacityLeaseUseInput
): ComputeEvidenceValidation {
  const receipt = verifyComputeCapacityLeaseReceipt(input);
  const errors = [...receipt.errors];
  const allocation = validateComputeCapacityAllocationCursor(input.allocationCursor);
  if (!allocation.valid) {
    errors.push(...allocation.errors.map((error) => `allocation: ${error}`));
  } else if (
    input.allocationCursor.slotState !== 'leased' ||
    input.allocationCursor.capacityRef !== input.lease.capacityRef ||
    input.allocationCursor.currentLeaseReceiptId !== input.lease.receiptId ||
    input.allocationCursor.currentEpoch !== input.lease.fencingEpoch
  ) {
    errors.push('allocator cursor does not authorize the current lease and fencing epoch');
  }
  if (sha256Bytes(input.presentedFencingToken) !== input.lease.fencingTokenHash) {
    errors.push('presented fencing token does not match');
  }
  return { valid: errors.length === 0, errors };
}

export function attestComputeExecutionReceipt(
  input: AttestComputeExecutionReceiptInput
): ComputeSubjectAttestation {
  const validation = validateComputeExecutionReceipt(input.executionReceipt);
  if (!validation.valid) {
    throw new TypeError(`Invalid compute execution receipt: ${validation.errors.join('; ')}`);
  }
  if (!Number.isFinite(parseIso(input.issuedAt)))
    throw new TypeError('issuedAt must be an ISO timestamp');
  if (!SHA256_LABEL.test(input.principalDigest)) {
    throw new TypeError('principalDigest must be a sha256 label');
  }
  const claims = {
    schemaVersion: COMPUTE_SUBJECT_ATTESTATION_SCHEMA_VERSION,
    verificationScope: 'issuer_attested' as const,
    principalDigest: input.principalDigest,
    subject: {
      schemaVersion: COMPUTE_EXECUTION_RECEIPT_SCHEMA_VERSION,
      receiptId: input.executionReceipt.receiptId,
    },
    issuedAt: input.issuedAt,
  };
  const receipt = assembleAttestedReceipt(claims, 'execution_attestor', input.signer);
  const receiptValidation = validateComputeSubjectAttestation(receipt);
  if (!receiptValidation.valid) {
    throw new TypeError(
      `Invalid compute subject attestation: ${receiptValidation.errors.join('; ')}`
    );
  }
  return receipt;
}

export function validateComputeSubjectAttestation(value: unknown): ComputeEvidenceValidation {
  const errors: string[] = [];
  if (!isRecord(value)) return { valid: false, errors: ['subject attestation must be an object'] };
  rejectUnknownKeys(
    value,
    [
      'schemaVersion',
      'verificationScope',
      'receiptId',
      'principalDigest',
      'subject',
      'issuedAt',
      'attestation',
    ],
    'subjectAttestation',
    errors
  );
  if (value.schemaVersion !== COMPUTE_SUBJECT_ATTESTATION_SCHEMA_VERSION) {
    errors.push(
      `subjectAttestation.schemaVersion must be ${COMPUTE_SUBJECT_ATTESTATION_SCHEMA_VERSION}`
    );
  }
  if (value.verificationScope !== 'issuer_attested') {
    errors.push('subjectAttestation.verificationScope must be issuer_attested');
  }
  if (typeof value.principalDigest !== 'string' || !SHA256_LABEL.test(value.principalDigest)) {
    errors.push('subjectAttestation.principalDigest must be a sha256 label');
  }
  if (!isRecord(value.subject)) {
    errors.push('subjectAttestation.subject must be an object');
  } else {
    rejectUnknownKeys(
      value.subject,
      ['schemaVersion', 'receiptId'],
      'subjectAttestation.subject',
      errors
    );
    if (!hasText(value.subject.schemaVersion))
      errors.push('subjectAttestation.subject.schemaVersion is required');
    if (
      typeof value.subject.receiptId !== 'string' ||
      !SHA256_LABEL.test(value.subject.receiptId)
    ) {
      errors.push('subjectAttestation.subject.receiptId must be a sha256 label');
    }
  }
  if (!Number.isFinite(parseIso(value.issuedAt)))
    errors.push('subjectAttestation.issuedAt must be an ISO timestamp');
  const claims = withoutEnvelope(value as unknown as ComputeSubjectAttestation);
  validateAttestation(
    claims,
    value.attestation,
    'execution_attestor',
    'subjectAttestation.attestation',
    errors
  );
  validateReceiptId(value, 'subjectAttestation', errors);
  return { valid: errors.length === 0, errors };
}

function executionOutcomeForLane(lane: ComputeCapacityLane): ComputeExecutionPlacementOutcome {
  return lane === 'managed_bridge' ? 'external_bridge' : lane;
}

function primaryLane(workUnit: ComputeWorkUnitContract): ComputeCapacityLane {
  if (workUnit.compute.policy.placement === 'local_only') return 'local_device';
  if (workUnit.compute.policy.placement === 'owned_fleet') return 'owned_fleet';
  return 'managed_bridge';
}

export function verifyComputeExecutionEvidence(
  input: VerifyComputeExecutionEvidenceInput
): ComputeExecutionEvidenceVerification {
  const errors: string[] = [];
  const executionValidation = validateComputeExecutionReceipt(input.executionReceipt);
  if (!executionValidation.valid)
    errors.push(...executionValidation.errors.map((error) => `execution: ${error}`));
  const attestationValidation = validateComputeSubjectAttestation(input.executionAttestation);
  if (!attestationValidation.valid)
    errors.push(...attestationValidation.errors.map((error) => `execution attestation: ${error}`));
  const placement = verifyComputePlacementPlan({
    principalDigest: input.principalDigest,
    workUnit: input.workUnit,
    capacitySnapshot: input.capacitySnapshot,
    bridgeAdmission: input.bridgeAdmission,
    plan: input.plan,
    checkedAt: input.plan.checkedAt,
    verifiedAt: input.lease.issuedAt,
    trustAnchors: input.trustAnchors,
  });
  if (!placement.valid) errors.push(...placement.errors.map((error) => `placement: ${error}`));
  const lease = verifyComputeCapacityLeaseReceipt({
    principalDigest: input.principalDigest,
    jobId: input.jobId,
    attempt: input.attempt,
    holderDigest: input.holderDigest,
    workUnit: input.workUnit,
    capacitySnapshot: input.capacitySnapshot,
    bridgeAdmission: input.bridgeAdmission,
    plan: input.plan,
    lease: input.lease,
    at: input.executionReceipt.execution.startedAt,
    trustAnchors: input.trustAnchors,
  });
  if (!lease.valid) errors.push(...lease.errors.map((error) => `lease: ${error}`));
  if (errors.length > 0) return { valid: false, errors, verificationScope: 'issuer_authenticated' };

  errors.push(
    ...attestationTrustErrors(
      withoutEnvelope(input.executionAttestation),
      input.executionAttestation.attestation,
      'execution_attestor',
      input.trustAnchors,
      {
        principalDigest: input.executionAttestation.principalDigest,
        lane: input.plan.lane,
        capacityRef: input.plan.capacityRef,
        assertedAt: input.executionAttestation.issuedAt,
        verifiedAt: input.verifiedAt,
      }
    ).map((error) => `execution attestation: ${error}`)
  );
  const workUnitDigest = computeWorkUnitDigest(input.workUnit);
  if (
    input.executionAttestation.principalDigest !== input.principalDigest ||
    input.executionAttestation.subject.schemaVersion !== COMPUTE_EXECUTION_RECEIPT_SCHEMA_VERSION ||
    input.executionAttestation.subject.receiptId !== input.executionReceipt.receiptId
  ) {
    errors.push('execution attestation does not bind the supplied execution receipt');
  }
  if (
    input.executionReceipt.workUnit.digest !== workUnitDigest ||
    input.executionReceipt.workUnit.sourceEvidence !== input.workUnit.source_evidence
  ) {
    errors.push('execution receipt does not bind the supplied WorkUnit');
  }
  if (
    input.executionReceipt.placement.planReceiptId !== input.plan.receiptId ||
    input.executionReceipt.placement.capacityLeaseReceiptId !== input.lease.receiptId
  ) {
    errors.push('execution receipt does not bind the supplied placement and lease receipts');
  }
  if (input.executionReceipt.placement.outcome !== executionOutcomeForLane(input.plan.lane)) {
    errors.push('execution placement outcome does not match the admitted lane');
  }
  if (input.executionReceipt.execution.actualAccelerator !== input.plan.accelerator) {
    errors.push('execution accelerator does not match the leased accelerator');
  }
  if (
    input.executionReceipt.execution.fallbackAllowed !== input.workUnit.compute.policy.allowFallback
  ) {
    errors.push('execution fallback policy does not match the WorkUnit');
  }
  const routeDeviated =
    input.plan.lane !== primaryLane(input.workUnit) ||
    input.plan.accelerator !== input.workUnit.compute.policy.allowedAccelerators[0];
  if (routeDeviated && !input.executionReceipt.execution.fallbackUsed) {
    errors.push('execution deviated from the requested route without recording fallback');
  }
  const authoredQuality = input.workUnit.compute.quality;
  const observedQuality = input.executionReceipt.quality;
  if (
    observedQuality.metric !== authoredQuality.metric ||
    observedQuality.operator !== authoredQuality.operator ||
    observedQuality.threshold !== authoredQuality.threshold ||
    observedQuality.reference !== authoredQuality.reference
  ) {
    errors.push('execution quality evidence does not match the WorkUnit');
  }
  if (
    input.executionReceipt.cost.measurementState === 'measured' &&
    input.executionReceipt.cost.actualMinorUnits > input.workUnit.compute.budget.maxCostMinorUnits
  ) {
    errors.push('execution cost exceeds the WorkUnit budget');
  }
  if (input.plan.estimatedCost.measurementState === 'measured') {
    if (input.executionReceipt.cost.measurementState !== 'measured') {
      errors.push('execution requires measured cost because placement cost was measured');
    } else if (input.executionReceipt.cost.currency !== input.plan.estimatedCost.currency) {
      errors.push('execution cost currency does not match the placement estimate');
    }
  } else if (
    input.plan.estimatedCost.measurementState === 'not_applicable' &&
    (input.executionReceipt.cost.measurementState !== 'not_measured' ||
      input.executionReceipt.cost.reason !== 'not_applicable')
  ) {
    errors.push('execution cost must remain not_applicable when placement cost was not_applicable');
  }
  if (
    input.workUnit.compute.budget.deadlineMs > 0 &&
    input.executionReceipt.execution.durationMs > input.workUnit.compute.budget.deadlineMs
  ) {
    errors.push('execution exceeded the WorkUnit deadline');
  }
  const completedAt = parseIso(input.executionReceipt.execution.completedAt);
  if (completedAt >= parseIso(input.lease.expiresAt)) {
    errors.push('execution completed at or after the hard lease expiry');
  }
  const verifiedAt = parseIso(input.verifiedAt);
  const attestedAt = parseIso(input.executionAttestation.issuedAt);
  if (!Number.isFinite(verifiedAt)) {
    errors.push('verifiedAt must be an ISO timestamp');
  } else {
    if (verifiedAt < completedAt) errors.push('verifiedAt predates execution completion');
    if (attestedAt < completedAt) errors.push('execution attestation predates completion');
    if (attestedAt > verifiedAt) errors.push('execution attestation is future-dated');
  }
  return { valid: errors.length === 0, errors, verificationScope: 'issuer_authenticated' };
}
