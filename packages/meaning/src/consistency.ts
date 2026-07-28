/**
 * Cross-family consistency — the meta-semantic layer above the family resolvers.
 *
 * WHY THIS EXISTS (language-architecture.md forward roadmap, inventiveness #3): the family
 * resolvers each answer WITHIN their own family. But a scene can hold facts that are individually
 * well-formed yet JOINTLY impossible — occluded-but-visible, contained-in-two-disjoint-wholes.
 * No family resolver catches that; a layer ABOVE them must. This is a language primitive most
 * languages don't have: cross-checking independent typed judgments for joint coherence.
 *
 * DESIGN: every check is CORRECT-BY-CONSTRUCTION — it delegates to the shipped resolvers and only
 * asserts a logically-forced relation between their verdicts. It reimplements NO family logic, so
 * it cannot drift from them (verifier-of-record discipline applied to meta-semantics). A check
 * asserts coherence only when BOTH resolvers commit; an abstention can never contradict a verdict,
 * so a check is vacuously coherent whenever either side is unresolvable.
 *
 * This is a first slice with one forced invariant (visual occlusion ⇒ not visually accessible),
 * built to grow: register more pairwise checks as the families interlock (containment⇒mereology,
 * spatial⇒containment). Each new check is a pure predicate over two resolutions + a runner.
 */

import type { MeaningResolution } from './contract';
import {
  resolveAccess,
  resolveOcclusion,
  type UAALContainmentIR,
  type OcclusionRecovery,
  type UAALAccessRecovery,
} from './semantic';

/** The verdict of one cross-family coherence check. `coherent:false` means the scene is impossible. */
export interface CoherenceVerdict {
  /** Stable check id, e.g. 'visual-occlusion⇒access'. */
  readonly check: string;
  readonly coherent: boolean;
  /** Human/agent-readable why. On a violation, names the contradiction. */
  readonly detail: string;
}

/**
 * PURE predicate (testable in isolation, no IR walk): an object hidden behind an opaque barrier
 * (occlusion resolved occluded:true) CANNOT be visually accessible (access resolved visual:true).
 * The two resolvers compute this from the same enclosing chain and are meant to agree; this asserts
 * the forced direction. Only the occluded⇒blocked direction is forced — access can be blocked by a
 * non-opaque `blocks:['visual']` entry that occlusion (opacity-only) does not see, so the converse
 * is NOT asserted (that would false-positive on legitimate scenes).
 */
export function occlusionImpliesNotVisible(
  occlusion: MeaningResolution<OcclusionRecovery>,
  access: MeaningResolution<UAALAccessRecovery>
): CoherenceVerdict {
  const check = 'visual-occlusion⇒access';
  if (occlusion.status !== 'resolved' || access.status !== 'resolved') {
    return {
      check,
      coherent: true,
      detail: 'vacuous — a resolver abstained, no verdict to contradict',
    };
  }
  const occluded = occlusion.answer?.occluded === true;
  const visuallyAccessible = access.answer?.access?.visual === true;
  if (occluded && visuallyAccessible) {
    return {
      check,
      coherent: false,
      detail: `impossible scene: object is occluded behind "${occlusion.answer?.occluder}" yet resolves visually accessible`,
    };
  }
  return {
    check,
    coherent: true,
    detail: occluded ? 'occluded and not visible — coherent' : 'not occluded',
  };
}

/**
 * Run the visual coherence check by resolving both families over one containment IR and one
 * (agent, object) query. Convenience wrapper over {@link occlusionImpliesNotVisible}.
 */
export function checkVisualCoherence(
  ir: UAALContainmentIR,
  agent: string | undefined,
  object: string | undefined
): CoherenceVerdict {
  return occlusionImpliesNotVisible(
    resolveOcclusion(ir, agent, object),
    resolveAccess(ir, agent, object)
  );
}

/** Aggregate verdict over every registered cross-family check for one containment-scene query. */
export interface CrossFamilyConsistency {
  readonly coherent: boolean;
  readonly checks: readonly CoherenceVerdict[];
  readonly violations: readonly CoherenceVerdict[];
}

/**
 * Run every registered cross-family check for a containment-scene query and aggregate. The scene is
 * coherent iff no check is violated. Built to grow: append checks here as families interlock.
 */
export function crossFamilyConsistency(
  ir: UAALContainmentIR,
  query: { agent?: string; object?: string }
): CrossFamilyConsistency {
  const checks: CoherenceVerdict[] = [checkVisualCoherence(ir, query.agent, query.object)];
  const violations = checks.filter((c) => !c.coherent);
  return { coherent: violations.length === 0, checks, violations };
}
