import { describe, it, expect } from 'vitest';
import { IdleBehaviorSystem } from '../IdleBehaviorSystem';

describe('IdleBehaviorSystem', () => {
  it('emits chest breathing signal when chest bone is bound', () => {
    const sys = new IdleBehaviorSystem(
      { chestBone: 'Spine2' },
      { random: () => 0, breathsPerMinute: 12, chestAmplitude: 0.05 }
    );

    const a = sys.update(0.1);
    const b = sys.update(0.1);

    expect(a.boneScale.Spine2).toBeDefined();
    expect(b.boneScale.Spine2).not.toBe(a.boneScale.Spine2);
  });

  it('drives eyelid blink weights over a blink cycle', () => {
    const sys = new IdleBehaviorSystem(
      { eyelidLeft: 'eyeBlinkLeft', eyelidRight: 'eyeBlinkRight' },
      {
        random: () => 0,
        blinkIntervalRangeSec: [0.2, 0.2],
        blinkDurationSec: 0.1,
      }
    );

    // Advance to first scheduled blink.
    sys.update(0.2);
    const peak = sys.update(0.05);
    const settle = sys.update(0.06);

    expect(peak.morphWeights.eyeBlinkLeft).toBeGreaterThan(0);
    expect(peak.morphWeights.eyeBlinkRight).toBeGreaterThan(0);
    expect(settle.morphWeights.eyeBlinkLeft).toBe(0);
    expect(settle.morphWeights.eyeBlinkRight).toBe(0);
  });

  it('produces nostril flare only on inhale phase when bound', () => {
    const sys = new IdleBehaviorSystem(
      { nostrilFlare: 'noseSneer' },
      { random: () => 0, breathsPerMinute: 10 }
    );

    const f1 = sys.update(0.15);
    const f2 = sys.update(0.15);

    expect(f1.morphWeights.noseSneer).toBeGreaterThanOrEqual(0);
    expect(f2.morphWeights.noseSneer).toBeGreaterThanOrEqual(0);
    expect(f1.morphWeights.noseSneer).not.toBe(f2.morphWeights.noseSneer);
  });

  it('emits bounded micro-saccade gaze offsets', () => {
    const sys = new IdleBehaviorSystem(
      {},
      {
        random: () => 1,
        microSaccadeIntervalRangeSec: [0.1, 0.1],
        microSaccadeAmplitude: 0.02,
      }
    );

    const frame = sys.update(0.12);

    expect(frame.gazeOffset.x).toBeLessThanOrEqual(0.02);
    expect(frame.gazeOffset.y).toBeLessThanOrEqual(0.02);
    expect(frame.gazeOffset.x).toBeGreaterThanOrEqual(-0.02);
    expect(frame.gazeOffset.y).toBeGreaterThanOrEqual(-0.02);
  });

  it('returns neutral channels when no armature bindings provided', () => {
    const sys = new IdleBehaviorSystem({}, { random: () => 0.5 });
    const frame = sys.update(0.16);

    expect(Object.keys(frame.boneScale)).toHaveLength(0);
    expect(Object.keys(frame.morphWeights)).toHaveLength(0);
  });
});
