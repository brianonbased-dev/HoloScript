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
    sim.addParticle({ x: 0, y: 0, z: 0 });
    expect(sim.getParticleCount()).toBe(1);
  });

  it('addParticle with velocity', () => {
    sim.addParticle({ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 });
    expect(sim.getParticles()[0].velocity.x).toBe(1);
  });

  it('addBlock creates grid of particles', () => {
    const count = sim.addBlock({ x: 0, y: 0, z: 0 }, { x: 1, y: 1, z: 0 }, 0.5);
    expect(count).toBe(9); // 3x3x1
    expect(sim.getParticleCount()).toBe(9);
  });

  it('update moves particles under gravity', () => {
    sim.addParticle({ x: 0, y: 5, z: 0 });
    sim.update();
    expect(sim.getParticles()[0].position.y).toBeLessThan(5);
  });

  it('boundary enforcement clamps position', () => {
    sim = new FluidSim({
      boundaryMin: { x: -1, y: -1, z: -1 },
      boundaryMax: { x: 1, y: 1, z: 1 },
      boundaryDamping: 0.3,
      timeStep: 0.1,
    });
    sim.addParticle({ x: 0, y: -0.9, z: 0 }, { x: 0, y: -100, z: 0 });
    sim.update();
    const p = sim.getParticles()[0];
    expect(p.position.y).toBeGreaterThanOrEqual(-1);
  });

  it('getKineticEnergy is non-negative', () => {
    sim.addParticle({ x: 0, y: 5, z: 0 });
    sim.update();
    expect(sim.getKineticEnergy()).toBeGreaterThanOrEqual(0);
  });

  it('getAverageDensity returns 0 for empty sim', () => {
    expect(sim.getAverageDensity()).toBe(0);
  });

  it('getAverageDensity positive with particles', () => {
    sim.addParticle({ x: 0, y: 0, z: 0 });
    sim.update();
    expect(sim.getAverageDensity()).toBeGreaterThan(0);
  });

  it('clear removes all particles', () => {
    sim.addParticle({ x: 0, y: 0, z: 0 });
    sim.clear();
    expect(sim.getParticleCount()).toBe(0);
  });

  it('setConfig updates configuration', () => {
    sim.setConfig({ viscosity: 500 });
    // No throw, just verify it runs
    sim.addParticle({ x: 0, y: 0, z: 0 });
    sim.update();
    expect(sim.getParticleCount()).toBe(1);
  });
});
