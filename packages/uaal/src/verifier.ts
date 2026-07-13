/**
 * verifier.ts — the VERIFIER OF RECORD (roadmap Wave 0.1).
 *
 * The three-body loop only compounds honesty if the function that LABELS the training corpus is the
 * SAME function that RUNS at inference. If a corpus/reward builder re-implements a resolver (a regex
 * port of a check, say), every drift between the port and the shipped `resolve*` is silently baked
 * into the weights — you teach the model to satisfy a checker you do not ship. That is the deepest
 * correctness hole the roadmap critic surfaced.
 *
 * This module is the ONE sanctioned labeler: it imports the canonical `resolve*` for each gap-aware
 * family and returns its verdict as the ground-truth label for BOTH pretraining corpus rows AND
 * reward gold. Corpus and reward builders must route every label through `gradeByResolver` — never
 * compute their own. A `check:verifier-of-record` CI gate enforces "no ad-hoc labeling" downstream.
 *
 * Adding a gap-aware family (roadmap Wave 1) means adding one line to RESOLVERS and nothing else.
 *
 * @module @holoscript/uaal
 */

import type {
  UAALResolution,
  UAALGapReason,
  UAALStructuredGap,
  UAALContainmentIR,
  UAALDeonticIR,
  UAALCompositionIR,
  UAALAffordanceIR,
  UAALTemporalIR,
  UAALCommitmentIR,
  UAALCounterfactualIR,
  UAALMereologyIR,
  UAALTensionIR,
  UAALPresuppositionIR,
  UAALAnalogyIR,
} from './semantic';
import {
  resolveOcclusion,
  resolveNormStatus,
  resolveDischargeable,
  resolveAffords,
  resolveTemporal,
  resolveCommitment,
  resolveCounterfactual,
  resolveMereology,
  resolveTension,
  resolveAtomStatus,
  resolveAccess,
  resolveValidity,
} from './semantic';
import type { UAALBeneficiaryIR } from './beneficiary';
import { resolveBeneficiary } from './beneficiary';

/** The families that currently have a gap-aware resolver (can serve as a verifier of record). */
export type UAALResolvedFamily =
  | 'occlusion'
  | 'norm_status'
  | 'dischargeable'
  | 'affordance'
  | 'temporal'
  | 'commitment'
  | 'counterfactual'
  | 'mereology'
  | 'tension'
  | 'presupposition'
  | 'access'
  | 'analogy'
  | 'beneficiary';

/** Target ids some resolvers need alongside the IR (agent/object/action/norm/belief/commitment/atom). */
export interface VerifierQuery {
  agent?: string;
  action?: string;
  object?: string;
  normId?: string;
  belief?: string;
  fact?: string;
  commitment?: string;
  atom?: string;
}

/** The canonical label for one IR under its family resolver — the only ground truth a builder may use. */
export interface VerifierLabel {
  family: UAALResolvedFamily;
  status: 'resolved' | 'unresolvable';
  reason?: UAALGapReason;
  gap?: UAALStructuredGap;
  /** The resolver's answer when resolved (the family's Recovery type). */
  answer?: unknown;
}

/**
 * The single dispatch point: family → normalized resolver call. Uses `unknown`+cast (never `any`)
 * because each family's IR type differs; the cast is safe because the caller names the family.
 */
const RESOLVERS: Record<UAALResolvedFamily, (ir: unknown, query: VerifierQuery) => UAALResolution<unknown>> = {
  occlusion: (ir, q) => resolveOcclusion(ir as UAALContainmentIR, q.agent, q.object),
  norm_status: (ir, q) => resolveNormStatus(ir as UAALDeonticIR, q.normId),
  dischargeable: (ir) => resolveDischargeable(ir as UAALCompositionIR),
  affordance: (ir, q) => resolveAffords(ir as UAALAffordanceIR, q.agent, q.action, q.object),
  temporal: (ir, q) => resolveTemporal(ir as UAALTemporalIR, q.belief, q.fact),
  commitment: (ir, q) => resolveCommitment(ir as UAALCommitmentIR, q.commitment),
  counterfactual: (ir) => resolveCounterfactual(ir as UAALCounterfactualIR),
  mereology: (ir) => resolveMereology(ir as UAALMereologyIR),
  tension: (ir) => resolveTension(ir as UAALTensionIR),
  presupposition: (ir, q) => resolveAtomStatus(ir as UAALPresuppositionIR, q.atom),
  access: (ir, q) => resolveAccess(ir as UAALContainmentIR, q.agent, q.object),
  analogy: (ir) => resolveValidity(ir as UAALAnalogyIR),
  beneficiary: (ir) => resolveBeneficiary(ir as UAALBeneficiaryIR),
};

/** All families that can serve as a verifier of record. */
export const UAAL_RESOLVED_FAMILIES = Object.keys(RESOLVERS) as UAALResolvedFamily[];

/** True iff the family has a gap-aware resolver registered. */
export function hasResolver(family: string): family is UAALResolvedFamily {
  return Object.prototype.hasOwnProperty.call(RESOLVERS, family);
}

/**
 * Grade an IR by the CANONICAL resolver for its family — the ONLY sanctioned way to produce a
 * training/reward label. Returns the resolver's exact verdict; never re-derives. Throws on an
 * unknown family (fail loud: a builder must not silently fall back to its own labeler).
 */
export function gradeByResolver(
  family: UAALResolvedFamily,
  ir: unknown,
  query: VerifierQuery = {},
): VerifierLabel {
  const resolver = RESOLVERS[family];
  if (!resolver) {
    throw new Error(`no verifier-of-record resolver for family '${family}' (add it to RESOLVERS)`);
  }
  const resolution = resolver(ir, query);
  return {
    family,
    status: resolution.status,
    ...(resolution.reason !== undefined ? { reason: resolution.reason } : {}),
    ...(resolution.gap !== undefined ? { gap: resolution.gap } : {}),
    ...(resolution.answer !== undefined ? { answer: resolution.answer } : {}),
  };
}
