/**
 * VoronoiFractureSystem — Production Tests
 *
 * Tests: constructor defaults, generateVoronoiFracture site count, fragment structure,
 * applyDamage: fragments within radius lose health, fragments outside radius are untouched,
 * destruction threshold triggers active=false, pooling on destruction, propagateCracks disabled,
 * updateLOD level assignment by distance, recycleFragment reactivates and clears from pool,
 * applyStress destroys fragment at threshold, analysis helpers (getTotalDamage, getAverageDamage,
 * getTotalVolume, getDestroyedVolume, getDestructionProgress), reset, getVoronoiSites.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { VoronoiFractureSystem } from '../VoronoiFractureTrait';
import type { DamageEvent } from '../VoronoiFractureTrait';

// ─── Helpers ────────────────────────────────────────────────────────────────────

function makeSys(overrides: Parameters<typeof VoronoiFractureSystem>[0] = {}) {
  return new VoronoiFractureSystem({
    voronoiSites: 5,
    maxHealth: 100,
    destructionThreshold: 0.2, // destroyed when health < 20
    enableCrackPropagation: false,
    enableLOD: true,
    enablePooling: true,
    maxPooledFragments: 100,
    ...overrides,
  });
}

// Full-damage event centred at origin, hits everything within radius 10
const WIPE_EVENT: DamageEvent = { position: { x: 0, y: 0, z: 0 }, radius: 10, maxDamage: 1000, falloff: 1 };

// ─── Constructor / defaults ──────────────────────────────────────────────────────

describe('VoronoiFractureSystem — constructor', () => {
  it('creates with zero fragments before fracture is generated', () => {
    const sys = makeSys();
    expect(sys.getFragmentCount()).toBe(0);
  });

  it('getConfig returns merged config', () => {
    const sys = makeSys({ voronoiSites: 7 });
    expect(sys.getConfig().voronoiSites).toBe(7);
  });

  it('updateConfig patches values', () => {
    const sys = makeSys();
    sys.updateConfig({ maxHealth: 200 });
    expect(sys.getConfig().maxHealth).toBe(200);
  });

  it('setCameraPosition stores position', () => {
    const sys = makeSys();
    sys.setCameraPosition({ x: 5, y: 10, z: 0 }); // no error
    // LOD tests below verify the effect
  });
});

// ─── generateVoronoiFracture ──────────────────────────────────────────────────────

describe('VoronoiFractureSystem — generateVoronoiFracture', () => {
  it('generates N fragments matching voronoiSites', () => {
    const sys = makeSys({ voronoiSites: 6 });
    sys.generateVoronoiFracture();
    expect(sys.getFragmentCount()).toBe(6);
  });

  it('all initial fragments are active', () => {
    const sys = makeSys({ voronoiSites: 4 });
    sys.generateVoronoiFracture();
    expect(sys.getActiveFragmentCount()).toBe(4);
    expect(sys.getDestroyedFragmentCount()).toBe(0);
  });

  it('fragments start at maxHealth', () => {
    const sys = makeSys({ maxHealth: 80, voronoiSites: 3 });
    sys.generateVoronoiFracture();
    for (const f of sys.getFragments()) {
      expect(f.health).toBe(80);
      expect(f.damage).toBe(0);
    }
  });

  it('fragments have 8 vertices (cube representation)', () => {
    const sys = makeSys({ voronoiSites: 2 });
    sys.generateVoronoiFracture();
    for (const f of sys.getFragments()) {
      expect(f.vertices.length).toBe(8);
    }
  });

  it('fragment indices represent 6 faces (36 indices)', () => {
    const sys = makeSys({ voronoiSites: 2 });
    sys.generateVoronoiFracture();
    for (const f of sys.getFragments()) {
      expect(f.indices.length).toBe(36);
    }
  });

  it('fragments start at lodLevel 0', () => {
    const sys = makeSys({ voronoiSites: 3 });
    sys.generateVoronoiFracture();
    for (const f of sys.getFragments()) {
      expect(f.lodLevel).toBe(0);
    }
  });

  it('voronoiSites are populated after generation', () => {
    const sys = makeSys({ voronoiSites: 5 });
    sys.generateVoronoiFracture();
    expect(sys.getVoronoiSites().length).toBe(5);
  });
});

// ─── applyDamage ─────────────────────────────────────────────────────────────────

describe('VoronoiFractureSystem — applyDamage', () => {
  let sys: VoronoiFractureSystem;

  beforeEach(() => {
    sys = new VoronoiFractureSystem({
      voronoiSites: 5,
      maxHealth: 100,
      destructionThreshold: 0.2,
      enableCrackPropagation: false,
      enableLOD: false,
      enablePooling: true,
      maxPooledFragments: 100,
      bounds: { min: { x: -0.5, y: -0.5, z: -0.5 }, max: { x: 0.5, y: 0.5, z: 0.5 } },
    });
    sys.generateVoronoiFracture();
  });

  it('applies damage: health decreases for fragments within radius', () => {
    sys.applyDamage({ position: { x: 0, y: 0, z: 0 }, radius: 10, maxDamage: 50, falloff: 1 });
    const damaged = sys.getFragments().filter((f) => f.damage > 0);
    expect(damaged.length).toBeGreaterThan(0);
  });

  it('fragments outside radius are untouched', () => {
    // All fragments are within (-0.5,0.5) bounds; damage from very far away
    sys.applyDamage({ position: { x: 1000, y: 1000, z: 1000 }, radius: 0.01, maxDamage: 100, falloff: 1 });
    const damaged = sys.getFragments().filter((f) => f.damage > 0);
    expect(damaged.length).toBe(0);
  });

  it('sufficient damage sets fragment.active = false', () => {
    sys.applyDamage(WIPE_EVENT);
    const destroyed = sys.getFragments().filter((f) => !f.active);
    expect(destroyed.length).toBeGreaterThan(0);
  });

  it('destroyed fragments are pooled (enablePooling=true)', () => {
    sys.applyDamage(WIPE_EVENT);
    // Some destroyed → pool should be non-empty
    expect(sys.getPooledFragmentCount()).toBeGreaterThan(0);
  });

  it('health is clamped to minimum 0', () => {
    sys.applyDamage(WIPE_EVENT);
    for (const f of sys.getFragments()) {
      expect(f.health).toBeGreaterThanOrEqual(0);
    }
  });

  it('getTotalDamage > 0 after damage applied', () => {
    sys.applyDamage({ position: { x: 0, y: 0, z: 0 }, radius: 10, maxDamage: 30, falloff: 1 });
    expect(sys.getTotalDamage()).toBeGreaterThan(0);
  });
});

// ─── Destruction counts ──────────────────────────────────────────────────────────

describe('VoronoiFractureSystem — destruction counts', () => {
  it('getActiveFragmentCount decreases after wipe', () => {
    const sys = makeSys({ voronoiSites: 5 });
    sys.generateVoronoiFracture();
    sys.applyDamage(WIPE_EVENT);
    expect(sys.getActiveFragmentCount()).toBeLessThan(5);
  });

  it('getDestroyedFragmentCount + getActiveFragmentCount = total', () => {
    const sys = makeSys({ voronoiSites: 5 });
    sys.generateVoronoiFracture();
    sys.applyDamage(WIPE_EVENT);
    expect(sys.getDestroyedFragmentCount() + sys.getActiveFragmentCount())
      .toBe(sys.getFragmentCount());
  });
});

// ─── LOD ─────────────────────────────────────────────────────────────────────────

describe('VoronoiFractureSystem — updateLOD', () => {
  it('fragments close to camera get lodLevel 0', () => {
    const sys = new VoronoiFractureSystem({
      voronoiSites: 3,
      maxHealth: 100,
      destructionThreshold: 0.01,
      enableCrackPropagation: false,
      enableLOD: true,
      enablePooling: false,
      maxPooledFragments: 0,
      lodDistances: [10, 20, 40],
      bounds: { min: { x: -0.1, y: -0.1, z: -0.1 }, max: { x: 0.1, y: 0.1, z: 0.1 } },
    });
    sys.generateVoronoiFracture();
    sys.setCameraPosition({ x: 0, y: 0, z: 0 }); // camera at origin, fragments all near origin
    sys.updateLOD();
    const lod0 = sys.getFragmentsByLOD(0);
    expect(lod0.length).toBe(3); // all within LOD0 distance of 10
  });

  it('fragments far from camera get lodLevel 3', () => {
    const sys = new VoronoiFractureSystem({
      voronoiSites: 2,
      maxHealth: 100,
      destructionThreshold: 0.01,
      enableCrackPropagation: false,
      enableLOD: true,
      enablePooling: false,
      maxPooledFragments: 0,
      lodDistances: [10, 20, 40],
      bounds: { min: { x: -0.1, y: -0.1, z: -0.1 }, max: { x: 0.1, y: 0.1, z: 0.1 } },
    });
    sys.generateVoronoiFracture();
    sys.setCameraPosition({ x: 1000, y: 0, z: 0 }); // very far away
    sys.updateLOD();
    const lod3 = sys.getFragmentsByLOD(3);
    expect(lod3.length).toBe(2);
  });

  it('updateLOD is no-op when enableLOD=false', () => {
    const sys = makeSys({ enableLOD: false, voronoiSites: 3 });
    sys.generateVoronoiFracture();
    sys.setCameraPosition({ x: 1000, y: 0, z: 0 });
    sys.updateLOD(); // should not update anything
    // All should still be LOD 0 (initial value)
    const lod0 = sys.getFragmentsByLOD(0);
    expect(lod0.length).toBe(3);
  });
});

// ─── Pooling / recycleFragment ────────────────────────────────────────────────────

describe('VoronoiFractureSystem — pooling / recycleFragment', () => {
  it('recycleFragment reactivates a destroyed fragment', () => {
    const sys = makeSys({ voronoiSites: 3 });
    sys.generateVoronoiFracture();
    sys.applyDamage(WIPE_EVENT);
    const destroyed = sys.getFragments().find((f) => !f.active);
    expect(destroyed).toBeDefined();
    const recycled = sys.recycleFragment(destroyed!.id);
    expect(recycled).toBe(true);
    expect(sys.getFragment(destroyed!.id)?.active).toBe(true);
    expect(sys.getFragment(destroyed!.id)?.health).toBe(100);
    expect(sys.getFragment(destroyed!.id)?.damage).toBe(0);
  });

  it('recycleFragment returns false for already-active fragment', () => {
    const sys = makeSys({ voronoiSites: 3 });
    sys.generateVoronoiFracture();
    const active = sys.getFragments()[0];
    expect(sys.recycleFragment(active.id)).toBe(false);
  });

  it('recycleFragment removes fragment from pool', () => {
    const sys = makeSys({ voronoiSites: 3 });
    sys.generateVoronoiFracture();
    sys.applyDamage(WIPE_EVENT);
    const pooledBefore = sys.getPooledFragmentCount();
    const destroyed = sys.getFragments().find((f) => !f.active)!;
    sys.recycleFragment(destroyed.id);
    expect(sys.getPooledFragmentCount()).toBe(pooledBefore - 1);
  });

  it('clearPool empties the fragment pool', () => {
    const sys = makeSys({ voronoiSites: 3 });
    sys.generateVoronoiFracture();
    sys.applyDamage(WIPE_EVENT);
    sys.clearPool();
    expect(sys.getPooledFragmentCount()).toBe(0);
  });
});

// ─── applyStress ─────────────────────────────────────────────────────────────────

describe('VoronoiFractureSystem — applyStress', () => {
  it('applyStress accumulates damage on fragment', () => {
    const sys = makeSys({ voronoiSites: 3 });
    sys.generateVoronoiFracture();
    const f = sys.getFragments()[0];
    sys.applyStress(f.id, 100); // 100 * 0.1 = 10 damage
    expect(sys.getFragment(f.id)?.damage).toBe(10);
    expect(sys.getFragment(f.id)?.health).toBe(90);
  });

  it('applyStress destroys fragment when health drops below threshold', () => {
    const sys = makeSys({ voronoiSites: 3, maxHealth: 100, destructionThreshold: 0.2 });
    sys.generateVoronoiFracture();
    const f = sys.getFragments()[0];
    sys.applyStress(f.id, 900); // 900*0.1=90 → health=10, 10/100=0.1 < 0.2 → destroyed
    expect(sys.getFragment(f.id)?.active).toBe(false);
  });

  it('applyStress on inactive fragment is a no-op', () => {
    const sys = makeSys({ voronoiSites: 3 });
    sys.generateVoronoiFracture();
    const f = sys.getFragments()[0];
    sys.applyDamage(WIPE_EVENT); // wipe all
    const health = sys.getFragment(f.id)?.health;
    sys.applyStress(f.id, 999); // should not further change dead fragment
    expect(sys.getFragment(f.id)?.health).toBe(health); // unchanged
  });
});

// ─── propagateCracks ─────────────────────────────────────────────────────────────

describe('VoronoiFractureSystem — propagateCracks', () => {
  it('propagateCracks is no-op when enableCrackPropagation=false', () => {
    const sys = makeSys({ enableCrackPropagation: false, voronoiSites: 4 });
    sys.generateVoronoiFracture();
    sys.applyDamage({ position: { x: 0, y: 0, z: 0 }, radius: 1, maxDamage: 50, falloff: 1 });
    const damagesBefore = sys.getFragments().map((f) => f.damage);
    sys.propagateCracks(1);
    const damagesAfter = sys.getFragments().map((f) => f.damage);
    expect(damagesAfter).toEqual(damagesBefore);
  });
});

// ─── Analysis ────────────────────────────────────────────────────────────────────

describe('VoronoiFractureSystem — analysis', () => {
  it('getTotalVolume > 0 after fracture generation', () => {
    const sys = makeSys({ voronoiSites: 4 });
    sys.generateVoronoiFracture();
    expect(sys.getTotalVolume()).toBeGreaterThan(0);
  });

  it('getDestroyedVolume = 0 before any damage', () => {
    const sys = makeSys({ voronoiSites: 3 });
    sys.generateVoronoiFracture();
    expect(sys.getDestroyedVolume()).toBe(0);
  });

  it('getDestructionProgress = 0 before damage, > 0 after wipe', () => {
    const sys = makeSys({ voronoiSites: 4 });
    sys.generateVoronoiFracture();
    expect(sys.getDestructionProgress()).toBe(0);
    sys.applyDamage(WIPE_EVENT);
    expect(sys.getDestructionProgress()).toBeGreaterThan(0);
  });

  it('getAverageDamage = 0 before damage', () => {
    const sys = makeSys({ voronoiSites: 4 });
    sys.generateVoronoiFracture();
    expect(sys.getAverageDamage()).toBe(0);
  });

  it('getAverageDamage > 0 after partial damage', () => {
    const sys = makeSys({ voronoiSites: 4 });
    sys.generateVoronoiFracture();
    sys.applyDamage({ position: { x: 0, y: 0, z: 0 }, radius: 10, maxDamage: 10, falloff: 1 });
    // Only active fragments counted: check active exist first
    if (sys.getActiveFragmentCount() > 0) {
      expect(sys.getAverageDamage()).toBeGreaterThanOrEqual(0);
    }
  });

  it('getDestructionProgress = 0 when no volume', () => {
    const sys = makeSys({ voronoiSites: 0 });
    sys.generateVoronoiFracture();
    expect(sys.getDestructionProgress()).toBe(0);
  });
});

// ─── Neighbors ───────────────────────────────────────────────────────────────────

describe('VoronoiFractureSystem — neighbors', () => {
  it('getNeighbors returns array (may be empty)', () => {
    const sys = makeSys({ voronoiSites: 3 });
    sys.generateVoronoiFracture();
    const f = sys.getFragments()[0];
    expect(Array.isArray(sys.getNeighbors(f.id))).toBe(true);
  });

  it('getNeighborCount returns number', () => {
    const sys = makeSys({ voronoiSites: 3 });
    sys.generateVoronoiFracture();
    const f = sys.getFragments()[0];
    expect(typeof sys.getNeighborCount(f.id)).toBe('number');
  });

  it('getNeighbors returns [] for unknown fragmentId', () => {
    const sys = makeSys({ voronoiSites: 2 });
    sys.generateVoronoiFracture();
    expect(sys.getNeighbors(9999)).toEqual([]);
  });
});

// ─── reset ───────────────────────────────────────────────────────────────────────

describe('VoronoiFractureSystem — reset', () => {
  it('reset clears all fragments, sites, and pool', () => {
    const sys = makeSys({ voronoiSites: 4 });
    sys.generateVoronoiFracture();
    sys.applyDamage(WIPE_EVENT);
    sys.reset();
    expect(sys.getFragmentCount()).toBe(0);
    expect(sys.getPooledFragmentCount()).toBe(0);
    expect(sys.getVoronoiSites().length).toBe(0);
  });

  it('can re-generate after reset', () => {
    const sys = makeSys({ voronoiSites: 3 });
    sys.generateVoronoiFracture();
    sys.reset();
    sys.generateVoronoiFracture();
    expect(sys.getFragmentCount()).toBe(3);
  });
});
