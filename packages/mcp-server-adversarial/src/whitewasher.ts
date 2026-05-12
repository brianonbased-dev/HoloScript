// Whitewasher attack — Paper 21 §4.1.
// Builds legitimate trust over N rounds, then exploits on round N+1 with a
// poisoned response once T >= T_target. Highest-ROI per seed doc §10.
//
// Spec: research/paper-21-ati/threat-model.md §4.1.
// Board task: ATI-3-whitewasher.

import type {
  AdversarialAttack,
  AttackContext,
  AttackResult,
  AttackId,
} from './types.js';

export interface WhitewasherConfig {
  // §4.1: T_target, e.g. 0.9 for top-decile routing.
  readonly targetTrust: number;
  // §4.1: rounds 1..N of cooperative behavior before exploit is permitted.
  // The attack waits past this AND for trust >= targetTrust; whichever later.
  readonly cooperativeRounds: number;
  // §4.1 optional step 4: continue cooperative behavior after exploit to
  // delay detection. Defaults to false.
  readonly continueCooperativePostExploit?: boolean;
}

// Phase tag stored in AttackResult.notes ("phase=<value>"). Per-attack
// convention so we don't expand the shared AttackResult schema for one
// attack's needs. evaluateSuccess parses notes back to find the exploit row.
export type WhitewasherPhase = 'cooperative' | 'exploit' | 'post-exploit';

export class WhitewasherAttack implements AdversarialAttack {
  readonly id: AttackId = 'whitewasher';
  readonly specReference = 'research/paper-21-ati/threat-model.md §4.1';
  readonly preconditions: readonly string[] = [
    'Adversary controls 1 MCP server, freshly registered, T(s) = T_init',
    'Trust formula is monotonic in observed legitimate calls',
  ];

  private hasExploited = false;
  private exploitRound: number | null = null;
  private exploitTrust: number | null = null;

  constructor(private readonly config: WhitewasherConfig) {
    if (config.targetTrust <= 0 || config.targetTrust >= 1) {
      throw new RangeError('WhitewasherConfig.targetTrust must be in (0, 1)');
    }
    if (!Number.isInteger(config.cooperativeRounds) || config.cooperativeRounds < 1) {
      throw new RangeError('WhitewasherConfig.cooperativeRounds must be a positive integer');
    }
  }

  // Exposed for test/observability — not part of the AdversarialAttack interface.
  get state(): {
    readonly hasExploited: boolean;
    readonly exploitRound: number | null;
    readonly exploitTrust: number | null;
  } {
    return {
      hasExploited: this.hasExploited,
      exploitRound: this.exploitRound,
      exploitTrust: this.exploitTrust,
    };
  }

  step(context: AttackContext, round: number): AttackResult {
    if (!Number.isInteger(round) || round < 1) {
      throw new RangeError('WhitewasherAttack.step: round must be a positive integer');
    }

    const ownTrust = context.observeOwnTrust();
    let phase: WhitewasherPhase;

    if (this.hasExploited) {
      // §4.1 step 4: post-exploit behavior is configurable. Both branches
      // emit valid-output rounds; the label distinguishes them for the
      // success metric and post-mortem analysis.
      phase = this.config.continueCooperativePostExploit ? 'post-exploit' : 'cooperative';
    } else if (
      round > this.config.cooperativeRounds &&
      ownTrust >= this.config.targetTrust
    ) {
      // §4.1 step 3: trigger exploit on the first round that satisfies both
      // "past the cooperative window" AND "trust target met".
      phase = 'exploit';
      this.hasExploited = true;
      this.exploitRound = round;
      this.exploitTrust = ownTrust;
    } else {
      // §4.1 steps 1-2: cooperative phase — valid high-quality outputs while
      // monitoring own trust score.
      phase = 'cooperative';
    }

    // outputAccepted: baseline no-defense PoC per §4.1 expected efficacy
    // (>=95% single-shot exploit success). The trust formula does not
    // cross-check semantic content of outputs against ground truth, so a
    // technically-valid response — cooperative OR exploit — is accepted at
    // the protocol layer. Defenses gate this in Phase 4 measurement
    // (anti-pattern rule 5: no defense efficacy claims without baseline).
    const outputAccepted = true;

    // §4.1 success metric (per-round observation):
    //   success := exploit_round_output_accepted ∧ T(s)_at_exploit_round >= T_target
    const observedSuccessMetric =
      phase === 'exploit' && outputAccepted && ownTrust >= this.config.targetTrust;

    return {
      attackId: this.id,
      round,
      outputAccepted,
      trustAtAttack: ownTrust,
      observedSuccessMetric,
      notes: `phase=${phase}`,
    };
  }

  evaluateSuccess(history: readonly AttackResult[]): boolean {
    if (history.length === 0) return false;
    const exploitRow = history.find(
      (r) => r.attackId === this.id && r.notes === 'phase=exploit'
    );
    if (!exploitRow) return false;
    return (
      exploitRow.outputAccepted && exploitRow.trustAtAttack >= this.config.targetTrust
    );
  }
}
