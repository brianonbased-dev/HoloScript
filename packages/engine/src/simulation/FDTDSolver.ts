/**
 * FDTDSolver — 3D Finite-Difference Time-Domain solver for Maxwell's equations.
 *
 * ## Governing Equations (curl form)
 *
 *   dH/dt = -(1/μ) ∇×E − (σ_m/μ) H
 *   dE/dt =  (1/ε) ∇×H − (σ/ε) E + J/ε
 *
 * ## Yee Algorithm
 *
 * E and H fields are staggered by half a cell in space (Yee grid) and
 * half a timestep in time (leapfrog). This ensures 2nd-order accuracy
 * in both space and time with zero artificial dissipation.
 *
 * ## Field Layout (Yee Grid)
 *
 * On a grid of nx×ny×nz cells:
 *   Ex lives on x-directed edges: (i+½, j, k) → stored at [i][j][k], size nx×(ny+1)×(nz+1)
 *   Ey lives on y-directed edges: (i, j+½, k) → stored at [i][j][k], size (nx+1)×ny×(nz+1)
 *   Ez lives on z-directed edges: (i, j, k+½) → stored at [i][j][k], size (nx+1)×(ny+1)×nz
 *   Hx lives on x-normal faces:  (i, j+½, k+½) → stored at [i][j][k], size (nx+1)×ny×nz
 *   Hy lives on y-normal faces:  (i+½, j, k+½) → stored at [i][j][k], size nx×(ny+1)×nz
 *   Hz lives on z-normal faces:  (i+½, j+½, k) → stored at [i][j][k], size nx×ny×(nz+1)
 *
 * ## CFL Condition
 *
 *   dt ≤ 1 / (c · √(1/dx² + 1/dy² + 1/dz²))
 *
 * ## Boundary Conditions
 *
 * - PEC (Perfect Electric Conductor): tangential E = 0 (default at domain edges)
 * - PMC (Perfect Magnetic Conductor): tangential H = 0
 * - PML (Perfectly Matched Layer): convolutional PML for open boundaries
 *
 * @see AcousticSolver — scalar wave equation (simpler, same leapfrog pattern)
 * @see SimSolver — generic interface
 *
 * References:
 * - Taflove & Hagness, "Computational Electrodynamics: The FDTD Method", 3rd ed.
 * - Yee, K.S., "Numerical Solution of Initial Boundary Value Problems...", IEEE, 1966
 * - Roden & Gedney, "Convolution PML (CPML)...", Microwave Opt. Tech. Lett., 2000
 */

import { computeAxisProfile, updatePsi, type CpmlProfile } from './cpml';

// ── Types ────────────────────────────────────────────────────────────────────

export interface EMSource {
  id: string;
  type: 'point_current' | 'sinusoidal';
  /** Grid cell [i, j, k] */
  position: [number, number, number];
  /** Polarization direction */
  polarization: 'x' | 'y' | 'z';
  /** Amplitude [A/m² for current] */
  amplitude: number;
  /** Frequency [Hz] (for sinusoidal) */
  frequency?: number;
  /** Pulse width [s] (for gaussian envelope) */
  pulseWidth?: number;
  active?: boolean;
}

export interface FDTDConfig {
  /** Number of Yee cells [nx, ny, nz] */
  cellCount: [number, number, number];
  /** Cell size [dx, dy, dz] in meters */
  cellSize: [number, number, number];
  /** Relative permittivity (uniform or per-cell) */
  permittivity?: number;
  /** Relative permeability (uniform, default 1) */
  permeability?: number;
  /** Electric conductivity [S/m] (default 0) */
  conductivity?: number;
  /** PML thickness in cells (default 0 = PEC boundaries) */
  pmlThickness?: number;
  /** Sources */
  sources: EMSource[];
  /** Time step [s] — auto-computed from CFL if omitted */
  timeStep?: number;
  /** CFL safety factor (default 0.9) */
  cflSafety?: number;
}

export interface FDTDStats {
  currentTime: number;
  stepCount: number;
  timeStep: number;
  cflLimit: number;
  maxE: number;
  maxH: number;
  cellCount: number;
}

// ── Physical Constants ───────────────────────────────────────────────────────

const EPS0 = 8.8541878128e-12; // F/m — vacuum permittivity
const MU0 = 1.2566370614e-6;   // H/m — vacuum permeability
const C0 = 299792458;           // m/s — speed of light

// ── Yee Field Storage ────────────────────────────────────────────────────────

/** Flat Float32Array for a 3D Yee field component. */
class YeeField {
  readonly data: Float32Array;
  readonly sx: number; // size in x
  readonly sy: number; // size in y
  readonly sz: number; // size in z

  constructor(sx: number, sy: number, sz: number) {
    this.sx = sx;
    this.sy = sy;
    this.sz = sz;
    this.data = new Float32Array(sx * sy * sz);
  }

  get(i: number, j: number, k: number): number {
    return this.data[(k * this.sy + j) * this.sx + i];
  }

  set(i: number, j: number, k: number, v: number): void {
    this.data[(k * this.sy + j) * this.sx + i] = v;
  }
}

// ── Solver ────────────────────────────────────────────────────────────────────

export class FDTDSolver {
  private config: FDTDConfig;

  // Cell counts
  private nx: number;
  private ny: number;
  private nz: number;
  private dx: number;
  private dy: number;
  private dz: number;
  private dt: number;
  private cflLimit: number;

  // Material coefficients (precomputed for update equations)
  private Ce: number; // E-field update: new = Ce * old + De * curl(H)
  private De: number;
  private Ch: number; // H-field update: new = Ch * old + Dh * curl(E)
  private Dh: number;

  // Yee fields — E on edges, H on faces
  readonly Ex: YeeField;
  readonly Ey: YeeField;
  readonly Ez: YeeField;
  readonly Hx: YeeField;
  readonly Hy: YeeField;
  readonly Hz: YeeField;

  // CPML state (only allocated when pmlThickness > 0). Convolutional PML:
  // per-axis recursion coefficients (sampled on the integer/E grid and the
  // half-integer/H grid) plus ψ convolution-memory fields for each of the 12
  // curl derivative terms.
  private cpml: {
    intX: CpmlProfile; intY: CpmlProfile; intZ: CpmlProfile;
    halfX: CpmlProfile; halfY: CpmlProfile; halfZ: CpmlProfile;
    // H-field ψ (loss along the derivative axis; H is half-staggered there)
    psiHxy: YeeField; psiHxz: YeeField;
    psiHyz: YeeField; psiHyx: YeeField;
    psiHzx: YeeField; psiHzy: YeeField;
    // E-field ψ (E is integer-staggered along its derivative axis)
    psiExy: YeeField; psiExz: YeeField;
    psiEyz: YeeField; psiEyx: YeeField;
    psiEzx: YeeField; psiEzy: YeeField;
  } | null = null;

  private currentTime = 0;
  private stepCount = 0;

  constructor(config: FDTDConfig) {
    this.config = config;
    const [nx, ny, nz] = config.cellCount;
    const [dx, dy, dz] = config.cellSize;

    this.nx = nx; this.ny = ny; this.nz = nz;
    this.dx = dx; this.dy = dy; this.dz = dz;

    // Yee field dimensions
    this.Ex = new YeeField(nx, ny + 1, nz + 1);
    this.Ey = new YeeField(nx + 1, ny, nz + 1);
    this.Ez = new YeeField(nx + 1, ny + 1, nz);
    this.Hx = new YeeField(nx + 1, ny, nz);
    this.Hy = new YeeField(nx, ny + 1, nz);
    this.Hz = new YeeField(nx, ny, nz + 1);

    // Material coefficients
    const epsR = config.permittivity ?? 1;
    const muR = config.permeability ?? 1;
    const sigma = config.conductivity ?? 0;
    const eps = epsR * EPS0;
    const mu = muR * MU0;

    // CFL
    const c = 1 / Math.sqrt(eps * mu);
    this.cflLimit = 1 / (c * Math.sqrt(1 / (dx * dx) + 1 / (dy * dy) + 1 / (dz * dz)));
    const safety = config.cflSafety ?? 0.9;
    this.dt = config.timeStep ?? (this.cflLimit * safety);
    if (this.dt > this.cflLimit) this.dt = this.cflLimit * safety;

    // Update coefficients (lossy media):
    // E^{n+1} = Ce * E^n + De * (curl H - J)
    // Ce = (1 - sigma*dt/(2*eps)) / (1 + sigma*dt/(2*eps))
    // De = (dt/eps) / (1 + sigma*dt/(2*eps))
    const sigDtOver2Eps = (sigma * this.dt) / (2 * eps);
    this.Ce = (1 - sigDtOver2Eps) / (1 + sigDtOver2Eps);
    this.De = (this.dt / eps) / (1 + sigDtOver2Eps);

    // H update (lossless magnetic for now: sigma_m = 0)
    this.Ch = 1;
    this.Dh = this.dt / mu;

    // CPML — build per-axis profiles + ψ memory fields for open boundaries.
    if (config.pmlThickness && config.pmlThickness > 0) {
      const t = config.pmlThickness;
      const dt = this.dt;
      // Integer (E-aligned) profiles: length ncells+1, sampled at integer cells.
      const intX = computeAxisProfile(nx + 1, 0, nx, t, dx, dt);
      const intY = computeAxisProfile(ny + 1, 0, ny, t, dy, dt);
      const intZ = computeAxisProfile(nz + 1, 0, nz, t, dz, dt);
      // Half (H-aligned) profiles: length ncells, sampled at i+½.
      const halfX = computeAxisProfile(nx, 0.5, nx, t, dx, dt);
      const halfY = computeAxisProfile(ny, 0.5, ny, t, dy, dt);
      const halfZ = computeAxisProfile(nz, 0.5, nz, t, dz, dt);
      this.cpml = {
        intX, intY, intZ, halfX, halfY, halfZ,
        psiHxy: new YeeField(nx + 1, ny, nz), psiHxz: new YeeField(nx + 1, ny, nz),
        psiHyz: new YeeField(nx, ny + 1, nz), psiHyx: new YeeField(nx, ny + 1, nz),
        psiHzx: new YeeField(nx, ny, nz + 1), psiHzy: new YeeField(nx, ny, nz + 1),
        psiExy: new YeeField(nx, ny + 1, nz + 1), psiExz: new YeeField(nx, ny + 1, nz + 1),
        psiEyz: new YeeField(nx + 1, ny, nz + 1), psiEyx: new YeeField(nx + 1, ny, nz + 1),
        psiEzx: new YeeField(nx + 1, ny + 1, nz), psiEzy: new YeeField(nx + 1, ny + 1, nz),
      };
    }
  }

  /**
   * Advance one FDTD timestep.
   * Order: update H (half-step) → update E (full-step) → apply sources.
   */
  step(): void {
    if (this.cpml) this.updateH_cpml();
    else this.updateH();

    if (this.cpml) this.updateE_cpml();
    else this.updateE();

    this.applySources(this.currentTime + this.dt);

    // PEC backs the CPML (tangential E = 0 at the outer wall). When no PML is
    // configured these are the only boundaries (closed PEC cavity).
    this.applyPEC();

    this.currentTime += this.dt;
    this.stepCount++;
  }

  /** Update H-field: H^{n+1/2} = Ch * H^{n-1/2} - Dh * curl(E^n) */
  private updateH(): void {
    const { nx, ny, nz, dx, dy, dz, Ch, Dh } = this;
    const { Ex, Ey, Ez, Hx, Hy, Hz } = this;

    // Hx: at (i, j+½, k+½) — curl_x(E) = dEz/dy - dEy/dz
    for (let k = 0; k < nz; k++) {
      for (let j = 0; j < ny; j++) {
        for (let i = 0; i < nx + 1; i++) {
          const curlEx = (Ez.get(i, j + 1, k) - Ez.get(i, j, k)) / dy
                       - (Ey.get(i, j, k + 1) - Ey.get(i, j, k)) / dz;
          Hx.set(i, j, k, Ch * Hx.get(i, j, k) - Dh * curlEx);
        }
      }
    }

    // Hy: at (i+½, j, k+½) — curl_y(E) = dEx/dz - dEz/dx
    for (let k = 0; k < nz; k++) {
      for (let j = 0; j < ny + 1; j++) {
        for (let i = 0; i < nx; i++) {
          const curlEy = (Ex.get(i, j, k + 1) - Ex.get(i, j, k)) / dz
                       - (Ez.get(i + 1, j, k) - Ez.get(i, j, k)) / dx;
          Hy.set(i, j, k, Ch * Hy.get(i, j, k) - Dh * curlEy);
        }
      }
    }

    // Hz: at (i+½, j+½, k) — curl_z(E) = dEy/dx - dEx/dy
    for (let k = 0; k < nz + 1; k++) {
      for (let j = 0; j < ny; j++) {
        for (let i = 0; i < nx; i++) {
          const curlEz = (Ey.get(i + 1, j, k) - Ey.get(i, j, k)) / dx
                       - (Ex.get(i, j + 1, k) - Ex.get(i, j, k)) / dy;
          Hz.set(i, j, k, Ch * Hz.get(i, j, k) - Dh * curlEz);
        }
      }
    }
  }

  /** Update E-field: E^{n+1} = Ce * E^n + De * curl(H^{n+1/2}) */
  private updateE(): void {
    const { nx, ny, nz, dx, dy, dz, Ce, De } = this;
    const { Ex, Ey, Ez, Hx, Hy, Hz } = this;

    // Ex: at (i+½, j, k) — curl_x(H) = dHz/dy - dHy/dz
    for (let k = 1; k < nz; k++) {
      for (let j = 1; j < ny; j++) {
        for (let i = 0; i < nx; i++) {
          const curlHx = (Hz.get(i, j, k) - Hz.get(i, j - 1, k)) / dy
                       - (Hy.get(i, j, k) - Hy.get(i, j, k - 1)) / dz;
          Ex.set(i, j, k, Ce * Ex.get(i, j, k) + De * curlHx);
        }
      }
    }

    // Ey: at (i, j+½, k) — curl_y(H) = dHx/dz - dHz/dx
    for (let k = 1; k < nz; k++) {
      for (let j = 0; j < ny; j++) {
        for (let i = 1; i < nx; i++) {
          const curlHy = (Hx.get(i, j, k) - Hx.get(i, j, k - 1)) / dz
                       - (Hz.get(i, j, k) - Hz.get(i - 1, j, k)) / dx;
          Ey.set(i, j, k, Ce * Ey.get(i, j, k) + De * curlHy);
        }
      }
    }

    // Ez: at (i, j, k+½) — curl_z(H) = dHy/dx - dHx/dy
    for (let k = 0; k < nz; k++) {
      for (let j = 1; j < ny; j++) {
        for (let i = 1; i < nx; i++) {
          const curlHz = (Hy.get(i, j, k) - Hy.get(i - 1, j, k)) / dx
                       - (Hx.get(i, j, k) - Hx.get(i, j - 1, k)) / dy;
          Ez.set(i, j, k, Ce * Ez.get(i, j, k) + De * curlHz);
        }
      }
    }
  }

  /**
   * CPML H-field update. Identical to {@link updateH} but each spatial
   * derivative is replaced by its stretched-coordinate form
   * `(1/κ)·∂F + ψ`, with ψ advanced by the recursive convolution. Reduces
   * exactly to {@link updateH} in the interior (κ=1, b=1, a=0 ⇒ ψ stays 0).
   */
  private updateH_cpml(): void {
    const { nx, ny, nz, dx, dy, dz, Ch, Dh } = this;
    const { Ex, Ey, Ez, Hx, Hy, Hz } = this;
    const c = this.cpml!;

    // Hx at (i, j+½, k+½): curl_x(E) = dEz/dy - dEy/dz. Loss: y,z (half grid).
    for (let k = 0; k < nz; k++) {
      for (let j = 0; j < ny; j++) {
        for (let i = 0; i < nx + 1; i++) {
          const dEzdy = (Ez.get(i, j + 1, k) - Ez.get(i, j, k)) / dy;
          const dEydz = (Ey.get(i, j, k + 1) - Ey.get(i, j, k)) / dz;
          const py = updatePsi(c.psiHxy.get(i, j, k), c.halfY.b[j], c.halfY.a[j], dEzdy);
          const pz = updatePsi(c.psiHxz.get(i, j, k), c.halfZ.b[k], c.halfZ.a[k], dEydz);
          c.psiHxy.set(i, j, k, py);
          c.psiHxz.set(i, j, k, pz);
          const curlEx = (dEzdy * c.halfY.invKappa[j] + py) - (dEydz * c.halfZ.invKappa[k] + pz);
          Hx.set(i, j, k, Ch * Hx.get(i, j, k) - Dh * curlEx);
        }
      }
    }

    // Hy at (i+½, j, k+½): curl_y(E) = dEx/dz - dEz/dx. Loss: z,x (half grid).
    for (let k = 0; k < nz; k++) {
      for (let j = 0; j < ny + 1; j++) {
        for (let i = 0; i < nx; i++) {
          const dExdz = (Ex.get(i, j, k + 1) - Ex.get(i, j, k)) / dz;
          const dEzdx = (Ez.get(i + 1, j, k) - Ez.get(i, j, k)) / dx;
          const pz = updatePsi(c.psiHyz.get(i, j, k), c.halfZ.b[k], c.halfZ.a[k], dExdz);
          const px = updatePsi(c.psiHyx.get(i, j, k), c.halfX.b[i], c.halfX.a[i], dEzdx);
          c.psiHyz.set(i, j, k, pz);
          c.psiHyx.set(i, j, k, px);
          const curlEy = (dExdz * c.halfZ.invKappa[k] + pz) - (dEzdx * c.halfX.invKappa[i] + px);
          Hy.set(i, j, k, Ch * Hy.get(i, j, k) - Dh * curlEy);
        }
      }
    }

    // Hz at (i+½, j+½, k): curl_z(E) = dEy/dx - dEx/dy. Loss: x,y (half grid).
    for (let k = 0; k < nz + 1; k++) {
      for (let j = 0; j < ny; j++) {
        for (let i = 0; i < nx; i++) {
          const dEydx = (Ey.get(i + 1, j, k) - Ey.get(i, j, k)) / dx;
          const dExdy = (Ex.get(i, j + 1, k) - Ex.get(i, j, k)) / dy;
          const px = updatePsi(c.psiHzx.get(i, j, k), c.halfX.b[i], c.halfX.a[i], dEydx);
          const py = updatePsi(c.psiHzy.get(i, j, k), c.halfY.b[j], c.halfY.a[j], dExdy);
          c.psiHzx.set(i, j, k, px);
          c.psiHzy.set(i, j, k, py);
          const curlEz = (dEydx * c.halfX.invKappa[i] + px) - (dExdy * c.halfY.invKappa[j] + py);
          Hz.set(i, j, k, Ch * Hz.get(i, j, k) - Dh * curlEz);
        }
      }
    }
  }

  /** CPML E-field update — mirror of {@link updateE} with stretched derivatives. */
  private updateE_cpml(): void {
    const { nx, ny, nz, dx, dy, dz, Ce, De } = this;
    const { Ex, Ey, Ez, Hx, Hy, Hz } = this;
    const c = this.cpml!;

    // Ex at (i+½, j, k): curl_x(H) = dHz/dy - dHy/dz. Loss: y,z (integer grid).
    for (let k = 1; k < nz; k++) {
      for (let j = 1; j < ny; j++) {
        for (let i = 0; i < nx; i++) {
          const dHzdy = (Hz.get(i, j, k) - Hz.get(i, j - 1, k)) / dy;
          const dHydz = (Hy.get(i, j, k) - Hy.get(i, j, k - 1)) / dz;
          const py = updatePsi(c.psiExy.get(i, j, k), c.intY.b[j], c.intY.a[j], dHzdy);
          const pz = updatePsi(c.psiExz.get(i, j, k), c.intZ.b[k], c.intZ.a[k], dHydz);
          c.psiExy.set(i, j, k, py);
          c.psiExz.set(i, j, k, pz);
          const curlHx = (dHzdy * c.intY.invKappa[j] + py) - (dHydz * c.intZ.invKappa[k] + pz);
          Ex.set(i, j, k, Ce * Ex.get(i, j, k) + De * curlHx);
        }
      }
    }

    // Ey at (i, j+½, k): curl_y(H) = dHx/dz - dHz/dx. Loss: z,x (integer grid).
    for (let k = 1; k < nz; k++) {
      for (let j = 0; j < ny; j++) {
        for (let i = 1; i < nx; i++) {
          const dHxdz = (Hx.get(i, j, k) - Hx.get(i, j, k - 1)) / dz;
          const dHzdx = (Hz.get(i, j, k) - Hz.get(i - 1, j, k)) / dx;
          const pz = updatePsi(c.psiEyz.get(i, j, k), c.intZ.b[k], c.intZ.a[k], dHxdz);
          const px = updatePsi(c.psiEyx.get(i, j, k), c.intX.b[i], c.intX.a[i], dHzdx);
          c.psiEyz.set(i, j, k, pz);
          c.psiEyx.set(i, j, k, px);
          const curlHy = (dHxdz * c.intZ.invKappa[k] + pz) - (dHzdx * c.intX.invKappa[i] + px);
          Ey.set(i, j, k, Ce * Ey.get(i, j, k) + De * curlHy);
        }
      }
    }

    // Ez at (i, j, k+½): curl_z(H) = dHy/dx - dHx/dy. Loss: x,y (integer grid).
    for (let k = 0; k < nz; k++) {
      for (let j = 1; j < ny; j++) {
        for (let i = 1; i < nx; i++) {
          const dHydx = (Hy.get(i, j, k) - Hy.get(i - 1, j, k)) / dx;
          const dHxdy = (Hx.get(i, j, k) - Hx.get(i, j - 1, k)) / dy;
          const px = updatePsi(c.psiEzx.get(i, j, k), c.intX.b[i], c.intX.a[i], dHydx);
          const py = updatePsi(c.psiEzy.get(i, j, k), c.intY.b[j], c.intY.a[j], dHxdy);
          c.psiEzx.set(i, j, k, px);
          c.psiEzy.set(i, j, k, py);
          const curlHz = (dHydx * c.intX.invKappa[i] + px) - (dHxdy * c.intY.invKappa[j] + py);
          Ez.set(i, j, k, Ce * Ez.get(i, j, k) + De * curlHz);
        }
      }
    }
  }

  /** PEC boundary: tangential E = 0 at all domain faces. */
  private applyPEC(): void {
    const { nx, ny, nz } = this;

    // Ex tangential to y and z faces → zero at j=0, j=ny, k=0, k=nz
    for (let k of [0, nz]) for (let j = 0; j <= ny; j++) for (let i = 0; i < nx; i++) this.Ex.set(i, j, k, 0);
    for (let k = 0; k <= nz; k++) for (let j of [0, ny]) for (let i = 0; i < nx; i++) this.Ex.set(i, j, k, 0);

    // Ey tangential to x and z faces
    for (let k of [0, nz]) for (let j = 0; j < ny; j++) for (let i = 0; i <= nx; i++) this.Ey.set(i, j, k, 0);
    for (let k = 0; k <= nz; k++) for (let j = 0; j < ny; j++) for (let i of [0, nx]) this.Ey.set(i, j, k, 0);

    // Ez tangential to x and y faces
    for (let k = 0; k < nz; k++) for (let j of [0, ny]) for (let i = 0; i <= nx; i++) this.Ez.set(i, j, k, 0);
    for (let k = 0; k < nz; k++) for (let j = 0; j <= ny; j++) for (let i of [0, nx]) this.Ez.set(i, j, k, 0);
  }

  /** Apply sources at the current time. */
  private applySources(t: number): void {
    for (const src of this.config.sources) {
      if (src.active === false) continue;
      const [si, sj, sk] = src.position;
      const val = this.evaluateSource(src, t);

      // Inject as current density J (adds to E-field via De * J / eps)
      const field = src.polarization === 'x' ? this.Ez
                  : src.polarization === 'y' ? this.Ey
                  : this.Ez;

      if (src.polarization === 'x') {
        this.Ex.set(si, sj, sk, this.Ex.get(si, sj, sk) - this.De * val);
      } else if (src.polarization === 'y') {
        this.Ey.set(si, sj, sk, this.Ey.get(si, sj, sk) - this.De * val);
      } else {
        this.Ez.set(si, sj, sk, this.Ez.get(si, sj, sk) - this.De * val);
      }
    }
  }

  private evaluateSource(src: EMSource, t: number): number {
    switch (src.type) {
      case 'point_current':
        return src.amplitude;
      case 'sinusoidal': {
        const f = src.frequency ?? 1e9;
        const env = src.pulseWidth
          ? Math.exp(-((t - 4 * src.pulseWidth) ** 2) / (2 * src.pulseWidth ** 2))
          : 1;
        return src.amplitude * Math.sin(2 * Math.PI * f * t) * env;
      }
      default:
        return 0;
    }
  }

  // ── Public API ──────────────────────────────────────────────────────────

  /** Get E-field magnitude |E| = √(Ex²+Ey²+Ez²) on the Yee grid (cell-centered average). */
  getEFieldMagnitude(): Float32Array {
    const { nx, ny, nz } = this;
    const result = new Float32Array(nx * ny * nz);

    for (let k = 0; k < nz; k++) {
      for (let j = 0; j < ny; j++) {
        for (let i = 0; i < nx; i++) {
          // Average E components to cell center
          const ex = 0.5 * (this.Ex.get(i, j, k) + (i + 1 < this.Ex.sx ? this.Ex.get(i + 1, j, k) : 0));
          const ey = 0.5 * (this.Ey.get(i, j, k) + (j + 1 < this.Ey.sy ? this.Ey.get(i, j + 1, k) : 0));
          const ez = 0.5 * (this.Ez.get(i, j, k) + (k + 1 < this.Ez.sz ? this.Ez.get(i, j, k + 1) : 0));
          result[(k * ny + j) * nx + i] = Math.sqrt(ex * ex + ey * ey + ez * ez);
        }
      }
    }
    return result;
  }

  /** Get H-field magnitude |H| on cell centers. */
  getHFieldMagnitude(): Float32Array {
    const { nx, ny, nz } = this;
    const result = new Float32Array(nx * ny * nz);

    for (let k = 0; k < nz; k++) {
      for (let j = 0; j < ny; j++) {
        for (let i = 0; i < nx; i++) {
          const hx = (i < this.Hx.sx && j < this.Hx.sy && k < this.Hx.sz) ? this.Hx.get(i, j, k) : 0;
          const hy = (i < this.Hy.sx && j < this.Hy.sy && k < this.Hy.sz) ? this.Hy.get(i, j, k) : 0;
          const hz = (i < this.Hz.sx && j < this.Hz.sy && k < this.Hz.sz) ? this.Hz.get(i, j, k) : 0;
          result[(k * ny + j) * nx + i] = Math.sqrt(hx * hx + hy * hy + hz * hz);
        }
      }
    }
    return result;
  }

  getTime(): number { return this.currentTime; }

  getStats(): FDTDStats {
    let maxE = 0, maxH = 0;
    for (const f of [this.Ex, this.Ey, this.Ez]) {
      for (let i = 0; i < f.data.length; i++) {
        const v = Math.abs(f.data[i]);
        if (v > maxE) maxE = v;
      }
    }
    for (const f of [this.Hx, this.Hy, this.Hz]) {
      for (let i = 0; i < f.data.length; i++) {
        const v = Math.abs(f.data[i]);
        if (v > maxH) maxH = v;
      }
    }
    return {
      currentTime: this.currentTime,
      stepCount: this.stepCount,
      timeStep: this.dt,
      cflLimit: this.cflLimit,
      maxE,
      maxH,
      cellCount: this.nx * this.ny * this.nz,
    };
  }

  dispose(): void {
    // No external resources
  }
}
