/**
 * embedding-metrics — shared representation-quality measures for JEPA / HoloEmbed.
 *
 * The headline metric is `effectiveRank` (a.k.a. participation ratio / effective
 * dimensionality), the standard guard against *representation collapse* — the
 * failure mode where a self-supervised encoder maps every input to (nearly) the
 * same point, making the embedding space low-rank and useless.
 *
 * Collapse is the #1 reviewer attack on JEPA-style papers (see
 * research/2026-05-23_non-llm-stack-hardening-jepa-snn-eval.md, W.520). Reporting
 * effective rank pre-empts it. The same routine applies to PillarJEPA predictions
 * AND HoloEmbed 768-dim structural vectors (one routine, two papers).
 *
 * Definition
 * ──────────
 * For a centred data matrix X (n samples × d dims) with covariance C = XᵀX / n,
 * with eigenvalues λ₁…λ_d:
 *
 *   participation ratio  PR = (Σ λᵢ)² / Σ λᵢ²
 *
 * PR ∈ [1, d].  PR ≈ d → variance spread evenly across all dims (no collapse).
 * PR ≈ 1 → all variance in one direction (full collapse).
 *
 * We avoid an eigensolver: for a symmetric C,
 *   Σ λᵢ  = trace(C)               = Σᵢ C_ii
 *   Σ λᵢ² = trace(C²) = ‖C‖_F²     = Σᵢⱼ C_ij²
 * so  PR = trace(C)² / ‖C‖_F²  exactly.
 */

export interface EffectiveRankResult {
  /** Participation ratio in [1, dim]. Higher = healthier (no collapse). */
  effectiveRank: number;
  /** effectiveRank / dim in [0, 1]. 1.0 = perfectly spread, →0 = collapsed. */
  rankRatio: number;
  /** Embedding dimensionality. */
  dim: number;
  /** Number of samples used. */
  count: number;
  /** trace(C) — total variance. 0 ⇒ all samples identical (degenerate). */
  totalVariance: number;
}

type VecLike = ArrayLike<number>;

/**
 * Compute the effective rank (participation ratio) of a set of embedding vectors.
 *
 * @param vectors  n vectors, each of identical length d (Float32Array or number[]).
 * @returns        EffectiveRankResult; effectiveRank = NaN-safe (returns 1 for a
 *                 fully-degenerate/zero-variance set).
 */
export function effectiveRank(vectors: ReadonlyArray<VecLike>): EffectiveRankResult {
  const count = vectors.length;
  if (count === 0) {
    return { effectiveRank: 0, rankRatio: 0, dim: 0, count: 0, totalVariance: 0 };
  }
  const dim = vectors[0].length;
  if (dim === 0) {
    return { effectiveRank: 0, rankRatio: 0, dim: 0, count, totalVariance: 0 };
  }

  // Mean per dimension.
  const mean = new Float64Array(dim);
  for (const v of vectors) {
    for (let j = 0; j < dim; j++) mean[j] += v[j];
  }
  for (let j = 0; j < dim; j++) mean[j] /= count;

  // Covariance C (d × d), C = XᵀX / n on centred data. Symmetric.
  const cov = new Float64Array(dim * dim);
  for (const v of vectors) {
    for (let a = 0; a < dim; a++) {
      const da = v[a] - mean[a];
      if (da === 0) continue;
      for (let b = a; b < dim; b++) {
        cov[a * dim + b] += da * (v[b] - mean[b]);
      }
    }
  }
  for (let a = 0; a < dim; a++) {
    for (let b = a; b < dim; b++) {
      const val = cov[a * dim + b] / count;
      cov[a * dim + b] = val;
      cov[b * dim + a] = val; // mirror
    }
  }

  // trace(C) = Σ λ, ‖C‖_F² = Σ λ² (symmetric C).
  let trace = 0;
  let frobSq = 0;
  for (let a = 0; a < dim; a++) {
    trace += cov[a * dim + a];
    for (let b = 0; b < dim; b++) {
      const c = cov[a * dim + b];
      frobSq += c * c;
    }
  }

  // Degenerate (zero variance) → collapsed to a point → effective rank 1.
  const pr = frobSq > 0 ? (trace * trace) / frobSq : 1;
  const clamped = Math.max(1, Math.min(dim, pr));
  return {
    effectiveRank: clamped,
    rankRatio: clamped / dim,
    dim,
    count,
    totalVariance: trace,
  };
}

/**
 * Conservation-adherence@ε — fraction of samples whose conservation penalty is
 * within tolerance ε. The physics-domain analog of IntPhys plausibility
 * discrimination (W.521): a learned world model "adheres" when its predicted
 * states do not violate the conservation law beyond ε.
 *
 * @param penalties  per-sample conservation penalties (e.g. PillarJEPA
 *                   `conservationLoss`), non-negative.
 * @param epsilons   tolerance sweep.
 * @returns          adherence(ε) = P(penalty ≤ ε) for each ε.
 */
export function conservationAdherence(
  penalties: ReadonlyArray<number>,
  epsilons: ReadonlyArray<number>
): Array<{ epsilon: number; adherence: number }> {
  const n = penalties.length;
  return epsilons.map((epsilon) => {
    if (n === 0) return { epsilon, adherence: 0 };
    let within = 0;
    for (const p of penalties) if (p <= epsilon) within++;
    return { epsilon, adherence: within / n };
  });
}
