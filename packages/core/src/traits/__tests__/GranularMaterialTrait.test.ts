/**
 * GranularMaterialTrait Tests
 *
 * Tests the DEM (Discrete Element Method) granular material simulation system.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { GranularMaterialSystem } from '../GranularMaterialTrait';

describe('GranularMaterialSystem', () => {
  let sand: GranularMaterialSystem;

  beforeEach(() => {
    sand = new GranularMaterialSystem({
      material: { density: 1500, friction: 0.5, restitution: 0.3 },
      bounds: { min: [-5, -5, -5 ], max: [5, 5, 5 ] },
    });
  });

  // ── Construction ──────────────────────────────────────────────────────────

  it('creates with default config', () => {
    const g = new GranularMaterialSystem();
    expect(g).toBeDefined();
    expect(g.getParticleCount()).toBe(0);
  });

  it('accepts custom material config', () => {
    const g = new GranularMaterialSystem({ material: { density: 2000 } });
    expect(g.getConfig().material.density).toBe(2000);
  });

  // ── Particle Management ───────────────────────────────────────────────────

  it('addParticle returns a non-negative id', () => {
    const id = sand.addParticle([0, 0, 0 ], 0.02);
    expect(id).toBeGreaterThanOrEqual(0);
  });

  it('getParticle retrieves added particle', () => {
    const id = sand.addParticle([1, 2, 3 ], 0.05);
    const p = sand.getParticle(id)!;
    expect(p.position[0]).toBe(1);
    expect(p.position[1]).toBe(2);
    expect(p.radius).toBe(0.05);
  });

  it('particle count increases with each add', () => {
    sand.addParticle([0, 0, 0 ], 0.02);
    sand.addParticle([0.1, 0, 0 ], 0.02);
    expect(sand.getParticleCount()).toBe(2);
  });

  it('removeParticle removes targeted particle', () => {
    const id = sand.addParticle([0, 0, 0 ], 0.02);
    expect(sand.removeParticle(id)).toBe(true);
    expect(sand.getParticle(id)).toBeUndefined();
    expect(sand.getParticleCount()).toBe(0);
  });

  it('removeParticle returns false for unknown id', () => {
    expect(sand.removeParticle(999)).toBe(false);
  });

  it('getParticles returns only active particles', () => {
    sand.addParticle([0, 0, 0 ], 0.02);
    sand.addParticle([0.1, 0, 0 ], 0.02);
    expect(sand.getParticles().length).toBe(2);
  });

  it('maxParticles cap prevents over-adding', () => {
    const small = new GranularMaterialSystem({ maxParticles: 2 });
    small.addParticle([0, 0, 0 ], 0.02);
    small.addParticle([0.1, 0, 0 ], 0.02);
    const id = small.addParticle([0.2, 0, 0 ], 0.02);
    expect(id).toBe(-1); // rejected
    expect(small.getParticleCount()).toBe(2);
  });

  it('materialTag is stored on particle', () => {
    const id = sand.addParticle([0, 0, 0 ], 0.02, 'gravel');
    expect(sand.getParticle(id)!.materialTag).toBe('gravel');
  });

  // ── Mass Calculation ──────────────────────────────────────────────────────

  it('particle mass is calculated from density and radius', () => {
    const id = sand.addParticle([0, 0, 0 ], 0.01);
    const p = sand.getParticle(id)!;
    const expectedVolume = (4 / 3) * Math.PI * 0.01 ** 3;
    const expectedMass = 1500 * expectedVolume;
    expect(p.mass).toBeCloseTo(expectedMass, 10);
  });

  // ── Simulation ────────────────────────────────────────────────────────────

  it('step() causes gravity-driven movement', () => {
    const id = sand.addParticle([0, 0, 0 ], 0.02);
    const before = { ...sand.getParticle(id)!.position };
    sand.step(0.016);
    const after = sand.getParticle(id)!.position;
    expect(after.y).toBeLessThan(before.y);
  });

  it('step increments stepCount', () => {
    expect(sand.getStepCount()).toBe(0);
    sand.step(0.016);
    expect(sand.getStepCount()).toBe(1);
    sand.step(0.016);
    expect(sand.getStepCount()).toBe(2);
  });

  it('particles stay within bounds after many steps', () => {
    const bounds = { min: [-2, -2, -2 ], max: [2, 2, 2 ] };
    const bounded = new GranularMaterialSystem({ bounds });
    const id = bounded.addParticle([0, 1.5, 0 ], 0.05);
    for (let i = 0; i < 200; i++) bounded.step(0.016);
    const p = bounded.getParticle(id)!;
    expect(p.position[1]).toBeGreaterThanOrEqual(-2);
    expect(p.position[1]).toBeLessThanOrEqual(2);
  });

  // ── Impulse ────────────────────────────────────────────────────────────────

  it('applyImpulse affects particles within radius', () => {
    const id = sand.addParticle([0, 0, 0 ], 0.02);
    const before = { ...sand.getParticle(id)!.velocity };
    sand.applyImpulse([0, 0, 0 ], [5, 5, 0 ], 1.0);
    const after = sand.getParticle(id)!.velocity;
    expect(after.x).toBeGreaterThan(before.x);
  });

  it('applyImpulse does not affect particles outside radius', () => {
    const id = sand.addParticle([10, 10, 10 ], 0.02);
    const before = { ...sand.getParticle(id)!.velocity };
    sand.applyImpulse([0, 0, 0 ], [100, 0, 0 ], 0.5);
    const after = sand.getParticle(id)!.velocity;
    expect(after.x).toBe(before.x);
  });

  // ── Statistics ────────────────────────────────────────────────────────────

  it('getCenterOfMass returns (0,0,0) for empty system', () => {
    const com = sand.getCenterOfMass();
    expect(com.x).toBe(0);
    expect(com.y).toBe(0);
    expect(com.z).toBe(0);
  });

  it('getCenterOfMass is weighted by mass', () => {
    sand.addParticle([-1, 0, 0 ], 0.05);
    sand.addParticle([1, 0, 0 ], 0.05);
    const com = sand.getCenterOfMass();
    expect(com.x).toBeCloseTo(0, 5);
  });

  it('getKineticEnergy is 0 for stationary particles', () => {
    sand.addParticle([0, 0, 0 ], 0.02);
    expect(sand.getKineticEnergy()).toBe(0);
  });

  it('getKineticEnergy increases after gravity steps', () => {
    sand.addParticle([0, 0, 0 ], 0.02);
    const before = sand.getKineticEnergy();
    sand.step(0.016);
    expect(sand.getKineticEnergy()).toBeGreaterThan(before);
  });

  it('getAverageSpeed is 0 for stationary particles', () => {
    sand.addParticle([0, 0, 0 ], 0.02);
    expect(sand.getAverageSpeed()).toBe(0);
  });

  // ── Config & Reset ────────────────────────────────────────────────────────

  it('updateConfig changes gravity', () => {
    sand.updateConfig({ gravity: [0, -20, 0 ] });
    expect(sand.getConfig().gravity[1]).toBe(-20);
  });

  it('updateConfig changes material properties', () => {
    sand.updateConfig({ material: { friction: 0.9 } });
    expect(sand.getConfig().material.friction).toBe(0.9);
  });

  it('reset clears all particles and stepCount', () => {
    sand.addParticle([0, 0, 0 ], 0.02);
    sand.step(0.016);
    sand.reset();
    expect(sand.getParticleCount()).toBe(0);
    expect(sand.getStepCount()).toBe(0);
  });
});
