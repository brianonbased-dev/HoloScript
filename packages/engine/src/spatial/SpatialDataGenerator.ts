/**
 * Spatial Training Data Generator
 *
 * Transforms HoloScript compositions with spatial constraints into labeled
 * spatial relationship datasets for fine-tuning Vision-Language Models (VLMs)
 * on spatial reasoning tasks.
 *
 * Generates ground truth for three core spatial relationship families:
 *   - **adjacent**: Two entities are within a distance threshold
 *   - **contains**: One entity's bounding volume encloses another
 *   - **reachable**: An unobstructed path exists between entities
 *
 * Zone-level relationships (P.PROCGEN.01):
 *   - **zone_adjacent**: Two zones share a boundary
 *   - **zone_contains**: A zone contains a set of objects
 *   - **biome_transition**: Two zones have a biome transition boundary
 *
 * P.PROCGEN.03: Self-bootstrapping LLM training pipeline.
 *   Flow: SpatialDataGenerator → JSONL → fine-tune VLM → SemanticExpander.
 *
 * @module spatial/SpatialDataGenerator
 * @version 2.0.0
 */

import type { Vector3, Quaternion, BoundingBox, BoundingSphere } from './SpatialTypes';

import {
  distance,
  isPointInBox,
  _isPointInSphere,
  normalize,
  subtract,
  _boxesOverlap,
  _getBoxCenter,
} from './SpatialTypes';

// =============================================================================
// TYPES - Composition Input
// =============================================================================

/**
 * A spatial object extracted from a HoloScript composition.
 * This is the input format - each object in a composition maps to one of these.
 */
export interface SpatialObject {
  /** Unique identifier within the composition */
  id: string;

  /** Object name as declared in HoloScript (e.g., "Table", "Chair1") */
  name: string;

  /** Entity type / geometry type (e.g., "cube", "sphere", "plane") */
  type: string;

  /** World-space position [x, y, z] */
  position: Vector3;

  /** Rotation as quaternion (identity if not specified) */
  rotation?: Quaternion;

  /** Scale factors [sx, sy, sz] */
  scale?: Vector3;

  /** Axis-aligned bounding box in world space */
  bounds?: BoundingBox;

  /** Bounding sphere in world space */
  boundingSphere?: BoundingSphere;

  /** Parent object ID (for hierarchy / group containment) */
  parentId?: string;

  /** HoloScript traits applied to this object (e.g., ["physics", "grabbable"]) */
  traits?: string[];

  /** Whether this object is a static collider / obstacle */
  isStatic?: boolean;

  /** Arbitrary metadata from the composition */
  metadata?: Record<string, unknown>;
}

/**
 * A HoloScript composition parsed into spatial objects with optional constraints.
 */
export interface SpatialComposition {
  /** Composition name */
  name: string;

  /** All spatial objects in the composition */
  objects: SpatialObject[];

  /** Environment metadata (skybox, gravity, etc.) */
  environment?: Record<string, unknown>;

  /** Source HoloScript code (optional, for provenance) */
  sourceCode?: string;
}

// =============================================================================
// TYPES - Spatial Relationship Labels
// =============================================================================

/**
 * The spatial relationship types this generator labels.
 * P.PROCGEN.01: Expanded with zone-level relationship types.
 */
export type SpatialRelationshipType =
  | 'adjacent'
  | 'contains'
  | 'reachable'
  | 'zone_adjacent'
  | 'zone_contains'
  | 'biome_transition';

/**
 * P.PROCGEN.01: Zone metadata for zone-level spatial relationships.
 */
export interface ZoneMetadata {
  /** Zone identifier */
  zoneId: string;
  /** Zone biome type (e.g., 'forest', 'desert', 'urban') */
  biome: string;
  /** Zone bounding box in world space */
  bounds: BoundingBox;
  /** Objects contained in this zone */
  objectIds: string[];
  /** Adjacent zone IDs */
  adjacentZones: string[];
  /** Level/floor number (for multi-level worlds) */
  level?: number;
}

/**
 * Directional qualifier for spatial relationships.
 */
export type DirectionLabel =
  | 'above'
  | 'below'
  | 'left_of'
  | 'right_of'
  | 'in_front_of'
  | 'behind'
  | 'near'
  | 'far'
  | 'inside'
  | 'outside'
  | 'overlapping';

/**
 * A single labeled spatial relationship between two objects.
 */
export interface SpatialRelationship {
  /** Relationship type */
  type: SpatialRelationshipType;

  /** Source entity ID */
  sourceId: string;

  /** Source entity name */
  sourceName: string;

  /** Target entity ID */
  targetId: string;

  /** Target entity name */
  targetName: string;

  /** Whether the relationship holds (true) or does not hold (false) */
  holds: boolean;

  /** Euclidean distance between entity centers (meters) */
  distance: number;

  /** Directional qualifiers */
  directions: DirectionLabel[];

  /** Relationship-specific parameters */
  parameters: SpatialRelationshipParameters;
}

/**
 * Parameters specific to each relationship type.
 */
export interface SpatialRelationshipParameters {
  // Adjacent parameters
  /** Distance threshold used for adjacency check */
  adjacencyThreshold?: number;
  /** Axis used for distance measurement */
  axis?: string;

  // Contains parameters
  /** Whether containment is strict (full bounds) or center-only */
  strict?: boolean;
  /** Containment margin */
  margin?: number;
  /** Percentage of target volume inside container (0-1) */
  overlapRatio?: number;

  // Reachable parameters
  /** Whether line of sight is clear */
  lineOfSightClear?: boolean;
  /** Straight-line distance */
  straightLineDistance?: number;
  /** IDs of blocking obstacles */
  blockingObstacles?: string[];
  /** Estimated path length (may be greater than straight line) */
  estimatedPathLength?: number;
}

// =============================================================================
// TYPES - Training Data Output
// =============================================================================

/**
 * A single training sample in the output JSONL.
 * Designed for VLM fine-tuning on spatial reasoning.
 */
export interface SpatialTrainingSample {
  /** Unique sample identifier */
  id: string;

  /** Composition this sample was generated from */
  compositionName: string;

  /** The spatial relationship being labeled */
  relationship: SpatialRelationship;

  /** Ground truth positions of both entities */
  groundTruth: {
    source: {
      position: Vector3;
      rotation?: Quaternion;
      scale?: Vector3;
      bounds?: BoundingBox;
    };
    target: {
      position: Vector3;
      rotation?: Quaternion;
      scale?: Vector3;
      bounds?: BoundingBox;
    };
  };

  /** Scene context: all objects and their positions */
  sceneContext: {
    objectCount: number;
    objects: Array<{
      id: string;
      name: string;
      type: string;
      position: Vector3;
    }>;
  };

  /** Natural language description of the relationship */
  description: string;

  /** Question-answer pair for VLM training */
  qa: {
    question: string;
    answer: string;
  };

  /** Tags for filtering and stratification */
  tags: string[];

  /** Difficulty level based on spatial complexity */
  difficulty: 'easy' | 'medium' | 'hard';

  /** Generation metadata */
  metadata: {
    generatorVersion: string;
    timestamp: string;
    compositionHash: string;
  };
}

// =============================================================================
// TYPES - Generator Configuration
// =============================================================================

/**
 * Configuration for the SpatialDataGenerator.
 */
export interface SpatialDataGeneratorConfig {
  /**
   * Distance thresholds for adjacency checks.
   * Objects within this distance are considered adjacent.
   * Multiple thresholds generate multiple samples at different granularities.
   */
  adjacencyThresholds: number[];

  /**
   * Whether to generate negative samples (relationship does NOT hold).
   * Essential for training classifiers.
   */
  generateNegatives: boolean;

  /**
   * Ratio of negative to positive samples (e.g., 1.0 = equal, 2.0 = 2x negatives).
   */
  negativeRatio: number;

  /**
   * Containment margin for "contains" checks (meters).
   */
  containmentMargin: number;

  /**
   * Whether to use strict containment (full bounds) or center-only.
   */
  strictContainment: boolean;

  /**
   * Maximum straight-line distance for reachability (meters).
   * Pairs beyond this are not checked for reachability.
   */
  maxReachabilityDistance: number;

  /**
   * Entity types to treat as obstacles for reachability checks.
   */
  obstacleTypes: string[];

  /**
   * Whether to include the full scene context in each sample.
   */
  includeSceneContext: boolean;

  /**
   * Whether to generate QA pairs for VLM instruction tuning.
   */
  generateQA: boolean;

  /**
   * Random seed for reproducible negative sampling.
   */
  seed: number;

  /**
   * Maximum number of samples per composition (0 = unlimited).
   */
  maxSamplesPerComposition: number;
}

/**
 * Default configuration.
 */
export const DEFAULT_SPATIAL_DATA_CONFIG: SpatialDataGeneratorConfig = {
  adjacencyThresholds: [1.0, 2.0, 5.0],
  generateNegatives: true,
  negativeRatio: 1.0,
  containmentMargin: 0.0,
  strictContainment: false,
  maxReachabilityDistance: 50.0,
  obstacleTypes: ['wall', 'barrier', 'obstacle', 'static'],
  includeSceneContext: true,
  generateQA: true,
  seed: 42,
  maxSamplesPerComposition: 0,
};

// =============================================================================
// TYPES - Generation Statistics
// =============================================================================

/**
 * Statistics from a generation run.
 */
export interface GenerationStats {
  totalSamples: number;
  adjacentPositive: number;
  adjacentNegative: number;
  containsPositive: number;
  containsNegative: number;
  reachablePositive: number;
  reachableNegative: number;
  compositionsProcessed: number;
  objectsProcessed: number;
  pairsEvaluated: number;
  generationTimeMs: number;
}

// =============================================================================
// SPATIAL DATA GENERATOR
// =============================================================================

/**
 * Generates labeled spatial relationship datasets from HoloScript compositions.
 *
 * @example
 * ```typescript
 * const generator = new SpatialDataGenerator();
 *
 * const composition: SpatialComposition = {
 *   name: "Meeting Room",
 *   objects: [
 *     { id: "table", name: "Table", type: "cube", position: [0, 0.75, 0],
 *       bounds: { min: { x: -1.5, y: 0.7, z: -0.75 }, max: { x: 1.5, y: 0.8, z: 0.75 } } },
 *     { id: "chair1", name: "Chair1", type: "cube", position: [-1, 0.5, 1.2] },
 *     { id: "chair2", name: "Chair2", type: "cube", position: [1, 0.5, 1.2] },
 *   ]
 * };
 *
 * const samples = generator.generate(composition);
 * const jsonl = generator.toJSONL(samples);
 * ```
 */
export class SpatialDataGenerator {
  private config: SpatialDataGeneratorConfig;
  private sampleCounter: number = 0;
  private rng: SeededRNG;

  constructor(config: Partial<SpatialDataGeneratorConfig> = {}) {
    this.config = { ...DEFAULT_SPATIAL_DATA_CONFIG, ...config };
    this.rng = new SeededRNG(this.config.seed);
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Generate spatial training samples from a single composition.
   */
  generate(composition: SpatialComposition): SpatialTrainingSample[] {
    const samples: SpatialTrainingSample[] = [];
    const objects = composition.objects;

    if (objects.length < 2) return samples;

    // Auto-compute bounds for objects that don't have them
    const enrichedObjects = objects.map((obj) => this.enrichObject(obj));

    // Generate all pairwise relationships
    for (let i = 0; i < enrichedObjects.length; i++) {
      for (let j = i + 1; j < enrichedObjects.length; j++) {
        const objA = enrichedObjects[i];
        const objB = enrichedObjects[j];

        // Adjacent relationships
        const adjacentSamples = this.generateAdjacentSamples(
          composition,
          objA,
          objB,
          enrichedObjects
        );
        samples.push(...adjacentSamples);

        // Contains relationships (both directions)
        const containsSamples = this.generateContainsSamples(
          composition,
          objA,
          objB,
          enrichedObjects
        );
        samples.push(...containsSamples);

        // Reachable relationships
        const reachableSamples = this.generateReachableSamples(
          composition,
          objA,
          objB,
          enrichedObjects
        );
        samples.push(...reachableSamples);
      }
    }

    // Apply max samples limit
    if (
      this.config.maxSamplesPerComposition > 0 &&
      samples.length > this.config.maxSamplesPerComposition
    ) {
      return this.shuffleArray(samples).slice(0, this.config.maxSamplesPerComposition);
    }

    return samples;
  }

  /**
   * Generate samples from multiple compositions.
   */
  generateBatch(compositions: SpatialComposition[]): {
    samples: SpatialTrainingSample[];
    stats: GenerationStats;
  } {
    const startTime = Date.now();
    const allSamples: SpatialTrainingSample[] = [];
    let objectsProcessed = 0;
    let pairsEvaluated = 0;

    for (const composition of compositions) {
      const samples = this.generate(composition);
      allSamples.push(...samples);
      objectsProcessed += composition.objects.length;
      const n = composition.objects.length;
      pairsEvaluated += (n * (n - 1)) / 2;
    }

    const stats = this.computeStats(
      allSamples,
      compositions.length,
      objectsProcessed,
      pairsEvaluated,
      startTime
    );

    return { samples: allSamples, stats };
  }

  /**
   * Convert samples to JSONL format (one JSON object per line).
   */
  toJSONL(samples: SpatialTrainingSample[]): string {
    return samples.map((s) => JSON.stringify(s)).join('\n');
  }

  /**
   * Convert samples to instruction-tuning format (conversation-style JSONL).
   * Compatible with OpenAI fine-tuning, Axolotl, and similar frameworks.
   */
  toInstructionJSONL(samples: SpatialTrainingSample[]): string {
    return samples
      .map((sample) => {
        const systemMessage =
          'You are a spatial reasoning assistant. Given a description of a 3D scene, ' +
          'answer questions about spatial relationships between objects.';

        const userMessage = this.buildSceneDescription(sample) + '\n\n' + sample.qa.question;

        return JSON.stringify({
          messages: [
            { role: 'system', content: systemMessage },
            { role: 'user', content: userMessage },
            { role: 'assistant', content: sample.qa.answer },
          ],
        });
      })
      .join('\n');
  }

  /**
   * Get current configuration.
   */
  getConfig(): Readonly<SpatialDataGeneratorConfig> {
    return { ...this.config };
  }

  /**
   * Update configuration.
   */
  updateConfig(partial: Partial<SpatialDataGeneratorConfig>): void {
    this.config = { ...this.config, ...partial };
    if (partial.seed !== undefined) {
      this.rng = new SeededRNG(partial.seed);
    }
  }

  // ---------------------------------------------------------------------------
  // Adjacent Relationship Generation
  // ---------------------------------------------------------------------------

  private generateAdjacentSamples(
    composition: SpatialComposition,
    objA: SpatialObject,
    objB: SpatialObject,
    allObjects: SpatialObject[]
  ): SpatialTrainingSample[] {
    const samples: SpatialTrainingSample[] = [];
    const dist = distance(objA.position, objB.position);
    const directions = this.computeDirections(objA.position, objB.position);

    for (const threshold of this.config.adjacencyThresholds) {
      const holds = dist <= threshold;

      // Generate positive sample
      if (holds) {
        samples.push(
          this.buildSample(composition, objA, objB, allObjects, {
            type: 'adjacent',
            sourceId: objA.id,
            sourceName: objA.name,
            targetId: objB.id,
            targetName: objB.name,
            holds: true,
            distance: dist,
            directions,
            parameters: {
              adjacencyThreshold: threshold,
              axis: 'xyz',
            },
          })
        );
      }

      // Generate negative sample
      if (!holds && this.config.generateNegatives) {
        samples.push(
          this.buildSample(composition, objA, objB, allObjects, {
            type: 'adjacent',
            sourceId: objA.id,
            sourceName: objA.name,
            targetId: objB.id,
            targetName: objB.name,
            holds: false,
            distance: dist,
            directions,
            parameters: {
              adjacencyThreshold: threshold,
              axis: 'xyz',
            },
          })
        );
      }
    }

    return samples;
  }

  // ---------------------------------------------------------------------------
  // Contains Relationship Generation
  // ---------------------------------------------------------------------------

  private generateContainsSamples(
    composition: SpatialComposition,
    objA: SpatialObject,
    objB: SpatialObject,
    allObjects: SpatialObject[]
  ): SpatialTrainingSample[] {
    const samples: SpatialTrainingSample[] = [];
    const dist = distance(objA.position, objB.position);
    const directionsAB = this.computeDirections(objA.position, objB.position);
    const directionsBA = this.computeDirections(objB.position, objA.position);

    // Check A contains B
    const aContainsB = this.checkContainment(objA, objB);
    if (aContainsB.holds) {
      samples.push(
        this.buildSample(composition, objA, objB, allObjects, {
          type: 'contains',
          sourceId: objA.id,
          sourceName: objA.name,
          targetId: objB.id,
          targetName: objB.name,
          holds: true,
          distance: dist,
          directions: ['inside'],
          parameters: {
            strict: this.config.strictContainment,
            margin: this.config.containmentMargin,
            overlapRatio: aContainsB.overlapRatio,
          },
        })
      );
    } else if (this.config.generateNegatives && aContainsB.overlapRatio !== undefined) {
      samples.push(
        this.buildSample(composition, objA, objB, allObjects, {
          type: 'contains',
          sourceId: objA.id,
          sourceName: objA.name,
          targetId: objB.id,
          targetName: objB.name,
          holds: false,
          distance: dist,
          directions: directionsAB,
          parameters: {
            strict: this.config.strictContainment,
            margin: this.config.containmentMargin,
            overlapRatio: aContainsB.overlapRatio,
          },
        })
      );
    }

    // Check B contains A
    const bContainsA = this.checkContainment(objB, objA);
    if (bContainsA.holds) {
      samples.push(
        this.buildSample(composition, objB, objA, allObjects, {
          type: 'contains',
          sourceId: objB.id,
          sourceName: objB.name,
          targetId: objA.id,
          targetName: objA.name,
          holds: true,
          distance: dist,
          directions: ['inside'],
          parameters: {
            strict: this.config.strictContainment,
            margin: this.config.containmentMargin,
            overlapRatio: bContainsA.overlapRatio,
          },
        })
      );
    } else if (this.config.generateNegatives && bContainsA.overlapRatio !== undefined) {
      samples.push(
        this.buildSample(composition, objB, objA, allObjects, {
          type: 'contains',
          sourceId: objB.id,
          sourceName: objB.name,
          targetId: objA.id,
          targetName: objA.name,
          holds: false,
          distance: dist,
          directions: directionsBA,
          parameters: {
            strict: this.config.strictContainment,
            margin: this.config.containmentMargin,
            overlapRatio: bContainsA.overlapRatio,
          },
        })
      );
    }

    return samples;
  }

  // ---------------------------------------------------------------------------
  // Reachable Relationship Generation
  // ---------------------------------------------------------------------------

  private generateReachableSamples(
    composition: SpatialComposition,
    objA: SpatialObject,
    objB: SpatialObject,
    allObjects: SpatialObject[]
  ): SpatialTrainingSample[] {
    const samples: SpatialTrainingSample[] = [];
    const dist = distance(objA.position, objB.position);

    // Skip pairs beyond max reachability distance
    if (dist > this.config.maxReachabilityDistance) return samples;

    const directions = this.computeDirections(objA.position, objB.position);
    const reachability = this.checkReachability(objA, objB, allObjects);

    samples.push(
      this.buildSample(composition, objA, objB, allObjects, {
        type: 'reachable',
        sourceId: objA.id,
        sourceName: objA.name,
        targetId: objB.id,
        targetName: objB.name,
        holds: reachability.reachable,
        distance: dist,
        directions,
        parameters: {
          lineOfSightClear: reachability.lineOfSightClear,
          straightLineDistance: dist,
          blockingObstacles: reachability.blockingObstacles,
          estimatedPathLength: reachability.estimatedPathLength,
        },
      })
    );

    return samples;
  }

  // ---------------------------------------------------------------------------
  // Spatial Computation Helpers
  // ---------------------------------------------------------------------------

  /**
   * Enrich an object with auto-computed bounds if missing.
   */
  private enrichObject(obj: SpatialObject): SpatialObject {
    if (obj.bounds) return obj;

    // Estimate bounds from type and scale
    const sx = obj.scale?.x ?? 1;
    const sy = obj.scale?.y ?? 1;
    const sz = obj.scale?.z ?? 1;
    const halfX = sx / 2;
    const halfY = sy / 2;
    const halfZ = sz / 2;

    let bounds: BoundingBox;

    switch (obj.type) {
      case 'sphere': {
        const r = Math.max(halfX, halfY, halfZ);
        bounds = {
          min: { x: obj.position.x - r, y: obj.position.y - r, z: obj.position.z - r },
          max: { x: obj.position.x + r, y: obj.position.y + r, z: obj.position.z + r },
        };
        break;
      }
      case 'plane': {
        // Planes are thin
        bounds = {
          min: { x: obj.position.x - halfX, y: obj.position.y - 0.01, z: obj.position.z - halfZ },
          max: { x: obj.position.x + halfX, y: obj.position.y + 0.01, z: obj.position.z + halfZ },
        };
        break;
      }
      case 'cylinder': {
        bounds = {
          min: { x: obj.position.x - halfX, y: obj.position.y - halfY, z: obj.position.z - halfX },
          max: { x: obj.position.x + halfX, y: obj.position.y + halfY, z: obj.position.z + halfX },
        };
        break;
      }
      default: {
        // Default: cube-like bounds
        bounds = {
          min: { x: obj.position.x - halfX, y: obj.position.y - halfY, z: obj.position.z - halfZ },
          max: { x: obj.position.x + halfX, y: obj.position.y + halfY, z: obj.position.z + halfZ },
        };
        break;
      }
    }

    return { ...obj, bounds };
  }

  /**
   * Check if container contains the target object.
   */
  private checkContainment(
    container: SpatialObject,
    target: SpatialObject
  ): { holds: boolean; overlapRatio?: number } {
    if (!container.bounds) return { holds: false };

    const margin = this.config.containmentMargin;
    const containerBox: BoundingBox = {
      min: {
        x: container.bounds.min.x + margin,
        y: container.bounds.min.y + margin,
        z: container.bounds.min.z + margin,
      },
      max: {
        x: container.bounds.max.x - margin,
        y: container.bounds.max.y - margin,
        z: container.bounds.max.z - margin,
      },
    };

    if (this.config.strictContainment && target.bounds) {
      // Strict: full target bounds must be inside container
      const fullyInside =
        target.bounds.min.x >= containerBox.min.x &&
        target.bounds.min.y >= containerBox.min.y &&
        target.bounds.min.z >= containerBox.min.z &&
        target.bounds.max.x <= containerBox.max.x &&
        target.bounds.max.y <= containerBox.max.y &&
        target.bounds.max.z <= containerBox.max.z;

      const overlapRatio = this.computeOverlapRatio(containerBox, target.bounds);
      return { holds: fullyInside, overlapRatio };
    } else {
      // Non-strict: center point containment
      const centerInside = isPointInBox(target.position, containerBox);

      // Compute overlap ratio if both have bounds
      let overlapRatio: number | undefined;
      if (target.bounds) {
        overlapRatio = this.computeOverlapRatio(containerBox, target.bounds);
      }

      return { holds: centerInside, overlapRatio };
    }
  }

  /**
   * Compute the ratio of target volume that overlaps with the container.
   */
  private computeOverlapRatio(container: BoundingBox, target: BoundingBox): number {
    const overlapMinX = Math.max(container.min.x, target.min.x);
    const overlapMinY = Math.max(container.min.y, target.min.y);
    const overlapMinZ = Math.max(container.min.z, target.min.z);
    const overlapMaxX = Math.min(container.max.x, target.max.x);
    const overlapMaxY = Math.min(container.max.y, target.max.y);
    const overlapMaxZ = Math.min(container.max.z, target.max.z);

    if (overlapMinX >= overlapMaxX || overlapMinY >= overlapMaxY || overlapMinZ >= overlapMaxZ) {
      return 0;
    }

    const overlapVolume =
      (overlapMaxX - overlapMinX) * (overlapMaxY - overlapMinY) * (overlapMaxZ - overlapMinZ);

    const targetVolume =
      (target.max.x - target.min.x) * (target.max.y - target.min.y) * (target.max.z - target.min.z);

    if (targetVolume === 0) return 0;

    return Math.min(1, overlapVolume / targetVolume);
  }

  /**
   * Check line-of-sight reachability between two objects.
   */
  private checkReachability(
    source: SpatialObject,
    target: SpatialObject,
    allObjects: SpatialObject[]
  ): {
    reachable: boolean;
    lineOfSightClear: boolean;
    blockingObstacles: string[];
    estimatedPathLength: number;
  } {
    const from = source.position;
    const to = target.position;
    const dir = subtract(to, from);
    const len = Math.sqrt(dir.x * dir.x + dir.y * dir.y + dir.z * dir.z);

    if (len === 0) {
      return {
        reachable: true,
        lineOfSightClear: true,
        blockingObstacles: [],
        estimatedPathLength: 0,
      };
    }

    const normalizedDir = normalize(dir);
    const blockingObstacles: string[] = [];

    // Check each potential obstacle
    for (const obj of allObjects) {
      if (obj.id === source.id || obj.id === target.id) continue;

      // Only check objects that are obstacles
      const isObstacle =
        obj.isStatic ||
        (obj.traits && obj.traits.some((t) => this.config.obstacleTypes.includes(t))) ||
        this.config.obstacleTypes.includes(obj.type);

      if (!isObstacle) continue;
      if (!obj.bounds) continue;

      // Ray-AABB intersection
      if (this.rayIntersectsAABB(from, normalizedDir, obj.bounds, len)) {
        blockingObstacles.push(obj.id);
      }
    }

    const lineOfSightClear = blockingObstacles.length === 0;

    return {
      reachable: lineOfSightClear,
      lineOfSightClear,
      blockingObstacles,
      estimatedPathLength: lineOfSightClear ? len : len * 1.5, // rough estimate if blocked
    };
  }

  /**
   * Ray-AABB intersection test.
   */
  private rayIntersectsAABB(
    origin: Vector3,
    direction: Vector3,
    box: BoundingBox,
    maxDist: number
  ): boolean {
    let tmin = -Infinity;
    let tmax = Infinity;

    const axes: Array<'x' | 'y' | 'z'> = ['x', 'y', 'z'];
    for (const axis of axes) {
      const d = direction[axis];
      const o = origin[axis];
      const bmin = box.min[axis];
      const bmax = box.max[axis];

      if (Math.abs(d) < 1e-10) {
        if (o < bmin || o > bmax) return false;
      } else {
        let t1 = (bmin - o) / d;
        let t2 = (bmax - o) / d;
        if (t1 > t2) {
          const tmp = t1;
          t1 = t2;
          t2 = tmp;
        }
        tmin = Math.max(tmin, t1);
        tmax = Math.min(tmax, t2);
        if (tmin > tmax) return false;
      }
    }

    return tmin >= 0 && tmin <= maxDist;
  }

  /**
   * Compute directional labels between two positions.
   */
  private computeDirections(from: Vector3, to: Vector3): DirectionLabel[] {
    const directions: DirectionLabel[] = [];
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const dz = to.z - from.z;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

    if (dist < 0.01) return ['overlapping'];

    // Vertical
    if (dy > 0.3) directions.push('above');
    if (dy < -0.3) directions.push('below');

    // Horizontal (using right-hand coordinate system: +X = right, +Z = forward)
    if (dx > 0.3) directions.push('right_of');
    if (dx < -0.3) directions.push('left_of');
    if (dz > 0.3) directions.push('behind');
    if (dz < -0.3) directions.push('in_front_of');

    // Distance qualifiers
    if (dist <= 2.0) directions.push('near');
    if (dist > 10.0) directions.push('far');

    if (directions.length === 0) directions.push('near');

    return directions;
  }

  // ---------------------------------------------------------------------------
  // Sample Building
  // ---------------------------------------------------------------------------

  /**
   * Build a complete training sample from a relationship.
   */
  private buildSample(
    composition: SpatialComposition,
    objA: SpatialObject,
    objB: SpatialObject,
    allObjects: SpatialObject[],
    relationship: SpatialRelationship
  ): SpatialTrainingSample {
    this.sampleCounter++;
    const sampleId = `spatial-${this.sampleCounter.toString().padStart(6, '0')}`;

    const description = this.generateDescription(relationship);
    const qa = this.config.generateQA
      ? this.generateQA(relationship, allObjects)
      : { question: '', answer: '' };

    const tags = this.generateTags(relationship, objA, objB);
    const difficulty = this.computeDifficulty(relationship, allObjects);

    const sample: SpatialTrainingSample = {
      id: sampleId,
      compositionName: composition.name,
      relationship,
      groundTruth: {
        source: {
          position: objA.position,
          rotation: objA.rotation,
          scale: objA.scale,
          bounds: objA.bounds,
        },
        target: {
          position: objB.position,
          rotation: objB.rotation,
          scale: objB.scale,
          bounds: objB.bounds,
        },
      },
      sceneContext: this.config.includeSceneContext
        ? {
            objectCount: allObjects.length,
            objects: allObjects.map((o) => ({
              id: o.id,
              name: o.name,
              type: o.type,
              position: o.position,
            })),
          }
        : { objectCount: allObjects.length, objects: [] },
      description,
      qa,
      tags,
      difficulty,
      metadata: {
        generatorVersion: '1.0.0',
        timestamp: new Date().toISOString(),
        compositionHash: this.hashComposition(composition),
      },
    };

    return sample;
  }

  // ---------------------------------------------------------------------------
  // Natural Language Generation
  // ---------------------------------------------------------------------------

  /**
   * Generate a natural language description of a spatial relationship.
   */
  private generateDescription(rel: SpatialRelationship): string {
    const src = rel.sourceName;
    const tgt = rel.targetName;
    const dist = rel.distance.toFixed(2);

    switch (rel.type) {
      case 'adjacent': {
        const threshold = rel.parameters.adjacencyThreshold?.toFixed(1) ?? '?';
        if (rel.holds) {
          return (
            `"${src}" is adjacent to "${tgt}" (${dist}m apart, within ${threshold}m threshold). ` +
            `Relative direction: ${rel.directions.join(', ')}.`
          );
        }
        return (
          `"${src}" is NOT adjacent to "${tgt}" (${dist}m apart, exceeds ${threshold}m threshold). ` +
          `Relative direction: ${rel.directions.join(', ')}.`
        );
      }

      case 'contains': {
        if (rel.holds) {
          const overlap =
            rel.parameters.overlapRatio !== undefined
              ? ` (${(rel.parameters.overlapRatio * 100).toFixed(0)}% overlap)`
              : '';
          return (
            `"${src}" contains "${tgt}"${overlap}. ` +
            `The contained object is ${dist}m from the container center.`
          );
        }
        const overlap =
          rel.parameters.overlapRatio !== undefined
            ? ` (only ${(rel.parameters.overlapRatio * 100).toFixed(0)}% overlap)`
            : '';
        return (
          `"${src}" does NOT contain "${tgt}"${overlap}. ` +
          `"${tgt}" is ${dist}m from "${src}" center, direction: ${rel.directions.join(', ')}.`
        );
      }

      case 'reachable': {
        if (rel.holds) {
          return (
            `"${tgt}" is reachable from "${src}" with clear line of sight ` +
            `(straight-line distance: ${dist}m). Direction: ${rel.directions.join(', ')}.`
          );
        }
        const blockers = rel.parameters.blockingObstacles?.join(', ') ?? 'unknown obstacles';
        return (
          `"${tgt}" is NOT directly reachable from "${src}" ` +
          `(blocked by: ${blockers}, distance: ${dist}m). ` +
          `Direction: ${rel.directions.join(', ')}.`
        );
      }
    }
    return `"${src}" and "${tgt}" have a relationship of type ${rel.type}.`;
  }

  /**
   * Generate a question-answer pair for VLM instruction tuning.
   */
  private generateQA(
    rel: SpatialRelationship,
    allObjects: SpatialObject[]
  ): { question: string; answer: string } {
    const src = rel.sourceName;
    const tgt = rel.targetName;

    switch (rel.type) {
      case 'adjacent': {
        const threshold = rel.parameters.adjacencyThreshold?.toFixed(1) ?? '2.0';
        const questions = [
          `Is "${src}" adjacent to "${tgt}" (within ${threshold} meters)?`,
          `Are "${src}" and "${tgt}" close to each other (within ${threshold}m)?`,
          `How far apart are "${src}" and "${tgt}", and are they within ${threshold} meters of each other?`,
        ];
        const question = questions[Math.abs(this.rng.nextInt()) % questions.length];

        const answer = rel.holds
          ? `Yes, "${src}" is adjacent to "${tgt}". They are ${rel.distance.toFixed(2)} meters apart, ` +
            `which is within the ${threshold}m threshold. "${tgt}" is ${rel.directions.join(' and ')} "${src}".`
          : `No, "${src}" is not adjacent to "${tgt}". They are ${rel.distance.toFixed(2)} meters apart, ` +
            `which exceeds the ${threshold}m threshold. "${tgt}" is ${rel.directions.join(' and ')} "${src}".`;

        return { question, answer };
      }

      case 'contains': {
        const questions = [
          `Does "${src}" contain "${tgt}"?`,
          `Is "${tgt}" inside "${src}"?`,
          `Is "${tgt}" enclosed within the bounds of "${src}"?`,
        ];
        const question = questions[Math.abs(this.rng.nextInt()) % questions.length];

        const targetObj = allObjects.find((o) => o.id === rel.targetId);
        const posStr = targetObj ? this.formatVec3(targetObj.position) : 'unknown';

        const answer = rel.holds
          ? `Yes, "${src}" contains "${tgt}". "${tgt}" is located at ` +
            `[${posStr}] ` +
            `which falls within the bounding volume of "${src}".` +
            (rel.parameters.overlapRatio !== undefined
              ? ` The overlap ratio is ${(rel.parameters.overlapRatio * 100).toFixed(0)}%.`
              : '')
          : `No, "${src}" does not contain "${tgt}". "${tgt}" is ${rel.distance.toFixed(2)} meters ` +
            `from "${src}" center, positioned ${rel.directions.join(' and ')} it.` +
            (rel.parameters.overlapRatio !== undefined
              ? ` Only ${(rel.parameters.overlapRatio * 100).toFixed(0)}% of "${tgt}" overlaps with "${src}".`
              : '');

        return { question, answer: answer.replace(/\[unknown\]/, '') };
      }

      case 'reachable': {
        const questions = [
          `Can you reach "${tgt}" from "${src}" in a straight line?`,
          `Is there a clear path from "${src}" to "${tgt}"?`,
          `Is "${tgt}" reachable from "${src}" without obstacles?`,
        ];
        const question = questions[Math.abs(this.rng.nextInt()) % questions.length];

        const answer = rel.holds
          ? `Yes, "${tgt}" is reachable from "${src}" with a clear line of sight. ` +
            `The straight-line distance is ${rel.distance.toFixed(2)} meters. ` +
            `"${tgt}" is ${rel.directions.join(' and ')} "${src}".`
          : `No, "${tgt}" is not directly reachable from "${src}". ` +
            `The path is blocked by: ${rel.parameters.blockingObstacles?.join(', ') ?? 'obstacles'}. ` +
            `The straight-line distance is ${rel.distance.toFixed(2)} meters, but a detour would be required.`;

        return { question, answer };
      }
    }
    return {
      question: `What is the relation between ${src} and ${tgt}?`,
      answer: `They have a ${rel.type} relationship.`,
    };
  }

  /**
   * Build a scene description for instruction tuning context.
   */
  private buildSceneDescription(sample: SpatialTrainingSample): string {
    let desc = `Scene: "${sample.compositionName}" contains ${sample.sceneContext.objectCount} objects.\n`;

    if (sample.sceneContext.objects.length > 0) {
      desc += 'Objects:\n';
      for (const obj of sample.sceneContext.objects) {
        desc += `- "${obj.name}" (${obj.type}) at position [${this.formatVec3(obj.position)}]\n`;
      }
    }

    return desc;
  }

  // ---------------------------------------------------------------------------
  // Tagging and Difficulty
  // ---------------------------------------------------------------------------

  /**
   * Generate tags for a sample.
   */
  private generateTags(
    rel: SpatialRelationship,
    objA: SpatialObject,
    objB: SpatialObject
  ): string[] {
    const tags: string[] = [rel.type, rel.holds ? 'positive' : 'negative', ...rel.directions];

    if (objA.type) tags.push(`type:${objA.type}`);
    if (objB.type) tags.push(`type:${objB.type}`);

    if (objA.traits) tags.push(...objA.traits.map((t) => `trait:${t}`));
    if (objB.traits) tags.push(...objB.traits.map((t) => `trait:${t}`));

    // Distance-based tags
    if (rel.distance < 1) tags.push('very_close');
    else if (rel.distance < 3) tags.push('close');
    else if (rel.distance < 10) tags.push('medium_distance');
    else tags.push('far');

    return [...new Set(tags)]; // deduplicate
  }

  /**
   * Compute difficulty level for a sample.
   */
  private computeDifficulty(
    rel: SpatialRelationship,
    allObjects: SpatialObject[]
  ): 'easy' | 'medium' | 'hard' {
    const objectCount = allObjects.length;

    // Easy: 2-3 objects, clear relationship
    if (objectCount <= 3 && rel.holds) return 'easy';

    // Hard: many objects, negative sample, or complex containment
    if (objectCount > 10) return 'hard';
    if (rel.type === 'contains' && !rel.holds && (rel.parameters.overlapRatio ?? 0) > 0.3)
      return 'hard';
    if (rel.type === 'reachable' && !rel.holds) return 'hard';

    // Medium: everything else
    return 'medium';
  }

  // ---------------------------------------------------------------------------
  // Utility Methods
  // ---------------------------------------------------------------------------

  /**
   * Format a Vector3 as a readable string.
   */
  private formatVec3(v: Vector3): string {
    return `${v.x.toFixed(2)}, ${v.y.toFixed(2)}, ${v.z.toFixed(2)}`;
  }

  /**
   * Compute a simple hash for a composition (for provenance tracking).
   */
  private hashComposition(comp: SpatialComposition): string {
    const str =
      comp.name +
      comp.objects.map((o) => `${o.id}:${o.position.x},${o.position.y},${o.position.z}`).join('|');

    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const chr = str.charCodeAt(i);
      hash = (hash << 5) - hash + chr;
      hash |= 0; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(16).padStart(8, '0');
  }

  /**
   * Compute statistics for a generation run.
   */
  private computeStats(
    samples: SpatialTrainingSample[],
    compositionsProcessed: number,
    objectsProcessed: number,
    pairsEvaluated: number,
    startTime: number
  ): GenerationStats {
    return {
      totalSamples: samples.length,
      adjacentPositive: samples.filter(
        (s) => s.relationship.type === 'adjacent' && s.relationship.holds
      ).length,
      adjacentNegative: samples.filter(
        (s) => s.relationship.type === 'adjacent' && !s.relationship.holds
      ).length,
      containsPositive: samples.filter(
        (s) => s.relationship.type === 'contains' && s.relationship.holds
      ).length,
      containsNegative: samples.filter(
        (s) => s.relationship.type === 'contains' && !s.relationship.holds
      ).length,
      reachablePositive: samples.filter(
        (s) => s.relationship.type === 'reachable' && s.relationship.holds
      ).length,
      reachableNegative: samples.filter(
        (s) => s.relationship.type === 'reachable' && !s.relationship.holds
      ).length,
      compositionsProcessed,
      objectsProcessed,
      pairsEvaluated,
      generationTimeMs: Date.now() - startTime,
    };
  }

  /**
   * Shuffle array using seeded RNG for reproducibility.
   */
  private shuffleArray<T>(array: T[]): T[] {
    const result = [...array];
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.abs(this.rng.nextInt()) % (i + 1);
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }
}

// =============================================================================
// SEEDED RANDOM NUMBER GENERATOR
// =============================================================================

/**
 * Simple seeded PRNG (xorshift32) for reproducible sampling.
 */
class SeededRNG {
  private state: number;

  constructor(seed: number) {
    this.state = seed === 0 ? 1 : seed;
  }

  nextInt(): number {
    let x = this.state;
    x ^= x << 13;
    x ^= x >> 17;
    x ^= x << 5;
    this.state = x;
    return x;
  }

  nextFloat(): number {
    return (this.nextInt() >>> 0) / 4294967296;
  }
}

// =============================================================================
// CONVENIENCE FACTORY
// =============================================================================

/**
 * Create a SpatialDataGenerator with optional configuration overrides.
 *
 * @example
 * ```typescript
 * const generator = createSpatialDataGenerator({
 *   adjacencyThresholds: [1.0, 3.0, 5.0],
 *   generateNegatives: true,
 *   negativeRatio: 1.5,
 * });
 * ```
 */
export function createSpatialDataGenerator(
  config?: Partial<SpatialDataGeneratorConfig>
): SpatialDataGenerator {
  return new SpatialDataGenerator(config);
}

/**
 * Parse a simplified HoloScript composition string into a SpatialComposition.
 *
 * This is a lightweight parser for the common case of compositions with
 * objects that have positions, scales, and basic types. For full HoloScript
 * parsing, use the main parser pipeline.
 *
 * @example
 * ```typescript
 * const composition = parseSimpleComposition(`
 *   composition "TestScene" {
 *     object "Table" {
 *       geometry: "cube"
 *       position: [0, 0.75, 0]
 *       scale: [3, 0.1, 1.5]
 *     }
 *     object "Chair" {
 *       geometry: "cube"
 *       position: [1, 0.5, 1.2]
 *       scale: [0.4, 0.5, 0.4]
 *     }
 *   }
 * `);
 * ```
 */
export function parseSimpleComposition(source: string): SpatialComposition {
  const nameMatch = source.match(/composition\s+"([^"]+)"/);
  const compositionName = nameMatch ? nameMatch[1] : 'Unnamed';

  const objects: SpatialObject[] = [];
  const objectRegex =
    /object\s+"([^"]+)"(?:\s+(?:using\s+"[^"]+"\s+)?)?\{([^}]*(?:\{[^}]*\}[^}]*)*)\}/g;

  let match: RegExpExecArray | null;
  let idCounter = 0;

  while ((match = objectRegex.exec(source)) !== null) {
    const name = match[1];
    const body = match[2];

    const posMatch = body.match(/position:\s*\[\s*([^,]+),\s*([^,]+),\s*([^\]]+)\]/);
    const scaleMatch = body.match(/scale:\s*\[\s*([^,]+),\s*([^,]+),\s*([^\]]+)\]/);
    const geoMatch = body.match(/geometry:\s*"([^"]+)"/);
    const sizeMatch = body.match(/size:\s*(\d+(?:\.\d+)?)/);

    const position: Vector3 = posMatch
      ? { x: parseFloat(posMatch[1]), y: parseFloat(posMatch[2]), z: parseFloat(posMatch[3]) }
      : { x: 0, y: 0, z: 0 };

    let scaleVec: Vector3 | undefined;
    if (scaleMatch) {
      scaleVec = {
        x: parseFloat(scaleMatch[1]),
        y: parseFloat(scaleMatch[2]),
        z: parseFloat(scaleMatch[3]),
      };
    } else if (sizeMatch) {
      const s = parseFloat(sizeMatch[1]);
      scaleVec = { x: s, y: s, z: s };
    }

    const type = geoMatch ? geoMatch[1] : 'cube';

    // Extract traits
    const traitRegex = /@(\w+)/g;
    const traits: string[] = [];
    let traitMatch: RegExpExecArray | null;
    while ((traitMatch = traitRegex.exec(body)) !== null) {
      traits.push(traitMatch[1]);
    }

    const id = name.toLowerCase().replace(/\s+/g, '_') + '_' + idCounter++;

    objects.push({
      id,
      name,
      type,
      position,
      scale: scaleVec,
      traits: traits.length > 0 ? traits : undefined,
      isStatic: traits.includes('static') || traits.includes('collidable'),
    });
  }

  return {
    name: compositionName,
    objects,
    sourceCode: source,
  };
}
