import { createHash, generateKeyPairSync, sign } from 'crypto';
import { describe, expect, it } from 'vitest';
import {
  COMPUTE_WORK_UNIT_COMPILER_VERSION,
  buildComputeWorkUnit,
  computeWorkUnitDigest,
  type ComputeWorkUnitContract,
} from '../../compiler/ComputeWorkUnitCompiler';
import {
  HARDWARE_RECEIPT_METADATA_SCHEMA_VERSION,
  type PortableHardwareReceiptMetadata,
} from '../HardwareReceiptMetadata';
import { buildComputeExecutionReceipt } from '../ComputeExecutionReceipt';
import {
  attestComputeExecutionReceipt,
  buildComputeCapacitySnapshot,
  computeCapacityAllocationEtag,
  planComputePlacement,
  prepareComputeCapacityLease,
  type AuthorizeComputeCapacityLeaseUseInput,
  type ComputeCapacityAllocationCursor,
  type ComputeCapacitySnapshot,
  type ComputeEvidenceRole,
  type ComputeEvidenceSigner,
  type ComputeEvidenceTrustAnchor,
  type ComputePlacementPlan,
  type PreparedComputeCapacityLease,
  type VerifyComputeCapacityLeaseReceiptInput,
  type VerifyComputeExecutionEvidenceInput,
  type VerifyComputePlacementPlanInput,
} from '../ComputePlacementEvidence';
import {
  COMPUTE_ALLOCATOR_COMMIT_SCHEMA_VERSION,
  COMPUTE_JOB_SCHEMA_VERSION,
  COMPUTE_JOB_TRANSITION_SCHEMA_VERSION,
  computeJobIdempotencyKeyHash,
  prepareComputeJob,
  prepareComputeJobTransition,
  validateComputeAllocatorCommitReceipt,
  validateComputeJobReceipt,
  validateComputeJobTransitionReceipt,
  verifyComputeJobTransition,
  type ComputeJobReceipt,
  type PreparedComputeJobTransition,
} from '../ComputeJobLifecycle';

const CAPACITY_REF = `sha256:${'b'.repeat(64)}`;
const PRINCIPAL_DIGEST = `sha256:${'c'.repeat(64)}`;
const JOB_ID = `sha256:${'e'.repeat(64)}`;
const HOLDER_DIGEST = `sha256:${'f'.repeat(64)}`;
const OBSERVED_AT = '2026-08-01T12:00:00.000Z';
const CHECKED_AT = '2026-08-01T12:00:10.000Z';
const PREFLIGHTED_AT = '2026-08-01T12:00:11.000Z';
const DEADLINE_AT = '2026-08-01T12:01:11.000Z';
const QUEUED_AT = '2026-08-01T12:00:12.000Z';
const SNAPSHOT_VALID_UNTIL = '2026-08-01T12:01:00.000Z';
const LEASE_ISSUED_AT = '2026-08-01T12:00:20.000Z';
const STARTING_AT = '2026-08-01T12:00:21.000Z';
const RUNNING_AT = '2026-08-01T12:00:22.000Z';
const COMPLETED_AT = '2026-08-01T12:00:22.125Z';
const ATTESTED_AT = '2026-08-01T12:00:23.000Z';
const TERMINAL_AT = '2026-08-01T12:00:24.000Z';
const LEASE_EXPIRES_AT = '2026-08-01T12:01:00.000Z';
const FENCING_TOKEN = 'test-fencing-token-is-at-least-thirty-two-bytes-long';
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
      issuer: 'urn:holoscript:test:lifecycle',
      keyId: 'lifecycle-key-1',
      sign: (message) => sign(null, Buffer.from(message), privateKey).toString('base64'),
    },
    anchor: {
      issuer: 'urn:holoscript:test:lifecycle',
      keyId: 'lifecycle-key-1',
      algorithm: 'ed25519',
      roles: ALL_ROLES,
      principalDigests: [PRINCIPAL_DIGEST],
      lanes: ['local_device', 'owned_fleet', 'managed_bridge'],
      capacityRefs: [CAPACITY_REF],
      validFrom: '2026-08-01T00:00:00.000Z',
      validUntil: '2026-08-02T00:00:00.000Z',
      publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
    },
  };
}

const authority = evidenceAuthority();
const TRUST_ANCHORS = [authority.anchor] as const;

function canonicalize(value: unknown): unknown {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    typeof value === 'number'
  ) {
    return value;
  }
  if (Array.isArray(value)) return value.map(canonicalize);
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(record).sort()) {
      if (record[key] !== undefined) result[key] = canonicalize(record[key]);
    }
    return result;
  }
  throw new TypeError(`cannot canonicalize ${typeof value}`);
}

function rehashReceipt<T extends { readonly receiptId: string }>(value: T): T {
  const { receiptId: _receiptId, ...body } = value;
  const receiptId = `sha256:${createHash('sha256')
    .update(JSON.stringify(canonicalize(body)))
    .digest('hex')}`;
  return { ...body, receiptId } as T;
}

function workUnit(deadlineMs = 60_000): ComputeWorkUnitContract {
  return buildComputeWorkUnit(
    {
      intent: 'Run a bounded GPU thermal step.',
      allowed_accelerators: ['gpu', 'cpu'],
      placement_policy: 'local_only',
      data_classification: 'confidential',
      quality_metric: 'max_abs_error',
      quality_operator: 'lte',
      quality_threshold: 1e-5,
      quality_reference: 'cpu_reference',
      deadline_ms: deadlineMs,
      budget_currency: 'USD',
      max_cost_minor_units: 0,
      allow_fallback: false,
    },
    {
      objectName: 'thermal-step',
      sourceDigest: 'a'.repeat(64),
      sourceDigestKind: 'source_utf8',
      compiler: 'ComputeWorkUnitCompiler',
      compilerVersion: COMPUTE_WORK_UNIT_COMPILER_VERSION,
    }
  );
}

function capacitySnapshot(health: 'ready' | 'degraded' = 'ready'): ComputeCapacitySnapshot {
  return buildComputeCapacitySnapshot({
    lane: 'local_device',
    capacityRef: CAPACITY_REF,
    accelerator: 'gpu',
    health,
    availableSlots: 1,
    allowedDataClassifications: ['confidential'],
    observedAt: OBSERVED_AT,
    validUntil: SNAPSHOT_VALID_UNTIL,
    estimatedCost: { measurementState: 'not_applicable' },
    signer: authority.signer,
  });
}

function placement(
  unit: ComputeWorkUnitContract,
  snapshot: ComputeCapacitySnapshot
): ComputePlacementPlan {
  return planComputePlacement({
    principalDigest: PRINCIPAL_DIGEST,
    workUnit: unit,
    capacitySnapshot: snapshot,
    checkedAt: CHECKED_AT,
    trustAnchors: TRUST_ANCHORS,
    signer: authority.signer,
  });
}

function availableAllocation(epoch = 0, version = 0): ComputeCapacityAllocationCursor {
  const body = {
    capacityRef: CAPACITY_REF,
    slotState: 'available' as const,
    currentEpoch: epoch,
    version,
  };
  return { ...body, etag: computeCapacityAllocationEtag(body) };
}

interface Fixture {
  unit: ComputeWorkUnitContract;
  snapshot: ComputeCapacitySnapshot;
  plan: ComputePlacementPlan;
  preparedLease: PreparedComputeCapacityLease;
  preflighted: ComputeJobReceipt;
}

function placementVerification(
  fixture: Pick<Fixture, 'unit' | 'snapshot' | 'plan'>,
  verifiedAt: string
): VerifyComputePlacementPlanInput {
  return {
    principalDigest: PRINCIPAL_DIGEST,
    workUnit: fixture.unit,
    capacitySnapshot: fixture.snapshot,
    plan: fixture.plan,
    checkedAt: fixture.plan.checkedAt,
    verifiedAt,
    trustAnchors: TRUST_ANCHORS,
  };
}

function createFixture(health: 'ready' | 'degraded' = 'ready', deadlineMs = 60_000): Fixture {
  const unit = workUnit(deadlineMs);
  const snapshot = capacitySnapshot(health);
  const plan = placement(unit, snapshot);
  const preparedLease =
    plan.verdict === 'admitted'
      ? prepareComputeCapacityLease({
          principalDigest: PRINCIPAL_DIGEST,
          jobId: JOB_ID,
          attempt: 1,
          holderDigest: HOLDER_DIGEST,
          workUnit: unit,
          capacitySnapshot: snapshot,
          plan,
          issuedAt: LEASE_ISSUED_AT,
          expiresAt: LEASE_EXPIRES_AT,
          fencingToken: FENCING_TOKEN,
          allocationCursor: availableAllocation(),
          trustAnchors: TRUST_ANCHORS,
          signer: authority.signer,
        })
      : (undefined as never);
  const preflighted = prepareComputeJob({
    principalDigest: PRINCIPAL_DIGEST,
    jobId: JOB_ID,
    attempt: 1,
    workUnit: unit,
    placementVerification: {
      principalDigest: PRINCIPAL_DIGEST,
      workUnit: unit,
      capacitySnapshot: snapshot,
      plan,
      checkedAt: plan.checkedAt,
      verifiedAt: PREFLIGHTED_AT,
      trustAnchors: TRUST_ANCHORS,
    },
    preparedAt: PREFLIGHTED_AT,
    idempotencyKey: 'create-job-1',
  }).job;
  return { unit, snapshot, plan, preparedLease, preflighted };
}

function leaseVerification(
  fixture: Fixture,
  at = LEASE_ISSUED_AT
): VerifyComputeCapacityLeaseReceiptInput {
  return {
    principalDigest: PRINCIPAL_DIGEST,
    jobId: JOB_ID,
    attempt: 1,
    holderDigest: HOLDER_DIGEST,
    workUnit: fixture.unit,
    capacitySnapshot: fixture.snapshot,
    plan: fixture.plan,
    lease: fixture.preparedLease.lease,
    at,
    trustAnchors: TRUST_ANCHORS,
  };
}

function leaseAuthorization(
  fixture: Fixture,
  at: string,
  allocationCursor: ComputeCapacityAllocationCursor = fixture.preparedLease.nextAllocation,
  token: string = FENCING_TOKEN
): AuthorizeComputeCapacityLeaseUseInput {
  return {
    ...leaseVerification(fixture, at),
    presentedFencingToken: token,
    allocationCursor,
  };
}

function hardware(unit: ComputeWorkUnitContract): PortableHardwareReceiptMetadata {
  return {
    schemaVersion: HARDWARE_RECEIPT_METADATA_SCHEMA_VERSION,
    target: {
      id: 'thermal-step',
      kind: 'compute-workload',
      architecture: 'regular-grid-3d',
      artifactKind: 'webgpu-wgsl',
    },
    device: { vendor: 'Example', model: 'Test GPU', accelerator: 'gpu' },
    runtime: { name: 'WebGPU', version: 'test', hostOS: 'test-os' },
    compilerVersion: '1.0.0',
    constraints: [{ id: 'max-abs-error', description: 'Match CPU reference.', limit: 1e-5 }],
    measuredResults: [
      {
        metric: 'max_abs_error',
        value: 0,
        unit: 'temperature-unit',
        method: 'CPU reference comparison',
        sampleCount: 512,
        tolerance: 1e-5,
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
      { kind: 'composition', uri: 'holoscript://tests/thermal-step', sha256: 'd'.repeat(64) },
    ],
    provenance: {
      capturedAt: COMPLETED_AT,
      sourceCompositionHash: unit.source_evidence,
      commit: 'abc1234',
    },
    owner: { agent: 'test-runtime', team: 'HoloMesh' },
  };
}

function executionVerification(
  fixture: Fixture,
  terminalStatus: 'succeeded' | 'failed' | 'cancelled',
  verifiedAt = TERMINAL_AT,
  startedAt = RUNNING_AT
): VerifyComputeExecutionEvidenceInput {
  const executionReceipt = buildComputeExecutionReceipt({
    workUnit: {
      digest: computeWorkUnitDigest(fixture.unit),
      sourceEvidence: fixture.unit.source_evidence,
    },
    placement: {
      planReceiptId: fixture.plan.receiptId,
      capacityLeaseReceiptId: fixture.preparedLease.lease.receiptId,
      outcome: 'local_device',
    },
    execution: {
      actualAccelerator: 'gpu',
      fallbackAllowed: false,
      fallbackUsed: false,
      terminalStatus,
      startedAt,
      completedAt: COMPLETED_AT,
    },
    quality: {
      metric: fixture.unit.compute.quality.metric,
      operator: fixture.unit.compute.quality.operator,
      threshold: fixture.unit.compute.quality.threshold,
      reference: fixture.unit.compute.quality.reference,
      observedValue: 0,
      passed: true,
    },
    cost: { measurementState: 'not_measured', reason: 'not_applicable' },
    hardware: hardware(fixture.unit),
  });
  const executionAttestation = attestComputeExecutionReceipt({
    principalDigest: PRINCIPAL_DIGEST,
    executionReceipt,
    issuedAt: ATTESTED_AT,
    signer: authority.signer,
  });
  return {
    principalDigest: PRINCIPAL_DIGEST,
    jobId: JOB_ID,
    attempt: 1,
    holderDigest: HOLDER_DIGEST,
    workUnit: fixture.unit,
    capacitySnapshot: fixture.snapshot,
    plan: fixture.plan,
    lease: fixture.preparedLease.lease,
    executionReceipt,
    executionAttestation,
    verifiedAt,
    trustAnchors: TRUST_ANCHORS,
  };
}

function queued(fixture: Fixture): PreparedComputeJobTransition {
  return prepareComputeJobTransition({
    expectedJob: fixture.preflighted,
    action: 'queue',
    placementVerification: placementVerification(fixture, QUEUED_AT),
    transitionedAt: QUEUED_AT,
    idempotencyKey: 'queue-job-1',
  });
}

function leased(fixture: Fixture): PreparedComputeJobTransition {
  return prepareComputeJobTransition({
    expectedJob: queued(fixture).nextJob,
    action: 'acquire_lease',
    preparedLease: fixture.preparedLease,
    leaseVerification: leaseVerification(fixture),
    transitionedAt: LEASE_ISSUED_AT,
    idempotencyKey: 'lease-job-1',
  });
}

function starting(fixture: Fixture): PreparedComputeJobTransition {
  return prepareComputeJobTransition({
    expectedJob: leased(fixture).nextJob,
    action: 'start',
    leaseAuthorization: leaseAuthorization(fixture, STARTING_AT),
    transitionedAt: STARTING_AT,
    idempotencyKey: 'start-job-1',
  });
}

function running(fixture: Fixture): PreparedComputeJobTransition {
  return prepareComputeJobTransition({
    expectedJob: starting(fixture).nextJob,
    action: 'mark_running',
    leaseAuthorization: leaseAuthorization(fixture, RUNNING_AT),
    transitionedAt: RUNNING_AT,
    idempotencyKey: 'run-job-1',
  });
}

describe('ComputeJobLifecycle', () => {
  it('builds a content-addressed preflight receipt with stable, secret-free request binding', () => {
    const fixture = createFixture();
    expect(fixture.preflighted).toMatchObject({
      schemaVersion: COMPUTE_JOB_SCHEMA_VERSION,
      verificationScope: 'structural_only',
      state: 'preflighted',
      version: 0,
      principalDigest: PRINCIPAL_DIGEST,
      jobId: JOB_ID,
    });
    expect(validateComputeJobReceipt(fixture.preflighted)).toEqual({ valid: true, errors: [] });
    expect(fixture.preflighted.deadlineAt).toBe(DEADLINE_AT);
    expect(JSON.stringify(fixture.preflighted)).not.toContain('create-job-1');
    expect(fixture.preflighted.request.idempotencyKeyHash).toBe(
      computeJobIdempotencyKeyHash('create-job-1')
    );

    const replay = prepareComputeJob({
      principalDigest: PRINCIPAL_DIGEST,
      jobId: JOB_ID,
      attempt: 1,
      workUnit: fixture.unit,
      placementVerification: placementVerification(fixture, PREFLIGHTED_AT),
      preparedAt: PREFLIGHTED_AT,
      idempotencyKey: 'create-job-1',
    });
    expect(replay.job).toEqual(fixture.preflighted);
    expect(replay.requestBinding).toEqual(fixture.preflighted.request);
    expect(() => computeJobIdempotencyKeyHash('')).toThrow('1-512 bytes');

    const deserializedWorkUnit = JSON.parse(
      JSON.stringify(fixture.unit)
    ) as ComputeWorkUnitContract;
    expect(deserializedWorkUnit).not.toBe(fixture.unit);
    expect(
      prepareComputeJob({
        principalDigest: PRINCIPAL_DIGEST,
        jobId: JOB_ID,
        attempt: 1,
        workUnit: deserializedWorkUnit,
        placementVerification: placementVerification(fixture, PREFLIGHTED_AT),
        preparedAt: PREFLIGHTED_AT,
        idempotencyKey: 'create-job-1',
      }).job
    ).toEqual(fixture.preflighted);
  });

  it('preserves no-deadline semantics and rejects an absolute deadline overflow', () => {
    expect(createFixture('ready', 0).preflighted.deadlineAt).toBeNull();
    expect(() => createFixture('ready', Number.MAX_SAFE_INTEGER)).toThrow(
      'compute job deadline overflows the canonical ISO timestamp range'
    );
  });

  it('prepares the exact happy-path state graph and releases capacity only as a CAS projection', () => {
    const fixture = createFixture();
    const queuedResult = queued(fixture);
    const leasedResult = leased(fixture);
    const startingResult = starting(fixture);
    const runningResult = running(fixture);
    const succeededResult = prepareComputeJobTransition({
      expectedJob: runningResult.nextJob,
      action: 'succeed',
      executionVerification: executionVerification(fixture, 'succeeded'),
      allocationCursor: fixture.preparedLease.nextAllocation,
      transitionedAt: TERMINAL_AT,
      idempotencyKey: 'succeed-job-1',
    });

    expect([
      fixture.preflighted.state,
      queuedResult.nextJob.state,
      leasedResult.nextJob.state,
      startingResult.nextJob.state,
      runningResult.nextJob.state,
      succeededResult.nextJob.state,
    ]).toEqual(['preflighted', 'queued', 'leased', 'starting', 'running', 'succeeded']);
    expect(JSON.stringify(startingResult)).not.toContain(FENCING_TOKEN);
    expect(leasedResult.allocatorCommit).toMatchObject({
      schemaVersion: COMPUTE_ALLOCATOR_COMMIT_SCHEMA_VERSION,
      verificationScope: 'prepared_cas',
      operation: 'acquire',
    });
    expect(succeededResult.allocatorCommit).toMatchObject({
      verificationScope: 'prepared_cas',
      operation: 'release',
      leaseReceiptId: fixture.preparedLease.lease.receiptId,
    });
    expect(succeededResult.allocatorCommit?.nextAllocation).toMatchObject({
      slotState: 'available',
      currentEpoch: fixture.preparedLease.lease.fencingEpoch,
      version: fixture.preparedLease.nextAllocation.version + 1,
    });
    expect(succeededResult.nextJob.terminal).toMatchObject({
      completionDisposition: 'work_unit_succeeded',
      evidence: { kind: 'attested_execution' },
    });
    expect(verifyComputeJobTransition(succeededResult)).toEqual({ valid: true, errors: [] });
    expect(validateComputeAllocatorCommitReceipt(succeededResult.allocatorCommit)).toEqual({
      valid: true,
      errors: [],
    });
    expect(() =>
      prepareComputeJobTransition({
        expectedJob: succeededResult.nextJob,
        action: 'fail',
        reasonCode: 'system_failed',
        transitionedAt: '2026-08-01T12:00:25.000Z',
        idempotencyKey: 'resurrect-terminal',
      })
    ).toThrow('terminal compute jobs cannot transition');
  });

  it('rejects skipped, backward, or repeated non-terminal edges', () => {
    const fixture = createFixture();
    expect(() =>
      prepareComputeJobTransition({
        expectedJob: fixture.preflighted,
        action: 'start',
        leaseAuthorization: leaseAuthorization(fixture, STARTING_AT),
        transitionedAt: STARTING_AT,
        idempotencyKey: 'skip-queue-and-lease',
      })
    ).toThrow('transition start is forbidden from preflighted');
    expect(() =>
      prepareComputeJobTransition({
        expectedJob: queued(fixture).nextJob,
        action: 'queue',
        placementVerification: placementVerification(fixture, LEASE_ISSUED_AT),
        transitionedAt: LEASE_ISSUED_AT,
        idempotencyKey: 'repeat-queue',
      })
    ).toThrow('transition queue is forbidden from queued');
    expect(() =>
      prepareComputeJobTransition({
        expectedJob: running(fixture).nextJob,
        action: 'mark_running',
        leaseAuthorization: leaseAuthorization(fixture, TERMINAL_AT),
        transitionedAt: TERMINAL_AT,
        idempotencyKey: 'repeat-running',
      })
    ).toThrow('transition mark_running is forbidden from running');
  });

  it('records pre-start terminality without fabricating an execution receipt', () => {
    const fixture = createFixture();
    const beforeLease = prepareComputeJobTransition({
      expectedJob: fixture.preflighted,
      action: 'fail',
      reasonCode: 'queue_rejected',
      transitionedAt: QUEUED_AT,
      idempotencyKey: 'reject-preflight',
    });
    expect(beforeLease.nextJob.terminal).toEqual({
      state: 'failed',
      at: QUEUED_AT,
      reasonCode: 'queue_rejected',
      completionDisposition: 'execution_not_started',
      evidence: { kind: 'execution_not_started', reasonCode: 'queue_rejected' },
    });
    expect(beforeLease.allocatorCommit).toBeUndefined();

    const afterLease = prepareComputeJobTransition({
      expectedJob: leased(fixture).nextJob,
      action: 'cancel',
      reasonCode: 'user_cancelled',
      allocationCursor: fixture.preparedLease.nextAllocation,
      transitionedAt: STARTING_AT,
      idempotencyKey: 'cancel-before-start',
    });
    expect(afterLease.nextJob.terminal?.evidence.kind).toBe('execution_not_started');
    expect(afterLease.allocatorCommit?.operation).toBe('release');
    expect(afterLease.transition.evidenceReceiptIds).toEqual([]);
  });

  it('enforces state-scoped failure reasons and lease-expiry truth', () => {
    const fixture = createFixture();
    expect(() =>
      prepareComputeJobTransition({
        expectedJob: fixture.preflighted,
        action: 'fail',
        reasonCode: 'deadline_exceeded',
        transitionedAt: QUEUED_AT,
        idempotencyKey: 'early-deadline',
      })
    ).toThrow('deadline_exceeded cannot be asserted before deadlineAt');
    const deadlineExceeded = prepareComputeJobTransition({
      expectedJob: fixture.preflighted,
      action: 'fail',
      reasonCode: 'deadline_exceeded',
      transitionedAt: DEADLINE_AT,
      idempotencyKey: 'deadline-boundary',
    });
    expect(deadlineExceeded.nextJob.terminal).toMatchObject({
      reasonCode: 'deadline_exceeded',
      at: DEADLINE_AT,
    });
    expect(verifyComputeJobTransition(deadlineExceeded)).toEqual({ valid: true, errors: [] });

    expect(() =>
      prepareComputeJobTransition({
        expectedJob: fixture.preflighted,
        action: 'fail',
        reasonCode: 'execution_failed',
        transitionedAt: QUEUED_AT,
        idempotencyKey: 'preflight-execution-failed',
      })
    ).toThrow('failure reason execution_failed is forbidden from preflighted');
    expect(() =>
      prepareComputeJobTransition({
        expectedJob: fixture.preflighted,
        action: 'fail',
        reasonCode: 'placement_rejected' as never,
        transitionedAt: QUEUED_AT,
        idempotencyKey: 'preflight-placement-rejected',
      })
    ).toThrow('failure reason placement_rejected is forbidden from preflighted');

    const leasedJob = leased(fixture).nextJob;
    expect(() =>
      prepareComputeJobTransition({
        expectedJob: leasedJob,
        action: 'fail',
        reasonCode: 'lease_expired',
        allocationCursor: fixture.preparedLease.nextAllocation,
        transitionedAt: STARTING_AT,
        idempotencyKey: 'early-lease-expiry',
      })
    ).toThrow('lease_expired cannot be asserted before the bound lease expires');
    const expiredLease = prepareComputeJobTransition({
      expectedJob: leasedJob,
      action: 'fail',
      reasonCode: 'lease_expired',
      allocationCursor: fixture.preparedLease.nextAllocation,
      transitionedAt: LEASE_EXPIRES_AT,
      idempotencyKey: 'expired-lease',
    });
    expect(expiredLease.nextJob.terminal).toMatchObject({
      reasonCode: 'lease_expired',
      completionDisposition: 'execution_not_started',
    });

    const runningJob = running(fixture).nextJob;
    expect(() =>
      prepareComputeJobTransition({
        expectedJob: runningJob,
        action: 'fail',
        reasonCode: 'placement_rejected' as never,
        executionUnobservedReason: 'executor_lost',
        allocationCursor: fixture.preparedLease.nextAllocation,
        transitionedAt: TERMINAL_AT,
        idempotencyKey: 'running-placement-rejected',
      })
    ).toThrow('failure reason placement_rejected is forbidden from running');
    expect(() =>
      prepareComputeJobTransition({
        expectedJob: runningJob,
        action: 'fail',
        reasonCode: 'executor_lost',
        executionUnobservedReason: 'receipt_unavailable',
        allocationCursor: fixture.preparedLease.nextAllocation,
        transitionedAt: TERMINAL_AT,
        idempotencyKey: 'mismatched-unobserved-reason',
      })
    ).toThrow('unobserved execution reason must match the lifecycle failure reason');
    expect(() =>
      prepareComputeJobTransition({
        expectedJob: runningJob,
        action: 'fail',
        reasonCode: 'lease_expired',
        executionUnobservedReason: 'lease_expired',
        allocationCursor: fixture.preparedLease.nextAllocation,
        transitionedAt: TERMINAL_AT,
        idempotencyKey: 'early-running-expiry',
      })
    ).toThrow('lease_expired cannot be asserted before the bound lease expires');

    const observedFailure = prepareComputeJobTransition({
      expectedJob: runningJob,
      action: 'fail',
      reasonCode: 'execution_failed',
      executionVerification: executionVerification(fixture, 'failed'),
      allocationCursor: fixture.preparedLease.nextAllocation,
      transitionedAt: TERMINAL_AT,
      idempotencyKey: 'observed-execution-failure',
    });
    expect(observedFailure.nextJob.terminal).toMatchObject({
      reasonCode: 'execution_failed',
      completionDisposition: 'terminal_execution_observed',
    });

    const systemLost = prepareComputeJobTransition({
      expectedJob: runningJob,
      action: 'fail',
      reasonCode: 'system_failed',
      executionUnobservedReason: 'executor_lost',
      allocationCursor: fixture.preparedLease.nextAllocation,
      transitionedAt: TERMINAL_AT,
      idempotencyKey: 'system-unobserved',
    });
    const systemReceiptMissing = prepareComputeJobTransition({
      expectedJob: runningJob,
      action: 'fail',
      reasonCode: 'system_failed',
      executionUnobservedReason: 'receipt_unavailable',
      allocationCursor: fixture.preparedLease.nextAllocation,
      transitionedAt: TERMINAL_AT,
      idempotencyKey: 'system-unobserved',
    });
    expect(systemLost.nextJob.request.requestHash).not.toBe(
      systemReceiptMissing.nextJob.request.requestHash
    );

    const expiredRunning = prepareComputeJobTransition({
      expectedJob: runningJob,
      action: 'fail',
      reasonCode: 'lease_expired',
      executionUnobservedReason: 'lease_expired',
      allocationCursor: fixture.preparedLease.nextAllocation,
      transitionedAt: LEASE_EXPIRES_AT,
      idempotencyKey: 'expired-running-lease',
    });
    expect(expiredRunning.nextJob.terminal?.evidence).toEqual({
      kind: 'execution_unobserved',
      reasonCode: 'lease_expired',
    });

    const cancelledUnobserved = prepareComputeJobTransition({
      expectedJob: runningJob,
      action: 'cancel',
      reasonCode: 'system_cancelled',
      executionUnobservedReason: 'receipt_unavailable',
      allocationCursor: fixture.preparedLease.nextAllocation,
      transitionedAt: TERMINAL_AT,
      idempotencyKey: 'cancel-unobserved',
    });
    expect(cancelledUnobserved.nextJob.terminal?.evidence).toEqual({
      kind: 'execution_unobserved',
      reasonCode: 'receipt_unavailable',
    });

    const validPreflightFailure = prepareComputeJobTransition({
      expectedJob: fixture.preflighted,
      action: 'fail',
      reasonCode: 'queue_rejected',
      transitionedAt: QUEUED_AT,
      idempotencyKey: 'valid-preflight-failure',
    });
    const forgedNext = rehashReceipt({
      ...validPreflightFailure.nextJob,
      terminal: {
        ...validPreflightFailure.nextJob.terminal!,
        reasonCode: 'execution_failed',
        evidence: { kind: 'execution_not_started' as const, reasonCode: 'execution_failed' },
      },
    });
    const forgedTransition = rehashReceipt({
      ...validPreflightFailure.transition,
      to: { ...validPreflightFailure.transition.to, receiptId: forgedNext.receiptId },
    });
    expect(
      verifyComputeJobTransition({
        expectedJob: validPreflightFailure.expectedJob,
        nextJob: forgedNext,
        transition: forgedTransition,
      }).errors
    ).toContain('failure reason execution_failed is forbidden from preflighted');
  });

  it('requires authenticated success and honest observed or unobserved running failure', () => {
    const fixture = createFixture();
    const runningJob = running(fixture).nextJob;
    expect(() =>
      prepareComputeJobTransition({
        expectedJob: runningJob,
        action: 'fail',
        reasonCode: 'executor_lost',
        allocationCursor: fixture.preparedLease.nextAllocation,
        transitionedAt: TERMINAL_AT,
        idempotencyKey: 'missing-running-evidence',
      })
    ).toThrow('requires observed or explicitly unobserved execution');

    const unobserved = prepareComputeJobTransition({
      expectedJob: runningJob,
      action: 'fail',
      reasonCode: 'executor_lost',
      executionUnobservedReason: 'executor_lost',
      allocationCursor: fixture.preparedLease.nextAllocation,
      transitionedAt: TERMINAL_AT,
      idempotencyKey: 'lost-executor',
    });
    expect(unobserved.nextJob.terminal).toMatchObject({
      completionDisposition: 'execution_unobserved',
      evidence: { kind: 'execution_unobserved', reasonCode: 'executor_lost' },
    });

    expect(() =>
      prepareComputeJobTransition({
        expectedJob: runningJob,
        action: 'succeed',
        executionVerification: executionVerification(fixture, 'failed'),
        allocationCursor: fixture.preparedLease.nextAllocation,
        transitionedAt: TERMINAL_AT,
        idempotencyKey: 'status-confusion',
      })
    ).toThrow('terminal status does not match');

    expect(() =>
      prepareComputeJobTransition({
        expectedJob: runningJob,
        action: 'succeed',
        executionVerification: executionVerification(
          fixture,
          'succeeded',
          TERMINAL_AT,
          '2026-08-01T12:00:22.001Z'
        ),
        allocationCursor: fixture.preparedLease.nextAllocation,
        transitionedAt: TERMINAL_AT,
        idempotencyKey: 'execution-start-confusion',
      })
    ).toThrow('execution receipt startedAt does not match the running job');
  });

  it('requires the current token, lease, allocator cursor, and half-open lease time to start', () => {
    const fixture = createFixture();
    const leasedJob = leased(fixture).nextJob;
    expect(() =>
      prepareComputeJobTransition({
        expectedJob: leasedJob,
        action: 'start',
        leaseAuthorization: leaseAuthorization(
          fixture,
          STARTING_AT,
          fixture.preparedLease.nextAllocation,
          'wrong-token-that-is-also-long-enough-for-the-test'
        ),
        transitionedAt: STARTING_AT,
        idempotencyKey: 'wrong-token',
      })
    ).toThrow('presented fencing token does not match');

    const staleBody = {
      capacityRef: CAPACITY_REF,
      slotState: 'leased' as const,
      currentEpoch: fixture.preparedLease.nextAllocation.currentEpoch + 1,
      currentLeaseReceiptId: `sha256:${'9'.repeat(64)}`,
      version: fixture.preparedLease.nextAllocation.version + 1,
    };
    const staleCursor = { ...staleBody, etag: computeCapacityAllocationEtag(staleBody) };
    expect(() =>
      prepareComputeJobTransition({
        expectedJob: leasedJob,
        action: 'start',
        leaseAuthorization: leaseAuthorization(fixture, STARTING_AT, staleCursor),
        transitionedAt: STARTING_AT,
        idempotencyKey: 'stale-fence',
      })
    ).toThrow('allocator cursor does not authorize');

    expect(() =>
      prepareComputeJobTransition({
        expectedJob: leasedJob,
        action: 'start',
        leaseAuthorization: leaseAuthorization(fixture, LEASE_EXPIRES_AT),
        transitionedAt: LEASE_EXPIRES_AT,
        idempotencyKey: 'exact-expiry',
      })
    ).toThrow('lease is not active');

    const justBeforeExpiry = '2026-08-01T12:00:59.999Z';
    const accepted = prepareComputeJobTransition({
      expectedJob: leasedJob,
      action: 'start',
      leaseAuthorization: leaseAuthorization(fixture, justBeforeExpiry),
      transitionedAt: justBeforeExpiry,
      idempotencyKey: 'just-before-expiry',
    });
    expect(verifyComputeJobTransition(accepted)).toEqual({ valid: true, errors: [] });

    const forgedNext = rehashReceipt({
      ...accepted.nextJob,
      updatedAt: LEASE_EXPIRES_AT,
    });
    const forgedTransition = rehashReceipt({
      ...accepted.transition,
      to: { ...accepted.transition.to, receiptId: forgedNext.receiptId },
      transitionedAt: LEASE_EXPIRES_AT,
    });
    expect(
      verifyComputeJobTransition({
        expectedJob: accepted.expectedJob,
        nextJob: forgedNext,
        transition: forgedTransition,
      }).errors
    ).toContain('start transition must occur within the half-open lease interval');
  });

  it('will not release capacity held by a superseding lease or fencing epoch', () => {
    const fixture = createFixture();
    const runningJob = running(fixture).nextJob;
    const supersededBody = {
      capacityRef: CAPACITY_REF,
      slotState: 'leased' as const,
      currentEpoch: fixture.preparedLease.nextAllocation.currentEpoch + 1,
      currentLeaseReceiptId: `sha256:${'8'.repeat(64)}`,
      version: fixture.preparedLease.nextAllocation.version + 1,
    };
    const superseded = { ...supersededBody, etag: computeCapacityAllocationEtag(supersededBody) };
    expect(() =>
      prepareComputeJobTransition({
        expectedJob: runningJob,
        action: 'fail',
        reasonCode: 'executor_lost',
        executionUnobservedReason: 'executor_lost',
        allocationCursor: superseded,
        transitionedAt: TERMINAL_AT,
        idempotencyKey: 'stale-release',
      })
    ).toThrow('does not hold the expected job lease');
  });

  it('allows a rejected placement to preflight but never to queue', () => {
    const fixture = createFixture('degraded');
    expect(fixture.plan.verdict).toBe('rejected');
    expect(fixture.preflighted.state).toBe('preflighted');
    expect(() =>
      prepareComputeJobTransition({
        expectedJob: fixture.preflighted,
        action: 'queue',
        placementVerification: placementVerification(fixture, QUEUED_AT),
        transitionedAt: QUEUED_AT,
        idempotencyKey: 'queue-rejected-plan',
      })
    ).toThrow('queue requires a current admitted placement');
  });

  it('rejects canonical-body tampering, unknown provider fields, and circular receipt references', () => {
    const fixture = createFixture();
    const tampered = { ...fixture.preflighted, state: 'queued' };
    expect(validateComputeJobReceipt(tampered).errors).toContain(
      'job.receiptId does not match canonical body'
    );
    expect(validateComputeJobReceipt(tampered).errors).toContain(
      'initial job state must be preflighted'
    );
    const providerInjected = { ...fixture.preflighted, provider: 'not-portable' };
    expect(validateComputeJobReceipt(providerInjected).errors).toContain(
      'job.provider is not allowed'
    );

    const queuedResult = queued(fixture);
    const deadlineMutatedNext = rehashReceipt({
      ...queuedResult.nextJob,
      deadlineAt: '2026-08-01T12:01:12.000Z',
    });
    const deadlineMutatedTransition = rehashReceipt({
      ...queuedResult.transition,
      to: { ...queuedResult.transition.to, receiptId: deadlineMutatedNext.receiptId },
    });
    expect(
      verifyComputeJobTransition({
        expectedJob: queuedResult.expectedJob,
        nextJob: deadlineMutatedNext,
        transition: deadlineMutatedTransition,
      }).errors
    ).toContain('next job mutates immutable identity or evidence bindings');

    const transitionTampered = {
      ...queuedResult.transition,
      allocatorCommitReceiptId: queuedResult.transition.receiptId,
    };
    expect(validateComputeJobTransitionReceipt(transitionTampered).errors).toContain(
      'transition.receiptId does not match canonical body'
    );

    const succeeded = prepareComputeJobTransition({
      expectedJob: running(fixture).nextJob,
      action: 'succeed',
      executionVerification: executionVerification(fixture, 'succeeded'),
      allocationCursor: fixture.preparedLease.nextAllocation,
      transitionedAt: TERMINAL_AT,
      idempotencyKey: 'terminal-needs-lease',
    });
    const missingLease = { ...succeeded.nextJob, lease: undefined };
    expect(validateComputeJobReceipt(missingLease).errors).toContain(
      'attested terminal execution requires a complete lease binding'
    );

    const evidenceStripped = rehashReceipt({
      ...queuedResult.transition,
      evidenceReceiptIds: [],
    });
    expect(validateComputeJobTransitionReceipt(evidenceStripped)).toEqual({
      valid: true,
      errors: [],
    });
    const strippedVerification = verifyComputeJobTransition({
      ...queuedResult,
      transition: evidenceStripped,
    });
    expect(strippedVerification.errors).toContain(
      'transition evidence receipt IDs do not match the state evidence'
    );

    const forgedNext = rehashReceipt({
      ...queuedResult.nextJob,
      request: {
        ...queuedResult.nextJob.request,
        requestHash: `sha256:${'7'.repeat(64)}`,
      },
    });
    const forgedTransition = rehashReceipt({
      ...queuedResult.transition,
      to: { ...queuedResult.transition.to, receiptId: forgedNext.receiptId },
      request: forgedNext.request,
    });
    expect(
      verifyComputeJobTransition({
        expectedJob: queuedResult.expectedJob,
        nextJob: forgedNext,
        transition: forgedTransition,
      }).errors
    ).toContain('transition requestHash does not bind the supplied state and evidence');

    const startingResult = starting(fixture);
    const substitutedLease = {
      ...startingResult.nextJob.lease!,
      receiptId: `sha256:${'6'.repeat(64)}`,
    };
    const substitutedNext = rehashReceipt({
      ...startingResult.nextJob,
      lease: substitutedLease,
    });
    const substitutedTransition = rehashReceipt({
      ...startingResult.transition,
      to: { ...startingResult.transition.to, receiptId: substitutedNext.receiptId },
    });
    expect(
      verifyComputeJobTransition({
        expectedJob: startingResult.expectedJob,
        nextJob: substitutedNext,
        transition: substitutedTransition,
      }).errors
    ).toContain('transition mutates the existing lease binding');
  });

  it('exposes competing pure projections without claiming either won the durable CAS', () => {
    const fixture = createFixture();
    const first = prepareComputeJobTransition({
      expectedJob: fixture.preflighted,
      action: 'queue',
      placementVerification: placementVerification(fixture, QUEUED_AT),
      transitionedAt: QUEUED_AT,
      idempotencyKey: 'candidate-a',
    });
    const second = prepareComputeJobTransition({
      expectedJob: fixture.preflighted,
      action: 'queue',
      placementVerification: placementVerification(fixture, '2026-08-01T12:00:13.000Z'),
      transitionedAt: '2026-08-01T12:00:13.000Z',
      idempotencyKey: 'candidate-b',
    });

    expect(first.expectedJob.receiptId).toBe(second.expectedJob.receiptId);
    expect(first.nextJob.receiptId).not.toBe(second.nextJob.receiptId);
    expect(first.nextJob.request.requestHash).toBe(second.nextJob.request.requestHash);
    expect(first.nextJob.request.idempotencyKeyHash).not.toBe(
      second.nextJob.request.idempotencyKeyHash
    );
    expect(first.transition.schemaVersion).toBe(COMPUTE_JOB_TRANSITION_SCHEMA_VERSION);
    expect(first.transition.verificationScope).toBe('structural_only');
    expect(first.allocatorCommit).toBeUndefined();
    expect(second.allocatorCommit).toBeUndefined();
  });
});
