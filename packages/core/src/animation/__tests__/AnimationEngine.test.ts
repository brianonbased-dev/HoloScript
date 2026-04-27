import { describe, it, expect, beforeEach } from 'vitest';
import {
  AnimationEngine,
  Easing,
} from '../AnimationEngine.js';
import type { AnimClip } from '../AnimationEngine.js';

// ─── Easing functions ────────────────────────────────────────────────────────

describe('Easing', () => {
  describe('linear', () => {
    it('returns t unchanged', () => {
      expect(Easing.linear(0)).toBe(0);
      expect(Easing.linear(0.5)).toBe(0.5);
      expect(Easing.linear(1)).toBe(1);
    });
  });

  describe('easeInQuad', () => {
    it('returns t*t', () => {
      expect(Easing.easeInQuad(0)).toBe(0);
      expect(Easing.easeInQuad(0.5)).toBeCloseTo(0.25);
      expect(Easing.easeInQuad(1)).toBe(1);
    });
  });

  describe('easeOutQuad', () => {
    it('returns 1-(1-t)^2', () => {
      expect(Easing.easeOutQuad(0)).toBe(0);
      expect(Easing.easeOutQuad(0.5)).toBeCloseTo(0.75);
      expect(Easing.easeOutQuad(1)).toBe(1);
    });
  });

  describe('easeInOutQuad', () => {
    it('is symmetric at 0.5', () => {
      expect(Easing.easeInOutQuad(0)).toBe(0);
      expect(Easing.easeInOutQuad(0.5)).toBe(0.5);
      expect(Easing.easeInOutQuad(1)).toBe(1);
    });
  });

  describe('easeInCubic', () => {
    it('returns t^3', () => {
      expect(Easing.easeInCubic(0)).toBe(0);
      expect(Easing.easeInCubic(0.5)).toBeCloseTo(0.125);
      expect(Easing.easeInCubic(1)).toBe(1);
    });
  });

  describe('easeOutCubic', () => {
    it('eases out correctly', () => {
      expect(Easing.easeOutCubic(0)).toBe(0);
      expect(Easing.easeOutCubic(1)).toBe(1);
    });
  });

  describe('easeInOutCubic', () => {
    it('is symmetric at 0.5', () => {
      expect(Easing.easeInOutCubic(0)).toBe(0);
      expect(Easing.easeInOutCubic(1)).toBe(1);
    });
  });

  describe('easeOutBounce', () => {
    it('reaches 1 at t=1', () => {
      expect(Easing.easeOutBounce(0)).toBe(0);
      expect(Easing.easeOutBounce(1)).toBeCloseTo(1);
    });
  });
});

// ─── AnimationEngine ─────────────────────────────────────────────────────────

const makeClip = (overrides: Partial<AnimClip> = {}): AnimClip => ({
  id: 'anim1',
  property: 'position.x',
  duration: 1,
  loop: false,
  pingPong: false,
  delay: 0,
  keyframes: [
    { time: 0, value: 0 },
    { time: 1, value: 100 },
  ],
  ...overrides,
});

describe('AnimationEngine', () => {
  let engine: AnimationEngine;

  beforeEach(() => {
    engine = new AnimationEngine();
  });

  describe('initial state', () => {
    it('starts with no active clips', () => {
      expect(engine.getActiveIds()).toHaveLength(0);
    });
  });

  describe('play()', () => {
    it('marks clip as active', () => {
      const clip = makeClip();
      engine.play(clip, () => {});
      expect(engine.isActive('anim1')).toBe(true);
    });

    it('calls callback at t=0 on play', () => {
      const values: number[] = [];
      engine.play(makeClip(), (v) => values.push(v));
      expect(values.length).toBeGreaterThan(0);
      expect(values[0]).toBe(0); // value at keyframe time=0
    });

    it('returns id from getActiveIds', () => {
      engine.play(makeClip({ id: 'myAnim' }), () => {});
      expect(engine.getActiveIds()).toContain('myAnim');
    });

    it('does NOT immediately call callback when delay > 0', () => {
      const values: number[] = [];
      engine.play(makeClip({ delay: 0.5 }), (v) => values.push(v));
      expect(values).toHaveLength(0);
    });
  });

  describe('update(dt)', () => {
    it('advances animation time', () => {
      const values: number[] = [];
      engine.play(makeClip(), (v) => values.push(v));
      values.length = 0; // clear initial t=0 call
      engine.update(0.5);
      expect(values.length).toBeGreaterThan(0);
      // At t=0.5 in a 0-to-100 linear clip, value should be near 50
      expect(values[values.length - 1]).toBeCloseTo(50, 0);
    });

    it('fires callback with final value on completion (no loop)', () => {
      const values: number[] = [];
      engine.play(makeClip(), (v) => values.push(v));
      engine.update(1.5); // past duration
      const last = values[values.length - 1];
      expect(last).toBe(100); // final value
    });

    it('removes non-looping clip after completion', () => {
      engine.play(makeClip({ id: 'clip1' }), () => {});
      engine.update(2); // well past duration
      expect(engine.isActive('clip1')).toBe(false);
    });

    it('keeps looping clip active', () => {
      engine.play(makeClip({ id: 'loopClip', loop: true }), () => {});
      engine.update(5);
      expect(engine.isActive('loopClip')).toBe(true);
    });

    it('handles delay correctly', () => {
      const values: number[] = [];
      engine.play(makeClip({ delay: 0.2 }), (v) => values.push(v));
      engine.update(0.1); // still in delay
      expect(values).toHaveLength(0);
      engine.update(0.15); // now past delay (total 0.25s)
      expect(values.length).toBeGreaterThan(0);
    });

    it('handles pingPong clip', () => {
      const values: number[] = [];
      const clip = makeClip({ pingPong: true, duration: 1, loop: true });
      engine.play(clip, (v) => values.push(v));
      values.length = 0;
      engine.update(0.5); // forward half
      const forward = values[values.length - 1];
      values.length = 0;
      engine.update(0.75); // crosses midpoint, goes backward
      const backward = values[values.length - 1];
      expect(forward).toBeGreaterThan(0);
      expect(backward).toBeLessThan(100);
    });

    it('does nothing if no active clips', () => {
      expect(() => engine.update(1)).not.toThrow();
    });
  });

  describe('pause() / resume()', () => {
    it('pausing stops advancement', () => {
      const values: number[] = [];
      engine.play(makeClip(), (v) => values.push(v));
      values.length = 0;
      engine.pause('anim1');
      engine.update(0.5);
      expect(values).toHaveLength(0); // paused, no update
    });

    it('resuming continues from where paused', () => {
      const values: number[] = [];
      engine.play(makeClip(), (v) => values.push(v));
      engine.update(0.3);
      engine.pause('anim1');
      const beforeResume = values[values.length - 1];
      values.length = 0;
      engine.resume('anim1');
      engine.update(0.2);
      expect(values.length).toBeGreaterThan(0);
      expect(values[values.length - 1]).toBeGreaterThanOrEqual(beforeResume);
    });

    it('pausing unknown id does not throw', () => {
      expect(() => engine.pause('nope')).not.toThrow();
    });

    it('resuming unknown id does not throw', () => {
      expect(() => engine.resume('nope')).not.toThrow();
    });
  });

  describe('stop()', () => {
    it('removes clip from active ids', () => {
      engine.play(makeClip({ id: 's1' }), () => {});
      engine.stop('s1');
      expect(engine.isActive('s1')).toBe(false);
      expect(engine.getActiveIds()).not.toContain('s1');
    });

    it('stopping unknown id does not throw', () => {
      expect(() => engine.stop('nope')).not.toThrow();
    });
  });

  describe('isActive()', () => {
    it('returns false for unknown id', () => {
      expect(engine.isActive('unknown')).toBe(false);
    });

    it('returns true for playing clip', () => {
      engine.play(makeClip({ id: 'x' }), () => {});
      expect(engine.isActive('x')).toBe(true);
    });
  });

  describe('clear()', () => {
    it('removes all active clips', () => {
      engine.play(makeClip({ id: 'a' }), () => {});
      engine.play(makeClip({ id: 'b' }), () => {});
      engine.clear();
      expect(engine.getActiveIds()).toHaveLength(0);
    });
  });

  describe('multiple clips', () => {
    it('runs multiple clips simultaneously', () => {
      const valA: number[] = [];
      const valB: number[] = [];
      engine.play(makeClip({ id: 'a', keyframes: [{ time: 0, value: 0 }, { time: 1, value: 10 }] }), (v) => valA.push(v));
      engine.play(makeClip({ id: 'b', keyframes: [{ time: 0, value: 100 }, { time: 1, value: 200 }] }), (v) => valB.push(v));
      valA.length = 0;
      valB.length = 0;
      engine.update(0.5);
      expect(valA.length).toBeGreaterThan(0);
      expect(valB.length).toBeGreaterThan(0);
      expect(engine.getActiveIds()).toContain('a');
      expect(engine.getActiveIds()).toContain('b');
    });
  });
});
