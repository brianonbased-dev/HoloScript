// Geometry extent — the SINGLE numeric source of truth for an object's world size.
//
// Root cause of the render-vs-physics "ghost sink" bug (and its whole family): render
// size and physics/collision size were re-derived independently in four+ files, agreeing
// only by matched literals and comments. Spheres were once drawn at 2x their collision
// radius (base gen_sphere(1.0) x model scale [r*2]) — a physics-resting ball drawn
// half-sunk. Nothing failed. This module gives EVERY layer one place to read size from,
// and the geometry-consistency gate asserts the compilers' emitted numbers match it.
//
// CONVENTIONS (all one number, defined once):
//  - Authoring: a `scale` of 1 means an object "radius" of 0.5 (diameter 1). So the
//    collision radius of a sphere is 0.5 * max(|scale|).
//  - Render base meshes are UNIT-DIAMETER: gen_sphere(0.5) (radius 0.5), gen_cube(1.0)
//    (half-extent 0.5). The render model matrix then scales them to world size.
//  - Sphere render model scale = collisionRadius * RENDER_DIAMETER_FACTOR against the
//    radius-0.5 base, so rendered radius = BASE_SPHERE_RADIUS * (collisionRadius*2) =
//    collisionRadius. The load-bearing invariant is therefore:
//        BASE_SPHERE_RADIUS * RENDER_DIAMETER_FACTOR === 1
//    i.e. render radius === collision radius. gen_sphere(1.0) breaks it (0.5*... no:
//    1.0 base * 2 = 2, render radius = 2 * collisionRadius). The gate catches exactly that.
//
// NON-UNIFORM POLICY (documented, not silent): for a non-uniform sphere scale the
// ComputePhysics target renders AND collides a single circumscribing ball of radius
// 0.5*max(scale) (render == physics WITHIN that target). The WebGPU/Desktop *visual*
// targets may render a per-axis ellipsoid (0.5*scale each) — that is a deliberate
// render-only divergence, NOT a physics target, so it is out of scope for the
// render-vs-physics equality the gate enforces on ComputePhysics.

export const BASE_SPHERE_RADIUS = 0.5; // gen_sphere(0.5): unit-diameter base mesh
export const BASE_CUBE_HALF = 0.5; // gen_cube(1.0): half-extent 0.5, unit cube
export const RENDER_DIAMETER_FACTOR = 2; // sphere render model scale = collisionRadius * 2
export const PLANE_THICKNESS = 0.02; // canonical plane half-thickness (see follow-up: ComputePhysics still emits 0.05)

/** Load-bearing invariant: render radius === collision radius. Must be exactly 1. */
export const RENDER_EQUALS_PHYSICS_INVARIANT = BASE_SPHERE_RADIUS * RENDER_DIAMETER_FACTOR;

const maxAbs = (s: readonly number[]): number =>
  Math.max(Math.abs(s[0] ?? 1), Math.abs(s[1] ?? 1), Math.abs(s[2] ?? 1));

/** Collision (and, for ComputePhysics, render) radius of a round primitive. scale of 1 -> 0.5. */
export function sphereCollisionRadius(scale: readonly number[]): number {
  return 0.5 * maxAbs(scale);
}

/** Half-extents of a box AABB. scale of s -> half |s|/2 per axis. */
export function boxHalfExtents(scale: readonly number[]): [number, number, number] {
  return [
    0.5 * Math.abs(scale[0] ?? 1),
    0.5 * Math.abs(scale[1] ?? 1),
    0.5 * Math.abs(scale[2] ?? 1),
  ];
}

export interface WorldExtent {
  readonly kind: string;
  /** circumscribing-ball radius for round primitives (sphere/torus-as-sphere). */
  readonly collisionRadius?: number;
  /** AABB half-extents for boxes/planes. */
  readonly halfExtents?: [number, number, number];
  /** The model-matrix scale a UNIT-DIAMETER sphere base must receive to render at collisionRadius. */
  readonly sphereRenderModelScale?: number;
  /** True when the compiler substitutes a different collision shape than authored (must be flagged, never silent). */
  readonly substituted?: boolean;
}

/** One resolver every layer consumes; returns both the physics extent and the render scale. */
export function resolveWorldExtent(kind: string, scale: readonly number[]): WorldExtent {
  const k = kind.toLowerCase();
  if (k === 'sphere') {
    const r = sphereCollisionRadius(scale);
    return {
      kind: 'sphere',
      collisionRadius: r,
      sphereRenderModelScale: r * RENDER_DIAMETER_FACTOR,
    };
  }
  if (k === 'torus') {
    // ComputePhysics substitutes torus -> circumscribing sphere (flagged, not silent).
    const r = sphereCollisionRadius(scale);
    return {
      kind: 'torus',
      collisionRadius: r,
      sphereRenderModelScale: r * RENDER_DIAMETER_FACTOR,
      substituted: true,
    };
  }
  if (k === 'plane') {
    const h = boxHalfExtents(scale);
    return { kind: 'plane', halfExtents: [h[0], PLANE_THICKNESS, h[2]] };
  }
  return { kind: 'box', halfExtents: boxHalfExtents(scale) };
}
