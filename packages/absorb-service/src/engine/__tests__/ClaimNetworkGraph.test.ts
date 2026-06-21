import { describe, expect, it } from 'vitest';
import { ClaimNetworkGraph } from '../ClaimNetworkGraph';

function addCommonClaimNetworkNodes(graph: ClaimNetworkGraph): ClaimNetworkGraph {
  return graph
    .addNode({
      id: 'claim:flood-height',
      kind: 'claim',
      label: 'Flood height exceeded landmark',
      ownerId: 'citizen-reporter',
      proofStatus: 'proven',
      claimKind: 'flood-height',
      evidenceKinds: ['depth-mm', 'landmark-elevation'],
      regionId: 'region:phoenix',
    })
    .addNode({
      id: 'solver:hydraulics',
      kind: 'solver_contract',
      label: 'Hydraulics contract',
      ownerId: 'solver-author',
      verified: true,
      supportedClaimKinds: ['flood-height'],
      requiredEvidenceKinds: ['depth-mm', 'landmark-elevation'],
    })
    .addNode({
      id: 'solver:stub-cognitive',
      kind: 'solver_contract',
      label: 'Stub cognitive verifier',
      verified: false,
      supportedClaimKinds: ['flood-height'],
    })
    .addNode({
      id: 'module:rainfall-dem',
      kind: 'source',
      ownerId: 'data-author',
    })
    .addNode({
      id: 'capture:phone-1',
      kind: 'holomap_capture',
      ownerId: 'citizen-reporter',
    })
    .addNode({
      id: 'source:city-sensor',
      kind: 'source',
      label: 'City sensor feed',
    })
    .addNode({
      id: 'frame:hero',
      kind: 'frame',
    })
    .addNode({
      id: 'region:phoenix',
      kind: 'region',
      label: 'Phoenix flood zone',
    });
}

describe('ClaimNetworkGraph revenue cascade', () => {
  it('walks the import/dependency chain and allocates the 80/10/10 split exactly', () => {
    const graph = addCommonClaimNetworkNodes(new ClaimNetworkGraph())
      .addNode({
        id: 'module:flood-contract',
        kind: 'solver_contract',
        ownerId: 'contract-author',
        verified: true,
      })
      .addEdge({
        from: 'claim:flood-height',
        to: 'module:flood-contract',
        kind: 'depends-on',
      })
      .addEdge({
        from: 'module:flood-contract',
        to: 'module:rainfall-dem',
        kind: 'imports',
      })
      .addEdge({
        from: 'module:rainfall-dem',
        to: 'claim:flood-height',
        kind: 'depends-on',
      });

    const cascade = graph.getImportChainRevenueCascade('claim:flood-height', {
      grossAmount: 100,
    });

    expect(cascade.dependencyChain.map((entry) => entry.nodeId)).toEqual([
      'module:flood-contract',
      'module:rainfall-dem',
    ]);
    expect(cascade.lines.find((line) => line.role === 'creator')).toMatchObject({
      recipientId: 'citizen-reporter',
      share: 0.8,
      amount: 80,
    });
    expect(cascade.lines.find((line) => line.role === 'platform')).toMatchObject({
      recipientId: 'platform',
      share: 0.1,
      amount: 10,
    });
    expect(cascade.lines.filter((line) => line.role === 'dependency')).toHaveLength(2);
    expect(cascade.lines.filter((line) => line.role === 'dependency')[0].share).toBeCloseTo(0.05);
    expect(cascade.allocatedShare).toBeCloseTo(1);
    expect(cascade.unallocatedShare).toBe(0);
  });
});

describe('ClaimNetworkGraph proof adjacency', () => {
  it('detects when a proven node shares a frame with a perceptual node', () => {
    const graph = addCommonClaimNetworkNodes(new ClaimNetworkGraph())
      .addNode({
        id: 'claim:intent',
        kind: 'claim',
        label: 'Unprovable motive claim',
        proofStatus: 'perceptual',
      })
      .addEdge({
        from: 'claim:flood-height',
        to: 'frame:hero',
        kind: 'in-frame',
      })
      .addEdge({
        from: 'claim:intent',
        to: 'frame:hero',
        kind: 'in-frame',
      });

    expect(graph.queryProofAdjacency('claim:flood-height')).toEqual({
      provenNodeId: 'claim:flood-height',
      sharesFrameWithPerceptual: true,
      frames: [{ frameId: 'frame:hero', perceptualNodeIds: ['claim:intent'] }],
    });
    expect(graph.findProofAdjacencyViolations()).toHaveLength(1);
  });
});

describe('ClaimNetworkGraph provenance path', () => {
  it('returns the exact claim to capture to source path', () => {
    const graph = addCommonClaimNetworkNodes(new ClaimNetworkGraph())
      .addEdge({
        from: 'claim:flood-height',
        to: 'capture:phone-1',
        kind: 'captured-by',
      })
      .addEdge({
        from: 'capture:phone-1',
        to: 'source:city-sensor',
        kind: 'sourced-from',
      });

    const path = graph.findProvenancePath('claim:flood-height');

    expect(path?.nodeIds).toEqual(['claim:flood-height', 'capture:phone-1', 'source:city-sensor']);
    expect(path?.edges.map((edge) => edge.kind)).toEqual(['captured-by', 'sourced-from']);
  });
});

describe('ClaimNetworkGraph solver-map resolution', () => {
  it('matches only verified solver contracts that fit claim kind and evidence', () => {
    const graph = addCommonClaimNetworkNodes(new ClaimNetworkGraph());

    expect(graph.resolveVerifiedSolversForClaim('claim:flood-height')).toEqual({
      claimNodeId: 'claim:flood-height',
      abstain: false,
      matches: [
        {
          solverNodeId: 'solver:hydraulics',
          claimNodeId: 'claim:flood-height',
          explicitGraphFit: false,
          matchedClaimKind: 'flood-height',
          requiredEvidenceKinds: ['depth-mm', 'landmark-elevation'],
        },
      ],
    });
  });

  it('abstains when required evidence is missing and no explicit fit edge exists', () => {
    const graph = addCommonClaimNetworkNodes(new ClaimNetworkGraph()).addNode({
      id: 'claim:thin-flood',
      kind: 'claim',
      claimKind: 'flood-height',
      evidenceKinds: ['depth-mm'],
    });

    expect(graph.resolveVerifiedSolversForClaim('claim:thin-flood')).toMatchObject({
      claimNodeId: 'claim:thin-flood',
      abstain: true,
      matches: [],
    });
  });
});

describe('ClaimNetworkGraph gap mapping', () => {
  it('groups claimable-but-unproven claims by region and excludes discharged claims', () => {
    const graph = addCommonClaimNetworkNodes(new ClaimNetworkGraph())
      .addNode({
        id: 'claim:bridge-deflection',
        kind: 'claim',
        claimKind: 'structural-deflection',
        claimable: true,
        regionId: 'region:phoenix',
      })
      .addNode({
        id: 'claim:already-proven',
        kind: 'claim',
        claimable: true,
        regionId: 'region:phoenix',
      })
      .addNode({
        id: 'receipt:already-proven',
        kind: 'cael_receipt',
      })
      .addEdge({
        from: 'claim:already-proven',
        to: 'receipt:already-proven',
        kind: 'discharged-by',
      });

    expect(graph.findClaimableUnprovenRegions()).toEqual([
      {
        regionId: 'region:phoenix',
        regionLabel: 'Phoenix flood zone',
        claimIds: ['claim:bridge-deflection'],
        reason: 'claimable_without_discharge',
      },
    ]);
  });
});
