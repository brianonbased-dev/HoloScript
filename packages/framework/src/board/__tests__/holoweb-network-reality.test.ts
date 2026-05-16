import { describe, expect, it } from 'vitest';
import {
  cloneHoloWebNetworkRealitySnapshot,
  HOLOWEB_NETWORK_REALITY_SCHEMA_VERSION,
  isSupportedHoloWebLocationPrecision,
  isSupportedHoloWebNodeRole,
  isSupportedHoloWebReceiptType,
  isSupportedHoloWebUnderlayClassification,
  type HoloWebLocationProof,
  type HoloWebNetworkRealitySnapshot,
  validateHoloWebLocationProof,
  validateHoloWebNetworkRealitySnapshot,
} from '../holoweb-network-reality';

function makeSnapshot(
  overrides: Partial<HoloWebNetworkRealitySnapshot> = {}
): HoloWebNetworkRealitySnapshot {
  return {
    schemaVersion: HOLOWEB_NETWORK_REALITY_SCHEMA_VERSION,
    generatedAt: '2026-05-15T20:25:49.737Z',
    sourceAnchors: {
      source: 'apps/holoshell/source/holoshell-network-reality.hsplus',
      adapter: 'scripts/holoshell-network-reality.mjs',
      liveFeed: 'scripts/holoshell-live-feed.mjs',
      planning:
        'C:/Users/josep/.ai-ecosystem/research/2026-05-15_holoweb-local-reality-node-contract.md',
    },
    node: {
      nodeId: 'local-hardware',
      role: 'holoweb-local-reality-node',
      privacyScope: 'local_only',
      capabilities: ['bandwidth', 'relay'],
    },
    underlay: {
      classification: 'metered_or_hotspot',
      confidence: 'owner_declared',
      ownerDeclaredKind: 'phone_hotspot',
      ownerDeclaredSource: 'cli',
      osInterfaceKind: 'wifi',
      osCost: 'Unrestricted',
      connectivity: 'InternetAccess',
      vpnState: 'inactive',
      evidence: ['owner_declared_phone_hotspot'],
      wifi: {
        available: true,
        connected: true,
        signalPercent: 93,
        radioType: '802.11ac',
        channel: 149,
        authentication: 'WPA2-Personal',
        ssidRedacted: true,
        bssidRedacted: true,
      },
      cost: {
        available: true,
        roaming: false,
        overDataLimit: false,
        approachingDataLimit: false,
      },
      adapters: {
        available: true,
        adapterCount: 5,
        configuredVpnCount: 2,
        activeVpnCount: 0,
        endpointDetailsRedacted: true,
      },
    },
    health: {
      state: 'warn',
      networkConsumerCount: 17,
      establishedConnectionCount: 78,
      processHealthRisk: 'warn',
    },
    lanes: {
      activeLaneCount: 7,
      laneCount: 7,
      semanticIdentityRequired: true,
      processCountIsNotPeerCount: true,
      processHealthRisk: 'warn',
      registeredRunCount: 32,
      activeRegisteredRunCount: 4,
      networkConsumerCount: 17,
      agentOrShellNetworkConsumerCount: 4,
      legacyNetworkConsumerCount: 12,
      topConsumers: [
        {
          pid: 10144,
          pidHash: '84ef557b626c0d70',
          processName: 'highwind_service',
          processKind: 'legacy_app',
          establishedConnectionCount: 28,
          endpointDetailsRedacted: true,
        },
        {
          pid: 23568,
          pidHash: '2c10aa2d8373c3d3',
          processName: 'Codex',
          processKind: 'agent_or_shell',
          establishedConnectionCount: 4,
          endpointDetailsRedacted: true,
        },
      ],
    },
    policy: {
      bandwidthPosture: 'protect_mobile_data',
      heavyWorkPolicy: 'queue_or_ask_before_heavy_transfer',
      agentAction: 'throttle_downloads_and_uploads',
      brittneyStance: 'protect_bandwidth',
      allowedWithoutOwnerGesture: [
        'local_read',
        'local_build_if_inputs_cached',
        'small_receipt_sync',
      ],
      requiresOwnerGesture: [
        'package_install',
        'model_download',
        'large_upload',
        'video_stream',
        'fleet_sync',
      ],
      governanceScope: 'owner_local',
    },
    brittney: {
      stance: 'protect_bandwidth',
      firstMessage:
        'I will protect bandwidth before downloads, uploads, or parallel agent work.',
      protectBandwidth: true,
      canExplainToNonDeveloper: true,
    },
    redaction: {
      rawSsidIncluded: false,
      rawBssidIncluded: false,
      ipAddressIncluded: false,
      gatewayIncluded: false,
      remoteEndpointIncluded: false,
      rawCommandLineIncluded: false,
      pidIncluded: true,
      pidHashIncluded: true,
      localOnly: true,
    },
    receipt: {
      receiptType: 'network_reality_snapshot',
      snapshotHash: '24e439590f9ee499',
      actionTaken: 'read_only_scan',
      mutationPerformed: false,
      scope: 'local_only',
      payloadInspection: false,
      hashAlgorithm: 'sha256',
    },
    ...overrides,
  };
}

function makeLocationProof(
  overrides: Partial<HoloWebLocationProof> = {}
): HoloWebLocationProof {
  return {
    proofId: 'loc_20260515_phoenix_local',
    scope: 'local_only',
    method: 'owner_declared',
    precision: 'city',
    createdAt: '2026-05-15T20:25:00.000Z',
    locationHash: 'location_hash_001',
    revocable: true,
    ...overrides,
  };
}

describe('HoloWeb network reality schema pack', () => {
  it('accepts the HoloLand network-reality JSON shape without losing fields', () => {
    const snapshot = makeSnapshot();

    expect(validateHoloWebNetworkRealitySnapshot(snapshot)).toEqual([]);
    expect(snapshot.sourceAnchors?.adapter).toBe('scripts/holoshell-network-reality.mjs');
    expect(snapshot.underlay.ownerDeclaredKind).toBe('phone_hotspot');
    expect(snapshot.lanes.topConsumers[0].processName).toBe('highwind_service');
    expect(snapshot.policy.requiresOwnerGesture).toContain('model_download');
    expect(snapshot.receipt.payloadInspection).toBe(false);
  });

  it('rejects raw network identifiers and endpoint leakage', () => {
    const snapshot = makeSnapshot({
      redaction: {
        ...makeSnapshot().redaction,
        rawSsidIncluded: true as unknown as false,
        remoteEndpointIncluded: true as unknown as false,
      },
      underlay: {
        ...makeSnapshot().underlay,
        wifi: {
          ...makeSnapshot().underlay.wifi,
          ssidRedacted: false as unknown as true,
        },
        adapters: {
          ...makeSnapshot().underlay.adapters,
          endpointDetailsRedacted: false as unknown as true,
        },
      },
    });

    expect(validateHoloWebNetworkRealitySnapshot(snapshot)).toEqual(
      expect.arrayContaining([
        'HoloWebWifiEvidence.ssidRedacted must be true.',
        'HoloWebAdapterEvidence.endpointDetailsRedacted must be true.',
        'HoloWebRedactionPolicy.rawSsidIncluded must be false.',
        'HoloWebRedactionPolicy.remoteEndpointIncluded must be false.',
      ])
    );
  });

  it('keeps semantic lane identity separate from process counts', () => {
    const snapshot = makeSnapshot({
      lanes: {
        ...makeSnapshot().lanes,
        semanticIdentityRequired: false as unknown as true,
        processCountIsNotPeerCount: false as unknown as true,
      },
    });

    expect(validateHoloWebNetworkRealitySnapshot(snapshot)).toEqual(
      expect.arrayContaining([
        'HoloWebAgentLane.semanticIdentityRequired must be true.',
        'HoloWebAgentLane.processCountIsNotPeerCount must be true.',
      ])
    );
  });

  it('enforces local-only exact location and shared-location consent receipts', () => {
    expect(
      validateHoloWebLocationProof(
        makeLocationProof({
          scope: 'community_shared',
          precision: 'exact_local_only',
        })
      )
    ).toEqual(
      expect.arrayContaining([
        'HoloWebLocationProof.precision exact_local_only cannot leave local_only scope.',
        'HoloWebLocationProof.ownerConsentReceiptId is required for shared location proofs.',
      ])
    );

    expect(
      validateHoloWebLocationProof(
        makeLocationProof({
          scope: 'community_shared',
          precision: 'geohash_5',
          ownerConsentReceiptId: 'consent_receipt_001',
        })
      )
    ).toEqual([]);
  });

  it('rejects mutating network reality receipts', () => {
    const snapshot = makeSnapshot({
      receipt: {
        ...makeSnapshot().receipt,
        mutationPerformed: true,
      },
    });

    expect(validateHoloWebNetworkRealitySnapshot(snapshot)).toContain(
      'HoloWebReceipt network_reality_snapshot must not perform mutation.'
    );
  });

  it('clones nested snapshot state without retaining mutable references', () => {
    const original = makeSnapshot({
      locationProof: makeLocationProof({ metadata: { utility: 'local ownership' } }),
    });
    const cloned = cloneHoloWebNetworkRealitySnapshot(original);

    cloned.underlay.evidence[0] = 'changed';
    cloned.lanes.topConsumers[0].processName = 'changed';
    cloned.policy.requiresOwnerGesture[0] = 'changed';
    cloned.locationProof!.metadata!.utility = 'changed';

    expect(original.underlay.evidence[0]).toBe('owner_declared_phone_hotspot');
    expect(original.lanes.topConsumers[0].processName).toBe('highwind_service');
    expect(original.policy.requiresOwnerGesture[0]).toBe('package_install');
    expect(original.locationProof!.metadata!.utility).toBe('local ownership');
  });

  it('exposes type guards for adapter routing', () => {
    expect(isSupportedHoloWebNodeRole('holoweb-local-reality-node')).toBe(true);
    expect(isSupportedHoloWebNodeRole('isp-clone')).toBe(false);
    expect(isSupportedHoloWebUnderlayClassification('metered_or_hotspot')).toBe(true);
    expect(isSupportedHoloWebUnderlayClassification('maybe-fast')).toBe(false);
    expect(isSupportedHoloWebLocationPrecision('exact_local_only')).toBe(true);
    expect(isSupportedHoloWebLocationPrecision('exact-public')).toBe(false);
    expect(isSupportedHoloWebReceiptType('network_reality_snapshot')).toBe(true);
    expect(isSupportedHoloWebReceiptType('packet_capture')).toBe(false);
  });
});
