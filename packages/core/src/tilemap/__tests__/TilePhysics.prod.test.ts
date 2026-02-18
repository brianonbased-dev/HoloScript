/**
 * TilePhysics Production Tests
 *
 * AABB collision, solid checks, range queries, one-way platforms.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { TilePhysics } from '../TilePhysics';

// Minimal TileMap mock
function makeTileMap(solidTiles: Set<string> = new Set(), tileSize = 16, oneWayTiles: Set<string> = new Set()) {
  return {
    getTileSize: () => tileSize,
    isSolid: (tx: number, ty: number) => solidTiles.has(`${tx},${ty}`),
    getTile: (_layer: string, tx: number, ty: number) => {
      if (solidTiles.has(`${tx},${ty}`)) {
        return {
          id: 1,
          flags: oneWayTiles.has(`${tx},${ty}`) ? 2 : 0, // TileFlags.ONE_WAY = 2
        };
      }
      return null;
    },
  } as any;
}

describe('TilePhysics — Production', () => {
  describe('checkCollision', () => {
    it('detects collision with solid tile', () => {
      const map = makeTileMap(new Set(['1,1']));
      const phys = new TilePhysics(map);
      const results = phys.checkCollision({ x: 16, y: 16, w: 8, h: 8 });
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].collided).toBe(true);
    });

    it('no collision with empty tiles', () => {
      const map = makeTileMap(new Set());
      const phys = new TilePhysics(map);
      const results = phys.checkCollision({ x: 16, y: 16, w: 8, h: 8 });
      expect(results).toHaveLength(0);
    });

    it('one-way platform blocks when falling', () => {
      const map = makeTileMap(new Set(['1,1']), 16, new Set(['1,1']));
      const phys = new TilePhysics(map);
      const results = phys.checkCollision({ x: 16, y: 16, w: 8, h: 8 }, 1);
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].oneWay).toBe(true);
    });

    it('one-way platform allows moving up', () => {
      const map = makeTileMap(new Set(['1,1']), 16, new Set(['1,1']));
      const phys = new TilePhysics(map);
      const results = phys.checkCollision({ x: 16, y: 16, w: 8, h: 8 }, -1);
      expect(results).toHaveLength(0);
    });
  });

  describe('isTileSolid', () => {
    it('returns true for solid tile', () => {
      const map = makeTileMap(new Set(['2,3']));
      const phys = new TilePhysics(map);
      expect(phys.isTileSolid(2, 3)).toBe(true);
    });

    it('returns false for empty tile', () => {
      const map = makeTileMap(new Set());
      const phys = new TilePhysics(map);
      expect(phys.isTileSolid(2, 3)).toBe(false);
    });
  });

  describe('getTilesInRange', () => {
    it('finds solid tiles in range', () => {
      const map = makeTileMap(new Set(['0,0', '1,0', '5,5']));
      const phys = new TilePhysics(map);
      const tiles = phys.getTilesInRange(8, 8, 24, 24);
      expect(tiles.length).toBeGreaterThanOrEqual(2);
    });
  });
});
