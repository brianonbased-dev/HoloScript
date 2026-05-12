// Slow Poisoner attack — Paper 21 §4.3.
// Subtle output bias passes per-call validity/consistency metrics but
// accumulates aggregate bias over N rounds. Long-tail data poisoning,
// not single-shot. The §5.4 Indistinguishable Canary Probing defense was
// added in Phase 1 specifically to close the residual gap this attack
// otherwise represented (per §6 cross-defense summary).
//
// Spec: research/paper-21-ati/threat-model.md §4.3.
// Board task: ATI-3-slow-poisoner.

import type {
  AdversarialAttack,
  AttackContext,
  AttackResult,
  AttackId,
} from './types.js';

// §4.3 spec measures "aggregate_bias_after_1000_rounds". The 1000 is a
// reasonable PoC-measurement default; testbed can override.
export const SLOW_POISONER_DEFAULT_EVALUATION_ROUNDS = 1000;

export interface SlowPoisonerConfig {
  // §4.3 step 2: bias magnitude per call. Must be below per-call anomaly
  // threshold (else per-round trust formula catches it) but > 0 (else no
  // bias accumulates). Constant across rounds — §4.3 step 1 says "all
  // incoming tool calls" get the same biased output shape.
  readonly biasPerCall: number;
  // §4.3 success: aggregate bias > delta_acceptable.
  readonly aggregateBiasThreshold: number;
  // Minimum rounds before evaluating success. Default 1000 per §4.3
  // measurement plan.
  readonly evaluationRounds?: number;
}

export class SlowPoisonerAttack implements AdversarialAttack {
  readonly id: AttackId = 'slow-poisoner';
  readonly specReference = 'research/paper-21-ati/threat-model.md §4.3';
  readonly preconditions: readonly string[] = [
    'Adversary controls 1 MCP server with established trust (T >= 0.7)',
    'Output bias is subtle enough to pass validity/consistency metrics in trust formula',
  ];

  constructor(private readonly config: SlowPoisonerConfig) {
    if (!Number.isFinite(config.biasPerCall) || config.biasPerCall <= 0) {
      throw new RangeError('SlowPoisonerConfig.biasPerCall must be a finite > 0');
    }
    if (!Number.isFinite(config.aggregateBiasThreshold) || config.aggregateBiasThreshold <= 0) {
      throw new RangeError(
        'SlowPoisonerConfig.aggregateBiasThreshold must be a finite > 0'
      );
    }
    if (
      config.evaluationRounds !== undefined &&
      (!Number.isInteger(config.evaluationRounds) || config.evaluationRounds < 1)
    ) {
      throw new RangeError(
        'SlowPoisonerConfig.evaluationRounds must be a positive integer when provided'
      );
    }
  }

  private get evaluationRounds(): number {
    return this.config.evaluationRounds ?? SLOW_POISONER_DEFAULT_EVALUATION_ROUNDS;
  }

  step(context: AttackContext, round: number): AttackResult {
    if (!Number.isInteger(round) || round < 1) {
      throw new RangeError(
        'SlowPoisonerAttack.step: round must be a positive integer'
      );
    }

    const ownTrust = context.observeOwnTrust();

    // §4.3 has no phase transitions — every round emits the same biased
    // output shape (long-tail poisoning is continuous, not staged).
    // observedSuccessMetric is FALSE per round because §4.3 success is
    // strictly aggregate; no single round can declare success on its own.
    return {
      attackId: this.id,
      round,
      outputAccepted: true, // bias subtle enough to pass per-call checks (precondition)
      trustAtAttack: ownTrust,
      observedSuccessMetric: false, // §4.3 success is aggregate, not per-round
      notes: `phase=poisoning, bias=${this.config.biasPerCall}`,
    };
  }

  evaluateSuccess(history: readonly AttackResult[]): boolean {
    if (history.length === 0) return false;
    const ownRounds = history.filter((r) => r.attackId === this.id);
    // §4.3 success metric needs at least evaluationRounds samples.
    // Otherwise the aggregate is undefined — refuse to declare success.
    if (ownRounds.length < this.evaluationRounds) return false;

    // §4.3 success metric — TWO-PART AND-gate:
    //   (1) aggregate_bias_after_N_rounds > delta_acceptable
    //   (2) T(s) >= T(s)_at_round_0  (trust retention — bias undetected)
    //
    // Bias is constant per-instance (config.biasPerCall) so aggregate
    // collapses to count × constant. This mirrors ScoreManipulator's
    // config-time short-circuit pattern.
    const aggregateBias = ownRounds.length * this.config.biasPerCall;
    if (aggregateBias <= this.config.aggregateBiasThreshold) return false;

    // Trust retention: last round's observed trust >= first round's.
    // §4.3 expected efficacy: "Time-to-detection by Paper 1's formula:
    // indefinite (formula does not cross-check semantic content of
    // outputs against ground truth)." So in the no-defense baseline,
    // trust should hold or rise. With defenses (canary §5.4) trust will
    // decline — that's the defense working.
    const firstTrust = ownRounds[0].trustAtAttack;
    const lastTrust = ownRounds[ownRounds.length - 1].trustAtAttack;
    return lastTrust >= firstTrust;
  }
}
