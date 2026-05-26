import { describe, expect, it } from 'vitest';

import { ScaleBridge } from '../ScaleBridge';

describe('ScaleBridge', () => {
  it('projects a depth-derived world to a coarser scale with a source SHA-256 provenance edge', () => {
    const authoritativeState = {
      type: 'Composition',
      name: 'Depth Derived Gallery',
      metadata: {
        receiptChain: ['sha256:depth-frame-0001', 'sha256:depth-mesh-0001'],
        provenanceHash: 'sha256:hologram-depth-world',
      },
      worlds: [
        {
          type: 'World',
          name: 'gallery_world',
          bounds: { minX: -8, minY: 0, minZ: -8, maxX: 8, maxY: 4, maxZ: 8 },
        },
      ],
      objects: [
        {
          type: 'ObjectDecl',
          name: 'Photo Panel 1',
          traits: [
            { type: 'ObjectTrait', name: 'image', params: { src: 'room-a.jpg' } },
            {
              type: 'ObjectTrait',
              name: 'depth_estimation',
              params: { model: 'depth-anything-v2-small' },
            },
          ],
        },
        {
          type: 'ObjectDecl',
          name: 'Photo Panel 2',
          traits: [
            { type: 'ObjectTrait', name: 'image', params: { src: 'room-b.jpg' } },
            {
              type: 'ObjectTrait',
              name: 'depth_estimation',
              params: { model: 'depth-anything-v2-small' },
            },
          ],
        },
      ],
    };

    const sourceStateHash = ScaleBridge.hashState(authoritativeState);
    const projection = ScaleBridge.project(authoritativeState, {
      id: 'coarse-room',
      granularity: 'room',
      includePaths: ['type', 'name', 'metadata', 'worlds', 'objects'],
      collectionLimits: { objects: 1 },
    });

    expect(sourceStateHash).toMatch(/^[a-f0-9]{64}$/);
    expect(projection.state).toMatchObject({
      type: 'Composition',
      name: 'Depth Derived Gallery',
      worlds: authoritativeState.worlds,
    });
    expect((projection.state as { objects: unknown[] }).objects).toHaveLength(1);
    expect(projection.provenance.edge).toEqual(
      expect.objectContaining({
        type: 'scale_projection',
        hashAlgorithm: 'sha256',
        sourceStateHash,
        projectedStateHash: ScaleBridge.hashState(projection.state),
        targetScaleId: 'coarse-room',
      })
    );
    expect(projection.provenance.edge.sourceStateHash).toBeTruthy();
    expect(projection.provenance.carriedReceipts).toEqual(
      expect.arrayContaining([
        authoritativeState.metadata.receiptChain,
        authoritativeState.metadata.provenanceHash,
      ])
    );
  });
});
