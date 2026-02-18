import { describe, it, expect, beforeEach } from 'vitest';
import { TileMap, TileFlags, type TileData } from '../TileMap';

describe('TileMap', () => {
  let map: TileMap;

  beforeEach(() => {
    map = new TileMap(32, 24, 16);
    map.addLayer('ground');
  });

  it('constructor sets dimensions', () => {
    expect(map.getWidth()).toBe(32);
    expect(map.getHeight()).toBe(24);
    expect(map.getTileSize()).toBe(16);
  });

  it('addLayer and getLayerCount', () => {
    expect(map.getLayerCount()).toBe(1);
    map.addLayer('walls');
    expect(map.getLayerCount()).toBe(2);
  });

  it('removeLayer decreases count', () => {
    map.addLayer('walls');
    map.removeLayer('walls');
    expect(map.getLayerCount()).toBe(1);
  });

  it('getLayer returns correct layer', () => {
    const layer = map.getLayer('ground');
    expect(layer?.name).toBe('ground');
    expect(layer?.visible).toBe(true);
  });

  it('setTile and getTile', () => {
    const tile: TileData = { id: 1, flags: TileFlags.SOLID };
    map.setTile('ground', 5, 3, tile);
    expect(map.getTile('ground', 5, 3)).toBe(tile);
  });

  it('getTile returns undefined for empty position', () => {
    expect(map.getTile('ground', 0, 0)).toBeUndefined();
  });

  it('removeTile deletes tile', () => {
    map.setTile('ground', 2, 2, { id: 1, flags: 0 });
    map.removeTile('ground', 2, 2);
    expect(map.getTile('ground', 2, 2)).toBeUndefined();
  });

  it('isSolid checks across all layers', () => {
    map.addLayer('walls');
    map.setTile('walls', 1, 1, { id: 2, flags: TileFlags.SOLID });
    expect(map.isSolid(1, 1)).toBe(true);
    expect(map.isSolid(0, 0)).toBe(false);
  });

  it('isSolid uses flag bitmask', () => {
    map.setTile('ground', 3, 3, { id: 1, flags: TileFlags.ONE_WAY }); // not solid
    expect(map.isSolid(3, 3)).toBe(false);
    map.setTile('ground', 3, 3, { id: 1, flags: TileFlags.SOLID | TileFlags.DESTRUCTIBLE });
    expect(map.isSolid(3, 3)).toBe(true);
  });

  it('worldToTile converts coordinates', () => {
    expect(map.worldToTile(48, 32)).toEqual({ x: 3, y: 2 });
    expect(map.worldToTile(15, 15)).toEqual({ x: 0, y: 0 });
  });

  it('tileToWorld converts coordinates', () => {
    expect(map.tileToWorld(3, 2)).toEqual({ x: 48, y: 32 });
  });

  it('auto-tile rules apply correctly', () => {
    // Set up a 3x3 block of tile id=1
    for (let x = 0; x < 3; x++) {
      for (let y = 0; y < 3; y++) {
        map.setTile('ground', x, y, { id: 1, flags: 0 });
      }
    }
    // Rule: center tile with id=1 and all 8 neighbors of id=1 → becomes id=9
    map.addAutoTileRule({ tileId: 1, neighbors: 0xFF, resultId: 9 });
    const count = map.applyAutoTile('ground');
    // Only center tile (1,1) has all 8 neighbors
    expect(count).toBe(1);
    expect(map.getTile('ground', 1, 1)?.id).toBe(9);
  });

  it('applyAutoTile returns 0 for unknown layer', () => {
    expect(map.applyAutoTile('nonexistent')).toBe(0);
  });
});
