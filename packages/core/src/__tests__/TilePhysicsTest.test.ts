import { describe, it, expect } from 'vitest';
import { TileMap, TileFlags } from '@holoscript/engine/tilemap/TileMap';
import { TilePhysics } from '@holoscript/engine/tilemap/TilePhysics';
import type { AABB2D } from '@holoscript/engine/tilemap/TilePhysics';

// =============================================================================
// C208 — Tile Physics
// =============================================================================

describe('TilePhysics', () => {
  function makePhysicsMap() {
    const tm = new TileMap(20, 20, 16);
    tm.addLayer('ground');
    tm.addLayer('collision');
    return { tm, physics: new TilePhysics(tm) };
  }

  // --- checkCollision: basic solid ---

  it('detects collision with solid tile', () => {
    const { tm, physics } = makePhysicsMap();
    tm.setTile('ground', 2, 2, { id: 1, flags: TileFlags.SOLID });
    // AABB sitting right on that tile (tile at pixel 32,32 → 48,48)
    const aabb: AABB2D = { x: 32, y: 32, w: 10, h: 10 };
    const results = physics.checkCollision(aabb);
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].collided).toBe(true);
    expect(results[0].tileX).toBe(2);
    expect(results[0].tileY).toBe(2);
  });

  it('returns empty for non-overlapping AABB', () => {
    const { tm, physics } = makePhysicsMap();
    tm.setTile('ground', 5, 5, { id: 1, flags: TileFlags.SOLID });
    // Far away from tile 5,5 (pixel 80-96)
    const aabb: AABB2D = { x: 0, y: 0, w: 10, h: 10 };
    expect(physics.checkCollision(aabb)).toHaveLength(0);
  });

  it('returns empty when tiles are non-solid', () => {
    const { tm, physics } = makePhysicsMap();
    tm.setTile('ground', 0, 0, { id: 1, flags: TileFlags.TRIGGER });
    const aabb: AABB2D = { x: 0, y: 0, w: 16, h: 16 };
    expect(physics.checkCollision(aabb)).toHaveLength(0);
  });

  // --- Push-out direction ---

  it('pushes horizontally when overlap is narrower on X', () => {
    const { tm, physics } = makePhysicsMap();
    tm.setTile('ground', 3, 3, { id: 1, flags: TileFlags.SOLID });
    // AABB overlapping from the left edge of tile 3,3 (px 48)
    // Place AABB ending just slightly into tile: x=46, w=4 → right edge at 50
    const aabb: AABB2D = { x: 46, y: 48, w: 4, h: 4 };
    const results = physics.checkCollision(aabb);
    expect(results.length).toBe(1);
    // Smaller overlap is X, so pushX should be non-zero
    expect(results[0].pushX).not.toBe(0);
  });

  // --- One-way platforms ---

  it('one-way platform blocks when falling (vy >= 0)', () => {
    const { tm, physics } = makePhysicsMap();
    // Use the 'ground' layer which getFirstTile checks
    tm.setTile('ground', 1, 1, { id: 1, flags: TileFlags.SOLID | TileFlags.ONE_WAY });
    const aabb: AABB2D = { x: 16, y: 16, w: 8, h: 8 };
    const results = physics.checkCollision(aabb, 5); // vy > 0 → falling
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].oneWay).toBe(true);
  });

  it('one-way platform lets through when jumping (vy < 0)', () => {
    const { tm, physics } = makePhysicsMap();
    tm.setTile('ground', 1, 1, { id: 1, flags: TileFlags.SOLID | TileFlags.ONE_WAY });
    const aabb: AABB2D = { x: 16, y: 16, w: 8, h: 8 };
    const results = physics.checkCollision(aabb, -5); // vy < 0 → jumping
    expect(results).toHaveLength(0);
  });

  // --- Multi-tile overlap ---

  it('detects multiple solid tiles in AABB range', () => {
    const { tm, physics } = makePhysicsMap();
    // Two adjacent solid tiles: (0,0) and (1,0)
    tm.setTile('ground', 0, 0, { id: 1, flags: TileFlags.SOLID });
    tm.setTile('ground', 1, 0, { id: 1, flags: TileFlags.SOLID });
    // AABB spanning both tiles
    const aabb: AABB2D = { x: 0, y: 0, w: 32, h: 10 };
    const results = physics.checkCollision(aabb);
    expect(results.length).toBe(2);
  });

  // --- isTileSolid ---

  it('isTileSolid delegates to TileMap.isSolid', () => {
    const { tm, physics } = makePhysicsMap();
    tm.setTile('ground', 4, 4, { id: 1, flags: TileFlags.SOLID });
    expect(physics.isTileSolid(4, 4)).toBe(true);
    expect(physics.isTileSolid(0, 0)).toBe(false);
  });

  // --- getTilesInRange ---

  it('getTilesInRange returns solid tiles within range', () => {
    const { tm, physics } = makePhysicsMap();
    tm.setTile('ground', 3, 3, { id: 1, flags: TileFlags.SOLID });
    tm.setTile('ground', 4, 3, { id: 1, flags: TileFlags.SOLID });
    // Center at world 56,56 (tile 3.5, 3.5), range 16px in each direction
    const tiles = physics.getTilesInRange(56, 56, 16, 16);
    expect(tiles.length).toBeGreaterThanOrEqual(2);
  });

  it('getTilesInRange returns empty when no solid tiles', () => {
    const { physics } = makePhysicsMap();
    const tiles = physics.getTilesInRange(100, 100, 16, 16);
    expect(tiles).toHaveLength(0);
  });

  // --- Edge cases ---

  it('AABB exactly on tile boundary', () => {
    const { tm, physics } = makePhysicsMap();
    tm.setTile('ground', 1, 0, { id: 1, flags: TileFlags.SOLID });
    // AABB ends right at tile 1,0 boundary (x=16)
    const aabb: AABB2D = { x: 0, y: 0, w: 16, h: 16 };
    // Since w=16, right edge is at 15.999 (16-0.001 in the floor), so it stays in tile 0
    const results = physics.checkCollision(aabb);
    expect(results).toHaveLength(0); // Should not hit tile 1,0
  });

  it('large AABB covering many tiles', () => {
    const { tm, physics } = makePhysicsMap();
    for (let x = 0; x < 5; x++) {
      tm.setTile('ground', x, 0, { id: 1, flags: TileFlags.SOLID });
    }
    const aabb: AABB2D = { x: 0, y: 0, w: 80, h: 10 };
    const results = physics.checkCollision(aabb);
    expect(results.length).toBe(5);
  });
});
