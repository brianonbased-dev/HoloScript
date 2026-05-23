/**
 * ConjectureGenerator is the GENERATE leg of the conjecture engine: instead of
 * a hand-coded one-off candidate, it emits a *parametric family* of
 * `GeometryConjectureCandidate`s across a swept parameter. A conjecture is then
 * evaluated over the whole family — it survives only if every generated member
 * passes, and a falsifier identifies the exact parameter value that broke the
 * invariant. This is the "discover" leg: the machine generates the candidates
 * and discovers the falsifying parameter, rather than a human supplying one.
 *
 * Receipt-carrying geometry (deterministic invariant probes), NOT a Lean proof.
 */

import type { GeometryConjectureCandidate } from './ConjectureEngine';

export interface RegularPolygonSheetFamilyOptions {
  /** Smallest polygon (inclusive). Must be >= 3. Default 3. */
  minSides?: number;
  /** Largest polygon (inclusive). Default 8. */
  maxSides?: number;
  /** Circumradius of each generated polygon. Default 1. */
  radius?: number;
}

export interface CollapsingTriangleFamilyOptions {
  /** Number of swept steps (inclusive endpoints). Must be >= 2. Default 6. */
  steps?: number;
  /** Apex height at the first step. Default 1. */
  startHeight?: number;
  /** Apex height at the final step. Default 0 (collinear/degenerate). */
  endHeight?: number;
}

export interface SharedEdgeFanFamilyOptions {
  /** Largest blade count (inclusive). Must be >= 1. Default 4. */
  maxBlades?: number;
}

export interface CollisionEquivalenceFamilyOptions {
  /** Rotation sweep in degrees. Default [0, 45]. */
  rotationsDegrees?: ReadonlyArray<number>;
  /** Half-width/half-height of the generated quad before rotation. Default 1. */
  halfExtent?: number;
}

const TWO_PI = Math.PI * 2;

function isAxisAlignedRotation(rotationDegrees: number): boolean {
  const normalized = ((rotationDegrees % 90) + 90) % 90;
  return Math.min(normalized, 90 - normalized) <= 1e-9;
}

function rotate2d(x: number, y: number, rotationDegrees: number): readonly [number, number] {
  const radians = (rotationDegrees * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return [x * cos - y * sin, x * sin + y * cos];
}

/**
 * Fan-triangulated regular polygon disk (one center vertex + `sides` boundary
 * vertices, `sides` triangles). For any `sides >= 3` this is an open disk:
 * V = sides + 1, E = 2*sides, F = sides  =>  Euler characteristic = 1.
 */
export function regularPolygonSheetCandidate(
  sides: number,
  options: { id?: string; radius?: number } = {}
): GeometryConjectureCandidate {
  if (!Number.isInteger(sides) || sides < 3) {
    throw new Error('ConjectureGenerator: regular polygon requires an integer sides >= 3');
  }
  const radius = options.radius ?? 1;
  const id = options.id ?? `regular-polygon-sheet-${sides}`;

  // vertex 0 = center, vertices 1..sides = boundary (CCW around the center).
  const vertices = new Float64Array((sides + 1) * 3);
  // center at origin (already zeroed).
  for (let i = 0; i < sides; i++) {
    const angle = (TWO_PI * i) / sides;
    const base = (i + 1) * 3;
    vertices[base] = radius * Math.cos(angle);
    vertices[base + 1] = radius * Math.sin(angle);
    vertices[base + 2] = 0;
  }

  // fan triangulation: (center, boundary[i], boundary[i+1]) CCW.
  const elements = new Uint32Array(sides * 3);
  for (let i = 0; i < sides; i++) {
    const a = i + 1;
    const b = ((i + 1) % sides) + 1;
    const tri = i * 3;
    elements[tri] = 0;
    elements[tri + 1] = a;
    elements[tri + 2] = b;
  }

  return {
    id,
    family: 'regular-polygon-sheet',
    elementArity: 3,
    semanticTags: ['geometry', 'receipt-carrying', 'open-surface', 'generated'],
    parameters: { sides, radius, expectedEulerCharacteristic: 1 },
    vertices,
    elements,
  };
}

/**
 * Generate a swept family of regular polygon sheets for sides in
 * [minSides, maxSides]. Conjecture under test: "every generated regular-polygon
 * sheet is non-degenerate and has Euler characteristic 1."
 */
export function generateRegularPolygonSheetFamily(
  options: RegularPolygonSheetFamilyOptions = {}
): ReadonlyArray<GeometryConjectureCandidate> {
  const minSides = options.minSides ?? 3;
  const maxSides = options.maxSides ?? 8;
  const radius = options.radius ?? 1;
  if (
    !Number.isInteger(minSides) ||
    !Number.isInteger(maxSides) ||
    minSides < 3 ||
    maxSides < minSides
  ) {
    throw new Error('ConjectureGenerator: require integers 3 <= minSides <= maxSides');
  }
  const candidates: GeometryConjectureCandidate[] = [];
  for (let sides = minSides; sides <= maxSides; sides++) {
    candidates.push(regularPolygonSheetCandidate(sides, { radius }));
  }
  return candidates;
}

/**
 * A single triangle whose apex height parameterizes its area. As `apexHeight`
 * approaches 0 the triangle collapses to a collinear (degenerate) primitive.
 */
export function collapsingTriangleCandidate(
  apexHeight: number,
  options: { id?: string } = {}
): GeometryConjectureCandidate {
  const id = options.id ?? `collapsing-triangle-${apexHeight}`;
  return {
    id,
    family: 'collapsing-triangle',
    elementArity: 3,
    semanticTags: ['geometry', 'generated', apexHeight <= 0 ? 'counterexample' : 'candidate'],
    parameters: { apexHeight },
    vertices: new Float64Array([0, 0, 0, 1, 0, 0, 0.5, apexHeight, 0]),
    elements: new Uint32Array([0, 1, 2]),
  };
}

/**
 * Generate a swept family of triangles whose apex height descends from
 * `startHeight` to `endHeight`. Conjecture under test: "every generated
 * triangle in the sweep is non-degenerate." The sweep DISCOVERS the falsifying
 * apex height (the collinear member at height 0), so the counterexample carries
 * the exact parameter that broke the invariant.
 */
export function generateCollapsingTriangleFamily(
  options: CollapsingTriangleFamilyOptions = {}
): ReadonlyArray<GeometryConjectureCandidate> {
  const steps = options.steps ?? 6;
  const startHeight = options.startHeight ?? 1;
  const endHeight = options.endHeight ?? 0;
  if (!Number.isInteger(steps) || steps < 2) {
    throw new Error('ConjectureGenerator: collapsing-triangle family requires steps >= 2');
  }
  const candidates: GeometryConjectureCandidate[] = [];
  for (let i = 0; i < steps; i++) {
    const t = i / (steps - 1);
    const apexHeight = startHeight + (endHeight - startHeight) * t;
    candidates.push(
      collapsingTriangleCandidate(apexHeight, { id: `collapsing-triangle-step-${i}` })
    );
  }
  return candidates;
}

/**
 * `blades` triangles all sharing one common edge (v0,v1), each with its own
 * apex placed around that edge. The shared edge has incidence == blades:
 * for blades <= 2 the surface is edge-manifold; for blades >= 3 it is NOT
 * (an edge shared by 3+ triangles is the canonical non-manifold defect).
 * Every triangle is non-degenerate, so the manifold probe is the only signal.
 */
export function sharedEdgeFanCandidate(
  blades: number,
  options: { id?: string } = {}
): GeometryConjectureCandidate {
  if (!Number.isInteger(blades) || blades < 1) {
    throw new Error('ConjectureGenerator: shared-edge fan requires an integer blades >= 1');
  }
  const id = options.id ?? `shared-edge-fan-${blades}`;
  // v0, v1 form the shared edge along x; each blade adds an apex at distance 1
  // from the edge, fanned through the y-z plane so triangles never coincide.
  const vertices: number[] = [0, 0, 0, 1, 0, 0];
  const elements: number[] = [];
  for (let i = 0; i < blades; i++) {
    const apexIndex = 2 + i;
    const angle = (Math.PI * (i + 1)) / (blades + 1);
    vertices.push(0.5, Math.cos(angle), Math.sin(angle));
    elements.push(0, 1, apexIndex);
  }
  return {
    id,
    family: 'shared-edge-fan',
    elementArity: 3,
    semanticTags: ['geometry', 'generated', blades >= 3 ? 'counterexample' : 'candidate'],
    parameters: { blades, manifold: blades <= 2 },
    vertices: new Float64Array(vertices),
    elements: new Uint32Array(elements),
  };
}

/**
 * Generate a swept family of shared-edge fans for blade counts 1..maxBlades.
 * Conjecture under test: "every generated shared-edge fan is edge-manifold."
 * The sweep DISCOVERS the manifoldness boundary — the first non-manifold member
 * is the 3-blade fan — so the counterexample carries the exact blade count that
 * broke the invariant.
 */
export function generateSharedEdgeFanFamily(
  options: SharedEdgeFanFamilyOptions = {}
): ReadonlyArray<GeometryConjectureCandidate> {
  const maxBlades = options.maxBlades ?? 4;
  if (!Number.isInteger(maxBlades) || maxBlades < 1) {
    throw new Error('ConjectureGenerator: shared-edge fan family requires maxBlades >= 1');
  }
  const candidates: GeometryConjectureCandidate[] = [];
  for (let blades = 1; blades <= maxBlades; blades++) {
    candidates.push(sharedEdgeFanCandidate(blades, { id: `shared-edge-fan-${blades}` }));
  }
  return candidates;
}

/**
 * A quad whose rotation parameter determines whether its exact convex hull is
 * equivalent to its AABB collision proxy. At 0/90 degree rotations the proxies
 * agree; at 45 degrees the AABB over-approximates the hull, so swept points in
 * the AABB corners become deterministic counterexamples.
 */
export function collisionEquivalenceQuadCandidate(
  rotationDegrees: number,
  options: { id?: string; halfExtent?: number } = {}
): GeometryConjectureCandidate {
  if (!Number.isFinite(rotationDegrees)) {
    throw new Error('ConjectureGenerator: collision-equivalence rotation must be finite');
  }
  const halfExtent = options.halfExtent ?? 1;
  if (!Number.isFinite(halfExtent) || halfExtent <= 0) {
    throw new Error('ConjectureGenerator: collision-equivalence halfExtent must be > 0');
  }

  const aligned = isAxisAlignedRotation(rotationDegrees);
  const id = options.id ?? `collision-equivalence-quad-${rotationDegrees}`;
  const base = [
    [-halfExtent, -halfExtent],
    [halfExtent, -halfExtent],
    [halfExtent, halfExtent],
    [-halfExtent, halfExtent],
  ] as const;
  const vertices: number[] = [];
  for (const [x, y] of base) {
    const [rx, ry] = rotate2d(x, y, rotationDegrees);
    vertices.push(rx, ry, 0);
  }

  return {
    id,
    family: 'collision-equivalence-quad',
    elementArity: 3,
    semanticTags: ['geometry', 'generated', aligned ? 'candidate' : 'counterexample'],
    parameters: {
      rotationDegrees,
      expectedCollisionEquivalent: aligned,
      proxyPair: 'convex-hull:aabb',
    },
    vertices: new Float64Array(vertices),
    elements: new Uint32Array([0, 1, 2, 0, 2, 3]),
  };
}

/**
 * Generate a rotation sweep for the collision-equivalence invariant. The
 * default sweep intentionally includes one survivor (0 degrees) and one
 * falsifier (45 degrees) so the receipt preserves the discovered transform.
 */
export function generateCollisionEquivalenceFamily(
  options: CollisionEquivalenceFamilyOptions = {}
): ReadonlyArray<GeometryConjectureCandidate> {
  const rotationsDegrees = options.rotationsDegrees ?? [0, 45];
  if (rotationsDegrees.length === 0) {
    throw new Error(
      'ConjectureGenerator: collision-equivalence family requires at least one rotation'
    );
  }
  return rotationsDegrees.map((rotationDegrees) =>
    collisionEquivalenceQuadCandidate(rotationDegrees, {
      halfExtent: options.halfExtent,
      id: `collision-equivalence-quad-${rotationDegrees}`,
    })
  );
}
