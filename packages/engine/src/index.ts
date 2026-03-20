/**
 * @holoscript/engine — Spatial Runtime Engine
 *
 * Re-exports runtime, networking, rendering, physics, spatial, ECS from @holoscript/core.
 * ~84K LOC combined.
 *
 * Usage:
 *   import { World, Entity, System } from '@holoscript/engine';
 */

// Re-export from the core package entrypoint.
// DTS build cannot resolve private subpath imports like '@holoscript/core/runtime'.
export * from '@holoscript/core';
