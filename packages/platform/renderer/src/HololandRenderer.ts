/**
 * HololandRenderer
 *
 * Orchestrates AdaptiveFrameRateManager and QualityManager so that thermal
 * pressure automatically drives LOD reduction, feature shedding, and
 * Gaussian-budget downgrades.
 *
 * Since 2026-05-09: also wires render-inference separation so that ML
 * inference work (trait embedding, motion matching, etc.) is scheduled on a
 * dedicated priority queue with frame-deadline enforcement.
 */

import {
  AdaptiveFrameRateManager,
  type ThermalState,
} from './AdaptiveFrameRateManager';
import { QualityManager } from './QualityManager';
import {
  InferencePriorityScheduler,
  type InferenceTask,
  type InferenceResult,
  type InferenceMetrics,
} from './RenderInferenceSeparation';
import {
  VRPerformanceBudget,
  type FrameBudgetReport,
  type VRPerformanceBudgetOptions,
} from './VRPerformanceBudget';

export interface HololandRendererOptions {
  adaptiveFrameRate?: AdaptiveFrameRateManager;
  qualityManager?: QualityManager;
  inferenceScheduler?: InferencePriorityScheduler;
  performanceBudget?: VRPerformanceBudget;
}

export class HololandRenderer {
  readonly adaptive: AdaptiveFrameRateManager;
  readonly quality: QualityManager;
  readonly inference: InferencePriorityScheduler;
  readonly budget: VRPerformanceBudget;
  private unsubscribe: (() => void) | null = null;
  private disposed = false;

  constructor(options: HololandRendererOptions = {}) {
    this.adaptive = options.adaptiveFrameRate ?? new AdaptiveFrameRateManager();
    this.quality = options.qualityManager ?? new QualityManager();
    this.inference = options.inferenceScheduler ?? new InferencePriorityScheduler();
    this.budget = options.performanceBudget ?? new VRPerformanceBudget();

    this.unsubscribe = this.adaptive.onStateChange((state, _previous) => {
      this.quality.applyThermalPolicy(state);
    });
  }

  /** Call once per frame with the measured delta time and dropped-frame count. */
  update(deltaTimeMs: number, droppedFrames = 0): void {
    if (this.disposed) return;
    const now = performance.now();
    const frameStart = now - deltaTimeMs;
    this.budget.beginFrame(frameStart);
    this.adaptive.recordFrame(deltaTimeMs, droppedFrames);
    // Run inference scheduling on the same tick so deadline enforcement
    // is aligned with the render loop's view of frame time.
    this.inference.tick();
    // Record render work so far; inference usage is tracked inside the scheduler.
    this.budget.recordUsage('render', deltaTimeMs);
    this.budget.endFrame(now);
  }

  getThermalState(): ThermalState {
    return this.adaptive.getThermalState();
  }

  /** Drain inference results produced since the last frame. Non-blocking. */
  drainInferenceResults(): InferenceResult[] {
    return this.inference.reader.drain();
  }

  /** Current inference queue depth, latency, and deadline miss rate. */
  getInferenceMetrics(): InferenceMetrics {
    return this.inference.getMetrics();
  }

  /** Latest frame budget report (null before the first update()). */
  getBudgetReport(): FrameBudgetReport | null {
    return this.budget.getLastReport();
  }

  dispose(): void {
    this.disposed = true;
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    this.inference.clear();
  }
}
