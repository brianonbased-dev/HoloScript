/**
 * Sprint 24 Acceptance Tests â€” Physics + Animation
 *
 * Covers:
 *   packages/core/src/physics/
 *     RigidBody       â€” construction, forces, impulse, integrate, sleep, collision filter
 *     RaycastSystem   â€” AABB/sphere/plane raycasting, layerMask, sorted hits
 *     TriggerZoneSystem â€” zones, enter/stay/exit callbacks, queries
 *     SpatialHash     â€” insert/remove/query, nearby pairs
 *
 *   packages/core/src/animation/
 *     AnimClip        â€” tracks, events, sampling (linear/step), wrapping, blending
 */

import { describe, it, expect, beforeEach } from 'vitest';

import { RigidBody } from '@holoscript/engine/physics/PhysicsBody.js';
import type { IRigidBodyConfig } from '@holoscript/engine/physics/PhysicsTypes.js';
import { COLLISION_GROUPS } from '@holoscript/engine/physics/PhysicsTypes.js';
import { RaycastSystem, type Collider } from '@holoscript/engine/physics/RaycastSystem.js';
import { TriggerZoneSystem } from '@holoscript/engine/physics/TriggerZone.js';
import { SpatialHash } from '@holoscript/engine/physics/SpatialHash.js';
import { AnimClip } from '@holoscript/engine/animation/AnimationClip.js';
import type { ClipTrack } from '@holoscript/engine/animation/AnimationClip.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDynamic(id = 'b1', x = 0, y = 0, z = 0): RigidBody {
  return new RigidBody({
    id,
    type: 'dynamic',
    transform: { position: [x, y, z], rotation: [0, 0, 0, 1 ] },
    shape: { type: 'sphere', radius: 0.5 },
    mass: 2,
  } as IRigidBodyConfig);
}

function makeStatic(id = 'wall'): RigidBody {
  return new RigidBody({
    id,
    type: 'static',
    transform: { position: [0, 0, 0], rotation: [0, 0, 0, 1 ] },
    shape: { type: 'box', halfExtents: [1, 1, 1] },
  } as IRigidBodyConfig);
}

function makeLinearTrack(id: string, path: string, values: [number, number][]): ClipTrack {
  return {
    id,
    targetPath: path,
    property: 'x',
    component: 'x',
    interpolation: 'linear',
    keyframes: values.map(([t, v]) => ({ time: t, value: v })),
  };
}

// =============================================================================
// Feature 1A: RigidBody â€” construction
// =============================================================================

describe('Feature 1A: RigidBody â€” construction', () => {
  it('id is set from config', () => {
    expect(makeDynamic('hero').id).toBe('hero');
  });

  it('type is set from config', () => {
    expect(makeDynamic().type).toBe('dynamic');
  });

  it('dynamic body mass is set', () => {
    expect(makeDynamic().mass).toBe(2);
  });

  it('dynamic body has positive inverseMass', () => {
    expect(makeDynamic().inverseMass).toBeGreaterThan(0);
  });

  it('static body mass is 0', () => {
    expect(makeStatic().mass).toBe(0);
  });

  it('static body inverseMass is 0', () => {
    expect(makeStatic().inverseMass).toBe(0);
  });

  it('position is set from transform', () => {
    const b = makeDynamic('b', 1, 2, 3);
    expect(b.position).toEqual([1, 2, 3]);
  });

  it('isActive starts true', () => {
    expect(makeDynamic().isActive).toBe(true);
  });

  it('isSleeping starts false', () => {
    expect(makeDynamic().isSleeping).toBe(false);
  });

  it('getState() returns id, position, rotation, velocities', () => {
    const state = makeDynamic('x').getState();
    expect(state.id).toBe('x');
    expect(state.position).toBeDefined();
    expect(state.rotation).toBeDefined();
    expect(state.linearVelocity).toBeDefined();
    expect(state.angularVelocity).toBeDefined();
  });
});

// =============================================================================
// Feature 1B: RigidBody â€” forces and velocity
// =============================================================================

describe('Feature 1B: RigidBody â€” forces and velocity', () => {
  it('applyForce() accumulates force on dynamic body', () => {
    const b = makeDynamic();
    b.applyForce([10, 0, 0]);
    expect(b.getForce()[0]).toBeGreaterThan(0);
  });

  it('clearForces() resets accumulated force', () => {
    const b = makeDynamic();
    b.applyForce([10, 0, 0]);
    b.clearForces();
    expect(b.getForce()[0]).toBe(0);
  });

  it('applyImpulse() changes linearVelocity', () => {
    const b = makeDynamic();
    b.applyImpulse([10, 0, 0]);
    expect(b.linearVelocity[0]).toBeGreaterThan(0);
  });

  it('linearVelocity setter works on dynamic body', () => {
    const b = makeDynamic();
    b.linearVelocity = [5, 0, 0];
    expect(b.linearVelocity[0]).toBe(5);
  });

  it('linearVelocity setter is no-op on static body', () => {
    const b = makeStatic();
    b.linearVelocity = [99, 0, 0];
    expect(b.linearVelocity[0]).toBe(0);
  });

  it('integrateVelocities() updates position from velocity', () => {
    const b = makeDynamic();
    b.linearVelocity = [10, 0, 0];
    b.integrateVelocities(0.1);
    expect(b.position[0]).toBeGreaterThan(0);
  });

  it('integrateForces() with gravity increases downward velocity', () => {
    const b = makeDynamic();
    b.integrateForces(0.1, [0, -9.81, 0]);
    expect(b.linearVelocity[1]).toBeLessThan(0);
  });
});

// =============================================================================
// Feature 1C: RigidBody â€” state, material, filter
// =============================================================================

describe('Feature 1C: RigidBody â€” state, material, filter', () => {
  it('wakeUp() sets isSleeping to false', () => {
    const b = makeDynamic();
    b.wakeUp();
    expect(b.isSleeping).toBe(false);
  });

  it('gravityScale can be set and read', () => {
    const b = makeDynamic();
    b.gravityScale = 0.5;
    expect(b.gravityScale).toBe(0.5);
  });

  it('material can be set and read', () => {
    const b = makeDynamic();
    b.material = { friction: 0.8, restitution: 0.1 };
    expect(b.material.friction).toBe(0.8);
  });

  it('userData can be set and read', () => {
    const b = makeDynamic();
    b.userData = { type: 'enemy' };
    expect((b.userData as any).type).toBe('enemy');
  });

  it('canCollideWith() two bodies with DEFAULT filter is true', () => {
    const a = makeDynamic('a');
    const b = makeDynamic('b');
    expect(a.canCollideWith(b)).toBe(true);
  });

  it('ccd can be set and read', () => {
    const b = makeDynamic();
    b.ccd = true;
    expect(b.ccd).toBe(true);
  });
});

// =============================================================================
// Feature 2A: RaycastSystem â€” registration
// =============================================================================

describe('Feature 2A: RaycastSystem â€” registration', () => {
  let sys: RaycastSystem;

  beforeEach(() => {
    sys = new RaycastSystem();
  });

  it('addCollider increases getColliderCount()', () => {
    sys.addCollider({
      entityId: 'box1',
      type: 'aabb',
      shape: { min: [-1, -1, -1], max: [1, 1, 1] },
      layer: 1,
    });
    expect(sys.getColliderCount()).toBe(1);
  });

  it('removeCollider decreases count', () => {
    sys.addCollider({
      entityId: 'box1',
      type: 'aabb',
      shape: { min: [-1, -1, -1], max: [1, 1, 1] },
      layer: 1,
    });
    sys.removeCollider('box1');
    expect(sys.getColliderCount()).toBe(0);
  });
});

// =============================================================================
// Feature 2B: RaycastSystem â€” raycasting
// =============================================================================

describe('Feature 2B: RaycastSystem â€” raycasting', () => {
  let sys: RaycastSystem;

  beforeEach(() => {
    sys = new RaycastSystem();
    // AABB box at origin (-1,-1,-1) to (1,1,1), layer 1
    sys.addCollider({
      entityId: 'box',
      type: 'aabb',
      shape: { min: [-1, -1, -1], max: [1, 1, 1] },
      layer: 1,
    });
    // Sphere at (5,0,0) r=1, layer 1
    sys.addCollider({
      entityId: 'sphere',
      type: 'sphere',
      shape: { center: [5, 0, 0], radius: 1 },
      layer: 1,
    });
    // Plane (Y=0, normal up), layer 1
    sys.addCollider({
      entityId: 'floor',
      type: 'plane',
      shape: { normal: [0, 1, 0], distance: 0 },
      layer: 1,
    });
  });

  it('ray hits AABB box', () => {
    const hit = sys.raycast({ origin: [-5, 0, 0], direction: [1, 0, 0] });
    expect(hit).not.toBeNull();
    expect(hit?.entityId).toBe('box');
  });

  it('ray misses AABB (passes above)', () => {
    const hit = sys.raycast({ origin: [-5, 5, 0], direction: [1, 0, 0] });
    expect(hit?.entityId).not.toBe('box');
  });

  it('ray hits sphere', () => {
    const hit = sys.raycast({ origin: [-5, 0, 0], direction: [1, 0, 0] });
    // Should hit box first (distance ~4), then sphere would be hit later
    const allHits = sys.raycastAll({
      origin: [2, 0, 0],
      direction: [1, 0, 0],
    });
    const sphereHit = allHits.find((h) => h.entityId === 'sphere');
    expect(sphereHit).toBeDefined();
  });

  it('ray hits plane (from above)', () => {
    const hit = sys.raycast({ origin: [10, 10, 0], direction: [0, -1, 0] });
    expect(hit).not.toBeNull();
    expect(hit?.entityId).toBe('floor');
  });

  it('raycastAll returns hits sorted by distance', () => {
    // Shoot from far left, hits box, then sphere
    const hits = sys.raycastAll({ origin: [-5, 0, 0], direction: [1, 0, 0] });
    expect(hits.length).toBeGreaterThanOrEqual(2);
    expect(hits[0].distance).toBeLessThanOrEqual(hits[1].distance);
  });

  it('layerMask 0 returns no hits', () => {
    const hit = sys.raycast(
      { origin: [-5, 0, 0], direction: [1, 0, 0] },
      Infinity,
      0
    );
    expect(hit).toBeNull();
  });

  it('RayHit has entityId, distance, point, normal', () => {
    const hit = sys.raycast({ origin: [-5, 0, 0], direction: [1, 0, 0] })!;
    expect(typeof hit.entityId).toBe('string');
    expect(typeof hit.distance).toBe('number');
    expect(hit.point).toBeDefined();
    expect(hit.normal).toBeDefined();
  });
});

// =============================================================================
// Feature 3A: TriggerZoneSystem â€” zone management
// =============================================================================

describe('Feature 3A: TriggerZoneSystem â€” zone management', () => {
  let sys: TriggerZoneSystem;

  beforeEach(() => {
    sys = new TriggerZoneSystem();
  });

  it('addZone increments getZoneCount()', () => {
    sys.addZone({
      id: 'z1',
      shape: { type: 'sphere', position: [0, 0, 0], radius: 2 },
      enabled: true,
      tags: [],
    });
    expect(sys.getZoneCount()).toBe(1);
  });

  it('removeZone decrements count', () => {
    sys.addZone({
      id: 'z1',
      shape: { type: 'sphere', position: [0, 0, 0], radius: 2 },
      enabled: true,
      tags: [],
    });
    sys.removeZone('z1');
    expect(sys.getZoneCount()).toBe(0);
  });

  it('enableZone(false) disables zone', () => {
    sys.addZone({
      id: 'z1',
      shape: { type: 'sphere', position: [0, 0, 0], radius: 2 },
      enabled: true,
      tags: [],
    });
    sys.enableZone('z1', false);
    let fired = false;
    sys.onTrigger('z1', () => {
      fired = true;
    });
    sys.update([{ id: 'e1', position: [0, 0, 0] }]);
    expect(fired).toBe(false);
  });

  it('getOccupants() returns empty when no entities', () => {
    sys.addZone({
      id: 'z1',
      shape: { type: 'sphere', position: [0, 0, 0], radius: 2 },
      enabled: true,
      tags: [],
    });
    expect(sys.getOccupants('z1')).toHaveLength(0);
  });
});

// =============================================================================
// Feature 3B: TriggerZoneSystem â€” enter / stay / exit
// =============================================================================

describe('Feature 3B: TriggerZoneSystem â€” enter/stay/exit', () => {
  let sys: TriggerZoneSystem;
  const zone = {
    id: 'z1',
    shape: { type: 'sphere' as const, position: [0, 0, 0], radius: 5 },
    enabled: true,
    tags: [],
  };
  const inside = { id: 'player', position: [0, 0, 0] };
  const outside = { id: 'player', position: [100, 0, 0] };

  beforeEach(() => {
    sys = new TriggerZoneSystem();
    sys.addZone(zone);
  });

  it('onTrigger fires enter when entity enters', () => {
    const events: string[] = [];
    sys.onTrigger('z1', (_e, _z, ev) => events.push(ev));
    sys.update([inside]);
    expect(events).toContain('enter');
  });

  it('onTrigger fires stay on second update', () => {
    const events: string[] = [];
    sys.onTrigger('z1', (_e, _z, ev) => events.push(ev));
    sys.update([inside]);
    sys.update([inside]);
    expect(events).toContain('stay');
  });

  it('onTrigger fires exit when entity leaves', () => {
    const events: string[] = [];
    sys.onTrigger('z1', (_e, _z, ev) => events.push(ev));
    sys.update([inside]);
    sys.update([outside]);
    expect(events).toContain('exit');
  });

  it('isInside() is true after enter', () => {
    sys.update([inside]);
    expect(sys.isInside('player', 'z1')).toBe(true);
  });

  it('isInside() is false after exit', () => {
    sys.update([inside]);
    sys.update([outside]);
    expect(sys.isInside('player', 'z1')).toBe(false);
  });

  it('getOccupants() returns entities inside', () => {
    sys.update([inside]);
    expect(sys.getOccupants('z1')).toContain('player');
  });

  it('getZonesForEntity() returns zones entity is in', () => {
    sys.update([inside]);
    expect(sys.getZonesForEntity('player')).toContain('z1');
  });
});

// =============================================================================
// Feature 4A: SpatialHash â€” insert / remove / query
// =============================================================================

describe('Feature 4A: SpatialHash â€” operations', () => {
  let sh: SpatialHash;

  beforeEach(() => {
    sh = new SpatialHash(10);
  });

  it('insert increases getEntryCount()', () => {
    sh.insert({ id: 'a', x: 0, y: 0, z: 0, radius: 0 });
    expect(sh.getEntryCount()).toBe(1);
  });

  it('remove decreases getEntryCount()', () => {
    sh.insert({ id: 'a', x: 0, y: 0, z: 0, radius: 0 });
    sh.remove('a');
    expect(sh.getEntryCount()).toBe(0);
  });

  it('getCellCount() is positive after insert', () => {
    sh.insert({ id: 'a', x: 0, y: 0, z: 0, radius: 0 });
    expect(sh.getCellCount()).toBeGreaterThan(0);
  });

  it('queryPoint finds entry in same cell', () => {
    sh.insert({ id: 'obj', x: 5, y: 5, z: 5, radius: 0 });
    const results = sh.queryPoint(5, 5, 5);
    expect(results).toContain('obj');
  });

  it('queryRadius finds nearby entry', () => {
    sh.insert({ id: 'nearby', x: 3, y: 0, z: 0, radius: 0 });
    const results = sh.queryRadius(0, 0, 0, 10);
    expect(results).toContain('nearby');
  });

  it('queryRadius excludes far entries', () => {
    sh.insert({ id: 'far', x: 1000, y: 0, z: 0, radius: 0 });
    const results = sh.queryRadius(0, 0, 0, 1);
    expect(results).not.toContain('far');
  });

  it('getNearbyPairs finds two entries in same cell', () => {
    sh.insert({ id: 'a', x: 1, y: 0, z: 0, radius: 0 });
    sh.insert({ id: 'b', x: 2, y: 0, z: 0, radius: 0 });
    const pairs = sh.getNearbyPairs();
    expect(pairs.length).toBeGreaterThan(0);
  });

  it('clear() removes all entries', () => {
    sh.insert({ id: 'a', x: 0, y: 0, z: 0, radius: 0 });
    sh.clear();
    expect(sh.getEntryCount()).toBe(0);
    expect(sh.getCellCount()).toBe(0);
  });
});

// =============================================================================
// Feature 5A: AnimClip â€” construction and configuration
// =============================================================================

describe('Feature 5A: AnimClip â€” construction and config', () => {
  it('id is set', () => {
    expect(new AnimClip('walk', 'Walk', 1.5).id).toBe('walk');
  });

  it('name is set', () => {
    expect(new AnimClip('walk', 'Walk', 1.5).name).toBe('Walk');
  });

  it('getDuration() returns initial duration', () => {
    expect(new AnimClip('c', 'C', 2).getDuration()).toBe(2);
  });

  it('setLoop(true) / isLooping() is true', () => {
    const c = new AnimClip('c', 'C', 1);
    c.setLoop(true);
    expect(c.isLooping()).toBe(true);
  });

  it('setSpeed / getSpeed round-trip', () => {
    const c = new AnimClip('c', 'C', 1);
    c.setSpeed(2);
    expect(c.getSpeed()).toBe(2);
  });

  it('setWrapMode / getWrapMode round-trip', () => {
    const c = new AnimClip('c', 'C', 1);
    c.setWrapMode('ping-pong');
    expect(c.getWrapMode()).toBe('ping-pong');
  });
});

// =============================================================================
// Feature 5B: AnimClip â€” tracks and events
// =============================================================================

describe('Feature 5B: AnimClip â€” tracks and events', () => {
  let clip: AnimClip;

  beforeEach(() => {
    clip = new AnimClip('run', 'Run', 1);
  });

  it('addTrack / getTrackCount', () => {
    clip.addTrack(
      makeLinearTrack('t1', 'root', [
        [0, 0],
        [1, 10],
      ])
    );
    expect(clip.getTrackCount()).toBe(1);
  });

  it('getTrack(id) returns correct track', () => {
    clip.addTrack(
      makeLinearTrack('t1', 'root', [
        [0, 0],
        [1, 10],
      ])
    );
    expect(clip.getTrack('t1')?.id).toBe('t1');
  });

  it('getTracks() returns a copy', () => {
    clip.addTrack(
      makeLinearTrack('t1', 'root', [
        [0, 0],
        [1, 10],
      ])
    );
    const tracks = clip.getTracks();
    tracks.push({} as any);
    expect(clip.getTrackCount()).toBe(1);
  });

  it('addTrack with later keyframe extends duration', () => {
    clip.addTrack(
      makeLinearTrack('t1', 'root', [
        [0, 0],
        [3, 100],
      ])
    );
    expect(clip.getDuration()).toBe(3);
  });

  it('addEvent / getEvents', () => {
    clip.addEvent(0.5, 'footstep', { foot: 'left' });
    expect(clip.getEvents().length).toBe(1);
    expect(clip.getEvents()[0].name).toBe('footstep');
  });

  it('getEventsInRange filters correctly', () => {
    clip.addEvent(0.1, 'early');
    clip.addEvent(0.5, 'mid');
    clip.addEvent(0.9, 'late');
    const filtered = clip.getEventsInRange(0.3, 0.7);
    expect(filtered.length).toBe(1);
    expect(filtered[0].name).toBe('mid');
  });
});

// =============================================================================
// Feature 5C: AnimClip â€” sample and blend
// =============================================================================

describe('Feature 5C: AnimClip â€” sample and blend', () => {
  it('sample linear track at t=0 returns first keyframe value', () => {
    const clip = new AnimClip('c', 'C', 1);
    clip.addTrack(
      makeLinearTrack('t1', 'node', [
        [0, 10],
        [1, 20],
      ])
    );
    const result = clip.sample(0);
    expect(result.get('node.x.x')).toBeCloseTo(10, 3);
  });

  it('sample linear track at midpoint interpolates', () => {
    const clip = new AnimClip('c', 'C', 1);
    clip.addTrack(
      makeLinearTrack('t1', 'node', [
        [0, 0],
        [1, 10],
      ])
    );
    const result = clip.sample(0.5);
    expect(result.get('node.x.x')).toBeCloseTo(5, 3);
  });

  it('sample step track returns left keyframe value', () => {
    const clip = new AnimClip('c', 'C', 1);
    clip.addTrack({
      id: 't1',
      targetPath: 'n',
      property: 'y',
      component: 'y',
      interpolation: 'step',
      keyframes: [
        { time: 0, value: 100 },
        { time: 0.5, value: 200 },
      ],
    });
    const result = clip.sample(0.3);
    expect(result.get('n.y.y')).toBe(100);
  });

  it('sample at t>duration with loop wraps', () => {
    const clip = new AnimClip('c', 'C', 1);
    clip.setWrapMode('loop');
    clip.addTrack(
      makeLinearTrack('t1', 'n', [
        [0, 0],
        [1, 10],
      ])
    );
    // t=1.5 loops to t=0.5 → should give ~5
    const result = clip.sample(1.5);
    expect(result.get('n.x.x')).toBeCloseTo(5, 1);
  });

  it('AnimClip.blend() merges two sample maps', () => {
    const a = new Map([['pos.x', 10]]);
    const b = new Map([['pos.x', 20]]);
    const blended = AnimClip.blend(a, b, 0.5);
    expect(blended.get('pos.x')).toBeCloseTo(15, 5);
  });

  it('AnimClip.blend() with weight=0 returns a values', () => {
    const a = new Map([['val', 100]]);
    const b = new Map([['val', 0]]);
    const blended = AnimClip.blend(a, b, 0);
    expect(blended.get('val')).toBe(100);
  });
});
