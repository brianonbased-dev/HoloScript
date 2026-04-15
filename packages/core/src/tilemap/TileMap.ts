/**
 * TileMap — grid-based tile system for 2D/2.5D scenes.
 */

export const TileFlags = {
  NONE: 0,
  SOLID: 1,
  PASSTHROUGH: 2,
  WATER: 4,
  LAVA: 8,
  TRIGGER: 16,
  DAMAGE: 32,
} as const;

export type TileFlagsValue = (typeof TileFlags)[keyof typeof TileFlags];

export interface Tile {
  id: number;
  flags: number;
}

export interface AutoTileRule {
  tileId: number;
  /** 8-bit neighbor bitmask: bit 0=N, 1=NE, 2=E, 3=SE, 4=S, 5=SW, 6=W, 7=NW */
  neighbors: number;
  resultId: number;
}

type LayerData = Map<string, Tile>;

function key(x: number, y: number): string {
  return `${x},${y}`;
}

export class TileMap {
  private readonly width: number;
  private readonly height: number;
  private readonly tileSize: number;
  private layers: Map<string, LayerData> = new Map();
  private autoTileRules: AutoTileRule[] = [];

  constructor(width: number, height: number, tileSize: number) {
    this.width = width;
    this.height = height;
    this.tileSize = tileSize;
  }

  getWidth(): number { return this.width; }
  getHeight(): number { return this.height; }
  getTileSize(): number { return this.tileSize; }
  getLayerCount(): number { return this.layers.size; }
  getLayerNames(): string[] { return Array.from(this.layers.keys()); }

  addLayer(name: string): void {
    if (!this.layers.has(name)) {
      this.layers.set(name, new Map());
    }
  }

  removeLayer(name: string): void {
    this.layers.delete(name);
  }

  setTile(layer: string, x: number, y: number, tile: Tile): void {
    const data = this.layers.get(layer);
    if (!data) return;
    data.set(key(x, y), { ...tile });
  }

  getTile(layer: string, x: number, y: number): Tile | undefined {
    return this.layers.get(layer)?.get(key(x, y));
  }

  removeTile(layer: string, x: number, y: number): void {
    this.layers.get(layer)?.delete(key(x, y));
  }

  /** Returns true if any layer has a tile with the SOLID flag at (x, y). */
  isSolid(x: number, y: number): boolean {
    for (const layer of this.layers.values()) {
      const tile = layer.get(key(x, y));
      if (tile && (tile.flags & TileFlags.SOLID) !== 0) return true;
    }
    return false;
  }

  worldToTile(wx: number, wy: number): { x: number; y: number } {
    return {
      x: Math.floor(wx / this.tileSize),
      y: Math.floor(wy / this.tileSize),
    };
  }

  tileToWorld(tx: number, ty: number): { x: number; y: number } {
    return {
      x: tx * this.tileSize,
      y: ty * this.tileSize,
    };
  }

  addAutoTileRule(rule: AutoTileRule): void {
    this.autoTileRules.push({ ...rule });
  }

  /**
   * Apply auto-tile rules to a layer.
   * Returns the number of tiles updated.
   */
  applyAutoTile(layer: string): number {
    const data = this.layers.get(layer);
    if (!data) return 0;

    const DIRS: Array<[number, number]> = [
      [0, -1],  // N
      [1, -1],  // NE
      [1,  0],  // E
      [1,  1],  // SE
      [0,  1],  // S
      [-1, 1],  // SW
      [-1, 0],  // W
      [-1,-1],  // NW
    ];

    let updated = 0;
    const entries = Array.from(data.entries());

    for (const [k, tile] of entries) {
      const [xs, ys] = k.split(',').map(Number);

      // Build neighbor bitmask for tiles matching this tileId
      let neighborMask = 0;
      for (let bit = 0; bit < 8; bit++) {
        const [dx, dy] = DIRS[bit];
        const neighbor = data.get(key(xs + dx, ys + dy));
        if (neighbor && neighbor.id === tile.id) {
          neighborMask |= (1 << bit);
        }
      }

      for (const rule of this.autoTileRules) {
        if (rule.tileId === tile.id && (neighborMask & rule.neighbors) === rule.neighbors) {
          data.set(k, { ...tile, id: rule.resultId });
          updated++;
          break;
        }
      }
    }

    return updated;
  }
}
