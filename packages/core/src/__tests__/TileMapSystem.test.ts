import { describe, it, expect } from 'vitest';
import { TileMap, TileFlags } from '@holoscript/engine/tilemap/TileMap';

// =============================================================================
// C207 — Tile Map
// =============================================================================

describe('TileMap', () => {
  // --- Constructor & Getters ---

  it('constructor sets dimensions and tile size', () => {
    const tm = new TileMap(32, 24, 16);
    expect(tm.getWidth()).toBe(32);
    expect(tm.getHeight()).toBe(24);
    expect(tm.getTileSize()).toBe(16);
  });

  // --- Layer Management ---

  it('addLayer creates a visible layer', () => {
    const tm = new TileMap(10, 10, 16);
    tm.addLayer('ground');
    const layer = tm.getLayer('ground');
    expect(layer).toBeDefined();
    expect(layer!.visible).toBe(true);
    expect(layer!.tiles.size).toBe(0);
  });

  it('addLayer with zOrder', () => {
    const tm = new TileMap(10, 10, 16);
    tm.addLayer('bg', -1);
    tm.addLayer('fg', 5);
    expect(tm.getLayer('bg')!.zOrder).toBe(-1);
    expect(tm.getLayer('fg')!.zOrder).toBe(5);
  });

  it('removeLayer deletes the layer', () => {
    const tm = new TileMap(10, 10, 16);
    tm.addLayer('temp');
    tm.removeLayer('temp');
    expect(tm.getLayer('temp')).toBeUndefined();
  });

  it('getLayerCount tracks layers', () => {
    const tm = new TileMap(10, 10, 16);
    expect(tm.getLayerCount()).toBe(0);
    tm.addLayer('a');
    tm.addLayer('b');
    expect(tm.getLayerCount()).toBe(2);
  });

  // --- Tile Access ---

  it('setTile / getTile round trip', () => {
    const tm = new TileMap(10, 10, 16);
    tm.addLayer('ground');
    tm.setTile('ground', 3, 4, { id: 1, flags: TileFlags.SOLID });
    const tile = tm.getTile('ground', 3, 4);
    expect(tile).toBeDefined();
    expect(tile!.id).toBe(1);
    expect(tile!.flags).toBe(TileFlags.SOLID);
  });

  it('getTile returns undefined for empty cell', () => {
    const tm = new TileMap(10, 10, 16);
    tm.addLayer('ground');
    expect(tm.getTile('ground', 0, 0)).toBeUndefined();
  });

  it('removeTile deletes the tile', () => {
    const tm = new TileMap(10, 10, 16);
    tm.addLayer('ground');
    tm.setTile('ground', 1, 1, { id: 5, flags: 0 });
    tm.removeTile('ground', 1, 1);
    expect(tm.getTile('ground', 1, 1)).toBeUndefined();
  });

  it('setTile on non-existent layer is no-op', () => {
    const tm = new TileMap(10, 10, 16);
    tm.setTile('missing', 0, 0, { id: 1, flags: 0 }); // should not throw
    expect(tm.getTile('missing', 0, 0)).toBeUndefined();
  });

  // --- isSolid ---

  it('isSolid returns true for SOLID tiles', () => {
    const tm = new TileMap(10, 10, 16);
    tm.addLayer('ground');
    tm.setTile('ground', 2, 2, { id: 1, flags: TileFlags.SOLID });
    expect(tm.isSolid(2, 2)).toBe(true);
  });

  it('isSolid returns false for non-solid tiles', () => {
    const tm = new TileMap(10, 10, 16);
    tm.addLayer('ground');
    tm.setTile('ground', 2, 2, { id: 1, flags: TileFlags.TRIGGER });
    expect(tm.isSolid(2, 2)).toBe(false);
  });

  it('isSolid checks across all layers', () => {
    const tm = new TileMap(10, 10, 16);
    tm.addLayer('bg');
    tm.addLayer('collision');
    tm.setTile('bg', 0, 0, { id: 1, flags: TileFlags.NONE });
    tm.setTile('collision', 0, 0, { id: 2, flags: TileFlags.SOLID });
    expect(tm.isSolid(0, 0)).toBe(true);
  });

  it('isSolid returns false for empty cell', () => {
    const tm = new TileMap(10, 10, 16);
    tm.addLayer('ground');
    expect(tm.isSolid(5, 5)).toBe(false);
  });

  // --- Coordinate Conversion ---

  it('worldToTile converts world coords', () => {
    const tm = new TileMap(10, 10, 32);
    expect(tm.worldToTile(48, 64)).toEqual({ x: 1, y: 2 });
  });

  it('tileToWorld converts tile coords', () => {
    const tm = new TileMap(10, 10, 32);
    expect(tm.tileToWorld(3, 4)).toEqual({ x: 96, y: 128 });
  });

  it('worldToTile handles fractional positions', () => {
    const tm = new TileMap(10, 10, 16);
    expect(tm.worldToTile(15.9, 0)).toEqual({ x: 0, y: 0 });
    expect(tm.worldToTile(16.0, 0)).toEqual({ x: 1, y: 0 });
  });

  // --- Auto-Tiling ---

  it('addAutoTileRule and applyAutoTile with matching mask', () => {
    const tm = new TileMap(10, 10, 16);
    tm.addLayer('ground');

    // Place a 3×3 block of tile id 1
    for (let x = 0; x < 3; x++) {
      for (let y = 0; y < 3; y++) {
        tm.setTile('ground', x, y, { id: 1, flags: 0 });
      }
    }

    // Rule: center tile (1,1) with all 8 neighbors = 0xFF → becomes tile 99
    tm.addAutoTileRule({ tileId: 1, neighbors: 0xff, resultId: 99 });
    const count = tm.applyAutoTile('ground');
    expect(count).toBeGreaterThanOrEqual(1);
    // The center tile should have been replaced
    expect(tm.getTile('ground', 1, 1)!.id).toBe(99);
  });

  it('applyAutoTile returns 0 for non-existent layer', () => {
    const tm = new TileMap(10, 10, 16);
    expect(tm.applyAutoTile('missing')).toBe(0);
  });

  // --- TileFlags bitfield ---

  it('TileFlags constants are correct powers of 2', () => {
    expect(TileFlags.NONE).toBe(0);
    expect(TileFlags.SOLID).toBe(1);
    expect(TileFlags.ONE_WAY).toBe(2);
    expect(TileFlags.SLOPE).toBe(4);
    expect(TileFlags.DESTRUCTIBLE).toBe(8);
    expect(TileFlags.TRIGGER).toBe(16);
  });

  it('tile metadata is preserved', () => {
    const tm = new TileMap(10, 10, 16);
    tm.addLayer('data');
    tm.setTile('data', 0, 0, { id: 1, flags: 0, metadata: { type: 'water' } });
    expect(tm.getTile('data', 0, 0)!.metadata!.type).toBe('water');
  });
});
