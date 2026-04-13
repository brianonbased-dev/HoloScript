/**
 * Spatial Training Data Types
 *
 * Type definitions for the spatial reasoning training data pipeline.
 * Used to generate instruction-response pairs from HoloScript compositions
 * with spatial constraints (spatial_adjacent, spatial_contains, spatial_reachable)
 * for fine-tuning LLMs on spatial reasoning tasks.
 *
 * @module training/SpatialTrainingDataTypes
 */

// =============================================================================
// DIFFICULTY LEVELS
// =============================================================================

/**
 * Difficulty levels for generated spatial reasoning examples.
 *
 * - basic: 2 objects, single spatial relationship
 * - intermediate: 3-5 objects, multiple relationships, mixed constraint types
 * - advanced: 6+ objects, occlusion, nested containment, chained reachability
 */
export type SpatialDifficulty = 'basic' | 'intermediate' | 'advanced';

// =============================================================================
// SPATIAL RELATIONSHIP TYPES
// =============================================================================

/**
 * The three core spatial relationship types from HoloScript's constraint system.
 */
export type SpatialRelationshipType = 'spatial_adjacent' | 'spatial_contains' | 'spatial_reachable';

// =============================================================================
// SCENE OBJECT DEFINITION
// =============================================================================

/**
 * A scene object with spatial properties for training data generation.
 */
export interface SceneObject {
  /** Unique identifier for the object */
  id: string;
  /** Object type (e.g., 'cube', 'sphere', 'zone', 'npc') */
  type: string;
  /** 3D position */
  position: [number, number, number];
  /** 3D scale */
  scale: { x: number; y: number; z: number };
  /** Bounding box (for containment checks) */
  bounds?: {
    min: { x: number; y: number; z: number };
    max: { x: number; y: number; z: number };
  };
  /** Whether this object acts as an obstacle */
  isObstacle?: boolean;
  /** Optional color for visual description */
  color?: string;
  /** Optional geometry type */
  geometry?: string;
}

// =============================================================================
// SPATIAL RELATIONSHIP DEFINITION
// =============================================================================

/**
 * A spatial relationship between two scene objects.
 */
export interface SpatialRelationship {
  /** The relationship type */
  type: SpatialRelationshipType;
  /** Source object ID */
  sourceId: string;
  /** Target object ID */
  targetId: string;
  /** Whether the relationship is satisfied (true=positive, false=negative) */
  satisfied: boolean;
  /** Constraint parameters */
  params: SpatialRelationshipParams;
}

/**
 * Parameters for spatial relationship constraints.
 */
export interface SpatialRelationshipParams {
  /** For adjacent: maximum distance */
  maxDistance?: number;
  /** For adjacent: minimum distance */
  minDistance?: number;
  /** For adjacent: axis restriction */
  axis?: string;
  /** For contains: margin */
  margin?: number;
  /** For contains: strict mode */
  strict?: boolean;
  /** For reachable: max path length */
  maxPathLength?: number;
  /** For reachable: obstacle types */
  obstacleTypes?: string[];
  /** For reachable: algorithm */
  algorithm?: string;
}

// =============================================================================
// SCENE DEFINITION
// =============================================================================

/**
 * A complete scene with objects and spatial relationships.
 */
export interface SpatialScene {
  /** Scene name/identifier */
  name: string;
  /** Objects in the scene */
  objects: SceneObject[];
  /** Spatial relationships between objects */
  relationships: SpatialRelationship[];
  /** Difficulty level */
  difficulty: SpatialDifficulty;
  /** The HoloScript composition source */
  holoScriptSource: string;
}

// =============================================================================
// TRAINING EXAMPLE (INSTRUCTION-RESPONSE PAIR)
// =============================================================================

/**
 * A single training example with instruction and response.
 * Suitable for fine-tuning LLMs on spatial reasoning tasks.
 */
export interface SpatialTrainingExample {
  /** Unique example ID */
  id: string;
  /** The instruction/question for the LLM */
  instruction: string;
  /** The expected response/answer */
  response: string;
  /** The HoloScript source that defines the scene */
  context: string;
  /** Spatial relationship type being tested */
  relationshipType: SpatialRelationshipType;
  /** Whether this is a positive or negative example */
  isPositive: boolean;
  /** Difficulty level */
  difficulty: SpatialDifficulty;
  /** Tags for categorization */
  tags: string[];
}

// =============================================================================
// GENERATOR CONFIGURATION
// =============================================================================

/**
 * Configuration options for the SpatialTrainingDataGenerator.
 */
export interface SpatialGeneratorConfig {
  /** Number of examples to generate per relationship type per difficulty level */
  examplesPerCategory?: number;
  /** Which relationship types to include */
  relationshipTypes?: SpatialRelationshipType[];
  /** Which difficulty levels to include */
  difficultyLevels?: SpatialDifficulty[];
  /** Ratio of positive to negative examples (default 0.5 = equal) */
  positiveRatio?: number;
  /** Random seed for reproducibility (if provided) */
  seed?: number;
  /** Whether to include HoloScript context in output */
  includeContext?: boolean;
}

// =============================================================================
// GENERATOR STATISTICS
// =============================================================================

/**
 * Statistics about generated training data.
 */
export interface SpatialGeneratorStats {
  /** Total number of examples generated */
  totalExamples: number;
  /** Breakdown by relationship type */
  byRelationship: Record<SpatialRelationshipType, number>;
  /** Breakdown by difficulty */
  byDifficulty: Record<SpatialDifficulty, number>;
  /** Breakdown by positive/negative */
  positiveCount: number;
  negativeCount: number;
  /** Number of unique templates used */
  uniqueTemplatesUsed: number;
}

// =============================================================================
// JSONL OUTPUT FORMAT
// =============================================================================

/**
 * JSONL line format for fine-tuning output.
 * Each line in the JSONL file is one of these objects.
 */
export interface SpatialTrainingJSONLEntry {
  /** The instruction/question */
  instruction: string;
  /** The expected response */
  response: string;
  /** Metadata for filtering/analysis */
  metadata: {
    id: string;
    relationship_type: SpatialRelationshipType;
    is_positive: boolean;
    difficulty: SpatialDifficulty;
    tags: string[];
  };
}
