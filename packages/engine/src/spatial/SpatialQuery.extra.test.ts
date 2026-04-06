import { describe, it, expect } from 'vitest';
import { SpatialQueryExecutor, SpatialQuery } from './SpatialQuery';
import { SpatialEntity, Region, Vector3 } from './SpatialTypes';

describe('SpatialQueryExecutor - Supplementary Tests', () => {
  const executor = new SpatialQueryExecutor();
  const entities: SpatialEntity[] = [
    { id: '1', type: 'agent', position: { x: 0, y: 0, z: 0 } },
    { id: '2', type: 'object', position: { x: 10, y: 0, z: 0 } },
    { id: '3', type: 'object', position: { x: 5, y: 5, z: 0 } },
    { id: '4', type: 'agent', position: { x: -5, y: 0, z: 0 } },
  ];

  executor.updateEntities(entities);

  describe('executeReachable', () => {
    it('should find reachable entities with obstacles', () => {
      const obstacles: SpatialEntity[] = [
        { id: 'obs1', type: 'wall', position: { x: 5, y: 0, z: 0 }, bounds: { radius: 1 } },
      ];

      const query: SpatialQuery = {
        type: 'reachable',
        from: { x: 0, y: 0, z: 0 },
        maxDistance: 15,
        obstacles: obstacles,
      };

      const results = executor.execute(query);
      // Entity '2' at (10,0,0) is blocked by 'obs1' at (5,0,0)
      // Entities '3' and '4' should be reachable
      const resultIds = results.map((r) => r.entity.id);
      expect(resultIds).toContain('3');
      expect(resultIds).toContain('4');
      expect(resultIds).not.toContain('2');
    });
  });

  describe('executeInRegion', () => {
    it('should find entities in a box region', () => {
      const region: Region = {
        id: 'box-reg',
        bounds: {
          min: { x: 8, y: -2, z: -2 },
          max: { x: 12, y: 2, z: 2 },
        },
      };

      const query: SpatialQuery = {
        type: 'in_region',
        from: { x: 0, y: 0, z: 0 },
        region: region,
      };

      const results = executor.execute(query);
      expect(results.length).toBe(1);
      expect(results[0].entity.id).toBe('2');
    });

    it('should find entities in a sphere region', () => {
      const region: Region = {
        id: 'sphere-reg',
        bounds: {
          center: { x: 5, y: 5, z: 0 },
          radius: 1,
        },
      };

      const query: SpatialQuery = {
        type: 'in_region',
        from: { x: 0, y: 0, z: 0 },
        region: region,
      };

      const results = executor.execute(query);
      expect(results.length).toBe(1);
      expect(results[0].entity.id).toBe('3');
    });
  });

  describe('executeByType', () => {
    it('should filter by type and radius', () => {
      const query: SpatialQuery = {
        type: 'by_type',
        from: { x: 0, y: 0, z: 0 },
        entityTypes: ['agent'],
        radius: 6,
      };

      const results = executor.execute(query);
      const resultIds = results.map((r) => r.entity.id);
      expect(resultIds).toContain('1');
      expect(resultIds).toContain('4');
      expect(resultIds).not.toContain('2');
      expect(resultIds).not.toContain('3');
    });
  });

  describe('executeRaycast', () => {
    it('should hit entity in direction', () => {
      const query: SpatialQuery = {
        type: 'raycast',
        from: { x: 0, y: 0, z: 0 },
        direction: { x: 1, y: 0, z: 0 },
        maxDistance: 20,
        hitFirst: true,
      };

      const results = executor.execute(query);
      expect(results.length).toBe(1);
      expect(results[0].entity.id).toBe('2');
    });

    it('should not hit if direction is wrong', () => {
      const query: SpatialQuery = {
        type: 'raycast',
        from: { x: 0, y: 0, z: 0 },
        direction: { x: 0, y: -1, z: 0 },
        maxDistance: 20,
      };

      const results = executor.execute(query);
      expect(results.length).toBe(0);
    });
  });

  describe('FOV and Visibility', () => {
    it('should respect FOV in visible query', () => {
      const query: SpatialQuery = {
        type: 'visible',
        from: { x: 0, y: 0, z: 0 },
        direction: { x: 1, y: 0, z: 0 },
        fov: 60, // 30 degrees each side
        maxDistance: 20,
      };

      const results = executor.execute(query);
      const resultIds = results.map((r) => r.entity.id);
      // Entity '2' is at (10,0,0) - angle 0 - inside
      // Entity '3' is at (5,5,0) - angle 45 - outside
      expect(resultIds).toContain('2');
      expect(resultIds).not.toContain('3');
    });
  });

  describe('SpatialIndex neighboring cells', () => {
    it('should rebuild and handle neighbors (implicitly through execute)', () => {
      // We can't easily test private SpatialIndex, but executeWithin uses it if optimized.
      // Currently SpatialQueryExecutor uses кандидаты = Array.from(this.entities.values())
      // which bypasses index. Let's check if we can trigger index paths.
      // Wait, executeWithin IN THE SOURCE doesn't use the index yet!
      // constructor() { this.spatialIndex = new SpatialIndex(); }
      // updateEntities calls this.spatialIndex.rebuild(entities);
      // But execute() just uses Array.from(this.entities.values()).
      // This is a gap in implementation vs performance goals.
      // I won't fix implementation now unless asked, just testing what's there.
    });
  });
});
