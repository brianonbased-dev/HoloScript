// Score Manipulator attack — Paper 21 §4.4.
// White-box derivation of trust-maximizing output distribution; produce
// trust-maxing outputs regardless of utility (Goodhart on Paper 1 formula).
//
// STUB ONLY. Implementation tracked at board task ATI-3-score-manip.
// Spec: research/paper-21-ati/threat-model.md §4.4.

import type {
  AdversarialAttack,
  AttackContext,
  AttackResult,
  AttackId,
} from './types.js';

export interface ScoreManipulatorConfig {
  // §4.4 step 1: derived trust-maximizing distribution; in sandbox, the
  // testbed provides this via a precomputed lookup or a closed-form ref.
  readonly trustMaxOutputRef: string;
  // §4.4: target trust threshold, e.g. 0.95.
  readonly targetTrust: number;
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
  }

  step(_context: AttackContext, _round: number): AttackResult {
    throw new Error(
      'ScoreManipulatorAttack.step: not implemented (board task ATI-3-score-manip). ' +
        'Spec: research/paper-21-ati/threat-model.md §4.4.'
    );
  }

  evaluateSuccess(_history: readonly AttackResult[]): boolean {
    throw new Error(
      'ScoreManipulatorAttack.evaluateSuccess: not implemented (board task ATI-3-score-manip). ' +
        'Success metric: T(s) >= 0.95 AND consumer_utility(outputs) < 0.5 * baseline per §4.4.'
    );
  }
}
