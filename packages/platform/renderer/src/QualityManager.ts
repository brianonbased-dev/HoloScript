/**
 * QualityManager
 *
 * Applies quality overrides (LOD bias, Gaussian budget shedding, feature
 * disabling) in response to thermal-state changes from AdaptiveFrameRateManager.
 */

import type { ThermalState } from './AdaptiveFrameRateManager';

export interface LODPolicy {
  /** Offset added to the base LOD level (positive = lower detail). */
  biasDelta: number;
  /** Hard cap on LOD level; undefined means no override. */
  maxLevelOverride?: number;
  /** Render features disabled at this thermal tier. */
  disabledFeatures: RenderFeature[];
}

export type RenderFeature =
  | 'shadows'
  | 'reflections'
  | 'particles'
  | 'postProcessing'
  | 'ambientOcclusion'
  | 'antiAliasing';

export interface GaussianBudget {
  /** Maximum number of 3D Gaussian splats. */
  maxSplats: number;
  /** Maximum memory footprint in megabytes. */
  maxMemoryMB: number;
}

export interface QualityPolicy {
  cool: LODPolicy & { gaussian: GaussianBudget };
  warm: LODPolicy & { gaussian: GaussianBudget };
  hot: LODPolicy & { gaussian: GaussianBudget };
  critical: LODPolicy & { gaussian: GaussianBudget };
}

export const DEFAULT_QUALITY_POLICY: QualityPolicy = {
  cool: {
    biasDelta: 0,
    disabledFeatures: [],
    gaussian: { maxSplats: 1_000_000, maxMemoryMB: 512 },
  },
  warm: {
    biasDelta: 0.2,
    disabledFeatures: ['reflections', 'particles', 'ambientOcclusion'],
    gaussian: { maxSplats: 500_000, maxMemoryMB: 256 },
  },
  hot: {
    biasDelta: 0.5,
    maxLevelOverride: 2,
    disabledFeatures: [
      'shadows',
      'reflections',
      'particles',
      'postProcessing',
      'ambientOcclusion',
      'antiAliasing',
    ],
    gaussian: { maxSplats: 100_000, maxMemoryMB: 128 },
  },
  critical: {
    biasDelta: 1.0,
    maxLevelOverride: 3,
    disabledFeatures: [
      'shadows',
      'reflections',
      'particles',
      'postProcessing',
      'ambientOcclusion',
      'antiAliasing',
    ],
    gaussian: { maxSplats: 10_000, maxMemoryMB: 64 },
  },
};

export class QualityManager {
  private readonly policy: QualityPolicy;
  private currentState: ThermalState = 'cool';

  constructor(policy?: Partial<QualityPolicy>) {
    this.policy = { ...DEFAULT_QUALITY_POLICY, ...policy } as QualityPolicy;
  }

  applyThermalPolicy(state: ThermalState): void {
    this.currentState = state;
  }

  getCurrentState(): ThermalState {
    return this.currentState;
  }

  getLODPolicy(): LODPolicy {
    const p = this.policy[this.currentState];
    return {
      biasDelta: p.biasDelta,
      maxLevelOverride: p.maxLevelOverride,
      disabledFeatures: [...p.disabledFeatures],
    };
  }

  getGaussianBudget(): GaussianBudget {
    return { ...this.policy[this.currentState].gaussian };
  }

  shouldShedFeature(feature: RenderFeature): boolean {
    return this.policy[this.currentState].disabledFeatures.includes(feature);
  }

  getEffectiveBudgetRatio(): number {
    const base = this.policy.cool.gaussian.maxSplats;
    const current = this.policy[this.currentState].gaussian.maxSplats;
    return current / base;
  }
}
