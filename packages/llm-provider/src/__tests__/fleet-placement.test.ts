import { describe, expect, it } from 'vitest';
import {
  DEFAULT_FLEET_PLACEMENT_POLICY,
  FLEET_PLACEMENT_MANIFEST_SCHEMA,
  FLEET_WORKER_CAPABILITY_SCHEMA,
  planFleetPlacement,
  type FleetPlacementManifest,
  type FleetPlacementOptions,
  type FleetWorkerCapability,
  type FleetWorkerIsland,
} from '../fleet-placement';

const DECISION_TIME = '2026-08-08T23:30:15.000Z';

function digest(character: string): string {
  return `sha256:${character.repeat(64)}`;
}

const REQUEST_ATTESTATION = digest('a');
const LANE_MANIFEST = digest('b');
const MODEL_RELEASE = digest('c');
const RUNTIME_PROFILE = digest('d');
const LICENSE_POLICY = digest('e');

function manifest(overrides: Partial<FleetPlacementManifest> = {}): FleetPlacementManifest {
  return {
    schema: FLEET_PLACEMENT_MANIFEST_SCHEMA,
    requestId: 'request-001',
    idempotencyKey: 'request-001-attempt-1',
    upstreamAttestationReceiptDigest: REQUEST_ATTESTATION,
    laneId: 'frontier-serve-01',
    laneManifestDigest: LANE_MANIFEST,
    modelReleaseDigest: MODEL_RELEASE,
    runtimeProfileDigest: RUNTIME_PROFILE,
    licensePolicyDigest: LICENSE_POLICY,
    resources: {
      gpuCount: 1,
      gpuMemoryMiB: 24_000,
      hostMemoryMiB: 32_000,
      scratchBytes: 1_000,
      slots: 1,
    },
    admittedWorkerSpecDigests: [digest('1'), digest('2'), digest('3')],
    allowedCustodyTiers: ['sovereign-overflow'],
    dataClass: 'internal-nonsecret',
    policy: { ...DEFAULT_FLEET_PLACEMENT_POLICY },
    ...overrides,
  };
}

function island(overrides: Partial<FleetWorkerIsland> = {}): FleetWorkerIsland {
  return {
    islandId: 'island-0',
    gpuCount: 1,
    gpuMemoryTotalMiB: 48_000,
    gpuMemoryFreeMiB: 30_000,
    hostMemoryFreeMiB: 64_000,
    scratchFreeBytes: 10_000,
    availableSlots: 1,
    activeLeaseCount: 0,
    lastAssignedOrdinal: 7,
    dataEndpointId: 'private-endpoint:worker',
    runtimeProfileDigests: [RUNTIME_PROFILE],
    residentReleaseDigests: [MODEL_RELEASE],
    admittedLicensePolicyDigests: [LICENSE_POLICY],
    allowedDataClasses: ['internal-nonsecret'],
    ...overrides,
  };
}

function capability(
  workerId: string,
  islands: FleetWorkerIsland[] = [island()],
  overrides: Partial<FleetWorkerCapability> = {}
): FleetWorkerCapability {
  const marker = workerId === 'worker-a' ? '1' : workerId === 'worker-b' ? '2' : '3';
  return {
    schema: FLEET_WORKER_CAPABILITY_SCHEMA,
    workerId,
    laneId: 'frontier-serve-01',
    laneManifestDigest: LANE_MANIFEST,
    specDigest: digest(marker),
    custodyTier: 'sovereign-overflow',
    signingSeat: `${workerId}-seat`,
    attestationReceiptDigest: digest(marker === '3' ? '4' : marker),
    freshness: {
      bootId: `boot-${workerId}`,
      sequence: 7,
      acceptedAt: '2026-08-08T23:30:00.000Z',
      expiresAt: '2026-08-08T23:30:30.000Z',
    },
    state: 'ready',
    islands,
    ...overrides,
  };
}

function options(
  capabilities: FleetWorkerCapability[],
  placementManifest: FleetPlacementManifest = manifest()
): FleetPlacementOptions {
  return {
    decisionTime: DECISION_TIME,
    leaseLedgerVersion: 42,
    manifest: placementManifest,
    capabilities,
  };
}

describe('planFleetPlacement', () => {
  it('is invariant to capability, island, and set-like digest ordering', () => {
    const extraProfile = digest('5');
    const extraRelease = digest('6');
    const first = capability('worker-a', [
      island({
        islandId: 'island-a',
        runtimeProfileDigests: [RUNTIME_PROFILE, extraProfile],
        residentReleaseDigests: [MODEL_RELEASE, extraRelease],
      }),
      island({ islandId: 'island-b' }),
    ]);
    const second = capability('worker-b', [island({ islandId: 'island-a' })]);
    const shuffledFirst = capability('worker-a', [
      island({ islandId: 'island-b' }),
      island({
        islandId: 'island-a',
        runtimeProfileDigests: [extraProfile, RUNTIME_PROFILE],
        residentReleaseDigests: [extraRelease, MODEL_RELEASE],
      }),
    ]);

    const left = planFleetPlacement(options([first, second]));
    const right = planFleetPlacement(options([second, shuffledFirst]));

    expect(left.status).toBe('placed');
    expect(right.status).toBe('placed');
    expect(right.selected).toEqual(left.selected);
    expect(right.capabilitySnapshotDigest).toBe(left.capabilitySnapshotDigest);
    expect(right.receiptDigest).toBe(left.receiptDigest);
  });

  it('uses UTF-8 byte tie-breaking after identical best-fit resources', () => {
    const upper = capability('worker-Z', [island({ islandId: 'island-Z' })]);
    const lower = capability('worker-a', [island({ islandId: 'island-a' })]);

    const result = planFleetPlacement(options([lower, upper]));

    expect(result.status).toBe('placed');
    expect(result.selected?.workerId).toBe('worker-Z');
  });

  it('selects the eligible island with the smallest GPU-memory slack', () => {
    const loose = capability('worker-a', [island({ gpuMemoryFreeMiB: 36_000 })]);
    const bestFit = capability('worker-b', [island({ gpuMemoryFreeMiB: 25_000 })]);

    const result = planFleetPlacement(options([loose, bestFit]));

    expect(result.status).toBe('placed');
    expect(result.selected?.workerId).toBe('worker-b');
    expect(result.selected?.rank[1]).toBe(1_000);
  });

  it('prefers fewer active leases before best-fit memory and uses oldest assignment next', () => {
    const loadedBestFit = capability('worker-a', [
      island({ activeLeaseCount: 1, gpuMemoryFreeMiB: 24_500, lastAssignedOrdinal: 1 }),
    ]);
    const idleRecent = capability('worker-b', [
      island({ activeLeaseCount: 0, gpuMemoryFreeMiB: 30_000, lastAssignedOrdinal: 9 }),
    ]);
    const idleOld = capability('worker-c', [
      island({ activeLeaseCount: 0, gpuMemoryFreeMiB: 30_000, lastAssignedOrdinal: 3 }),
    ]);

    const result = planFleetPlacement(options([loadedBestFit, idleRecent, idleOld]));

    expect(result.selected?.workerId).toBe('worker-c');
    expect(result.selected?.rank.slice(0, 3)).toEqual([0, 6_000, 3]);
  });

  it('rejects exact runtime-profile mismatch and non-resident model bytes', () => {
    const profileMismatch = capability('worker-a', [
      island({ runtimeProfileDigests: [digest('7')] }),
    ]);
    const coldModel = capability('worker-b', [island({ residentReleaseDigests: [] })]);

    const result = planFleetPlacement(options([profileMismatch, coldModel]));

    expect(result.status).toBe('unplaced');
    expect(result.outcomeCode).toBe('NO_ELIGIBLE_CANDIDATE');
    expect(
      result.candidates.find((candidate) => candidate.workerId === 'worker-a')?.rejectionCodes
    ).toContain('RUNTIME_PROFILE_NOT_ADMITTED');
    expect(
      result.candidates.find((candidate) => candidate.workerId === 'worker-b')?.rejectionCodes
    ).toContain('MODEL_RELEASE_NOT_RESIDENT');
  });

  it('binds lane manifest, data class, and license policy before exposing an endpoint', () => {
    const wrongLane = capability('worker-a', [island()], {
      laneManifestDigest: digest('f'),
    });
    const policyDenied = capability('worker-b', [
      island({ allowedDataClasses: [], admittedLicensePolicyDigests: [] }),
    ]);

    const result = planFleetPlacement(options([wrongLane, policyDenied]));

    expect(result.status).toBe('unplaced');
    expect(result.selected).toBeNull();
    expect(
      result.candidates.find((candidate) => candidate.workerId === 'worker-a')?.rejectionCodes
    ).toContain('LANE_MANIFEST_MISMATCH');
    expect(
      result.candidates.find((candidate) => candidate.workerId === 'worker-b')?.rejectionCodes
    ).toEqual(expect.arrayContaining(['DATA_CLASS_DENIED', 'LICENSE_POLICY_NOT_ADMITTED']));
  });

  it('rejects a capability whose static worker spec is not admitted by the request', () => {
    const result = planFleetPlacement(
      options([capability('worker-a', [island()], { specDigest: digest('9') })])
    );

    expect(result.status).toBe('unplaced');
    expect(result.selected).toBeNull();
    expect(result.candidates[0]?.rejectionCodes).toContain('WORKER_SPEC_NOT_ADMITTED');
  });

  it('admits the exact resource boundary and rejects one MiB below it', () => {
    const exact = island({
      gpuMemoryTotalMiB: 24_000,
      gpuMemoryFreeMiB: 24_000,
      hostMemoryFreeMiB: 32_000,
      scratchFreeBytes: 1_000,
    });
    const placed = planFleetPlacement(options([capability('worker-a', [exact])]));
    const below = planFleetPlacement(
      options([capability('worker-a', [island({ gpuMemoryFreeMiB: 23_999 })])])
    );

    expect(placed.status).toBe('placed');
    expect(placed.selected?.rank).toEqual([0, 0, 7, 'worker-a', 'island-0']);
    expect(below.status).toBe('unplaced');
    expect(below.candidates[0]?.rejectionCodes).toContain('INSUFFICIENT_GPU_MEMORY');
  });

  it('treats expiry at the decision instant as stale evidence', () => {
    const stale = capability('worker-a', [island()], {
      freshness: {
        bootId: 'boot-worker-a',
        sequence: 8,
        acceptedAt: '2026-08-08T23:30:00.000Z',
        expiresAt: DECISION_TIME,
      },
    });

    const result = planFleetPlacement(options([stale]));

    expect(result.status).toBe('unplaced');
    expect(result.candidates[0]?.rejectionCodes).toContain('CAPABILITY_STALE');
  });

  it('fails closed when any plan policy field is unsafe', () => {
    const unsafe = {
      ...manifest(),
      policy: { ...DEFAULT_FLEET_PLACEMENT_POLICY, spend: 'allowed' },
    } as unknown as FleetPlacementManifest;

    const result = planFleetPlacement(options([capability('worker-a')], unsafe));

    expect(result.status).toBe('invalid');
    expect(result.outcomeCode).toBe('INVALID_INPUT');
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'UNSAFE_POLICY', path: 'manifest.policy.spend' }),
      ])
    );
  });

  it('never aggregates GPUs across workers or islands', () => {
    const needsTwo = manifest({ resources: { ...manifest().resources, gpuCount: 2 } });
    const split = planFleetPlacement(
      options(
        [
          capability('worker-a', [island({ islandId: 'gpu-0', gpuCount: 1 })]),
          capability('worker-b', [island({ islandId: 'gpu-1', gpuCount: 1 })]),
        ],
        needsTwo
      )
    );
    const singleIsland = planFleetPlacement(
      options([capability('worker-a', [island({ gpuCount: 2 })])], needsTwo)
    );

    expect(split.status).toBe('unplaced');
    expect(split.candidates).toHaveLength(2);
    expect(
      split.candidates.every((candidate) =>
        candidate.rejectionCodes.includes('INSUFFICIENT_GPU_COUNT')
      )
    ).toBe(true);
    expect(singleIsland.status).toBe('placed');
    expect(singleIsland.selected?.islandId).toBe('island-0');
  });

  it('rejects duplicate worker identities instead of silently deduplicating', () => {
    const result = planFleetPlacement(
      options([capability('worker-a'), capability('worker-a', [island({ islandId: 'other' })])])
    );

    expect(result.status).toBe('invalid');
    expect(result.errors.map((error) => error.code)).toContain('DUPLICATE_WORKER_ID');
  });

  it('rejects duplicate digest claims inside set-like capability fields', () => {
    const duplicate = capability('worker-a', [
      island({ runtimeProfileDigests: [RUNTIME_PROFILE, RUNTIME_PROFILE] }),
    ]);

    const result = planFleetPlacement(options([duplicate]));

    expect(result.status).toBe('invalid');
    expect(result.errors.map((error) => error.code)).toContain('DUPLICATE_VALUE');
  });

  it('returns an unplaced no-candidates receipt for an empty capability snapshot', () => {
    const result = planFleetPlacement(options([]));

    expect(result.status).toBe('unplaced');
    expect(result.outcomeCode).toBe('NO_CANDIDATES');
    expect(result.candidates).toEqual([]);
    expect(result.selected).toBeNull();
  });

  it('requires exact lowercase attestation digests without claiming verification', () => {
    const uppercaseAttestation = manifest({
      upstreamAttestationReceiptDigest: `sha256:${'A'.repeat(64)}`,
    });
    const invalid = planFleetPlacement(options([capability('worker-a')], uppercaseAttestation));
    const valid = planFleetPlacement(options([capability('worker-a')]));

    expect(invalid.status).toBe('invalid');
    expect(invalid.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'INVALID_DIGEST',
          path: 'manifest.upstreamAttestationReceiptDigest',
        }),
      ])
    );
    expect(valid.attestation).toMatchObject({
      required: true,
      digestReferencesValidated: true,
      signatureVerificationPerformed: false,
      signatureVerified: false,
      verificationScope: 'digest-reference-only',
    });
  });

  it('makes every forbidden side effect explicit on a placed plan', () => {
    const result = planFleetPlacement(options([capability('worker-a')]));

    expect(result.status).toBe('placed');
    expect(result.leaseLedgerVersion).toBe(42);
    expect(result.selected?.dataEndpointId).toBe('private-endpoint:worker');
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.candidates)).toBe(true);
    expect(Object.isFrozen(result.selected)).toBe(true);
    expect(result.sideEffects).toEqual({
      planOnly: true,
      stateMutated: false,
      leaseIssued: false,
      provisioningAttempted: false,
      spendAttempted: false,
      networkAccessed: false,
      artifactsFetched: false,
      remoteRpcAttempted: false,
      tensorTrafficAttempted: false,
    });
  });
});
