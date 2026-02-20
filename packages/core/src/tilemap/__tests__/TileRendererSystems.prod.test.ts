/**
 * TileRendererSystems.prod.test.ts
 *
 * Production tests for the TileRenderer — atlas UV mapping, animated tiles,
 * frustum culling, and layer visibility — all pure in-memory, no I/O.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { TileMap } from '../TileMap';
import { TileRenderer } from '../TileRenderer';
import type { TileAtlas } from '../TileRenderer';

// Helper: create a standard 4x4 atlas (4 cols × 4 rows = 16 tiles)
function makeAtlas(cols = 4, rows = 4, tw = 16, th = 16): TileAtlas {
  return { tileWidth: tw, tileHeight: th, columns: cols, rows: rows };
}

// Helper: create a TileMap and populate one layer
function makeMap(width = 8, height = 8, tileSize = 16) {
  const map = new TileMap(width, height, tileSize);
  return map;
}

// =============================================================================
// UV Mapping
// =============================================================================

describe('TileRenderer — UV Mapping', () => {
  let map: TileMap;
  let renderer: TileRenderer;

  beforeEach(() => {
    map = makeMap();
    renderer = new TileRenderer(map, makeAtlas(4, 4));
  });

  it('tile 0 maps to UV (0, 0)', () => {
    const uv = renderer.getTileUV(0);
    expect(uv.uvX).toBe(0);
    expect(uv.uvY).toBe(0);
    expect(uv.uvW).toBeCloseTo(1 / 4);
    expect(uv.uvH).toBeCloseTo(1 / 4);
  });

  it('tile 1 maps to second column at row 0', () => {
    const uv = renderer.getTileUV(1);
    expect(uv.uvX).toBeCloseTo(1 / 4);
    expect(uv.uvY).toBe(0);
  });

  it('tile 4 (start of row 1) maps to UV (0, 0.25)', () => {
    const uv = renderer.getTileUV(4);
    expect(uv.uvX).toBeCloseTo(0);
    expect(uv.uvY).toBeCloseTo(1 / 4);
  });

  it('tile 5 → column 1, row 1', () => {
    const uv = renderer.getTileUV(5);
    expect(uv.uvX).toBeCloseTo(1 / 4);
    expect(uv.uvY).toBeCloseTo(1 / 4);
  });

  it('last tile (15) → column 3, row 3', () => {
    const uv = renderer.getTileUV(15);
    expect(uv.uvX).toBeCloseTo(3 / 4);
    expect(uv.uvY).toBeCloseTo(3 / 4);
  });

  it('uvW and uvH are always 1/cols and 1/rows', () => {
    for (let i = 0; i < 16; i++) {
      const uv = renderer.getTileUV(i);
      expect(uv.uvW).toBeCloseTo(1 / 4);
      expect(uv.uvH).toBeCloseTo(1 / 4);
    }
  });

  it('UV works for non-square atlases (8 cols × 2 rows)', () => {
    const ns = new TileRenderer(map, { tileWidth: 16, tileHeight: 32, columns: 8, rows: 2 });
    const uv = ns.getTileUV(9); // tile 9 → col 1, row 1
    expect(uv.uvX).toBeCloseTo(1 / 8);
    expect(uv.uvY).toBeCloseTo(1 / 2);
    expect(uv.uvW).toBeCloseTo(1 / 8);
    expect(uv.uvH).toBeCloseTo(1 / 2);
  });
});

// =============================================================================
// Animated Tiles
// =============================================================================

describe('TileRenderer — Animated Tiles', () => {
  let map: TileMap;
  let renderer: TileRenderer;

  beforeEach(() => {
    map = makeMap();
    renderer = new TileRenderer(map, makeAtlas(4, 4));
  });

  it('getAnimatedTileCount starts at 0', () => {
    expect(renderer.getAnimatedTileCount()).toBe(0);
  });

  it('addAnimatedTile increments count', () => {
    renderer.addAnimatedTile(0, [0, 1, 2], 100);
    expect(renderer.getAnimatedTileCount()).toBe(1);
    renderer.addAnimatedTile(3, [3, 4], 200);
    expect(renderer.getAnimatedTileCount()).toBe(2);
  });

  it('animated tile resolves to first frame when elapsed=0', () => {
    renderer.addAnimatedTile(0, [0, 5, 10], 100);
    const uv = renderer.getTileUV(0);
    // Frame 0 → tile 0 → col 0, row 0
    expect(uv.uvX).toBeCloseTo(0);
    expect(uv.uvY).toBeCloseTo(0);
  });

  it('updateAnimations advances frame after frameDuration ms', () => {
    renderer.addAnimatedTile(0, [0, 5, 10], 100);
    renderer.updateAnimations(100); // 100ms >= frameDuration
    const uv = renderer.getTileUV(0);
    // Now frame 1 → tile 5 → col 1, row 1
    expect(uv.uvX).toBeCloseTo(1 / 4);
    expect(uv.uvY).toBeCloseTo(1 / 4);
  });

  it('animation does not advance before frameDuration', () => {
    renderer.addAnimatedTile(0, [0, 5], 100);
    renderer.updateAnimations(50); // 50ms < 100ms
    const uv = renderer.getTileUV(0);
    expect(uv.uvX).toBeCloseTo(0); // still frame 0
  });

  it('animation wraps around on third frame', () => {
    renderer.addAnimatedTile(0, [0, 4, 8], 100);
    renderer.updateAnimations(100); // → frame 1
    renderer.updateAnimations(100); // → frame 2
    renderer.updateAnimations(100); // → frame 0 (wrap)
    const uv = renderer.getTileUV(0);
    expect(uv.uvX).toBeCloseTo(0);
    expect(uv.uvY).toBeCloseTo(0);
  });

  it('non-animated tile UV is unaffected by updateAnimations', () => {
    renderer.addAnimatedTile(2, [2, 6], 50);
    renderer.updateAnimations(100);
    // tile 7 (not animated) should remain stable
    const uv = renderer.getTileUV(7);
    expect(uv.uvX).toBeCloseTo(3 / 4);
    expect(uv.uvY).toBeCloseTo(1 / 4);
  });

  it('two simultaneous animations advance independently', () => {
    renderer.addAnimatedTile(0, [0, 1], 100);
    renderer.addAnimatedTile(2, [2, 3], 200);
    renderer.updateAnimations(150); // 150ms — tile 0 advances but tile 2 does not
    const uv0 = renderer.getTileUV(0);
    const uv2 = renderer.getTileUV(2);
    // tile 0 → frame 1 → tile id 1 → col 1, row 0
    expect(uv0.uvX).toBeCloseTo(1 / 4);
    // tile 2 → frame 0 still → tile id 2 → col 2, row 0
    expect(uv2.uvX).toBeCloseTo(2 / 4);
  });
});

// =============================================================================
// Frustum Culling — getVisibleTiles
// =============================================================================

describe('TileRenderer — Frustum Culling', () => {
  it('returns no tiles when map has no layers', () => {
    const map = makeMap(8, 8, 16);
    const renderer = new TileRenderer(map, makeAtlas(4, 4));
    const tiles = renderer.getVisibleTiles(0, 0, 128, 128);
    expect(tiles).toHaveLength(0);
  });

  it('returns only tiles within view bounds', () => {
    const map = makeMap(8, 8, 16);
    map.addLayer('ground', 0);
    // Place tiles at all 8×8 positions
    for (let x = 0; x < 8; x++) for (let y = 0; y < 8; y++) map.setTile('ground', x, y, { id: 1, flags: 0 });

    const renderer = new TileRenderer(map, makeAtlas(4, 4));
    // View covers only tiles 0-3 in x and 0-3 in y (visible 64×64px)
    const tiles = renderer.getVisibleTiles(0, 0, 63, 63);
    expect(tiles.length).toBe(16); // 4×4 tiles
  });

  it('respects layer visibility — hidden layers are not rendered', () => {
    const map = makeMap(4, 4, 16);
    map.addLayer('background', 0);
    map.addLayer('overlay', 1);  // 'overlay' is in TileRenderer's allowed layer list
    // Set overlay layer invisible by directly mutating the layer object
    const overlayLayer = map.getLayer('overlay')!;
    overlayLayer.visible = false;
    for (let x = 0; x < 4; x++) for (let y = 0; y < 4; y++) {
      map.setTile('background', x, y, { id: 0, flags: 0 });
      map.setTile('overlay', x, y, { id: 1, flags: 0 });
    }
    const renderer = new TileRenderer(map, makeAtlas(4, 4));
    const tiles = renderer.getVisibleTiles(0, 0, 64, 64);
    expect(tiles.every(t => t.layerName === 'background')).toBe(true);
  });

  it('returned tiles have correct worldX/worldY for tileSize', () => {
    const map = makeMap(4, 4, 16);
    map.addLayer('ground', 0);
    map.setTile('ground', 2, 3, { id: 0, flags: 0 });
    const renderer = new TileRenderer(map, makeAtlas(4, 4));
    const tiles = renderer.getVisibleTiles(0, 0, 64, 64);
    const t = tiles.find(t => t.tileX === 2 && t.tileY === 3);
    expect(t).toBeDefined();
    expect(t!.worldX).toBe(2 * 16);
    expect(t!.worldY).toBe(3 * 16);
  });

  it('tiles outside view are excluded', () => {
    const map = makeMap(8, 8, 16);
    map.addLayer('ground', 0);
    for (let x = 0; x < 8; x++) for (let y = 0; y < 8; y++) map.setTile('ground', x, y, { id: 0, flags: 0 });
    const renderer = new TileRenderer(map, makeAtlas(4, 4));
    // View only covers x=0-1 (first 2 tiles)
    const tiles = renderer.getVisibleTiles(0, 0, 31, 128);
    expect(tiles.every(t => t.tileX <= 1)).toBe(true);
  });

  it('layers are sorted by zOrder in output', () => {
    const map = makeMap(2, 2, 16);
    map.addLayer('foreground', 10);
    map.addLayer('background', 0);
    for (let x = 0; x < 2; x++) for (let y = 0; y < 2; y++) {
      map.setTile('foreground', x, y, { id: 1, flags: 0 });
      map.setTile('background', x, y, { id: 0, flags: 0 });
    }
    const renderer = new TileRenderer(map, makeAtlas(4, 4));
    const tiles = renderer.getVisibleTiles(0, 0, 32, 32);
    // First 4 tiles should be background (zOrder 0), last 4 foreground (zOrder 10)
    expect(tiles[0].layerName).toBe('background');
    expect(tiles[tiles.length - 1].layerName).toBe('foreground');
  });

  it('returned RenderTile has correct UV from atlas', () => {
    const map = makeMap(2, 2, 16);
    map.addLayer('ground', 0);
    map.setTile('ground', 0, 0, { id: 5, flags: 0 }); // tile id 5 → col 1, row 1 in 4×4 atlas
    const renderer = new TileRenderer(map, makeAtlas(4, 4));
    const tiles = renderer.getVisibleTiles(0, 0, 32, 32);
    const t = tiles.find(t => t.tileX === 0 && t.tileY === 0);
    expect(t).toBeDefined();
    expect(t!.uvX).toBeCloseTo(1 / 4);
    expect(t!.uvY).toBeCloseTo(1 / 4);
  });

  it('view offset correctly culls left/top tiles', () => {
    const map = makeMap(4, 4, 16);
    map.addLayer('ground', 0);
    for (let x = 0; x < 4; x++) for (let y = 0; y < 4; y++) map.setTile('ground', x, y, { id: 0, flags: 0 });
    const renderer = new TileRenderer(map, makeAtlas(4, 4));
    // View starting at tile 2,2 (pixel 32,32) covering 32x32
    const tiles = renderer.getVisibleTiles(32, 32, 32, 32);
    expect(tiles.every(t => t.tileX >= 2 && t.tileY >= 2)).toBe(true);
  });
});
