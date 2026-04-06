import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SpringAnimator, Vec3SpringAnimator, SpringPresets } from '@holoscript/engine/animation/SpringAnimator';

// =============================================================================
// C240 — Spring Animator
// =============================================================================

describe('SpringAnimator', () => {
  it('initial value matches constructor arg', () => {
    const s = new SpringAnimator(5);
    expect(s.getValue()).toBe(5);
    expect(s.isAtRest()).toBe(true);
  });

  it('setTarget marks not at rest', () => {
    const s = new SpringAnimator(0);
    s.setTarget(100);
    expect(s.isAtRest()).toBe(false);
  });

  it('update moves toward target', () => {
    const s = new SpringAnimator(0);
    s.setTarget(10);
    s.update(1 / 60);
    expect(s.getValue()).toBeGreaterThan(0);
    expect(s.getValue()).toBeLessThan(10);
  });

  it('settles at target after many updates', () => {
    const s = new SpringAnimator(0);
    s.setTarget(50);
    for (let i = 0; i < 600; i++) s.update(1 / 60);
    expect(s.getValue()).toBeCloseTo(50, 1);
    expect(s.isAtRest()).toBe(true);
  });

  it('onUpdate callback fires during animation', () => {
    const cb = vi.fn();
    const s = new SpringAnimator(0, {}, cb);
    s.setTarget(10);
    s.update(1 / 60);
    expect(cb).toHaveBeenCalled();
  });

  it('onRest callback fires when settled', () => {
    const rest = vi.fn();
    const s = new SpringAnimator(0, {}, undefined, rest);
    s.setTarget(5);
    for (let i = 0; i < 600; i++) s.update(1 / 60);
    expect(rest).toHaveBeenCalled();
  });

  it('setValue jumps instantly and goes at rest', () => {
    const s = new SpringAnimator(0);
    s.setTarget(100);
    s.setValue(50);
    expect(s.getValue()).toBe(50);
    expect(s.isAtRest()).toBe(true);
  });

  it('impulse adds velocity', () => {
    const s = new SpringAnimator(0);
    s.impulse(100);
    expect(s.isAtRest()).toBe(false);
    s.update(1 / 60);
    expect(s.getValue()).toBeGreaterThan(0);
  });

  it('setConfig changes behavior', () => {
    const s = new SpringAnimator(0);
    s.setConfig({ stiffness: 500, damping: 50 });
    s.setTarget(10);
    s.update(1 / 60);
    const fast = s.getValue();
    const s2 = new SpringAnimator(0);
    s2.setConfig({ stiffness: 20, damping: 5 });
    s2.setTarget(10);
    s2.update(1 / 60);
    expect(fast).toBeGreaterThan(s2.getValue());
  });

  it('SpringPresets has expected keys', () => {
    expect(SpringPresets.stiff).toBeDefined();
    expect(SpringPresets.default).toBeDefined();
    expect(SpringPresets.gentle).toBeDefined();
    expect(SpringPresets.wobbly).toBeDefined();
    expect(SpringPresets.slow).toBeDefined();
    expect(SpringPresets.molasses).toBeDefined();
  });

  it('no update after rest returns same value', () => {
    const s = new SpringAnimator(10);
    const v1 = s.update(1 / 60);
    const v2 = s.update(1 / 60);
    expect(v1).toBe(v2);
    expect(v1).toBe(10);
  });
});

describe('Vec3SpringAnimator', () => {
  it('initial value matches', () => {
    const v = new Vec3SpringAnimator({ x: 1, y: 2, z: 3 });
    expect(v.getValue()).toEqual({ x: 1, y: 2, z: 3 });
  });

  it('animates toward target', () => {
    const v = new Vec3SpringAnimator({ x: 0, y: 0, z: 0 });
    v.setTarget({ x: 10, y: 20, z: 30 });
    v.update(1 / 60);
    const val = v.getValue();
    expect(val.x).toBeGreaterThan(0);
    expect(val.y).toBeGreaterThan(0);
    expect(val.z).toBeGreaterThan(0);
  });

  it('isAtRest when all axes settle', () => {
    const v = new Vec3SpringAnimator({ x: 0, y: 0, z: 0 });
    v.setTarget({ x: 5, y: 5, z: 5 });
    for (let i = 0; i < 600; i++) v.update(1 / 60);
    expect(v.isAtRest()).toBe(true);
  });
});
