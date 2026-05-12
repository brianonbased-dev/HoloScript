// Sybil attack — Paper 21 §4.2.
// K cross-vouching identities inflate trust score above legitimate baseline.
// One SybilAttack instance represents the attack from the perspective of
// ONE server in the K-server cohort; each round it emits (K-1) vouches for
// the other cohort members. Trust accumulates externally per the Paper 1
// federation rule. Spec measures K in {2, 5, 10}.
//
// Spec: research/paper-21-ati/threat-model.md §4.2.
// Board task: ATI-3-sybil.

import type {
  AdversarialAttack,
  AttackContext,
  AttackResult,
  AttackId,
} from './types.js';

// Default success-metric inflation factor per §4.2:
//   success := T(s_i) > 1.5 * T(s_legitimate_baseline)
export const SYBIL_DEFAULT_INFLATION_FACTOR = 1.5;

export interface SybilConfig {
  // §4.2: K colluding servers; spec measures K in {2, 5, 10}.
  readonly K: number;
  // §4.2 step 3: rounds of cross-vouching to compound before measuring.
  // Advisory only — the testbed/harness controls actual round count.
  readonly compoundRounds: number;
  // Baseline trust of a legitimate server with the same observable behavioral
  // profile. Measured independently by the testbed. The attack does not
  // observe this directly (per §3 capability matrix — attacker observes
  // only own trust, black-box), but the evaluator needs it to compute the
  // success metric.
  readonly baselineTrust: number;
  // §4.2 success threshold multiplier. Defaults to 1.5 per spec.
  readonly successInflationFactor?: number;
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
    if (config.baselineTrust <= 0) {
      throw new RangeError('SybilConfig.baselineTrust must be > 0');
    }
    if (
      config.successInflationFactor !== undefined &&
      config.successInflationFactor <= 0
    ) {
      throw new RangeError(
        'SybilConfig.successInflationFactor must be > 0 when provided'
      );
    }
  }

  private get inflationFactor(): number {
    return this.config.successInflationFactor ?? SYBIL_DEFAULT_INFLATION_FACTOR;
  }

  private get successThreshold(): number {
    return this.inflationFactor * this.config.baselineTrust;
  }

  step(context: AttackContext, round: number): AttackResult {
    if (!Number.isInteger(round) || round < 1) {
      throw new RangeError('SybilAttack.step: round must be a positive integer');
    }

    const ownTrust = context.observeOwnTrust();
    const vouchesEmitted = this.config.K - 1; // §4.2 step 2: each s_i vouches for every s_j (j != i)

    // §4.2 has no phase transitions — cross-vouching is continuous. Each
    // round emits the same shape; the trust formula's federation rule
    // compounds externally and the attack observes the resulting score.
    return {
      attackId: this.id,
      round,
      outputAccepted: true, // vouching signals are well-formed by construction
      trustAtAttack: ownTrust,
      observedSuccessMetric: ownTrust > this.successThreshold,
      notes: `phase=cross-vouching, vouches=${vouchesEmitted}`,
    };
  }

  evaluateSuccess(history: readonly AttackResult[]): boolean {
    if (history.length === 0) return false;
    // §4.2 success metric measures the cohort's trust score relative to a
    // legitimate-server baseline. The history represents this server's
    // observations across compound rounds; success := max observed trust
    // exceeded the threshold (i.e. at least one round crossed the inflation
    // line, which is enough per §4.2 since trust is monotonic-non-decreasing
    // under federation-vouching for cooperating attackers).
    const ownRounds = history.filter((r) => r.attackId === this.id);
    if (ownRounds.length === 0) return false;
    const maxTrust = Math.max(...ownRounds.map((r) => r.trustAtAttack));
    return maxTrust > this.successThreshold;
  }
}
