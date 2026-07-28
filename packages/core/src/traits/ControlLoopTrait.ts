/**
 * ControlLoopTrait — PID and Model-Predictive Control (MPC) in a single trait (H2).
 *
 * ## PID controller
 *
 * Classic discrete-time PID with anti-windup integral clamping and optional
 * derivative filtering:
 *
 *   u[k] = Kp·e[k] + Ki·Σe·dt + Kd·(e[k]-e[k-1])/dt
 *
 * Anti-windup: integral is clamped to [-iMax, iMax] every step.
 * Derivative filter: optional first-order low-pass on the derivative term
 *   (d_filtered = α·d_raw + (1-α)·d_prev, α = filterCoeff ∈ (0,1]).
 * Output saturation: optional [outputMin, outputMax] clamp on the final u.
 *
 * ## Linear MPC (receding-horizon)
 *
 * State-space: x[k+1] = A·x[k] + B·u[k]
 * Objective  : min Σ_{i=0}^{H-1}(x[i]^T Q x[i] + u[i]^T R u[i]) + x[H]^T Qf x[H]
 * Constraint : u ∈ [uMin, uMax] (element-wise, applied after unconstrained solve)
 *
 * Unconstrained horizon solution via recursive Riccati descent, then project
 * each u_i into [uMin, uMax]. Linear MPC is returned as the optimal first
 * control action u[0] from the computed horizon.
 *
 * ## Domain-neutrality
 *
 * No domain nouns appear here. The controllers apply to robotics, HVAC,
 * process control, animation, or any closed-loop system.
 *
 * ## Trait usage
 *
 *   onAttach: resets internal state.
 *   onEvent 'control_loop.step':
 *     - type='pid' → PID step → result on node.__control_output.
 *     - type='mpc' → MPC horizon solve → result on node.__control_output.
 *   onEvent 'control_loop.reset': clears integral/derivative state.
 */

import type { TraitHandler } from './TraitTypes';

// ── Shared types ───────────────────────────────────────────────────────────────

/** Result of a single control step. */
export interface ControlOutput {
  /** Computed control action. */
  u: number;
  /** Type of controller that produced this output. */
  type: 'pid' | 'mpc';
  /** PID-only: proportional contribution. */
  proportional?: number;
  /** PID-only: integral contribution (post-windup). */
  integral?: number;
  /** PID-only: derivative contribution (post-filter). */
  derivative?: number;
  /** MPC-only: full computed horizon [u0, u1, ..., u_{H-1}]. */
  horizon?: number[];
}

// ── PID types ─────────────────────────────────────────────────────────────────

/** PID tuning parameters. */
export interface PIDParams {
  /** Proportional gain. */
  Kp: number;
  /** Integral gain. */
  Ki: number;
  /** Derivative gain. */
  Kd: number;
  /** Integral anti-windup clamp (magnitude). Default: Infinity. */
  iMax?: number;
  /** Derivative low-pass filter coefficient α ∈ (0,1]. 1 = no filter. Default: 1. */
  filterCoeff?: number;
  /** Output lower bound. Default: -Infinity. */
  outputMin?: number;
  /** Output upper bound. Default: +Infinity. */
  outputMax?: number;
}

/**
 * Input for a PID step event (`control_loop.pid_step`).
 * The `type` field on the event itself is the event name; this interface
 * carries only the step payload.
 */
export interface PIDStepRequest {
  /** PID tuning. Falls back to config.pid when omitted. */
  params?: PIDParams;
  /** Setpoint (reference). */
  setpoint: number;
  /** Measured process variable. */
  measurement: number;
  /** Time step Δt (same units as Ki/Kd). Default: 1. */
  dt?: number;
}

/** Internal PID state (stored on the trait). */
export interface PIDState {
  integralAccum: number;
  prevError: number;
  prevDerivative: number;
}

// ── MPC types ─────────────────────────────────────────────────────────────────

/** Linear time-invariant state-space matrices for MPC. */
export interface MPCModel {
  /** State transition matrix A (n×n, row-major). */
  A: number[];
  /** Input matrix B (n×m, row-major). */
  B: number[];
  /** State dimension n. */
  n: number;
  /** Input dimension m. */
  m: number;
}

/** MPC tuning and horizon parameters. */
export interface MPCParams {
  /** State-space model. */
  model: MPCModel;
  /** Prediction horizon. Default: 10. */
  horizon?: number;
  /** State cost matrix Q (n×n, row-major). Default: identity. */
  Q?: number[];
  /** Terminal state cost matrix Qf (n×n, row-major). Default: Q. */
  Qf?: number[];
  /** Input cost matrix R (m×m, row-major). Default: identity. */
  R?: number[];
  /** Element-wise input lower bound (length m). Default: -Infinity. */
  uMin?: number[];
  /** Element-wise input upper bound (length m). Default: +Infinity. */
  uMax?: number[];
}

/**
 * Input for an MPC step event (`control_loop.mpc_step`).
 * The `type` field on the event itself is the event name; this interface
 * carries only the step payload.
 */
export interface MPCStepRequest {
  /** MPC parameters. Falls back to config.mpc when omitted. */
  params?: MPCParams;
  /** Current state vector x (length n). */
  state: number[];
  /** Reference state trajectory (H×n, row-major). Defaults to all-zero. */
  reference?: number[];
}

// ── Trait config ───────────────────────────────────────────────────────────────

/** Trait configuration — at least one of pid or mpc must be set to use events. */
export interface ControlLoopConfig {
  /** Default PID parameters (used when event omits params). */
  pid?: PIDParams;
  /** Default MPC parameters (used when event omits params). */
  mpc?: MPCParams;
}

// ── Linear algebra helpers ─────────────────────────────────────────────────────

/** n×n identity matrix (row-major). */
function identityN(n: number): number[] {
  const I = new Array<number>(n * n).fill(0);
  for (let i = 0; i < n; i++) I[i * n + i] = 1;
  return I;
}

/** Matrix multiply: (r×k) · (k×c) → (r×c), all row-major. */
function matMul(A: number[], r: number, k: number, B: number[], c: number): number[] {
  const C = new Array<number>(r * c).fill(0);
  for (let i = 0; i < r; i++) {
    for (let j = 0; j < c; j++) {
      for (let l = 0; l < k; l++) {
        C[i * c + j] += A[i * k + l] * B[l * c + j];
      }
    }
  }
  return C;
}

/** Matrix transpose: (r×c) → (c×r). */
function matT(A: number[], r: number, c: number): number[] {
  const T = new Array<number>(r * c).fill(0);
  for (let i = 0; i < r; i++) {
    for (let j = 0; j < c; j++) {
      T[j * r + i] = A[i * c + j];
    }
  }
  return T;
}

/** Add two matrices of the same size. */
function matAdd(A: number[], B: number[]): number[] {
  return A.map((v, i) => v + B[i]);
}

/**
 * Solve n×n linear system Ax = b using Gaussian elimination with partial
 * pivoting. Returns x. Returns zero vector if singular.
 */
function solveLinear(A: number[], n: number, b: number[]): number[] {
  const a = Array.from({ length: n }, (_, i) => A.slice(i * n, i * n + n));
  const x = [...b];
  for (let k = 0; k < n; k++) {
    let maxVal = Math.abs(a[k][k]);
    let maxRow = k;
    for (let i = k + 1; i < n; i++) {
      if (Math.abs(a[i][k]) > maxVal) {
        maxVal = Math.abs(a[i][k]);
        maxRow = i;
      }
    }
    [a[k], a[maxRow]] = [a[maxRow], a[k]];
    [x[k], x[maxRow]] = [x[maxRow], x[k]];
    for (let i = k + 1; i < n; i++) {
      if (Math.abs(a[k][k]) < 1e-14) continue;
      const f = a[i][k] / a[k][k];
      for (let j = k; j < n; j++) a[i][j] -= f * a[k][j];
      x[i] -= f * x[k];
    }
  }
  const result = new Array<number>(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    if (Math.abs(a[i][i]) < 1e-14) {
      result[i] = 0;
      continue;
    }
    result[i] = x[i];
    for (let j = i + 1; j < n; j++) result[i] -= a[i][j] * result[j];
    result[i] /= a[i][i];
  }
  return result;
}

/** Matrix-vector product Ax (A is r×c row-major, x is c-vector). */
function matVec(A: number[], r: number, c: number, x: number[]): number[] {
  const y = new Array<number>(r).fill(0);
  for (let i = 0; i < r; i++) {
    for (let j = 0; j < c; j++) y[i] += A[i * c + j] * x[j];
  }
  return y;
}

/** Scalar multiply matrix. */
function matScale(A: number[], s: number): number[] {
  return A.map((v) => v * s);
}

// ── PID solver ────────────────────────────────────────────────────────────────

/**
 * Discrete-time PID step. Mutates `state` in place.
 */
export function stepPid(
  params: PIDParams,
  setpoint: number,
  measurement: number,
  dt: number,
  state: PIDState
): ControlOutput {
  const { Kp, Ki, Kd } = params;
  const iMax = params.iMax ?? Infinity;
  const alpha = params.filterCoeff ?? 1;
  const outMin = params.outputMin ?? -Infinity;
  const outMax = params.outputMax ?? Infinity;

  const error = setpoint - measurement;

  // Integral with anti-windup
  state.integralAccum += error * dt;
  state.integralAccum = Math.max(-iMax, Math.min(iMax, state.integralAccum));

  // Derivative with optional low-pass filter
  const rawDeriv = dt > 0 ? (error - state.prevError) / dt : 0;
  const filtDeriv = alpha * rawDeriv + (1 - alpha) * state.prevDerivative;
  state.prevError = error;
  state.prevDerivative = filtDeriv;

  const proportional = Kp * error;
  const integral = Ki * state.integralAccum;
  const derivative = Kd * filtDeriv;

  const u = Math.max(outMin, Math.min(outMax, proportional + integral + derivative));

  return { u, type: 'pid', proportional, integral, derivative };
}

// ── MPC solver ────────────────────────────────────────────────────────────────

/**
 * Linear MPC with receding horizon.
 *
 * Uses backward Riccati recursion to compute unconstrained optimal gains,
 * then projects each control input into [uMin, uMax] element-wise.
 * Returns the first control action u[0] as `u`, with the full horizon in
 * `output.horizon`.
 */
export function stepMpc(params: MPCParams, state: number[]): ControlOutput {
  const { model } = params;
  const { A, B, n, m } = model;
  const H = params.horizon ?? 10;

  // Cost matrices — default to identity
  const Q = params.Q ?? identityN(n);
  const Qf = params.Qf ?? Q;
  const R = params.R ?? identityN(m);
  const uMin = params.uMin ?? new Array<number>(m).fill(-Infinity);
  const uMax = params.uMax ?? new Array<number>(m).fill(Infinity);

  // Backward Riccati recursion: P[H] = Qf, then
  //   K[t] = (R + B^T P[t+1] B)^{-1} B^T P[t+1] A
  //   P[t] = Q + A^T P[t+1] (A - B K[t])
  const BT = matT(B, n, m); // m×n
  const AT = matT(A, n, n); // n×n

  let P = [...Qf]; // n×n
  const gains: number[][] = []; // H gains, each m×n

  for (let t = H - 1; t >= 0; t--) {
    // S = B^T P B (m×m)
    const BTP = matMul(BT, m, n, P, n); // m×n
    const S = matMul(BTP, m, n, B, m); // m×m: B^T P B
    // S + R
    const SpR = matAdd(S, R);

    // K = (S+R)^{-1} B^T P A
    const BTPA = matMul(BTP, m, n, A, n); // m×n: B^T P A
    // Solve (S+R) K^T = (BTPA)^T column by column
    // Each column of K is a row of the result; solve m×m system n times.
    const K = new Array<number>(m * n).fill(0);
    for (let col = 0; col < n; col++) {
      const rhs = new Array<number>(m).fill(0);
      for (let row = 0; row < m; row++) rhs[row] = BTPA[row * n + col];
      const kcol = solveLinear(SpR, m, rhs);
      for (let row = 0; row < m; row++) K[row * n + col] = kcol[row];
    }
    gains[t] = K; // m×n

    // P_new = Q + A^T P (A - B K)
    // A - BK: n×n
    const BK = matMul(B, n, m, K, n); // n×n
    const AmBK = A.map((v, i) => v - BK[i]); // n×n
    const PAmBK = matMul(P, n, n, AmBK, n); // n×n
    const ATPAmBK = matMul(AT, n, n, PAmBK, n); // n×n
    P = matAdd(Q, ATPAmBK);
  }

  // Forward simulation: apply K[t] to get u[t], then propagate state
  const horizon: number[] = [];
  let x = [...state];

  for (let t = 0; t < H; t++) {
    const K = gains[t]; // m×n
    // u_raw = -K x (optimal control is u = -K x for regulation)
    const u_raw = matVec(matScale(K, -1), m, n, x);
    // Project into [uMin, uMax]
    const u_t = u_raw.map((v, i) => Math.max(uMin[i], Math.min(uMax[i], v)));
    horizon.push(...u_t);
    // x = A x + B u
    const Ax = matVec(A, n, n, x);
    const Bu = matVec(B, n, m, u_t);
    x = Ax.map((v, i) => v + Bu[i]);
  }

  // Return the first m control inputs as the applied action
  const firstU = horizon.slice(0, m);
  const u = m === 1 ? firstU[0] : firstU[0]; // scalar output (first dimension)

  return { u, type: 'mpc', horizon };
}

// ── TraitHandler ───────────────────────────────────────────────────────────────

interface ControlLoopNodeState {
  pid?: PIDState;
}

function getPidState(node: Record<string, unknown>): PIDState {
  let ns = node.__control_state as ControlLoopNodeState | undefined;
  if (!ns) {
    ns = {};
    node.__control_state = ns;
  }
  if (!ns.pid) ns.pid = { integralAccum: 0, prevError: 0, prevDerivative: 0 };
  return ns.pid;
}

function resetPidState(node: Record<string, unknown>): void {
  const ns = node.__control_state as ControlLoopNodeState | undefined;
  if (ns?.pid) ns.pid = { integralAccum: 0, prevError: 0, prevDerivative: 0 };
}

export const controlLoopHandler: TraitHandler<ControlLoopConfig> = {
  name: 'control_loop',
  defaultConfig: {},

  onAttach(node) {
    (node as unknown as Record<string, unknown>).__control_state = {};
    (node as unknown as Record<string, unknown>).__control_output = null;
  },

  onEvent(node, config, _ctx, event) {
    const n = node as unknown as Record<string, unknown>;

    if (event.type === 'control_loop.reset') {
      resetPidState(n);
      n.__control_output = null;
      return;
    }

    if (event.type === 'control_loop.pid_step') {
      const req = event as unknown as PIDStepRequest;
      const params = req.params ?? config.pid;
      if (!params) return;
      const state = getPidState(n);
      n.__control_output = stepPid(params, req.setpoint, req.measurement, req.dt ?? 1, state);
      return;
    }

    if (event.type === 'control_loop.mpc_step') {
      const req = event as unknown as MPCStepRequest;
      const params = req.params ?? config.mpc;
      if (!params) return;
      n.__control_output = stepMpc(params, req.state);
      return;
    }
  },
};
