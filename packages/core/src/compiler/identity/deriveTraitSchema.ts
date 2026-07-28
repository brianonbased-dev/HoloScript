/**
 * deriveTraitSchema — turn a `.holo` `@trait` declaration into a machine-consumable
 * {@link TraitSchema} for prop-schema enforcement (enum-membership + declared type).
 *
 * WHY THIS EXISTS: 833 `.holo` traits declare `prop: enum("a" | "b") = "x"` and typed
 * scalars, but nothing enforced them — the enum/type engine ({@link ConfabulationValidator})
 * carried only 63 hand-written schemas, leaving ~770 native-enum traits unvalidated, and a
 * handful of traits hand-rolled their own "must be one of" checks (the F.154 anti-pattern).
 * This derives the schema from the `.holo` source-of-truth so the engine can see every trait
 * authors actually wrote. The `scripts/gen-trait-schemas.ts` CLI globs the trait tree and
 * emits `derived-trait-schemas.generated.ts` from this function; the logic lives here so it
 * is unit-testable and reusable, not buried in a build script.
 *
 * SCOPE: declared enum/type only. Range is intentionally NOT derived (`.holo` declares no
 * ranges) and behavioral correctness is out of reach of a schema (a `slerp`-tagged trait that
 * lerps is a semantic lie a schema cannot catch). Defaults are dropped by the parser's props
 * handling and are not needed for enum/type enforcement.
 *
 * @see scripts/gen-trait-schemas.ts
 * @see packages/core/src/compiler/identity/ConfabulationValidator.ts
 */
import { parseHolo } from '../../parser/HoloCompositionParser';
import type { TraitSchema, TraitPropertySchema, TraitPropertyType } from './ConfabulationValidator';

/** `.holo` scalar type keywords → the validator's {@link TraitPropertyType}. */
const SCALAR_TYPE_MAP: Readonly<Record<string, TraitPropertyType>> = {
  number: 'number',
  string: 'string',
  boolean: 'boolean',
  array: 'array',
  object: 'object',
  color: 'color',
  vector3: 'vector3',
  any: 'any',
};

/**
 * Extract enum members from a canonical `enum("a" | "b" | "c")` type-spec string
 * (as emitted by HoloCompositionParser.parseEnumTypeSpec). Members are quoted string
 * literals, so matching quoted substrings is exact regardless of separator spacing.
 */
export function parseEnumMembers(typeSpec: string): string[] {
  const open = typeSpec.indexOf('(');
  if (open === -1) return [];
  const inner = typeSpec.slice(open + 1);
  const matches = inner.match(/"([^"]*)"/g);
  return matches ? matches.map((m) => m.slice(1, -1)) : [];
}

/**
 * Map a `.holo` prop type-spec string to a validator property type (+ enum members).
 * Unknown type-specs fall back to `any` (never enforced) rather than guessing.
 */
export function mapPropType(typeSpec: unknown): { type: TraitPropertyType; enumValues?: string[] } {
  if (typeof typeSpec !== 'string') return { type: 'any' };
  if (typeSpec === 'enum' || typeSpec.startsWith('enum(')) {
    const enumValues = parseEnumMembers(typeSpec);
    // An enum with no recoverable members is not enforceable — treat as `any`.
    return enumValues.length > 0 ? { type: 'enum', enumValues } : { type: 'any' };
  }
  return { type: SCALAR_TYPE_MAP[typeSpec] ?? 'any' };
}

/** Minimal structural view of the parsed `@trait` node this function reads. */
interface ParsedTraitNode {
  config?: {
    name?: unknown;
    category?: unknown;
    props?: Record<string, unknown>;
  };
}

/**
 * Derive a {@link TraitSchema} from a single `.holo` source containing one `@trait`
 * declaration. Returns `null` when the source does not parse cleanly or has no
 * named `@trait` (callers skip nulls).
 */
export function deriveTraitSchemaFromHolo(source: string): TraitSchema | null {
  const result = parseHolo(source);
  if (result.errors.length > 0) return null;

  // Standalone `@trait` files surface the trait at the composition's top-level `traits`.
  const ast = result.ast as unknown as { traits?: ParsedTraitNode[] } | null;
  const traitNode = ast?.traits?.[0];
  const config = traitNode?.config;
  if (!config) return null;

  const rawName = typeof config.name === 'string' ? config.name : '';
  const name = rawName.replace(/^@/, '').trim();
  if (!name) return null;

  const category = typeof config.category === 'string' ? config.category : 'uncategorized';

  const properties: TraitPropertySchema[] = [];
  for (const [propName, typeSpec] of Object.entries(config.props ?? {})) {
    // Nested-object prop declarations (non-string type-spec) are not schema-enforceable here.
    if (typeof typeSpec !== 'string') continue;
    const { type, enumValues } = mapPropType(typeSpec);
    const schema: TraitPropertySchema = { name: propName, type };
    if (enumValues) schema.enumValues = enumValues;
    properties.push(schema);
  }

  return { name, category, properties };
}

/**
 * How two+ derived schemas sharing one trait name diverge — drives Phase 2 conflict triage.
 * - `enum-divergent` / `prop-superset`: UNION-SAFE. Merging (accept any value valid in any
 *   variant) never false-rejects; it only misses cross-variant confusion (the safe direction).
 * - `type-conflict`: a shared prop has different types across variants — which wins is a real
 *   judgment; not union-safe.
 * - `disjoint`: variants share <50% of prop names — likely GENUINELY DIFFERENT traits colliding
 *   on one handler name; needs a rename, not a merge.
 */
export type TraitConflictCategory =
  | 'enum-divergent'
  | 'prop-superset'
  | 'type-conflict'
  | 'disjoint';

function propByName(s: TraitSchema): Map<string, TraitPropertySchema> {
  return new Map(s.properties.map((p) => [p.name, p]));
}

/** Categorize a set of same-named derived schema variants. Assumes ≥2 non-identical variants. */
export function categorizeTraitConflict(variants: TraitSchema[]): TraitConflictCategory {
  let anyTypeConflict = false;
  let anyEnumDivergent = false;
  let minJaccard = 1;
  for (let i = 0; i < variants.length; i++) {
    for (let j = i + 1; j < variants.length; j++) {
      const a = propByName(variants[i]);
      const b = propByName(variants[j]);
      const keysA = new Set(a.keys());
      const keysB = new Set(b.keys());
      const inter = [...keysA].filter((k) => keysB.has(k)).length;
      const union = new Set([...keysA, ...keysB]).size;
      minJaccard = Math.min(minJaccard, union === 0 ? 1 : inter / union);
      for (const [name, pa] of a) {
        const pb = b.get(name);
        if (!pb) continue;
        if (pa.type !== pb.type) anyTypeConflict = true;
        else if (pa.type === 'enum') {
          const ea = (pa.enumValues ?? []).slice().sort().join('|');
          const eb = (pb.enumValues ?? []).slice().sort().join('|');
          if (ea !== eb) anyEnumDivergent = true;
        }
      }
    }
  }
  if (anyTypeConflict) return 'type-conflict';
  if (minJaccard < 0.5) return 'disjoint';
  if (anyEnumDivergent) return 'enum-divergent';
  return 'prop-superset';
}

/** enum-divergent and prop-superset can be safely merged by union; type-conflict/disjoint cannot. */
export function isUnionSafeConflict(category: TraitConflictCategory): boolean {
  return category === 'enum-divergent' || category === 'prop-superset';
}

/**
 * Merge union-safe same-named variants into one schema: union of props by name, and per shared
 * enum prop the union of enumValues. Never narrows, so it cannot false-reject a value that was
 * valid in any variant. A prop whose type genuinely differs across variants (should not occur for
 * union-safe inputs) is emitted as `any` (unenforceable) rather than guessing a winner.
 */
export function mergeTraitSchemas(variants: TraitSchema[]): TraitSchema {
  const name = variants[0].name;
  const category =
    variants.find((v) => v.category && v.category !== 'uncategorized')?.category ??
    variants[0].category;
  const merged = new Map<string, TraitPropertySchema>();
  for (const variant of variants) {
    for (const prop of variant.properties) {
      const existing = merged.get(prop.name);
      if (!existing) {
        merged.set(prop.name, {
          ...prop,
          enumValues: prop.enumValues ? [...prop.enumValues] : undefined,
        });
        continue;
      }
      if (existing.type !== prop.type) {
        merged.set(prop.name, { name: prop.name, type: 'any' });
        continue;
      }
      if (existing.type === 'enum') {
        const union = new Set([...(existing.enumValues ?? []), ...(prop.enumValues ?? [])]);
        existing.enumValues = [...union].sort((a, b) => a.localeCompare(b));
      }
    }
  }
  return { name, category, properties: [...merged.values()] };
}
