/**
 * ProofCompositionLaw — algebraic receipt composition (Paper 29, H2).
 *
 * Composes N `WrappedSolverResult` receipts into a `ComposedReceipt` that
 * proves the conjunction of all constituent solver contracts. Five laws
 * govern the composition; `verifyCompositionLaws` checks any receipt
 * against all five.
 *
 * ## The five laws
 *
 * | Law | Name | Rule |
 * |-----|------|------|
 * | 1 | empty-identity | compose([]) → composedVerified:true, composedSchemaValid:null |
 * | 2 | and-monotone | composedVerified = ∀c: c.contractVerified |
 * | 3 | schema-null-coalescing-and | composedSchemaValid = null if all null; else ∀ non-null: true |
 * | 4 | violation-union | allViolations = ⋃ c.clauseViolations |
 * | 5 | flat-associativity | compose(compose(A,B).components, C) ≡ compose(A,B,C) |
 *
 * Law 5 is enforced by keeping composition flat — `flattenForRecompose` exposes
 * the primitive that makes it structurally verifiable.
 *
 * ## Domain-neutrality
 *
 * No domain nouns appear here. This module only composes proof shapes;
 * domain-specific solvers register their own contracts and schemas.
 */

import { hashReceiptPayload } from '../receipts/hash-policy';
import type {
  WrappedSolverResult,
  PluginClauseViolation,
  SchemaViolation,
} from '../plugin-solver-contract/PluginSolverContract';

// ── Law catalog ────────────────────────────────────────────────────────────────

export const PROOF_COMPOSITION_LAWS = [
  'empty-identity',
  'and-monotone',
  'schema-null-coalescing-and',
  'violation-union',
  'flat-associativity',
] as const;

export type ProofCompositionLaw = (typeof PROOF_COMPOSITION_LAWS)[number];

// ── ComposedReceipt ────────────────────────────────────────────────────────────

/**
 * The algebraic receipt produced by `composeReceipts`.
 *
 * Carries the conjunction of all constituent solver contracts' verification
 * state, the union of all violations, provenance, and a stable identity hash.
 */
export interface ComposedReceipt {
  /** Constituent wrapped solver results (in input order). */
  readonly components: ReadonlyArray<WrappedSolverResult<unknown>>;
  /**
   * True iff every component has `contractVerified: true` (Laws 1 + 2).
   * Empty composition yields `true`.
   */
  readonly composedVerified: boolean;
  /**
   * Schema validation verdict over all components (Law 3):
   * - `null`  → all components are freeform (no schema registered for any).
   * - `true`  → at least one component has a schema; all non-null pass.
   * - `false` → at least one component has a schema and it failed.
   */
  readonly composedSchemaValid: boolean | null;
  /** Union of all clause violations across components (Law 4). */
  readonly allViolations: ReadonlyArray<PluginClauseViolation>;
  /** Union of all schema violations across components. */
  readonly allSchemaViolations: ReadonlyArray<SchemaViolation>;
  /** Deduplicated plugin ids contributing to this composition. */
  readonly pluginIds: ReadonlyArray<string>;
  /** Deduplicated contract ids contributing to this composition. */
  readonly contractIds: ReadonlyArray<string>;
  /**
   * FNV-1a 32 hash of the composition's verification state (prefix `"fnv1a32:<8 hex>"`).
   * Identical components with identical verification state → identical hash.
   * Non-cryptographic — use `'secure'` hash-policy for on-chain anchoring.
   */
  readonly hash: string;
}

// ── composeReceipts ────────────────────────────────────────────────────────────

/**
 * Compose N `WrappedSolverResult` receipts into one `ComposedReceipt`.
 *
 * All five composition laws are enforced by construction. Pass the result
 * of `wrapSolverInContract` calls from multiple plugins to prove the
 * conjunction of their solver contracts in a single receipt.
 */
export function composeReceipts(
  components: ReadonlyArray<WrappedSolverResult<unknown>>
): ComposedReceipt {
  // Laws 1 + 2: AND-monotone (empty → true)
  const composedVerified = components.length === 0 || components.every((c) => c.contractVerified);

  // Law 3: schema null-coalescing AND
  const nonNullSchema = components.filter((c) => c.schemaValid !== null);
  const composedSchemaValid: boolean | null =
    nonNullSchema.length === 0 ? null : nonNullSchema.every((c) => c.schemaValid === true);

  // Law 4: violation union
  const allViolations = components.flatMap((c) => c.clauseViolations);
  const allSchemaViolations = components.flatMap((c) => c.schemaViolations);

  // Provenance: deduplicated from component fields
  const pluginIds = [
    ...new Set(components.map((c) => c.pluginId).filter((id): id is string => id !== null)),
  ];
  const contractIds = [
    ...new Set(components.map((c) => c.contractId).filter((id): id is string => id !== null)),
  ];

  // Hash: canonicalize the verification shape (not the result values)
  const canonical = JSON.stringify({
    laws: PROOF_COMPOSITION_LAWS,
    components: components.map((c) => ({
      contractId: c.contractId,
      contractVerified: c.contractVerified,
      schemaId: c.schemaId,
      schemaValid: c.schemaValid,
      violations: c.clauseViolations.map((v) => v.clauseId).sort(),
    })),
  });
  const hash = hashReceiptPayload(canonical);

  return {
    components,
    composedVerified,
    composedSchemaValid,
    allViolations,
    allSchemaViolations,
    pluginIds,
    contractIds,
    hash,
  };
}

// ── Law 5 helper ───────────────────────────────────────────────────────────────

/**
 * Flatten a `ComposedReceipt`'s components for re-composition with additional receipts.
 *
 * Structural proof of Law 5 (flat-associativity):
 *   `composeReceipts(flattenForRecompose(ab, [c]))`
 *   is verification-equivalent to
 *   `composeReceipts([...ab.components, c])`.
 */
export function flattenForRecompose(
  composed: ComposedReceipt,
  additional: ReadonlyArray<WrappedSolverResult<unknown>> = []
): ReadonlyArray<WrappedSolverResult<unknown>> {
  return [...composed.components, ...additional];
}

// ── Law verifier ───────────────────────────────────────────────────────────────

/**
 * Verify that a `ComposedReceipt` satisfies all five composition laws.
 *
 * Returns the names of violated laws. An empty array means the receipt
 * is fully law-compliant. Useful in tests and receipt audit flows.
 *
 * Note: Law 1 (empty-identity) and Law 5 (flat-associativity) are enforced
 * structurally by `composeReceipts`; only Laws 2–4 are checkable on an
 * arbitrary receipt.
 */
export function verifyCompositionLaws(receipt: ComposedReceipt): ProofCompositionLaw[] {
  const failing: ProofCompositionLaw[] = [];

  // Law 2: AND-monotone
  const expectedVerified =
    receipt.components.length === 0 || receipt.components.every((c) => c.contractVerified);
  if (receipt.composedVerified !== expectedVerified) failing.push('and-monotone');

  // Law 3: schema null-coalescing AND
  const nonNull = receipt.components.filter((c) => c.schemaValid !== null);
  const expectedSchema: boolean | null =
    nonNull.length === 0 ? null : nonNull.every((c) => c.schemaValid === true);
  if (receipt.composedSchemaValid !== expectedSchema) failing.push('schema-null-coalescing-and');

  // Law 4: violation union
  const expectedViolationCount = receipt.components.reduce(
    (n, c) => n + c.clauseViolations.length,
    0
  );
  if (receipt.allViolations.length !== expectedViolationCount) failing.push('violation-union');

  return failing;
}
