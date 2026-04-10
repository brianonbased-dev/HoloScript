/**
 * SpatialQuery Comprehensive Tests
 * Sprint 4 Priority 4 - Spatial Context Awareness
 *
 * Additional tests to improve SpatialQuery.ts coverage from 35% to 80%+
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Vector3, SpatialEntity, Region, BoundingBox, BoundingSphere } from '../SpatialTypes';
import {
  SpatialQueryExecutor,
  QueryResult,
  NearestQuery,
  WithinQuery,
  VisibleQuery,
  ReachableQuery,
  InRegionQuery,
  ByTypeQuery,
  RaycastQuery,
} from '../SpatialQuery';

// =============================================================================
// HELPERS
// =============================================================================

function createEntity(
  id: string,
  position: Vector3,
  type: string = 'default',
  bounds?: BoundingBox | BoundingSphere
): SpatialEntity {
  return { id, type, position, bounds };
}

function createBoxEntity(
  id: string,
  position: Vector3,
  size: number,
  type: string = 'default'
): SpatialEntity {
  const halfSize = size / 2;
  return {
    id,
    type,
    position,
    bounds: {
      min: { x: position.x - halfSize, y: position.y - halfSize, z: position.z - halfSize },
      max: { x: position.x + halfSize, y: position.y + halfSize, z: position.z + halfSize },
    },
  };
}

function createSphereEntity(
  id: string,
  position: Vector3,
  radius: number,
  type: string = 'default'
): SpatialEntity {
  return {
    id,
    type,
    position,
    bounds: { center: position, radius },
  };
}

function createBoxRegion(id: string, min: Vector3, max: Vector3, name?: string): Region {
  return {
    id,
    name: name || id,
    type: 'box',
    bounds: { min, max },
  };
}

function createSphereRegion(id: string, center: Vector3, radius: number, name?: string): Region {
  return {
    id,
    name: name || id,
    type: 'sphere',
    bounds: { center, radius },
  };
}

// =============================================================================
// VISIBLE QUERY TESTS
// =============================================================================

describe('SpatialQueryExecutor - Visible Query', () => {
  let executor: SpatialQueryExecutor;

  beforeEach(() => {
    executor = new SpatialQueryExecutor();
  });

  describe('basic visibility', () => {
    it('should find visible entities with no obstacles', () => {
      // Spread entities so they don't block each other
      const entities = [
        createEntity('e1', { x: 5, y: 0, z: 0 }),
        createEntity('e2', { x: 0, y: 10, z: 0 }),
        createEntity('e3', { x: 0, y: 0, z: 15 }),
      ];
      executor.updateEntities(entities);

      const results = executor.execute({
        type: 'visible',
        from: { x: 0, y: 0, z: 0 },
      } as VisibleQuery);

      expect(results.length).toBe(3);
      expect(results[0].entity.id).toBe('e1'); // Sorted by distance
    });

    it('should limit visible entities by maxDistance', () => {
      // Spread entities so they don't block each other
      const entities = [
        createEntity('e1', { x: 5, y: 0, z: 0 }),
        createEntity('e2', { x: 0, y: 10, z: 0 }),
        createEntity('e3', { x: 100, y: 0, z: 0 }),
      ];
      executor.updateEntities(entities);

      const results = executor.execute({
        type: 'visible',
        from: { x: 0, y: 0, z: 0 },
        maxDistance: 20,
      } as VisibleQuery);

      expect(results.length).toBe(2);
      expect(results.map((r) => r.entity.id).sort()).toEqual(['e1', 'e2']);
    });

    it('should exclude entities at same position', () => {
      const entities = [
        createEntity('e1', { x: 0, y: 0, z: 0 }), // Same as from
        createEntity('e2', { x: 5, y: 0, z: 0 }),
      ];
      executor.updateEntities(entities);

      const results = executor.execute({
        type: 'visible',
        from: { x: 0, y: 0, z: 0 },
      } as VisibleQuery);

      expect(results.length).toBe(1);
      expect(results[0].entity.id).toBe('e2');
    });
  });

  describe('field of view (FOV)', () => {
    it('should filter by FOV when direction specified', () => {
      const entities = [
        createEntity('e1', { x: 10, y: 0, z: 0 }), // Directly ahead
        createEntity('e2', { x: 0, y: 10, z: 0 }), // 90 degrees off
        createEntity('e3', { x: 10, y: 5, z: 0 }), // Slightly off center
      ];
      executor.updateEntities(entities);

      const results = executor.execute({
        type: 'visible',
        from: { x: 0, y: 0, z: 0 },
        direction: { x: 1, y: 0, z: 0 }, // Looking along X axis
        fov: 60, // 60 degree cone
      } as VisibleQuery);

      expect(results.length).toBe(2);
      expect(results.map((r) => r.entity.id).sort()).toEqual(['e1', 'e3']);
    });

    it('should see 360 degrees without FOV', () => {
      const entities = [
        createEntity('e1', { x: 10, y: 0, z: 0 }),
        createEntity('e2', { x: -10, y: 0, z: 0 }),
        createEntity('e3', { x: 0, y: 10, z: 0 }),
        createEntity('e4', { x: 0, y: -10, z: 0 }),
      ];
      executor.updateEntities(entities);

      const results = executor.execute({
        type: 'visible',
        from: { x: 0, y: 0, z: 0 },
        direction: { x: 1, y: 0, z: 0 },
        // No FOV specified = 360 degrees
      } as VisibleQuery);

      expect(results.length).toBe(4);
    });

    it('should handle narrow FOV', () => {
      const entities = [
        createEntity('e1', { x: 10, y: 0, z: 0 }), // Directly ahead
        createEntity('e2', { x: 10, y: 5, z: 0 }), // More off center (outside 10 deg)
      ];
      executor.updateEntities(entities);

      const results = executor.execute({
        type: 'visible',
        from: { x: 0, y: 0, z: 0 },
        direction: { x: 1, y: 0, z: 0 },
        fov: 10, // Very narrow 10 degree cone
      } as VisibleQuery);

      expect(results.length).toBe(1);
      expect(results[0].entity.id).toBe('e1');
    });
  });

  describe('line of sight blocking', () => {
    it('should block visibility with obstacle in between', () => {
      const entities = [
        createSphereEntity('obstacle', { x: 5, y: 0, z: 0 }, 2),
        createEntity('target', { x: 10, y: 0, z: 0 }),
      ];
      executor.updateEntities(entities);

      const results = executor.execute({
        type: 'visible',
        from: { x: 0, y: 0, z: 0 },
      } as VisibleQuery);

      // Target should be blocked by obstacle
      const targetVisible = results.find((r) => r.entity.id === 'target');
      expect(targetVisible).toBeUndefined();
    });

    it('should see around obstacles', () => {
      const entities = [
        createSphereEntity('obstacle', { x: 5, y: 0, z: 0 }, 1),
        createEntity('target', { x: 5, y: 10, z: 0 }), // Not in line with obstacle
      ];
      executor.updateEntities(entities);

      const results = executor.execute({
        type: 'visible',
        from: { x: 0, y: 0, z: 0 },
      } as VisibleQuery);

      const targetVisible = results.find((r) => r.entity.id === 'target');
      expect(targetVisible).toBeDefined();
    });
  });
});

// =============================================================================
// REACHABLE QUERY TESTS
// =============================================================================

describe('SpatialQueryExecutor - Reachable Query', () => {
  let executor: SpatialQueryExecutor;

  beforeEach(() => {
    executor = new SpatialQueryExecutor();
  });

  it('should find reachable entities with no obstacles', () => {
    const entities = [
      createEntity('e1', { x: 5, y: 0, z: 0 }),
      createEntity('e2', { x: 10, y: 0, z: 0 }),
    ];
    executor.updateEntities(entities);

    const results = executor.execute({
      type: 'reachable',
      from: { x: 0, y: 0, z: 0 },
    } as ReachableQuery);

    expect(results.length).toBe(2);
  });

  it('should limit by maxDistance', () => {
    const entities = [
      createEntity('e1', { x: 5, y: 0, z: 0 }),
      createEntity('e2', { x: 100, y: 0, z: 0 }),
    ];
    executor.updateEntities(entities);

    const results = executor.execute({
      type: 'reachable',
      from: { x: 0, y: 0, z: 0 },
      maxDistance: 20,
    } as ReachableQuery);

    expect(results.length).toBe(1);
    expect(results[0].entity.id).toBe('e1');
  });

  it('should exclude entities blocked by obstacles', () => {
    const obstacle = createSphereEntity('wall', { x: 5, y: 0, z: 0 }, 2);
    const target = createEntity('target', { x: 10, y: 0, z: 0 });
    const clear = createEntity('clear', { x: 0, y: 10, z: 0 });

    executor.updateEntities([obstacle, target, clear]);

    const results = executor.execute({
      type: 'reachable',
      from: { x: 0, y: 0, z: 0 },
      obstacles: [obstacle],
    } as ReachableQuery);

    // Target blocked by wall, clear target not blocked
    const ids = results.map((r) => r.entity.id);
    expect(ids).toContain('clear');
    expect(ids).not.toContain('target');
  });

  it('should return sorted by distance', () => {
    const entities = [
      createEntity('far', { x: 20, y: 0, z: 0 }),
      createEntity('near', { x: 5, y: 0, z: 0 }),
      createEntity('mid', { x: 10, y: 0, z: 0 }),
    ];
    executor.updateEntities(entities);

    const results = executor.execute({
      type: 'reachable',
      from: { x: 0, y: 0, z: 0 },
    } as ReachableQuery);

    expect(results.map((r) => r.entity.id)).toEqual(['near', 'mid', 'far']);
  });
});

// =============================================================================
// IN REGION QUERY TESTS
// =============================================================================

describe('SpatialQueryExecutor - In Region Query', () => {
  let executor: SpatialQueryExecutor;

  beforeEach(() => {
    executor = new SpatialQueryExecutor();
  });

  describe('box regions', () => {
    it('should find entities inside box region', () => {
      const entities = [
        createEntity('inside', { x: 5, y: 5, z: 5 }),
        createEntity('outside', { x: 50, y: 50, z: 50 }),
      ];
      executor.updateEntities(entities);

      const results = executor.execute({
        type: 'in_region',
        from: { x: 0, y: 0, z: 0 },
        region: createBoxRegion('zone', { x: 0, y: 0, z: 0 }, { x: 10, y: 10, z: 10 }),
      } as InRegionQuery);

      expect(results.length).toBe(1);
      expect(results[0].entity.id).toBe('inside');
    });

    it('should include entities on boundary', () => {
      const entities = [createEntity('on_edge', { x: 10, y: 5, z: 5 })];
      executor.updateEntities(entities);

      const results = executor.execute({
        type: 'in_region',
        from: { x: 0, y: 0, z: 0 },
        region: createBoxRegion('zone', { x: 0, y: 0, z: 0 }, { x: 10, y: 10, z: 10 }),
      } as InRegionQuery);

      expect(results.length).toBe(1);
    });
  });

  describe('sphere regions', () => {
    it('should find entities inside sphere region', () => {
      const entities = [
        createEntity('inside', { x: 1, y: 0, z: 0 }),
        createEntity('outside', { x: 20, y: 0, z: 0 }),
      ];
      executor.updateEntities(entities);

      const results = executor.execute({
        type: 'in_region',
        from: { x: 0, y: 0, z: 0 },
        region: createSphereRegion('bubble', { x: 0, y: 0, z: 0 }, 10),
      } as InRegionQuery);

      expect(results.length).toBe(1);
      expect(results[0].entity.id).toBe('inside');
    });

    it('should return sorted by distance from query origin', () => {
      const entities = [
        createEntity('far', { x: 8, y: 0, z: 0 }),
        createEntity('near', { x: 2, y: 0, z: 0 }),
      ];
      executor.updateEntities(entities);

      const results = executor.execute({
        type: 'in_region',
        from: { x: 0, y: 0, z: 0 },
        region: createSphereRegion('bubble', { x: 0, y: 0, z: 0 }, 10),
      } as InRegionQuery);

      expect(results.map((r) => r.entity.id)).toEqual(['near', 'far']);
    });
  });
});

// =============================================================================
// RAYCAST QUERY TESTS
// =============================================================================

describe('SpatialQueryExecutor - Raycast Query', () => {
  let executor: SpatialQueryExecutor;

  beforeEach(() => {
    executor = new SpatialQueryExecutor();
  });

  it('should hit entities along ray direction', () => {
    const entities = [createSphereEntity('target', { x: 10, y: 0, z: 0 }, 2)];
    executor.updateEntities(entities);

    const results = executor.execute({
      type: 'raycast',
      from: { x: 0, y: 0, z: 0 },
      direction: { x: 1, y: 0, z: 0 },
      maxDistance: 100,
    } as RaycastQuery);

    expect(results.length).toBe(1);
    expect(results[0].entity.id).toBe('target');
  });

  it('should miss entities not in ray path', () => {
    const entities = [createSphereEntity('off_path', { x: 10, y: 10, z: 0 }, 1)];
    executor.updateEntities(entities);

    const results = executor.execute({
      type: 'raycast',
      from: { x: 0, y: 0, z: 0 },
      direction: { x: 1, y: 0, z: 0 },
      maxDistance: 100,
    } as RaycastQuery);

    expect(results.length).toBe(0);
  });

  it('should respect maxDistance', () => {
    const entities = [createSphereEntity('too_far', { x: 100, y: 0, z: 0 }, 2)];
    executor.updateEntities(entities);

    const results = executor.execute({
      type: 'raycast',
      from: { x: 0, y: 0, z: 0 },
      direction: { x: 1, y: 0, z: 0 },
      maxDistance: 10,
    } as RaycastQuery);

    expect(results.length).toBe(0);
  });

  it('should return first hit when hitFirst is true', () => {
    const entities = [
      createSphereEntity('first', { x: 5, y: 0, z: 0 }, 1),
      createSphereEntity('second', { x: 10, y: 0, z: 0 }, 1),
    ];
    executor.updateEntities(entities);

    const results = executor.execute({
      type: 'raycast',
      from: { x: 0, y: 0, z: 0 },
      direction: { x: 1, y: 0, z: 0 },
      maxDistance: 100,
      hitFirst: true,
    } as RaycastQuery);

    expect(results.length).toBe(1);
    expect(results[0].entity.id).toBe('first');
  });

  it('should hit all entities when hitFirst is false', () => {
    const entities = [
      createSphereEntity('first', { x: 5, y: 0, z: 0 }, 1),
      createSphereEntity('second', { x: 10, y: 0, z: 0 }, 1),
    ];
    executor.updateEntities(entities);

    const results = executor.execute({
      type: 'raycast',
      from: { x: 0, y: 0, z: 0 },
      direction: { x: 1, y: 0, z: 0 },
      maxDistance: 100,
      hitFirst: false,
    } as RaycastQuery);

    expect(results.length).toBe(2);
  });

  it('should sort hits by distance', () => {
    const entities = [
      createSphereEntity('far', { x: 10, y: 0, z: 0 }, 1),
      createSphereEntity('near', { x: 5, y: 0, z: 0 }, 1),
    ];
    executor.updateEntities(entities);

    const results = executor.execute({
      type: 'raycast',
      from: { x: 0, y: 0, z: 0 },
      direction: { x: 1, y: 0, z: 0 },
      maxDistance: 100,
    } as RaycastQuery);

    expect(results[0].entity.id).toBe('near');
    expect(results[1].entity.id).toBe('far');
  });

  it('should handle ray behind entity', () => {
    const entities = [createSphereEntity('behind', { x: -10, y: 0, z: 0 }, 2)];
    executor.updateEntities(entities);

    const results = executor.execute({
      type: 'raycast',
      from: { x: 0, y: 0, z: 0 },
      direction: { x: 1, y: 0, z: 0 }, // Pointing away
      maxDistance: 100,
    } as RaycastQuery);

    expect(results.length).toBe(0);
  });
});

// =============================================================================
// WITHIN QUERY - INCLUDE PARTIAL
// =============================================================================

describe('SpatialQueryExecutor - Within Query (includePartial)', () => {
  let executor: SpatialQueryExecutor;

  beforeEach(() => {
    executor = new SpatialQueryExecutor();
  });

  it('should include partial overlaps when includePartial is true', () => {
    // Entity center is at 15, but has radius 3, so edge is at 12
    const entities = [createSphereEntity('partial', { x: 15, y: 0, z: 0 }, 3)];
    executor.updateEntities(entities);

    const results = executor.execute({
      type: 'within',
      from: { x: 0, y: 0, z: 0 },
      radius: 13, // Just reaches edge of entity
      includePartial: true,
    } as WithinQuery);

    expect(results.length).toBe(1);
  });

  it('should exclude partial overlaps when includePartial is false', () => {
    const entities = [createSphereEntity('partial', { x: 15, y: 0, z: 0 }, 3)];
    executor.updateEntities(entities);

    const results = executor.execute({
      type: 'within',
      from: { x: 0, y: 0, z: 0 },
      radius: 13, // Entity center at 15 is outside
      includePartial: false,
    } as WithinQuery);

    expect(results.length).toBe(0);
  });

  it('should handle box bounds for partial overlap', () => {
    const entities = [
      createBoxEntity('box', { x: 12, y: 0, z: 0 }, 4), // Edges at 10 and 14
    ];
    executor.updateEntities(entities);

    const results = executor.execute({
      type: 'within',
      from: { x: 0, y: 0, z: 0 },
      radius: 11, // Reaches edge of box
      includePartial: true,
    } as WithinQuery);

    expect(results.length).toBe(1);
  });
});

// =============================================================================
// EDGE CASES
// =============================================================================

describe('SpatialQueryExecutor - Edge Cases', () => {
  let executor: SpatialQueryExecutor;

  beforeEach(() => {
    executor = new SpatialQueryExecutor();
  });

  it('should handle empty entity set', () => {
    executor.updateEntities([]);

    const results = executor.execute({
      type: 'nearest',
      from: { x: 0, y: 0, z: 0 },
      count: 10,
    } as NearestQuery);

    expect(results).toEqual([]);
  });

  it('should handle entity type filter with no matches', () => {
    const entities = [createEntity('e1', { x: 5, y: 0, z: 0 }, 'npc')];
    executor.updateEntities(entities);

    const results = executor.execute({
      type: 'nearest',
      from: { x: 0, y: 0, z: 0 },
      entityTypeFilter: ['item'], // No items exist
    } as NearestQuery);

    expect(results).toEqual([]);
  });

  it('should handle entities without bounds', () => {
    const entities = [
      createEntity('no_bounds', { x: 10, y: 0, z: 0 }), // No bounds
    ];
    executor.updateEntities(entities);

    const results = executor.execute({
      type: 'raycast',
      from: { x: 0, y: 0, z: 0 },
      direction: { x: 1, y: 0, z: 0 },
      maxDistance: 100,
    } as RaycastQuery);

    // Should use default radius of 0.5
    expect(results.length).toBe(1);
  });

  it('should handle region update', () => {
    executor.updateRegions([createBoxRegion('r1', { x: 0, y: 0, z: 0 }, { x: 10, y: 10, z: 10 })]);

    // Regions stored for in_region queries
    const entities = [createEntity('e1', { x: 5, y: 5, z: 5 })];
    executor.updateEntities(entities);

    const results = executor.execute({
      type: 'in_region',
      from: { x: 0, y: 0, z: 0 },
      region: createBoxRegion('r1', { x: 0, y: 0, z: 0 }, { x: 10, y: 10, z: 10 }),
    } as InRegionQuery);

    expect(results.length).toBe(1);
  });

  it('should handle unknown query type gracefully', () => {
    executor.updateEntities([createEntity('e1', { x: 5, y: 0, z: 0 })]);

    // @ts-ignore - Testing unknown type
    const results = executor.execute({
      type: 'unknown_type',
      from: { x: 0, y: 0, z: 0 },
    });

    expect(results).toEqual([]);
  });

  it('should apply maxResults to all query types', () => {
    const entities = [];
    for (let i = 0; i < 20; i++) {
      entities.push(createEntity(`e${i}`, { x: i + 1, y: 0, z: 0 }));
    }
    executor.updateEntities(entities);

    const results = executor.execute({
      type: 'within',
      from: { x: 0, y: 0, z: 0 },
      radius: 100,
      maxResults: 5,
    } as WithinQuery);

    expect(results.length).toBe(5);
  });

  it('should include direction in results', () => {
    const entities = [createEntity('e1', { x: 10, y: 0, z: 0 })];
    executor.updateEntities(entities);

    const results = executor.execute({
      type: 'nearest',
      from: { x: 0, y: 0, z: 0 },
    } as NearestQuery);

    expect(results[0].direction).toBeDefined();
    expect(results[0].direction!.x).toBeCloseTo(1);
    expect(results[0].direction!.y).toBeCloseTo(0);
    expect(results[0].direction!.z).toBeCloseTo(0);
  });

  it('should handle entities directly on origin', () => {
    const entities = [
      createEntity('at_origin', { x: 0, y: 0, z: 0 }),
      createEntity('nearby', { x: 1, y: 0, z: 0 }),
    ];
    executor.updateEntities(entities);

    const results = executor.execute({
      type: 'within',
      from: { x: 0, y: 0, z: 0 },
      radius: 5,
    } as WithinQuery);

    expect(results.length).toBe(2);
    expect(results[0].distance).toBe(0);
  });

  it('should handle by_type with multiple types', () => {
    const entities = [
      createEntity('e1', { x: 5, y: 0, z: 0 }, 'npc'),
      createEntity('e2', { x: 10, y: 0, z: 0 }, 'item'),
      createEntity('e3', { x: 15, y: 0, z: 0 }, 'obstacle'),
    ];
    executor.updateEntities(entities);

    const results = executor.execute({
      type: 'by_type',
      from: { x: 0, y: 0, z: 0 },
      entityTypes: ['npc', 'item'],
    } as ByTypeQuery);

    expect(results.length).toBe(2);
    expect(results.map((r) => r.entity.type).sort()).toEqual(['item', 'npc']);
  });
});

// =============================================================================
// SIGHT LINE TESTS
// =============================================================================

describe('SpatialQueryExecutor - Sight Line', () => {
  let executor: SpatialQueryExecutor;

  beforeEach(() => {
    executor = new SpatialQueryExecutor();
  });

  it('should include sightLine in visible query results', () => {
    const entities = [createEntity('e1', { x: 10, y: 0, z: 0 })];
    executor.updateEntities(entities);

    const results = executor.execute({
      type: 'visible',
      from: { x: 0, y: 0, z: 0 },
    } as VisibleQuery);

    expect(results[0].sightLine).toBeDefined();
    expect(results[0].sightLine!.blocked).toBe(false);
    expect(results[0].sightLine!.from).toEqual({ x: 0, y: 0, z: 0 });
    expect(results[0].sightLine!.to).toEqual({ x: 10, y: 0, z: 0 });
  });
});

// =============================================================================
// BY TYPE QUERY TESTS
// =============================================================================

describe('SpatialQueryExecutor - By Type Query', () => {
  let executor: SpatialQueryExecutor;

  beforeEach(() => {
    executor = new SpatialQueryExecutor();
    const entities = [
      createEntity('npc1', { x: 5, y: 0, z: 0 }, 'npc'),
      createEntity('npc2', { x: 15, y: 0, z: 0 }, 'npc'),
      createEntity('item1', { x: 10, y: 0, z: 0 }, 'item'),
      createEntity('item2', { x: 25, y: 0, z: 0 }, 'item'),
    ];
    executor.updateEntities(entities);
  });

  it('should filter by single type', () => {
    const results = executor.execute({
      type: 'by_type',
      from: { x: 0, y: 0, z: 0 },
      entityTypes: ['npc'],
    } as ByTypeQuery);

    expect(results.length).toBe(2);
    expect(results.every((r) => r.entity.type === 'npc')).toBe(true);
  });

  it('should combine type filter with radius', () => {
    const results = executor.execute({
      type: 'by_type',
      from: { x: 0, y: 0, z: 0 },
      entityTypes: ['npc'],
      radius: 10,
    } as ByTypeQuery);

    expect(results.length).toBe(1);
    expect(results[0].entity.id).toBe('npc1');
  });

  it('should return empty for non-existent type', () => {
    const results = executor.execute({
      type: 'by_type',
      from: { x: 0, y: 0, z: 0 },
      entityTypes: ['vehicle'],
    } as ByTypeQuery);

    expect(results.length).toBe(0);
  });
});
