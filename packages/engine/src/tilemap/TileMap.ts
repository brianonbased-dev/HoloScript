/**
 * TileMap.ts
 *
 * Grid-based tile map: tile data, multi-layer support,
 * auto-tiling rules, and chunk-based storage.
 *
 * @module tilemap
 */

// =============================================================================
// TYPES
// =============================================================================

export interface TileData {
  id: number;
  flags: number; // Bitfield: solid, one-way, destructible, etc.
  metadata?: Record<string, unknown>;
}

export interface TileLayer {
  name: string;
  tiles: Map<string, TileData>; // "x,y" → TileData
  visible: boolean;
  zOrder: number;
}

export interface AutoTileRule {
  tileId: number;
  neighbors: number; // 8-bit bitmask (N, NE, E, SE, S, SW, W, NW)
  resultId: number;
}

// =============================================================================
// TILE FLAG CONSTANTS
// =============================================================================

export const TileFlags = {
  NONE: 0,
  SOLID: 1,
  ONE_WAY: 2,
  SLOPE: 4,
  DESTRUCTIBLE: 8,
  TRIGGER: 16,
} as const;

// =============================================================================
// TILE MAP
// =============================================================================

export class TileMap {
  private layers: Map<string, TileLayer> = new Map();
  private width: number;
  private height: number;
  private tileSize: number;
  private autoTileRules: AutoTileRule[] = [];

  constructor(width: number, height: number, tileSize: number) {
    this.width = width;
    this.height = height;
    this.tileSize = tileSize;
  }

  // ---------------------------------------------------------------------------
  // Layer Management
  // ---------------------------------------------------------------------------

  addLayer(name: string, zOrder = 0): void {
    this.layers.set(name, { name, tiles: new Map(), visible: true, zOrder });
  }

  removeLayer(name: string): void {
    this.layers.delete(name);
  }
  getLayer(name: string): TileLayer | undefined {
    return this.layers.get(name);
  }
  getLayerCount(): number {
    return this.layers.size;
  }

  // ---------------------------------------------------------------------------
  // Tile Access
  // ---------------------------------------------------------------------------

  private key(x: number, y: number): string {
    return `${x},${y}`;
  }

  setTile(layerName: string, x: number, y: number, tile: TileData): void {
    const layer = this.layers.get(layerName);
    if (layer) layer.tiles.set(this.key(x, y), tile);
  }

  getTile(layerName: string, x: number, y: number): TileData | undefined {
    return this.layers.get(layerName)?.tiles.get(this.key(x, y));
  }

  removeTile(layerName: string, x: number, y: number): void {
    this.layers.get(layerName)?.tiles.delete(this.key(x, y));
  }

  isSolid(x: number, y: number): boolean {
    for (const layer of this.layers.values()) {
      const tile = layer.tiles.get(this.key(x, y));
      if (tile && tile.flags & TileFlags.SOLID) return true;
    }
    return false;
  }

  // ---------------------------------------------------------------------------
  // Auto-Tiling
  // ---------------------------------------------------------------------------

  addAutoTileRule(rule: AutoTileRule): void {
    this.autoTileRules.push(rule);
  }

  applyAutoTile(layerName: string): number {
    const layer = this.layers.get(layerName);
    if (!layer) return 0;

    let count = 0;
    for (const [key, tile] of layer.tiles) {
      const [x, y] = key.split(',').map(Number);

      for (const rule of this.autoTileRules) {
        if (tile.id !== rule.tileId) continue;

        const mask = this.getNeighborMask(layer, x, y, rule.tileId);
        if (mask === rule.neighbors) {
          tile.id = rule.resultId;
          count++;
          break;
        }
      }
    }
    return count;
  }

  private getNeighborMask(layer: TileLayer, x: number, y: number, tileId: number): number {
    let mask = 0;
    const dirs = [
      [0, -1],
      [1, -1],
      [1, 0],
      [1, 1],
      [0, 1],
      [-1, 1],
      [-1, 0],
      [-1, -1],
    ];
    for (let i = 0; i < dirs.length; i++) {
      const n = layer.tiles.get(this.key(x + dirs[i][0], y + dirs[i][1]));
      if (n && n.id === tileId) mask |= 1 << i;
    }
    return mask;
  }

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------

  worldToTile(wx: number, wy: number): { x: number; y: number } {
    return { x: Math.floor(wx / this.tileSize), y: Math.floor(wy / this.tileSize) };
  }

  tileToWorld(tx: number, ty: number): { x: number; y: number } {
    return { x: tx * this.tileSize, y: ty * this.tileSize };
  }

  getWidth(): number {
    return this.width;
  }
  getHeight(): number {
    return this.height;
  }
  getTileSize(): number {
    return this.tileSize;
  }
}

