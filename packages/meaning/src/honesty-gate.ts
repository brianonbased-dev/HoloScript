/**
 * The runtime honesty gate (Wave 5.1, first-class-ignorance stage 3): before an action COMMITS,
 * its epistemic prerequisites must be KNOWN — otherwise the honest move is to abstain, with the
 * typed reasons, and let the caller escalate/inspect instead of acting on values nobody
 * established.
 *
 * This is the runtime face of the same contract the compiler enforces statically (`@unknown`
 * without `??` is a compile error) and training enforces behaviorally (resolver-graded abstention
 * rewards). One vocabulary end to end: an `@unknown` field lowers to `Uncertain` via
 * `lowerUnknownField`; a resolver verdict becomes `Uncertain` via `fromResolution` — so ONE gate
 * covers both "this field was declared unknown and nothing resolved it yet" and "the beneficiary
 * resolver came back unresolvable" (the 5.1 floor) with no translation.
 *
 * Design rules, deliberate:
 * - The gate is the SINGLE unwrap point. On `proceed` it hands the caller plain extracted values,
 *   so consumer code never touches `.value` directly and cannot "just read" an unknown.
 * - On `abstain` it reports ALL blocking prerequisites, not the first — an escalation needs the
 *   complete picture, and a partial list invites fix-one-retry loops.
 * - Each blocker carries the epistemic/aleatoric distinction (`isAleatoric`): an epistemic unknown
 *   means GO FIND THE FACT; an aleatoric one means NO FACT WILL HELP — decide under uncertainty
 *   explicitly. Collapsing those into one "unknown" would erase exactly the distinction the
 *   contract.ts taxonomy exists to keep.
 * - Pure, deterministic, serializable — the decision IS the receipt payload.
 */

import type { MeaningGapReason, MeaningStructuredGap } from './contract';
import type { Uncertain } from './uncertain';
import { isAleatoric } from './uncertain';

/** One epistemic prerequisite that blocked an action. */
export interface HonestyBlocker {
  /** The prerequisite's name in the caller's `requires` record. */
  readonly key: string;
  readonly reason: MeaningGapReason;
  /** Family-scoped structured gap when the unknown came from a resolver verdict. */
  readonly gap?: MeaningStructuredGap;
  /**
   * `true` when the unknown is irreducible (no additional fact resolves it). Escalation policy
   * differs: epistemic → investigate; aleatoric → decide under explicit uncertainty.
   */
  readonly aleatoric: boolean;
}

export type HonestyDecision =
  | {
      readonly decision: 'proceed';
      /** The extracted known values — the gate is the single unwrap point. */
      readonly values: Record<string, unknown>;
    }
  | {
      readonly decision: 'abstain';
      /** EVERY blocking prerequisite, with typed reasons — the complete escalation picture. */
      readonly blocking: readonly HonestyBlocker[];
    };

/**
 * Gate an action on its epistemic prerequisites. `proceed` iff EVERY required value is known;
 * otherwise `abstain` with all blockers. An empty `requires` proceeds trivially — an action with
 * no epistemic prerequisites has nothing to be honest about.
 */
export function honestyGate(requires: Record<string, Uncertain<unknown>>): HonestyDecision {
  const blocking: HonestyBlocker[] = [];
  const values: Record<string, unknown> = {};
  for (const [key, state] of Object.entries(requires)) {
    if (state.known) {
      values[key] = state.value;
    } else {
      blocking.push({
        key,
        reason: state.reason,
        ...(state.gap !== undefined ? { gap: state.gap } : {}),
        aleatoric: isAleatoric(state),
      });
    }
  }
  return blocking.length === 0
    ? { decision: 'proceed', values }
    : { decision: 'abstain', blocking };
}
