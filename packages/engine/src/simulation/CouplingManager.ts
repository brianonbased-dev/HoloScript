/**
 * CouplingManager — Multi-physics solver orchestration.
 *
 * ## Mathematical Formulation
 *
 * **Approach**: Sequential (staggered) operator splitting.
 *
 * Each timestep, the coupled system is solved by advancing each
 * domain solver in sequence, with field transfers between them:
 *
 *   1. Solve thermal → extract temperature field T
 *   2. Transfer T → structural (thermal strain: ε_th = α_L·ΔT)
 *   3. Transfer T → hydraulic (viscosity: μ(T))
 *   4. Solve structural → extract stress field σ
 *   5. Solve hydraulic → extract pressure/flow fields
 *   6. Transfer flow → thermal (convective HTC update)
 *   7. Monitor saturation thresholds
 *
 * ## Coupling Chains
 *
 *   Thermal → Structural:  thermal strain ε_th = α_L·(T - T_ref)
 *   Thermal → Saturation:  phase change detection at T_melt
 *   Thermal → Hydraulic:   viscosity μ(T) via Sutherland or table lookup
 *   Hydraulic → Thermal:   convective HTC h from flow velocity
 *   Hydraulic → Saturation: overpressure detection
 *   Structural → Saturation: yield point warning (σ_VM > σ_yield)
 *
 * ## Field Transfer
 *
 * Fields are transferred between solvers via transform functions
 * registered per coupling chain. The transform maps the source
 * solver's output field to the target solver's input parameter.
 *
 * ## Limitations
 *
 * - **Sequential, not iterative**: Each coupling is one-directional per
 *   timestep. No Gauss-Seidel iteration between solvers within a step.
 *   This means strong two-way coupling (e.g., fluid-structure interaction
 *   with large deformations) is not accurately captured.
 * - **No sub-cycling**: All solvers advance with the same timestep.
 * - **First-order splitting error**: The sequential approach introduces
 *   O(dt) splitting error even if individual solvers are higher-order.
 *
 * ## References
 *
 * - Felippa, C.A. et al., "Partitioned analysis of coupled mechanical
 *   systems", Computer Methods in Applied Mechanics and Engineering,
 *   190(24-25), 3247-3270, 2001
 *
 * @see ThermalSolver — heat equation solver
 * @see StructuralSolver — linear elastic FEM
 * @see HydraulicSolver — pipe network solver
 * @see SaturationManager — threshold monitoring
 */

import { RegularGrid3D } from './RegularGrid3D';
import type { ThermalSolver } from './ThermalSolver';
import type { StructuralSolver } from './StructuralSolver';
import type { HydraulicSolver } from './HydraulicSolver';
import { SaturationManager, type SaturationEvent } from './SaturationManager';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface FieldCoupling {
  /** Source solver and field name */
  source: { solver: string; field: string };
  /** Target solver and field name */
  target: { solver: string; field: string };
  /** Transform function: source value → target value */
  transform: (value: number) => number;
  /** Whether this coupling is active */
  enabled?: boolean;
}

interface SolverEntry {
  type: 'thermal' | 'structural' | 'hydraulic';
  solver: ThermalSolver | StructuralSolver | HydraulicSolver;
}

export interface CouplingStats {
  solverCount: number;
  couplingCount: number;
  saturationMonitors: number;
  totalEvents: number;
  lastStepMs: number;
}

// ── Manager ───────────────────────────────────────────────────────────────────

export class CouplingManager {
  private solvers: Map<string, SolverEntry> = new Map();
  private couplings: FieldCoupling[] = [];
  private saturationManagers: SaturationManager[] = [];
  private lastEvents: SaturationEvent[] = [];
  private totalEvents = 0;
  private lastStepMs = 0;

  /**
   * Register a solver with a unique name.
   */
  registerSolver(
    name: string,
    type: 'thermal' | 'structural' | 'hydraulic',
    solver: ThermalSolver | StructuralSolver | HydraulicSolver
  ): void {
    this.solvers.set(name, { type, solver });
  }

  /**
   * Add a field coupling between two solvers.
   */
  addCoupling(coupling: FieldCoupling): void {
    this.couplings.push({ enabled: true, ...coupling });
  }

  /**
   * Add a saturation monitor on a solver's field.
   */
  addSaturationMonitor(monitor: SaturationManager): void {
    this.saturationManagers.push(monitor);
  }

  /**
   * Step all solvers, transfer coupled fields, check saturation.
   *
   * Order:
   * 1. Step all time-dependent solvers (thermal)
   * 2. Transfer coupled fields (thermal → structural, etc.)
   * 3. Re-solve steady-state solvers if inputs changed (structural, hydraulic)
   * 4. Check saturation thresholds
   */
  step(dt: number): SaturationEvent[] {
    const t0 = performance.now();
    this.lastEvents = [];

    // 1. Step time-dependent solvers
    for (const [, entry] of this.solvers) {
      if (entry.type === 'thermal') {
        (entry.solver as ThermalSolver).step(dt);
      }
    }

    // 2. Transfer coupled fields
    for (const coupling of this.couplings) {
      if (coupling.enabled === false) continue;
      this.transferField(coupling);
    }

    // 3. Re-solve steady-state solvers
    for (const [, entry] of this.solvers) {
      if (entry.type === 'structural') {
        (entry.solver as StructuralSolver).solve();
      } else if (entry.type === 'hydraulic') {
        (entry.solver as HydraulicSolver).solve();
      }
    }

    // 4. Check saturation thresholds
    for (const monitor of this.saturationManagers) {
      const events = monitor.update();
      this.lastEvents.push(...events);
    }

    this.totalEvents += this.lastEvents.length;
    this.lastStepMs = performance.now() - t0;
    return this.lastEvents;
  }

  /**
   * Transfer a field value from source solver to target solver.
   */
  private transferField(coupling: FieldCoupling): void {
    const sourceEntry = this.solvers.get(coupling.source.solver);
    const targetEntry = this.solvers.get(coupling.target.solver);
    if (!sourceEntry || !targetEntry) return;

    const sourceField = this.getField(sourceEntry, coupling.source.field);
    if (!sourceField) return;

    // Apply transform and write to target
    // For grid-to-grid coupling, we transform cell-by-cell
    if (sourceField instanceof RegularGrid3D) {
      const targetGrid = this.getField(targetEntry, coupling.target.field);
      if (targetGrid instanceof RegularGrid3D) {
        const d = sourceField.data;
        const td = targetGrid.data;
        if (d.length !== td.length) {
          console.warn(
            `CouplingManager: grid size mismatch in coupling ${coupling.source.solver}.${coupling.source.field} → ${coupling.target.solver}.${coupling.target.field} (${d.length} vs ${td.length})`
          );
        }
        const len = Math.min(d.length, td.length);
        for (let i = 0; i < len; i++) {
          td[i] = coupling.transform(d[i]);
        }
      }
    } else if (sourceField instanceof Float32Array) {
      const targetArray = this.getField(targetEntry, coupling.target.field);
      if (targetArray instanceof Float32Array) {
        if (sourceField.length !== targetArray.length) {
          console.warn(
            `CouplingManager: array size mismatch in coupling ${coupling.source.solver}.${coupling.source.field} → ${coupling.target.solver}.${coupling.target.field} (${sourceField.length} vs ${targetArray.length})`
          );
        }
        const len = Math.min(sourceField.length, targetArray.length);
        for (let i = 0; i < len; i++) {
          targetArray[i] = coupling.transform(sourceField[i]);
        }
      }
    }
  }

  /**
   * Get a named field from a solver.
   */
  private getField(
    entry: SolverEntry,
    fieldName: string
  ): RegularGrid3D | Float32Array | null {
    switch (entry.type) {
      case 'thermal': {
        const solver = entry.solver as ThermalSolver;
        if (fieldName === 'temperature') return solver.getTemperatureGrid();
        if (fieldName === 'temperature_flat') return solver.getTemperatureField();
        return null;
      }
      case 'structural': {
        const solver = entry.solver as StructuralSolver;
        if (fieldName === 'von_mises_stress') return solver.getVonMisesStress();
        if (fieldName === 'safety_factor') return solver.getSafetyFactor();
        if (fieldName === 'displacements') return solver.getDisplacements();
        return null;
      }
      case 'hydraulic': {
        const solver = entry.solver as HydraulicSolver;
        if (fieldName === 'pressure') return solver.getPressureField();
        if (fieldName === 'flow_rates') return solver.getFlowRates();
        return null;
      }
      default:
        return null;
    }
  }

  /** Get events from the last step */
  getLastEvents(): SaturationEvent[] {
    return this.lastEvents;
  }

  /** Enable/disable a coupling by index */
  setCouplingEnabled(index: number, enabled: boolean): void {
    if (this.couplings[index]) {
      this.couplings[index].enabled = enabled;
    }
  }

  getStats(): CouplingStats {
    return {
      solverCount: this.solvers.size,
      couplingCount: this.couplings.length,
      saturationMonitors: this.saturationManagers.length,
      totalEvents: this.totalEvents,
      lastStepMs: this.lastStepMs,
    };
  }

  dispose(): void {
    for (const [, entry] of this.solvers) {
      entry.solver.dispose();
    }
    for (const monitor of this.saturationManagers) {
      monitor.dispose();
    }
    this.solvers.clear();
    this.couplings = [];
    this.saturationManagers = [];
  }
}
