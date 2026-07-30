import { describe, expect, it } from 'vitest';
import { buildCharacterMesh } from '../AgentAvatarHair';
import { applyNativeFacialMorph } from '../AgentAvatarMorph';

describe('AgentAvatarMorph expression controls', () => {
  it('closes native eyelid shells and applies asymmetric brow raise deterministically', () => {
    const built = buildCharacterMesh({
      entityId: 'h3w-expression',
      faceTopology: 'neutral-anatomical-v2',
      orbitalProfile: 'recessed-lids-v1',
      facialDetailProfile: 'portrait-silhouette-v2',
      includeHair: false,
      includeEyes: true,
    });
    const weights = {
      blink_left: 0.72,
      blink_right: 0.18,
      brow_raise_right: 0.44,
      smile: 0.26,
      jaw_open: 0.08,
    };
    const apply = () =>
      applyNativeFacialMorph(
        built.mesh.positions,
        built.mesh.jointIndices,
        {
          bodyVertexRange: built.bodyVertexRange,
          eyeVertexRange: built.eyeVertexRange,
          orbitalVertexRange: built.orbital?.vertexRange,
          topology: 'neutral-anatomical-v2',
        },
        weights
      );
    const first = apply();
    const second = apply();
    expect(first.receipt).toMatchObject({
      schemaVersion: 'holoscript.native-facial-morph.v2',
      topology: 'neutral-anatomical-v2',
      appliedTargets: [
        { target: 'blink_left', weight: 0.72 },
        { target: 'blink_right', weight: 0.18 },
        { target: 'brow_raise_right', weight: 0.44 },
        { target: 'smile', weight: 0.26 },
        { target: 'jaw_open', weight: 0.08 },
      ],
      ignoredTargets: [],
    });
    expect(first.receipt.changedVertexCount).toBeGreaterThan(built.eyeVertexRange.vertexCount);
    expect(first.receipt.positionDigest).toBe(second.receipt.positionDigest);
    expect(Array.from(first.positions)).toEqual(Array.from(second.positions));
  });

  it('recomputes only expression-adjacent normals for the opt-in H3X policy', () => {
    const built = buildCharacterMesh({
      entityId: 'h3x-expression-normals',
      faceTopology: 'neutral-anatomical-v2',
      faceRadialSegments: 44,
      faceVerticalSegments: 30,
      orbitalProfile: 'recessed-lids-v1',
      facialDetailProfile: 'portrait-cranial-v3',
      upperBodyProfile: 'coherent-expressive-anatomy-v7',
      upperBodyRadialSegments: 24,
      includeHair: false,
      includeEyes: true,
    });
    const apply = () =>
      applyNativeFacialMorph(
        built.mesh.positions,
        built.mesh.jointIndices,
        {
          bodyVertexRange: built.bodyVertexRange,
          eyeVertexRange: built.eyeVertexRange,
          orbitalVertexRange: built.orbital?.vertexRange,
          topology: 'neutral-anatomical-v2',
          baseNormals: built.mesh.normals,
          indices: built.mesh.indices,
          normalPolicy: 'recompute-affected-v1',
        },
        {
          blink_left: 0.72,
          blink_right: 0.18,
          brow_raise_right: 0.44,
          smile: 0.26,
          jaw_open: 0.08,
        }
      );

    const first = apply();
    const second = apply();
    expect(first.receipt).toMatchObject({
      schemaVersion: 'holoscript.native-facial-morph.v3',
      normalsRecomputed: true,
      normalPolicy: 'recompute-affected-v1',
    });
    expect(first.receipt.normalAffectedVertexCount).toBeGreaterThan(
      first.receipt.changedVertexCount
    );
    expect(first.receipt.normalTriangleCount).toBeGreaterThan(0);
    expect(first.receipt.normalDigest).toBe(second.receipt.normalDigest);
    expect(first.normals).toBeDefined();
    expect(Array.from(first.normals!)).not.toEqual(Array.from(built.mesh.normals));
    expect(Array.from(first.normals!)).toEqual(Array.from(second.normals!));
  });
});
