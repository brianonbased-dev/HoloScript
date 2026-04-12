/**
 * NavierStokesSolver — Incompressible Navier-Stokes on RegularGrid3D.
 *
 * ## Governing Equations
 *
 *   du/dt + (u·∇)u = -(1/ρ)∇p + ν∇²u + f
 *   ∇·u = 0  (incompressibility)
 *
 * ## Algorithm: Chorin's Projection (Fractional Step)
 *
 * Each timestep:
 *   1. **Advection**: Semi-Lagrangian backtrace u*(x) = u(x - u·dt)
 *      Uses RegularGrid3D.sampleAtPositions() for trilinear interpolation.
 *      Unconditionally stable (no CFL restriction on advection).
 *
 *   2. **Diffusion**: u** = u* + dt·ν·∇²u*
 *      Uses RegularGrid3D.laplacian() (explicit if CFL ok, otherwise Jacobi).
 *
 *   3. **Pressure projection**: Solve ∇²p = (ρ/dt)·∇·u**, then u = u** - (dt/ρ)·∇p
 *      Uses jacobiIteration() for the Poisson equation.
 *      Uses RegularGrid3D.gradient() for pressure gradient correction.
 *
 * ## Boundary Conditions
 *
 *   - No-slip: u = 0 at walls
 *   - Lid-driven: u = U at one face (classic benchmark)
 *   - Inflow/outflow: specified velocity or zero-gradient
 *
 * @see RegularGrid3D — field storage with laplacian/gradient/divergence stencils
 * @see ThermalSolver — same explicit/implicit diffusion pattern
 */

import { RegularGrid3D } from './RegularGrid3D';
import { jacobiIteration } from './ConvergenceControl';

// ── Types ────────────────────────────────────────────────────────────────────

export type CFDBCType = 'no_slip' | 'lid' | 'inflow' | 'outflow';

export interface CFDBC {
  face: 'x-' | 'x+' | 'y-' | 'y+' | 'z-' | 'z+';
  type: CFDBCType;
  /** Velocity for lid/inflow [vx, vy, vz] */
  velocity?: [number, number, number];
}

export interface BodyForce {
  /** Force vector [fx, fy, fz] in m/s² (acceleration, not force) */
  acceleration: [number, number, number];
}

export interface NavierStokesConfig {
  gridResolution: [number, number, number];
  domainSize: [number, number, number];
  /** Kinematic viscosity ν [m²/s] (default: 1e-6 for water) */
  viscosity?: number;
  /** Fluid density ρ [kg/m³] (default: 1000 for water) */
  density?: number;
  /** Boundary conditions */
  boundaryConditions?: CFDBC[];
  /** Body forces (gravity, buoyancy, etc.) */
  bodyForces?: BodyForce[];
  /** Max Jacobi iterations for pressure solve (default: 100) */
  pressureIterations?: number;
  /** Pressure convergence tolerance (default: 1e-4) */
  pressureTolerance?: number;
}

export interface NavierStokesStats {
  currentTime: number;
  stepCount: number;
  maxVelocity: number;
  maxDivergence: number;
  pressureIterations: number;
}

// ── Solver ────────────────────────────────────────────────────────────────────

export class NavierStokesSolver {
  private config: NavierStokesConfig;
  private nu: number;
  private rho: number;

  // Velocity components (3 separate scalar grids)
  private vx: RegularGrid3D;
  private vy: RegularGrid3D;
  private vz: RegularGrid3D;

  // Temporary grids for advection step
  private vxTemp: RegularGrid3D;
  private vyTemp: RegularGrid3D;
  private vzTemp: RegularGrid3D;

  // Pressure and divergence
  private pressure: RegularGrid3D;
  private divergence: RegularGrid3D;

  // BC map
  private bcMap: Map<string, CFDBC>;

  private currentTime = 0;
  private stepCount = 0;
  private lastPressureIter = 0;

  constructor(config: NavierStokesConfig) {
    this.config = config;
    this.nu = config.viscosity ?? 1e-6;
    this.rho = config.density ?? 1000;

    const res = config.gridResolution;
    const size = config.domainSize;

    this.vx = new RegularGrid3D(res, size);
    this.vy = new RegularGrid3D(res, size);
    this.vz = new RegularGrid3D(res, size);
    this.vxTemp = new RegularGrid3D(res, size);
    this.vyTemp = new RegularGrid3D(res, size);
    this.vzTemp = new RegularGrid3D(res, size);
    this.pressure = new RegularGrid3D(res, size);
    this.divergence = new RegularGrid3D(res, size);

    this.bcMap = new Map();
    if (config.boundaryConditions) {
      for (const bc of config.boundaryConditions) {
        this.bcMap.set(bc.face, bc);
      }
    }
  }

  /**
   * Advance one timestep.
   */
  step(dt: number): void {
    // 1. Advection (semi-Lagrangian)
    this.advect(dt);

    // 2. Apply body forces
    this.applyBodyForces(dt);

    // 3. Diffusion
    this.diffuse(dt);

    // 4. Pressure projection (enforce incompressibility)
    this.project(dt);

    // 5. Apply boundary conditions
    this.applyBoundaryConditions();

    this.currentTime += dt;
    this.stepCount++;
  }

  /**
   * Semi-Lagrangian advection: trace backwards along velocity field.
   * u*(x) = u(x - u(x)·dt)
   */
  private advect(dt: number): void {
    const { vx, vy, vz, vxTemp, vyTemp, vzTemp } = this;
    const { nx, ny, nz, dx, dy, dz } = vx;

    for (let k = 1; k < nz - 1; k++) {
      for (let j = 1; j < ny - 1; j++) {
        for (let i = 1; i < nx - 1; i++) {
          // Current velocity at (i, j, k)
          const u = vx.get(i, j, k);
          const v = vy.get(i, j, k);
          const w = vz.get(i, j, k);

          // Backtrace position in grid coordinates
          const srcX = i - u * dt / dx;
          const srcY = j - v * dt / dy;
          const srcZ = k - w * dt / dz;

          // Clamp to domain
          const ci = Math.max(0.5, Math.min(nx - 1.5, srcX));
          const cj = Math.max(0.5, Math.min(ny - 1.5, srcY));
          const ck = Math.max(0.5, Math.min(nz - 1.5, srcZ));

          // Trilinear interpolation
          vxTemp.set(i, j, k, trilinearSample(vx, ci, cj, ck));
          vyTemp.set(i, j, k, trilinearSample(vy, ci, cj, ck));
          vzTemp.set(i, j, k, trilinearSample(vz, ci, cj, ck));
        }
      }
    }

    // Copy back
    vx.copy(vxTemp);
    vy.copy(vyTemp);
    vz.copy(vzTemp);
  }

  /** Apply body forces (gravity, buoyancy). */
  private applyBodyForces(dt: number): void {
    if (!this.config.bodyForces) return;

    for (const force of this.config.bodyForces) {
      const [ax, ay, az] = force.acceleration;
      const { nx, ny, nz } = this.vx;

      for (let k = 1; k < nz - 1; k++) {
        for (let j = 1; j < ny - 1; j++) {
          for (let i = 1; i < nx - 1; i++) {
            this.vx.set(i, j, k, this.vx.get(i, j, k) + ax * dt);
            this.vy.set(i, j, k, this.vy.get(i, j, k) + ay * dt);
            this.vz.set(i, j, k, this.vz.get(i, j, k) + az * dt);
          }
        }
      }
    }
  }

  /** Viscous diffusion: u += dt·ν·∇²u (explicit). */
  private diffuse(dt: number): void {
    const { vx, vy, vz, nu } = this;
    const { nx, ny, nz } = vx;

    // Explicit diffusion (simple and stable for small dt·ν/dx²)
    for (let k = 1; k < nz - 1; k++) {
      for (let j = 1; j < ny - 1; j++) {
        for (let i = 1; i < nx - 1; i++) {
          vx.set(i, j, k, vx.get(i, j, k) + dt * nu * vx.laplacian(i, j, k));
          vy.set(i, j, k, vy.get(i, j, k) + dt * nu * vy.laplacian(i, j, k));
          vz.set(i, j, k, vz.get(i, j, k) + dt * nu * vz.laplacian(i, j, k));
        }
      }
    }
  }

  /**
   * Pressure projection: enforce ∇·u = 0.
   * 1. Compute divergence of velocity
   * 2. Solve Poisson equation: ∇²p = (ρ/dt)·∇·u
   * 3. Correct velocity: u -= (dt/ρ)·∇p
   */
  private project(dt: number): void {
    const { vx, vy, vz, pressure, divergence, rho } = this;
    const { nx, ny, nz, dx, dy, dz } = vx;

    // 1. Compute divergence ∇·u
    for (let k = 1; k < nz - 1; k++) {
      for (let j = 1; j < ny - 1; j++) {
        for (let i = 1; i < nx - 1; i++) {
          const divU =
            (vx.get(i + 1, j, k) - vx.get(i - 1, j, k)) / (2 * dx) +
            (vy.get(i, j + 1, k) - vy.get(i, j - 1, k)) / (2 * dy) +
            (vz.get(i, j, k + 1) - vz.get(i, j, k - 1)) / (2 * dz);
          divergence.set(i, j, k, divU);
        }
      }
    }

    // Scale RHS: rhs = (rho/dt) * div(u) but Jacobi solves ∇²p = rhs
    // For the standard formulation, rhs = -div(u) / dt (sign convention varies)
    const rhsScale = -rho / dt;
    for (let k = 1; k < nz - 1; k++) {
      for (let j = 1; j < ny - 1; j++) {
        for (let i = 1; i < nx - 1; i++) {
          divergence.set(i, j, k, divergence.get(i, j, k) * rhsScale);
        }
      }
    }

    // 2. Solve Poisson: ∇²p = rhs via Jacobi iteration
    pressure.fill(0);
    const alpha = dx * dx; // assuming dx ≈ dy ≈ dz
    const beta = 6; // 3D Laplacian denominator
    const maxIter = this.config.pressureIterations ?? 100;
    const tol = this.config.pressureTolerance ?? 1e-4;

    const result = jacobiIteration(pressure, divergence, alpha, beta, maxIter, tol, 0.6667);
    this.lastPressureIter = result.iterations;

    // 3. Correct velocity: u -= (dt/ρ)·∇p
    const scale = dt / rho;
    for (let k = 1; k < nz - 1; k++) {
      for (let j = 1; j < ny - 1; j++) {
        for (let i = 1; i < nx - 1; i++) {
          const [gpx, gpy, gpz] = pressure.gradient(i, j, k);
          vx.set(i, j, k, vx.get(i, j, k) - scale * gpx);
          vy.set(i, j, k, vy.get(i, j, k) - scale * gpy);
          vz.set(i, j, k, vz.get(i, j, k) - scale * gpz);
        }
      }
    }
  }

  /** Apply boundary conditions on all faces. */
  private applyBoundaryConditions(): void {
    const { vx, vy, vz } = this;
    const { nx, ny, nz } = vx;

    const setVel = (i: number, j: number, k: number, vel: [number, number, number]) => {
      vx.set(i, j, k, vel[0]);
      vy.set(i, j, k, vel[1]);
      vz.set(i, j, k, vel[2]);
    };

    // Apply per-face BCs
    for (const [face, bc] of this.bcMap) {
      const vel = bc.velocity ?? [0, 0, 0];

      switch (face) {
        case 'x-':
          for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++)
            setVel(0, j, k, bc.type === 'lid' || bc.type === 'inflow' ? vel : [0, 0, 0]);
          break;
        case 'x+':
          for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) {
            if (bc.type === 'outflow') {
              // Zero-gradient: copy interior
              vx.set(nx - 1, j, k, vx.get(nx - 2, j, k));
              vy.set(nx - 1, j, k, vy.get(nx - 2, j, k));
              vz.set(nx - 1, j, k, vz.get(nx - 2, j, k));
            } else {
              setVel(nx - 1, j, k, bc.type === 'lid' || bc.type === 'inflow' ? vel : [0, 0, 0]);
            }
          }
          break;
        case 'y-':
          for (let k = 0; k < nz; k++) for (let i = 0; i < nx; i++)
            setVel(i, 0, k, bc.type === 'lid' || bc.type === 'inflow' ? vel : [0, 0, 0]);
          break;
        case 'y+':
          for (let k = 0; k < nz; k++) for (let i = 0; i < nx; i++) {
            if (bc.type === 'outflow') {
              vx.set(i, ny - 1, k, vx.get(i, ny - 2, k));
              vy.set(i, ny - 1, k, vy.get(i, ny - 2, k));
              vz.set(i, ny - 1, k, vz.get(i, ny - 2, k));
            } else {
              setVel(i, ny - 1, k, bc.type === 'lid' || bc.type === 'inflow' ? vel : [0, 0, 0]);
            }
          }
          break;
        case 'z-':
          for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++)
            setVel(i, j, 0, bc.type === 'lid' || bc.type === 'inflow' ? vel : [0, 0, 0]);
          break;
        case 'z+':
          for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
            if (bc.type === 'outflow') {
              vx.set(i, j, nz - 1, vx.get(i, j, nz - 2));
              vy.set(i, j, nz - 1, vy.get(i, j, nz - 2));
              vz.set(i, j, nz - 1, vz.get(i, j, nz - 2));
            } else {
              setVel(i, j, nz - 1, bc.type === 'lid' || bc.type === 'inflow' ? vel : [0, 0, 0]);
            }
          }
          break;
      }
    }

    // Default: no-slip on any face without explicit BC
    for (const face of ['x-', 'x+', 'y-', 'y+', 'z-', 'z+']) {
      if (!this.bcMap.has(face)) {
        // Apply no-slip (u=0) on this face
        switch (face) {
          case 'x-': for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) setVel(0, j, k, [0, 0, 0]); break;
          case 'x+': for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) setVel(nx - 1, j, k, [0, 0, 0]); break;
          case 'y-': for (let k = 0; k < nz; k++) for (let i = 0; i < nx; i++) setVel(i, 0, k, [0, 0, 0]); break;
          case 'y+': for (let k = 0; k < nz; k++) for (let i = 0; i < nx; i++) setVel(i, ny - 1, k, [0, 0, 0]); break;
          case 'z-': for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) setVel(i, j, 0, [0, 0, 0]); break;
          case 'z+': for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) setVel(i, j, nz - 1, [0, 0, 0]); break;
        }
      }
    }
  }

  // ── Public API ──────────────────────────────────────────────────────────

  getVelocityField(): { vx: Float32Array; vy: Float32Array; vz: Float32Array } {
    return {
      vx: this.vx.toFloat32Array(),
      vy: this.vy.toFloat32Array(),
      vz: this.vz.toFloat32Array(),
    };
  }

  getVelocityMagnitude(): Float32Array {
    const { nx, ny, nz } = this.vx;
    const result = new Float32Array(nx * ny * nz);
    for (let k = 0; k < nz; k++) {
      for (let j = 0; j < ny; j++) {
        for (let i = 0; i < nx; i++) {
          const u = this.vx.get(i, j, k);
          const v = this.vy.get(i, j, k);
          const w = this.vz.get(i, j, k);
          result[(k * ny + j) * nx + i] = Math.sqrt(u * u + v * v + w * w);
        }
      }
    }
    return result;
  }

  getPressureField(): Float32Array {
    return this.pressure.toFloat32Array();
  }

  getVelocityAt(i: number, j: number, k: number): [number, number, number] {
    return [this.vx.get(i, j, k), this.vy.get(i, j, k), this.vz.get(i, j, k)];
  }

  getStats(): NavierStokesStats {
    let maxV = 0, maxDiv = 0;
    const { nx, ny, nz } = this.vx;
    for (let k = 0; k < nz; k++) {
      for (let j = 0; j < ny; j++) {
        for (let i = 0; i < nx; i++) {
          const v = Math.sqrt(
            this.vx.get(i, j, k) ** 2 + this.vy.get(i, j, k) ** 2 + this.vz.get(i, j, k) ** 2,
          );
          if (v > maxV) maxV = v;
          const d = Math.abs(this.divergence.get(i, j, k));
          if (d > maxDiv) maxDiv = d;
        }
      }
    }
    return {
      currentTime: this.currentTime,
      stepCount: this.stepCount,
      maxVelocity: maxV,
      maxDivergence: maxDiv,
      pressureIterations: this.lastPressureIter,
    };
  }

  dispose(): void {}
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Trilinear interpolation at fractional grid coordinates. */
function trilinearSample(grid: RegularGrid3D, fi: number, fj: number, fk: number): number {
  const i0 = Math.floor(fi), j0 = Math.floor(fj), k0 = Math.floor(fk);
  const i1 = Math.min(i0 + 1, grid.nx - 1), j1 = Math.min(j0 + 1, grid.ny - 1), k1 = Math.min(k0 + 1, grid.nz - 1);
  const si = fi - i0, sj = fj - j0, sk = fk - k0;

  return (
    grid.get(i0, j0, k0) * (1 - si) * (1 - sj) * (1 - sk) +
    grid.get(i1, j0, k0) * si * (1 - sj) * (1 - sk) +
    grid.get(i0, j1, k0) * (1 - si) * sj * (1 - sk) +
    grid.get(i1, j1, k0) * si * sj * (1 - sk) +
    grid.get(i0, j0, k1) * (1 - si) * (1 - sj) * sk +
    grid.get(i1, j0, k1) * si * (1 - sj) * sk +
    grid.get(i0, j1, k1) * (1 - si) * sj * sk +
    grid.get(i1, j1, k1) * si * sj * sk
  );
}
