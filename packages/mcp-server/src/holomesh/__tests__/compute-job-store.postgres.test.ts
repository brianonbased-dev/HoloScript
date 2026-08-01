import { createHash, generateKeyPairSync, sign } from 'crypto';
import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  COMPUTE_WORK_UNIT_COMPILER_VERSION,
  buildComputeWorkUnit,
  computeWorkUnitDigest,
  type ComputeWorkUnitContract,
} from '@holoscript/core/compiler';
import {
  HARDWARE_RECEIPT_METADATA_SCHEMA_VERSION,
  attestComputeExecutionReceipt,
  buildComputeBudgetEvidence,
  buildComputeCapacitySnapshot,
  buildComputeExecutionReceipt,
  computeCapacityAllocationEtag,
  planComputePlacement,
  prepareComputeCapacityLease,
  prepareComputeJob,
  prepareComputeJobTransition,
  type ComputeCapacityAllocationCursor,
  type ComputeCapacityLease,
  type ComputeCapacitySnapshot,
  type ComputeBudgetAccountProjection,
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
  COMPUTE_JOB_STORE_SCHEMA_SQL,
  COMPUTE_JOB_STORE_SCHEMA_FINGERPRINT,
  COMPUTE_JOB_STORE_SCHEMA_VERSION,
  COMPUTE_JOB_STORE_LEGACY_V1_SCHEMA_FINGERPRINT,
  COMPUTE_JOB_STORE_LEGACY_V1_SCHEMA_VERSION,
  ComputeJobStoreConflictError,
  PostgresComputeJobStore,
  type CommitComputeJobTransitionCommand,
  type CreateComputeJobCommand,
  type CreateComputeJobStoreOptions,
  type RegisterComputeBudgetCommand,
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

const DATABASE_URL = process.env.HOLOMESH_COMPUTE_POSTGRES_TEST_URL;
const TEAM_ID = 'team-compute-postgres-test';
const PRINCIPAL = digest('postgres-principal');
const CAPACITY = digest('postgres-capacity');
const CAPACITY_B = digest('postgres-capacity-b');
const BUDGET_RAIL_ID = 'enterprise-gpu-monthly';
const BUDGET_POLICY_DIGEST = digest('postgres-enterprise-gpu-budget-policy-v1');
const BUDGET_PERIOD_DIGEST = digest('postgres-enterprise-gpu-budget-period-2026-08');
const BUDGET_LIMIT_MINOR_UNITS = 500;
const FIXTURE_ORIGIN_MS = Math.floor(Date.now() / 1000) * 1000 - 10_000;
const at = (offsetMs: number): string => new Date(FIXTURE_ORIGIN_MS + offsetMs).toISOString();
const OBSERVED_AT = at(0);
const CHECKED_AT = at(1_000);
const PREFLIGHTED_AT = at(2_000);
const QUEUED_AT = at(3_000);
const LEASE_ISSUED_AT = at(4_000);
const RELEASED_AT = at(6_000);
const STARTING_AT = at(6_000);
const RUNNING_AT = at(7_000);
const COMPLETED_AT = at(8_000);
const ATTESTED_AT = at(9_000);
const TERMINAL_AT = at(10_000);
const SNAPSHOT_VALID_UNTIL = at(60_000);
const LEASE_EXPIRES_AT = at(5 * 60_000);
const ELIGIBILITY_VALID_UNTIL = at(60 * 60_000);
const REGISTERED_AT = at(500);
const ADMISSION_VERIFIED_AT = at(5_000);
const ADMISSION_VALID_UNTIL = at(4 * 60_000);
const STORE_VERIFICATION_AT = at(10_000);
const BUDGET_VALID_FROM = at(-60 * 60_000);
const BUDGET_VALID_UNTIL = at(60 * 60_000);
const ADMISSION_TRUST_POLICY_DIGEST = digest('compute-job-store-postgres-trust-policy-v1');
const ALL_ROLES: readonly ComputeEvidenceRole[] = [
  'capacity_observer',
  'bridge_admitter',
  'placement_planner',
  'lease_issuer',
  'execution_attestor',
  'budget_ledger_attestor',
];

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

function evidenceAuthority(): {
  signer: ComputeEvidenceSigner;
  anchor: ComputeEvidenceTrustAnchor;
} {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  return {
    signer: {
      issuer: 'urn:holoscript:test:compute-job-store-postgres',
      keyId: 'compute-job-store-postgres-key-1',
      sign: (message) => sign(null, Buffer.from(message), privateKey).toString('base64'),
    },
    anchor: {
      issuer: 'urn:holoscript:test:compute-job-store-postgres',
      keyId: 'compute-job-store-postgres-key-1',
      algorithm: 'ed25519',
      roles: ALL_ROLES,
      principalDigests: [PRINCIPAL],
      lanes: ['owned_fleet'],
      capacityRefs: [CAPACITY, CAPACITY_B],
      teamIds: [TEAM_ID],
      budgetRailIds: [BUDGET_RAIL_ID],
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
  issuer: 'urn:holoscript:test:compute-job-admission-postgres',
  keyId: 'compute-job-admission-postgres-key-1',
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

function storeOptions(databaseUrl: string): CreateComputeJobStoreOptions {
  return {
    databaseUrl,
    admissionTrustAnchors: [ADMISSION_TRUST_ANCHOR],
    admissionTrustPolicyDigest: ADMISSION_TRUST_POLICY_DIGEST,
    budgetEvidenceTrustAnchors: [authority.anchor],
    now: () => STORE_VERIFICATION_AT,
  };
}

function workUnit(maxCostMinorUnits = 0): ComputeWorkUnitContract {
  return buildComputeWorkUnit(
    {
      intent: 'Run a bounded PostgreSQL-backed GPU fleet workload.',
      allowed_accelerators: ['gpu'],
      placement_policy: 'owned_fleet',
      data_classification: 'internal',
      quality_metric: 'max_abs_error',
      quality_operator: 'lte',
      quality_threshold: 1e-5,
      quality_reference: 'cpu_reference',
      deadline_ms: 10 * 60_000,
      budget_currency: 'USD',
      max_cost_minor_units: maxCostMinorUnits,
      allow_fallback: false,
    },
    {
      objectName: 'compute-job-store-postgres-test',
      sourceDigest: 'b'.repeat(64),
      sourceDigestKind: 'source_utf8',
      compiler: 'ComputeWorkUnitCompiler',
      compilerVersion: COMPUTE_WORK_UNIT_COMPILER_VERSION,
    }
  );
}

function availableAllocation(capacityRef = CAPACITY): ComputeCapacityAllocationCursor {
  const body = {
    capacityRef,
    slotState: 'available' as const,
    currentEpoch: 0,
    version: 0,
  };
  return { ...body, etag: computeCapacityAllocationEtag(body) };
}

interface LifecycleFixture {
  readonly jobId: string;
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
  variant: 'alpha' | 'beta',
  capacityRef = CAPACITY,
  maxCostMinorUnits = 0
): LifecycleFixture {
  const jobId = digest(`postgres-job-${variant}`);
  const unit = workUnit(maxCostMinorUnits);
  const snapshot = buildComputeCapacitySnapshot({
    lane: 'owned_fleet',
    capacityRef,
    accelerator: 'gpu',
    health: 'ready',
    availableSlots: 1,
    allowedDataClassifications: ['internal'],
    observedAt: OBSERVED_AT,
    validUntil: SNAPSHOT_VALID_UNTIL,
    estimatedCost:
      maxCostMinorUnits > 0
        ? {
            measurementState: 'measured',
            currency: 'USD',
            estimatedMinorUnits: maxCostMinorUnits,
          }
        : { measurementState: 'not_applicable' },
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
    jobId,
    attempt: 1,
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
    idempotencyKey: `postgres-create-job-${variant}`,
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
    idempotencyKey: `postgres-queue-job-${variant}`,
  });
  const preparedLease = prepareComputeCapacityLease({
    principalDigest: PRINCIPAL,
    jobId,
    attempt: 1,
    holderDigest: digest(`postgres-holder-${variant}`),
    workUnit: unit,
    capacitySnapshot: snapshot,
    plan,
    issuedAt: LEASE_ISSUED_AT,
    expiresAt: LEASE_EXPIRES_AT,
    fencingToken: `postgres-fencing-token-${variant}-${'x'.repeat(48)}`,
    allocationCursor: availableAllocation(capacityRef),
    trustAnchors: TRUST_ANCHORS,
    signer: authority.signer,
  });
  const acquired = prepareComputeJobTransition({
    expectedJob: queued.nextJob,
    action: 'acquire_lease',
    preparedLease,
    leaseVerification: {
      principalDigest: PRINCIPAL,
      jobId,
      attempt: 1,
      holderDigest: digest(`postgres-holder-${variant}`),
      workUnit: unit,
      capacitySnapshot: snapshot,
      plan,
      lease: preparedLease.lease,
      at: LEASE_ISSUED_AT,
      trustAnchors: TRUST_ANCHORS,
    },
    transitionedAt: LEASE_ISSUED_AT,
    idempotencyKey: `postgres-acquire-job-${variant}`,
  });
  return {
    jobId,
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
  readonly jobId: string;
  readonly requestDigest: string;
  readonly unit: ComputeWorkUnitContract;
  readonly evidence: readonly ReturnType<typeof evidenceEnvelope>[];
  readonly lifecycle: ComputeJobAdmissionLifecycleBinding;
  readonly verifiedAt?: string;
}): ComputeJobAdmissionEnvelope {
  return createComputeJobAdmissionEnvelope(
    prepareAndSignComputeJobAdmission(
      {
        teamId: TEAM_ID,
        principalDigest: PRINCIPAL,
        jobId: input.jobId,
        attempt: 1,
        operation: input.operation,
        requestDigest: input.requestDigest,
        workUnit: input.unit,
        evidence: input.evidence,
        trustPolicyDigest: ADMISSION_TRUST_POLICY_DIGEST,
        lifecycle: input.lifecycle,
        verifiedAt: input.verifiedAt ?? ADMISSION_VERIFIED_AT,
        validUntil: ADMISSION_VALID_UNTIL,
        issuer: ADMISSION_SIGNER.issuer,
        keyId: ADMISSION_SIGNER.keyId,
      },
      ADMISSION_SIGNER
    )
  );
}

function projection(receipt: ComputeJobReceipt) {
  return { teamId: TEAM_ID, receipt, bytes: canonicalJson(receipt) };
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
      jobId: prepared.expectedJob.jobId,
      requestDigest: prepared.transition.request.requestHash,
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

function makeCreateCommand(
  fixture: LifecycleFixture,
  admissionVerifiedAt = ADMISSION_VERIFIED_AT
): CreateComputeJobCommand {
  const job = fixture.preflighted;
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
      jobId: job.jobId,
      requestDigest: job.request.requestHash,
      unit: fixture.unit,
      evidence,
      lifecycle: { kind: 'create', createdJobReceiptId: job.receiptId },
      verifiedAt: admissionVerifiedAt,
    }),
    outbox: [buildComputeJobOutboxEnvelope({ job })],
    publicResponseBytes: buildComputeJobPublicResponseBytes({ job }),
  };
}

function makeQueueCommand(fixture: LifecycleFixture): CommitComputeJobTransitionCommand {
  return {
    operation: 'compute_job.queue',
    idempotencyKeyDigest: fixture.queued.transition.request.idempotencyKeyHash,
    requestDigest: fixture.queued.transition.request.requestHash,
    ...transitionCommand(fixture.queued, [fixture.snapshot, fixture.plan], fixture.unit),
  };
}

function makeAcquireCommand(
  fixture: LifecycleFixture,
  validUntil = ELIGIBILITY_VALID_UNTIL
): CommitComputeJobTransitionCommand {
  const capacityRef = fixture.expectedAllocation.capacityRef;
  const eligibility = eligibilityBinding(validUntil, capacityRef);
  const dataPolicy = dataPolicyBinding(validUntil, capacityRef);
  return {
    operation: 'compute_job.acquire_lease',
    idempotencyKeyDigest: fixture.acquired.transition.request.idempotencyKeyHash,
    requestDigest: fixture.acquired.transition.request.requestHash,
    ...transitionCommand(
      fixture.acquired,
      [fixture.snapshot, fixture.plan, fixture.lease],
      fixture.unit
    ),
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

function capacityInstanceId(capacityRef: string): number {
  return capacityRef === CAPACITY_B ? 43 : 42;
}

function eligibilityBinding(validUntil = ELIGIBILITY_VALID_UNTIL, capacityRef = CAPACITY) {
  return {
    schemaVersion: 'holoscript.compute-fleet-resource-eligibility.v1' as const,
    capacityRef,
    provider: 'vast.ai' as const,
    instanceId: capacityInstanceId(capacityRef),
    eligible: true as const,
    validUntil,
  };
}

function dataPolicyBinding(validUntil = ELIGIBILITY_VALID_UNTIL, capacityRef = CAPACITY) {
  return {
    schemaVersion: 'holoscript.compute-fleet-data-policy.v1' as const,
    capacityRef,
    allowedDataClassifications: ['internal'],
    validUntil,
  };
}

function makeCapacityRegistration(
  fixture: LifecycleFixture,
  validUntil = ELIGIBILITY_VALID_UNTIL
): RegisterComputeCapacityCommand {
  const capacityRef = fixture.expectedAllocation.capacityRef;
  const eligibility = eligibilityBinding(validUntil, capacityRef);
  const dataPolicy = dataPolicyBinding(validUntil, capacityRef);
  return {
    projection: {
      teamId: TEAM_ID,
      lane: 'owned_fleet',
      cursor: fixture.expectedAllocation,
      bytes: canonicalJson(fixture.expectedAllocation),
    },
    eligibility,
    eligibilityBytes: canonicalJson(eligibility),
    dataPolicy,
    dataPolicyBytes: canonicalJson(dataPolicy),
    registeredAt: REGISTERED_AT,
  };
}

function budgetAccount(
  heldAmountMinorUnits: number,
  settledAmountMinorUnits: number,
  version: number
): ComputeBudgetAccountProjection {
  return { heldAmountMinorUnits, settledAmountMinorUnits, version };
}

function makeBudgetRegistration(
  validity: { readonly validFrom?: string; readonly validUntil?: string } = {}
): RegisterComputeBudgetCommand {
  const projection = {
    teamId: TEAM_ID,
    budgetRailId: BUDGET_RAIL_ID,
    currency: 'USD' as const,
    policyDigest: BUDGET_POLICY_DIGEST,
    periodDigest: BUDGET_PERIOD_DIGEST,
    validFrom: validity.validFrom ?? BUDGET_VALID_FROM,
    validUntil: validity.validUntil ?? BUDGET_VALID_UNTIL,
    limitAmountMinorUnits: BUDGET_LIMIT_MINOR_UNITS,
    account: budgetAccount(0, 0, 0),
  };
  return {
    projection,
    registrationBytes: canonicalJson(projection),
    registeredAt: REGISTERED_AT,
  };
}

function attachBudgetEvidence(
  command: CommitComputeJobTransitionCommand,
  fixture: LifecycleFixture,
  input: {
    readonly status: 'held' | 'released' | 'settled';
    readonly accountBefore: ComputeBudgetAccountProjection;
    readonly accountAfter: ComputeBudgetAccountProjection;
    readonly issuedAt: string;
    readonly settledAmountMinorUnits?: number;
    readonly measuredCostReceiptId?: string;
  }
): CommitComputeJobTransitionCommand {
  const maxAmountMinorUnits = fixture.unit.compute.budget.maxCostMinorUnits;
  const receipt = buildComputeBudgetEvidence({
    teamId: TEAM_ID,
    budgetRailId: BUDGET_RAIL_ID,
    principalDigest: PRINCIPAL,
    jobId: fixture.jobId,
    attempt: 1,
    workUnitDigest: computeWorkUnitDigest(fixture.unit),
    currency: 'USD',
    maxAmountMinorUnits,
    policyDigest: BUDGET_POLICY_DIGEST,
    periodDigest: BUDGET_PERIOD_DIGEST,
    nonceDigest: digest(
      `postgres-budget-${fixture.jobId}-${input.status}-${command.idempotencyKeyDigest}`
    ),
    idempotencyKeyHash: command.idempotencyKeyDigest,
    status: input.status,
    heldAmountMinorUnits: input.status === 'held' ? maxAmountMinorUnits : 0,
    settledAmountMinorUnits: input.settledAmountMinorUnits ?? 0,
    accountBefore: input.accountBefore,
    accountAfter: input.accountAfter,
    ...(input.measuredCostReceiptId ? { measuredCostReceiptId: input.measuredCostReceiptId } : {}),
    issuedAt: input.issuedAt,
    validFrom: BUDGET_VALID_FROM,
    validUntil: BUDGET_VALID_UNTIL,
    signer: authority.signer,
  });
  return {
    ...command,
    budgetEvidence: { receipt, bytes: canonicalJson(receipt) },
  };
}

function makeBudgetedAcquireCommand(fixture: LifecycleFixture): CommitComputeJobTransitionCommand {
  return attachBudgetEvidence(makeAcquireCommand(fixture), fixture, {
    status: 'held',
    accountBefore: budgetAccount(0, 0, 0),
    accountAfter: budgetAccount(BUDGET_LIMIT_MINOR_UNITS, 0, 1),
    issuedAt: LEASE_ISSUED_AT,
  });
}

function makeBudgetedCancelCommand(fixture: LifecycleFixture): CommitComputeJobTransitionCommand {
  const prepared = prepareComputeJobTransition({
    expectedJob: fixture.acquired.nextJob,
    action: 'cancel',
    reasonCode: 'user_cancelled',
    allocationCursor: fixture.nextAllocation,
    transitionedAt: RELEASED_AT,
    idempotencyKey: `postgres-cancel-job-${fixture.jobId}`,
  });
  const allocatorCommit = prepared.allocatorCommit;
  if (!allocatorCommit) throw new Error('leased cancellation must prepare an allocator release');
  const capacityRef = allocatorCommit.capacityRef;
  const eligibility = eligibilityBinding(ELIGIBILITY_VALID_UNTIL, capacityRef);
  const dataPolicy = dataPolicyBinding(ELIGIBILITY_VALID_UNTIL, capacityRef);
  const command: CommitComputeJobTransitionCommand = {
    operation: 'compute_job.cancel',
    idempotencyKeyDigest: prepared.transition.request.idempotencyKeyHash,
    requestDigest: prepared.transition.request.requestHash,
    ...transitionCommand(prepared, [], fixture.unit),
    expectedAllocation: {
      teamId: TEAM_ID,
      lane: 'owned_fleet',
      cursor: allocatorCommit.expectedAllocation,
      bytes: canonicalJson(allocatorCommit.expectedAllocation),
    },
    nextAllocation: {
      teamId: TEAM_ID,
      lane: 'owned_fleet',
      cursor: allocatorCommit.nextAllocation,
      bytes: canonicalJson(allocatorCommit.nextAllocation),
    },
    expectedCapacityEligibilityBytes: canonicalJson(eligibility),
    expectedCapacityDataPolicyBytes: canonicalJson(dataPolicy),
  };
  return attachBudgetEvidence(command, fixture, {
    status: 'released',
    accountBefore: budgetAccount(BUDGET_LIMIT_MINOR_UNITS, 0, 1),
    accountAfter: budgetAccount(0, 0, 2),
    issuedAt: RELEASED_AT,
  });
}

function fixtureVariant(fixture: LifecycleFixture): 'alpha' | 'beta' {
  return fixture.jobId === digest('postgres-job-beta') ? 'beta' : 'alpha';
}

function exactLeaseAuthorization(fixture: LifecycleFixture, atTime: string) {
  const variant = fixtureVariant(fixture);
  return {
    principalDigest: PRINCIPAL,
    jobId: fixture.jobId,
    attempt: 1,
    holderDigest: digest(`postgres-holder-${variant}`),
    workUnit: fixture.unit,
    capacitySnapshot: fixture.snapshot,
    plan: fixture.plan,
    lease: fixture.lease,
    at: atTime,
    trustAnchors: TRUST_ANCHORS,
    presentedFencingToken: `postgres-fencing-token-${variant}-${'x'.repeat(48)}`,
    allocationCursor: fixture.nextAllocation,
  };
}

function makeRunningSequence(fixture: LifecycleFixture): {
  readonly start: CommitComputeJobTransitionCommand;
  readonly running: CommitComputeJobTransitionCommand;
  readonly runningJob: ComputeJobReceipt;
} {
  const variant = fixtureVariant(fixture);
  const preparedStart = prepareComputeJobTransition({
    expectedJob: fixture.acquired.nextJob,
    action: 'start',
    leaseAuthorization: exactLeaseAuthorization(fixture, STARTING_AT),
    transitionedAt: STARTING_AT,
    idempotencyKey: `postgres-start-job-${variant}`,
  });
  const start: CommitComputeJobTransitionCommand = {
    operation: 'compute_job.start',
    idempotencyKeyDigest: preparedStart.transition.request.idempotencyKeyHash,
    requestDigest: preparedStart.transition.request.requestHash,
    ...transitionCommand(preparedStart, [fixture.lease], fixture.unit),
  };
  const preparedRunning = prepareComputeJobTransition({
    expectedJob: preparedStart.nextJob,
    action: 'mark_running',
    leaseAuthorization: exactLeaseAuthorization(fixture, RUNNING_AT),
    transitionedAt: RUNNING_AT,
    idempotencyKey: `postgres-running-job-${variant}`,
  });
  const running: CommitComputeJobTransitionCommand = {
    operation: 'compute_job.mark_running',
    idempotencyKeyDigest: preparedRunning.transition.request.idempotencyKeyHash,
    requestDigest: preparedRunning.transition.request.requestHash,
    ...transitionCommand(preparedRunning, [fixture.lease], fixture.unit),
  };
  return { start, running, runningJob: preparedRunning.nextJob };
}

function measuredExecutionEvidence(
  fixture: LifecycleFixture,
  terminalStatus: 'succeeded' | 'failed' | 'cancelled',
  actualMinorUnits: number
) {
  const executionReceipt = buildComputeExecutionReceipt({
    workUnit: {
      digest: computeWorkUnitDigest(fixture.unit),
      sourceEvidence: fixture.unit.source_evidence,
    },
    placement: {
      planReceiptId: fixture.plan.receiptId,
      capacityLeaseReceiptId: fixture.lease.receiptId,
      outcome: 'owned_fleet',
    },
    execution: {
      actualAccelerator: 'gpu',
      fallbackAllowed: false,
      fallbackUsed: false,
      terminalStatus,
      startedAt: RUNNING_AT,
      completedAt: COMPLETED_AT,
    },
    quality: {
      metric: fixture.unit.compute.quality.metric,
      operator: fixture.unit.compute.quality.operator,
      threshold: fixture.unit.compute.quality.threshold,
      reference: fixture.unit.compute.quality.reference,
      observedValue: terminalStatus === 'succeeded' ? 0 : 1,
      passed: terminalStatus === 'succeeded',
    },
    cost: { measurementState: 'measured', currency: 'USD', actualMinorUnits },
    hardware: {
      schemaVersion: HARDWARE_RECEIPT_METADATA_SCHEMA_VERSION,
      target: {
        id: `postgres-${fixtureVariant(fixture)}-gpu`,
        kind: 'compute-node',
        architecture: 'x86_64',
        artifactKind: 'gpu-kernel',
      },
      device: { vendor: 'Example', model: 'Postgres Test GPU', accelerator: 'gpu' },
      runtime: { name: 'CUDA', version: 'test', hostOS: 'test-os' },
      compilerVersion: COMPUTE_WORK_UNIT_COMPILER_VERSION,
      constraints: [{ id: 'max-abs-error', description: 'Match CPU reference.', limit: 1e-5 }],
      measuredResults: [
        {
          metric: 'max_abs_error',
          value: terminalStatus === 'succeeded' ? 0 : 1,
          unit: 'normalized',
          method: 'CPU reference comparison',
          sampleCount: 1,
        },
        {
          metric: 'gpu_execution_observed',
          value: 1,
          unit: 'boolean',
          method: 'instrumented dispatch',
          sampleCount: 1,
        },
      ],
      replayInputs: [
        {
          kind: 'composition',
          uri: 'holoscript://tests/postgres-compute-budget',
          sha256: 'e'.repeat(64),
        },
      ],
      provenance: {
        capturedAt: COMPLETED_AT,
        sourceCompositionHash: fixture.unit.source_evidence,
        commit: 'postgres-test-commit',
      },
      owner: { agent: 'postgres-test-runtime', team: 'HoloMesh' },
    },
  });
  const executionAttestation = attestComputeExecutionReceipt({
    principalDigest: PRINCIPAL,
    executionReceipt,
    issuedAt: ATTESTED_AT,
    signer: authority.signer,
  });
  return {
    executionReceipt,
    executionAttestation,
    verification: {
      principalDigest: PRINCIPAL,
      jobId: fixture.jobId,
      attempt: 1,
      holderDigest: digest(`postgres-holder-${fixtureVariant(fixture)}`),
      workUnit: fixture.unit,
      capacitySnapshot: fixture.snapshot,
      plan: fixture.plan,
      lease: fixture.lease,
      executionReceipt,
      executionAttestation,
      verifiedAt: TERMINAL_AT,
      trustAnchors: TRUST_ANCHORS,
    },
  };
}

function allocationTerminalCommand(
  prepared: PreparedComputeJobTransition,
  fixture: LifecycleFixture,
  evidence: readonly { readonly receiptId: string; readonly schemaVersion: string }[]
): CommitComputeJobTransitionCommand {
  const allocatorCommit = prepared.allocatorCommit;
  if (!allocatorCommit) throw new Error('terminal transition must prepare an allocator release');
  const capacityRef = allocatorCommit.capacityRef;
  const eligibility = eligibilityBinding(ELIGIBILITY_VALID_UNTIL, capacityRef);
  const dataPolicy = dataPolicyBinding(ELIGIBILITY_VALID_UNTIL, capacityRef);
  return {
    operation: `compute_job.${prepared.transition.action}`,
    idempotencyKeyDigest: prepared.transition.request.idempotencyKeyHash,
    requestDigest: prepared.transition.request.requestHash,
    ...transitionCommand(prepared, evidence, fixture.unit),
    expectedAllocation: {
      teamId: TEAM_ID,
      lane: 'owned_fleet',
      cursor: allocatorCommit.expectedAllocation,
      bytes: canonicalJson(allocatorCommit.expectedAllocation),
    },
    nextAllocation: {
      teamId: TEAM_ID,
      lane: 'owned_fleet',
      cursor: allocatorCommit.nextAllocation,
      bytes: canonicalJson(allocatorCommit.nextAllocation),
    },
    expectedCapacityEligibilityBytes: canonicalJson(eligibility),
    expectedCapacityDataPolicyBytes: canonicalJson(dataPolicy),
  };
}

function makeObservedBudgetedTerminalCommand(
  fixture: LifecycleFixture,
  runningJob: ComputeJobReceipt,
  action: 'succeed' | 'fail' | 'cancel',
  actualMinorUnits: number
): CommitComputeJobTransitionCommand {
  const terminalStatus =
    action === 'succeed' ? 'succeeded' : action === 'fail' ? 'failed' : 'cancelled';
  const execution = measuredExecutionEvidence(fixture, terminalStatus, actualMinorUnits);
  const common = {
    expectedJob: runningJob,
    executionVerification: execution.verification,
    allocationCursor: fixture.nextAllocation,
    transitionedAt: TERMINAL_AT,
    idempotencyKey: `postgres-${action}-observed-${fixtureVariant(fixture)}-${actualMinorUnits}`,
  } as const;
  const prepared =
    action === 'succeed'
      ? prepareComputeJobTransition({ ...common, action })
      : action === 'fail'
        ? prepareComputeJobTransition({ ...common, action, reasonCode: 'execution_failed' })
        : prepareComputeJobTransition({ ...common, action, reasonCode: 'system_cancelled' });
  const command = allocationTerminalCommand(prepared, fixture, [
    execution.executionReceipt,
    execution.executionAttestation,
  ]);
  return attachBudgetEvidence(command, fixture, {
    status: 'settled',
    accountBefore: budgetAccount(BUDGET_LIMIT_MINOR_UNITS, 0, 1),
    accountAfter: budgetAccount(0, actualMinorUnits, 2),
    settledAmountMinorUnits: actualMinorUnits,
    measuredCostReceiptId: execution.executionReceipt.receiptId,
    issuedAt: TERMINAL_AT,
  });
}

function makeUnobservedRunningCancelWithRelease(
  fixture: LifecycleFixture,
  runningJob: ComputeJobReceipt
): CommitComputeJobTransitionCommand {
  const prepared = prepareComputeJobTransition({
    expectedJob: runningJob,
    action: 'cancel',
    reasonCode: 'system_cancelled',
    executionUnobservedReason: 'receipt_unavailable',
    allocationCursor: fixture.nextAllocation,
    transitionedAt: TERMINAL_AT,
    idempotencyKey: `postgres-cancel-unobserved-${fixtureVariant(fixture)}`,
  });
  return attachBudgetEvidence(allocationTerminalCommand(prepared, fixture, []), fixture, {
    status: 'released',
    accountBefore: budgetAccount(BUDGET_LIMIT_MINOR_UNITS, 0, 1),
    accountAfter: budgetAccount(0, 0, 2),
    issuedAt: TERMINAL_AT,
  });
}

describe.skipIf(!DATABASE_URL)('PostgresComputeJobStore real PostgreSQL integration', () => {
  let store: PostgresComputeJobStore;
  let pool: Pool;

  beforeAll(async () => {
    pool = new Pool({ connectionString: DATABASE_URL, ssl: false, max: 4 });
    store = await PostgresComputeJobStore.create(storeOptions(DATABASE_URL as string));
  });

  beforeEach(async () => {
    await pool.query(`
      TRUNCATE TABLE
        holomesh_compute_admission_refs,
        holomesh_compute_admissions,
        holomesh_compute_budget_commits,
        holomesh_compute_budget_holds,
        holomesh_compute_budget_registrations,
        holomesh_compute_budget_accounts,
        holomesh_compute_job_command_preparations,
        holomesh_compute_job_creation_idempotency,
        holomesh_compute_idempotency,
        holomesh_compute_allocation_commits,
        holomesh_compute_transitions,
        holomesh_compute_evidence_refs,
        holomesh_compute_evidence,
        holomesh_compute_outbox,
        holomesh_compute_capacity_registrations,
        holomesh_compute_capacity_bindings,
        holomesh_compute_allocations,
        holomesh_compute_jobs
      CASCADE
    `);
  });

  async function persistBudgetedRunning(
    fixture: LifecycleFixture,
    registration = makeBudgetRegistration()
  ): Promise<ComputeJobReceipt> {
    await store.registerBudget(registration);
    await store.registerCapacity(makeCapacityRegistration(fixture));
    await store.createJob(makeCreateCommand(fixture));
    await store.commitTransition(makeQueueCommand(fixture));
    await store.commitTransition(makeBudgetedAcquireCommand(fixture));
    const running = makeRunningSequence(fixture);
    await store.commitTransition(running.start);
    await store.commitTransition(running.running);
    return running.runningJob;
  }

  async function waitUntilDatabasePeriodExpires(validUntil: string): Promise<void> {
    await pool.query(
      `SELECT pg_sleep(
         GREATEST(
           0,
           EXTRACT(EPOCH FROM ($1::timestamptz - clock_timestamp())) + 0.2
         )
       )`,
      [validUntil]
    );
  }

  afterAll(async () => {
    await store?.close();
    await pool?.end();
  });

  it('serializes two concurrent initializers from a cold database', async () => {
    await pool.query(`
      DROP TABLE IF EXISTS
        holomesh_compute_admission_refs,
        holomesh_compute_admissions,
        holomesh_compute_budget_commits,
        holomesh_compute_budget_holds,
        holomesh_compute_budget_registrations,
        holomesh_compute_budget_accounts,
        holomesh_compute_job_command_preparations,
        holomesh_compute_job_creation_idempotency,
        holomesh_compute_idempotency,
        holomesh_compute_allocation_commits,
        holomesh_compute_transitions,
        holomesh_compute_evidence_refs,
        holomesh_compute_evidence,
        holomesh_compute_outbox,
        holomesh_compute_capacity_registrations,
        holomesh_compute_capacity_bindings,
        holomesh_compute_allocations,
        holomesh_compute_jobs,
        holomesh_compute_store_meta
      CASCADE
    `);

    const initialized = await Promise.all([
      PostgresComputeJobStore.create(storeOptions(DATABASE_URL as string)),
      PostgresComputeJobStore.create(storeOptions(DATABASE_URL as string)),
    ]);
    await Promise.all(initialized.map((candidate) => candidate.close()));

    const metadata = await pool.query<{ count: string }>(
      'SELECT COUNT(*)::text AS count FROM holomesh_compute_store_meta WHERE singleton = TRUE'
    );
    expect(metadata.rows[0]?.count).toBe('1');
  });

  it('migrates the exact deployed v1 custody schema to v2 without a clean database', async () => {
    await pool.query(`
      DROP TABLE holomesh_compute_budget_commits,
                 holomesh_compute_budget_holds,
                 holomesh_compute_budget_registrations,
                 holomesh_compute_budget_accounts CASCADE;
      DROP TABLE holomesh_compute_idempotency;
      CREATE TABLE holomesh_compute_idempotency (
        team_id                      TEXT NOT NULL,
        principal_digest             TEXT NOT NULL CHECK (principal_digest ~ '^sha256:[0-9a-f]{64}$'),
        operation                    TEXT NOT NULL,
        key_digest                   TEXT NOT NULL CHECK (key_digest ~ '^sha256:[0-9a-f]{64}$'),
        request_digest               TEXT NOT NULL CHECK (request_digest ~ '^sha256:[0-9a-f]{64}$'),
        status                       TEXT NOT NULL CHECK (status IN ('pending', 'committed')),
        job_id                       TEXT NOT NULL CHECK (job_id ~ '^sha256:[0-9a-f]{64}$'),
        attempt                      BIGINT NOT NULL CHECK (attempt >= 1),
        transition_receipt_id        TEXT,
        allocation_commit_receipt_id TEXT,
        admission_receipt_id         TEXT CHECK (
          admission_receipt_id IS NULL OR admission_receipt_id ~ '^sha256:[0-9a-f]{64}$'
        ),
        public_response_bytes        TEXT,
        created_at                   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        committed_at                 TIMESTAMPTZ,
        PRIMARY KEY (team_id, principal_digest, operation, key_digest),
        CHECK (
          (status = 'pending' AND transition_receipt_id IS NULL
                              AND allocation_commit_receipt_id IS NULL
                              AND admission_receipt_id IS NULL
                              AND public_response_bytes IS NULL
                              AND committed_at IS NULL) OR
          (status = 'committed' AND transition_receipt_id IS NOT NULL
                                AND admission_receipt_id IS NOT NULL
                                AND public_response_bytes IS NOT NULL
                                AND committed_at IS NOT NULL)
        )
      );
      UPDATE holomesh_compute_store_meta
      SET schema_version = '${COMPUTE_JOB_STORE_LEGACY_V1_SCHEMA_VERSION}',
          schema_fingerprint = '${COMPUTE_JOB_STORE_LEGACY_V1_SCHEMA_FINGERPRINT}'
      WHERE singleton = TRUE;
    `);

    const upgraded = await PostgresComputeJobStore.create(storeOptions(DATABASE_URL as string));
    await upgraded.close();
    const proof = await pool.query<{
      schema_version: string;
      schema_fingerprint: string;
      budget_relations: string;
      budget_column: string;
      state_constraint: string;
    }>(`
      SELECT m.schema_version, m.schema_fingerprint,
             (SELECT COUNT(*)::text FROM pg_catalog.pg_class c
              JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
              WHERE n.nspname = current_schema() AND c.relkind = 'r'
                AND c.relname IN (
                  'holomesh_compute_budget_accounts',
                  'holomesh_compute_budget_registrations',
                  'holomesh_compute_budget_holds',
                  'holomesh_compute_budget_commits'
                )) AS budget_relations,
             (SELECT COUNT(*)::text FROM information_schema.columns
              WHERE table_schema = current_schema()
                AND table_name = 'holomesh_compute_idempotency'
                AND column_name = 'budget_evidence_receipt_id') AS budget_column,
             (SELECT COUNT(*)::text FROM pg_catalog.pg_constraint
              WHERE conrelid = 'holomesh_compute_idempotency'::regclass
                AND conname = 'holomesh_compute_idempotency_state_check') AS state_constraint
      FROM holomesh_compute_store_meta m WHERE singleton = TRUE
    `);
    expect(proof.rows[0]).toEqual({
      schema_version: COMPUTE_JOB_STORE_SCHEMA_VERSION,
      schema_fingerprint: COMPUTE_JOB_STORE_SCHEMA_FINGERPRINT,
      budget_relations: '4',
      budget_column: '1',
      state_constraint: '1',
    });
  });

  it('persists first-prepared create bytes, rejects semantic reuse, and reads exact WorkUnit bytes', async () => {
    const fixture = lifecycleFixture('alpha');
    const first = makeCreateCommand(fixture);
    const regenerated = makeCreateCommand(fixture, at(6_000));
    expect(regenerated.semanticRequestDigest).toBe(first.semanticRequestDigest);
    expect(regenerated.admission.bytes).not.toBe(first.admission.bytes);

    await expect(store.createJob(first)).resolves.toMatchObject({ disposition: 'committed' });
    const prepared = await pool.query<{ command_bytes: string }>(
      `SELECT command_bytes
       FROM holomesh_compute_job_command_preparations
       WHERE team_id = $1 AND principal_digest = $2
         AND operation = $3 AND key_digest = $4`,
      [TEAM_ID, PRINCIPAL, first.operation, first.idempotencyKeyDigest]
    );
    expect(prepared.rows).toHaveLength(1);
    const firstCommandBytes = prepared.rows[0]?.command_bytes;
    expect(firstCommandBytes).not.toContain('postgres-create-job-alpha');

    await expect(store.createJob(regenerated)).resolves.toMatchObject({
      disposition: 'replayed',
      readBack: { admissionReceiptId: first.admission.receipt.receiptId },
    });
    const replayed = await pool.query<{ command_bytes: string }>(
      `SELECT command_bytes
       FROM holomesh_compute_job_command_preparations
       WHERE team_id = $1 AND principal_digest = $2
         AND operation = $3 AND key_digest = $4`,
      [TEAM_ID, PRINCIPAL, first.operation, first.idempotencyKeyDigest]
    );
    expect(replayed.rows[0]?.command_bytes).toBe(firstCommandBytes);
    await expect(store.readWorkUnit(TEAM_ID, first.workUnit.digest)).resolves.toEqual(
      first.workUnit
    );

    await expect(
      store.createJob({ ...regenerated, semanticRequestDigest: digest('other semantics') })
    ).rejects.toMatchObject({ code: 'idempotency_key_reused' });
    await expect(
      pool.query(
        `UPDATE holomesh_compute_job_command_preparations
         SET command_bytes = command_bytes
         WHERE team_id = $1 AND principal_digest = $2
           AND operation = $3 AND key_digest = $4`,
        [TEAM_ID, PRINCIPAL, first.operation, first.idempotencyKeyDigest]
      )
    ).rejects.toMatchObject({ code: '55000' });
  });

  it('atomically admits exactly one of two distinct jobs competing for one capacity', async () => {
    const alphaFixture = lifecycleFixture('alpha');
    const betaFixture = lifecycleFixture('beta');
    const alphaCreate = makeCreateCommand(alphaFixture);
    const betaCreate = makeCreateCommand(betaFixture);
    const alphaQueue = makeQueueCommand(alphaFixture);
    const betaQueue = makeQueueCommand(betaFixture);
    const alpha = makeAcquireCommand(alphaFixture);
    const beta = makeAcquireCommand(betaFixture);

    await expect(
      store.registerCapacity(makeCapacityRegistration(alphaFixture))
    ).resolves.toMatchObject({
      disposition: 'committed',
    });
    for (const create of [alphaCreate, betaCreate]) {
      await expect(store.createJob(create)).resolves.toMatchObject({
        disposition: 'committed',
        jobReceiptId: create.job.receipt.receiptId,
        readBack: { admissionReceiptId: create.admission.receipt.receiptId },
      });
    }
    for (const queue of [alphaQueue, betaQueue]) {
      await expect(store.commitTransition(queue)).resolves.toMatchObject({
        disposition: 'committed',
        transitionReceiptId: queue.transition.receipt.receiptId,
        readBack: { admissionReceiptId: queue.admission.receipt.receiptId },
      });
      const queued = await store.readJob({
        teamId: TEAM_ID,
        jobId: queue.nextJob.receipt.jobId,
        attempt: 1,
      });
      expect(queued.bytes).toBe(queue.nextJob.bytes);
    }

    const raced = await Promise.allSettled([
      store.commitTransition(alpha),
      store.commitTransition(beta),
    ]);
    const winners = raced.filter(
      (
        result
      ): result is PromiseFulfilledResult<Awaited<ReturnType<typeof store.commitTransition>>> =>
        result.status === 'fulfilled'
    );
    const losers = raced.filter(
      (result): result is PromiseRejectedResult => result.status === 'rejected'
    );

    expect(winners).toHaveLength(1);
    expect(losers).toHaveLength(1);
    expect(losers[0].reason).toBeInstanceOf(ComputeJobStoreConflictError);
    expect((losers[0].reason as ComputeJobStoreConflictError).code).toBe('allocation_cas_conflict');

    const winnerCommand =
      winners[0].value.publicResponseBytes === alpha.publicResponseBytes ? alpha : beta;
    const loserCommand = winnerCommand === alpha ? beta : alpha;
    expect(winners[0].value).toMatchObject({
      disposition: 'committed',
      publicResponseBytes: winnerCommand.publicResponseBytes,
      readBack: { admissionReceiptId: winnerCommand.admission.receipt.receiptId },
    });
    expect(JSON.parse(winners[0].value.publicResponseBytes)).toMatchObject({
      providerReservation: 'not_asserted',
      execution: 'not_asserted',
    });

    const durableJob = await store.readJob({
      teamId: TEAM_ID,
      jobId: winnerCommand.nextJob.receipt.jobId,
      attempt: 1,
    });
    const losingJob = await store.readJob({
      teamId: TEAM_ID,
      jobId: loserCommand.expectedJob.receipt.jobId,
      attempt: 1,
    });
    const durableCapacity = await store.readRegisteredCapacity({
      teamId: TEAM_ID,
      capacityRef: CAPACITY,
    });
    expect(durableJob.bytes).toBe(winnerCommand.nextJob.bytes);
    expect(durableCapacity.projection.bytes).toBe(winnerCommand.nextAllocation?.bytes);
    expect(durableJob.receipt.lease?.receiptId).toBe(
      durableCapacity.projection.cursor.currentLeaseReceiptId
    );
    expect(losingJob.receipt.state).toBe('queued');
    expect(losingJob.bytes).toBe(loserCommand.expectedJob.bytes);

    const replay = await store.commitTransition(winnerCommand);
    expect(replay.disposition).toBe('replayed');
    expect(replay.publicResponseBytes).toBe(winnerCommand.publicResponseBytes);

    const counts = await pool.query<{
      job_creations: string;
      admissions: string;
      admission_refs: string;
      transitions: string;
      allocation_commits: string;
      evidence: string;
      committed_idempotency: string;
      pending_idempotency: string;
    }>(`
      SELECT
        (SELECT COUNT(*) FROM holomesh_compute_job_creation_idempotency
          WHERE status = 'committed')::text AS job_creations,
        (SELECT COUNT(*) FROM holomesh_compute_admissions)::text AS admissions,
        (SELECT COUNT(*) FROM holomesh_compute_admission_refs)::text AS admission_refs,
        (SELECT COUNT(*) FROM holomesh_compute_transitions)::text AS transitions,
        (SELECT COUNT(*) FROM holomesh_compute_allocation_commits)::text AS allocation_commits,
        (SELECT COUNT(*) FROM holomesh_compute_evidence)::text AS evidence,
        (SELECT COUNT(*) FROM holomesh_compute_idempotency WHERE status = 'committed')::text
          AS committed_idempotency,
        (SELECT COUNT(*) FROM holomesh_compute_idempotency WHERE status = 'pending')::text
          AS pending_idempotency
    `);
    expect(counts.rows[0]).toEqual({
      job_creations: '2',
      admissions: '5',
      admission_refs: '5',
      transitions: '3',
      allocation_commits: '1',
      evidence: '3',
      committed_idempotency: '3',
      pending_idempotency: '0',
    });
  });

  it('serializes concurrent period registration and rejects overlapping limits on one rail', async () => {
    const first = makeBudgetRegistration();
    const secondProjection = {
      ...first.projection,
      policyDigest: digest('postgres-overlapping-budget-policy-v2'),
      periodDigest: digest('postgres-overlapping-budget-period-v2'),
      validFrom: at(-30 * 60_000),
      validUntil: at(30 * 60_000),
    };
    const second: RegisterComputeBudgetCommand = {
      projection: secondProjection,
      registrationBytes: canonicalJson(secondProjection),
      registeredAt: REGISTERED_AT,
    };

    const raced = await Promise.allSettled([
      store.registerBudget(first),
      store.registerBudget(second),
    ]);
    expect(raced.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const rejected = raced.filter(
      (result): result is PromiseRejectedResult => result.status === 'rejected'
    );
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toMatchObject({ code: 'budget_registration_conflict' });
    const counts = await pool.query<{ accounts: string; registrations: string }>(`
      SELECT
        (SELECT COUNT(*) FROM holomesh_compute_budget_accounts)::text AS accounts,
        (SELECT COUNT(*) FROM holomesh_compute_budget_registrations)::text AS registrations
    `);
    expect(counts.rows[0]).toEqual({ accounts: '1', registrations: '1' });
  });

  it('atomically couples independent slot leases to one enterprise budget hold', async () => {
    const alphaFixture = lifecycleFixture('alpha', CAPACITY, BUDGET_LIMIT_MINOR_UNITS);
    const betaFixture = lifecycleFixture('beta', CAPACITY_B, BUDGET_LIMIT_MINOR_UNITS);
    const fixtures = [alphaFixture, betaFixture] as const;

    await expect(store.registerBudget(makeBudgetRegistration())).resolves.toMatchObject({
      disposition: 'committed',
      budgetRailId: BUDGET_RAIL_ID,
      periodDigest: BUDGET_PERIOD_DIGEST,
      accountBytes: canonicalJson(budgetAccount(0, 0, 0)),
    });
    for (const fixture of fixtures) {
      await expect(
        store.registerCapacity(makeCapacityRegistration(fixture))
      ).resolves.toMatchObject({
        disposition: 'committed',
        capacityRef: fixture.expectedAllocation.capacityRef,
      });
      await expect(store.createJob(makeCreateCommand(fixture))).resolves.toMatchObject({
        disposition: 'committed',
      });
      await expect(store.commitTransition(makeQueueCommand(fixture))).resolves.toMatchObject({
        disposition: 'committed',
      });
    }

    const alpha = makeBudgetedAcquireCommand(alphaFixture);
    const beta = makeBudgetedAcquireCommand(betaFixture);
    const raced = await Promise.allSettled([
      store.commitTransition(alpha),
      store.commitTransition(beta),
    ]);
    const winners = raced.filter(
      (
        result
      ): result is PromiseFulfilledResult<Awaited<ReturnType<typeof store.commitTransition>>> =>
        result.status === 'fulfilled'
    );
    const losers = raced.filter(
      (result): result is PromiseRejectedResult => result.status === 'rejected'
    );

    expect(winners).toHaveLength(1);
    expect(losers).toHaveLength(1);
    expect(losers[0].reason).toBeInstanceOf(ComputeJobStoreConflictError);
    expect((losers[0].reason as ComputeJobStoreConflictError).code).toBe('budget_cas_conflict');

    const winnerCommand =
      winners[0].value.publicResponseBytes === alpha.publicResponseBytes ? alpha : beta;
    const loserCommand = winnerCommand === alpha ? beta : alpha;
    const winnerFixture = winnerCommand === alpha ? alphaFixture : betaFixture;
    expect(winners[0].value).toMatchObject({
      disposition: 'committed',
      budgetEvidenceReceiptId: winnerCommand.budgetEvidence?.receipt.receiptId,
      readBack: {
        budgetEvidenceReceiptId: winnerCommand.budgetEvidence?.receipt.receiptId,
      },
    });
    expect(JSON.parse(winners[0].value.publicResponseBytes)).toMatchObject({
      providerReservation: 'not_asserted',
      execution: 'not_asserted',
    });

    const winnerJob = await store.readJob({
      teamId: TEAM_ID,
      jobId: winnerCommand.nextJob.receipt.jobId,
      attempt: 1,
    });
    const loserJob = await store.readJob({
      teamId: TEAM_ID,
      jobId: loserCommand.expectedJob.receipt.jobId,
      attempt: 1,
    });
    const winnerCapacity = await store.readRegisteredCapacity({
      teamId: TEAM_ID,
      capacityRef: winnerCommand.nextAllocation?.cursor.capacityRef as string,
    });
    const loserCapacity = await store.readRegisteredCapacity({
      teamId: TEAM_ID,
      capacityRef: loserCommand.nextAllocation?.cursor.capacityRef as string,
    });
    expect(winnerJob.bytes).toBe(winnerCommand.nextJob.bytes);
    expect(winnerCapacity.projection.bytes).toBe(winnerCommand.nextAllocation?.bytes);
    expect(loserJob.bytes).toBe(loserCommand.expectedJob.bytes);
    expect(loserJob.receipt.state).toBe('queued');
    expect(loserCapacity.projection.cursor.slotState).toBe('available');
    expect(loserCapacity.projection.cursor.version).toBe(0);

    const heldBudget = await store.readRegisteredBudget({
      teamId: TEAM_ID,
      budgetRailId: BUDGET_RAIL_ID,
      currency: 'USD',
      periodDigest: BUDGET_PERIOD_DIGEST,
    });
    expect(heldBudget.projection.account).toEqual(budgetAccount(BUDGET_LIMIT_MINOR_UNITS, 0, 1));
    expect(heldBudget.accountBytes).toBe(
      canonicalJson(budgetAccount(BUDGET_LIMIT_MINOR_UNITS, 0, 1))
    );

    const afterRace = await pool.query<{
      holds: string;
      commits: string;
      loser_holds: string;
      loser_commits: string;
      loser_transitions: string;
      loser_allocation_commits: string;
      loser_idempotency: string;
    }>(
      `SELECT
         (SELECT COUNT(*) FROM holomesh_compute_budget_holds)::text AS holds,
         (SELECT COUNT(*) FROM holomesh_compute_budget_commits)::text AS commits,
         (SELECT COUNT(*) FROM holomesh_compute_budget_holds
           WHERE team_id = $1 AND job_id = $2 AND attempt = 1)::text AS loser_holds,
         (SELECT COUNT(*) FROM holomesh_compute_budget_commits
           WHERE team_id = $1 AND job_id = $2 AND attempt = 1)::text AS loser_commits,
         (SELECT COUNT(*) FROM holomesh_compute_transitions
           WHERE team_id = $1 AND transition_receipt_id = $3)::text AS loser_transitions,
         (SELECT COUNT(*) FROM holomesh_compute_allocation_commits
           WHERE team_id = $1 AND allocation_commit_receipt_id = $4)::text
           AS loser_allocation_commits,
         (SELECT COUNT(*) FROM holomesh_compute_idempotency
           WHERE team_id = $1 AND operation = $5 AND key_digest = $6)::text
           AS loser_idempotency`,
      [
        TEAM_ID,
        loserCommand.expectedJob.receipt.jobId,
        loserCommand.transition.receipt.receiptId,
        loserCommand.allocationCommit?.receipt.receiptId,
        loserCommand.operation,
        loserCommand.idempotencyKeyDigest,
      ]
    );
    expect(afterRace.rows[0]).toEqual({
      holds: '1',
      commits: '1',
      loser_holds: '0',
      loser_commits: '0',
      loser_transitions: '0',
      loser_allocation_commits: '0',
      loser_idempotency: '0',
    });

    const acquireReplay = await store.commitTransition(winnerCommand);
    expect(acquireReplay).toMatchObject({
      disposition: 'replayed',
      budgetEvidenceReceiptId: winnerCommand.budgetEvidence?.receipt.receiptId,
    });
    const afterReplay = await store.readRegisteredBudget({
      teamId: TEAM_ID,
      budgetRailId: BUDGET_RAIL_ID,
      currency: 'USD',
      periodDigest: BUDGET_PERIOD_DIGEST,
    });
    expect(afterReplay.projection.account).toEqual(budgetAccount(BUDGET_LIMIT_MINOR_UNITS, 0, 1));
    const replayCounts = await pool.query<{ holds: string; commits: string }>(`
      SELECT
        (SELECT COUNT(*) FROM holomesh_compute_budget_holds)::text AS holds,
        (SELECT COUNT(*) FROM holomesh_compute_budget_commits)::text AS commits
    `);
    expect(replayCounts.rows[0]).toEqual({ holds: '1', commits: '1' });

    const cancel = makeBudgetedCancelCommand(winnerFixture);
    await expect(store.commitTransition(cancel)).resolves.toMatchObject({
      disposition: 'committed',
      budgetEvidenceReceiptId: cancel.budgetEvidence?.receipt.receiptId,
    });
    const releasedBudget = await store.readRegisteredBudget({
      teamId: TEAM_ID,
      budgetRailId: BUDGET_RAIL_ID,
      currency: 'USD',
      periodDigest: BUDGET_PERIOD_DIGEST,
    });
    expect(releasedBudget.projection.account).toEqual(budgetAccount(0, 0, 2));
    const releasedCapacity = await store.readRegisteredCapacity({
      teamId: TEAM_ID,
      capacityRef: winnerFixture.expectedAllocation.capacityRef,
    });
    expect(releasedCapacity.projection.cursor).toMatchObject({
      slotState: 'available',
      version: 2,
    });
    const releasedJob = await store.readJob({
      teamId: TEAM_ID,
      jobId: winnerFixture.jobId,
      attempt: 1,
    });
    expect(releasedJob.receipt.state).toBe('cancelled');

    const releaseReplay = await store.commitTransition(cancel);
    expect(releaseReplay.disposition).toBe('replayed');
    const finalBudgetRows = await pool.query<{
      held_amount_minor_units: string;
      settled_amount_minor_units: string;
      version: string;
      hold_status: string;
      current_receipt_id: string;
      commits: string;
    }>(
      `SELECT a.held_amount_minor_units::text, a.settled_amount_minor_units::text,
              a.version::text, h.status AS hold_status,
              h.current_receipt_id,
              (SELECT COUNT(*) FROM holomesh_compute_budget_commits)::text AS commits
       FROM holomesh_compute_budget_accounts a
       JOIN holomesh_compute_budget_holds h
         ON h.team_id = a.team_id AND h.budget_rail_id = a.budget_rail_id
        AND h.currency = a.currency AND h.period_digest = a.period_digest
       WHERE a.team_id = $1 AND a.budget_rail_id = $2
         AND a.currency = 'USD' AND a.period_digest = $3`,
      [TEAM_ID, BUDGET_RAIL_ID, BUDGET_PERIOD_DIGEST]
    );
    expect(finalBudgetRows.rows).toEqual([
      {
        held_amount_minor_units: '0',
        settled_amount_minor_units: '0',
        version: '2',
        hold_status: 'released',
        current_receipt_id: cancel.budgetEvidence?.receipt.receiptId,
        commits: '2',
      },
    ]);
  });

  it('rejects a new held acquisition after its registered period expires and rolls back fully', async () => {
    const fixture = lifecycleFixture('alpha', CAPACITY, BUDGET_LIMIT_MINOR_UNITS);
    const periodValidUntil = new Date(Date.now() + 3_000).toISOString();
    const registration = makeBudgetRegistration({ validUntil: periodValidUntil });
    await store.registerBudget(registration);
    await store.registerCapacity(makeCapacityRegistration(fixture));
    await store.createJob(makeCreateCommand(fixture));
    await store.commitTransition(makeQueueCommand(fixture));
    await waitUntilDatabasePeriodExpires(periodValidUntil);

    const acquire = makeBudgetedAcquireCommand(fixture);
    expect(acquire.budgetEvidence?.receipt.validUntil).toBe(BUDGET_VALID_UNTIL);
    expect(periodValidUntil).not.toBe(BUDGET_VALID_UNTIL);
    await expect(store.commitTransition(acquire)).rejects.toMatchObject({
      code: 'budget_cas_conflict',
    });

    const [job, capacity, budget] = await Promise.all([
      store.readJob({ teamId: TEAM_ID, jobId: fixture.jobId, attempt: 1 }),
      store.readRegisteredCapacity({ teamId: TEAM_ID, capacityRef: CAPACITY }),
      store.readRegisteredBudget({
        teamId: TEAM_ID,
        budgetRailId: BUDGET_RAIL_ID,
        currency: 'USD',
        periodDigest: BUDGET_PERIOD_DIGEST,
      }),
    ]);
    expect(job.receipt.state).toBe('queued');
    expect(job.bytes).toBe(acquire.expectedJob.bytes);
    expect(capacity.projection.cursor).toMatchObject({ slotState: 'available', version: 0 });
    expect(capacity.projection.cursor.currentLeaseReceiptId).toBeUndefined();
    expect(budget.projection).toMatchObject({
      validUntil: periodValidUntil,
      account: budgetAccount(0, 0, 0),
    });
    const durable = await pool.query<{
      holds: string;
      budget_commits: string;
      transitions: string;
      allocation_commits: string;
      idempotency: string;
    }>(
      `SELECT
         (SELECT COUNT(*) FROM holomesh_compute_budget_holds)::text AS holds,
         (SELECT COUNT(*) FROM holomesh_compute_budget_commits)::text AS budget_commits,
         (SELECT COUNT(*) FROM holomesh_compute_transitions
           WHERE team_id = $1 AND transition_receipt_id = $2)::text AS transitions,
         (SELECT COUNT(*) FROM holomesh_compute_allocation_commits
           WHERE team_id = $1 AND transition_receipt_id = $2)::text AS allocation_commits,
         (SELECT COUNT(*) FROM holomesh_compute_idempotency
           WHERE team_id = $1 AND operation = $3 AND key_digest = $4)::text AS idempotency`,
      [
        TEAM_ID,
        acquire.transition.receipt.receiptId,
        acquire.operation,
        acquire.idempotencyKeyDigest,
      ]
    );
    expect(durable.rows[0]).toEqual({
      holds: '0',
      budget_commits: '0',
      transitions: '0',
      allocation_commits: '0',
      idempotency: '0',
    });
  });

  it('atomically releases a pre-expiry hold after its registered budget period ends', async () => {
    const fixture = lifecycleFixture('alpha', CAPACITY, BUDGET_LIMIT_MINOR_UNITS);
    const periodValidUntil = new Date(Date.now() + 4_000).toISOString();
    const registration = makeBudgetRegistration({ validUntil: periodValidUntil });
    await store.registerBudget(registration);
    await store.registerCapacity(makeCapacityRegistration(fixture));
    await store.createJob(makeCreateCommand(fixture));
    await store.commitTransition(makeQueueCommand(fixture));
    const acquire = makeBudgetedAcquireCommand(fixture);
    await expect(store.commitTransition(acquire)).resolves.toMatchObject({
      disposition: 'committed',
      budgetEvidenceReceiptId: acquire.budgetEvidence?.receipt.receiptId,
    });
    expect(acquire.budgetEvidence?.receipt.validUntil).toBe(BUDGET_VALID_UNTIL);
    expect(periodValidUntil).not.toBe(BUDGET_VALID_UNTIL);

    await waitUntilDatabasePeriodExpires(periodValidUntil);
    const expired = await pool.query<{ expired: boolean }>(
      'SELECT clock_timestamp() >= $1::timestamptz AS expired',
      [periodValidUntil]
    );
    expect(expired.rows[0]?.expired).toBe(true);

    const cancel = makeBudgetedCancelCommand(fixture);
    const committed = await store.commitTransition(cancel);
    expect(committed).toMatchObject({
      disposition: 'committed',
      budgetEvidenceReceiptId: cancel.budgetEvidence?.receipt.receiptId,
      readBack: { budgetEvidenceReceiptId: cancel.budgetEvidence?.receipt.receiptId },
    });
    const [job, capacity, budget] = await Promise.all([
      store.readJob({ teamId: TEAM_ID, jobId: fixture.jobId, attempt: 1 }),
      store.readRegisteredCapacity({ teamId: TEAM_ID, capacityRef: CAPACITY }),
      store.readRegisteredBudget({
        teamId: TEAM_ID,
        budgetRailId: BUDGET_RAIL_ID,
        currency: 'USD',
        periodDigest: BUDGET_PERIOD_DIGEST,
      }),
    ]);
    expect(job.receipt.state).toBe('cancelled');
    expect(capacity.projection.cursor).toMatchObject({
      slotState: 'available',
      version: 2,
    });
    expect(capacity.projection.cursor.currentLeaseReceiptId).toBeUndefined();
    expect(budget.projection).toMatchObject({
      validUntil: periodValidUntil,
      account: budgetAccount(0, 0, 2),
    });
    const durable = await pool.query<{
      hold_status: string;
      held: string;
      settled: string;
      current_receipt_id: string;
      budget_commits: string;
      terminal_transitions: string;
      terminal_allocation_commits: string;
    }>(
      `SELECT h.status AS hold_status,
              h.held_amount_minor_units::text AS held,
              h.settled_amount_minor_units::text AS settled,
              h.current_receipt_id,
              (SELECT COUNT(*) FROM holomesh_compute_budget_commits)::text
                AS budget_commits,
              (SELECT COUNT(*) FROM holomesh_compute_transitions
                WHERE team_id = $1 AND transition_receipt_id = $3)::text
                AS terminal_transitions,
              (SELECT COUNT(*) FROM holomesh_compute_allocation_commits
                WHERE team_id = $1 AND transition_receipt_id = $3)::text
                AS terminal_allocation_commits
       FROM holomesh_compute_budget_holds h
       WHERE h.team_id = $1 AND h.job_id = $2 AND h.attempt = 1`,
      [TEAM_ID, fixture.jobId, cancel.transition.receipt.receiptId]
    );
    expect(durable.rows).toEqual([
      {
        hold_status: 'released',
        held: '0',
        settled: '0',
        current_receipt_id: cancel.budgetEvidence?.receipt.receiptId,
        budget_commits: '2',
        terminal_transitions: '1',
        terminal_allocation_commits: '1',
      },
    ]);
    await expect(store.commitTransition(cancel)).resolves.toMatchObject({
      disposition: 'replayed',
    });
    const replayCount = await pool.query<{ commits: string }>(
      'SELECT COUNT(*)::text AS commits FROM holomesh_compute_budget_commits'
    );
    expect(replayCount.rows[0]?.commits).toBe('2');
  });

  it.each([
    { label: 'positive', actualMinorUnits: 350 },
    { label: 'measured-zero', actualMinorUnits: 0 },
  ])(
    'atomically records $label metered settlement and allocator release exactly once',
    async ({ actualMinorUnits }) => {
      const fixture = lifecycleFixture('alpha', CAPACITY, BUDGET_LIMIT_MINOR_UNITS);
      const runningJob = await persistBudgetedRunning(fixture);
      const command = makeObservedBudgetedTerminalCommand(
        fixture,
        runningJob,
        'succeed',
        actualMinorUnits
      );

      await expect(store.commitTransition(command)).resolves.toMatchObject({
        disposition: 'committed',
        budgetEvidenceReceiptId: command.budgetEvidence?.receipt.receiptId,
      });
      const account = await store.readRegisteredBudget({
        teamId: TEAM_ID,
        budgetRailId: BUDGET_RAIL_ID,
        currency: 'USD',
        periodDigest: BUDGET_PERIOD_DIGEST,
      });
      expect(account.projection.account).toEqual(budgetAccount(0, actualMinorUnits, 2));
      const durable = await pool.query<{
        status: string;
        held: string;
        settled: string;
        measured_cost_receipt_id: string | null;
        commits: string;
      }>(
        `
        SELECT h.status, h.held_amount_minor_units::text AS held,
               h.settled_amount_minor_units::text AS settled,
               h.measured_cost_receipt_id,
               (SELECT COUNT(*) FROM holomesh_compute_budget_commits)::text AS commits
        FROM holomesh_compute_budget_holds h
        WHERE h.team_id = $1 AND h.job_id = $2 AND h.attempt = 1
      `,
        [TEAM_ID, fixture.jobId]
      );
      expect(durable.rows).toEqual([
        {
          status: 'settled',
          held: '0',
          settled: String(actualMinorUnits),
          measured_cost_receipt_id: command.budgetEvidence?.receipt.measuredCostReceiptId,
          commits: '2',
        },
      ]);
      expect(durable.rows[0].measured_cost_receipt_id).toMatch(/^sha256:[a-f0-9]{64}$/);

      await expect(store.commitTransition(command)).resolves.toMatchObject({
        disposition: 'replayed',
      });
      const replayCounts = await pool.query<{ commits: string }>(
        'SELECT COUNT(*)::text AS commits FROM holomesh_compute_budget_commits'
      );
      expect(replayCounts.rows[0]?.commits).toBe('2');
    }
  );

  it('atomically settles measured execution after its held budget period ends', async () => {
    const fixture = lifecycleFixture('alpha', CAPACITY, BUDGET_LIMIT_MINOR_UNITS);
    const periodValidUntil = new Date(Date.now() + 4_000).toISOString();
    const registration = makeBudgetRegistration({ validUntil: periodValidUntil });
    const runningJob = await persistBudgetedRunning(fixture, registration);
    await waitUntilDatabasePeriodExpires(periodValidUntil);
    const expired = await pool.query<{ expired: boolean }>(
      'SELECT clock_timestamp() >= $1::timestamptz AS expired',
      [periodValidUntil]
    );
    expect(expired.rows[0]?.expired).toBe(true);

    const command = makeObservedBudgetedTerminalCommand(fixture, runningJob, 'succeed', 350);
    expect(command.budgetEvidence?.receipt.validUntil).toBe(BUDGET_VALID_UNTIL);
    expect(periodValidUntil).not.toBe(BUDGET_VALID_UNTIL);
    const committed = await store.commitTransition(command);
    expect(committed).toMatchObject({
      disposition: 'committed',
      budgetEvidenceReceiptId: command.budgetEvidence?.receipt.receiptId,
      readBack: { budgetEvidenceReceiptId: command.budgetEvidence?.receipt.receiptId },
    });
    const [job, capacity, budget] = await Promise.all([
      store.readJob({ teamId: TEAM_ID, jobId: fixture.jobId, attempt: 1 }),
      store.readRegisteredCapacity({ teamId: TEAM_ID, capacityRef: CAPACITY }),
      store.readRegisteredBudget({
        teamId: TEAM_ID,
        budgetRailId: BUDGET_RAIL_ID,
        currency: 'USD',
        periodDigest: BUDGET_PERIOD_DIGEST,
      }),
    ]);
    expect(job.receipt.state).toBe('succeeded');
    expect(capacity.projection.cursor).toMatchObject({
      slotState: 'available',
      version: 2,
    });
    expect(capacity.projection.cursor.currentLeaseReceiptId).toBeUndefined();
    expect(budget.projection).toMatchObject({
      validUntil: periodValidUntil,
      account: budgetAccount(0, 350, 2),
    });
    const durable = await pool.query<{
      hold_status: string;
      held: string;
      settled: string;
      measured_cost_receipt_id: string;
      current_receipt_id: string;
      budget_commits: string;
      terminal_transitions: string;
      terminal_allocation_commits: string;
    }>(
      `SELECT h.status AS hold_status,
              h.held_amount_minor_units::text AS held,
              h.settled_amount_minor_units::text AS settled,
              h.measured_cost_receipt_id,
              h.current_receipt_id,
              (SELECT COUNT(*) FROM holomesh_compute_budget_commits)::text
                AS budget_commits,
              (SELECT COUNT(*) FROM holomesh_compute_transitions
                WHERE team_id = $1 AND transition_receipt_id = $3)::text
                AS terminal_transitions,
              (SELECT COUNT(*) FROM holomesh_compute_allocation_commits
                WHERE team_id = $1 AND transition_receipt_id = $3)::text
                AS terminal_allocation_commits
       FROM holomesh_compute_budget_holds h
       WHERE h.team_id = $1 AND h.job_id = $2 AND h.attempt = 1`,
      [TEAM_ID, fixture.jobId, command.transition.receipt.receiptId]
    );
    expect(durable.rows).toEqual([
      {
        hold_status: 'settled',
        held: '0',
        settled: '350',
        measured_cost_receipt_id: command.budgetEvidence?.receipt.measuredCostReceiptId,
        current_receipt_id: command.budgetEvidence?.receipt.receiptId,
        budget_commits: '2',
        terminal_transitions: '1',
        terminal_allocation_commits: '1',
      },
    ]);
    await expect(store.commitTransition(command)).resolves.toMatchObject({
      disposition: 'replayed',
    });
    const replayCount = await pool.query<{ commits: string }>(
      'SELECT COUNT(*)::text AS commits FROM holomesh_compute_budget_commits'
    );
    expect(replayCount.rows[0]?.commits).toBe('2');
  });

  it('rejects mismatched measured-cost evidence without mutating the running job, slot, or hold', async () => {
    const fixture = lifecycleFixture('alpha', CAPACITY, BUDGET_LIMIT_MINOR_UNITS);
    const runningJob = await persistBudgetedRunning(fixture);
    const valid = makeObservedBudgetedTerminalCommand(fixture, runningJob, 'succeed', 350);
    const { budgetEvidence: _budgetEvidence, ...terminalWithoutBudget } = valid;
    const mismatched = attachBudgetEvidence(terminalWithoutBudget, fixture, {
      status: 'settled',
      accountBefore: budgetAccount(BUDGET_LIMIT_MINOR_UNITS, 0, 1),
      accountAfter: budgetAccount(0, 350, 2),
      settledAmountMinorUnits: 350,
      measuredCostReceiptId: digest('different-measured-cost-receipt'),
      issuedAt: TERMINAL_AT,
    });

    await expect(store.commitTransition(mismatched)).rejects.toThrow(
      'settled budget evidence must bind the exact measured lifecycle execution cost'
    );
    const unchanged = await pool.query<{
      job_state: string;
      slot_state: string;
      held: string;
      settled: string;
      hold_status: string;
      commits: string;
    }>(
      `
      SELECT j.state AS job_state, a.slot_state,
             b.held_amount_minor_units::text AS held,
             b.settled_amount_minor_units::text AS settled,
             h.status AS hold_status,
             (SELECT COUNT(*) FROM holomesh_compute_budget_commits)::text AS commits
      FROM holomesh_compute_jobs j
      JOIN holomesh_compute_allocations a
        ON a.team_id = j.team_id AND a.capacity_ref = j.capacity_ref
      JOIN holomesh_compute_budget_accounts b ON b.team_id = j.team_id
      JOIN holomesh_compute_budget_holds h
        ON h.team_id = j.team_id AND h.job_id = j.job_id AND h.attempt = j.attempt
      WHERE j.team_id = $1 AND j.job_id = $2 AND j.attempt = 1
    `,
      [TEAM_ID, fixture.jobId]
    );
    expect(unchanged.rows).toEqual([
      {
        job_state: 'running',
        slot_state: 'leased',
        held: String(BUDGET_LIMIT_MINOR_UNITS),
        settled: '0',
        hold_status: 'held',
        commits: '1',
      },
    ]);
  });

  it.each(['fail', 'cancel'] as const)(
    'requires measured settlement for observed running %s terminality',
    async (action) => {
      const fixture = lifecycleFixture('alpha', CAPACITY, BUDGET_LIMIT_MINOR_UNITS);
      const runningJob = await persistBudgetedRunning(fixture);
      const command = makeObservedBudgetedTerminalCommand(fixture, runningJob, action, 125);

      await expect(store.commitTransition(command)).resolves.toMatchObject({
        disposition: 'committed',
        budgetEvidenceReceiptId: command.budgetEvidence?.receipt.receiptId,
      });
      const terminal = await store.readJob({
        teamId: TEAM_ID,
        jobId: fixture.jobId,
        attempt: 1,
      });
      expect(terminal.receipt.state).toBe(action === 'fail' ? 'failed' : 'cancelled');
      const budget = await store.readRegisteredBudget({
        teamId: TEAM_ID,
        budgetRailId: BUDGET_RAIL_ID,
        currency: 'USD',
        periodDigest: BUDGET_PERIOD_DIGEST,
      });
      expect(budget.projection.account).toEqual(budgetAccount(0, 125, 2));
    }
  );

  it('fails closed and retains the hold for unobserved running termination', async () => {
    const fixture = lifecycleFixture('alpha', CAPACITY, BUDGET_LIMIT_MINOR_UNITS);
    const runningJob = await persistBudgetedRunning(fixture);
    const unsafeRelease = makeUnobservedRunningCancelWithRelease(fixture, runningJob);

    await expect(store.commitTransition(unsafeRelease)).rejects.toThrow(
      'unobserved execution retains its hold and fails closed'
    );
    const unchanged = await pool.query<{
      job_state: string;
      slot_state: string;
      held: string;
      hold_status: string;
      commits: string;
    }>(
      `
      SELECT j.state AS job_state, a.slot_state,
             b.held_amount_minor_units::text AS held,
             h.status AS hold_status,
             (SELECT COUNT(*) FROM holomesh_compute_budget_commits)::text AS commits
      FROM holomesh_compute_jobs j
      JOIN holomesh_compute_allocations a
        ON a.team_id = j.team_id AND a.capacity_ref = j.capacity_ref
      JOIN holomesh_compute_budget_accounts b ON b.team_id = j.team_id
      JOIN holomesh_compute_budget_holds h
        ON h.team_id = j.team_id AND h.job_id = j.job_id AND h.attempt = j.attempt
      WHERE j.team_id = $1 AND j.job_id = $2 AND j.attempt = 1
    `,
      [TEAM_ID, fixture.jobId]
    );
    expect(unchanged.rows).toEqual([
      {
        job_state: 'running',
        slot_state: 'leased',
        held: String(BUDGET_LIMIT_MINOR_UNITS),
        hold_status: 'held',
        commits: '1',
      },
    ]);
  });

  it('rolls back capacity registration when policy expires after the early clock check', async () => {
    const fixture = lifecycleFixture('alpha');
    const validUntil = new Date(Date.now() + 3_000).toISOString();
    await pool.query(`
      CREATE FUNCTION holomesh_compute_test_delay_capacity_registration()
      RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        PERFORM pg_sleep(3.5);
        RETURN NEW;
      END
      $$;
      CREATE TRIGGER holomesh_compute_test_delay_capacity_registration
      BEFORE INSERT ON holomesh_compute_capacity_registrations
      FOR EACH ROW EXECUTE FUNCTION holomesh_compute_test_delay_capacity_registration()
    `);

    const startedAt = Date.now();
    try {
      await expect(
        store.registerCapacity(makeCapacityRegistration(fixture, validUntil))
      ).rejects.toMatchObject({
        code: 'capacity_registration_conflict',
      });
    } finally {
      await pool.query(`
        DROP TRIGGER IF EXISTS holomesh_compute_test_delay_capacity_registration
          ON holomesh_compute_capacity_registrations;
        DROP FUNCTION IF EXISTS holomesh_compute_test_delay_capacity_registration()
      `);
    }
    expect(Date.now() - startedAt).toBeGreaterThanOrEqual(3_200);

    const counts = await pool.query<{ allocations: string; registrations: string }>(`
      SELECT
        (SELECT COUNT(*) FROM holomesh_compute_allocations)::text AS allocations,
        (SELECT COUNT(*) FROM holomesh_compute_capacity_registrations)::text AS registrations
    `);
    expect(counts.rows[0]).toEqual({ allocations: '0', registrations: '0' });
  }, 15_000);

  it('rolls back acquire when capacity policy expires after its early clock check', async () => {
    const fixture = lifecycleFixture('alpha');
    const create = makeCreateCommand(fixture);
    const queue = makeQueueCommand(fixture);
    await store.createJob(create);
    await store.commitTransition(queue);

    const validUntil = new Date(Date.now() + 3_000).toISOString();
    await store.registerCapacity(makeCapacityRegistration(fixture, validUntil));
    const acquire = makeAcquireCommand(fixture, validUntil);
    await pool.query(`
      CREATE FUNCTION holomesh_compute_test_delay_transition()
      RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        PERFORM pg_sleep(3.5);
        RETURN NEW;
      END
      $$;
      CREATE TRIGGER holomesh_compute_test_delay_transition
      BEFORE INSERT ON holomesh_compute_transitions
      FOR EACH ROW EXECUTE FUNCTION holomesh_compute_test_delay_transition()
    `);

    const startedAt = Date.now();
    try {
      await expect(store.commitTransition(acquire)).rejects.toMatchObject({
        name: 'ComputeJobStoreAdmissionError',
        reasonCodes: ['final_policy_expired_at_database_clock'],
      });
    } finally {
      await pool.query(`
        DROP TRIGGER IF EXISTS holomesh_compute_test_delay_transition
          ON holomesh_compute_transitions;
        DROP FUNCTION IF EXISTS holomesh_compute_test_delay_transition()
      `);
    }
    expect(Date.now() - startedAt).toBeGreaterThanOrEqual(3_200);

    const durableJob = await store.readJob({
      teamId: TEAM_ID,
      jobId: fixture.jobId,
      attempt: 1,
    });
    const durableCapacity = await store.readRegisteredCapacity({
      teamId: TEAM_ID,
      capacityRef: CAPACITY,
    });
    expect(durableJob.bytes).toBe(queue.nextJob.bytes);
    expect(durableCapacity.projection.cursor.slotState).toBe('available');
  }, 15_000);

  it.each(['anchor_expiry', 'anchor_revocation', 'registered_period_expiry'] as const)(
    'rolls back budget hold and lease when %s passes after the early DB clock gate',
    async (boundary) => {
      const fixture = lifecycleFixture('alpha', CAPACITY, BUDGET_LIMIT_MINOR_UNITS);
      const boundaryDelayMs = boundary === 'registered_period_expiry' ? 5_000 : 3_000;
      const triggerDelaySeconds = boundary === 'registered_period_expiry' ? 5.5 : 3.5;
      const boundaryAt = new Date(Date.now() + boundaryDelayMs).toISOString();
      await store.registerBudget(
        makeBudgetRegistration(
          boundary === 'registered_period_expiry' ? { validUntil: boundaryAt } : {}
        )
      );
      await store.registerCapacity(makeCapacityRegistration(fixture));
      await store.createJob(makeCreateCommand(fixture));
      await store.commitTransition(makeQueueCommand(fixture));
      const acquire = makeBudgetedAcquireCommand(fixture);
      const shortAnchor: ComputeEvidenceTrustAnchor = {
        ...authority.anchor,
        ...(boundary === 'anchor_expiry' ? { validUntil: boundaryAt } : { revokedAt: boundaryAt }),
      };
      const boundaryStore = await PostgresComputeJobStore.create({
        ...storeOptions(DATABASE_URL as string),
        budgetEvidenceTrustAnchors:
          boundary === 'registered_period_expiry' ? [authority.anchor] : [shortAnchor],
      });
      await pool.query(`
        CREATE FUNCTION holomesh_compute_test_delay_budget_transition()
        RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
          PERFORM pg_sleep(${triggerDelaySeconds});
          RETURN NEW;
        END
        $$;
        CREATE TRIGGER holomesh_compute_test_delay_budget_transition
        BEFORE INSERT ON holomesh_compute_transitions
        FOR EACH ROW EXECUTE FUNCTION holomesh_compute_test_delay_budget_transition()
      `);

      const startedAt = Date.now();
      try {
        await expect(boundaryStore.commitTransition(acquire)).rejects.toMatchObject({
          name: 'ComputeJobStoreAdmissionError',
          reasonCodes: ['final_policy_expired_at_database_clock'],
        });
      } finally {
        await boundaryStore.close();
        await pool.query(`
          DROP TRIGGER IF EXISTS holomesh_compute_test_delay_budget_transition
            ON holomesh_compute_transitions;
          DROP FUNCTION IF EXISTS holomesh_compute_test_delay_budget_transition()
        `);
      }
      expect(Date.now() - startedAt).toBeGreaterThanOrEqual(boundaryDelayMs + 200);

      const rollback = await pool.query<{
        job_state: string;
        slot_state: string;
        held: string;
        account_version: string;
        holds: string;
        commits: string;
        transitions: string;
        idempotency: string;
      }>(
        `
        SELECT j.state AS job_state, a.slot_state,
               b.held_amount_minor_units::text AS held,
               b.version::text AS account_version,
               (SELECT COUNT(*) FROM holomesh_compute_budget_holds)::text AS holds,
               (SELECT COUNT(*) FROM holomesh_compute_budget_commits)::text AS commits,
               (SELECT COUNT(*) FROM holomesh_compute_transitions
                 WHERE transition_receipt_id = $3)::text AS transitions,
               (SELECT COUNT(*) FROM holomesh_compute_idempotency
                 WHERE operation = $4 AND key_digest = $5)::text AS idempotency
        FROM holomesh_compute_jobs j
        JOIN holomesh_compute_allocations a
          ON a.team_id = j.team_id AND a.capacity_ref = $2
        JOIN holomesh_compute_budget_accounts b ON b.team_id = j.team_id
        WHERE j.team_id = $1 AND j.job_id = $6 AND j.attempt = 1
      `,
        [
          TEAM_ID,
          CAPACITY,
          acquire.transition.receipt.receiptId,
          acquire.operation,
          acquire.idempotencyKeyDigest,
          fixture.jobId,
        ]
      );
      expect(rollback.rows).toEqual([
        {
          job_state: 'queued',
          slot_state: 'available',
          held: '0',
          account_version: '0',
          holds: '0',
          commits: '0',
          transitions: '0',
          idempotency: '0',
        },
      ]);
    },
    20_000
  );

  it('rejects a same-count catalog whose real CHECK body was replaced', async () => {
    try {
      await pool.query(`
        ALTER TABLE holomesh_compute_outbox
          DROP CONSTRAINT holomesh_compute_outbox_attempts_check,
          ADD CONSTRAINT holomesh_compute_outbox_attempts_check CHECK (TRUE)
      `);

      await expect(
        PostgresComputeJobStore.create(storeOptions(DATABASE_URL as string))
      ).rejects.toMatchObject({
        name: 'ComputeJobStoreUnavailableError',
        message: 'PostgreSQL compute schema initialization failed',
      });
    } finally {
      await pool.query(`
        ALTER TABLE holomesh_compute_outbox
          DROP CONSTRAINT IF EXISTS holomesh_compute_outbox_attempts_check,
          ADD CONSTRAINT holomesh_compute_outbox_attempts_check CHECK (attempts >= 0)
      `);
    }

    const verified = await PostgresComputeJobStore.create(storeOptions(DATABASE_URL as string));
    await verified.close();
  });

  it('fails closed when the immutable preparation trigger function body drifts', async () => {
    try {
      await pool.query(`
        CREATE OR REPLACE FUNCTION holomesh_compute_reject_job_command_preparation_mutation()
        RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
          RETURN OLD;
        END
        $$
      `);

      await expect(
        PostgresComputeJobStore.create(storeOptions(DATABASE_URL as string))
      ).rejects.toMatchObject({
        name: 'ComputeJobStoreUnavailableError',
        message: 'PostgreSQL compute schema initialization failed',
      });
    } finally {
      await pool.query(`
        DROP TRIGGER IF EXISTS holomesh_compute_job_command_preparations_immutable
          ON holomesh_compute_job_command_preparations;
        DROP FUNCTION IF EXISTS holomesh_compute_reject_job_command_preparation_mutation()
      `);
      await pool.query(COMPUTE_JOB_STORE_SCHEMA_SQL);
    }
  });
});
