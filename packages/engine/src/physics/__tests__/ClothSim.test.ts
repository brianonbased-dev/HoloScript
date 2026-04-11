import { describe, it, expect, beforeEach } from 'vitest';
import { ClothSim } from '..';

describe('ClothSim', () => {
  let cloth: ClothSim;

  beforeEach(() => {
    cloth = new ClothSim();
  });

  it('starts with 0 particles', () => {
    expect(cloth.getParticleCount()).toBe(0);
  });

  it('createGrid generates correct particle grid', () => {
    cloth.createGrid(5, 5, 0.1);
    expect(cloth.getParticleCount()).toBe(25);
    expect(cloth.getGridSize()).toEqual({ width: 5, height: 5 });
  });

  it('creates structural and shear constraints', () => {
    cloth.createGrid(3, 3, 0.1);
    // 3x3 grid: structural = (3-1)*3 + 3*(3-1) = 12, shear = (3-1)*(3-1)*2 = 8 = 20 total
    expect(cloth.getConstraintCount()).toBeGreaterThan(0);
  });

  it('pin and unpin work', () => {
    cloth.createGrid(3, 3, 0.1);
    cloth.pin(0);
    expect(cloth.getParticle(0)!.pinned).toBe(true);
    cloth.unpin(0);
    expect(cloth.getParticle(0)!.pinned).toBe(false);
  });

  it('pinTopRow pins first row', () => {
    cloth.createGrid(4, 3, 0.1);
    cloth.pinTopRow();
    // First row is indices 0..3
    for (let i = 0; i < 4; i++) {
      expect(cloth.getParticle(i)!.pinned).toBe(true);
    }
    // Second row should NOT be pinned
    expect(cloth.getParticle(4)!.pinned).toBe(false);
  });

  it('update applies gravity to unpinned particles', () => {
    cloth.createGrid(3, 3, 0.5);
    // Pin top row, let bottom fall
    cloth.pinTopRow();
    const midIdx = 4; // center of 3x3
    const yBefore = cloth.getParticle(midIdx)!.y;
    cloth.update(1 / 60);
    expect(cloth.getParticle(midIdx)!.y).toBeLessThan(yBefore);
  });

  it('pinned particle stays in place', () => {
    cloth.createGrid(3, 3, 0.5);
    cloth.pin(0);
    const xBefore = cloth.getParticle(0)!.x;
    const yBefore = cloth.getParticle(0)!.y;
    cloth.update(1 / 60);
    expect(cloth.getParticle(0)!.x).toBe(xBefore);
    expect(cloth.getParticle(0)!.y).toBe(yBefore);
  });

  it('setWind changes wind', () => {
    cloth.createGrid(3, 3, 0.5);
    cloth.pinTopRow();
    cloth.setWind(10, 0, 0);
    const p = cloth.getParticle(4)!;
    const xBefore = p.x;
    for (let i = 0; i < 10; i++) cloth.update(1 / 60);
    expect(cloth.getParticle(4)!.x).toBeGreaterThan(xBefore);
  });

  it('getAABB computes bounding box', () => {
    cloth.createGrid(3, 3, 1.0);
    const aabb = cloth.getAABB();
    expect(aabb.min.x).toBeLessThanOrEqual(0);
    expect(aabb.max.x).toBeGreaterThanOrEqual(2);
  });
});
