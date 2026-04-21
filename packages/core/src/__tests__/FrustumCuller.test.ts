import { describe, it, expect, beforeEach } from 'vitest';
import { FrustumCuller } from '@holoscript/engine/spatial';
import type { Plane4, BoundingVolume } from '@holoscript/engine/spatial';

// =============================================================================
// C234 — Frustum Culler
// =============================================================================

// Simple frustum: everything with z in [1, 100] is inside
const NEAR_FAR_PLANES: Plane4[] = [
  { a: 0, b: 0, c: 1, d: -1 }, // z >= 1  (near)
  { a: 0, b: 0, c: -1, d: 100 }, // z <= 100 (far)
];

describe('FrustumCuller', () => {
  let fc: FrustumCuller;
  beforeEach(() => {
    fc = new FrustumCuller();
  });

  it('setPlanes stores planes', () => {
    fc.setPlanes(NEAR_FAR_PLANES);
    expect(fc.getPlaneCount()).toBe(2);
  });

  it('addVolume and removeVolume', () => {
    fc.addVolume({ id: 'a', type: 'sphere', centerX: 0, centerY: 0, centerZ: 50, radius: 5 });
    expect(fc.getVolumeCount()).toBe(1);
    fc.removeVolume('a');
    expect(fc.getVolumeCount()).toBe(0);
  });

  it('testSphere inside frustum', () => {
    fc.setPlanes(NEAR_FAR_PLANES);
    expect(fc.testSphere(0, 0, 50, 5)).toBe('inside');
  });

  it('testSphere outside frustum (before near)', () => {
    fc.setPlanes(NEAR_FAR_PLANES);
    expect(fc.testSphere(0, 0, -10, 1)).toBe('outside');
  });

  it('testSphere outside frustum (beyond far)', () => {
    fc.setPlanes(NEAR_FAR_PLANES);
    expect(fc.testSphere(0, 0, 200, 1)).toBe('outside');
  });

  it('testAABB inside frustum', () => {
    fc.setPlanes(NEAR_FAR_PLANES);
    expect(fc.testAABB(0, 0, 50, 5, 5, 5)).toBe('inside');
  });

  it('testAABB outside frustum', () => {
    fc.setPlanes(NEAR_FAR_PLANES);
    expect(fc.testAABB(0, 0, -20, 5, 5, 5)).toBe('outside');
  });

  it('cullAll returns visible volumes', () => {
    fc.setPlanes(NEAR_FAR_PLANES);
    fc.addVolume({ id: 'in', type: 'sphere', centerX: 0, centerY: 0, centerZ: 50, radius: 5 });
    fc.addVolume({ id: 'out', type: 'sphere', centerX: 0, centerY: 0, centerZ: -20, radius: 1 });
    const visible = fc.cullAll();
    expect(visible).toContain('in');
    expect(visible).not.toContain('out');
  });

  it('cullAll handles AABB volumes', () => {
    fc.setPlanes(NEAR_FAR_PLANES);
    fc.addVolume({
      id: 'box',
      type: 'aabb',
      centerX: 0,
      centerY: 0,
      centerZ: 10,
        halfExtentX: 2,
        halfExtentY: 2,
        halfExtentZ: 2,
    });
    const visible = fc.cullAll();
    expect(visible).toContain('box');
  });

  it('isVisible and getVisibleCount after cullAll', () => {
    fc.setPlanes(NEAR_FAR_PLANES);
    fc.addVolume({ id: 'a', type: 'sphere', centerX: 0, centerY: 0, centerZ: 50, radius: 5 });
    fc.cullAll();
    expect(fc.isVisible('a')).toBe(true);
    expect(fc.getVisibleCount()).toBe(1);
  });

  it('setFrustumFromPerspective creates planes', () => {
    fc.setFrustumFromPerspective(60, 1.5, 0.1, 100, 0, 0, 0, 0, 0, -1);
    expect(fc.getPlaneCount()).toBeGreaterThan(0);
  });
});
