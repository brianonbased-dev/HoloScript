/**
 * EXP-1: IR-vs-NL context-efficiency + offload bench (D.053 → HoloScript-native-model thesis).
 *
 * Pre-registered, ZERO-GPU experiment that proves/kills the thesis's load-bearing
 * claims on the EXISTING inference path (no training, no GPU rent):
 *   C1 — HoloScript-IR representation costs fewer tokens at equal-or-higher pass-rate than NL.
 *   C2 — a smaller model + ecosystem offload retains task capability at lower resident params.
 *   C3 — outputs carry replayable provenance (CAEL) by construction.
 *
 * Three arms run the SAME tasks through the SAME inference seam:
 *   A — natural-language baseline (prompt in NL/source).
 *   B — HoloScript-IR (prompt in .holo / graph representation).
 *   C — smaller model + IR + live HoloGraph/GOLD retrieval (the "lite + offload" config).
 *
 * Grading is the REAL deterministic oracle: SimContractGate.verifySceneMutation
 * (packages/studio/src/lib/brittney/SimContractGate.ts). Token metering reuses the
 * shipped fleet-metric path; provenance coverage uses verify_cael_trace.
 *
 * Source: research/2026-06-02_holoscript-native-model-thesis.md (DELIVERABLE 5).
 * The harness is provider-agnostic by design — ArmModel is injected, so the logic
 * is unit-testable with a mock and the live provider (brittney/provider.ts) is a
 * thin adapter wired at run time.
 */

import type { SceneMutation, ResolvedContract } from '../../brittney/SimContractGate';

export type Arm = 'A' | 'B' | 'C';
export const ARMS: readonly Arm[] = ['A', 'B', 'C'] as const;

export const ARM_LABEL: Record<Arm, string> = {
  A: 'nl-baseline',
  B: 'holoscript-ir',
  C: 'small+offload',
};

export type BenchDomain =
  | 'trait-composition'
  | 'holo-authoring'
  | 'spatial-transform'
  | 'contract-bounds';

export interface BenchTask {
  id: string;
  domain: BenchDomain;
  /** HoloScript scene context the mutation is applied to (may declare a @simulation_contract). */
  sceneContext: string;
  /** The contract the scene declares, or null for an unscoped scene. Runner builds the resolver from this. */
  contract: ResolvedContract | null;
  /**
   * Tools that would correctly ACCOMPLISH the instruction. Anti-gaming: a no-op or
   * unrelated mutation that happens to pass the contract oracle does NOT count as a
   * task pass unless it also accomplishes the instruction.
   */
  acceptableTools: string[];
  /** Arm-specific phrasings of the SAME task. Arm C reuses the IR prompt (B) + offload in its model. */
  prompt: { A: string; B: string };
  /**
   * Optional value-correctness gate (EXP-1c). When present it REPLACES the
   * tool-only anti-gaming check: a mutation accomplishes the task iff accept()
   * returns true. Used by compute-requiring tasks where the right tool with a
   * WRONG value (a miscomputation that still satisfies the contract bounds) must
   * NOT count as a pass — that is what separates a 7B from a 1.5B on arithmetic.
   */
  accept?: (mutation: SceneMutation) => boolean;
}

/** A model arm turns a rendered prompt into a parsed scene mutation + token counts. */
export interface ArmModelResult {
  rawOutput: string;
  /** The mutation the model emitted, or null if it produced none / unparseable. */
  mutation: SceneMutation | null;
  inputTokens: number;
  outputTokens: number;
}

export type ArmModel = (
  prompt: string,
  ctx: { task: BenchTask; arm: Arm }
) => Promise<ArmModelResult>;

/** C3: fraction of a turn's output claims with a replayable CAEL source. */
export interface ProvenanceResult {
  totalClaims: number;
  tracedClaims: number;
}

export type ProvenanceChecker = (
  result: ArmModelResult,
  task: BenchTask
) => Promise<ProvenanceResult>;

export interface TaskArmOutcome {
  taskId: string;
  arm: Arm;
  /** oracle.passed AND the mutation accomplished the instruction. */
  passed: boolean;
  inputTokens: number;
  outputTokens: number;
  /** 0..1 — tracedClaims / totalClaims (1 when there are no claims to trace). */
  provenanceCoverage: number;
  oracleContractId: string;
  note?: string;
}

export interface ArmAggregate {
  arm: Arm;
  n: number;
  passRate: number;
  meanInputTokens: number;
  meanOutputTokens: number;
  provenanceCoverage: number;
}

export interface BenchReport {
  taskCount: number;
  arms: Record<Arm, ArmAggregate>;
  outcomes: TaskArmOutcome[];
}
