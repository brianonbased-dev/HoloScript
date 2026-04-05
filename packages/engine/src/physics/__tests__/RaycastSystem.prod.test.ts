/**
 * RaycastSystem — Production Test Suite
 *
 * Covers: addCollider, removeCollider, getColliderCount,
 * raycast (single nearest), raycastAll (sorted),
 * ray-AABB, ray-sphere, ray-plane, layer masks, max distance.
 */
import { describe, it, expect } from 'vitest';
import { RaycastSystem, type Ray } from '@holoscript/core';

const RAY_Z: Ray = { origin: { x: 0, y: 0, z: -10 }, direction: { x: 0, y: 0, z: 1 } };

describe('RaycastSystem — Production', () => {
  // ─── Registration ─────────────────────────────────────────────────
  it('addCollider/removeCollider/getColliderCount', () => {
    const rc = new RaycastSystem();
    rc.addCollider({
      entityId: 'a',
      type: 'sphere',
      shape: { center: { x: 0, y: 0, z: 0 }, radius: 1 },
      layer: 1,
    });
    expect(rc.getColliderCount()).toBe(1);
    rc.removeCollider('a');
    expect(rc.getColliderCount()).toBe(0);
  });

  // ─── Ray-Sphere ───────────────────────────────────────────────────
  it('raycast hits sphere', () => {
    const rc = new RaycastSystem();
    rc.addCollider({
      entityId: 's1',
      type: 'sphere',
      shape: { center: { x: 0, y: 0, z: 5 }, radius: 1 },
      layer: 1,
    });
    const hit = rc.raycast(RAY_Z);
    expect(hit).not.toBeNull();
    expect(hit!.entityId).toBe('s1');
    expect(hit!.distance).toBeCloseTo(14, 0);
  });

  it('ray misses sphere not in path', () => {
    const rc = new RaycastSystem();
    rc.addCollider({
      entityId: 's1',
      type: 'sphere',
      shape: { center: { x: 100, y: 0, z: 5 }, radius: 1 },
      layer: 1,
    });
    expect(rc.raycast(RAY_Z)).toBeNull();
  });

  // ─── Ray-AABB ─────────────────────────────────────────────────────
  it('raycast hits AABB', () => {
    const rc = new RaycastSystem();
    rc.addCollider({
      entityId: 'box',
      type: 'aabb',
      shape: { min: { x: -1, y: -1, z: 4 }, max: { x: 1, y: 1, z: 6 } },
      layer: 1,
    });
    const hit = rc.raycast(RAY_Z);
    expect(hit).not.toBeNull();
    expect(hit!.entityId).toBe('box');
  });

  // ─── Ray-Plane ────────────────────────────────────────────────────
  it('raycast hits plane', () => {
    const rc = new RaycastSystem();
    rc.addCollider({
      entityId: 'floor',
      type: 'plane',
      shape: { normal: { x: 0, y: 0, z: -1 }, distance: -5 },
      layer: 1,
    });
    const hit = rc.raycast(RAY_Z);
    expect(hit).not.toBeNull();
    expect(hit!.entityId).toBe('floor');
  });

  // ─── Multi-hit sorting ────────────────────────────────────────────
  it('raycastAll returns hits sorted by distance', () => {
    const rc = new RaycastSystem();
    rc.addCollider({
      entityId: 'far',
      type: 'sphere',
      shape: { center: { x: 0, y: 0, z: 10 }, radius: 1 },
      layer: 1,
    });
    rc.addCollider({
      entityId: 'near',
      type: 'sphere',
      shape: { center: { x: 0, y: 0, z: 2 }, radius: 1 },
      layer: 1,
    });
    const hits = rc.raycastAll(RAY_Z);
    expect(hits.length).toBe(2);
    expect(hits[0].entityId).toBe('near');
    expect(hits[1].entityId).toBe('far');
  });

  // ─── Max Distance ─────────────────────────────────────────────────
  it('maxDistance filters far hits', () => {
    const rc = new RaycastSystem();
    rc.addCollider({
      entityId: 's1',
      type: 'sphere',
      shape: { center: { x: 0, y: 0, z: 100 }, radius: 1 },
      layer: 1,
    });
    expect(rc.raycast(RAY_Z, 5)).toBeNull();
  });

  // ─── Layer Mask ───────────────────────────────────────────────────
  it('layer mask filters colliders', () => {
    const rc = new RaycastSystem();
    rc.addCollider({
      entityId: 's1',
      type: 'sphere',
      shape: { center: { x: 0, y: 0, z: 5 }, radius: 1 },
      layer: 2,
    });
    // mask=1 doesn't include layer=2
    expect(rc.raycast(RAY_Z, Infinity, 1)).toBeNull();
    // mask=2 includes layer=2
    expect(rc.raycast(RAY_Z, Infinity, 2)).not.toBeNull();
  });

  // ─── Normal ───────────────────────────────────────────────────────
  it('sphere hit has outward normal', () => {
    const rc = new RaycastSystem();
    rc.addCollider({
      entityId: 's1',
      type: 'sphere',
      shape: { center: { x: 0, y: 0, z: 5 }, radius: 1 },
      layer: 1,
    });
    const hit = rc.raycast(RAY_Z)!;
    expect(hit.normal.z).toBeLessThan(0); // normal points back toward ray origin
  });

  it('empty system returns null', () => {
    const rc = new RaycastSystem();
    expect(rc.raycast(RAY_Z)).toBeNull();
  });
});
