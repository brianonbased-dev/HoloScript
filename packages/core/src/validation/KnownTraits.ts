/**
 * The one known-trait check (HS1006). Every surface asks this module whether a trait is known:
 * the strict layer (strict/holo_strict.mjs), the canonical validator behind the CLI's `validate`,
 * MCP's `validate_holoscript` and the language server, the HoloScriptPlusParser's HSP001, the
 * linter and MCP's `hs_diagnostics`.
 *
 * Known = in any vocabulary core ships, or declared in the same source, or passed by the caller:
 *   1. VR_TRAITS
 *   2. trait-registry.json (every id)
 *   3. buildKnownTraitSet() (VR_TRAITS + Native2D panel, code-graph, runtime-directive names)
 *   4. DERIVED_TRAIT_SCHEMAS names (traits declared by `.holo` `@trait { ... }` files in core)
 *   5. declared in the source: `@trait { name: "@x" }` or `trait X { ... }`; `trait` itself
 *   6. caller-passed names (plugin vocabularies)
 * Names compare across spellings: `@fooBar`, `@foo-bar` and `@foo_bar` are one trait, and a
 * registry id that splits an acronym (`AIDriver` -> `a_i_driver`) also matches without separators.
 *
 * An unknown trait is a WARNING (HS1006), never an error by default: it is parsed, kept in the
 * AST, has no runtime behaviour, and is reported once at its `@`. Not to be confused with the
 * `.hs` `@unknown` VALUE type (a field that may be unknown, read with `load(x) ?? fallback`).
 */
import { VR_TRAITS } from '../traits/constants';
import { buildKnownTraitSet } from '../traits/knownTraitSet';
import TRAIT_REGISTRY from '../traits/trait-registry.json';
import { DERIVED_TRAIT_NAMES } from '../compiler/identity/derived-trait-names.generated';

export const UNKNOWN_TRAIT_CODE = 'HS1006' as const;

/** `@camelCase`, `kebab-case` and `snake_case` all compare as snake_case. */
export function normalizeTraitName(name: unknown): string {
  return String(name ?? '')
    .trim()
    .replace(/^@/, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/-/g, '_')
    .toLowerCase();
}

const squash = (normalized: string) => normalized.replace(/_/g, '');

interface Index {
  normalized: Set<string>;
  squashed: Set<string>;
}
let coreIndex: Index | undefined;

function indexOf(names: Iterable<unknown>, into: Index = { normalized: new Set(), squashed: new Set() }) {
  for (const name of names) {
    const n = normalizeTraitName(name);
    if (!n) continue;
    into.normalized.add(n);
    into.squashed.add(squash(n));
  }
  return into;
}

function core(): Index {
  if (!coreIndex) {
    const index = indexOf(VR_TRAITS);
    indexOf(Object.keys(TRAIT_REGISTRY as Record<string, unknown>), index);
    indexOf(buildKnownTraitSet(), index);
    indexOf(DERIVED_TRAIT_NAMES, index);
    coreIndex = index;
  }
  return coreIndex;
}

/** Every trait name core itself knows (raw spellings from all four vocabularies). */
export function coreKnownTraitNames(): ReadonlySet<string> {
  return new Set<string>([
    ...VR_TRAITS,
    ...Object.keys(TRAIT_REGISTRY as Record<string, unknown>),
    ...buildKnownTraitSet(),
    ...DERIVED_TRAIT_NAMES,
  ]);
}

export interface KnownTraitOptions {
  /** Names declared in the same source (see declaredTraitNames). */
  declared?: Iterable<string>;
  /** Caller vocabularies, e.g. a plugin's trait names. */
  knownTraits?: Iterable<string>;
}

/** The one question: is `name` a known trait? */
export function isKnownTrait(name: unknown, options: KnownTraitOptions = {}): boolean {
  const n = normalizeTraitName(name);
  if (!n) return false;
  const c = core();
  if (c.normalized.has(n) || c.squashed.has(squash(n))) return true;
  for (const list of [options.declared, options.knownTraits]) {
    if (!list) continue;
    for (const extra of list) {
      const e = normalizeTraitName(extra);
      if (e === n || squash(e) === squash(n)) return true;
    }
  }
  return false;
}

interface TraitNode {
  type?: unknown;
  name?: unknown;
  config?: Record<string, unknown> | null;
}

export interface TraitUse {
  trait: TraitNode;
  owner: Record<string, unknown> | null;
  /** The name as the parser read it, `@` stripped. */
  name: string;
}

/**
 * Every trait use in an AST, in source order, each once. Reads both core ASTs: `.holo`
 * (`ObjectTrait` / `Trait` nodes) and `.hsplus` (`{ type: 'trait' }` directives; that AST
 * reaches one node through several fields, so nodes are visited once by identity).
 */
export function collectTraitUses(ast: unknown): TraitUse[] {
  const found: TraitUse[] = [];
  const seen = new WeakSet<object>();
  // `.holo` nodes carry their traits as `ObjectTrait` nodes in `traits` and mirror them as
  // `{ type: 'trait' }` entries in `directives`; `.hsplus` nodes have only the directives (their
  // `traits` is a Map). A `{ type: 'trait' }` directive therefore counts only where its holder
  // has no `traits` array, so each written trait is counted once on both surfaces.
  const walk = (node: unknown, owner: Record<string, unknown> | null, hsplusDirective = false) => {
    if (!node || typeof node !== 'object' || seen.has(node as object)) return;
    seen.add(node as object);
    if (node instanceof Map) return;
    if (Array.isArray(node)) {
      for (const item of node) walk(item, owner, hsplusDirective);
      return;
    }
    const n = node as Record<string, unknown> & { loc?: { start?: unknown } };
    if (n.type === 'ObjectTrait' || n.type === 'Trait' || (hsplusDirective && n.type === 'trait')) {
      found.push({
        trait: n as TraitNode,
        owner,
        name: String(n.name ?? '').trim().replace(/^@/, ''),
      });
    }
    const next = n.loc && n.loc.start ? n : owner;
    for (const [key, value] of Object.entries(n)) {
      if (value && typeof value === 'object') {
        walk(value, next, key === 'directives' && !Array.isArray(n.traits));
      }
    }
  };
  walk(ast, null);
  return found;
}

/**
 * Names this source itself declares: `@trait { name: "@x" }` (and `trait`, the declaration
 * form) and `trait X { ... }` (the AST's traitDefinitions).
 */
export function declaredTraitNames(ast: unknown, uses: TraitUse[] = collectTraitUses(ast)): Set<string> {
  const names = new Set<string>(['trait']);
  for (const { trait, name } of uses) {
    const config = trait.config;
    if (name.toLowerCase() === 'trait' && config && typeof config.name === 'string') {
      names.add(normalizeTraitName(config.name));
    }
  }
  const defs = (ast as { traitDefinitions?: unknown })?.traitDefinitions;
  if (Array.isArray(defs)) {
    for (const d of defs) {
      const name = (d as { name?: unknown } | null)?.name;
      if (name) names.add(normalizeTraitName(name));
    }
  }
  return names;
}

/**
 * The trait uses in `ast` that are unknown (HS1006), in source order. A use with an empty name
 * is not returned (that is HS1005). Positions are the caller's job.
 */
export function findUnknownTraits(
  ast: unknown,
  options: { knownTraits?: Iterable<string> } = {}
): TraitUse[] {
  const uses = collectTraitUses(ast);
  const declared = declaredTraitNames(ast, uses);
  const knownTraits = options.knownTraits ? [...options.knownTraits] : undefined;
  return uses.filter(
    (u) => /^[A-Za-z0-9_]/.test(u.name) && !isKnownTrait(u.name, { declared, knownTraits })
  );
}
