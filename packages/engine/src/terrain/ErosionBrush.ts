/**
 * ErosionBrush — Interactive hydraulic/thermal erosion brushes
 *
 * Applies localized erosion simulation as a painting tool.
 *
 * @version 1.0.0
 */

export type ErosionType = 'hydraulic' | 'thermal' | 'wind';

export interface ErosionConfig {
  type: ErosionType;
  radius: number;
  strength: number;
  iterations: number;
  sedimentCapacity: number;
  thermalAngle: number;
}

export interface ErosionResult {
  cellsAffected: number;
  totalErosion: number;
  totalDeposition: number;
  iterations: number;
}

export class ErosionBrush {
  private heightmap: Map<string, number> = new Map();
  private config: ErosionConfig;
  private gridSize: number;

  constructor(gridSize: number = 64, config?: Partial<ErosionConfig>) {
    this.gridSize = gridSize;
    this.config = {
      type: config?.type ?? 'hydraulic',
      radius: config?.radius ?? 5,
      strength: config?.strength ?? 0.5,
      iterations: config?.iterations ?? 10,
      sedimentCapacity: config?.sedimentCapacity ?? 0.1,
      thermalAngle: config?.thermalAngle ?? 45,
    };

    for (let x = 0; x < gridSize; x++) {
      for (let z = 0; z < gridSize; z++) {
        this.heightmap.set(`${x},${z}`, 0);
      }
    }
  }

  /**
   * Set heightmap data
   */
  setHeight(x: number, z: number, h: number): void {
    this.heightmap.set(`${x},${z}`, h);
  }

  getHeight(x: number, z: number): number {
    return this.heightmap.get(`${x},${z}`) ?? 0;
  }

  /**
   * Apply erosion at a center position
   */
  erode(cx: number, cz: number, overrides?: Partial<ErosionConfig>): ErosionResult {
    const cfg = { ...this.config, ...overrides };
    let totalErosion = 0;
    let totalDeposition = 0;
    let cellsAffected = 0;
    const r = Math.ceil(cfg.radius);

    for (let iter = 0; iter < cfg.iterations; iter++) {
      for (let dx = -r; dx <= r; dx++) {
        for (let dz = -r; dz <= r; dz++) {
          const dist = Math.sqrt(dx * dx + dz * dz);
          if (dist > cfg.radius) continue;

          const x = cx + dx;
          const z = cz + dz;
          const key = `${x},${z}`;
          const h = this.heightmap.get(key);
          if (h === undefined) continue;

          if (cfg.type === 'hydraulic') {
            const neighbors = this.getNeighborHeights(x, z);
            const avgNeighbor = neighbors.reduce((a, b) => a + b, 0) / (neighbors.length || 1);
            const diff = h - avgNeighbor;

            if (diff > 0) {
              const erosion = Math.min(diff * cfg.strength * 0.1, cfg.sedimentCapacity);
              this.heightmap.set(key, h - erosion);
              totalErosion += erosion;
              cellsAffected++;
            } else if (diff < 0) {
              const deposit = Math.abs(diff) * cfg.strength * 0.05;
              this.heightmap.set(key, h + deposit);
              totalDeposition += deposit;
            }
          } else if (cfg.type === 'thermal') {
            const neighbors = this.getNeighborHeights(x, z);
            const minNeighbor = Math.min(...neighbors, h);
            const slope = h - minNeighbor;
            const maxSlope = Math.tan((cfg.thermalAngle * Math.PI) / 180);

            if (slope > maxSlope) {
              const transfer = (slope - maxSlope) * cfg.strength * 0.1;
              this.heightmap.set(key, h - transfer);
              totalErosion += transfer;
              cellsAffected++;
            }
          } else {
            // Wind erosion: affects exposed peaks
            const neighbors = this.getNeighborHeights(x, z);
            const maxN = Math.max(...neighbors, 0);
            if (h > maxN) {
              const erosion = (h - maxN) * cfg.strength * 0.05;
              this.heightmap.set(key, h - erosion);
              totalErosion += erosion;
              cellsAffected++;
            }
          }
        }
      }
    }

    return { cellsAffected, totalErosion, totalDeposition, iterations: cfg.iterations };
  }

  private getNeighborHeights(x: number, z: number): number[] {
    const offsets = [
      [-1, 0],
      [1, 0],
      [0, -1],
      [0, 1],
    ];
    const result: number[] = [];
    for (const [dx, dz] of offsets) {
      const h = this.heightmap.get(`${x + dx},${z + dz}`);
      if (h !== undefined) result.push(h);
    }
    return result;
  }

  getConfig(): ErosionConfig {
    return { ...this.config };
  }
  setConfig(cfg: Partial<ErosionConfig>): void {
    Object.assign(this.config, cfg);
  }
  getGridSize(): number {
    return this.gridSize;
  }
}
