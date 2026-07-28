/**
 * KinematicChainTrait — DH-parameter FK + damped Jacobian IK (H2).
 *
 * Provides forward kinematics (FK) and inverse kinematics (IK) for serial
 * kinematic chains described by standard Denavit-Hartenberg parameters.
 *
 * ## DH Convention (Standard)
 *
 * Each row of the DH table defines the transform from frame i-1 to frame i:
 *
 *   T_{i-1,i} = Rot_z(θ_i) · Trans_z(d_i) · Trans_x(a_i) · Rot_x(α_i)
 *
 * Row-major 4×4 matrix form:
 *   [ cos θ,  -sin θ cos α,   sin θ sin α,  a cos θ ]
 *   [ sin θ,   cos θ cos α,  -cos θ sin α,  a sin θ ]
 *   [   0,       sin α,         cos α,        d     ]
 *   [   0,         0,             0,           1    ]
 *
 * where θ = thetaOffset + jointAngle (constant offset + variable q_i).
 *
 * ## IK: damped Jacobian (Levenberg-Marquardt)
 *
 * Position-only IK. 3×n Jacobian column j: J[:,j] = z_{j-1} × (p_ee - p_{j-1}).
 * Update: dq = J^T (JJ^T + λ²I)⁻¹ Δp. Converges in ≤ 100 iterations for
 * well-conditioned chains.
 *
 * ## Domain-neutrality
 *
 * No domain nouns appear here. The solver applies to robotics, animation,
 * biomechanics, and any articulated structure.
 *
 * ## Trait usage
 *
 *   onAttach: pre-computes FK from initial config if links/angles are set.
 *   onEvent 'kinematic_chain.solve_fk': FK → result on node.__kinematic_fk.
 *   onEvent 'kinematic_chain.solve_ik': IK → result on node.__kinematic_ik.
 */

import type { TraitHandler } from './TraitTypes';

// ── DH types ──────────────────────────────────────────────────────────────────

/** One row of the standard Denavit-Hartenberg parameter table. */
export interface DHParameter {
  /** Link length (scene units). */
  a: number;
  /** Link twist α (radians). */
  alpha: number;
  /** Joint offset d along z (scene units). */
  d: number;
  /** Constant joint angle offset (radians). Added to the variable q_i. */
  theta: number;
}

/** Trait configuration — DH table plus current joint angles. */
export interface KinematicChainConfig {
  /** DH table — one row per joint. */
  links: DHParameter[];
  /** Current joint angles q (radians). Length must equal `links.length`. */
  jointAngles: number[];
}

/** Result of forward kinematics. */
export interface FKResult {
  /** End-effector position in the base frame. */
  endEffectorPosition: { x: number; y: number; z: number };
  /** Full 4×4 end-effector transform (row-major, 16 elements). */
  endEffectorTransform: number[];
  /** Per-joint frame transforms (row-major 4×4), indexed 0..n-1. */
  frameTransforms: number[][];
}

/** Input to the IK solver. */
export interface IKRequest {
  /** DH table — one row per joint. */
  links: DHParameter[];
  /** Target end-effector position in the base frame. */
  target: { x: number; y: number; z: number };
  /** Initial joint angles. Defaults to all-zero. */
  initialAngles?: number[];
  /** Maximum iterations. Default: 100. */
  maxIterations?: number;
  /** Convergence tolerance (scene units). Default: 1e-4. */
  tolerance?: number;
  /** Damping factor λ for LM update. Default: 0.01. */
  damping?: number;
}

/** Result of inverse kinematics. */
export interface IKResult {
  /** Joint angles that achieve (approximately) the target. */
  jointAngles: number[];
  /** True when final error is below tolerance. */
  converged: boolean;
  /** Final end-effector position error. */
  finalError: number;
  /** Iterations used. */
  iterations: number;
}

// ── Row-major 4×4 matrix math ─────────────────────────────────────────────────

function mat4Identity(): number[] {
  return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
}

/**
 * Standard DH homogeneous transform (row-major, 16 elements).
 * Index [row*4 + col].
 */
export function dhTransform(a: number, alpha: number, d: number, theta: number): number[] {
  const ct = Math.cos(theta);
  const st = Math.sin(theta);
  const ca = Math.cos(alpha);
  const sa = Math.sin(alpha);
  return [ct, -st * ca, st * sa, a * ct, st, ct * ca, -ct * sa, a * st, 0, sa, ca, d, 0, 0, 0, 1];
}

function mat4Mul(a: number[], b: number[]): number[] {
  const r = new Array<number>(16).fill(0);
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      for (let k = 0; k < 4; k++) {
        r[i * 4 + j] += a[i * 4 + k] * b[k * 4 + j];
      }
    }
  }
  return r;
}

// ── Frame extraction ───────────────────────────────────────────────────────────

interface FrameInfo {
  /** z-axis of this frame (column 2 of rotation block). */
  z: { x: number; y: number; z: number };
  /** Origin of this frame (column 3). */
  p: { x: number; y: number; z: number };
}

function extractFrame(T: number[]): FrameInfo {
  return {
    z: { x: T[2], y: T[6], z: T[10] },
    p: { x: T[3], y: T[7], z: T[11] },
  };
}

function computeAllFrames(links: DHParameter[], q: number[]): FrameInfo[] {
  const frames: FrameInfo[] = [];
  let T = mat4Identity();
  frames.push(extractFrame(T)); // base frame
  for (let i = 0; i < links.length; i++) {
    const { a, alpha, d, theta: off } = links[i];
    T = mat4Mul(T, dhTransform(a, alpha, d, off + q[i]));
    frames.push(extractFrame(T));
  }
  return frames;
}

// ── 3×3 linear solve (Gaussian elimination with partial pivoting) ──────────────

function solve3x3(A: number[][], b: number[]): number[] {
  const a = A.map((row) => [...row]);
  const x = [...b];
  for (let k = 0; k < 3; k++) {
    let maxVal = Math.abs(a[k][k]);
    let maxRow = k;
    for (let i = k + 1; i < 3; i++) {
      if (Math.abs(a[i][k]) > maxVal) {
        maxVal = Math.abs(a[i][k]);
        maxRow = i;
      }
    }
    [a[k], a[maxRow]] = [a[maxRow], a[k]];
    [x[k], x[maxRow]] = [x[maxRow], x[k]];
    for (let i = k + 1; i < 3; i++) {
      if (Math.abs(a[k][k]) < 1e-12) continue;
      const f = a[i][k] / a[k][k];
      for (let j = k; j < 3; j++) a[i][j] -= f * a[k][j];
      x[i] -= f * x[k];
    }
  }
  const result = [0, 0, 0];
  for (let i = 2; i >= 0; i--) {
    if (Math.abs(a[i][i]) < 1e-12) {
      result[i] = 0;
      continue;
    }
    result[i] = x[i];
    for (let j = i + 1; j < 3; j++) result[i] -= a[i][j] * result[j];
    result[i] /= a[i][i];
  }
  return result;
}

// ── Public solvers ─────────────────────────────────────────────────────────────

/**
 * Forward kinematics — compute end-effector pose from DH table + joint angles.
 */
export function solveFk(links: DHParameter[], jointAngles: number[]): FKResult {
  const frameTransforms: number[][] = [];
  let T = mat4Identity();
  for (let i = 0; i < links.length; i++) {
    const { a, alpha, d, theta: off } = links[i];
    T = mat4Mul(T, dhTransform(a, alpha, d, off + jointAngles[i]));
    frameTransforms.push([...T]);
  }
  return {
    endEffectorPosition: { x: T[3], y: T[7], z: T[11] },
    endEffectorTransform: T,
    frameTransforms,
  };
}

/**
 * Position-only IK using a damped Jacobian (Levenberg-Marquardt).
 *
 * Converges in ≤ `maxIterations` steps. Returns `converged: true` when the
 * end-effector position is within `tolerance` of `target`.
 */
export function solveIk(req: IKRequest): IKResult {
  const { links, target, maxIterations = 100, tolerance = 1e-4, damping = 0.01 } = req;
  const n = links.length;
  const q = [...(req.initialAngles ?? new Array<number>(n).fill(0))];
  const lam2 = damping * damping;

  for (let iter = 0; iter < maxIterations; iter++) {
    const frames = computeAllFrames(links, q);
    const ee = frames[n].p;
    const dx = target.x - ee.x;
    const dy = target.y - ee.y;
    const dz = target.z - ee.z;
    const error = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (error < tolerance) {
      return { jointAngles: [...q], converged: true, finalError: error, iterations: iter };
    }

    // Build 3×n Jacobian: J[row][col] = (z_{col-1} × (p_ee - p_{col-1}))[row]
    const J = [
      new Array<number>(n).fill(0),
      new Array<number>(n).fill(0),
      new Array<number>(n).fill(0),
    ];
    for (let j = 0; j < n; j++) {
      const { z, p } = frames[j];
      const dpx = ee.x - p.x;
      const dpy = ee.y - p.y;
      const dpz = ee.z - p.z;
      J[0][j] = z.y * dpz - z.z * dpy;
      J[1][j] = z.z * dpx - z.x * dpz;
      J[2][j] = z.x * dpy - z.y * dpx;
    }

    // JJT = J * J^T  (3×3, symmetric)
    const JJT = [
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 0],
    ];
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        for (let j = 0; j < n; j++) JJT[r][c] += J[r][j] * J[c][j];
      }
    }
    for (let i = 0; i < 3; i++) JJT[i][i] += lam2;

    // Solve (JJT) y = [dx,dy,dz]; then dq = J^T y
    const y = solve3x3(JJT, [dx, dy, dz]);
    for (let j = 0; j < n; j++) {
      q[j] += J[0][j] * y[0] + J[1][j] * y[1] + J[2][j] * y[2];
    }
  }

  const finalEe = computeAllFrames(links, q)[n].p;
  const finalError = Math.sqrt(
    (target.x - finalEe.x) ** 2 + (target.y - finalEe.y) ** 2 + (target.z - finalEe.z) ** 2
  );
  return { jointAngles: [...q], converged: false, finalError, iterations: maxIterations };
}

// ── TraitHandler ───────────────────────────────────────────────────────────────

export const kinematicChainHandler: TraitHandler<KinematicChainConfig> = {
  name: 'kinematic_chain',
  defaultConfig: { links: [], jointAngles: [] },

  onAttach(node, config) {
    if (config.links.length > 0 && config.jointAngles.length === config.links.length) {
      (node as unknown as Record<string, unknown>).__kinematic_fk = solveFk(
        config.links,
        config.jointAngles
      );
    }
  },

  onEvent(node, config, _ctx, event) {
    if (event.type === 'kinematic_chain.solve_fk') {
      const e = event as unknown as Partial<KinematicChainConfig>;
      const links = e.links ?? config.links;
      const angles = e.jointAngles ?? config.jointAngles;
      (node as unknown as Record<string, unknown>).__kinematic_fk = solveFk(links, angles);
    }
    if (event.type === 'kinematic_chain.solve_ik') {
      const req = event as unknown as Partial<IKRequest>;
      (node as unknown as Record<string, unknown>).__kinematic_ik = solveIk({
        links: req.links ?? config.links,
        target: req.target ?? { x: 0, y: 0, z: 0 },
        initialAngles: req.initialAngles,
        maxIterations: req.maxIterations,
        tolerance: req.tolerance,
        damping: req.damping,
      });
    }
  },
};
