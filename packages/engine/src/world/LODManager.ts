/**
 * LODManager.ts
 *
 * Level-of-detail management: distance-based LOD selection,
 * transition blending, hysteresis, and per-object bias config.
 *
 * @module world
 */

// =============================================================================
// TYPES
// =============================================================================

export interface LODLevel {
  level: number;
  maxDistance: number;
  meshDetail: number; // 0-1, 1 = full detail
}

export interface LODObject {
  id: string;
  position: [number, number, number];
  currentLevel: number;
  levels: LODLevel[];
  bias: number; // Multiplier to push LOD transitions
  visible: boolean;
  transitionAlpha: number; // 0-1 for blending
}

export interface LODConfig {
  defaultLevels: LODLevel[];
  hysteresis: number; // Extra distance before switching back
  transitionSpeed: number; // Blend speed
  maxObjects: number;
}

// =============================================================================
// DEFAULT CONFIG
// =============================================================================

const DEFAULT_LOD_LEVELS: LODLevel[] = [
  { level: 0, maxDistance: 50, meshDetail: 1.0 },
  { level: 1, maxDistance: 150, meshDetail: 0.5 },
  { level: 2, maxDistance: 400, meshDetail: 0.25 },
  { level: 3, maxDistance: Infinity, meshDetail: 0.1 },
];

const DEFAULT_LOD_CONFIG: LODConfig = {
  defaultLevels: DEFAULT_LOD_LEVELS,
  hysteresis: 5,
  transitionSpeed: 5,
  maxObjects: 10000,
};

// =============================================================================
// LOD MANAGER
// =============================================================================

export class LODManager {
  private config: LODConfig;
  private objects: Map<string, LODObject> = new Map();
  private viewerPosition = { x: 0, y: 0, z: 0 };

  constructor(config?: Partial<LODConfig>) {
    this.config = { ...DEFAULT_LOD_CONFIG, ...config };
  }

  // ---------------------------------------------------------------------------
  // Object Management
  // ---------------------------------------------------------------------------

  register(
    id: string,
    position: [number, number, number],
    levels?: LODLevel[],
    bias = 1
  ): LODObject {
    const obj: LODObject = {
      id,
      position: { ...position },
      currentLevel: 0,
      levels: levels ?? [...this.config.defaultLevels],
      bias,
      visible: true,
      transitionAlpha: 1,
    };
    this.objects.set(id, obj);
    return obj;
  }

  unregister(id: string): boolean {
    return this.objects.delete(id);
  }

  // ---------------------------------------------------------------------------
  // Update
  // ---------------------------------------------------------------------------

  setViewerPosition(x: number, y: number, z: number): void {
    this.viewerPosition = { x, y, z };
  }

  update(dt: number): void {
    for (const obj of this.objects.values()) {
      const dx = obj.position[0] - this.viewerPosition[0];
      const dy = obj.position[1] - this.viewerPosition[1];
      const dz = obj.position[2] - this.viewerPosition[2];
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz) * obj.bias;

      // Find appropriate LOD level
      let targetLevel = obj.levels.length - 1;
      for (let i = 0; i < obj.levels.length; i++) {
        const threshold = obj.levels[i].maxDistance;
        const hysteresisAdjust =
          i > obj.currentLevel ? this.config.hysteresis : -this.config.hysteresis;
        if (dist < threshold + hysteresisAdjust) {
          targetLevel = i;
          break;
        }
      }

      if (targetLevel !== obj.currentLevel) {
        obj.currentLevel = targetLevel;
        obj.transitionAlpha = 0; // Start blending
      }

      // Blend transition
      if (obj.transitionAlpha < 1) {
        obj.transitionAlpha = Math.min(1, obj.transitionAlpha + dt * this.config.transitionSpeed);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------

  getObject(id: string): LODObject | undefined {
    return this.objects.get(id);
  }
  getObjectCount(): number {
    return this.objects.size;
  }

  getLevelDistribution(): Map<number, number> {
    const dist = new Map<number, number>();
    for (const obj of this.objects.values()) {
      dist.set(obj.currentLevel, (dist.get(obj.currentLevel) ?? 0) + 1);
    }
    return dist;
  }

  getObjectsAtLevel(level: number): LODObject[] {
    return [...this.objects.values()].filter((o) => o.currentLevel === level);
  }

  getAverageLOD(): number {
    if (this.objects.size === 0) return 0;
    let sum = 0;
    for (const obj of this.objects.values()) sum += obj.currentLevel;
    return sum / this.objects.size;
  }
}
