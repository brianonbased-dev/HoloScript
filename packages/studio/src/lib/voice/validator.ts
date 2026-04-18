/**
 * Voice output validator.
 *
 * The LLM can produce fluent-looking HoloScript that uses traits or colors
 * outside the v0 allow-list. This validator is the backstop — we reject
 * those before they reach the parser. See plan (b) § "The verification step".
 */

import { ALLOWED_TRAITS, COLOR_LEXICON, type AllowedTrait } from './prompt';

export interface ValidationResult {
  ok: boolean;
  /** Non-empty when ok === false; each is a one-line explanation. */
  issues: string[];
  /** Extracted bits for diagnostics. */
  stats: {
    objectCount: number;
    traitsUsed: string[];
    unknownTraits: string[];
    colorsUsed: string[];
    invalidColors: string[];
  };
}

const VALID_HEX = /^#[0-9a-fA-F]{6}$/;
const ALLOWED_TRAIT_SET: ReadonlySet<string> = new Set(ALLOWED_TRAITS);
const ALLOWED_COLOR_SET: ReadonlySet<string> = new Set(
  Object.values(COLOR_LEXICON).map((c) => c.toLowerCase())
);

/**
 * Pre-parse structural check. Catches the most common model failures before
 * we pay for a full parse. Does NOT replace the real parser — it is a gate.
 */
export function validateHoloOutput(source: string): ValidationResult {
  const issues: string[] = [];
  const traitsUsed = new Set<string>();
  const unknownTraits: string[] = [];
  const colorsUsed = new Set<string>();
  const invalidColors: string[] = [];

  // Trim markdown fences if the model leaked them despite instructions.
  const cleaned = source
    .replace(/^```(?:holo|holoscript)?\s*\n/, '')
    .replace(/\n```\s*$/, '')
    .trim();

  // 1. Shape guard: must begin with `composition "<name>" {`
  if (!/^composition\s+"[^"]+"\s*\{/.test(cleaned)) {
    issues.push('Output does not start with `composition "<name>" {`');
  }

  // 2. Must end with closing brace (lazy-but-useful check)
  if (!cleaned.endsWith('}')) {
    issues.push('Output does not end with `}`');
  }

  // 3. Must contain at least one object block
  const objectMatches = cleaned.match(/\bobject\s+[a-z_][a-z0-9_]*\s*\{/gi) || [];
  if (objectMatches.length === 0) {
    issues.push('No `object <name> {` blocks found');
  }

  // 4. Extract and verify traits (@name or @name(...))
  const traitMatches = cleaned.matchAll(/@([a-z_][a-z0-9_]*)/gi);
  for (const m of traitMatches) {
    const name = m[1].toLowerCase();
    traitsUsed.add(name);
    if (!ALLOWED_TRAIT_SET.has(name as AllowedTrait)) {
      unknownTraits.push(name);
    }
  }
  if (unknownTraits.length > 0) {
    issues.push(`Unknown traits: ${[...new Set(unknownTraits)].join(', ')}`);
  }

  // 5. Extract and verify colors
  const colorMatches = cleaned.matchAll(/color\s*:\s*['"](#?[0-9a-fA-F]{3,8})['"]/g);
  for (const m of colorMatches) {
    const hex = m[1].toLowerCase();
    colorsUsed.add(hex);
    if (!VALID_HEX.test(hex)) {
      invalidColors.push(hex);
    } else if (!ALLOWED_COLOR_SET.has(hex)) {
      // Not in lexicon is a WARN not FAIL — user can speak exact hex.
      // We still accept valid hex codes that aren't in the named palette.
    }
  }
  if (invalidColors.length > 0) {
    issues.push(`Invalid color hex: ${invalidColors.join(', ')}`);
  }

  return {
    ok: issues.length === 0,
    issues,
    stats: {
      objectCount: objectMatches.length,
      traitsUsed: [...traitsUsed],
      unknownTraits: [...new Set(unknownTraits)],
      colorsUsed: [...colorsUsed],
      invalidColors,
    },
  };
}

/**
 * Strip markdown fences and prose. The LLM sometimes sneaks them past the
 * system prompt; we clean up before handing to the parser.
 */
export function normalizeHoloOutput(raw: string): string {
  return raw
    .replace(/^```(?:holo|holoscript)?\s*\n/, '')
    .replace(/\n```\s*$/, '')
    .trim();
}
