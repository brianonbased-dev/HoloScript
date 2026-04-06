import { describe, it, expect } from 'vitest';
import { TileMap, TileFlags } from '@holoscript/engine/tilemap/TileMap';
import { TilePhysics } from '@holoscript/engine/tilemap/TilePhysics';
import { TileRenderer } from '@holoscript/engine/tilemap/TileRenderer';

describe('Cycle 159: Tile Map System', () => {
  // -------------------------------------------------------------------------
  // TileMap
  // -------------------------------------------------------------------------

  it('should store and query tiles across layers', () => {
    const map = new TileMap(64, 64, 16);
    map.addLayer('ground');
    map.addLayer('overlay', 1);

    map.setTile('ground', 5, 5, { id: 1, flags: TileFlags.SOLID });
    map.setTile('overlay', 5, 5, { id: 10, flags: TileFlags.NONE });

    expect(map.getTile('ground', 5, 5)?.id).toBe(1);
    expect(map.isSolid(5, 5)).toBe(true);
    expect(map.getLayerCount()).toBe(2);
  });

  it('should convert world and tile coordinates', () => {
    const map = new TileMap(100, 100, 32);
    const tile = map.worldToTile(100, 70);
    expect(tile.x).toBe(3); // 100/32 = 3.125 → 3
    expect(tile.y).toBe(2); // 70/32 = 2.1875 → 2

    const world = map.tileToWorld(3, 2);
    expect(world.x).toBe(96);
    expect(world.y).toBe(64);
  });

  // -------------------------------------------------------------------------
  // TilePhysics
  // -------------------------------------------------------------------------

  it('should detect AABB collision with solid tiles', () => {
    const map = new TileMap(10, 10, 16);
    map.addLayer('ground');
    map.setTile('ground', 3, 5, { id: 1, flags: TileFlags.SOLID });

    const physics = new TilePhysics(map);
    // AABB overlapping tile (3,5) = world (48, 80)
    const results = physics.checkCollision({ x: 45, y: 78, w: 10, h: 10 });

    expect(results.length).toBeGreaterThan(0);
    expect(results[0].collided).toBe(true);
  });

  // -------------------------------------------------------------------------
  // TileRenderer
  // -------------------------------------------------------------------------

  it('should compute UV coordinates from tile atlas', () => {
    const map = new TileMap(10, 10, 16);
    const renderer = new TileRenderer(map, { tileWidth: 16, tileHeight: 16, columns: 8, rows: 8 });

    // Tile 9: col=1, row=1
    const uv = renderer.getTileUV(9);
    expect(uv.uvX).toBeCloseTo(1 / 8); // col 1
    expect(uv.uvY).toBeCloseTo(1 / 8); // row 1
    expect(uv.uvW).toBeCloseTo(1 / 8);
  });

  it('should return visible tiles within viewport', () => {
    const map = new TileMap(20, 20, 16);
    map.addLayer('ground');
    map.setTile('ground', 0, 0, { id: 1, flags: TileFlags.NONE });
    map.setTile('ground', 1, 0, { id: 2, flags: TileFlags.NONE });
    map.setTile('ground', 15, 15, { id: 3, flags: TileFlags.NONE });

    const renderer = new TileRenderer(map, { tileWidth: 16, tileHeight: 16, columns: 8, rows: 8 });

    // View only first 4×4 tile area
    const visible = renderer.getVisibleTiles(0, 0, 64, 64);
    const ids = visible.map((t) => t.tileX);
    expect(ids).toContain(0);
    expect(ids).toContain(1);
    expect(ids).not.toContain(15); // Out of viewport
  });

  it('should advance animated tile frames', () => {
    const map = new TileMap(10, 10, 16);
    const renderer = new TileRenderer(map, { tileWidth: 16, tileHeight: 16, columns: 4, rows: 4 });

    renderer.addAnimatedTile(5, [5, 6, 7], 100);

    const uv0 = renderer.getTileUV(5); // Frame 0 → tile 5
    renderer.updateAnimations(100);
    const uv1 = renderer.getTileUV(5); // Frame 1 → tile 6

    expect(uv0.uvX).not.toBe(uv1.uvX); // Different frame = different UV
  });
});
