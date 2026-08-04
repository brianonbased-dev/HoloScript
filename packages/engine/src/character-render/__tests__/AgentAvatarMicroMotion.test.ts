import { describe, expect, it } from 'vitest';
import { HUMANOID_BONE_NAMES } from '../../character/HumanoidSkeleton';
import {
  applyNativeCharacterMicroMotion,
  deriveCharacterMicroMotionConfig,
  sampleCharacterMicroMotion,
} from '../AgentAvatarMicroMotion';

describe('absolute-time character micro-motion', () => {
  it('replays byte-identical samples without prior-frame state', () => {
    const config = deriveCharacterMicroMotionConfig({
      seed: 'openai',
      blinkIntervalSeconds: 3.8,
      breathRateHz: 0.24,
    });
    const first = sampleCharacterMicroMotion(config, 17.25);
    const replay = sampleCharacterMicroMotion(config, 17.25);

    expect(replay).toEqual(first);
    expect(first.absoluteTime).toBe(true);
    expect(first.sampleDigest).toMatch(/^fnv1a32:[0-9a-f]{8}$/);
    expect(first.gaze.nativeTransformApplied).toBe(false);
    expect(first.breath.nativeTransformApplied).toBe(false);
    expect(first.cloth.nativeSimulationApplied).toBe(false);
  });

  it('stagger-seeds residents and emits a bounded real blink window', () => {
    const openai = deriveCharacterMicroMotionConfig({ seed: 'openai' });
    const claude = deriveCharacterMicroMotionConfig({ seed: 'claude' });
    const openaiAtTwo = sampleCharacterMicroMotion(openai, 2);
    const claudeAtTwo = sampleCharacterMicroMotion(claude, 2);
    const activeBlink = Array.from({ length: 1_201 }, (_, index) =>
      sampleCharacterMicroMotion(openai, index / 120)
    ).find((sample) => sample.blink.weight > 0.95);

    expect(openai.configDigest).not.toBe(claude.configDigest);
    expect(openaiAtTwo.sampleDigest).not.toBe(claudeAtTwo.sampleDigest);
    expect(activeBlink?.blink.active).toBe(true);
    expect(activeBlink?.blink.weight).toBeLessThanOrEqual(1);
    expect(openaiAtTwo.breath.scale).toBeGreaterThanOrEqual(1 - openai.breathAmplitude);
    expect(openaiAtTwo.breath.scale).toBeLessThanOrEqual(1 + openai.breathAmplitude);
  });

  it('clamps author controls and rejects a non-finite clock', () => {
    const config = deriveCharacterMicroMotionConfig({
      seed: 'bounded',
      blinkIntervalSeconds: 0,
      blinkDurationSeconds: 9,
      breathAmplitude: 2,
      clothRate: -4,
    });

    expect(config).toMatchObject({
      blinkIntervalSeconds: 1.5,
      blinkDurationSeconds: 0.375,
      breathAmplitude: 0.04,
      clothRate: 0,
    });
    expect(() => sampleCharacterMicroMotion(config, Number.NaN)).toThrow(/must be finite/);
  });

  it('rotates ocular vertices and expands only spine-bound chest vertices without drift', () => {
    const basePositions = new Float32Array([
      -1.1, 1.1, 1, -0.9, 1.1, 1, -1, 0.9, 1.1, 0.9, 1.1, 1, 1.1, 1.1, 1, 1, 0.9, 1.1, -0.4, 0.5,
      0.2, 0.4, 0.5, 0.2, -0.45, 0.8, 0.25, 0.45, 0.8, 0.25, 0, 1.8, 0,
    ]);
    const baseNormals = new Float32Array(
      Array.from({ length: basePositions.length / 3 }, () => [0, 0, 1]).flat()
    );
    const spine1 = HUMANOID_BONE_NAMES.indexOf('spine1');
    const head = HUMANOID_BONE_NAMES.indexOf('head');
    const jointIndices = new Uint32Array([
      head,
      head,
      head,
      head,
      head,
      head,
      spine1,
      spine1,
      spine1,
      spine1,
      head,
    ]);
    const sampled = sampleCharacterMicroMotion(
      deriveCharacterMicroMotionConfig({ seed: 'native-bindings' }),
      2.75
    );
    const sample = {
      ...sampled,
      gaze: {
        ...sampled.gaze,
        yawRadians: 0.1,
        pitchRadians: -0.05,
      },
      breath: {
        ...sampled.breath,
        scale: 1.03,
      },
    };
    const geometry = {
      eyeVertexRange: { vertexStart: 0, vertexCount: 6 },
      jointIndices,
    };

    const first = applyNativeCharacterMicroMotion(basePositions, baseNormals, geometry, sample);
    const replay = applyNativeCharacterMicroMotion(basePositions, baseNormals, geometry, sample);

    expect(first.receipt).toMatchObject({
      schemaVersion: 'holoscript.native-character-micro-motion.v1',
      nativeGazeApplied: true,
      nativeBreathApplied: true,
      gazeChangedVertexCount: 6,
      breathChangedVertexCount: 4,
    });
    expect(first.positions).toEqual(replay.positions);
    expect(first.normals).toEqual(replay.normals);
    expect(first.receipt.positionDigest).toBe(replay.receipt.positionDigest);
    expect(first.receipt.normalDigest).toBe(replay.receipt.normalDigest);
    expect(Array.from(first.positions.slice(30, 33))).toEqual(
      Array.from(basePositions.slice(30, 33))
    );

    const reset = applyNativeCharacterMicroMotion(basePositions, baseNormals, geometry, {
      ...sample,
      gaze: { ...sample.gaze, yawRadians: 0, pitchRadians: 0 },
      breath: { ...sample.breath, scale: 1 },
    });
    expect(reset.receipt.changedVertexCount).toBe(0);
    expect(reset.positions).toEqual(basePositions);
    expect(reset.normals).toEqual(baseNormals);
  });
});
