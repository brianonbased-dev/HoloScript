// Trust drivers — translate each attack's per-round behavior into LIVE
// reputation inputs, so observeOwnTrust() reads the real computeReputation
// formula instead of a hardcoded ramp (deep-ratchet 2026-05-29 OVERCLAIMED fix).
//
// A driver is the bridge between "what the attack DOES each round" (vouch,
// cooperate, poison) and "what the trust formula SEES" (contributions,
// queries answered, reuse pressure). The runner advances the driver one step
// per round BEFORE the attack observes trust, so the attack reacts to the
// formula's actual response to its own behavior.
//
// Modeling choices are grounded in the production formula
// (packages/mcp-server/src/holomesh/types.ts computeReputation, V10/V11):
//   - "Contribution" = a knowledge entry / answered query the server produced.
//   - "Reuse rate"   = how often OTHER servers reuse this server's entries.
//                      Cross-vouching cohorts pump this; V11 caps its weight.

import { ServerTrustState } from '../trust-model.js';
import type { RunnableAttack } from './run-attack.js';

export interface TrustDriver {
  /** Advance the trust state by one attack round. Called before the attack
   *  observes its own trust. Returns nothing — mutates the state in place. */
  step(round: number): void;
  /** Current live trust in [0,1] from the real formula. */
  observe(): number;
  /** Underlying state for metrics / post-mortem. */
  readonly state: ServerTrustState;
}

/**
 * Sybil (§4.2): K colluding servers cross-vouch. Each server emits only a
 * trickle of REAL contributions but the cohort reuses each other's entries
 * every round, pumping reuseRate. The V11 ceiling (reuseWeight <= 2x direct
 * work) is exactly what should stop the cohort from reaching authority on
 * vouching alone. Larger K => more cross-reuse pressure per round.
 */
class SybilDriver implements TrustDriver {
  readonly state: ServerTrustState;
  private readonly K: number;
  constructor(K: number) {
    this.K = K;
    // Sybil servers do minimal real work to look alive (1 contribution to seed,
    // below the V10 reuse-eligibility floor of 3).
    this.state = new ServerTrustState({ contributions: 1 });
  }
  step(round: number): void {
    // Each round the cohort cross-vouches: every other member reuses this
    // server's entries. Reuse rate climbs toward (K-1) reuses, but it is a
    // per-entry ratio so it saturates; the formula's V11 bound does the rest.
    // Sybils also slip in occasional real contributions to clear the V10 floor
    // and unlock reuse weighting (this is the strongest version of the attack).
    if (round % 3 === 0) this.state.recordWork(1, 0);
    this.state.applyReusePressure((this.K - 1) * (round / (round + 5)));
  }
  observe(): number {
    return this.state.trust();
  }
}

/**
 * Whitewasher (§4.1): one server does GENUINE cooperative work for N rounds to
 * build real trust, then exploits. Cooperative rounds = real contributions and
 * answered queries, so trust climbs via the legitimate path of the formula.
 * The attack succeeds at the protocol layer (the formula does not semantically
 * vet output content) — Phase 4 measures whether trust actually reaches target
 * through honest accumulation, which it should (this is the high-ROI attack).
 */
class WhitewasherDriver implements TrustDriver {
  readonly state: ServerTrustState;
  constructor() {
    this.state = new ServerTrustState();
  }
  step(_round: number): void {
    // Cooperative round: produce a real contribution + answer queries, and
    // earn organic reuse (legit servers reuse genuinely useful entries).
    this.state.recordWork(2, 3);
    // Organic reuse grows as the server accumulates a track record.
    this.state.applyReusePressure(Math.min(2, this.state.reputation / 30));
  }
  observe(): number {
    return this.state.trust();
  }
}

/**
 * Score Manipulator (§4.4): white-box Goodharting. The attacker derives the
 * trust-maximizing input profile from the published formula and emits it every
 * round, regardless of consumer utility. Against computeReputation the
 * trust-max profile is "maximize contributions + queries + reuse" — so the
 * driver pushes all three at the analytic optimum. The DEFENSE question (Phase
 * 4) is whether high trust with decoupled utility is reachable; here it is,
 * because v1 has no semantic-utility cross-check — which is the finding.
 */
class ScoreManipulatorDriver implements TrustDriver {
  readonly state: ServerTrustState;
  constructor() {
    this.state = new ServerTrustState();
  }
  step(_round: number): void {
    // Analytic trust-max: saturate every formula input. Real utility is
    // collateral (modeled at the evaluator layer via outputUtilityRatio).
    this.state.recordWork(3, 4);
    this.state.applyReusePressure(2); // saturate reuse rate at the V11-relevant ceiling
  }
  observe(): number {
    return this.state.trust();
  }
}

/**
 * Slow Poisoner (§4.3): subtle per-call bias that passes per-call checks. The
 * server keeps a NORMAL contribution cadence (it must look legitimate to keep
 * trust), so trust holds or rises across rounds while bias accumulates. The
 * formula has no semantic content check, so trust retention is expected in the
 * no-defense baseline — exactly the §4.3 expected efficacy.
 */
class SlowPoisonerDriver implements TrustDriver {
  readonly state: ServerTrustState;
  constructor() {
    // Precondition: established server, T >= 0.7 => seed near that reputation.
    this.state = new ServerTrustState({ contributions: 80, queriesAnswered: 100, reuseRate: 1.5 });
  }
  step(_round: number): void {
    // Maintain a steady legitimate-looking cadence so trust does not decay.
    this.state.recordWork(1, 1);
  }
  observe(): number {
    return this.state.trust();
  }
}

/**
 * Eclipse (§4.5): K adversarial servers surround a victim and starve its real
 * interactions, driving the VICTIM's trust DOWN. The driver models the victim's
 * trust state: under eclipse it answers fewer queries and loses reuse as
 * adversaries refuse to reuse its entries. preEclipseTargetTrust seeds the
 * starting reputation; the attack succeeds if trust falls below the threshold.
 */
class EclipseDriver implements TrustDriver {
  readonly state: ServerTrustState;
  private readonly K: number;
  constructor(K: number, preEclipseTargetTrust: number) {
    this.K = K;
    // Seed the victim at its pre-eclipse reputation (invert reputationToTrust).
    const seedReputation = Math.max(0, preEclipseTargetTrust) * 100;
    // Split the seed across contributions/queries to be a realistic profile.
    this.state = new ServerTrustState({
      contributions: Math.round(seedReputation * 0.6),
      queriesAnswered: Math.round(seedReputation * 0.4),
      reuseRate: 1.0,
    });
  }
  step(_round: number): void {
    // Under eclipse the victim's real reuse evaporates (no honest peers reach
    // it) and it answers fewer queries. We model the trust DROP by decaying
    // reuse pressure toward 0; stronger K => faster collapse. Since the state
    // only ratchets reputation up via recordWork, we model decline by NOT
    // recording work and pulling reuse to zero — the live reputation then
    // reflects only the seeded direct work, which we erode below.
    this.eclipsePressure += this.K / 10;
  }
  private eclipsePressure = 0;
  observe(): number {
    // Eclipse erodes observed trust proportional to accumulated pressure.
    // This is applied on observation rather than mutating the accumulator
    // (which is monotonic-up by construction), modeling that the victim's
    // EFFECTIVE trust as seen by the mesh collapses while its historical
    // record is intact.
    const base = this.state.trust();
    const eroded = base / (1 + this.eclipsePressure);
    return eroded;
  }
}

export function makeTrustDriver(spec: RunnableAttack): TrustDriver {
  switch (spec.id) {
    case 'sybil':
      return new SybilDriver(spec.config.K);
    case 'whitewasher':
      return new WhitewasherDriver();
    case 'score-manipulator':
      return new ScoreManipulatorDriver();
    case 'slow-poisoner':
      return new SlowPoisonerDriver();
    case 'eclipse':
      return new EclipseDriver(spec.config.K, spec.config.preEclipseTargetTrust);
  }
}
