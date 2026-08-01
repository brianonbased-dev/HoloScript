import { createHash, createPrivateKey, createPublicKey, sign } from 'crypto';
import { describe, expect, it } from 'vitest';
import {
  compileComputeWorkUnits,
  computeWorkUnitDigest,
  validateComputeWorkUnitContract,
  verifyComputeWorkUnitEvidence,
  type ComputeAccelerator,
  type ComputeDataClassification,
  type ComputePlacementPolicy,
  type ComputeWorkUnitContract,
} from '../../compiler/ComputeWorkUnitCompiler';
import { HoloCompositionParser } from '../../parser/HoloCompositionParser';
import {
  buildComputeBridgeAdmission,
  buildComputeCapacitySnapshot,
  planComputePlacement,
  validateComputeBridgeAdmission,
  validateComputeCapacitySnapshot,
  validateComputePlacementPlan,
  verifyComputePlacementPlan,
  type ComputeBridgeAdmission,
  type ComputeCapacityCostEstimate,
  type ComputeCapacityLane,
  type ComputeCapacitySnapshot,
  type ComputeEvidenceRole,
  type ComputeEvidenceSigner,
  type ComputeEvidenceTrustAnchor,
  type ComputePlacementPlan,
  type ComputePlacementReason,
} from '../ComputePlacementEvidence';

const CORPUS_SCHEMA_VERSION = 'holoscript.compute-backend-structural-conformance.v1' as const;
const CONFORMANCE_SCOPE = 'structural_test_double_only' as const;
const PRINCIPAL_DIGEST = `sha256:${'a'.repeat(64)}`;
const OBSERVED_AT = '2026-08-01T12:00:00.000Z';
const CHECKED_AT = '2026-08-01T12:00:10.000Z';
const VALID_UNTIL = '2026-08-01T12:01:00.000Z';

interface StructuralConformanceCase {
  readonly id: string;
  readonly placement: ComputePlacementPolicy;
  readonly allowedAccelerators: readonly ComputeAccelerator[];
  readonly allowFallback: boolean;
  readonly dataClassification: ComputeDataClassification;
  readonly maxCostMinorUnits: number;
  readonly lane: ComputeCapacityLane;
  readonly accelerator: ComputeAccelerator;
  readonly availableSlots: number;
  readonly allowedDataClassifications: readonly ComputeDataClassification[];
  readonly estimatedCost: ComputeCapacityCostEstimate;
  readonly observedAt?: string;
  readonly validUntil?: string;
  readonly expectedVerdict: 'admitted' | 'rejected';
  readonly expectedReasons: readonly ComputePlacementReason[];
}

const CASES: readonly StructuralConformanceCase[] = [
  {
    id: 'local-gpu',
    placement: 'local_only',
    allowedAccelerators: ['gpu', 'cpu'],
    allowFallback: false,
    dataClassification: 'confidential',
    maxCostMinorUnits: 0,
    lane: 'local_device',
    accelerator: 'gpu',
    availableSlots: 1,
    allowedDataClassifications: ['confidential'],
    estimatedCost: { measurementState: 'not_applicable' },
    expectedVerdict: 'admitted',
    expectedReasons: [],
  },
  {
    id: 'local-cpu-fallback',
    placement: 'local_only',
    allowedAccelerators: ['gpu', 'cpu'],
    allowFallback: true,
    dataClassification: 'confidential',
    maxCostMinorUnits: 0,
    lane: 'local_device',
    accelerator: 'cpu',
    availableSlots: 1,
    allowedDataClassifications: ['confidential'],
    estimatedCost: { measurementState: 'not_applicable' },
    expectedVerdict: 'admitted',
    expectedReasons: [],
  },
  {
    id: 'owned-fleet-gpu',
    placement: 'owned_fleet',
    allowedAccelerators: ['gpu'],
    allowFallback: false,
    dataClassification: 'internal',
    maxCostMinorUnits: 100,
    lane: 'owned_fleet',
    accelerator: 'gpu',
    availableSlots: 1,
    allowedDataClassifications: ['internal'],
    estimatedCost: { measurementState: 'measured', currency: 'USD', estimatedMinorUnits: 25 },
    expectedVerdict: 'admitted',
    expectedReasons: [],
  },
  {
    id: 'managed-bridge-test-double',
    placement: 'external_bridge_requested',
    allowedAccelerators: ['gpu'],
    allowFallback: false,
    dataClassification: 'confidential',
    maxCostMinorUnits: 100,
    lane: 'managed_bridge',
    accelerator: 'gpu',
    availableSlots: 1,
    allowedDataClassifications: ['confidential'],
    estimatedCost: { measurementState: 'measured', currency: 'USD', estimatedMinorUnits: 40 },
    expectedVerdict: 'admitted',
    expectedReasons: [],
  },
  {
    id: 'reject-stale-observation',
    placement: 'local_only',
    allowedAccelerators: ['gpu'],
    allowFallback: false,
    dataClassification: 'confidential',
    maxCostMinorUnits: 0,
    lane: 'local_device',
    accelerator: 'gpu',
    availableSlots: 1,
    allowedDataClassifications: ['confidential'],
    estimatedCost: { measurementState: 'not_applicable' },
    observedAt: '2026-08-01T11:59:00.000Z',
    validUntil: '2026-08-01T11:59:30.000Z',
    expectedVerdict: 'rejected',
    expectedReasons: ['telemetry_stale'],
  },
  {
    id: 'reject-cost-unavailable',
    placement: 'external_bridge_requested',
    allowedAccelerators: ['gpu'],
    allowFallback: false,
    dataClassification: 'confidential',
    maxCostMinorUnits: 100,
    lane: 'managed_bridge',
    accelerator: 'gpu',
    availableSlots: 1,
    allowedDataClassifications: ['confidential'],
    estimatedCost: { measurementState: 'not_measured', reason: 'meter_unavailable' },
    expectedVerdict: 'rejected',
    expectedReasons: ['cost_unavailable'],
  },
  {
    id: 'reject-budget-exceeded',
    placement: 'external_bridge_requested',
    allowedAccelerators: ['gpu'],
    allowFallback: false,
    dataClassification: 'confidential',
    maxCostMinorUnits: 100,
    lane: 'managed_bridge',
    accelerator: 'gpu',
    availableSlots: 1,
    allowedDataClassifications: ['confidential'],
    estimatedCost: { measurementState: 'measured', currency: 'USD', estimatedMinorUnits: 101 },
    expectedVerdict: 'rejected',
    expectedReasons: ['budget_exceeded'],
  },
  {
    id: 'reject-data-policy',
    placement: 'local_only',
    allowedAccelerators: ['gpu'],
    allowFallback: false,
    dataClassification: 'confidential',
    maxCostMinorUnits: 0,
    lane: 'local_device',
    accelerator: 'gpu',
    availableSlots: 1,
    allowedDataClassifications: ['public'],
    estimatedCost: { measurementState: 'not_applicable' },
    expectedVerdict: 'rejected',
    expectedReasons: ['data_classification_unsupported'],
  },
  {
    id: 'reject-capacity-unavailable',
    placement: 'local_only',
    allowedAccelerators: ['gpu'],
    allowFallback: false,
    dataClassification: 'confidential',
    maxCostMinorUnits: 0,
    lane: 'local_device',
    accelerator: 'gpu',
    availableSlots: 0,
    allowedDataClassifications: ['confidential'],
    estimatedCost: { measurementState: 'not_applicable' },
    expectedVerdict: 'rejected',
    expectedReasons: ['capacity_unavailable'],
  },
];

const CORPUS = {
  schemaVersion: CORPUS_SCHEMA_VERSION,
  conformanceScope: CONFORMANCE_SCOPE,
  placementEvidence: 'signed_test_double' as const,
  executionEvidence: 'not_collected' as const,
  hardwareEvidence: 'not_collected' as const,
  providerEvidence: 'not_supplied' as const,
  benchmarkEvidence: 'not_collected' as const,
  cases: CASES,
};

function sha256Label(value: string): string {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function capacityRef(entry: StructuralConformanceCase): string {
  return sha256Label(`structural-test-double:${entry.id}`);
}

function fixedAuthority(): {
  readonly signer: ComputeEvidenceSigner;
  readonly trustAnchor: ComputeEvidenceTrustAnchor;
} {
  const privateKey = createPrivateKey({
    key: Buffer.concat([
      Buffer.from('302e020100300506032b657004220420', 'hex'),
      Buffer.alloc(32, 7),
    ]),
    format: 'der',
    type: 'pkcs8',
  });
  const publicKey = createPublicKey(privateKey);
  const issuer = 'urn:holoscript:test:structural-conformance';
  const keyId = 'fixed-ed25519-test-key';
  const roles: readonly ComputeEvidenceRole[] = [
    'capacity_observer',
    'bridge_admitter',
    'placement_planner',
  ];
  return {
    signer: {
      issuer,
      keyId,
      sign: (message) => sign(null, Buffer.from(message), privateKey).toString('base64'),
    },
    trustAnchor: {
      issuer,
      keyId,
      algorithm: 'ed25519',
      roles,
      principalDigests: [PRINCIPAL_DIGEST],
      lanes: ['local_device', 'owned_fleet', 'managed_bridge'],
      capacityRefs: CASES.map(capacityRef),
      validFrom: '2026-08-01T00:00:00.000Z',
      validUntil: '2026-08-02T00:00:00.000Z',
      publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
    },
  };
}

const AUTHORITY = fixedAuthority();

function sourceFor(entry: StructuralConformanceCase): string {
  const objectName = entry.id.replaceAll('-', '_');
  return `
composition "ComputeConformance_${objectName}" {
  object "${objectName}" @compute {
    intent: "Structurally qualify ${entry.id} without asserting execution.",
    allowed_accelerators: ${JSON.stringify(entry.allowedAccelerators)},
    placement_policy: "${entry.placement}",
    data_classification: "${entry.dataClassification}",
    quality_metric: "max_abs_error",
    quality_operator: "lte",
    quality_threshold: 0.001,
    quality_reference: "cpu_reference",
    deadline_ms: 60000,
    budget_currency: "USD",
    max_cost_minor_units: ${entry.maxCostMinorUnits},
    allow_fallback: ${entry.allowFallback}
  } {}
}
`;
}

function compileAuthoredWorkUnit(entry: StructuralConformanceCase): {
  readonly source: string;
  readonly workUnit: ComputeWorkUnitContract;
} {
  const source = sourceFor(entry);
  const parsed = new HoloCompositionParser().parse(source);
  if (!parsed.success || !parsed.ast) {
    throw new Error(`Corpus source ${entry.id} did not parse`);
  }
  const compiled = compileComputeWorkUnits(parsed.ast, { sourceText: source });
  if (compiled.length !== 1) {
    throw new Error(`Corpus source ${entry.id} did not produce exactly one WorkUnit`);
  }
  return { source, workUnit: compiled[0].workUnit };
}

function snapshotFor(entry: StructuralConformanceCase): ComputeCapacitySnapshot {
  return buildComputeCapacitySnapshot({
    lane: entry.lane,
    capacityRef: capacityRef(entry),
    accelerator: entry.accelerator,
    health: 'ready',
    availableSlots: entry.availableSlots,
    allowedDataClassifications: entry.allowedDataClassifications,
    observedAt: entry.observedAt ?? OBSERVED_AT,
    validUntil: entry.validUntil ?? VALID_UNTIL,
    estimatedCost: entry.estimatedCost,
    signer: AUTHORITY.signer,
  });
}

function admissionFor(
  entry: StructuralConformanceCase,
  workUnit: ComputeWorkUnitContract
): ComputeBridgeAdmission | undefined {
  if (entry.placement !== 'external_bridge_requested') return undefined;
  return buildComputeBridgeAdmission({
    principalDigest: PRINCIPAL_DIGEST,
    bridgeRef: capacityRef(entry),
    workUnitDigest: computeWorkUnitDigest(workUnit),
    dataClassification: workUnit.compute.policy.dataClassification,
    budget: {
      currency: workUnit.compute.budget.currency,
      maxCostMinorUnits: workUnit.compute.budget.maxCostMinorUnits,
    },
    verdict: 'admitted',
    reason: 'policy_admitted',
    issuedAt: OBSERVED_AT,
    validUntil: VALID_UNTIL,
    signer: AUTHORITY.signer,
  });
}

function runStructuralCase(entry: StructuralConformanceCase): {
  readonly source: string;
  readonly workUnit: ComputeWorkUnitContract;
  readonly snapshot: ComputeCapacitySnapshot;
  readonly admission?: ComputeBridgeAdmission;
  readonly plan: ComputePlacementPlan;
} {
  const { source, workUnit } = compileAuthoredWorkUnit(entry);
  const snapshot = snapshotFor(entry);
  const admission = admissionFor(entry, workUnit);
  const plan = planComputePlacement({
    principalDigest: PRINCIPAL_DIGEST,
    workUnit,
    capacitySnapshot: snapshot,
    ...(admission ? { bridgeAdmission: admission } : {}),
    checkedAt: CHECKED_AT,
    trustAnchors: [AUTHORITY.trustAnchor],
    signer: AUTHORITY.signer,
  });
  return { source, workUnit, snapshot, ...(admission ? { admission } : {}), plan };
}

describe('Compute backend structural conformance corpus', () => {
  it('declares the non-execution evidence boundary explicitly', () => {
    expect(CORPUS).toMatchObject({
      schemaVersion: CORPUS_SCHEMA_VERSION,
      conformanceScope: 'structural_test_double_only',
      placementEvidence: 'signed_test_double',
      executionEvidence: 'not_collected',
      hardwareEvidence: 'not_collected',
      providerEvidence: 'not_supplied',
      benchmarkEvidence: 'not_collected',
    });
  });

  it.each(CASES)('$id follows the same compiler and signed placement contract', (entry) => {
    const result = runStructuralCase(entry);
    const replay = runStructuralCase(entry);

    expect(validateComputeWorkUnitContract(result.workUnit)).toEqual({ valid: true, errors: [] });
    expect(verifyComputeWorkUnitEvidence(result.workUnit, { sourceText: result.source })).toEqual({
      valid: true,
      errors: [],
    });
    expect(result.workUnit.compute.source.compiler).toBe('ComputeWorkUnitCompiler');
    expect(result.workUnit.producer_surface).toBe('@compute');
    expect(computeWorkUnitDigest(replay.workUnit)).toBe(computeWorkUnitDigest(result.workUnit));

    expect(result.snapshot.verificationScope).toBe('issuer_attested');
    expect(validateComputeCapacitySnapshot(result.snapshot)).toEqual({ valid: true, errors: [] });
    expect(replay.snapshot.receiptId).toBe(result.snapshot.receiptId);

    if (result.admission) {
      expect(result.admission.verificationScope).toBe('issuer_attested');
      expect(validateComputeBridgeAdmission(result.admission)).toEqual({ valid: true, errors: [] });
      expect(replay.admission?.receiptId).toBe(result.admission.receiptId);
    }

    expect(result.plan.verificationScope).toBe('issuer_attested');
    expect(result.plan.verdict).toBe(entry.expectedVerdict);
    expect(result.plan.reasonCodes).toEqual(entry.expectedReasons);
    expect(result.plan.lane).toBe(entry.lane);
    expect(result.plan.accelerator).toBe(entry.accelerator);
    expect(result.plan.workUnitDigest).toBe(computeWorkUnitDigest(result.workUnit));
    expect(validateComputePlacementPlan(result.plan)).toEqual({ valid: true, errors: [] });
    expect(replay.plan.receiptId).toBe(result.plan.receiptId);
    expect(
      verifyComputePlacementPlan({
        principalDigest: PRINCIPAL_DIGEST,
        workUnit: result.workUnit,
        capacitySnapshot: result.snapshot,
        ...(result.admission ? { bridgeAdmission: result.admission } : {}),
        plan: result.plan,
        checkedAt: CHECKED_AT,
        verifiedAt: CHECKED_AT,
        trustAnchors: [AUTHORITY.trustAnchor],
      })
    ).toEqual({ valid: true, errors: [] });

    const portableEvidence = JSON.stringify({
      snapshot: result.snapshot,
      admission: result.admission,
      plan: result.plan,
    });
    for (const forbidden of [
      'providerAccount',
      'providerInstance',
      'endpoint',
      'credential',
      'hardwareReceipt',
      'executionReceipt',
      'benchmarkResult',
    ]) {
      expect(portableEvidence).not.toContain(forbidden);
    }
  });
});
