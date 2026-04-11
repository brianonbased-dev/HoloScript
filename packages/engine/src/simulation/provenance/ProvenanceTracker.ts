/**
 * ProvenanceTracker — Wraps solver execution with automatic provenance capture.
 *
 * Records every simulation run as an immutable SimulationRun record.
 * Supports replay verification (run twice, compare results for determinism).
 */

import {
  createSimulationRun,
  compareRuns,
  type SimulationRun,
  type SimulationRunConfig,
  type SimulationRunResult,
  type RunComparison,
} from './SimulationRun';

// ── Tracker ──────────────────────────────────────────────────────────────────

export class ProvenanceTracker {
  private runs: SimulationRun[] = [];
  private softwareVersion: string;
  private commitHash?: string;

  constructor(softwareVersion: string, commitHash?: string) {
    this.softwareVersion = softwareVersion;
    this.commitHash = commitHash;
  }

  /**
   * Track a solver execution. Wraps the solver call with timing
   * and produces a SimulationRun record.
   *
   * @param config   Solver configuration
   * @param execute  Function that runs the solver and returns results
   * @returns The SimulationRun record
   */
  track(
    config: SimulationRunConfig,
    execute: () => SimulationRunResult
  ): SimulationRun {
    const t0 = performance.now();
    const result = execute();
    const wallTimeMs = performance.now() - t0;

    const run = createSimulationRun(
      config,
      { ...result, wallTimeMs },
      this.softwareVersion,
      this.commitHash
    );

    this.runs.push(run);
    return run;
  }

  /**
   * Get all recorded runs.
   */
  getRuns(): readonly SimulationRun[] {
    return this.runs;
  }

  /**
   * Get the most recent run.
   */
  getLastRun(): SimulationRun | undefined {
    return this.runs[this.runs.length - 1];
  }

  /**
   * Compare the two most recent runs for determinism verification.
   */
  compareLast(tolerance?: number): RunComparison | undefined {
    if (this.runs.length < 2) return undefined;
    return compareRuns(
      this.runs[this.runs.length - 2],
      this.runs[this.runs.length - 1],
      tolerance
    );
  }

  /**
   * Verify determinism: run the same solver twice and compare results.
   * Returns true if both runs produce identical results within tolerance.
   */
  verifyDeterminism(
    config: SimulationRunConfig,
    execute: () => SimulationRunResult,
    tolerance = 0
  ): { deterministic: boolean; comparison: RunComparison } {
    this.track(config, execute);
    this.track(config, execute);
    const comparison = this.compareLast(tolerance)!;
    return {
      deterministic: comparison.configMatch && comparison.resultMatch,
      comparison,
    };
  }

  /**
   * Clear all recorded runs.
   */
  clear(): void {
    this.runs = [];
  }

  /**
   * Export all runs as JSON (for archival).
   */
  exportJSON(): string {
    return JSON.stringify(
      this.runs.map(r => r.metadata),
      null,
      2
    );
  }
}
