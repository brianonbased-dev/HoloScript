import { describe, it, expect, beforeEach } from 'vitest';
import { RaycastSystem } from '@holoscript/core';

describe('RaycastSystem', () => {
  let sys: RaycastSystem;

  beforeEach(() => {
    sys = new RaycastSystem();
  });

  // ---------- Collider management ----------
  it('adds and counts colliders', () => {
    sys.addCollider({
      entityId: 'a',
      type: 'sphere',
      shape: { center: { x: 0, y: 0, z: 0 }, radius: 1 },
      layer: 1,
    });
    expect(sys.getColliderCount()).toBe(1);
  });

  it('removes a collider', () => {
    sys.addCollider({
      entityId: 'b',
      type: 'sphere',
      shape: { center: { x: 0, y: 0, z: 0 }, radius: 1 },
      layer: 1,
    });
    sys.removeCollider('b');
    expect(sys.getColliderCount()).toBe(0);
  });

  // ---------- Ray-Sphere ----------
  it('hits a sphere directly ahead', () => {
    sys.addCollider({
      entityId: 's1',
      type: 'sphere',
      shape: { center: { x: 5, y: 0, z: 0 }, radius: 1 },
      layer: 1,
    });
    const hit = sys.raycast({ origin: { x: 0, y: 0, z: 0 }, direction: { x: 1, y: 0, z: 0 } });
    expect(hit).not.toBeNull();
    expect(hit!.entityId).toBe('s1');
    expect(hit!.distance).toBeCloseTo(4, 0); // hits surface at x=4
  });

  it('misses a sphere off-axis', () => {
    sys.addCollider({
      entityId: 's2',
      type: 'sphere',
      shape: { center: { x: 5, y: 10, z: 0 }, radius: 1 },
      layer: 1,
    });
    const hit = sys.raycast({ origin: { x: 0, y: 0, z: 0 }, direction: { x: 1, y: 0, z: 0 } });
    expect(hit).toBeNull();
  });

  // ---------- Ray-AABB ----------
  it('hits an AABB', () => {
    sys.addCollider({
      entityId: 'box1',
      type: 'aabb',
      shape: { min: { x: 3, y: -1, z: -1 }, max: { x: 5, y: 1, z: 1 } },
      layer: 1,
    });
    const hit = sys.raycast({ origin: { x: 0, y: 0, z: 0 }, direction: { x: 1, y: 0, z: 0 } });
    expect(hit).not.toBeNull();
    expect(hit!.entityId).toBe('box1');
    expect(hit!.distance).toBeCloseTo(3, 0);
  });

  it('misses AABB when ray parallel', () => {
    sys.addCollider({
      entityId: 'box2',
      type: 'aabb',
      shape: { min: { x: 3, y: 5, z: -1 }, max: { x: 5, y: 7, z: 1 } },
      layer: 1,
    });
    const hit = sys.raycast({ origin: { x: 0, y: 0, z: 0 }, direction: { x: 1, y: 0, z: 0 } });
    expect(hit).toBeNull();
  });

  // ---------- Ray-Plane ----------
  it('hits a plane', () => {
    sys.addCollider({
      entityId: 'plane1',
      type: 'plane',
      shape: { normal: { x: 0, y: 1, z: 0 }, distance: -5 },
      layer: 1,
    });
    const hit = sys.raycast({ origin: { x: 0, y: 0, z: 0 }, direction: { x: 0, y: 1, z: 0 } });
    expect(hit).not.toBeNull();
    expect(hit!.entityId).toBe('plane1');
  });

  it('misses plane when parallel', () => {
    sys.addCollider({
      entityId: 'plane2',
      type: 'plane',
      shape: { normal: { x: 0, y: 1, z: 0 }, distance: -5 },
      layer: 1,
    });
    const hit = sys.raycast({ origin: { x: 0, y: 0, z: 0 }, direction: { x: 1, y: 0, z: 0 } }); // parallel to plane
    expect(hit).toBeNull();
  });

  // ---------- Distance & ordering ----------
  it('returns closest hit first', () => {
    sys.addCollider({
      entityId: 'far',
      type: 'sphere',
      shape: { center: { x: 10, y: 0, z: 0 }, radius: 1 },
      layer: 1,
    });
    sys.addCollider({
      entityId: 'near',
      type: 'sphere',
      shape: { center: { x: 3, y: 0, z: 0 }, radius: 1 },
      layer: 1,
    });
    const hit = sys.raycast({ origin: { x: 0, y: 0, z: 0 }, direction: { x: 1, y: 0, z: 0 } });
    expect(hit!.entityId).toBe('near');
  });

  it('raycastAll returns all hits sorted', () => {
    sys.addCollider({
      entityId: 'far',
      type: 'sphere',
      shape: { center: { x: 10, y: 0, z: 0 }, radius: 1 },
      layer: 1,
    });
    sys.addCollider({
      entityId: 'near',
      type: 'sphere',
      shape: { center: { x: 3, y: 0, z: 0 }, radius: 1 },
      layer: 1,
    });
    const hits = sys.raycastAll({ origin: { x: 0, y: 0, z: 0 }, direction: { x: 1, y: 0, z: 0 } });
    expect(hits.length).toBe(2);
    expect(hits[0].entityId).toBe('near');
    expect(hits[1].entityId).toBe('far');
  });

  // ---------- Max distance ----------
  it('respects maxDistance', () => {
    sys.addCollider({
      entityId: 'far',
      type: 'sphere',
      shape: { center: { x: 100, y: 0, z: 0 }, radius: 1 },
      layer: 1,
    });
    const hit = sys.raycast({ origin: { x: 0, y: 0, z: 0 }, direction: { x: 1, y: 0, z: 0 } }, 10);
    expect(hit).toBeNull();
  });

  // ---------- Layer mask ----------
  it('filters by layer mask', () => {
    sys.addCollider({
      entityId: 'layer1',
      type: 'sphere',
      shape: { center: { x: 3, y: 0, z: 0 }, radius: 1 },
      layer: 1,
    });
    sys.addCollider({
      entityId: 'layer2',
      type: 'sphere',
      shape: { center: { x: 5, y: 0, z: 0 }, radius: 1 },
      layer: 2,
    });
    const hit = sys.raycast(
      { origin: { x: 0, y: 0, z: 0 }, direction: { x: 1, y: 0, z: 0 } },
      Infinity,
      2
    );
    expect(hit!.entityId).toBe('layer2');
  });

  // ---------- Empty ----------
  it('returns null with no colliders', () => {
    expect(
      sys.raycast({ origin: { x: 0, y: 0, z: 0 }, direction: { x: 1, y: 0, z: 0 } })
    ).toBeNull();
  });
});

