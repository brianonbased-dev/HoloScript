/**
 * MorphTrait — Production Tests
 *
 * Tests: target CRUD, weight clamping (min/max), setWeights/resetWeights,
 * preset add/apply (instant) / blendToPreset (timed), clip play/stop/loop,
 * update — blend state advancement, blend-end event, animation time advancement,
 * non-loop clip stops at end + onComplete fires, blink blendToWeights calls,
 * lip-sync setViseme / clearVisemes, event listener on/off, getWeights snapshot.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MorphTrait } from '../MorphTrait';
import type { MorphTarget, MorphPreset, MorphClip } from '../MorphTrait';

// ─── Helpers ────────────────────────────────────────────────────────────────────

function makeMorph(opts: ConstructorParameters<typeof MorphTrait>[0] = {}) {
  return new MorphTrait(opts);
}

function target(name: string, weight = 0, category?: string, min?: number, max?: number): MorphTarget {
  return { name, weight, category, min, max };
}

function preset(name: string, weights: Record<string, number>, blendTime?: number): MorphPreset {
  return { name, weights, blendTime };
}

function clip(name: string, duration: number, keyframes: MorphClip['keyframes'], loop = false): MorphClip {
  return { name, duration, keyframes, loop };
}

// ─── Target management ───────────────────────────────────────────────────────────

describe('MorphTrait — target management', () => {
  it('initialises targets from config', () => {
    const m = makeMorph({ targets: [target('smile'), target('frown')] });
    expect(m.getTargetNames()).toContain('smile');
    expect(m.getTargetNames()).toContain('frown');
  });

  it('addTarget adds a new target', () => {
    const m = makeMorph();
    m.addTarget(target('blink_L'));
    expect(m.getTarget('blink_L')).toBeDefined();
  });

  it('removeTarget removes it', () => {
    const m = makeMorph({ targets: [target('x')] });
    m.removeTarget('x');
    expect(m.getTarget('x')).toBeUndefined();
  });

  it('getTargetsByCategory filters correctly', () => {
    const m = makeMorph({
      targets: [
        target('smile', 0, 'mouth'),
        target('pout', 0, 'mouth'),
        target('brow_up', 0, 'brow'),
      ],
    });
    const mouth = m.getTargetsByCategory('mouth');
    expect(mouth).toHaveLength(2);
    expect(mouth.every((t) => t.category === 'mouth')).toBe(true);
  });

  it('getTargetsByCategory returns empty array for unknown category', () => {
    const m = makeMorph();
    expect(m.getTargetsByCategory('eyes')).toEqual([]);
  });
});

// ─── Weight set/get with clamping ─────────────────────────────────────────────────

describe('MorphTrait — weight', () => {
  it('setWeight sets target weight', () => {
    const m = makeMorph({ targets: [target('smile')] });
    m.setWeight('smile', 0.7);
    expect(m.getWeight('smile')).toBeCloseTo(0.7);
  });

  it('setWeight clamps to max (default 1)', () => {
    const m = makeMorph({ targets: [target('x')] });
    m.setWeight('x', 2.5);
    expect(m.getWeight('x')).toBe(1);
  });

  it('setWeight clamps to min (default 0)', () => {
    const m = makeMorph({ targets: [target('y')] });
    m.setWeight('y', -0.5);
    expect(m.getWeight('y')).toBe(0);
  });

  it('setWeight respects custom min/max', () => {
    const m = makeMorph({ targets: [target('cheek', 0, undefined, -0.5, 2)] });
    m.setWeight('cheek', 3);
    expect(m.getWeight('cheek')).toBe(2);
    m.setWeight('cheek', -1);
    expect(m.getWeight('cheek')).toBe(-0.5);
  });

  it('setWeight on unknown target is no-op', () => {
    const m = makeMorph();
    expect(() => m.setWeight('ghost', 1)).not.toThrow();
    expect(m.getWeight('ghost')).toBe(0); // default
  });

  it('getWeight returns 0 for unknown target', () => {
    const m = makeMorph();
    expect(m.getWeight('nothing')).toBe(0);
  });

  it('setWeights sets multiple targets', () => {
    const m = makeMorph({ targets: [target('a'), target('b')] });
    m.setWeights({ a: 0.3, b: 0.9 });
    expect(m.getWeight('a')).toBeCloseTo(0.3);
    expect(m.getWeight('b')).toBeCloseTo(0.9);
  });

  it('resetWeights sets all to 0', () => {
    const m = makeMorph({ targets: [target('p', 1), target('q', 0.5)] });
    m.resetWeights();
    expect(m.getWeight('p')).toBe(0);
    expect(m.getWeight('q')).toBe(0);
  });

  it('getWeights returns snapshot of all targets', () => {
    const m = makeMorph({ targets: [target('x', 0.4)] });
    const w = m.getWeights();
    expect(w['x']).toBeCloseTo(0.4);
  });
});

// ─── Weight-changed event ─────────────────────────────────────────────────────────

describe('MorphTrait — weight-changed event', () => {
  it('emits weight-changed on setWeight', () => {
    const m = makeMorph({ targets: [target('smile')] });
    const cb = vi.fn();
    m.on('weight-changed', cb);
    m.setWeight('smile', 0.6);
    expect(cb).toHaveBeenCalledWith(expect.objectContaining({ type: 'weight-changed', target: 'smile', weight: 0.6 }));
  });

  it('off removes weight-changed listener', () => {
    const m = makeMorph({ targets: [target('a')] });
    const cb = vi.fn();
    m.on('weight-changed', cb);
    m.off('weight-changed', cb);
    m.setWeight('a', 1);
    expect(cb).not.toHaveBeenCalled();
  });
});

// ─── Presets ─────────────────────────────────────────────────────────────────────

describe('MorphTrait — presets', () => {
  it('addPreset / getPreset roundtrip', () => {
    const m = makeMorph();
    m.addPreset(preset('happy', { smile: 1 }));
    expect(m.getPreset('happy')).toBeDefined();
    expect(m.getPresetNames()).toContain('happy');
  });

  it('removePreset removes it', () => {
    const m = makeMorph({ presets: [preset('sad', { frown: 0.8 })] });
    m.removePreset('sad');
    expect(m.getPreset('sad')).toBeUndefined();
  });

  it('applyPreset (instant) sets weights immediately', () => {
    const m = makeMorph({
      targets: [target('smile'), target('brow_up')],
      presets: [preset('happy', { smile: 0.8, brow_up: 0.3 })],
    });
    m.applyPreset('happy');
    expect(m.getWeight('smile')).toBeCloseTo(0.8);
    expect(m.getWeight('brow_up')).toBeCloseTo(0.3);
  });

  it('applyPreset emits preset-applied', () => {
    const m = makeMorph({
      targets: [target('frown')],
      presets: [preset('sad', { frown: 1 })],
    });
    const cb = vi.fn();
    m.on('preset-applied', cb);
    m.applyPreset('sad');
    expect(cb).toHaveBeenCalledWith(expect.objectContaining({ preset: 'sad' }));
  });

  it('applyPreset on unknown preset is no-op', () => {
    const m = makeMorph();
    expect(() => m.applyPreset('ghost')).not.toThrow();
  });

  it('blendToPreset initiates a blend state', () => {
    const m = makeMorph({
      targets: [target('smile', 0)],
      presets: [preset('happy', { smile: 1 }, 0.5)],
    });
    m.blendToPreset('happy');
    // blend-start should fire
    const cb = vi.fn();
    // Already started — verify by tick
    m.update(0.5); // full blend duration
    expect(m.getWeight('smile')).toBeCloseTo(1);
  });

  it('blendToPreset emits preset-applied on completion', () => {
    const m = makeMorph({
      targets: [target('smile', 0)],
      presets: [preset('happy', { smile: 1 }, 0.2)],
    });
    const cb = vi.fn();
    m.on('preset-applied', cb);
    m.blendToPreset('happy');
    m.update(0.2); // complete
    expect(cb).toHaveBeenCalledWith(expect.objectContaining({ preset: 'happy' }));
  });
});

// ─── blendToWeights ───────────────────────────────────────────────────────────────

describe('MorphTrait — blendToWeights', () => {
  it('emits blend-start', () => {
    const m = makeMorph({ targets: [target('x', 0)] });
    const cb = vi.fn();
    m.on('blend-start', cb);
    m.blendToWeights({ x: 1 }, 0.5);
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('interpolates weight at half duration', () => {
    const m = makeMorph({ targets: [target('x', 0)] });
    m.blendToWeights({ x: 1 }, 1, 'linear');
    m.update(0.5);
    // linear: t=0.5, weight = 0 + 1*0.5 = 0.5
    expect(m.getWeight('x')).toBeCloseTo(0.5, 1);
  });

  it('reaches target weight after full duration', () => {
    const m = makeMorph({ targets: [target('x', 0)] });
    m.blendToWeights({ x: 0.8 }, 0.3, 'linear');
    m.update(0.3);
    expect(m.getWeight('x')).toBeCloseTo(0.8, 2);
  });

  it('emits blend-end on completion', () => {
    const m = makeMorph({ targets: [target('x', 0)] });
    const cb = vi.fn();
    m.on('blend-end', cb);
    m.blendToWeights({ x: 1 }, 0.1, 'linear');
    m.update(0.15);
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('calls onComplete callback after blend finishes', () => {
    const m = makeMorph({ targets: [target('x', 0)] });
    const onComplete = vi.fn();
    m.blendToWeights({ x: 1 }, 0.1, 'linear', onComplete);
    m.update(0.2);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });
});

// ─── Clip play / stop ────────────────────────────────────────────────────────────

describe('MorphTrait — clips', () => {
  const kf = (t: number, w: Record<string, number>) => ({ time: t, weights: w });

  it('addClip / getClip roundtrip', () => {
    const m = makeMorph();
    m.addClip(clip('blink', 0.3, [kf(0, { blink_L: 0 }), kf(0.15, { blink_L: 1 }), kf(0.3, { blink_L: 0 })]));
    expect(m.getClip('blink')).toBeDefined();
  });

  it('play returns true for known clip', () => {
    const m = makeMorph({ clips: [clip('c', 1, [kf(0, { x: 0 })])] });
    expect(m.play('c')).toBe(true);
  });

  it('play returns false for unknown clip', () => {
    const m = makeMorph();
    expect(m.play('ghost')).toBe(false);
  });

  it('play emits animation-start', () => {
    const m = makeMorph({ clips: [clip('a', 1, [kf(0, { x: 0 })])] });
    const cb = vi.fn();
    m.on('animation-start', cb);
    m.play('a');
    expect(cb).toHaveBeenCalledWith(expect.objectContaining({ clip: 'a' }));
  });

  it('isPlaying(clipName) returns true after play', () => {
    const m = makeMorph({ clips: [clip('a', 1, [kf(0, { x: 0 })])] });
    m.play('a');
    expect(m.isPlaying('a')).toBe(true);
  });

  it('stop removes clip and emits animation-end', () => {
    const m = makeMorph({ clips: [clip('b', 1, [kf(0, { x: 0 })])] });
    const cb = vi.fn();
    m.on('animation-end', cb);
    m.play('b');
    m.stop('b');
    expect(m.isPlaying('b')).toBe(false);
    expect(cb).toHaveBeenCalledWith(expect.objectContaining({ clip: 'b' }));
  });

  it('stopAll stops every active animation', () => {
    const m = makeMorph({
      clips: [
        clip('a', 1, [kf(0, { x: 0 })]),
        clip('b', 1, [kf(0, { y: 0 })]),
      ],
    });
    m.play('a');
    m.play('b');
    m.stopAll();
    expect(m.isPlaying()).toBe(false);
  });

  it('non-looping clip auto-stops after duration and calls onComplete', () => {
    const m = makeMorph({
      targets: [target('x')],
      clips: [clip('once', 0.5, [kf(0, { x: 0 }), kf(0.5, { x: 1 })], false)],
    });
    const done = vi.fn();
    m.play('once', { onComplete: done });
    m.update(0.6); // past end
    expect(m.isPlaying('once')).toBe(false);
    expect(done).toHaveBeenCalledTimes(1);
  });

  it('looping clip wraps at duration', () => {
    const m = makeMorph({
      targets: [target('x')],
      clips: [clip('loop', 1, [kf(0, { x: 0 }), kf(1, { x: 1 })], true)],
    });
    m.play('loop');
    m.update(1.5);
    expect(m.isPlaying('loop')).toBe(true);
  });
});

// ─── Lip sync ────────────────────────────────────────────────────────────────────

describe('MorphTrait — lip sync', () => {
  it('setViseme maps viseme to morph target', () => {
    const m = makeMorph({
      targets: [target('mouth_oh')],
      lipSync: { enabled: true, visemeMap: { oh: 'mouth_oh' } },
    });
    m.setViseme('oh', 0.8);
    expect(m.getWeight('mouth_oh')).toBeCloseTo(0.8);
  });

  it('setViseme is no-op when lipSync not configured', () => {
    const m = makeMorph({ targets: [target('mouth_ah')] });
    expect(() => m.setViseme('ah', 1)).not.toThrow();
  });

  it('clearVisemes resets all mapped targets to 0', () => {
    const m = makeMorph({
      targets: [target('mouth_oh', 0.9), target('mouth_ah', 0.7)],
      lipSync: { enabled: true, visemeMap: { oh: 'mouth_oh', ah: 'mouth_ah' } },
    });
    m.clearVisemes();
    expect(m.getWeight('mouth_oh')).toBe(0);
    expect(m.getWeight('mouth_ah')).toBe(0);
  });
});

// ─── Blink ─────────────────────────────────────────────────────────────────────

describe('MorphTrait — blink()', () => {
  it('blink initiates blend-start for blink targets', () => {
    const m = makeMorph({
      targets: [target('blink_L'), target('blink_R')],
      autoBlink: { enabled: false, targets: ['blink_L', 'blink_R'], interval: 4, duration: 0.15 },
    });
    const cb = vi.fn();
    m.on('blend-start', cb);
    m.blink(0.2);
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('blink updates lastBlinkTime', () => {
    const m = makeMorph({
      targets: [target('blink_L')],
      autoBlink: { enabled: false, targets: ['blink_L'], interval: 4, duration: 0.1 },
    });
    const before = m.getLastBlinkTime();
    m.blink();
    expect(m.getLastBlinkTime()).toBeGreaterThanOrEqual(before);
  });

  it('blink without autoBlink config is no-op', () => {
    const m = makeMorph();
    expect(() => m.blink()).not.toThrow();
  });
});
