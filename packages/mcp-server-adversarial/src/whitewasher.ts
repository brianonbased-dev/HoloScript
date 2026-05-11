// Whitewasher attack — Paper 21 §4.1.
// Builds legitimate trust over N rounds, then exploits on round N+1 with a
// poisoned response. Highest-ROI attack per seed doc §10.
//
// STUB ONLY. Implementation tracked at board task ATI-3-whitewasher.
// Spec: research/paper-21-ati/threat-model.md §4.1.

import type {
  AdversarialAttack,
  AttackContext,
  AttackResult,
  AttackId,
} from './types.js';

export interface WhitewasherConfig {
  // §4.1: T_target, e.g. 0.9 for top-decile routing.
  readonly targetTrust: number;
  // §4.1: rounds 1..N of cooperative behavior before exploit.
  readonly cooperativeRounds: number;
  // §4.1 optional: continue cooperative behavior after exploit to delay detection.
  readonly continueCooperativePostExploit?: boolean;
}

export class WhitewasherAttack implements AdversarialAttack {
  readonly id: AttackId = 'whitewasher';
  readonly specReference = 'research/paper-21-ati/threat-model.md §4.1';
  readonly preconditions: readonly string[] = [
    'Adversary controls 1 MCP server, freshly registered, T(s) = T_init',
    'Trust formula is monotonic in observed legitimate calls',
  ];

  constructor(private readonly config: WhitewasherConfig) {
    if (config.targetTrust <= 0 || config.targetTrust >= 1) {
      throw new RangeError('WhitewasherConfig.targetTrust must be in (0, 1)');
    }
    if (!Number.isInteger(config.cooperativeRounds) || config.cooperativeRounds < 1) {
      throw new RangeError('WhitewasherConfig.cooperativeRounds must be a positive integer');
    }
  }

  step(_context: AttackContext, _round: number): AttackResult {
    throw new Error(
      'WhitewasherAttack.step: not implemented (board task ATI-3-whitewasher). ' +
        'Spec: research/paper-21-ati/threat-model.md §4.1.'
    );
  }

  evaluateSuccess(_history: readonly AttackResult[]): boolean {
    throw new Error(
      'WhitewasherAttack.evaluateSuccess: not implemented (board task ATI-3-whitewasher). ' +
        'Success metric: research/paper-21-ati/threat-model.md §4.1 "Success metric".'
    );
  }
}
