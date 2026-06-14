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
 *     line element exists in the literature as of 2026-06. We model g as the arc length of
 *     the LOCAL ΔE2000 metric along the straight CIELAB segment (an additive geodesic-length
 *     approximation; the true geodesic needs a relaxation solver on the ΔE2000 metric tensor
 *     of Raj Pant & Farup 2012 — see TODO), and f as a configurable concave dampening
 *     function. The default f satisfies f'(0)=1 (so E ≈ ΔE2000 for small differences, matching
 *     the local metric) and is strictly subadditive (so large steps show diminishing returns,
 *     matching PNAS 2022). The exact f from the LANL achromatic fit (power-law / Hermite spline,
 *     data at github.com/lanl/color) is a TODO.
 *   - perceptualLerp interpolates along the straight CIELAB segment (already far better than
 *     RGB lerp); true non-Riemannian geodesic interpolation is a TODO (same solver as above).
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

/**
 * Pass as `dampening` to disable the non-Riemannian correction and recover the additive
 * (Riemannian) baseline. Equivalent to f = identity.
 */
export const DAMPENING_OFF = Number.POSITIVE_INFINITY;

/** Default dampening scale τ (CIELAB ΔE units). Placeholder pending the LANL fit. */
export const DEFAULT_DAMPENING = 30;

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
 * ΔE2000 metric (needs a relaxation solver, Bujack et al. TVCG 2023); the straight
 * CIELAB segment is a defensible upper-bound starting point. See module honesty ledger.
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
