import { describe, it, expect, beforeEach } from 'vitest';
import { FluidSim } from '..';

describe('FluidSim', () => {
  let sim: FluidSim;

  beforeEach(() => {
    sim = new FluidSim();
  });

  it('starts with no particles', () => {
    expect(sim.getParticleCount()).toBe(0);
  });

  it('addParticle increases count', () => {
    sim.addParticle([0, 0, 0 ]);
    expect(sim.getParticleCount()).toBe(1);
  });

  it('addBlock creates grid of particles', () => {
    const count = sim.addBlock([0, 0, 0 ], [1, 1, 0 ], 1);
    expect(count).toBe(4); // 2x2x1
    expect(sim.getParticleCount()).toBe(4);
  });

  it('update does not throw on empty', () => {
    expect(() => sim.update()).not.toThrow();
  });

  it('update moves particles with gravity', () => {
    sim.addParticle([0, 5, 0 ]);
    sim.update();
    expect(sim.getParticles()[0].position[1]).toBeLessThan(5);
  });

  it('getAverageDensity returns 0 for empty', () => {
    expect(sim.getAverageDensity()).toBe(0);
  });

  it('getAverageDensity returns value for particles', () => {
    sim.addParticle([0, 0, 0 ]);
    sim.update();
    expect(sim.getAverageDensity()).toBeGreaterThan(0);
  });

  it('getKineticEnergy is 0 at rest, > 0 after sim', () => {
    sim.addParticle([0, 5, 0 ]);
    expect(sim.getKineticEnergy()).toBe(0);
    sim.update();
    expect(sim.getKineticEnergy()).toBeGreaterThan(0);
  });

  it('clear removes all particles', () => {
    sim.addParticle([0, 0, 0 ]);
    sim.clear();
    expect(sim.getParticleCount()).toBe(0);
  });

  it('enforceBoundaries keeps particles in bounds', () => {
    sim.setConfig({
      boundaryMin: [-1, -1, -1 ],
      boundaryMax: [1, 1, 1 ],
    });
    sim.addParticle([0, -0.9, 0 ]);
    for (let i = 0; i < 10; i++) sim.update();
    const p = sim.getParticles()[0];
    expect(p.position[1]).toBeGreaterThanOrEqual(-1);
  });

  it('setConfig updates parameters', () => {
    sim.setConfig({ viscosity: 999 });
    // No crash
    sim.addParticle([0, 0, 0 ]);
    sim.update();
    expect(sim.getParticleCount()).toBe(1);
  });
});
