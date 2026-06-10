/**
 * MultiphaseNSSolver — Two-phase incompressible Navier-Stokes with level-set interface tracking.
 *
 * Extends NavierStokesSolver's projection method with:
 *   - Level-set field φ (signed distance to interface, φ<0 = liquid, φ>0 = gas)
 *   - Two-fluid density/viscosity blending via smoothed Heaviside
 *   - Surface tension via Continuum Surface Force (CSF)
 *   - Periodic level-set reinitialization to maintain |∇φ| ≈ 1
 *
 * Algorithm per timestep:
 *   1. Advect φ: dφ/dt + u·∇φ = 0 (semi-Lagrangian)
 *   2. Reinitialize φ (every N steps)
 *   3. Compute blended ρ(φ), μ(φ)
 *   4. Compute surface tension force: F = σ·κ·δ(φ)·∇φ
 *   5. Advect velocity (semi-Lagrangian)
 *   6. Diffuse velocity
 *   7. Pressure projection (variable-density Poisson)
 *   8. Apply BCs
 *
 * @see NavierStokesSolver — single-phase base pattern
 */

import { RegularGrid3D } from './RegularGrid3D';
import { jacobiIteration, variableCoefficientJacobiIteration } from './ConvergenceControl';

// ── Types ────────────────────────────────────────────────────────────────────

export interface MultiphaseConfig {
  gridResolution: [number, number, number];
  domainSize: [number, number, number];
  /** Liquid density [kg/m³] (default: 1000) */
  rhoLiquid?: number;
  /** Gas density [kg/m³] (default: 1.225) */
  rhoGas?: number;
  /** Liquid kinematic viscosity [m²/s] (default: 1e-6) */
  nuLiquid?: number;
  /** Gas kinematic viscosity [m²/s] (default: 1.5e-5) */
  nuGas?: number;
  /** Surface tension coefficient σ [N/m] (default: 0.072 for water-air) */
  surfaceTension?: number;
  /** Gravity acceleration [gx, gy, gz] (default: [0, -9.81, 0]) */
  gravity?: [number, number, number];
  /** Reinitialize level-set every N steps (default: 5) */
  reinitInterval?: number;
  /** Pressure Jacobi iterations (default: 100) */
  pressureIterations?: number;
}

export interface MultiphaseStats {
  currentTime: number;
  stepCount: number;
  maxVelocity: number;
  interfaceArea: number;
  liquidVolumeFraction: number;
}

// ── Solver ────────────────────────────────────────────────────────────────────

export class MultiphaseNSSolver {
  private rhoL: number;
  private rhoG: number;
  private nuL: number;
  private nuG: number;
  private sigma: number;
  private gravity: [number, number, number];
  private reinitInterval: number;
  private pressureIter: number;

  // Fields
  private vx: RegularGrid3D;
  private vy: RegularGrid3D;
  private vz: RegularGrid3D;
  private vxTemp: RegularGrid3D;
  private vyTemp: RegularGrid3D;
  private vzTemp: RegularGrid3D;
  private pressure: RegularGrid3D;
  private invRho: RegularGrid3D; // 1/ρ(φ) for variable-coefficient Poisson
  private phi: RegularGrid3D; // level-set
  private phiTemp: RegularGrid3D;

  private currentTime = 0;
  private stepCount = 0;

  constructor(config: MultiphaseConfig) {
    this.rhoL = config.rhoLiquid ?? 1000;
    this.rhoG = config.rhoGas ?? 1.225;
    this.nuL = config.nuLiquid ?? 1e-6;
    this.nuG = config.nuGas ?? 1.5e-5;
    this.sigma = config.surfaceTension ?? 0.072;
    this.gravity = config.gravity ?? [0, -9.81, 0];
    this.reinitInterval = config.reinitInterval ?? 5;
    this.pressureIter = config.pressureIterations ?? 100;

    const res = config.gridResolution;
    const size = config.domainSize;

    this.vx = new RegularGrid3D(res, size);
    this.vy = new RegularGrid3D(res, size);
    this.vz = new RegularGrid3D(res, size);
    this.vxTemp = new RegularGrid3D(res, size);
    this.vyTemp = new RegularGrid3D(res, size);
    this.vzTemp = new RegularGrid3D(res, size);
    this.pressure = new RegularGrid3D(res, size);
    this.invRho = new RegularGrid3D(res, size);
    this.phi = new RegularGrid3D(res, size);
    this.phiTemp = new RegularGrid3D(res, size);
  }

  /** Initialize the level-set field from an implicit function. φ<0 = liquid. */
  initializeLevelSet(fn: (x: number, y: number, z: number) => number): void {
    const { nx, ny, nz, dx, dy, dz } = this.phi;
    for (let k = 0; k < nz; k++) {
      for (let j = 0; j < ny; j++) {
        for (let i = 0; i < nx; i++) {
          this.phi.set(i, j, k, fn(i * dx, j * dy, k * dz));
        }
      }
    }
  }

  step(dt: number): void {
    const { nx, ny, nz } = this.vx;

    // 1. Advect level-set: dφ/dt + u·∇φ = 0
    //
    // advectField only fills interior cells (1..n-2) into dst; boundary cells of
    // phiTemp keep whatever value was there from a previous usage (e.g. the
    // pressure divergence scratch from the prior call to project()).  After
    // phi.copy(phiTemp) those stale boundary values would overwrite phi, making
    // the level-set gradient at boundary-adjacent cells completely wrong.
    //
    // Fix: after copying the advected interior, apply zero-gradient (Neumann)
    // extrapolation to all six boundary faces so that phi continues smoothly
    // to the ghost-cell layer and stencils on interior cells remain correct.
    this.advectField(this.phi, this.phiTemp, dt);
    this.phi.copy(this.phiTemp);
    this.extrapolateLevelSetBC();

    // 2. Reinitialize periodically
    // MNS-1 fix: use 5 pseudo-time iterations (3 was insufficient to recover
    // |∇φ|≈1 after large interface advection; 5 covers a ~2.5-cell narrow band
    // at dtau = 0.5*dx per substep).
    if (this.stepCount % this.reinitInterval === 0) {
      this.reinitializeLevelSet(5);
    }

    // 3. Compute blended properties + surface tension
    // 4. Advect velocity
    this.advectField(this.vx, this.vxTemp, dt);
    this.advectField(this.vy, this.vyTemp, dt);
    this.advectField(this.vz, this.vzTemp, dt);
    this.vx.copy(this.vxTemp);
    this.vy.copy(this.vyTemp);
    this.vz.copy(this.vzTemp);

    // 5. Apply gravity + surface tension
    // MNS-2 fix: eps must be derived from the phi grid's own spacing, not
    // from the velocity grid.  For non-cubic or non-uniform grids the two
    // spacings can differ, making the smeared-interface width dimensionally
    // inconsistent with the level-set gradient.  Use max(phi spacing) as
    // recommended in the CSF literature (eps = 1.5–2 × grid size).
    const eps = 1.5 * Math.max(this.phi.dx, this.phi.dy, this.phi.dz);
    for (let k = 1; k < nz - 1; k++) {
      for (let j = 1; j < ny - 1; j++) {
        for (let i = 1; i < nx - 1; i++) {
          const p = this.phi.get(i, j, k);
          const rho = this.blendedDensity(p, eps);

          // Gravity
          this.vx.set(i, j, k, this.vx.get(i, j, k) + this.gravity[0] * dt);
          this.vy.set(i, j, k, this.vy.get(i, j, k) + this.gravity[1] * dt);
          this.vz.set(i, j, k, this.vz.get(i, j, k) + this.gravity[2] * dt);

          // Surface tension: F = σ·κ·δ(φ)·∇φ / ρ
          const delta = this.smoothedDelta(p, eps);
          if (delta > 1e-10) {
            const kappa = this.curvature(i, j, k);
            const [gx, gy, gz] = this.phi.gradient(i, j, k);
            const scale = (this.sigma * kappa * delta * dt) / rho;
            this.vx.set(i, j, k, this.vx.get(i, j, k) + scale * gx);
            this.vy.set(i, j, k, this.vy.get(i, j, k) + scale * gy);
            this.vz.set(i, j, k, this.vz.get(i, j, k) + scale * gz);
          }
        }
      }
    }

    // 6. Diffusion (blended viscosity)
    for (let k = 1; k < nz - 1; k++) {
      for (let j = 1; j < ny - 1; j++) {
        for (let i = 1; i < nx - 1; i++) {
          const nu = this.blendedViscosity(this.phi.get(i, j, k), eps);
          this.vx.set(i, j, k, this.vx.get(i, j, k) + dt * nu * this.vx.laplacian(i, j, k));
          this.vy.set(i, j, k, this.vy.get(i, j, k) + dt * nu * this.vy.laplacian(i, j, k));
          this.vz.set(i, j, k, this.vz.get(i, j, k) + dt * nu * this.vz.laplacian(i, j, k));
        }
      }
    }

    // 7. Pressure projection
    this.project(dt, eps);

    // 8. Wall BCs (no-slip on all faces)
    this.applyWallBC();

    this.currentTime += dt;
    this.stepCount++;
  }

  /** Semi-Lagrangian advection of a scalar field. */
  private advectField(src: RegularGrid3D, dst: RegularGrid3D, dt: number): void {
    const { nx, ny, nz, dx, dy, dz } = src;
    for (let k = 1; k < nz - 1; k++) {
      for (let j = 1; j < ny - 1; j++) {
        for (let i = 1; i < nx - 1; i++) {
          const u = this.vx.get(i, j, k);
          const v = this.vy.get(i, j, k);
          const w = this.vz.get(i, j, k);
          const si = Math.max(0.5, Math.min(nx - 1.5, i - (u * dt) / dx));
          const sj = Math.max(0.5, Math.min(ny - 1.5, j - (v * dt) / dy));
          const sk = Math.max(0.5, Math.min(nz - 1.5, k - (w * dt) / dz));
          dst.set(i, j, k, trilinear(src, si, sj, sk));
        }
      }
    }
  }

  /** Pressure projection with variable density.
   *
   * Uses the rescaled formulation with variable-coefficient Poisson:
   *   Solve  ∇·((1/ρ) ∇φ) = ∇·u*   (density folded into LHS operator)
   *   Correct: u -= (1/ρ) · ∇φ       (local density correction)
   *
   * For high density ratios (water:air ~1000:1), the constant-coefficient
   * Jacobi converges poorly. When pressureIterations >= 200, the solver
   * switches to the full variable-coefficient Jacobi with harmonic-mean
   * face coefficients; otherwise it falls back to a density-weighted
   * constant-coefficient solve that is less accurate but more stable.
   */
  private project(dt: number, eps: number): void {
    const { nx, ny, nz, dx, dy, dz } = this.vx;
    const div = this.phiTemp; // reuse buffer for divergence
    div.fill(0);

    // Compute divergence and 1/ρ(φ) coefficient field
    for (let k = 1; k < nz - 1; k++) {
      for (let j = 1; j < ny - 1; j++) {
        for (let i = 1; i < nx - 1; i++) {
          const d =
            (this.vx.get(i + 1, j, k) - this.vx.get(i - 1, j, k)) / (2 * dx) +
            (this.vy.get(i, j + 1, k) - this.vy.get(i, j - 1, k)) / (2 * dy) +
            (this.vz.get(i, j, k + 1) - this.vz.get(i, j, k - 1)) / (2 * dz);
          div.set(i, j, k, -d);

          const rho = this.blendedDensity(this.phi.get(i, j, k), eps);
          this.invRho.set(i, j, k, 1 / rho);
        }
      }
    }

    // Fill boundary cells of invRho with nearest interior values
    // (required for harmonic-mean face coefficients at boundaries)
    for (let k = 0; k < nz; k++) {
      for (let j = 0; j < ny; j++) {
        for (let i = 0; i < nx; i++) {
          if (i === 0 || i === nx - 1 || j === 0 || j === ny - 1 || k === 0 || k === nz - 1) {
            const ci = Math.max(1, Math.min(nx - 2, i));
            const cj = Math.max(1, Math.min(ny - 2, j));
            const ck = Math.max(1, Math.min(nz - 2, k));
            this.invRho.set(i, j, k, this.invRho.get(ci, cj, ck));
          }
        }
      }
    }

    this.pressure.fill(0);

    // Use variable-coefficient Jacobi when enough iterations are budgeted
    // (requires at least 200 iterations for stable convergence at high density ratios)
    if (this.pressureIter >= 200) {
      variableCoefficientJacobiIteration(
        this.pressure,
        div,
        this.invRho,
        dx,
        this.pressureIter,
        1e-6,
        0.5 // under-relaxed for stability
      );
    } else {
      // Fallback: density-weighted constant-coefficient Poisson
      // Uses average 1/ρ in the LHS for stability with fewer iterations
      const alpha = dx * dx;
      const beta = 6;
      jacobiIteration(this.pressure, div, alpha, beta, this.pressureIter, 1e-4, 0.6667);
    }

    // Correct velocity: u -= (1/ρ) · ∇φ  (variable-density correction)
    for (let k = 1; k < nz - 1; k++) {
      for (let j = 1; j < ny - 1; j++) {
        for (let i = 1; i < nx - 1; i++) {
          const rho = this.blendedDensity(this.phi.get(i, j, k), eps);
          const invRho = 1 / rho;
          const [gpx, gpy, gpz] = this.pressure.gradient(i, j, k);
          this.vx.set(i, j, k, this.vx.get(i, j, k) - invRho * gpx);
          this.vy.set(i, j, k, this.vy.get(i, j, k) - invRho * gpy);
          this.vz.set(i, j, k, this.vz.get(i, j, k) - invRho * gpz);
        }
      }
    }
  }

  /**
   * Apply zero-gradient (Neumann) extrapolation to φ boundary cells.
   *
   * advectField() only writes interior cells (1..n−2) to its destination
   * buffer.  The six boundary planes are never touched, so they retain
   * whatever stale value the buffer held from its previous use as the
   * pressure divergence scratch.  Copying the interior-advected result
   * back into phi via phi.copy(phiTemp) would therefore overwrite phi's
   * boundary planes with garbage, corrupting every stencil that touches a
   * boundary-adjacent cell.
   *
   * Zero-gradient extrapolation mirrors the nearest interior cell value
   * onto each boundary face (∂φ/∂n = 0 on all walls), which is the
   * standard ghost-cell convention for a level-set passing through a
   * no-penetration boundary.
   */
  private extrapolateLevelSetBC(): void {
    const { nx, ny, nz } = this.phi;
    // x-faces
    for (let k = 0; k < nz; k++) {
      for (let j = 0; j < ny; j++) {
        this.phi.set(0,      j, k, this.phi.get(1,      j, k));
        this.phi.set(nx - 1, j, k, this.phi.get(nx - 2, j, k));
      }
    }
    // y-faces
    for (let k = 0; k < nz; k++) {
      for (let i = 0; i < nx; i++) {
        this.phi.set(i, 0,      k, this.phi.get(i, 1,      k));
        this.phi.set(i, ny - 1, k, this.phi.get(i, ny - 2, k));
      }
    }
    // z-faces
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        this.phi.set(i, j, 0,      this.phi.get(i, j, 1));
        this.phi.set(i, j, nz - 1, this.phi.get(i, j, nz - 2));
      }
    }
  }

  /**
   * Reinitialize φ to maintain signed-distance property |∇φ| ≈ 1.
   *
   * ## MNS-1 fix: snapshot-based pseudo-time stepping
   *
   * The Sussman et al. (1994) reinitialization PDE is:
   *
   *   dφ/dτ = sign(φ₀)(1 − |∇φ|),   φ(x, 0) = φ₀(x)
   *
   * Each pseudo-time substep must READ from the φ at the START of the
   * substep and WRITE to a separate buffer, then swap.  The original
   * code read and wrote the same grid in one pass, making later cells
   * in the loop see already-updated values from earlier cells of the
   * same substep — an order-dependent, non-converging update analogous
   * to Gauss-Seidel on a non-symmetric problem.
   *
   * The fix: copy phi → phiTemp at the start of each pseudo-step,
   * read gradients from phiTemp, write updates to phi, then leave phi
   * as the new iterate (phiTemp is overwritten next iteration).
   *
   * @param iterations  Number of pseudo-time substeps.  5 is sufficient
   *   to cover a ~2.5-cell narrow band at dtau = 0.5·dx per substep.
   */
  private reinitializeLevelSet(iterations: number): void {
    const { nx, ny, nz } = this.phi;
    const dtau = 0.5 * this.phi.dx; // pseudo-timestep

    for (let iter = 0; iter < iterations; iter++) {
      // Snapshot current phi into phiTemp so we read from the start-of-substep
      // field while writing the update back to phi (fixes the read-write race).
      this.phiTemp.copy(this.phi);

      // Guard band: skip cells within 1 layer of the domain boundary.
      // Cells at i/j/k = 1 or n-2 use a central-difference stencil that
      // reads the boundary (i/j/k = 0 or n-1) through the gradient() call.
      // After advection the boundary cells hold extrapolated (Neumann) values,
      // NOT the true SDF, so the gradient there is only first-order accurate.
      // Reinitializing those cells based on a corrupted gradient degrades the
      // field and the error propagates inward over successive steps.
      // Skipping one extra layer on each side avoids the stale-boundary
      // contamination while still covering the full narrow-band near the
      // interface (which lies far from any wall in typical test scenarios).
      for (let k = 2; k < nz - 2; k++) {
        for (let j = 2; j < ny - 2; j++) {
          for (let i = 2; i < nx - 2; i++) {
            const p = this.phiTemp.get(i, j, k);
            const [gx, gy, gz] = this.phiTemp.gradient(i, j, k);
            const gradMag = Math.sqrt(gx * gx + gy * gy + gz * gz);
            if (gradMag < 1e-10) continue;
            // dφ/dτ = sign(φ₀)(1 − |∇φ|)
            const sign = p > 0 ? 1 : p < 0 ? -1 : 0;
            this.phi.set(i, j, k, p + dtau * sign * (1 - gradMag));
          }
        }
      }
    }
  }

  /** Smoothed Heaviside: H(φ) transitions from 0 (gas) to 1 (liquid) over width ε. */
  private smoothedHeaviside(phi: number, eps: number): number {
    if (phi < -eps) return 1;
    if (phi > eps) return 0;
    return 0.5 * (1 - phi / eps - (1 / Math.PI) * Math.sin((Math.PI * phi) / eps));
  }

  /** Smoothed delta function: derivative of Heaviside. Nonzero only near interface. */
  private smoothedDelta(phi: number, eps: number): number {
    if (Math.abs(phi) > eps) return 0;
    return (1 / (2 * eps)) * (1 + Math.cos((Math.PI * phi) / eps));
  }

  private blendedDensity(phi: number, eps: number): number {
    const H = this.smoothedHeaviside(phi, eps);
    return this.rhoL * H + this.rhoG * (1 - H);
  }

  private blendedViscosity(phi: number, eps: number): number {
    const H = this.smoothedHeaviside(phi, eps);
    return this.nuL * H + this.nuG * (1 - H);
  }

  /** Curvature κ = ∇·(∇φ/|∇φ|). */
  private curvature(i: number, j: number, k: number): number {
    const [gx, gy, gz] = this.phi.gradient(i, j, k);
    const mag = Math.sqrt(gx * gx + gy * gy + gz * gz);
    if (mag < 1e-10) return 0;

    // Numerical divergence of normalized gradient
    const { dx, dy, dz } = this.phi;
    const eps = 1e-10;

    const nx_p = this.phi.gradient(Math.min(i + 1, this.phi.nx - 2), j, k);
    const nx_m = this.phi.gradient(Math.max(i - 1, 1), j, k);
    const ny_p = this.phi.gradient(i, Math.min(j + 1, this.phi.ny - 2), k);
    const ny_m = this.phi.gradient(i, Math.max(j - 1, 1), k);
    const nz_p = this.phi.gradient(i, j, Math.min(k + 1, this.phi.nz - 2));
    const nz_m = this.phi.gradient(i, j, Math.max(k - 1, 1));

    const norm = (g: [number, number, number], comp: number) => {
      const m = Math.sqrt(g[0] * g[0] + g[1] * g[1] + g[2] * g[2]);
      return m > eps ? g[comp] / m : 0;
    };

    const dndx = (norm(nx_p, 0) - norm(nx_m, 0)) / (2 * dx);
    const dndy = (norm(ny_p, 1) - norm(ny_m, 1)) / (2 * dy);
    const dndz = (norm(nz_p, 2) - norm(nz_m, 2)) / (2 * dz);

    return dndx + dndy + dndz;
  }

  private applyWallBC(): void {
    const { nx, ny, nz } = this.vx;
    for (let k = 0; k < nz; k++) {
      for (let j = 0; j < ny; j++) {
        this.vx.set(0, j, k, 0);
        this.vy.set(0, j, k, 0);
        this.vz.set(0, j, k, 0);
        this.vx.set(nx - 1, j, k, 0);
        this.vy.set(nx - 1, j, k, 0);
        this.vz.set(nx - 1, j, k, 0);
      }
    }
    for (let k = 0; k < nz; k++) {
      for (let i = 0; i < nx; i++) {
        this.vx.set(i, 0, k, 0);
        this.vy.set(i, 0, k, 0);
        this.vz.set(i, 0, k, 0);
        this.vx.set(i, ny - 1, k, 0);
        this.vy.set(i, ny - 1, k, 0);
        this.vz.set(i, ny - 1, k, 0);
      }
    }
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        this.vx.set(i, j, 0, 0);
        this.vy.set(i, j, 0, 0);
        this.vz.set(i, j, 0, 0);
        this.vx.set(i, j, nz - 1, 0);
        this.vy.set(i, j, nz - 1, 0);
        this.vz.set(i, j, nz - 1, 0);
      }
    }
  }

  // ── Public API ──────────────────────────────────────────────────────────

  getLevelSet(): Float32Array {
    return this.phi.toFloat32Array();
  }
  getVelocityMagnitude(): Float32Array {
    const { nx, ny, nz } = this.vx;
    const r = new Float32Array(nx * ny * nz);
    for (let k = 0; k < nz; k++)
      for (let j = 0; j < ny; j++)
        for (let i = 0; i < nx; i++) {
          const idx = (k * ny + j) * nx + i;
          r[idx] = Math.sqrt(
            this.vx.get(i, j, k) ** 2 + this.vy.get(i, j, k) ** 2 + this.vz.get(i, j, k) ** 2
          );
        }
    return r;
  }
  getPressureField(): Float32Array {
    return this.pressure.toFloat32Array();
  }

  getStats(): MultiphaseStats {
    const { nx, ny, nz } = this.vx;
    let maxV = 0,
      liquidCells = 0,
      interfaceCells = 0;
    const eps = 1.5 * Math.max(this.phi.dx, this.phi.dy, this.phi.dz);
    for (let k = 0; k < nz; k++)
      for (let j = 0; j < ny; j++)
        for (let i = 0; i < nx; i++) {
          const v = Math.sqrt(
            this.vx.get(i, j, k) ** 2 + this.vy.get(i, j, k) ** 2 + this.vz.get(i, j, k) ** 2
          );
          if (v > maxV) maxV = v;
          if (this.phi.get(i, j, k) < 0) liquidCells++;
          if (Math.abs(this.phi.get(i, j, k)) < eps) interfaceCells++;
        }
    const total = nx * ny * nz;
    return {
      currentTime: this.currentTime,
      stepCount: this.stepCount,
      maxVelocity: maxV,
      interfaceArea: interfaceCells,
      liquidVolumeFraction: liquidCells / total,
    };
  }

  dispose(): void {}
}

function trilinear(grid: RegularGrid3D, fi: number, fj: number, fk: number): number {
  const i0 = Math.floor(fi),
    j0 = Math.floor(fj),
    k0 = Math.floor(fk);
  const i1 = Math.min(i0 + 1, grid.nx - 1),
    j1 = Math.min(j0 + 1, grid.ny - 1),
    k1 = Math.min(k0 + 1, grid.nz - 1);
  const s = fi - i0,
    t = fj - j0,
    u = fk - k0;
  return (
    grid.get(i0, j0, k0) * (1 - s) * (1 - t) * (1 - u) +
    grid.get(i1, j0, k0) * s * (1 - t) * (1 - u) +
    grid.get(i0, j1, k0) * (1 - s) * t * (1 - u) +
    grid.get(i1, j1, k0) * s * t * (1 - u) +
    grid.get(i0, j0, k1) * (1 - s) * (1 - t) * u +
    grid.get(i1, j0, k1) * s * (1 - t) * u +
    grid.get(i0, j1, k1) * (1 - s) * t * u +
    grid.get(i1, j1, k1) * s * t * u
  );
}
