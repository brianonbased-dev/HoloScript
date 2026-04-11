/**
 * ConvergenceAnalysis — Grid convergence study utilities.
 *
 * Implements the methods from:
 *   Roache, P.J., "Verification and Validation in Computational Science
 *   and Engineering", Hermosa Publishers, 1998.
 *
 * Provides:
 * - Observed convergence order from error-vs-mesh-size data
 * - Richardson extrapolation for grid-independent solutions
 * - Grid Convergence Index (GCI) per Roache's method
 * - L2 and L-infinity error norms
 */

// ── Error Norms ──────────────────────────────────────────────────────────────

/**
 * L2 error norm: sqrt(sum((numerical - exact)^2) / N)
 */
export function errorL2(numerical: Float32Array | number[], exact: Float32Array | number[]): number {
  let sumSq = 0;
  const n = numerical.length;
  for (let i = 0; i < n; i++) {
    const diff = Number(numerical[i]) - Number(exact[i]);
    sumSq += diff * diff;
  }
  return Math.sqrt(sumSq / n);
}

/**
 * L-infinity error norm: max(|numerical - exact|)
 */
export function errorLinf(numerical: Float32Array | number[], exact: Float32Array | number[]): number {
  let maxErr = 0;
  for (let i = 0; i < numerical.length; i++) {
    const err = Math.abs(Number(numerical[i]) - Number(exact[i]));
    if (err > maxErr) maxErr = err;
  }
  return maxErr;
}

/**
 * Relative L2 error norm: L2(numerical - exact) / L2(exact)
 */
export function relativeErrorL2(numerical: Float32Array | number[], exact: Float32Array | number[]): number {
  const exactNorm = Math.sqrt(
    (exact as number[]).reduce((s, v) => s + Number(v) * Number(v), 0) / exact.length
  );
  if (exactNorm < 1e-30) return errorL2(numerical, exact);
  return errorL2(numerical, exact) / exactNorm;
}

// ── Convergence Order ────────────────────────────────────────────────────────

/**
 * Compute observed convergence order from error data at multiple mesh sizes.
 *
 * Uses least-squares linear regression on log(h) vs log(error).
 * The slope is the observed convergence order p.
 *
 * For a method of order p: error = C * h^p → log(error) = log(C) + p*log(h)
 *
 * @param meshSizes  Array of characteristic mesh sizes (h)
 * @param errors     Corresponding error norms
 * @returns Observed convergence order (slope of log-log fit)
 */
export function computeObservedOrder(meshSizes: number[], errors: number[]): number {
  if (meshSizes.length < 2) throw new Error('Need at least 2 data points for convergence order');
  if (meshSizes.length !== errors.length) throw new Error('meshSizes and errors must have same length');

  const logH = meshSizes.map(Math.log);
  const logE = errors.map(Math.log);

  // Least-squares: p = sum((logH - mean_logH)(logE - mean_logE)) / sum((logH - mean_logH)^2)
  const n = logH.length;
  const meanLogH = logH.reduce((s, v) => s + v, 0) / n;
  const meanLogE = logE.reduce((s, v) => s + v, 0) / n;

  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    const dh = logH[i] - meanLogH;
    const de = logE[i] - meanLogE;
    num += dh * de;
    den += dh * dh;
  }

  if (Math.abs(den) < 1e-30) throw new Error('All mesh sizes are identical');

  return num / den;
}

/**
 * Compute convergence order from exactly two grid levels.
 * p = log(e_coarse / e_fine) / log(h_coarse / h_fine)
 */
export function convergenceOrderTwoLevel(
  hCoarse: number,
  errorCoarse: number,
  hFine: number,
  errorFine: number
): number {
  if (errorFine < 1e-30 || errorCoarse < 1e-30) return NaN;
  return Math.log(errorCoarse / errorFine) / Math.log(hCoarse / hFine);
}

// ── Richardson Extrapolation ─────────────────────────────────────────────────

/**
 * Richardson extrapolation for grid-independent solution estimate.
 *
 * Given solutions on two grids with refinement ratio r:
 *   f_exact ≈ f_fine + (f_fine - f_coarse) / (r^p - 1)
 *
 * @param fCoarse Solution on coarser grid
 * @param fFine   Solution on finer grid
 * @param r       Grid refinement ratio (h_coarse / h_fine), typically 2
 * @param p       Observed or theoretical convergence order
 * @returns Estimated grid-independent ("exact") solution
 */
export function richardsonExtrapolation(
  fCoarse: number,
  fFine: number,
  r: number,
  p: number
): number {
  return fFine + (fFine - fCoarse) / (Math.pow(r, p) - 1);
}

// ── Grid Convergence Index ───────────────────────────────────────────────────

/**
 * Grid Convergence Index (GCI) per Roache's method.
 *
 * GCI provides an uncertainty band for the numerical solution.
 * The "true" solution is estimated to lie within f_fine +/- GCI.
 *
 * GCI = Fs * |epsilon| / (r^p - 1)
 *
 * where:
 *   epsilon = (f_fine - f_coarse) / f_fine  (relative error between grids)
 *   r = h_coarse / h_fine  (refinement ratio)
 *   p = observed convergence order
 *   Fs = safety factor (1.25 for 3+ grids, 3.0 for 2 grids)
 *
 * @returns GCI as a fraction (e.g., 0.02 = 2% uncertainty)
 */
export function gridConvergenceIndex(
  fCoarse: number,
  fFine: number,
  r: number,
  p: number,
  safetyFactor = 1.25
): number {
  if (Math.abs(fFine) < 1e-30) return NaN;
  const epsilon = (fFine - fCoarse) / fFine;
  return safetyFactor * Math.abs(epsilon) / (Math.pow(r, p) - 1);
}

// ── Convergence Study Runner ─────────────────────────────────────────────────

export interface ConvergenceStudyResult {
  meshSizes: number[];
  errorsL2: number[];
  errorsLinf: number[];
  observedOrderL2: number;
  observedOrderLinf: number;
  richardsonEstimate?: number;
  gci?: number;
}

/**
 * Run a convergence study by executing a solver at multiple mesh refinement levels.
 *
 * @param runSolver  Function that takes a mesh size and returns {numerical, exact} arrays
 * @param meshSizes  Array of mesh sizes to test (e.g., [0.2, 0.1, 0.05, 0.025])
 * @param scalarExtractor  Optional function to extract a single scalar from the solution (for Richardson)
 */
export function runConvergenceStudy(
  runSolver: (h: number) => { numerical: Float32Array | number[]; exact: Float32Array | number[] },
  meshSizes: number[],
  scalarExtractor?: (numerical: Float32Array | number[]) => number
): ConvergenceStudyResult {
  const errorsL2: number[] = [];
  const errorsLinf: number[] = [];
  const scalarValues: number[] = [];

  for (const h of meshSizes) {
    const { numerical, exact } = runSolver(h);
    errorsL2.push(errorL2(numerical, exact));
    errorsLinf.push(errorLinf(numerical, exact));
    if (scalarExtractor) {
      scalarValues.push(scalarExtractor(numerical));
    }
  }

  const observedOrderL2 = computeObservedOrder(meshSizes, errorsL2);
  const observedOrderLinf = computeObservedOrder(meshSizes, errorsLinf);

  const result: ConvergenceStudyResult = {
    meshSizes,
    errorsL2,
    errorsLinf,
    observedOrderL2,
    observedOrderLinf,
  };

  // Richardson extrapolation on the two finest grids
  if (scalarValues.length >= 2) {
    const n = scalarValues.length;
    const r = meshSizes[n - 2] / meshSizes[n - 1];
    result.richardsonEstimate = richardsonExtrapolation(
      scalarValues[n - 2],
      scalarValues[n - 1],
      r,
      observedOrderL2
    );
    result.gci = gridConvergenceIndex(
      scalarValues[n - 2],
      scalarValues[n - 1],
      r,
      observedOrderL2
    );
  }

  return result;
}
