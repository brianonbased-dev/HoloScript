/**
 * AdvancedClothTrait Tests
 *
 * Tests the PBD (Position-Based Dynamics) cloth simulation system.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { AdvancedClothSystem } from '../AdvancedClothTrait';

describe('AdvancedClothSystem', () => {
  let cloth: AdvancedClothSystem;

  beforeEach(() => {
    cloth = new AdvancedClothSystem({ width: 5, height: 5, size: { width: 1, height: 1 } });
  });

  // ── Construction & Initialization ─────────────────────────────────────────

  it('creates without error using defaults', () => {
    const c = new AdvancedClothSystem();
    expect(c).toBeDefined();
    expect(c.isInitialized()).toBe(false);
  });

  it('initializes grid with correct particle count', () => {
    cloth.initialize();
    expect(cloth.getParticles().length).toBe(25); // 5 × 5
  });

  it('is not initialized before initialize()', () => {
    expect(cloth.isInitialized()).toBe(false);
    cloth.initialize();
    expect(cloth.isInitialized()).toBe(true);
  });

  it('creates structural constraints between adjacent particles', () => {
    cloth.initialize();
    const constraints = cloth.getConstraints();
    const structural = constraints.filter((c) => c.type === 'structural');
    expect(structural.length).toBeGreaterThan(0);
  });

  it('creates shear constraints (diagonals)', () => {
    cloth.initialize();
    const shear = cloth.getConstraints().filter((c) => c.type === 'shear');
    expect(shear.length).toBeGreaterThan(0);
  });

  it('creates bending constraints (skip-one)', () => {
    cloth.initialize();
    const bending = cloth.getConstraints().filter((c) => c.type === 'bending');
    expect(bending.length).toBeGreaterThan(0);
  });

  it('pins top-edge particles (inverseMass = 0)', () => {
    cloth.initialize();
    const all = cloth.getAllParticles();
    // top row (ids 0–4)
    const topRow = all.slice(0, 5);
    expect(topRow.every((p) => p.inverseMass === 0)).toBe(true);
    // non-top rows have inverseMass > 0
    expect(all[5].inverseMass).toBeGreaterThan(0);
  });

  // ── Pinning & Unpinning ────────────────────────────────────────────────────

  it('pins a particle manually', () => {
    cloth.initialize();
    cloth.pinParticle(5);
    expect(cloth.getAllParticles()[5].inverseMass).toBe(0);
  });

  it('unpins a particle', () => {
    cloth.initialize();
    cloth.pinParticle(5);
    cloth.unpinParticle(5);
    expect(cloth.getAllParticles()[5].inverseMass).toBeGreaterThan(0);
  });

  // ── Simulation Step ────────────────────────────────────────────────────────

  it('step() auto-initializes if not initialized', () => {
    cloth.step(0.016);
    expect(cloth.isInitialized()).toBe(true);
  });

  it('gravity moves unpinned particles downward', () => {
    cloth.initialize();
    const before = cloth.getAllParticles()[5].position[1];
    cloth.step(0.016);
    cloth.step(0.016);
    const after = cloth.getAllParticles()[5].position[1];
    expect(after).toBeLessThan(before);
  });

  it('pinned particles do not move', () => {
    cloth.initialize();
    const before = { ...cloth.getAllParticles()[0].position };
    cloth.step(0.016);
    cloth.step(0.016);
    const after = cloth.getAllParticles()[0].position;
    expect(after[0]).toBeCloseTo(before[0], 5);
    expect(after[1]).toBeCloseTo(before[1], 5);
  });

  // ── Impulse ────────────────────────────────────────────────────────────────

  it('applyImpulse affects nearby particles', () => {
    cloth.initialize();
    const p = cloth.getAllParticles()[5]; // not pinned
    const prevVy = p.velocity[1];
    cloth.applyImpulse(p.position, [0, 10, 0 ], 1.0);
    expect(p.velocity[1]).toBeGreaterThan(prevVy);
  });

  it('applyImpulse does not affect pinned particles', () => {
    cloth.initialize();
    const pinned = cloth.getAllParticles()[0]; // top row, pinned
    cloth.applyImpulse(pinned.position, [0, 100, 0 ], 1.0);
    // pinned → inverseMass is 0 → velocity unchanged
    expect(pinned.velocity[1]).toBe(0);
  });

  // ── Wind ───────────────────────────────────────────────────────────────────

  it('setWind updates wind config', () => {
    cloth.setWind([1, 0, 0 ]);
    expect(cloth.getConfig().wind[0]).toBe(1);
  });

  // ── Tearing ────────────────────────────────────────────────────────────────

  it('tearAt removes all constraints for a particle', () => {
    cloth.initialize();
    const countBefore = cloth.getConstraints().length;
    cloth.tearAt(6); // interior particle
    const countAfter = cloth.getConstraints().length;
    expect(countAfter).toBeLessThan(countBefore);
  });

  it('records tear history', () => {
    cloth.initialize();
    expect(cloth.getTearHistory().length).toBe(0);
    cloth.tearAt(6);
    expect(cloth.getTearHistory().length).toBe(1);
    expect(cloth.getTearHistory()[0].particleId).toBe(6);
  });

  // ── Config & Reset ────────────────────────────────────────────────────────

  it('updateConfig changes settings', () => {
    cloth.updateConfig({ damping: 0.5 });
    expect(cloth.getConfig().damping).toBe(0.5);
  });

  it('reset clears all particles and constraints', () => {
    cloth.initialize();
    cloth.reset();
    expect(cloth.getParticles().length).toBe(0);
    expect(cloth.getConstraints().length).toBe(0);
    expect(cloth.isInitialized()).toBe(false);
  });
});
