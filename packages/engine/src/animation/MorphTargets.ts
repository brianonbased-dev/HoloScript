/**
 * MorphTargets.ts
 *
 * Blend shapes / morph targets: named targets with delta vertices,
 * weight interpolation, presets, and batch application.
 *
 * @module animation
 */

// =============================================================================
// TYPES
// =============================================================================

export interface MorphDelta {
  vertexIndex: number;
  dx: number;
  dy: number;
  dz: number;
}

export interface MorphTarget {
  name: string;
  deltas: MorphDelta[];
  weight: number; // 0-1
}

export interface MorphPreset {
  name: string;
  weights: Map<string, number>; // target name → weight
}

// =============================================================================
// MORPH TARGET SYSTEM
// =============================================================================

export class MorphTargetSystem {
  private targets: Map<string, MorphTarget> = new Map();
  private presets: Map<string, MorphPreset> = new Map();
  private vertexCount: number;

  constructor(vertexCount: number) {
    this.vertexCount = vertexCount;
  }

  // ---------------------------------------------------------------------------
  // Target Management
  // ---------------------------------------------------------------------------

  addTarget(name: string, deltas: MorphDelta[]): void {
    this.targets.set(name, { name, deltas, weight: 0 });
  }

  removeTarget(name: string): void {
    this.targets.delete(name);
  }

  setWeight(name: string, weight: number): void {
    const target = this.targets.get(name);
    if (target) target.weight = Math.max(0, Math.min(1, weight));
  }

  getWeight(name: string): number {
    return this.targets.get(name)?.weight ?? 0;
  }

  // ---------------------------------------------------------------------------
  // Preset Management
  // ---------------------------------------------------------------------------

  addPreset(name: string, weights: Map<string, number>): void {
    this.presets.set(name, { name, weights });
  }

  applyPreset(name: string): void {
    const preset = this.presets.get(name);
    if (!preset) return;
    for (const [targetName, weight] of preset.weights) {
      this.setWeight(targetName, weight);
    }
  }

  // ---------------------------------------------------------------------------
  // Vertex Computation
  // ---------------------------------------------------------------------------

  computeDeformedPositions(basePositions: Float32Array): Float32Array {
    const result = new Float32Array(basePositions);

    for (const target of this.targets.values()) {
      if (target.weight <= 0) continue;

      for (const delta of target.deltas) {
        const idx = delta.vertexIndex * 3;
        if (idx + 2 < result.length) {
          result[idx] += delta.dx * target.weight;
          result[idx + 1] += delta.dy * target.weight;
          result[idx + 2] += delta.dz * target.weight;
        }
      }
    }

    return result;
  }

  // ---------------------------------------------------------------------------
  // Interpolation
  // ---------------------------------------------------------------------------

  lerpWeights(targetWeights: Map<string, number>, t: number): void {
    for (const [name, targetWeight] of targetWeights) {
      const current = this.getWeight(name);
      this.setWeight(name, current + (targetWeight - current) * t);
    }
  }

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------

  getTargetCount(): number {
    return this.targets.size;
  }
  getActiveTargets(): string[] {
    return [...this.targets.values()].filter((t) => t.weight > 0).map((t) => t.name);
  }
  getVertexCount(): number {
    return this.vertexCount;
  }
}

