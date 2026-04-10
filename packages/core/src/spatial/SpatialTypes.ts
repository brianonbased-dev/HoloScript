/**
 * Spatial Types for Agent Context Awareness
 * Sprint 4 Priority 4 - Spatial Context Awareness
 *
 * Enables agents to understand and reason about spatial relationships
 * in XR environments.
 */

// =============================================================================
// VECTOR & GEOMETRY TYPES
// =============================================================================

/**
 * 3D Vector representation
 */
export interface Vector3 {
  x: number;
  y: number;
  z: number;
}

/**
 * 2D Vector for screen/UI space
 */
export interface Vector2 {
  x: number;
  y: number;
}

/**
 * Quaternion for rotation
 */
export interface Quaternion {
  x: number;
  y: number;
  z: number;
  w: number;
}

/**
 * Axis-aligned bounding box
 */
export interface BoundingBox {
  min: Vector3;
  max: Vector3;
}

/**
 * Oriented bounding box with rotation
 */
export interface OrientedBoundingBox {
  center: Vector3;
  halfExtents: Vector3;
  rotation: Quaternion;
}

/**
 * Sphere bounds
 */
export interface BoundingSphere {
  center: Vector3;
  radius: number;
}

// =============================================================================
// SPATIAL ENTITY TYPES
// =============================================================================

/**
 * Entity that exists in spatial space
 */
export interface SpatialEntity {
  id: string;
  type: string;
  position: Vector3;
  rotation?: Quaternion;
  bounds?: BoundingBox | BoundingSphere;
  velocity?: Vector3;
  metadata?: Record<string, unknown>;
}

/**
 * Defined region in space
 */
export interface Region {
  id: string;
  name: string;
  type: 'box' | 'sphere' | 'polygon' | 'custom';
  bounds: BoundingBox | BoundingSphere;
  properties?: Record<string, unknown>;
}

/**
 * Line of sight between two points
 */
export interface SightLine {
  from: Vector3;
  to: Vector3;
  blocked: boolean;
  blockingEntity?: string;
  distance: number;
}

// =============================================================================
// SPATIAL CONTEXT
// =============================================================================

/**
 * Complete spatial context for an agent
 */
export interface SpatialContext {
  /** Agent's current position */
  agentPosition: Vector3;

  /** Agent's orientation */
  agentRotation?: Quaternion;

  /** Agent's bounding volume */
  agentBounds?: BoundingBox;

  /** Current velocity */
  agentVelocity?: Vector3;

  /** Entities within perception radius */
  nearbyEntities: SpatialEntity[];

  /** Regions the agent is currently in */
  currentRegions: Region[];

  /** All defined regions in the scene */
  allRegions: Region[];

  /** Computed sight lines to relevant entities */
  sightLines: SightLine[];

  /** Timestamp of context snapshot */
  timestamp: number;

  /** Update rate in Hz */
  updateRate: number;
}

// =============================================================================
// SPATIAL EVENTS
// =============================================================================

/**
 * Event when entity enters perception radius
 */
export interface EntityEnteredEvent {
  type: 'entity_entered';
  entity: SpatialEntity;
  distance: number;
  timestamp: number;
}

/**
 * Event when entity exits perception radius
 */
export interface EntityExitedEvent {
  type: 'entity_exited';
  entity: SpatialEntity;
  timestamp: number;
}

/**
 * Event when agent enters a region
 */
export interface RegionEnteredEvent {
  type: 'region_entered';
  region: Region;
  previousRegion?: Region;
  timestamp: number;
}

/**
 * Event when agent exits a region
 */
export interface RegionExitedEvent {
  type: 'region_exited';
  region: Region;
  timestamp: number;
}

/**
 * Event when sight line to entity changes
 */
export interface VisibilityChangedEvent {
  type: 'visibility_changed';
  entityId: string;
  visible: boolean;
  sightLine: SightLine;
  timestamp: number;
}

/**
 * Union of all spatial events
 */
export type SpatialEvent =
  | EntityEnteredEvent
  | EntityExitedEvent
  | RegionEnteredEvent
  | RegionExitedEvent
  | VisibilityChangedEvent;

// =============================================================================
// CONFIGURATION
// =============================================================================

/**
 * Configuration for spatial awareness
 */
export interface SpatialAwarenessConfig {
  /** How often to update spatial context (Hz) */
  updateRate: number;

  /** Maximum distance for entity perception (meters) */
  perceptionRadius: number;

  /** Maximum distance for visibility checks (meters) */
  visibilityRadius: number;

  /** Enable region tracking */
  trackRegions: boolean;

  /** Enable sight line computation */
  computeSightLines: boolean;

  /** Entity types to track (empty = all) */
  entityTypeFilter: string[];

  /** Minimum movement to trigger update (meters) */
  movementThreshold: number;
}

/**
 * Default spatial awareness configuration
 */
export const DEFAULT_SPATIAL_CONFIG: SpatialAwarenessConfig = {
  updateRate: 30,
  perceptionRadius: 10,
  visibilityRadius: 50,
  trackRegions: true,
  computeSightLines: true,
  entityTypeFilter: [],
  movementThreshold: 0.01,
};

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Calculate distance between two points
 */
export function distance(a: Vector3, b: Vector3): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dz = b.z - a.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/**
 * Calculate squared distance (faster when comparing)
 */
export function distanceSquared(a: Vector3, b: Vector3): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dz = b.z - a.z;
  return dx * dx + dy * dy + dz * dz;
}

/**
 * Check if point is inside bounding box
 */
export function isPointInBox(point: Vector3, box: BoundingBox): boolean {
  return (
    point.x >= box.min.x &&
    point.x <= box.max.x &&
    point.y >= box.min.y &&
    point.y <= box.max.y &&
    point.z >= box.min.z &&
    point.z <= box.max.z
  );
}

/**
 * Check if point is inside sphere
 */
export function isPointInSphere(point: Vector3, sphere: BoundingSphere): boolean {
  return distance(point, sphere.center) <= sphere.radius;
}

/**
 * Get center of bounding box
 */
export function getBoxCenter(box: BoundingBox): Vector3 {
  return {
    x: (box.min.x + box.max.x) / 2,
    y: (box.min.y + box.max.y) / 2,
    z: (box.min.z + box.max.z) / 2,
  };
}

/**
 * Check if two bounding boxes overlap
 */
export function boxesOverlap(a: BoundingBox, b: BoundingBox): boolean {
  return (
    a.min.x <= b.max.x &&
    a.max.x >= b.min.x &&
    a.min.y <= b.max.y &&
    a.max.y >= b.min.y &&
    a.min.z <= b.max.z &&
    a.max.z >= b.min.z
  );
}

/**
 * Normalize a vector
 */
export function normalize(v: Vector3): Vector3 {
  const len = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
  if (len === 0) return { x: 0, y: 0, z: 0 };
  return { x: v.x / len, y: v.y / len, z: v.z / len };
}

/**
 * Subtract two vectors
 */
export function subtract(a: Vector3, b: Vector3): Vector3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

/**
 * Add two vectors
 */
export function add(a: Vector3, b: Vector3): Vector3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

/**
 * Scale a vector
 */
export function scale(v: Vector3, s: number): Vector3 {
  return { x: v.x * s, y: v.y * s, z: v.z * s };
}

/**
 * Dot product of two vectors
 */
export function dot(a: Vector3, b: Vector3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

/**
 * Cross product of two vectors
 */
export function cross(a: Vector3, b: Vector3): Vector3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

/**
 * Linear interpolation between two vectors
 */
export function lerp(a: Vector3, b: Vector3, t: number): Vector3 {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    z: a.z + (b.z - a.z) * t,
  };
}
