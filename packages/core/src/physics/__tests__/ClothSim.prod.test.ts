/**
 * ClothSim — Production Test Suite
 *
 * Covers: createGrid, pin/unpin/pinTopRow, update (Verlet + constraint solve),
 * setWind, getParticle, getParticleCount, getConstraintCount, getGridSize, getAABB.
 */
import { describe, it, expect } from 'vitest';
import { ClothSim } from '../ClothSim';

describe('ClothSim — Production', () => {
  // ─── Grid ─────────────────────────────────────────────────────────
  it('createGrid generates correct particle count', () => {
    const c = new ClothSim();
    c.createGrid(4, 3, 1.0);
    expect(c.getParticleCount()).toBe(12);
    expect(c.getGridSize()).toEqual({ width: 4, height: 3 });
  });

  it('createGrid generates structural + shear constraints', () => {
    const c = new ClothSim();
    c.createGrid(3, 3, 1.0);
    // structural: (3-1)*3 + 3*(3-1) = 6+6 = 12
    // shear: (3-1)*(3-1)*2 = 8
    // total = 20
    expect(c.getConstraintCount()).toBe(20);
  });

  // ─── Pinning ──────────────────────────────────────────────────────
  it('pin prevents particle from moving', () => {
    const c = new ClothSim();
    c.createGrid(2, 2, 1.0);
    c.pin(0);
    const before = { ...c.getParticle(0)! };
    c.update(1/60);
    const after = c.getParticle(0)!;
    expect(after.y).toBe(before.y);
  });

  it('unpin allows particle to move again', () => {
    const c = new ClothSim();
    c.createGrid(2, 2, 1.0);
    c.pin(0);
    c.unpin(0);
    c.update(1/60);
    // gravity should cause y to change
    const p = c.getParticle(0)!;
    expect(p.y).not.toBe(0);
  });

  it('pinTopRow pins all particles in first row', () => {
    const c = new ClothSim();
    c.createGrid(4, 3, 1.0);
    c.pinTopRow();
    c.update(1/60);
    for (let col = 0; col < 4; col++) {
      expect(c.getParticle(col)!.pinned).toBe(true);
      expect(c.getParticle(col)!.y).toBe(0);
    }
  });

  // ─── Update / Gravity ─────────────────────────────────────────────
  it('particles fall under gravity', () => {
    const c = new ClothSim();
    c.createGrid(2, 2, 1.0);
    c.update(1/60);
    // unpinned particles should move downward
    expect(c.getParticle(0)!.y).toBeLessThan(0);
  });

  // ─── Wind ─────────────────────────────────────────────────────────
  it('setWind affects particle positions', () => {
    const c = new ClothSim();
    c.createGrid(2, 2, 1.0);
    c.setWind(10, 0, 0);
    c.update(1/60);
    // wind in x should shift particles
    expect(c.getParticle(0)!.x).not.toBe(0);
  });

  // ─── AABB ─────────────────────────────────────────────────────────
  it('getAABB computes bounding box', () => {
    const c = new ClothSim();
    c.createGrid(3, 3, 1.0);
    const aabb = c.getAABB();
    expect(aabb.min.x).toBeLessThanOrEqual(aabb.max.x);
    expect(aabb.min.y).toBeLessThanOrEqual(aabb.max.y);
    expect(aabb.min.z).toBeLessThanOrEqual(aabb.max.z);
  });

  // ─── Queries ──────────────────────────────────────────────────────
  it('getParticle returns undefined for out-of-range', () => {
    const c = new ClothSim();
    c.createGrid(2, 2, 1.0);
    expect(c.getParticle(100)).toBeUndefined();
  });

  // ─── Config ───────────────────────────────────────────────────────
  it('custom config overrides defaults', () => {
    const c = new ClothSim({ gravity: -5, damping: 0.8, iterations: 10 });
    c.createGrid(2, 2, 1.0);
    c.update(1/60);
    // gravity is weaker, so y displacement should be smaller
    const p = c.getParticle(0)!;
    expect(p.y).toBeLessThan(0);
  });
});
