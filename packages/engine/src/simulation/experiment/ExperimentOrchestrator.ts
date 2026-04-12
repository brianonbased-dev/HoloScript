/**
 * ExperimentOrchestrator — Parameter sweep engine for simulation experiments.
 *
 * Takes a base config + parameter ranges, generates variants via ParameterSpace,
 * runs each through a solver, and tracks all runs via ProvenanceTracker.
 *
 * @see ParameterSpace — generates config variants
 * @see ResultsAnalyzer — post-processes sweep results
 */

import { ParameterSpace, applyOverrides, type ParameterRange, type ParameterSample } from './ParameterSpace';
import { ProvenanceTracker, type SimulationRun } from '../provenance/index';

// ── Types ────────────────────────────────────────────────────────────────────

export interface ExperimentConfig {
  /** Human-readable experiment name */
  name: string;
  /** Base solver config (overrides are merged into this) */
  baseConfig: Record<string, unknown>;
  /** Solver type identifier (registered in SolverFactoryRegistry) */
  solverType: string;
  /** Parameter ranges to sweep */
  parameters: ParameterRange[];
  /** Sampling strategy */
  sampling: 'grid' | 'lhs';
  /** Number of samples for LHS (ignored for grid) */
  sampleCount?: number;
  /** Max concurrent solver runs (default: 1 — sequential) */
  concurrency?: number;
  /** Field name to extract as the primary result (e.g., "maxVonMises") */
  objectiveField?: string;
  /** Progress callback */
  onProgress?: (completed: number, total: number) => void;
}

export interface ExperimentRunResult {
  /** Parameter overrides for this run */
  sample: ParameterSample;
  /** Solver stats */
  stats: Record<string, unknown>;
  /** Whether the solver converged */
  converged: boolean;
  /** Extracted objective value (if objectiveField specified) */
  objectiveValue?: number;
  /** Run timing in ms */
  timeMs: number;
}

export interface ExperimentResult {
  /** Experiment name */
  name: string;
  /** Total runs completed */
  totalRuns: number;
  /** Individual run results */
  runs: ExperimentRunResult[];
  /** Total wall-clock time */
  totalTimeMs: number;
}

// ── Orchestrator ─────────────────────────────────────────────────────────────

export class ExperimentOrchestrator {
  private tracker: ProvenanceTracker;
  private solverFactory: (type: string, config: Record<string, unknown>) => SolverHandle;

  /**
   * @param solverFactory — Creates a solver from type + config, returns a handle
   *   with solve() and getStats(). This decouples the orchestrator from specific
   *   solver implementations.
   * @param tracker — ProvenanceTracker for recording run metadata
   */
  constructor(
    solverFactory: (type: string, config: Record<string, unknown>) => SolverHandle,
    tracker?: ProvenanceTracker,
  ) {
    this.solverFactory = solverFactory;
    this.tracker = tracker ?? new ProvenanceTracker();
  }

  /**
   * Run a full parameter sweep experiment.
   */
  async run(config: ExperimentConfig): Promise<ExperimentResult> {
    const t0 = performance.now();

    // Generate samples
    const space = new ParameterSpace(config.parameters);
    const samples = config.sampling === 'grid'
      ? space.gridSearch()
      : space.latinHypercube(config.sampleCount ?? 10);

    const runs: ExperimentRunResult[] = [];
    const concurrency = config.concurrency ?? 1;

    // Run samples (sequential or batched)
    for (let i = 0; i < samples.length; i += concurrency) {
      const batch = samples.slice(i, i + concurrency);
      const batchResults = await Promise.all(
        batch.map((sample) => this.runSingle(config, sample)),
      );
      runs.push(...batchResults);
      config.onProgress?.(runs.length, samples.length);
    }

    return {
      name: config.name,
      totalRuns: runs.length,
      runs,
      totalTimeMs: performance.now() - t0,
    };
  }

  private async runSingle(
    config: ExperimentConfig,
    sample: ParameterSample,
  ): Promise<ExperimentRunResult> {
    const mergedConfig = applyOverrides(config.baseConfig, sample.overrides);
    const t0 = performance.now();

    const solver = this.solverFactory(config.solverType, mergedConfig);

    try {
      await solver.solve();
      const stats = solver.getStats();
      const converged = (stats.converged as boolean) ?? (stats.solveResult as Record<string, unknown>)?.converged ?? true;

      let objectiveValue: number | undefined;
      if (config.objectiveField && typeof stats[config.objectiveField] === 'number') {
        objectiveValue = stats[config.objectiveField] as number;
      }

      return {
        sample,
        stats,
        converged: !!converged,
        objectiveValue,
        timeMs: performance.now() - t0,
      };
    } finally {
      solver.dispose();
    }
  }

  /** Access the underlying ProvenanceTracker for run history. */
  getTracker(): ProvenanceTracker {
    return this.tracker;
  }
}

// ── Solver Handle ────────────────────────────────────────────────────────────

/**
 * Minimal handle returned by the solver factory.
 * Matches the common methods of all HoloScript solvers.
 */
export interface SolverHandle {
  solve(): void | Promise<void>;
  getStats(): Record<string, unknown>;
  dispose(): void;
}
