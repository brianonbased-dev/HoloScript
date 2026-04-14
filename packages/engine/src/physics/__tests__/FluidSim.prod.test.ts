/**
 * FluidSim — Production Test Suite
 *
 * Covers: addParticle, addBlock, update (SPH kernels + boundary enforcement),
 * getParticles, getParticleCount, getAverageDensity, getKineticEnergy,
 * clear, setConfig.
 */
import { describe, it, expect } from 'vitest';
import { FluidSim } from '..';

describe('FluidSim — Production', () => {
  // ─── Particle Management ──────────────────────────────────────────
  it('addParticle increases count', () => {
    const f = new FluidSim();
    f.addParticle([0, 0, 0 ]);
    expect(f.getParticleCount()).toBe(1);
  });

  it('addBlock creates grid of particles', () => {
    const f = new FluidSim();
    const count = f.addBlock([0, 0, 0 ], [1, 1, 1 ], 1);
    expect(count).toBe(8); // 2*2*2
    expect(f.getParticleCount()).toBe(8);
  });

  it('addParticle with velocity', () => {
    const f = new FluidSim();
    f.addParticle([0, 0, 0 ], [5, 0, 0 ]);
    const p = f.getParticles()[0];
    expect(p.velocity[0]).toBe(5);
  });

  // ─── Simulation ───────────────────────────────────────────────────
  it('update moves particles under gravity', () => {
    const f = new FluidSim();
    f.addParticle([0, 5, 0 ]);
    f.update();
    const p = f.getParticles()[0];
    expect(p.position[1]).toBeLessThan(5);
  });

  it('update computes density', () => {
    const f = new FluidSim();
    f.addBlock([0, 0, 0 ], [0.5, 0.5, 0 ], 0.5);
    f.update();
    expect(f.getAverageDensity()).toBeGreaterThan(0);
  });

  it('boundary enforcement keeps particles in bounds', () => {
    const f = new FluidSim({
      boundaryMin: [-1, -1, -1 ],
      boundaryMax: [1, 1, 1 ],
    });
    f.addParticle([0, 0, 0 ], [1000, 0, 0 ]);
    f.update();
    const p = f.getParticles()[0];
    expect(p.position[0]).toBeLessThanOrEqual(1);
  });

  // ─── Queries ──────────────────────────────────────────────────────
  it('getKineticEnergy returns sum of kinetic energy', () => {
    const f = new FluidSim();
    f.addParticle([0, 0, 0 ], [10, 0, 0 ]);
    expect(f.getKineticEnergy()).toBe(50); // 0.5 * 1 * 100
  });

  it('getAverageDensity returns 0 for empty sim', () => {
    const f = new FluidSim();
    expect(f.getAverageDensity()).toBe(0);
  });

  // ─── Management ───────────────────────────────────────────────────
  it('clear removes all particles', () => {
    const f = new FluidSim();
    f.addParticle([0, 0, 0 ]);
    f.clear();
    expect(f.getParticleCount()).toBe(0);
  });

  it('setConfig updates configuration', () => {
    const f = new FluidSim();
    f.setConfig({ viscosity: 500 });
    // no crash, config updated
    f.addParticle([0, 0, 0 ]);
    f.update();
    expect(f.getParticleCount()).toBe(1);
  });
});
