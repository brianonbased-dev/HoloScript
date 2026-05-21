/**
 * GyriSulciPartitioner — v1.0
 *
 * Classifies MNI152 coordinates as gyral (hot storage) or sulcal (cold storage)
 * and exposes cache-routing metadata for the Pillar-Slice storage layer.
 *
 * Biological grounding (Paper 33 §2.1 — Identity 1)
 * ─────────────────────────────────────────────────
 * Gyri (ridges) = highest neuron density, most frequently accessed cortical
 * surface → hot cache (in-memory LRU).
 * Sulci (valleys) = domain boundary zones in the tropical classification fan,
 * lower access frequency → cold storage (persist to disk/knowledge store).
 *
 * This is NOT arbitrary: the brain's gyral/sulcal partition resulted from
 * 500M years of selective pressure to maximise information density within
 * fixed skull volume. The partition pre-encodes which operations are
 * high-frequency — exactly the property we want for a cache hierarchy.
 *
 * Implementation strategy (v1.0 — no GLTF mesh)
 * ───────────────────────────────────────────────
 * The full implementation uses the MNI152 pial surface mesh (HCP, CC0) to
 * classify arbitrary MNI points via nearest-vertex lookup. That mesh asset
 * (packages/core/src/assets/brain-mni152-pial.gltf) is a pending TASK.
 *
 * v1.0 uses the BrainCoordMapper seed table as the reference geometry:
 *   1. Find the nearest seed entry in Euclidean (mni_x, mni_y, mni_z) space.
 *   2. Return that entry's surface_type ('gyrus' = hot, 'sulcus' = cold).
 *   3. If nearest entry distance > UNKNOWN_THRESHOLD_MM → 'unknown'.
 *
 * This is deterministic, requires no mesh, is fully testable with fixture
 * coordinates from the BrainCoordMapper table, and is the exact "simplified
 * mesh" approach authorised by the task spec (idea-run-16 BUILD-2).
 *
 * The UNKNOWN_THRESHOLD_MM (default 40mm) is chosen conservatively:
 *   - MNI grey matter spans ≈ ±90mm; 40mm is roughly half a hemisphere.
 *   - Any point more than 40mm from every seed entry is outside the expected
 *     pillar slice address range and should be treated as unknown.
 *
 * Cache routing semantics
 * ───────────────────────
 *   hot   → in-memory LRU buffer (SliceEmitter.buffer)
 *   cold  → disk/knowledge-store persistence (future: knowledge sync)
 *   unknown → hot by default (fail-safe: don't lose data)
 *
 * The partitioner does NOT hard-code the storage policy — it only returns
 * a CacheRoute descriptor. The consumer (SliceEmitter, BrainCoordMapper
 * enrichment step) decides what to do with it.
 *
 * Upgrade path to mesh-based classification
 * ──────────────────────────────────────────
 * When the GLTF asset ships, swap out resolveFromSeedTable() for
 * resolveFromMesh(meshVertices). The CacheRoute interface is unchanged.
 * Tests targeting gyral/sulcal fixture coords will continue to pass.
 *
 * References:
 *   Paper 33 §2.1  — gyri/sulci ≡ tropical classification fan
 *   Paper 33 §3    — Gyral Cache Architecture
 *   BrainCoordMapper — provides seed table with surface_type annotations
 *   idea-run-16 BUILD-2 — original spec
 *   RecursiveMAS   — arxiv:2604.25917 (biological RecursiveLink motivation)
 */

import { getAllEntries, mniDistance } from './BrainCoordMapper';
import type { BrainCoord } from './SemanticCollaborationContract';

// ─── Public types ─────────────────────────────────────────────────────────────

/**
 * Classification of an MNI coordinate with respect to the cortical surface.
 *   gyrus   → hot storage (high-density computation zone)
 *   sulcus  → cold storage (domain boundary zone)
 *   unknown → outside expected range; treated as hot (fail-safe)
 */
export type SurfaceType = 'gyrus' | 'sulcus' | 'unknown';

/**
 * Storage tier derived from surface classification.
 */
export type StorageTier = 'hot' | 'cold';

/**
 * Cache routing descriptor returned by GyriSulciPartitioner.
 * Consumers use this to decide where to store or retrieve a Pillar Slice.
 * The partitioner does NOT enforce the policy — it only describes it.
 */
export interface CacheRoute {
  /** Surface classification at the given MNI coordinate */
  surface_type: SurfaceType;
  /** Recommended storage tier (hot = in-memory, cold = persistent) */
  tier: StorageTier;
  /** Distance in mm to nearest reference coordinate (provenance) */
  nearest_distance_mm: number;
  /** Domain label of nearest reference coordinate */
  nearest_domain: string;
  /** Whether the nearest reference was beyond the unknown threshold */
  is_extrapolated: boolean;
  /**
   * Priority hint for cache eviction (0–1, higher = keep longer).
   * Gyral = 0.8 (high priority). Sulcal = 0.3. Unknown = 0.5.
   */
  priority: number;
}

// ─── Configuration ────────────────────────────────────────────────────────────

export interface GyriSulciConfig {
  /**
   * Distance threshold (mm) beyond which a coordinate is classified as 'unknown'.
   * Default: 40mm — roughly half a cortical hemisphere.
   */
  unknown_threshold_mm: number;
  /**
   * Priority assigned to gyral (hot) coordinates. Default: 0.8.
   */
  gyral_priority: number;
  /**
   * Priority assigned to sulcal (cold) coordinates. Default: 0.3.
   */
  sulcal_priority: number;
  /**
   * Priority assigned to unknown coordinates. Default: 0.5.
   */
  unknown_priority: number;
}

const DEFAULT_CONFIG: GyriSulciConfig = {
  unknown_threshold_mm: 40,
  gyral_priority:       0.8,
  sulcal_priority:      0.3,
  unknown_priority:     0.5,
};

// ─── Core classification function ─────────────────────────────────────────────

/**
 * Classify a single MNI coordinate using the BrainCoordMapper seed table
 * as the reference geometry (v1.0 — no mesh required).
 *
 * Algorithm:
 *   1. Iterate all 17 seed entries; compute Euclidean distance to coord.
 *   2. Track minimum-distance entry.
 *   3. If min distance > threshold → SurfaceType='unknown'.
 *   4. Otherwise → SurfaceType = nearest entry's surface_type (or 'unknown' if unset).
 */
export function classifyCoord(
  coord: Pick<BrainCoord, 'mni_x' | 'mni_y' | 'mni_z'>,
  config: GyriSulciConfig = DEFAULT_CONFIG,
): CacheRoute {
  const entries = getAllEntries();

  let bestDist   = Infinity;
  let bestDomain = 'unknown';
  let bestType: SurfaceType = 'unknown';

  for (const { domain, entry } of entries) {
    const dist = mniDistance(
      { mni_x: coord.mni_x, mni_y: coord.mni_y, mni_z: coord.mni_z, cortical_depth: 1 },
      entry,
    );
    if (dist < bestDist) {
      bestDist   = dist;
      bestDomain = domain;
      bestType   = (entry.surface_type as SurfaceType | undefined) ?? 'unknown';
    }
  }

  const is_extrapolated = bestDist > config.unknown_threshold_mm;
  const surface_type: SurfaceType = is_extrapolated ? 'unknown' : bestType;

  const tier: StorageTier = surface_type === 'gyrus' ? 'hot' : 'cold';

  const priority =
    surface_type === 'gyrus'  ? config.gyral_priority :
    surface_type === 'sulcus' ? config.sulcal_priority :
    config.unknown_priority;

  return {
    surface_type,
    tier,
    nearest_distance_mm: bestDist,
    nearest_domain: bestDomain,
    is_extrapolated,
    priority,
  };
}

/**
 * Classify a full BrainCoord (uses only the (x,y,z) components).
 */
export function classifyBrainCoord(
  coord: BrainCoord,
  config?: GyriSulciConfig,
): CacheRoute {
  return classifyCoord(coord, config);
}

// ─── Batch classification ─────────────────────────────────────────────────────

/**
 * Classify multiple coordinates in one call.
 * Returns a Map from a stable key (mni_x:mni_y:mni_z) to CacheRoute.
 */
export function classifyBatch(
  coords: Array<Pick<BrainCoord, 'mni_x' | 'mni_y' | 'mni_z'>>,
  config?: GyriSulciConfig,
): Map<string, CacheRoute> {
  const result = new Map<string, CacheRoute>();
  for (const c of coords) {
    const key = `${c.mni_x}:${c.mni_y}:${c.mni_z}`;
    result.set(key, classifyCoord(c, config));
  }
  return result;
}

// ─── GyriSulciPartitioner class ───────────────────────────────────────────────

/**
 * Stateful partitioner with a configurable threshold and a classification cache.
 * Use the class when you want to reuse config and memoize repeated lookups
 * (same MNI coord appears frequently in a simulation run).
 */
export class GyriSulciPartitioner {
  private readonly config: GyriSulciConfig;
  private readonly cache: Map<string, CacheRoute>;

  constructor(config: Partial<GyriSulciConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.cache  = new Map();
  }

  /**
   * Classify a coordinate. Results are memoized by (mni_x:mni_y:mni_z) key.
   */
  classify(coord: Pick<BrainCoord, 'mni_x' | 'mni_y' | 'mni_z'>): CacheRoute {
    const key = `${coord.mni_x}:${coord.mni_y}:${coord.mni_z}`;
    if (!this.cache.has(key)) {
      this.cache.set(key, classifyCoord(coord, this.config));
    }
    return this.cache.get(key)!;
  }

  /**
   * Check if a coordinate is hot (gyral) storage.
   */
  isHot(coord: Pick<BrainCoord, 'mni_x' | 'mni_y' | 'mni_z'>): boolean {
    return this.classify(coord).tier === 'hot';
  }

  /**
   * Check if a coordinate is cold (sulcal) storage.
   */
  isCold(coord: Pick<BrainCoord, 'mni_x' | 'mni_y' | 'mni_z'>): boolean {
    return this.classify(coord).tier === 'cold';
  }

  /**
   * Evict all memoized classifications (use after registerDomainCoord updates).
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Current cache size (number of memoized coordinate lookups).
   */
  get cacheSize(): number {
    return this.cache.size;
  }

  /**
   * Statistics over all cached classifications.
   */
  stats(): { hot: number; cold: number; unknown: number; total: number } {
    let hot = 0, cold = 0, unknown = 0;
    for (const route of this.cache.values()) {
      if (route.surface_type === 'gyrus')   hot++;
      else if (route.surface_type === 'sulcus') cold++;
      else unknown++;
    }
    return { hot, cold, unknown, total: this.cache.size };
  }
}

// ─── Convenience re-export ────────────────────────────────────────────────────

export { DEFAULT_CONFIG as GYRI_SULCI_DEFAULT_CONFIG };
