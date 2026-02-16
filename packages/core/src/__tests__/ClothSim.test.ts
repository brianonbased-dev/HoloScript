import { describe, it, expect, beforeEach } from 'vitest';
import { ClothSim } from '../physics/ClothSim';

// =============================================================================
// C290 — Cloth Simulation
// =============================================================================

describe('ClothSim', () => {
  let cloth: ClothSim;
  beforeEach(() => {
    cloth = new ClothSim({ gravity: -9.81, damping: 0.99, iterations: 3 });
    cloth.createGrid(4, 4, 1.0);
  });

  it('creates correct particle count', () => {
    expect(cloth.getParticleCount()).toBe(16);
  });

  it('creates structural and shear constraints', () => {
    // 4x4: structural horiz=12, vert=12 => 24 structural  
    // shear: 3x3=9 diagonal pairs * 2 = 18
    expect(cloth.getConstraintCount()).toBe(42);
  });

  it('particles start at grid positions', () => {
    const p = cloth.getParticle(5); // row1, col1
    expect(p?.x).toBeCloseTo(1);
    expect(p?.z).toBeCloseTo(1);
  });

  it('pins a particle so it stays fixed', () => {
    cloth.pin(0);
    const before = { ...cloth.getParticle(0)! };
    cloth.update(0.016);
    cloth.update(0.016);
    const after = cloth.getParticle(0)!;
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
  });

  it('unpinned particles fall under gravity', () => {
    const yBefore = cloth.getParticle(5)!.y;
    cloth.update(0.016);
    cloth.update(0.016);
    expect(cloth.getParticle(5)!.y).toBeLessThan(yBefore);
  });

  it('pinTopRow pins all first-row particles', () => {
    cloth.pinTopRow();
    cloth.update(0.016);
    for (let col = 0; col < 4; col++) {
      expect(cloth.getParticle(col)!.pinned).toBe(true);
    }
  });

  it('unpin releases a particle', () => {
    cloth.pin(0);
    expect(cloth.getParticle(0)!.pinned).toBe(true);
    cloth.unpin(0);
    expect(cloth.getParticle(0)!.pinned).toBe(false);
  });

  it('wind affects particle positions', () => {
    cloth.pinTopRow();
    cloth.setWind(5, 0, 0);
    for (let i = 0; i < 20; i++) cloth.update(0.016);
    // Bottom-right corner should drift to the right
    const p = cloth.getParticle(15)!;
    expect(p.x).toBeGreaterThan(3); // original x=3
  });

  it('getGridSize returns correct dimensions', () => {
    expect(cloth.getGridSize()).toEqual({ width: 4, height: 4 });
  });

  it('getAABB computes bounding box', () => {
    const aabb = cloth.getAABB();
    expect(aabb.min.x).toBeCloseTo(0);
    expect(aabb.max.x).toBeCloseTo(3);
  });

  it('constraints keep particles from drifting infinitely', () => {
    for (let i = 0; i < 100; i++) cloth.update(0.016);
    const aabb = cloth.getAABB();
    expect(aabb.max.x - aabb.min.x).toBeLessThan(50);
  });
});
