/**
 * HololandRenderer
 *
 * Orchestrates AdaptiveFrameRateManager and QualityManager so that thermal
 * pressure automatically drives LOD reduction, feature shedding, and
 * Gaussian-budget downgrades.
 */

import {
  AdaptiveFrameRateManager,
  type ThermalState,
} from './AdaptiveFrameRateManager';
import { QualityManager } from './QualityManager';

export interface HololandRendererOptions {
  adaptiveFrameRate?: AdaptiveFrameRateManager;
  qualityManager?: QualityManager;
}

export class HololandRenderer {
  readonly adaptive: AdaptiveFrameRateManager;
  readonly quality: QualityManager;
  private unsubscribe: (() => void) | null = null;
  private disposed = false;

  constructor(options: HololandRendererOptions = {}) {
    this.adaptive = options.adaptiveFrameRate ?? new AdaptiveFrameRateManager();
    this.quality = options.qualityManager ?? new QualityManager();

    this.unsubscribe = this.adaptive.onStateChange((state, _previous) => {
      this.quality.applyThermalPolicy(state);
    });
  }

  /** Call once per frame with the measured delta time and dropped-frame count. */
  update(deltaTimeMs: number, droppedFrames = 0): void {
    if (this.disposed) return;
    this.adaptive.recordFrame(deltaTimeMs, droppedFrames);
  }

  getThermalState(): ThermalState {
    return this.adaptive.getThermalState();
  }

  dispose(): void {
    this.disposed = true;
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
  }
}
