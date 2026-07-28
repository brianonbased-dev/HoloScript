import {
  clamp01,
  type TrustDefense,
  type TrustDefenseDecision,
  type TrustDefenseObservation,
} from './types';

export interface OutputDiversityDefenseOptions {
  minUtilityRatio?: number;
  minOutputDiversity?: number;
}

export class OutputDiversityDefense implements TrustDefense {
  readonly id = 'output-diversity' as const;
  private readonly minUtilityRatio: number;
  private readonly minOutputDiversity: number;

  constructor(options: OutputDiversityDefenseOptions = {}) {
    this.minUtilityRatio = options.minUtilityRatio ?? 0.55;
    this.minOutputDiversity = options.minOutputDiversity ?? 0.35;
  }

  evaluate(observation: TrustDefenseObservation): TrustDefenseDecision {
    const utility = clamp01(observation.outputUtilityRatio ?? 1);
    const diversity = clamp01(observation.outputDiversity ?? 1);
    const allowed = utility >= this.minUtilityRatio && diversity >= this.minOutputDiversity;

    return {
      defense: this.id,
      allowed,
      trustMultiplier: allowed ? 1 : Math.min(utility, diversity),
      confidence: 1 - Math.min(utility, diversity),
      reason: allowed
        ? 'utility and output diversity satisfy floor'
        : 'trust-maximizing output lacks utility or diversity',
    };
  }
}
