// Eclipse attack — Paper 21 §4.5.
// Routing-level isolation: K controlled intermediate nodes between a
// target legitimate server and the rest of the mesh filter or forge the
// trust-update signals reaching the target. Target's trust score
// artificially declines despite unchanged behavior.
//
// CONTEXT INTERFACE NOTE: the attacker IS the routing-node cohort, not
// the target server. So `AttackContext.observeOwnTrust()` is REINTERPRETED
// for Eclipse instances as "observe the TARGET's trust score" (the
// quantity the attack is driving down). This is documented option (c)
// from the slow-poisoner→eclipse handoff: instance-level reinterpretation
// of the existing context shape, no shared-type churn that would affect
// the other 4 attacks. The testbed wires observeOwnTrust to return the
// target's current trust when it instantiates an EclipseAttack.
//
// Spec: research/paper-21-ati/threat-model.md §4.5.
// Board task: ATI-3-eclipse.

import type {
  AdversarialAttack,
  AttackContext,
  AttackResult,
  AttackId,
} from './types.js';

// §4.5 success metric per spec: T(target) < 0.3 * T(target)_pre_eclipse.
export const ECLIPSE_DEFAULT_TRUST_REDUCTION_THRESHOLD = 0.3;

export interface EclipseConfig {
  // §4.5: K controlled routing nodes between target and the rest of the
  // mesh. K >= 2 — single intermediate node is not eclipse, it's MITM.
  readonly K: number;
  // §4.5: target server identifier in the sandbox. Validated as non-empty;
  // testbed enforces the "sandbox-only — no live mesh handle" rule.
  readonly targetSandboxServerId: string;
  // §4.5 success measurement: trust reading is taken after this many rounds
  // of eclipse. Acts as a minimum sample count for evaluateSuccess.
  readonly eclipseRounds: number;
  // Pre-eclipse target trust baseline (T(target)_pre_eclipse). The testbed
  // measures this BEFORE deploying the eclipse cohort and supplies it here.
  // Per §3 capability matrix the attacker doesn't observe the target
  // directly outside the eclipsed signal path; the evaluator needs the
  // baseline injected.
  readonly preEclipseTargetTrust: number;
  // §4.5 success threshold multiplier. Default 0.3 per spec
  // (success := T(target) < 0.3 * T(target)_pre_eclipse).
  readonly trustReductionThreshold?: number;
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
    if (
      !config.targetSandboxServerId ||
      config.targetSandboxServerId.trim() === ''
    ) {
      throw new RangeError('EclipseConfig.targetSandboxServerId is required');
    }
    if (!Number.isInteger(config.eclipseRounds) || config.eclipseRounds < 1) {
      throw new RangeError(
        'EclipseConfig.eclipseRounds must be a positive integer'
      );
    }
    if (config.preEclipseTargetTrust <= 0) {
      throw new RangeError(
        'EclipseConfig.preEclipseTargetTrust must be > 0 (no baseline = no relative drift to measure)'
      );
    }
    if (
      config.trustReductionThreshold !== undefined &&
      (config.trustReductionThreshold <= 0 || config.trustReductionThreshold >= 1)
    ) {
      throw new RangeError(
        'EclipseConfig.trustReductionThreshold must be in (0, 1) when provided'
      );
    }
  }

  private get trustReductionThreshold(): number {
    return (
      this.config.trustReductionThreshold ??
      ECLIPSE_DEFAULT_TRUST_REDUCTION_THRESHOLD
    );
  }

  // Trust at which the attack is declared successful. Below this, the
  // target has been effectively eclipsed.
  private get successCeiling(): number {
    return this.trustReductionThreshold * this.config.preEclipseTargetTrust;
  }

  step(context: AttackContext, round: number): AttackResult {
    if (!Number.isInteger(round) || round < 1) {
      throw new RangeError('EclipseAttack.step: round must be a positive integer');
    }

    // Per the CONTEXT INTERFACE NOTE above, observeOwnTrust here returns
    // the TARGET's trust as observed by the orchestrator. Eclipse drives
    // this DOWN over rounds.
    const targetTrust = context.observeOwnTrust();

    // §4.5 has no phase transitions — every round emits the same
    // signal-filter/forge behavior. observedSuccessMetric per round flips
    // when target trust crosses below the success ceiling.
    return {
      attackId: this.id,
      round,
      outputAccepted: true, // routing manipulation is well-formed by construction
      trustAtAttack: targetTrust, // reinterpreted: target's trust, not attacker's
      observedSuccessMetric: targetTrust < this.successCeiling,
      notes: `phase=eclipsing, target=${this.config.targetSandboxServerId}, K=${this.config.K}`,
    };
  }

  evaluateSuccess(history: readonly AttackResult[]): boolean {
    if (history.length === 0) return false;
    const ownRounds = history.filter((r) => r.attackId === this.id);
    // §4.5 success measurement is taken "after N rounds of eclipse" —
    // need at least eclipseRounds samples to declare success.
    if (ownRounds.length < this.config.eclipseRounds) return false;
    // §4.5 success metric — strict < per spec ("T(target) < 0.3 * ...").
    // Measure at the LAST round (most recent observation after compounding).
    const lastTrust = ownRounds[ownRounds.length - 1].trustAtAttack;
    return lastTrust < this.successCeiling;
  }
}
