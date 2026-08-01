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
import {
  ComputeJobStoreConflictError,
  ComputeJobStoreNotFoundError,
  type CommitComputeJobTransitionCommand,
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
});
