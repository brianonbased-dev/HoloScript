/**
 * Deterministic interpolation densifier — turns a sparse OBSERVED point cloud
 * into a denser one by adding midpoints between nearest-neighbour observations.
 *
 * Every added point is tagged `interpolated`, NEVER `generative-extended`: a
 * midpoint between two real observations is bounded by reality — it invents no
 * new geometry, it only fills BETWEEN measured points. This is the honest,
 * sovereign half of densification, and it is exactly the class that beats
 * ArtiFixer on trust: we densify without hallucinating. The generative half
 * (filling UNOBSERVED regions, ArtiFixer-style → `generative-extended`) is a
 * separate, model-backed producer (research-first).
 *
 * Deterministic (no RNG, so results are stable + testable): each point's single
 * nearest neighbour defines one candidate midpoint; pairs are de-duplicated.
 *
 * @package @holoscript/core/reconstruction
 */
import { POINT_PROVENANCE_CODE } from './PointProvenance';

export interface DensifyResult {
  /** (orig + added) × 3 positions. */
  positions: Float32Array;
  /** (orig + added) × 3 colors (0..1), matching positions (RGB; RGBA input is averaged to RGB). */
  colors: Float32Array;
  /** (orig + added) uint8 provenance codes: 0=observed (originals), 1=interpolated (added). */
  provenance: Uint8Array;
  /** Count of original observed points. */
  observedCount: number;
  /** Count of added interpolated midpoints. */
  interpolatedCount: number;
}

/**
 * Densification mode. `interpolation` is the honest, bounded-by-reality producer
 * implemented by {@link densifyByInterpolation} (added points are `interpolated`).
 * `generative` fills UNOBSERVED regions with model-invented geometry (added points
 * are `generative-extended`) and requires a {@link GenerativeDensifierBackend}.
 */
export type DensifyMode = 'interpolation' | 'generative';

/**
 * Pluggable backend for GENERATIVE densification — fills UNOBSERVED regions with
 * model-invented geometry (ArtiFixer-class). Drop-in seam unfrozen by the D.101
 * carve-out (founder, 2026-06-24): the sovereign Wan2.1-based model implements
 * this. The returned provenance MUST tag invented points `generative-extended`
 * (originals stay `observed`/`interpolated`). Bounded-by-reality fill is
 * {@link densifyByInterpolation}'s job, not this.
 */
export interface GenerativeDensifierBackend {
  readonly modelId: string;
  densify(input: { positions: Float32Array; colors: Float32Array }): DensifyResult;
}

/**
 * @param positions  N×3 observed positions.
 * @param colors     N×3 (RGB) or N×4 (RGBA, alpha dropped) colors in 0..1. Length must be a multiple of N.
 * @param opts.maxAdded  Optional cap on added points (default: N).
 */
export function densifyByInterpolation(
  positions: Float32Array,
  colors: Float32Array,
  opts?: { maxAdded?: number }
): DensifyResult {
  const n = Math.floor(positions.length / 3);
  const stride = n > 0 ? Math.floor(colors.length / n) : 3; // 3 (RGB) or 4 (RGBA)
  const maxAdded = opts?.maxAdded ?? n;

  const added: Array<{ x: number; y: number; z: number; r: number; g: number; b: number }> = [];
  const seen = new Set<string>();
  for (let i = 0; i < n && added.length < maxAdded; i++) {
    const xi = positions[i * 3];
    const yi = positions[i * 3 + 1];
    const zi = positions[i * 3 + 2];
    let best = -1;
    let bestD2 = Infinity;
    for (let j = 0; j < n; j++) {
      if (j === i) continue;
      const dx = positions[j * 3] - xi;
      const dy = positions[j * 3 + 1] - yi;
      const dz = positions[j * 3 + 2] - zi;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 < bestD2) {
        bestD2 = d2;
        best = j;
      }
    }
    if (best < 0) continue;
    const a = Math.min(i, best);
    const b = Math.max(i, best);
    const key = `${a}-${b}`;
    if (seen.has(key)) continue;
    seen.add(key);
    added.push({
      x: (xi + positions[best * 3]) / 2,
      y: (yi + positions[best * 3 + 1]) / 2,
      z: (zi + positions[best * 3 + 2]) / 2,
      r: (colors[i * stride] + colors[best * stride]) / 2,
      g: (colors[i * stride + 1] + colors[best * stride + 1]) / 2,
      b: (colors[i * stride + 2] + colors[best * stride + 2]) / 2,
    });
  }

  const addCount = added.length;
  const total = n + addCount;
  const outPos = new Float32Array(total * 3);
  const outCol = new Float32Array(total * 3);
  const prov = new Uint8Array(total);

  for (let i = 0; i < n; i++) {
    outPos[i * 3] = positions[i * 3];
    outPos[i * 3 + 1] = positions[i * 3 + 1];
    outPos[i * 3 + 2] = positions[i * 3 + 2];
    outCol[i * 3] = colors[i * stride];
    outCol[i * 3 + 1] = colors[i * stride + 1];
    outCol[i * 3 + 2] = colors[i * stride + 2];
    prov[i] = POINT_PROVENANCE_CODE.observed;
  }
  for (let k = 0; k < addCount; k++) {
    const p = added[k];
    const idx = n + k;
    outPos[idx * 3] = p.x;
    outPos[idx * 3 + 1] = p.y;
    outPos[idx * 3 + 2] = p.z;
    outCol[idx * 3] = p.r;
    outCol[idx * 3 + 1] = p.g;
    outCol[idx * 3 + 2] = p.b;
    prov[idx] = POINT_PROVENANCE_CODE.interpolated;
  }

  return {
    positions: outPos,
    colors: outCol,
    provenance: prov,
    observedCount: n,
    interpolatedCount: addCount,
  };
}
