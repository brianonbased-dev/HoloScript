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

const TWO_PI = Math.PI * 2;

/**
 * Fan-triangulated regular polygon disk (one center vertex + `sides` boundary
 * vertices, `sides` triangles). For any `sides >= 3` this is an open disk:
 * V = sides + 1, E = 2*sides, F = sides  =>  Euler characteristic = 1.
 */
export function regularPolygonSheetCandidate(
  sides: number,
  options: { id?: string; radius?: number } = {},
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
  options: RegularPolygonSheetFamilyOptions = {},
): ReadonlyArray<GeometryConjectureCandidate> {
  const minSides = options.minSides ?? 3;
  const maxSides = options.maxSides ?? 8;
  const radius = options.radius ?? 1;
  if (!Number.isInteger(minSides) || !Number.isInteger(maxSides) || minSides < 3 || maxSides < minSides) {
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
  options: { id?: string } = {},
): GeometryConjectureCandidate {
  const id = options.id ?? `collapsing-triangle-${apexHeight}`;
  return {
    id,
    family: 'collapsing-triangle',
    elementArity: 3,
    semanticTags: ['geometry', 'generated', apexHeight <= 0 ? 'counterexample' : 'candidate'],
    parameters: { apexHeight },
    vertices: new Float64Array([
      0, 0, 0,
      1, 0, 0,
      0.5, apexHeight, 0,
    ]),
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
  options: CollapsingTriangleFamilyOptions = {},
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
    candidates.push(collapsingTriangleCandidate(apexHeight, { id: `collapsing-triangle-step-${i}` }));
  }
  return candidates;
}
