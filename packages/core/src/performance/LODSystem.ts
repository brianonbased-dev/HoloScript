/**
 * LODSystem.ts
 *
 * Level-of-Detail system for HoloScript+.
 * Automatically selects geometry/detail level based on distance to camera.
 */

export interface LODLevel {
  /** Distance threshold (switch TO this level when beyond this distance) */
  minDistance: number;
  /** Detail label */
  label: string;
  /** Any metadata (e.g., triangle count, texture resolution) */
  meta?: Record<string, any>;
}

export interface LODConfig {
  entityId: string;
  levels: LODLevel[];
}

export interface LODResult {
  entityId: string;
  activeLevel: string;
  distance: number;
}

export class LODSystem {
  private configs: Map<string, LODConfig> = new Map();
  private activeResults: Map<string, LODResult> = new Map();

  /**
   * Register an entity with LOD levels.
   */
  register(config: LODConfig): void {
    // Sort levels by minDistance ascending
    config.levels.sort((a, b) => a.minDistance - b.minDistance);
    this.configs.set(config.entityId, config);
  }

  /**
   * Unregister an entity.
   */
  unregister(entityId: string): void {
    this.configs.delete(entityId);
    this.activeResults.delete(entityId);
  }

  /**
   * Update all LOD levels based on camera position.
   */
  update(
    cameraPos: [number, number, number],
    entityPositions: Map<string, [number, number, number]>
  ): void {
    for (const [entityId, config] of this.configs) {
      const pos = entityPositions.get(entityId);
      if (!pos) continue;

      const dx = pos[0] - cameraPos[0];
      const dy = pos[1] - cameraPos[1];
      const dz = pos[2] - cameraPos[2];
      const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);

      // Find the appropriate LOD level
      let activeLevel = config.levels[0]?.label || 'default';
      for (const level of config.levels) {
        if (distance >= level.minDistance) {
          activeLevel = level.label;
        } else {
          break;
        }
      }

      this.activeResults.set(entityId, { entityId, activeLevel, distance });
    }
  }

  /**
   * Get the active LOD level for an entity.
   */
  getActiveLevel(entityId: string): string | undefined {
    return this.activeResults.get(entityId)?.activeLevel;
  }

  /**
   * Get all active results.
   */
  getAllResults(): LODResult[] {
    return Array.from(this.activeResults.values());
  }

  /**
   * Get registered entity count.
   */
  get count(): number {
    return this.configs.size;
  }
}
