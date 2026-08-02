import { createHash, generateKeyPairSync, sign } from 'crypto';
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
  prepareComputeJob,
  type ComputeCapacityAllocationCursor,
  type ComputeEvidenceRole,
  type ComputeEvidenceSigner,
  type ComputeEvidenceTrustAnchor,
} from '@holoscript/core/world-model';
import { describe, expect, it, vi } from 'vitest';
import type { ComputeJobAdmissionSigner } from '../compute-job-admission';
import { COMPUTE_EXECUTION_OWNERSHIP_SCHEMA_VERSION } from '../compute-execution-ownership';
import {
  computeExecutorHolderDigest,
  ComputeJobDispatchError,
  createComputeJobDispatchService,
  createX25519ComputeExecutorGrantSealer,
  openX25519ComputeExecutorGrant,
  type ComputeBudgetAccountRef,
  type ComputeDispatchStore,
  type ComputeExecutorIdentity,
  type ComputeExecutorGrantSealer,
} from '../compute-job-dispatch-service';
import { ComputeJobStartError, createComputeJobStartService } from '../compute-job-start-service';
import {
  ComputeJobRunningError,
  createComputeJobRunningService,
} from '../compute-job-running-service';
import {
  ComputeJobReapingError,
  createComputeJobReapingService,
  type ComputeExecutionReaperIdentity,
} from '../compute-job-reaping-service';
import {
  ComputeJobStoreConflictError,
  ComputeJobStoreNotFoundError,
  type CommitComputeJobTransitionCommand,
  type CommitComputeExecutionHeartbeatCommand,
  type ComputeBudgetEvidenceEnvelope,
  type ComputeDurableEnvelope,
  type ComputeJobProjection,
  type ComputeWorkUnitEnvelope,
  type ReadActiveComputeBudgetHoldInput,
  type ReadComputeEvidenceInput,
  type ReadComputeJobInput,
  type ReadRegisteredComputeBudgetInput,
  type ReadRegisteredComputeCapacityInput,
  type RegisteredComputeBudget,
  type RegisteredComputeCapacity,
} from '../compute-job-store';

type JsonObject = Record<string, unknown>;

const TEAM_ID = 'team-dispatch-test';
const PRINCIPAL_DIGEST = digest('dispatch-principal');
const JOB_ID = digest('dispatch-job');
const CAPACITY_REF = digest('dispatch-capacity');
const BUDGET_RAIL_ID = 'enterprise-gpu-usd';
const BUDGET_POLICY_DIGEST = digest('dispatch-budget-policy');
const BUDGET_PERIOD_DIGEST = digest('dispatch-budget-period');
const ADMISSION_POLICY_DIGEST = digest('dispatch-admission-policy');
const NOW = '2026-08-01T12:00:05.000Z';
const OBSERVED_AT = '2026-08-01T12:00:00.000Z';
const CHECKED_AT = '2026-08-01T12:00:01.000Z';
const PREFLIGHTED_AT = '2026-08-01T12:00:02.000Z';
const VALID_FROM = '2026-08-01T00:00:00.000Z';
const VALID_UNTIL = '2026-08-02T00:00:00.000Z';
const PLAN_VALID_UNTIL = '2026-08-01T12:01:00.000Z';
const MAX_COST_MINOR_UNITS = 125;

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

function digest(value: string | Uint8Array): string {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function evidenceAuthority(): {
  signer: ComputeEvidenceSigner;
  anchor: ComputeEvidenceTrustAnchor;
} {
  const keys = generateKeyPairSync('ed25519');
  const roles: readonly ComputeEvidenceRole[] = [
    'capacity_observer',
    'bridge_admitter',
    'placement_planner',
    'lease_issuer',
    'execution_attestor',
  ];
  const signer: ComputeEvidenceSigner = {
    issuer: 'urn:holoscript:test:dispatch-evidence',
    keyId: 'dispatch-evidence-key',
    sign: (message) => sign(null, Buffer.from(message), keys.privateKey).toString('base64'),
  };
  return {
    signer,
    anchor: {
      issuer: signer.issuer,
      keyId: signer.keyId,
      algorithm: 'ed25519',
      roles,
      principalDigests: [PRINCIPAL_DIGEST],
      lanes: ['owned_fleet'],
      capacityRefs: [CAPACITY_REF],
      validFrom: VALID_FROM,
      validUntil: VALID_UNTIL,
      publicKeyPem: keys.publicKey.export({ type: 'spki', format: 'pem' }).toString(),
    },
  };
}

function budgetAuthority(): {
  signer: ComputeEvidenceSigner;
  anchor: ComputeEvidenceTrustAnchor;
} {
  const keys = generateKeyPairSync('ed25519');
  const signer: ComputeEvidenceSigner = {
    issuer: 'urn:holoscript:test:dispatch-budget',
    keyId: 'dispatch-budget-key',
    sign: (message) => sign(null, Buffer.from(message), keys.privateKey).toString('base64'),
  };
  return {
    signer,
    anchor: {
      issuer: signer.issuer,
      keyId: signer.keyId,
      algorithm: 'ed25519',
      roles: ['budget_ledger_attestor'],
      principalDigests: [PRINCIPAL_DIGEST],
      teamIds: [TEAM_ID],
      budgetRailIds: [BUDGET_RAIL_ID],
      validFrom: VALID_FROM,
      validUntil: VALID_UNTIL,
      publicKeyPem: keys.publicKey.export({ type: 'spki', format: 'pem' }).toString(),
    },
  };
}

function workUnit(): ComputeWorkUnitContract {
  return buildComputeWorkUnit(
    {
      intent: 'Run a bounded compiler-authored enterprise GPU workload.',
      allowed_accelerators: ['gpu'],
      placement_policy: 'owned_fleet',
      data_classification: 'internal',
      quality_metric: 'max_abs_error',
      quality_operator: 'lte',
      quality_threshold: 1e-5,
      quality_reference: 'cpu_reference',
      deadline_ms: 60_000,
      budget_currency: 'USD',
      max_cost_minor_units: MAX_COST_MINOR_UNITS,
      allow_fallback: false,
    },
    {
      objectName: 'dispatch-test',
      sourceDigest: 'a'.repeat(64),
      sourceDigestKind: 'source_utf8',
      compiler: 'ComputeWorkUnitCompiler',
      compilerVersion: COMPUTE_WORK_UNIT_COMPILER_VERSION,
    }
  );
}

function availableCursor(): ComputeCapacityAllocationCursor {
  const body = {
    capacityRef: CAPACITY_REF,
    slotState: 'available' as const,
    currentEpoch: 0,
    version: 0,
  };
  return { ...body, etag: computeCapacityAllocationEtag(body) };
}

function envelope(value: {
  readonly receiptId: string;
  readonly schemaVersion: string;
}): ComputeDurableEnvelope {
  return {
    receiptId: value.receiptId,
    schemaVersion: value.schemaVersion,
    bytes: canonicalJson(value),
  };
}

class FakeDispatchStore implements ComputeDispatchStore {
  readonly commands: CommitComputeJobTransitionCommand[] = [];
  readonly heartbeatCommands: CommitComputeExecutionHeartbeatCommand[] = [];
  readonly evidence = new Map<string, ComputeDurableEnvelope>();
  readJobCalls = 0;
  activeBudgetHold?: ComputeBudgetEvidenceEnvelope;
  failAcquireWith?: 'allocation_cas_conflict' | 'budget_cas_conflict' | 'budget_insufficient';

  constructor(
    public job: ComputeJobProjection,
    readonly unit: ComputeWorkUnitEnvelope,
    public capacity: RegisteredComputeCapacity,
    public budget: RegisteredComputeBudget
  ) {}

  async readJob(input: ReadComputeJobInput): Promise<ComputeJobProjection> {
    this.readJobCalls += 1;
    if (
      input.teamId !== this.job.teamId ||
      input.jobId !== this.job.receipt.jobId ||
      input.attempt !== this.job.receipt.attempt
    ) {
      throw new ComputeJobStoreNotFoundError('job');
    }
    return this.job;
  }

  async readWorkUnit(teamId: string, workUnitDigest: string): Promise<ComputeWorkUnitEnvelope> {
    if (teamId !== this.job.teamId || workUnitDigest !== this.unit.digest) {
      throw new ComputeJobStoreNotFoundError('work_unit');
    }
    return this.unit;
  }

  async readEvidence(input: ReadComputeEvidenceInput): Promise<readonly ComputeDurableEnvelope[]> {
    if (
      input.teamId !== this.job.teamId ||
      input.jobId !== this.job.receipt.jobId ||
      input.attempt !== this.job.receipt.attempt
    ) {
      throw new ComputeJobStoreNotFoundError('evidence');
    }
    return input.receiptIds.map((receiptId) => {
      const item = this.evidence.get(receiptId);
      if (!item) throw new ComputeJobStoreNotFoundError('evidence');
      return item;
    });
  }

  async readCurrentExecutionOwnership(input: ReadComputeJobInput) {
    if (
      input.teamId !== this.job.teamId ||
      input.jobId !== this.job.receipt.jobId ||
      input.attempt !== this.job.receipt.attempt
    ) {
      throw new ComputeJobStoreNotFoundError('execution_ownership');
    }
    const ownership = [...this.evidence.values()]
      .filter((item) => item.schemaVersion === COMPUTE_EXECUTION_OWNERSHIP_SCHEMA_VERSION)
      .map((item) => ({ item, receipt: JSON.parse(item.bytes) as { sequence?: number } }))
      .sort((left, right) => (right.receipt.sequence ?? -1) - (left.receipt.sequence ?? -1))[0];
    if (!ownership) throw new ComputeJobStoreNotFoundError('execution_ownership');
    return {
      ...ownership.item,
      schemaVersion: COMPUTE_EXECUTION_OWNERSHIP_SCHEMA_VERSION,
      receipt: JSON.parse(ownership.item.bytes),
    };
  }

  async readRegisteredCapacity(
    input: ReadRegisteredComputeCapacityInput
  ): Promise<RegisteredComputeCapacity> {
    if (
      input.teamId !== this.capacity.projection.teamId ||
      input.capacityRef !== this.capacity.projection.cursor.capacityRef
    ) {
      throw new ComputeJobStoreNotFoundError('capacity');
    }
    return this.capacity;
  }

  async readRegisteredBudget(
    input: ReadRegisteredComputeBudgetInput
  ): Promise<RegisteredComputeBudget> {
    const projection = this.budget.projection;
    if (
      input.teamId !== projection.teamId ||
      input.budgetRailId !== projection.budgetRailId ||
      input.currency !== projection.currency ||
      input.periodDigest !== projection.periodDigest
    ) {
      throw new ComputeJobStoreNotFoundError('budget');
    }
    return this.budget;
  }

  async readActiveBudgetHold(
    input: ReadActiveComputeBudgetHoldInput
  ): Promise<ComputeBudgetEvidenceEnvelope> {
    if (
      !this.activeBudgetHold ||
      input.teamId !== this.activeBudgetHold.receipt.teamId ||
      input.jobId !== this.activeBudgetHold.receipt.jobId ||
      input.attempt !== this.activeBudgetHold.receipt.attempt
    ) {
      throw new ComputeJobStoreNotFoundError('budget_hold');
    }
    return this.activeBudgetHold;
  }

  async commitTransition(command: CommitComputeJobTransitionCommand) {
    this.commands.push(command);
    if (command.transition.receipt.action === 'acquire_lease' && this.failAcquireWith) {
      throw new ComputeJobStoreConflictError(this.failAcquireWith, 'synthetic acquire conflict');
    }
    for (const item of command.evidence) this.evidence.set(item.receiptId, item);
    this.job = command.nextJob;
    if (command.nextAllocation) {
      this.capacity = {
        ...this.capacity,
        projection: command.nextAllocation,
      };
    }
    if (command.budgetEvidence) {
      this.activeBudgetHold = command.budgetEvidence;
      this.budget = {
        ...this.budget,
        projection: {
          ...this.budget.projection,
          account: command.budgetEvidence.receipt.accountAfter,
        },
        accountBytes: canonicalJson(command.budgetEvidence.receipt.accountAfter),
      };
    }
    return {
      disposition: 'committed' as const,
      publicResponseBytes: command.publicResponseBytes,
      transitionReceiptId: command.transition.receipt.receiptId,
      allocationCommitReceiptId: command.allocationCommit?.receipt.receiptId,
      budgetEvidenceReceiptId: command.budgetEvidence?.receipt.receiptId,
      readBack: {
        jobReceiptId: command.nextJob.receipt.receiptId,
        admissionReceiptId: command.admission.receipt.receiptId,
        allocationEtag: command.nextAllocation?.cursor.etag,
        budgetEvidenceReceiptId: command.budgetEvidence?.receipt.receiptId,
        evidenceReceiptIds: command.evidence.map((item) => item.receiptId),
        outboxEventIds: command.outbox.map((item) => item.eventId),
      },
    };
  }

  async commitExecutionHeartbeat(command: CommitComputeExecutionHeartbeatCommand) {
    this.heartbeatCommands.push(command);
    this.evidence.set(command.ownership.receiptId, command.ownership);
    return {
      disposition: 'committed' as const,
      ownershipReceiptId: command.ownership.receiptId,
      sequence: command.ownership.receipt.sequence,
      heartbeatAt: command.ownership.receipt.heartbeatAt,
      heartbeatValidUntil: command.ownership.receipt.heartbeatValidUntil,
      readBack: {
        evidenceReceiptId: command.ownership.receiptId,
        outboxEventId: command.outbox[0].eventId,
      },
    };
  }
}

function createHarness() {
  const evidence = evidenceAuthority();
  const budget = budgetAuthority();
  const admissionKeys = generateKeyPairSync('ed25519');
  const admissionSigner: ComputeJobAdmissionSigner = {
    issuer: 'urn:holoscript:test:dispatch-admission',
    keyId: 'dispatch-admission-key',
    privateKey: admissionKeys.privateKey,
  };
  const executorKeys = generateKeyPairSync('x25519');
  const grantSealer = createX25519ComputeExecutorGrantSealer(executorKeys.publicKey);
  const identity: ComputeExecutorIdentity = {
    kind: 'headless_executor',
    surface: 'headless',
    source: 'registered_pop_key',
    teamId: TEAM_ID,
    executorId: 'executor-gpu-1',
    seatId: 'fleet-seat-1',
    capabilities: ['compute:dispatch', 'compute:execute'],
    recipientKeyThumbprint: grantSealer.recipientKeyThumbprint,
    fencingKeyId: 'dispatch-fence-key-v1',
    validFrom: VALID_FROM,
    validUntil: VALID_UNTIL,
  };
  const unit = workUnit();
  const snapshot = buildComputeCapacitySnapshot({
    lane: 'owned_fleet',
    capacityRef: CAPACITY_REF,
    accelerator: 'gpu',
    health: 'ready',
    availableSlots: 1,
    allowedDataClassifications: ['internal'],
    observedAt: OBSERVED_AT,
    validUntil: PLAN_VALID_UNTIL,
    estimatedCost: {
      measurementState: 'measured',
      currency: 'USD',
      estimatedMinorUnits: MAX_COST_MINOR_UNITS,
    },
    signer: evidence.signer,
  });
  const plan = planComputePlacement({
    principalDigest: PRINCIPAL_DIGEST,
    workUnit: unit,
    capacitySnapshot: snapshot,
    checkedAt: CHECKED_AT,
    trustAnchors: [evidence.anchor],
    signer: evidence.signer,
  });
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
      trustAnchors: [evidence.anchor],
    },
    preparedAt: PREFLIGHTED_AT,
    idempotencyKey: 'create-dispatch-test-job',
  }).job;
  const cursor = availableCursor();
  const eligibility = {
    schemaVersion: 'holoscript.compute-fleet-resource-eligibility.v1' as const,
    capacityRef: CAPACITY_REF,
    provider: 'vast.ai' as const,
    instanceId: 42,
    eligible: true as const,
    validUntil: PLAN_VALID_UNTIL,
  };
  const dataPolicy = {
    schemaVersion: 'holoscript.compute-fleet-data-policy.v1' as const,
    capacityRef: CAPACITY_REF,
    allowedDataClassifications: ['internal'] as const,
    validUntil: PLAN_VALID_UNTIL,
  };
  const budgetProjection = {
    teamId: TEAM_ID,
    budgetRailId: BUDGET_RAIL_ID,
    currency: 'USD' as const,
    policyDigest: BUDGET_POLICY_DIGEST,
    periodDigest: BUDGET_PERIOD_DIGEST,
    validFrom: VALID_FROM,
    validUntil: VALID_UNTIL,
    limitAmountMinorUnits: 1_000,
    account: { heldAmountMinorUnits: 0, settledAmountMinorUnits: 0, version: 0 },
  };
  const store = new FakeDispatchStore(
    { teamId: TEAM_ID, receipt: preflighted, bytes: canonicalJson(preflighted) },
    { digest: computeWorkUnitDigest(unit), contract: unit, bytes: canonicalJson(unit) },
    {
      projection: {
        teamId: TEAM_ID,
        lane: 'owned_fleet',
        cursor,
        bytes: canonicalJson(cursor),
      },
      eligibility,
      eligibilityBytes: canonicalJson(eligibility),
      dataPolicy,
      dataPolicyBytes: canonicalJson(dataPolicy),
    },
    {
      projection: budgetProjection,
      registrationBytes: canonicalJson(budgetProjection),
      accountBytes: canonicalJson(budgetProjection.account),
    }
  );
  for (const item of [snapshot, plan]) store.evidence.set(item.receiptId, envelope(item));
  const seal = vi.fn(grantSealer.seal.bind(grantSealer));
  const observableSealer: ComputeExecutorGrantSealer = { ...grantSealer, seal };
  const budgetAccount: ComputeBudgetAccountRef = {
    budgetRailId: BUDGET_RAIL_ID,
    currency: 'USD',
    periodDigest: BUDGET_PERIOD_DIGEST,
  };
  const serviceOptions = {
    store,
    executorIdentity: identity,
    budgetAccount,
    evidenceSigner: evidence.signer,
    budgetSigner: budget.signer,
    evidenceTrustAnchors: [evidence.anchor, budget.anchor],
    admissionSigner,
    admissionTrustPolicyDigest: ADMISSION_POLICY_DIGEST,
    admissionKeyValidUntil: VALID_UNTIL,
    fencingKey: Buffer.alloc(32, 0x5a),
    grantSealer: observableSealer,
    now: () => NOW,
    leaseTtlMs: 30_000,
  } as const;
  const service = createComputeJobDispatchService(serviceOptions);
  return {
    service,
    store,
    identity,
    executorKeys,
    observableSealer,
    seal,
    budgetAccount,
    evidence,
    budget,
    admissionSigner,
    serviceOptions,
  };
}

function expectDispatchError(error: unknown, code: string): boolean {
  expect(error).toBeInstanceOf(ComputeJobDispatchError);
  expect(error).toMatchObject({ code });
  return true;
}

function expectStartError(error: unknown, code: string): boolean {
  expect(error).toBeInstanceOf(ComputeJobStartError);
  expect(error).toMatchObject({ code });
  return true;
}

function expectRunningError(error: unknown, code: string): boolean {
  expect(error).toBeInstanceOf(ComputeJobRunningError);
  expect(error).toMatchObject({ code });
  return true;
}

function expectReapingError(error: unknown, code: string): boolean {
  expect(error).toBeInstanceOf(ComputeJobReapingError);
  expect(error).toMatchObject({ code });
  return true;
}

function createStartService(harness: ReturnType<typeof createHarness>) {
  return createComputeJobStartService({
    store: harness.store,
    executorIdentity: harness.identity,
    evidenceTrustAnchors: [harness.evidence.anchor, harness.budget.anchor],
    admissionSigner: harness.admissionSigner,
    admissionTrustPolicyDigest: ADMISSION_POLICY_DIGEST,
    admissionKeyValidUntil: VALID_UNTIL,
    now: () => '2026-08-01T12:00:06.000Z',
  });
}

function createRunningService(
  harness: ReturnType<typeof createHarness>,
  at: string,
  heartbeatTtlMs = 30_000
) {
  return createComputeJobRunningService({
    store: harness.store,
    executorIdentity: harness.identity,
    evidenceTrustAnchors: [harness.evidence.anchor, harness.budget.anchor],
    admissionSigner: harness.admissionSigner,
    admissionTrustPolicyDigest: ADMISSION_POLICY_DIGEST,
    admissionKeyValidUntil: VALID_UNTIL,
    now: () => at,
    heartbeatTtlMs,
  });
}

function createReapingService(harness: ReturnType<typeof createHarness>, at: string) {
  const identity: ComputeExecutionReaperIdentity = {
    kind: 'execution_reaper',
    surface: 'headless',
    source: 'registered_service_key',
    teamId: TEAM_ID,
    reaperId: 'fleet-heartbeat-reaper-1',
    capabilities: ['compute:reap'],
    validFrom: VALID_FROM,
    validUntil: VALID_UNTIL,
  };
  return createComputeJobReapingService({
    store: harness.store,
    reaperIdentity: identity,
    admissionSigner: harness.admissionSigner,
    admissionTrustPolicyDigest: ADMISSION_POLICY_DIGEST,
    admissionKeyValidUntil: VALID_UNTIL,
    now: () => at,
  });
}

function grantFencingToken(
  harness: ReturnType<typeof createHarness>,
  grant: Awaited<ReturnType<typeof harness.service.dispatch>>['grant']
): Buffer {
  const plaintext = Buffer.from(
    openX25519ComputeExecutorGrant(grant, harness.executorKeys.privateKey)
  );
  try {
    const claims = JSON.parse(plaintext.toString('utf8')) as JsonObject;
    return Buffer.from(String(claims.fencingTokenBase64), 'base64');
  } finally {
    plaintext.fill(0);
  }
}

describe('compute-job-dispatch-service', () => {
  it('queues, acquires one logical slot with a budget hold, and only then seals the fence', async () => {
    const harness = createHarness();
    const result = await harness.service.dispatch({ jobId: JOB_ID, attempt: 1 });

    expect(harness.store.commands.map((command) => command.transition.receipt.action)).toEqual([
      'queue',
      'acquire_lease',
    ]);
    const [queued, acquired] = harness.store.commands;
    expect(queued.operation).toBe('compute_job.queue');
    expect(queued.expectedAllocation).toBeUndefined();
    expect(queued.budgetEvidence).toBeUndefined();
    expect(acquired).toMatchObject({
      operation: 'compute_job.acquire_lease',
      expectedAllocation: { cursor: { slotState: 'available', currentEpoch: 0 } },
      nextAllocation: { cursor: { slotState: 'leased', currentEpoch: 1 } },
      budgetEvidence: {
        receipt: {
          status: 'held',
          maxAmountMinorUnits: MAX_COST_MINOR_UNITS,
          heldAmountMinorUnits: MAX_COST_MINOR_UNITS,
        },
      },
    });
    expect(harness.seal).toHaveBeenCalledTimes(1);
    expect(JSON.parse(result.publicResponseBytes)).toMatchObject({
      state: 'leased',
      providerReservation: 'not_asserted',
      execution: 'not_asserted',
    });
    expect(result.grant).toMatchObject({
      verificationScope: 'sealed_logical_lease_material_only',
      holderDigest: computeExecutorHolderDigest(harness.identity),
      fencingEpoch: 1,
      budgetEvidenceReceiptId: acquired.budgetEvidence?.receipt.receiptId,
      providerReservation: 'not_asserted',
      execution: 'not_asserted',
    });

    const plaintext = Buffer.from(
      openX25519ComputeExecutorGrant(result.grant, harness.executorKeys.privateKey)
    );
    const claims = JSON.parse(plaintext.toString('utf8')) as JsonObject;
    const fencingToken = Buffer.from(String(claims.fencingTokenBase64), 'base64');
    expect(digest(fencingToken)).toBe(acquired.nextJob.receipt.lease?.fencingTokenHash);
    expect(claims).toMatchObject({
      jobId: JOB_ID,
      workUnitDigest: acquired.expectedWorkUnit.digest,
      providerReservation: 'not_asserted',
      execution: 'not_asserted',
    });
    const sentinel = fencingToken.toString('base64');
    expect(JSON.stringify(acquired)).not.toContain(sentinel);
    expect(JSON.stringify(result.grant)).not.toContain(sentinel);
    plaintext.fill(0);
    fencingToken.fill(0);
  });

  it('rejects caller-supplied authority fields before reading durable state', async () => {
    const harness = createHarness();
    const polluted = {
      jobId: JOB_ID,
      attempt: 1,
      teamId: 'attacker-team',
      budgetRailId: 'attacker-budget',
      capacityRef: digest('attacker-capacity'),
      provider: 'attacker-provider',
      fencingToken: 'attacker-token',
    } as unknown as { jobId: string; attempt: number };

    await expect(harness.service.dispatch(polluted)).rejects.toSatisfy((error: unknown) =>
      expectDispatchError(error, 'invalid_request')
    );
    expect(harness.store.readJobCalls).toBe(0);
    expect(harness.store.commands).toHaveLength(0);
    expect(harness.seal).not.toHaveBeenCalled();
  });

  it('rejects revoked and non-exact executor identities before reading durable state', async () => {
    const harness = createHarness();
    const invalidIdentities = [
      { ...harness.identity, revokedAt: '1970-01-01T00:00:00.000Z' },
      {
        ...harness.identity,
        capabilities: ['compute:execute'],
      },
      {
        ...harness.identity,
        kind: 'user',
        surface: 'interactive',
        source: 'bearer',
      },
    ];

    for (const identity of invalidIdentities) {
      const service = createComputeJobDispatchService({
        ...harness.serviceOptions,
        executorIdentity: identity as unknown as ComputeExecutorIdentity,
      });
      await expect(service.dispatch({ jobId: JOB_ID, attempt: 1 })).rejects.toSatisfy(
        (error: unknown) => expectDispatchError(error, 'executor_identity_invalid')
      );
    }
    expect(harness.store.readJobCalls).toBe(0);
    expect(harness.store.commands).toHaveLength(0);
    expect(harness.seal).not.toHaveBeenCalled();
  });

  it.each(['allocation_cas_conflict', 'budget_cas_conflict', 'budget_insufficient'] as const)(
    'leaves the job queued and emits no grant when %s wins the acquire race',
    async (conflict) => {
      const harness = createHarness();
      harness.store.failAcquireWith = conflict;

      await expect(harness.service.dispatch({ jobId: JOB_ID, attempt: 1 })).rejects.toSatisfy(
        (error: unknown) => expectDispatchError(error, 'dispatch_conflict')
      );
      expect(harness.store.job.receipt.state).toBe('queued');
      expect(harness.store.capacity.projection.cursor.slotState).toBe('available');
      expect(harness.store.budget.projection.account.heldAmountMinorUnits).toBe(0);
      expect(harness.seal).not.toHaveBeenCalled();
    }
  );

  it('recovers the same leased fence without a second transition and rejects a different executor', async () => {
    const harness = createHarness();
    const first = await harness.service.dispatch({ jobId: JOB_ID, attempt: 1 });
    const commandCount = harness.store.commands.length;
    const second = await harness.service.dispatch({ jobId: JOB_ID, attempt: 1 });

    expect(harness.store.commands).toHaveLength(commandCount);
    const firstClaims = JSON.parse(
      Buffer.from(
        openX25519ComputeExecutorGrant(first.grant, harness.executorKeys.privateKey)
      ).toString('utf8')
    );
    const secondClaims = JSON.parse(
      Buffer.from(
        openX25519ComputeExecutorGrant(second.grant, harness.executorKeys.privateKey)
      ).toString('utf8')
    );
    expect(secondClaims.fencingTokenBase64).toBe(firstClaims.fencingTokenBase64);
    expect(second.grant.ciphertextBase64).not.toBe(first.grant.ciphertextBase64);

    const otherKeys = generateKeyPairSync('x25519');
    const otherSealer = createX25519ComputeExecutorGrantSealer(otherKeys.publicKey);
    const otherIdentity: ComputeExecutorIdentity = {
      ...harness.identity,
      executorId: 'executor-gpu-2',
      seatId: 'fleet-seat-2',
      recipientKeyThumbprint: otherSealer.recipientKeyThumbprint,
    };
    const otherService = createComputeJobDispatchService({
      store: harness.store,
      executorIdentity: otherIdentity,
      budgetAccount: harness.budgetAccount,
      evidenceSigner: harness.evidence.signer,
      budgetSigner: harness.budget.signer,
      evidenceTrustAnchors: [harness.evidence.anchor, harness.budget.anchor],
      admissionSigner: harness.admissionSigner,
      admissionTrustPolicyDigest: ADMISSION_POLICY_DIGEST,
      admissionKeyValidUntil: VALID_UNTIL,
      fencingKey: Buffer.alloc(32, 0x5a),
      grantSealer: otherSealer,
      now: () => NOW,
    });
    await expect(otherService.dispatch({ jobId: JOB_ID, attempt: 1 })).rejects.toSatisfy(
      (error: unknown) => expectDispatchError(error, 'job_not_dispatchable')
    );
  });

  it('fails closed when a different PoP key tries to open the sealed lease material', async () => {
    const harness = createHarness();
    const result = await harness.service.dispatch({ jobId: JOB_ID, attempt: 1 });
    const wrongKey = generateKeyPairSync('x25519').privateKey;

    expect(() => openX25519ComputeExecutorGrant(result.grant, wrongKey)).toThrow(
      'recipient key does not match'
    );
  });

  it('redeems the sealed fence once into a guarded start transition without exposing it', async () => {
    const harness = createHarness();
    const dispatched = await harness.service.dispatch({ jobId: JOB_ID, attempt: 1 });
    const fencingToken = grantFencingToken(harness, dispatched.grant);
    const sentinel = fencingToken.toString('base64');
    try {
      const started = await createStartService(harness).start({
        jobId: JOB_ID,
        attempt: 1,
        leaseReceiptId: dispatched.grant.leaseReceiptId,
        fencingToken,
      });

      expect(harness.store.commands.map((command) => command.transition.receipt.action)).toEqual([
        'queue',
        'acquire_lease',
        'start',
      ]);
      const command = harness.store.commands.at(-1);
      expect(command).toMatchObject({
        operation: 'compute_job.start',
        nextJob: { receipt: { state: 'starting' } },
        leaseUseGuard: {
          holderDigest: computeExecutorHolderDigest(harness.identity),
          verifiedFencingTokenHash: harness.store.job.receipt.lease?.fencingTokenHash,
          allocation: {
            cursor: {
              slotState: 'leased',
              currentLeaseReceiptId: dispatched.grant.leaseReceiptId,
              currentEpoch: dispatched.grant.fencingEpoch,
            },
          },
          activeBudgetHold: harness.store.activeBudgetHold,
        },
      });
      expect(started).toMatchObject({
        disposition: 'committed',
        state: 'starting',
        providerReservation: 'not_asserted',
        execution: 'not_asserted',
      });
      expect(JSON.stringify(command)).not.toContain(sentinel);
      expect(JSON.stringify(started)).not.toContain(sentinel);
    } finally {
      fencingToken.fill(0);
    }
  });

  it('rejects the wrong fence, stale allocator, and missing paid hold before start commit', async () => {
    const wrongFenceHarness = createHarness();
    const wrongFenceGrant = await wrongFenceHarness.service.dispatch({ jobId: JOB_ID, attempt: 1 });
    await expect(
      createStartService(wrongFenceHarness).start({
        jobId: JOB_ID,
        attempt: 1,
        leaseReceiptId: wrongFenceGrant.grant.leaseReceiptId,
        fencingToken: Buffer.alloc(32, 0x11),
      })
    ).rejects.toSatisfy((error: unknown) => expectStartError(error, 'lease_unauthorized'));
    expect(
      wrongFenceHarness.store.commands.filter((item) => item.operation === 'compute_job.start')
    ).toHaveLength(0);

    const staleHarness = createHarness();
    const staleGrant = await staleHarness.service.dispatch({ jobId: JOB_ID, attempt: 1 });
    const staleToken = grantFencingToken(staleHarness, staleGrant.grant);
    staleHarness.store.capacity = {
      ...staleHarness.store.capacity,
      projection: {
        ...staleHarness.store.capacity.projection,
        cursor: availableCursor(),
        bytes: canonicalJson(availableCursor()),
      },
    };
    try {
      await expect(
        createStartService(staleHarness).start({
          jobId: JOB_ID,
          attempt: 1,
          leaseReceiptId: staleGrant.grant.leaseReceiptId,
          fencingToken: staleToken,
        })
      ).rejects.toSatisfy((error: unknown) => expectStartError(error, 'lease_unauthorized'));
    } finally {
      staleToken.fill(0);
    }

    const budgetHarness = createHarness();
    const budgetGrant = await budgetHarness.service.dispatch({ jobId: JOB_ID, attempt: 1 });
    const budgetToken = grantFencingToken(budgetHarness, budgetGrant.grant);
    budgetHarness.store.activeBudgetHold = undefined;
    try {
      await expect(
        createStartService(budgetHarness).start({
          jobId: JOB_ID,
          attempt: 1,
          leaseReceiptId: budgetGrant.grant.leaseReceiptId,
          fencingToken: budgetToken,
        })
      ).rejects.toSatisfy((error: unknown) => expectStartError(error, 'budget_unavailable'));
    } finally {
      budgetToken.fill(0);
    }
    expect(
      budgetHarness.store.commands.filter((item) => item.operation === 'compute_job.start')
    ).toHaveLength(0);
  });

  it('rejects injected authority before reads and rejects sequential grant redemption', async () => {
    const harness = createHarness();
    const startService = createStartService(harness);
    const beforeReads = harness.store.readJobCalls;
    await expect(
      startService.start({
        jobId: JOB_ID,
        attempt: 1,
        leaseReceiptId: digest('attacker-lease'),
        fencingToken: Buffer.alloc(32),
        teamId: 'attacker-team',
      } as unknown as Parameters<typeof startService.start>[0])
    ).rejects.toSatisfy((error: unknown) => expectStartError(error, 'invalid_request'));
    expect(harness.store.readJobCalls).toBe(beforeReads);

    const dispatched = await harness.service.dispatch({ jobId: JOB_ID, attempt: 1 });
    const token = grantFencingToken(harness, dispatched.grant);
    try {
      const selector = {
        jobId: JOB_ID,
        attempt: 1,
        leaseReceiptId: dispatched.grant.leaseReceiptId,
        fencingToken: token,
      };
      await expect(startService.start(selector)).resolves.toMatchObject({ state: 'starting' });
      await expect(startService.start(selector)).rejects.toSatisfy((error: unknown) =>
        expectStartError(error, 'grant_not_redeemable')
      );
      expect(
        harness.store.commands.filter((item) => item.operation === 'compute_job.start')
      ).toHaveLength(1);
    } finally {
      token.fill(0);
    }
  });

  it('binds a fenced running acknowledgement into admission and two durable outbox events', async () => {
    const harness = createHarness();
    const dispatched = await harness.service.dispatch({ jobId: JOB_ID, attempt: 1 });
    const token = grantFencingToken(harness, dispatched.grant);
    try {
      await createStartService(harness).start({
        jobId: JOB_ID,
        attempt: 1,
        leaseReceiptId: dispatched.grant.leaseReceiptId,
        fencingToken: token,
      });
      const running = await createRunningService(harness, '2026-08-01T12:00:07.000Z').markRunning({
        jobId: JOB_ID,
        attempt: 1,
        leaseReceiptId: dispatched.grant.leaseReceiptId,
        fencingToken: token,
      });

      const command = harness.store.commands.at(-1);
      expect(command).toMatchObject({
        operation: 'compute_job.mark_running',
        nextJob: { receipt: { state: 'running' } },
        leaseUseGuard: {
          holderDigest: computeExecutorHolderDigest(harness.identity),
          activeBudgetHold: harness.store.activeBudgetHold,
        },
      });
      const ownership = command?.evidence.find(
        (item) => item.schemaVersion === COMPUTE_EXECUTION_OWNERSHIP_SCHEMA_VERSION
      );
      expect(JSON.parse(ownership?.bytes ?? '{}')).toMatchObject({
        kind: 'running_acknowledgement',
        sequence: 0,
        holderDigest: computeExecutorHolderDigest(harness.identity),
        providerReservation: 'not_asserted',
        execution: 'not_asserted',
        startPermission: 'outbox_after_commit',
      });
      expect(command?.transition.receipt.evidenceReceiptIds).toEqual([
        dispatched.grant.leaseReceiptId,
      ]);
      expect(command?.admission.receipt.evidenceBindings.map((item) => item.receiptId)).toEqual(
        [dispatched.grant.leaseReceiptId, running.ownershipReceiptId].sort()
      );
      expect(command?.outbox.map((item) => item.eventType).sort()).toEqual([
        'compute_execution.claimed',
        'compute_job.running',
      ]);
      expect(running).toMatchObject({
        state: 'running',
        startPermission: 'outbox_after_commit',
        providerReservation: 'not_asserted',
        execution: 'not_asserted',
      });
    } finally {
      token.fill(0);
    }
  });

  it('refreshes the exact ownership chain without mutating running job state', async () => {
    const harness = createHarness();
    const dispatched = await harness.service.dispatch({ jobId: JOB_ID, attempt: 1 });
    const token = grantFencingToken(harness, dispatched.grant);
    try {
      await createStartService(harness).start({
        jobId: JOB_ID,
        attempt: 1,
        leaseReceiptId: dispatched.grant.leaseReceiptId,
        fencingToken: token,
      });
      const running = await createRunningService(harness, '2026-08-01T12:00:07.000Z').markRunning({
        jobId: JOB_ID,
        attempt: 1,
        leaseReceiptId: dispatched.grant.leaseReceiptId,
        fencingToken: token,
      });
      const runningJobReceiptId = harness.store.job.receipt.receiptId;
      const heartbeat = await createRunningService(harness, '2026-08-01T12:00:08.000Z').heartbeat({
        jobId: JOB_ID,
        attempt: 1,
        leaseReceiptId: dispatched.grant.leaseReceiptId,
        previousOwnershipReceiptId: running.ownershipReceiptId,
        heartbeatAt: '2026-08-01T12:00:08.000Z',
        fencingToken: token,
      });

      expect(heartbeat).toMatchObject({
        state: 'running',
        sequence: 1,
        providerReservation: 'not_asserted',
        execution: 'not_asserted',
      });
      expect(harness.store.job.receipt.receiptId).toBe(runningJobReceiptId);
      expect(harness.store.heartbeatCommands).toHaveLength(1);
      expect(harness.store.heartbeatCommands[0]).toMatchObject({
        previousOwnershipReceiptId: running.ownershipReceiptId,
        ownership: {
          receipt: {
            kind: 'heartbeat',
            sequence: 1,
            previousReceiptId: running.ownershipReceiptId,
          },
        },
        outbox: [{ eventType: 'compute_execution.heartbeat' }],
      });
    } finally {
      token.fill(0);
    }
  });

  it('rejects a wrong running fence and injected heartbeat authority before custody writes', async () => {
    const harness = createHarness();
    const dispatched = await harness.service.dispatch({ jobId: JOB_ID, attempt: 1 });
    const token = grantFencingToken(harness, dispatched.grant);
    try {
      await createStartService(harness).start({
        jobId: JOB_ID,
        attempt: 1,
        leaseReceiptId: dispatched.grant.leaseReceiptId,
        fencingToken: token,
      });
      const service = createRunningService(harness, '2026-08-01T12:00:07.000Z');
      await expect(
        service.markRunning({
          jobId: JOB_ID,
          attempt: 1,
          leaseReceiptId: dispatched.grant.leaseReceiptId,
          fencingToken: Buffer.alloc(32, 0x11),
        })
      ).rejects.toSatisfy((error: unknown) => expectRunningError(error, 'lease_unauthorized'));
      expect(
        harness.store.commands.filter((command) => command.operation === 'compute_job.mark_running')
      ).toHaveLength(0);
      await expect(
        service.heartbeat({
          jobId: JOB_ID,
          attempt: 1,
          leaseReceiptId: dispatched.grant.leaseReceiptId,
          previousOwnershipReceiptId: digest('forged-ownership'),
          heartbeatAt: '2026-08-01T12:00:07.000Z',
          fencingToken: token,
          teamId: 'attacker-team',
        } as unknown as Parameters<typeof service.heartbeat>[0])
      ).rejects.toSatisfy((error: unknown) => expectRunningError(error, 'invalid_request'));
      expect(harness.store.heartbeatCommands).toHaveLength(0);
    } finally {
      token.fill(0);
    }
  });

  it('reaps an expired current heartbeat, releases only the logical slot, and retains the paid hold', async () => {
    const harness = createHarness();
    const dispatched = await harness.service.dispatch({ jobId: JOB_ID, attempt: 1 });
    const token = grantFencingToken(harness, dispatched.grant);
    try {
      await createStartService(harness).start({
        jobId: JOB_ID,
        attempt: 1,
        leaseReceiptId: dispatched.grant.leaseReceiptId,
        fencingToken: token,
      });
      const running = await createRunningService(
        harness,
        '2026-08-01T12:00:07.000Z',
        5_000
      ).markRunning({
        jobId: JOB_ID,
        attempt: 1,
        leaseReceiptId: dispatched.grant.leaseReceiptId,
        fencingToken: token,
      });
      const runningJobReceiptId = harness.store.job.receipt.receiptId;
      const held = harness.store.activeBudgetHold;
      const result = await createReapingService(harness, running.heartbeatValidUntil).reap({
        jobId: JOB_ID,
        attempt: 1,
        expectedJobReceiptId: runningJobReceiptId,
        expectedOwnershipReceiptId: running.ownershipReceiptId,
      });

      const command = harness.store.commands.at(-1);
      expect(command).toMatchObject({
        operation: 'compute_job.fail',
        expectedJob: { receipt: { state: 'running', receiptId: runningJobReceiptId } },
        nextJob: {
          receipt: {
            state: 'failed',
            terminal: {
              reasonCode: 'executor_lost',
              completionDisposition: 'execution_unobserved',
              evidence: { kind: 'execution_unobserved', reasonCode: 'executor_lost' },
            },
          },
        },
        nextAllocation: { cursor: { slotState: 'available', currentEpoch: 1 } },
        executionRecoveryGuard: {
          expiredOwnership: { receiptId: running.ownershipReceiptId },
          activeBudgetHold: held,
        },
      });
      expect(command?.budgetEvidence).toBeUndefined();
      expect(command?.evidence.map((item) => item.receiptId)).toEqual([running.ownershipReceiptId]);
      expect(command?.admission.receipt.evidenceBindings.map((item) => item.receiptId)).toEqual([
        running.ownershipReceiptId,
      ]);
      expect(command?.outbox.map((item) => item.eventType)).toEqual(['compute_job.failed']);
      expect(harness.store.activeBudgetHold).toEqual(held);
      expect(result).toMatchObject({
        state: 'failed',
        reasonCode: 'executor_lost',
        completionDisposition: 'execution_unobserved',
        ownershipReceiptId: running.ownershipReceiptId,
        leaseDisposition: 'logical_slot_released',
        budgetDisposition: 'retained_for_reconciliation',
        providerReservation: 'not_asserted',
        execution: 'not_asserted',
      });
    } finally {
      token.fill(0);
    }
  });

  it('rejects an early reap and a stale ownership selector before a terminal write', async () => {
    const harness = createHarness();
    const dispatched = await harness.service.dispatch({ jobId: JOB_ID, attempt: 1 });
    const token = grantFencingToken(harness, dispatched.grant);
    try {
      await createStartService(harness).start({
        jobId: JOB_ID,
        attempt: 1,
        leaseReceiptId: dispatched.grant.leaseReceiptId,
        fencingToken: token,
      });
      const running = await createRunningService(
        harness,
        '2026-08-01T12:00:07.000Z',
        5_000
      ).markRunning({
        jobId: JOB_ID,
        attempt: 1,
        leaseReceiptId: dispatched.grant.leaseReceiptId,
        fencingToken: token,
      });
      const runningJobReceiptId = harness.store.job.receipt.receiptId;

      await expect(
        createReapingService(harness, '2026-08-01T12:00:11.999Z').reap({
          jobId: JOB_ID,
          attempt: 1,
          expectedJobReceiptId: runningJobReceiptId,
          expectedOwnershipReceiptId: running.ownershipReceiptId,
        })
      ).rejects.toSatisfy((error: unknown) => expectReapingError(error, 'heartbeat_current'));
      await expect(
        createReapingService(harness, running.heartbeatValidUntil).reap({
          jobId: JOB_ID,
          attempt: 1,
          expectedJobReceiptId: runningJobReceiptId,
          expectedOwnershipReceiptId: digest('stale-ownership-selector'),
        })
      ).rejects.toSatisfy((error: unknown) => expectReapingError(error, 'ownership_conflict'));
      expect(
        harness.store.commands.filter((command) => command.operation === 'compute_job.fail')
      ).toHaveLength(0);
      expect(harness.store.job.receipt.state).toBe('running');
    } finally {
      token.fill(0);
    }
  });
});
