/**
 * Physics module
 *
 * Provides rigid body dynamics, collision detection, constraint solving,
 * and spatial queries for the HoloScript engine.
 *
 * @module physics
 */

// Types
export {
  // Vector & Transform
  type IVector3,
  type IQuaternion,
  zeroVector,
  type ITransform,
  identityQuaternion,
  defaultTransform,

  // Collision shapes
  type IBoxShape,
  type ISphereShape,
  type ICapsuleShape,
  type ICylinderShape,
  type IConeShape,
  type IConvexShape,
  type IMeshShape,
  type IHeightfieldShape,
  type ICompoundShape,
  type CollisionShape,

  // Body configuration
  type BodyType,
  type IPhysicsMaterial,
  type ICollisionFilter,
  type IRigidBodyConfig,
  type IRigidBodyState,

  // Constraints
  type IFixedConstraint,
  type IHingeConstraint,
  type ISliderConstraint,
  type IBallConstraint,
  type IConeConstraint,
  type IDistanceConstraint,
  type ISpringConstraint,
  type IGeneric6DOFConstraint,
  type Constraint,

  // Spatial queries
  type IRay,
  type IRaycastHit,
  type IRaycastOptions,
  type IOverlapResult,

  // Events
  type ICollisionEvent,
  type ITriggerEvent,

  // World
  type IPhysicsWorldConfig,
  type IPhysicsWorld,

  // Constants
  PHYSICS_DEFAULTS,
  COLLISION_GROUPS,

  // Helper functions
  boxShape,
  sphereShape,
  capsuleShape,
  defaultMaterial,
  dynamicBody,
  staticBody,
  kinematicBody,
  validateBodyConfig,
} from './PhysicsTypes';

// Body
export { RigidBody } from './PhysicsBody';

// World
export { PhysicsWorldImpl, createPhysicsWorld } from './PhysicsWorldImpl';

// Island detection
export { IslandDetector } from './IslandDetector';

// PBD Soft-Body Solver
export {
  PBDSolverCPU,
  createPBDSolver,
  colorConstraints,
  generateTetrahedra,
  extractEdges,
  computeRestLengths,
  generateSDF,
  // WGSL compute shaders (for GPU path)
  PBD_PREDICT_SHADER,
  PBD_DISTANCE_SHADER,
  PBD_VOLUME_SHADER,
  PBD_COLLISION_SHADER,
  PBD_VELOCITY_SHADER,
  PBD_FINALIZE_SHADER,
  PBD_NORMALS_SHADER,
  PBD_NORMALIZE_SHADER,
  PBD_BENDING_SHADER,
  PBD_ATTACHMENT_SHADER,
  PBD_HASH_BUILD_SHADER,
  PBD_SELF_COLLISION_SHADER,
  // Utilities
  extractBendingPairs,
} from './PBDSolver';

// Soft-body grab interaction
export { SoftBodyGrabController, type GrabConfig } from './SoftBodyGrabController';

// Soft-body types
export {
  type SoftBodyPreset,
  type PBDConstraintType,
  type IPBDDistanceConstraint,
  type IPBDVolumeConstraint,
  type IPBDBendingConstraint,
  type IPBDCollisionConstraint,
  type IPBDAttachmentConstraint,
  type PBDConstraint,
  type ISoftBodyConfig,
  type ISoftBodyState,
  type ISDFCollider,
  type IConstraintColoring,
  type ISpatialHashGrid,
  SOFT_BODY_PRESETS,
} from './PhysicsTypes';

// MLS-MPM Fluid Simulation (GPU)
export { MLSMPMFluid, type MLSMPMConfig, type MLSMPMStats } from './MLSMPMFluid';

// Unified Particle Buffer (MLS-MPM ↔ PBD coupling)
export {
  UnifiedParticleBuffer,
  type ParticleRange,
  type BoundaryCoupling,
  type UnifiedBufferStats,
} from './UnifiedParticleBuffer';

// Physics Sync Protocol (WebRTC binary, Tier 2)
export {
  PhysicsSyncSender,
  PhysicsSyncReceiver,
  parsePacketHeader,
  type PhysicsSyncConfig,
  type SyncPacketHeader,
  type SyncStats,
} from './PhysicsSyncProtocol';

// Particle types (GAPS unified buffer)
export { ParticleType, type IParticleAttributes } from './PhysicsTypes';

// PID Controller (generic cascade controller for robotics/VR)
export {
  PIDController,
  VelocityRingBuffer,
  ScalarArithmetic,
  Vector3Arithmetic,
  defaultPIDConfig,
  createScalarPIDController,
  createVector3PIDController,
  createPIDControllerTrait,
  type PIDArithmetic,
  type PIDGains,
  type LoopTimingConfig,
  type PIDControllerConfig,
  type PIDControllerState,
  type PIDControllerTraitConfig,
} from './PIDController';
