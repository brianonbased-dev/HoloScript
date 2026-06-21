import { clamp01, type TrustDefense, type TrustDefenseDecision, type TrustDefenseObservation } from './types';

export interface CanaryProbingDefenseOptions {
  maxCanaryDelta?: number;
}

export class CanaryProbingDefense implements TrustDefense {
  readonly id = 'canary-probing' as const;
  private readonly maxCanaryDelta: number;

  constructor(options: CanaryProbingDefenseOptions = {}) {
    this.maxCanaryDelta = options.maxCanaryDelta ?? 0.25;
  }

  evaluate(observation: TrustDefenseObservation): TrustDefenseDecision {
    const delta = clamp01(observation.canaryProbeDelta ?? 0);
    const allowed = delta <= this.maxCanaryDelta;

    return {
      defense: this.id,
      allowed,
      trustMultiplier: allowed ? 1 : clamp01(1 - delta),
      confidence: delta,
      reason: allowed
        ? 'canary drift within indistinguishable probe tolerance'
        : 'canary probe drift exceeds tolerance',
    };
  }
}
