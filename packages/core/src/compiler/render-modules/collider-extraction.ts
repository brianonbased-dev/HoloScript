// Collider extraction — a NON-render consumer of the shared geometry vocabulary.
//
// This is the proof of the "one shape, many domains" axis: the render target turns a
// geometry primitive into WGSL vertices; a PHYSICS target turns the SAME primitive
// (resolved by the same geometry-registry) into a collider shape. No duplicated shape
// logic — the registry is the single source of geometry truth, and each domain reads
// the canonical `GeometryPrimitiveKind` its own way. Shapes here map 1:1 to a real
// physics engine (Rapier: cuboid / ball / cylinder / cone / capsule / halfspace / hull).

import type { GeometryPrimitiveKind } from './geometry-registry';

export type ColliderShapeKind =
  | 'cuboid'
  | 'ball'
  | 'cylinder'
  | 'cone'
  | 'capsule'
  | 'halfspace'
  | 'hull';

export interface ColliderTransform {
  /** World translation [x,y,z]. */
  readonly position: number[];
  /** Per-axis scale [x,y,z]. */
  readonly scale: number[];
  /** Euler rotation in degrees [x,y,z] (physics keeps orientation the render path drops). */
  readonly rotation?: number[];
}

export interface ColliderDescriptor {
  readonly shape: ColliderShapeKind;
  /** cuboid: [hx,hy,hz]. */
  readonly halfExtents?: number[];
  /** ball: radius. */
  readonly radius?: number;
  /** cylinder/cone/capsule: half of the primary-axis length. */
  readonly halfHeight?: number;
  /** World translation. */
  readonly translation: number[];
  /** Euler rotation degrees. */
  readonly rotation: number[];
  /** True when the primitive has no exact collider and a bounding envelope was used (e.g. torus). */
  readonly approximated?: boolean;
}

// The registry's generators use fixed unit sizes (cube 1.0 → half-extent 0.5; sphere
// radius 0.5; plane 1×1; cylinder/cone radius 0.5, height 1.0), so world extents are
// simply those unit sizes times the object's scale. Kept in lockstep with the
// generator params in geometry-registry.ts / emitGeometryHelpers.
const PLANE_THICKNESS = 0.02;

function maxAbs(a: number[]): number {
  return Math.max(...a.map((n) => Math.abs(n)));
}

/**
 * Map a canonical geometry primitive + transform to a physics collider descriptor.
 * The primitive comes from the SAME registry the render target uses.
 */
export function resolveCollider(
  primitive: GeometryPrimitiveKind,
  transform: ColliderTransform
): ColliderDescriptor {
  const [sx, sy, sz] = transform.scale.length >= 3 ? transform.scale : [1, 1, 1];
  const translation = transform.position.length >= 3 ? transform.position : [0, 0, 0];
  const rotation =
    transform.rotation && transform.rotation.length >= 3 ? transform.rotation : [0, 0, 0];
  const base = { translation, rotation };
  switch (primitive) {
    case 'box':
      return {
        shape: 'cuboid',
        halfExtents: [Math.abs(sx) * 0.5, Math.abs(sy) * 0.5, Math.abs(sz) * 0.5],
        ...base,
      };
    case 'sphere':
      return { shape: 'ball', radius: 0.5 * maxAbs([sx, sy, sz]), ...base };
    case 'plane':
      // Registry plane is flat in XZ (y≈0) — a thin cuboid slab is the honest collider.
      return {
        shape: 'cuboid',
        halfExtents: [Math.abs(sx) * 0.5, PLANE_THICKNESS, Math.abs(sz) * 0.5],
        ...base,
      };
    case 'cylinder':
      return {
        shape: 'cylinder',
        halfHeight: Math.abs(sy) * 0.5,
        radius: 0.5 * Math.max(Math.abs(sx), Math.abs(sz)),
        ...base,
      };
    case 'cone':
      return {
        shape: 'cone',
        halfHeight: Math.abs(sy) * 0.5,
        radius: 0.5 * Math.max(Math.abs(sx), Math.abs(sz)),
        ...base,
      };
    case 'torus':
      // No exact primitive collider — use a solid-cylinder envelope of the ring.
      return {
        shape: 'cylinder',
        halfHeight: 0.15 * Math.abs(sy),
        radius: 0.65 * Math.max(Math.abs(sx), Math.abs(sz)),
        approximated: true,
        ...base,
      };
    default: {
      // Exhaustiveness guard: a new GeometryPrimitiveKind must be handled above.
      const _exhaustive: never = primitive;
      void _exhaustive;
      return { shape: 'ball', radius: 0.5, approximated: true, ...base };
    }
  }
}
