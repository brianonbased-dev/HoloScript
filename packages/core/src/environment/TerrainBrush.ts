/**
 * TerrainBrush.ts
 *
 * Editor tools for sculpting and painting terrain heightmaps.
 * Supports raise, lower, flatten, smooth, and texture paint brushes.
 *
 * @module environment
 */

import { TerrainSystem } from './TerrainSystem';

// =============================================================================
// TYPES
// =============================================================================

export type BrushMode = 'raise' | 'lower' | 'flatten' | 'smooth' | 'paint';

export interface BrushConfig {
  mode: BrushMode;
  radius: number; // Brush radius in grid cells
  strength: number; // Brush intensity (0-1)
  falloff: number; // Edge falloff (0 = hard, 1 = soft)
  flattenHeight?: number; // Target height for flatten mode (0-1)
  paintLayerId?: string; // Layer to paint for paint mode
}

export interface BrushStroke {
  terrainId: string;
  gridX: number;
  gridZ: number;
  config: BrushConfig;
  affectedCells: { x: number; z: number; oldHeight: number; newHeight: number }[];
}

// =============================================================================
// TERRAIN BRUSH
// =============================================================================

const DEFAULT_BRUSH: BrushConfig = {
  mode: 'raise',
  radius: 5,
  strength: 0.1,
  falloff: 0.7,
};

export class TerrainBrush {
  private config: BrushConfig;
  private terrain: TerrainSystem;
  private undoStack: BrushStroke[] = [];
  private redoStack: BrushStroke[] = [];

  constructor(terrain: TerrainSystem, config: Partial<BrushConfig> = {}) {
    this.terrain = terrain;
    this.config = { ...DEFAULT_BRUSH, ...config };
  }

  // ---------------------------------------------------------------------------
  // Configuration
  // ---------------------------------------------------------------------------

  setConfig(config: Partial<BrushConfig>): void {
    this.config = { ...this.config, ...config };
  }

  getConfig(): BrushConfig {
    return { ...this.config };
  }

  setMode(mode: BrushMode): void {
    this.config.mode = mode;
  }

  setRadius(radius: number): void {
    this.config.radius = Math.max(1, Math.min(50, radius));
  }

  setStrength(strength: number): void {
    this.config.strength = Math.max(0, Math.min(1, strength));
  }

  // ---------------------------------------------------------------------------
  // Apply Brush
  // ---------------------------------------------------------------------------

  /**
   * Apply the brush at a grid position on a terrain.
   */
  apply(terrainId: string, gridX: number, gridZ: number): BrushStroke {
    const terrainData = this.terrain.getTerrain(terrainId);
    if (!terrainData) {
      return { terrainId, gridX, gridZ, config: { ...this.config }, affectedCells: [] };
    }

    const res = terrainData.config.resolution;
    const heightmap = terrainData.heightmap;
    const affectedCells: BrushStroke['affectedCells'] = [];

    const r = this.config.radius;

    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        const cx = gridX + dx;
        const cz = gridZ + dz;

        if (cx < 0 || cx >= res || cz < 0 || cz >= res) continue;

        const dist = Math.sqrt(dx * dx + dz * dz);
        if (dist > r) continue;

        // Falloff
        const t = dist / r;
        const falloff = 1 - Math.pow(t, 1 / Math.max(this.config.falloff, 0.01));
        const influence = falloff * this.config.strength;

        const idx = cz * res + cx;
        const oldHeight = heightmap[idx];
        let newHeight = oldHeight;

        switch (this.config.mode) {
          case 'raise':
            newHeight = Math.min(1, oldHeight + influence * 0.05);
            break;
          case 'lower':
            newHeight = Math.max(0, oldHeight - influence * 0.05);
            break;
          case 'flatten':
            const target = this.config.flattenHeight ?? 0.5;
            newHeight = oldHeight + (target - oldHeight) * influence;
            break;
          case 'smooth': {
            // Average surrounding heights
            let sum = 0;
            let count = 0;
            for (let sz = -1; sz <= 1; sz++) {
              for (let sx = -1; sx <= 1; sx++) {
                const nx = cx + sx;
                const nz = cz + sz;
                if (nx >= 0 && nx < res && nz >= 0 && nz < res) {
                  sum += heightmap[nz * res + nx];
                  count++;
                }
              }
            }
            const avg = sum / count;
            newHeight = oldHeight + (avg - oldHeight) * influence;
            break;
          }
          case 'paint':
            // Paint mode doesn't modify height; it marks texture weights
            // (handled externally via layer splatmap)
            break;
        }

        if (newHeight !== oldHeight) {
          heightmap[idx] = newHeight;
          affectedCells.push({ x: cx, z: cz, oldHeight, newHeight });
        }
      }
    }

    const stroke: BrushStroke = {
      terrainId,
      gridX,
      gridZ,
      config: { ...this.config },
      affectedCells,
    };

    this.undoStack.push(stroke);
    this.redoStack = [];

    return stroke;
  }

  // ---------------------------------------------------------------------------
  // Undo/Redo
  // ---------------------------------------------------------------------------

  undo(): BrushStroke | null {
    const stroke = this.undoStack.pop();
    if (!stroke) return null;

    const terrainData = this.terrain.getTerrain(stroke.terrainId);
    if (!terrainData) return null;

    const res = terrainData.config.resolution;
    for (const cell of stroke.affectedCells) {
      terrainData.heightmap[cell.z * res + cell.x] = cell.oldHeight;
    }

    this.redoStack.push(stroke);
    return stroke;
  }

  redo(): BrushStroke | null {
    const stroke = this.redoStack.pop();
    if (!stroke) return null;

    const terrainData = this.terrain.getTerrain(stroke.terrainId);
    if (!terrainData) return null;

    const res = terrainData.config.resolution;
    for (const cell of stroke.affectedCells) {
      terrainData.heightmap[cell.z * res + cell.x] = cell.newHeight;
    }

    this.undoStack.push(stroke);
    return stroke;
  }

  getUndoCount(): number {
    return this.undoStack.length;
  }
  getRedoCount(): number {
    return this.redoStack.length;
  }
}
