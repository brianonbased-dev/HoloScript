import { describe, it, expect, beforeEach } from 'vitest';
import { RaycastSystem, type Ray, type Collider } from '../physics/RaycastSystem';

// =============================================================================
// C295 — Raycast System
// =============================================================================

describe('RaycastSystem', () => {
  let rs: RaycastSystem;
  const xRay: Ray = { origin: { x: -5, y: 0, z: 0 }, direction: { x: 1, y: 0, z: 0 } };

  beforeEach(() => {
    rs = new RaycastSystem();
  });

  it('ray-AABB hit', () => {
    rs.addCollider({
      entityId: 'box',
      type: 'aabb',
      shape: { min: { x: 1, y: -1, z: -1 }, max: { x: 3, y: 1, z: 1 } },
      layer: 1,
    });
    const hit = rs.raycast(xRay);
    expect(hit).not.toBeNull();
    expect(hit!.entityId).toBe('box');
    expect(hit!.distance).toBeCloseTo(6);
  });

  it('ray-AABB miss', () => {
    rs.addCollider({
      entityId: 'box',
      type: 'aabb',
      shape: { min: { x: 1, y: 5, z: 5 }, max: { x: 3, y: 6, z: 6 } },
      layer: 1,
    });
    expect(rs.raycast(xRay)).toBeNull();
  });

  it('ray-sphere hit', () => {
    rs.addCollider({
      entityId: 'ball',
      type: 'sphere',
      shape: { center: { x: 5, y: 0, z: 0 }, radius: 1 },
      layer: 1,
    });
    const hit = rs.raycast(xRay);
    expect(hit).not.toBeNull();
    expect(hit!.point.x).toBeCloseTo(4);
  });

  it('ray-sphere miss', () => {
    rs.addCollider({
      entityId: 'ball',
      type: 'sphere',
      shape: { center: { x: 5, y: 10, z: 0 }, radius: 1 },
      layer: 1,
    });
    expect(rs.raycast(xRay)).toBeNull();
  });

  it('ray-plane hit', () => {
    rs.addCollider({
      entityId: 'wall',
      type: 'plane',
      shape: { normal: { x: 1, y: 0, z: 0 }, distance: -3 },
      layer: 1,
    });
    const hit = rs.raycast(xRay);
    expect(hit).not.toBeNull();
    expect(hit!.point.x).toBeCloseTo(3);
  });

  it('ray-plane parallel returns null', () => {
    const upRay: Ray = { origin: { x: 0, y: 0, z: 0 }, direction: { x: 0, y: 1, z: 0 } };
    rs.addCollider({
      entityId: 'wall',
      type: 'plane',
      shape: { normal: { x: 0, y: 0, z: 1 }, distance: 5 },
      layer: 1,
    });
    expect(rs.raycast(upRay)).toBeNull();
  });

  it('layer mask filters colliders', () => {
    rs.addCollider({
      entityId: 'a',
      type: 'sphere',
      shape: { center: { x: 5, y: 0, z: 0 }, radius: 1 },
      layer: 2,
    });
    expect(rs.raycast(xRay, Infinity, 1)).toBeNull(); // mask=1, layer=2 → no hit
    expect(rs.raycast(xRay, Infinity, 2)).not.toBeNull();
  });

  it('raycastAll returns hits sorted by distance', () => {
    rs.addCollider({
      entityId: 'far',
      type: 'sphere',
      shape: { center: { x: 10, y: 0, z: 0 }, radius: 1 },
      layer: 1,
    });
    rs.addCollider({
      entityId: 'near',
      type: 'sphere',
      shape: { center: { x: 3, y: 0, z: 0 }, radius: 1 },
      layer: 1,
    });
    const hits = rs.raycastAll(xRay);
    expect(hits).toHaveLength(2);
    expect(hits[0].entityId).toBe('near');
  });

  it('maxDistance filters distant hits', () => {
    rs.addCollider({
      entityId: 'far',
      type: 'sphere',
      shape: { center: { x: 100, y: 0, z: 0 }, radius: 1 },
      layer: 1,
    });
    expect(rs.raycast(xRay, 10)).toBeNull();
  });

  it('removeCollider removes from system', () => {
    rs.addCollider({
      entityId: 'x',
      type: 'sphere',
      shape: { center: { x: 5, y: 0, z: 0 }, radius: 1 },
      layer: 1,
    });
    rs.removeCollider('x');
    expect(rs.getColliderCount()).toBe(0);
  });
});
