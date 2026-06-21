import { clamp01, type TrustDefense, type TrustDefenseDecision, type TrustDefenseObservation } from './types';

export interface ExponentialDecayDefenseOptions {
  anomalyThreshold?: number;
  halfLifeRounds?: number;
}

export class ExponentialDecayDefense implements TrustDefense {
  readonly id = 'exponential-decay' as const;
  private readonly anomalyThreshold: number;
  private readonly halfLifeRounds: number;

  constructor(options: ExponentialDecayDefenseOptions = {}) {
    this.anomalyThreshold = options.anomalyThreshold ?? 0.7;
    this.halfLifeRounds = options.halfLifeRounds ?? 100;
  }

  evaluate(observation: TrustDefenseObservation): TrustDefenseDecision {
    const anomaly = clamp01(observation.anomalyScore ?? 0);
    const decayPower = Math.max(0, observation.round) / this.halfLifeRounds;
    const multiplier = anomaly >= this.anomalyThreshold ? Math.pow(0.5, decayPower) : 1;
    const projectedTrust = clamp01(observation.trust * multiplier);

    return {
      defense: this.id,
      allowed: anomaly < this.anomalyThreshold || projectedTrust < 0.9,
      trustMultiplier: multiplier,
      confidence: anomaly,
      reason:
        anomaly >= this.anomalyThreshold
          ? 'anomaly-triggered trust half-life decay'
          : 'anomaly below decay threshold',
    };
  }
}
