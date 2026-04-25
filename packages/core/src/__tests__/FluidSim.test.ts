import { describe, it, expect, beforeEach } from 'vitest';
import { FluidSim } from '@holoscript/engine/physics/FluidSim';

// =============================================================================
// C262 — Fluid Sim
// =============================================================================

describe('FluidSim', () => {
  let sim: FluidSim;
  beforeEach(() => {
    sim = new FluidSim({ smoothingRadius: 1, timeStep: 0.01 });
  });

  it('constructor uses default config', () => {
    const s = new FluidSim();
    expect(s.getParticleCount()).toBe(0);
  });

  it('addParticle increases count', () => {
    sim.addParticle([0, 0, 0]);
    expect(sim.getParticleCount()).toBe(1);
  });

  it('addParticle with velocity', () => {
    sim.addParticle([0, 0, 0], [1, 0, 0]);
    expect(sim.getParticles()[0].velocity[0]).toBe(1);
  });

  it('addBlock creates grid of particles', () => {
    const count = sim.addBlock([0, 0, 0], [1, 1, 0], 0.5);
    expect(count).toBe(9); // 3x3x1
    expect(sim.getParticleCount()).toBe(9);
  });

  it('update moves particles under gravity', () => {
    sim.addParticle([0, 5, 0]);
    sim.update();
    expect(sim.getParticles()[0].position[1]).toBeLessThan(5);
  });

  it('boundary enforcement clamps position', () => {
    sim = new FluidSim({
      boundaryMin: [-1, -1, -1],
      boundaryMax: [1, 1, 1],
      boundaryDamping: 0.3,
      timeStep: 0.1,
    });
    sim.addParticle([0, -0.9, 0], [0, -100, 0]);
    sim.update();
    const p = sim.getParticles()[0];
    expect(p.position[1]).toBeGreaterThanOrEqual(-1);
  });

  it('getKineticEnergy is non-negative', () => {
    sim.addParticle([0, 5, 0]);
    sim.update();
    expect(sim.getKineticEnergy()).toBeGreaterThanOrEqual(0);
  });

  it('getAverageDensity returns 0 for empty sim', () => {
    expect(sim.getAverageDensity()).toBe(0);
  });

  it('getAverageDensity positive with particles', () => {
    sim.addParticle([0, 0, 0]);
    sim.update();
    expect(sim.getAverageDensity()).toBeGreaterThan(0);
  });

  it('clear removes all particles', () => {
    sim.addParticle([0, 0, 0]);
    sim.clear();
    expect(sim.getParticleCount()).toBe(0);
  });

  it('setConfig updates configuration', () => {
    sim.setConfig({ viscosity: 500 });
    // No throw, just verify it runs
    sim.addParticle([0, 0, 0]);
    sim.update();
    expect(sim.getParticleCount()).toBe(1);
  });
});
