import { describe, it, expect, beforeEach } from 'vitest';
import { FluidSim } from '@holoscript/core';

describe('FluidSim', () => {
  let sim: FluidSim;

  beforeEach(() => {
    sim = new FluidSim();
  });

  it('starts with no particles', () => {
    expect(sim.getParticleCount()).toBe(0);
  });

  it('addParticle increases count', () => {
    sim.addParticle({ x: 0, y: 0, z: 0 });
    expect(sim.getParticleCount()).toBe(1);
  });

  it('addBlock creates grid of particles', () => {
    const count = sim.addBlock({ x: 0, y: 0, z: 0 }, { x: 1, y: 1, z: 0 }, 1);
    expect(count).toBe(4); // 2x2x1
    expect(sim.getParticleCount()).toBe(4);
  });

  it('update does not throw on empty', () => {
    expect(() => sim.update()).not.toThrow();
  });

  it('update moves particles with gravity', () => {
    sim.addParticle({ x: 0, y: 5, z: 0 });
    sim.update();
    expect(sim.getParticles()[0].position.y).toBeLessThan(5);
  });

  it('getAverageDensity returns 0 for empty', () => {
    expect(sim.getAverageDensity()).toBe(0);
  });

  it('getAverageDensity returns value for particles', () => {
    sim.addParticle({ x: 0, y: 0, z: 0 });
    sim.update();
    expect(sim.getAverageDensity()).toBeGreaterThan(0);
  });

  it('getKineticEnergy is 0 at rest, > 0 after sim', () => {
    sim.addParticle({ x: 0, y: 5, z: 0 });
    expect(sim.getKineticEnergy()).toBe(0);
    sim.update();
    expect(sim.getKineticEnergy()).toBeGreaterThan(0);
  });

  it('clear removes all particles', () => {
    sim.addParticle({ x: 0, y: 0, z: 0 });
    sim.clear();
    expect(sim.getParticleCount()).toBe(0);
  });

  it('enforceBoundaries keeps particles in bounds', () => {
    sim.setConfig({
      boundaryMin: { x: -1, y: -1, z: -1 },
      boundaryMax: { x: 1, y: 1, z: 1 },
    });
    sim.addParticle({ x: 0, y: -0.9, z: 0 });
    for (let i = 0; i < 10; i++) sim.update();
    const p = sim.getParticles()[0];
    expect(p.position.y).toBeGreaterThanOrEqual(-1);
  });

  it('setConfig updates parameters', () => {
    sim.setConfig({ viscosity: 999 });
    // No crash
    sim.addParticle({ x: 0, y: 0, z: 0 });
    sim.update();
    expect(sim.getParticleCount()).toBe(1);
  });
});
