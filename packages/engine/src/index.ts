/**
 * @holoscript/engine
 *
 * Engine runtime extracted from @holoscript/core (~100K LOC).
 * Each subsystem below will be populated as code is migrated from core.
 *
 * @packageDocumentation
 */

// â”€â”€ Existing engine primitives â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

// â”€â”€ Subsystems to be migrated from @holoscript/core â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Each section will become a re-export once code is moved into src/<subsystem>/

// DONE(A.011.01d): audio â€” spatial audio, audio graph, listener
// TODO(A.011): vr â€” WebXR session, controllers, hand tracking, haptics
// TODO(A.011): input â€” keyboard, mouse, gamepad, touch, gesture
// TODO(A.011): camera â€” orbit, fly, follow, cinematic cameras
// TODO(A.011): navigation â€” navmesh, pathfinding, crowd simulation
// TODO(A.011): particles â€” particle emitters, forces, GPU particles
// TODO(A.011): terrain â€” heightmap, voxel, infinite terrain, LOD chunks
// TODO(A.011): tilemap â€” 2D/isometric tile layers, auto-tiling
// TODO(A.011): procedural â€” noise, L-systems, WFC, dungeon gen
// TODO(A.011): combat â€” hitbox, damage, projectile, targeting
// TODO(A.011): dialogue â€” dialogue trees, branching, localization hooks
// TODO(A.011): gameplay â€” inventory, quest, scoring, state machines
// TODO(A.011): character â€” character controller, movement, stats
// TODO(A.011): ecs â€” entity-component-system core, archetype storage
// TODO(A.011): scene â€” scene graph, hierarchy, transform propagation
// TODO(A.011): environment â€” skybox, fog, weather, day-night cycle
// TODO(A.011): world â€” world streaming, spatial indexing, octree
// TODO(A.011): orbital â€” orbital mechanics, celestial bodies, gravity wells
// TODO(A.011): hologram â€” depth estimation, quilt compiler, looking glass
// DONE(A.011.01a): shader â€” shader graph, custom materials, uniforms (in rendering)
// DONE(A.011.01a): materials â€” PBR, toon, unlit, material library (in rendering)
// TODO(A.011): lod â€” level of detail, imposters, distance culling
// DONE(A.011.01a): postfx â€” bloom, SSAO, DOF, tone mapping, color grading (in rendering)

