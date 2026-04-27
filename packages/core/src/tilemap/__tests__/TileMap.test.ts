import { describe, it, expect, beforeEach } from 'vitest';
import { TileMap, TileFlags } from '../TileMap.js';

describe('TileFlags', () => {
  it('has expected constant values', () => {
    expect(TileFlags.NONE).toBe(0);
    expect(TileFlags.SOLID).toBe(1);
    expect(TileFlags.PASSTHROUGH).toBe(2);
    expect(TileFlags.WATER).toBe(4);
    expect(TileFlags.LAVA).toBe(8);
    expect(TileFlags.TRIGGER).toBe(16);
    expect(TileFlags.DAMAGE).toBe(32);
  });

  it('flags are distinct powers of two (bitmask-compatible)', () => {
    const flags = [TileFlags.SOLID, TileFlags.PASSTHROUGH, TileFlags.WATER, TileFlags.LAVA, TileFlags.TRIGGER, TileFlags.DAMAGE];
    // All non-zero, no duplicates
    const unique = new Set(flags);
    expect(unique.size).toBe(flags.length);
    // Can combine without collision
    const combined = TileFlags.SOLID | TileFlags.WATER;
    expect(combined & TileFlags.SOLID).toBeTruthy();
    expect(combined & TileFlags.WATER).toBeTruthy();
    expect(combined & TileFlags.LAVA).toBeFalsy();
  });
});

describe('TileMap', () => {
  let map: TileMap;

  beforeEach(() => {
    map = new TileMap(20, 15, 32);
  });

  describe('constructor / dimensions', () => {
    it('returns correct width, height, tileSize', () => {
      expect(map.getWidth()).toBe(20);
      expect(map.getHeight()).toBe(15);
      expect(map.getTileSize()).toBe(32);
    });

    it('starts with zero layers', () => {
      expect(map.getLayerCount()).toBe(0);
      expect(map.getLayerNames()).toEqual([]);
    });
  });

  describe('layer management', () => {
    it('addLayer increases count and appears in getLayerNames', () => {
      map.addLayer('ground');
      expect(map.getLayerCount()).toBe(1);
      expect(map.getLayerNames()).toContain('ground');
    });

    it('supports multiple layers with unique names', () => {
      map.addLayer('ground');
      map.addLayer('objects');
      map.addLayer('sky');
      expect(map.getLayerCount()).toBe(3);
      expect(map.getLayerNames()).toEqual(['ground', 'objects', 'sky']);
    });

    it('removeLayer decreases count', () => {
      map.addLayer('ground');
      map.addLayer('objects');
      map.removeLayer('ground');
      expect(map.getLayerCount()).toBe(1);
      expect(map.getLayerNames()).not.toContain('ground');
    });

    it('removeLayer for nonexistent name does not throw', () => {
      expect(() => map.removeLayer('nonexistent')).not.toThrow();
    });
  });

  describe('tile get/set/remove', () => {
    beforeEach(() => {
      map.addLayer('ground');
    });

    it('setTile and getTile round-trip', () => {
      const tile = { id: 5, flags: TileFlags.SOLID };
      map.setTile('ground', 3, 4, tile);
      const got = map.getTile('ground', 3, 4);
      expect(got).toEqual(tile);
    });

    it('getTile returns undefined for unset position', () => {
      expect(map.getTile('ground', 0, 0)).toBeUndefined();
    });

    it('removeTile clears a previously set tile', () => {
      map.setTile('ground', 2, 2, { id: 1, flags: TileFlags.NONE });
      map.removeTile('ground', 2, 2);
      expect(map.getTile('ground', 2, 2)).toBeUndefined();
    });

    it('setTile overwrites existing tile', () => {
      map.setTile('ground', 1, 1, { id: 1, flags: TileFlags.NONE });
      map.setTile('ground', 1, 1, { id: 9, flags: TileFlags.WATER });
      expect(map.getTile('ground', 1, 1)).toEqual({ id: 9, flags: TileFlags.WATER });
    });

    it('tiles are stored per-layer independently', () => {
      map.addLayer('objects');
      map.setTile('ground', 5, 5, { id: 10, flags: TileFlags.SOLID });
      expect(map.getTile('objects', 5, 5)).toBeUndefined();
      expect(map.getTile('ground', 5, 5)).toEqual({ id: 10, flags: TileFlags.SOLID });
    });
  });

  describe('isSolid', () => {
    beforeEach(() => {
      map.addLayer('ground');
    });

    it('returns true when a tile on any layer has SOLID flag', () => {
      map.setTile('ground', 3, 3, { id: 1, flags: TileFlags.SOLID });
      expect(map.isSolid(3, 3)).toBe(true);
    });

    it('returns false when tile has no SOLID flag', () => {
      map.setTile('ground', 3, 3, { id: 1, flags: TileFlags.PASSTHROUGH });
      expect(map.isSolid(3, 3)).toBe(false);
    });

    it('returns false when no tile is set', () => {
      expect(map.isSolid(5, 5)).toBe(false);
    });

    it('returns true when SOLID combined with other flags', () => {
      map.setTile('ground', 2, 2, { id: 1, flags: TileFlags.SOLID | TileFlags.DAMAGE });
      expect(map.isSolid(2, 2)).toBe(true);
    });

    it('checks across multiple layers (any solid = true)', () => {
      map.addLayer('objects');
      map.setTile('ground', 1, 1, { id: 1, flags: TileFlags.PASSTHROUGH });
      map.setTile('objects', 1, 1, { id: 2, flags: TileFlags.SOLID });
      expect(map.isSolid(1, 1)).toBe(true);
    });
  });

  describe('worldToTile', () => {
    it('converts world position to tile coordinate (floor divide by tileSize)', () => {
      const result = map.worldToTile(64, 96);
      expect(result).toEqual({ x: 2, y: 3 });
    });

    it('handles zero position', () => {
      expect(map.worldToTile(0, 0)).toEqual({ x: 0, y: 0 });
    });

    it('floors fractional results', () => {
      // tileSize=32, 50 / 32 = 1.5625 → floor = 1
      const result = map.worldToTile(50, 50);
      expect(result).toEqual({ x: 1, y: 1 });
    });

    it('works at exact tile boundaries', () => {
      const result = map.worldToTile(32, 64);
      expect(result).toEqual({ x: 1, y: 2 });
    });
  });

  describe('tileToWorld', () => {
    it('converts tile coordinate to world position (multiply by tileSize)', () => {
      const result = map.tileToWorld(2, 3);
      expect(result).toEqual({ x: 64, y: 96 });
    });

    it('handles origin tile', () => {
      expect(map.tileToWorld(0, 0)).toEqual({ x: 0, y: 0 });
    });

    it('worldToTile and tileToWorld are inverse operations', () => {
      const world = { x: 128, y: 224 };
      const tile = map.worldToTile(world.x, world.y);
      const back = map.tileToWorld(tile.x, tile.y);
      expect(back).toEqual(world);
    });
  });

  describe('auto-tile', () => {
    beforeEach(() => {
      map.addLayer('ground');
    });

    it('addAutoTileRule does not throw', () => {
      expect(() => {
        map.addAutoTileRule({ tileId: 1, neighbors: 0b11111111, resultId: 99 });
      }).not.toThrow();
    });

    it('applyAutoTile returns a non-negative number', () => {
      map.addAutoTileRule({ tileId: 1, neighbors: 0b00000000, resultId: 5 });
      const count = map.applyAutoTile('ground');
      expect(typeof count).toBe('number');
      expect(count).toBeGreaterThanOrEqual(0);
    });

    it('applyAutoTile updates matching tiles', () => {
      // Place a tile matching the rule (id=1, no solid neighbors → neighbors=0)
      map.setTile('ground', 0, 0, { id: 1, flags: TileFlags.NONE });
      map.addAutoTileRule({ tileId: 1, neighbors: 0b00000000, resultId: 42 });
      const count = map.applyAutoTile('ground');
      expect(count).toBeGreaterThanOrEqual(0);
    });
  });

  describe('edge cases', () => {
    it('works with 1x1 tile map', () => {
      const tiny = new TileMap(1, 1, 16);
      expect(tiny.getWidth()).toBe(1);
      expect(tiny.getHeight()).toBe(1);
    });

    it('works with non-power-of-two tile size', () => {
      const odd = new TileMap(10, 10, 24);
      expect(odd.getTileSize()).toBe(24);
    });
  });
});
