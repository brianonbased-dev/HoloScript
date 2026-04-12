/**
 * AcousticSolver — Time-domain pressure wave equation on RegularGrid3D.
 *
 * ## Governing Equation
 *
 *   d²p/dt² = c² ∇²p + S(t)
 *
 * where:
 *   p = acoustic pressure [Pa]
 *   c = speed of sound [m/s]
 *   S = volumetric source term [Pa/s²]
 *
 * ## Discretization
 *
 * **Spatial**: 2nd-order central differences via RegularGrid3D.laplacian()
 * **Temporal**: Stormer-Verlet (leapfrog) — explicit, 2nd-order accurate:
 *
 *   p^{n+1} = 2·p^n - p^{n-1} + (c·dt)²·∇²p^n + dt²·S^n
 *
 * Three grids rotate each step: prev → curr → next → prev ...
 *
 * ## CFL Stability
 *
 *   dt ≤ dx / (c · √3)  for 3D (assumes dx = dy = dz)
 *
 * ## Boundary Conditions
 *
 * - Dirichlet (p=0): hard wall (perfect reflection, inverted)
 * - Neumann (dp/dn=0): soft wall (perfect reflection, same phase)
 * - Absorbing (1st-order Engquist-Majda): dp/dt + c·dp/dn = 0
 *
 * @see RegularGrid3D — field storage with laplacian stencil
 * @see SimSolver — generic interface this solver implements via adapter
 */

import { RegularGrid3D } from './RegularGrid3D';

// ── Types ────────────────────────────────────────────────────────────────────

export interface AcousticSource {
  id: string;
  /** Grid cell position [i, j, k] */
  position: [number, number, number];
  /** Source type */
  type: 'point' | 'gaussian_pulse' | 'sinusoidal' | 'ricker_wavelet';
  /** Amplitude [Pa] */
  amplitude: number;
  /** Frequency [Hz] (for sinusoidal) */
  frequency?: number;
  /** Pulse width [s] (for gaussian_pulse) */
  pulseWidth?: number;
  /** Whether the source is active */
  active?: boolean;
}

export type AcousticBCType = 'hard_wall' | 'soft_wall' | 'absorbing';

export interface AcousticBC {
  face: 'x-' | 'x+' | 'y-' | 'y+' | 'z-' | 'z+';
  type: AcousticBCType;
}

export interface AcousticConfig {
  /** Grid resolution [nx, ny, nz] */
  gridResolution: [number, number, number];
  /** Domain size [m] */
  domainSize: [number, number, number];
  /** Speed of sound [m/s] (default: 343 for air). Used when velocityField is not provided. */
  speedOfSound?: number;
  /**
   * Per-cell velocity field for heterogeneous media (geophysics/seismic).
   * When provided, overrides the scalar speedOfSound.
   * Must match gridResolution dimensions.
   */
  velocityField?: RegularGrid3D;
  /** Density [kg/m³] (default: 1.225 for air) */
  density?: number;
  /** Boundary conditions (default: absorbing on all faces) */
  boundaryConditions?: AcousticBC[];
  /** Sources */
  sources: AcousticSource[];
  /** Time step [s] — auto-computed from CFL if omitted */
  timeStep?: number;
  /** CFL safety factor (default: 0.9) */
  cflSafety?: number;
}

export interface AcousticStats {
  currentTime: number;
  stepCount: number;
  timeStep: number;
  cflLimit: number;
  maxPressure: number;
  rmsEnergy: number;
}

// ── Solver ────────────────────────────────────────────────────────────────────

export class AcousticSolver {
  private config: AcousticConfig;
  private speedOfSound: number;
  /** Per-cell velocity field for heterogeneous media (null = uniform) */
  private velocityField: RegularGrid3D | null;
  private dt: number;
  private cflLimit: number;

  // Three-grid leapfrog: rotate each step
  private pressureCurr: RegularGrid3D;
  private pressurePrev: RegularGrid3D;
  private pressureNext: RegularGrid3D;

  private currentTime = 0;
  private stepCount = 0;

  // BC lookup per face
  private bcMap: Map<string, AcousticBCType>;

  constructor(config: AcousticConfig) {
    this.config = config;
    this.speedOfSound = config.speedOfSound ?? 343;
    this.velocityField = config.velocityField ?? null;

    const [nx, ny, nz] = config.gridResolution;
    const [lx, ly, lz] = config.domainSize;

    this.pressureCurr = new RegularGrid3D([nx, ny, nz], [lx, ly, lz]);
    this.pressurePrev = new RegularGrid3D([nx, ny, nz], [lx, ly, lz]);
    this.pressureNext = new RegularGrid3D([nx, ny, nz], [lx, ly, lz]);

    // CFL condition: dt ≤ min(dx,dy,dz) / (c_max * sqrt(3))
    // Use max velocity from field if provided, else scalar speedOfSound
    const cMax = this.velocityField ? maxFieldValue(this.velocityField) : this.speedOfSound;
    const dx = this.pressureCurr.dx;
    const dy = this.pressureCurr.dy;
    const dz = this.pressureCurr.dz;
    const minDx = Math.min(dx, dy, dz);
    this.cflLimit = minDx / (cMax * Math.sqrt(3));

    const safety = config.cflSafety ?? 0.9;
    this.dt = config.timeStep ?? (this.cflLimit * safety);

    if (this.dt > this.cflLimit) {
      console.warn(`AcousticSolver: dt=${this.dt} exceeds CFL limit=${this.cflLimit}. Clamping.`);
      this.dt = this.cflLimit * safety;
    }

    // BC map
    this.bcMap = new Map();
    const defaultBC: AcousticBCType = 'absorbing';
    for (const face of ['x-', 'x+', 'y-', 'y+', 'z-', 'z+'] as const) {
      this.bcMap.set(face, defaultBC);
    }
    if (config.boundaryConditions) {
      for (const bc of config.boundaryConditions) {
        this.bcMap.set(bc.face, bc.type);
      }
    }
  }

  /**
   * Advance the simulation by one timestep.
   */
  step(dt?: number): void {
    const actualDt = dt ?? this.dt;
    const cUniform = this.speedOfSound;
    const vField = this.velocityField;
    const dt2 = actualDt * actualDt;

    const curr = this.pressureCurr;
    const prev = this.pressurePrev;
    const next = this.pressureNext;
    const { nx, ny, nz } = curr;

    // Interior update: leapfrog (supports per-cell velocity)
    for (let k = 1; k < nz - 1; k++) {
      for (let j = 1; j < ny - 1; j++) {
        for (let i = 1; i < nx - 1; i++) {
          const c = vField ? vField.get(i, j, k) : cUniform;
          const c2dt2 = (c * actualDt) * (c * actualDt);
          const lap = curr.laplacian(i, j, k);
          next.set(
            i, j, k,
            2 * curr.get(i, j, k) - prev.get(i, j, k) + c2dt2 * lap,
          );
        }
      }
    }

    // Apply sources
    for (const src of this.config.sources) {
      if (src.active === false) continue;
      const [si, sj, sk] = src.position;
      if (si < 0 || si >= nx || sj < 0 || sj >= ny || sk < 0 || sk >= nz) continue;

      const srcVal = this.evaluateSource(src, this.currentTime);
      next.set(si, sj, sk, next.get(si, sj, sk) + dt2 * srcVal);
    }

    // Apply boundary conditions
    this.applyBoundaryConditions(next, curr, actualDt);

    // Rotate grids: prev ← curr, curr ← next, next ← prev (reuse buffer)
    const temp = this.pressurePrev;
    this.pressurePrev = this.pressureCurr;
    this.pressureCurr = this.pressureNext;
    this.pressureNext = temp;

    this.currentTime += actualDt;
    this.stepCount++;
  }

  /**
   * Evaluate a source term at time t.
   */
  private evaluateSource(src: AcousticSource, t: number): number {
    switch (src.type) {
      case 'point':
        return src.amplitude;

      case 'gaussian_pulse': {
        const sigma = src.pulseWidth ?? 0.001;
        const t0 = 4 * sigma; // center the pulse
        return src.amplitude * Math.exp(-((t - t0) ** 2) / (2 * sigma ** 2));
      }

      case 'sinusoidal': {
        const f = src.frequency ?? 1000;
        return src.amplitude * Math.sin(2 * Math.PI * f * t);
      }

      case 'ricker_wavelet': {
        // Ricker wavelet: (1 - 2π²f²(t-t₀)²) · exp(-π²f²(t-t₀)²)
        // Standard seismic source — zero-phase, band-limited
        const f = src.frequency ?? 25; // dominant frequency [Hz]
        const t0 = 1.5 / f; // delay so peak is at t0
        const tau = t - t0;
        const pf2 = Math.PI * Math.PI * f * f;
        return src.amplitude * (1 - 2 * pf2 * tau * tau) * Math.exp(-pf2 * tau * tau);
      }

      default:
        return 0;
    }
  }

  /**
   * Apply boundary conditions on all 6 faces.
   */
  private applyBoundaryConditions(next: RegularGrid3D, curr: RegularGrid3D, dt: number): void {
    const { nx, ny, nz } = next;
    const vField = this.velocityField;
    const cUniform = this.speedOfSound;

    // Helper: apply BC to a single boundary cell
    const applyBC = (i: number, j: number, k: number, face: string, normalDir: number, inward: [number, number, number]) => {
      const bcType = this.bcMap.get(face) ?? 'absorbing';

      switch (bcType) {
        case 'hard_wall':
          // Dirichlet: p = 0 (perfect reflection, inverted)
          next.set(i, j, k, 0);
          break;

        case 'soft_wall':
          // Neumann: dp/dn = 0 (mirror interior value)
          next.set(i, j, k, next.get(i + inward[0], j + inward[1], k + inward[2]));
          break;

        case 'absorbing': {
          // 1st-order Engquist-Majda: dp/dt + c·dp/dn = 0
          // Discretized: p_boundary(n+1) = p_boundary(n) + c·dt/dx · (p_interior(n) - p_boundary(n))
          const c = vField ? vField.get(i, j, k) : cUniform;
          const dxBC = normalDir === 0 ? next.dx : normalDir === 1 ? next.dy : next.dz;
          const pBound = curr.get(i, j, k);
          const pInter = curr.get(i + inward[0], j + inward[1], k + inward[2]);
          next.set(i, j, k, pBound + (c * dt / dxBC) * (pInter - pBound));
          break;
        }
      }
    };

    // x- face (i=0)
    for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) applyBC(0, j, k, 'x-', 0, [1, 0, 0]);
    // x+ face (i=nx-1)
    for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) applyBC(nx - 1, j, k, 'x+', 0, [-1, 0, 0]);
    // y- face (j=0)
    for (let k = 0; k < nz; k++) for (let i = 0; i < nx; i++) applyBC(i, 0, k, 'y-', 1, [0, 1, 0]);
    // y+ face (j=ny-1)
    for (let k = 0; k < nz; k++) for (let i = 0; i < nx; i++) applyBC(i, ny - 1, k, 'y+', 1, [0, -1, 0]);
    // z- face (k=0)
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) applyBC(i, j, 0, 'z-', 2, [0, 0, 1]);
    // z+ face (k=nz-1)
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) applyBC(i, j, nz - 1, 'z+', 2, [0, 0, -1]);
  }

  // ── Public API ──────────────────────────────────────────────────────────

  /** Get the current pressure field as a flat Float32Array. */
  getPressureField(): Float32Array {
    return this.pressureCurr.toFloat32Array();
  }

  /** Get the pressure grid (for coupling/stencil access). */
  getPressureGrid(): RegularGrid3D {
    return this.pressureCurr;
  }

  /** Get the current simulation time. */
  getTime(): number {
    return this.currentTime;
  }

  getStats(): AcousticStats {
    const data = this.pressureCurr.data;
    let maxP = 0, sumP2 = 0;
    for (let i = 0; i < data.length; i++) {
      const p = Math.abs(data[i]);
      if (p > maxP) maxP = p;
      sumP2 += data[i] * data[i];
    }
    return {
      currentTime: this.currentTime,
      stepCount: this.stepCount,
      timeStep: this.dt,
      cflLimit: this.cflLimit,
      maxPressure: maxP,
      rmsEnergy: Math.sqrt(sumP2 / data.length),
    };
  }

  /** Set initial pressure distribution. */
  setInitialPressure(fn: (x: number, y: number, z: number) => number): void {
    const { nx, ny, nz, dx, dy, dz } = this.pressureCurr;
    for (let k = 0; k < nz; k++) {
      for (let j = 0; j < ny; j++) {
        for (let i = 0; i < nx; i++) {
          const val = fn(i * dx, j * dy, k * dz);
          this.pressureCurr.set(i, j, k, val);
          this.pressurePrev.set(i, j, k, val);
        }
      }
    }
  }

  dispose(): void {
    // No external resources to clean up
  }
}

// ── Seismic Helpers ──────────────────────────────────────────────────────────

/** Find max value in a RegularGrid3D (for CFL computation). */
function maxFieldValue(grid: RegularGrid3D): number {
  let max = 0;
  for (let i = 0; i < grid.data.length; i++) {
    if (grid.data[i] > max) max = grid.data[i];
  }
  return max || 1; // avoid zero (would cause infinite CFL)
}

/**
 * Build a layered velocity field for seismic simulation.
 * Layers are defined by depth (z-coordinate) boundaries.
 * Velocity transitions at layer interfaces.
 *
 * @param resolution Grid resolution [nx, ny, nz]
 * @param domainSize Domain size [lx, ly, lz] in meters
 * @param layers Array of { depth, velocity } sorted by increasing depth.
 *   depth is the z-coordinate of the TOP of the layer.
 *   The first layer starts at z=0 (depth=0 implicit).
 * @returns RegularGrid3D with per-cell velocity
 */
export function buildLayeredVelocity(
  resolution: [number, number, number],
  domainSize: [number, number, number],
  layers: { depth: number; velocity: number }[],
): RegularGrid3D {
  const grid = new RegularGrid3D(resolution, domainSize);
  const [nx, ny, nz] = resolution;
  const dz = domainSize[2] / (nz - 1);

  // Sort layers by depth
  const sorted = [...layers].sort((a, b) => a.depth - b.depth);

  for (let k = 0; k < nz; k++) {
    const z = k * dz;
    // Find which layer this z belongs to
    let vel = sorted[0]?.velocity ?? 343;
    for (const layer of sorted) {
      if (z >= layer.depth) vel = layer.velocity;
    }
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        grid.set(i, j, k, vel);
      }
    }
  }

  return grid;
}
