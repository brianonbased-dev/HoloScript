/**
 * AnimationEngine + Easing — Production Test Suite
 *
 * Covers: Easing functions (boundary/mid values), AnimationEngine
 * (play, pause, resume, stop, isActive, getActiveIds, update, clear,
 * onComplete, delay). lerp/lerpVec3/interpolateKeyframes are private —
 * tested indirectly through update output.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { AnimationEngine, Easing } from '../AnimationEngine';
import type { AnimationClip } from '../AnimationEngine';

function makeClip(id: string, duration: number, from = 0, to = 100): AnimationClip {
  return {
    id,
    property: id,
    keyframes: [
      { time: 0, value: from },
      { time: 1, value: to },
    ],
    duration,
    loop: false,
    pingPong: false,
    delay: 0,
  };
}

describe('Easing — Production', () => {
  it.each([
    'linear', 'easeInQuad', 'easeOutQuad', 'easeInOutQuad',
    'easeInCubic', 'easeOutCubic', 'easeInOutCubic',
    'easeInExpo', 'easeOutExpo',
  ] as const)('%s(0) ≈ 0 and (1) ≈ 1', (name) => {
    expect(Easing[name](0)).toBeCloseTo(0, 1);
    expect(Easing[name](1)).toBeCloseTo(1, 1);
  });

  it('easeOutBounce(0)=0, easeOutBounce(1)=1', () => {
    expect(Easing.easeOutBounce(0)).toBeCloseTo(0, 1);
    expect(Easing.easeOutBounce(1)).toBeCloseTo(1, 1);
  });

  it('easeOutBack overshoots past 1 at midpoint', () => {
    expect(Easing.easeOutBack(0.7)).toBeGreaterThan(1);
  });

  it('easeOutElastic returns 1 at t=1', () => {
    expect(Easing.easeOutElastic(1)).toBeCloseTo(1, 1);
  });

  it('linear is monotonically increasing', () => {
    const vals = [0, 0.25, 0.5, 0.75, 1].map(Easing.linear);
    for (let i = 1; i < vals.length; i++) expect(vals[i]).toBeGreaterThan(vals[i - 1]);
  });

  it('easeInOutQuad is symmetric around 0.5', () => {
    const lo = Easing.easeInOutQuad(0.25);
    const hi = Easing.easeInOutQuad(0.75);
    expect(lo + hi).toBeCloseTo(1, 5);
  });
});

describe('AnimationEngine — Production', () => {
  let engine: AnimationEngine;

  beforeEach(() => {
    engine = new AnimationEngine();
  });

  // ─── play ─────────────────────────────────────────────────────────
  it('play makes clip active', () => {
    engine.play(makeClip('x', 1), () => {});
    expect(engine.isActive('x')).toBe(true);
  });

  it('getActiveIds includes played clip', () => {
    engine.play(makeClip('x', 1), () => {});
    expect(engine.getActiveIds()).toContain('x');
  });

  it('multiple clips can be active simultaneously', () => {
    engine.play(makeClip('a', 1), () => {});
    engine.play(makeClip('b', 1), () => {});
    expect(engine.getActiveIds().length).toBe(2);
  });

  // ─── stop ─────────────────────────────────────────────────────────
  it('stop removes clip from active', () => {
    engine.play(makeClip('x', 1), () => {});
    engine.stop('x');
    expect(engine.isActive('x')).toBe(false);
  });

  // ─── pause / resume ───────────────────────────────────────────────
  it('pause suspends setter calls', () => {
    const values: number[] = [];
    engine.play(makeClip('x', 1, 0, 100), (v) => values.push(v));
    engine.pause('x');
    const before = values.length;
    engine.update(0.1);
    engine.update(0.1);
    expect(values.length).toBe(before);
  });

  it('resume restores setter calls', () => {
    const values: number[] = [];
    engine.play(makeClip('x', 1, 0, 100), (v) => values.push(v));
    engine.pause('x');
    engine.resume('x');
    engine.update(0.1);
    expect(values.length).toBeGreaterThan(0);
  });

  // ─── update ───────────────────────────────────────────────────────
  it('update drives setter with interpolated value', () => {
    const values: number[] = [];
    engine.play(makeClip('x', 1, 0, 100), (v) => values.push(v));
    engine.update(0.5);
    expect(values.some(v => v > 0 && v < 100)).toBe(true);
  });

  it('update drives setter near from value at early time', () => {
    const values: number[] = [];
    engine.play(makeClip('x', 1, 25, 75), (v) => values.push(v));
    engine.update(0.001);
    expect(values[0]).toBeCloseTo(25, 0);
  });

  it('clip is removed after completing', () => {
    engine.play(makeClip('x', 0.1), () => {});
    for (let i = 0; i < 20; i++) engine.update(0.1);
    expect(engine.isActive('x')).toBe(false);
  });

  it('onComplete fires when clip ends', () => {
    let fired = false;
    const clip = { ...makeClip('x', 0.1), onComplete: () => { fired = true; } };
    engine.play(clip, () => {});
    for (let i = 0; i < 20; i++) engine.update(0.1);
    expect(fired).toBe(true);
  });

  // ─── delay ────────────────────────────────────────────────────────
  it('delay defers setter calls until delay elapsed', () => {
    const values: number[] = [];
    const clip = { ...makeClip('x', 1, 0, 100), delay: 0.5 };
    engine.play(clip, (v) => values.push(v));
    engine.update(0.3); // still in delay
    expect(values.length).toBe(0);
    engine.update(0.3); // past delay
    expect(values.length).toBeGreaterThan(0);
  });

  // ─── clear ────────────────────────────────────────────────────────
  it('clear removes all active clips', () => {
    engine.play(makeClip('a', 1), () => {});
    engine.play(makeClip('b', 1), () => {});
    engine.clear();
    expect(engine.getActiveIds().length).toBe(0);
  });
});
