/**
 * AudioOcclusion.ts
 *
 * Advanced obstacle-based audio occlusion and obstruction:
 * - Raycast-based occlusion detection
 * - dB-based transmission loss
 * - Frequency-dependent filtering (realistic "behind wall" muffled sound)
 * - Per-material frequency absorption curves
 *
 * @module audio
 */

// =============================================================================
// TYPES
// =============================================================================

/**
 * Frequency-dependent absorption coefficients (0-1 per frequency band)
 */
export interface FrequencyAbsorption {
  125: number; // 125 Hz
  250: number; // 250 Hz
  500: number; // 500 Hz
  1000: number; // 1 kHz
  2000: number; // 2 kHz
  4000: number; // 4 kHz
  8000: number; // 8 kHz
}

export interface OcclusionMaterial {
  id: string;
  name: string;
  absorptionCoefficient: number; // 0-1, average sound absorption
  transmissionLoss: number; // dB lost per material hit
  frequencyAbsorption?: FrequencyAbsorption; // Per-frequency absorption (optional)
}

export interface OcclusionResult {
  sourceId: string;
  occluded: boolean;
  occlusionFactor: number; // 0-1 (0 = fully audible, 1 = fully blocked)
  hitCount: number;
  totalTransmissionLoss: number; // dB
  materials: string[]; // Material IDs hit
  lowPassCutoff: number; // Hz (calculated filter cutoff for muffled sound)
  frequencyAttenuation: Partial<FrequencyAbsorption>; // Per-frequency attenuation
}

export interface OcclusionRay {
  origin: { x: number; y: number; z: number };
  direction: { x: number; y: number; z: number };
  maxDistance: number;
}

export interface OcclusionHit {
  distance: number;
  materialId: string;
  thickness: number; // Meters
}

// =============================================================================
// MATERIAL PRESETS
// =============================================================================

export const OCCLUSION_MATERIALS: Record<string, OcclusionMaterial> = {
  glass: {
    id: 'glass',
    name: 'Glass',
    absorptionCoefficient: 0.1,
    transmissionLoss: 6,
    frequencyAbsorption: {
      125: 0.35,
      250: 0.25,
      500: 0.18,
      1000: 0.12,
      2000: 0.07,
      4000: 0.04,
      8000: 0.03,
    },
  },
  wood: {
    id: 'wood',
    name: 'Wood',
    absorptionCoefficient: 0.3,
    transmissionLoss: 12,
    frequencyAbsorption: {
      125: 0.15,
      250: 0.11,
      500: 0.1,
      1000: 0.07,
      2000: 0.06,
      4000: 0.07,
      8000: 0.09,
    },
  },
  drywall: {
    id: 'drywall',
    name: 'Drywall',
    absorptionCoefficient: 0.2,
    transmissionLoss: 10,
    frequencyAbsorption: {
      125: 0.29,
      250: 0.1,
      500: 0.05,
      1000: 0.04,
      2000: 0.07,
      4000: 0.09,
      8000: 0.08,
    },
  },
  brick: {
    id: 'brick',
    name: 'Brick',
    absorptionCoefficient: 0.4,
    transmissionLoss: 20,
    frequencyAbsorption: {
      125: 0.03,
      250: 0.03,
      500: 0.03,
      1000: 0.04,
      2000: 0.05,
      4000: 0.07,
      8000: 0.07,
    },
  },
  concrete: {
    id: 'concrete',
    name: 'Concrete',
    absorptionCoefficient: 0.5,
    transmissionLoss: 30,
    frequencyAbsorption: {
      125: 0.01,
      250: 0.01,
      500: 0.02,
      1000: 0.02,
      2000: 0.02,
      4000: 0.03,
      8000: 0.04,
    },
  },
  metal: {
    id: 'metal',
    name: 'Metal',
    absorptionCoefficient: 0.05,
    transmissionLoss: 35,
    frequencyAbsorption: {
      125: 0.01,
      250: 0.01,
      500: 0.01,
      1000: 0.01,
      2000: 0.02,
      4000: 0.02,
      8000: 0.03,
    },
  },
  fabric: {
    id: 'fabric',
    name: 'Fabric',
    absorptionCoefficient: 0.7,
    transmissionLoss: 3,
    frequencyAbsorption: {
      125: 0.03,
      250: 0.09,
      500: 0.2,
      1000: 0.54,
      2000: 0.7,
      4000: 0.72,
      8000: 0.75,
    },
  },
  water: {
    id: 'water',
    name: 'Water',
    absorptionCoefficient: 0.02,
    transmissionLoss: 8,
    frequencyAbsorption: {
      125: 0.01,
      250: 0.01,
      500: 0.01,
      1000: 0.01,
      2000: 0.02,
      4000: 0.03,
      8000: 0.04,
    },
  },
};

// =============================================================================
// AUDIO OCCLUSION SYSTEM
// =============================================================================

export type RaycastProvider = (ray: OcclusionRay) => OcclusionHit[];

export class AudioOcclusionSystem {
  private materials: Map<string, OcclusionMaterial> = new Map();
  private raycastProvider: RaycastProvider | null = null;
  private maxTransmissionLoss = 60; // dB cap
  private cache: Map<string, OcclusionResult> = new Map();
  private enableFrequencyFiltering = true; // Enable frequency-dependent occlusion

  constructor() {
    // Register default materials
    for (const mat of Object.values(OCCLUSION_MATERIALS)) {
      this.materials.set(mat.id, mat);
    }
  }

  // ---------------------------------------------------------------------------
  // Configuration
  // ---------------------------------------------------------------------------

  setRaycastProvider(provider: RaycastProvider): void {
    this.raycastProvider = provider;
  }

  registerMaterial(material: OcclusionMaterial): void {
    this.materials.set(material.id, material);
  }

  getMaterial(id: string): OcclusionMaterial | undefined {
    return this.materials.get(id);
  }

  setMaxTransmissionLoss(db: number): void {
    this.maxTransmissionLoss = Math.max(0, db);
  }

  setFrequencyFilteringEnabled(enabled: boolean): void {
    this.enableFrequencyFiltering = enabled;
  }

  isFrequencyFilteringEnabled(): boolean {
    return this.enableFrequencyFiltering;
  }

  // ---------------------------------------------------------------------------
  // Computation
  // ---------------------------------------------------------------------------

  /**
   * Compute occlusion between listener and a source.
   * Uses the registered raycast provider to detect obstacles.
   * Now includes frequency-dependent filtering for realistic muffled sound.
   */
  computeOcclusion(
    listenPos: { x: number; y: number; z: number },
    sourcePos: { x: number; y: number; z: number },
    sourceId: string
  ): OcclusionResult {
    if (!this.raycastProvider) {
      return {
        sourceId,
        occluded: false,
        occlusionFactor: 0,
        hitCount: 0,
        totalTransmissionLoss: 0,
        materials: [],
        lowPassCutoff: 22000,
        frequencyAttenuation: {},
      };
    }

    const dx = sourcePos.x - listenPos.x;
    const dy = sourcePos.y - listenPos.y;
    const dz = sourcePos.z - listenPos.z;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

    if (dist === 0) {
      return {
        sourceId,
        occluded: false,
        occlusionFactor: 0,
        hitCount: 0,
        totalTransmissionLoss: 0,
        materials: [],
        lowPassCutoff: 22000,
        frequencyAttenuation: {},
      };
    }

    const ray: OcclusionRay = {
      origin: { ...listenPos },
      direction: { x: dx / dist, y: dy / dist, z: dz / dist },
      maxDistance: dist,
    };

    const hits = this.raycastProvider(ray);
    if (hits.length === 0) {
      return {
        sourceId,
        occluded: false,
        occlusionFactor: 0,
        hitCount: 0,
        totalTransmissionLoss: 0,
        materials: [],
        lowPassCutoff: 22000,
        frequencyAttenuation: {},
      };
    }

    let totalLoss = 0;
    const hitMaterials: string[] = [];
    const frequencyAttenuation: Partial<FrequencyAbsorption> = {};

    // Accumulate frequency-dependent absorption
    const freqBands: Array<keyof FrequencyAbsorption> = [125, 250, 500, 1000, 2000, 4000, 8000];
    for (const freq of freqBands) {
      frequencyAttenuation[freq] = 0;
    }

    for (const hit of hits) {
      const mat = this.materials.get(hit.materialId);
      if (mat) {
        totalLoss += mat.transmissionLoss;
        hitMaterials.push(hit.materialId);

        // Accumulate per-frequency absorption
        if (this.enableFrequencyFiltering && mat.frequencyAbsorption) {
          for (const freq of freqBands) {
            const absorp = mat.frequencyAbsorption[freq] || 0;
            frequencyAttenuation[freq] = Math.min(
              1,
              (frequencyAttenuation[freq] || 0) + absorp * hit.thickness
            );
          }
        }
      }
    }

    totalLoss = Math.min(totalLoss, this.maxTransmissionLoss);
    const factor = totalLoss / this.maxTransmissionLoss;

    // Calculate low-pass cutoff based on occlusion
    // Fully occluded = 500Hz cutoff, no occlusion = 22kHz
    const lowPassCutoff = this.calculateLowPassCutoff(factor, frequencyAttenuation);

    const result: OcclusionResult = {
      sourceId,
      occluded: totalLoss > 0,
      occlusionFactor: factor,
      hitCount: hits.length,
      totalTransmissionLoss: totalLoss,
      materials: hitMaterials,
      lowPassCutoff,
      frequencyAttenuation: this.enableFrequencyFiltering ? frequencyAttenuation : {},
    };

    this.cache.set(sourceId, result);
    return result;
  }

  /**
   * Compute without raycasting — direct manual hit specification.
   * Useful for testing or pre-computed occlusion.
   */
  computeFromHits(sourceId: string, hits: OcclusionHit[]): OcclusionResult {
    let totalLoss = 0;
    const hitMaterials: string[] = [];

    for (const hit of hits) {
      const mat = this.materials.get(hit.materialId);
      if (mat) {
        totalLoss += mat.transmissionLoss;
        hitMaterials.push(hit.materialId);
      }
    }

    totalLoss = Math.min(totalLoss, this.maxTransmissionLoss);
    const factor = totalLoss / this.maxTransmissionLoss;

    return {
      sourceId,
      occluded: totalLoss > 0,
      occlusionFactor: factor,
      hitCount: hits.length,
      totalTransmissionLoss: totalLoss,
      materials: hitMaterials,
    };
  }

  /**
   * Get the volume multiplier for a given occlusion factor.
   * Converts transmission loss to a linear volume reduction.
   */
  getVolumeMultiplier(occlusionFactor: number): number {
    // Convert dB loss back to linear multiplier
    const dbLoss = occlusionFactor * this.maxTransmissionLoss;
    return Math.pow(10, -dbLoss / 20);
  }

  getCachedResult(sourceId: string): OcclusionResult | undefined {
    return this.cache.get(sourceId);
  }

  clearCache(): void {
    this.cache.clear();
  }

  // ---------------------------------------------------------------------------
  // Frequency-Dependent Occlusion
  // ---------------------------------------------------------------------------

  /**
   * Calculate low-pass filter cutoff frequency based on occlusion.
   * Returns cutoff in Hz (500Hz fully occluded, 22kHz no occlusion).
   */
  private calculateLowPassCutoff(
    occlusionFactor: number,
    frequencyAttenuation: Partial<FrequencyAbsorption>
  ): number {
    if (!this.enableFrequencyFiltering || Object.keys(frequencyAttenuation).length === 0) {
      // Simplified cutoff based on total occlusion
      const minCutoff = 500; // Fully occluded
      const maxCutoff = 22000; // No occlusion
      return maxCutoff - occlusionFactor * (maxCutoff - minCutoff);
    }

    // Find the frequency where attenuation exceeds 0.5 (50% absorbed)
    const freqBands: Array<keyof FrequencyAbsorption> = [125, 250, 500, 1000, 2000, 4000, 8000];
    for (let i = freqBands.length - 1; i >= 0; i--) {
      const freq = freqBands[i];
      const atten = frequencyAttenuation[freq] || 0;

      if (atten < 0.5) {
        // This frequency is still audible, cutoff is between this and next
        const nextFreq = i < freqBands.length - 1 ? freqBands[i + 1] : 22000;
        return (freq + nextFreq) / 2;
      }
    }

    // All frequencies heavily attenuated
    return 500;
  }

  /**
   * Get frequency attenuation for a specific source.
   * Returns per-band attenuation (0-1, where 1 = fully absorbed).
   */
  getFrequencyAttenuation(sourceId: string): Partial<FrequencyAbsorption> {
    const result = this.cache.get(sourceId);
    return result?.frequencyAttenuation || {};
  }

  /**
   * Get low-pass cutoff for a specific source.
   */
  getLowPassCutoff(sourceId: string): number {
    const result = this.cache.get(sourceId);
    return result?.lowPassCutoff || 22000;
  }
}
