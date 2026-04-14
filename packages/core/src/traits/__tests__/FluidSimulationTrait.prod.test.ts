/**
 * FluidSimulationTrait — Production Tests
 * Tests: kernel functions, SpatialHash, FluidSimulationSystem
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  poly6Kernel,
  spikyKernelGradient,
  viscosityKernelLaplacian,
  SpatialHash,
  FluidSimulationSystem,
} from '../FluidSimulationTrait';

// =============================================================================
// Kernel Functions
// =============================================================================

describe('poly6Kernel', () => {
  it('returns 0 when r > h', () => expect(poly6Kernel(0.1, 0.05)).toBe(0));
  it('returns 0 when r < 0', () => expect(poly6Kernel(-1, 0.04)).toBe(0));
  it('returns positive value at r=0', () => expect(poly6Kernel(0, 0.04)).toBeGreaterThan(0));
  it('max at r=0, decreases as r increases', () => {
    const h = 0.04;
    const w0 = poly6Kernel(0, h);
    const w1 = poly6Kernel(0.02, h);
    const w2 = poly6Kernel(0.039, h);
    expect(w0).toBeGreaterThan(w1);
    expect(w1).toBeGreaterThan(w2);
  });
  it('continuity at r=h gives 0', () => expect(poly6Kernel(0.04, 0.04)).toBeCloseTo(0, 8));
});

describe('spikyKernelGradient', () => {
  it('returns zero when r > h', () => {
    const g = spikyKernelGradient(1, 0, 0, 0.04);
    expect(g).toEqual([0, 0, 0 ]);
  });
  it('returns zero when r nearly 0 (avoids divide-by-zero)', () => {
    const g = spikyKernelGradient(0.000001, 0, 0, 0.04);
    expect(g).toEqual([0, 0, 0 ]);
  });
  it('returns non-zero when inside h', () => {
    const g = spikyKernelGradient(0.02, 0, 0, 0.04);
    expect(Math.abs(g.x)).toBeGreaterThan(0);
  });
  it('gradient points in direction of displacement', () => {
    const g = spikyKernelGradient(0.02, 0, 0, 0.04);
    expect(g.x).toBeLessThan(0); // repulsive (negative coefficient)
  });
});

describe('viscosityKernelLaplacian', () => {
  it('returns 0 when r > h', () => expect(viscosityKernelLaplacian(0.1, 0.04)).toBe(0));
  it('returns 0 when r < 0', () => expect(viscosityKernelLaplacian(-1, 0.04)).toBe(0));
  it('returns positive when r <= h', () =>
    expect(viscosityKernelLaplacian(0.02, 0.04)).toBeGreaterThan(0));
  it('larger at smaller r (monotonically decreasing)', () => {
    const h = 0.04;
    expect(viscosityKernelLaplacian(0.01, h)).toBeGreaterThan(viscosityKernelLaplacian(0.03, h));
  });
});

// =============================================================================
// SpatialHash
// =============================================================================

describe('SpatialHash', () => {
  let hash: SpatialHash;
  beforeEach(() => {
    hash = new SpatialHash(0.04);
  });

  it('getNeighbors returns empty for empty grid', () => {
    expect(hash.getNeighbors([0, 0, 0 ])).toHaveLength(0);
  });
  it('insert + getNeighbors finds particle in same cell', () => {
    hash.insert(0, [0.01, 0, 0 ]);
    expect(hash.getNeighbors([0.01, 0, 0 ])).toContain(0);
  });
  it('getNeighbors finds particle in adjacent cell', () => {
    hash.insert(1, [0.05, 0, 0 ]); // adjacent cell to 0,0,0
    expect(hash.getNeighbors([0, 0, 0 ])).toContain(1);
  });
  it('does NOT find particle more than 1 cell away', () => {
    hash.insert(2, [0.5, 0, 0 ]); // ~12 cells away
    const neighbors = hash.getNeighbors([0, 0, 0 ]);
    expect(neighbors).not.toContain(2);
  });
  it('clear removes all entries', () => {
    hash.insert(0, [0, 0, 0 ]);
    hash.clear();
    expect(hash.getNeighbors([0, 0, 0 ])).toHaveLength(0);
  });
  it('multiple particles in same cell all returned', () => {
    hash.insert(0, [0.01, 0, 0 ]);
    hash.insert(1, [0.02, 0, 0 ]);
    const ns = hash.getNeighbors([0.01, 0, 0 ]);
    expect(ns).toContain(0);
    expect(ns).toContain(1);
  });
});

// =============================================================================
// FluidSimulationSystem
// =============================================================================

describe('FluidSimulationSystem — construction & defaults', () => {
  it('creates with water defaults', () => {
    const sim = new FluidSimulationSystem();
    const cfg = sim.getConfig();
    expect(cfg.restDensity).toBe(1000);
    expect(cfg.viscosity).toBeCloseTo(0.001);
    expect(cfg.gravity[1]).toBeCloseTo(-9.81);
    expect(cfg.solverType).toBe('sph');
  });
  it('accepts partial config overrides', () => {
    const sim = new FluidSimulationSystem({ restDensity: 800, viscosity: 0.01 });
    expect(sim.getConfig().restDensity).toBe(800);
    expect(sim.getConfig().viscosity).toBe(0.01);
    expect(sim.getConfig().solverType).toBe('sph'); // fallback
  });
});

describe('FluidSimulationSystem — particle management', () => {
  let sim: FluidSimulationSystem;
  beforeEach(() => {
    sim = new FluidSimulationSystem();
  });

  it('starts with 0 particles', () => expect(sim.getParticleCount()).toBe(0));
  it('addParticle returns incrementing IDs', () => {
    const id0 = sim.addParticle([0, 0, 0 ]);
    const id1 = sim.addParticle([1, 0, 0 ]);
    expect(id0).toBe(0);
    expect(id1).toBe(1);
  });
  it('getParticle retrieves by id', () => {
    const id = sim.addParticle([1, 2, 3 ]);
    const p = sim.getParticle(id);
    expect(p?.position).toEqual([1, 2, 3 ]);
  });
  it('addParticle with velocity stores velocity', () => {
    const id = sim.addParticle([0, 0, 0 ], [1, 2, 3 ]);
    expect(sim.getParticle(id)?.velocity).toEqual([1, 2, 3 ]);
  });
  it('addParticle without velocity defaults to zero', () => {
    const id = sim.addParticle([0, 0, 0 ]);
    expect(sim.getParticle(id)?.velocity).toEqual([0, 0, 0 ]);
  });
  it('particle density starts at restDensity', () => {
    const id = sim.addParticle([0, 0, 0 ]);
    expect(sim.getParticle(id)?.density).toBe(1000);
  });
  it('removeParticle returns true and reduces count', () => {
    const id = sim.addParticle([0, 0, 0 ]);
    expect(sim.removeParticle(id)).toBe(true);
    expect(sim.getParticleCount()).toBe(0);
  });
  it('removeParticle returns false for unknown id', () => {
    expect(sim.removeParticle(999)).toBe(false);
  });
  it('clearParticles removes all and resets IDs', () => {
    sim.addParticle([0, 0, 0 ]);
    sim.addParticle([1, 0, 0 ]);
    sim.clearParticles();
    expect(sim.getParticleCount()).toBe(0);
    const newId = sim.addParticle([0, 0, 0 ]);
    expect(newId).toBe(0); // IDs reset
  });
  it('getParticles returns copy array', () => {
    sim.addParticle([0, 0, 0 ]);
    expect(sim.getParticles()).toHaveLength(1);
  });
});

describe('FluidSimulationSystem — boundary management', () => {
  let sim: FluidSimulationSystem;
  beforeEach(() => {
    sim = new FluidSimulationSystem();
  });

  it('starts with empty boundaries', () => expect(sim.getBoundaries()).toHaveLength(0));
  it('addBoundary + getBoundaries', () => {
    sim.addBoundary({
      type: 'plane',
      position: [0, 0, 0],
      normal: [0, 1, 0 ],
      restitution: 0.5,
    });
    expect(sim.getBoundaries()).toHaveLength(1);
  });
  it('clearBoundaries empties list', () => {
    sim.addBoundary({
      type: 'plane',
      position: [0, 0, 0],
      normal: [0, 1, 0 ],
      restitution: 0,
    });
    sim.clearBoundaries();
    expect(sim.getBoundaries()).toHaveLength(0);
  });
});

describe('FluidSimulationSystem — setConfig', () => {
  it('updates config fields', () => {
    const sim = new FluidSimulationSystem();
    sim.setConfig({ viscosity: 0.1 });
    expect(sim.getConfig().viscosity).toBe(0.1);
  });
  it('gridCellSize change rebuilds SpatialHash (no error)', () => {
    const sim = new FluidSimulationSystem();
    expect(() => sim.setConfig({ gridCellSize: 0.1 })).not.toThrow();
  });
});

describe('FluidSimulationSystem — step() physics', () => {
  it('gravity pulls particles down over time', () => {
    const sim = new FluidSimulationSystem({ timeStep: 0.016 });
    const id = sim.addParticle([0, 1, 0 ]); // start at y=1
    for (let i = 0; i < 10; i++) sim.step();
    const p = sim.getParticle(id)!;
    expect(p.position[1]).toBeLessThan(1); // fell due to gravity
  });
  it("step with zero gravity doesn't change y position (no neighbors)", () => {
    const sim = new FluidSimulationSystem({ gravity: [0, 0, 0 ], timeStep: 0.016 });
    const id = sim.addParticle([0, 0, 0 ]);
    sim.step();
    expect(sim.getParticle(id)?.position[1]).toBeCloseTo(0);
  });
  it('velocity clamped to maxVelocity', () => {
    const sim = new FluidSimulationSystem({
      maxVelocity: 0.01,
      gravity: [0, -9.81, 0 ],
      timeStep: 1.0,
    });
    const id = sim.addParticle([0, 100, 0 ]);
    sim.step();
    const p = sim.getParticle(id)!;
    const speed = Math.sqrt(p.velocity[0] ** 2 + p.velocity[1] ** 2 + p.velocity[2] ** 2);
    expect(speed).toBeLessThanOrEqual(0.011);
  });
  it('FLIP solver falls back to SPH (no crash)', () => {
    const sim = new FluidSimulationSystem({ solverType: 'flip' });
    sim.addParticle([0, 0, 0 ]);
    expect(() => sim.step()).not.toThrow();
  });
  it('hybrid solver runs without crash', () => {
    const sim = new FluidSimulationSystem({ solverType: 'hybrid' });
    sim.addParticle([0, 0, 0 ]);
    expect(() => sim.step()).not.toThrow();
  });
  it('step with no particles completes without error', () => {
    const sim = new FluidSimulationSystem();
    expect(() => sim.step()).not.toThrow();
  });
  it('custom dt overrides timeStep', () => {
    const sim = new FluidSimulationSystem({ gravity: [0, -9.81, 0 ] });
    const id = sim.addParticle([0, 10, 0 ]);
    sim.step(0.001); // tiny dt
    const p = sim.getParticle(id)!;
    expect(p.position[1]).toBeGreaterThan(9.99); // barely moved
  });
});

describe('FluidSimulationSystem — plane boundary collision', () => {
  it('floor plane prevents particles from going below y=0', () => {
    const sim = new FluidSimulationSystem({ gravity: [0, -9.81, 0 ], timeStep: 0.1 });
    sim.addBoundary({
      type: 'plane',
      position: [0, 0, 0],
      normal: [0, 1, 0 ],
      restitution: 0,
    });
    const id = sim.addParticle([0, 0.1, 0 ]);
    for (let i = 0; i < 20; i++) sim.step();
    const p = sim.getParticle(id)!;
    expect(p.position[1]).toBeGreaterThanOrEqual(sim.getConfig().particleRadius - 0.001);
  });
});

describe('FluidSimulationSystem — sphere boundary', () => {
  it('sphere boundary keeps particles inside', () => {
    const sim = new FluidSimulationSystem({ gravity: [0, 0, 0 ], timeStep: 0.016 });
    sim.addBoundary({
      type: 'sphere',
      position: [0, 0, 0],
      radius: 1.0,
      restitution: 0,
    });
    // Start outside radius
    const id = sim.addParticle([1.5, 0, 0 ]);
    sim.step();
    const p = sim.getParticle(id)!;
    const dist = Math.sqrt(p.position[0] ** 2 + p.position[1] ** 2 + p.position[2] ** 2);
    expect(dist).toBeLessThanOrEqual(1.0 - sim.getConfig().particleRadius + 0.01);
  });
});

describe('FluidSimulationSystem — box boundary', () => {
  it('box boundary clamps particles within extents', () => {
    const sim = new FluidSimulationSystem({ gravity: [0, 0, 0 ], timeStep: 0.016 });
    const boxSize = [2, 2, 2 ];
    sim.addBoundary({
      type: 'box',
      position: [0, 0, 0],
      size: boxSize,
      restitution: 0,
    });
    // Place particle outside box on x axis
    const id = sim.addParticle([2.5, 0, 0 ], [5, 0, 0 ]);
    sim.step();
    const p = sim.getParticle(id)!;
    expect(p.position[0]).toBeLessThanOrEqual(1.0 - sim.getConfig().particleRadius + 0.01);
  });
});

describe('FluidSimulationSystem — getDensityAt / isInsideFluid', () => {
  it('getDensityAt returns 0 for empty fluid', () => {
    const sim = new FluidSimulationSystem();
    expect(sim.getDensityAt([0, 0, 0 ])).toBe(0);
  });
  it('getDensityAt returns positive near particle cluster', () => {
    const sim = new FluidSimulationSystem({ smoothingRadius: 0.1 });
    sim.addParticle([0, 0, 0 ]);
    sim.addParticle([0.01, 0, 0 ]);
    sim.addParticle([0, 0.01, 0 ]);
    expect(sim.getDensityAt([0, 0, 0 ])).toBeGreaterThan(0);
  });
  it('isInsideFluid returns false for empty simulation', () => {
    const sim = new FluidSimulationSystem();
    expect(sim.isInsideFluid([0, 0, 0 ])).toBe(false);
  });
  it('isInsideFluid returns true at dense particle cluster', () => {
    const sim = new FluidSimulationSystem({ smoothingRadius: 0.15, restDensity: 1 });
    for (let i = 0; i < 20; i++) {
      sim.addParticle([(i % 4) * 0.01, Math.floor(i / 4) * 0.01, 0 ]);
    }
    expect(sim.isInsideFluid([0.01, 0.01, 0 ])).toBe(true);
  });
});

describe('FluidSimulationSystem — multi-particle SPH interactions', () => {
  it('density field is higher near particles than away (verifies kernel integration)', () => {
    const sim = new FluidSimulationSystem({ smoothingRadius: 0.1, restDensity: 1 });
    sim.addParticle([0, 0, 0 ]);
    sim.addParticle([0.05, 0, 0 ]); // within smoothing radius
    // getDensityAt iterates all particles directly (no spatial hash needed)
    const densityAt = sim.getDensityAt([0.025, 0, 0 ]); // midpoint
    const densityFar = sim.getDensityAt([5, 0, 0 ]); // far away
    expect(densityAt).toBeGreaterThan(0);
    expect(densityAt).toBeGreaterThan(densityFar);
  });
});
