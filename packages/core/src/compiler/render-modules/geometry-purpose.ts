// Geometry PURPOSE + visibility — the target-agnostic axis of the geometry system.
//
// A shape (resolved by geometry-registry.ts) is just math. What a shape is FOR is a
// separate, orthogonal fact: is it a visible render surface, or invisible functional
// geometry — a physics collider, a VFX emitter volume, a simulation domain, a nav
// mesh, an audio zone, an occluder, a trigger? The founder's rule: geometry carries
// `visible` + `purpose`, so every consumer reads the SAME primitives and takes only
// the ones it cares about — the render target draws the visible ones, a physics
// compiler reads the colliders, a VFX compiler reads the emitters, a sim compiler
// reads the domains — all off one shared vocabulary, no duplicated shape logic.
//
// This module owns ONLY the classification (pure, testable, no emission). Each target
// compiler consumes it its own way; the WebGPU (render) target skips non-visible roles.

export type GeometryPurpose =
  | 'render' // a visible surface (the default)
  | 'collision' // a physics collider
  | 'trigger' // an interaction / trigger volume
  | 'vfx_emitter' // a particle / VFX spawn volume
  | 'sim_domain' // a simulation domain / field region
  | 'navmesh' // a navigation mesh
  | 'occluder' // occlusion geometry (culling only)
  | 'audio_zone'; // a spatial-audio volume

export interface GeometryRole {
  /** What this geometry is FOR. */
  readonly purpose: GeometryPurpose;
  /** Whether a RENDER target should draw it (functional geometry is invisible by default). */
  readonly visible: boolean;
}

// Purposes that are invisible to the render target unless explicitly overridden.
const INVISIBLE_PURPOSES = new Set<GeometryPurpose>([
  'collision',
  'trigger',
  'vfx_emitter',
  'sim_domain',
  'navmesh',
  'occluder',
  'audio_zone',
]);

// Trait names that imply a functional purpose (so `object ... traits: [collider]`
// works without a separate `purpose:` prop). Growable, one line per alias.
const PURPOSE_TRAITS: Record<string, GeometryPurpose> = {
  collider: 'collision',
  collision: 'collision',
  physics_collider: 'collision',
  rigidbody_collider: 'collision',
  trigger: 'trigger',
  trigger_volume: 'trigger',
  interaction_volume: 'trigger',
  emitter: 'vfx_emitter',
  vfx_emitter: 'vfx_emitter',
  particle_emitter: 'vfx_emitter',
  spawn_volume: 'vfx_emitter',
  sim_domain: 'sim_domain',
  sim_volume: 'sim_domain',
  fluid_domain: 'sim_domain',
  field_region: 'sim_domain',
  navmesh: 'navmesh',
  nav_mesh: 'navmesh',
  occluder: 'occluder',
  occlusion: 'occluder',
  audio_zone: 'audio_zone',
  audio_volume: 'audio_zone',
};

const ALL_PURPOSES = new Set<GeometryPurpose>(['render', ...Array.from(INVISIBLE_PURPOSES)]);

function coerceBool(v: unknown): boolean | undefined {
  if (v === true || v === 'true') return true;
  if (v === false || v === 'false') return false;
  return undefined;
}

/**
 * Classify an object's geometry role from its `purpose` prop, `visible` prop, and
 * traits. Precedence: explicit `purpose` prop → a purpose-implying trait → `render`.
 * Visibility defaults to (purpose === 'render'); an explicit `visible` prop always
 * wins (so a collider can be made visible for debugging, or a mesh hidden).
 */
export function resolveGeometryRole(opts: {
  purpose?: unknown;
  visible?: unknown;
  traitNames?: string[];
}): GeometryRole {
  let purpose: GeometryPurpose = 'render';
  const p = String(opts.purpose ?? '')
    .trim()
    .toLowerCase() as GeometryPurpose;
  if (p && ALL_PURPOSES.has(p)) {
    purpose = p;
  } else {
    for (const t of opts.traitNames ?? []) {
      const mapped = PURPOSE_TRAITS[String(t).trim().toLowerCase()];
      if (mapped) {
        purpose = mapped;
        break;
      }
    }
  }
  const explicit = coerceBool(opts.visible);
  const visible = explicit !== undefined ? explicit : purpose === 'render';
  return { purpose, visible };
}

/** All purposes the classifier understands (for diagnostics/tests). */
export function knownGeometryPurposes(): GeometryPurpose[] {
  return Array.from(ALL_PURPOSES);
}
