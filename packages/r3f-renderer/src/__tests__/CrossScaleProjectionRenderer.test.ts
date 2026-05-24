import { describe, expect, it } from 'vitest';
import {
  buildCrossScaleProjection,
  CROSS_SCALE_PROJECTION_RECEIPT_SCHEMA,
  CROSS_SCALE_PROJECTION_SCALES,
  type CrossScalePartitionLike,
} from '../components/CrossScaleProjectionRenderer';

function fixturePartition(): CrossScalePartitionLike {
  return {
    schema: 'spatial-partition/v1',
    compositionName: 'cross-scale-fixture',
    merkleRoot: 'root_0123456789abcdef',
    totalGaussians: 1280,
    anchors: [
      {
        id: 'spa_atom.cluster_0',
        position: [1, 2, 3],
        scale: 0.5,
        lodLevel: 2,
        gaussianCount: 512,
        importance: 0.8,
        provenanceHash: 'a'.repeat(64),
        sourceFile: 'fixtures/atom-cluster.splat',
      },
      {
        id: 'spa_structural-beam_1',
        position: [-2, 0, 4],
        scale: 2,
        lodLevel: 0,
        gaussianCount: 768,
        importance: 0.4,
        provenanceHash: 'b'.repeat(64),
      },
    ],
  };
}

describe('buildCrossScaleProjection', () => {
  it('binds spatial anchors through cross-scale provenance edges to pixel proxies', () => {
    const projection = buildCrossScaleProjection(fixturePartition());

    expect(projection.nodes).toHaveLength(2);
    expect(projection.receipt.schema).toBe(CROSS_SCALE_PROJECTION_RECEIPT_SCHEMA);
    expect(projection.receipt.sourceMerkleRoot).toBe('root_0123456789abcdef');
    expect(projection.receipt.renderable).toBe(true);
    expect(projection.receipt.scalePath).toEqual([...CROSS_SCALE_PROJECTION_SCALES]);
    expect(projection.receipt.edgeCount).toBe(2 * CROSS_SCALE_PROJECTION_SCALES.length);

    const first = projection.nodes[0];
    expect(first?.projectionPath.map((edge) => edge.toScale)).toEqual([
      ...CROSS_SCALE_PROJECTION_SCALES,
    ]);
    expect(first?.projectionPath[0]?.fromScale).toBe('source');
    expect(first?.projectionPath.at(-1)?.toScale).toBe('scene');
    expect(first?.provenanceHash).toMatch(/^[0-9a-f]{64}$/);
    expect(first?.pixelProxyId).toMatch(/^px_spa_atom_cluster_0_[0-9a-f]{12}$/);
    expect(first?.renderId).toBe(`cross_scale_${first?.pixelProxyId}`);
    expect(projection.receipt.pixelProxyIds).toEqual(
      projection.nodes.map((node) => node.pixelProxyId)
    );
  });

  it('changes the receipt when anchor provenance changes', () => {
    const base = fixturePartition();
    const changed: CrossScalePartitionLike = {
      ...base,
      anchors: [
        {
          ...base.anchors[0],
          provenanceHash: 'c'.repeat(64),
        },
        base.anchors[1],
      ],
    };

    const baseProjection = buildCrossScaleProjection(base);
    const changedProjection = buildCrossScaleProjection(changed);

    expect(changedProjection.nodes[0]?.sourceProvenanceHash).toBe('c'.repeat(64));
    expect(changedProjection.nodes[0]?.provenanceHash).not.toBe(
      baseProjection.nodes[0]?.provenanceHash
    );
    expect(changedProjection.receipt.projectionHash).not.toBe(
      baseProjection.receipt.projectionHash
    );
  });

  it('keeps visible proxies renderable for tiny or malformed anchors', () => {
    const base = fixturePartition();
    const malformed: CrossScalePartitionLike = {
      ...base,
      anchors: [
        {
          ...base.anchors[0],
          position: [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY],
          scale: 0.000001,
          importance: 9,
        },
      ],
    };

    const projection = buildCrossScaleProjection(malformed, {
      minRadius: 0.2,
      colorBy: 'importance',
    });

    expect(projection.nodes).toHaveLength(1);
    expect(projection.nodes[0]?.position).toEqual([0, 0, 0]);
    expect(projection.nodes[0]?.radius).toBe(0.2);
    expect(projection.nodes[0]?.material.opacity).toBeLessThanOrEqual(0.9);
    expect(projection.receipt.pixelProxyIds).toHaveLength(1);
  });
});
