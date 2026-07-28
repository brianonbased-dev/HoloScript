/**
 * @fileoverview GaussianSH — the spherical-harmonics (view-dependent) color model for the native
 * 3DGS trainer. Closes the /critic #4 gap ("flat RGB, cannot fit view-dependent / specular color").
 *
 * Real 3DGS encodes each gaussian's color as SH coefficients (the inria default is degree 3). The
 * color seen from a view direction d is C(d) = 0.5 + Σ_k basis_k(d)·coeff_k — so the same gaussian
 * looks different from different angles (specular highlights, sheen). Flat RGB is exactly SH degree 0
 * with no directional terms, which can only reproduce the angular AVERAGE.
 *
 * This module is the gradient-checked SH color FUNCTION (forward + backward, degrees 0-2). It is the
 * piece a SH-aware runner uses as the per-view color: forward3D's flat `r,gr,bl` would be replaced by
 * `0.5 + evalSH(coeffs, viewdir)` per view, and the existing dL/d{r,gr,bl} chained back to dL/dcoeffs
 * (and dL/dviewdir → dL/dmean3d) via evalSHGrad. The model + its view-dependence are verified here;
 * threading it through the full 3D training loop is the documented integration step.
 */

/** Real-SH basis constants (match the inria 3DGS / gsplat convention). */
export const SH_C0 = 0.28209479177387814;
export const SH_C1 = 0.4886025119029199;
export const SH_C2 = [
  1.0925484305920792, -1.0925484305920792, 0.31539156525252005, -1.0925484305920792,
  0.5462742152960396,
] as const;

/** Number of SH coefficients per color channel for a given degree: (deg+1)^2. */
export function shCoeffCount(deg: number): number {
  return (deg + 1) * (deg + 1);
}

/** SH basis values at a (normalized) direction (x,y,z), length (deg+1)^2. */
export function shBasis(x: number, y: number, z: number, deg: number): number[] {
  const b = [SH_C0];
  if (deg >= 1) b.push(-SH_C1 * y, SH_C1 * z, -SH_C1 * x);
  if (deg >= 2) {
    const xx = x * x,
      yy = y * y,
      zz = z * z,
      xy = x * y,
      yz = y * z,
      xz = x * z;
    b.push(
      SH_C2[0] * xy,
      SH_C2[1] * yz,
      SH_C2[2] * (2 * zz - xx - yy),
      SH_C2[3] * xz,
      SH_C2[4] * (xx - yy)
    );
  }
  return b;
}

/** Single-channel SH radiance Σ basis_k·coeff_k (the caller adds the 0.5 offset for final color). */
export function evalSH(
  coeffs: ArrayLike<number>,
  x: number,
  y: number,
  z: number,
  deg: number
): number {
  const b = shBasis(x, y, z, deg);
  let s = 0;
  for (let k = 0; k < b.length; k++) s += b[k] * coeffs[k];
  return s;
}

export interface SHGrad {
  /** dRadiance/dcoeff_k, length (deg+1)^2. */
  dCoeffs: number[];
  /** dRadiance/d(x,y,z) — the view-direction gradient (for the mean3d chain). */
  dDir: [number, number, number];
}

/**
 * Backward of evalSH. Given the upstream dRadiance (= dL/dcolor), returns dL/dcoeffs and dL/ddir.
 * Verified against central finite differences in GaussianSH.test.ts.
 */
export function evalSHGrad(
  coeffs: ArrayLike<number>,
  x: number,
  y: number,
  z: number,
  deg: number,
  dR: number
): SHGrad {
  const b = shBasis(x, y, z, deg);
  const dCoeffs = b.map((bv) => dR * bv);
  let dx = 0,
    dy = 0,
    dz = 0;
  if (deg >= 1) {
    dy += dR * coeffs[1] * -SH_C1;
    dz += dR * coeffs[2] * SH_C1;
    dx += dR * coeffs[3] * -SH_C1;
  }
  if (deg >= 2) {
    // basis order: [4]=C2[0]·xy, [5]=C2[1]·yz, [6]=C2[2]·(2z²−x²−y²), [7]=C2[3]·xz, [8]=C2[4]·(x²−y²)
    dx +=
      dR *
      (coeffs[4] * SH_C2[0] * y +
        coeffs[6] * SH_C2[2] * (-2 * x) +
        coeffs[7] * SH_C2[3] * z +
        coeffs[8] * SH_C2[4] * (2 * x));
    dy +=
      dR *
      (coeffs[4] * SH_C2[0] * x +
        coeffs[5] * SH_C2[1] * z +
        coeffs[6] * SH_C2[2] * (-2 * y) +
        coeffs[8] * SH_C2[4] * (-2 * y));
    dz +=
      dR * (coeffs[5] * SH_C2[1] * y + coeffs[6] * SH_C2[2] * (4 * z) + coeffs[7] * SH_C2[3] * x);
  }
  return { dCoeffs, dDir: [dx, dy, dz] };
}

/** Convenience: SH color (0.5 + radiance, clamped to [0,1]) for one channel at a view direction. */
export function shColor(
  coeffs: ArrayLike<number>,
  x: number,
  y: number,
  z: number,
  deg: number
): number {
  const c = 0.5 + evalSH(coeffs, x, y, z, deg);
  return c < 0 ? 0 : c > 1 ? 1 : c;
}
