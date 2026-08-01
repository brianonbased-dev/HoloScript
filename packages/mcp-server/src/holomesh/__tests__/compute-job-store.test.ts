import { createHash, generateKeyPairSync, sign } from 'crypto';
import { afterEach, describe, expect, it } from 'vitest';
import {
  COMPUTE_WORK_UNIT_COMPILER_VERSION,
  buildComputeWorkUnit,
  computeWorkUnitDigest,
  type ComputeWorkUnitContract,
} from '@holoscript/core/compiler';
import {
  buildComputeCapacitySnapshot,
  computeCapacityAllocationEtag,
  planComputePlacement,
  prepareComputeCapacityLease,
  prepareComputeJob,
  prepareComputeJobTransition,
  type ComputeCapacityAllocationCursor,
  type ComputeCapacityLease,
  type ComputeCapacitySnapshot,
  type ComputeEvidenceRole,
  type ComputeEvidenceSigner,
  type ComputeEvidenceTrustAnchor,
  type ComputeJobReceipt,
  type ComputePlacementPlan,
  type PreparedComputeJobTransition,
} from '@holoscript/core/world-model';
import {
  buildComputeJobOutboxEnvelope,
  buildComputeJobPublicResponseBytes,
  COMPUTE_JOB_STORE_CATALOG_DIGEST,
  ComputeJobStoreAdmissionError,
  ComputeJobStoreConflictError,
  ComputeJobStoreReadbackError,
  ComputeJobStoreUnavailableError,
  PostgresComputeJobStore,
  type CommitComputeJobTransitionCommand,
  type CreateComputeJobCommand,
  type ComputeJobStoreClient,
  type ComputeJobStorePool,
  type CreateComputeJobStoreOptions,
  type RegisterComputeCapacityCommand,
} from '../compute-job-store';
import {
  COMPUTE_JOB_ADMISSION_TRUST_ANCHOR_SCHEMA_VERSION,
  createComputeJobAdmissionEnvelope,
  prepareAndSignComputeJobAdmission,
  type ComputeJobAdmissionEnvelope,
  type ComputeJobAdmissionLifecycleBinding,
  type ComputeJobAdmissionOperation,
  type ComputeJobAdmissionSigner,
  type ComputeJobAdmissionTrustAnchor,
} from '../compute-job-admission';

type JsonObject = Record<string, unknown>;

function canonicalize(value: unknown): unknown {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') return value;
  if (Array.isArray(value)) return value.map(canonicalize);
  const result: JsonObject = {};
  for (const key of Object.keys(value as JsonObject).sort()) {
    const entry = (value as JsonObject)[key];
    if (entry !== undefined) result[key] = canonicalize(entry);
  }
  return result;
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function digest(value: string): string {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

const TEAM_ID = 'team-compute-test';
const PRINCIPAL = digest('principal');
const JOB_ID = digest('job');
const CAPACITY = digest('capacity');
const FIXTURE_ORIGIN_MS = Math.ceil(Date.now() / 1000) * 1000 + 30_000;
const at = (offsetMs: number): string => new Date(FIXTURE_ORIGIN_MS + offsetMs).toISOString();
const OBSERVED_AT = at(0);
const CHECKED_AT = at(1_000);
const PREFLIGHTED_AT = at(2_000);
const QUEUED_AT = at(3_000);
const LEASE_ISSUED_AT = at(4_000);
const STARTING_AT = at(6_000);
const SNAPSHOT_VALID_UNTIL = at(60_000);
const LEASE_EXPIRES_AT = at(5 * 60_000);
const ELIGIBILITY_VALID_UNTIL = at(60 * 60_000);
const REGISTERED_AT = at(500);
const ADMISSION_VERIFIED_AT = at(5_000);
const ADMISSION_VALID_UNTIL = at(4 * 60_000);
const STORE_VERIFICATION_AT = at(10_000);
const ADMISSION_TRUST_POLICY_DIGEST = digest('compute-job-store-trust-policy-v1');
const ALL_ROLES: readonly ComputeEvidenceRole[] = [
  'capacity_observer',
  'bridge_admitter',
  'placement_planner',
  'lease_issuer',
  'execution_attestor',
];

function evidenceAuthority(): {
  signer: ComputeEvidenceSigner;
  anchor: ComputeEvidenceTrustAnchor;
} {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  return {
    signer: {
      issuer: 'urn:holoscript:test:compute-job-store',
      keyId: 'compute-job-store-key-1',
      sign: (message) => sign(null, Buffer.from(message), privateKey).toString('base64'),
    },
    anchor: {
      issuer: 'urn:holoscript:test:compute-job-store',
      keyId: 'compute-job-store-key-1',
      algorithm: 'ed25519',
      roles: ALL_ROLES,
      principalDigests: [PRINCIPAL],
      lanes: ['owned_fleet'],
      capacityRefs: [CAPACITY],
      validFrom: at(-24 * 60 * 60_000),
      validUntil: at(24 * 60 * 60_000),
      publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
    },
  };
}

const authority = evidenceAuthority();
const TRUST_ANCHORS = [authority.anchor] as const;

const admissionKeyPair = generateKeyPairSync('ed25519');
const ADMISSION_SIGNER: ComputeJobAdmissionSigner = {
  issuer: 'urn:holoscript:test:compute-job-admission',
  keyId: 'compute-job-admission-key-1',
  privateKey: admissionKeyPair.privateKey,
};
const ADMISSION_TRUST_ANCHOR: ComputeJobAdmissionTrustAnchor = {
  schemaVersion: COMPUTE_JOB_ADMISSION_TRUST_ANCHOR_SCHEMA_VERSION,
  issuer: ADMISSION_SIGNER.issuer,
  keyId: ADMISSION_SIGNER.keyId,
  algorithm: 'Ed25519',
  publicKey: admissionKeyPair.publicKey,
  allowedTeamIds: [TEAM_ID],
  allowedPrincipalDigests: [PRINCIPAL],
  allowedTrustPolicyDigests: [ADMISSION_TRUST_POLICY_DIGEST],
  validFrom: at(-24 * 60 * 60_000),
  validUntil: at(24 * 60 * 60_000),
};

function storeOptions(
  overrides: Partial<CreateComputeJobStoreOptions> = {}
): CreateComputeJobStoreOptions {
  return {
    admissionTrustAnchors: [ADMISSION_TRUST_ANCHOR],
    admissionTrustPolicyDigest: ADMISSION_TRUST_POLICY_DIGEST,
    now: () => STORE_VERIFICATION_AT,
    ...overrides,
  };
}

function workUnit(dataClassification: 'internal' | 'confidential' = 'internal') {
  return buildComputeWorkUnit(
    {
      intent: 'Run a bounded GPU fleet workload.',
      allowed_accelerators: ['gpu'],
      placement_policy: 'owned_fleet',
      data_classification: dataClassification,
      quality_metric: 'max_abs_error',
      quality_operator: 'lte',
      quality_threshold: 1e-5,
      quality_reference: 'cpu_reference',
      deadline_ms: 10 * 60_000,
      budget_currency: 'USD',
      max_cost_minor_units: 0,
      allow_fallback: false,
    },
    {
      objectName: 'compute-job-store-test',
      sourceDigest: 'a'.repeat(64),
      sourceDigestKind: 'source_utf8',
      compiler: 'ComputeWorkUnitCompiler',
      compilerVersion: COMPUTE_WORK_UNIT_COMPILER_VERSION,
    }
  );
}

function availableAllocation(): ComputeCapacityAllocationCursor {
  const body = {
    capacityRef: CAPACITY,
    slotState: 'available' as const,
    currentEpoch: 0,
    version: 0,
  };
  return { ...body, etag: computeCapacityAllocationEtag(body) };
}

interface LifecycleFixture {
  readonly unit: ComputeWorkUnitContract;
  readonly snapshot: ComputeCapacitySnapshot;
  readonly plan: ComputePlacementPlan;
  readonly preflighted: ComputeJobReceipt;
  readonly queued: PreparedComputeJobTransition;
  readonly acquired: PreparedComputeJobTransition;
  readonly lease: ComputeCapacityLease;
  readonly expectedAllocation: ComputeCapacityAllocationCursor;
  readonly nextAllocation: ComputeCapacityAllocationCursor;
}

function lifecycleFixture(
  variant = 'alpha',
  attempt = 1,
  createIdempotencyKey = 'create-job-1',
  queueIdempotencyKey = 'queue-job-1'
): LifecycleFixture {
  const unit = workUnit();
  const snapshot = buildComputeCapacitySnapshot({
    lane: 'owned_fleet',
    capacityRef: CAPACITY,
    accelerator: 'gpu',
    health: 'ready',
    availableSlots: 1,
    allowedDataClassifications: ['internal'],
    observedAt: OBSERVED_AT,
    validUntil: SNAPSHOT_VALID_UNTIL,
    estimatedCost: { measurementState: 'not_applicable' },
    signer: authority.signer,
  });
  const plan = planComputePlacement({
    principalDigest: PRINCIPAL,
    workUnit: unit,
    capacitySnapshot: snapshot,
    checkedAt: CHECKED_AT,
    trustAnchors: TRUST_ANCHORS,
    signer: authority.signer,
  });
  const preflighted = prepareComputeJob({
    principalDigest: PRINCIPAL,
    jobId: JOB_ID,
    attempt,
    workUnit: unit,
    placementVerification: {
      principalDigest: PRINCIPAL,
      workUnit: unit,
      capacitySnapshot: snapshot,
      plan,
      checkedAt: plan.checkedAt,
      verifiedAt: PREFLIGHTED_AT,
      trustAnchors: TRUST_ANCHORS,
    },
    preparedAt: PREFLIGHTED_AT,
    idempotencyKey: createIdempotencyKey,
  }).job;
  const queued = prepareComputeJobTransition({
    expectedJob: preflighted,
    action: 'queue',
    placementVerification: {
      principalDigest: PRINCIPAL,
      workUnit: unit,
      capacitySnapshot: snapshot,
      plan,
      checkedAt: plan.checkedAt,
      verifiedAt: QUEUED_AT,
      trustAnchors: TRUST_ANCHORS,
    },
    transitionedAt: QUEUED_AT,
    idempotencyKey: queueIdempotencyKey,
  });
  const preparedLease = prepareComputeCapacityLease({
    principalDigest: PRINCIPAL,
    jobId: JOB_ID,
    attempt,
    holderDigest: digest(`holder:${variant}`),
    workUnit: unit,
    capacitySnapshot: snapshot,
    plan,
    issuedAt: LEASE_ISSUED_AT,
    expiresAt: LEASE_EXPIRES_AT,
    fencingToken: `fencing-token-${variant}-${'x'.repeat(48)}`,
    allocationCursor: availableAllocation(),
    trustAnchors: TRUST_ANCHORS,
    signer: authority.signer,
  });
  const acquired = prepareComputeJobTransition({
    expectedJob: queued.nextJob,
    action: 'acquire_lease',
    preparedLease,
    leaseVerification: {
      principalDigest: PRINCIPAL,
      jobId: JOB_ID,
      attempt,
      holderDigest: digest(`holder:${variant}`),
      workUnit: unit,
      capacitySnapshot: snapshot,
      plan,
      lease: preparedLease.lease,
      at: LEASE_ISSUED_AT,
      trustAnchors: TRUST_ANCHORS,
    },
    transitionedAt: LEASE_ISSUED_AT,
    idempotencyKey: `acquire-job-${variant}`,
  });
  return {
    unit,
    snapshot,
    plan,
    preflighted,
    queued,
    acquired,
    lease: preparedLease.lease,
    expectedAllocation: preparedLease.expectedAllocation,
    nextAllocation: preparedLease.nextAllocation,
  };
}

function eligibilityBinding(instanceId = 42) {
  return {
    schemaVersion: 'holoscript.compute-fleet-resource-eligibility.v1' as const,
    capacityRef: CAPACITY,
    provider: 'vast.ai',
    instanceId,
    eligible: true as const,
    validUntil: ELIGIBILITY_VALID_UNTIL,
  };
}

function dataPolicyBinding() {
  return {
    schemaVersion: 'holoscript.compute-fleet-data-policy.v1' as const,
    capacityRef: CAPACITY,
    allowedDataClassifications: ['internal'],
    validUntil: ELIGIBILITY_VALID_UNTIL,
  };
}

function evidenceEnvelope(value: { readonly receiptId: string; readonly schemaVersion: string }) {
  return {
    receiptId: value.receiptId,
    schemaVersion: value.schemaVersion,
    bytes: canonicalJson(value),
  };
}

function workUnitEnvelope(unit: ComputeWorkUnitContract) {
  return {
    digest: computeWorkUnitDigest(unit),
    contract: unit,
    bytes: canonicalJson(unit),
  };
}

function admissionEnvelope(input: {
  readonly operation: ComputeJobAdmissionOperation;
  readonly requestDigest: string;
  readonly attempt?: number;
  readonly unit: ComputeWorkUnitContract;
  readonly evidence: readonly ReturnType<typeof evidenceEnvelope>[];
  readonly lifecycle: ComputeJobAdmissionLifecycleBinding;
  readonly verifiedAt?: string;
  readonly validUntil?: string;
  readonly signer?: ComputeJobAdmissionSigner;
  readonly trustPolicyDigest?: string;
}): ComputeJobAdmissionEnvelope {
  const signer = input.signer ?? ADMISSION_SIGNER;
  return createComputeJobAdmissionEnvelope(
    prepareAndSignComputeJobAdmission(
      {
        teamId: TEAM_ID,
        principalDigest: PRINCIPAL,
        jobId: JOB_ID,
        attempt: input.attempt ?? 1,
        operation: input.operation,
        requestDigest: input.requestDigest,
        workUnit: input.unit,
        evidence: input.evidence,
        trustPolicyDigest: input.trustPolicyDigest ?? ADMISSION_TRUST_POLICY_DIGEST,
        lifecycle: input.lifecycle,
        verifiedAt: input.verifiedAt ?? ADMISSION_VERIFIED_AT,
        validUntil: input.validUntil ?? ADMISSION_VALID_UNTIL,
        issuer: signer.issuer,
        keyId: signer.keyId,
      },
      signer
    )
  );
}

function projection(receiptValue: ComputeJobReceipt) {
  return { teamId: TEAM_ID, receipt: receiptValue, bytes: canonicalJson(receiptValue) };
}

function transitionCommand(
  prepared: PreparedComputeJobTransition,
  evidence: readonly { readonly receiptId: string; readonly schemaVersion: string }[],
  unit: ComputeWorkUnitContract
): Omit<CommitComputeJobTransitionCommand, 'operation' | 'idempotencyKeyDigest' | 'requestDigest'> {
  const durableEvidence = evidence.map(evidenceEnvelope);
  const operation = `compute_job.${prepared.transition.action}` as ComputeJobAdmissionOperation;
  const artifacts = {
    job: prepared.nextJob,
    transition: prepared.transition,
    ...(prepared.allocatorCommit ? { allocationCommit: prepared.allocatorCommit } : {}),
  };
  return {
    expectedJob: projection(prepared.expectedJob),
    nextJob: projection(prepared.nextJob),
    expectedWorkUnit: workUnitEnvelope(unit),
    evidence: durableEvidence,
    admission: admissionEnvelope({
      operation,
      requestDigest: prepared.transition.request.requestHash,
      attempt: prepared.expectedJob.attempt,
      unit,
      evidence: durableEvidence,
      lifecycle: {
        kind: 'transition',
        expectedJobReceiptId: prepared.expectedJob.receiptId,
        nextJobReceiptId: prepared.nextJob.receiptId,
        transitionReceiptId: prepared.transition.receiptId,
      },
    }),
    transition: { receipt: prepared.transition, bytes: canonicalJson(prepared.transition) },
    ...(prepared.allocatorCommit
      ? {
          allocationCommit: {
            receipt: prepared.allocatorCommit,
            bytes: canonicalJson(prepared.allocatorCommit),
          },
        }
      : {}),
    outbox: [buildComputeJobOutboxEnvelope(artifacts)],
    publicResponseBytes: buildComputeJobPublicResponseBytes(artifacts),
  };
}

function makeJobOnlyCommand(
  _requestLabel = 'queue-request',
  attempt = 1
): CommitComputeJobTransitionCommand {
  const fixture = lifecycleFixture('alpha', attempt);
  const prepared = fixture.queued;
  return {
    operation: 'compute_job.queue',
    idempotencyKeyDigest: prepared.transition.request.idempotencyKeyHash,
    requestDigest: prepared.transition.request.requestHash,
    ...transitionCommand(prepared, [fixture.snapshot, fixture.plan], fixture.unit),
  };
}

function makeAllocationCommand(variant = 'alpha'): CommitComputeJobTransitionCommand {
  const fixture = lifecycleFixture(variant);
  const prepared = fixture.acquired;
  const eligibility = eligibilityBinding();
  const dataPolicy = dataPolicyBinding();
  return {
    operation: 'compute_job.acquire_lease',
    idempotencyKeyDigest: prepared.transition.request.idempotencyKeyHash,
    requestDigest: prepared.transition.request.requestHash,
    ...transitionCommand(prepared, [fixture.snapshot, fixture.plan, fixture.lease], fixture.unit),
    expectedAllocation: {
      teamId: TEAM_ID,
      lane: 'owned_fleet',
      cursor: fixture.expectedAllocation,
      bytes: canonicalJson(fixture.expectedAllocation),
    },
    nextAllocation: {
      teamId: TEAM_ID,
      lane: 'owned_fleet',
      cursor: fixture.nextAllocation,
      bytes: canonicalJson(fixture.nextAllocation),
    },
    expectedCapacityEligibilityBytes: canonicalJson(eligibility),
    expectedCapacityDataPolicyBytes: canonicalJson(dataPolicy),
  };
}

function makeStartCommand(variant = 'alpha'): CommitComputeJobTransitionCommand {
  const fixture = lifecycleFixture(variant);
  const prepared = prepareComputeJobTransition({
    expectedJob: fixture.acquired.nextJob,
    action: 'start',
    leaseAuthorization: {
      principalDigest: PRINCIPAL,
      jobId: JOB_ID,
      attempt: fixture.acquired.nextJob.attempt,
      holderDigest: digest(`holder:${variant}`),
      workUnit: fixture.unit,
      capacitySnapshot: fixture.snapshot,
      plan: fixture.plan,
      lease: fixture.lease,
      at: STARTING_AT,
      trustAnchors: TRUST_ANCHORS,
      presentedFencingToken: `fencing-token-${variant}-${'x'.repeat(48)}`,
      allocationCursor: fixture.nextAllocation,
    },
    transitionedAt: STARTING_AT,
    idempotencyKey: `start-job-${variant}`,
  });
  return {
    operation: 'compute_job.start',
    idempotencyKeyDigest: prepared.transition.request.idempotencyKeyHash,
    requestDigest: prepared.transition.request.requestHash,
    ...transitionCommand(prepared, [fixture.lease], fixture.unit),
  };
}

function makeCapacityRegistration(instanceId = 42): RegisterComputeCapacityCommand {
  const transition = makeAllocationCommand();
  const eligibility = eligibilityBinding(instanceId);
  const dataPolicy = dataPolicyBinding();
  return {
    projection: transition.expectedAllocation as NonNullable<
      CommitComputeJobTransitionCommand['expectedAllocation']
    >,
    eligibility,
    eligibilityBytes: canonicalJson(eligibility),
    dataPolicy,
    dataPolicyBytes: canonicalJson(dataPolicy),
    registeredAt: REGISTERED_AT,
  };
}

function makeCreateJobCommand(
  createIdempotencyKey = 'create-job-1',
  admissionVerifiedAt = ADMISSION_VERIFIED_AT
): CreateComputeJobCommand {
  const fixture = lifecycleFixture('alpha', 1, createIdempotencyKey);
  const job = fixture.preflighted;
  const artifacts = { job };
  const evidence = [fixture.snapshot, fixture.plan].map(evidenceEnvelope);
  return {
    operation: 'compute_job.create',
    idempotencyKeyDigest: job.request.idempotencyKeyHash,
    semanticRequestDigest: digest(
      canonicalJson({
        teamId: TEAM_ID,
        principalDigest: job.principalDigest,
        jobId: job.jobId,
        attempt: job.attempt,
        workUnitDigest: job.workUnit.digest,
      })
    ),
    requestDigest: job.request.requestHash,
    job: projection(job),
    workUnit: workUnitEnvelope(fixture.unit),
    evidence,
    admission: admissionEnvelope({
      operation: 'compute_job.create',
      requestDigest: job.request.requestHash,
      unit: fixture.unit,
      evidence,
      lifecycle: { kind: 'create', createdJobReceiptId: job.receiptId },
      verifiedAt: admissionVerifiedAt,
    }),
    outbox: [buildComputeJobOutboxEnvelope(artifacts)],
    publicResponseBytes: buildComputeJobPublicResponseBytes(artifacts),
  };
}

function makeZeroEvidenceCancelCommand(): CommitComputeJobTransitionCommand {
  const fixture = lifecycleFixture();
  const prepared = prepareComputeJobTransition({
    expectedJob: fixture.preflighted,
    action: 'cancel',
    reasonCode: 'user_cancelled',
    transitionedAt: QUEUED_AT,
    idempotencyKey: 'cancel-job-1',
  });
  return {
    operation: 'compute_job.cancel',
    idempotencyKeyDigest: prepared.transition.request.idempotencyKeyHash,
    requestDigest: prepared.transition.request.requestHash,
    ...transitionCommand(prepared, [], fixture.unit),
  };
}

interface FakeIdempotencyRow {
  request_digest: string;
  status: 'pending' | 'committed';
  transition_receipt_id: string | null;
  allocation_commit_receipt_id: string | null;
  admission_receipt_id: string | null;
  public_response_bytes: string | null;
}

interface FakeJobCreationIdempotencyRow {
  request_digest: string;
  status: 'pending' | 'committed';
  job_receipt_id: string | null;
  admission_receipt_id: string | null;
  created_job_bytes: string | null;
  public_response_bytes: string | null;
}

interface FakeJobCommandPreparationRow {
  team_id: string;
  principal_digest: string;
  operation: string;
  key_digest: string;
  semantic_request_digest: string;
  work_unit_digest: string;
  command_bytes: string;
}

interface FakeJobRow {
  principal_digest: string;
  work_unit_digest: string;
  state: string;
  version: string;
  receipt_id: string;
  job_bytes: string;
  capacity_ref: string | null;
  lease_receipt_id: string | null;
  fencing_epoch: string | null;
}

interface FakeAllocationRow {
  lane: string;
  slot_state: string;
  current_epoch: string;
  current_lease_receipt_id: string | null;
  version: string;
  etag: string;
  cursor_bytes: string;
}

interface FakeCapacityBindingRow {
  provider: string;
  provider_resource_id: string;
  eligible: boolean;
  valid_until: string;
  data_policy_valid_until: string;
  allowed_data_classifications: string[];
  eligibility_bytes: string;
  data_policy_bytes: string;
}

interface FakeCapacityRegistrationJournalRow {
  lane: string;
  initial_etag: string;
  cursor_bytes: string;
  eligibility_bytes: string;
  data_policy_bytes: string;
  registered_at: string;
}

interface FakeEvidenceRow {
  schema_version: string;
  bytes: string;
}

interface FakeOutboxRow {
  aggregate_kind: string;
  aggregate_id: string;
  event_type: string;
  bytes: string;
}

interface FakeAdmissionRow {
  receipt_id: string;
  schema_version: string;
  issuer: string;
  key_id: string;
  principal_digest: string;
  job_id: string;
  attempt: string;
  operation: string;
  request_digest: string;
  work_unit_digest: string;
  data_classification: string;
  trust_policy_digest: string;
  verification_scope: string;
  provider_reservation: string;
  execution: string;
  verified_at: string;
  valid_until: string;
  effective_valid_until: string;
  admission_bytes: string;
}

interface FakeState {
  job: FakeJobRow | null;
  allocation: FakeAllocationRow | null;
  capacityBinding: FakeCapacityBindingRow | null;
  capacityRegistrationJournal: FakeCapacityRegistrationJournalRow | null;
  idempotency: Record<string, FakeIdempotencyRow>;
  jobCommandPreparations: Record<string, FakeJobCommandPreparationRow>;
  jobCreationIdempotency: Record<string, FakeJobCreationIdempotencyRow>;
  admissions: Record<string, FakeAdmissionRow>;
  admissionRefs: Record<string, string>;
  evidence: Record<string, FakeEvidenceRow>;
  evidenceRefs: Record<string, true>;
  transitions: Record<string, { bytes: string; to_job_bytes: string }>;
  allocationCommits: Record<
    string,
    { bytes: string; next_cursor_bytes: string; next_etag: string }
  >;
  outbox: Record<string, FakeOutboxRow>;
}

interface FakePoolOptions {
  failInit?: boolean;
  failSchemaVerification?: boolean;
  badCatalogDigest?: boolean;
  failOnceAt?: string;
  retryCode?: '40001' | '40P01';
  jobUpdateConflict?: boolean;
  allocationUpdateConflict?: boolean;
  capacityPolicyAdmitted?: boolean;
  capacityFinalPolicyAdmitted?: boolean;
  allocationPolicyAdmitted?: boolean;
  admissionPolicyAdmitted?: boolean;
  admissionCommitAdmitted?: boolean;
  transitionFinalPolicyAdmitted?: boolean;
  corruptReadback?: boolean;
  throwRawReadback?: boolean;
}

interface QueryLogEntry {
  marker: string;
  values: unknown[];
}

function idempotencyKey(values: readonly unknown[]): string {
  return values.slice(0, 4).join('\u0000');
}

function pgBigint(value: unknown): string {
  return String(value);
}

function initialState(command?: CommitComputeJobTransitionCommand): FakeState {
  const expected = command?.expectedJob.receipt;
  const lease = expected?.lease;
  const allocation = command?.expectedAllocation;
  const eligibility = command?.expectedCapacityEligibilityBytes
    ? (JSON.parse(command.expectedCapacityEligibilityBytes) as ReturnType<
        typeof eligibilityBinding
      >)
    : undefined;
  const dataPolicy = command?.expectedCapacityDataPolicyBytes
    ? (JSON.parse(command.expectedCapacityDataPolicyBytes) as ReturnType<typeof dataPolicyBinding>)
    : undefined;
  return {
    job: expected
      ? {
          principal_digest: expected.principalDigest,
          work_unit_digest: expected.workUnit.digest,
          state: expected.state,
          version: pgBigint(expected.version),
          receipt_id: expected.receiptId,
          job_bytes: command.expectedJob.bytes,
          capacity_ref: lease?.capacityRef ?? null,
          lease_receipt_id: lease?.receiptId ?? null,
          fencing_epoch: lease ? pgBigint(lease.fencingEpoch) : null,
        }
      : null,
    allocation: allocation
      ? {
          lane: allocation.lane,
          slot_state: allocation.cursor.slotState,
          current_epoch: pgBigint(allocation.cursor.currentEpoch),
          current_lease_receipt_id: allocation.cursor.currentLeaseReceiptId ?? null,
          version: pgBigint(allocation.cursor.version),
          etag: allocation.cursor.etag,
          cursor_bytes: allocation.bytes,
        }
      : null,
    capacityBinding:
      eligibility &&
      dataPolicy &&
      command?.expectedCapacityEligibilityBytes &&
      command.expectedCapacityDataPolicyBytes
        ? {
            provider: eligibility.provider,
            provider_resource_id: String(eligibility.instanceId),
            eligible: eligibility.eligible,
            valid_until: eligibility.validUntil,
            data_policy_valid_until: dataPolicy.validUntil,
            allowed_data_classifications: [...dataPolicy.allowedDataClassifications],
            eligibility_bytes: command.expectedCapacityEligibilityBytes,
            data_policy_bytes: command.expectedCapacityDataPolicyBytes,
          }
        : null,
    capacityRegistrationJournal: null,
    idempotency: {},
    jobCommandPreparations: {},
    jobCreationIdempotency: {},
    admissions: {},
    admissionRefs: {},
    evidence: {},
    evidenceRefs: {},
    transitions: {},
    allocationCommits: {},
    outbox: {},
  };
}

class FakePool implements ComputeJobStorePool {
  state: FakeState;
  readonly queries: QueryLogEntry[] = [];
  releases = 0;
  private failureConsumed = false;

  constructor(
    command?: CommitComputeJobTransitionCommand,
    readonly options: FakePoolOptions = {}
  ) {
    this.state = initialState(command);
  }

  async connect(): Promise<ComputeJobStoreClient> {
    return new FakeClient(this);
  }

  shouldFail(marker: string): boolean {
    if (this.options.failOnceAt !== marker || this.failureConsumed) return false;
    this.failureConsumed = true;
    return true;
  }
}

class FakeClient implements ComputeJobStoreClient {
  private snapshot: FakeState | undefined;

  constructor(private readonly pool: FakePool) {}

  async query<Row extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    values: unknown[] = []
  ): Promise<{ rows: Row[]; rowCount: number | null }> {
    const marker = text.match(/\/\* compute:([a-z-]+) \*\//)?.[1] ?? 'unknown';
    this.pool.queries.push({ marker, values: structuredClone(values) });

    if (marker === 'schema') {
      if (this.pool.options.failInit) throw new Error('schema unavailable');
      return this.result<Row>([]);
    }
    if (marker === 'schema-verify') {
      const valid = !this.pool.options.failSchemaVerification;
      return this.result<Row>([
        {
          meta_ok: valid,
          constraints_ok: valid,
          attempts_ok: valid,
          timestamps_ok: valid,
          indexes_ok: valid,
          catalog_digest:
            valid && !this.pool.options.badCatalogDigest
              ? COMPUTE_JOB_STORE_CATALOG_DIGEST
              : digest('bad-catalog'),
        },
      ]);
    }
    if (marker === 'begin') {
      this.snapshot = structuredClone(this.pool.state);
      return this.result<Row>([]);
    }
    if (marker === 'rollback') {
      if (this.snapshot) this.pool.state = this.snapshot;
      this.snapshot = undefined;
      return this.result<Row>([]);
    }
    if (marker === 'commit') {
      this.snapshot = undefined;
      return this.result<Row>([]);
    }
    if (this.pool.shouldFail(marker)) {
      throw Object.assign(new Error('retryable transaction failure'), {
        code: this.pool.options.retryCode ?? '40001',
      });
    }

    const state = this.pool.state;
    if (marker === 'capacity-register-lock') return this.result<Row>([]);
    if (marker === 'capacity-policy-clock') {
      return this.result<Row>([{ admitted: this.pool.options.capacityPolicyAdmitted !== false }]);
    }
    if (marker === 'capacity-registration-final-clock') {
      const admitted = this.pool.options.capacityFinalPolicyAdmitted !== false;
      return this.result<Row>(admitted ? [{ admitted: true }] : [], admitted ? 1 : 0);
    }
    if (marker === 'allocation-policy-clock') {
      return this.result<Row>([{ admitted: this.pool.options.allocationPolicyAdmitted !== false }]);
    }
    if (marker === 'admission-policy-clock') {
      return this.result<Row>([{ admitted: this.pool.options.admissionPolicyAdmitted !== false }]);
    }
    if (marker === 'capacity-registration-lock' || marker === 'capacity-read') {
      return this.result<Row>(
        state.allocation && state.capacityBinding
          ? [{ ...state.allocation, ...state.capacityBinding }]
          : []
      );
    }
    if (marker === 'capacity-insert') {
      if (state.allocation) return this.result<Row>([], 0);
      state.allocation = {
        lane: values[2] as string,
        slot_state: values[3] as string,
        current_epoch: pgBigint(values[4]),
        current_lease_receipt_id: values[5] as string | null,
        version: pgBigint(values[6]),
        etag: values[7] as string,
        cursor_bytes: values[8] as string,
      };
      return this.result<Row>([{ etag: values[7] }], 1);
    }
    if (marker === 'capacity-binding-insert') {
      if (state.capacityBinding) return this.result<Row>([], 0);
      state.capacityBinding = {
        provider: values[2] as string,
        provider_resource_id: values[3] as string,
        eligible: values[4] as boolean,
        valid_until: values[5] as string,
        data_policy_valid_until: values[6] as string,
        allowed_data_classifications: values[7] as string[],
        eligibility_bytes: values[8] as string,
        data_policy_bytes: values[9] as string,
      };
      return this.result<Row>([{ capacity_ref: values[1] }], 1);
    }
    if (marker === 'capacity-registration-journal-insert') {
      if (state.capacityRegistrationJournal) return this.result<Row>([], 0);
      state.capacityRegistrationJournal = {
        lane: values[2] as string,
        initial_etag: values[3] as string,
        cursor_bytes: values[4] as string,
        eligibility_bytes: values[5] as string,
        data_policy_bytes: values[6] as string,
        registered_at: values[7] as string,
      };
      return this.result<Row>([{ capacity_ref: values[1] }], 1);
    }
    if (
      marker === 'capacity-registration-journal-lock' ||
      marker === 'capacity-registration-readback'
    ) {
      return this.result<Row>(
        state.capacityRegistrationJournal ? [state.capacityRegistrationJournal] : []
      );
    }
    if (marker === 'job-command-preparation-insert') {
      const key = idempotencyKey(values);
      if (state.jobCommandPreparations[key]) return this.result<Row>([], 0);
      state.jobCommandPreparations[key] = {
        team_id: values[0] as string,
        principal_digest: values[1] as string,
        operation: values[2] as string,
        key_digest: values[3] as string,
        semantic_request_digest: values[4] as string,
        work_unit_digest: values[5] as string,
        command_bytes: values[6] as string,
      };
      return this.result<Row>([{ key_digest: values[3] }], 1);
    }
    if (marker === 'job-command-preparation-lock') {
      const row = state.jobCommandPreparations[idempotencyKey(values)];
      return this.result<Row>(row ? [row] : []);
    }
    if (marker === 'work-unit-read') {
      return this.result<Row>(
        Object.values(state.jobCommandPreparations).filter(
          (row) => row.team_id === values[0] && row.work_unit_digest === values[1]
        )
      );
    }
    if (marker === 'job-create-idempotency-insert') {
      const key = idempotencyKey(values);
      if (state.jobCreationIdempotency[key]) return this.result<Row>([], 0);
      state.jobCreationIdempotency[key] = {
        request_digest: values[4] as string,
        status: 'pending',
        job_receipt_id: null,
        admission_receipt_id: null,
        created_job_bytes: null,
        public_response_bytes: null,
      };
      return this.result<Row>([{ key_digest: values[3] }], 1);
    }
    if (marker === 'job-create-idempotency-lock') {
      const row = state.jobCreationIdempotency[idempotencyKey(values)];
      return this.result<Row>(row ? [row] : []);
    }
    if (marker === 'job-create-insert') {
      if (state.job) return this.result<Row>([], 0);
      state.job = {
        principal_digest: values[3] as string,
        work_unit_digest: values[4] as string,
        state: values[5] as string,
        version: pgBigint(values[6]),
        receipt_id: values[7] as string,
        job_bytes: values[8] as string,
        capacity_ref: null,
        lease_receipt_id: null,
        fencing_epoch: null,
      };
      return this.result<Row>([{ receipt_id: values[7] }], 1);
    }
    if (marker === 'job-create-lock' || marker === 'job-read') {
      return this.result<Row>(state.job ? [state.job] : []);
    }
    if (marker === 'idempotency-insert') {
      const key = idempotencyKey(values);
      if (state.idempotency[key]) return this.result<Row>([], 0);
      state.idempotency[key] = {
        request_digest: values[4] as string,
        status: 'pending',
        transition_receipt_id: null,
        allocation_commit_receipt_id: null,
        admission_receipt_id: null,
        public_response_bytes: null,
      };
      return this.result<Row>([{ key_digest: values[3] }], 1);
    }
    if (marker === 'idempotency-lock') {
      const row = state.idempotency[idempotencyKey(values)];
      return this.result<Row>(row ? [row] : []);
    }
    if (marker === 'job-lock') {
      return this.result<Row>(state.job ? [state.job] : []);
    }
    if (marker === 'allocation-lock') {
      return this.result<Row>(
        state.allocation && state.capacityBinding
          ? [{ ...state.allocation, ...state.capacityBinding }]
          : []
      );
    }
    if (marker === 'job-update') {
      if (this.pool.options.jobUpdateConflict || !state.job) return this.result<Row>([], 0);
      if (
        Number(state.job.version) !== values[10] ||
        state.job.receipt_id !== values[11] ||
        state.job.job_bytes !== values[12] ||
        state.job.principal_digest !== values[13] ||
        state.job.work_unit_digest !== values[14]
      ) {
        return this.result<Row>([], 0);
      }
      state.job = {
        principal_digest: state.job.principal_digest,
        work_unit_digest: state.job.work_unit_digest,
        state: values[0] as string,
        version: pgBigint(values[1]),
        receipt_id: values[2] as string,
        job_bytes: values[3] as string,
        capacity_ref: values[4] as string | null,
        lease_receipt_id: values[5] as string | null,
        fencing_epoch: values[6] === null ? null : pgBigint(values[6]),
      };
      return this.result<Row>([{ receipt_id: values[2] }], 1);
    }
    if (marker === 'allocation-update') {
      if (this.pool.options.allocationUpdateConflict || !state.allocation) {
        return this.result<Row>([], 0);
      }
      if (
        Number(state.allocation.version) !== values[9] ||
        state.allocation.etag !== values[10] ||
        state.allocation.cursor_bytes !== values[11] ||
        Number(state.allocation.current_epoch) !== values[12] ||
        state.allocation.slot_state !== values[13] ||
        state.allocation.current_lease_receipt_id !== values[14]
      ) {
        return this.result<Row>([], 0);
      }
      state.allocation = {
        lane: values[0] as string,
        slot_state: values[1] as string,
        current_epoch: pgBigint(values[2]),
        current_lease_receipt_id: values[3] as string | null,
        version: pgBigint(values[4]),
        etag: values[5] as string,
        cursor_bytes: values[6] as string,
      };
      return this.result<Row>([{ etag: values[5] }], 1);
    }
    if (marker === 'admission-insert') {
      const key = `${values[0]}:${values[1]}`;
      if (state.admissions[key]) return this.result<Row>([], 0);
      state.admissions[key] = {
        receipt_id: values[1] as string,
        schema_version: values[2] as string,
        issuer: values[3] as string,
        key_id: values[4] as string,
        principal_digest: values[5] as string,
        job_id: values[6] as string,
        attempt: pgBigint(values[7]),
        operation: values[8] as string,
        request_digest: values[9] as string,
        work_unit_digest: values[10] as string,
        data_classification: values[11] as string,
        trust_policy_digest: values[12] as string,
        verification_scope: values[13] as string,
        provider_reservation: values[14] as string,
        execution: values[15] as string,
        verified_at: values[16] as string,
        valid_until: values[17] as string,
        effective_valid_until: values[18] as string,
        admission_bytes: values[19] as string,
      };
      return this.result<Row>([{ receipt_id: values[1] }], 1);
    }
    if (marker === 'admission-lock') {
      const admission = state.admissions[`${values[0]}:${values[1]}`];
      return this.result<Row>(admission ? [admission] : []);
    }
    if (marker === 'admission-ref-insert') {
      const operationKey = `${values[0]}:${values[4]}`;
      const admissionId = values[5] as string;
      const admissionAlreadyReferenced = Object.entries(state.admissionRefs).some(
        ([key, value]) => key.startsWith(`${values[0]}:`) && value === admissionId
      );
      if (state.admissionRefs[operationKey] || admissionAlreadyReferenced) {
        return this.result<Row>([], 0);
      }
      state.admissionRefs[operationKey] = admissionId;
      return this.result<Row>([{ admission_receipt_id: admissionId }], 1);
    }
    if (marker === 'admission-readback') {
      const operationKey = `${values[0]}:${values[1]}`;
      const admissionId = state.admissionRefs[operationKey];
      const admission = admissionId ? state.admissions[`${values[0]}:${admissionId}`] : undefined;
      return this.result<Row>(
        admission
          ? [
              {
                ...admission,
                operation_receipt_id: values[1],
                referenced_job_id: admission.job_id,
                referenced_attempt: admission.attempt,
                referenced_operation: admission.operation,
              },
            ]
          : []
      );
    }
    if (marker === 'evidence-insert') {
      const key = `${values[0]}:${values[1]}`;
      if (state.evidence[key]) return this.result<Row>([], 0);
      state.evidence[key] = {
        schema_version: values[2] as string,
        bytes: values[3] as string,
      };
      return this.result<Row>([{ receipt_id: values[1] }], 1);
    }
    if (marker === 'evidence-lock') {
      const evidence = state.evidence[`${values[0]}:${values[1]}`];
      return this.result<Row>(
        evidence
          ? [{ id: values[1], schema_version: evidence.schema_version, bytes: evidence.bytes }]
          : []
      );
    }
    if (marker === 'evidence-ref-insert') {
      const key = `${values[0]}:${values[3]}:${values[4]}`;
      if (state.evidenceRefs[key]) return this.result<Row>([], 0);
      state.evidenceRefs[key] = true;
      return this.result<Row>([{ evidence_receipt_id: values[4] }], 1);
    }
    if (marker === 'transition-insert') {
      const key = `${values[0]}:${values[1]}`;
      if (state.transitions[key]) return this.result<Row>([], 0);
      state.transitions[key] = {
        bytes: values[11] as string,
        to_job_bytes: values[12] as string,
      };
      return this.result<Row>([{ transition_receipt_id: values[1] }], 1);
    }
    if (marker === 'allocation-commit-insert') {
      const key = `${values[0]}:${values[1]}`;
      if (state.allocationCommits[key]) return this.result<Row>([], 0);
      state.allocationCommits[key] = {
        bytes: values[15] as string,
        next_cursor_bytes: values[16] as string,
        next_etag: values[10] as string,
      };
      return this.result<Row>([{ allocation_commit_receipt_id: values[1] }], 1);
    }
    if (marker === 'outbox-insert') {
      const key = `${values[0]}:${values[1]}`;
      if (state.outbox[key]) return this.result<Row>([], 0);
      state.outbox[key] = {
        aggregate_kind: values[2] as string,
        aggregate_id: values[3] as string,
        event_type: values[4] as string,
        bytes: values[5] as string,
      };
      return this.result<Row>([{ event_id: values[1] }], 1);
    }
    if (marker === 'outbox-lock') {
      const event = state.outbox[`${values[0]}:${values[1]}`];
      return this.result<Row>(event ? [{ id: values[1], ...event }] : []);
    }
    if (marker === 'job-create-idempotency-commit') {
      const key = idempotencyKey(values.slice(4, 8));
      const row = state.jobCreationIdempotency[key];
      const admissionRefPresent = Object.values(state.admissionRefs).includes(values[1] as string);
      if (
        this.pool.options.admissionCommitAdmitted === false ||
        !row ||
        row.status !== 'pending' ||
        row.request_digest !== values[8] ||
        !admissionRefPresent
      ) {
        return this.result<Row>([], 0);
      }
      row.status = 'committed';
      row.job_receipt_id = values[0] as string;
      row.admission_receipt_id = values[1] as string;
      row.created_job_bytes = values[2] as string;
      row.public_response_bytes = values[3] as string;
      return this.result<Row>([{ key_digest: values[7] }], 1);
    }
    if (marker === 'idempotency-commit') {
      const key = idempotencyKey(values.slice(4, 8));
      const row = state.idempotency[key];
      const admissionRefPresent = Object.values(state.admissionRefs).includes(values[2] as string);
      if (
        this.pool.options.admissionCommitAdmitted === false ||
        this.pool.options.transitionFinalPolicyAdmitted === false ||
        !row ||
        row.status !== 'pending' ||
        row.request_digest !== values[8] ||
        !admissionRefPresent
      ) {
        return this.result<Row>([], 0);
      }
      row.status = 'committed';
      row.transition_receipt_id = values[0] as string;
      row.allocation_commit_receipt_id = values[1] as string | null;
      row.admission_receipt_id = values[2] as string;
      row.public_response_bytes = values[3] as string;
      return this.result<Row>([{ key_digest: values[7] }], 1);
    }
    if (marker === 'readback') {
      if (this.pool.options.throwRawReadback) throw new Error('raw readback transport failure');
      const idempotency = state.idempotency[idempotencyKey(values)];
      if (!idempotency || !idempotency.transition_receipt_id) return this.result<Row>([]);
      const transitionBytes =
        state.transitions[`${values[0]}:${idempotency.transition_receipt_id}`];
      const allocationCommit = idempotency.allocation_commit_receipt_id
        ? state.allocationCommits[`${values[0]}:${idempotency.allocation_commit_receipt_id}`]
        : null;
      return this.result<Row>([
        {
          ...idempotency,
          public_response_bytes: this.pool.options.corruptReadback
            ? `${idempotency.public_response_bytes} `
            : idempotency.public_response_bytes,
          transition_bytes: transitionBytes?.bytes,
          to_job_bytes: transitionBytes?.to_job_bytes,
          commit_bytes: allocationCommit?.bytes ?? null,
          next_cursor_bytes: allocationCommit?.next_cursor_bytes ?? null,
          committed_next_etag: allocationCommit?.next_etag ?? null,
        },
      ]);
    }
    if (marker === 'job-create-readback') {
      const idempotency = state.jobCreationIdempotency[idempotencyKey(values)];
      if (!idempotency) return this.result<Row>([]);
      return this.result<Row>([
        {
          ...idempotency,
        },
      ]);
    }
    if (marker === 'evidence-readback') {
      const operationReceiptId = values[1] as string;
      const ids = values[2] as string[];
      return this.result<Row>(
        ids.flatMap((id) => {
          const evidence = state.evidence[`${values[0]}:${id}`];
          const ref = state.evidenceRefs[`${values[0]}:${operationReceiptId}:${id}`];
          return evidence && ref
            ? [{ id, schema_version: evidence.schema_version, bytes: evidence.bytes }]
            : [];
        })
      );
    }
    if (marker === 'outbox-readback') {
      const ids = values[1] as string[];
      return this.result<Row>(
        ids.flatMap((id) => {
          const event = state.outbox[`${values[0]}:${id}`];
          return event ? [{ id, ...event }] : [];
        })
      );
    }
    throw new Error(`fake pool does not implement ${marker}`);
  }

  release(): void {
    this.pool.releases += 1;
  }

  private result<Row extends Record<string, unknown>>(
    rows: readonly Record<string, unknown>[],
    rowCount = rows.length
  ): { rows: Row[]; rowCount: number } {
    return { rows: rows as Row[], rowCount };
  }
}

const originalDatabaseUrl = process.env.DATABASE_URL;

afterEach(() => {
  if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = originalDatabaseUrl;
});

describe('PostgresComputeJobStore', () => {
  it('requires PostgreSQL configuration and has no memory fallback', async () => {
    delete process.env.DATABASE_URL;

    await expect(PostgresComputeJobStore.create(storeOptions())).rejects.toBeInstanceOf(
      ComputeJobStoreUnavailableError
    );
  });

  it('eagerly initializes its one canonical schema and fails closed', async () => {
    const pool = new FakePool(undefined, { failInit: true });

    await expect(PostgresComputeJobStore.create(storeOptions({ pool }))).rejects.toMatchObject({
      name: 'ComputeJobStoreUnavailableError',
      message: 'PostgreSQL compute schema initialization failed',
    });
    expect(pool.queries.map((entry) => entry.marker)).toEqual(['schema']);
    expect(pool.releases).toBe(1);
  });

  it('fails closed when the installed schema catalog does not match the manifest', async () => {
    const pool = new FakePool(undefined, { failSchemaVerification: true });

    await expect(PostgresComputeJobStore.create(storeOptions({ pool }))).rejects.toMatchObject({
      name: 'ComputeJobStoreUnavailableError',
      message: 'PostgreSQL compute schema initialization failed',
    });
    expect(pool.queries.map((entry) => entry.marker)).toEqual(['schema', 'schema-verify']);
    expect(pool.releases).toBe(1);
  });

  it('fails closed when exact column, constraint, or index catalog bytes differ', async () => {
    const pool = new FakePool(undefined, { badCatalogDigest: true });

    await expect(PostgresComputeJobStore.create(storeOptions({ pool }))).rejects.toMatchObject({
      name: 'ComputeJobStoreUnavailableError',
      message: 'PostgreSQL compute schema initialization failed',
    });
    expect(pool.queries.map((entry) => entry.marker)).toEqual(['schema', 'schema-verify']);
    expect(pool.releases).toBe(1);
  });

  it('creates an initial job once, replays exactly, and reads validated current bytes', async () => {
    const command = makeCreateJobCommand();
    const pool = new FakePool();
    const store = await PostgresComputeJobStore.create(storeOptions({ pool }));

    const created = await store.createJob(command);
    expect(created).toMatchObject({
      disposition: 'committed',
      publicResponseBytes: command.publicResponseBytes,
      jobReceiptId: command.job.receipt.receiptId,
      readBack: { admissionReceiptId: command.admission.receipt.receiptId },
    });
    const current = await store.readJob({ teamId: TEAM_ID, jobId: JOB_ID, attempt: 1 });
    expect(current.bytes).toBe(command.job.bytes);
    expect(current.receipt).toEqual(command.job.receipt);
    const durableWorkUnit = await store.readWorkUnit(TEAM_ID, command.workUnit.digest);
    expect(durableWorkUnit).toEqual(command.workUnit);

    const advancedBytes = canonicalJson({ laterState: true });
    if (!pool.state.job) throw new Error('fake job disappeared');
    pool.state.job = {
      ...pool.state.job,
      state: 'queued',
      version: 1,
      receipt_id: digest('advanced-job'),
      job_bytes: advancedBytes,
    };
    const replay = await store.createJob(command);
    expect(replay).toMatchObject({
      disposition: 'replayed',
      publicResponseBytes: command.publicResponseBytes,
    });

    const conflictingKey = makeCreateJobCommand('different-create-idempotency');
    await expect(store.createJob(conflictingKey)).rejects.toMatchObject({
      code: 'job_already_exists',
    });
    expect(pool.state.job?.job_bytes).toBe(advancedBytes);
  });

  it('reuses the first exact prepared command when admission timestamps regenerate', async () => {
    const first = makeCreateJobCommand();
    const regenerated = makeCreateJobCommand('create-job-1', at(6_000));
    expect(regenerated.semanticRequestDigest).toBe(first.semanticRequestDigest);
    expect(regenerated.admission.bytes).not.toBe(first.admission.bytes);

    const pool = new FakePool();
    const store = await PostgresComputeJobStore.create(storeOptions({ pool }));
    await expect(store.createJob(first)).resolves.toMatchObject({ disposition: 'committed' });
    const preparation = Object.values(pool.state.jobCommandPreparations)[0];
    if (!preparation) throw new Error('fake command preparation missing');
    const firstCommandBytes = preparation.command_bytes;
    expect(firstCommandBytes).not.toContain('create-job-1');

    await expect(store.createJob(regenerated)).resolves.toMatchObject({
      disposition: 'replayed',
      readBack: { admissionReceiptId: first.admission.receipt.receiptId },
    });
    expect(preparation.command_bytes).toBe(firstCommandBytes);
  });

  it('rejects semantic idempotency reuse and corrupt immutable preparation bytes', async () => {
    const command = makeCreateJobCommand();
    const pool = new FakePool();
    const store = await PostgresComputeJobStore.create(storeOptions({ pool }));
    await store.createJob(command);

    await expect(
      store.createJob({ ...command, semanticRequestDigest: digest('different semantics') })
    ).rejects.toMatchObject({ code: 'idempotency_key_reused' });

    const preparation = Object.values(pool.state.jobCommandPreparations)[0];
    if (!preparation) throw new Error('fake command preparation missing');
    preparation.command_bytes = `${preparation.command_bytes} `;
    await expect(store.createJob(command)).rejects.toMatchObject({
      code: 'immutable_receipt_conflict',
    });
    await expect(store.readWorkUnit(TEAM_ID, command.workUnit.digest)).rejects.toBeInstanceOf(
      ComputeJobStoreReadbackError
    );
  });

  it('registers capacity create-only and keeps provider identity on the internal read surface', async () => {
    const command = makeCapacityRegistration();
    const pool = new FakePool();
    const store = await PostgresComputeJobStore.create(storeOptions({ pool }));

    const registered = await store.registerCapacity(command);
    expect(registered).toMatchObject({
      disposition: 'committed',
      capacityRef: CAPACITY,
      etag: command.projection.cursor.etag,
      cursorBytes: command.projection.bytes,
    });
    expect(JSON.stringify(registered)).not.toContain('vast.ai');
    expect(JSON.stringify(registered)).not.toContain('"instanceId"');

    const internal = await store.readRegisteredCapacity({
      teamId: TEAM_ID,
      capacityRef: CAPACITY,
    });
    expect(internal).toMatchObject({
      eligibility: { provider: 'vast.ai', instanceId: 42 },
      dataPolicy: { allowedDataClassifications: ['internal'] },
      projection: { bytes: command.projection.bytes },
    });
    await expect(store.registerCapacity(command)).resolves.toMatchObject({
      disposition: 'replayed',
    });
    await expect(store.registerCapacity(makeCapacityRegistration(99))).rejects.toMatchObject({
      code: 'capacity_registration_conflict',
    });
  });

  it('has no independent allocation update or reclaim path while an owning job is nonterminal', async () => {
    const transition = makeAllocationCommand();
    const registration = makeCapacityRegistration();
    const pool = new FakePool();
    const store = await PostgresComputeJobStore.create(storeOptions({ pool }));
    await store.registerCapacity(registration);
    pool.state.job = initialState(transition).job;

    await store.commitTransition(transition);
    const leased = structuredClone(pool.state.allocation);
    expect(leased?.slot_state).toBe('leased');
    expect(leased?.version).toBe('1');
    expect('updateAllocation' in store).toBe(false);
    await expect(store.registerCapacity(registration)).rejects.toMatchObject({
      code: 'capacity_registration_conflict',
    });
    expect(pool.state.allocation).toEqual(leased);
  });

  it('commits a valid prelease cancellation with an exact empty evidence set', async () => {
    const command = makeZeroEvidenceCancelCommand();
    const pool = new FakePool(command);
    const store = await PostgresComputeJobStore.create(storeOptions({ pool }));

    await expect(store.commitTransition(command)).resolves.toMatchObject({
      disposition: 'committed',
    });
    const markers = pool.queries.map((entry) => entry.marker);
    expect(markers).not.toContain('evidence-insert');
    expect(markers).not.toContain('evidence-readback');
  });

  it('commits and reads back a job-only transition without allocation SQL', async () => {
    const command = makeJobOnlyCommand();
    const pool = new FakePool(command);
    const store = await PostgresComputeJobStore.create(storeOptions({ pool }));

    const result = await store.commitTransition(command);
    const markers = pool.queries.map((entry) => entry.marker).slice(2);

    expect(markers).toEqual([
      'begin',
      'idempotency-insert',
      'idempotency-lock',
      'job-lock',
      'job-update',
      'admission-insert',
      'admission-ref-insert',
      'evidence-insert',
      'evidence-ref-insert',
      'evidence-insert',
      'evidence-ref-insert',
      'transition-insert',
      'outbox-insert',
      'idempotency-commit',
      'commit',
      'admission-readback',
      'readback',
      'evidence-readback',
      'outbox-readback',
    ]);
    expect(markers.some((marker) => marker.includes('allocation'))).toBe(false);
    expect(result).toMatchObject({
      disposition: 'committed',
      publicResponseBytes: command.publicResponseBytes,
      transitionReceiptId: command.transition.receipt.receiptId,
      readBack: { admissionReceiptId: command.admission.receipt.receiptId },
    });
    expect(result.allocationCommitReceiptId).toBeUndefined();
    expect(pool.state.job?.job_bytes).toBe(command.nextJob.bytes);
    expect(Object.values(pool.state.transitions).map((entry) => entry.bytes)).toEqual([
      command.transition.bytes,
    ]);
    expect(Object.values(pool.state.outbox).map((entry) => entry.bytes)).toEqual([
      command.outbox[0].bytes,
    ]);
  });

  it('locks idempotency, job, then allocation and commits exact allocator bytes atomically', async () => {
    const command = makeAllocationCommand();
    const pool = new FakePool(command);
    const store = await PostgresComputeJobStore.create(storeOptions({ pool }));

    const result = await store.commitTransition(command);
    const markers = pool.queries.map((entry) => entry.marker);

    expect(markers.indexOf('idempotency-lock')).toBeLessThan(markers.indexOf('job-lock'));
    expect(markers.indexOf('job-lock')).toBeLessThan(markers.indexOf('allocation-lock'));
    expect(markers.indexOf('job-update')).toBeLessThan(markers.indexOf('allocation-update'));
    expect(markers.indexOf('commit')).toBeLessThan(markers.indexOf('readback'));
    expect(pool.state.allocation?.cursor_bytes).toBe(command.nextAllocation?.bytes);
    expect(Object.values(pool.state.allocationCommits).map((entry) => entry.bytes)).toEqual([
      command.allocationCommit?.bytes,
    ]);
    expect(result.allocationCommitReceiptId).toBe(command.allocationCommit?.receipt.receiptId);
  });

  it('replays the exact public response and conflicts on the same key with a different request', async () => {
    const command = makeJobOnlyCommand();
    const pool = new FakePool(command);
    const store = await PostgresComputeJobStore.create(storeOptions({ pool }));
    await store.commitTransition(command);
    if (!pool.state.job) throw new Error('fake job disappeared');
    pool.state.job = {
      ...pool.state.job,
      state: 'starting',
      version: '2',
      receipt_id: digest('later-job-state'),
      job_bytes: canonicalJson({ laterState: true }),
    };
    pool.queries.length = 0;

    const replay = await store.commitTransition(command);
    expect(replay.disposition).toBe('replayed');
    expect(replay.publicResponseBytes).toBe(command.publicResponseBytes);
    expect(pool.queries.map((entry) => entry.marker)).toEqual([
      'begin',
      'idempotency-insert',
      'idempotency-lock',
      'admission-policy-clock',
      'commit',
      'admission-readback',
      'readback',
      'evidence-readback',
      'outbox-readback',
    ]);

    pool.queries.length = 0;
    const differentRequest = makeJobOnlyCommand('different-queue-request', 2);
    await expect(store.commitTransition(differentRequest)).rejects.toMatchObject({
      code: 'idempotency_key_reused',
    });
    expect(pool.queries.map((entry) => entry.marker)).toEqual([
      'begin',
      'idempotency-insert',
      'idempotency-lock',
      'rollback',
    ]);
  });

  it('rolls back an exact job row-count CAS conflict', async () => {
    const command = makeJobOnlyCommand();
    const pool = new FakePool(command, { jobUpdateConflict: true });
    const before = structuredClone(pool.state);
    const store = await PostgresComputeJobStore.create(storeOptions({ pool }));

    await expect(store.commitTransition(command)).rejects.toMatchObject({
      code: 'job_cas_conflict',
    });
    expect(pool.queries.at(-1)?.marker).toBe('rollback');
    expect(pool.state).toEqual(before);
  });

  it('rolls back the job update when allocation cursor CAS changes', async () => {
    const command = makeAllocationCommand();
    const pool = new FakePool(command, { allocationUpdateConflict: true });
    const before = structuredClone(pool.state);
    const store = await PostgresComputeJobStore.create(storeOptions({ pool }));

    await expect(store.commitTransition(command)).rejects.toMatchObject({
      code: 'allocation_cas_conflict',
    });
    expect(pool.queries.at(-1)?.marker).toBe('rollback');
    expect(pool.state).toEqual(before);
  });

  it.each(['40001', '40P01'] as const)(
    'retries SQLSTATE %s with the same prepared bytes',
    async (retryCode) => {
      const command = makeJobOnlyCommand();
      const pool = new FakePool(command, { failOnceAt: 'job-lock', retryCode });
      const store = await PostgresComputeJobStore.create(
        storeOptions({ pool, maxTransactionRetries: 1 })
      );

      await expect(store.commitTransition(command)).resolves.toMatchObject({
        disposition: 'committed',
      });
      expect(pool.queries.filter((entry) => entry.marker === 'begin')).toHaveLength(2);
      expect(pool.queries.filter((entry) => entry.marker === 'rollback')).toHaveLength(1);
      const inserts = pool.queries.filter((entry) => entry.marker === 'idempotency-insert');
      expect(inserts).toHaveLength(2);
      expect(inserts[0].values).toEqual(inserts[1].values);
    }
  );

  it('rejects missing, bad-signature, mismatched, and expired admissions before SQL', async () => {
    const command = makeJobOnlyCommand();
    const pool = new FakePool(command);
    const store = await PostgresComputeJobStore.create(storeOptions({ pool }));
    const lifecycle: ComputeJobAdmissionLifecycleBinding = {
      kind: 'transition',
      expectedJobReceiptId: command.expectedJob.receipt.receiptId,
      nextJobReceiptId: command.nextJob.receipt.receiptId,
      transitionReceiptId: command.transition.receipt.receiptId,
    };

    await expect(
      store.commitTransition({
        ...command,
        admission: undefined,
      } as unknown as CommitComputeJobTransitionCommand)
    ).rejects.toBeInstanceOf(TypeError);

    const badSignatureReceipt = {
      ...command.admission.receipt,
      signatureBase64: Buffer.alloc(64).toString('base64'),
    };
    await expect(
      store.commitTransition({
        ...command,
        admission: {
          receipt: badSignatureReceipt,
          bytes: canonicalJson(badSignatureReceipt),
        },
      })
    ).rejects.toMatchObject({
      name: 'ComputeJobStoreAdmissionError',
      reasonCodes: expect.arrayContaining(['receipt_signature_invalid']),
    });

    const mismatchedAdmission = admissionEnvelope({
      operation: 'compute_job.queue',
      requestDigest: command.requestDigest,
      unit: command.expectedWorkUnit.contract,
      evidence: command.evidence,
      lifecycle: {
        ...lifecycle,
        transitionReceiptId: digest('different-transition-receipt'),
      },
    });
    await expect(
      store.commitTransition({ ...command, admission: mismatchedAdmission })
    ).rejects.toMatchObject({
      name: 'ComputeJobStoreAdmissionError',
      reasonCodes: expect.arrayContaining(['context_mismatch']),
    });

    const expiredAdmission = admissionEnvelope({
      operation: 'compute_job.queue',
      requestDigest: command.requestDigest,
      unit: command.expectedWorkUnit.contract,
      evidence: command.evidence,
      lifecycle,
      verifiedAt: at(-10 * 60_000),
      validUntil: at(-6 * 60_000),
    });
    await expect(
      store.commitTransition({ ...command, admission: expiredAdmission })
    ).rejects.toMatchObject({
      name: 'ComputeJobStoreAdmissionError',
      reasonCodes: expect.arrayContaining(['admission_expired']),
    });

    expect(pool.queries.map((entry) => entry.marker)).toEqual(['schema', 'schema-verify']);
    expect(pool.state).toEqual(initialState(command));
  });

  it('rolls back when the final database-clock admission gate rejects the receipt', async () => {
    const command = makeJobOnlyCommand();
    const pool = new FakePool(command, { admissionCommitAdmitted: false });
    const before = structuredClone(pool.state);
    const store = await PostgresComputeJobStore.create(storeOptions({ pool }));

    const rejection: unknown = await store
      .commitTransition(command)
      .catch((error: unknown) => error);
    expect(rejection).toBeInstanceOf(ComputeJobStoreAdmissionError);
    expect(rejection).toMatchObject({
      name: 'ComputeJobStoreAdmissionError',
      reasonCodes: ['final_policy_expired_at_database_clock'],
    });
    expect(pool.queries.map((entry) => entry.marker)).toContain('idempotency-commit');
    expect(pool.queries.at(-1)?.marker).toBe('rollback');
    expect(pool.state).toEqual(before);
  });

  it('rejects plaintext custody material and false public reservation claims before SQL', async () => {
    const command = makeJobOnlyCommand();
    const unsafe = {
      ...command,
      publicResponseBytes: canonicalJson({ fencingToken: 'do-not-persist' }),
    };
    const pool = new FakePool(command);
    const store = await PostgresComputeJobStore.create(storeOptions({ pool }));

    await expect(store.commitTransition(unsafe)).rejects.toThrow(
      'may not persist plaintext custody material'
    );
    await expect(
      store.commitTransition({
        ...command,
        publicResponseBytes: canonicalJson({
          ...JSON.parse(command.publicResponseBytes),
          providerReservation: 'reserved',
        }),
      })
    ).rejects.toThrow('publicResponseBytes must be derived from the exact lifecycle receipts');
    expect(pool.queries.map((entry) => entry.marker)).toEqual(['schema', 'schema-verify']);
    expect(pool.state).toEqual(initialState(command));
  });

  it('rejects duplicate-key JSON, counterfeit evidence, and a forged outbox claim before SQL', async () => {
    const command = makeJobOnlyCommand();
    const pool = new FakePool(command);
    const store = await PostgresComputeJobStore.create(storeOptions({ pool }));
    const duplicateKeyBytes = command.publicResponseBytes.replace(
      '{"attempt":1,',
      '{"attempt":1,"attempt":1,'
    );
    expect(duplicateKeyBytes).not.toBe(command.publicResponseBytes);
    await expect(
      store.commitTransition({ ...command, publicResponseBytes: duplicateKeyBytes })
    ).rejects.toThrow('must contain exact canonical JSON bytes');

    const counterfeit = structuredClone(command.evidence[0]);
    counterfeit.bytes = canonicalJson({
      ...JSON.parse(counterfeit.bytes),
      availableSlots: 0,
    });
    await expect(
      store.commitTransition({ ...command, evidence: [counterfeit, ...command.evidence.slice(1)] })
    ).rejects.toThrow('not content-addressed by receiptId');

    const forgedEvent = {
      ...command.outbox[0],
      bytes: canonicalJson({
        ...JSON.parse(command.outbox[0].bytes),
        providerReservation: 'reserved',
      }),
    };
    await expect(store.commitTransition({ ...command, outbox: [forgedEvent] })).rejects.toThrow(
      'outbox event must be derived from the exact lifecycle receipts'
    );
    expect(pool.queries.map((entry) => entry.marker)).toEqual(['schema', 'schema-verify']);
  });

  it('rejects an operation mismatch and a WorkUnit data class outside capacity policy', async () => {
    const command = makeAllocationCommand();
    const pool = new FakePool(command);
    const store = await PostgresComputeJobStore.create(storeOptions({ pool }));

    await expect(
      store.commitTransition({ ...command, operation: 'compute_job.queue' })
    ).rejects.toThrow('operation must be derived as compute_job.acquire_lease');

    const denyingPolicy = {
      ...dataPolicyBinding(),
      allowedDataClassifications: ['confidential'],
    };
    await expect(
      store.commitTransition({
        ...command,
        expectedCapacityDataPolicyBytes: canonicalJson(denyingPolicy),
      })
    ).rejects.toThrow('WorkUnit data classification is not admitted by capacity policy');
    expect(pool.queries.map((entry) => entry.marker)).toEqual(['schema', 'schema-verify']);
  });

  it('uses the database policy clock for capacity registration and allocation admission', async () => {
    const registration = makeCapacityRegistration();
    const capacityPool = new FakePool(undefined, { capacityPolicyAdmitted: false });
    const capacityStore = await PostgresComputeJobStore.create(
      storeOptions({ pool: capacityPool })
    );
    await expect(capacityStore.registerCapacity(registration)).rejects.toMatchObject({
      code: 'capacity_registration_conflict',
    });
    expect(capacityPool.queries.map((entry) => entry.marker)).toContain('capacity-policy-clock');
    expect(capacityPool.state.allocation).toBeNull();

    const allocation = makeAllocationCommand();
    const allocationPool = new FakePool(allocation, { allocationPolicyAdmitted: false });
    const before = structuredClone(allocationPool.state);
    const allocationStore = await PostgresComputeJobStore.create(
      storeOptions({ pool: allocationPool })
    );
    await expect(allocationStore.commitTransition(allocation)).rejects.toMatchObject({
      code: 'allocation_cas_conflict',
    });
    expect(allocationPool.queries.map((entry) => entry.marker)).toContain(
      'allocation-policy-clock'
    );
    expect(allocationPool.state).toEqual(before);
  });

  it('rechecks capacity registration policy at the final database commit boundary', async () => {
    const registration = makeCapacityRegistration();
    const pool = new FakePool(undefined, { capacityFinalPolicyAdmitted: false });
    const before = structuredClone(pool.state);
    const store = await PostgresComputeJobStore.create(storeOptions({ pool }));

    await expect(store.registerCapacity(registration)).rejects.toMatchObject({
      code: 'capacity_registration_conflict',
    });
    const markers = pool.queries.map((entry) => entry.marker);
    expect(markers.indexOf('capacity-registration-journal-lock')).toBeLessThan(
      markers.indexOf('capacity-registration-final-clock')
    );
    expect(markers.at(-1)).toBe('rollback');
    expect(pool.state).toEqual(before);
  });

  it('rechecks acquire capacity and lease validity in the final idempotency CAS', async () => {
    const command = makeAllocationCommand();
    const pool = new FakePool(command, { transitionFinalPolicyAdmitted: false });
    const before = structuredClone(pool.state);
    const store = await PostgresComputeJobStore.create(storeOptions({ pool }));

    await expect(store.commitTransition(command)).rejects.toMatchObject({
      name: 'ComputeJobStoreAdmissionError',
      reasonCodes: ['final_policy_expired_at_database_clock'],
    });
    const finalGate = pool.queries.find((entry) => entry.marker === 'idempotency-commit');
    expect(finalGate?.values.slice(11)).toEqual([
      true,
      LEASE_EXPIRES_AT,
      true,
      ELIGIBILITY_VALID_UNTIL,
      ELIGIBILITY_VALID_UNTIL,
    ]);
    expect(pool.queries.at(-1)?.marker).toBe('rollback');
    expect(pool.state).toEqual(before);
  });

  it('rechecks a job-only start lease in the final idempotency CAS', async () => {
    const command = makeStartCommand();
    const pool = new FakePool(command, { transitionFinalPolicyAdmitted: false });
    const before = structuredClone(pool.state);
    const store = await PostgresComputeJobStore.create(storeOptions({ pool }));

    await expect(store.commitTransition(command)).rejects.toMatchObject({
      name: 'ComputeJobStoreAdmissionError',
      reasonCodes: ['final_policy_expired_at_database_clock'],
    });
    const markers = pool.queries.map((entry) => entry.marker);
    expect(markers.some((marker) => marker.includes('allocation'))).toBe(false);
    const finalGate = pool.queries.find((entry) => entry.marker === 'idempotency-commit');
    expect(finalGate?.values.slice(11)).toEqual([true, LEASE_EXPIRES_AT, false, null, null]);
    expect(pool.queries.at(-1)?.marker).toBe('rollback');
    expect(pool.state).toEqual(before);
  });

  it('detects denormalized job-column mutation even when canonical job bytes are unchanged', async () => {
    const command = makeJobOnlyCommand();
    const pool = new FakePool(command);
    if (!pool.state.job) throw new Error('fake job missing');
    pool.state.job.principal_digest = digest('counterfeit-principal');
    const store = await PostgresComputeJobStore.create(storeOptions({ pool }));

    await expect(
      store.readJob({ teamId: TEAM_ID, jobId: JOB_ID, attempt: 1 })
    ).rejects.toBeInstanceOf(ComputeJobStoreReadbackError);
    await expect(store.commitTransition(command)).rejects.toMatchObject({
      code: 'job_cas_conflict',
    });
  });

  it('reports committed-but-unverified when exact post-COMMIT readback differs', async () => {
    const command = makeJobOnlyCommand();
    const pool = new FakePool(command, { corruptReadback: true });
    const store = await PostgresComputeJobStore.create(storeOptions({ pool }));

    const error = await store.commitTransition(command).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ComputeJobStoreReadbackError);
    expect(error).toMatchObject({ committed: true });
    const markers = pool.queries.map((entry) => entry.marker);
    expect(markers.indexOf('commit')).toBeLessThan(markers.indexOf('readback'));
    expect(markers.slice(markers.indexOf('commit'))).not.toContain('rollback');
    expect(pool.state.job?.job_bytes).toBe(command.nextJob.bytes);
  });

  it('wraps an unexpected raw post-COMMIT readback failure as committed-but-unverified', async () => {
    const command = makeJobOnlyCommand();
    const pool = new FakePool(command, { throwRawReadback: true });
    const store = await PostgresComputeJobStore.create(storeOptions({ pool }));

    const error = await store.commitTransition(command).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ComputeJobStoreReadbackError);
    expect(error).toMatchObject({ committed: true });
    expect((error as Error).message).toContain('committed job transition readback failed');
    expect(pool.queries.map((entry) => entry.marker)).not.toContain('rollback');
  });

  it('uses typed conflict errors for callers that need deterministic mapping', () => {
    const error = new ComputeJobStoreConflictError('job_cas_conflict', 'changed');
    expect(error).toMatchObject({ name: 'ComputeJobStoreConflictError', code: 'job_cas_conflict' });
  });
});
