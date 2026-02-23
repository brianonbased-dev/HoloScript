/**
 * PhysicsIntegration Production Tests
 *
 * Tests DestructionToGranularConverter, GranularToDestructionStress,
 * FluidGranularInteraction, ClothFluidInteraction, PhysicsIntegrationManager.
 * All physics subsystems mocked via fake objects (no real simulation).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  DestructionToGranularConverter,
  GranularToDestructionStress,
  FluidGranularInteraction,
  ClothFluidInteraction,
  PhysicsIntegrationManager,
} from '../../integrations/PhysicsIntegration';

// ── Mock helpers ──────────────────────────────────────────────────────────────

function makeFragment(id: number, active: boolean, volume: number, pos = { x: 0, y: 0, z: 0 }) {
  return { id, active, volume, position: pos };
}

function makeFractureSystem(fragments: ReturnType<typeof makeFragment>[]) {
  const recycled: number[] = [];
  const stressed: Array<{ id: number; stress: number }> = [];
  return {
    getFragments: () => fragments,
    recycleFragment: (id: number) => recycled.push(id),
    applyStress: (id: number, stress: number) => stressed.push({ id, stress }),
    _recycled: recycled,
    _stressed: stressed,
  };
}

function makeGranularSystem() {
  const particles: any[] = [];
  let nextId = 0;
  const config = { material: { cohesion: 0.1, friction: 0.5, restitution: 0.2, density: 2000 } };
  return {
    addParticle: (pos: any, radius: number) => {
      const id = nextId++;
      particles.push({
        id,
        position: { ...pos },
        radius,
        mass: (4 / 3) * Math.PI * radius ** 3 * config.material.density,
        velocity: { x: 0, y: 0, z: 0 },
        force: { x: 0, y: 0, z: 0 },
      });
      return id;
    },
    getParticle: (id: number) => particles.find(p => p.id === id),
    getParticles: () => particles,
    getConfig: () => config,
    updateConfig: (c: any) => { config.material = { ...config.material, ...c.material }; },
    _particles: particles,
  };
}

function makeFluidSystem(densityAtPos = 0.0) {
  return {
    getDensityAt: (_pos: any) => densityAtPos,
  };
}

function makeClothSystem() {
  const particles: any[] = [
    {
      position: { x: 0, y: 0, z: 0 },
      velocity: { x: 1, y: -1, z: 0 },
      force: { x: 0, y: 0, z: 0 },
      mass: 0.5,
    },
  ];
  return { getParticles: () => particles, _particles: particles };
}

// ── DestructionToGranularConverter ────────────────────────────────────────────

describe('DestructionToGranularConverter — constructor / defaults', () => {

  it('creates converter with default config', () => {
    const c = new DestructionToGranularConverter();
    const cfg = c.getConfig();
    expect(cfg.enableDestructionToGranular).toBe(true);
    expect(cfg.minFragmentSize).toBe(0.01);
    expect(cfg.particleSizeScale).toBe(1.0);
    expect(cfg.particleDensity).toBe(2400);
  });

  it('overrides default config', () => {
    const c = new DestructionToGranularConverter({ minFragmentSize: 0.05, particleDensity: 1800 });
    expect(c.getConfig().minFragmentSize).toBe(0.05);
    expect(c.getConfig().particleDensity).toBe(1800);
  });

  it('initial stats are all zero', () => {
    const c = new DestructionToGranularConverter();
    const s = c.getStats();
    expect(s.fragmentsConverted).toBe(0);
    expect(s.particlesCreated).toBe(0);
    expect(s.totalVolume).toBe(0);
    expect(s.averageParticleSize).toBe(0);
  });
});

describe('DestructionToGranularConverter — convertDestroyedFragments', () => {

  it('returns empty stats when enableDestructionToGranular=false', () => {
    const c = new DestructionToGranularConverter({ enableDestructionToGranular: false });
    const fracture = makeFractureSystem([makeFragment(1, false, 0.5)]);
    const granular = makeGranularSystem();
    const stats = c.convertDestroyedFragments(fracture as any, granular as any);
    expect(stats.fragmentsConverted).toBe(0);
    expect(granular._particles).toHaveLength(0);
  });

  it('converts destroyed (inactive) fragments to particles', () => {
    const c = new DestructionToGranularConverter();
    const fracture = makeFractureSystem([makeFragment(1, false, 0.5)]);
    const granular = makeGranularSystem();
    const stats = c.convertDestroyedFragments(fracture as any, granular as any);
    expect(stats.fragmentsConverted).toBe(1);
    expect(stats.particlesCreated).toBe(1);
    expect(granular._particles).toHaveLength(1);
  });

  it('skips active fragments', () => {
    const c = new DestructionToGranularConverter();
    const fracture = makeFractureSystem([makeFragment(1, true, 0.5)]);
    const granular = makeGranularSystem();
    const stats = c.convertDestroyedFragments(fracture as any, granular as any);
    expect(stats.fragmentsConverted).toBe(0);
  });

  it('skips fragments below minFragmentSize', () => {
    const c = new DestructionToGranularConverter({ minFragmentSize: 1.0 });
    const fracture = makeFractureSystem([makeFragment(1, false, 0.001)]);
    const granular = makeGranularSystem();
    c.convertDestroyedFragments(fracture as any, granular as any);
    expect(granular._particles).toHaveLength(0);
  });

  it('recycles fragments when recycleFragments=true', () => {
    const c = new DestructionToGranularConverter();
    const fracture = makeFractureSystem([makeFragment(7, false, 0.5)]);
    const granular = makeGranularSystem();
    c.convertDestroyedFragments(fracture as any, granular as any, true);
    expect(fracture._recycled).toContain(7);
  });

  it('does not recycle when recycleFragments=false', () => {
    const c = new DestructionToGranularConverter();
    const fracture = makeFractureSystem([makeFragment(7, false, 0.5)]);
    const granular = makeGranularSystem();
    c.convertDestroyedFragments(fracture as any, granular as any, false);
    expect(fracture._recycled).not.toContain(7);
  });

  it('does not convert same fragment twice', () => {
    const c = new DestructionToGranularConverter();
    const fracture = makeFractureSystem([makeFragment(3, false, 0.5)]);
    const granular = makeGranularSystem();
    c.convertDestroyedFragments(fracture as any, granular as any);
    c.convertDestroyedFragments(fracture as any, granular as any); // second call
    expect(granular._particles).toHaveLength(1); // not 2
  });

  it('accumulates stats across multiple calls', () => {
    const c = new DestructionToGranularConverter();
    const fracture1 = makeFractureSystem([makeFragment(1, false, 0.5)]);
    const fracture2 = makeFractureSystem([makeFragment(2, false, 0.5)]);
    const granular = makeGranularSystem();
    c.convertDestroyedFragments(fracture1 as any, granular as any);
    c.convertDestroyedFragments(fracture2 as any, granular as any);
    expect(c.getStats().fragmentsConverted).toBe(2);
  });

  it('particle radius is calculated from fragment volume', () => {
    const c = new DestructionToGranularConverter();
    const vol = 0.524; // sphere V ≈ 4/3 π r³ for r≈0.5
    const fracture = makeFractureSystem([makeFragment(1, false, vol)]);
    const granular = makeGranularSystem();
    c.convertDestroyedFragments(fracture as any, granular as any);
    const p = granular._particles[0];
    expect(p.radius).toBeGreaterThan(0);
  });
});

describe('DestructionToGranularConverter — convertWithVelocity', () => {

  it('converts destroyed fragments with outward velocity', () => {
    const c = new DestructionToGranularConverter();
    const frag = makeFragment(1, false, 0.5, { x: 5, y: 0, z: 0 });
    const fracture = makeFractureSystem([frag]);
    const granular = makeGranularSystem();
    const stats = c.convertWithVelocity(
      fracture as any, granular as any,
      { x: 0, y: 0, z: 0 }, 10
    );
    expect(stats.particlesCreated).toBe(1);
    const p = granular._particles[0];
    expect(p.velocity.x).not.toBe(0); // should have outward velocity
  });

  it('skips sub-minSize fragments', () => {
    const c = new DestructionToGranularConverter({ minFragmentSize: 1.0 });
    const fracture = makeFractureSystem([makeFragment(1, false, 0.001)]);
    const granular = makeGranularSystem();
    c.convertWithVelocity(fracture as any, granular as any, { x: 0, y: 0, z: 0 }, 5);
    expect(granular._particles).toHaveLength(0);
  });
});

describe('DestructionToGranularConverter — resetStats / updateConfig / getConfig', () => {

  it('resetStats clears all counters', () => {
    const c = new DestructionToGranularConverter();
    const fracture = makeFractureSystem([makeFragment(1, false, 0.5)]);
    const granular = makeGranularSystem();
    c.convertDestroyedFragments(fracture as any, granular as any);
    c.resetStats();
    const s = c.getStats();
    expect(s.fragmentsConverted).toBe(0);
    expect(s.particlesCreated).toBe(0);
  });

  it('updateConfig merges into existing config', () => {
    const c = new DestructionToGranularConverter({ minFragmentSize: 0.01 });
    c.updateConfig({ particleDensity: 1000 });
    expect(c.getConfig().particleDensity).toBe(1000);
    expect(c.getConfig().minFragmentSize).toBe(0.01); // unchanged
  });

  it('getConfig returns a copy (not reference)', () => {
    const c = new DestructionToGranularConverter();
    const cfg1 = c.getConfig();
    cfg1.particleDensity = 9999;
    expect(c.getConfig().particleDensity).toBe(2400); // unchanged
  });
});

// ── GranularToDestructionStress ───────────────────────────────────────────────

describe('GranularToDestructionStress — applyPileStress', () => {

  it('does not throw with empty systems', () => {
    const gs = new GranularToDestructionStress();
    const granular = makeGranularSystem();
    const fracture = makeFractureSystem([]);
    expect(() => gs.applyPileStress(granular as any, fracture as any)).not.toThrow();
  });

  it('applies stress to fragments with particles above them', () => {
    const gs = new GranularToDestructionStress();
    const granular = makeGranularSystem();
    // Add a particle above the fragment
    const particleId = granular.addParticle({ x: 0, y: 2, z: 0 }, 0.1);
    const p = granular.getParticle(particleId)!;
    p.mass = 5;
    const fracture = makeFractureSystem([makeFragment(1, true, 0.5, { x: 0, y: 0, z: 0 })]);
    gs.applyPileStress(granular as any, fracture as any);
    expect(fracture._stressed.length).toBeGreaterThan(0);
    expect(fracture._stressed[0].stress).toBeGreaterThan(0);
  });

  it('skips inactive fragments', () => {
    const gs = new GranularToDestructionStress();
    const granular = makeGranularSystem();
    granular.addParticle({ x: 0, y: 2, z: 0 }, 0.1);
    const fracture = makeFractureSystem([makeFragment(1, false, 0.5, { x: 0, y: 0, z: 0 })]);
    gs.applyPileStress(granular as any, fracture as any);
    expect(fracture._stressed).toHaveLength(0);
  });

  it('stressMultiplier scales the applied force', () => {
    const gs = new GranularToDestructionStress();
    const granular1 = makeGranularSystem();
    const granular2 = makeGranularSystem();
    granular1.addParticle({ x: 0, y: 2, z: 0 }, 0.1);
    granular1.getParticle(0)!.mass = 5;
    granular2.addParticle({ x: 0, y: 2, z: 0 }, 0.1);
    granular2.getParticle(0)!.mass = 5;

    const f1 = makeFractureSystem([makeFragment(1, true, 0.5, { x: 0, y: 0, z: 0 })]);
    const f2 = makeFractureSystem([makeFragment(1, true, 0.5, { x: 0, y: 0, z: 0 })]);

    gs.applyPileStress(granular1 as any, f1 as any, 1.0);
    gs.applyPileStress(granular2 as any, f2 as any, 2.0);

    expect(f2._stressed[0].stress).toBeCloseTo(f1._stressed[0].stress * 2, 5);
  });
});

// ── FluidGranularInteraction ──────────────────────────────────────────────────

describe('FluidGranularInteraction — applyFluidForces', () => {

  it('does not throw with empty particles', () => {
    const fi = new FluidGranularInteraction();
    expect(() =>
      fi.applyFluidForces(makeFluidSystem(0) as any, makeGranularSystem() as any)
    ).not.toThrow();
  });

  it('applies buoyancy when fluid density > 0.1', () => {
    const fi = new FluidGranularInteraction();
    const granular = makeGranularSystem();
    granular.addParticle({ x: 0, y: 0, z: 0 }, 0.5);
    fi.applyFluidForces(makeFluidSystem(100) as any, granular as any);
    expect(granular._particles[0].force.y).toBeGreaterThan(0);
  });

  it('does not apply forces when fluid density ≤ 0.1', () => {
    const fi = new FluidGranularInteraction();
    const granular = makeGranularSystem();
    granular.addParticle({ x: 0, y: 0, z: 0 }, 0.5);
    fi.applyFluidForces(makeFluidSystem(0.05) as any, granular as any);
    expect(granular._particles[0].force.y).toBe(0);
  });
});

describe('FluidGranularInteraction — applyWetness', () => {

  it('increases cohesion when fluid density > 0.5', () => {
    const fi = new FluidGranularInteraction();
    const granular = makeGranularSystem();
    granular.addParticle({ x: 0, y: 0, z: 0 }, 0.3);
    const before = granular.getConfig().material.cohesion;
    fi.applyWetness(makeFluidSystem(800) as any, granular as any);
    expect(granular.getConfig().material.cohesion).toBeGreaterThan(before);
  });

  it('does not change cohesion when fluid density ≤ 0.5', () => {
    const fi = new FluidGranularInteraction();
    const granular = makeGranularSystem();
    granular.addParticle({ x: 0, y: 0, z: 0 }, 0.3);
    const before = granular.getConfig().material.cohesion;
    fi.applyWetness(makeFluidSystem(0.1) as any, granular as any);
    expect(granular.getConfig().material.cohesion).toBe(before);
  });
});

// ── ClothFluidInteraction ─────────────────────────────────────────────────────

describe('ClothFluidInteraction — applyFluidDrag', () => {

  it('does not throw with no particles', () => {
    const ci = new ClothFluidInteraction();
    const cloth = { getParticles: () => [] };
    expect(() => ci.applyFluidDrag(cloth as any, makeFluidSystem(0) as any)).not.toThrow();
  });

  it('modifies particle velocity when in fluid', () => {
    const ci = new ClothFluidInteraction();
    const cloth = makeClothSystem();
    const origVx = cloth._particles[0].velocity.x; // = 1
    ci.applyFluidDrag(cloth as any, makeFluidSystem(500) as any);
    // Velocity was changed by the drag computation (not necessarily reduced in magnitude
    // since large drag coefficient can overshoot)
    expect(cloth._particles[0].velocity.x).not.toBe(origVx);
  });
});

describe('ClothFluidInteraction — applyWetWeight', () => {

  it('decreases y-force (adds downward gravity) in wet zones', () => {
    const ci = new ClothFluidInteraction();
    const cloth = makeClothSystem();
    ci.applyWetWeight(cloth as any, makeFluidSystem(800) as any);
    expect(cloth._particles[0].force.y).toBeLessThan(0);
  });

  it('no force change when fluid density ≤ 0.5', () => {
    const ci = new ClothFluidInteraction();
    const cloth = makeClothSystem();
    ci.applyWetWeight(cloth as any, makeFluidSystem(0.1) as any);
    expect(cloth._particles[0].force.y).toBe(0);
  });
});

// ── PhysicsIntegrationManager ─────────────────────────────────────────────────

describe('PhysicsIntegrationManager', () => {

  it('instantiates with all sub-integrations', () => {
    const m = new PhysicsIntegrationManager();
    expect(m.destructionToGranular).toBeInstanceOf(DestructionToGranularConverter);
    expect(m.granularToDestruction).toBeInstanceOf(GranularToDestructionStress);
    expect(m.fluidGranular).toBeInstanceOf(FluidGranularInteraction);
    expect(m.clothFluid).toBeInstanceOf(ClothFluidInteraction);
  });

  it('update with empty systems does not throw', () => {
    const m = new PhysicsIntegrationManager();
    expect(() => m.update({})).not.toThrow();
  });

  it('update triggers destructionToGranular when fracture+granular provided', () => {
    const m = new PhysicsIntegrationManager();
    const frag = makeFragment(1, false, 0.5);
    const fracture = makeFractureSystem([frag]);
    const granular = makeGranularSystem();
    m.update({ fracture: fracture as any, granular: granular as any });
    expect(granular._particles).toHaveLength(1);
  });

  it('update does NOT call fluid integration when fluid missing', () => {
    const m = new PhysicsIntegrationManager();
    const granular = makeGranularSystem();
    granular.addParticle({ x: 0, y: 0, z: 0 }, 0.3);
    // No fluid system
    expect(() => m.update({ granular: granular as any })).not.toThrow();
    expect(granular._particles[0].force.y).toBe(0);
  });

  it('accepts custom config for DestructionToGranularConverter', () => {
    const m = new PhysicsIntegrationManager({ minFragmentSize: 5.0 });
    expect(m.destructionToGranular.getConfig().minFragmentSize).toBe(5.0);
  });
});
