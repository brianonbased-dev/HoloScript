/**
 * @fileoverview Differentiable 3D->2D Gaussian PROJECTION (EWA splatting) — STAGE 2 of the
 * sovereign HoloScript 3DGS trainer. Composes with GaussianTrainer2D (the gradient-checked
 * alpha-blend core): this module maps real 3D gaussian parameters to the 2D raster
 * representation and back, so the optimizer can train means / scales / quaternions directly
 * from posed camera views — no Python gsplat, no remote cloud.
 *
 *   forward3D : {mean3d, scale, quat, opacity, color} + camera -> Gaussian2D {posx,posy,a,b,c,...}
 *   backward3D: dL/d Gaussian2D (from backward2D) -> dL/d{mean3d, scale, quat}  (op,color pass through)
 *
 * The projection MIRRORS shaders/splat-compress.wgsl computeCov2D EXACTLY (quat->R, M=R*diag(scale),
 * Sigma=M Mᵀ, T=V Sigma Vᵀ, J, cov2d, 0.3px low-pass dilation, conic=inv(cov2d)). This is the CPU
 * parity spec the eventual WGSL trainer kernels are checked against.
 *
 * The backward uses standard matrix-calculus identities under the "independent-entry" convention
 * (off-diagonal scalar gradient split half onto each mirror at the conic→cov boundary):
 *   Y = A X Aᵀ  (X sym) =>  dL/dX = Aᵀ (dL/dY) A ,  dL/dA = (dL/dY + dL/dYᵀ) A X
 * which avoids the symmetric-matrix factor-of-2 traps that hand-rolled coefficient lists invite.
 * Verified against finite differences (worst rel err ~3e-6) in GaussianTrainer3D.test.ts.
 *
 * Stage 1 = GaussianTrainer2D (alpha-blend autodiff). Stage 2 = this (projection chain).
 * Stage 3 = WGSL port of the hot path onto the forward GaussianSplatSorter.
 *
 * LIMITATION (per the 2026-06-20 /critic review): color is flat per-gaussian RGB — there is NO
 * spherical-harmonics / view-dependent appearance. Color passes through each view unchanged, so this
 * cannot fit specular / view-dependent effects that real 3DGS uses SH (degree 3) for. A multi-view
 * fit against targets rendered by this same forward pass cannot expose this; real captures will.
 */

import { type Gaussian2D, type Gaussian2DGrad } from './GaussianTrainer2D';

/** SoA buffers for N 3D gaussians (raw quat — NOT assumed normalized, matching the shader). */
export interface Gaussian3D {
  N: number;
  x: Float64Array;
  y: Float64Array;
  z: Float64Array; // mean3d
  sx: Float64Array;
  sy: Float64Array;
  sz: Float64Array; // scale
  qr: Float64Array;
  qx: Float64Array;
  qy: Float64Array;
  qz: Float64Array; // quat (r,x,y,z)
  op: Float64Array;
  r: Float64Array;
  gr: Float64Array;
  bl: Float64Array; // opacity + color
}

/** Per-parameter gradient buffers for the 3D parameters. */
export interface Gaussian3DGrad {
  x: Float64Array;
  y: Float64Array;
  z: Float64Array;
  sx: Float64Array;
  sy: Float64Array;
  sz: Float64Array;
  qr: Float64Array;
  qx: Float64Array;
  qy: Float64Array;
  qz: Float64Array;
  op: Float64Array;
  r: Float64Array;
  gr: Float64Array;
  bl: Float64Array;
}

/** Pinhole camera: Vrow = 3x3 view rotation (row-major), t = view translation, fx/fy focal px. */
export interface SplatCamera {
  Vrow: readonly number[]; // length 9, row-major
  t: readonly [number, number, number];
  fx: number;
  fy: number;
  cx?: number;
  cy?: number; // principal point (default image centre)
}

/** Cached forward intermediates needed by backward3D. */
export interface ProjectIntermediates {
  camx: Float64Array;
  camy: Float64Array;
  camz: Float64Array;
  tx: Float64Array;
  ty: Float64Array;
  J00: Float64Array;
  J02: Float64Array;
  J11: Float64Array;
  J12: Float64Array;
  T: number[][];
  M: number[][];
  R: number[][];
  sx: Float64Array;
  sy: Float64Array;
  sz: Float64Array;
  cov00: Float64Array;
  cov01: Float64Array;
  cov11: Float64Array;
  det: Float64Array;
  Vrow: readonly number[];
  fx: number;
  fy: number;
}

export interface Forward3DResult {
  g2: Gaussian2D;
  I: ProjectIntermediates;
}

// --- generic row-major matrix helpers -------------------------------------------------------
function matmul(
  A: readonly number[],
  ra: number,
  ca: number,
  B: readonly number[],
  cb: number
): number[] {
  const C = new Array<number>(ra * cb).fill(0);
  for (let i = 0; i < ra; i++)
    for (let j = 0; j < cb; j++) {
      let s = 0;
      for (let k = 0; k < ca; k++) s += A[i * ca + k] * B[k * cb + j];
      C[i * cb + j] = s;
    }
  return C;
}
function transpose(A: readonly number[], r: number, c: number): number[] {
  const T = new Array<number>(r * c);
  for (let i = 0; i < r; i++) for (let j = 0; j < c; j++) T[j * r + i] = A[i * c + j];
  return T;
}

/** Rotation matrix (row-major R[3*row+col]) from RAW quat (r,x,y,z) — EXACT match to the shader. */
export function quatToR(r: number, x: number, y: number, z: number): number[] {
  return [
    1 - 2 * (y * y + z * z),
    2 * (x * y - r * z),
    2 * (x * z + r * y),
    2 * (x * y + r * z),
    1 - 2 * (x * x + z * z),
    2 * (y * z - r * x),
    2 * (x * z - r * y),
    2 * (y * z + r * x),
    1 - 2 * (x * x + y * y),
  ];
}

function symMMt(M: readonly number[]): number[] {
  const S = new Array<number>(9);
  for (let a = 0; a < 3; a++)
    for (let b = 0; b < 3; b++) {
      let s = 0;
      for (let k = 0; k < 3; k++) s += M[a * 3 + k] * M[b * 3 + k];
      S[a * 3 + b] = s;
    }
  return S;
}

/**
 * Forward project N 3D gaussians to the 2D raster representation (feed g2 to forward2D).
 * Returns the Gaussian2D plus cached intermediates for backward3D.
 */
export function forward3D(G3: Gaussian3D, cam: SplatCamera, W: number, H: number): Forward3DResult {
  const N = G3.N;
  const { Vrow, t, fx, fy } = cam;
  const cx = cam.cx ?? W / 2,
    cy = cam.cy ?? H / 2;
  const g2: Gaussian2D = {
    N,
    posx: new Float64Array(N),
    posy: new Float64Array(N),
    a: new Float64Array(N),
    b: new Float64Array(N),
    c: new Float64Array(N),
    r: G3.r,
    gr: G3.gr,
    bl: G3.bl,
    op: G3.op, // color + opacity pass straight through
  };
  const I: ProjectIntermediates = {
    camx: new Float64Array(N),
    camy: new Float64Array(N),
    camz: new Float64Array(N),
    tx: new Float64Array(N),
    ty: new Float64Array(N),
    J00: new Float64Array(N),
    J02: new Float64Array(N),
    J11: new Float64Array(N),
    J12: new Float64Array(N),
    T: new Array<number[]>(N),
    M: new Array<number[]>(N),
    R: new Array<number[]>(N),
    sx: G3.sx,
    sy: G3.sy,
    sz: G3.sz,
    cov00: new Float64Array(N),
    cov01: new Float64Array(N),
    cov11: new Float64Array(N),
    det: new Float64Array(N),
    Vrow,
    fx,
    fy,
  };
  const limX = 1.3 * ((0.5 * W) / fx),
    limY = 1.3 * ((0.5 * H) / fy);
  for (let i = 0; i < N; i++) {
    const px = G3.x[i],
      py = G3.y[i],
      pz = G3.z[i];
    const camx = Vrow[0] * px + Vrow[1] * py + Vrow[2] * pz + t[0];
    const camy = Vrow[3] * px + Vrow[4] * py + Vrow[5] * pz + t[1];
    const camz = Vrow[6] * px + Vrow[7] * py + Vrow[8] * pz + t[2];
    I.camx[i] = camx;
    I.camy[i] = camy;
    I.camz[i] = camz;
    const tz = camz;
    const txn = Math.min(Math.max(camx / tz, -limX), limX);
    const tyn = Math.min(Math.max(camy / tz, -limY), limY);
    const tx = txn * tz,
      ty = tyn * tz;
    I.tx[i] = tx;
    I.ty[i] = ty;
    const J00 = fx / tz,
      J02 = (-fx * tx) / (tz * tz),
      J11 = fy / tz,
      J12 = (-fy * ty) / (tz * tz);
    I.J00[i] = J00;
    I.J02[i] = J02;
    I.J11[i] = J11;
    I.J12[i] = J12;

    const R = quatToR(G3.qr[i], G3.qx[i], G3.qy[i], G3.qz[i]);
    I.R[i] = R;
    const s0 = G3.sx[i],
      s1 = G3.sy[i],
      s2 = G3.sz[i];
    const M = [
      R[0] * s0,
      R[1] * s1,
      R[2] * s2,
      R[3] * s0,
      R[4] * s1,
      R[5] * s2,
      R[6] * s0,
      R[7] * s1,
      R[8] * s2,
    ];
    I.M[i] = M;
    const Sig = symMMt(M);
    const T = matmul(matmul(Vrow, 3, 3, Sig, 3), 3, 3, transpose(Vrow, 3, 3), 3); // V Sig Vᵀ
    I.T[i] = T;
    const T00 = T[0],
      T01 = T[1],
      T02 = T[2],
      T11 = T[4],
      T12 = T[5],
      T22 = T[8];

    let cov00 = J00 * J00 * T00 + 2 * J00 * J02 * T02 + J02 * J02 * T22;
    let cov01 = J00 * J11 * T01 + J00 * J12 * T02 + J02 * J11 * T12 + J02 * J12 * T22;
    let cov11 = J11 * J11 * T11 + 2 * J11 * J12 * T12 + J12 * J12 * T22;
    cov00 += 0.3;
    cov11 += 0.3; // 0.3px low-pass dilation (classic mode, no opacity comp)
    I.cov00[i] = cov00;
    I.cov01[i] = cov01;
    I.cov11[i] = cov11;
    const det = cov00 * cov11 - cov01 * cov01;
    I.det[i] = det;

    g2.a[i] = cov11 / det;
    g2.b[i] = -cov01 / det;
    g2.c[i] = cov00 / det; // conic = inv(cov2d)
    g2.posx[i] = fx * (camx / camz) + cx; // mean2d (J is exactly d(mean2d)/d(camPos))
    g2.posy[i] = fy * (camy / camz) + cy;
  }
  return { g2, I };
}

/**
 * Backward: dG2 (= backward2D over the raster) -> dL/d{3D params}. Opacity + color gradients
 * pass straight through (they ARE the same buffers). mean3d gets BOTH the direct mean2d term and
 * the J-through-mean coupling that cov2d induces (the EWA `dL_dmean` contribution).
 */
export function backward3D(
  G3: Gaussian3D,
  _cam: SplatCamera,
  _W: number,
  _H: number,
  I: ProjectIntermediates,
  dG2: Gaussian2DGrad
): Gaussian3DGrad {
  const N = G3.N;
  const { Vrow, fx, fy } = I;
  const out: Gaussian3DGrad = {
    x: new Float64Array(N),
    y: new Float64Array(N),
    z: new Float64Array(N),
    sx: new Float64Array(N),
    sy: new Float64Array(N),
    sz: new Float64Array(N),
    qr: new Float64Array(N),
    qx: new Float64Array(N),
    qy: new Float64Array(N),
    qz: new Float64Array(N),
    op: dG2.op,
    r: dG2.r,
    gr: dG2.gr,
    bl: dG2.bl, // pass-through
  };
  const VT = transpose(Vrow, 3, 3);
  for (let i = 0; i < N; i++) {
    const da = dG2.a[i],
      db = dG2.b[i],
      dc = dG2.c[i];
    const dposx = dG2.posx[i],
      dposy = dG2.posy[i];

    // --- conic = inv(cov2d) -> cov2d (honest unique).  A=cov00 B=cov01 D=cov11, det=AD-B^2 ---
    const A = I.cov00[i],
      B = I.cov01[i],
      D = I.cov11[i],
      det = I.det[i],
      d2 = det * det;
    const dcov00 = da * ((-D * D) / d2) + db * ((B * D) / d2) + dc * ((-B * B) / d2);
    const dcov01 =
      da * ((2 * B * D) / d2) + db * (-1 / det - (2 * B * B) / d2) + dc * ((2 * A * B) / d2);
    const dcov11 = da * ((-B * B) / d2) + db * ((A * B) / d2) + dc * ((-A * A) / d2);

    // --- cov2d = J T Jᵀ (+dilation) -> G_T, G_J via matrix identities (convention F) ---
    const J00 = I.J00[i],
      J02 = I.J02[i],
      J11 = I.J11[i],
      J12 = I.J12[i];
    const Tm = I.T[i];
    const Gcov = [dcov00, dcov01 * 0.5, dcov01 * 0.5, dcov11]; // 2x2, off-diag halved
    const Jm = [J00, 0, J02, 0, J11, J12]; // J (2x3)
    const GcovJ = matmul(Gcov, 2, 2, Jm, 3); // G_cov J (2x3)
    const GT = matmul(transpose(Jm, 2, 3), 3, 2, GcovJ, 3); // G_T = Jᵀ G_cov J (3x3)
    const GJ = matmul(GcovJ, 2, 3, Tm, 3).map((vv) => 2 * vv); // G_J = 2 G_cov J T (2x3)
    const dJ00 = GJ[0],
      dJ02 = GJ[2],
      dJ11 = GJ[4],
      dJ12 = GJ[5];

    // --- T = V Sig Vᵀ -> G_Sig = Vᵀ G_T V ; Sig = M Mᵀ -> G_M = (G_Sig+G_Sigᵀ) M ---
    const GSig = matmul(VT, 3, 3, matmul(GT, 3, 3, Vrow, 3), 3);
    const M = I.M[i];
    const GSigSym = GSig.map((vv, idx) => vv + GSig[(idx % 3) * 3 + ((idx / 3) | 0)]);
    const GM = matmul(GSigSym, 3, 3, M, 3);

    // --- M[a][k] = R[a][k] * s_k -> dR, ds ---
    const R = I.R[i],
      svec = [I.sx[i], I.sy[i], I.sz[i]];
    const dR = new Array<number>(9);
    let ds0 = 0,
      ds1 = 0,
      ds2 = 0;
    for (let a = 0; a < 3; a++) {
      ds0 += GM[a * 3 + 0] * R[a * 3 + 0];
      ds1 += GM[a * 3 + 1] * R[a * 3 + 1];
      ds2 += GM[a * 3 + 2] * R[a * 3 + 2];
      for (let k = 0; k < 3; k++) dR[a * 3 + k] = GM[a * 3 + k] * svec[k];
    }
    out.sx[i] = ds0;
    out.sy[i] = ds1;
    out.sz[i] = ds2;

    // --- R(quat) -> dquat.   r=qr x=qx y=qy z=qz ---
    const qr = G3.qr[i],
      qx = G3.qx[i],
      qy = G3.qy[i],
      qz = G3.qz[i];
    let dqr = 0,
      dqx = 0,
      dqy = 0,
      dqz = 0;
    dqy += dR[0] * (-4 * qy);
    dqz += dR[0] * (-4 * qz); // R00
    dqx += dR[1] * (2 * qy);
    dqy += dR[1] * (2 * qx);
    dqr += dR[1] * (-2 * qz);
    dqz += dR[1] * (-2 * qr); // R01
    dqx += dR[2] * (2 * qz);
    dqz += dR[2] * (2 * qx);
    dqr += dR[2] * (2 * qy);
    dqy += dR[2] * (2 * qr); // R02
    dqx += dR[3] * (2 * qy);
    dqy += dR[3] * (2 * qx);
    dqr += dR[3] * (2 * qz);
    dqz += dR[3] * (2 * qr); // R10
    dqx += dR[4] * (-4 * qx);
    dqz += dR[4] * (-4 * qz); // R11
    dqy += dR[5] * (2 * qz);
    dqz += dR[5] * (2 * qy);
    dqr += dR[5] * (-2 * qx);
    dqx += dR[5] * (-2 * qr); // R12
    dqx += dR[6] * (2 * qz);
    dqz += dR[6] * (2 * qx);
    dqr += dR[6] * (-2 * qy);
    dqy += dR[6] * (-2 * qr); // R20
    dqy += dR[7] * (2 * qz);
    dqz += dR[7] * (2 * qy);
    dqr += dR[7] * (2 * qx);
    dqx += dR[7] * (2 * qr); // R21
    dqx += dR[8] * (-4 * qx);
    dqy += dR[8] * (-4 * qy); // R22
    out.qr[i] = dqr;
    out.qx[i] = dqx;
    out.qy[i] = dqy;
    out.qz[i] = dqz;

    // --- camPos gradient (J coupling + mean2d), then dmean3d = Vᵀ dcam ---
    const tz = I.camz[i],
      tx = I.tx[i],
      ty = I.ty[i],
      tz2 = tz * tz,
      tz3 = tz2 * tz;
    let dcx = 0,
      dcy = 0,
      dcz = 0;
    dcx += dJ02 * (-fx / tz2);
    dcy += dJ12 * (-fy / tz2);
    dcz +=
      dJ00 * (-fx / tz2) +
      dJ11 * (-fy / tz2) +
      dJ02 * ((2 * fx * tx) / tz3) +
      dJ12 * ((2 * fy * ty) / tz3);
    dcx += dposx * J00;
    dcy += dposy * J11;
    dcz += dposx * J02 + dposy * J12;
    out.x[i] = Vrow[0] * dcx + Vrow[3] * dcy + Vrow[6] * dcz;
    out.y[i] = Vrow[1] * dcx + Vrow[4] * dcy + Vrow[7] * dcz;
    out.z[i] = Vrow[2] * dcx + Vrow[5] * dcy + Vrow[8] * dcz;
  }
  return out;
}
