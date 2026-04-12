/**
 * CouplingManagerV2 — Generic multi-physics solver orchestration.
 *
 * Replaces the original CouplingManager's hard-coded solver types with the
 * generic SimSolver interface. Any solver that implements SimSolver can
 * participate in multi-physics coupling without modifying this file.
 *
 * ## Design Changes from V1
 *
 * - Solvers registered as `SimSolver` (not typed unions)
 * - `getField()` delegated to `solver.getField(name)` (no switch statements)
 * - `step()` is async (supports TET10's async GPU solve)
 * - Field transfer works on any FieldData (RegularGrid3D, Float32Array, Float64Array)
 *
 * @see SimSolver — generic solver interface
 * @see SolverAdapters — wrappers for built-in solvers
 */

import { RegularGrid3D } from './RegularGrid3D';
import type { SimSolver, FieldData } from './SimSolver';
import { SaturationManager, type SaturationEvent } from './SaturationManager';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface FieldCouplingV2 {
  source: { solver: string; field: string };
  target: { solver: string; field: string };
  transform: (value: number) => number;
  enabled?: boolean;
}

export interface CouplingStatsV2 {
  solverCount: number;
  couplingCount: number;
  saturationMonitors: number;
  totalEvents: number;
  lastStepMs: number;
}

// ── Manager ───────────────────────────────────────────────────────────────────

export class CouplingManagerV2 {
  private solvers: Map<string, SimSolver> = new Map();
  private couplings: FieldCouplingV2[] = [];
  private saturationManagers: SaturationManager[] = [];
  private lastEvents: SaturationEvent[] = [];
  private totalEvents = 0;
  private lastStepMs = 0;

  /** Register a solver with a unique name. */
  registerSolver(name: string, solver: SimSolver): void {
    this.solvers.set(name, solver);
  }

  /** Add a field coupling between two solvers. */
  addCoupling(coupling: FieldCouplingV2): void {
    this.couplings.push({ enabled: true, ...coupling });
  }

  /** Add a saturation monitor. */
  addSaturationMonitor(monitor: SaturationManager): void {
    this.saturationManagers.push(monitor);
  }

  /**
   * Step all solvers, transfer coupled fields, check saturation.
   *
   * Order:
   * 1. Step transient solvers (e.g., thermal)
   * 2. Transfer coupled fields
   * 3. Solve steady-state solvers (e.g., structural, hydraulic)
   * 4. Check saturation thresholds
   */
  async step(dt: number): Promise<SaturationEvent[]> {
    const t0 = performance.now();
    this.lastEvents = [];

    // 1. Step transient solvers
    for (const [, solver] of this.solvers) {
      if (solver.mode === 'transient') {
        await solver.step(dt);
      }
    }

    // 2. Transfer coupled fields
    for (const coupling of this.couplings) {
      if (coupling.enabled === false) continue;
      this.transferField(coupling);
    }

    // 3. Solve steady-state solvers
    for (const [, solver] of this.solvers) {
      if (solver.mode === 'steady-state') {
        await solver.solve();
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

  /** Transfer a field value from source solver to target solver. */
  private transferField(coupling: FieldCouplingV2): void {
    const sourceSolver = this.solvers.get(coupling.source.solver);
    const targetSolver = this.solvers.get(coupling.target.solver);
    if (!sourceSolver || !targetSolver) return;

    const sourceField = sourceSolver.getField(coupling.source.field);
    const targetField = targetSolver.getField(coupling.target.field);
    if (!sourceField || !targetField) return;

    // Grid-to-grid transfer
    if (sourceField instanceof RegularGrid3D && targetField instanceof RegularGrid3D) {
      const sd = sourceField.data;
      const td = targetField.data;
      const len = Math.min(sd.length, td.length);
      for (let i = 0; i < len; i++) {
        td[i] = coupling.transform(sd[i]);
      }
      return;
    }

    // Array-to-array transfer
    if (isTypedArray(sourceField) && isTypedArray(targetField)) {
      const len = Math.min(sourceField.length, targetField.length);
      for (let i = 0; i < len; i++) {
        (targetField as Float32Array)[i] = coupling.transform(sourceField[i]);
      }
    }
  }

  getLastEvents(): SaturationEvent[] {
    return this.lastEvents;
  }

  setCouplingEnabled(index: number, enabled: boolean): void {
    if (this.couplings[index]) {
      this.couplings[index].enabled = enabled;
    }
  }

  getStats(): CouplingStatsV2 {
    return {
      solverCount: this.solvers.size,
      couplingCount: this.couplings.length,
      saturationMonitors: this.saturationManagers.length,
      totalEvents: this.totalEvents,
      lastStepMs: this.lastStepMs,
    };
  }

  dispose(): void {
    for (const [, solver] of this.solvers) {
      solver.dispose();
    }
    for (const monitor of this.saturationManagers) {
      monitor.dispose();
    }
    this.solvers.clear();
    this.couplings = [];
    this.saturationManagers = [];
  }
}

function isTypedArray(v: FieldData): v is Float32Array | Float64Array {
  return v instanceof Float32Array || v instanceof Float64Array;
}
