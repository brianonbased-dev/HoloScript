/**
 * A/B experiment tracker for Moltbook engagement strategies.
 *
 * Allows defining experiments with variant configs, recording per-session
 * results, and evaluating which variant performs better by karma/action ratio.
 *
 * Storage: serializable to JSON for JSONB column persistence (no DB migration).
 */

import type { EngagementConfig } from './types';

export type ExperimentStatus = 'active' | 'completed' | 'paused';

export interface ExperimentVariant {
  name: string;
  /** Partial EngagementConfig overrides for this variant */
  config: Partial<EngagementConfig>;
  /** Number of sessions assigned to this variant */
  sessionCount: number;
  /** Total karma delta across all sessions */
  totalKarmaDelta: number;
  /** Total actions across all sessions */
  totalActions: number;
  /** Derived: karma per action (computed, not stored) */
  karmaPerAction?: number;
}

export interface Experiment {
  id: string;
  name: string;
  hypothesis: string;
  status: ExperimentStatus;
  variants: ExperimentVariant[];
  /** Which variant is currently active */
  activeVariantIndex: number;
  createdAt: number;
  updatedAt: number;
  /** Min sessions per variant before evaluation */
  minSessionsPerVariant: number;
}

export interface ExperimentResult {
  experimentId: string;
  experimentName: string;
  winner: string | null;
  variants: Array<{
    name: string;
    sessions: number;
    avgKarmaPerAction: number;
    totalKarmaDelta: number;
  }>;
  confidence: 'low' | 'medium' | 'high';
}

export class ExperimentTracker {
  private experiments: Map<string, Experiment> = new Map();

  /**
   * Create a new A/B experiment.
   */
  createExperiment(
    name: string,
    hypothesis: string,
    variants: Array<{ name: string; config: Partial<EngagementConfig> }>,
    minSessionsPerVariant = 3,
  ): Experiment {
    const id = `exp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const experiment: Experiment = {
      id,
      name,
      hypothesis,
      status: 'active',
      variants: variants.map((v) => ({
        ...v,
        sessionCount: 0,
        totalKarmaDelta: 0,
        totalActions: 0,
      })),
      activeVariantIndex: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      minSessionsPerVariant,
    };

    this.experiments.set(id, experiment);
    return experiment;
  }

  /**
   * Get the config overrides for the currently active variant of an experiment.
   * Returns null if experiment not found or not active.
   */
  getActiveVariantConfig(experimentId: string): Partial<EngagementConfig> | null {
    const exp = this.experiments.get(experimentId);
    if (!exp || exp.status !== 'active') return null;
    return exp.variants[exp.activeVariantIndex]?.config ?? null;
  }

  /**
   * Record a session result for the active variant.
   * After recording, rotates to the next variant (round-robin).
   */
  recordSessionResult(
    experimentId: string,
    karmaDelta: number,
    totalActions: number,
  ): void {
    const exp = this.experiments.get(experimentId);
    if (!exp || exp.status !== 'active') return;

    const variant = exp.variants[exp.activeVariantIndex];
    variant.sessionCount++;
    variant.totalKarmaDelta += karmaDelta;
    variant.totalActions += totalActions;

    // Rotate to next variant
    exp.activeVariantIndex = (exp.activeVariantIndex + 1) % exp.variants.length;
    exp.updatedAt = Date.now();

    // Auto-complete if all variants have enough sessions
    const allReady = exp.variants.every((v) => v.sessionCount >= exp.minSessionsPerVariant);
    if (allReady) {
      exp.status = 'completed';
    }
  }

  /**
   * Evaluate an experiment's results.
   */
  evaluate(experimentId: string): ExperimentResult | null {
    const exp = this.experiments.get(experimentId);
    if (!exp) return null;

    const variantResults = exp.variants.map((v) => ({
      name: v.name,
      sessions: v.sessionCount,
      avgKarmaPerAction: v.totalActions > 0 ? v.totalKarmaDelta / v.totalActions : 0,
      totalKarmaDelta: v.totalKarmaDelta,
    }));

    // Determine winner
    const sorted = [...variantResults].sort((a, b) => b.avgKarmaPerAction - a.avgKarmaPerAction);
    const minSessions = Math.min(...variantResults.map((v) => v.sessions));

    let confidence: 'low' | 'medium' | 'high' = 'low';
    if (minSessions >= exp.minSessionsPerVariant) confidence = 'medium';
    if (minSessions >= exp.minSessionsPerVariant * 2) confidence = 'high';

    const winner =
      sorted.length >= 2 && sorted[0].avgKarmaPerAction > sorted[1].avgKarmaPerAction
        ? sorted[0].name
        : null;

    return {
      experimentId: exp.id,
      experimentName: exp.name,
      winner,
      variants: variantResults,
      confidence,
    };
  }

  /**
   * List all experiments.
   */
  listExperiments(): Experiment[] {
    return [...this.experiments.values()];
  }

  /**
   * Get a single experiment by ID.
   */
  getExperiment(id: string): Experiment | null {
    return this.experiments.get(id) ?? null;
  }

  /**
   * Pause or resume an experiment.
   */
  setStatus(experimentId: string, status: ExperimentStatus): void {
    const exp = this.experiments.get(experimentId);
    if (exp) {
      exp.status = status;
      exp.updatedAt = Date.now();
    }
  }

  /**
   * Restore state from persisted data.
   */
  restore(data: { experiments?: Experiment[] }): void {
    if (data.experiments) {
      this.experiments.clear();
      for (const exp of data.experiments) {
        this.experiments.set(exp.id, exp);
      }
    }
  }

  /**
   * Export state for persistence.
   */
  export(): { experiments: Experiment[] } {
    return { experiments: [...this.experiments.values()] };
  }
}
