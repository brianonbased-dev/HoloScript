import { describe, it, expect } from 'vitest';
import { RaycastSystem } from '@holoscript/engine/physics/RaycastSystem';
import { SpatialHash } from '@holoscript/engine/physics/SpatialHash';
import { TriggerZoneSystem, type TriggerEvent } from '@holoscript/engine/physics/TriggerZone';

describe('Cycle 151: Collision Queries', () => {
  // -------------------------------------------------------------------------
  // RaycastSystem
  // -------------------------------------------------------------------------

  it('should hit sphere and return distance-sorted results', () => {
    const rc = new RaycastSystem();
    rc.addCollider({
      entityId: 'far',
      type: 'sphere',
      shape: { center: [20, 0, 0], radius: 2 },
      layer: 1,
    });
    rc.addCollider({
      entityId: 'near',
      type: 'sphere',
      shape: { center: [5, 0, 0], radius: 1 },
      layer: 1,
    });

    const hits = rc.raycastAll({ origin: [0, 0, 0], direction: [1, 0, 0] });
    expect(hits.length).toBe(2);
    expect(hits[0].entityId).toBe('near');
    expect(hits[0].distance).toBeLessThan(hits[1].distance);
  });

  it('should hit AABB and respect layer masks', () => {
    const rc = new RaycastSystem();
    rc.addCollider({
      entityId: 'box',
      type: 'aabb',
      shape: { min: [3, -1, -1], max: [5, 1, 1] },
      layer: 2,
    });

    // Layer 1 mask — should miss
    const miss = rc.raycast(
      { origin: [0, 0, 0], direction: [1, 0, 0] },
      Infinity,
      1
    );
    expect(miss).toBeNull();

    // Layer 2 mask — should hit
    const hit = rc.raycast(
      { origin: [0, 0, 0], direction: [1, 0, 0] },
      Infinity,
      2
    );
    expect(hit).not.toBeNull();
    expect(hit!.entityId).toBe('box');
  });

  it('should hit plane', () => {
    const rc = new RaycastSystem();
    rc.addCollider({
      entityId: 'ground',
      type: 'plane',
      shape: { normal: [0, 1, 0], distance: 0 },
      layer: 0xffffffff,
    });

    const hit = rc.raycast({ origin: [0, 10, 0], direction: [0, -1, 0] });
    expect(hit).not.toBeNull();
    expect(hit!.distance).toBeCloseTo(10, 1);
    expect(hit!.point[1]).toBeCloseTo(0, 1);
  });

  // -------------------------------------------------------------------------
  // SpatialHash
  // -------------------------------------------------------------------------

  it('should query entities by radius', () => {
    const sh = new SpatialHash(10);
    sh.insert({ id: 'a', x: 5, y: 0, z: 0, radius: 1 });
    sh.insert({ id: 'b', x: 50, y: 0, z: 0, radius: 1 });

    const near = sh.queryRadius(0, 0, 0, 15);
    expect(near).toContain('a');
    expect(near).not.toContain('b');
  });

  it('should generate nearby pairs within same cell', () => {
    const sh = new SpatialHash(10);
    sh.insert({ id: 'x', x: 1, y: 0, z: 0, radius: 0 });
    sh.insert({ id: 'y', x: 2, y: 0, z: 0, radius: 0 });

    const pairs = sh.getNearbyPairs();
    expect(pairs.length).toBe(1);
    expect(pairs[0].sort()).toEqual(['x', 'y']);
  });

  // -------------------------------------------------------------------------
  // TriggerZone
  // -------------------------------------------------------------------------

  it('should fire enter/stay/exit events', () => {
    const tz = new TriggerZoneSystem();
    tz.addZone({
      id: 'zone1',
      shape: { type: 'sphere', position: [0, 0, 0], radius: 5 },
      enabled: true,
      tags: ['safe'],
    });

    const events: Array<{ entity: string; event: TriggerEvent }> = [];
    tz.onTrigger('zone1', (entityId, _z, event) => events.push({ entity: entityId, event }));

    // Frame 1: entity enters
    tz.update([{ id: 'player', position: [1, 0, 0] }]);
    expect(events[0]).toEqual({ entity: 'player', event: 'enter' });

    // Frame 2: entity stays
    tz.update([{ id: 'player', position: [2, 0, 0] }]);
    expect(events[1]).toEqual({ entity: 'player', event: 'stay' });

    // Frame 3: entity exits
    tz.update([{ id: 'player', position: [100, 0, 0] }]);
    expect(events[2]).toEqual({ entity: 'player', event: 'exit' });
  });

  it('should track occupants in multiple zones', () => {
    const tz = new TriggerZoneSystem();
    tz.addZone({
      id: 'z1',
      shape: { type: 'box', position: [0, 0, 0], halfExtents: [5, 5, 5] },
      enabled: true,
      tags: [],
    });
    tz.addZone({
      id: 'z2',
      shape: { type: 'box', position: [3, 0, 0], halfExtents: [5, 5, 5] },
      enabled: true,
      tags: [],
    });

    tz.update([{ id: 'npc', position: [2, 0, 0] }]);

    expect(tz.isInside('npc', 'z1')).toBe(true);
    expect(tz.isInside('npc', 'z2')).toBe(true);
    expect(tz.getZonesForEntity('npc').length).toBe(2);
  });
});
