/**
 * TileMap — Production Test Suite
 *
 * Covers: layers (add/remove/get), tile CRUD (set/get/remove),
 * isSolid, TileFlags, worldToTile, tileToWorld, autoTile rules.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { TileMap, TileFlags } from '../TileMap';
import type { AutoTileRule } from '../TileMap';

describe('TileMap — Production', () => {
  let map: TileMap;

  beforeEach(() => {
    map = new TileMap(20, 15, 32);
  });

  // ─── Dimensions ───────────────────────────────────────────────────
  it('getWidth/Height/TileSize returns constructor values', () => {
    expect(map.getWidth()).toBe(20);
    expect(map.getHeight()).toBe(15);
    expect(map.getTileSize()).toBe(32);
  });

  // ─── Layers ───────────────────────────────────────────────────────
  it('starts with no layers', () => {
    expect(map.getLayerCount()).toBe(0);
  });

  it('addLayer creates a layer', () => {
    map.addLayer('ground');
    expect(map.getLayerCount()).toBe(1);
    expect(map.getLayer('ground')).toBeDefined();
  });

  it('added layer has correct zOrder', () => {
    map.addLayer('fg', 5);
    expect(map.getLayer('fg')!.zOrder).toBe(5);
  });

  it('added layer is visible by default', () => {
    map.addLayer('bg');
    expect(map.getLayer('bg')!.visible).toBe(true);
  });

  it('removeLayer deletes it', () => {
    map.addLayer('temp');
    map.removeLayer('temp');
    expect(map.getLayerCount()).toBe(0);
    expect(map.getLayer('temp')).toBeUndefined();
  });

  it('multiple layers coexist', () => {
    map.addLayer('bg', 0);
    map.addLayer('mid', 1);
    map.addLayer('fg', 2);
    expect(map.getLayerCount()).toBe(3);
  });

  // ─── Tile CRUD ────────────────────────────────────────────────────
  it('setTile/getTile roundtrip', () => {
    map.addLayer('ground');
    map.setTile('ground', 3, 7, { id: 42, flags: TileFlags.SOLID });
    const tile = map.getTile('ground', 3, 7);
    expect(tile?.id).toBe(42);
    expect(tile?.flags).toBe(TileFlags.SOLID);
  });

  it('getTile returns undefined for empty cell', () => {
    map.addLayer('ground');
    expect(map.getTile('ground', 0, 0)).toBeUndefined();
  });

  it('getTile returns undefined for unknown layer', () => {
    expect(map.getTile('nonexistent', 0, 0)).toBeUndefined();
  });

  it('setTile on unknown layer is safe (no-op)', () => {
    expect(() => map.setTile('ghost', 0, 0, { id: 1, flags: 0 })).not.toThrow();
  });

  it('removeTile removes tile', () => {
    map.addLayer('ground');
    map.setTile('ground', 1, 1, { id: 5, flags: 0 });
    map.removeTile('ground', 1, 1);
    expect(map.getTile('ground', 1, 1)).toBeUndefined();
  });

  it('tile metadata is stored', () => {
    map.addLayer('ground');
    map.setTile('ground', 0, 0, { id: 1, flags: 0, metadata: { hp: 10 } });
    expect(map.getTile('ground', 0, 0)?.metadata?.hp).toBe(10);
  });

  // ─── TileFlags ────────────────────────────────────────────────────
  it('TileFlags constants are correct bit values', () => {
    expect(TileFlags.NONE).toBe(0);
    expect(TileFlags.SOLID).toBe(1);
    expect(TileFlags.ONE_WAY).toBe(2);
    expect(TileFlags.SLOPE).toBe(4);
    expect(TileFlags.DESTRUCTIBLE).toBe(8);
    expect(TileFlags.TRIGGER).toBe(16);
  });

  it('flags can be combined with bitwise OR', () => {
    const flags = TileFlags.SOLID | TileFlags.DESTRUCTIBLE;
    expect(flags & TileFlags.SOLID).toBeTruthy();
    expect(flags & TileFlags.DESTRUCTIBLE).toBeTruthy();
    expect(flags & TileFlags.SLOPE).toBe(0);
  });

  // ─── isSolid ──────────────────────────────────────────────────────
  it('isSolid returns true for solid tile on any layer', () => {
    map.addLayer('ground');
    map.setTile('ground', 2, 3, { id: 1, flags: TileFlags.SOLID });
    expect(map.isSolid(2, 3)).toBe(true);
  });

  it('isSolid returns false for non-solid tile', () => {
    map.addLayer('ground');
    map.setTile('ground', 0, 0, { id: 1, flags: TileFlags.TRIGGER });
    expect(map.isSolid(0, 0)).toBe(false);
  });

  it('isSolid returns false for empty cell', () => {
    map.addLayer('ground');
    expect(map.isSolid(5, 5)).toBe(false);
  });

  it('isSolid checks all layers', () => {
    map.addLayer('bg');
    map.addLayer('fg');
    map.setTile('fg', 1, 1, { id: 2, flags: TileFlags.SOLID });
    expect(map.isSolid(1, 1)).toBe(true);
  });

  // ─── Coordinate Conversion ────────────────────────────────────────
  it('worldToTile converts world coords', () => {
    const tile = map.worldToTile(64, 96);
    expect(tile.x).toBe(2);
    expect(tile.y).toBe(3);
  });

  it('worldToTile floors partial tiles', () => {
    const tile = map.worldToTile(33, 1);
    expect(tile.x).toBe(1);
    expect(tile.y).toBe(0);
  });

  it('tileToWorld converts tile coords', () => {
    const world = map.tileToWorld(3, 2);
    expect(world.x).toBe(96);
    expect(world.y).toBe(64);
  });

  // ─── Auto-Tiling ──────────────────────────────────────────────────
  it('applyAutoTile on empty map returns 0', () => {
    map.addLayer('ground');
    expect(map.applyAutoTile('ground')).toBe(0);
  });

  it('applyAutoTile on unknown layer returns 0', () => {
    expect(map.applyAutoTile('ghost')).toBe(0);
  });

  it('applyAutoTile applies matching rule', () => {
    map.addLayer('ground');
    // Tile 1 surrounded by no like-neighbors (mask=0) → becomes tile 99
    map.setTile('ground', 5, 5, { id: 1, flags: 0 });
    const rule: AutoTileRule = { tileId: 1, neighbors: 0, resultId: 99 };
    map.addAutoTileRule(rule);
    const count = map.applyAutoTile('ground');
    expect(count).toBe(1);
    expect(map.getTile('ground', 5, 5)?.id).toBe(99);
  });
});
