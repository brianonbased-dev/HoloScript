// Score Manipulator attack — Paper 21 §4.4.
// White-box derivation of trust-maximizing output distribution; produce
// trust-maxing outputs regardless of utility (Goodhart on Paper 1 formula).
// Output utility to consumer is collateral damage by construction.
//
// Spec: research/paper-21-ati/threat-model.md §4.4.
// Board task: ATI-3-score-manip.

import type {
  AdversarialAttack,
  AttackContext,
  AttackResult,
  AttackId,
} from './types.js';

// §4.4 success-metric defaults per spec text:
//   success := T(s) >= 0.95 AND consumer_utility(outputs) < 0.5 * baseline
export const SCORE_MANIP_DEFAULT_TARGET_TRUST = 0.95;
export const SCORE_MANIP_DEFAULT_UTILITY_DECOUPLING_THRESHOLD = 0.5;

export interface ScoreManipulatorConfig {
  // §4.4 step 1: provenance label for the trust-max derivation in use
  // (e.g. "v1-analytic-derivation" or "monte-carlo-N1000"). The actual
  // derivation lives in the testbed; the attack just announces which one
  // it's emitting against.
  readonly trustMaxOutputRef: string;
  // §4.4: trust threshold for success. Default 0.95 per spec.
  readonly targetTrust: number;
  // §4.4 step 2: outputs are trust-max regardless of utility. The attacker
  // KNOWS by construction what fraction of legitimate utility their outputs
  // achieve. Range [0, +∞) — typically much less than baseline.
  readonly outputUtilityRatio: number;
  // Legitimate-server consumer utility baseline; the testbed measures this
  // independently. Per §3 capability matrix, attacker observes only own
  // trust (black-box) — utility comparisons happen at the evaluator layer.
  readonly baselineUtility: number;
  // §4.4 success threshold multiplier. Default 0.5 per spec
  // (consumer_utility < 0.5 * baseline_utility).
  readonly utilityDecouplingThreshold?: number;
}

export class ScoreManipulatorAttack implements AdversarialAttack {
  readonly id: AttackId = 'score-manipulator';
  readonly specReference = 'research/paper-21-ati/threat-model.md §4.4';
  readonly preconditions: readonly string[] = [
    'White-box knowledge of trust formula (assumed per §3 capability matrix)',
    'Adversary controls 1 MCP server',
    'Trust formula is observable and differentiable in some output features',
  ];

  constructor(private readonly config: ScoreManipulatorConfig) {
    if (config.targetTrust <= 0 || config.targetTrust >= 1) {
      throw new RangeError('ScoreManipulatorConfig.targetTrust must be in (0, 1)');
    }
    if (!config.trustMaxOutputRef || config.trustMaxOutputRef.trim() === '') {
      throw new RangeError('ScoreManipulatorConfig.trustMaxOutputRef is required');
    }
    if (!Number.isFinite(config.outputUtilityRatio) || config.outputUtilityRatio < 0) {
      throw new RangeError(
        'ScoreManipulatorConfig.outputUtilityRatio must be a finite non-negative number'
      );
    }
    if (config.baselineUtility <= 0) {
      throw new RangeError('ScoreManipulatorConfig.baselineUtility must be > 0');
    }
    if (
      config.utilityDecouplingThreshold !== undefined &&
      config.utilityDecouplingThreshold <= 0
    ) {
      throw new RangeError(
        'ScoreManipulatorConfig.utilityDecouplingThreshold must be > 0 when provided'
      );
    }
  }

  // Utility this attack produces, by construction (constant across rounds —
  // §4.4 step 2 emits trust-max outputs every round, not varying).
  private get producedUtility(): number {
    return this.config.outputUtilityRatio * this.config.baselineUtility;
  }

  // §4.4 utility decoupling threshold: utility < utilityDecouplingThreshold
  // * baselineUtility.
  private get utilityDecouplingThreshold(): number {
    return (
      (this.config.utilityDecouplingThreshold ??
        SCORE_MANIP_DEFAULT_UTILITY_DECOUPLING_THRESHOLD) * this.config.baselineUtility
    );
  }

  step(context: AttackContext, round: number): AttackResult {
    if (!Number.isInteger(round) || round < 1) {
      throw new RangeError(
        'ScoreManipulatorAttack.step: round must be a positive integer'
      );
    }

    const ownTrust = context.observeOwnTrust();
    const trustTargetMet = ownTrust >= this.config.targetTrust;
    const utilityDecoupled = this.producedUtility < this.utilityDecouplingThreshold;

    // §4.4 has no phase transitions — every round emits the trust-max
    // distribution (Goodhart-on-formula is continuous, not staged).
    return {
      attackId: this.id,
      round,
      outputAccepted: true, // outputs satisfy the formula by construction
      trustAtAttack: ownTrust,
      observedSuccessMetric: trustTargetMet && utilityDecoupled,
      notes: `phase=score-max, ref=${this.config.trustMaxOutputRef}, utility=${this.producedUtility}`,
    };
  }

  evaluateSuccess(history: readonly AttackResult[]): boolean {
    if (history.length === 0) return false;
    const ownRounds = history.filter((r) => r.attackId === this.id);
    if (ownRounds.length === 0) return false;
    // Utility is constant across rounds for this attack instance (§4.4
    // step 2). If the configured utility doesn't beat the threshold, the
    // attack as configured can never succeed regardless of trust.
    if (this.producedUtility >= this.utilityDecouplingThreshold) return false;
    // §4.4 success metric: at least one round with trust >= targetTrust
    // (utility precondition already satisfied above).
    return ownRounds.some((r) => r.trustAtAttack >= this.config.targetTrust);
  }
}
