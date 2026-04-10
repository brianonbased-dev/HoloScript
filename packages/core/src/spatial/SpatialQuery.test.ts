import { describe, it, expect, beforeEach } from 'vitest';
import { SpatialQueryExecutor, SpatialQuery } from './SpatialQuery';
import { SpatialEntity, Region, SpatialEntityType } from './SpatialTypes';

describe('SpatialQueryExecutor', () => {
  let executor: SpatialQueryExecutor;
  let entities: SpatialEntity[];
  let regions: Region[];

  beforeEach(() => {
    executor = new SpatialQueryExecutor();

    // Setup mock entities
    entities = [
      {
        id: 'entity-1',
        type: 'player',
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
      },
      {
        id: 'entity-2',
        type: 'npc',
        position: { x: 10, y: 0, z: 0 }, // 10m away
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
        bounds: { min: { x: 9.5, y: -0.5, z: -0.5 }, max: { x: 10.5, y: 0.5, z: 0.5 } }, // Box bounds
      },
      {
        id: 'entity-3',
        type: 'item',
        position: { x: 0, y: 10, z: 0 }, // 10m up
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
        bounds: { radius: 1, center: { x: 0, y: 10, z: 0 } }, // Sphere bounds
      },
      {
        id: 'entity-4',
        type: 'obstacle',
        position: { x: 5, y: 0, z: 0 }, // Between 1 and 2
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 5, z: 1 }, // Tall wall
        bounds: { min: { x: 4.5, y: -2.5, z: -2.5 }, max: { x: 5.5, y: 2.5, z: 2.5 } },
      },
    ];

    regions = [
      {
        id: 'region-1',
        type: 'zone',
        bounds: { min: { x: -5, y: -5, z: -5 }, max: { x: 5, y: 5, z: 5 } }, // Origin box
        priority: 1,
      },
      {
        id: 'region-2',
        type: 'room',
        bounds: { radius: 15, center: { x: 0, y: 0, z: 0 } }, // Big sphere
        priority: 0,
      },
    ];

    executor.updateEntities(entities);
    executor.updateRegions(regions);
  });

  describe('executeNearest', () => {
    it('should find nearest entity', () => {
      const query: SpatialQuery = {
        type: 'nearest',
        from: { x: 0, y: 0, z: 0 },
        count: 1,
      };

      const results = executor.execute(query);
      // entity-1 is at 0,0,0, so dist is 0
      expect(results.length).toBe(1);
      expect(results[0].entity.id).toBe('entity-1');
      expect(results[0].distance).toBe(0);
    });

    it('should exclude self if managed correctly (caller responsibility) but here just sorts', () => {
      const query: SpatialQuery = {
        type: 'nearest',
        from: { x: 1, y: 0, z: 0 }, // Close to entity-1
        count: 2,
      };
      const results = executor.execute(query);
      expect(results[0].entity.id).toBe('entity-1');
      expect(results[1].entity.id).toBe('entity-4'); // at x=5, dist=4
    });
  });

  describe('executeWithin', () => {
    it('should find entities within radius', () => {
      const query: SpatialQuery = {
        type: 'within',
        from: { x: 0, y: 0, z: 0 },
        radius: 6,
      };
      const results = executor.execute(query);
      // Should find entity-1 (0m) and entity-4 (5m)
      // entity-2 is 10m, entity-3 is 10m
      expect(results.length).toBe(2);
      const ids = results.map((r) => r.entity.id).sort();
      expect(ids).toEqual(['entity-1', 'entity-4']);
    });
  });

  describe('executeRaycast', () => {
    it('should detect hits along a ray', () => {
      const query: SpatialQuery = {
        type: 'raycast',
        from: { x: 0, y: 0, z: 0 },
        direction: { x: 1, y: 0, z: 0 }, // Towards pos x
        maxDistance: 20,
      };

      // Ray starts at 0,0,0 inside entity-1 (ignored? usually raycast filters self if origin inside? implementation uses sphere check)
      // Entity-4 is at x=5 (wall)
      // Entity-2 is at x=10

      // Let's filter out entity-1 to be clean, or accept it might hit if logic allows internal hits
      // The logic: raycastEntity uses ray-sphere intersection.
      // Entity-1 (default radius 0.5). Origin inside sphere -> t usually negative or 0?
      // t = (-b - sqrt)/2a. If inside, c < 0. sqrt > b. t < 0.
      // So entities containing origin are usually missed by basic ray-sphere unless logic handles inside.
      // But let's see.

      const results = executor.execute(query);

      // Should hit entity-4 (x=5) and entity-2 (x=10)
      // entity-3 is at y=10 (miss)

      const hitIds = results.map((r) => r.entity.id);
      expect(hitIds).toContain('entity-4');
      expect(hitIds).toContain('entity-2');
    });

    it('should stop at first hit if hitFirst is true', () => {
      // Start far enough back to be outside of bounding spheres
      const query: SpatialQuery = {
        type: 'raycast',
        from: { x: 0, y: 0, z: 0 },
        direction: { x: 1, y: 0, z: 0 },
        maxDistance: 20,
        hitFirst: true,
      };
      const results = executor.execute(query);

      // Should sort by distance.
      // Entity-4 is closer (x=5) than Entity-2 (x=10).

      expect(results.length).toBe(1);
      expect(results[0].entity.id).toBe('entity-4'); // x=5
    });
  });

  describe('executeVisible', () => {
    it('should determine visibility with occlusion', () => {
      // entity-2 (x=10) is blocked by entity-4 (x=5) from origin (0,0)
      const query: SpatialQuery = {
        type: 'visible',
        from: { x: 0, y: 0, z: 0 },
        maxDistance: 20,
      };

      // Note: entity-1 is at 0,0. It gets excluded from its own occlusion check usually?
      // Implementation: iter candidates. checkSightLine(from, to, entities, excludeId=entity.id).
      // If checksightline hits another entity < dist, blocked.

      const results = executor.execute(query);
      const ids = results.map((r) => r.entity.id);

      // Entity-1: dist 0.
      // Entity-3: y=10. Line from 0,0 to 0,10. Unblocked.
      // Entity-4: x=5. Unblocked.
      // Entity-2: x=10. Line 0,0 -> 10,0. Hits Entity-4 at x=5?
      // Entity-4 bounds: 4.5 to 5.5 on x, -2.5 to 2.5 on y/z.
      // Ray 0,0,0 -> 1 passes through 5,0,0. So it should hit.

      expect(ids).toContain('entity-3');
      expect(ids).toContain('entity-4');
      expect(ids).not.toContain('entity-2'); // Occluded
    });

    it('should respect FOV', () => {
      const query: SpatialQuery = {
        type: 'visible',
        from: { x: 0, y: 0, z: 0 },
        direction: { x: 0, y: 1, z: 0 }, // Look UP using Y axis
        fov: 90,
        maxDistance: 20,
      };

      const results = executor.execute(query);
      const ids = results.map((r) => r.entity.id);

      // Should see entity-3 (y=10)
      // Should NOT see entity-2 (x=10, 90 deg away from Y? Dot product 0. Angle 90. FOV/2 = 45. 90 > 45. Skipped.)

      expect(ids).toContain('entity-3');
      expect(ids).not.toContain('entity-2');
    });
  });

  describe('executeInRegion', () => {
    it('should find entities in bounding box region', () => {
      // Region-1 is box -5 to 5.
      // Entity-1 (0,0) inside.
      // Entity-4 (5,0) - likely on edge/inside? Bounds 4.5 to 5.5. Center 5.0.
      // isInRegion checks CENTER point.
      // Entity-4 center is 5,0,0. Region max x is 5. Inclusive? isPointInBox usually inclusive.

      const query: SpatialQuery = {
        type: 'in_region',
        from: { x: 0, y: 0, z: 0 }, // 'from' just for sorting results
        region: regions[0], // region-1
      };

      const results = executor.execute(query);
      const ids = results.map((r) => r.entity.id);

      expect(ids).toContain('entity-1');
      expect(ids).toContain('entity-4'); // On boundary
      expect(ids).not.toContain('entity-2'); // x=10, outside
    });
  });

  describe('executeByType', () => {
    it('should filter by type', () => {
      const query: SpatialQuery = {
        type: 'by_type',
        from: { x: 0, y: 0, z: 0 },
        entityTypes: ['npc', 'item'],
      };
      const results = executor.execute(query);
      const ids = results.map((r) => r.entity.id);

      expect(ids).toContain('entity-2'); // npc
      expect(ids).toContain('entity-3'); // item
      expect(ids).not.toContain('entity-4'); // obstacle
    });
  });
});
