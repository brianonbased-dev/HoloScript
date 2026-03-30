/**
 * PhysicsTypes.ts
 *
 * Core type definitions for the HoloScript physics system.
 * Provides interfaces for rigid bodies, collision shapes, constraints,
 * and spatial queries.
 *
 * @module physics
 */

// ============================================================================
// Vector and Transform Types
// ============================================================================

/**
 * 3D Vector
 */
export interface IVector3 {
  x: number;
  y: number;
  z: number;
}

/**
 * Quaternion rotation
 */
export interface IQuaternion {
  x: number;
  y: number;
  z: number;
  w: number;
}

/**
 * Transform (position + rotation + scale)
 */
export interface ITransform {
  position: IVector3;
  rotation: IQuaternion;
  scale?: IVector3;
}

// ============================================================================
// Physics Constants
// ============================================================================

/**
 * Default physics simulation settings
 */
export const PHYSICS_DEFAULTS = {
  gravity: { x: 0, y: -9.81, z: 0 } as IVector3,
  fixedTimestep: 1 / 60,
  maxSubsteps: 3,
  sleepThreshold: 0.005,
  sleepTime: 0.5,
  defaultFriction: 0.5,
  defaultRestitution: 0.3,
  defaultLinearDamping: 0.01,
  defaultAngularDamping: 0.01,
  maxVelocity: 1000,
  maxAngularVelocity: 100,
  contactBreakingThreshold: 0.02,
  solverIterations: 10,
  solverVelocityIterations: 2,
};

// ============================================================================
// Collision Shape Types
// ============================================================================

/**
 * Collision shape types
 */
export type CollisionShapeType =
  | 'box'
  | 'sphere'
  | 'capsule'
  | 'cylinder'
  | 'cone'
  | 'convex'
  | 'mesh'
  | 'heightfield'
  | 'compound';

/**
 * Base collision shape interface
 */
export interface ICollisionShapeBase {
  type: CollisionShapeType;
  offset?: IVector3;
  rotation?: IQuaternion;
  margin?: number;
}

/**
 * Box shape
 */
export interface IBoxShape extends ICollisionShapeBase {
  type: 'box';
  halfExtents: IVector3;
}

/**
 * Sphere shape
 */
export interface ISphereShape extends ICollisionShapeBase {
  type: 'sphere';
  radius: number;
}

/**
 * Capsule shape (along Y-axis by default)
 */
export interface ICapsuleShape extends ICollisionShapeBase {
  type: 'capsule';
  radius: number;
  height: number;
  axis?: 'x' | 'y' | 'z';
}

/**
 * Cylinder shape
 */
export interface ICylinderShape extends ICollisionShapeBase {
  type: 'cylinder';
  radius: number;
  height: number;
  axis?: 'x' | 'y' | 'z';
}

/**
 * Cone shape
 */
export interface IConeShape extends ICollisionShapeBase {
  type: 'cone';
  radius: number;
  height: number;
}

/**
 * Convex hull shape
 */
export interface IConvexShape extends ICollisionShapeBase {
  type: 'convex';
  vertices: number[]; // Flat array of x, y, z positions
}

/**
 * Triangle mesh shape (static only)
 */
export interface IMeshShape extends ICollisionShapeBase {
  type: 'mesh';
  vertices: number[]; // Flat xyz array
  indices: number[];
}

/**
 * Heightfield shape for terrain
 */
export interface IHeightfieldShape extends ICollisionShapeBase {
  type: 'heightfield';
  heightData: number[]; // Row-major height values
  width: number;
  depth: number;
  heightScale: number;
  minHeight: number;
  maxHeight: number;
}

/**
 * Compound shape (multiple sub-shapes)
 */
export interface ICompoundShape extends ICollisionShapeBase {
  type: 'compound';
  children: Array<{
    shape: CollisionShape;
    offset: IVector3;
    rotation: IQuaternion;
  }>;
}

/**
 * Union of all collision shape types
 */
export type CollisionShape =
  | IBoxShape
  | ISphereShape
  | ICapsuleShape
  | ICylinderShape
  | IConeShape
  | IConvexShape
  | IMeshShape
  | IHeightfieldShape
  | ICompoundShape;

// ============================================================================
// Rigid Body Types
// ============================================================================

/**
 * Body motion type
 */
export type BodyType = 'dynamic' | 'static' | 'kinematic';

/**
 * Collision group flags
 */
export interface ICollisionFilter {
  group: number;
  mask: number;
}

/**
 * Default collision groups
 */
export const COLLISION_GROUPS = {
  DEFAULT: 1,
  PLAYER: 2,
  ENEMY: 4,
  PROJECTILE: 8,
  TERRAIN: 16,
  TRIGGER: 32,
  INTERACTABLE: 64,
  ALL: 0xffff,
};

/**
 * Rigid body material properties
 */
export interface IPhysicsMaterial {
  friction: number;
  restitution: number;
  rollingFriction?: number;
  spinningFriction?: number;
  frictionCombine?: 'average' | 'min' | 'max' | 'multiply';
  restitutionCombine?: 'average' | 'min' | 'max' | 'multiply';
}

/**
 * Rigid body configuration
 */
export interface IRigidBodyConfig {
  /** Unique identifier */
  id: string;
  /** Motion type */
  type: BodyType;
  /** Initial transform */
  transform: ITransform;
  /** Collision shape */
  shape: CollisionShape;
  /** Mass (0 for static/kinematic) */
  mass?: number;
  /** Material properties */
  material?: IPhysicsMaterial;
  /** Collision filtering */
  filter?: ICollisionFilter;
  /** Linear damping */
  linearDamping?: number;
  /** Angular damping */
  angularDamping?: number;
  /** Whether gravity affects this body */
  gravityScale?: number;
  /** Whether to start asleep */
  sleeping?: boolean;
  /** Continuous collision detection */
  ccd?: boolean;
  /** Custom user data */
  userData?: unknown;
}

/**
 * Rigid body state (runtime)
 */
export interface IRigidBodyState {
  id: string;
  /** Body motion type */
  type?: BodyType;
  position: IVector3;
  rotation: IQuaternion;
  linearVelocity: IVector3;
  angularVelocity: IVector3;
  /** Alias for linearVelocity — used by HoloScriptPlusRuntime shorthand */
  velocity?: IVector3;
  isSleeping: boolean;
  isActive: boolean;
}

// ============================================================================
// Constraint Types
// ============================================================================

/**
 * Constraint types
 */
export type ConstraintType =
  | 'fixed'
  | 'hinge'
  | 'slider'
  | 'ball'
  | 'cone'
  | 'distance'
  | 'spring'
  | 'generic6dof';

/**
 * Base constraint interface
 */
export interface IConstraintBase {
  type: ConstraintType;
  id: string;
  bodyA: string;
  bodyB?: string; // If undefined, constrained to world
  breakForce?: number;
  breakTorque?: number;
}

/**
 * Fixed joint (no movement)
 */
export interface IFixedConstraint extends IConstraintBase {
  type: 'fixed';
  pivotA: IVector3;
  pivotB?: IVector3;
}

/**
 * Hinge joint (1 rotational DOF)
 */
export interface IHingeConstraint extends IConstraintBase {
  type: 'hinge';
  pivotA: IVector3;
  pivotB?: IVector3;
  axisA: IVector3;
  axisB?: IVector3;
  limits?: { low: number; high: number };
  motor?: { targetVelocity: number; maxForce: number };
}

/**
 * Slider joint (1 translational DOF)
 */
export interface ISliderConstraint extends IConstraintBase {
  type: 'slider';
  pivotA: IVector3;
  pivotB?: IVector3;
  axisA: IVector3;
  limits?: { low: number; high: number };
  motor?: { targetVelocity: number; maxForce: number };
}

/**
 * Ball and socket joint (3 rotational DOF)
 */
export interface IBallConstraint extends IConstraintBase {
  type: 'ball';
  pivotA: IVector3;
  pivotB?: IVector3;
}

/**
 * Cone twist constraint
 */
export interface IConeConstraint extends IConstraintBase {
  type: 'cone';
  pivotA: IVector3;
  pivotB?: IVector3;
  axisA: IVector3;
  axisB?: IVector3;
  swingSpan1: number;
  swingSpan2: number;
  twistSpan: number;
}

/**
 * Distance constraint
 */
export interface IDistanceConstraint extends IConstraintBase {
  type: 'distance';
  pivotA: IVector3;
  pivotB?: IVector3;
  distance: number;
  stiffness?: number;
  damping?: number;
}

/**
 * Spring constraint
 */
export interface ISpringConstraint extends IConstraintBase {
  type: 'spring';
  pivotA: IVector3;
  pivotB?: IVector3;
  restLength: number;
  stiffness: number;
  damping: number;
}

/**
 * Generic 6-DOF constraint
 */
export interface IGeneric6DOFConstraint extends IConstraintBase {
  type: 'generic6dof';
  frameA: ITransform;
  frameB?: ITransform;
  linearLowerLimit: IVector3;
  linearUpperLimit: IVector3;
  angularLowerLimit: IVector3;
  angularUpperLimit: IVector3;
}

/**
 * Union of all constraint types
 */
export type Constraint =
  | IFixedConstraint
  | IHingeConstraint
  | ISliderConstraint
  | IBallConstraint
  | IConeConstraint
  | IDistanceConstraint
  | ISpringConstraint
  | IGeneric6DOFConstraint;

// ============================================================================
// Collision Detection
// ============================================================================

/**
 * Contact point information
 */
export interface IContactPoint {
  position: IVector3;
  normal: IVector3;
  penetration: number;
  impulse: number;
}

/**
 * Collision event data
 */
export interface ICollisionEvent {
  type: 'begin' | 'persist' | 'end';
  bodyA: string;
  bodyB: string;
  contacts: IContactPoint[];
}

/**
 * Trigger event data
 */
export interface ITriggerEvent {
  type: 'enter' | 'stay' | 'exit';
  triggerBody: string;
  otherBody: string;
}

// ============================================================================
// Spatial Queries
// ============================================================================

/**
 * Ray definition
 */
export interface IRay {
  origin: IVector3;
  direction: IVector3;
  maxDistance?: number;
}

/**
 * Raycast hit result
 */
export interface IRaycastHit {
  bodyId: string;
  point: IVector3;
  normal: IVector3;
  distance: number;
  fraction: number; // 0-1 along ray
}

/**
 * Raycast options
 */
export interface IRaycastOptions {
  filter?: ICollisionFilter;
  excludeBodies?: string[];
  backfaceCulling?: boolean;
  closestOnly?: boolean;
}

/**
 * Shape cast result (sweep test)
 */
export interface IShapeCastHit extends IRaycastHit {
  penetration: number;
}

/**
 * Overlap test result
 */
export interface IOverlapResult {
  bodyId: string;
  penetration: number;
  direction: IVector3;
}

// ============================================================================
// Physics World Interface
// ============================================================================

/**
 * Physics world configuration
 */
export interface IPhysicsWorldConfig {
  gravity?: IVector3;
  fixedTimestep?: number;
  maxSubsteps?: number;
  solverIterations?: number;
  allowSleep?: boolean;
  broadphase?: 'naive' | 'aabb' | 'sap' | 'bvh';
}

/**
 * Physics world simulation interface
 */
export interface IPhysicsWorld {
  // Configuration
  setGravity(gravity: IVector3): void;
  getGravity(): IVector3;

  // Body management
  createBody(config: IRigidBodyConfig): string;
  removeBody(id: string): boolean;
  getBody(id: string): IRigidBodyState | undefined;
  getAllBodies(): IRigidBodyState[];

  // Body manipulation
  setPosition(id: string, position: IVector3): void;
  setRotation(id: string, rotation: IQuaternion): void;
  setTransform(id: string, transform: ITransform): void;
  setLinearVelocity(id: string, velocity: IVector3): void;
  setAngularVelocity(id: string, velocity: IVector3): void;
  applyForce(id: string, force: IVector3, worldPoint?: IVector3): void;
  applyImpulse(id: string, impulse: IVector3, worldPoint?: IVector3): void;
  applyTorque(id: string, torque: IVector3): void;
  applyTorqueImpulse(id: string, impulse: IVector3): void;

  // Constraint management
  createConstraint(constraint: Constraint): string;
  /** Alias for createConstraint — used by HoloScriptPlusRuntime */
  addConstraint?(constraint: Constraint): string;
  removeConstraint(id: string): boolean;
  setConstraintEnabled(id: string, enabled: boolean): void;

  // Simulation
  step(deltaTime: number): void;
  getContacts(): ICollisionEvent[];
  getTriggers(): ITriggerEvent[];

  // Spatial queries
  raycast(ray: IRay, options?: IRaycastOptions): IRaycastHit[];
  raycastClosest(ray: IRay, options?: IRaycastOptions): IRaycastHit | null;
  sphereOverlap(center: IVector3, radius: number, filter?: ICollisionFilter): IOverlapResult[];
  boxOverlap(
    center: IVector3,
    halfExtents: IVector3,
    rotation?: IQuaternion,
    filter?: ICollisionFilter
  ): IOverlapResult[];

  // Cleanup
  dispose(): void;
}

/**
 * Physics world factory
 */
export type PhysicsWorldFactory = (config?: IPhysicsWorldConfig) => IPhysicsWorld;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Create a default identity quaternion
 */
export function identityQuaternion(): IQuaternion {
  return { x: 0, y: 0, z: 0, w: 1 };
}

/**
 * Create a zero vector
 */
export function zeroVector(): IVector3 {
  return { x: 0, y: 0, z: 0 };
}

/**
 * Create a default transform
 */
export function defaultTransform(): ITransform {
  return {
    position: zeroVector(),
    rotation: identityQuaternion(),
    scale: { x: 1, y: 1, z: 1 },
  };
}

/**
 * Create a box shape
 */
export function boxShape(halfExtents: IVector3): IBoxShape {
  return { type: 'box', halfExtents };
}

/**
 * Create a sphere shape
 */
export function sphereShape(radius: number): ISphereShape {
  return { type: 'sphere', radius };
}

/**
 * Create a capsule shape
 */
export function capsuleShape(
  radius: number,
  height: number,
  axis: 'x' | 'y' | 'z' = 'y'
): ICapsuleShape {
  return { type: 'capsule', radius, height, axis };
}

/**
 * Create a dynamic rigid body config
 */
export function dynamicBody(
  id: string,
  shape: CollisionShape,
  mass: number,
  position?: IVector3,
  rotation?: IQuaternion
): IRigidBodyConfig {
  return {
    id,
    type: 'dynamic',
    shape,
    mass,
    transform: {
      position: position ?? zeroVector(),
      rotation: rotation ?? identityQuaternion(),
    },
  };
}

/**
 * Create a static rigid body config
 */
export function staticBody(
  id: string,
  shape: CollisionShape,
  position?: IVector3,
  rotation?: IQuaternion
): IRigidBodyConfig {
  return {
    id,
    type: 'static',
    shape,
    mass: 0,
    transform: {
      position: position ?? zeroVector(),
      rotation: rotation ?? identityQuaternion(),
    },
  };
}

/**
 * Create a kinematic rigid body config
 */
export function kinematicBody(
  id: string,
  shape: CollisionShape,
  position?: IVector3,
  rotation?: IQuaternion
): IRigidBodyConfig {
  return {
    id,
    type: 'kinematic',
    shape,
    mass: 0,
    transform: {
      position: position ?? zeroVector(),
      rotation: rotation ?? identityQuaternion(),
    },
  };
}

/**
 * Create a default physics material
 */
export function defaultMaterial(): IPhysicsMaterial {
  return {
    friction: PHYSICS_DEFAULTS.defaultFriction,
    restitution: PHYSICS_DEFAULTS.defaultRestitution,
  };
}

// ============================================================================
// Unified Particle Types (GAPS Phase 1)
// ============================================================================

/**
 * Particle type enum for the unified particle buffer.
 *
 * All physics entities (fluid, cloth, rigid, debris, crowd) share a single
 * particle buffer in the PBD solver. This type tag determines which
 * constraint shaders apply to each particle.
 *
 * @see docs/specs/pbd-solver-upgrade.md
 */
export enum ParticleType {
  /** Cloth/soft-body mesh vertices — distance, volume, bending constraints */
  CLOTH = 0,
  /** MLS-MPM fluid particles — density constraints, P2G/G2P exchange */
  FLUID = 1,
  /** Rigid body sample points — shape-matching constraints */
  RIGID = 2,
  /** Destruction fragments — one-way: spawned from fracture, no inter-fragment constraints */
  DEBRIS = 3,
  /** Crowd agent proxies — collision avoidance constraints only */
  CROWD = 4,
}

/**
 * Extended particle attributes stored alongside positions/velocities.
 * GPU buffer layout: vec4(type, phase, density, pressure) = 16 bytes/particle.
 */
export interface IParticleAttributes {
  /** ParticleType enum value */
  type: ParticleType;
  /** Phase group (particles in same phase don't self-collide) */
  phase: number;
  /** Current density (for fluid SPH/MPM, 0 for non-fluid) */
  density: number;
  /** Current pressure (derived from density, 0 for non-fluid) */
  pressure: number;
}

// ============================================================================
// Soft-Body / PBD Types
// ============================================================================

/**
 * Soft-body material presets (artist-friendly)
 */
export type SoftBodyPreset = 'rubber' | 'cloth' | 'jelly' | 'flesh' | 'paper';

/**
 * PBD constraint types (extended with density for unified fluid coupling)
 */
export type PBDConstraintType =
  | 'distance'
  | 'volume'
  | 'collision'
  | 'attachment'
  | 'bending'
  | 'density';

/**
 * PBD distance constraint — maintains rest length between two vertices
 */
export interface IPBDDistanceConstraint {
  type: 'distance';
  vertexA: number;
  vertexB: number;
  restLength: number;
  compliance: number;
  colorGroup: number;
}

/**
 * PBD volume constraint — maintains rest volume of a tetrahedron
 */
export interface IPBDVolumeConstraint {
  type: 'volume';
  vertices: [number, number, number, number]; // Tetrahedron indices
  restVolume: number;
  compliance: number;
}

/**
 * PBD bending constraint — resists bending between two adjacent triangles
 */
export interface IPBDBendingConstraint {
  type: 'bending';
  vertices: [number, number, number, number]; // Shared edge v0-v1, opposite v2-v3
  restAngle: number;
  compliance: number;
  colorGroup: number;
}

/**
 * PBD collision constraint — prevents vertex from penetrating SDF
 */
export interface IPBDCollisionConstraint {
  type: 'collision';
  vertexIndex: number;
  contactNormal: IVector3;
  contactDistance: number;
  friction: number;
}

/**
 * PBD attachment constraint — pins a vertex to a world position or rigid body
 */
export interface IPBDAttachmentConstraint {
  type: 'attachment';
  vertexIndex: number;
  targetPosition: IVector3;
  targetBodyId?: string;
  compliance: number;
}

/**
 * Union of all PBD constraint types
 */
export type PBDConstraint =
  | IPBDDistanceConstraint
  | IPBDVolumeConstraint
  | IPBDBendingConstraint
  | IPBDCollisionConstraint
  | IPBDAttachmentConstraint;

/**
 * Soft-body configuration
 */
export interface ISoftBodyConfig {
  /** Unique identifier */
  id: string;
  /** Vertex positions (flat xyz array) */
  positions: Float32Array;
  /** Vertex masses (per-vertex, 0 = pinned) */
  masses: Float32Array;
  /** Triangle indices for surface mesh */
  indices: Uint32Array;
  /** Tetrahedral indices for volume constraints (optional) */
  tetIndices?: Uint32Array;
  /** Edge pairs for distance constraints */
  edges: Uint32Array;
  /** Compliance (inverse stiffness, 0 = infinitely stiff) */
  compliance: number;
  /** Velocity damping 0-1 (1 = no damping) */
  damping: number;
  /** Collision margin for SDF testing */
  collisionMargin: number;
  /** Number of solver iterations per step */
  solverIterations: number;
  /** Enable self-collision via spatial hashing */
  selfCollision: boolean;
  /** Self-collision hash grid cell size */
  selfCollisionCellSize?: number;
  /** Artist preset (overrides compliance/damping) */
  preset?: SoftBodyPreset;
  /** Gravity override (defaults to world gravity) */
  gravity?: IVector3;
  /** External wind force */
  wind?: IVector3;
}

/**
 * Soft-body runtime state
 */
export interface ISoftBodyState {
  id: string;
  /** Current positions (flat xyz) */
  positions: Float32Array;
  /** Current velocities (flat xyz) */
  velocities: Float32Array;
  /** Predicted positions (used during solve) */
  predicted: Float32Array;
  /** Vertex normals (flat xyz, recomputed each frame) */
  normals: Float32Array;
  /** Current volume (for volume constraints) */
  volume: number;
  /** Rest volume */
  restVolume: number;
  /** Average deformation from rest shape */
  deformationAmount: number;
  /** Center of mass */
  centerOfMass: IVector3;
  /** Whether the simulation is active */
  isActive: boolean;
}

/**
 * SDF collider for soft-body collision
 */
export interface ISDFCollider {
  /** Collider body ID */
  bodyId: string;
  /** SDF grid dimensions */
  gridSize: [number, number, number];
  /** SDF values (flat array, one per grid cell) */
  sdfData: Float32Array;
  /** World-space bounding box min */
  boundsMin: IVector3;
  /** World-space bounding box max */
  boundsMax: IVector3;
  /** Grid cell size */
  cellSize: number;
  /** Friction coefficient */
  friction: number;
}

/**
 * Soft-body preset parameters
 */
export const SOFT_BODY_PRESETS: Record<
  SoftBodyPreset,
  {
    compliance: number;
    damping: number;
    solverIterations: number;
    selfCollision: boolean;
  }
> = {
  rubber: { compliance: 0.001, damping: 0.98, solverIterations: 20, selfCollision: false },
  cloth: { compliance: 0.1, damping: 0.95, solverIterations: 15, selfCollision: true },
  jelly: { compliance: 0.05, damping: 0.97, solverIterations: 12, selfCollision: false },
  flesh: { compliance: 0.01, damping: 0.99, solverIterations: 20, selfCollision: false },
  paper: { compliance: 0.5, damping: 0.9, solverIterations: 8, selfCollision: true },
};

/**
 * Graph coloring result for parallel constraint solving
 */
export interface IConstraintColoring {
  /** Number of color groups */
  numColors: number;
  /** Color assigned to each constraint */
  colors: Uint32Array;
  /** Constraint indices sorted by color group */
  sortedIndices: Uint32Array;
  /** Start offset per color group in sortedIndices */
  groupOffsets: Uint32Array;
  /** Count per color group */
  groupCounts: Uint32Array;
}

/**
 * Spatial hash grid for self-collision detection
 */
export interface ISpatialHashGrid {
  /** Grid cell size */
  cellSize: number;
  /** Grid dimensions */
  gridDimX: number;
  gridDimY: number;
  gridDimZ: number;
  /** Grid origin (world-space min corner) */
  origin: IVector3;
  /** Vertex count per cell */
  cellCounts: Uint32Array;
  /** Prefix-sum offsets per cell */
  cellOffsets: Uint32Array;
  /** Vertex indices sorted by cell */
  sortedVerts: Uint32Array;
  /** Cell index per vertex */
  vertexCells: Uint32Array;
}

/**
 * Validate a rigid body configuration
 */
export function validateBodyConfig(config: IRigidBodyConfig): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!config.id) {
    errors.push('Body must have an id');
  }

  if (!config.shape) {
    errors.push('Body must have a shape');
  }

  if (config.type === 'dynamic' && (config.mass === undefined || config.mass <= 0)) {
    errors.push('Dynamic body must have positive mass');
  }

  if (config.mass !== undefined && config.mass < 0) {
    errors.push('Mass cannot be negative');
  }

  if (config.linearDamping !== undefined && config.linearDamping < 0) {
    errors.push('Linear damping cannot be negative');
  }

  if (config.angularDamping !== undefined && config.angularDamping < 0) {
    errors.push('Angular damping cannot be negative');
  }

  return { valid: errors.length === 0, errors };
}
