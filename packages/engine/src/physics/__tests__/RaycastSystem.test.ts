import { describe, it, expect, beforeEach } from 'vitest';
import { RaycastSystem } from '..';

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
      shape: { center: [0, 0, 0 ], radius: 1 },
      layer: 1,
    });
    expect(sys.getColliderCount()).toBe(1);
  });

  it('removes a collider', () => {
    sys.addCollider({
      entityId: 'b',
      type: 'sphere',
      shape: { center: [0, 0, 0 ], radius: 1 },
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
      shape: { center: [5, 0, 0 ], radius: 1 },
      layer: 1,
    });
    const hit = sys.raycast({ origin: [0, 0, 0 ], direction: [1, 0, 0 ] });
    expect(hit).not.toBeNull();
    expect(hit!.entityId).toBe('s1');
    expect(hit!.distance).toBeCloseTo(4, 0); // hits surface at x=4
  });

  it('misses a sphere off-axis', () => {
    sys.addCollider({
      entityId: 's2',
      type: 'sphere',
      shape: { center: [5, 10, 0 ], radius: 1 },
      layer: 1,
    });
    const hit = sys.raycast({ origin: [0, 0, 0 ], direction: [1, 0, 0 ] });
    expect(hit).toBeNull();
  });

  // ---------- Ray-AABB ----------
  it('hits an AABB', () => {
    sys.addCollider({
      entityId: 'box1',
      type: 'aabb',
      shape: { min: [3, -1, -1 ], max: [5, 1, 1 ] },
      layer: 1,
    });
    const hit = sys.raycast({ origin: [0, 0, 0 ], direction: [1, 0, 0 ] });
    expect(hit).not.toBeNull();
    expect(hit!.entityId).toBe('box1');
    expect(hit!.distance).toBeCloseTo(3, 0);
  });

  it('misses AABB when ray parallel', () => {
    sys.addCollider({
      entityId: 'box2',
      type: 'aabb',
      shape: { min: [3, 5, -1 ], max: [5, 7, 1 ] },
      layer: 1,
    });
    const hit = sys.raycast({ origin: [0, 0, 0 ], direction: [1, 0, 0 ] });
    expect(hit).toBeNull();
  });

  // ---------- Ray-Plane ----------
  it('hits a plane', () => {
    sys.addCollider({
      entityId: 'plane1',
      type: 'plane',
      shape: { normal: [0, 1, 0 ], distance: -5 },
      layer: 1,
    });
    const hit = sys.raycast({ origin: [0, 0, 0 ], direction: [0, 1, 0 ] });
    expect(hit).not.toBeNull();
    expect(hit!.entityId).toBe('plane1');
  });

  it('misses plane when parallel', () => {
    sys.addCollider({
      entityId: 'plane2',
      type: 'plane',
      shape: { normal: [0, 1, 0 ], distance: -5 },
      layer: 1,
    });
    const hit = sys.raycast({ origin: [0, 0, 0 ], direction: [1, 0, 0 ] }); // parallel to plane
    expect(hit).toBeNull();
  });

  // ---------- Distance & ordering ----------
  it('returns closest hit first', () => {
    sys.addCollider({
      entityId: 'far',
      type: 'sphere',
      shape: { center: [10, 0, 0 ], radius: 1 },
      layer: 1,
    });
    sys.addCollider({
      entityId: 'near',
      type: 'sphere',
      shape: { center: [3, 0, 0 ], radius: 1 },
      layer: 1,
    });
    const hit = sys.raycast({ origin: [0, 0, 0 ], direction: [1, 0, 0 ] });
    expect(hit!.entityId).toBe('near');
  });

  it('raycastAll returns all hits sorted', () => {
    sys.addCollider({
      entityId: 'far',
      type: 'sphere',
      shape: { center: [10, 0, 0 ], radius: 1 },
      layer: 1,
    });
    sys.addCollider({
      entityId: 'near',
      type: 'sphere',
      shape: { center: [3, 0, 0 ], radius: 1 },
      layer: 1,
    });
    const hits = sys.raycastAll({ origin: [0, 0, 0 ], direction: [1, 0, 0 ] });
    expect(hits.length).toBe(2);
    expect(hits[0].entityId).toBe('near');
    expect(hits[1].entityId).toBe('far');
  });

  // ---------- Max distance ----------
  it('respects maxDistance', () => {
    sys.addCollider({
      entityId: 'far',
      type: 'sphere',
      shape: { center: [100, 0, 0 ], radius: 1 },
      layer: 1,
    });
    const hit = sys.raycast({ origin: [0, 0, 0 ], direction: [1, 0, 0 ] }, 10);
    expect(hit).toBeNull();
  });

  // ---------- Layer mask ----------
  it('filters by layer mask', () => {
    sys.addCollider({
      entityId: 'layer1',
      type: 'sphere',
      shape: { center: [3, 0, 0 ], radius: 1 },
      layer: 1,
    });
    sys.addCollider({
      entityId: 'layer2',
      type: 'sphere',
      shape: { center: [5, 0, 0 ], radius: 1 },
      layer: 2,
    });
    const hit = sys.raycast(
      { origin: [0, 0, 0 ], direction: [1, 0, 0 ] },
      Infinity,
      2
    );
    expect(hit!.entityId).toBe('layer2');
  });

  // ---------- Empty ----------
  it('returns null with no colliders', () => {
    expect(
      sys.raycast({ origin: [0, 0, 0 ], direction: [1, 0, 0 ] })
    ).toBeNull();
  });
});
