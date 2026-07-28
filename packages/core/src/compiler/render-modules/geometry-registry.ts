// Shared geometry resolution — Slice 1 of the RenderModule architecture.
//
// Single home for `mesh:` name -> primitive resolution (previously an inline map
// in WebGPUCompiler with a hard cube fallback). Growing the shape vocabulary is a
// data edit HERE, not compiler surgery — and because resolution is separated from
// target emission, non-render consumers (physics colliders, vfx emitters, simsci
// domains) can resolve the SAME primitive vocabulary and translate it their own way.
//
// `kind` is the target-agnostic canonical primitive; `webgpuVertexFn` is the exact
// generator-call string the sovereign WebGPU compiler emits (kept byte-identical to
// the legacy `geometryVertexDataFn` so the render-module extraction is provably
// behavior-preserving under the webgpu-golden snapshot).

export type GeometryPrimitiveKind = 'box' | 'sphere' | 'plane' | 'cylinder' | 'cone' | 'torus';

export interface GeometryResolution {
  /** Target-agnostic canonical primitive (consumed by render AND future physics/vfx/sim). */
  readonly kind: GeometryPrimitiveKind;
  /** Exact WebGPU vertex-generator call emitted into the surface (interleaved pos+normal). */
  readonly webgpuVertexFn: string;
}

// Canonical primitives + their exact WebGPU generator calls. The parameter values
// here reproduce the historical `geometryVertexDataFn` output byte-for-byte.
const PRIMITIVE: Record<GeometryPrimitiveKind, GeometryResolution> = {
  box: { kind: 'box', webgpuVertexFn: 'generateCubeVertices(1.0)' },
  sphere: { kind: 'sphere', webgpuVertexFn: 'generateSphereVertices(0.5, 16, 16)' },
  plane: { kind: 'plane', webgpuVertexFn: 'generatePlaneVertices(1.0, 1.0)' },
  cylinder: { kind: 'cylinder', webgpuVertexFn: 'generateCylinderVertices(0.5, 1.0, 16)' },
  cone: { kind: 'cone', webgpuVertexFn: 'generateConeVertices(0.5, 1.0, 16)' },
  torus: { kind: 'torus', webgpuVertexFn: 'generateTorusVertices(0.5, 0.15, 16, 32)' },
};

// mesh-name aliases -> canonical primitive. This is the growable vocabulary; adding a
// domain mesh name is one line here. Names are matched case-insensitively.
const ALIAS: Record<string, GeometryPrimitiveKind> = {
  // box family (panels, rounded boxes read as boxes)
  cube: 'box',
  box: 'box',
  rounded_panel: 'box',
  rounded_box: 'box',
  panel: 'box',
  card: 'box',
  // sphere family
  sphere: 'sphere',
  orb: 'sphere',
  ball: 'sphere',
  bubble: 'sphere',
  procedural_upper_body: 'sphere',
  avatar: 'sphere',
  // plane / surface family
  plane: 'plane',
  quad: 'plane',
  surface: 'plane',
  full_screen_fluid_plane: 'plane',
  fluid_plane: 'plane',
  water: 'plane',
  // cylinder family
  cylinder: 'cylinder',
  tube: 'cylinder',
  pillar: 'cylinder',
  capsule: 'cylinder',
  // cone family
  cone: 'cone',
  pyramid: 'cone',
  spike: 'cone',
  crystal: 'cone',
  diamond: 'cone',
  gem: 'cone',
  // torus family
  torus: 'torus',
  ring: 'torus',
  donut: 'torus',
};

/**
 * Resolve a HoloScript `mesh:` name (or template mesh) to a canonical primitive.
 * Unknown names fall back to `box` — the safe universal placeholder.
 */
export function resolveGeometry(meshType: string | undefined | null): GeometryResolution {
  const key = String(meshType ?? '')
    .trim()
    .toLowerCase();
  const kind = ALIAS[key] ?? 'box';
  return PRIMITIVE[kind];
}

/** All mesh names the registry currently understands (for diagnostics/tests). */
export function knownMeshNames(): string[] {
  return Object.keys(ALIAS);
}
