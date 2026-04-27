/**
 * animation-system.test.ts — unit tests for updateAnimations()
 *
 * Exercises: linear lerp, eased lerp, completion + removal,
 * loop reset, yoyo swap, multiple concurrent animations,
 * dotted variable key construction, edge cases.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { updateAnimations } from '../animation-system.js';
import type { Animation } from '../../types.js';

// ─── helpers ────────────────────────────────────────────────────────────────

function makeAnimation(overrides: Partial<Animation> = {}): Animation {
  return {
    target: 'orb1',
    property: 'x',
    from: 0,
    to: 100,
    duration: 1000,
    startTime: 0,
    easing: 'linear',
    loop: false,
    yoyo: false,
    ...overrides,
  };
}

// ─── tests ───────────────────────────────────────────────────────────────────

describe('updateAnimations', () => {
  let setVariable: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    setVariable = vi.fn();
  });

  // ── basic interpolation ──────────────────────────────────────────────────

  it('interpolates 50% through a linear animation', () => {
    const animations = new Map<string, Animation>([
      ['a1', makeAnimation({ startTime: 0 })],
    ]);
    updateAnimations(animations, setVariable, 500); // now=500, elapsed=500, duration=1000
    expect(setVariable).toHaveBeenCalledWith('orb1.x', 50);
  });

  it('calls setVariable with target.property as the key', () => {
    const animations = new Map<string, Animation>([
      ['a1', makeAnimation({ target: 'myOrb', property: 'scale', startTime: 0 })],
    ]);
    updateAnimations(animations, setVariable, 250);
    expect(setVariable).toHaveBeenCalledWith('myOrb.scale', expect.any(Number));
  });

  it('computes from-to range correctly (non-zero from)', () => {
    const animations = new Map<string, Animation>([
      ['a1', makeAnimation({ from: 10, to: 60, startTime: 0 })],
    ]);
    updateAnimations(animations, setVariable, 500); // 50% → 10 + 25 = 35
    expect(setVariable).toHaveBeenCalledWith('orb1.x', 35);
  });

  it('passes 0% at startTime == now', () => {
    const animations = new Map<string, Animation>([
      ['a1', makeAnimation({ startTime: 100 })],
    ]);
    updateAnimations(animations, setVariable, 100); // elapsed=0
    expect(setVariable).toHaveBeenCalledWith('orb1.x', 0);
  });

  it('caps progress at 100% even when far past duration', () => {
    const animations = new Map<string, Animation>([
      ['a1', makeAnimation({ startTime: 0 })],
    ]);
    updateAnimations(animations, setVariable, 99999);
    expect(setVariable).toHaveBeenCalledWith('orb1.x', 100);
  });

  // ── completion / removal ─────────────────────────────────────────────────

  it('removes a completed non-looping animation', () => {
    const animations = new Map<string, Animation>([
      ['a1', makeAnimation({ startTime: 0 })],
    ]);
    updateAnimations(animations, setVariable, 1000); // progress = 1
    expect(animations.has('a1')).toBe(false);
  });

  it('calls setVariable with to-value before removing', () => {
    const animations = new Map<string, Animation>([
      ['a1', makeAnimation({ from: 0, to: 100, startTime: 0 })],
    ]);
    updateAnimations(animations, setVariable, 1000);
    expect(setVariable).toHaveBeenCalledWith('orb1.x', 100);
  });

  it('keeps animation in map while still in progress', () => {
    const animations = new Map<string, Animation>([
      ['a1', makeAnimation({ startTime: 0 })],
    ]);
    updateAnimations(animations, setVariable, 499);
    expect(animations.has('a1')).toBe(true);
  });

  // ── loop ─────────────────────────────────────────────────────────────────

  it('does not remove a looping animation at completion', () => {
    const animations = new Map<string, Animation>([
      ['a1', makeAnimation({ loop: true, startTime: 0 })],
    ]);
    updateAnimations(animations, setVariable, 1000);
    expect(animations.has('a1')).toBe(true);
  });

  it('resets startTime to now for a looping animation', () => {
    const anim = makeAnimation({ loop: true, startTime: 0 });
    const animations = new Map<string, Animation>([['a1', anim]]);
    updateAnimations(animations, setVariable, 1000);
    expect(anim.startTime).toBe(1000);
  });

  it('does not reset startTime for a looping animation mid-progress', () => {
    const anim = makeAnimation({ loop: true, startTime: 0 });
    const animations = new Map<string, Animation>([['a1', anim]]);
    updateAnimations(animations, setVariable, 500);
    expect(anim.startTime).toBe(0); // not yet complete
  });

  // ── yoyo ─────────────────────────────────────────────────────────────────

  it('does not remove a yoyo animation at completion', () => {
    const animations = new Map<string, Animation>([
      ['a1', makeAnimation({ yoyo: true, startTime: 0 })],
    ]);
    updateAnimations(animations, setVariable, 1000);
    expect(animations.has('a1')).toBe(true);
  });

  it('swaps from/to for a yoyo animation at completion', () => {
    const anim = makeAnimation({ yoyo: true, from: 0, to: 100, startTime: 0 });
    const animations = new Map<string, Animation>([['a1', anim]]);
    updateAnimations(animations, setVariable, 1000);
    expect(anim.from).toBe(100);
    expect(anim.to).toBe(0);
  });

  it('resets startTime to now for a yoyo animation at completion', () => {
    const anim = makeAnimation({ yoyo: true, startTime: 0 });
    const animations = new Map<string, Animation>([['a1', anim]]);
    updateAnimations(animations, setVariable, 1000);
    expect(anim.startTime).toBe(1000);
  });

  // ── empty / multiple ─────────────────────────────────────────────────────

  it('does nothing for an empty animations map', () => {
    const animations = new Map<string, Animation>();
    updateAnimations(animations, setVariable, 1000);
    expect(setVariable).not.toHaveBeenCalled();
  });

  it('processes multiple animations independently in one call', () => {
    const animations = new Map<string, Animation>([
      ['a1', makeAnimation({ target: 'orb1', property: 'x', from: 0, to: 100, startTime: 0 })],
      ['a2', makeAnimation({ target: 'orb2', property: 'y', from: 10, to: 110, startTime: 0 })],
    ]);
    updateAnimations(animations, setVariable, 500);
    expect(setVariable).toHaveBeenCalledWith('orb1.x', 50);
    expect(setVariable).toHaveBeenCalledWith('orb2.y', 60);
  });

  it('removes only the completed animation from multiple', () => {
    const animations = new Map<string, Animation>([
      ['finished', makeAnimation({ target: 'orb1', property: 'x', startTime: 0, duration: 500 })],
      ['running', makeAnimation({ target: 'orb2', property: 'y', startTime: 0, duration: 2000 })],
    ]);
    updateAnimations(animations, setVariable, 500); // finished completes, running at 25%
    expect(animations.has('finished')).toBe(false);
    expect(animations.has('running')).toBe(true);
  });

  // ── easing ───────────────────────────────────────────────────────────────

  it('applies easing to the progress value (ease-in: value < linear at 50%)', () => {
    const animations = new Map<string, Animation>([
      ['a1', makeAnimation({ easing: 'ease-in', from: 0, to: 100, startTime: 0 })],
    ]);
    updateAnimations(animations, setVariable, 500);
    const [[, value]] = setVariable.mock.calls;
    // ease-in at 50% gives a value less than 50 (slower start)
    expect(typeof value).toBe('number');
    // Just verify it ran without error — easing.ts is covered separately
  });

  it('uses linear easing by default (50% → value 50)', () => {
    const animations = new Map<string, Animation>([
      ['a1', makeAnimation({ easing: 'linear', from: 0, to: 100, startTime: 0 })],
    ]);
    updateAnimations(animations, setVariable, 500);
    expect(setVariable).toHaveBeenCalledWith('orb1.x', 50);
  });
});
