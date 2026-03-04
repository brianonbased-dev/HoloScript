/**
 * Spatial Constraint Types for HoloScript Type System
 *
 * Defines compile-time spatial constraint trait extensions:
 * - spatial_adjacent:            Two entities must be within a given distance threshold
 * - spatial_contains:            One entity's bounds must fully enclose another
 * - spatial_reachable:           An unobstructed path must exist between entities
 * - spatial_temporal_adjacent:   Adjacency that must hold for N seconds (duration constraint)
 * - spatial_temporal_reachable:  Reachability with moving obstacle velocity prediction
 * - spatial_trajectory:          Path-based constraints over predicted entity motion
 *
 * These constraints are verified at compile time (static analysis of spatial
 * declarations) and optionally enforced at runtime via the trait handlers.
 *
 * @module spatial/SpatialConstraintTypes
 */

import type {
  Vector3,
  BoundingBox,
  BoundingSphere,
  SpatialEntity,
  Region,
} from './SpatialTypes';

// =============================================================================
// SPATIAL CONSTRAINT KIND
// =============================================================================

/**
 * Discriminant for the spatial constraint families.
 *
 * Includes the original three plus the spatiotemporal extensions:
 * - spatial_temporal_adjacent: adjacency that must hold for a duration
 * - spatial_temporal_reachable: reachability accounting for moving obstacles
 * - spatial_trajectory: path-based constraints over predicted motion
 */
export type SpatialConstraintKind =
  | 'spatial_adjacent'
  | 'spatial_contains'
  | 'spatial_reachable'
  | 'spatial_temporal_adjacent'
  | 'spatial_temporal_reachable'
  | 'spatial_trajectory';

// =============================================================================
// SPATIAL_ADJACENT
// =============================================================================

/**
 * Adjacency constraint: entities A and B must remain within `maxDistance`
 * of each other. If `minDistance` is specified they must also be at least
 * that far apart (useful for preventing overlap).
 *
 * HoloScript syntax:
 * ```holoscript
 * orb#shelf {
 *   @spatial_adjacent(target: "book", maxDistance: 1.5m, axis: "xz")
 * }
 * ```
 */
export interface SpatialAdjacentConstraint {
  kind: 'spatial_adjacent';

  /** Source entity that declares the constraint */
  sourceId: string;

  /** Target entity or entity type that must be adjacent */
  targetId: string;

  /** Maximum allowable distance (meters). Required. */
  maxDistance: number;

  /** Minimum allowable distance (meters). Defaults to 0. */
  minDistance?: number;

  /**
   * Axis restriction for distance calculation.
   * - 'xyz'  full 3D distance (default)
   * - 'xz'   horizontal plane only (ignores y)
   * - 'xy'   vertical plane only (ignores z)
   * - 'x'|'y'|'z'  single axis
   */
  axis?: SpatialAxis;

  /** Whether the constraint is bidirectional (default true) */
  bidirectional?: boolean;

  /** Human-readable label for error messages */
  label?: string;
}

/**
 * Configuration for the spatial_adjacent trait (parsed from HoloScript source).
 */
export interface SpatialAdjacentConfig {
  target: string;
  maxDistance: number;
  minDistance?: number;
  axis?: SpatialAxis;
  bidirectional?: boolean;
  /** When true, emit warnings instead of errors at compile time */
  soft?: boolean;
  /** Runtime enforcement mode */
  enforcement?: SpatialEnforcementMode;
}

// =============================================================================
// SPATIAL_CONTAINS
// =============================================================================

/**
 * Containment constraint: entity A's bounding volume must fully enclose
 * entity B. Useful for zones, rooms, inventories, and UI containers.
 *
 * HoloScript syntax:
 * ```holoscript
 * orb#room {
 *   @spatial_contains(target: "furniture", margin: 0.1m, strict: true)
 * }
 * ```
 */
export interface SpatialContainsConstraint {
  kind: 'spatial_contains';

  /** The container entity */
  containerId: string;

  /** The entity that must be fully inside the container */
  containedId: string;

  /**
   * Extra margin (meters) that must exist between the contained entity's
   * bounds and the container's bounds. Defaults to 0.
   */
  margin?: number;

  /**
   * Strict mode: if true, the contained entity's full bounding volume
   * must be inside. If false (default), only the center point is checked.
   */
  strict?: boolean;

  /** Whether to also check child entities recursively */
  recursive?: boolean;

  /** Human-readable label for error messages */
  label?: string;
}

/**
 * Configuration for the spatial_contains trait.
 */
export interface SpatialContainsConfig {
  target: string;
  margin?: number;
  strict?: boolean;
  recursive?: boolean;
  /** When true, emit warnings instead of errors at compile time */
  soft?: boolean;
  /** Runtime enforcement mode */
  enforcement?: SpatialEnforcementMode;
}

// =============================================================================
// SPATIAL_REACHABLE
// =============================================================================

/**
 * Reachability constraint: a clear (unobstructed) path must exist from
 * entity A to entity B, considering obstacles and navigation meshes.
 *
 * HoloScript syntax:
 * ```holoscript
 * orb#npc {
 *   @spatial_reachable(
 *     target: "exit_door",
 *     maxPathLength: 50m,
 *     obstacles: ["wall", "barrier"],
 *     algorithm: "navmesh"
 *   )
 * }
 * ```
 */
export interface SpatialReachableConstraint {
  kind: 'spatial_reachable';

  /** The starting entity */
  sourceId: string;

  /** The destination entity */
  targetId: string;

  /**
   * Maximum allowable path length in meters.
   * If the shortest unobstructed path exceeds this, the constraint fails.
   */
  maxPathLength?: number;

  /**
   * Entity types (or specific IDs) that are considered obstacles.
   * If empty, only static colliders block reachability.
   */
  obstacleTypes?: string[];

  /**
   * Pathfinding algorithm hint.
   * - 'line_of_sight' simple raycast (fast, conservative)
   * - 'navmesh'       navigation mesh query (accurate)
   * - 'astar'         grid-based A* (general purpose)
   */
  algorithm?: SpatialReachableAlgorithm;

  /** Agent radius for path clearance (meters). Defaults to 0.5 */
  agentRadius?: number;

  /** Whether the constraint is bidirectional (default true) */
  bidirectional?: boolean;

  /** Human-readable label for error messages */
  label?: string;
}

/**
 * Configuration for the spatial_reachable trait.
 */
export interface SpatialReachableConfig {
  target: string;
  maxPathLength?: number;
  obstacleTypes?: string[];
  algorithm?: SpatialReachableAlgorithm;
  agentRadius?: number;
  bidirectional?: boolean;
  /** When true, emit warnings instead of errors at compile time */
  soft?: boolean;
  /** Runtime enforcement mode */
  enforcement?: SpatialEnforcementMode;
}

// =============================================================================
// SPATIAL_TEMPORAL_ADJACENT (duration-constrained adjacency)
// =============================================================================

/**
 * Temporal adjacency constraint: entities A and B must remain within
 * `maxDistance` for at least `minDuration` seconds. Optionally, the
 * constraint only triggers a violation after the condition has been
 * broken for `gracePeriod` seconds (hysteresis).
 *
 * HoloScript syntax:
 * ```holoscript
 * orb#guard {
 *   @spatial_temporal_adjacent(
 *     target: "prisoner",
 *     maxDistance: 3m,
 *     minDuration: 5s,
 *     gracePeriod: 1s,
 *     axis: "xz"
 *   )
 * }
 * ```
 */
export interface SpatialTemporalAdjacentConstraint {
  kind: 'spatial_temporal_adjacent';

  /** Source entity that declares the constraint */
  sourceId: string;

  /** Target entity or entity type that must be adjacent */
  targetId: string;

  /** Maximum allowable distance (meters). Required. */
  maxDistance: number;

  /** Minimum allowable distance (meters). Defaults to 0. */
  minDistance?: number;

  /**
   * Minimum duration (seconds) the adjacency condition must hold
   * continuously before the constraint is considered satisfied.
   */
  minDuration: number;

  /**
   * Grace period (seconds). After the adjacency condition breaks,
   * wait this long before emitting a violation. Provides hysteresis
   * to prevent flickering. Defaults to 0.
   */
  gracePeriod?: number;

  /** Axis restriction for distance calculation. */
  axis?: SpatialAxis;

  /** Whether the constraint is bidirectional (default true) */
  bidirectional?: boolean;

  /** Human-readable label for error messages */
  label?: string;
}

/**
 * Configuration for the spatial_temporal_adjacent trait (parsed from HoloScript).
 */
export interface SpatialTemporalAdjacentConfig {
  target: string;
  maxDistance: number;
  minDistance?: number;
  minDuration: number;
  gracePeriod?: number;
  axis?: SpatialAxis;
  bidirectional?: boolean;
  /** When true, emit warnings instead of errors at compile time */
  soft?: boolean;
  /** Runtime enforcement mode */
  enforcement?: SpatialEnforcementMode;
}

// =============================================================================
// SPATIAL_TEMPORAL_REACHABLE (velocity-predicted reachability)
// =============================================================================

/**
 * Velocity-aware reachability constraint: checks whether a path exists
 * from entity A to entity B, accounting for moving obstacles by predicting
 * their positions `predictionHorizon` seconds into the future based on
 * their current velocity vectors.
 *
 * HoloScript syntax:
 * ```holoscript
 * orb#drone {
 *   @spatial_temporal_reachable(
 *     target: "landing_pad",
 *     maxPathLength: 100m,
 *     predictionHorizon: 3s,
 *     movingObstacles: ["vehicle", "drone"],
 *     safetyMargin: 1.5m
 *   )
 * }
 * ```
 */
export interface SpatialTemporalReachableConstraint {
  kind: 'spatial_temporal_reachable';

  /** The starting entity */
  sourceId: string;

  /** The destination entity */
  targetId: string;

  /** Maximum allowable path length in meters. */
  maxPathLength?: number;

  /**
   * How far into the future (seconds) to predict obstacle positions.
   * Obstacle positions are extrapolated via position + velocity * t.
   */
  predictionHorizon: number;

  /**
   * Entity types (or specific IDs) treated as moving obstacles.
   * Their velocity vectors are read from the spatial context.
   */
  movingObstacles?: string[];

  /**
   * Static obstacle types (no velocity prediction applied).
   */
  staticObstacles?: string[];

  /**
   * Safety margin (meters) to add around predicted obstacle positions.
   * Accounts for velocity uncertainty. Defaults to 0.5.
   */
  safetyMargin?: number;

  /** Pathfinding algorithm hint. */
  algorithm?: SpatialReachableAlgorithm;

  /** Agent radius for path clearance (meters). Defaults to 0.5 */
  agentRadius?: number;

  /** Whether the constraint is bidirectional (default true) */
  bidirectional?: boolean;

  /** Human-readable label for error messages */
  label?: string;
}

/**
 * Configuration for the spatial_temporal_reachable trait.
 */
export interface SpatialTemporalReachableConfig {
  target: string;
  maxPathLength?: number;
  predictionHorizon: number;
  movingObstacles?: string[];
  staticObstacles?: string[];
  safetyMargin?: number;
  algorithm?: SpatialReachableAlgorithm;
  agentRadius?: number;
  bidirectional?: boolean;
  /** When true, emit warnings instead of errors at compile time */
  soft?: boolean;
  /** Runtime enforcement mode */
  enforcement?: SpatialEnforcementMode;
}

// =============================================================================
// SPATIAL_TRAJECTORY (path-based constraints)
// =============================================================================

/**
 * Trajectory constraint: verifies that the predicted motion path of an
 * entity satisfies spatial constraints. The trajectory is computed from
 * position + velocity (and optional acceleration) over a time horizon,
 * and can be checked against keep-in zones, keep-out zones, waypoints,
 * and maximum deviation from a reference path.
 *
 * HoloScript syntax:
 * ```holoscript
 * orb#missile {
 *   @spatial_trajectory(
 *     mode: "keep_in",
 *     region: "safe_corridor",
 *     horizon: 5s,
 *     sampleCount: 20,
 *     maxDeviation: 2m
 *   )
 * }
 * ```
 */
export interface SpatialTrajectoryConstraint {
  kind: 'spatial_trajectory';

  /** The entity whose trajectory is being constrained */
  sourceId: string;

  /**
   * Constraint mode:
   * - 'keep_in':  trajectory must stay inside the region
   * - 'keep_out': trajectory must avoid the region
   * - 'follow':   trajectory must stay within maxDeviation of a reference path
   * - 'waypoint': trajectory must pass through specified waypoints
   */
  mode: SpatialTrajectoryMode;

  /**
   * Region ID or entity ID that defines the spatial boundary
   * (for keep_in and keep_out modes).
   */
  regionId?: string;

  /**
   * Time horizon (seconds) over which to predict the trajectory.
   */
  horizon: number;

  /**
   * Number of sample points along the trajectory to check.
   * Higher values increase accuracy but cost more. Defaults to 10.
   */
  sampleCount?: number;

  /**
   * Maximum allowed deviation (meters) from a reference path
   * (for 'follow' mode).
   */
  maxDeviation?: number;

  /**
   * Waypoints the trajectory must pass through (for 'waypoint' mode).
   * Each waypoint has a position and an acceptance radius.
   */
  waypoints?: TrajectoryWaypoint[];

  /**
   * Reference path for 'follow' mode. An ordered list of points
   * defining the ideal trajectory.
   */
  referencePath?: Vector3[];

  /**
   * Whether to account for acceleration (quadratic prediction)
   * instead of linear velocity extrapolation. Defaults to false.
   */
  useAcceleration?: boolean;

  /** Human-readable label for error messages */
  label?: string;
}

/**
 * A waypoint along a trajectory, with an acceptance radius.
 */
export interface TrajectoryWaypoint {
  position: Vector3;
  /** Radius (meters) within which the trajectory is considered to pass through */
  radius: number;
  /** Optional label for diagnostics */
  label?: string;
}

/**
 * Trajectory constraint mode.
 */
export type SpatialTrajectoryMode = 'keep_in' | 'keep_out' | 'follow' | 'waypoint';

/**
 * Configuration for the spatial_trajectory trait.
 */
export interface SpatialTrajectoryConfig {
  mode: SpatialTrajectoryMode;
  regionId?: string;
  horizon: number;
  sampleCount?: number;
  maxDeviation?: number;
  waypoints?: TrajectoryWaypoint[];
  referencePath?: Vector3[];
  useAcceleration?: boolean;
  /** When true, emit warnings instead of errors at compile time */
  soft?: boolean;
  /** Runtime enforcement mode */
  enforcement?: SpatialEnforcementMode;
}

// =============================================================================
// SHARED TYPES
// =============================================================================

/**
 * Axis filter for distance calculations.
 */
export type SpatialAxis = 'xyz' | 'xz' | 'xy' | 'x' | 'y' | 'z';

/**
 * Pathfinding algorithm for reachability.
 */
export type SpatialReachableAlgorithm = 'line_of_sight' | 'navmesh' | 'astar';

/**
 * How the constraint is enforced at runtime.
 * - 'prevent'  block the violating action (e.g., prevent entity from moving out of range)
 * - 'correct'  snap entity back to valid state
 * - 'warn'     emit a runtime warning but allow the violation
 * - 'none'     compile-time only, no runtime checks
 */
export type SpatialEnforcementMode = 'prevent' | 'correct' | 'warn' | 'none';

/**
 * Union of all spatial constraints (including spatiotemporal extensions).
 */
export type SpatialConstraint =
  | SpatialAdjacentConstraint
  | SpatialContainsConstraint
  | SpatialReachableConstraint
  | SpatialTemporalAdjacentConstraint
  | SpatialTemporalReachableConstraint
  | SpatialTrajectoryConstraint;

// =============================================================================
// COMPILE-TIME VERIFICATION TYPES
// =============================================================================

/**
 * Severity level for spatial constraint diagnostics.
 */
export type SpatialDiagnosticSeverity = 'error' | 'warning' | 'info';

/**
 * A single diagnostic produced by compile-time spatial constraint verification.
 */
export interface SpatialConstraintDiagnostic {
  /** Severity of the diagnostic */
  severity: SpatialDiagnosticSeverity;

  /** Diagnostic code (e.g., 'HSP030', 'HSP031', 'HSP032') */
  code: string;

  /** Human-readable error/warning message */
  message: string;

  /** Source line (1-indexed) where the constraint is declared */
  line: number;

  /** Source column (0-indexed) */
  column: number;

  /** The constraint kind that produced this diagnostic */
  constraintKind: SpatialConstraintKind;

  /** Source entity ID */
  sourceId: string;

  /** Target entity ID */
  targetId: string;

  /** Suggested fix(es) */
  suggestions?: string[];
}

/**
 * Result of compile-time spatial constraint verification.
 */
export interface SpatialConstraintCheckResult {
  /** Whether all constraints passed */
  valid: boolean;

  /** All diagnostics produced */
  diagnostics: SpatialConstraintDiagnostic[];

  /** Map of entity ID -> resolved spatial constraints */
  constraintMap: Map<string, SpatialConstraint[]>;

  /** Statistics */
  stats: {
    totalConstraints: number;
    adjacentCount: number;
    containsCount: number;
    reachableCount: number;
    temporalAdjacentCount: number;
    temporalReachableCount: number;
    trajectoryCount: number;
    errorsCount: number;
    warningsCount: number;
  };
}

// =============================================================================
// SPATIAL DECLARATION (for compile-time analysis)
// =============================================================================

/**
 * A spatial declaration extracted from HoloScript source during parsing.
 * These are the "facts" the compile-time verifier reasons about.
 */
export interface SpatialDeclaration {
  /** Entity ID */
  entityId: string;

  /** Entity type (e.g., 'orb', 'agent', 'zone') */
  entityType: string;

  /** Declared static position (if known at compile time) */
  position?: Vector3;

  /** Declared bounds (if known at compile time) */
  bounds?: BoundingBox | BoundingSphere;

  /** Parent entity ID (for containment hierarchy) */
  parentId?: string;

  /** Region the entity is declared in */
  regionId?: string;

  /** All spatial constraints declared on this entity */
  constraints: SpatialConstraint[];

  /** Source line for error reporting */
  line?: number;

  /** Source column for error reporting */
  column?: number;
}

// =============================================================================
// SPATIAL CONSTRAINT EVENTS (runtime)
// =============================================================================

/**
 * Event emitted when a spatial constraint is violated at runtime.
 */
export interface SpatialConstraintViolationEvent {
  type: 'spatial_constraint_violation';
  constraintKind: SpatialConstraintKind;
  sourceId: string;
  targetId: string;
  message: string;
  /** Current measured value (distance, overlap percentage, path length) */
  currentValue: number;
  /** Required threshold */
  requiredValue: number;
  timestamp: number;
}

/**
 * Event emitted when a violated spatial constraint returns to valid state.
 */
export interface SpatialConstraintResolvedEvent {
  type: 'spatial_constraint_resolved';
  constraintKind: SpatialConstraintKind;
  sourceId: string;
  targetId: string;
  timestamp: number;
}

/**
 * Union of all spatial constraint events.
 */
export type SpatialConstraintEvent =
  | SpatialConstraintViolationEvent
  | SpatialConstraintResolvedEvent;
