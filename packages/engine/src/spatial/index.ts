/**
 * Spatial Module - Index
 * Sprint 4 Priority 4 - Spatial Context Awareness
 *
 * Exports all spatial awareness types and classes.
 */

// Types
export type {
  Vector3,
  Vector2,
  Quaternion,
  BoundingBox,
  OrientedBoundingBox,
  BoundingSphere,
  SpatialEntity,
  Region,
  SightLine,
  SpatialContext,
  EntityEnteredEvent,
  EntityExitedEvent,
  RegionEnteredEvent,
  RegionExitedEvent,
  VisibilityChangedEvent,
  SpatialEvent,
  SpatialAwarenessConfig,
} from './SpatialTypes';

export {
  DEFAULT_SPATIAL_CONFIG,
  // Utility functions
  distance,
  distanceSquared,
  isPointInBox,
  isPointInSphere,
  getBoxCenter,
  boxesOverlap,
  normalize,
  subtract,
  add,
  scale,
  dot,
  cross,
  lerp,
} from './SpatialTypes';

// Query system
export type {
  SpatialQueryType,
  SpatialQueryBase,
  NearestQuery,
  WithinQuery,
  VisibleQuery,
  ReachableQuery,
  InRegionQuery,
  ByTypeQuery,
  RaycastQuery,
  SpatialQuery,
  QueryResult,
  RaycastHit,
} from './SpatialQuery';

export { SpatialQueryExecutor } from './SpatialQuery';

// Context provider
export { SpatialContextProvider, SpatialContextProviderEvents } from './SpatialContextProvider';

// Spatial constraint types
export type {
  SpatialConstraintKind,
  SpatialAdjacentConstraint,
  SpatialAdjacentConfig,
  SpatialContainsConstraint,
  SpatialContainsConfig,
  SpatialReachableConstraint,
  SpatialReachableConfig,
  SpatialTemporalAdjacentConstraint,
  SpatialTemporalAdjacentConfig,
  SpatialTemporalReachableConstraint,
  SpatialTemporalReachableConfig,
  SpatialTemporalAdjacentConfig as SpatialTemporalAdjacentConfig_alias, // avoid naming collision if any
  SpatialTrajectoryConstraint,
  SpatialTrajectoryConfig,
  SpatialTrajectoryMode,
  TrajectoryWaypoint,
  SpatialAxis,
  SpatialReachableAlgorithm,
  SpatialEnforcementMode,
  SpatialConstraint,
  SpatialDiagnosticSeverity,
  SpatialConstraintDiagnostic,
  SpatialConstraintCheckResult,
  SpatialDeclaration,
  SpatialConstraintViolationEvent,
  SpatialConstraintResolvedEvent,
  SpatialConstraintEvent,
} from './SpatialConstraintTypes';

// Spatial constraint validator
export { SpatialConstraintValidator } from './SpatialConstraintValidator';

// Octree systems
export { OctreeSystem } from './OctreeSystem';
export type { OctreeEntry } from './OctreeSystem';
export {
  OctreeLODSystem,
  GaussianAnchor,
} from './OctreeLODSystem';
export type {
  OctreeLODConfig,
  LODSelectionResult,
  LODLevelStats,
  OctreeLODMetrics,
} from './OctreeLODSystem';

// Graph and Culling systems
export { TransformGraph } from './TransformGraph';
export { FrustumCuller } from './FrustumCuller';
