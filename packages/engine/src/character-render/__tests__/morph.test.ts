/**
 * Native facial morph tests — real vertex deformation, deterministic replay, honest negatives.
 */
import { describe, expect, it } from 'vitest';
import { CharacterHost } from '../CharacterHost';

describe('native procedural-head morph channel', () => {
  it('applies FACS/viseme aliases to mesh vertices with a deterministic receipt', () => {
    const host = new CharacterHost({ entityId: 'morph-proof', hairStyle: 'short' });
    const neutral = Array.from(host.getDrawSpec().mesh.positions);
    const weights = {
      eyeBlinkLeft: 0.8,
      AU12: 0.65,
      AU26: 0.4,
      viseme_oh: 0.35,
      unsupportedBrowSqueeze: 0.5,
    };

    const first = host.applyMorphWeights(weights);
    const deformed = Array.from(host.getDrawSpec().mesh.positions);
    const replay = host.applyMorphWeights(weights);

    expect(first.appliedTargets.map(({ target }) => target)).toEqual([
      'blink_left',
      'smile',
      'jaw_open',
      'viseme_oh',
    ]);
    expect(first.ignoredTargets).toEqual(['unsupportedBrowSqueeze']);
    expect(first.changedVertexCount).toBeGreaterThan(0);
    expect(deformed).not.toEqual(neutral);
    expect(replay.positionDigest).toBe(first.positionDigest);
    expect(Array.from(host.getDrawSpec().mesh.positions)).toEqual(deformed);
    expect(first.normalsRecomputed).toBe(false);
  });

  it('treats weights as absolute and returns exactly to neutral at zero', () => {
    const host = new CharacterHost({ entityId: 'morph-neutral-proof' });
    const neutral = Array.from(host.getDrawSpec().mesh.positions);
    host.applyMorphWeights({ blink: 1, smile: 1, jawOpen: 1 });
    const reset = host.applyMorphWeights({ blink: 0, smile: 0, jawOpen: 0 });

    expect(reset.changedVertexCount).toBe(0);
    expect(Array.from(host.getDrawSpec().mesh.positions)).toEqual(neutral);
  });

  it('restores neutral normals when an H3X expression is reset to zero', () => {
    const host = new CharacterHost({
      entityId: 'h3x-normal-reset',
      faceTopology: 'neutral-anatomical-v2',
      facialDetailProfile: 'portrait-cranial-v3',
      faceRadialSegments: 44,
      faceVerticalSegments: 30,
      upperBodyProfile: 'coherent-expressive-anatomy-v7',
      expressionNormalPolicy: 'recompute-affected-v1',
    });
    const neutralNormals = Array.from(host.getDrawSpec().mesh.normals);
    const expressive = host.applyMorphWeights({ smile: 0.8, jaw_open: 0.35 });
    expect(expressive.normalsRecomputed).toBe(true);
    expect(Array.from(host.getDrawSpec().mesh.normals)).not.toEqual(neutralNormals);

    const reset = host.applyMorphWeights({ smile: 0, jaw_open: 0 });
    expect(reset.normalsRecomputed).toBe(true);
    expect(Array.from(host.getDrawSpec().mesh.normals)).toEqual(neutralNormals);
  });
});
