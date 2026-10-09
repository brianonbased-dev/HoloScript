/**
 * HoloScriptCheckRewards.ts
 *
 * The HoloScript checker as a GRPO reward term (HoloScript-for-machines step 5): how close
 * is a completion to ONE whole, valid `.holo` program?
 *
 * Validity only, never task details. The author_holo detail checks in the ai-ecosystem
 * eval grader (`HOLO_DETAIL_CHECKS`) ARE the exam; a reward built from them trains on it
 * (research/2026-07-22_reward-tune-trains-on-eval-fixtures-confound.md). Whether the
 * program does what the prompt asked stays the eval's job.
 *
 * WHAT IT DOES NOT REWARD. 1 is reached by any valid program with one thing in it, so
 * `composition "A" { object "o" {} }` scores as high as a full scene, and blocks or
 * properties the tolerant parser skips without a diagnostic cost nothing. On this term
 * alone the best policy is the shortest valid composition. Pair it with a term that reads
 * the prompt (weights below 1), or use it to teach shape before content.
 *
 * WHAT DECIDES EACH RUNG.
 *  - Errors: core's canonical validator (`validateCanonicalSource`, the one the CLI, MCP
 *    and LSP use), so every refusal it gains reaches this reward the day it lands.
 *  - One bare program: this term. The completion is exactly one `composition "Name" { ... }`
 *    (name quoted or bare, as the parser takes it), with only whitespace, `//` or block
 *    comments and well-formed `import` statements around it: no prose, no ``` or ~~~ fence,
 *    no second root, which the tolerant parser drops silently. Scanned on the raw text with
 *    strings and comments understood, because the lexer drops characters it does not know
 *    (backticks, tildes) and its positions do not map back to the text reliably.
 *  - Errors also: a trait parsed with an empty name (the strict layer's HS1005).
 *  - Empty: the strict layer's HS1004 rule (packages/core/strict/holo_strict.mjs): every
 *    composition field except `type`, `loc`, `provenance` and `name` counts as content.
 *  - Unknown trait: the strict layer's HS1006 rule. Traits are read from the AST (every
 *    `ObjectTrait`/`Trait` node, on any block), checked against core's known set, the traits
 *    `.holo` files declare and the trait registry, with its spelling rules (@camelCase,
 *    kebab-case and snake_case compare alike, and so do names without underscores), and
 *    against what the source declares itself (`@trait { name: ... }`, `trait X { ... }`).
 * The strict layer is not importable from here (it is not a workspace package), so these
 * rules are mirrored; HoloScriptCheckRewards.test.ts holds them equal to the strict layer
 * on its corpus (real/ included) with a vocabulary built independently, so a drift goes red.
 *
 * The ladder. Each rung is strictly above the one below, so within a GRPO group the
 * advantage always points one step up, and no rung can be reached without passing the
 * ones beneath it:
 *
 *   0     not exactly one bare composition program
 *   0.25  one program, but the checker reports errors
 *   0.5   valid, but nothing in it
 *   0.75  valid with content, but a trait the language does not know
 *   1     valid, with content, every trait known
 *
 * Off by default; enable with `GRPOOrchestratorConfig.enableHoloScriptCheck`.
 *
 * @module self-improvement
 */

import { createRequire } from 'module';
import {
  buildKnownTraitSet,
  DERIVED_TRAIT_SCHEMAS,
  validateCanonicalSource,
} from '@holoscript/core';
import type { GRPORewardFunction } from './GRPORewardFunctions';

/** Which rung a completion reached. */
export type HoloScriptCheckRung = 'not-a-program' | 'errors' | 'empty' | 'unknown-traits' | 'clean';

export const HOLOSCRIPT_CHECK_REWARDS: Readonly<Record<HoloScriptCheckRung, number>> = {
  'not-a-program': 0,
  errors: 0.25,
  empty: 0.5,
  'unknown-traits': 0.75,
  clean: 1,
};

/** Why a completion got its reward, for logs and receipts. */
export interface HoloScriptCheckReceipt {
  reward: number;
  rung: HoloScriptCheckRung;
  /** What decided the rung, in plain words. */
  detail: string;
}

// =============================================================================
// THE STRICT LAYER'S RULES (mirrored; see the module comment)
// =============================================================================

/** HS1004: every composition field counts as content except these bookkeeping ones. */
const BOOKKEEPING_KEYS = new Set(['type', 'loc', 'provenance', 'name']);

function holdsSomething(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object') return Object.keys(value as object).length > 0;
  if (typeof value === 'string') return value.length > 0;
  return true;
}

/** True when the composition AST holds anything beyond its bookkeeping fields. */
export function compositionHasContent(ast: unknown): boolean {
  if (!ast || typeof ast !== 'object') return false;
  for (const [key, value] of Object.entries(ast as Record<string, unknown>)) {
    if (BOOKKEEPING_KEYS.has(key)) continue;
    if (holdsSomething(value)) return true;
  }
  return false;
}

/** @camelCase, kebab-case and snake_case all compare as snake_case. */
export function normalizeTraitName(name: string): string {
  return String(name)
    .replace(/^@/, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/-/g, '_')
    .toLowerCase();
}

const squash = (normalized: string) => normalized.replace(/_/g, '');

let vocabulary: { ids: Set<string>; normalized: Set<string>; squashed: Set<string> } | undefined;

/** The trait registry's ids, read the way the strict layer reads them; empty if unavailable. */
function registryIds(): string[] {
  try {
    const registry = createRequire(import.meta.url)('@holoscript/core/traits/trait-registry.json');
    return registry && typeof registry === 'object' ? Object.keys(registry) : [];
  } catch {
    return [];
  }
}

/** The strict layer's HS1006 vocabulary: known set, declared traits and the registry. */
export function holoScriptTraitVocabulary(): Set<string> {
  if (!vocabulary) {
    const ids = new Set<string>(buildKnownTraitSet());
    for (const schema of DERIVED_TRAIT_SCHEMAS) if (schema?.name) ids.add(String(schema.name));
    for (const id of registryIds()) ids.add(id);
    const normalized = new Set<string>();
    const squashed = new Set<string>();
    for (const id of ids) {
      const n = normalizeTraitName(id);
      normalized.add(n);
      squashed.add(squash(n));
    }
    vocabulary = { ids, normalized, squashed };
  }
  return vocabulary.ids;
}

function isKnownTrait(name: string): boolean {
  holoScriptTraitVocabulary();
  const n = normalizeTraitName(name);
  return vocabulary!.normalized.has(n) || vocabulary!.squashed.has(squash(n));
}

// =============================================================================
// ONE BARE PROGRAM
// =============================================================================
// Scanned on the raw text, aware of strings and comments: the lexer drops characters it
// does not know (backticks, tildes) and its positions cannot be mapped back reliably
// (single-character symbols report 0-based columns; lines drift after a multi-line string).

/** Index after any whitespace and comments from `i`; -1 for an unclosed block comment. */
function skipSpace(s: string, i: number): number {
  for (;;) {
    while (i < s.length && /\s/.test(s[i])) i++;
    if (s.startsWith('//', i)) {
      const nl = s.indexOf('\n', i);
      i = nl < 0 ? s.length : nl + 1;
    } else if (s.startsWith('/*', i)) {
      const end = s.indexOf('*/', i + 2);
      if (end < 0) return -1;
      i = end + 2;
    } else {
      return i;
    }
  }
}

/** Index after the quoted string starting at `i` (`s[i]` is the quote); -1 if unclosed. */
function skipString(s: string, i: number): number {
  const quote = s[i];
  for (let j = i + 1; j < s.length; j++) {
    if (s[j] === '\\') j++;
    else if (s[j] === quote) return j + 1;
  }
  return -1;
}

/** `import "x"`, `import X from "x"`, `import * as X from "x"`, `import { A, B } from "x"`. */
const IMPORT_RE =
  /^import\s+(?:(?:\{[^{}]*\}|\*\s+as\s+[A-Za-z_]\w*|[A-Za-z_]\w*)\s+from\s+)?(?:"[^"\n]*"|'[^'\n]*')[ \t]*;?/;

/** Index after one well-formed import at `i` (nothing but a comment after it on its line), or -1. */
function skipImport(s: string, i: number): number {
  const m = IMPORT_RE.exec(s.slice(i));
  if (!m) return -1;
  const end = i + m[0].length;
  const nl = s.indexOf('\n', end);
  return /^[ \t]*(\/\/.*)?$/.test(s.slice(end, nl < 0 ? s.length : nl)) ? end : -1;
}

/**
 * True when the whole completion is one `composition "Name" { ... }` and nothing else:
 * whitespace, comments and well-formed leading `import` statements may surround it.
 */
function isOneBareComposition(s: string): boolean {
  let i = skipSpace(s, 0);
  while (i >= 0 && /^import\b/.test(s.slice(i, i + 7))) {
    const end = skipImport(s, i);
    if (end < 0) return false;
    i = skipSpace(s, end);
  }
  if (i < 0) return false;
  // The lexer looks keywords up in lower case, so `Composition` is the keyword too.
  const head = /^composition\b/i.exec(s.slice(i));
  if (!head) return false;
  i = skipSpace(s, i + head[0].length);
  if (i < 0) return false;
  if (s[i] === '"' || s[i] === "'") {
    i = skipString(s, i);
    if (i < 0) return false;
  } else {
    const name = /^[A-Za-z_][A-Za-z0-9_]*/.exec(s.slice(i));
    if (!name) return false;
    i += name[0].length;
  }
  i = skipSpace(s, i);
  if (i < 0 || s[i] !== '{') return false;
  let depth = 0;
  for (; i < s.length; i++) {
    const c = s[i];
    if (c === '"' || c === "'") {
      const end = skipString(s, i);
      if (end < 0) return false;
      i = end - 1;
    } else if (s.startsWith('//', i)) {
      const nl = s.indexOf('\n', i);
      i = (nl < 0 ? s.length : nl) - 1;
    } else if (s.startsWith('/*', i)) {
      const end = s.indexOf('*/', i + 2);
      if (end < 0) return false;
      i = end + 1;
    } else if (c === '{') {
      depth++;
    } else if (c === '}' && --depth === 0) {
      return skipSpace(s, i + 1) === s.length;
    }
  }
  return false;
}

// =============================================================================
// TRAITS, AS THE STRICT LAYER READS THEM (collectTraits / declaredTraits)
// =============================================================================

type Node = Record<string, unknown>;

/** Every trait node in the AST (`ObjectTrait` / `Trait`), wherever it sits. */
function collectTraitNodes(node: unknown, found: Node[] = []): Node[] {
  if (!node || typeof node !== 'object') return found;
  if (Array.isArray(node)) {
    for (const item of node) collectTraitNodes(item, found);
    return found;
  }
  const n = node as Node;
  if (n.type === 'ObjectTrait' || n.type === 'Trait') found.push(n);
  for (const value of Object.values(n)) {
    if (value && typeof value === 'object') collectTraitNodes(value, found);
  }
  return found;
}

/** Traits the source makes known itself: `@trait { name: ... }`, `trait X { ... }`, `trait`. */
function declaredTraitNames(ast: unknown, traits: Node[]): Set<string> {
  const names = new Set<string>(['trait']);
  for (const trait of traits) {
    const config = trait.config as Node | undefined;
    const bare = String(trait.name ?? '')
      .replace(/^@/, '')
      .toLowerCase();
    if (bare === 'trait' && config && typeof config.name === 'string') {
      names.add(normalizeTraitName(config.name));
    }
  }
  const definitions = (ast as Node | null)?.traitDefinitions;
  for (const definition of Array.isArray(definitions) ? definitions : []) {
    const name = (definition as Node | null)?.name;
    if (name) names.add(normalizeTraitName(String(name)));
  }
  return names;
}

// =============================================================================
// THE TERM
// =============================================================================

/** Score one completion. Never throws: anything the checker cannot read is not a program. */
export function gradeHoloScriptCompletion(completion: unknown): HoloScriptCheckReceipt {
  const rung = (r: HoloScriptCheckRung, detail: string): HoloScriptCheckReceipt => ({
    reward: HOLOSCRIPT_CHECK_REWARDS[r],
    rung: r,
    detail,
  });
  if (typeof completion !== 'string') {
    return rung('not-a-program', `not text (${completion === null ? 'null' : typeof completion})`);
  }
  if (!isOneBareComposition(completion)) {
    return rung(
      'not-a-program',
      'not exactly one bare `composition "Name" { ... }` (prose, a fence, JSON or a second root)'
    );
  }

  let result: ReturnType<typeof validateCanonicalSource>;
  try {
    result = validateCanonicalSource({ source: completion, surface: 'holo' });
  } catch (error) {
    return rung('errors', `the checker threw: ${String(error)}`);
  }
  if (!result.valid || result.errors.length > 0) {
    const first = result.errors[0]?.message ?? 'not valid';
    return rung('errors', `${result.errors.length} error(s); first: ${first}`);
  }

  const traits = collectTraitNodes(result.ast);
  const bareNames = traits.map((trait) =>
    String(trait.name ?? '')
      .trim()
      .replace(/^@/, '')
  );
  if (bareNames.some((bare) => !/^[A-Za-z0-9_]/.test(bare))) {
    return rung('errors', 'a trait was parsed with an empty name (HS1005)');
  }

  if (!compositionHasContent(result.ast)) {
    return rung('empty', 'valid, but nothing in it parsed into a composition (HS1004)');
  }

  const declared = declaredTraitNames(result.ast, traits);
  const unknown = new Set(
    bareNames.filter((bare) => !isKnownTrait(bare) && !declared.has(normalizeTraitName(bare)))
  );
  if (unknown.size > 0) {
    return rung('unknown-traits', `traits the language does not know: ${[...unknown].join(', ')}`);
  }
  return rung('clean', 'one valid program with content, every trait known');
}

/** Score a batch, index-aligned to `completions`. */
export function gradeHoloScriptBatch(completions: unknown[]): HoloScriptCheckReceipt[] {
  return completions.map((completion) => gradeHoloScriptCompletion(completion));
}

/**
 * The HoloScript-check reward term: one number per completion from the ladder above.
 * Needs no batch context; the checker is the whole gold.
 */
export const holoScriptCheckReward: GRPORewardFunction = async (completions: string[]) =>
  completions.map((completion) => gradeHoloScriptCompletion(completion).reward);
