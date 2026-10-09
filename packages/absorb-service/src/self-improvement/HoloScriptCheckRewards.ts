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
 *    comments and `import` lines around it: no prose, no ``` or ~~~ fence, no second root,
 *    which the tolerant parser drops silently. Checked on the raw text, because the lexer
 *    drops characters it does not know (backticks, tildes).
 *  - Empty: the strict layer's HS1004 rule (packages/core/strict/holo_strict.mjs): every
 *    composition field except `type`, `loc`, `provenance` and `name` counts as content.
 *  - Unknown trait: the strict layer's HS1006 vocabulary and spelling rules (core's known
 *    set, the traits `.holo` files declare, and the trait registry; @camelCase, kebab-case
 *    and snake_case compare alike, and so do names without underscores). Not read: traits
 *    the same source declares with `@trait { name: ... }`.
 * The strict layer is not importable from here (it is not a workspace package), so the two
 * rules above are mirrored; HoloScriptCheckRewards.test.ts holds them equal to the strict
 * layer on its own corpus, so a drift goes red.
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
import { tokenizeHoloSource } from '@holoscript/core/parser';
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

interface Token {
  type: string;
  value: string;
  line: number;
  column: number;
}

/** Remove `//` and block comments, then whitespace; what remains is not a comment. */
function stripCommentsAndSpace(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '')
    .replace(/\s+/g, '');
}

/** Offset in `source` of a token's (1-based line, 1-based column). */
function offsetOf(source: string, token: Token): number {
  let offset = 0;
  for (let line = 1; line < token.line; line++) {
    const next = source.indexOf('\n', offset);
    if (next < 0) return source.length;
    offset = next + 1;
  }
  return offset + Math.max(0, token.column - 1);
}

/**
 * True when the whole completion is one `composition "Name" { ... }` and nothing else:
 * comments, blank lines and leading `import` lines may surround it; anything else may not.
 */
function isOneBareComposition(source: string, tokens: Token[]): boolean {
  const significant = tokens.filter((t) => t.type !== 'NEWLINE');
  const root = significant.findIndex((t) => t.type === 'COMPOSITION');
  if (root < 0) return false;
  if (
    (significant[root + 1]?.type !== 'STRING' && significant[root + 1]?.type !== 'IDENTIFIER') ||
    significant[root + 2]?.type !== 'LBRACE'
  ) {
    return false;
  }
  // Before the root: only comments, whitespace and `import` lines, checked on the raw text.
  const before = source
    .slice(0, offsetOf(source, significant[root]))
    .split('\n')
    .filter((line) => !/^\s*import\b/.test(line))
    .join('\n');
  if (stripCommentsAndSpace(before) !== '') return false;

  let depth = 0;
  for (let i = root + 2; i < significant.length; i++) {
    const type = significant[i].type;
    if (type === 'LBRACE') depth++;
    else if (type === 'RBRACE' && --depth === 0) {
      if (!significant.slice(i + 1).every((t) => t.type === 'EOF')) return false;
      // After the root: only comments and whitespace, checked on the raw text.
      const after = source.slice(offsetOf(source, significant[i]) + 1);
      return stripCommentsAndSpace(after) === '';
    }
  }
  return false;
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

  let tokens: Token[];
  try {
    tokens = tokenizeHoloSource(completion);
  } catch (error) {
    return rung('not-a-program', `the lexer could not read it: ${String(error)}`);
  }
  if (!isOneBareComposition(completion, tokens)) {
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

  if (!compositionHasContent(result.ast)) {
    return rung('empty', 'valid, but nothing in it parsed into a composition (HS1004)');
  }

  const unknown = new Set<string>();
  for (let i = 0; i + 1 < tokens.length; i++) {
    if (tokens[i].type === 'AT' && !isKnownTrait(tokens[i + 1].value)) {
      unknown.add(tokens[i + 1].value);
    }
  }
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
