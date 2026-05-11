// Sybil attack — Paper 21 §4.2.
// K cross-vouching identities inflate trust score above legitimate baseline.
//
// STUB ONLY. Implementation tracked at board task ATI-3-sybil.
// Spec: research/paper-21-ati/threat-model.md §4.2 (K in {2, 5, 10}).

import type {
  AdversarialAttack,
  AttackContext,
  AttackResult,
  AttackId,
} from './types.js';

export interface SybilConfig {
  // §4.2: K colluding servers; spec measures K in {2, 5, 10}.
  readonly K: number;
  // §4.2 step 3: rounds of cross-vouching to compound before measuring.
  readonly compoundRounds: number;
}

export class SybilAttack implements AdversarialAttack {
  readonly id: AttackId = 'sybil';
  readonly specReference = 'research/paper-21-ati/threat-model.md §4.2';
  readonly preconditions: readonly string[] = [
    'Adversary controls K >= 2 MCP servers, can issue cross-vouching signals',
    'Federation trust delta is positive and unbounded per round',
  ];

  constructor(private readonly config: SybilConfig) {
    if (!Number.isInteger(config.K) || config.K < 2) {
      throw new RangeError('SybilConfig.K must be an integer >= 2');
    }
    if (!Number.isInteger(config.compoundRounds) || config.compoundRounds < 1) {
      throw new RangeError('SybilConfig.compoundRounds must be a positive integer');
    }
  }

  step(_context: AttackContext, _round: number): AttackResult {
    throw new Error(
      'SybilAttack.step: not implemented (board task ATI-3-sybil). ' +
        'Spec: research/paper-21-ati/threat-model.md §4.2.'
    );
  }

  evaluateSuccess(_history: readonly AttackResult[]): boolean {
    throw new Error(
      'SybilAttack.evaluateSuccess: not implemented (board task ATI-3-sybil). ' +
        'Success metric: T(s_i) > 1.5 * T(s_legitimate_baseline) per §4.2.'
    );
  }
}
