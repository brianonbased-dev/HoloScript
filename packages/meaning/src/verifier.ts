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
  UAALRateTest,
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
import type { MeaningResolutionStatus } from './contract';
import type { UAALBeneficiaryIR } from './beneficiary';
import { resolveBeneficiary } from './beneficiary';
import type { UAALVibeIR } from './vibe';
import { resolveVibe } from './vibe';

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
  | 'beneficiary'
  | 'vibe';

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
  status: MeaningResolutionStatus;
  reason?: UAALGapReason;
  gap?: UAALStructuredGap;
  /** The resolver's answer when resolved (the family's Recovery type). */
  answer?: unknown;
}

/**
 * The single dispatch point: family → normalized resolver call. Uses `unknown`+cast (never `any`)
 * because each family's IR type differs; the cast is safe because the caller names the family.
 */
const RESOLVERS: Record<
  UAALResolvedFamily,
  (ir: unknown, query: VerifierQuery) => UAALResolution<unknown>
> = {
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
  // Registered 2026-07-13 under the Wave-5.6 probe's fold gate: the resolver spends zero trunk
  // capacity; the vibe CORPUS FOLD stays gated on family-saturation-probe.v0 reaching a measured
  // verdict (task_1783916935077_6ps9).
  vibe: (ir) => resolveVibe(ir as UAALVibeIR),
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
  query: VerifierQuery = {}
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

/**
 * One verifier-owned fixture for the `uaal.gap-ir.v0` emission contract.
 *
 * The fixture keeps the source IR and query beside the intended disposition so
 * the benchmark re-derives every answer through {@link gradeByResolver}. This
 * prevents the schema registry from treating a model-emitted answer as
 * semantic merely because the envelope calls itself an IR.
 */
export interface UAALGapIRFixture {
  id: string;
  vertical: UAALResolvedFamily;
  oracle_ir: unknown;
  verifier_query?: VerifierQuery;
  intended: {
    status: MeaningResolutionStatus;
    reason?: UAALGapReason;
    code?: string;
    obstruction?: string;
    answer?: unknown;
  };
}

export interface UAALGapIREmission {
  schema: 'uaal.gap-ir.v0';
  scenarioId: string;
  query: string;
  status: MeaningResolutionStatus;
  answer?: unknown;
  reason?: UAALGapReason;
  code?: string;
  obstruction?: string;
}

export interface UAALGapIRBenchmarkResult {
  n: number;
  tests: {
    gap1_verifier_fidelity: UAALRateTest;
    gap2_schema_structure: UAALRateTest;
    gap3_branch_exclusivity: UAALRateTest;
    gap4_structural_falsification: UAALRateTest;
  };
  pass: boolean;
  misses: {
    fidelity: string[];
    structure: string[];
    falsification: string[];
  };
}

function gapRateTest(hits: number, total: number): UAALRateTest {
  const rate = total > 0 ? hits / total : 0;
  return { hits, total, rate, floor: 1, pass: total > 0 && rate === 1 };
}

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function gapAnswerMatchesIntended(actual: unknown, intended: unknown): boolean {
  if (
    typeof actual !== 'object' ||
    actual === null ||
    typeof intended !== 'object' ||
    intended === null ||
    Array.isArray(actual) ||
    Array.isArray(intended)
  ) {
    return sameJson(actual, intended);
  }
  const actualRecord = actual as Record<string, unknown>;
  return Object.entries(intended as Record<string, unknown>).every(([key, value]) => {
    if (key === 'human_floor') {
      return (
        (value === 'held' && actualRecord.humanFloorHeld === true) ||
        (value === 'breached' && actualRecord.humanFloorHeld === false)
      );
    }
    return sameJson(actualRecord[key], value);
  });
}

function gapLabelMatchesIntended(
  label: VerifierLabel,
  intended: UAALGapIRFixture['intended']
): boolean {
  if (label.status !== intended.status) return false;
  if (label.status === 'resolved') {
    return gapAnswerMatchesIntended(label.answer, intended.answer);
  }
  return label.reason === intended.reason && label.gap?.code === intended.code;
}

/** Encode the verifier's exact result into the public gap-emission contract. */
export function encodeGapIR(fixture: UAALGapIRFixture, label: VerifierLabel): UAALGapIREmission {
  const base = {
    schema: 'uaal.gap-ir.v0' as const,
    scenarioId: fixture.id,
    query: fixture.vertical,
    status: label.status,
  };
  if (label.status === 'resolved') {
    return { ...base, answer: label.answer };
  }
  return {
    ...base,
    ...(label.reason !== undefined ? { reason: label.reason } : {}),
    ...(label.gap?.code !== undefined ? { code: label.gap.code } : {}),
    ...(fixture.intended.obstruction !== undefined
      ? { obstruction: fixture.intended.obstruction }
      : {}),
  };
}

function gapStructureIsValid(emission: UAALGapIREmission): boolean {
  if (
    emission.schema !== 'uaal.gap-ir.v0' ||
    emission.scenarioId.length === 0 ||
    emission.query.length === 0
  ) {
    return false;
  }
  if (emission.status === 'resolved') {
    return (
      emission.answer !== undefined &&
      emission.reason === undefined &&
      emission.code === undefined &&
      emission.obstruction === undefined
    );
  }
  return (
    emission.answer === undefined &&
    emission.reason !== undefined &&
    emission.code !== undefined &&
    emission.obstruction !== undefined &&
    emission.obstruction.length > 0
  );
}

function gapSemanticSignature(label: VerifierLabel): string {
  return JSON.stringify({
    status: label.status,
    ...(label.status === 'resolved'
      ? { answer: label.answer }
      : { reason: label.reason, code: label.gap?.code }),
  });
}

/**
 * Semantic gate for `uaal.gap-ir.v0`.
 *
 * GAP1 re-derives every declared disposition through the shipped family
 * resolver. GAP2/GAP3 prove the emitted envelope has one legal branch. GAP4
 * substitutes a same-family fixture with the opposite disposition and requires
 * the re-derived semantic signature to change, making the T4 falsification
 * condition explicit rather than inferred from the schema name.
 */
export function benchmarkGapIR(rows: UAALGapIRFixture[]): UAALGapIRBenchmarkResult {
  const fixtures = rows.filter(
    (row): row is UAALGapIRFixture =>
      Boolean(row) &&
      typeof row.id === 'string' &&
      typeof row.vertical === 'string' &&
      hasResolver(row.vertical) &&
      row.oracle_ir !== undefined &&
      typeof row.intended === 'object' &&
      row.intended !== null
  );
  const labels = new Map<UAALGapIRFixture, VerifierLabel>();
  const misses = {
    fidelity: [] as string[],
    structure: [] as string[],
    falsification: [] as string[],
  };
  let fidelity = 0;
  let structure = 0;
  let exclusivity = 0;
  let falsification = 0;

  for (const fixture of fixtures) {
    const label = gradeByResolver(
      fixture.vertical,
      fixture.oracle_ir,
      fixture.verifier_query ?? {}
    );
    labels.set(fixture, label);
    const emission = encodeGapIR(fixture, label);

    if (gapLabelMatchesIntended(label, fixture.intended)) {
      fidelity++;
    } else if (misses.fidelity.length < 8) {
      misses.fidelity.push(
        `${fixture.id}: verifier=${gapSemanticSignature(label)} intended=${JSON.stringify(fixture.intended)}`
      );
    }
    if (gapStructureIsValid(emission)) {
      structure++;
    } else if (misses.structure.length < 8) {
      misses.structure.push(`${fixture.id}: invalid ${JSON.stringify(emission)}`);
    }
    if (
      (emission.status === 'resolved' && emission.answer !== undefined) ||
      (emission.status === 'unresolvable' &&
        emission.answer === undefined &&
        emission.reason !== undefined)
    ) {
      exclusivity++;
    }
  }

  for (const fixture of fixtures) {
    const opposite = fixtures.find(
      (candidate) =>
        candidate.vertical === fixture.vertical &&
        candidate.intended.status !== fixture.intended.status
    );
    const label = labels.get(fixture);
    const oppositeLabel = opposite ? labels.get(opposite) : undefined;
    if (
      label &&
      oppositeLabel &&
      gapSemanticSignature(label) !== gapSemanticSignature(oppositeLabel)
    ) {
      falsification++;
    } else if (misses.falsification.length < 8) {
      misses.falsification.push(`${fixture.id}: no opposite-disposition semantic flip`);
    }
  }

  const n = fixtures.length;
  const tests = {
    gap1_verifier_fidelity: gapRateTest(fidelity, n),
    gap2_schema_structure: gapRateTest(structure, n),
    gap3_branch_exclusivity: gapRateTest(exclusivity, n),
    gap4_structural_falsification: gapRateTest(falsification, n),
  };
  return {
    n,
    tests,
    pass: Object.values(tests).every((test) => test.pass),
    misses,
  };
}
