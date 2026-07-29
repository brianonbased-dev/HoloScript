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
});
