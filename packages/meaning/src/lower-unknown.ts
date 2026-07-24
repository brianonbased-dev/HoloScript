/**
 * Lowering bridge: HoloScript `@unknown` surface annotation → `Uncertain<T>` (RFC stage 2d).
 *
 * The grammar authority (packages/compiler-wasm) parses `@unknown` on trait properties and native
 * struct fields. Trait properties carry `PropertyNode.annotations`; structs carry aligned
 * `field_annotations`. The independent `?` presence marker remains a separate axis. Its docs
 * promise: "A field marked `@unknown` lowers to
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
 * - Trait fields still lower here because they do not reach a runtime emitter. Native `.hs`
 *   struct fields additionally lower to compiler-native's tagged inline carrier and honesty
 *   primitives. Kotlin fails closed until it has an equivalent carrier; no target may erase
 *   `Uncertain<T>` to its payload type.
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
  /** Declared default AST node from `name: Type = expr` (grammar stage 4), when present. */
  default_value?: unknown | null;
}

/**
 * Canonical aligned struct declaration consumed by `lowerUnknownStructFields`.
 *
 * The first three arrays mirror compiler-wasm's native `StructDeclarationNode` JSON. Compatibility
 * adapters may additionally supply aligned presence/default metadata; native callers omit those
 * arrays and retain their historical `false`/`null` lowering.
 */
export interface LowerableStructDeclaration {
  name: string;
  fields: string[];
  /** Empty for legacy records; otherwise aligned 1:1 with `fields`. */
  field_types?: Array<string | null>;
  /** Empty when unannotated; otherwise aligned 1:1 with `fields`. */
  field_annotations?: string[][];
  /** Empty for native records; otherwise aligned 1:1 with `fields`. */
  field_optional?: boolean[];
  /** Empty for native records; otherwise aligned 1:1 with `fields`. */
  field_defaults?: Array<unknown | null>;
}

/**
 * A typed field produced by the HoloScript+ struct parser.
 *
 * HoloScript+ keeps fields object-shaped for TypeScript-like consumers while compiler-wasm uses
 * aligned arrays. This compatibility shape intentionally contains no epistemic behavior; the
 * adapter below normalizes it into `LowerableStructDeclaration` and delegates to the canonical
 * lowering.
 */
export interface LowerableHSPlusTypedStructField {
  projection: 'typed';
  name: string;
  type: string;
  /** Bare annotation names, without the source `@` prefix. */
  annotations?: string[];
  /** Present only when the source used the independent `?` presence marker. */
  optional?: true;
  /** Exact authored initializer source after `=`, not an evaluated value. */
  defaultSource?: string;
}

/**
 * A field whose source is preserved for compatibility but was not admitted as a typed field.
 *
 * Opaque fields intentionally expose no type or annotations. That prevents lowering from
 * manufacturing epistemic meaning from source the parser did not structurally admit.
 */
export interface LowerableHSPlusOpaqueStructField {
  projection: 'preserved-opaque';
  name: string;
  /** Preserved source syntax only; opaque fields never enter epistemic lowering. */
  optional?: true;
  type?: never;
  annotations?: never;
  defaultSource?: never;
}

export type LowerableHSPlusStructField =
  | LowerableHSPlusTypedStructField
  | LowerableHSPlusOpaqueStructField;

/**
 * Structural subset of a HoloScript+ struct node.
 *
 * `body` is retained by the parser for legacy/raw-body consumers. Lowering never reparses it:
 * only structured fields can carry an exact, auditable annotation-to-field binding.
 */
export interface LowerableHSPlusStructDeclaration {
  name: string;
  fields: LowerableHSPlusStructField[];
  body?: string;
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
   *
   * DELIBERATE: this stays unknown even when `declaredDefault` is present. A fallback is not
   * knowledge — the compiler admits bare reads of a defaulted `@unknown` field because a
   * fallback exists BY CONSTRUCTION, not because the value became known. Runtime consumers
   * apply the default explicitly (`orElse(initial, declaredDefault)`), keeping the epistemic
   * state and the fallback separable in receipts.
   */
  initial: Uncertain<never>;
  /**
   * The declared default's AST node or exact authored source when the field wrote `= expr` — the
   * declaration-level fallback the compile-time guard credits. `null` when no default was
   * declared. Passed through raw, never evaluated: interpreting expressions is the consumer's
   * runtime's job, not the bridge's.
   */
  declaredDefault: unknown | null;
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
    declaredDefault: field.default_value ?? null,
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

/**
 * Lower every `@unknown` field in an aligned structured record.
 *
 * Native records omit the optional/default arrays, so those outputs remain deliberately
 * `false`/`null`. HoloScript+ supplies the arrays through its structural adapter. In both cases the
 * declaration denotes the same uncertainty-bearing field semantics.
 */
export function lowerUnknownStructFields(
  declaration: LowerableStructDeclaration
): UnknownFieldLowering[] {
  const lowered: UnknownFieldLowering[] = [];
  for (let index = 0; index < declaration.fields.length; index += 1) {
    if (!declaration.field_annotations?.[index]?.includes('unknown')) {
      continue;
    }
    lowered.push({
      key: declaration.fields[index],
      typeName: declaration.field_types?.[index] ?? null,
      optional: declaration.field_optional?.[index] === true,
      initial: unknown('underdetermined'),
      declaredDefault: declaration.field_defaults?.[index] ?? null,
    });
  }
  return lowered;
}

/**
 * Lower HoloScript+ object-shaped struct fields through the canonical struct-field semantics.
 *
 * This is deliberately an adapter, not a second implementation of `@unknown`: exact field order,
 * names, declared types, and annotations are converted to compiler-wasm's aligned representation
 * before `lowerUnknownStructFields` performs the epistemic lowering. Legacy raw-body content with
 * an empty structured field list therefore lowers to no fields rather than being heuristically
 * reparsed. Type-syntax admission remains the HoloScript+ parser's responsibility: this boundary
 * validates the parser-produced projection's runtime shape and canonical spelling, but does not
 * duplicate or independently certify the parser's bounded type grammar.
 */
export function lowerUnknownHSPlusStructFields(
  declaration: LowerableHSPlusStructDeclaration
): UnknownFieldLowering[] {
  if (!Array.isArray(declaration.fields)) {
    throw new TypeError('HoloScript+ struct fields must be an array');
  }

  const names = new Set<string>();
  for (const candidate of declaration.fields as unknown[]) {
    if (typeof candidate !== 'object' || candidate === null) {
      throw new TypeError('HoloScript+ struct field must be an object');
    }
    const field = candidate as Record<string, unknown>;
    if (typeof field.name !== 'string' || field.name.trim().length === 0) {
      throw new TypeError('HoloScript+ struct field name must be a non-empty string');
    }
    if (field.name !== field.name.trim()) {
      throw new TypeError(
        `HoloScript+ struct field name "${field.name}" must use canonical whitespace`
      );
    }
    if (names.has(field.name)) {
      throw new TypeError(
        `Duplicate HoloScript+ struct field "${field.name}" makes annotation binding ambiguous`
      );
    }
    names.add(field.name);

    if (
      field.projection !== 'typed' &&
      Array.isArray(field.annotations) &&
      field.annotations.includes('unknown')
    ) {
      throw new TypeError(
        `@unknown field "${field.name}" requires projection "typed"; opaque source cannot carry epistemic meaning`
      );
    }

    if (field.projection === 'preserved-opaque') {
      if ('type' in field || 'annotations' in field) {
        throw new TypeError(
          `Opaque HoloScript+ struct field "${field.name}" cannot carry type or annotations`
        );
      }
      if (field.optional !== undefined && field.optional !== true) {
        throw new TypeError(
          `Opaque HoloScript+ struct field "${field.name}" optional must be true or omitted`
        );
      }
      if ('defaultSource' in field) {
        throw new TypeError(
          `Opaque HoloScript+ struct field "${field.name}" cannot carry a default initializer`
        );
      }
      continue;
    }

    if (field.projection !== 'typed') {
      throw new TypeError(
        `HoloScript+ struct field "${field.name}" has unsupported projection "${String(field.projection)}"`
      );
    }
    if (typeof field.type !== 'string' || field.type.trim().length === 0) {
      throw new TypeError(
        `Typed HoloScript+ struct field "${field.name}" requires a non-empty type`
      );
    }
    if (field.type !== field.type.trim()) {
      throw new TypeError(
        `Typed HoloScript+ struct field "${field.name}" type must use canonical whitespace`
      );
    }
    if (field.optional !== undefined && field.optional !== true) {
      throw new TypeError(
        `Typed HoloScript+ struct field "${field.name}" optional must be true or omitted`
      );
    }
    if (
      field.defaultSource !== undefined &&
      (typeof field.defaultSource !== 'string' || field.defaultSource.trim().length === 0)
    ) {
      throw new TypeError(
        `Typed HoloScript+ struct field "${field.name}" defaultSource must be a non-empty string`
      );
    }

    if (field.annotations !== undefined) {
      if (!Array.isArray(field.annotations)) {
        throw new TypeError(
          `Typed HoloScript+ struct field "${field.name}" annotations must be an array`
        );
      }
      const admitted = new Set<string>();
      for (const annotation of field.annotations) {
        if (typeof annotation !== 'string' || annotation !== 'unknown') {
          throw new TypeError(
            `Unsupported HoloScript+ struct field annotation @${String(annotation)} on "${field.name}"`
          );
        }
        if (admitted.has(annotation)) {
          throw new TypeError(
            `Duplicate HoloScript+ struct field annotation @${annotation} on "${field.name}"`
          );
        }
        admitted.add(annotation);
      }
    }
  }

  const fields = declaration.fields.filter(
    (field): field is LowerableHSPlusTypedStructField => field.projection === 'typed'
  );
  return lowerUnknownStructFields({
    name: declaration.name,
    fields: fields.map((field) => field.name),
    field_types: fields.map((field) => field.type),
    field_annotations: fields.map((field) => field.annotations ?? []),
    field_optional: fields.map((field) => field.optional === true),
    field_defaults: fields.map((field) => field.defaultSource ?? null),
  });
}
