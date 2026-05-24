/**
 * cpml.ts — Convolutional Perfectly Matched Layer (CPML) numerics for FDTD.
 *
 * Pure, allocation-light helpers for the Roden–Gedney complex-frequency-shifted
 * CPML used by {@link FDTDSolver} to terminate open boundaries with very low
 * reflection. This module is intentionally free of Yee bookkeeping so the
 * grading and recursion coefficients can be unit-tested against their analytic
 * limits (no loss ⇒ pass-through; deep PML ⇒ strong decay).
 *
 * ## Stretched-coordinate formulation
 *
 * Each PML axis replaces the spatial derivative ∂/∂x by the stretched operator
 *
 *     ∂/∂x  →  (1/κ_x) ∂/∂x  +  ψ_x
 *
 * where ψ_x is a recursively-updated convolution memory field:
 *
 *     ψ_x^{n} = b_x · ψ_x^{n-1} + a_x · (ΔF/Δx)^{n}
 *     b_x     = exp( −(σ_x/κ_x + α_x) · Δt/ε₀ )
 *     a_x     = σ_x / (κ_x (σ_x + κ_x α_x)) · (b_x − 1)
 *
 * Outside the PML region σ_x = α_x = 0 and κ_x = 1, giving b_x = 1, a_x = 0,
 * 1/κ_x = 1 — i.e. ψ stays zero and the operator collapses to the ordinary
 * central difference. This is what makes the layer reflectionless to machine
 * grading: the interior update is bit-identical to plain FDTD.
 *
 * ## Conductivity grading
 *
 * σ(x) = σ_max · (d/L)^m with polynomial order m (3–4 typical) and depth d into
 * the layer (0 at the inner edge, L at the outer PEC wall). σ_max is chosen for
 * a target theoretical reflection R₀:
 *
 *     σ_max = −(m+1) · ln(R₀) / (2 · η₀ · L)
 *
 * with η₀ = √(μ₀/ε₀) the vacuum impedance and L = thickness · Δ the physical
 * layer depth.
 *
 * @module simulation
 */

const EPS0 = 8.8541878128e-12; // F/m
const MU0 = 1.2566370614e-6; // H/m
const ETA0 = Math.sqrt(MU0 / EPS0); // ≈ 376.73 Ω

export interface CpmlParams {
  /** Polynomial grading order m (default 3). */
  order?: number;
  /** Target theoretical reflection R₀ at normal incidence (default 1e-6). */
  targetReflection?: number;
  /** Max coordinate-stretch κ_max ≥ 1 (default 1 = pure CFS loss, no stretch). */
  kappaMax?: number;
  /** Max frequency-shift α_max ≥ 0 (default 0). Improves evanescent/late-time. */
  alphaMax?: number;
}

/** Per-grid-line CPML recursion coefficients along one axis. */
export interface CpmlProfile {
  /** Decay factor b at each grid index (1 outside the PML). */
  b: Float32Array;
  /** Convolution weight a at each grid index (0 outside the PML). */
  a: Float32Array;
  /** Inverse coordinate stretch 1/κ at each grid index (1 outside the PML). */
  invKappa: Float32Array;
  /** True if any index carries loss (a PML region exists on this axis). */
  active: boolean;
}

/**
 * Conductivity σ at a point `pos` cells deep along an axis of `ncells` Yee
 * cells with a PML of `thickness` cells on BOTH ends. Returns 0 in the interior.
 *
 * `pos` is a continuous cell coordinate so the same function serves both the
 * integer (E-aligned) and half-integer (H-aligned) staggered grids.
 */
function sigmaAt(
  pos: number,
  ncells: number,
  thickness: number,
  cellSize: number,
  order: number,
  sigmaMax: number
): number {
  if (thickness <= 0) return 0;
  // Depth into the low or high PML slab, in cells (0 at inner edge → thickness at wall).
  let depthCells = 0;
  if (pos < thickness) {
    depthCells = thickness - pos; // low side
  } else if (pos > ncells - thickness) {
    depthCells = pos - (ncells - thickness); // high side
  } else {
    return 0; // interior
  }
  if (depthCells <= 0) return 0;
  const L = thickness * cellSize;
  const d = depthCells * cellSize;
  const x = Math.min(1, d / L);
  return sigmaMax * Math.pow(x, order);
}

/** Same grading shape as σ, reused for the κ and α profiles. */
function gradedFraction(
  pos: number,
  ncells: number,
  thickness: number,
  order: number
): number {
  if (thickness <= 0) return 0;
  let depthCells = 0;
  if (pos < thickness) depthCells = thickness - pos;
  else if (pos > ncells - thickness) depthCells = pos - (ncells - thickness);
  else return 0;
  if (depthCells <= 0) return 0;
  return Math.pow(Math.min(1, depthCells / thickness), order);
}

/**
 * Build CPML recursion coefficients sampled at `numPoints` grid locations along
 * one axis. `halfOffset` shifts the sample point by +0.5 cell (use 0.5 for
 * H-aligned / face-staggered components, 0 for E-aligned / edge components).
 *
 * Returns unit/pass-through coefficients when `thickness <= 0`.
 */
export function computeAxisProfile(
  numPoints: number,
  halfOffset: 0 | 0.5,
  ncells: number,
  thickness: number,
  cellSize: number,
  dt: number,
  params: CpmlParams = {}
): CpmlProfile {
  const order = params.order ?? 3;
  const R0 = params.targetReflection ?? 1e-6;
  const kappaMax = Math.max(1, params.kappaMax ?? 1);
  const alphaMax = Math.max(0, params.alphaMax ?? 0);

  const b = new Float32Array(numPoints);
  const a = new Float32Array(numPoints);
  const invKappa = new Float32Array(numPoints);

  if (thickness <= 0) {
    b.fill(1);
    a.fill(0);
    invKappa.fill(1);
    return { b, a, invKappa, active: false };
  }

  const L = thickness * cellSize;
  const sigmaMax = (-(order + 1) * Math.log(R0)) / (2 * ETA0 * L);

  let active = false;
  for (let idx = 0; idx < numPoints; idx++) {
    const pos = idx + halfOffset;
    const sigma = sigmaAt(pos, ncells, thickness, cellSize, order, sigmaMax);
    const frac = gradedFraction(pos, ncells, thickness, order);
    const kappa = 1 + (kappaMax - 1) * frac;
    // α tapers the OTHER way (max at the inner edge), per Gedney; harmless at 0.
    const alpha = alphaMax * (1 - frac);

    invKappa[idx] = 1 / kappa;

    if (sigma <= 0 && alpha <= 0) {
      b[idx] = 1;
      a[idx] = 0;
    } else {
      active = true;
      const bi = Math.exp(-((sigma / kappa) + alpha) * (dt / EPS0));
      b[idx] = bi;
      const denom = kappa * (sigma + kappa * alpha);
      a[idx] = denom !== 0 ? (sigma / denom) * (bi - 1) : 0;
    }
  }

  return { b, a, invKappa, active };
}

/**
 * Recursive-convolution update for one ψ memory cell.
 *
 *   ψ ← b·ψ + a·derivative      (derivative = ΔF/Δ, the finite difference / spacing)
 *
 * Returns the new ψ. Kept as a tiny pure function so the recursion is
 * unit-testable in isolation.
 */
export function updatePsi(
  psi: number,
  b: number,
  a: number,
  derivative: number
): number {
  return b * psi + a * derivative;
}

export { EPS0 as CPML_EPS0, ETA0 as CPML_ETA0 };
