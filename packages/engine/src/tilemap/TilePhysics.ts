/**
 * TilePhysics.ts
 *
 * Tile-based collision: solid/platform/slope collision queries,
 * AABB-tile overlap, and one-way platform support.
 *
 * @module tilemap
 */

import { TileMap, TileFlags } from './TileMap';

// =============================================================================
// TYPES
// =============================================================================

export interface TileCollisionResult {
  collided: boolean;
  tileX: number;
  tileY: number;
  pushX: number;
  pushY: number;
  oneWay: boolean;
}

export interface AABB2D {
  x: number;
  y: number;
  w: number;
  h: number;
}

// =============================================================================
// TILE PHYSICS
// =============================================================================

export class TilePhysics {
  private map: TileMap;

  constructor(map: TileMap) {
    this.map = map;
  }

  // ---------------------------------------------------------------------------
  // AABB vs Tilemap
  // ---------------------------------------------------------------------------

  checkCollision(aabb: AABB2D, vy = 0): TileCollisionResult[] {
    const results: TileCollisionResult[] = [];
    const tileSize = this.map.getTileSize();

    // Determine tile range overlapped by AABB
    const minTX = Math.floor(aabb[0] / tileSize);
    const maxTX = Math.floor((aabb[0] + aabb[3] - 0.001) / tileSize);
    const minTY = Math.floor(aabb[1] / tileSize);
    const maxTY = Math.floor((aabb[1] + aabb.h - 0.001) / tileSize);

    for (let tx = minTX; tx <= maxTX; tx++) {
      for (let ty = minTY; ty <= maxTY; ty++) {
        const solid = this.map.isSolid(tx, ty);
        if (!solid) continue;

        // Check one-way: only collide when falling (vy >= 0) from above
        const tile = this.getFirstTile(tx, ty);
        const isOneWay = tile ? !!(tile.flags & TileFlags.ONE_WAY) : false;

        if (isOneWay && vy < 0) continue; // Moving up through one-way

        // Compute push-out
        const tileCX = tx * tileSize + tileSize / 2;
        const tileCY = ty * tileSize + tileSize / 2;
        const aabbCX = aabb[0] + aabb[3] / 2;
        const aabbCY = aabb[1] + aabb.h / 2;

        const overlapX = aabb[3] / 2 + tileSize / 2 - Math.abs(aabbCX - tileCX);
        const overlapY = aabb.h / 2 + tileSize / 2 - Math.abs(aabbCY - tileCY);

        let pushX = 0,
          pushY = 0;
        if (isOneWay) {
          // One-way: only push upward
          pushY = -overlapY;
        } else if (overlapX < overlapY) {
          pushX = aabbCX < tileCX ? -overlapX : overlapX;
        } else {
          pushY = aabbCY < tileCY ? -overlapY : overlapY;
        }

        results.push({ collided: true, tileX: tx, tileY: ty, pushX, pushY, oneWay: isOneWay });
      }
    }

    return results;
  }

  // ---------------------------------------------------------------------------
  // Query Helpers
  // ---------------------------------------------------------------------------

  isTileSolid(tx: number, ty: number): boolean {
    return this.map.isSolid(tx, ty);
  }

  getTilesInRange(
    x: number,
    y: number,
    rangeX: number,
    rangeY: number
  ): Array<{ tx: number; ty: number }> {
    const ts = this.map.getTileSize();
    const res: Array<{ tx: number; ty: number }> = [];
    const minTX = Math.floor((x - rangeX) / ts);
    const maxTX = Math.floor((x + rangeX) / ts);
    const minTY = Math.floor((y - rangeY) / ts);
    const maxTY = Math.floor((y + rangeY) / ts);

    for (let tx = minTX; tx <= maxTX; tx++) {
      for (let ty = minTY; ty <= maxTY; ty++) {
        if (this.map.isSolid(tx, ty)) res.push({ tx, ty });
      }
    }
    return res;
  }

  private getFirstTile(tx: number, ty: number) {
    // Check all layers
    for (const layerName of ['ground', 'collision', 'main']) {
      const tile = this.map.getTile(layerName, tx, ty);
      if (tile) return tile;
    }
    return null;
  }
}
