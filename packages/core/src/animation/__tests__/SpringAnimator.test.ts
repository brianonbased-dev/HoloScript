/**
 * SpringAnimator Unit Tests
 *
 * Tests spring physics: setTarget, setValue, impulse,
 * update convergence, rest detection, presets, Vec3Spring.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SpringAnimator, SpringPresets, Vec3SpringAnimator } from '../SpringAnimator';

describe('SpringAnimator', () => {
  describe('initial state', () => {
    it('should start at initial value', () => {
      const spring = new SpringAnimator(5);
      expect(spring.getValue()).toBe(5);
    });

    it('should start at rest', () => {
      const spring = new SpringAnimator(0);
      expect(spring.isAtRest()).toBe(true);
    });
  });

  describe('setTarget', () => {
    it('should mark as not at rest', () => {
      const spring = new SpringAnimator(0);
      spring.setTarget(10);
      expect(spring.isAtRest()).toBe(false);
    });

    it('should converge towards target over updates', () => {
      const spring = new SpringAnimator(0, SpringPresets.stiff);
      spring.setTarget(100);

      for (let i = 0; i < 200; i++) spring.update(1 / 60);

      expect(spring.getValue()).toBeCloseTo(100, 0);
      expect(spring.isAtRest()).toBe(true);
    });
  });

  describe('setValue', () => {
    it('should instantly jump to value', () => {
      const spring = new SpringAnimator(0);
      spring.setValue(50);
      expect(spring.getValue()).toBe(50);
      expect(spring.isAtRest()).toBe(true);
    });

    it('should call onUpdate', () => {
      const onUpdate = vi.fn();
      const spring = new SpringAnimator(0, {}, onUpdate);
      spring.setValue(25);
      expect(onUpdate).toHaveBeenCalledWith(25);
    });
  });

  describe('impulse', () => {
    it('should add velocity and mark not at rest', () => {
      const spring = new SpringAnimator(0);
      spring.impulse(100);
      expect(spring.isAtRest()).toBe(false);

      spring.update(1 / 60);
      expect(spring.getValue()).not.toBe(0);
    });
  });

  describe('update', () => {
    it('should call onUpdate callback', () => {
      const onUpdate = vi.fn();
      const spring = new SpringAnimator(0, {}, onUpdate);
      spring.setTarget(10);
      spring.update(1 / 60);
      expect(onUpdate).toHaveBeenCalled();
    });

    it('should call onRest when settled', () => {
      const onRest = vi.fn();
      const spring = new SpringAnimator(0, SpringPresets.stiff, undefined, onRest);
      spring.setTarget(1);

      for (let i = 0; i < 300; i++) spring.update(1 / 60);

      expect(onRest).toHaveBeenCalled();
    });

    it('should return current value when at rest', () => {
      const spring = new SpringAnimator(42);
      expect(spring.update(1 / 60)).toBe(42);
    });
  });

  describe('setConfig', () => {
    it('should update spring config', () => {
      const spring = new SpringAnimator(0);
      spring.setConfig({ stiffness: 500 });
      spring.setTarget(10);
      spring.update(1 / 60);
      // Higher stiffness should cause faster initial movement
      const val = spring.getValue();
      expect(val).not.toBe(0);
    });
  });

  describe('SpringPresets', () => {
    it('should have all standard presets', () => {
      expect(SpringPresets.stiff).toBeDefined();
      expect(SpringPresets.default).toBeDefined();
      expect(SpringPresets.gentle).toBeDefined();
      expect(SpringPresets.wobbly).toBeDefined();
      expect(SpringPresets.slow).toBeDefined();
      expect(SpringPresets.molasses).toBeDefined();
    });
  });
});

describe('Vec3SpringAnimator', () => {
  it('should initialize with xyz values', () => {
    const spring = new Vec3SpringAnimator({ x: 1, y: 2, z: 3 });
    expect(spring.getValue()).toEqual({ x: 1, y: 2, z: 3 });
  });

  it('should animate towards target', () => {
    const spring = new Vec3SpringAnimator({ x: 0, y: 0, z: 0 }, SpringPresets.stiff);
    spring.setTarget({ x: 10, y: 20, z: 30 });

    for (let i = 0; i < 200; i++) spring.update(1 / 60);

    const val = spring.getValue();
    expect(val.x).toBeCloseTo(10, 0);
    expect(val.y).toBeCloseTo(20, 0);
    expect(val.z).toBeCloseTo(30, 0);
    expect(spring.isAtRest()).toBe(true);
  });

  it('should report isAtRest only when all axes settle', () => {
    const spring = new Vec3SpringAnimator({ x: 0, y: 0, z: 0 });
    spring.setTarget({ x: 1, y: 0, z: 0 });
    expect(spring.isAtRest()).toBe(false);
  });
});
