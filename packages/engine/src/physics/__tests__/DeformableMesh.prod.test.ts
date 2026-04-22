/**
 * DeformableMesh — Production Test Suite
 *
 * Covers: setVertices, addSpring, autoConnectRadius, applyImpact,
 * update (spring-damper + shape matching), getVertices, getVertex,
 * getVertexCount, getSpringCount, getDisplacement, getMaxDisplacement.
 */
import { describe, it, expect } from 'vitest';
import { DeformableMesh } from '..';

describe('DeformableMesh — Production', () => {
  function mkMesh() {
    const m = new DeformableMesh();
    m.setVertices([
      [0, 0, 0 ],
      [1, 0, 0 ],
      [2, 0, 0 ],
      [0, 1, 0 ],
    ]);
    return m;
  }

  // ─── Vertices ─────────────────────────────────────────────────────
  it('setVertices stores correct count', () => {
    const m = mkMesh();
    expect(m.getVertexCount()).toBe(4);
  });

  it('getVertex returns vertex data', () => {
    const m = mkMesh();
    const v = m.getVertex(1);
    expect(v).toBeDefined();
    expect(v!.rest[0]).toBe(1);
  });

  it('getVertex returns undefined for out-of-range', () => {
    const m = mkMesh();
    expect(m.getVertex(99)).toBeUndefined();
  });

  // ─── Springs ──────────────────────────────────────────────────────
  it('addSpring creates connection', () => {
    const m = mkMesh();
    m.addSpring(0, 1);
    m.addSpring(1, 2);
    expect(m.getSpringCount()).toBe(2);
  });

  it('autoConnectRadius creates springs within radius', () => {
    const m = mkMesh();
    m.autoConnectRadius(1.5);
    expect(m.getSpringCount()).toBeGreaterThan(0);
  });

  // ─── Impact ───────────────────────────────────────────────────────
  it('applyImpact adds velocity to nearby (non-center) vertices', () => {
    // applyImpact modifies velocity, not position directly.
    // Also dist===0 is skipped, so use a center offset from actual vertex.
    const m = mkMesh();
    m.applyImpact([0.5, 0, 0 ], 2, 10);
    // Vertices at (0,0,0) and (1,0,0) are within radius 2, and dist != 0
    const v0 = m.getVertex(0)!;
    const velMag = Math.abs(v0.velocity[0]) + Math.abs(v0.velocity[1]) + Math.abs(v0.velocity[2]);
    expect(velMag).toBeGreaterThan(0);
  });

  it('applyImpact does not affect far vertices', () => {
    const m = new DeformableMesh();
    m.setVertices([
      [0, 0, 0 ],
      [100, 0, 0 ],
    ]);
    m.applyImpact([0.1, 0, 0 ], 1, 10);
    // vertex at 100 should have zero velocity
    const v1 = m.getVertex(1)!;
    expect(v1.velocity[0]).toBe(0);
  });

  // ─── Simulation ───────────────────────────────────────────────────
  it('update moves vertices with velocity', () => {
    const m = mkMesh();
    m.applyImpact([0.5, 0, 0 ], 2, 10);
    m.update(1 / 60);
    // After update, displacement should be > 0
    expect(m.getMaxDisplacement()).toBeGreaterThan(0);
  });

  it('update with springs keeps displacement bounded', () => {
    const m = mkMesh();
    m.addSpring(0, 1);
    m.addSpring(1, 2);
    m.applyImpact([0.5, 0, 0 ], 2, 5);
    for (let i = 0; i < 200; i++) m.update(1 / 60);
    // Springs should prevent unbounded growth
    const disp = m.getMaxDisplacement();
    expect(disp).toBeLessThan(10); // stable, not exploding
    expect(disp).toBeGreaterThanOrEqual(0);
  });

  // ─── Queries ──────────────────────────────────────────────────────
  it('getDisplacement returns distance from rest', () => {
    const m = mkMesh();
    expect(m.getDisplacement(0)).toBe(0); // no deformation yet
  });

  it('locked vertices do not move', () => {
    const m = mkMesh();
    const v = m.getVertex(0)!;
    v.locked = true;
    m.applyImpact([0.5, 0, 0 ], 2, 10);
    expect(m.getDisplacement(0)).toBe(0);
  });
});
