/**
 * SpringAnimator — Production Test Suite
 *
 * Covers: SpringPresets, SpringAnimator (initial value/target, setValue,
 * impulse, update convergence, callbacks, setConfig, isAtRest),
 * Vec3SpringAnimator (construction, setTarget, update, getValue, isAtRest).
 */
import { describe, it, expect } from 'vitest';
import { SpringAnimator, Vec3SpringAnimator, SpringPresets } from '../SpringAnimator';

/** Step a spring many times to convergence */
function settle(spring: SpringAnimator, target: number, steps = 500, dt = 0.016): number {
  spring.setTarget(target);
  for (let i = 0; i < steps; i++) spring.update(dt);
  return spring.getValue();
}

describe('SpringAnimator — Production', () => {
  // ─── SpringPresets ─────────────────────────────────────────────────
  it('SpringPresets has default preset', () => {
    expect(SpringPresets.default).toBeDefined();
    expect(typeof SpringPresets.default.stiffness).toBe('number');
    expect(typeof SpringPresets.default.damping).toBe('number');
  });

  it('SpringPresets stiff has higher stiffness than slow', () => {
    expect(SpringPresets.stiff.stiffness).toBeGreaterThan(SpringPresets.slow.stiffness);
  });

  it('all presets have required fields', () => {
    for (const [name, preset] of Object.entries(SpringPresets)) {
      expect(preset.stiffness, name).toBeGreaterThan(0);
      expect(preset.damping, name).toBeGreaterThan(0);
      expect(preset.mass, name).toBeGreaterThan(0);
      expect(preset.precision, name).toBeGreaterThan(0);
    }
  });

  // ─── Construction ─────────────────────────────────────────────────
  it('initial value is what you pass', () => {
    const s = new SpringAnimator(42);
    expect(s.getValue()).toBe(42);
  });

  it('starts at rest', () => {
    const s = new SpringAnimator(0);
    expect(s.isAtRest()).toBe(true);
  });

  // ─── setTarget ────────────────────────────────────────────────────
  it('setTarget marks as not at rest', () => {
    const s = new SpringAnimator(0);
    s.setTarget(100);
    expect(s.isAtRest()).toBe(false);
  });

  it('update moves value toward target over time', () => {
    const s = new SpringAnimator(0);
    s.setTarget(100);
    s.update(0.016);
    expect(s.getValue()).toBeGreaterThan(0);
    expect(s.getValue()).toBeLessThan(100);
  });

  it('spring converges to target after many steps', () => {
    const s = new SpringAnimator(0, SpringPresets.stiff);
    const final = settle(s, 100);
    expect(final).toBeCloseTo(100, 0);
  });

  it('spring marks isAtRest after convergence', () => {
    const s = new SpringAnimator(0, SpringPresets.stiff);
    settle(s, 50);
    expect(s.isAtRest()).toBe(true);
  });

  // ─── setValue ─────────────────────────────────────────────────────
  it('setValue instantly jumps to value', () => {
    const s = new SpringAnimator(0);
    s.setValue(200);
    expect(s.getValue()).toBe(200);
    expect(s.isAtRest()).toBe(true);
  });

  it('setValue resets velocity', () => {
    const s = new SpringAnimator(0);
    s.setTarget(100);
    for (let i = 0; i < 5; i++) s.update(0.016);
    s.setValue(50); // hard jump
    expect(s.getValue()).toBe(50);
    expect(s.isAtRest()).toBe(true);
  });

  // ─── impulse ──────────────────────────────────────────────────────
  it('impulse adds velocity and marks not at rest', () => {
    const s = new SpringAnimator(0);
    s.impulse(50);
    expect(s.isAtRest()).toBe(false);
  });

  it('positive impulse pushes value positively', () => {
    const s = new SpringAnimator(0);
    s.impulse(1000);
    s.update(0.016);
    expect(s.getValue()).toBeGreaterThan(0);
  });

  // ─── callbacks ────────────────────────────────────────────────────
  it('onUpdate callback fires on update', () => {
    const updates: number[] = [];
    const s = new SpringAnimator(0, SpringPresets.stiff, (v) => updates.push(v));
    s.setTarget(10);
    s.update(0.016);
    expect(updates.length).toBeGreaterThan(0);
  });

  it('onRest callback fires when spring settles', () => {
    let restFired = false;
    const s = new SpringAnimator(0, SpringPresets.stiff, undefined, () => {
      restFired = true;
    });
    settle(s, 10);
    expect(restFired).toBe(true);
  });

  // ─── setConfig ────────────────────────────────────────────────────
  it('setConfig updates configuration', () => {
    const s = new SpringAnimator(0);
    s.setConfig({ stiffness: 500 });
    // Should not throw and still animate
    s.setTarget(100);
    const v = s.update(0.016);
    expect(typeof v).toBe('number');
  });

  // ─── update returns value ─────────────────────────────────────────
  it('update returns current value', () => {
    const s = new SpringAnimator(0);
    s.setTarget(100);
    const v = s.update(0.016);
    expect(v).toBe(s.getValue());
  });

  it('update while already at rest returns unchanged value', () => {
    const s = new SpringAnimator(42);
    const v = s.update(0.1);
    expect(v).toBe(42);
  });

  // ─── Vec3SpringAnimator ───────────────────────────────────────────
  describe('Vec3SpringAnimator', () => {
    it('constructs with initial vec3', () => {
      const v3 = new Vec3SpringAnimator({ x: 1, y: 2, z: 3 });
      const val = v3.getValue();
      expect(val.x).toBe(1);
      expect(val.y).toBe(2);
      expect(val.z).toBe(3);
    });

    it('starts at rest', () => {
      const v3 = new Vec3SpringAnimator({ x: 0, y: 0, z: 0 });
      expect(v3.isAtRest()).toBe(true);
    });

    it('setTarget marks as not at rest', () => {
      const v3 = new Vec3SpringAnimator({ x: 0, y: 0, z: 0 });
      v3.setTarget({ x: 10, y: 10, z: 10 });
      expect(v3.isAtRest()).toBe(false);
    });

    it('update returns vec3 value', () => {
      const v3 = new Vec3SpringAnimator({ x: 0, y: 0, z: 0 });
      v3.setTarget({ x: 10, y: 20, z: 30 });
      const r = v3.update(0.016);
      expect(r.x).toBeGreaterThan(0);
      expect(r.y).toBeGreaterThan(0);
      expect(r.z).toBeGreaterThan(0);
    });

    it('converges to target vec3', () => {
      const v3 = new Vec3SpringAnimator({ x: 0, y: 0, z: 0 }, SpringPresets.stiff);
      v3.setTarget({ x: 10, y: -5, z: 3 });
      for (let i = 0; i < 500; i++) v3.update(0.016);
      const val = v3.getValue();
      expect(val.x).toBeCloseTo(10, 0);
      expect(val.y).toBeCloseTo(-5, 0);
      expect(val.z).toBeCloseTo(3, 0);
    });

    it('isAtRest once all axes settle', () => {
      const v3 = new Vec3SpringAnimator({ x: 0, y: 0, z: 0 }, SpringPresets.stiff);
      v3.setTarget({ x: 5, y: 5, z: 5 });
      for (let i = 0; i < 500; i++) v3.update(0.016);
      expect(v3.isAtRest()).toBe(true);
    });
  });
});
