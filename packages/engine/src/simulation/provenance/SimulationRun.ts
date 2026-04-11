/**
 * SimulationRun — Immutable record of a simulation execution.
 *
 * Captures everything needed to reproduce a simulation run:
 * solver config, mesh description, material properties, BCs,
 * convergence settings, result summary, and provenance metadata.
 *
 * Combined with the solver code at the recorded commit hash,
 * this record should be sufficient for exact reproduction.
 */

import { createMetadata, type SimulationMetadata } from '../export/MetadataSchema';

// ── Types ────────────────────────────────────────────────────────────────────

export interface SimulationRunConfig {
  /** Solver type identifier */
  solverType: 'thermal' | 'structural' | 'hydraulic' | 'coupled';

  /** Complete solver configuration (JSON-serializable) */
  solverConfig: Record<string, unknown>;

  /** Mesh/grid description */
  mesh: {
    type: 'regular_grid' | 'tetrahedral' | 'pipe_network';
    dimensions: Record<string, number>;
  };

  /** Material names and their resolved properties */
  materials: { name: string; properties: Record<string, number>; source?: string }[];

  /** Primary result field name */
  resultFieldName: string;
}

export interface SimulationRunResult {
  /** Whether the solver converged */
  converged: boolean;
  /** Number of iterations (for iterative solvers) */
  iterations: number;
  /** Final residual norm */
  finalResidual: number;
  /** Summary statistics of the primary field */
  min: number;
  max: number;
  avg: number;
  /** Wall-clock time in milliseconds */
  wallTimeMs: number;
}

export interface SimulationRun {
  /** Full metadata record (includes runId, timestamp, software version) */
  metadata: SimulationMetadata;
  /** Raw result data (optional — can be large) */
  resultData?: Float32Array;
}

// ── Factory ──────────────────────────────────────────────────────────────────

/**
 * Create an immutable SimulationRun record from config and results.
 *
 * @param config  Solver configuration and mesh description
 * @param result  Solver output summary
 * @param softwareVersion  HoloScript version string
 * @param commitHash  Git commit hash (optional)
 */
export function createSimulationRun(
  config: SimulationRunConfig,
  result: SimulationRunResult,
  softwareVersion: string,
  commitHash?: string
): SimulationRun {
  const metadata = createMetadata({
    software: {
      name: 'HoloScript',
      version: softwareVersion,
      commitHash,
    },
    solver: {
      type: config.solverType,
      config: config.solverConfig,
    },
    mesh: config.mesh,
    materials: config.materials,
    convergence: {
      converged: result.converged,
      iterations: result.iterations,
      finalResidual: result.finalResidual,
    },
    resultSummary: {
      fieldName: config.resultFieldName,
      min: result.min,
      max: result.max,
      avg: result.avg,
    },
    deterministic: true,
    notes: `Wall time: ${result.wallTimeMs.toFixed(1)}ms`,
  });

  return Object.freeze({ metadata });
}

// ── Comparison ───────────────────────────────────────────────────────────────

export interface RunComparison {
  /** Whether the configurations are identical */
  configMatch: boolean;
  /** List of configuration differences */
  configDiffs: string[];
  /** Whether the results are within tolerance */
  resultMatch: boolean;
  /** Relative differences in result summary fields */
  resultDiffs: { field: string; run1: number; run2: number; relDiff: number }[];
}

/**
 * Compare two simulation runs to identify differences.
 *
 * @param run1  First simulation run
 * @param run2  Second simulation run
 * @param tolerance  Relative tolerance for result comparison (default 1e-6)
 */
export function compareRuns(
  run1: SimulationRun,
  run2: SimulationRun,
  tolerance = 1e-6
): RunComparison {
  const configDiffs: string[] = [];

  // Compare solver type
  if (run1.metadata.solver.type !== run2.metadata.solver.type) {
    configDiffs.push(`solver.type: ${run1.metadata.solver.type} vs ${run2.metadata.solver.type}`);
  }

  // Compare solver config (deep comparison via JSON)
  const config1 = JSON.stringify(run1.metadata.solver.config);
  const config2 = JSON.stringify(run2.metadata.solver.config);
  if (config1 !== config2) {
    configDiffs.push('solver.config differs');
  }

  // Compare mesh
  const mesh1 = JSON.stringify(run1.metadata.mesh);
  const mesh2 = JSON.stringify(run2.metadata.mesh);
  if (mesh1 !== mesh2) {
    configDiffs.push('mesh differs');
  }

  // Compare results
  const resultDiffs: RunComparison['resultDiffs'] = [];
  const fields = ['min', 'max', 'avg'] as const;
  for (const field of fields) {
    const v1 = run1.metadata.resultSummary[field];
    const v2 = run2.metadata.resultSummary[field];
    const denom = Math.max(Math.abs(v1), Math.abs(v2), 1e-30);
    const relDiff = Math.abs(v1 - v2) / denom;
    if (relDiff > tolerance) {
      resultDiffs.push({ field, run1: v1, run2: v2, relDiff });
    }
  }

  return {
    configMatch: configDiffs.length === 0,
    configDiffs,
    resultMatch: resultDiffs.length === 0,
    resultDiffs,
  };
}
