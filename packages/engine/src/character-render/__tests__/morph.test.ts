/**
 * Native facial morph tests — real vertex deformation, deterministic replay, honest negatives.
 */
import { describe, expect, it } from 'vitest';
import { CharacterHost } from '../CharacterHost';
import {
  deriveCharacterMicroMotionConfig,
  sampleCharacterMicroMotion,
} from '../AgentAvatarMicroMotion';

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

  it('layers deterministic blink over authored expression without losing the baseline', () => {
    const host = new CharacterHost({
      entityId: 'micro-motion-morph',
      faceTopology: 'neutral-anatomical-v2',
    });
    const baseline = host.applyMorphWeights({ smile: 0.45 });
    const config = deriveCharacterMicroMotionConfig({
      seed: 'micro-motion-morph',
      saccadeYawRadians: 0,
      saccadePitchRadians: 0,
      breathAmplitude: 0,
    });
    const samples = Array.from({ length: 1_201 }, (_, index) =>
      sampleCharacterMicroMotion(config, index / 120)
    );
    const blink = samples.find((sample) => sample.blink.weight > 0.95)!;
    const idle = samples.find((sample) => sample.blink.weight === 0)!;
    const applied = host.applyMicroMotionSample(blink);
    const restored = host.applyMicroMotionSample(idle);

    expect(applied.nativeBlinkApplied).toBe(true);
    expect(applied.changedVertexCount).toBeGreaterThan(baseline.changedVertexCount);
    expect(applied.positionDigest).not.toBe(baseline.positionDigest);
    expect(restored.facialChangedVertexCount).toBe(baseline.changedVertexCount);
    expect(restored.positionDigest).toBe(baseline.positionDigest);
  });

  it('applies native gaze and upper-chest breathing as absolute drift-free deformation', () => {
    const host = new CharacterHost({
      entityId: 'native-gaze-breathing',
      faceTopology: 'neutral-anatomical-v2',
      faceRadialSegments: 44,
      faceVerticalSegments: 30,
      upperBodyProfile: 'coherent-expressive-anatomy-v7',
    });
    host.applyMorphWeights({ smile: 0.32 });
    const baselinePositions = new Float32Array(host.getDrawSpec().mesh.positions);
    const baselineNormals = new Float32Array(host.getDrawSpec().mesh.normals);
    const sampled = sampleCharacterMicroMotion(
      deriveCharacterMicroMotionConfig({ seed: 'native-gaze-breathing' }),
      3.25
    );
    const active = {
      ...sampled,
      blink: { ...sampled.blink, weight: 0 },
      gaze: { ...sampled.gaze, yawRadians: 0.1, pitchRadians: -0.05 },
      breath: { ...sampled.breath, scale: 1.03 },
    };

    const first = host.applyMicroMotionSample(active);
    const firstPositions = new Float32Array(host.getDrawSpec().mesh.positions);
    const firstNormals = new Float32Array(host.getDrawSpec().mesh.normals);
    const replay = host.applyMicroMotionSample(active);

    expect(first).toMatchObject({
      schemaVersion: 'holoscript.character-micro-motion-application.v2',
      nativeBlinkApplied: true,
      nativeGazeApplied: true,
      nativeBreathApplied: true,
      gazeYawRadians: 0.1,
      gazePitchRadians: -0.05,
      breathScale: 1.03,
    });
    expect(first.gazeChangedVertexCount).toBeGreaterThan(0);
    expect(first.breathChangedVertexCount).toBeGreaterThan(0);
    expect(first.positionDigest).toMatch(/^fnv1a32:[0-9a-f]{8}$/);
    expect(first.normalDigest).toMatch(/^fnv1a32:[0-9a-f]{8}$/);
    expect(replay.positionDigest).toBe(first.positionDigest);
    expect(replay.normalDigest).toBe(first.normalDigest);
    expect(host.getDrawSpec().mesh.positions).toEqual(firstPositions);
    expect(host.getDrawSpec().mesh.normals).toEqual(firstNormals);

    const reset = host.applyMicroMotionSample({
      ...active,
      gaze: { ...active.gaze, yawRadians: 0, pitchRadians: 0 },
      breath: { ...active.breath, scale: 1 },
    });
    expect(reset.gazeChangedVertexCount).toBe(0);
    expect(reset.breathChangedVertexCount).toBe(0);
    expect(host.getDrawSpec().mesh.positions).toEqual(baselinePositions);
    expect(host.getDrawSpec().mesh.normals).toEqual(baselineNormals);
  });
});
