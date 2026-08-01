/** @holoscript/core/world-model — adversarial trajectory curriculum schema */
export type TrajectoryId = string & { readonly __brand: 'TrajectoryId' };
export type SceneHash = string & { readonly __brand: 'SceneHash' };
export type CaelReceiptHash = string & { readonly __brand: 'CaelReceiptHash' };
export type TrustTier = 'replayable' | 'adapter-bound' | 'unsigned';
export type SimulationContractHashMode = 'fnv1a' | 'sha256';
export type ReplayDigestMode =
  | 'strict-same-adapter'
  | 'epsilon-cross-adapter'
  | 'unsigned-observed';
export interface SimulationFieldQuantum {
  readonly fieldPattern: string;
  readonly quantum: number;
  readonly units?: string;
}
export interface SimulationContractReference {
  readonly contractId: string;
  readonly hashMode: SimulationContractHashMode;
  readonly adapterFingerprint: string | null;
  readonly replayDigestMode: ReplayDigestMode;
  readonly fieldQuantization: readonly SimulationFieldQuantum[];
}
export interface ActionStep {
  readonly stepIndex: number;
  readonly timestampMs: number;
  readonly type: string;
  readonly payload: Readonly<Record<string, unknown>>;
}
export interface ObservationStep {
  readonly stepIndex: number;
  readonly timestampMs: number;
  readonly type: string;
  readonly payload: Readonly<Record<string, unknown>>;
}
export interface SemanticPredicateScore {
  readonly violation: number;
  readonly novelty: number;
  readonly learnability: number;
  readonly regression: number;
  readonly invalidity: number;
}
export interface CurriculumPriority {
  readonly priority: number;
  readonly tieBreaker: number;
  readonly rationale: string;
}
export interface ValidityAnchor {
  readonly id: string;
  readonly description: string;
  evaluate(trajectory: AdversarialTrajectory): boolean;
}
export interface ReplayHandle {
  readonly trajectoryId: TrajectoryId;
  readonly sceneHash: SceneHash;
  readonly simulationContractId: string;
  readonly seed: number;
  readonly replayCommand: string;
}
export type TrajectoryStatus = 'open' | 'solved' | 'unresolved' | 'invalid' | 'archived';
export interface AdversarialTrajectory {
  readonly id: TrajectoryId;
  readonly sceneHash: SceneHash;
  readonly seed: number;
  readonly trustTier: TrustTier;
  readonly caelReceiptHash: CaelReceiptHash | null;
  readonly simulationContract: SimulationContractReference;
  readonly actionTrace: readonly ActionStep[];
  readonly observationTrace: readonly ObservationStep[];
  readonly predicateScore: SemanticPredicateScore;
  readonly priority: CurriculumPriority;
  readonly replayHandle: ReplayHandle;
  readonly status: TrajectoryStatus;
  readonly discoveredAtMs: number;
  readonly lastReplayedAtMs: number | null;
}
export interface AdversarialTrajectoryReport {
  readonly generatedAtMs: number;
  readonly sceneHash: SceneHash;
  readonly trajectories: readonly AdversarialTrajectory[];
  readonly counts: {
    readonly open: number;
    readonly solved: number;
    readonly unresolved: number;
    readonly invalid: number;
    readonly archived: number;
  };
  readonly topPriority: readonly TrajectoryId[];
}
export declare function isCurriculumEligible(trajectory: AdversarialTrajectory): boolean;
export declare function hasReplayEvidence(trajectory: AdversarialTrajectory): boolean;
export declare function asTrajectoryId(s: string): TrajectoryId;
export declare function asSceneHash(s: string): SceneHash;
export declare function asCaelReceiptHash(s: string): CaelReceiptHash;
export interface SoftAnchor {
  readonly id: string;
  readonly description: string;
  evaluate(trajectory: AdversarialTrajectory): number;
}
export interface ScorerInputs {
  readonly trajectory: AdversarialTrajectory;
  readonly hardAnchors: readonly ValidityAnchor[];
  readonly softAnchors: readonly SoftAnchor[];
  readonly historyActionTypes: ReadonlySet<string>;
  readonly learnabilityEstimate?: number;
  readonly previousStatus?: AdversarialTrajectory['status'];
}
export interface ScorerOutput {
  readonly predicateScore: SemanticPredicateScore;
  readonly priority: CurriculumPriority;
}
export declare function scoreTrajectory(inputs: ScorerInputs): ScorerOutput;
export declare function buildAdversarialTrajectoryReport(
  trajectories: readonly AdversarialTrajectory[],
  sceneHash: SceneHash,
  generatedAtMs: number,
  topPriorityLimit?: number
): AdversarialTrajectoryReport;
export declare function serializeReport(report: AdversarialTrajectoryReport): string;
export declare function isReportCountsConsistent(report: AdversarialTrajectoryReport): boolean;
// --- Builder result types ---
export interface DeterministicFailureTrajectoryBuild { readonly result: any; readonly trajectory: AdversarialTrajectory; }
export interface HumanoidRockThrowTrajectoryBuild { readonly result: any; readonly trajectory: AdversarialTrajectory; }
export interface TwoAgentHandoffCatchTrajectoryBuild { readonly result: any; readonly trajectory: AdversarialTrajectory; }
// --- Builder functions ---
export function buildDeterministicFailureTrajectory(actions?: readonly any[], options?: any): DeterministicFailureTrajectoryBuild;
export function buildHumanoidRockThrowTrajectory(options?: any): HumanoidRockThrowTrajectoryBuild;
export function buildTwoAgentHandoffCatchTrajectory(options?: any): TwoAgentHandoffCatchTrajectoryBuild;

// --- Portable hardware and compute execution receipts ---
export declare const HARDWARE_RECEIPT_METADATA_SCHEMA_VERSION: 'holoscript.hardware-receipt-metadata.v1';
export type HardwareReceiptSchemaVersion = typeof HARDWARE_RECEIPT_METADATA_SCHEMA_VERSION;
export interface HardwareReceiptTarget {
  readonly id: string;
  readonly kind: string;
  readonly architecture: string;
  readonly artifactKind: string;
}
export interface HardwareReceiptDevice {
  readonly vendor: string;
  readonly model: string;
  readonly accelerator: string | null;
  readonly driverVersions?: Readonly<Record<string, string>>;
  readonly deviceHash?: string;
}
export interface HardwareReceiptRuntime {
  readonly name: string;
  readonly version: string;
  readonly hostOS: string;
  readonly adapterFingerprint?: string;
}
export interface HardwareReceiptConstraint {
  readonly id: string;
  readonly description: string;
  readonly limit: string | number | boolean;
  readonly unit?: string;
  readonly source?: string;
}
export interface HardwareReceiptMeasuredResult {
  readonly metric: string;
  readonly value: number;
  readonly unit: string;
  readonly method: string;
  readonly sampleCount?: number;
  readonly tolerance?: number;
}
export interface HardwareReceiptReplayInput {
  readonly kind: string;
  readonly uri: string;
  readonly sha256: string;
  readonly description?: string;
}
export interface HardwareReceiptProvenance {
  readonly capturedAt: string;
  readonly sourceCompositionHash: string;
  readonly commit?: string;
  readonly commandHash?: string;
  readonly trustReceiptId?: string;
  readonly simulationContractId?: string;
}
export interface HardwareReceiptOwner {
  readonly agent: string;
  readonly team?: string;
  readonly contact?: string;
}
export interface PortableHardwareReceiptMetadata {
  readonly schemaVersion: HardwareReceiptSchemaVersion;
  readonly target: HardwareReceiptTarget;
  readonly device: HardwareReceiptDevice;
  readonly runtime: HardwareReceiptRuntime;
  readonly compilerVersion: string;
  readonly constraints: readonly HardwareReceiptConstraint[];
  readonly measuredResults: readonly HardwareReceiptMeasuredResult[];
  readonly replayInputs: readonly HardwareReceiptReplayInput[];
  readonly provenance: HardwareReceiptProvenance;
  readonly owner: HardwareReceiptOwner;
}
export interface HardwareReceiptMetadataValidation {
  readonly valid: boolean;
  readonly errors: readonly string[];
}
export declare function validatePortableHardwareReceiptMetadata(receipt: unknown): HardwareReceiptMetadataValidation;
export declare function isPortableHardwareReceiptMetadata(receipt: unknown): receipt is PortableHardwareReceiptMetadata;

export declare const COMPUTE_EXECUTION_RECEIPT_SCHEMA_VERSION: 'holoscript.compute-execution-receipt.v1';
export type ComputeExecutionAccelerator = 'cpu' | 'gpu' | 'npu' | 'other';
export type ComputeExecutionTerminalStatus = 'succeeded' | 'failed' | 'cancelled';
export type ComputeExecutionQualityOperator = 'eq' | 'lte' | 'gte';
export type ComputeExecutionQualityReference = 'none' | 'cpu_reference';
export type ComputeExecutionPlacementOutcome = 'local_device' | 'owned_fleet' | 'external_bridge';
export type ComputeExecutionCost =
  | { readonly measurementState: 'measured'; readonly currency: 'USD'; readonly actualMinorUnits: number }
  | { readonly measurementState: 'not_measured'; readonly reason: 'meter_unavailable' | 'not_applicable' };
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
  /** This validates structure/content addressing only, not external provenance. */
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
/** Build a structurally valid, content-addressed receipt. This does not authenticate its references. */
export declare function buildComputeExecutionReceipt(input: BuildComputeExecutionReceiptInput): ComputeExecutionReceipt;
/** Validate structure and canonical receipt ID only. This does not verify WorkUnit, plan, lease, or trust evidence. */
export declare function validateComputeExecutionReceipt(value: unknown): ComputeExecutionReceiptValidation;

export declare const COMPUTE_CAPACITY_SNAPSHOT_SCHEMA_VERSION: 'holoscript.compute-capacity-snapshot.v1';
export declare const COMPUTE_BRIDGE_ADMISSION_SCHEMA_VERSION: 'holoscript.compute-bridge-admission.v1';
export declare const COMPUTE_PLACEMENT_PLAN_SCHEMA_VERSION: 'holoscript.compute-placement-plan.v1';
export declare const COMPUTE_CAPACITY_LEASE_SCHEMA_VERSION: 'holoscript.compute-capacity-lease.v1';
export declare const COMPUTE_SUBJECT_ATTESTATION_SCHEMA_VERSION: 'holoscript.compute-subject-attestation.v1';
export declare const COMPUTE_CAPACITY_LEASE_MAX_TTL_MS: number;
export declare const COMPUTE_EVIDENCE_MAX_FUTURE_SKEW_MS: number;
export declare const COMPUTE_CAPACITY_SNAPSHOT_MAX_TTL_MS: number;
export declare const COMPUTE_BRIDGE_ADMISSION_MAX_TTL_MS: number;
export type ComputeEvidenceRole =
  | 'capacity_observer'
  | 'bridge_admitter'
  | 'placement_planner'
  | 'lease_issuer'
  | 'execution_attestor';
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
  | { readonly measurementState: 'measured'; readonly currency: 'USD'; readonly estimatedMinorUnits: number }
  | { readonly measurementState: 'not_measured'; readonly reason: 'meter_unavailable' }
  | { readonly measurementState: 'not_applicable' };
export interface ComputeEvidenceSigner {
  readonly issuer: string;
  readonly keyId: string;
  readonly sign: (message: Uint8Array) => string;
}
export interface ComputeEvidenceTrustAnchor {
  readonly issuer: string;
  readonly keyId: string;
  readonly algorithm: 'ed25519';
  readonly roles: readonly ComputeEvidenceRole[];
  readonly principalDigests: readonly string[];
  readonly lanes: readonly ComputeCapacityLane[];
  readonly capacityRefs: readonly string[];
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
export interface ComputeCapacitySnapshot {
  readonly schemaVersion: typeof COMPUTE_CAPACITY_SNAPSHOT_SCHEMA_VERSION;
  readonly verificationScope: 'issuer_attested';
  readonly receiptId: string;
  readonly lane: ComputeCapacityLane;
  readonly capacityRef: string;
  readonly accelerator: import('../compiler/index.js').ComputeAccelerator;
  readonly health: ComputeCapacityHealth;
  readonly availableSlots: number;
  readonly allowedDataClassifications: readonly import('../compiler/index.js').ComputeDataClassification[];
  readonly observedAt: string;
  readonly validUntil: string;
  readonly estimatedCost: ComputeCapacityCostEstimate;
  readonly attestation: ComputeIssuerAttestation;
}
export interface BuildComputeCapacitySnapshotInput {
  readonly lane: ComputeCapacityLane;
  readonly capacityRef: string;
  readonly accelerator: import('../compiler/index.js').ComputeAccelerator;
  readonly health: ComputeCapacityHealth;
  readonly availableSlots: number;
  readonly allowedDataClassifications: readonly import('../compiler/index.js').ComputeDataClassification[];
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
  readonly dataClassification: import('../compiler/index.js').ComputeDataClassification;
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
  readonly dataClassification: import('../compiler/index.js').ComputeDataClassification;
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
  readonly accelerator: import('../compiler/index.js').ComputeAccelerator;
  readonly estimatedCost: ComputeCapacityCostEstimate;
  readonly verdict: ComputePlacementVerdict;
  readonly reasonCodes: readonly ComputePlacementReason[];
  readonly checkedAt: string;
  readonly validUntil: string;
  readonly attestation: ComputeIssuerAttestation;
}
export interface PlanComputePlacementInput {
  readonly principalDigest: string;
  readonly workUnit: import('../compiler/index.js').ComputeWorkUnitContract;
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
  readonly accelerator: import('../compiler/index.js').ComputeAccelerator;
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
  readonly workUnit: import('../compiler/index.js').ComputeWorkUnitContract;
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
  readonly workUnit: import('../compiler/index.js').ComputeWorkUnitContract;
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
export declare function computeCapacityAllocationEtag(
  cursor: Omit<ComputeCapacityAllocationCursor, 'etag'>
): string;
export declare function validateComputeCapacityAllocationCursor(value: unknown): ComputeEvidenceValidation;
export declare function buildComputeCapacitySnapshot(input: BuildComputeCapacitySnapshotInput): ComputeCapacitySnapshot;
export declare function validateComputeCapacitySnapshot(value: unknown): ComputeEvidenceValidation;
export declare function buildComputeBridgeAdmission(input: BuildComputeBridgeAdmissionInput): ComputeBridgeAdmission;
export declare function validateComputeBridgeAdmission(value: unknown): ComputeEvidenceValidation;
export declare function planComputePlacement(input: PlanComputePlacementInput): ComputePlacementPlan;
export declare function validateComputePlacementPlan(value: unknown): ComputeEvidenceValidation;
export declare function verifyComputePlacementPlan(input: VerifyComputePlacementPlanInput): ComputeEvidenceValidation;
export declare function prepareComputeCapacityLease(input: PrepareComputeCapacityLeaseInput): PreparedComputeCapacityLease;
export declare function validateComputeCapacityLease(value: unknown): ComputeEvidenceValidation;
export declare function verifyComputeCapacityLeaseReceipt(input: VerifyComputeCapacityLeaseReceiptInput): ComputeEvidenceValidation;
export declare function authorizeComputeCapacityLeaseUse(input: AuthorizeComputeCapacityLeaseUseInput): ComputeEvidenceValidation;
export declare function attestComputeExecutionReceipt(input: AttestComputeExecutionReceiptInput): ComputeSubjectAttestation;
export declare function validateComputeSubjectAttestation(value: unknown): ComputeEvidenceValidation;
export declare function verifyComputeExecutionEvidence(input: VerifyComputeExecutionEvidenceInput): ComputeExecutionEvidenceVerification;

export declare const COMPUTE_UTILITY_OBSERVATION_SCHEMA_VERSION: 'holoscript.compute-utility-observation.v1';
export declare const COMPUTE_UTILITY_AGGREGATE_SCHEMA_VERSION: 'holoscript.compute-utility-aggregate.v1';
export declare const COMPUTE_UTILITY_MINIMUM_AGGREGATE: 10;
export type ComputeUtilityNotMeasuredReason =
  | 'analytics_unset'
  | 'analytics_disabled'
  | 'consent_unset'
  | 'consent_denied';
export type ComputeUtilityFallbackBucket =
  | 'not_allowed'
  | 'allowed_not_used'
  | 'used_cpu'
  | 'used_gpu'
  | 'used_npu'
  | 'used_other';
export type ComputeUtilityQualityBucket = 'passed' | 'failed';
export type ComputeUtilityLatencyBucket =
  | 'lt_100ms'
  | '100ms_to_lt_1s'
  | '1s_to_lt_10s'
  | '10s_to_lt_60s'
  | '60s_plus';
export type ComputeUtilityCostBucket =
  | 'not_measured'
  | 'zero'
  | 'minor_1_10'
  | 'minor_11_100'
  | 'minor_101_1000'
  | 'minor_1001_plus';
export interface ComputeUtilityBuckets {
  readonly requestedAccelerator: import('../compiler/index.js').ComputeAccelerator;
  readonly placementOutcome: ComputeExecutionPlacementOutcome;
  readonly fallback: ComputeUtilityFallbackBucket;
  readonly terminalStatus: ComputeExecutionTerminalStatus;
  readonly quality: ComputeUtilityQualityBucket;
  readonly latency: ComputeUtilityLatencyBucket;
  readonly cost: ComputeUtilityCostBucket;
}
export interface ComputeUtilityObservation {
  readonly schemaVersion: typeof COMPUTE_UTILITY_OBSERVATION_SCHEMA_VERSION;
  readonly privacyClass: 'local_private';
  readonly evidenceScope: 'structural_only';
  readonly observationId: string;
  readonly workUnitDigest: string;
  readonly executionReceiptId: string;
  readonly buckets: ComputeUtilityBuckets;
}
export interface BuildComputeUtilityObservationInput {
  readonly analyticsEnabled?: boolean;
  readonly consentGranted?: boolean;
  readonly workUnit: import('../compiler/index.js').ComputeWorkUnitContract;
  readonly executionReceipt: ComputeExecutionReceipt;
}
export type ComputeUtilityMeasurementResult =
  | { readonly measurementState: 'not_measured'; readonly reason: ComputeUtilityNotMeasuredReason }
  | { readonly measurementState: 'measured'; readonly observation: ComputeUtilityObservation };
export interface ComputeUtilityAggregateBucket extends ComputeUtilityBuckets {
  readonly count: number;
}
export interface ComputeUtilityAggregate {
  readonly schemaVersion: typeof COMPUTE_UTILITY_AGGREGATE_SCHEMA_VERSION;
  readonly privacyClass: 'aggregate_only';
  readonly evidenceScope: 'structural_only';
  readonly aggregateId: string;
  readonly minimumBucketCount: typeof COMPUTE_UTILITY_MINIMUM_AGGREGATE;
  readonly buckets: readonly ComputeUtilityAggregateBucket[];
}
export type ComputeUtilityAggregateResult =
  | { readonly measurementState: 'not_measured'; readonly reason: 'no_observations' }
  | { readonly measurementState: 'measured_suppressed'; readonly reason: 'minimum_aggregate_not_met' }
  | { readonly measurementState: 'measured'; readonly aggregate: ComputeUtilityAggregate };
export interface ComputeUtilityValidation {
  readonly valid: boolean;
  readonly errors: readonly string[];
}
export declare function buildComputeUtilityObservation(input: BuildComputeUtilityObservationInput): ComputeUtilityMeasurementResult;
export declare function validateComputeUtilityObservation(value: unknown): ComputeUtilityValidation;
export declare function aggregateComputeUtilityObservations(observations: readonly ComputeUtilityObservation[]): ComputeUtilityAggregateResult;
export declare function validateComputeUtilityAggregate(value: unknown): ComputeUtilityValidation;

// --- N4 exact-plus-learned residual world loop ---
export type N4ResidualTarget = 'object.drag' | 'event.gust' | 'event.contact';
export type N4Arm =
  | 'exact-only'
  | 'learned-only-object'
  | 'exact-plus-untyped-residual'
  | 'exact-plus-typed-residual'
  | 'exact-plus-typed-residual-uncertainty';
export interface N4Vec2 { readonly x: number; readonly y: number; }
export interface N4Object2D {
  readonly id: string;
  readonly kind: 'orb' | 'crate';
  readonly position: N4Vec2;
  readonly velocity: N4Vec2;
  readonly massKg: number;
  readonly dragPerSecond: number;
  readonly latentContactScale: number;
}
export type N4WorldEvent =
  | { readonly type: 'gust'; readonly impulse: N4Vec2 }
  | { readonly type: 'contact'; readonly objectIds: readonly string[] };
export interface N4WorldScene {
  readonly seed: number;
  readonly split: 'train' | 'ood' | 'planning';
  readonly step: number;
  readonly objects: readonly N4Object2D[];
  readonly events: readonly N4WorldEvent[];
}
export interface N4SourceContract {
  readonly sourceDigest: string;
  readonly ir: { readonly provenance: { readonly deterministicDigest: string; readonly sourceSurface?: string } };
  readonly learningGraph: { readonly deterministicDigest: string; readonly nodes: readonly { readonly nodeType: string }[] };
  readonly residualTargets: readonly N4ResidualTarget[];
  readonly actionVocabulary: readonly ['move'];
  readonly deterministicDigest: string;
}
export interface N4LinearModel {
  readonly featureNames: readonly string[];
  readonly outputNames: readonly string[];
  readonly weights: readonly number[];
  readonly shape: readonly [number, number];
  readonly deterministicDigest: string;
}
export interface N4ModelSet {
  readonly learnedOnly: N4LinearModel;
  readonly untypedResidual: N4LinearModel;
  readonly typedResidual: N4LinearModel;
  readonly typedEnsemble: readonly N4LinearModel[];
  readonly uncertaintyScale: number;
  readonly deterministicDigest: string;
}
export interface N4TypedMoveAction {
  readonly type: 'move';
  readonly entityId: string;
  readonly position: N4Vec2;
  readonly confidence: number;
  readonly residualScope: readonly N4ResidualTarget[];
  readonly sourceDigest: string;
  readonly graphDigest: string;
  readonly modelDigest: string;
  readonly deterministicDigest: string;
}
export interface N4WeightsManifest {
  readonly sourceDigest: string;
  readonly irDigest: string;
  readonly graphDigest: string;
  readonly modelDigest: string;
  readonly featureSchemaDigest: string;
  readonly featureNames: readonly string[];
  readonly outputNames: readonly string[];
  readonly weightTensor: readonly number[];
  readonly weightShape: readonly [number, number];
  readonly typeTensor: readonly number[];
  readonly typeShape: readonly [number, number];
  readonly tensorChecksum: string;
  readonly deterministicDigest: string;
}
export interface N4GeneratedArtifacts {
  readonly contract: N4SourceContract;
  readonly models: N4ModelSet;
  readonly weightsManifest: N4WeightsManifest;
  readonly deterministicDigest: string;
}
export interface N4RuntimeInference {
  readonly runtime: 'cpu' | 'wasm' | 'webgpu';
  readonly output: readonly number[];
  readonly sourceDigest: string;
  readonly graphDigest: string;
  readonly modelDigest: string;
  readonly weightsManifestDigest: string;
  readonly deterministicDigest: string;
}
export interface N4RuntimeParityVerdict {
  readonly valid: boolean;
  readonly maxAbsoluteError: number;
  readonly tolerance: number;
  readonly reason: string;
}
export declare const N4_METRIC_CONTRACT_SHA256: string;
export declare const N4_RESIDUAL_TARGETS: readonly N4ResidualTarget[];
export declare function compileN4ResidualWorldSource(source: string): N4SourceContract;
export declare function generateN4Scene(seed: number, split: N4WorldScene['split']): N4WorldScene;
export declare function trainN4Models(trainScenes: readonly N4WorldScene[]): N4ModelSet;
export declare function generateN4Artifacts(source: string): N4GeneratedArtifacts;
export declare function projectN4TypedFeatures(scene: N4WorldScene, object: N4Object2D): readonly number[];
export declare function proposeN4TypedMove(
  contract: N4SourceContract,
  models: N4ModelSet,
  scene: N4WorldScene,
  entityId: string,
  action: N4Vec2
): N4TypedMoveAction;
export declare function verifyN4TypedMove(action: N4TypedMoveAction): boolean;
export declare function inferN4Cpu(manifest: N4WeightsManifest, features: readonly number[]): N4RuntimeInference;
export declare function inferN4Wasm(manifest: N4WeightsManifest, features: readonly number[]): Promise<N4RuntimeInference>;
export declare function inferN4WebGPU(device: GPUDevice, manifest: N4WeightsManifest, features: readonly number[]): Promise<N4RuntimeInference>;
export declare function verifyN4RuntimeParity(
  reference: N4RuntimeInference,
  candidate: N4RuntimeInference
): N4RuntimeParityVerdict;
