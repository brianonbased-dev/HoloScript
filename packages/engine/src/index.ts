/**
 * @holoscript/engine — Spatial Runtime Engine
 *
 * Re-exports runtime, networking, rendering, physics, spatial, ECS from @holoscript/core.
 * ~84K LOC combined.
 *
 * Usage:
 *   import { World, Entity, System } from '@holoscript/engine';
 */

// Re-export runtime subsystem from core subpath
// Phase 2: runtime/network/rendering/physics/spatial/ecs source files will be moved here
export * from '@holoscript/core/runtime';
