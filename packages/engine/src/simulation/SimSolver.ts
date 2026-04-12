/**
 * SimSolver — Generic solver interface for domain-extensible simulation.
 *
 * All simulation solvers (thermal, structural, hydraulic, EM, CFD, etc.)
 * implement this interface. CouplingManager and ExperimentOrchestrator
 * operate on SimSolver without knowing the concrete solver type.
 *
 * ## Design
 *
 * - `mode` distinguishes transient solvers (step per frame) from steady-state (solve once)
 * - `fieldNames` enumerates available output fields for polymorphic access
 * - `getField(name)` returns typed arrays or grids without type-casting
 * - Adapters wrap existing solvers (ThermalSolver, etc.) without modifying them
 *
 * @see SolverAdapters — adapter implementations for built-in solvers
 * @see CouplingManager — multi-physics orchestrator consuming SimSolver
 * @see ExperimentOrchestrator — parameter sweep engine consuming SimSolver
 */

import type { RegularGrid3D } from './RegularGrid3D';

export type SolverMode = 'transient' | 'steady-state';

export type FieldData = RegularGrid3D | Float32Array | Float64Array;

export interface SimSolver {
  /** Whether this solver advances in time (transient) or solves once (steady-state) */
  readonly mode: SolverMode;

  /** Names of output fields available via getField() */
  readonly fieldNames: readonly string[];

  /** Advance a transient solver by dt seconds. No-op for steady-state solvers. */
  step(dt: number): void | Promise<void>;

  /** Solve a steady-state system. No-op for transient solvers (use step instead). */
  solve(): void | Promise<void>;

  /** Retrieve a named output field. Returns null if the field doesn't exist. */
  getField(name: string): FieldData | null;

  /** Solver statistics (convergence, timing, element counts, etc.) */
  getStats(): Record<string, unknown>;

  /** Release all resources. */
  dispose(): void;
}
