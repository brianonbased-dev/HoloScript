/**
 * Pipeline Orchestrator — Sequences layer execution and manages feedback loops.
 *
 * Data flow:   L0 → feedback → L1 → feedback → L2
 * Control:     L2 → strategy → L1 → focus/profile → L0 → code
 *
 * Human review gates block layer execution until approved/rejected.
 * Budget gates prevent execution when estimated cost exceeds remaining budget.
 */

import { AgentEventBus } from '../agentEventBus';
import type {
  LayerId,
  LayerConfig,
  LayerCycleResult,
  PipelineMode,
  FeedbackSignal,
  L1Output,
  L2Output,
  LayerBudget,
} from './types';
import { generateFeedbackSignals, countConsecutivePlateaus } from './feedbackEngine';
import {
  executeLayer0,
  executeLayer1,
  executeLayer2,
  type L0ExecutorDeps,
  type LLMProvider,
} from './layerExecutors';

// ─── Constants ───────────────────────────────────────────────────────────────

/** Global budget cap across all layers (USD) */
const GLOBAL_BUDGET_CAP = 10.00;

/** Minimum L0 cycles before L1 activates */
const L1_ACTIVATION_THRESHOLD = 2;

/** Minimum L1 cycles before L2 activates */
const L2_ACTIVATION_THRESHOLD = 2;

/** Poll interval for review gate (ms) */
const REVIEW_POLL_INTERVAL = 2000;

/** Cost estimation multiplier (1.5x historical avg, matches W.131 pattern) */
const COST_ESTIMATE_MULTIPLIER = 1.5;

/** Fallback cost estimate when no history available */
const FALLBACK_COST_ESTIMATE = 1.50;

// ─── Store Interface ─────────────────────────────────────────────────────────

/**
 * Minimal store interface for the orchestrator.
 * Decoupled from Zustand for testability.
 */
export interface PipelineStoreAdapter {
  getLayerConfig: (layerId: LayerId) => LayerConfig;
  getLayerHistory: (layerId: LayerId) => LayerCycleResult[];
  getLayerFeedbackBuffer: (layerId: LayerId) => FeedbackSignal[];
  getLayerStatus: (layerId: LayerId) => string;
  getTotalCost: () => number;

  updateLayerStatus: (layerId: LayerId, status: string) => void;
  setLayerCycleId: (layerId: LayerId, cycleId: string | null) => void;
  recordCycleResult: (result: LayerCycleResult) => void;
  pushFeedback: (signal: FeedbackSignal) => void;
  pushGlobalFeedback: (signal: FeedbackSignal) => void;
  consumeFeedback: (layerId: LayerId) => FeedbackSignal[];
  updateLayerConfig: (layerId: LayerId, patch: Partial<LayerConfig>) => void;
  stopPipeline: () => void;
}

// ─── Orchestrator ────────────────────────────────────────────────────────────

export class PipelineOrchestrator {
  private eventBus: AgentEventBus;
  private store: PipelineStoreAdapter;
  private l0Deps: L0ExecutorDeps;
  private llmProvider: LLMProvider;
  private abortController: AbortController | null = null;

  constructor(
    store: PipelineStoreAdapter,
    l0Deps: L0ExecutorDeps,
    llmProvider: LLMProvider,
  ) {
    this.eventBus = new AgentEventBus();
    this.store = store;
    this.l0Deps = l0Deps;
    this.llmProvider = llmProvider;
  }

  /**
   * Run the full pipeline. In 'single' mode, runs one L0→L1→L2 pass.
   * In 'continuous' mode, loops until budget exhausted or stopped.
   * In 'self-target' mode, targets HoloScript's own codebase.
   */
  async runPipeline(mode: PipelineMode, targetProject: string): Promise<void> {
    this.abortController = new AbortController();

    this.eventBus.publish('pipeline:started', { mode, targetProject }, 'orchestrator');

    try {
      do {
        if (this.abortController.signal.aborted) break;

        // ── Phase 1: Run L0 ──────────────────────────────────
        const l0Config = this.store.getLayerConfig(0);
        if (l0Config.enabled && this.checkBudgetGate(0)) {
          const l0Feedback = this.store.consumeFeedback(0);
          this.store.updateLayerStatus(0, 'running');

          const l0Result = await executeLayer0(
            l0Config,
            targetProject === 'self-target' ? 'self' : targetProject,
            l0Feedback,
            this.eventBus,
            this.l0Deps,
          );

          this.store.recordCycleResult(l0Result);
          this.emitFeedbackSignals(l0Result);
        }

        if (this.abortController.signal.aborted) break;

        // ── Phase 2: Run L1 if ready ─────────────────────────
        const l1Config = this.store.getLayerConfig(1);
        const l0CycleCount = this.store.getLayerHistory(0).length;

        if (
          l1Config.enabled &&
          l0CycleCount >= L1_ACTIVATION_THRESHOLD &&
          this.checkBudgetGate(1)
        ) {
          // Human review gate
          if (l1Config.requiresHumanReview) {
            this.store.updateLayerStatus(1, 'awaiting_review');
            this.eventBus.publish('pipeline:review_requested', { layerId: 1 }, 'orchestrator');

            const approved = await this.waitForReview(1);
            if (!approved) {
              this.store.updateLayerStatus(1, 'idle');
              continue;
            }
          }

          const l1Feedback = this.store.consumeFeedback(1);
          this.store.updateLayerStatus(1, 'running');

          const l1Result = await executeLayer1(
            l1Config,
            l1Feedback,
            this.eventBus,
            this.llmProvider,
          );

          this.store.recordCycleResult(l1Result);
          this.emitFeedbackSignals(l1Result);

          // Apply L1's strategy adjustments to L0's config
          if (l1Result.output.kind === 'strategy_adjustment') {
            this.applyStrategyAdjustment(l1Result.output as L1Output);
          }
        }

        if (this.abortController.signal.aborted) break;

        // ── Phase 3: Run L2 if ready ─────────────────────────
        const l2Config = this.store.getLayerConfig(2);
        const l1CycleCount = this.store.getLayerHistory(1).length;

        if (
          l2Config.enabled &&
          l1CycleCount >= L2_ACTIVATION_THRESHOLD &&
          this.checkBudgetGate(2)
        ) {
          // L2 always requires human review
          this.store.updateLayerStatus(2, 'awaiting_review');
          this.eventBus.publish('pipeline:review_requested', { layerId: 2 }, 'orchestrator');

          const approved = await this.waitForReview(2);
          if (!approved) {
            this.store.updateLayerStatus(2, 'idle');
            continue;
          }

          const l2Feedback = this.store.consumeFeedback(2);
          const l1History = this.store.getLayerHistory(1);
          this.store.updateLayerStatus(2, 'running');

          const l2Result = await executeLayer2(
            l2Config,
            l2Feedback,
            l1History,
            this.eventBus,
            this.llmProvider,
          );

          this.store.recordCycleResult(l2Result);
          this.emitFeedbackSignals(l2Result);

          // Install generated skills
          if (l2Result.output.kind === 'evolution') {
            const l2Output = l2Result.output as L2Output;
            if (l2Output.newSkills.length > 0) {
              await this.installGeneratedSkills(l2Output);
            }
          }
        }

        // Check global budget
        if (this.store.getTotalCost() >= GLOBAL_BUDGET_CAP) {
          this.eventBus.publish('pipeline:budget_exhausted', {
            totalCost: this.store.getTotalCost(),
          }, 'orchestrator');
          break;
        }
      } while (mode === 'continuous' && !this.abortController.signal.aborted);

      this.eventBus.publish('pipeline:completed', {
        totalCost: this.store.getTotalCost(),
      }, 'orchestrator');
    } finally {
      this.store.stopPipeline();
      this.eventBus.reset();
      this.abortController = null;
    }
  }

  /** Stop the pipeline gracefully */
  stop(): void {
    this.abortController?.abort();
  }

  /** Get the event bus for external subscribers */
  getEventBus(): AgentEventBus {
    return this.eventBus;
  }

  // ─── Private Helpers ─────────────────────────────────────────────────────

  /**
   * Emit feedback signals from a cycle result.
   * Signals are routed to the layer above and stored globally.
   */
  private emitFeedbackSignals(result: LayerCycleResult): void {
    const signals = generateFeedbackSignals(result);
    for (const signal of signals) {
      this.store.pushFeedback(signal);
      this.store.pushGlobalFeedback(signal);
    }
  }

  /**
   * Check if a layer has budget remaining for another cycle.
   * Uses 1.5x historical average as cost estimate (W.131 pattern).
   */
  private checkBudgetGate(layerId: LayerId): boolean {
    const config = this.store.getLayerConfig(layerId);
    const history = this.store.getLayerHistory(layerId);

    // Check cycle count limit
    if (history.length >= config.budget.maxCycles) return false;

    // Estimate next cycle cost
    const avgCost = history.length > 0
      ? history.reduce((sum, r) => sum + r.costUSD, 0) / history.length
      : FALLBACK_COST_ESTIMATE;
    const estimatedCost = avgCost * COST_ESTIMATE_MULTIPLIER;

    // Check layer budget
    const layerSpent = history.reduce((sum, r) => sum + r.costUSD, 0);
    if (layerSpent + estimatedCost > config.budget.maxCostUSD) {
      this.eventBus.publish('pipeline:budget_warning', {
        layerId,
        spent: layerSpent,
        limit: config.budget.maxCostUSD,
        estimated: estimatedCost,
      }, 'orchestrator');
      return false;
    }

    // Check global budget
    if (this.store.getTotalCost() + estimatedCost > GLOBAL_BUDGET_CAP) return false;

    return true;
  }

  /**
   * Wait for human review approval on a layer.
   * Polls the store until the status changes from 'awaiting_review'.
   * Returns true if approved, false if rejected or aborted.
   */
  private async waitForReview(layerId: LayerId): Promise<boolean> {
    return new Promise((resolve) => {
      const check = () => {
        if (this.abortController?.signal.aborted) {
          resolve(false);
          return;
        }

        const status = this.store.getLayerStatus(layerId);
        if (status === 'scheduled') {
          resolve(true);
        } else if (status === 'idle' || status === 'failed') {
          resolve(false);
        } else {
          setTimeout(check, REVIEW_POLL_INTERVAL);
        }
      };
      check();
    });
  }

  /**
   * Apply L1's strategy adjustments to L0's configuration.
   */
  private applyStrategyAdjustment(output: L1Output): void {
    const currentConfig = this.store.getLayerConfig(0);
    const patch: Partial<LayerConfig> = {};

    if (output.budgetAdjustment) {
      patch.budget = {
        ...currentConfig.budget,
        ...output.budgetAdjustment,
      } as LayerBudget;
    }

    if (Object.keys(patch).length > 0) {
      this.store.updateLayerConfig(0, patch);
    }

    // Emit event so UI can show the strategy change
    this.eventBus.publish('pipeline:strategy_applied', {
      layerId: 0,
      adjustment: output,
    }, 'orchestrator');
  }

  /**
   * Install skills generated by L2 via the HoloClaw API.
   */
  private async installGeneratedSkills(output: L2Output): Promise<void> {
    for (const skill of output.newSkills) {
      try {
        const response = await fetch('/api/holoclaw', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            name: skill.name,
            content: skill.content,
          }),
        });

        if (response.ok) {
          this.eventBus.publish('pipeline:skill_installed', {
            name: skill.name,
            description: skill.description,
            confidence: skill.confidence,
          }, 'layer-2');
        }
      } catch {
        // Skill installation failure is non-fatal
        this.eventBus.publish('pipeline:skill_install_failed', {
          name: skill.name,
        }, 'layer-2');
      }
    }
  }
}
