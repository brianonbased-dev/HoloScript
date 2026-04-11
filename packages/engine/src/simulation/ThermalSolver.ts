/**
 * ThermalSolver — Heat equation solver via finite differences.
 *
 * Solves ∂T/∂t = α∇²T + Q/(ρcₚ) on a RegularGrid3D.
 * Explicit forward Euler with CFL stability check.
 * Falls back to implicit Jacobi if timestep exceeds stability limit.
 *
 * Designed to back the @thermal_simulation trait and
 * the hvac-building.hsplus digital twin composition.
 */

import { RegularGrid3D } from './RegularGrid3D';
import {
  applyBoundaryConditions,
  type BoundaryCondition,
} from './BoundaryConditions';
import {
  getMaterial,
  thermalDiffusivity,
  type ThermalMaterial,
} from './MaterialDatabase';
import { jacobiIteration } from './ConvergenceControl';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ThermalSource {
  id: string;
  type: 'point' | 'volume';
  /** Grid-space position [i, j, k] or world-space [x, y, z] */
  position: [number, number, number];
  /** Heat output in Watts */
  heat_output: number;
  /** Spread radius in cells (for volume sources) */
  radius?: number;
  /** Whether this source is active */
  active?: boolean;
}

export interface ThermalConfig {
  gridResolution: [number, number, number];
  domainSize: [number, number, number];
  timeStep: number;
  /** Material name → thermal properties. Falls back to MaterialDatabase. */
  materials: Record<string, Partial<ThermalMaterial>>;
  /** Default material for cells without explicit assignment */
  defaultMaterial: string;
  boundaryConditions: BoundaryCondition[];
  sources: ThermalSource[];
  /** Initial temperature in domain (°C or K) */
  initialTemperature?: number;
  /** Max implicit solver iterations per step */
  maxImplicitIterations?: number;
  /** Implicit solver convergence tolerance */
  implicitTolerance?: number;
}

export interface ThermalStats {
  minTemperature: number;
  maxTemperature: number;
  avgTemperature: number;
  simulationTime: number;
  stepCount: number;
  isImplicit: boolean;
  lastStepMs: number;
}

// ── Solver ────────────────────────────────────────────────────────────────────

export class ThermalSolver {
  private temperature: RegularGrid3D;
  private tempPrev: RegularGrid3D;
  private sourceField: RegularGrid3D;
  private config: ThermalConfig;
  private material: ThermalMaterial;
  private alpha: number; // thermal diffusivity
  private simulationTime = 0;
  private stepCount = 0;
  private useImplicit = false;
  private lastStepMs = 0;

  constructor(config: ThermalConfig) {
    this.config = config;

    // Resolve material
    const matName = config.defaultMaterial;
    const matOverride = config.materials[matName];
    const matBase = getMaterial(matName);
    this.material = { ...matBase, ...matOverride } as ThermalMaterial;
    this.alpha = thermalDiffusivity(this.material);

    // Initialize grids
    this.temperature = new RegularGrid3D(config.gridResolution, config.domainSize);
    this.tempPrev = new RegularGrid3D(config.gridResolution, config.domainSize);
    this.sourceField = new RegularGrid3D(config.gridResolution, config.domainSize);

    // Set initial temperature
    const T0 = config.initialTemperature ?? 20;
    this.temperature.fill(T0);
    this.tempPrev.fill(T0);

    // Build source field
    this.rebuildSourceField();

    // CFL stability check
    const dx = this.temperature.dx;
    const dy = this.temperature.dy;
    const dz = this.temperature.dz;
    const dtStable = 0.9 * (1 / (2 * this.alpha * (1 / (dx * dx) + 1 / (dy * dy) + 1 / (dz * dz))));

    if (config.timeStep > dtStable) {
      this.useImplicit = true;
    }
  }

  /**
   * Advance the thermal field by dt seconds.
   */
  step(dt: number): void {
    const t0 = performance.now();
    const effectiveDt = dt > 0 ? dt : this.config.timeStep;

    // Set boundary conditions, ensuring convection BCs receive actual thermal conductivity for Biot number
    for (const bc of this.config.boundaryConditions) {
      if (bc.type === 'convection') {
        bc.k = this.material.conductivity;
      }
    }
    applyBoundaryConditions(
      this.temperature,
      this.config.boundaryConditions,
      effectiveDt
    );

    if (this.useImplicit) {
      this.stepImplicit(effectiveDt);
    } else {
      this.stepExplicit(effectiveDt);
    }

    this.simulationTime += effectiveDt;
    this.stepCount++;
    this.lastStepMs = performance.now() - t0;
  }

  /**
   * Explicit forward Euler: T(n+1) = T(n) + dt * (α∇²T + Q/(ρcₚ))
   */
  private stepExplicit(dt: number): void {
    const { nx, ny, nz } = this.temperature;
    const rhoCp = this.material.density * this.material.specific_heat;

    this.tempPrev.copy(this.temperature);

    for (let k = 1; k < nz - 1; k++) {
      for (let j = 1; j < ny - 1; j++) {
        for (let i = 1; i < nx - 1; i++) {
          const lap = this.tempPrev.laplacian(i, j, k);
          const source = this.sourceField.get(i, j, k);

          const dT = dt * (this.alpha * lap + source / rhoCp);
          this.temperature.set(
            i, j, k,
            this.tempPrev.get(i, j, k) + dT
          );
        }
      }
    }
  }

  /**
   * Implicit Jacobi: solve (I - dt·α·∇²)T(n+1) = T(n) + dt·Q/(ρcₚ)
   */
  private stepImplicit(dt: number): void {
    const { nx, ny, nz } = this.temperature;
    const rhoCp = this.material.density * this.material.specific_heat;

    // Build RHS: T(n) + dt·Q/(ρcₚ)
    const rhs = this.tempPrev.clone();
    for (let k = 0; k < nz; k++) {
      for (let j = 0; j < ny; j++) {
        for (let i = 0; i < nx; i++) {
          const src = this.sourceField.get(i, j, k);
          rhs.set(i, j, k, this.temperature.get(i, j, k) + (dt * src) / rhoCp);
        }
      }
    }

    // Jacobi parameters for implicit heat equation
    const dx2 = this.temperature.dx * this.temperature.dx;
    const alphaCoeff = dx2 / (dt * this.alpha);
    const beta = 6 + alphaCoeff;

    jacobiIteration(
      this.temperature,
      rhs,
      alphaCoeff,
      beta,
      this.config.maxImplicitIterations ?? 100,
      this.config.implicitTolerance ?? 1e-4
    );
  }

  /**
   * Rebuild the volumetric source field from config sources.
   */
  private rebuildSourceField(): void {
    this.sourceField.fill(0);

    const { dx, dy, dz } = this.temperature;
    const cellVolume = dx * dy * dz;

    for (const src of this.config.sources) {
      if (src.active === false) continue;

      const [px, py, pz] = src.position;
      // Convert world position to grid indices (clamped to valid range)
      const gi = Math.max(0, Math.min(this.temperature.nx - 1, Math.round(px / dx)));
      const gj = Math.max(0, Math.min(this.temperature.ny - 1, Math.round(py / dy)));
      const gk = Math.max(0, Math.min(this.temperature.nz - 1, Math.round(pz / dz)));

      if (src.type === 'point' || !src.radius) {
        // Point source: all heat in one cell → W/m³
        if (this.inBounds(gi, gj, gk)) {
          this.sourceField.set(gi, gj, gk,
            this.sourceField.get(gi, gj, gk) + src.heat_output / cellVolume
          );
        }
      } else {
        // Volume source: distribute heat across radius
        const r = src.radius;
        let totalCells = 0;
        for (let dk = -r; dk <= r; dk++) {
          for (let dj = -r; dj <= r; dj++) {
            for (let di = -r; di <= r; di++) {
              if (di * di + dj * dj + dk * dk <= r * r) {
                if (this.inBounds(gi + di, gj + dj, gk + dk)) {
                  totalCells++;
                }
              }
            }
          }
        }
        if (totalCells === 0) continue;

        const heatPerCell = src.heat_output / (totalCells * cellVolume);
        for (let dk = -r; dk <= r; dk++) {
          for (let dj = -r; dj <= r; dj++) {
            for (let di = -r; di <= r; di++) {
              if (di * di + dj * dj + dk * dk <= r * r) {
                const ci = gi + di, cj = gj + dj, ck = gk + dk;
                if (this.inBounds(ci, cj, ck)) {
                  this.sourceField.set(ci, cj, ck,
                    this.sourceField.get(ci, cj, ck) + heatPerCell
                  );
                }
              }
            }
          }
        }
      }
    }
  }

  private inBounds(i: number, j: number, k: number): boolean {
    return (
      i >= 0 && i < this.temperature.nx &&
      j >= 0 && j < this.temperature.ny &&
      k >= 0 && k < this.temperature.nz
    );
  }

  // ── Public API ──────────────────────────────────────────────────────────

  /** Get the temperature field as Float32Array for ScalarFieldOverlay */
  getTemperatureField(): Float32Array {
    return this.temperature.toFloat32Array();
  }

  /** Get the underlying grid for coupling with other solvers */
  getTemperatureGrid(): RegularGrid3D {
    return this.temperature;
  }

  /** Point query: temperature at world position via trilinear interpolation */
  getTemperatureAt(x: number, y: number, z: number): number {
    const result = this.temperature.sampleAtPositions(
      new Float32Array([x, y, z])
    );
    return result[0];
  }

  /** Update a heat source at runtime (e.g., HVAC on/off) */
  setSource(id: string, heatOutput: number, active?: boolean): void {
    const src = this.config.sources.find((s) => s.id === id);
    if (src) {
      src.heat_output = heatOutput;
      if (active !== undefined) src.active = active;
      this.rebuildSourceField();
    }
  }

  /** Update boundary temperature (e.g., exterior weather change) */
  setBoundaryValue(faceOrIndex: string | number, value: number): void {
    if (typeof faceOrIndex === 'number') {
      const bc = this.config.boundaryConditions[faceOrIndex];
      if (bc) {
        if (bc.type === 'convection') bc.ambient = value;
        else bc.value = value;
      }
    }
  }

  getStats(): ThermalStats {
    let min = Infinity, max = -Infinity, sum = 0;
    const d = this.temperature.data;
    for (let i = 0; i < d.length; i++) {
      if (d[i] < min) min = d[i];
      if (d[i] > max) max = d[i];
      sum += d[i];
    }
    return {
      minTemperature: min,
      maxTemperature: max,
      avgTemperature: sum / d.length,
      simulationTime: this.simulationTime,
      stepCount: this.stepCount,
      isImplicit: this.useImplicit,
      lastStepMs: this.lastStepMs,
    };
  }

  dispose(): void {
    // Float32Arrays will be GC'd — no GPU resources to release (CPU solver)
  }
}
