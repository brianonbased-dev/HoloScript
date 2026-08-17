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
 * SCOPE: declared enum/type, the declared `= default`, plus the per-property authoring
 * affordances a trait declares in its `ui:` block (label / range / step / hidden — see
 * {@link applyUiEntry}). Behavioral correctness stays out of reach of a schema (a
 * `slerp`-tagged trait that lerps is a semantic lie a schema cannot catch).
 *
 * DEFAULTS: previously "dropped by the parser's props handling". `parseObjectValue` parsed
 * `= 320` and threw it away, so `width_px: number = 320` reached every consumer as bare
 * `"number"` and an editor had no initial value to show. The parser now keeps it on a
 * non-enumerable side channel (see `getPropDefaults`) and it lands here as `defaultValue`.
 * This is inert for enum/type enforcement — nothing validates against a default — but it is
 * what lets an editor open a control already showing what the trait actually starts at.
 *
 * RANGES: previously "intentionally NOT derived (`.holo` declares no ranges)". A trait can now
 * declare them, sibling to `props:`, with no grammar change — the parser already carries an
 * arbitrary nested object under a `@trait` config key:
 *
 *     @trait {
 *       name: "@spatial_panel",
 *       props: { width_px: number = 320, cache_key: string = "" },
 *       ui: {
 *         width_px: { label: "Panel Width", range: [100, 800], step: 10 },
 *         cache_key: { hidden: true }
 *       }
 *     }
 *
 * The `ui:` block is presentation only and carries NO enforcement weight: a property that
 * declares nothing validates exactly as it did before. What IS enforced is the block's own
 * coherence — see {@link collectUiIssues}. An editor reads these instead of hard-coding a
 * control table per trait.
 *
 * @see scripts/gen-trait-schemas.ts
 * @see packages/core/src/compiler/identity/ConfabulationValidator.ts
 */
import { parseHolo, getPropDefaults } from '../../parser/HoloCompositionParser';
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
    ui?: Record<string, unknown>;
  };
}

/**
 * A `ui:` block that does not cohere with the props it describes. Reported rather than
 * silently dropped: a range nobody can see is indistinguishable from one that was never
 * written, and a typo'd prop name would otherwise fail completely silently.
 */
export interface TraitUiIssue {
  /** Trait name (`@`-stripped). */
  trait: string;
  /** The `ui:` key at fault — a prop name, or one that matched no prop. */
  prop: string;
  /** What is wrong, in one phrase. */
  problem: string;
}

/** Keys a `ui:` entry may declare. Anything else is a typo, not an extension point. */
const UI_ENTRY_KEYS: ReadonlySet<string> = new Set(['label', 'range', 'step', 'hidden']);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * Problems in one `ui:` entry, checked against the property it describes. Empty means the
 * entry is applicable as written. `range`/`step` are rejected on non-numeric properties —
 * a range on a string is not a stricter control, it is a mistake.
 */
function uiEntryProblems(entry: Record<string, unknown>, prop: TraitPropertySchema): string[] {
  const problems: string[] = [];

  for (const key of Object.keys(entry)) {
    if (!UI_ENTRY_KEYS.has(key)) problems.push(`unknown ui key "${key}"`);
  }
  if ('label' in entry && (typeof entry.label !== 'string' || entry.label.trim() === '')) {
    problems.push('label must be a non-empty string');
  }
  if ('hidden' in entry && typeof entry.hidden !== 'boolean') {
    problems.push('hidden must be a boolean');
  }
  if ('range' in entry) {
    const range = entry.range;
    if (!Array.isArray(range) || range.length !== 2 || !range.every(isFiniteNumber)) {
      problems.push('range must be [min, max], two finite numbers');
    } else if (range[0] > range[1]) {
      problems.push(`range min (${range[0]}) is greater than max (${range[1]})`);
    } else if (prop.type !== 'number') {
      problems.push(`range declared on a ${prop.type} property (only number is rangeable)`);
    }
  }
  if ('step' in entry) {
    const step = entry.step;
    if (!isFiniteNumber(step) || step <= 0) {
      problems.push('step must be a positive finite number');
    } else if (prop.type !== 'number') {
      problems.push(`step declared on a ${prop.type} property (only number is steppable)`);
    }
  }
  return problems;
}

/** Copy a validated `ui:` entry onto its property schema. Mutates `prop`. */
function applyUiEntry(prop: TraitPropertySchema, entry: Record<string, unknown>): void {
  if (typeof entry.label === 'string') prop.label = entry.label;
  if (typeof entry.hidden === 'boolean') prop.hidden = entry.hidden;
  if (isFiniteNumber(entry.step)) prop.step = entry.step;
  if (Array.isArray(entry.range) && entry.range.length === 2 && entry.range.every(isFiniteNumber)) {
    prop.min = entry.range[0];
    prop.max = entry.range[1];
  }
}

/**
 * Check a trait's `ui:` block against its derived properties, applying every entry that is
 * coherent and reporting every entry that is not. A faulty entry is never applied — the
 * schema stays exactly as it would have been without the block, so a reported issue can
 * never silently change what an editor renders.
 */
export function collectUiIssues(
  traitName: string,
  properties: TraitPropertySchema[],
  uiBlock: unknown
): TraitUiIssue[] {
  if (uiBlock === undefined) return [];
  if (!isPlainObject(uiBlock)) {
    return [{ trait: traitName, prop: '(ui)', problem: 'ui must be an object keyed by prop name' }];
  }

  const byName = new Map(properties.map((p) => [p.name, p]));
  const issues: TraitUiIssue[] = [];

  for (const [propName, rawEntry] of Object.entries(uiBlock)) {
    const prop = byName.get(propName);
    if (!prop) {
      issues.push({
        trait: traitName,
        prop: propName,
        problem: 'names no declared prop (typo, or the prop was removed)',
      });
      continue;
    }
    if (!isPlainObject(rawEntry)) {
      issues.push({ trait: traitName, prop: propName, problem: 'ui entry must be an object' });
      continue;
    }
    const problems = uiEntryProblems(rawEntry, prop);
    if (problems.length > 0) {
      for (const problem of problems) issues.push({ trait: traitName, prop: propName, problem });
      continue; // never apply a faulty entry
    }
    applyUiEntry(prop, rawEntry);
  }
  return issues;
}

/** A derived trait plus any incoherence found in its `ui:` block. */
export interface DerivedTrait {
  schema: TraitSchema;
  uiIssues: TraitUiIssue[];
}

/**
 * Derive a {@link TraitSchema} plus any `ui:` incoherence from a single `.holo` source
 * containing one `@trait` declaration. Returns `null` when the source does not parse
 * cleanly or has no named `@trait` (callers skip nulls).
 */
export function deriveTraitFromHolo(source: string): DerivedTrait | null {
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

  // `= default` values, captured off the props object's own keys by the parser.
  const declaredDefaults = getPropDefaults(config.props) ?? {};

  const properties: TraitPropertySchema[] = [];
  for (const [propName, typeSpec] of Object.entries(config.props ?? {})) {
    // Nested-object prop declarations (non-string type-spec) are not schema-enforceable here.
    if (typeof typeSpec !== 'string') continue;
    const { type, enumValues } = mapPropType(typeSpec);
    const schema: TraitPropertySchema = { name: propName, type };
    if (enumValues) schema.enumValues = enumValues;
    // Only set the key when a default was actually declared — `defaultValue: undefined` and
    // "no default" are different claims, and consumers check for the key's presence.
    if (propName in declaredDefaults) schema.defaultValue = declaredDefaults[propName];
    properties.push(schema);
  }

  // Applies every coherent `ui:` entry onto `properties`; faulty ones are reported, not applied.
  const uiIssues = collectUiIssues(name, properties, config.ui);

  return { schema: { name, category, properties }, uiIssues };
}

/**
 * Schema-only view of {@link deriveTraitFromHolo}, for callers that do not surface
 * `ui:` issues. Prefer `deriveTraitFromHolo` in anything that can report them.
 */
export function deriveTraitSchemaFromHolo(source: string): TraitSchema | null {
  return deriveTraitFromHolo(source)?.schema ?? null;
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
 *
 * `ui:` affordances ride along on the spread: the FIRST variant to contribute a prop supplies its
 * label/range/step/hidden, matching the first-in-sorted-path policy the generator already uses for
 * conflicts. A prop demoted to `any` drops them deliberately — a numeric range on a property whose
 * type is no longer known is worse than no range at all.
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
