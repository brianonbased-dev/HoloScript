import { createHash, generateKeyPairSync, sign as signMessage } from 'crypto';
import { type ComputeEvidenceSigner, type ComputeJobReceipt } from '@holoscript/core/world-model';
import { describe, expect, it, vi } from 'vitest';
import {
  COMPUTE_JOB_ADMISSION_TRUST_ANCHOR_SCHEMA_VERSION,
  verifyComputeJobAdmission,
  type ComputeJobAdmissionSigner,
  type ComputeJobAdmissionTrustAnchor,
} from '../compute-job-admission';
import {
  buildComputeJobPublicResponseBytes,
  ComputeJobStoreNotFoundError,
  type CommitComputeJobTransitionCommand,
  type CommitComputeJobTransitionResult,
  type ComputeJobProjection,
  type ComputeWorkUnitEnvelope,
  type CreateComputeJobCommand,
  type CreateComputeJobResult,
  type ReadComputeJobInput,
  type RegisterComputeCapacityCommand,
  type RegisterComputeCapacityResult,
  type RegisteredComputeCapacity,
} from '../compute-job-store';
import {
  computeCallerPrincipalDigest,
  ComputeJobServiceError,
  createComputeJobUserService,
  type ComputeCapacityBindingConfig,
} from '../compute-job-service';
import type { TeamFleetSnapshotRecord } from '../types';

const NOW = '2026-08-01T12:00:30.000Z';
const CAPTURED_AT = '2026-08-01T12:00:00.000Z';
const KEY_VALID_FROM = '2026-07-31T12:00:00.000Z';
const KEY_VALID_UNTIL = '2026-08-02T12:00:00.000Z';
const TEAM_ID = 'team-enterprise';
const CAPACITY_REF = `sha256:${'c'.repeat(64)}`;
const INSTANCE_ID = 44_496_858;
const TRUST_POLICY_DIGEST = `sha256:${'a'.repeat(64)}`;

const OWNER = {
  teamId: TEAM_ID,
  agentId: 'owner-agent',
  walletAddress: '0xAbC123',
  canOperate: false,
} as const;
const OUTSIDER = {
  teamId: TEAM_ID,
  agentId: 'outsider-agent',
  walletAddress: '0xdef456',
  canOperate: false,
} as const;
const OPERATOR = {
  teamId: TEAM_ID,
  agentId: 'fleet-operator',
  walletAddress: '0x987fed',
  canOperate: true,
} as const;

const AUTHORED_SOURCE = `
composition "EnterpriseCompute" {
  object "ThermalStep" @compute {
    intent: "Run a bounded Fleet-backed GPU workload.",
    allowed_accelerators: ["gpu"],
    placement_policy: "external_bridge_requested",
    data_classification: "internal",
    quality_metric: "max_abs_error",
    quality_operator: "lte",
    quality_threshold: 0.00001,
    quality_reference: "cpu_reference",
    deadline_ms: 60000,
    budget_currency: "USD",
    max_cost_minor_units: 100,
    allow_fallback: false
  } {}
}
`;

function digest(value: string): string {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function jobKey(input: ReadComputeJobInput): string {
  return `${input.teamId}\0${input.jobId}\0${input.attempt}`;
}

function capacityKey(teamId: string, capacityRef: string): string {
  return `${teamId}\0${capacityRef}`;
}

class FakeComputeCustodyLedger {
  readonly jobs = new Map<string, ComputeJobProjection>();
  readonly workUnits = new Map<string, ComputeWorkUnitEnvelope>();
  readonly capacities = new Map<string, RegisteredComputeCapacity>();
  readonly stores = new Map<string, FakeComputeCustodyStore>();

  storeFor(teamId: string, principalDigest: string): FakeComputeCustodyStore {
    const key = `${teamId}\0${principalDigest}`;
    let store = this.stores.get(key);
    if (!store) {
      store = new FakeComputeCustodyStore(this);
      this.stores.set(key, store);
    }
    return store;
  }
}

class FakeComputeCustodyStore {
  readonly registrationCommands: RegisterComputeCapacityCommand[] = [];
  readonly createCommands: CreateComputeJobCommand[] = [];
  readonly transitionCommands: CommitComputeJobTransitionCommand[] = [];
  readonly readWorkUnitCalls: Array<{ teamId: string; digest: string }> = [];

  constructor(private readonly ledger: FakeComputeCustodyLedger) {}

  async readJob(input: ReadComputeJobInput): Promise<ComputeJobProjection> {
    const job = this.ledger.jobs.get(jobKey(input));
    if (!job) throw new ComputeJobStoreNotFoundError('job');
    return job;
  }

  async readWorkUnit(teamId: string, workUnitDigest: string): Promise<ComputeWorkUnitEnvelope> {
    this.readWorkUnitCalls.push({ teamId, digest: workUnitDigest });
    const workUnit = this.ledger.workUnits.get(`${teamId}\0${workUnitDigest}`);
    if (!workUnit) throw new ComputeJobStoreNotFoundError('work_unit');
    return workUnit;
  }

  async readRegisteredCapacity(input: {
    readonly teamId: string;
    readonly capacityRef: string;
  }): Promise<RegisteredComputeCapacity> {
    const capacity = this.ledger.capacities.get(capacityKey(input.teamId, input.capacityRef));
    if (!capacity) throw new ComputeJobStoreNotFoundError('capacity');
    return capacity;
  }

  async registerCapacity(
    command: RegisterComputeCapacityCommand
  ): Promise<RegisterComputeCapacityResult> {
    this.registrationCommands.push(command);
    this.ledger.capacities.set(
      capacityKey(command.projection.teamId, command.projection.cursor.capacityRef),
      {
        projection: command.projection,
        eligibility: command.eligibility,
        eligibilityBytes: command.eligibilityBytes,
        dataPolicy: command.dataPolicy,
        dataPolicyBytes: command.dataPolicyBytes,
      }
    );
    return {
      disposition: 'committed',
      capacityRef: command.projection.cursor.capacityRef,
      lane: command.projection.lane,
      etag: command.projection.cursor.etag,
      cursorBytes: command.projection.bytes,
    };
  }

  async createJob(command: CreateComputeJobCommand): Promise<CreateComputeJobResult> {
    this.createCommands.push(command);
    this.ledger.jobs.set(
      jobKey({
        teamId: command.job.teamId,
        jobId: command.job.receipt.jobId,
        attempt: command.job.receipt.attempt,
      }),
      command.job
    );
    this.ledger.workUnits.set(
      `${command.job.teamId}\0${command.workUnit.digest}`,
      command.workUnit
    );
    return {
      disposition: 'committed',
      publicResponseBytes: command.publicResponseBytes,
      jobReceiptId: command.job.receipt.receiptId,
      readBack: {
        admissionReceiptId: command.admission.receipt.receiptId,
        evidenceReceiptIds: command.evidence.map((item) => item.receiptId),
        outboxEventIds: command.outbox.map((item) => item.eventId),
      },
    };
  }

  async commitTransition(
    command: CommitComputeJobTransitionCommand
  ): Promise<CommitComputeJobTransitionResult> {
    this.transitionCommands.push(command);
    this.ledger.jobs.set(
      jobKey({
        teamId: command.nextJob.teamId,
        jobId: command.nextJob.receipt.jobId,
        attempt: command.nextJob.receipt.attempt,
      }),
      command.nextJob
    );
    return {
      disposition: 'committed',
      publicResponseBytes: command.publicResponseBytes,
      transitionReceiptId: command.transition.receipt.receiptId,
      readBack: {
        jobReceiptId: command.nextJob.receipt.receiptId,
        admissionReceiptId: command.admission.receipt.receiptId,
        evidenceReceiptIds: command.evidence.map((item) => item.receiptId),
        outboxEventIds: command.outbox.map((item) => item.eventId),
      },
    };
  }
}

function fleetRecord(): TeamFleetSnapshotRecord {
  return {
    source: 'fleet-status-live.mjs',
    publishedAt: '2026-08-01T12:00:01.000Z',
    publishedByAgentId: 'fleet-observer-1',
    publishedByName: 'Fleet Observer',
    health: {
      status: 'ok',
      reasons: [],
      ageMs: 30_000,
      staleAfterMs: 120_000,
    },
    snapshot: {
      schema_version: 'holomesh.fleet-snapshot/v2',
      captured_at: CAPTURED_AT,
      summary: {
        captured_at: CAPTURED_AT,
        running_count: 1,
        declared_count: 1,
        orphan_count: 0,
        orphaned_capacity_count: 0,
        no_instance_count: 0,
        total_cost_so_far_usd: 1,
        total_dph_usd: 0.6,
        projected_24h_cost_usd: 14.4,
      },
      matched: [],
      orphans: [],
      resource_flow: {
        schema_version: 'holomesh.vast-resource-flow/v1',
        provider: 'vast.ai',
        captured_at: CAPTURED_AT,
        spend_accounting: {
          schema_version: 'holomesh.vast-spend-accounting/v1',
          provider: 'vast.ai',
          status: 'ok',
          observed_at_utc: CAPTURED_AT,
          freshness_status: 'fresh',
          age_ms: 0,
          max_age_ms: 900_000,
          rail: 'purchased_compute',
          reset_window: 'utc_day',
          vendor_total_usd: 1,
          observed_purchased_compute_usd: 1,
          monetary_complete: true,
          monetary_gap_reasons: [],
          provenance_complete: true,
          provenance_gap_reasons: [],
          intentional_gap_captured: false,
          cap_applicable: true,
          cap_usd: 100,
          observed_admission_verdict: 'under-cap',
          trusted_admission_verdict: 'under-cap',
          trusted_headroom_usd: 99,
          no_paid_actions: true,
        },
        utilized: {
          instance_count: 1,
          active_compute_count: 1,
          retained_storage_count: 0,
          manifest_bound_instance_count: 1,
          unbound_instance_count: 0,
          capacity_binding_count: 1,
          effective_dph_usd: 0.6,
          projected_24h_usd: 14.4,
          resources: [
            {
              instance_id: INSTANCE_ID,
              resource_id: 'vast:instance:44496858',
              capacity_class: 'manifest_lane',
              lifecycle_state: 'running',
              gpu_name: 'RTX 4090',
              num_gpus: 4,
              vram_gb: 24,
              gpu_util_percent: 100,
              cpu_util_percent: 87,
              memory_usage_gb: 12,
              listed_compute_dph_usd: 0.5,
              listed_storage_dph_usd: 0.1,
              listed_total_dph_usd: 0.6,
              effective_compute_dph_usd: 0.5,
              effective_storage_dph_usd: 0.1,
              effective_total_dph_usd: 0.6,
              storage_dph_usd: 0.1,
              effective_dph_usd: 0.6,
              effective_cost_mode: 'compute_plus_storage',
            },
          ],
          capacity_bindings: [
            {
              instance_id: INSTANCE_ID,
              lane_id: 'gpu-lane-1',
              binding_kind: 'vast_endpoint',
              capacity_state: 'endpoint_active',
            },
          ],
        },
        produced: {
          output_aware_lane_count: 1,
          active_manifest_count: 1,
          output_contract_count: 1,
          bound_manifest_count: 1,
          unbound_manifest_count: 0,
          evidence_backed_output_count: 0,
          verified_product_count: 0,
          verified_artifact_count: 0,
          verified_receipt_count: 0,
          verified_current_binding_count: 0,
          declared_only_output_count: 1,
          unverified_evidence_output_count: 0,
          claimed_or_unverified_output_count: 1,
          productive_count: 0,
          work_in_progress_count: 1,
          inference_output_tokens: 0,
          active_manifests: [],
          output_contracts: [],
          declared_output_locations: [],
          claimed_or_declared_outputs: [],
          artifacts: [],
          receipts: [],
          product_verification_policy: 'artifact_and_receipt_sha256_match',
        },
        stored: {
          instance_volume_count: 1,
          total_capacity_gb: 40,
          total_used_gb: 1,
          projected_storage_24h_usd: 2.4,
          volumes: [],
          locally_present_output_location_count: 0,
          verified_artifact_location_count: 0,
          verified_receipt_location_count: 0,
          evidence_backed_output_location_count: 0,
          artifact_locations: [],
          receipt_locations: [],
        },
        consumed: {
          consumer_count: 1,
          manifest_attributed_count: 1,
          current_physical_consumer_count: 1,
          declared_or_historical_manifest_consumer_count: 1,
          bound_manifest_consumer_count: 1,
          unbound_manifest_consumer_count: 0,
          runtime_requests: 0,
          compute_bearing_requests: 0,
          runtime_metrics_age_ms: null,
          runtime_providers: [],
          runtime_endpoints: [],
          consumers: [],
          current_physical_consumers: [],
          declared_or_historical_manifest_consumers: [],
        },
        visibility: {
          complete: true,
          gap_count: 0,
          gaps: [],
          duplicate_endpoint_bindings: [],
          invalid_manifest_count: 0,
          invalid_manifests: [],
          evidence_sources: ['vastai show instances --raw'],
        },
      },
    },
  };
}

const CAPACITY_BINDING: ComputeCapacityBindingConfig = {
  teamId: TEAM_ID,
  capacityRef: CAPACITY_REF,
  instanceId: INSTANCE_ID,
  allowedDataClassifications: ['public', 'internal', 'confidential'],
  eligibilityValidUntil: '2026-08-01T12:05:00.000Z',
  dataPolicyValidUntil: '2026-08-01T12:05:00.000Z',
};

interface HarnessOptions {
  readonly includeFleet?: boolean;
  readonly includeBinding?: boolean;
}

function createHarness(options: HarnessOptions = {}) {
  const evidenceKeys = generateKeyPairSync('ed25519');
  const admissionKeys = generateKeyPairSync('ed25519');
  const evidenceSigner: ComputeEvidenceSigner = {
    issuer: 'urn:holoscript:test:compute-service-evidence',
    keyId: 'compute-service-evidence-key',
    sign: (message) =>
      signMessage(null, Buffer.from(message), evidenceKeys.privateKey).toString('base64'),
  };
  const admissionSigner: ComputeJobAdmissionSigner = {
    issuer: 'urn:holoscript:test:compute-service-admission',
    keyId: 'compute-service-admission-key',
    privateKey: admissionKeys.privateKey,
  };
  const ledger = new FakeComputeCustodyLedger();
  const storeFor = vi.fn(
    async ({ teamId, principalDigest }: { teamId: string; principalDigest: string }) =>
      ledger.storeFor(teamId, principalDigest)
  );
  const service = createComputeJobUserService({
    storeFor,
    getFleetRecord: () => (options.includeFleet === false ? undefined : fleetRecord()),
    getCapacityBinding: () => (options.includeBinding === false ? undefined : CAPACITY_BINDING),
    allowedFleetSources: ['fleet-status-live.mjs'],
    allowedFleetPublisherAgentIds: ['fleet-observer-1'],
    evidenceSigner,
    evidencePublicKeyPem: evidenceKeys.publicKey.export({ type: 'spki', format: 'pem' }).toString(),
    evidenceKeyValidFrom: KEY_VALID_FROM,
    evidenceKeyValidUntil: KEY_VALID_UNTIL,
    admissionSigner,
    admissionTrustPolicyDigest: TRUST_POLICY_DIGEST,
    now: () => NOW,
  });
  const admissionTrustAnchor = (principalDigest: string): ComputeJobAdmissionTrustAnchor => ({
    schemaVersion: COMPUTE_JOB_ADMISSION_TRUST_ANCHOR_SCHEMA_VERSION,
    issuer: admissionSigner.issuer,
    keyId: admissionSigner.keyId,
    algorithm: 'Ed25519',
    publicKey: admissionKeys.publicKey,
    allowedTeamIds: [TEAM_ID],
    allowedPrincipalDigests: [principalDigest],
    allowedTrustPolicyDigests: [TRUST_POLICY_DIGEST],
    validFrom: KEY_VALID_FROM,
    validUntil: KEY_VALID_UNTIL,
  });
  return { service, ledger, storeFor, admissionTrustAnchor };
}

async function submitOwner(harness: ReturnType<typeof createHarness>) {
  const publicResponseBytes = await harness.service.submit({
    ...OWNER,
    sourceText: AUTHORED_SOURCE,
    idempotencyKey: 'submit-owner-1',
  });
  const principalDigest = computeCallerPrincipalDigest(OWNER);
  const ownerStore = harness.ledger.storeFor(TEAM_ID, principalDigest);
  const command = ownerStore.createCommands[0];
  expect(command).toBeDefined();
  return { publicResponseBytes, principalDigest, ownerStore, command };
}

function expectServiceError(error: unknown, code: string): boolean {
  expect(error).toBeInstanceOf(ComputeJobServiceError);
  expect(error).toMatchObject({ code });
  return true;
}

describe('compute-job-service', () => {
  it('derives a canonical principal digest that is stable across presentation changes', () => {
    const canonical = computeCallerPrincipalDigest(OWNER);
    const alternatePresentation = computeCallerPrincipalDigest({
      teamId: ` ${OWNER.teamId} `,
      agentId: ` ${OWNER.agentId} `,
      walletAddress: ` ${OWNER.walletAddress.toUpperCase()} `,
    });
    const expected = digest(
      JSON.stringify({
        agentId: OWNER.agentId,
        domain: 'holomesh.compute-principal.v1',
        teamId: OWNER.teamId,
        walletAddress: OWNER.walletAddress.toLowerCase(),
      })
    );

    expect(canonical).toBe(expected);
    expect(alternatePresentation).toBe(canonical);
    expect(
      computeCallerPrincipalDigest({ ...OWNER, agentId: 'a-different-authenticated-agent' })
    ).not.toBe(canonical);
  });

  it('authenticates a Fleet-backed submission, registers capacity, and returns exact public bytes', async () => {
    const harness = createHarness();
    const { publicResponseBytes, principalDigest, ownerStore, command } =
      await submitOwner(harness);

    expect(ownerStore.registrationCommands).toHaveLength(1);
    expect(ownerStore.registrationCommands[0]).toMatchObject({
      projection: {
        teamId: TEAM_ID,
        lane: 'managed_bridge',
        cursor: { capacityRef: CAPACITY_REF, slotState: 'available' },
      },
      eligibility: { provider: 'vast.ai', instanceId: INSTANCE_ID, eligible: true },
      dataPolicy: {
        capacityRef: CAPACITY_REF,
        allowedDataClassifications: ['public', 'internal', 'confidential'],
      },
      registeredAt: NOW,
    });
    expect(command.evidence).toHaveLength(3);
    expect(command.job.receipt.principalDigest).toBe(principalDigest);
    expect(command.workUnit.contract.compute.policy).toMatchObject({
      placement: 'external_bridge_requested',
      dataClassification: 'internal',
      allowedAccelerators: ['gpu'],
    });

    const verification = verifyComputeJobAdmission({
      receipt: command.admission.receipt,
      receiptBytes: command.admission.bytes,
      evidence: command.evidence,
      workUnit: command.workUnit.contract,
      expected: {
        teamId: TEAM_ID,
        principalDigest,
        jobId: command.job.receipt.jobId,
        attempt: 1,
        operation: 'compute_job.create',
        requestDigest: command.requestDigest,
        trustPolicyDigest: TRUST_POLICY_DIGEST,
        lifecycle: {
          kind: 'create',
          createdJobReceiptId: command.job.receipt.receiptId,
        },
      },
      trustAnchors: [harness.admissionTrustAnchor(principalDigest)],
      at: NOW,
    });
    expect(verification).toMatchObject({ valid: true });

    expect(publicResponseBytes).toBe(command.publicResponseBytes);
    expect(publicResponseBytes).toBe(
      buildComputeJobPublicResponseBytes({ job: command.job.receipt })
    );
    expect(JSON.parse(publicResponseBytes)).toMatchObject({
      state: 'preflighted',
      providerReservation: 'not_asserted',
      execution: 'not_asserted',
    });
  });

  it('hides cross-principal status from users while allowing operators exact status bytes', async () => {
    const harness = createHarness();
    const { command } = await submitOwner(harness);
    const request = {
      jobId: command.job.receipt.jobId,
      attempt: command.job.receipt.attempt,
    };

    await expect(harness.service.status({ ...OUTSIDER, ...request })).rejects.toSatisfy(
      (error: unknown) => expectServiceError(error, 'job_hidden')
    );
    await expect(harness.service.status({ ...OPERATOR, ...request })).resolves.toBe(
      buildComputeJobPublicResponseBytes({ job: command.job.receipt })
    );
  });

  it('lets the owner cancel and authenticates the exact cancellation transition', async () => {
    const harness = createHarness();
    const { command, ownerStore, principalDigest } = await submitOwner(harness);

    const publicResponseBytes = await harness.service.cancel({
      ...OWNER,
      jobId: command.job.receipt.jobId,
      attempt: command.job.receipt.attempt,
      expectedJobReceiptId: command.job.receipt.receiptId,
      idempotencyKey: 'cancel-owner-1',
    });
    const transition = ownerStore.transitionCommands[0];

    expect(ownerStore.transitionCommands).toHaveLength(1);
    expect(transition.operation).toBe('compute_job.cancel');
    expect(transition.nextJob.receipt.state).toBe('cancelled');
    expect(publicResponseBytes).toBe(transition.publicResponseBytes);
    expect(publicResponseBytes).toBe(
      buildComputeJobPublicResponseBytes({
        job: transition.nextJob.receipt,
        transition: transition.transition.receipt,
      })
    );
    expect(
      verifyComputeJobAdmission({
        receipt: transition.admission.receipt,
        receiptBytes: transition.admission.bytes,
        evidence: transition.evidence,
        workUnit: transition.expectedWorkUnit.contract,
        expected: {
          teamId: TEAM_ID,
          principalDigest,
          jobId: command.job.receipt.jobId,
          attempt: command.job.receipt.attempt,
          operation: 'compute_job.cancel',
          requestDigest: transition.requestDigest,
          trustPolicyDigest: TRUST_POLICY_DIGEST,
          lifecycle: {
            kind: 'transition',
            expectedJobReceiptId: transition.expectedJob.receipt.receiptId,
            nextJobReceiptId: transition.nextJob.receipt.receiptId,
            transitionReceiptId: transition.transition.receipt.receiptId,
          },
        },
        trustAnchors: [harness.admissionTrustAnchor(principalDigest)],
        at: NOW,
      })
    ).toMatchObject({ valid: true });
  });

  it('routes a cross-principal operator cancellation through the job principal store', async () => {
    const harness = createHarness();
    const { command, ownerStore, principalDigest } = await submitOwner(harness);
    const operatorDigest = computeCallerPrincipalDigest(OPERATOR);
    const operatorStore = harness.ledger.storeFor(TEAM_ID, operatorDigest);

    const publicResponseBytes = await harness.service.cancel({
      ...OPERATOR,
      jobId: command.job.receipt.jobId,
      attempt: command.job.receipt.attempt,
      expectedJobReceiptId: command.job.receipt.receiptId,
      idempotencyKey: 'operator-cancel-owner-job-1',
    });

    expect(operatorStore.transitionCommands).toHaveLength(0);
    expect(operatorStore.readWorkUnitCalls).toHaveLength(0);
    expect(ownerStore.readWorkUnitCalls).toEqual([
      { teamId: TEAM_ID, digest: command.workUnit.digest },
    ]);
    expect(ownerStore.transitionCommands).toHaveLength(1);
    expect(ownerStore.transitionCommands[0].admission.receipt.principalDigest).toBe(
      principalDigest
    );
    expect(publicResponseBytes).toBe(ownerStore.transitionCommands[0].publicResponseBytes);
    expect(harness.storeFor).toHaveBeenCalledWith({
      teamId: TEAM_ID,
      principalDigest: operatorDigest,
    });
    expect(harness.storeFor).toHaveBeenCalledWith({
      teamId: TEAM_ID,
      principalDigest,
    });
  });

  it('refuses user cancellation once a job is running', async () => {
    const harness = createHarness();
    const { command, ownerStore } = await submitOwner(harness);
    const runningReceipt: ComputeJobReceipt = {
      ...command.job.receipt,
      state: 'running',
      receiptId: digest('synthetic running receipt for refusal branch'),
    };
    harness.ledger.jobs.set(
      jobKey({ teamId: TEAM_ID, jobId: runningReceipt.jobId, attempt: runningReceipt.attempt }),
      {
        teamId: TEAM_ID,
        receipt: runningReceipt,
        bytes: JSON.stringify(runningReceipt),
      }
    );

    await expect(
      harness.service.cancel({
        ...OWNER,
        jobId: runningReceipt.jobId,
        attempt: runningReceipt.attempt,
        expectedJobReceiptId: runningReceipt.receiptId,
        idempotencyKey: 'cancel-running-owner-1',
      })
    ).rejects.toSatisfy((error: unknown) =>
      expectServiceError(error, 'running_cancellation_requires_executor_evidence')
    );
    expect(ownerStore.transitionCommands).toHaveLength(0);
  });

  it.each([
    ['Fleet observation', { includeFleet: false }],
    ['capacity binding', { includeBinding: false }],
  ] as const)(
    'fails closed before store access when the %s is missing',
    async (_label, options) => {
      const harness = createHarness(options);

      await expect(
        harness.service.submit({
          ...OWNER,
          sourceText: AUTHORED_SOURCE,
          idempotencyKey: 'missing-capacity-1',
        })
      ).rejects.toSatisfy((error: unknown) => expectServiceError(error, 'capacity_unavailable'));
      expect(harness.storeFor).not.toHaveBeenCalled();
      expect(harness.ledger.stores.size).toBe(0);
    }
  );
});
