/**
 * TerrainBrush — Sculpting brushes (raise/lower/smooth/flatten/paint)
 *
 * Applies heightmap modifications with configurable radius, strength,
 * and falloff curves.
 *
 * @version 1.0.0
 */

// =============================================================================
// TYPES
// =============================================================================

export type BrushMode = 'raise' | 'lower' | 'smooth' | 'flatten' | 'paint' | 'erode';
export type FalloffCurve = 'linear' | 'smooth' | 'sphere' | 'tip' | 'flat';

export interface BrushConfig {
  mode: BrushMode;
  radius: number;
  strength: number;
  falloff: FalloffCurve;
  opacity: number;
}

export interface BrushStroke {
  x: number;
  z: number;
  config: BrushConfig;
  timestamp: number;
}

export interface TerrainCell {
  height: number;
  paintLayer: number;
  locked: boolean;
}

// =============================================================================
// FALLOFF FUNCTIONS
// =============================================================================

function computeFalloff(distance: number, radius: number, curve: FalloffCurve): number {
  const t = Math.min(distance / radius, 1);
  switch (curve) {
    case 'linear':
      return 1 - t;
    case 'smooth':
      return 1 - t * t * (3 - 2 * t);
    case 'sphere':
      return Math.sqrt(Math.max(0, 1 - t * t));
    case 'tip':
      return (1 - t) * (1 - t);
    case 'flat':
      return t < 0.8 ? 1 : 1 - (t - 0.8) / 0.2;
  }
}

// =============================================================================
// TERRAIN BRUSH
// =============================================================================

export class TerrainBrush {
  private grid: Map<string, TerrainCell> = new Map();
  private strokes: BrushStroke[] = [];
  private undoStack: Map<string, number>[] = [];
  private config: BrushConfig;
  private gridSize: number;

  constructor(gridSize: number = 64, config?: Partial<BrushConfig>) {
    this.gridSize = gridSize;
    this.config = {
      mode: config?.mode ?? 'raise',
      radius: config?.radius ?? 5,
      strength: config?.strength ?? 1,
      falloff: config?.falloff ?? 'smooth',
      opacity: config?.opacity ?? 1,
    };

    // Init flat grid
    for (let x = 0; x < gridSize; x++) {
      for (let z = 0; z < gridSize; z++) {
        this.grid.set(`${x},${z}`, { height: 0, paintLayer: 0, locked: false });
      }
    }
  }

  /**
   * Apply brush at a position
   */
  apply(cx: number, cz: number, overrides?: Partial<BrushConfig>): number {
    const cfg = { ...this.config, ...overrides };
    const snapshot = new Map<string, number>();
    let affected = 0;
    const r = Math.ceil(cfg.radius);

    // Compute average height for flatten
    let avgHeight = 0;
    let avgCount = 0;
    if (cfg.mode === 'flatten' || cfg.mode === 'smooth') {
      for (let dx = -r; dx <= r; dx++) {
        for (let dz = -r; dz <= r; dz++) {
          const dist = Math.sqrt(dx * dx + dz * dz);
          if (dist > cfg.radius) continue;
          const cell = this.grid.get(`${cx + dx},${cz + dz}`);
          if (cell) {
            avgHeight += cell.height;
            avgCount++;
          }
        }
      }
      if (avgCount > 0) avgHeight /= avgCount;
    }

    for (let dx = -r; dx <= r; dx++) {
      for (let dz = -r; dz <= r; dz++) {
        const dist = Math.sqrt(dx * dx + dz * dz);
        if (dist > cfg.radius) continue;

        const key = `${cx + dx},${cz + dz}`;
        const cell = this.grid.get(key);
        if (!cell || cell.locked) continue;

        const falloff = computeFalloff(dist, cfg.radius, cfg.falloff);
        const intensity = cfg.strength * cfg.opacity * falloff;

        snapshot.set(key, cell.height);

        switch (cfg.mode) {
          case 'raise':
            cell.height += intensity;
            break;
          case 'lower':
            cell.height -= intensity;
            break;
          case 'smooth':
            cell.height += (avgHeight - cell.height) * intensity * 0.5;
            break;
          case 'flatten':
            cell.height += (avgHeight - cell.height) * intensity;
            break;
          case 'paint':
            // Paint mode doesn't modify height
            break;
          case 'erode':
            // Simple erosion: lower peaks, raise valleys relative to avg
            cell.height += (avgHeight - cell.height) * intensity * 0.3;
            break;
        }
        affected++;
      }
    }

    this.undoStack.push(snapshot);
    this.strokes.push({ x: cx, z: cz, config: cfg, timestamp: Date.now() });
    return affected;
  }

  /**
   * Paint a layer at a position
   */
  paint(cx: number, cz: number, layerIndex: number): number {
    const r = Math.ceil(this.config.radius);
    let painted = 0;

    for (let dx = -r; dx <= r; dx++) {
      for (let dz = -r; dz <= r; dz++) {
        const dist = Math.sqrt(dx * dx + dz * dz);
        if (dist > this.config.radius) continue;
        const cell = this.grid.get(`${cx + dx},${cz + dz}`);
        if (cell && !cell.locked) {
          cell.paintLayer = layerIndex;
          painted++;
        }
      }
    }
    return painted;
  }

  /**
   * Undo last stroke
   */
  undo(): boolean {
    const snapshot = this.undoStack.pop();
    if (!snapshot) return false;
    for (const [key, height] of snapshot) {
      const cell = this.grid.get(key);
      if (cell) cell.height = height;
    }
    this.strokes.pop();
    return true;
  }

  /**
   * Get height at a grid position
   */
  getHeight(x: number, z: number): number {
    return this.grid.get(`${x},${z}`)?.height ?? 0;
  }

  /**
   * Get cell data
   */
  getCell(x: number, z: number): TerrainCell | undefined {
    return this.grid.get(`${x},${z}`);
  }

  /**
   * Lock/unlock cells
   */
  setLocked(x: number, z: number, locked: boolean): void {
    const cell = this.grid.get(`${x},${z}`);
    if (cell) cell.locked = locked;
  }

  /**
   * Get current config
   */
  getConfig(): BrushConfig {
    return { ...this.config };
  }

  /**
   * Set config
   */
  setConfig(cfg: Partial<BrushConfig>): void {
    Object.assign(this.config, cfg);
  }

  /**
   * Get stroke count
   */
  getStrokeCount(): number {
    return this.strokes.length;
  }

  /**
   * Get grid size
   */
  getGridSize(): number {
    return this.gridSize;
  }

  /**
   * Get undo count
   */
  getUndoCount(): number {
    return this.undoStack.length;
  }

  /**
   * Get height range
   */
  getHeightRange(): { min: number; max: number } {
    let min = Infinity,
      max = -Infinity;
    for (const cell of this.grid.values()) {
      if (cell.height < min) min = cell.height;
      if (cell.height > max) max = cell.height;
    }
    return { min, max };
  }
}
