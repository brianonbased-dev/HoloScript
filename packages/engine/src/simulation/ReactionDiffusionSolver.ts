/**
 * ReactionDiffusionSolver — Reaction-diffusion system with adaptive RK4/5 ODE kinetics.
 *
 * ## Governing Equations
 *
 * For each species i:
 *
 *   ∂Cᵢ/∂t = Dᵢ∇²Cᵢ + Rᵢ(C₁, C₂, ..., T)
 *
 * where:
 *   Cᵢ    = concentration of species i [mol/m³]
 *   Dᵢ    = diffusion coefficient of species i [m²/s]
 *   Rᵢ    = net reaction rate for species i [mol/(m³·s)]
 *   T     = temperature field [K] (from coupled ThermalSolver)
 *
 * ## Reaction Kinetics
 *
 * Reactions follow the law of mass action with Arrhenius rate constants:
 *
 *   k(T) = A · exp(-Eₐ / (R · T))
 *
 * where:
 *   A     = pre-exponential factor [1/s or m³/(mol·s) depending on order]
 *   Eₐ    = activation energy [J/mol]
 *   R     = universal gas constant = 8.314 J/(mol·K)
 *   T     = temperature [K]
 *
 * ## ODE Integration: Dormand-Prince RK4/5 (Adaptive)
 *
 * The reaction terms Rᵢ are stiff-capable and use an embedded Runge-Kutta
 * pair (Dormand-Prince) for adaptive timestep control. The local truncation
 * error is estimated from the difference between 4th and 5th order solutions:
 *
 *   err = ||y₅ - y₄|| / (atol + rtol · ||y₅||)
 *
 * If err > 1, the substep is rejected and retried with a smaller dt.
 * If err < 1, the substep is accepted and dt is grown for the next substep.
 *
 * ## Spatial Discretization
 *
 * 2nd-order central differences on a uniform 3D grid (same as ThermalSolver).
 *
 * ## Thermal Coupling
 *
 * When coupled to ThermalSolver via CouplingManagerV2:
 * - Reads temperature field T(x,y,z) for Arrhenius rate evaluation
 * - Writes heat source field Q(x,y,z) = Σⱼ (-ΔHⱼ · rⱼ) for exothermic reactions
 *
 * The coupling is explicit (operator-split): diffusion → reaction → heat export.
 *
 * ## Stability
 *
 * - Diffusion: explicit with CFL check (same as ThermalSolver)
 * - Reaction: adaptive RK4/5 handles stiffness via timestep control
 * - Splitting: Strang splitting (half-diffusion → full-reaction → half-diffusion)
 *   for 2nd-order temporal accuracy on the coupled system
 *
 * ## Known Limitations
 *
 * - Uniform grid only (no AMR)
 * - No surface reactions (volume only)
 * - Strang splitting may lose accuracy for very fast reactions (Da >> 1)
 * - No implicit diffusion fallback (unlike ThermalSolver)
 *
 * ## References
 *
 * - Hairer, Nørsett, Wanner, "Solving Ordinary Differential Equations I", 2nd ed., Ch. II.4
 * - Dormand & Prince, "A family of embedded Runge-Kutta formulae", J. Comp. Appl. Math. 6, 1980
 * - Strang, "On the Construction and Comparison of Difference Schemes", SINUM 5, 1968
 *
 * @see SimSolver — generic solver interface
 * @see CouplingManagerV2 — multi-physics orchestrator
 * @see ThermalSolver — coupled heat source
 */

import { RegularGrid3D } from './RegularGrid3D';

// ── Constants ───────────────────────────────────────────────────────────────

/** Universal gas constant [J/(mol·K)] */
const R_GAS = 8.314462618;

// ── Dormand-Prince RK4/5 Butcher Tableau ────────────────────────────────────

const DP_A = [
  [],
  [1 / 5],
  [3 / 40, 9 / 40],
  [44 / 45, -56 / 15, 32 / 9],
  [19372 / 6561, -25360 / 2187, 64448 / 6561, -212 / 729],
  [9017 / 3168, -355 / 33, 46732 / 5247, 49 / 176, -5103 / 18656],
  [35 / 384, 0, 500 / 1113, 125 / 192, -2187 / 6784, 11 / 84],
];

/** 5th-order weights (same as last row of A for FSAL) */
const DP_B5 = [35 / 384, 0, 500 / 1113, 125 / 192, -2187 / 6784, 11 / 84, 0];

/** 4th-order weights (for error estimation) */
const DP_B4 = [
  5179 / 57600, 0, 7571 / 16695, 393 / 640,
  -92097 / 339200, 187 / 2100, 1 / 40,
];

const DP_C = [0, 1 / 5, 3 / 10, 4 / 5, 8 / 9, 1, 1];

// ── Types ───────────────────────────────────────────────────────────────────

export interface Species {
  /** Unique species identifier (e.g., "A", "B", "product") */
  name: string;
  /** Diffusion coefficient [m²/s] */
  diffusivity: number;
  /** Initial concentration [mol/m³] */
  initialConcentration: number;
  /** Molar mass [kg/mol] (for density-related calculations, optional) */
  molarMass?: number;
}

export interface Reaction {
  /** Human-readable label (e.g., "A + B → C") */
  label: string;
  /** Stoichiometric coefficients: negative for reactants, positive for products.
   *  Map from species name to coefficient. */
  stoichiometry: Record<string, number>;
  /** Arrhenius pre-exponential factor A [units depend on reaction order] */
  preExponential: number;
  /** Activation energy Eₐ [J/mol] */
  activationEnergy: number;
  /** Reaction order per species: map from species name to order.
   *  Absent species are assumed order 0 (not involved in rate law). */
  orders: Record<string, number>;
  /** Enthalpy of reaction ΔH [J/mol]. Negative = exothermic. */
  enthalpy: number;
}

export interface ReactionDiffusionConfig {
  gridResolution: [number, number, number];
  domainSize: [number, number, number];
  species: Species[];
  reactions: Reaction[];
  /** Reference temperature [K] when no thermal coupling is present (default: 298.15) */
  referenceTemperature?: number;
  /** Adaptive RK tolerance (absolute) (default: 1e-6) */
  absoluteTolerance?: number;
  /** Adaptive RK tolerance (relative) (default: 1e-3) */
  relativeTolerance?: number;
  /** Maximum RK substeps per outer step (default: 1000) */
  maxSubsteps?: number;
  /** Minimum RK substep size [s] (default: 1e-12) */
  minSubstepSize?: number;
  /** Safety factor for adaptive step control (default: 0.9) */
  safetyFactor?: number;
  /** Maximum step growth factor (default: 5.0) */
  maxGrowthFactor?: number;
}

export interface ReactionDiffusionStats {
  simulationTime: number;
  stepCount: number;
  totalSubsteps: number;
  rejectedSubsteps: number;
  lastStepMs: number;
  speciesNames: string[];
  minConcentrations: number[];
  maxConcentrations: number[];
  totalHeatRelease: number;
}

// ── Solver ──────────────────────────────────────────────────────────────────

export class ReactionDiffusionSolver {
  private config: ReactionDiffusionConfig;

  /** Concentration grids: one per species */
  private concentrations: RegularGrid3D[];

  /** Temporary grid for diffusion half-step */
  private concPrev: RegularGrid3D[];

  /** Heat source field Q [W/m³] — written each step for thermal coupling */
  private heatSource: RegularGrid3D;

  /** External temperature field [K] — read from thermal coupling */
  private temperatureField: RegularGrid3D;

  /** Whether temperature field has been set externally */
  private hasExternalTemperature = false;

  private simulationTime = 0;
  private stepCount = 0;
  private totalSubsteps = 0;
  private rejectedSubsteps = 0;
  private lastStepMs = 0;

  // Adaptive RK parameters
  private readonly atol: number;
  private readonly rtol: number;
  private readonly maxSubsteps: number;
  private readonly minDt: number;
  private readonly safety: number;
  private readonly maxGrowth: number;

  constructor(config: ReactionDiffusionConfig) {
    this.config = config;
    this.atol = config.absoluteTolerance ?? 1e-6;
    this.rtol = config.relativeTolerance ?? 1e-3;
    this.maxSubsteps = config.maxSubsteps ?? 1000;
    this.minDt = config.minSubstepSize ?? 1e-12;
    this.safety = config.safetyFactor ?? 0.9;
    this.maxGrowth = config.maxGrowthFactor ?? 5.0;

    const res = config.gridResolution;
    const dom = config.domainSize;
    const nSpecies = config.species.length;

    // Initialize concentration grids
    this.concentrations = [];
    this.concPrev = [];
    for (let s = 0; s < nSpecies; s++) {
      const grid = new RegularGrid3D(res, dom);
      grid.fill(config.species[s].initialConcentration);
      this.concentrations.push(grid);
      this.concPrev.push(new RegularGrid3D(res, dom));
    }

    // Heat source and temperature fields
    this.heatSource = new RegularGrid3D(res, dom);
    this.temperatureField = new RegularGrid3D(res, dom);
    this.temperatureField.fill(config.referenceTemperature ?? 298.15);
  }

  // ── Public API ────────────────────────────────────────────────────────────

  /**
   * Advance the reaction-diffusion system by dt seconds.
   *
   * Uses Strang splitting:
   *   1. Half-step diffusion (dt/2)
   *   2. Full-step reaction (dt) with adaptive RK4/5
   *   3. Half-step diffusion (dt/2)
   */
  step(dt: number): void {
    const t0 = performance.now();

    // Reset heat source for this step
    this.heatSource.fill(0);

    // Strang splitting: D(dt/2) → R(dt) → D(dt/2)
    this.stepDiffusion(dt / 2);
    this.stepReaction(dt);
    this.stepDiffusion(dt / 2);

    this.simulationTime += dt;
    this.stepCount++;
    this.lastStepMs = performance.now() - t0;
  }

  /** Set external temperature field (from ThermalSolver coupling) */
  setTemperatureField(tempGrid: RegularGrid3D): void {
    const src = tempGrid.data;
    const dst = this.temperatureField.data;
    const len = Math.min(src.length, dst.length);
    for (let i = 0; i < len; i++) {
      dst[i] = src[i];
    }
    this.hasExternalTemperature = true;
  }

  /** Set temperature from Float32Array (for CouplingManagerV2 field transfer) */
  setTemperatureArray(temps: Float32Array): void {
    const dst = this.temperatureField.data;
    const len = Math.min(temps.length, dst.length);
    for (let i = 0; i < len; i++) {
      dst[i] = temps[i];
    }
    this.hasExternalTemperature = true;
  }

  /** Get concentration field for a species (for ScalarFieldOverlay) */
  getConcentrationField(speciesIndex: number): Float32Array {
    return this.concentrations[speciesIndex].toFloat32Array();
  }

  /** Get concentration grid for a species (for coupling) */
  getConcentrationGrid(speciesIndex: number): RegularGrid3D {
    return this.concentrations[speciesIndex];
  }

  /** Get heat source field [W/m³] for coupling to ThermalSolver */
  getHeatSourceGrid(): RegularGrid3D {
    return this.heatSource;
  }

  /** Get heat source as Float32Array */
  getHeatSourceField(): Float32Array {
    return this.heatSource.toFloat32Array();
  }

  /** Get temperature field (external or reference) */
  getTemperatureGrid(): RegularGrid3D {
    return this.temperatureField;
  }

  /** Point query: concentration at world position via trilinear interpolation */
  getConcentrationAt(speciesIndex: number, x: number, y: number, z: number): number {
    const result = this.concentrations[speciesIndex].sampleAtPositions(
      new Float32Array([x, y, z])
    );
    return result[0];
  }

  /** Get species names */
  getSpeciesNames(): string[] {
    return this.config.species.map((s) => s.name);
  }

  /** Number of species */
  get speciesCount(): number {
    return this.config.species.length;
  }

  getStats(): ReactionDiffusionStats {
    const nSpecies = this.config.species.length;
    const mins: number[] = [];
    const maxs: number[] = [];

    for (let s = 0; s < nSpecies; s++) {
      const d = this.concentrations[s].data;
      let min = Infinity, max = -Infinity;
      for (let i = 0; i < d.length; i++) {
        if (d[i] < min) min = d[i];
        if (d[i] > max) max = d[i];
      }
      mins.push(min);
      maxs.push(max);
    }

    // Total heat release
    let totalQ = 0;
    const qd = this.heatSource.data;
    for (let i = 0; i < qd.length; i++) {
      totalQ += qd[i];
    }
    const cellVol = this.heatSource.dx * this.heatSource.dy * this.heatSource.dz;

    return {
      simulationTime: this.simulationTime,
      stepCount: this.stepCount,
      totalSubsteps: this.totalSubsteps,
      rejectedSubsteps: this.rejectedSubsteps,
      lastStepMs: this.lastStepMs,
      speciesNames: this.config.species.map((s) => s.name),
      minConcentrations: mins,
      maxConcentrations: maxs,
      totalHeatRelease: totalQ * cellVol,
    };
  }

  dispose(): void {
    // Float32Arrays will be GC'd — no GPU resources to release (CPU solver)
  }

  // ── Diffusion Step ────────────────────────────────────────────────────────

  /**
   * Explicit diffusion: Cᵢ(n+1) = Cᵢ(n) + dt · Dᵢ · ∇²Cᵢ
   *
   * CFL stability: dt_stable = 1 / (2·D·(1/dx² + 1/dy² + 1/dz²))
   * If dt exceeds CFL limit, sub-cycles with stable dt.
   */
  private stepDiffusion(dt: number): void {
    const nSpecies = this.config.species.length;
    const { nx, ny, nz, dx, dy, dz } = this.concentrations[0];

    for (let s = 0; s < nSpecies; s++) {
      const D = this.config.species[s].diffusivity;
      if (D <= 0) continue; // Non-diffusing species

      const dtStable = 0.9 / (2 * D * (1 / (dx * dx) + 1 / (dy * dy) + 1 / (dz * dz)));
      const nSub = Math.max(1, Math.ceil(dt / dtStable));
      const subDt = dt / nSub;

      const conc = this.concentrations[s];
      const prev = this.concPrev[s];

      for (let sub = 0; sub < nSub; sub++) {
        prev.copy(conc);
        for (let k = 1; k < nz - 1; k++) {
          for (let j = 1; j < ny - 1; j++) {
            for (let i = 1; i < nx - 1; i++) {
              const lap = prev.laplacian(i, j, k);
              conc.set(i, j, k, prev.get(i, j, k) + subDt * D * lap);
            }
          }
        }
      }

      // Clamp concentrations to non-negative
      const d = conc.data;
      for (let i = 0; i < d.length; i++) {
        if (d[i] < 0) d[i] = 0;
      }
    }
  }

  // ── Reaction Step (Adaptive RK4/5 Dormand-Prince) ────────────────────────

  /**
   * Solve the ODE system dC/dt = R(C, T) at each grid point independently.
   *
   * Uses adaptive Dormand-Prince RK4/5 for each cell. The reaction rate
   * depends on local temperature (from the temperature field) and local
   * concentrations of all species.
   */
  private stepReaction(dt: number): void {
    const { nx, ny, nz } = this.concentrations[0];
    const nSpecies = this.config.species.length;
    const reactions = this.config.reactions;
    const cellVol = this.heatSource.dx * this.heatSource.dy * this.heatSource.dz;

    // Scratch arrays for RK stages (allocated once, reused per cell)
    const y = new Float64Array(nSpecies);
    const yNew = new Float64Array(nSpecies);
    const yErr = new Float64Array(nSpecies);
    const k = Array.from({ length: 7 }, () => new Float64Array(nSpecies));
    const yStage = new Float64Array(nSpecies);

    for (let kz = 0; kz < nz; kz++) {
      for (let jy = 0; jy < ny; jy++) {
        for (let ix = 0; ix < nx; ix++) {
          // Read local concentrations
          for (let s = 0; s < nSpecies; s++) {
            y[s] = this.concentrations[s].get(ix, jy, kz);
          }

          // Read local temperature
          const T = this.temperatureField.get(ix, jy, kz);

          // Adaptive RK4/5 integration over [0, dt]
          let t = 0;
          let h = dt; // Initial substep = full step
          let totalHeat = 0;
          let substeps = 0;

          while (t < dt - 1e-15 * dt) {
            if (substeps >= this.maxSubsteps) break;

            // Clamp h to not overshoot
            if (t + h > dt) h = dt - t;
            if (h < this.minDt) h = this.minDt;

            // Compute 7 RK stages
            this.reactionRates(y, T, reactions, k[0]);

            for (let stage = 1; stage < 7; stage++) {
              for (let s = 0; s < nSpecies; s++) {
                let sum = 0;
                const aRow = DP_A[stage];
                for (let q = 0; q < aRow.length; q++) {
                  sum += aRow[q] * k[q][s];
                }
                yStage[s] = y[s] + h * sum;
                if (yStage[s] < 0) yStage[s] = 0; // Positivity guard
              }
              this.reactionRates(yStage, T, reactions, k[stage]);
            }

            // 5th-order solution and error estimate
            let errNorm = 0;
            for (let s = 0; s < nSpecies; s++) {
              let sum5 = 0, sum4 = 0;
              for (let q = 0; q < 7; q++) {
                sum5 += DP_B5[q] * k[q][s];
                sum4 += DP_B4[q] * k[q][s];
              }
              yNew[s] = y[s] + h * sum5;
              yErr[s] = h * (sum5 - sum4);

              // Scaled error (mixed absolute + relative tolerance)
              const scale = this.atol + this.rtol * Math.abs(yNew[s]);
              errNorm += (yErr[s] / scale) * (yErr[s] / scale);
            }
            errNorm = Math.sqrt(errNorm / nSpecies);

            substeps++;

            if (errNorm <= 1.0 || h <= this.minDt) {
              // Accept step
              for (let s = 0; s < nSpecies; s++) {
                y[s] = Math.max(0, yNew[s]); // Positivity enforcement
              }
              t += h;
              this.totalSubsteps++;

              // Accumulate heat release for this substep
              totalHeat += this.computeHeatRelease(y, T, reactions) * h;

              // Grow step
              if (errNorm > 0) {
                h *= Math.min(
                  this.maxGrowth,
                  this.safety * Math.pow(errNorm, -0.2)
                );
              } else {
                h *= this.maxGrowth;
              }
            } else {
              // Reject step — shrink
              h *= Math.max(0.1, this.safety * Math.pow(errNorm, -0.25));
              this.rejectedSubsteps++;
            }
          }

          // Write back concentrations
          for (let s = 0; s < nSpecies; s++) {
            this.concentrations[s].set(ix, jy, kz, y[s]);
          }

          // Write heat source [W/m³]
          // totalHeat is in J/m³ over dt, so Q = totalHeat / dt gives W/m³
          // But we accumulate over the full step so just use totalHeat / dt
          if (dt > 0) {
            this.heatSource.set(ix, jy, kz, totalHeat / dt);
          }
        }
      }
    }
  }

  /**
   * Compute reaction rates dCᵢ/dt = Σⱼ νᵢⱼ · rⱼ for all species.
   *
   * Each reaction j has rate:
   *   rⱼ = kⱼ(T) · Π_i Cᵢ^{orderᵢⱼ}
   *
   * where kⱼ(T) = Aⱼ · exp(-Eₐⱼ / (R · T)) (Arrhenius)
   */
  private reactionRates(
    concentrations: Float64Array,
    T: number,
    reactions: Reaction[],
    out: Float64Array
  ): void {
    const nSpecies = this.config.species.length;
    const speciesNames = this.config.species.map((s) => s.name);

    // Zero output
    for (let s = 0; s < nSpecies; s++) {
      out[s] = 0;
    }

    for (const rxn of reactions) {
      // Arrhenius rate constant
      const kRate = rxn.preExponential * Math.exp(-rxn.activationEnergy / (R_GAS * T));

      // Rate = k · Π Cᵢ^orderᵢ
      let rate = kRate;
      for (let s = 0; s < nSpecies; s++) {
        const order = rxn.orders[speciesNames[s]];
        if (order !== undefined && order > 0) {
          const c = Math.max(0, concentrations[s]);
          rate *= Math.pow(c, order);
        }
      }

      // Accumulate stoichiometric contributions: dCᵢ/dt += νᵢ · rate
      for (let s = 0; s < nSpecies; s++) {
        const nu = rxn.stoichiometry[speciesNames[s]];
        if (nu !== undefined) {
          out[s] += nu * rate;
        }
      }
    }
  }

  /**
   * Compute instantaneous heat release rate [W/m³] at a cell.
   *
   * Q = Σⱼ (-ΔHⱼ) · rⱼ
   *
   * Convention: ΔH < 0 for exothermic → -ΔH > 0 → positive heat release.
   */
  private computeHeatRelease(
    concentrations: Float64Array,
    T: number,
    reactions: Reaction[]
  ): number {
    const speciesNames = this.config.species.map((s) => s.name);
    let Q = 0;

    for (const rxn of reactions) {
      const kRate = rxn.preExponential * Math.exp(-rxn.activationEnergy / (R_GAS * T));
      let rate = kRate;
      for (let s = 0; s < speciesNames.length; s++) {
        const order = rxn.orders[speciesNames[s]];
        if (order !== undefined && order > 0) {
          rate *= Math.pow(Math.max(0, concentrations[s]), order);
        }
      }
      // -ΔH · rate: negative enthalpy (exothermic) produces positive heat
      Q += -rxn.enthalpy * rate;
    }

    return Q;
  }
}
