/**
 * FluidSimulationTrait Tests
 *
 * Tests the SPH (Smoothed Particle Hydrodynamics) fluid simulation system.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { FluidSimulationSystem } from '../FluidSimulationTrait';

describe('FluidSimulationSystem', () => {
  let fluid: FluidSimulationSystem;

  beforeEach(() => {
    fluid = new FluidSimulationSystem({ smoothingRadius: 0.5 });
  });

  // ── Construction ──────────────────────────────────────────────────────────

  it('creates with default config', () => {
    const f = new FluidSimulationSystem();
    expect(f).toBeDefined();
    expect(f.getParticleCount()).toBe(0);
  });

  it('accepts custom config', () => {
    const f = new FluidSimulationSystem({ restDensity: 500, viscosity: 0.01 });
    expect(f.getConfig().restDensity).toBe(500);
    expect(f.getConfig().viscosity).toBe(0.01);
  });

  // ── Particle Management ───────────────────────────────────────────────────

  it('addParticle returns an id', () => {
    const id = fluid.addParticle([0, 0, 0 ]);
    expect(id).toBeGreaterThanOrEqual(0);
  });

  it('particle count increments after add', () => {
    fluid.addParticle([0, 0, 0 ]);
    fluid.addParticle([0.1, 0, 0 ]);
    expect(fluid.getParticleCount()).toBe(2);
  });

  it('removeParticle decrements count', () => {
    const id = fluid.addParticle([0, 0, 0 ]);
    expect(fluid.removeParticle(id)).toBe(true);
    expect(fluid.getParticleCount()).toBe(0);
  });

  it('removeParticle returns false for unknown id', () => {
    expect(fluid.removeParticle(999)).toBe(false);
  });

  it('getParticle returns the correct particle', () => {
    const id = fluid.addParticle([1, 2, 3 ]);
    const p = fluid.getParticle(id)!;
    expect(p.position[0]).toBe(1);
    expect(p.position[1]).toBe(2);
    expect(p.position[2]).toBe(3);
  });

  it('getParticles returns all particles', () => {
    fluid.addParticle([0, 0, 0 ]);
    fluid.addParticle([1, 0, 0 ]);
    expect(fluid.getParticles().length).toBe(2);
  });

  // ── SPH Queries ───────────────────────────────────────────────────────────

  it('getDensityAt returns 0 when no particles nearby', () => {
    fluid.addParticle([100, 100, 100 ]);
    const density = fluid.getDensityAt([0, 0, 0 ]);
    expect(density).toBe(0);
  });

  it('getDensityAt returns > 0 when particle is within smoothing radius', () => {
    fluid.addParticle([0, 0, 0 ]);
    const density = fluid.getDensityAt([0.1, 0, 0 ]);
    expect(density).toBeGreaterThan(0);
  });

  it('density increases with more nearby particles', () => {
    // Pack many particles close together to increase density
    for (let i = 0; i < 5; i++) {
      fluid.addParticle([i * 0.01, 0, 0 ]);
    }
    const densityNear = fluid.getDensityAt([0.02, 0, 0 ]);
    const densityFar = fluid.getDensityAt([100, 0, 0 ]);
    expect(densityNear).toBeGreaterThan(densityFar);
  });

  it('isInsideFluid returns false when no nearby particles', () => {
    fluid.addParticle([100, 100, 100 ]);
    expect(fluid.isInsideFluid([0, 0, 0 ])).toBe(false);
  });

  // ── Simulation ────────────────────────────────────────────────────────────

  it('step() moves particles due to gravity', () => {
    const id = fluid.addParticle([0, 0, 0 ]);
    const before = { ...fluid.getParticle(id)!.position };
    fluid.step(0.016);
    const after = fluid.getParticle(id)!.position;
    expect(after.y).toBeLessThan(before.y); // gravity pulls down
  });

  it('step computes densities on particles', () => {
    const id = fluid.addParticle([0, 0, 0 ]);
    // step(0) computes densities/forces without moving particles
    fluid.step(0);
    const p = fluid.getParticle(id)!;
    expect(p.density).toBeGreaterThan(0);
  });

  it('step applies gravity force', () => {
    const id = fluid.addParticle([0, 0, 0 ]);
    // step(0) computes forces (including gravity) without integrating
    fluid.step(0);
    const p = fluid.getParticle(id)!;
    // Gravity contribution: F = m * g.y (negative = downward)
    expect(p.force[1]).toBeLessThan(0);
  });

  it('box boundary prevents particles from escaping', () => {
    const customFluid = new FluidSimulationSystem({ smoothingRadius: 0.5 });
    customFluid.addBoundary({
      type: 'box',
      position: [0, 0, 0],
      size: [2, 2, 2 ],
      restitution: 0.5,
    });
    const id = customFluid.addParticle([0, 0.9, 0 ]);
    // Step many times — particle should stay within box bounds
    for (let i = 0; i < 100; i++) customFluid.step(0.016);
    const p = customFluid.getParticle(id)!;
    expect(p.position[1]).toBeGreaterThanOrEqual(-1);
    expect(p.position[1]).toBeLessThanOrEqual(1);
  });

  // ── Statistics ────────────────────────────────────────────────────────────

  it('getKineticEnergy returns 0 for stationary particles', () => {
    fluid.addParticle([0, 0, 0 ]);
    expect(fluid.getKineticEnergy()).toBe(0);
  });

  it('getKineticEnergy increases after gravity steps', () => {
    fluid.addParticle([0, 0, 0 ]);
    const before = fluid.getKineticEnergy();
    fluid.step(0.016);
    expect(fluid.getKineticEnergy()).toBeGreaterThan(before);
  });

  it('getAverageDensity returns 0 when empty', () => {
    expect(fluid.getAverageDensity()).toBe(0);
  });

  it('setConfig changes settings', () => {
    fluid.setConfig({ viscosity: 0.1 });
    expect(fluid.getConfig().viscosity).toBe(0.1);
  });

  // ── Reset ─────────────────────────────────────────────────────────────────

  it('reset clears all particles', () => {
    fluid.addParticle([0, 0, 0 ]);
    fluid.reset();
    expect(fluid.getParticleCount()).toBe(0);
  });
});
