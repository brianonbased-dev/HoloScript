import { describe, it, expect } from 'vitest';
import { gravity, wind, turbulence, drag, attractor, vortex, floorBounce, sizeOscillate } from '../particles/ParticleAffectors';

function particle(overrides: Record<string, number> = {}) {
  return { x: 0, y: 5, z: 0, vx: 1, vy: 0, vz: 0, ax: 0, ay: 0, az: 0, size: 1, age: 0, life: 5, color: { r: 1, g: 1, b: 1, a: 1 }, ...overrides };
}

describe('ParticleAffectors', () => {
  it('gravity sets downward acceleration', () => {
    const p = particle();
    gravity(-9.81)(p, 0.016);
    expect(p.ay).toBe(-9.81);
  });

  it('wind adds velocity in the given direction', () => {
    const p = particle({ vx: 0, vy: 0, vz: 0 });
    wind(5, 0, 0)(p, 1);
    expect(p.vx).toBe(5);
    expect(p.vy).toBe(0);
  });

  it('turbulence perturbs velocity randomly', () => {
    const p = particle({ vx: 0, vy: 0, vz: 0 });
    turbulence(10)(p, 1);
    const changed = p.vx !== 0 || p.vy !== 0 || p.vz !== 0;
    expect(changed).toBe(true);
  });

  it('drag reduces velocity magnitude', () => {
    const p = particle({ vx: 10, vy: 10, vz: 10 });
    const before = Math.sqrt(p.vx ** 2 + p.vy ** 2 + p.vz ** 2);
    drag(0.5)(p, 1);
    const after = Math.sqrt(p.vx ** 2 + p.vy ** 2 + p.vz ** 2);
    expect(after).toBeLessThan(before);
  });

  it('attractor pulls particles toward point', () => {
    const p = particle({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 });
    attractor(10, 0, 0, 5)(p, 1);
    expect(p.vx).toBeGreaterThan(0); // pulled toward x=10
  });

  it('attractor ignores particles too close (minDist)', () => {
    const p = particle({ x: 10, y: 0, z: 0, vx: 0, vy: 0, vz: 0 });
    attractor(10, 0, 0, 5, 1)(p, 1);
    expect(p.vx).toBe(0);
    expect(p.vy).toBe(0);
  });

  it('vortex rotates velocity via cross product', () => {
    const p = particle({ vx: 1, vy: 0, vz: 0 });
    vortex(0, 1, 0, 2)(p, 1);
    // Cross(Y, Vx) adds to vz
    expect(p.vz).not.toBe(0);
  });

  it('floorBounce reverses vy when below floor', () => {
    const p = particle({ y: -1, vy: -5 });
    floorBounce(0, 0.6)(p, 0.016);
    expect(p.y).toBe(0);
    expect(p.vy).toBeCloseTo(3);
  });

  it('floorBounce does nothing above floor', () => {
    const p = particle({ y: 10, vy: -5 });
    floorBounce(0, 0.6)(p, 0.016);
    expect(p.vy).toBe(-5);
  });

  it('sizeOscillate modifies size based on age', () => {
    const p = particle({ age: 0.25, size: 1 });
    sizeOscillate(3, 0.3)(p, 0.016);
    expect(p.size).not.toBe(1);
    expect(p.size).toBeGreaterThan(0);
  });
});
