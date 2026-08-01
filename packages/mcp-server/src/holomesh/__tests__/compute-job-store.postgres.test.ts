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
  ComputeJobStoreConflictError,
  PostgresComputeJobStore,
  type CommitComputeJobTransitionCommand,
  type CreateComputeJobCommand,
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

const DATABASE_URL = process.env.HOLOMESH_COMPUTE_POSTGRES_TEST_URL;
const TEAM_ID = 'team-compute-postgres-test';
const PRINCIPAL = digest('postgres-principal');
const CAPACITY = digest('postgres-capacity');
const FIXTURE_ORIGIN_MS = Math.floor(Date.now() / 1000) * 1000 - 10_000;
const at = (offsetMs: number): string => new Date(FIXTURE_ORIGIN_MS + offsetMs).toISOString();
const OBSERVED_AT = at(0);
const CHECKED_AT = at(1_000);
const PREFLIGHTED_AT = at(2_000);
const QUEUED_AT = at(3_000);
const LEASE_ISSUED_AT = at(4_000);
const SNAPSHOT_VALID_UNTIL = at(60_000);
const LEASE_EXPIRES_AT = at(5 * 60_000);
const ELIGIBILITY_VALID_UNTIL = at(60 * 60_000);
const REGISTERED_AT = at(500);
const ADMISSION_VERIFIED_AT = at(5_000);
const ADMISSION_VALID_UNTIL = at(4 * 60_000);
const STORE_VERIFICATION_AT = at(10_000);
const ADMISSION_TRUST_POLICY_DIGEST = digest('compute-job-store-postgres-trust-policy-v1');
const ALL_ROLES: readonly ComputeEvidenceRole[] = [
  'capacity_observer',
  'bridge_admitter',
  'placement_planner',
  'lease_issuer',
  'execution_attestor',
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
    now: () => STORE_VERIFICATION_AT,
  };
}

function workUnit(): ComputeWorkUnitContract {
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
      max_cost_minor_units: 0,
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

function lifecycleFixture(variant: 'alpha' | 'beta'): LifecycleFixture {
  const jobId = digest(`postgres-job-${variant}`);
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
        verifiedAt: ADMISSION_VERIFIED_AT,
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

function makeCreateCommand(fixture: LifecycleFixture): CreateComputeJobCommand {
  const job = fixture.preflighted;
  const evidence = [fixture.snapshot, fixture.plan].map(evidenceEnvelope);
  return {
    operation: 'compute_job.create',
    idempotencyKeyDigest: job.request.idempotencyKeyHash,
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
  const eligibility = eligibilityBinding(validUntil);
  const dataPolicy = dataPolicyBinding(validUntil);
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

function eligibilityBinding(validUntil = ELIGIBILITY_VALID_UNTIL) {
  return {
    schemaVersion: 'holoscript.compute-fleet-resource-eligibility.v1' as const,
    capacityRef: CAPACITY,
    provider: 'vast.ai' as const,
    instanceId: 42,
    eligible: true as const,
    validUntil,
  };
}

function dataPolicyBinding(validUntil = ELIGIBILITY_VALID_UNTIL) {
  return {
    schemaVersion: 'holoscript.compute-fleet-data-policy.v1' as const,
    capacityRef: CAPACITY,
    allowedDataClassifications: ['internal'],
    validUntil,
  };
}

function makeCapacityRegistration(
  fixture: LifecycleFixture,
  validUntil = ELIGIBILITY_VALID_UNTIL
): RegisterComputeCapacityCommand {
  const eligibility = eligibilityBinding(validUntil);
  const dataPolicy = dataPolicyBinding(validUntil);
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

  afterAll(async () => {
    await store?.close();
    await pool?.end();
  });

  it('serializes two concurrent initializers from a cold database', async () => {
    await pool.query(`
      DROP TABLE IF EXISTS
        holomesh_compute_admission_refs,
        holomesh_compute_admissions,
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
});
