/**
 * AdaptiveFrameRateManager
 *
 * Classifies thermal pressure from proxy signals (frame time, dropped frames)
 * and emits state-change callbacks that downstream systems (QualityManager)
 * consume to shed workload.
 */

export type ThermalState = 'cool' | 'warm' | 'hot' | 'critical';

export interface ThermalThresholds {
  warmFrameTimeMs: number;
  hotFrameTimeMs: number;
  criticalFrameTimeMs: number;
  warmDroppedFrames: number;
  hotDroppedFrames: number;
  criticalDroppedFrames: number;
}

export const DEFAULT_THRESHOLDS: ThermalThresholds = {
  warmFrameTimeMs: 20,
  hotFrameTimeMs: 33.33,
  criticalFrameTimeMs: 50,
  warmDroppedFrames: 1,
  hotDroppedFrames: 3,
  criticalDroppedFrames: 6,
};

export interface FrameSample {
  deltaTimeMs: number;
  dropped: number;
}

export interface AdaptiveFrameRateManagerOptions {
  thresholds?: Partial<ThermalThresholds>;
  maxHistory?: number;
  classificationWindow?: number;
}

export class AdaptiveFrameRateManager {
  private readonly thresholds: ThermalThresholds;
  private readonly history: FrameSample[] = [];
  private readonly callbacks = new Set<(state: ThermalState, previous: ThermalState) => void>();
  private readonly maxHistory: number;
  private readonly classificationWindow: number;
  private currentState: ThermalState = 'cool';

  constructor(options: AdaptiveFrameRateManagerOptions = {}) {
    this.thresholds = { ...DEFAULT_THRESHOLDS, ...options.thresholds };
    this.maxHistory = options.maxHistory ?? 120;
    this.classificationWindow = options.classificationWindow ?? 6;
  }

  recordFrame(deltaTimeMs: number, droppedFrames = 0): void {
    const sample: FrameSample = { deltaTimeMs, dropped: droppedFrames };
    this.history.push(sample);
    if (this.history.length > this.maxHistory) {
      this.history.shift();
    }

    const newState = this.classify();
    if (newState !== this.currentState) {
      const previous = this.currentState;
      this.currentState = newState;
      this.notify(previous);
    }
  }

  getThermalState(): ThermalState {
    return this.currentState;
  }

  getHistory(): readonly FrameSample[] {
    return this.history;
  }

  onStateChange(callback: (state: ThermalState, previous: ThermalState) => void): () => void {
    this.callbacks.add(callback);
    return () => {
      this.callbacks.delete(callback);
    };
  }

  private classify(): ThermalState {
    const windowSize = Math.min(this.classificationWindow, this.history.length);
    if (windowSize === 0) return 'cool';

    const recent = this.history.slice(-windowSize);
    const avgFrameTime = recent.reduce((sum, s) => sum + s.deltaTimeMs, 0) / windowSize;
    const totalDropped = recent.reduce((sum, s) => sum + s.dropped, 0);

    if (
      avgFrameTime >= this.thresholds.criticalFrameTimeMs ||
      totalDropped >= this.thresholds.criticalDroppedFrames
    ) {
      return 'critical';
    }
    if (
      avgFrameTime >= this.thresholds.hotFrameTimeMs ||
      totalDropped >= this.thresholds.hotDroppedFrames
    ) {
      return 'hot';
    }
    if (
      avgFrameTime >= this.thresholds.warmFrameTimeMs ||
      totalDropped >= this.thresholds.warmDroppedFrames
    ) {
      return 'warm';
    }
    return 'cool';
  }

  private notify(previous: ThermalState): void {
    for (const cb of this.callbacks) {
      cb(this.currentState, previous);
    }
  }
}
