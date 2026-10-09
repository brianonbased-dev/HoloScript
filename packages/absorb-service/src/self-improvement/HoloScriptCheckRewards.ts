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
 * The checker is core's canonical validator (`validateCanonicalSource`, the one the CLI,
 * MCP and LSP use), so every refusal it gains reaches this reward the day it lands. This
 * term adds only what that validator does not decide today: that the completion is exactly
 * one bare `composition "Name" { ... }` (no prose, no markdown fence, no second root, which
 * the tolerant parser drops silently), that it holds something, and that every trait it
 * names is one the language knows (the strict layer's HS1006 vocabulary).
 *
 * The ladder. Each rung is strictly above the one below, so within a GRPO group the
 * advantage always points one step up, and no rung can be reached without passing the
 * ones beneath it:
 *
 *   0     not exactly one bare composition program
 *   0.25  one program, but the checker reports errors
 *   0.5   valid, but nothing in it (no object, template, group, trigger or state machine)
 *   0.75  valid with content, but an unknown trait or a checker warning
 *   1     valid, with content, every trait known, no warnings
 *
 * Off by default; enable with `GRPOOrchestratorConfig.enableHoloScriptCheck`.
 *
 * @module self-improvement
 */

import {
  buildKnownTraitSet,
  DERIVED_TRAIT_SCHEMAS,
  validateCanonicalSource,
} from '@holoscript/core';
import { tokenizeHoloSource } from '@holoscript/core/parser';
import type { GRPORewardFunction } from './GRPORewardFunctions';

/** Which rung a completion reached. */
export type HoloScriptCheckRung =
  'not-a-program' | 'errors' | 'empty' | 'unknown-traits' | 'warnings' | 'clean';

export const HOLOSCRIPT_CHECK_REWARDS: Readonly<Record<HoloScriptCheckRung, number>> = {
  'not-a-program': 0,
  errors: 0.25,
  empty: 0.5,
  'unknown-traits': 0.75,
  warnings: 0.75,
  clean: 1,
};

/** Why a completion got its reward, for logs and receipts. */
export interface HoloScriptCheckReceipt {
  reward: number;
  rung: HoloScriptCheckRung;
  /** What decided the rung, in plain words. */
  detail: string;
}

/** The AST collections that make a program hold something (the eval's structural keys). */
const CONTENT_KEYS = ['objects', 'templates', 'spatialGroups', 'triggers', 'stateMachines'];

let knownTraits: Set<string> | undefined;

/** The strict layer's trait vocabulary: the known set plus every trait a `.holo` file declares. */
function traitVocabulary(): Set<string> {
  if (!knownTraits) {
    knownTraits = buildKnownTraitSet();
    for (const schema of DERIVED_TRAIT_SCHEMAS) {
      if (schema?.name) knownTraits.add(String(schema.name));
    }
  }
  return knownTraits;
}

interface Token {
  type: string;
  value: string;
}

/**
 * True when the whole completion is one `composition "Name" { ... }` and nothing else:
 * comments and blank lines may surround it; prose, a markdown fence (the lexer drops
 * backticks, so they are looked for in the text), JSON or a second root may not.
 */
function isOneBareComposition(source: string, tokens: Token[]): boolean {
  if (source.includes('```')) return false;
  const significant = tokens.filter((t) => t.type !== 'NEWLINE');
  // The parser takes the root's name quoted or bare (`composition Portal {`); the canonical
  // validator, not this shape check, decides what else is wrong with the program.
  if (
    significant[0]?.type !== 'COMPOSITION' ||
    (significant[1]?.type !== 'STRING' && significant[1]?.type !== 'IDENTIFIER') ||
    significant[2]?.type !== 'LBRACE'
  ) {
    return false;
  }
  let depth = 0;
  for (let i = 2; i < significant.length; i++) {
    const type = significant[i].type;
    if (type === 'LBRACE') depth++;
    else if (type === 'RBRACE' && --depth === 0) {
      return significant.slice(i + 1).every((t) => t.type === 'EOF');
    }
  }
  return false;
}

/** Score one completion. Never throws: anything the checker cannot read is not a program. */
export function gradeHoloScriptCompletion(completion: string): HoloScriptCheckReceipt {
  const rung = (r: HoloScriptCheckRung, detail: string): HoloScriptCheckReceipt => ({
    reward: HOLOSCRIPT_CHECK_REWARDS[r],
    rung: r,
    detail,
  });

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

  const ast = (result.ast ?? {}) as Record<string, unknown>;
  const hasContent = CONTENT_KEYS.some((key) => {
    const value = ast[key];
    return Array.isArray(value) && value.length > 0;
  });
  if (!hasContent) {
    return rung(
      'empty',
      'valid, but it holds no object, template, group, trigger or state machine'
    );
  }

  const vocabulary = traitVocabulary();
  const unknown = new Set<string>();
  for (let i = 0; i + 1 < tokens.length; i++) {
    if (tokens[i].type === 'AT' && !vocabulary.has(tokens[i + 1].value)) {
      unknown.add(tokens[i + 1].value);
    }
  }
  if (unknown.size > 0) {
    return rung('unknown-traits', `traits the language does not know: ${[...unknown].join(', ')}`);
  }
  if (result.warnings.length > 0) {
    return rung(
      'warnings',
      `${result.warnings.length} warning(s); first: ${result.warnings[0].message}`
    );
  }
  return rung('clean', 'one valid program with content, every trait known, no warnings');
}

/** Score a batch, index-aligned to `completions`. */
export function gradeHoloScriptBatch(completions: string[]): HoloScriptCheckReceipt[] {
  return completions.map(gradeHoloScriptCompletion);
}

/**
 * The HoloScript-check reward term: one number per completion from the ladder above.
 * Needs no batch context; the checker is the whole gold.
 */
export const holoScriptCheckReward: GRPORewardFunction = async (completions: string[]) =>
  completions.map((completion) => gradeHoloScriptCompletion(completion).reward);
