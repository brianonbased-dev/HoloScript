/**
 * Lowering bridge: HoloScript `@unknown` surface annotation → `Uncertain<T>` (RFC stage 2d).
 *
 * The grammar authority (packages/compiler-wasm) parses `@unknown` on a trait field and captures
 * it in the AST as `PropertyNode.annotations: ["unknown"]`, with the independent `?` presence
 * marker in `PropertyNode.optional`. Its docs promise: "A field marked `@unknown` lowers to
 * `Uncertain<T>` (@holoscript/meaning)". THIS module is that lowering — the first and only
 * meaning→grammar coupling, kept structural on purpose:
 *
 * - The input type below is a STRUCTURAL SUBSET of the wasm AST's PropertyNode, declared locally,
 *   never imported from compiler-wasm. `@holoscript/meaning` has zero runtime dependencies, and a
 *   dependency on the WASM package would drag a binary artifact into every downstream consumer of
 *   the meaning contract (uaal, absorb-service, the graders). Drift between this subset and the
 *   real AST is guarded by the end-to-end test (`lower-unknown-wasm-e2e.test.ts`), which parses
 *   real source with the real artifact — reality-shaped, not type-shaped (D.130).
 *
 * - Emitter-side lowering was investigated and deliberately REJECTED: trait fields reach neither
 *   the Kotlin emitter (traits emit nothing there) nor the bytecode emitter (traits are
 *   hard-rejected before any field walk), so an emitter-side Uncertain type would be dark code
 *   with no consumer (D.135). The honest lowering seam is here, where `Uncertain<T>` lives.
 *
 * WHY `underdetermined`: a bare `@unknown` is an author DECLARING ignorance without stating why —
 * reducible by construction (some later fact could resolve it), which is exactly the
 * `underdetermined` epistemic bucket. It is NOT aleatoric: an author asserting irreducible
 * randomness is a stronger claim than `@unknown` makes. No structured gap is attached — gap codes
 * are family-scoped resolver vocabulary (family-admission gate, spec §4.2), and a surface
 * declaration has no resolver family; minting a pseudo-family here would dilute that contract.
 */

import type { Uncertain } from './uncertain';
import { unknown } from './uncertain';

/**
 * Structural subset of the grammar authority's `PropertyNode` JSON — only what lowering needs.
 * Field names and shapes are pinned by the e2e test against the real WASM artifact.
 */
export interface LowerableField {
  key: string;
  /** `true` when the field carried the `Type?` presence marker (may be ABSENT). */
  optional?: boolean;
  /** Field-level annotations, e.g. `["unknown"]`. Bare names, no `@` prefix, per the AST JSON. */
  annotations?: string[];
  /** The field's value node; for a typed declaration this is its type identifier. */
  value?: { type?: string; name?: string } | null;
}

/** The lowered form of one `@unknown` field declaration. */
export interface UnknownFieldLowering {
  key: string;
  /** Declared type name when the field's value is a bare type identifier (`reading: Temperature`). */
  typeName: string | null;
  /**
   * The `?` axis, carried through UNTOUCHED. Presence (`?` — may be absent) and epistemic state
   * (`@unknown` — present but possibly unknown) are different claims; collapsing them is the
   * Option-conflation this whole feature exists to end.
   */
  optional: boolean;
  /**
   * The field's initial epistemic state: honestly unknown, reason `underdetermined`, until some
   * runtime fact or resolver verdict replaces it with `known(value)`. Typed `Uncertain<never>`
   * because at declaration time there is no value of T to carry — only the ignorance.
   */
  initial: Uncertain<never>;
}

/**
 * Lower one parsed field. Returns the lowering for an `@unknown`-annotated field, or `null` for a
 * plain field (which has no epistemic state to lower — `null` here means "not an @unknown field",
 * and is unrelated to the field's own value).
 */
export function lowerUnknownField(field: LowerableField): UnknownFieldLowering | null {
  if (!field.annotations?.includes('unknown')) {
    return null;
  }
  const value = field.value;
  const typeName =
    value && value.type === 'Identifier' && typeof value.name === 'string' ? value.name : null;
  return {
    key: field.key,
    typeName,
    optional: field.optional === true,
    initial: unknown('underdetermined'),
  };
}

/** Lower every `@unknown` field in a parsed trait config's property list. */
export function lowerUnknownFields(fields: readonly LowerableField[]): UnknownFieldLowering[] {
  const lowered: UnknownFieldLowering[] = [];
  for (const field of fields) {
    const result = lowerUnknownField(field);
    if (result !== null) {
      lowered.push(result);
    }
  }
  return lowered;
}
