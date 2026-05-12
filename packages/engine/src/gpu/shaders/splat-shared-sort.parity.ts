/**
 * splat-shared-sort.parity.ts
 *
 * JavaScript port of the WGSL kernel in `splat-shared-sort.wgsl`. Exists so
 * the kernel can be exercised in Node test harnesses (no WebGPU adapter
 * available there) and compared bit-for-bit against the CPU reference at
 * `packages/core/src/traits/MultiviewGaussianRendererTrait.ts::preprocess()`.
 *
 * Invariants (each enforced by tests):
 *   1. For ANY input fixture (positions + view eye/direction tuples), this
 *      parity twin MUST produce the same `visibilityBitmasks` array as
 *      MultiviewGaussianRendererTrait.preprocess() — bit-exact, not approximate.
 *   2. Distance keys (squared distance to centroid) MUST agree within f32
 *      tolerance when sorted descending — the back-to-front order must match.
 *   3. The cone-test threshold `DEFAULT_HALF_FOV_COS` MUST equal the CPU ref's
 *      constant of the same name (currently 0.5 = cos(60deg) half-FOV).
 *
 * If the .wgsl file is edited, this parity twin MUST be updated in lockstep.
 * The test suite catches divergence: a structural regex check confirms the
 * .wgsl file contains the load-bearing operations (toGLen2, inverseSqrt,
 * safeNormalize, DEFAULT_HALF_FOV_COS); the behavioral tests confirm the JS
 * port matches the CPU reference.
 *
 * @see splat-shared-sort.wgsl
 * @see packages/core/src/traits/MultiviewGaussianRendererTrait.ts
 */

/** Half-FOV cosine threshold — MUST match WGSL constant + CPU ref. */
export const DEFAULT_HALF_FOV_COS = 0.5;

/** Max view count encodable in the uint32 bitmask. */
export const MAX_BITMASK_VIEWS = 32;

export interface ParityViewConfig {
  /** [x, y, z] world-space eye position. */
  eyePosition: [number, number, number];
  /** [x, y, z] eye look direction — need not be unit-length (safeNormalized internally). */
  eyeDirection: [number, number, number];
}

export interface ParityResult {
  /** Per-Gaussian squared distance to the shared centroid (sort key). */
  distances: Float32Array;
  /** Per-Gaussian uint32 visibility bitmask: bit v set ⇒ Gaussian visible in views[v]. */
  visibilityBitmasks: Uint32Array;
  /** Back-to-front sorted Gaussian indices (descending by distance). */
  sortedIndices: Uint32Array;
}

/**
 * Mirror of the WGSL `safeNormalize` helper. Returns the zero vector for
 * degenerate inputs (matches the CPU ref's `Math.hypot || 1` clamp).
 */
function safeNormalize(
  v: readonly [number, number, number]
): [number, number, number] {
  const len2 = v[0] * v[0] + v[1] * v[1] + v[2] * v[2];
  if (len2 < 1e-12) return [0, 0, 0];
  const inv = 1 / Math.sqrt(len2);
  return [v[0] * inv, v[1] * inv, v[2] * inv];
}

/**
 * Pure-JS twin of the WGSL `cs_preprocess` kernel.
 *
 * @param positions Flat [x0,y0,z0, x1,y1,z1, …] array of Gaussian positions (length 3*N).
 * @param views     Array of view configs. Order matters — bit v in the bitmask refers to views[v].
 * @returns Object containing distances, visibilityBitmasks, and back-to-front sortedIndices.
 */
export function preprocessSharedSort(
  positions: Float32Array | readonly number[],
  views: readonly ParityViewConfig[]
): ParityResult {
  const N = Math.floor(positions.length / 3);
  if (positions.length % 3 !== 0) {
    throw new Error(
      `preprocessSharedSort: positions length ${positions.length} not divisible by 3`
    );
  }
  const numViews = Math.min(views.length, MAX_BITMASK_VIEWS);

  // ── Shared centroid: mean of all view eye positions ────────────
  let cx = 0;
  let cy = 0;
  let cz = 0;
  if (numViews > 0) {
    for (let v = 0; v < numViews; v++) {
      cx += views[v].eyePosition[0];
      cy += views[v].eyePosition[1];
      cz += views[v].eyePosition[2];
    }
    cx /= numViews;
    cy /= numViews;
    cz /= numViews;
  }

  // ── Per-Gaussian distance²-to-centroid ─────────────────────────
  const distances = new Float32Array(N);
  for (let g = 0; g < N; g++) {
    const dx = positions[g * 3] - cx;
    const dy = positions[g * 3 + 1] - cy;
    const dz = positions[g * 3 + 2] - cz;
    distances[g] = dx * dx + dy * dy + dz * dz;
  }

  // ── Per-Gaussian visibility bitmask via cone test ──────────────
  // Pre-normalize each view's eye direction once (mirrors CPU ref lines 191-199).
  const normDirs: [number, number, number][] = views
    .slice(0, numViews)
    .map((view) => safeNormalize(view.eyeDirection));

  const visibilityBitmasks = new Uint32Array(N);
  for (let g = 0; g < N; g++) {
    const px = positions[g * 3];
    const py = positions[g * 3 + 1];
    const pz = positions[g * 3 + 2];
    let mask = 0;
    for (let v = 0; v < numViews; v++) {
      const view = views[v];
      const rx = px - view.eyePosition[0];
      const ry = py - view.eyePosition[1];
      const rz = pz - view.eyePosition[2];
      const rlen2 = rx * rx + ry * ry + rz * rz;
      if (rlen2 < 1e-12) {
        // Degenerate: Gaussian colocated with eye. CPU ref lines 213-216.
        mask |= 1 << v;
        continue;
      }
      const invR = 1 / Math.sqrt(rlen2);
      const nrx = rx * invR;
      const nry = ry * invR;
      const nrz = rz * invR;
      const dx_n = normDirs[v][0];
      const dy_n = normDirs[v][1];
      const dz_n = normDirs[v][2];
      const cone = nrx * dx_n + nry * dy_n + nrz * dz_n;
      if (cone >= DEFAULT_HALF_FOV_COS) {
        mask |= 1 << v;
      }
    }
    visibilityBitmasks[g] = mask >>> 0;
  }

  // ── Back-to-front shared sort (descending by distance²) ───────
  const idxArr = new Array<number>(N);
  for (let i = 0; i < N; i++) idxArr[i] = i;
  idxArr.sort((a, b) => distances[b] - distances[a]);
  const sortedIndices = new Uint32Array(N);
  for (let i = 0; i < N; i++) sortedIndices[i] = idxArr[i];

  return { distances, visibilityBitmasks, sortedIndices };
}
