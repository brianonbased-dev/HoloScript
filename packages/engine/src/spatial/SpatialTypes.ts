import type { Vector3, Vector2, Quaternion } from '@holoscript/core';
export type { Vector3, Vector2, Quaternion } from '@holoscript/core';

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
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const dz = b[2] - a[2];
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/**
 * Calculate squared distance (faster when comparing)
 */
export function distanceSquared(a: Vector3, b: Vector3): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const dz = b[2] - a[2];
  return dx * dx + dy * dy + dz * dz;
}

/**
 * Check if point is inside bounding box
 */
export function isPointInBox(point: Vector3, box: BoundingBox): boolean {
  return (
    point[0] >= box.min[0] &&
    point[0] <= box.max[0] &&
    point[1] >= box.min[1] &&
    point[1] <= box.max[1] &&
    point[2] >= box.min[2] &&
    point[2] <= box.max[2]
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
  return [
    (box.min[0] + box.max[0]) / 2,
    (box.min[1] + box.max[1]) / 2,
    (box.min[2] + box.max[2]) / 2,
  ];
}

/**
 * Check if two bounding boxes overlap
 */
export function boxesOverlap(a: BoundingBox, b: BoundingBox): boolean {
  return (
    a.min[0] <= b.max[0] &&
    a.max[0] >= b.min[0] &&
    a.min[1] <= b.max[1] &&
    a.max[1] >= b.min[1] &&
    a.min[2] <= b.max[2] &&
    a.max[2] >= b.min[2]
  );
}

/**
 * Normalize a vector
 */
export function normalize(v: Vector3): Vector3 {
  const len = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
  if (len === 0) return [0, 0, 0];
  return [v[0] / len, v[1] / len, v[2] / len];
}

/**
 * Subtract two vectors
 */
export function subtract(a: Vector3, b: Vector3): Vector3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

/**
 * Add two vectors
 */
export function add(a: Vector3, b: Vector3): Vector3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

/**
 * Scale a vector
 */
export function scale(v: Vector3, s: number): Vector3 {
  return [v[0] * s, v[1] * s, v[2] * s];
}

/**
 * Dot product of two vectors
 */
export function dot(a: Vector3, b: Vector3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

/**
 * Cross product of two vectors
 */
export function cross(a: Vector3, b: Vector3): Vector3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

/**
 * Linear interpolation between two vectors
 */
export function lerp(a: Vector3, b: Vector3, t: number): Vector3 {
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ];
}
