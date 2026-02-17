import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SpringAnimator, Vec3SpringAnimator, SpringPresets } from '../SpringAnimator';

describe('SpringAnimator', () => {
  let spring: SpringAnimator;

  beforeEach(() => { spring = new SpringAnimator(0); });

  // ---------------------------------------------------------------------------
  // Initial State
  // ---------------------------------------------------------------------------

  it('starts at initial value', () => {
    expect(spring.getValue()).toBe(0);
    expect(spring.isAtRest()).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // setTarget
  // ---------------------------------------------------------------------------

  it('setTarget wakes the spring', () => {
    spring.setTarget(100);
    expect(spring.isAtRest()).toBe(false);
  });

  it('update moves toward target', () => {
    spring.setTarget(100);
    spring.update(0.016);
    expect(spring.getValue()).toBeGreaterThan(0);
    expect(spring.getValue()).toBeLessThan(100);
  });

  // ---------------------------------------------------------------------------
  // setValue
  // ---------------------------------------------------------------------------

  it('setValue jumps instantly and marks at rest', () => {
    spring.setValue(42);
    expect(spring.getValue()).toBe(42);
    expect(spring.isAtRest()).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // impulse
  // ---------------------------------------------------------------------------

  it('impulse adds velocity', () => {
    spring.impulse(50);
    expect(spring.isAtRest()).toBe(false);
    spring.update(0.016);
    expect(spring.getValue()).not.toBe(0);
  });

  // ---------------------------------------------------------------------------
  // Rest Detection
  // ---------------------------------------------------------------------------

  it('settles to target after many updates', () => {
    spring.setTarget(10);
    for (let i = 0; i < 500; i++) spring.update(0.016);
    expect(spring.getValue()).toBeCloseTo(10, 1);
    expect(spring.isAtRest()).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // Callbacks
  // ---------------------------------------------------------------------------

  it('calls onUpdate callback', () => {
    const onUpdate = vi.fn();
    const s = new SpringAnimator(0, {}, onUpdate);
    s.setTarget(10);
    s.update(0.016);
    expect(onUpdate).toHaveBeenCalled();
  });

  it('calls onRest callback when settled', () => {
    const onRest = vi.fn();
    const s = new SpringAnimator(0, {}, undefined, onRest);
    s.setTarget(0.001);
    for (let i = 0; i < 500; i++) s.update(0.016);
    expect(onRest).toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------------
  // setConfig
  // ---------------------------------------------------------------------------

  it('setConfig changes behavior', () => {
    const stiff = new SpringAnimator(0, SpringPresets.stiff);
    stiff.setTarget(100);

    const gentle = new SpringAnimator(0, SpringPresets.gentle);
    gentle.setTarget(100);

    stiff.update(0.016);
    gentle.update(0.016);

    // Stiff spring should move faster initially
    expect(stiff.getValue()).toBeGreaterThan(gentle.getValue());
  });
});

describe('Vec3SpringAnimator', () => {
  it('animates all three axes', () => {
    const v3 = new Vec3SpringAnimator({ x: 0, y: 0, z: 0 });
    v3.setTarget({ x: 10, y: 20, z: 30 });
    v3.update(0.016);
    const val = v3.getValue();
    expect(val.x).toBeGreaterThan(0);
    expect(val.y).toBeGreaterThan(0);
    expect(val.z).toBeGreaterThan(0);
  });

  it('isAtRest returns true when all axes settle', () => {
    const v3 = new Vec3SpringAnimator({ x: 0, y: 0, z: 0 });
    v3.setTarget({ x: 1, y: 1, z: 1 });
    for (let i = 0; i < 500; i++) v3.update(0.016);
    expect(v3.isAtRest()).toBe(true);
    const val = v3.getValue();
    expect(val.x).toBeCloseTo(1, 1);
    expect(val.y).toBeCloseTo(1, 1);
    expect(val.z).toBeCloseTo(1, 1);
  });
});
