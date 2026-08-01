import { generateKeyPairSync, sign } from 'crypto';
import { describe, expect, it } from 'vitest';
import {
  COMPUTE_WORK_UNIT_COMPILER_VERSION,
  buildComputeWorkUnit,
  computeWorkUnitDigest,
  type ComputePlacementPolicy,
  type ComputeWorkUnitContract,
} from '../../compiler/ComputeWorkUnitCompiler';
import {
  HARDWARE_RECEIPT_METADATA_SCHEMA_VERSION,
  type PortableHardwareReceiptMetadata,
} from '../HardwareReceiptMetadata';
import { buildComputeExecutionReceipt } from '../ComputeExecutionReceipt';
import {
  COMPUTE_CAPACITY_LEASE_SCHEMA_VERSION,
  COMPUTE_CAPACITY_SNAPSHOT_SCHEMA_VERSION,
  COMPUTE_PLACEMENT_PLAN_SCHEMA_VERSION,
  authorizeComputeCapacityLeaseUse,
  attestComputeExecutionReceipt,
  buildComputeBridgeAdmission,
  buildComputeCapacitySnapshot,
  computeCapacityAllocationEtag,
  planComputePlacement,
  prepareComputeCapacityLease,
  validateComputeCapacityLease,
  validateComputeCapacitySnapshot,
  validateComputePlacementPlan,
  verifyComputeCapacityLeaseReceipt,
  verifyComputeExecutionEvidence,
  verifyComputePlacementPlan,
  type BuildComputeCapacitySnapshotInput,
  type ComputeBridgeAdmission,
  type ComputeCapacityLease,
  type ComputeCapacityAllocationCursor,
  type ComputeCapacitySnapshot,
  type ComputeEvidenceRole,
  type ComputeEvidenceSigner,
  type ComputeEvidenceTrustAnchor,
  type ComputePlacementPlan,
  type PreparedComputeCapacityLease,
} from '../ComputePlacementEvidence';

const CAPACITY_REF = `sha256:${'b'.repeat(64)}`;
const PRINCIPAL_DIGEST = `sha256:${'c'.repeat(64)}`;
const JOB_ID = `sha256:${'e'.repeat(64)}`;
const HOLDER_DIGEST = `sha256:${'f'.repeat(64)}`;
const OBSERVED_AT = '2026-08-01T12:00:00.000Z';
const CHECKED_AT = '2026-08-01T12:00:10.000Z';
const SNAPSHOT_VALID_UNTIL = '2026-08-01T12:01:00.000Z';
const LEASE_ISSUED_AT = '2026-08-01T12:00:20.000Z';
const LEASE_EXPIRES_AT = '2026-08-01T12:01:00.000Z';
const FENCING_TOKEN = 'test-fencing-token-is-at-least-thirty-two-bytes-long';
const ALL_ROLES: readonly ComputeEvidenceRole[] = [
  'capacity_observer',
  'bridge_admitter',
  'placement_planner',
  'lease_issuer',
  'execution_attestor',
];

function evidenceAuthority(label: string): {
  signer: ComputeEvidenceSigner;
  anchor: ComputeEvidenceTrustAnchor;
} {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  return {
    signer: {
      issuer: `urn:holoscript:test:${label}`,
      keyId: `${label}-key-1`,
      sign: (message) => sign(null, Buffer.from(message), privateKey).toString('base64'),
    },
    anchor: {
      issuer: `urn:holoscript:test:${label}`,
      keyId: `${label}-key-1`,
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

const trusted = evidenceAuthority('trusted');
const forged = evidenceAuthority('forged');
const TRUST_ANCHORS = [trusted.anchor] as const;

function workUnit(
  placement: ComputePlacementPolicy = 'local_only',
  overrides: { allowFallback?: boolean; maxCostMinorUnits?: number; deadlineMs?: number } = {}
): ComputeWorkUnitContract {
  return buildComputeWorkUnit(
    {
      intent: 'Run a bounded GPU thermal step.',
      allowed_accelerators: ['gpu', 'cpu'],
      placement_policy: placement,
      data_classification: 'confidential',
      quality_metric: 'max_abs_error',
      quality_operator: 'lte',
      quality_threshold: 1e-5,
      quality_reference: 'cpu_reference',
      deadline_ms: overrides.deadlineMs ?? 60_000,
      budget_currency: 'USD',
      max_cost_minor_units: placement === 'local_only' ? 0 : (overrides.maxCostMinorUnits ?? 100),
      allow_fallback: overrides.allowFallback ?? false,
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

function snapshot(
  overrides: Partial<Omit<BuildComputeCapacitySnapshotInput, 'signer'>> = {},
  signer: ComputeEvidenceSigner = trusted.signer
): ComputeCapacitySnapshot {
  return buildComputeCapacitySnapshot({
    lane: 'local_device',
    capacityRef: CAPACITY_REF,
    accelerator: 'gpu',
    health: 'ready',
    availableSlots: 1,
    allowedDataClassifications: ['confidential'],
    observedAt: OBSERVED_AT,
    validUntil: SNAPSHOT_VALID_UNTIL,
    estimatedCost: { measurementState: 'not_applicable' },
    ...overrides,
    signer,
  });
}

function admission(
  unit: ComputeWorkUnitContract,
  overrides: Partial<{
    workUnitDigest: string;
    verdict: 'admitted' | 'rejected';
    reason:
      | 'policy_admitted'
      | 'tenant_policy_denied'
      | 'data_classification_denied'
      | 'budget_denied'
      | 'bridge_unavailable';
    issuedAt: string;
    validUntil: string;
  }> = {},
  signer: ComputeEvidenceSigner = trusted.signer
): ComputeBridgeAdmission {
  return buildComputeBridgeAdmission({
    principalDigest: PRINCIPAL_DIGEST,
    bridgeRef: CAPACITY_REF,
    workUnitDigest: overrides.workUnitDigest ?? computeWorkUnitDigest(unit),
    dataClassification: unit.compute.policy.dataClassification,
    budget: {
      currency: unit.compute.budget.currency,
      maxCostMinorUnits: unit.compute.budget.maxCostMinorUnits,
    },
    verdict: overrides.verdict ?? 'admitted',
    reason: overrides.reason ?? 'policy_admitted',
    issuedAt: overrides.issuedAt ?? OBSERVED_AT,
    validUntil: overrides.validUntil ?? SNAPSHOT_VALID_UNTIL,
    signer,
  });
}

function plan(
  unit: ComputeWorkUnitContract,
  capacitySnapshot: ComputeCapacitySnapshot,
  bridgeAdmission?: ComputeBridgeAdmission
): ComputePlacementPlan {
  return planComputePlacement({
    principalDigest: PRINCIPAL_DIGEST,
    workUnit: unit,
    capacitySnapshot,
    bridgeAdmission,
    checkedAt: CHECKED_AT,
    trustAnchors: TRUST_ANCHORS,
    signer: trusted.signer,
  });
}

function lease(
  unit: ComputeWorkUnitContract,
  capacitySnapshot: ComputeCapacitySnapshot,
  placementPlan: ComputePlacementPlan,
  bridgeAdmission?: ComputeBridgeAdmission
): ComputeCapacityLease {
  return preparedLease(unit, capacitySnapshot, placementPlan, bridgeAdmission).lease;
}

function availableAllocation(currentEpoch = 0, version = 0): ComputeCapacityAllocationCursor {
  const body = {
    capacityRef: CAPACITY_REF,
    slotState: 'available' as const,
    currentEpoch,
    version,
  };
  return { ...body, etag: computeCapacityAllocationEtag(body) };
}

function preparedLease(
  unit: ComputeWorkUnitContract,
  capacitySnapshot: ComputeCapacitySnapshot,
  placementPlan: ComputePlacementPlan,
  bridgeAdmission?: ComputeBridgeAdmission,
  allocationCursor: ComputeCapacityAllocationCursor = availableAllocation()
): PreparedComputeCapacityLease {
  return prepareComputeCapacityLease({
    principalDigest: PRINCIPAL_DIGEST,
    jobId: JOB_ID,
    attempt: 1,
    holderDigest: HOLDER_DIGEST,
    workUnit: unit,
    capacitySnapshot,
    bridgeAdmission,
    plan: placementPlan,
    issuedAt: LEASE_ISSUED_AT,
    expiresAt: LEASE_EXPIRES_AT,
    fencingToken: FENCING_TOKEN,
    allocationCursor,
    trustAnchors: TRUST_ANCHORS,
    signer: trusted.signer,
  });
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
      capturedAt: '2026-08-01T12:00:30.000Z',
      sourceCompositionHash: unit.source_evidence,
      commit: 'abc1234',
    },
    owner: { agent: 'test-runtime', team: 'HoloMesh' },
  };
}

describe('ComputePlacementEvidence', () => {
  it('builds canonical, issuer-attested capacity and placement receipts without provider state', () => {
    const unit = workUnit();
    const capacity = snapshot();
    const placement = plan(unit, capacity);

    expect(capacity.schemaVersion).toBe(COMPUTE_CAPACITY_SNAPSHOT_SCHEMA_VERSION);
    expect(placement.schemaVersion).toBe(COMPUTE_PLACEMENT_PLAN_SCHEMA_VERSION);
    expect(capacity.receiptId).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(placement.verdict).toBe('admitted');
    expect(validateComputeCapacitySnapshot(capacity)).toEqual({ valid: true, errors: [] });
    expect(validateComputePlacementPlan(placement)).toEqual({ valid: true, errors: [] });
    expect(
      verifyComputePlacementPlan({
        principalDigest: PRINCIPAL_DIGEST,
        workUnit: unit,
        capacitySnapshot: capacity,
        plan: placement,
        checkedAt: CHECKED_AT,
        verifiedAt: CHECKED_AT,
        trustAnchors: TRUST_ANCHORS,
      })
    ).toEqual({ valid: true, errors: [] });
    const serialized = JSON.stringify({ capacity, placement });
    for (const forbidden of ['provider', 'endpoint', 'credential', 'api_key', 'device_id']) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it('bounds v1 capacity to one logical slot and a hard freshness window', () => {
    expect(() => snapshot({ availableSlots: 2 })).toThrow('availableSlots must be 0 or 1');
    expect(() => snapshot({ validUntil: '2026-08-01T12:01:00.001Z' })).toThrow(
      'hard freshness window'
    );
  });

  it('clamps an admitted plan when capacity observation uses bounded positive clock skew', () => {
    const capacity = snapshot({
      observedAt: '2026-08-01T12:00:30.000Z',
      validUntil: '2026-08-01T12:01:30.000Z',
    });
    const placement = plan(workUnit(), capacity);

    expect(placement.verdict).toBe('admitted');
    expect(placement.validUntil).toBe('2026-08-01T12:01:10.000Z');
  });

  it.each([
    [
      { observedAt: '2026-08-01T12:01:10.001Z', validUntil: '2026-08-01T12:02:10.001Z' },
      'telemetry_future',
    ],
    [{ observedAt: '2026-08-01T11:59:10.000Z', validUntil: CHECKED_AT }, 'telemetry_stale'],
    [{ health: 'degraded' as const }, 'telemetry_degraded'],
    [{ availableSlots: 0 }, 'capacity_unavailable'],
    [
      {
        estimatedCost: {
          measurementState: 'not_measured' as const,
          reason: 'meter_unavailable' as const,
        },
      },
      'cost_unavailable',
    ],
  ])('rejects unsafe capacity evidence with explicit reason %s', (overrides, reason) => {
    const unit = workUnit();
    const placement = plan(unit, snapshot(overrides));

    expect(placement.verdict).toBe('rejected');
    expect(placement.reasonCodes).toContain(reason);
  });

  it('enforces the authored lane matrix and explicit fallback policy', () => {
    const ownedCapacity = snapshot({ lane: 'owned_fleet' });
    expect(plan(workUnit('local_only'), ownedCapacity).reasonCodes).toContain(
      'placement_forbidden'
    );
    expect(plan(workUnit('owned_fleet'), ownedCapacity).verdict).toBe('admitted');
    expect(plan(workUnit('owned_fleet'), snapshot()).reasonCodes).toContain('placement_forbidden');
    expect(plan(workUnit('owned_fleet', { allowFallback: true }), snapshot()).verdict).toBe(
      'admitted'
    );

    const managedCapacity = snapshot({
      lane: 'managed_bridge',
      estimatedCost: { measurementState: 'measured', currency: 'USD', estimatedMinorUnits: 10 },
    });
    const externalUnit = workUnit('external_bridge_requested');
    expect(plan(externalUnit, managedCapacity).reasonCodes).toContain('bridge_admission_required');
    expect(plan(externalUnit, managedCapacity, admission(externalUnit)).verdict).toBe('admitted');

    const noFallback = workUnit('external_bridge_requested', { allowFallback: false });
    expect(
      plan(
        noFallback,
        snapshot(),
        admission(noFallback, { verdict: 'rejected', reason: 'bridge_unavailable' })
      ).reasonCodes
    ).toContain('placement_forbidden');
    const withFallback = workUnit('external_bridge_requested', { allowFallback: true });
    expect(
      plan(
        withFallback,
        snapshot(),
        admission(withFallback, { verdict: 'rejected', reason: 'bridge_unavailable' })
      ).verdict
    ).toBe('admitted');
    expect(plan(withFallback, snapshot(), admission(withFallback)).reasonCodes).toContain(
      'bridge_fallback_unexplained'
    );
  });

  it('rejects forged capacity signatures and bridge admissions with mismatched WorkUnits', () => {
    const unit = workUnit('external_bridge_requested');
    const forgedCapacity = snapshot({}, forged.signer);
    expect(plan(unit, forgedCapacity).reasonCodes).toContain('capacity_evidence_untrusted');

    const managedCapacity = snapshot({
      lane: 'managed_bridge',
      estimatedCost: { measurementState: 'measured', currency: 'USD', estimatedMinorUnits: 10 },
    });
    const mismatched = admission(unit, { workUnitDigest: `sha256:${'e'.repeat(64)}` });
    expect(plan(unit, managedCapacity, mismatched).reasonCodes).toContain(
      'bridge_admission_invalid'
    );
  });

  it('rejects RSA-512 signatures and Ed448 anchors mislabeled as Ed25519', () => {
    const unit = workUnit();
    const { publicKey: rsaPublicKey, privateKey: rsaPrivateKey } = generateKeyPairSync('rsa', {
      modulusLength: 512,
    });
    const rsaSigner: ComputeEvidenceSigner = {
      issuer: 'urn:holoscript:test:rsa-mislabeled',
      keyId: 'rsa-mislabeled-key-1',
      sign: (message) => sign(null, Buffer.from(message), rsaPrivateKey).toString('base64'),
    };
    const rsaAnchor: ComputeEvidenceTrustAnchor = {
      ...trusted.anchor,
      issuer: rsaSigner.issuer,
      keyId: rsaSigner.keyId,
      publicKeyPem: rsaPublicKey.export({ type: 'spki', format: 'pem' }).toString(),
    };
    const rsaCapacity = snapshot({}, rsaSigner);
    const rsaPlacement = planComputePlacement({
      principalDigest: PRINCIPAL_DIGEST,
      workUnit: unit,
      capacitySnapshot: rsaCapacity,
      checkedAt: CHECKED_AT,
      trustAnchors: [rsaAnchor],
      signer: trusted.signer,
    });
    expect(rsaPlacement.reasonCodes).toContain('capacity_evidence_untrusted');

    const capacity = snapshot();
    const placement = plan(unit, capacity);
    const { publicKey: ed448PublicKey, privateKey: ed448PrivateKey } = generateKeyPairSync('ed448');
    expect(() =>
      snapshot(
        {},
        {
          issuer: 'urn:holoscript:test:ed448-mislabeled',
          keyId: 'ed448-mislabeled-key-1',
          sign: (message) => sign(null, Buffer.from(message), ed448PrivateKey).toString('base64'),
        }
      )
    ).toThrow('signature must decode to exactly 64 bytes for Ed25519');
    const verification = verifyComputePlacementPlan({
      principalDigest: PRINCIPAL_DIGEST,
      workUnit: unit,
      capacitySnapshot: capacity,
      plan: placement,
      checkedAt: CHECKED_AT,
      verifiedAt: CHECKED_AT,
      trustAnchors: [
        {
          ...trusted.anchor,
          publicKeyPem: ed448PublicKey.export({ type: 'spki', format: 'pem' }).toString(),
        },
      ],
    });
    expect(verification.errors).toEqual(
      expect.arrayContaining([expect.stringContaining('public key must be Ed25519')])
    );
  });

  it('enforces principal, lane, capacity, validity, and revocation trust scope', () => {
    const unit = workUnit();
    const capacity = snapshot();
    const placement = plan(unit, capacity);
    const revokedAnchor: ComputeEvidenceTrustAnchor = {
      ...trusted.anchor,
      revokedAt: '2026-08-01T12:00:15.000Z',
    };

    expect(
      verifyComputePlacementPlan({
        principalDigest: PRINCIPAL_DIGEST,
        workUnit: unit,
        capacitySnapshot: capacity,
        plan: placement,
        checkedAt: CHECKED_AT,
        verifiedAt: LEASE_ISSUED_AT,
        trustAnchors: [revokedAnchor],
      }).errors
    ).toEqual(expect.arrayContaining([expect.stringContaining('revoked at verification time')]));
    expect(
      verifyComputePlacementPlan({
        principalDigest: `sha256:${'9'.repeat(64)}`,
        workUnit: unit,
        capacitySnapshot: capacity,
        plan: placement,
        checkedAt: CHECKED_AT,
        verifiedAt: CHECKED_AT,
        trustAnchors: TRUST_ANCHORS,
      }).errors
    ).toEqual(expect.arrayContaining([expect.stringContaining('supplied principal')]));
  });

  it('issues a hard-expiry lease with a hashed fencing token and verifies active possession', () => {
    const unit = workUnit();
    const capacity = snapshot();
    const placement = plan(unit, capacity);
    const prepared = preparedLease(unit, capacity, placement);
    const capacityLease = prepared.lease;

    expect(capacityLease.schemaVersion).toBe(COMPUTE_CAPACITY_LEASE_SCHEMA_VERSION);
    expect(capacityLease.fencingTokenHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(JSON.stringify(capacityLease)).not.toContain(FENCING_TOKEN);
    expect(validateComputeCapacityLease(capacityLease)).toEqual({ valid: true, errors: [] });
    expect(
      authorizeComputeCapacityLeaseUse({
        principalDigest: PRINCIPAL_DIGEST,
        jobId: JOB_ID,
        attempt: 1,
        holderDigest: HOLDER_DIGEST,
        workUnit: unit,
        capacitySnapshot: capacity,
        plan: placement,
        lease: capacityLease,
        at: '2026-08-01T12:00:30.000Z',
        presentedFencingToken: FENCING_TOKEN,
        allocationCursor: prepared.nextAllocation,
        trustAnchors: TRUST_ANCHORS,
      })
    ).toEqual({ valid: true, errors: [] });

    expect(
      authorizeComputeCapacityLeaseUse({
        principalDigest: PRINCIPAL_DIGEST,
        jobId: JOB_ID,
        attempt: 1,
        holderDigest: HOLDER_DIGEST,
        workUnit: unit,
        capacitySnapshot: capacity,
        plan: placement,
        lease: capacityLease,
        at: '2026-08-01T12:00:30.000Z',
        presentedFencingToken: `${FENCING_TOKEN}-wrong`,
        allocationCursor: prepared.nextAllocation,
        trustAnchors: TRUST_ANCHORS,
      }).errors
    ).toContain('presented fencing token does not match');
    expect(
      verifyComputeCapacityLeaseReceipt({
        principalDigest: PRINCIPAL_DIGEST,
        jobId: JOB_ID,
        attempt: 1,
        holderDigest: HOLDER_DIGEST,
        workUnit: unit,
        capacitySnapshot: capacity,
        plan: placement,
        lease: capacityLease,
        at: LEASE_EXPIRES_AT,
        trustAnchors: TRUST_ANCHORS,
      }).errors
    ).toContain('lease is not active at the requested time');
  });

  it('advances the capacity stream epoch independently of the job attempt', () => {
    const unit = workUnit();
    const capacity = snapshot();
    const placement = plan(unit, capacity);
    const prepared = preparedLease(
      unit,
      capacity,
      placement,
      undefined,
      availableAllocation(46, 9)
    );

    expect(prepared.expectedAllocation.currentEpoch).toBe(46);
    expect(prepared.lease.attempt).toBe(1);
    expect(prepared.lease.fencingEpoch).toBe(47);
    expect(prepared.nextAllocation).toMatchObject({
      slotState: 'leased',
      currentEpoch: 47,
      currentLeaseReceiptId: prepared.lease.receiptId,
      version: 10,
    });
    const staleFenceBody = {
      capacityRef: prepared.nextAllocation.capacityRef,
      slotState: 'leased' as const,
      currentEpoch: 48,
      currentLeaseReceiptId: prepared.lease.receiptId,
      version: prepared.nextAllocation.version,
    };
    expect(
      authorizeComputeCapacityLeaseUse({
        principalDigest: PRINCIPAL_DIGEST,
        jobId: JOB_ID,
        attempt: 1,
        holderDigest: HOLDER_DIGEST,
        workUnit: unit,
        capacitySnapshot: capacity,
        plan: placement,
        lease: prepared.lease,
        at: '2026-08-01T12:00:30.000Z',
        presentedFencingToken: FENCING_TOKEN,
        allocationCursor: {
          ...staleFenceBody,
          etag: computeCapacityAllocationEtag(staleFenceBody),
        },
        trustAnchors: TRUST_ANCHORS,
      }).errors
    ).toContain('allocator cursor does not authorize the current lease and fencing epoch');
    expect(() =>
      preparedLease(
        unit,
        capacity,
        placement,
        undefined,
        availableAllocation(46, Number.MAX_SAFE_INTEGER)
      )
    ).toThrow('capacity allocation counters cannot advance beyond safe integers');
  });

  it('rejects lease issuance after placement validity and weak fencing tokens', () => {
    const unit = workUnit();
    const capacity = snapshot();
    const placement = plan(unit, capacity);

    expect(() =>
      prepareComputeCapacityLease({
        principalDigest: PRINCIPAL_DIGEST,
        jobId: JOB_ID,
        attempt: 1,
        holderDigest: HOLDER_DIGEST,
        workUnit: unit,
        capacitySnapshot: capacity,
        plan: placement,
        issuedAt: placement.validUntil,
        expiresAt: '2026-08-01T12:01:30.000Z',
        fencingToken: FENCING_TOKEN,
        allocationCursor: availableAllocation(),
        trustAnchors: TRUST_ANCHORS,
        signer: trusted.signer,
      })
    ).toThrow('admitted plan is expired at verification time');
    expect(() =>
      prepareComputeCapacityLease({
        principalDigest: PRINCIPAL_DIGEST,
        jobId: JOB_ID,
        attempt: 1,
        holderDigest: HOLDER_DIGEST,
        workUnit: unit,
        capacitySnapshot: capacity,
        plan: placement,
        issuedAt: LEASE_ISSUED_AT,
        expiresAt: LEASE_EXPIRES_AT,
        fencingToken: 'too-short',
        allocationCursor: availableAllocation(),
        trustAnchors: TRUST_ANCHORS,
        signer: trusted.signer,
      })
    ).toThrow('at least 32 bytes');
  });

  it('verifies the authenticated WorkUnit-to-execution evidence chain', () => {
    const unit = workUnit();
    const capacity = snapshot();
    const placement = plan(unit, capacity);
    const capacityLease = lease(unit, capacity, placement);
    const executionReceipt = buildComputeExecutionReceipt({
      workUnit: { digest: computeWorkUnitDigest(unit), sourceEvidence: unit.source_evidence },
      placement: {
        planReceiptId: placement.receiptId,
        capacityLeaseReceiptId: capacityLease.receiptId,
        outcome: 'local_device',
      },
      execution: {
        actualAccelerator: 'gpu',
        fallbackAllowed: false,
        fallbackUsed: false,
        terminalStatus: 'succeeded',
        startedAt: '2026-08-01T12:00:30.000Z',
        completedAt: '2026-08-01T12:00:30.125Z',
      },
      quality: {
        metric: unit.compute.quality.metric,
        operator: unit.compute.quality.operator,
        threshold: unit.compute.quality.threshold,
        reference: unit.compute.quality.reference,
        observedValue: 0,
        passed: true,
      },
      cost: { measurementState: 'not_measured', reason: 'not_applicable' },
      hardware: hardware(unit),
    });
    const executionAttestation = attestComputeExecutionReceipt({
      principalDigest: PRINCIPAL_DIGEST,
      executionReceipt,
      issuedAt: '2026-08-01T12:00:31.000Z',
      signer: trusted.signer,
    });

    expect(
      verifyComputeExecutionEvidence({
        principalDigest: PRINCIPAL_DIGEST,
        jobId: JOB_ID,
        attempt: 1,
        holderDigest: HOLDER_DIGEST,
        workUnit: unit,
        capacitySnapshot: capacity,
        plan: placement,
        lease: capacityLease,
        executionReceipt,
        executionAttestation,
        verifiedAt: '2026-08-01T12:00:32.000Z',
        trustAnchors: TRUST_ANCHORS,
      })
    ).toEqual({ valid: true, errors: [], verificationScope: 'issuer_authenticated' });
    expect(
      verifyComputeExecutionEvidence({
        principalDigest: PRINCIPAL_DIGEST,
        jobId: JOB_ID,
        attempt: 1,
        holderDigest: HOLDER_DIGEST,
        workUnit: unit,
        capacitySnapshot: capacity,
        plan: placement,
        lease: capacityLease,
        executionReceipt,
        executionAttestation,
        verifiedAt: '2026-08-01T12:00:32.000Z',
        trustAnchors: [forged.anchor],
      }).valid
    ).toBe(false);
  });

  it('does not let owned-fleet execution erase a measured placement cost', () => {
    const unit = workUnit('owned_fleet');
    const capacity = snapshot({
      lane: 'owned_fleet',
      estimatedCost: { measurementState: 'measured', currency: 'USD', estimatedMinorUnits: 25 },
    });
    const placement = plan(unit, capacity);
    const capacityLease = lease(unit, capacity, placement);
    const executionReceipt = buildComputeExecutionReceipt({
      workUnit: { digest: computeWorkUnitDigest(unit), sourceEvidence: unit.source_evidence },
      placement: {
        planReceiptId: placement.receiptId,
        capacityLeaseReceiptId: capacityLease.receiptId,
        outcome: 'owned_fleet',
      },
      execution: {
        actualAccelerator: 'gpu',
        fallbackAllowed: false,
        fallbackUsed: false,
        terminalStatus: 'succeeded',
        startedAt: '2026-08-01T12:00:30.000Z',
        completedAt: '2026-08-01T12:00:30.125Z',
      },
      quality: {
        metric: unit.compute.quality.metric,
        operator: unit.compute.quality.operator,
        threshold: unit.compute.quality.threshold,
        reference: unit.compute.quality.reference,
        observedValue: 0,
        passed: true,
      },
      cost: { measurementState: 'not_measured', reason: 'meter_unavailable' },
      hardware: hardware(unit),
    });
    const executionAttestation = attestComputeExecutionReceipt({
      principalDigest: PRINCIPAL_DIGEST,
      executionReceipt,
      issuedAt: '2026-08-01T12:00:31.000Z',
      signer: trusted.signer,
    });

    expect(
      verifyComputeExecutionEvidence({
        principalDigest: PRINCIPAL_DIGEST,
        jobId: JOB_ID,
        attempt: 1,
        holderDigest: HOLDER_DIGEST,
        workUnit: unit,
        capacitySnapshot: capacity,
        plan: placement,
        lease: capacityLease,
        executionReceipt,
        executionAttestation,
        verifiedAt: '2026-08-01T12:00:32.000Z',
        trustAnchors: TRUST_ANCHORS,
      }).errors
    ).toContain('execution requires measured cost because placement cost was measured');
  });
});
