import { describe, it, expect } from 'vitest';
import { SpatialHash } from '../performance/SpatialHash';
import { FrustumCuller } from '../performance/FrustumCuller';
import { LODSystem } from '../performance/LODSystem';

describe('Performance & LOD', () => {
  describe('SpatialHash', () => {
    it('Inserts and queries entities', () => {
      const sh = new SpatialHash(10);
      sh.insert({ id: 'a', position: [0, 0, 0] });
      sh.insert({ id: 'b', position: [3, 0, 0] });
      sh.insert({ id: 'c', position: [100, 0, 0] });

      const near = sh.queryRadius(0, 0, 0, 5);
      expect(near.map((e) => e.id)).toContain('a');
      expect(near.map((e) => e.id)).toContain('b');
      expect(near.map((e) => e.id)).not.toContain('c');
    });

    it('Removes entities', () => {
      const sh = new SpatialHash(10);
      sh.insert({ id: 'a', position: [0, 0, 0] });
      expect(sh.count).toBe(1);
      sh.remove('a');
      expect(sh.count).toBe(0);
      expect(sh.queryRadius(0, 0, 0, 5)).toHaveLength(0);
    });

    it('Handles entity radius', () => {
      const sh = new SpatialHash(10);
      sh.insert({ id: 'big', position: [8, 0, 0], radius: 3 });
      // Entity at x=8 with radius=3 should overlap with query at x=0 radius=5 (5+3=8)
      const results = sh.queryRadius(0, 0, 0, 5);
      expect(results.map((e) => e.id)).toContain('big');
    });
  });

  describe('FrustumCuller', () => {
    it('Culls objects outside frustum via near/far planes', () => {
      const culler = new FrustumCuller();
      culler.setFrustumFromPerspective(
        [0, 0, 0],
        [0, 0, -1],
        [0, 1, 0],
        Math.PI / 3,
        1.0,
        0.1,
        50
      );

      // In front, within far range → visible
      const inRange = { id: 'inRange', position: [0, 0, -10], radius: 1 };
      // Way beyond far plane → culled
      const beyondFar = { id: 'beyondFar', position: [0, 0, -200], radius: 1 };

      expect(culler.isVisible(inRange)).toBe(true);
      expect(culler.isVisible(beyondFar)).toBe(false);
    });

    it('Cull filters objects and tracks count', () => {
      const culler = new FrustumCuller();
      culler.setFrustumFromPerspective(
        [0, 0, 0],
        [0, 0, -1],
        [0, 1, 0],
        Math.PI / 3,
        1.0,
        0.1,
        20
      );

      const objects = [
        { id: 'a', position: [0, 0, -5], radius: 1 }, // In range
        { id: 'b', position: [0, 0, -100], radius: 1 }, // Beyond far
      ];

      const visible = culler.cull(objects);
      expect(visible.length).toBeLessThan(objects.length);
      expect(culler.getLastCullCount()).toBeGreaterThan(0);
    });
  });


  describe('LODSystem', () => {
    it('Selects LOD level by distance', () => {
      const lod = new LODSystem();
      lod.register({
        entityId: 'tree',
        levels: [
          { minDistance: 0, label: 'high' },
          { minDistance: 10, label: 'medium' },
          { minDistance: 30, label: 'low' },
        ],
      });

      const positions = new Map([['tree', [5, 0, 0]]]);

      // Camera at origin, tree at x=5 → distance=5 → 'high'
      lod.update([0, 0, 0], positions);
      expect(lod.getActiveLevel('tree')).toBe('high');

      // Move tree further
      positions.set('tree', [15, 0, 0]);
      lod.update([0, 0, 0], positions);
      expect(lod.getActiveLevel('tree')).toBe('medium');

      positions.set('tree', [50, 0, 0]);
      lod.update([0, 0, 0], positions);
      expect(lod.getActiveLevel('tree')).toBe('low');
    });

    it('Registers and unregisters', () => {
      const lod = new LODSystem();
      lod.register({ entityId: 'a', levels: [{ minDistance: 0, label: 'hi' }] });
      expect(lod.count).toBe(1);
      lod.unregister('a');
      expect(lod.count).toBe(0);
    });
  });
});
