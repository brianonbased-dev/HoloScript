import { describe, expect, it } from 'vitest';
import {
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
});
