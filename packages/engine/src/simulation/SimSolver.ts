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

// ── GPU-backed solver capability ─────────────────────────────────────────────

/**
 * GpuBackedSolver — optional capability mixin for SimSolver implementations
 * that execute their compute on the GPU (WebGPU/WGSL shaders).
 *
 * SimContract integration (paper-4 §5.2):
 *   After each `step()` or `asyncStep()`, the contract calls `readbackOutput()`
 *   to retrieve the post-step state as a CPU-side Float32Array, hashes it via
 *   `hashGpuOutput()`, and records it in `gpuOutputDigests`. This closes the
 *   gap between CPU-side contract verification and GPU-executed solvers.
 *
 * Implementers must guarantee:
 *   - `readbackOutput()` reads the most recently committed GPU output buffer.
 *   - The returned array has a stable length across steps for the same mesh.
 *   - Calling `readbackOutput()` before the first `step()` returns an
 *     all-zeros buffer of the correct length (initial state).
 */
export interface GpuBackedSolver extends SimSolver {
  /**
   * Read the GPU output buffer (post-step state) back to CPU memory.
   * Returns a flat Float32Array containing the interleaved field values
   * in the order specified by `fieldNames`.
   */
  readbackOutput(): Promise<Float32Array>;
}

/**
 * Type-guard: returns true when `s` exposes `readbackOutput`, indicating
 * it is a GPU-backed solver whose output can be verified by the contract.
 */
export function isGpuBackedSolver(s: SimSolver): s is GpuBackedSolver {
  return typeof (s as GpuBackedSolver).readbackOutput === 'function';
}
