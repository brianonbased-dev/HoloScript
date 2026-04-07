/**
 * LODBridge — Core-to-Renderer LOD Pipeline Bridge
 *
 * Connects the core LODGenerator (which computes simplified meshes using
 * Quadric Error Metrics, vertex clustering, etc.) to the renderer's
 * LODMeshNode (which displays the appropriate LOD based on camera distance).
 *
 * This bridge implements the missing link in the HoloScript asset pipeline:
 *   LODGenerator (core) → LODBridge → LODMeshNode (r3f-renderer)
 *
 * It manages:
 * 1. Computing LOD levels from source mesh data
 * 2. Caching computed LOD chains per entity
 * 3. Providing LOD data in the format LODMeshNode expects
 * 4. Integration with DraftManager for maturity-aware LOD selection
 *
 * @see W.084 — HoloScript has 65% infrastructure
 * @see P.080 — Draft-Mesh-Sim Circular Pipeline
 */

import { LODGenerator, type MeshData } from './LODGenerator';
import {
  type LODConfig,
  type LODTransition,
  type LODGenerationOptions,
  type GeneratedLODLevel,
} from './LODTypes';
import { type AssetMaturity } from '@holoscript/core';

// ── Types ────────────────────────────────────────────────────────────────────

/** Single LOD level in a chain — wraps GeneratedLODLevel with source MeshData */
export interface LODChainLevel {
  /** The simplified mesh data for this level */
  mesh: MeshData;
  /** Triangle count at this level */
  triangleCount: number;
  /** Reduction ratio from original (1.0 = full detail) */
  ratio: number;
}

/** LOD chain for a single entity — contains all computed LOD levels */
export interface LODChain {
  /** Entity ID this chain belongs to */
  entityId: string;
  /** Source mesh data (LOD 0 = full detail) */
  source: MeshData;
  /** Generated LOD levels (sorted by detail: highest first) */
  levels: LODChainLevel[];
  /** Distance thresholds for each LOD level */
  distances: number[];
  /** Current asset maturity */
  maturity: AssetMaturity;
  /** Transition strategy between levels */
  transition: LODTransition;
  /** Timestamp of last computation */
  computedAt: number;
}

/** Options for the LOD bridge */
export interface LODBridgeOptions {
  /** LOD generation options passed to LODGenerator */
  generatorOptions?: Partial<LODGenerationOptions>;
  /** Default distance thresholds [LOD0, LOD1, LOD2, LOD3] */
  defaultDistances?: number[];
  /** Default transition strategy */
  defaultTransition?: LODTransition;
  /** Maximum cached chains (LRU eviction) */
  maxCacheSize?: number;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Convert a GeneratedLODLevel to a LODChainLevel with MeshData */
function generatedToChainLevel(generated: GeneratedLODLevel): LODChainLevel {
  return {
    mesh: {
      positions: generated.positions,
      normals: generated.normals,
      uvs: generated.uvs,
      indices: generated.indices,
    },
    triangleCount: generated.triangleCount,
    ratio: generated.reductionRatio,
  };
}

// ── LODBridge ────────────────────────────────────────────────────────────────

export class LODBridge {
  private generator: LODGenerator;
  private cache = new Map<string, LODChain>();
  private options: Required<LODBridgeOptions>;

  constructor(options: LODBridgeOptions = {}) {
    this.options = {
      generatorOptions: options.generatorOptions ?? {},
      defaultDistances: options.defaultDistances ?? [0, 10, 25, 50],
      defaultTransition: options.defaultTransition ?? 'instant',
      maxCacheSize: options.maxCacheSize ?? 256,
    };
    this.generator = new LODGenerator(this.options.generatorOptions);
  }

  /**
   * Compute LOD chain for a mesh. This is the core bridge operation:
   * takes source MeshData → runs LODGenerator → caches result.
   */
  computeChain(
    entityId: string,
    source: MeshData,
    maturity: AssetMaturity = 'mesh',
    distances?: number[],
    transition?: LODTransition
  ): LODChain {
    // If draft maturity, skip LOD computation — use source as-is
    if (maturity === 'draft') {
      const chain: LODChain = {
        entityId,
        source,
        levels: [
          {
            mesh: source,
            triangleCount: source.indices.length / 3,
            ratio: 1.0,
          },
        ],
        distances: [0],
        maturity,
        transition: transition ?? this.options.defaultTransition,
        computedAt: Date.now(),
      };
      this.setCached(entityId, chain);
      return chain;
    }

    // Generate LOD levels
    const result = this.generator.generate(source);
    const chainLevels: LODChainLevel[] = result.levels.map(generatedToChainLevel);

    const chain: LODChain = {
      entityId,
      source,
      levels: chainLevels,
      distances: distances ?? this.options.defaultDistances.slice(0, chainLevels.length),
      maturity,
      transition: transition ?? this.options.defaultTransition,
      computedAt: Date.now(),
    };

    this.setCached(entityId, chain);
    return chain;
  }

  /** Get cached LOD chain for an entity */
  getChain(entityId: string): LODChain | null {
    return this.cache.get(entityId) ?? null;
  }

  /** Check if an entity has a computed LOD chain */
  hasChain(entityId: string): boolean {
    return this.cache.has(entityId);
  }

  /**
   * Select the appropriate LOD level based on camera distance.
   * Returns the MeshData for the best LOD level.
   */
  selectLOD(entityId: string, cameraDistance: number): MeshData | null {
    const chain = this.cache.get(entityId);
    if (!chain) return null;

    // Find the right LOD level based on distance thresholds
    let selectedIdx = 0;
    for (let i = chain.distances.length - 1; i >= 0; i--) {
      if (cameraDistance >= chain.distances[i]) {
        selectedIdx = i;
        break;
      }
    }

    // Clamp to available levels
    selectedIdx = Math.min(selectedIdx, chain.levels.length - 1);
    return chain.levels[selectedIdx]?.mesh ?? null;
  }

  /**
   * Get LOD config in the format expected by LODMeshNode.
   * This bridges core LOD data to the renderer's expected format.
   */
  getLODConfig(entityId: string): LODConfig | null {
    const chain = this.cache.get(entityId);
    if (!chain) return null;

    return {
      id: entityId,
      strategy: 'distance',
      transition: chain.transition,
      transitionDuration: 0.3,
      levels: chain.levels.map((level, i) => ({
        level: i,
        distance: chain.distances[i] ?? chain.distances[chain.distances.length - 1],
        polygonRatio: level.ratio,
        textureScale: Math.max(0.25, level.ratio),
        disabledFeatures: i >= 2 ? ['reflections' as const, 'particles' as const] : [],
        triangleCount: level.triangleCount,
      })),
      hysteresis: 0.1,
      bias: 0,
      fadeEnabled: false,
      enabled: true,
    };
  }

  /** Invalidate a chain (e.g., when mesh is updated) */
  invalidate(entityId: string): void {
    this.cache.delete(entityId);
  }

  /** Clear all cached chains */
  clear(): void {
    this.cache.clear();
  }

  /** Get cache statistics */
  get stats(): { size: number; maxSize: number } {
    return {
      size: this.cache.size,
      maxSize: this.options.maxCacheSize,
    };
  }

  // LRU cache management
  private setCached(entityId: string, chain: LODChain): void {
    // Evict oldest if at capacity
    if (this.cache.size >= this.options.maxCacheSize && !this.cache.has(entityId)) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) this.cache.delete(oldestKey);
    }
    this.cache.set(entityId, chain);
  }
}
