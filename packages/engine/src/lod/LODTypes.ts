/**
 * @holoscript/core LOD Types
 *
 * Comprehensive Level of Detail (LOD) type system for HoloScript.
 * Provides types, helpers, and configuration for LOD management.
 */

// ============================================================================
// Core Types
// ============================================================================

/** LOD selection strategy */
export type LODStrategy =
  | 'distance' // Select based on camera distance
  | 'screenSize' // Select based on screen coverage
  | 'performance' // Adaptive based on frame rate
  | 'manual' // Explicit level selection
  | 'hybrid'; // Combination of strategies

/** LOD transition mode */
export type LODTransition =
  | 'instant' // Immediate swap
  | 'crossfade' // Alpha blend between levels
  | 'dither' // Dithered transition
  | 'morph'; // Geometry morphing

/** Mesh simplification algorithm */
export type SimplificationAlgorithm =
  | 'quadricError' // Quadric Error Metrics (default)
  | 'edgeCollapse' // Edge collapse decimation
  | 'vertexClustering' // Vertex clustering
  | 'voxel'; // Voxelization-based

/** Features that can be disabled at lower LODs */
export type LODFeature =
  | 'shadows'
  | 'normals'
  | 'specular'
  | 'animation'
  | 'reflections'
  | 'particles'
  | 'physics'
  | 'skinning';

// ============================================================================
// LOD Level Configuration
// ============================================================================

/**
 * Single LOD level configuration
 */
export interface LODLevel {
  /** LOD level (0 = highest detail) */
  level: number;

  /** Distance threshold for this LOD (world units) */
  distance: number;

  /** Screen coverage threshold (0-1, where 1 = full screen) */
  screenCoverage?: number;

  /** Polygon reduction ratio (0-1, where 1 = full detail) */
  polygonRatio: number;

  /** Texture resolution multiplier (0-1) */
  textureScale: number;

  /** Asset path for pre-generated LOD mesh */
  assetPath?: string;

  /** Features disabled at this LOD */
  disabledFeatures: LODFeature[];

  /** Custom priority for this level */
  priority?: number;

  /** Triangle count at this LOD */
  triangleCount?: number;

  /** Memory footprint in bytes */
  memoryFootprint?: number;
}

/**
 * LOD group configuration for an object
 */
export interface LODConfig {
  /** Unique identifier */
  id: string;

  /** Selection strategy */
  strategy: LODStrategy;

  /** Transition mode between levels */
  transition: LODTransition;

  /** Transition duration in seconds */
  transitionDuration: number;

  /** LOD levels (sorted by detail: 0 = highest) */
  levels: LODLevel[];

  /** Hysteresis factor to prevent LOD flickering */
  hysteresis: number;

  /** Bias to prefer higher/lower LODs (-1 to 1) */
  bias: number;

  /** Enable LOD fading */
  fadeEnabled: boolean;

  /** Maximum LOD level to use (limit for performance) */
  maxLevel?: number;

  /** Force specific LOD level (for debugging) */
  forcedLevel?: number;

  /** Whether this LOD config is enabled */
  enabled: boolean;
}

// ============================================================================
// LOD Group and Hierarchy
// ============================================================================

/**
 * LOD group containing multiple objects with shared LOD
 */
export interface LODGroup {
  /** Group identifier */
  id: string;

  /** Group name */
  name: string;

  /** Object IDs in this group */
  objectIds: string[];

  /** Shared LOD configuration */
  config: LODConfig;

  /** Bounding sphere center for distance calculation */
  boundingCenter: [number, number, number];

  /** Bounding sphere radius */
  boundingRadius: number;

  /** Current active LOD level */
  currentLevel: number;

  /** Is group visible */
  visible: boolean;
}

/**
 * LOD hierarchy for hierarchical LOD (HLOD)
 */
export interface LODHierarchy {
  /** Root node ID */
  rootId: string;

  /** Child hierarchies */
  children: LODHierarchy[];

  /** Combined mesh for this hierarchy level */
  combinedMeshPath?: string;

  /** Distance threshold for using combined mesh */
  combineDistance: number;

  /** Whether to use impostor (billboard) at far distances */
  useImpostor: boolean;

  /** Impostor texture path */
  impostorPath?: string;
}

// ============================================================================
// LOD Selection State
// ============================================================================

/**
 * State of LOD selection for an object
 */
export interface LODState {
  /** Object ID */
  objectId: string;

  /** Current LOD level */
  currentLevel: number;

  /** Previous LOD level */
  previousLevel: number;

  /** Transition progress (0-1) */
  transitionProgress: number;

  /** Is transitioning between levels */
  isTransitioning: boolean;

  /** Distance to camera */
  cameraDistance: number;

  /** Screen coverage (0-1) */
  screenCoverage: number;

  /** Last update timestamp */
  lastUpdate: number;

  /** Frame time for last selection */
  selectionTime: number;
}

/**
 * LOD metrics for performance monitoring
 */
export interface LODMetrics {
  /** Total objects with LOD */
  totalObjects: number;

  /** Objects per LOD level */
  objectsPerLevel: Map<number, number>;

  /** Total triangles rendered */
  trianglesRendered: number;

  /** Triangles saved by LOD */
  trianglesSaved: number;

  /** Memory saved by LOD (bytes) */
  memorySaved: number;

  /** Average LOD level */
  averageLODLevel: number;

  /** LOD transitions this frame */
  transitionsThisFrame: number;

  /** Selection time (ms) */
  selectionTimeMs: number;
}

// ============================================================================
// LOD Generation Options
// ============================================================================

/**
 * Options for automatic LOD generation
 */
export interface LODGenerationOptions {
  /** Number of LOD levels to generate */
  levelCount: number;

  /** Target reduction per level (e.g., 0.5 = halve triangles each level) */
  reductionPerLevel: number;

  /** Simplification algorithm */
  algorithm: SimplificationAlgorithm;

  /** Preserve UV seams */
  preserveUVSeams: boolean;

  /** Preserve hard edges */
  preserveHardEdges: boolean;

  /** Preserve material boundaries */
  preserveMaterialBoundaries: boolean;

  /** Maximum error tolerance */
  maxError: number;

  /** Lock border vertices */
  lockBorders: boolean;

  /** Generate texture atlases for lower LODs */
  generateAtlases: boolean;

  /** Distance ratios for each level */
  distanceRatios?: number[];
}

/**
 * Result of LOD generation
 */
export interface LODGenerationResult {
  /** Success status */
  success: boolean;

  /** Generated levels */
  levels: GeneratedLODLevel[];

  /** Total time to generate (ms) */
  generationTimeMs: number;

  /** Warnings during generation */
  warnings: string[];

  /** Errors if failed */
  errors: string[];
}

/**
 * Single generated LOD level
 */
export interface GeneratedLODLevel {
  /** LOD level */
  level: number;

  /** Triangle count */
  triangleCount: number;

  /** Vertex count */
  vertexCount: number;

  /** Reduction ratio from original */
  reductionRatio: number;

  /** Visual error metric */
  errorMetric: number;

  /** Generated mesh data (positions) */
  positions: Float32Array;

  /** Generated mesh data (normals) */
  normals?: Float32Array;

  /** Generated mesh data (UVs) */
  uvs?: Float32Array;

  /** Generated mesh data (indices) */
  indices: Uint32Array;
}

// ============================================================================
// Default Values
// ============================================================================

/** Default LOD level configuration */
export const DEFAULT_LOD_LEVEL: LODLevel = {
  level: 0,
  distance: 0,
  screenCoverage: 1.0,
  polygonRatio: 1.0,
  textureScale: 1.0,
  disabledFeatures: [],
};

/** Default LOD configuration */
export const DEFAULT_LOD_CONFIG: LODConfig = {
  id: '',
  strategy: 'distance',
  transition: 'instant',
  transitionDuration: 0.3,
  levels: [],
  hysteresis: 0.1,
  bias: 0,
  fadeEnabled: false,
  enabled: true,
};

/** Default LOD generation options */
export const DEFAULT_GENERATION_OPTIONS: LODGenerationOptions = {
  levelCount: 3,
  reductionPerLevel: 0.5,
  algorithm: 'quadricError',
  preserveUVSeams: true,
  preserveHardEdges: true,
  preserveMaterialBoundaries: true,
  maxError: 0.01,
  lockBorders: false,
  generateAtlases: false,
};

/** Standard distance thresholds for 3 LOD levels */
export const STANDARD_DISTANCES = [0, 10, 25, 50, 100];

/** Standard polygon ratios for 3 LOD levels */
export const STANDARD_RATIOS = [1.0, 0.5, 0.25, 0.1, 0.05];

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Create a LOD level with defaults
 */
export function createLODLevel(
  level: number,
  distance: number,
  polygonRatio: number,
  options?: Partial<LODLevel>
): LODLevel {
  return {
    ...DEFAULT_LOD_LEVEL,
    level,
    distance,
    polygonRatio,
    textureScale: Math.max(0.25, polygonRatio),
    ...options,
  };
}

/**
 * Create a standard LOD configuration with N levels
 */
export function createStandardLODConfig(
  id: string,
  levelCount: number = 3,
  baseDistance: number = 10,
  options?: Partial<LODConfig>
): LODConfig {
  const levels: LODLevel[] = [];

  for (let i = 0; i < levelCount; i++) {
    const distance = i === 0 ? 0 : baseDistance * Math.pow(2, i - 1);
    const polygonRatio = 1 / Math.pow(2, i);
    const disabledFeatures: LODFeature[] = [];

    if (i >= 1) disabledFeatures.push('reflections', 'particles');
    if (i >= 2) disabledFeatures.push('specular', 'normals');
    if (i >= 3) disabledFeatures.push('shadows', 'animation');

    levels.push(createLODLevel(i, distance, polygonRatio, { disabledFeatures }));
  }

  return {
    ...DEFAULT_LOD_CONFIG,
    id,
    levels,
    ...options,
  };
}

/**
 * Create LOD group from multiple objects
 */
export function createLODGroup(
  id: string,
  name: string,
  objectIds: string[],
  config: LODConfig,
  boundingCenter: [number, number, number] = [0, 0, 0],
  boundingRadius: number = 1
): LODGroup {
  return {
    id,
    name,
    objectIds,
    config,
    boundingCenter,
    boundingRadius,
    currentLevel: 0,
    visible: true,
  };
}

/**
 * Create initial LOD state for an object
 */
export function createLODState(objectId: string): LODState {
  return {
    objectId,
    currentLevel: 0,
    previousLevel: 0,
    transitionProgress: 1,
    isTransitioning: false,
    cameraDistance: 0,
    screenCoverage: 1,
    lastUpdate: Date.now(),
    selectionTime: 0,
  };
}

/**
 * Create empty LOD metrics
 */
export function createLODMetrics(): LODMetrics {
  return {
    totalObjects: 0,
    objectsPerLevel: new Map(),
    trianglesRendered: 0,
    trianglesSaved: 0,
    memorySaved: 0,
    averageLODLevel: 0,
    transitionsThisFrame: 0,
    selectionTimeMs: 0,
  };
}

/**
 * Calculate LOD level from distance using config
 */
export function selectLODLevelByDistance(
  distance: number,
  levels: LODLevel[],
  hysteresis: number = 0.1,
  currentLevel: number = 0
): number {
  if (levels.length === 0) return 0;

  // Sort levels by distance (ascending)
  const sorted = [...levels].sort((a, b) => a.distance - b.distance);

  // Apply hysteresis to prevent flickering
  const hysteresisDistance = hysteresis * distance;

  for (let i = sorted.length - 1; i >= 0; i--) {
    const level = sorted[i];
    const threshold = level.distance;

    // Apply hysteresis based on direction of change
    const adjustedThreshold =
      i > currentLevel
        ? threshold + hysteresisDistance // Going to lower detail
        : threshold - hysteresisDistance; // Going to higher detail

    if (distance >= adjustedThreshold) {
      return level.level;
    }
  }

  return sorted[0].level;
}

/**
 * Calculate LOD level from screen coverage
 */
export function selectLODLevelByScreenCoverage(screenCoverage: number, levels: LODLevel[]): number {
  if (levels.length === 0) return 0;

  // Sort by screen coverage (descending)
  const sorted = [...levels]
    .filter((l) => l.screenCoverage !== undefined)
    .sort((a, b) => (b.screenCoverage ?? 0) - (a.screenCoverage ?? 0));

  for (const level of sorted) {
    if (screenCoverage <= (level.screenCoverage ?? 1)) {
      return level.level;
    }
  }

  return sorted[sorted.length - 1]?.level ?? 0;
}

/**
 * Calculate screen coverage from distance and object size
 */
export function calculateScreenCoverage(
  distance: number,
  objectRadius: number,
  fov: number = 60,
  _screenHeight: number = 1080
): number {
  if (distance <= 0) return 1;

  // Angular size of object
  const angularSize = 2 * Math.atan(objectRadius / distance);

  // Field of view in radians
  const fovRad = (fov * Math.PI) / 180;

  // Screen coverage
  return angularSize / fovRad;
}

/**
 * Get triangle count saved by current LOD level
 */
export function getTrianglesSaved(
  levels: LODLevel[],
  currentLevel: number,
  originalTriangles: number
): number {
  const level = levels.find((l) => l.level === currentLevel);
  if (!level) return 0;

  const baseTriangles = levels[0]?.triangleCount ?? originalTriangles;
  const currentTriangles = level.triangleCount ?? Math.floor(baseTriangles * level.polygonRatio);

  return baseTriangles - currentTriangles;
}

/**
 * Validate LOD configuration
 */
export function validateLODConfig(config: LODConfig): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!config.id) {
    errors.push('LOD config must have an id');
  }

  if (config.levels.length === 0) {
    errors.push('LOD config must have at least one level');
  }

  // Check for duplicate levels
  const levelNumbers = config.levels.map((l) => l.level);
  const uniqueLevels = new Set(levelNumbers);
  if (uniqueLevels.size !== levelNumbers.length) {
    errors.push('LOD levels must have unique level numbers');
  }

  // Check level ordering
  const sortedByLevel = [...config.levels].sort((a, b) => a.level - b.level);
  const sortedByDistance = [...config.levels].sort((a, b) => a.distance - b.distance);

  for (let i = 0; i < sortedByLevel.length; i++) {
    if (sortedByLevel[i].level !== sortedByDistance[i].level) {
      errors.push('Higher LOD levels should have greater distances');
      break;
    }
  }

  // Validate hysteresis
  if (config.hysteresis < 0 || config.hysteresis > 1) {
    errors.push('Hysteresis must be between 0 and 1');
  }

  // Validate bias
  if (config.bias < -1 || config.bias > 1) {
    errors.push('Bias must be between -1 and 1');
  }

  // Validate each level
  for (const level of config.levels) {
    if (level.polygonRatio < 0 || level.polygonRatio > 1) {
      errors.push(`Level ${level.level}: polygonRatio must be between 0 and 1`);
    }
    if (level.textureScale < 0 || level.textureScale > 1) {
      errors.push(`Level ${level.level}: textureScale must be between 0 and 1`);
    }
    if (level.distance < 0) {
      errors.push(`Level ${level.level}: distance must be non-negative`);
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Merge two LOD configurations
 */
export function mergeLODConfigs(base: LODConfig, override: Partial<LODConfig>): LODConfig {
  return {
    ...base,
    ...override,
    levels: override.levels ?? base.levels,
  };
}

/**
 * Get recommended LOD count based on object size and complexity
 */
export function getRecommendedLODCount(triangleCount: number, _boundingRadius: number): number {
  // Small objects need fewer LODs
  if (triangleCount < 1000) return 2;
  if (triangleCount < 10000) return 3;
  if (triangleCount < 100000) return 4;
  return 5;
}

/**
 * Calculate optimal distance thresholds for LOD levels
 */
export function calculateOptimalDistances(
  boundingRadius: number,
  levelCount: number,
  maxViewDistance: number = 1000
): number[] {
  const distances: number[] = [0];

  // Use logarithmic distribution for distances
  for (let i = 1; i < levelCount; i++) {
    const t = i / (levelCount - 1);
    const distance = boundingRadius * Math.pow(maxViewDistance / boundingRadius, t);
    distances.push(Math.round(distance));
  }

  return distances;
}
