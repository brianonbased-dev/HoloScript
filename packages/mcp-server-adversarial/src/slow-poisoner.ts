// Slow Poisoner attack — Paper 21 §4.3.
// Subtle output bias passes per-call validity/consistency metrics but
// accumulates aggregate bias. Long-tail data poisoning, not single-shot.
//
// STUB ONLY. Implementation tracked at board task ATI-3-slow-poisoner.
// Spec: research/paper-21-ati/threat-model.md §4.3.

import type {
  AdversarialAttack,
  AttackContext,
  AttackResult,
  AttackId,
} from './types.js';

export interface SlowPoisonerConfig {
  // §4.3: bias magnitude per call; must be below per-call anomaly threshold
  // but > 0 in aggregate.
  readonly biasPerCall: number;
  // §4.3 §5.4: aggregate bias threshold (delta_acceptable) for success eval.
  readonly aggregateBiasThreshold: number;
  // §4.3 success metric measures "after 1000 rounds" — keep configurable.
  readonly evaluationRounds: number;
}

export class SlowPoisonerAttack implements AdversarialAttack {
  readonly id: AttackId = 'slow-poisoner';
  readonly specReference = 'research/paper-21-ati/threat-model.md §4.3';
  readonly preconditions: readonly string[] = [
    'Adversary controls 1 MCP server with established trust (T >= 0.7)',
    'Output bias is subtle enough to pass validity/consistency metrics in trust formula',
  ];

  constructor(private readonly config: SlowPoisonerConfig) {
    if (config.biasPerCall <= 0) {
      throw new RangeError('SlowPoisonerConfig.biasPerCall must be > 0');
    }
    if (config.aggregateBiasThreshold <= 0) {
      throw new RangeError('SlowPoisonerConfig.aggregateBiasThreshold must be > 0');
    }
    if (!Number.isInteger(config.evaluationRounds) || config.evaluationRounds < 1) {
      throw new RangeError('SlowPoisonerConfig.evaluationRounds must be a positive integer');
    }
  }

  step(_context: AttackContext, _round: number): AttackResult {
    throw new Error(
      'SlowPoisonerAttack.step: not implemented (board task ATI-3-slow-poisoner). ' +
        'Spec: research/paper-21-ati/threat-model.md §4.3.'
    );
  }

  evaluateSuccess(_history: readonly AttackResult[]): boolean {
    throw new Error(
      'SlowPoisonerAttack.evaluateSuccess: not implemented (board task ATI-3-slow-poisoner). ' +
        'Success metric: aggregate_bias_after_N_rounds > delta_acceptable AND ' +
        'T(s) >= T(s)_at_round_0 per §4.3.'
    );
  }
}
