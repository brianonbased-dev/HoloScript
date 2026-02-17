import { describe, it, expect, beforeEach } from 'vitest';
import { TileMap, TileFlags } from '../TileMap';
import type { TileData } from '../TileMap';

function tile(id: number, flags = TileFlags.NONE): TileData {
  return { id, flags };
}

describe('TileMap', () => {
  let map: TileMap;

  beforeEach(() => {
    map = new TileMap(16, 16, 32);
    map.addLayer('ground');
  });

  // ---------------------------------------------------------------------------
  // Dimensions
  // ---------------------------------------------------------------------------

  it('getWidth returns tile count', () => {
    expect(map.getWidth()).toBe(16);
  });

  it('getHeight returns tile count', () => {
    expect(map.getHeight()).toBe(16);
  });

  it('getTileSize returns size', () => {
    expect(map.getTileSize()).toBe(32);
  });

  // ---------------------------------------------------------------------------
  // Tile Data
  // ---------------------------------------------------------------------------

  it('setTile / getTile stores and retrieves', () => {
    map.setTile('ground', 3, 5, tile(42));
    const t = map.getTile('ground', 3, 5);
    expect(t?.id).toBe(42);
  });

  it('getTile returns undefined for unset', () => {
    expect(map.getTile('ground', 0, 0)).toBeUndefined();
  });

  it('removeTile clears a tile', () => {
    map.setTile('ground', 1, 1, tile(10));
    map.removeTile('ground', 1, 1);
    expect(map.getTile('ground', 1, 1)).toBeUndefined();
  });

  // ---------------------------------------------------------------------------
  // Layers
  // ---------------------------------------------------------------------------

  it('addLayer creates a new layer', () => {
    map.addLayer('overlay');
    expect(map.getLayerCount()).toBe(2);
  });

  it('setTile operates on specified layer', () => {
    map.addLayer('fg');
    map.setTile('fg', 0, 0, tile(99));
    expect(map.getTile('fg', 0, 0)?.id).toBe(99);
    expect(map.getTile('ground', 0, 0)).toBeUndefined(); // different layer
  });

  it('removeLayer removes a layer', () => {
    map.addLayer('temp');
    const before = map.getLayerCount();
    map.removeLayer('temp');
    expect(map.getLayerCount()).toBe(before - 1);
  });

  it('getLayer returns layer by name', () => {
    const layer = map.getLayer('ground');
    expect(layer).toBeDefined();
    expect(layer!.name).toBe('ground');
  });

  // ---------------------------------------------------------------------------
  // World ↔ Tile Conversions
  // ---------------------------------------------------------------------------

  it('worldToTile converts pixel to tile coord', () => {
    const { x, y } = map.worldToTile(64, 96);
    expect(x).toBe(2); // 64 / 32
    expect(y).toBe(3); // 96 / 32
  });

  it('tileToWorld converts tile to pixel coord', () => {
    const { x, y } = map.tileToWorld(2, 3);
    expect(x).toBe(64);
    expect(y).toBe(96);
  });

  // ---------------------------------------------------------------------------
  // Solidity
  // ---------------------------------------------------------------------------

  it('isSolid returns false for empty tiles', () => {
    expect(map.isSolid(0, 0)).toBe(false);
  });

  it('isSolid detects solid flag', () => {
    map.setTile('ground', 5, 5, tile(1, TileFlags.SOLID));
    expect(map.isSolid(5, 5)).toBe(true);
  });

  it('isSolid checks all layers', () => {
    map.addLayer('collision');
    map.setTile('collision', 3, 3, tile(1, TileFlags.SOLID));
    expect(map.isSolid(3, 3)).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // Auto-Tiling
  // ---------------------------------------------------------------------------

  it('addAutoTileRule registers rule', () => {
    map.addAutoTileRule({ tileId: 1, neighbors: 0b11111111, resultId: 2 });
    // No error → success
  });

  it('applyAutoTile transforms matching tiles', () => {
    // Set a 3x3 block of tile id=1
    for (let y = 0; y < 3; y++) {
      for (let x = 0; x < 3; x++) {
        map.setTile('ground', x, y, tile(1));
      }
    }
    // Rule: if all 8 neighbors match → change to id 2
    map.addAutoTileRule({ tileId: 1, neighbors: 0b11111111, resultId: 2 });
    const count = map.applyAutoTile('ground');
    expect(count).toBeGreaterThanOrEqual(1);
    // Center tile (1,1) should have all 8 neighbors
    expect(map.getTile('ground', 1, 1)?.id).toBe(2);
  });

  it('applyAutoTile returns 0 for nonexistent layer', () => {
    expect(map.applyAutoTile('nope')).toBe(0);
  });

  // ---------------------------------------------------------------------------
  // Tile Flags
  // ---------------------------------------------------------------------------

  it('TileFlags constants are correct', () => {
    expect(TileFlags.NONE).toBe(0);
    expect(TileFlags.SOLID).toBe(1);
    expect(TileFlags.ONE_WAY).toBe(2);
    expect(TileFlags.DESTRUCTIBLE).toBe(8);
  });

  it('tile with combined flags', () => {
    const t = tile(5, TileFlags.SOLID | TileFlags.DESTRUCTIBLE);
    map.setTile('ground', 0, 0, t);
    const retrieved = map.getTile('ground', 0, 0)!;
    expect(retrieved.flags & TileFlags.SOLID).toBeTruthy();
    expect(retrieved.flags & TileFlags.DESTRUCTIBLE).toBeTruthy();
  });
});
