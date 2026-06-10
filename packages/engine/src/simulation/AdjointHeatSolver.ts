/**
 * AdjointHeatSolver — Differentiable thermal diffusion via discrete adjoint.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * FORWARD SCHEME
 * ══════════════════════════════════════════════════════════════════════════════
 *
 *   T^{n+1} = T^n + dt * ( alpha * Lap(T^n) + S )    (explicit Euler)
 *
 * on a uniform 3D grid with node spacing
 *
 *   dx = Lx / (nx − 1),  dy = Ly / (ny − 1),  dz = Lz / (nz − 1)
 *
 * matching RegularGrid3D's convention exactly.
 *
 * Dirichlet BCs are enforced by overwriting all six face layers after every
 * explicit update.  Interior Laplacian stencil follows RegularGrid3D.laplacian:
 * second-order central differences, boundary terms skipped (the overwrite
 * enforces the prescribed value before the next step reads it).
 *
 * CFL GUARD
 * ══════════════════════════════════════════════════════════════════════════════
 *
 *   dt_stable = safety * dx_min^2 / (2 * alpha * 3)
 *
 * where dx_min = min(dx, dy, dz) and safety = 0.9 by default.
 * If the requested dt exceeds dt_stable, the solver sub-steps internally so
 * the gradient computation remains unconditionally valid for any dt the caller
 * passes.
 *
 * DISCRETE ADJOINT
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Objective:  J = Σ_i  w_i * T_i^N
 *
 * The forward operator at step n is the linear map
 *
 *   F: T^n  ↦  T^{n+1} = T^n + dt * alpha * L * T^n + dt * S
 *
 * where L is the discrete Laplacian matrix (with Dirichlet rows zeroed so
 * boundary nodes are fixed).  F is self-adjoint on a uniform grid with
 * Dirichlet BCs because L is symmetric and the identity plus a symmetric
 * matrix is symmetric.  Therefore F^T = F (as a matrix), and the adjoint
 * step is identical to the forward step applied to the co-state lambda:
 *
 *   λ^N   = w
 *   λ^n   = λ^{n+1} + dt * alpha * L * λ^{n+1}     (backward sweep)
 *
 * TRANSPOSE DERIVATION (why F = F^T on uniform Dirichlet grid):
 *   F = I + dt*alpha*L.  L is the 7-point finite-difference Laplacian matrix
 *   on the interior nodes, which is symmetric negative-definite (standard
 *   result for the uniform 3D FD Laplacian with homogeneous Dirichlet BCs).
 *   On Dirichlet boundary rows, both L and F reduce to the identity (the
 *   overwrite maps T_bc → T_bc regardless of neighbors).  The combined
 *   (interior + boundary) matrix is therefore symmetric, and F^T = F. ∎
 *
 * GRADIENTS
 *   dJ/dS_i = dt * Σ_{n=0}^{N-1}  λ_i^{n+1}        (chain rule over all steps)
 *   dJ/dT0  = λ^0                                    (sensitivity to IC)
 *
 * MEMORY
 *   O(steps * N) where N = nx*ny*nz.  The full forward trajectory is stored
 *   to support the exact discrete adjoint sweep.
 *
 *   TODO (checkpointing): for very large grids or many steps, replace the
 *   full-trajectory store with a revolve-style checkpointing scheme
 *   (Griewank & Walther 2000) to reduce memory to O(sqrt(steps)*N) at
 *   O(log(steps)) extra forward work.
 */

export interface AdjointHeatConfig {
  /** Grid node counts [nx, ny, nz]. Must be ≥ 2 in each dimension. */
  resolution: [number, number, number];
  /** Physical domain size [Lx, Ly, Lz] in metres (or consistent length units). */
  domainSize: [number, number, number];
  /**
   * Thermal diffusivity α [m²/s].  No default — the value is material-specific
   * and must be supplied by the caller (rule G.GOLD.485: no Earth-hardcoded
   * physical constants).  Typical values: copper ≈ 1.17e-4, steel ≈ 1.2e-5,
   * air ≈ 2.2e-5, water ≈ 1.43e-7.
   */
  alpha: number;
  /**
   * Requested time step [s].  Internally sub-stepped if it exceeds the
   * explicit-Euler diffusion stability limit.
   */
  dt: number;
  /**
   * Volumetric heat source field S [K/s], length nx*ny*nz, row-major (k outer,
   * j middle, i inner — same as RegularGrid3D).  All zeros if omitted.
   */
  source?: Float64Array;
  /**
   * Initial temperature field T0 [K or °C], length nx*ny*nz.
   * Uniform zero if omitted.
   */
  initialT?: Float64Array;
  /**
   * Fixed temperature applied to all six boundary faces (Dirichlet BC) [K or °C].
   * Default 0.
   */
  boundaryValue?: number;
  /**
   * CFL safety factor in (0, 1].  Default 0.9.  Reduce for tighter stability
   * margins; raise toward 1 to minimise sub-step count.
   */
  cflSafety?: number;
}

export interface GradientResult {
  /** dJ/dS_i: gradient of J with respect to the source field S, same layout as S. */
  dJdS: Float64Array;
  /** dJ/dT0_i: gradient of J with respect to the initial temperature T0. */
  dJdT0: Float64Array;
  /** The objective value J = Σ_i w_i * T_i^N. */
  objective: number;
}

// ─── helpers ────────────────────────────────────────────────────────────────

/** Flat index: k-outer, j-middle, i-inner (matches RegularGrid3D). */
function idx(i: number, j: number, k: number, nx: number, ny: number): number {
  return (k * ny + j) * nx + i;
}

/**
 * Apply the explicit-Euler diffusion operator in-place on a flat Float64Array:
 *   out_i = T_i + subDt * ( alpha * Lap(T)_i + S_i )
 * Boundary nodes receive the Dirichlet value unconditionally after the update.
 */
function applyForwardStep(
  T: Float64Array,
  out: Float64Array,
  S: Float64Array,
  nx: number,
  ny: number,
  nz: number,
  dx: number,
  dy: number,
  dz: number,
  alpha: number,
  subDt: number,
  boundaryValue: number
): void {
  const dx2 = dx * dx;
  const dy2 = dy * dy;
  const dz2 = dz * dz;

  for (let k = 0; k < nz; k++) {
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        // Boundary: Dirichlet overwrite
        if (i === 0 || i === nx - 1 || j === 0 || j === ny - 1 || k === 0 || k === nz - 1) {
          out[idx(i, j, k, nx, ny)] = boundaryValue;
          continue;
        }

        const c = T[idx(i, j, k, nx, ny)];
        // 7-point stencil — all neighbours exist because we're interior
        const lap =
          (T[idx(i + 1, j, k, nx, ny)] - 2 * c + T[idx(i - 1, j, k, nx, ny)]) / dx2 +
          (T[idx(i, j + 1, k, nx, ny)] - 2 * c + T[idx(i, j - 1, k, nx, ny)]) / dy2 +
          (T[idx(i, j, k + 1, nx, ny)] - 2 * c + T[idx(i, j, k - 1, nx, ny)]) / dz2;

        out[idx(i, j, k, nx, ny)] = c + subDt * (alpha * lap + S[idx(i, j, k, nx, ny)]);
      }
    }
  }
}

/**
 * Apply the discrete adjoint of the forward step to λ (in-place update).
 * Because F = I + subDt*alpha*L is self-adjoint on the Dirichlet grid (see
 * header proof), the adjoint step is identical to the forward step with S=0:
 *
 *   λ^n = λ^{n+1} + subDt * alpha * L * λ^{n+1}
 *
 * Boundary components of λ are pinned to 0 (Dirichlet BCs on the adjoint
 * correspond to zero co-state at prescribed-temperature nodes — they have no
 * freedom to vary, so they carry no sensitivity).
 */
function applyAdjointStep(
  lam: Float64Array,
  out: Float64Array,
  nx: number,
  ny: number,
  nz: number,
  dx: number,
  dy: number,
  dz: number,
  alpha: number,
  subDt: number
): void {
  const dx2 = dx * dx;
  const dy2 = dy * dy;
  const dz2 = dz * dz;

  for (let k = 0; k < nz; k++) {
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        if (i === 0 || i === nx - 1 || j === 0 || j === ny - 1 || k === 0 || k === nz - 1) {
          out[idx(i, j, k, nx, ny)] = 0;
          continue;
        }
        const c = lam[idx(i, j, k, nx, ny)];
        const lap =
          (lam[idx(i + 1, j, k, nx, ny)] - 2 * c + lam[idx(i - 1, j, k, nx, ny)]) / dx2 +
          (lam[idx(i, j + 1, k, nx, ny)] - 2 * c + lam[idx(i, j - 1, k, nx, ny)]) / dy2 +
          (lam[idx(i, j, k + 1, nx, ny)] - 2 * c + lam[idx(i, j, k - 1, nx, ny)]) / dz2;
        out[idx(i, j, k, nx, ny)] = c + subDt * alpha * lap;
      }
    }
  }
}

// ─── main class ─────────────────────────────────────────────────────────────

export class AdjointHeatSolver {
  private readonly nx: number;
  private readonly ny: number;
  private readonly nz: number;
  private readonly N: number; // total cell count
  private readonly dx: number;
  private readonly dy: number;
  private readonly dz: number;
  private readonly alpha: number;
  private readonly requestedDt: number;
  private readonly subDt: number;  // stable sub-step size
  private readonly subStepsPerDt: number;
  private readonly S: Float64Array;
  private readonly T0: Float64Array;
  private readonly boundaryValue: number;

  /**
   * Trajectory store: trajectory[n] = T^n, n = 0 … stepsRequested.
   * Populated by forward() and consumed by gradient().
   * Memory cost: O(stepsRequested * N) Float64.
   */
  private trajectory: Float64Array[] = [];
  private forwardStepsRun = 0;

  constructor(config: AdjointHeatConfig) {
    const [nx, ny, nz] = config.resolution;
    if (nx < 2 || ny < 2 || nz < 2) {
      throw new Error('AdjointHeatSolver: each dimension must be ≥ 2.');
    }
    if (config.alpha <= 0) {
      throw new Error('AdjointHeatSolver: alpha must be positive.');
    }
    const [Lx, Ly, Lz] = config.domainSize;
    this.nx = nx;
    this.ny = ny;
    this.nz = nz;
    this.N = nx * ny * nz;
    // Node-based spacing — matches RegularGrid3D exactly
    this.dx = Lx / (nx - 1);
    this.dy = Ly / (ny - 1);
    this.dz = Lz / (nz - 1);
    this.alpha = config.alpha;
    this.requestedDt = config.dt;
    this.boundaryValue = config.boundaryValue ?? 0;

    const safety = config.cflSafety ?? 0.9;
    const dxMin = Math.min(this.dx, this.dy, this.dz);
    const dtStable = (safety * dxMin * dxMin) / (2 * config.alpha * 3);
    this.subStepsPerDt = Math.max(1, Math.ceil(config.dt / dtStable));
    this.subDt = config.dt / this.subStepsPerDt;

    // Source field S
    this.S = new Float64Array(this.N);
    if (config.source) {
      if (config.source.length !== this.N) {
        throw new Error(
          `AdjointHeatSolver: source length ${config.source.length} ≠ N=${this.N}.`
        );
      }
      this.S.set(config.source);
    }

    // Initial condition T0
    this.T0 = new Float64Array(this.N);
    if (config.initialT) {
      if (config.initialT.length !== this.N) {
        throw new Error(
          `AdjointHeatSolver: initialT length ${config.initialT.length} ≠ N=${this.N}.`
        );
      }
      this.T0.set(config.initialT);
    }
    // Enforce boundary on T0
    this._applyDirichlet(this.T0);
  }

  // ── public accessors ───────────────────────────────────────────────────────

  /** Number of sub-steps taken per logical dt. >1 when dt exceeds stability limit. */
  get subStepCount(): number {
    return this.subStepsPerDt;
  }

  /** The stable sub-step size actually used internally [s]. */
  get stableSubDt(): number {
    return this.subDt;
  }

  // ── forward pass ──────────────────────────────────────────────────────────

  /**
   * Run `steps` logical time steps (each potentially sub-stepped for CFL).
   * Returns T^N, the final temperature field.
   * Stores the full trajectory internally for subsequent gradient() call.
   *
   * Memory: (steps + 1) * N * 8 bytes of Float64.
   */
  forward(steps: number): Float64Array {
    if (steps < 1) throw new Error('AdjointHeatSolver: steps must be ≥ 1.');

    // Snapshot T0 as trajectory[0]
    this.trajectory = new Array(steps + 1);
    this.trajectory[0] = new Float64Array(this.T0);

    const buf0 = new Float64Array(this.N);
    const buf1 = new Float64Array(this.N);

    let cur = new Float64Array(this.T0);

    for (let n = 0; n < steps; n++) {
      // Sub-step for CFL stability
      for (let s = 0; s < this.subStepsPerDt; s++) {
        applyForwardStep(
          cur, buf0,
          this.S,
          this.nx, this.ny, this.nz,
          this.dx, this.dy, this.dz,
          this.alpha, this.subDt, this.boundaryValue
        );
        // Swap
        cur.set(buf0);
      }
      this.trajectory[n + 1] = new Float64Array(cur);
    }

    this.forwardStepsRun = steps;
    return new Float64Array(this.trajectory[steps]);
  }

  // ── adjoint / gradient pass ───────────────────────────────────────────────

  /**
   * Compute gradients of J = Σ_i w_i * T_i^N with respect to the source
   * field S and the initial condition T0, using the discrete adjoint method.
   *
   * Must be called after forward().
   *
   * @param weights  Weight field w of length N.  Interior values only — boundary
   *                 weights are silently ignored (Dirichlet nodes are fixed and
   *                 carry no sensitivity).
   */
  gradient(weights: Float64Array): GradientResult {
    if (this.trajectory.length === 0) {
      throw new Error('AdjointHeatSolver: call forward() before gradient().');
    }
    if (weights.length !== this.N) {
      throw new Error(`AdjointHeatSolver: weights length ${weights.length} ≠ N=${this.N}.`);
    }

    const steps = this.forwardStepsRun;
    const TN = this.trajectory[steps];

    // Objective J = Σ w_i T_i^N  (interior only — boundary fixed)
    let objective = 0;
    for (let n = 0; n < this.N; n++) {
      objective += weights[n] * TN[n];
    }

    // Initialise co-state: λ^N = w  (zero on boundary)
    let lam = new Float64Array(weights);
    this._applyDirichletZero(lam);

    const lamNext = new Float64Array(this.N);

    // Gradient accumulator dJ/dS_i = dt * Σ_n λ_i^{n+1}
    const dJdS = new Float64Array(this.N);

    // Backward sweep: n = steps-1 down to 0.
    //
    // For each logical step n, unroll the K = subStepsPerDt sub-steps backward.
    // At each sub-step s (going backward from K to 1):
    //   - accumulate dJ/dS_i += subDt * λ_i   (λ here is at the sub-step end)
    //   - apply adjoint sub-step to propagate λ one sub-step backward
    //
    // This correctly sums over every sub-step application of S in the forward pass.
    for (let n = steps - 1; n >= 0; n--) {
      for (let s = 0; s < this.subStepsPerDt; s++) {
        // λ currently holds the co-state at this sub-step's end — accumulate.
        for (let m = 0; m < this.N; m++) {
          dJdS[m] += this.subDt * lam[m];
        }
        // Propagate λ one sub-step backward (adjoint of the sub-step forward map).
        applyAdjointStep(
          lam, lamNext,
          this.nx, this.ny, this.nz,
          this.dx, this.dy, this.dz,
          this.alpha, this.subDt
        );
        lam.set(lamNext);
      }
    }

    // dJ/dT0 = λ^0  (after the backward sweep λ now holds λ^0)
    const dJdT0 = new Float64Array(lam);

    return { dJdS, dJdT0, objective };
  }

  // ── private helpers ───────────────────────────────────────────────────────

  private _applyDirichlet(T: Float64Array): void {
    const { nx, ny, nz, boundaryValue } = this;
    for (let k = 0; k < nz; k++) {
      for (let j = 0; j < ny; j++) {
        for (let i = 0; i < nx; i++) {
          if (i === 0 || i === nx - 1 || j === 0 || j === ny - 1 || k === 0 || k === nz - 1) {
            T[idx(i, j, k, nx, ny)] = boundaryValue;
          }
        }
      }
    }
  }

  private _applyDirichletZero(v: Float64Array): void {
    const { nx, ny, nz } = this;
    for (let k = 0; k < nz; k++) {
      for (let j = 0; j < ny; j++) {
        for (let i = 0; i < nx; i++) {
          if (i === 0 || i === nx - 1 || j === 0 || j === ny - 1 || k === 0 || k === nz - 1) {
            v[idx(i, j, k, nx, ny)] = 0;
          }
        }
      }
    }
  }
}
