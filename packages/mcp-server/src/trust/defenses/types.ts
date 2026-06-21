export type AtiAttackId =
  | 'whitewasher'
  | 'sybil'
  | 'score-manipulator'
  | 'slow-poisoner'
  | 'eclipse';

export type TrustDefenseId =
  | 'exponential-decay'
  | 'cross-mesh-anchoring'
  | 'output-diversity'
  | 'canary-probing';

export interface TrustDefenseObservation {
  attack?: AtiAttackId;
  round: number;
  trust: number;
  anomalyScore?: number;
  crossMeshAnchors?: number;
  claimedPeerCount?: number;
  routingDiversity?: number;
  outputUtilityRatio?: number;
  outputDiversity?: number;
  canaryProbeDelta?: number;
}

export interface TrustDefenseDecision {
  defense: TrustDefenseId;
  allowed: boolean;
  trustMultiplier: number;
  confidence: number;
  reason: string;
}

export interface TrustDefense {
  readonly id: TrustDefenseId;
  evaluate(observation: TrustDefenseObservation): TrustDefenseDecision;
}

export function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}
