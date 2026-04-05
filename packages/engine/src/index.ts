/**
 * @holoscript/engine
 *
 * Engine runtime extracted from @holoscript/core (~100K LOC).
 * Each subsystem below will be populated as code is migrated from core.
 *
 * @packageDocumentation
 */

// ── Existing engine primitives ────────────────────────────────────────

export {
  SpatialEngine,
  type EngineConfig,
  type EngineMetrics,
  type EngineState,
  type EngineSystem,
} from './SpatialEngine';

export {
  PhysicsStep,
  type Vec3,
  type PhysicsBodyState,
  type CollisionEvent,
  type CollisionCallback,
} from './PhysicsStep';

// Rendering subsystem (A.011.01a)
export * as Rendering from './rendering';
export * from './rendering';

// Animation subsystem (A.011.01c)
export * as Animation from './animation';
export * from './animation';

// Physics subsystem (A.011.01b)
export * as Physics from './physics';
export * from './physics';

// Runtime subsystem (A.011.01e)
export * as Runtime from './runtime';
export * from './runtime';

// ── Subsystems to be migrated from @holoscript/core ───────────────────
// Each section will become a re-export once code is moved into src/<subsystem>/

// TODO(A.011): audio — spatial audio, audio graph, listener
// TODO(A.011): vr — WebXR session, controllers, hand tracking, haptics
// TODO(A.011): input — keyboard, mouse, gamepad, touch, gesture
// TODO(A.011): camera — orbit, fly, follow, cinematic cameras
// TODO(A.011): navigation — navmesh, pathfinding, crowd simulation
// TODO(A.011): particles — particle emitters, forces, GPU particles
// TODO(A.011): terrain — heightmap, voxel, infinite terrain, LOD chunks
// TODO(A.011): tilemap — 2D/isometric tile layers, auto-tiling
// TODO(A.011): procedural — noise, L-systems, WFC, dungeon gen
// TODO(A.011): combat — hitbox, damage, projectile, targeting
// TODO(A.011): dialogue — dialogue trees, branching, localization hooks
// TODO(A.011): gameplay — inventory, quest, scoring, state machines
// TODO(A.011): character — character controller, movement, stats
// TODO(A.011): ecs — entity-component-system core, archetype storage
// TODO(A.011): scene — scene graph, hierarchy, transform propagation
// TODO(A.011): environment — skybox, fog, weather, day-night cycle
// TODO(A.011): world — world streaming, spatial indexing, octree
// TODO(A.011): orbital — orbital mechanics, celestial bodies, gravity wells
// TODO(A.011): hologram — depth estimation, quilt compiler, looking glass
// TODO(A.011): shader — shader graph, custom materials, uniforms
// TODO(A.011): materials — PBR, toon, unlit, material library
// TODO(A.011): lod — level of detail, imposters, distance culling
// TODO(A.011): postfx — bloom, SSAO, DOF, tone mapping, color grading
