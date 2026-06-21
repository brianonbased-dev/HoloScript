/**
 * @holoscript/core — Perceptual Color (non-Riemannian) primitive — D1 spike
 *
 * Sovereign color-science module implementing perceptual color difference, a
 * metric-DERIVED neutral axis, and perceptual interpolation, grounded in the
 * completed Schrödinger color theory.
 *
 * SCIENTIFIC BASIS
 * ----------------
 * - Bujack, Teti, Miller, Caffrey, Turton, "The non-Riemannian nature of perceptual
 *   color space", PNAS 2022 (DOI 10.1073/pnas.2119753119): perceived color difference
 *   is NON-ADDITIVE — a large color jump is perceived as *less* than the sum of small
 *   steps along the same path ("diminishing returns"). Therefore NO Riemannian metric
 *   (including the CIELAB ΔE assumption) can be correct.
 * - Bujack et al., "The Geometry of Color in the Light of a Non-Riemannian Space",
 *   Computer Graphics Forum 44(3), 2025 (DOI 10.1111/cgf.70136): completes Schrödinger's
 *   ~1920 theory by DERIVING the neutral (gray) axis from the metric (Def. 8) instead of
 *   assuming it, and modelling the global non-Riemannian distance E as a concave
 *   "dampening" function f applied on top of the geodesic length of the LOCAL metric
 *   (the Riemannized ΔE2000). Geodesics of E and the induced Riemannian metric coincide.
 *
 * HONESTY LEDGER (what is exact vs. approximated in this D1 spike)
 * ----------------------------------------------------------------
 * EXACT (published, verified):
 *   - sRGB ⇄ linear ⇄ XYZ ⇄ CIELAB (D65) conversions.
 *   - CIEDE2000 (ΔE2000), the LOCAL perceptual metric. Verified against the canonical
 *     Sharma–Wu–Dalal (2005) test vectors in the unit test.
 *   - Neutral axis = the equal-lightness color closest to black under the metric
 *     (CGF 2025 Def. 8); under the ΔE2000 approximation this is the (L*, 0, 0) locus.
 *
 * APPROXIMATED (clearly flagged — replace when the LANL group publishes the explicit form):
 *   - The GLOBAL non-Riemannian distance E = f(g): no closed-form non-Riemannian / Finsler
 *     line element exists in the literature as of 2026-06. We model g either as the straight
 *     CIELAB arc length or via solveDeltaE2000Geodesic(), a discrete relaxation solver over
 *     the finite-difference ΔE2000 metric tensor in the spirit of Raj Pant & Farup 2012.
 *     The default f satisfies f'(0)=1 (so E ≈ ΔE2000 for small differences, matching the local
 *     metric) and is strictly subadditive (so large steps show diminishing returns, matching
 *     PNAS 2022). The LANL gray-axis helper fits this dampening on a compact official aggregate
 *     fixture; it is not the full LANL spline/power-law parameter release.
 *   - perceptualLerp still interpolates along the straight CIELAB segment (already far better
 *     than RGB lerp); callers that need the curved local-metric path can use
 *     solveDeltaE2000Geodesic().
 *
 * This is the D1 spike. The @perceptual_color trait (D2) and the compiler color pass (D3)
 * are gated on D1 validation per research/2026-06-14_schrodinger-color-theory-AUTONOMIZE.md.
 *
 * @packageDocumentation
 */

/** sRGB triple, each channel in [0, 1] (gamma-encoded, the usual web/CSS color). */
export type SRGB = readonly [r: number, g: number, b: number];

/** Linear-light RGB triple, each channel in [0, 1]. */
export type LinearRGB = readonly [r: number, g: number, b: number];

/** CIE 1931 XYZ tristimulus (D65), unnormalised. */
export type XYZ = readonly [x: number, y: number, z: number];

/** CIELAB (L* a* b*, D65): L* in [0,100], a* and b* unbounded (typ. [-128,127]). */
export interface Lab {
  L: number;
  a: number;
  b: number;
}

/** Options for the non-Riemannian perceptual distance. */
export interface PerceptualDistanceOptions {
  /**
   * Dampening scale τ for the default concave f(x) = τ·ln(1 + x/τ).
   * Smaller τ ⇒ stronger diminishing-returns; τ → ∞ ⇒ NO dampening (Riemannian/additive
   * baseline, i.e. E reduces to the ΔE2000 arc length). Default {@link DEFAULT_DAMPENING}.
   * NOTE: τ is a placeholder pending the LANL achromatic fit; see module honesty ledger.
   */
  dampening?: number;
  /** Number of samples for the arc-length integral of the local metric. Default 24. */
  steps?: number;
}

/** Local DeltaE2000 Riemannian metric tensor in CIELAB coordinates. */
export type LabMetricTensor = readonly [
  readonly [number, number, number],
  readonly [number, number, number],
  readonly [number, number, number],
];

export interface DeltaE2000MetricTensorOptions {
  /** Finite-difference step in CIELAB units. Default 1e-3. */
  epsilon?: number;
  /** Small diagonal stabilizer for numerical degeneracies. Default 1e-12. */
  regularization?: number;
}

export interface DeltaE2000GeodesicOptions extends DeltaE2000MetricTensorOptions {
  /** Number of piecewise-linear segments in the relaxed path. Default 12. */
  segments?: number;
  /** Gradient-relaxation passes over the interior points. Default 40. */
  iterations?: number;
  /** Gradient descent scale for each coordinate update. Default 0.02. */
  stepSize?: number;
  /** Finite-difference step for the path-energy gradient. Default 0.05. */
  gradientStep?: number;
  /** Per-iteration coordinate clamp, in CIELAB units. Default 0.35. */
  maxCoordinateStep?: number;
  /** Clamp relaxed Lab points to display-oriented bounds. Default true. */
  clampLab?: boolean;
}

export interface DeltaE2000GeodesicResult {
  /** Endpoints plus relaxed interior CIELAB points. */
  path: Lab[];
  /** Metric-tensor length of the relaxed path. */
  length: number;
  /** Metric-tensor length of the straight CIELAB segment. */
  straightLength: number;
  /** Discrete energy minimized by the relaxation solver. */
  energy: number;
  /** Number of relaxation iterations attempted. */
  iterations: number;
}

export interface LanlGrayAchromaticAggregate {
  /** Standard achromatic L* value. */
  Ls: number;
  /** First comparison achromatic L* value. */
  Lt1: number;
  /** Second comparison achromatic L* value. */
  Lt2: number;
  /** Number of official LANL responses aggregated for this triad. */
  count: number;
  /** Number of responses where the participant chose test 2 as more different. */
  choseT2: number;
}

export interface LanlGrayChoiceModelOptions {
  /** Dampening scale used by f(d). Use DAMPENING_OFF for the additive baseline. */
  dampening?: number;
  /** Gaussian decision noise, matching the LANL R script's pnorm scale. */
  noise?: number;
}

export interface LanlGrayFitOptions {
  dampeningCandidates?: readonly number[];
  noiseCandidates?: readonly number[];
}

export interface LanlGrayFitResult {
  dampening: number;
  noise: number;
  negativeLogLikelihood: number;
  meanAccuracy: number;
  rows: number;
}

/**
 * Pass as `dampening` to disable the non-Riemannian correction and recover the additive
 * (Riemannian) baseline. Equivalent to f = identity.
 */
export const DAMPENING_OFF = Number.POSITIVE_INFINITY;

/** Default dampening scale τ (CIELAB ΔE units). Placeholder pending the LANL fit. */
export const DEFAULT_DAMPENING = 30;

/** Default decision-noise scale for compact LANL achromatic response fits. */
export const DEFAULT_LANL_GRAY_NOISE = 10;

// ---------------------------------------------------------------------------
// sRGB ⇄ linear ⇄ XYZ ⇄ CIELAB (D65). All standard, exact.
// ---------------------------------------------------------------------------

/** Standard sRGB inverse transfer (gamma-decode): sRGB channel → linear. */
export function srgbToLinearChannel(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** Standard sRGB transfer (gamma-encode): linear channel → sRGB. */
export function linearToSrgbChannel(c: number): number {
  return c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}

export function srgbToLinear([r, g, b]: SRGB): LinearRGB {
  return [srgbToLinearChannel(r), srgbToLinearChannel(g), srgbToLinearChannel(b)];
}

export function linearToSrgb([r, g, b]: LinearRGB): SRGB {
  return [linearToSrgbChannel(r), linearToSrgbChannel(g), linearToSrgbChannel(b)];
}

// D65 reference white (CIE 1931 2°), scaled so Y = 100.
const Xn = 95.047;
const Yn = 100.0;
const Zn = 108.883;

/** Linear sRGB (Rec.709 primaries) → CIE XYZ (D65), Y scaled to [0,100]. */
export function linearRgbToXyz([r, g, b]: LinearRGB): XYZ {
  // sRGB/Rec.709 → XYZ (D65) matrix, ×100.
  const x = (0.4124564 * r + 0.3575761 * g + 0.1804375 * b) * 100;
  const y = (0.2126729 * r + 0.7151522 * g + 0.072175 * b) * 100;
  const z = (0.0193339 * r + 0.119192 * g + 0.9503041 * b) * 100;
  return [x, y, z];
}

/** CIE XYZ (D65, Y in [0,100]) → linear sRGB (Rec.709). */
export function xyzToLinearRgb([x, y, z]: XYZ): LinearRGB {
  const xs = x / 100;
  const ys = y / 100;
  const zs = z / 100;
  const r = 3.2404542 * xs - 1.5371385 * ys - 0.4985314 * zs;
  const g = -0.969266 * xs + 1.8760108 * ys + 0.041556 * zs;
  const b = 0.0556434 * xs - 0.2040259 * ys + 1.0572252 * zs;
  return [r, g, b];
}

const LAB_EPS = 216 / 24389; // (6/29)^3
const LAB_KAPPA = 24389 / 27; // (29/3)^3

function labF(t: number): number {
  return t > LAB_EPS ? Math.cbrt(t) : (LAB_KAPPA * t + 16) / 116;
}

function labFInv(t: number): number {
  const t3 = t * t * t;
  return t3 > LAB_EPS ? t3 : (116 * t - 16) / LAB_KAPPA;
}

export function xyzToLab([x, y, z]: XYZ): Lab {
  const fx = labF(x / Xn);
  const fy = labF(y / Yn);
  const fz = labF(z / Zn);
  return { L: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
}

export function labToXyz({ L, a, b }: Lab): XYZ {
  const fy = (L + 16) / 116;
  const fx = fy + a / 500;
  const fz = fy - b / 200;
  return [Xn * labFInv(fx), Yn * labFInv(fy), Zn * labFInv(fz)];
}

/** sRGB → CIELAB (D65). */
export function srgbToLab(rgb: SRGB): Lab {
  return xyzToLab(linearRgbToXyz(srgbToLinear(rgb)));
}

/** CIELAB (D65) → sRGB. Not gamut-clamped; caller may clamp to [0,1]. */
export function labToSrgb(lab: Lab): SRGB {
  return linearToSrgb(xyzToLinearRgb(labToXyz(lab)));
}

// ---------------------------------------------------------------------------
// CIEDE2000 (ΔE2000) — the LOCAL perceptual metric. Exact (Sharma et al. 2005).
// ---------------------------------------------------------------------------

const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;

/**
 * CIEDE2000 color difference between two CIELAB colors.
 * Implements Sharma, Wu & Dalal (2005), "The CIEDE2000 color-difference formula:
 * implementation notes, supplementary test data, and mathematical observations".
 * kL = kC = kH = 1 (reference conditions).
 */
export function deltaE2000(lab1: Lab, lab2: Lab): number {
  const { L: L1, a: a1, b: b1 } = lab1;
  const { L: L2, a: a2, b: b2 } = lab2;

  const C1 = Math.hypot(a1, b1);
  const C2 = Math.hypot(a2, b2);
  const Cbar = (C1 + C2) / 2;

  const Cbar7 = Math.pow(Cbar, 7);
  const G = 0.5 * (1 - Math.sqrt(Cbar7 / (Cbar7 + 6103515625))); // 25^7 = 6103515625

  const a1p = (1 + G) * a1;
  const a2p = (1 + G) * a2;
  const C1p = Math.hypot(a1p, b1);
  const C2p = Math.hypot(a2p, b2);

  const h1p = hueAngleDeg(a1p, b1);
  const h2p = hueAngleDeg(a2p, b2);

  const dLp = L2 - L1;
  const dCp = C2p - C1p;

  let dhp: number;
  if (C1p * C2p === 0) {
    dhp = 0;
  } else if (Math.abs(h2p - h1p) <= 180) {
    dhp = h2p - h1p;
  } else if (h2p - h1p > 180) {
    dhp = h2p - h1p - 360;
  } else {
    dhp = h2p - h1p + 360;
  }
  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin((dhp * DEG2RAD) / 2);

  const Lbarp = (L1 + L2) / 2;
  const Cbarp = (C1p + C2p) / 2;

  let hbarp: number;
  if (C1p * C2p === 0) {
    hbarp = h1p + h2p;
  } else if (Math.abs(h1p - h2p) <= 180) {
    hbarp = (h1p + h2p) / 2;
  } else if (h1p + h2p < 360) {
    hbarp = (h1p + h2p + 360) / 2;
  } else {
    hbarp = (h1p + h2p - 360) / 2;
  }

  const T =
    1 -
    0.17 * Math.cos((hbarp - 30) * DEG2RAD) +
    0.24 * Math.cos(2 * hbarp * DEG2RAD) +
    0.32 * Math.cos((3 * hbarp + 6) * DEG2RAD) -
    0.2 * Math.cos((4 * hbarp - 63) * DEG2RAD);

  const dTheta = 30 * Math.exp(-(((hbarp - 275) / 25) ** 2));
  const Cbarp7 = Math.pow(Cbarp, 7);
  const Rc = 2 * Math.sqrt(Cbarp7 / (Cbarp7 + 6103515625));

  const Lbarp50sq = (Lbarp - 50) ** 2;
  const Sl = 1 + (0.015 * Lbarp50sq) / Math.sqrt(20 + Lbarp50sq);
  const Sc = 1 + 0.045 * Cbarp;
  const Sh = 1 + 0.015 * Cbarp * T;
  const Rt = -Math.sin(2 * dTheta * DEG2RAD) * Rc;

  const dL = dLp / Sl;
  const dC = dCp / Sc;
  const dH = dHp / Sh;

  return Math.sqrt(dL * dL + dC * dC + dH * dH + Rt * dC * dH);
}

/** Hue angle in degrees [0,360) for a CIELAB (a,b) chroma vector. */
function hueAngleDeg(a: number, b: number): number {
  if (a === 0 && b === 0) return 0;
  const deg = Math.atan2(b, a) * RAD2DEG;
  return deg >= 0 ? deg : deg + 360;
}

// ---------------------------------------------------------------------------
// Non-Riemannian perceptual distance: E = f(arcLength(local metric)).
// ---------------------------------------------------------------------------

/**
 * Default concave dampening f(x) = τ·ln(1 + x/τ).
 *  - f(0) = 0, f'(0) = 1  ⇒ E ≈ ΔE2000 for small differences (local-metric consistency).
 *  - strictly concave, strictly subadditive  ⇒ large steps show diminishing returns
 *    (the PNAS 2022 non-additivity result).
 *  - τ → ∞ recovers f(x) = x (the Riemannian/additive baseline).
 * Placeholder pending the explicit LANL fit; see module honesty ledger.
 */
export function dampen(x: number, tau: number = DEFAULT_DAMPENING): number {
  if (!isFinite(tau)) return x; // DAMPENING_OFF ⇒ identity (Riemannian baseline)
  return tau * Math.log1p(x / tau);
}

/**
 * Arc length of the LOCAL ΔE2000 metric along the straight CIELAB segment from A to B.
 * Additive by construction (sum over substeps), so it serves as the geodesic-length
 * input g to the dampening f. For nearly-equal colors this ≈ ΔE2000(A,B).
 *
 * APPROXIMATION: the true geodesic minimises this length over curved paths in the
 * ΔE2000 metric; solveDeltaE2000Geodesic() provides a discrete relaxation solver when
 * callers need that curved local-metric path. The straight CIELAB segment remains a
 * cheap upper-bound starting point.
 */
export function arcLengthDeltaE2000(A: Lab, B: Lab, steps = 24): number {
  const n = Math.max(1, Math.floor(steps));
  let total = 0;
  let prev = A;
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    const cur: Lab = {
      L: A.L + (B.L - A.L) * t,
      a: A.a + (B.a - A.a) * t,
      b: A.b + (B.b - A.b) * t,
    };
    total += deltaE2000(prev, cur);
    prev = cur;
  }
  return total;
}

const LAB_COORDINATES = ['L', 'a', 'b'] as const;

function offsetLab(c: Lab, offsets: readonly [number, number, number]): Lab {
  return { L: c.L + offsets[0], a: c.a + offsets[1], b: c.b + offsets[2] };
}

function squaredDeltaAtOffset(center: Lab, offsets: readonly [number, number, number]): number {
  const d = deltaE2000(center, offsetLab(center, offsets));
  return d * d;
}

function clampLabPoint(c: Lab): Lab {
  return {
    L: Math.min(100, Math.max(0, c.L)),
    a: Math.min(200, Math.max(-200, c.a)),
    b: Math.min(200, Math.max(-200, c.b)),
  };
}

function interpolateLab(A: Lab, B: Lab, t: number): Lab {
  return {
    L: A.L + (B.L - A.L) * t,
    a: A.a + (B.a - A.a) * t,
    b: A.b + (B.b - A.b) * t,
  };
}

function labDelta(A: Lab, B: Lab): [number, number, number] {
  return [B.L - A.L, B.a - A.a, B.b - A.b];
}

/**
 * Numerically derives the local DeltaE2000 metric tensor at a CIELAB point.
 *
 * Pant & Farup (2012) derive Riemannian metric tensors from color-difference line
 * elements. DeltaE2000 is not algebraically pleasant, so this computes the same
 * local quadratic form by finite-difference polarization of DeltaE2000^2.
 */
export function metricTensorDeltaE2000(
  center: Lab,
  options: DeltaE2000MetricTensorOptions = {},
): LabMetricTensor {
  const epsilon = Math.max(Math.abs(options.epsilon ?? 1e-3), 1e-9);
  const regularization = Math.max(0, options.regularization ?? 1e-12);
  const epsilonSq = epsilon * epsilon;
  const metric: [
    [number, number, number],
    [number, number, number],
    [number, number, number],
  ] = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];

  for (let i = 0; i < 3; i++) {
    const plus: [number, number, number] = [0, 0, 0];
    const minus: [number, number, number] = [0, 0, 0];
    plus[i] = epsilon;
    minus[i] = -epsilon;
    metric[i][i] =
      (squaredDeltaAtOffset(center, plus) + squaredDeltaAtOffset(center, minus)) /
        (2 * epsilonSq) +
      regularization;
  }

  for (let i = 0; i < 3; i++) {
    for (let j = i + 1; j < 3; j++) {
      const pp: [number, number, number] = [0, 0, 0];
      const pm: [number, number, number] = [0, 0, 0];
      const mp: [number, number, number] = [0, 0, 0];
      const mm: [number, number, number] = [0, 0, 0];
      pp[i] = epsilon;
      pp[j] = epsilon;
      pm[i] = epsilon;
      pm[j] = -epsilon;
      mp[i] = -epsilon;
      mp[j] = epsilon;
      mm[i] = -epsilon;
      mm[j] = -epsilon;
      const gij =
        (squaredDeltaAtOffset(center, pp) +
          squaredDeltaAtOffset(center, mm) -
          squaredDeltaAtOffset(center, pm) -
          squaredDeltaAtOffset(center, mp)) /
        (8 * epsilonSq);
      metric[i][j] = gij;
      metric[j][i] = gij;
    }
  }

  return metric;
}

/** Evaluates v^T G v for a Lab-coordinate vector and metric tensor. */
export function labMetricQuadraticForm(
  vector: readonly [number, number, number],
  metric: LabMetricTensor,
): number {
  let total = 0;
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) total += vector[i] * metric[i][j] * vector[j];
  }
  return total;
}

/**
 * Arc length of the straight CIELAB segment, evaluated through the finite-difference
 * DeltaE2000 metric tensor instead of pairwise DeltaE2000 samples.
 */
export function metricTensorArcLengthDeltaE2000(
  A: Lab,
  B: Lab,
  steps = 24,
  options: DeltaE2000MetricTensorOptions = {},
): number {
  const n = Math.max(1, Math.floor(steps));
  let total = 0;
  let prev = A;
  for (let i = 1; i <= n; i++) {
    const cur = interpolateLab(A, B, i / n);
    const mid = interpolateLab(prev, cur, 0.5);
    const metric = metricTensorDeltaE2000(mid, options);
    total += Math.sqrt(Math.max(0, labMetricQuadraticForm(labDelta(prev, cur), metric)));
    prev = cur;
  }
  return total;
}

function metricSegmentEnergy(
  A: Lab,
  B: Lab,
  options: DeltaE2000MetricTensorOptions = {},
): number {
  const mid = interpolateLab(A, B, 0.5);
  const metric = metricTensorDeltaE2000(mid, options);
  return Math.max(0, labMetricQuadraticForm(labDelta(A, B), metric));
}

function metricPathEnergy(path: readonly Lab[], options: DeltaE2000MetricTensorOptions): number {
  let total = 0;
  for (let i = 1; i < path.length; i++) total += metricSegmentEnergy(path[i - 1], path[i], options);
  return total;
}

function metricPathLength(path: readonly Lab[], options: DeltaE2000MetricTensorOptions): number {
  let total = 0;
  for (let i = 1; i < path.length; i++) {
    total += Math.sqrt(metricSegmentEnergy(path[i - 1], path[i], options));
  }
  return total;
}

function withCoordinate(c: Lab, coordinate: (typeof LAB_COORDINATES)[number], value: number): Lab {
  return coordinate === 'L'
    ? { ...c, L: value }
    : coordinate === 'a'
      ? { ...c, a: value }
      : { ...c, b: value };
}

function perturbPathCoordinate(
  path: readonly Lab[],
  index: number,
  coordinate: (typeof LAB_COORDINATES)[number],
  delta: number,
  clamp: boolean,
): Lab[] {
  const next = path.slice();
  const point = path[index];
  const value = coordinate === 'L' ? point.L : coordinate === 'a' ? point.a : point.b;
  const moved = withCoordinate(point, coordinate, value + delta);
  next[index] = clamp ? clampLabPoint(moved) : moved;
  return next;
}

/**
 * Discrete geodesic relaxation for the local DeltaE2000 metric tensor.
 *
 * This is a practical numerical solver, not a closed-form geodesic equation solver:
 * it minimizes the sampled path energy over interior Lab points using finite-difference
 * gradients while keeping endpoints fixed. That makes the D-fit path explicit and
 * testable without inventing unpublished LANL parameters.
 */
export function solveDeltaE2000Geodesic(
  A: Lab,
  B: Lab,
  options: DeltaE2000GeodesicOptions = {},
): DeltaE2000GeodesicResult {
  const segments = Math.max(1, Math.floor(options.segments ?? 12));
  const iterations = Math.max(0, Math.floor(options.iterations ?? 40));
  const stepSize = Math.max(0, options.stepSize ?? 0.02);
  const gradientStep = Math.max(1e-6, options.gradientStep ?? 0.05);
  const maxCoordinateStep = Math.max(0, options.maxCoordinateStep ?? 0.35);
  const clamp = options.clampLab ?? true;
  const metricOptions: DeltaE2000MetricTensorOptions = {
    epsilon: options.epsilon,
    regularization: options.regularization,
  };
  const path: Lab[] = [];
  for (let i = 0; i <= segments; i++) path.push(interpolateLab(A, B, i / segments));

  for (let iteration = 0; iteration < iterations; iteration++) {
    let accepted = 0;
    for (let i = 1; i < path.length - 1; i++) {
      const before = metricPathEnergy(path, metricOptions);
      let candidatePoint = path[i];

      for (const coordinate of LAB_COORDINATES) {
        const plus = perturbPathCoordinate(path, i, coordinate, gradientStep, clamp);
        const minus = perturbPathCoordinate(path, i, coordinate, -gradientStep, clamp);
        const gradient =
          (metricPathEnergy(plus, metricOptions) - metricPathEnergy(minus, metricOptions)) /
          (2 * gradientStep);
        const rawMove = -stepSize * gradient;
        const move = Math.min(maxCoordinateStep, Math.max(-maxCoordinateStep, rawMove));
        const value =
          coordinate === 'L'
            ? candidatePoint.L
            : coordinate === 'a'
              ? candidatePoint.a
              : candidatePoint.b;
        candidatePoint = withCoordinate(candidatePoint, coordinate, value + move);
        if (clamp) candidatePoint = clampLabPoint(candidatePoint);
      }

      const candidate = path.slice();
      candidate[i] = candidatePoint;
      if (metricPathEnergy(candidate, metricOptions) <= before + 1e-12) {
        path[i] = candidatePoint;
        accepted++;
      }
    }
    if (accepted === 0) break;
  }

  return {
    path,
    length: metricPathLength(path, metricOptions),
    straightLength: metricTensorArcLengthDeltaE2000(A, B, segments, metricOptions),
    energy: metricPathEnergy(path, metricOptions),
    iterations,
  };
}

function erfApprox(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const absX = Math.abs(x);
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;
  const t = 1 / (1 + p * absX);
  const y =
    1 -
    (((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-absX * absX));
  return sign * y;
}

function normalCdf(x: number): number {
  return 0.5 * (1 + erfApprox(x / Math.SQRT2));
}

function clampProbability(p: number): number {
  return Math.min(1 - 1e-12, Math.max(1e-12, p));
}

/**
 * Probability that a LANL gray-axis triad response chooses test 2 as more different.
 * Mirrors the LANL R analysis: pnorm(m2 - m1), with m1/m2 transformed differences.
 */
export function lanlGrayChoiceProbability(
  row: Pick<LanlGrayAchromaticAggregate, 'Ls' | 'Lt1' | 'Lt2'>,
  options: LanlGrayChoiceModelOptions = {},
): number {
  const dampening = options.dampening ?? DEFAULT_DAMPENING;
  const noise = Math.max(1e-9, Math.abs(options.noise ?? DEFAULT_LANL_GRAY_NOISE));
  const d1 = Math.abs(row.Ls - row.Lt1);
  const d2 = Math.abs(row.Ls - row.Lt2);
  return clampProbability(normalCdf((dampen(d2, dampening) - dampen(d1, dampening)) / noise));
}

export function lanlGrayNegativeLogLikelihood(
  rows: readonly LanlGrayAchromaticAggregate[],
  options: LanlGrayChoiceModelOptions = {},
): number {
  let total = 0;
  for (const row of rows) {
    if (row.count <= 0) continue;
    const choseT2 = Math.min(row.count, Math.max(0, row.choseT2));
    const p = lanlGrayChoiceProbability(row, options);
    total -= choseT2 * Math.log(p) + (row.count - choseT2) * Math.log(1 - p);
  }
  return total;
}

export function lanlGrayMeanAccuracy(
  rows: readonly LanlGrayAchromaticAggregate[],
  options: LanlGrayChoiceModelOptions = {},
): number {
  let weightedAccuracy = 0;
  let totalCount = 0;
  for (const row of rows) {
    if (row.count <= 0) continue;
    const predictedT2 = lanlGrayChoiceProbability(row, options) * row.count;
    weightedAccuracy += row.count * (1 - Math.abs(row.choseT2 - predictedT2) / row.count);
    totalCount += row.count;
  }
  return totalCount > 0 ? weightedAccuracy / totalCount : 0;
}

/** Grid-search fit for the compact LANL achromatic gray-axis aggregate fixture. */
export function fitLanlGrayAchromaticModel(
  rows: readonly LanlGrayAchromaticAggregate[],
  options: LanlGrayFitOptions = {},
): LanlGrayFitResult {
  if (rows.length === 0) {
    throw new Error('fitLanlGrayAchromaticModel requires at least one aggregate row');
  }

  const dampeningCandidates = options.dampeningCandidates ?? [
    10,
    15,
    20,
    30,
    45,
    60,
    90,
    DAMPENING_OFF,
  ];
  const noiseCandidates = options.noiseCandidates ?? [4, 6, 8, 10, 12, 15, 20];
  let best: LanlGrayFitResult | undefined;

  for (const dampening of dampeningCandidates) {
    for (const noise of noiseCandidates) {
      const negativeLogLikelihood = lanlGrayNegativeLogLikelihood(rows, { dampening, noise });
      if (!best || negativeLogLikelihood < best.negativeLogLikelihood) {
        best = {
          dampening,
          noise,
          negativeLogLikelihood,
          meanAccuracy: lanlGrayMeanAccuracy(rows, { dampening, noise }),
          rows: rows.length,
        };
      }
    }
  }

  if (!best) {
    throw new Error('fitLanlGrayAchromaticModel requires at least one dampening and noise candidate');
  }
  return best;
}

/**
 * Non-Riemannian perceptual distance E between two sRGB colors, per Bujack et al. 2025.
 * E = f(g) where g is the ΔE2000 arc length and f is a concave dampening function.
 * Symmetric, non-negative, zero iff colors are perceptually identical.
 *
 * For small differences E ≈ ΔE2000 (the local metric). For large differences E exhibits
 * diminishing returns: E(A,C) < E(A,B) + E(B,C) for collinear A,B,C — the property that
 * no Riemannian metric (incl. raw ΔE2000) can satisfy. Pass `dampening: DAMPENING_OFF`
 * to recover the additive Riemannian baseline.
 */
export function perceptualDistance(
  a: SRGB,
  b: SRGB,
  options: PerceptualDistanceOptions = {},
): number {
  const { dampening = DEFAULT_DAMPENING, steps = 24 } = options;
  const g = arcLengthDeltaE2000(srgbToLab(a), srgbToLab(b), steps);
  return dampen(g, dampening);
}

// ---------------------------------------------------------------------------
// Derived neutral axis, intrinsic lightness / chroma / hue (CGF 2025 Def. 8, 5, 6).
// ---------------------------------------------------------------------------

/**
 * The neutral (gray) color of equal lightness to `c`, DERIVED from the metric rather than
 * assumed: the equal-lightness color closest to the black apex under the metric
 * (CGF 2025 Def. 8). Under the ΔE2000 approximation the minimiser is the (L*, 0, 0) locus,
 * matching the empirical CIELAB gray axis.
 */
export function nearestNeutral(c: SRGB): SRGB {
  const lab = srgbToLab(c);
  return labToSrgb({ L: lab.L, a: 0, b: 0 });
}

/** Intrinsic lightness (CIELAB L*, position along the derived neutral axis). */
export function lightness(c: SRGB): number {
  return srgbToLab(c).L;
}

/** Intrinsic saturation/chroma: perceptual distance from the derived neutral axis. */
export function chroma(c: SRGB): number {
  const lab = srgbToLab(c);
  return Math.hypot(lab.a, lab.b);
}

/** Intrinsic hue angle in degrees [0,360) around the derived neutral axis. */
export function hue(c: SRGB): number {
  const lab = srgbToLab(c);
  return hueAngleDeg(lab.a, lab.b);
}

/**
 * Perceptual interpolation between two sRGB colors at t ∈ [0,1].
 * Interpolates along the straight CIELAB segment (perceptually far more uniform than RGB
 * lerp; hue-preserving for grayscale-to-color and luminance edits in practice).
 *
 * APPROXIMATION: true non-Riemannian / Bezold–Brücke-correct interpolation follows the
 * curved geodesic in the ΔE2000 metric (needs the relaxation solver, Bujack TVCG 2023);
 * straight CIELAB is the D1 starting point. See module honesty ledger.
 */
export function perceptualLerp(a: SRGB, b: SRGB, t: number): SRGB {
  const la = srgbToLab(a);
  const lb = srgbToLab(b);
  const u = Math.min(1, Math.max(0, t));
  return labToSrgb({
    L: la.L + (lb.L - la.L) * u,
    a: la.a + (lb.a - la.a) * u,
    b: la.b + (lb.b - la.b) * u,
  });
}
