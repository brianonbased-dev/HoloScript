/**
 * ImpostorSystem.ts
 *
 * Billboard impostors: capture snapshots, angle-based selection,
 * atlas packing, and distance threshold management.
 *
 * @module lod
 */

// =============================================================================
// TYPES
// =============================================================================

export interface ImpostorConfig {
  entityId: string;
  angleCount: number; // Number of snapshot angles (e.g. 8 or 16)
  atlasIndex: number; // Position in impostor atlas
  switchDistance: number; // Distance at which to switch to impostor
  size: { width: number; height: number };
}

export interface ImpostorFrame {
  angleIndex: number;
  uvX: number;
  uvY: number;
  uvW: number;
  uvH: number;
}

// =============================================================================
// IMPOSTOR SYSTEM
// =============================================================================

export class ImpostorSystem {
  private impostors: Map<string, ImpostorConfig> = new Map();
  private atlasColumns: number;
  private atlasRows: number;

  constructor(atlasColumns = 8, atlasRows = 8) {
    this.atlasColumns = atlasColumns;
    this.atlasRows = atlasRows;
  }

  // ---------------------------------------------------------------------------
  // Registration
  // ---------------------------------------------------------------------------

  registerImpostor(config: ImpostorConfig): void {
    this.impostors.set(config.entityId, config);
  }
  removeImpostor(entityId: string): void {
    this.impostors.delete(entityId);
  }

  // ---------------------------------------------------------------------------
  // Angle Selection
  // ---------------------------------------------------------------------------

  selectAngle(entityId: string, cameraAngle: number): ImpostorFrame | null {
    const imp = this.impostors.get(entityId);
    if (!imp) return null;

    // Normalize angle to 0-2π
    const normalized = ((cameraAngle % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    const angleStep = (2 * Math.PI) / imp.angleCount;
    const angleIndex = Math.round(normalized / angleStep) % imp.angleCount;

    return this.getFrame(imp, angleIndex);
  }

  // ---------------------------------------------------------------------------
  // UV Computation
  // ---------------------------------------------------------------------------

  private getFrame(imp: ImpostorConfig, angleIndex: number): ImpostorFrame {
    const globalIndex = imp.atlasIndex * imp.angleCount + angleIndex;
    const col = globalIndex % this.atlasColumns;
    const row = Math.floor(globalIndex / this.atlasColumns);

    return {
      angleIndex,
      uvX: col / this.atlasColumns,
      uvY: row / this.atlasRows,
      uvW: 1 / this.atlasColumns,
      uvH: 1 / this.atlasRows,
    };
  }

  // ---------------------------------------------------------------------------
  // Distance Check
  // ---------------------------------------------------------------------------

  shouldUseImpostor(entityId: string, distance: number): boolean {
    const imp = this.impostors.get(entityId);
    return imp ? distance >= imp.switchDistance : false;
  }

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------

  getImpostorCount(): number {
    return this.impostors.size;
  }
  getConfig(entityId: string): ImpostorConfig | undefined {
    return this.impostors.get(entityId);
  }
}
