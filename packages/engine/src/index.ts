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

// Physics subsystem (A.011.01b)
export * as Physics from './physics';

// Runtime subsystem (A.011.01e)
export * as Runtime from './runtime';

// Audio subsystem (A.011.01d)
export * as Audio from './audio';

// VR subsystem (A.011.01f)
export * as VR from './vr';

// Input subsystem (A.011.01f)
export * as Input from './input';

// Camera subsystem (A.011.01f)
export * as Camera from './camera';

// Navigation subsystem (A.011.01f)
export * as Navigation from './navigation';

// Particle subsystem (A.011.01g)
export * as Particles from './particles';

// Terrain subsystem (A.011.01g)
export * as Terrain from './terrain';

// Tilemap subsystem (A.011.01g)
export * as Tilemap from './tilemap';

// Procedural subsystem (A.011.01g)
export * as Procedural from './procedural';

// Gameplay subsystem (A.011.01h)
export * as Combat from './combat';
export * as Dialogue from './dialogue';
export * as Gameplay from './gameplay';
export * as Character from './character';

// Spatial infrastructure subsystem (A.011.01i)
export * as ECS from './ecs';
export * as Scene from './scene';
export * as Environment from './environment';
export * as World from './world';
export * as Orbital from './orbital';

// Hologram subsystem (A.011.01j)
export * as Hologram from './hologram';

// ── Subsystems to be migrated from @holoscript/core ───────────────────
// Each section will become a re-export once code is moved into src/<subsystem>/

// DONE(A.011.01d): audio — spatial audio, audio graph, listener
// DONE(A.011.01f): vr — WebXR session, controllers, hand tracking, haptics
// DONE(A.011.01f): input — keyboard, mouse, gamepad, touch, gesture
// DONE(A.011.01f): camera — orbit, fly, follow, cinematic cameras
// DONE(A.011.01f): navigation — navmesh, pathfinding, crowd simulation
// DONE(A.011.01g): particles — particle emitters, forces, GPU particles
// DONE(A.011.01g): terrain — heightmap, voxel, infinite terrain, LOD chunks
// DONE(A.011.01g): tilemap — 2D/isometric tile layers, auto-tiling
// DONE(A.011.01g): procedural — noise, L-systems, WFC, dungeon gen
// TODO(A.011): combat — hitbox, damage, projectile, targeting
// TODO(A.011): dialogue — dialogue trees, branching, localization hooks
// TODO(A.011): gameplay — inventory, quest, scoring, state machines
// TODO(A.011): character — character controller, movement, stats
// DONE(A.011.01i): ecs — entity-component-system core, archetype storage
// DONE(A.011.01i): scene — scene graph, hierarchy, transform propagation
// DONE(A.011.01i): environment — skybox, fog, weather, day-night cycle
// DONE(A.011.01i): world — world streaming, spatial indexing, octree
// DONE(A.011.01i): orbital — orbital mechanics, celestial bodies, gravity wells
// TODO(A.011): hologram — depth estimation, quilt compiler, looking glass
// DONE(A.011.01a): shader — shader graph, custom materials, uniforms (in rendering)
// DONE(A.011.01a): materials — PBR, toon, unlit, material library (in rendering)
// TODO(A.011): lod — level of detail, imposters, distance culling
// DONE(A.011.01a): postfx — bloom, SSAO, DOF, tone mapping, color grading (in rendering)


