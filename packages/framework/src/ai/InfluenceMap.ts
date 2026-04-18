/**
 * InfluenceMap.ts
 *
 * Grid-based influence map: propagation, decay, multi-layer
 * support, and spatial queries.
 *
 * @module ai
 */

// =============================================================================
// TYPES
// =============================================================================

export interface InfluenceConfig {
  width: number;
  height: number;
  cellSize: number;
  decayRate: number; // 0-1 per update
  propagationRate: number; // 0-1 spread to neighbors
  maxValue: number;
}

// =============================================================================
// INFLUENCE MAP
// =============================================================================

export class InfluenceMap {
  private layers: Map<string, Float32Array> = new Map();
  private config: InfluenceConfig;

  constructor(config: InfluenceConfig) {
    this.config = config;
  }

  // ---------------------------------------------------------------------------
  // Layer Management
  // ---------------------------------------------------------------------------

  addLayer(name: string): void {
    const size = this.config.width * this.config.height;
    this.layers.set(name, new Float32Array(size));
  }

  removeLayer(name: string): void {
    this.layers.delete(name);
  }
  getLayerNames(): string[] {
    return [...this.layers.keys()];
  }

  // ---------------------------------------------------------------------------
  // Influence Modification
  // ---------------------------------------------------------------------------

  setInfluence(layer: string, gx: number, gy: number, value: number): void {
    const grid = this.layers.get(layer);
    if (!grid || gx < 0 || gx >= this.config.width || gy < 0 || gy >= this.config.height) return;
    grid[gy * this.config.width + gx] = Math.min(
      this.config.maxValue,
      Math.max(-this.config.maxValue, value)
    );
  }

  addInfluence(layer: string, gx: number, gy: number, value: number): void {
    const grid = this.layers.get(layer);
    if (!grid || gx < 0 || gx >= this.config.width || gy < 0 || gy >= this.config.height) return;
    const idx = gy * this.config.width + gx;
    grid[idx] = Math.min(this.config.maxValue, Math.max(-this.config.maxValue, grid[idx] + value));
  }

  stampRadius(layer: string, cx: number, cy: number, radius: number, value: number): void {
    for (
      let y = Math.max(0, cy - radius);
      y <= Math.min(this.config.height - 1, cy + radius);
      y++
    ) {
      for (
        let x = Math.max(0, cx - radius);
        x <= Math.min(this.config.width - 1, cx + radius);
        x++
      ) {
        const dx = x - cx,
          dy = y - cy;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist <= radius) {
          const falloff = 1 - dist / radius;
          this.addInfluence(layer, x, y, value * falloff);
        }
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Propagation & Decay
  // ---------------------------------------------------------------------------

  update(): void {
    for (const [name, grid] of this.layers) {
      const { width, height, decayRate, propagationRate } = this.config;
      const next = new Float32Array(grid.length);

      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const idx = y * width + x;
          let neighborSum = 0;
          let neighborCount = 0;

          // 4-directional neighbors
          if (x > 0) {
            neighborSum += grid[idx - 1];
            neighborCount++;
          }
          if (x < width - 1) {
            neighborSum += grid[idx + 1];
            neighborCount++;
          }
          if (y > 0) {
            neighborSum += grid[idx - width];
            neighborCount++;
          }
          if (y < height - 1) {
            neighborSum += grid[idx + width];
            neighborCount++;
          }

          const avgNeighbor = neighborCount > 0 ? neighborSum / neighborCount : 0;
          const propagated = grid[idx] + (avgNeighbor - grid[idx]) * propagationRate;
          next[idx] = propagated * (1 - decayRate);
        }
      }

      this.layers.set(name, next);
    }
  }

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------

  getInfluence(layer: string, gx: number, gy: number): number {
    const grid = this.layers.get(layer);
    if (!grid || gx < 0 || gx >= this.config.width || gy < 0 || gy >= this.config.height) return 0;
    return grid[gy * this.config.width + gx];
  }

  getInfluenceAtWorld(layer: string, wx: number, wy: number): number {
    const gx = Math.floor(wx / this.config.cellSize);
    const gy = Math.floor(wy / this.config.cellSize);
    return this.getInfluence(layer, gx, gy);
  }

  getMaxCell(layer: string): { x: number; y: number; value: number; 0?: number; 1?: number } {
    const grid = this.layers.get(layer);
    if (!grid) return { x: 0, y: 0, value: 0 };

    let maxIdx = 0,
      maxVal = grid[0];
    for (let i = 1; i < grid.length; i++) {
      if (grid[i] > maxVal) {
        maxVal = grid[i];
        maxIdx = i;
      }
    }

    return {
      x: maxIdx % this.config.width,
      y: Math.floor(maxIdx / this.config.width),
      value: maxVal,
      0: maxIdx % this.config.width,
      1: Math.floor(maxIdx / this.config.width),
    };
  }

  clear(layer: string): void {
    const grid = this.layers.get(layer);
    if (grid) grid.fill(0);
  }

  clearAll(): void {
    for (const grid of this.layers.values()) grid.fill(0);
  }
}
