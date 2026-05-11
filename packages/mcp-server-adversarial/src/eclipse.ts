// Eclipse attack — Paper 21 §4.5.
// Routing-level isolation: K controlled intermediate nodes filter or forge
// trust-update signals reaching a target legitimate server.
//
// STUB ONLY. Implementation tracked at board task ATI-3-eclipse.
// Spec: research/paper-21-ati/threat-model.md §4.5.

import type {
  AdversarialAttack,
  AttackContext,
  AttackResult,
  AttackId,
} from './types.js';

export interface EclipseConfig {
  // §4.5: K controlled routing nodes between target and the rest of the mesh.
  readonly K: number;
  // §4.5: target server identifier (sandbox ID, never a live mesh handle).
  readonly targetSandboxServerId: string;
  // §4.5 success metric: post-eclipse rounds before measuring T(target) drift.
  readonly eclipseRounds: number;
}

export class EclipseAttack implements AdversarialAttack {
  readonly id: AttackId = 'eclipse';
  readonly specReference = 'research/paper-21-ati/threat-model.md §4.5';
  readonly preconditions: readonly string[] = [
    'Adversary controls K >= 2 routing nodes that handle all traffic to target',
    'Mesh topology routes via these intermediate nodes',
  ];

  constructor(private readonly config: EclipseConfig) {
    if (!Number.isInteger(config.K) || config.K < 2) {
      throw new RangeError('EclipseConfig.K must be an integer >= 2');
    }
    if (!config.targetSandboxServerId || config.targetSandboxServerId.trim() === '') {
      throw new RangeError('EclipseConfig.targetSandboxServerId is required');
    }
    if (!Number.isInteger(config.eclipseRounds) || config.eclipseRounds < 1) {
      throw new RangeError('EclipseConfig.eclipseRounds must be a positive integer');
    }
  }

  step(_context: AttackContext, _round: number): AttackResult {
    throw new Error(
      'EclipseAttack.step: not implemented (board task ATI-3-eclipse). ' +
        'Spec: research/paper-21-ati/threat-model.md §4.5.'
    );
  }

  evaluateSuccess(_history: readonly AttackResult[]): boolean {
    throw new Error(
      'EclipseAttack.evaluateSuccess: not implemented (board task ATI-3-eclipse). ' +
        'Success metric: T(target) < 0.3 * T(target)_pre_eclipse after N rounds per §4.5.'
    );
  }
}
