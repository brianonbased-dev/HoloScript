/**
 * holoValidator.ts — Structural validation for AI-generated HoloScript output.
 *
 * Quick, deterministic checks that Brittney/generate routes can run BEFORE
 * returning code to the user. Catches the most common LLM generation errors
 * (markdown fences, unbalanced braces, invalid block types, broken trait syntax).
 *
 * For full semantic validation, feed the output through `parseHolo()` from
 * `@holoscript/core`. This module is intentionally lightweight and has no
 * dependency on the core parser so it can run in any context (edge, middleware, etc.).
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

// ─── Constants ──────────────────────────────────────────────────────────────

/**
 * Top-level block keywords recognized by the HoloScript parser.
 * Blocks follow the pattern: `keyword "Name" { ... }` or `keyword { ... }`.
 */
const VALID_BLOCK_TYPES = new Set([
  'composition',
  'scene',
  'object',
  'service',
  'pipeline',
  'agent',
  'environment',
  'template',
  'state',
  'logic',
  'light',
  'effects',
  'camera',
  'audio',
  'zone',
  'ui',
  'timeline',
  'transition',
  'npc',
  'quest',
  'ability',
  'dialogue',
  'achievement',
  'talent_tree',
  'shape',
  'spatial_group',
  'group',
  'spatial_agent',
  'nav_agent',
  'domain',
  'terrain',
  'constraint',
  'spawn_group',
  'waypoints',
  'behavior',
  'state_machine',
  'on_click',
  'on_hover',
  'on_frame',
  'on_keydown',
  'for_each',
  'if',
]);

/**
 * Regex for markdown code fences that LLMs commonly wrap output in.
 */
const MARKDOWN_FENCE_RE = /^```(?:holoscript|holo|hs|holosc)?\s*$/m;

/**
 * Trait syntax: `@traitname` or `@traitname(key: value, ...)` or `@traitname { ... }`.
 * This regex matches the trait prefix to verify it uses the `@` convention.
 */
const TRAIT_INLINE_RE = /(?:^|\s)@([a-zA-Z_][a-zA-Z0-9_]*)/;

/**
 * Property syntax: `key: value` (with optional leading whitespace).
 */
const PROPERTY_RE = /^\s+[\w]+:\s+.+/;

// ─── Validator ──────────────────────────────────────────────────────────────

/**
 * Validate AI-generated HoloScript output structurally.
 *
 * Checks performed:
 * 1. No markdown code fences
 * 2. Balanced braces (curly, square, parentheses)
 * 3. At least one recognized top-level block type
 * 4. Trait syntax uses `@` prefix
 * 5. Properties use `key: value` format
 * 6. No empty output
 */
export function validateHoloOutput(code: string): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // ─── Empty check ──────────────────────────────────────────────────
  const trimmed = code.trim();
  if (!trimmed) {
    errors.push('Output is empty');
    return { valid: false, errors, warnings };
  }

  // ─── Markdown fence check ─────────────────────────────────────────
  if (MARKDOWN_FENCE_RE.test(trimmed)) {
    errors.push(
      'Output contains markdown code fences (``` blocks). Return raw HoloScript only.',
    );
  }

  // ─── Balanced braces ──────────────────────────────────────────────
  const braceErrors = checkBalancedBraces(trimmed);
  errors.push(...braceErrors);

  // ─── Top-level block detection ────────────────────────────────────
  const hasTopLevelBlock = detectTopLevelBlocks(trimmed);
  if (!hasTopLevelBlock) {
    errors.push(
      'No recognized top-level block found. Expected one of: composition, scene, object, service, pipeline, agent.',
    );
  }

  // ─── Trait syntax check ───────────────────────────────────────────
  const traitWarnings = checkTraitSyntax(trimmed);
  warnings.push(...traitWarnings);

  // ─── Property format check ────────────────────────────────────────
  const propWarnings = checkPropertyFormat(trimmed);
  warnings.push(...propWarnings);

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

// ─── Internal helpers ───────────────────────────────────────────────────────

function checkBalancedBraces(code: string): string[] {
  const errors: string[] = [];

  // Track brace depth, ignoring braces inside strings and comments
  let curlyDepth = 0;
  let squareDepth = 0;
  let parenDepth = 0;
  let inString: string | null = null; // '"' or "'"
  let inLineComment = false;
  let inBlockComment = false;

  for (let i = 0; i < code.length; i++) {
    const ch = code[i];
    const next = code[i + 1];

    // Handle comment boundaries
    if (!inString) {
      if (inLineComment) {
        if (ch === '\n') inLineComment = false;
        continue;
      }
      if (inBlockComment) {
        if (ch === '*' && next === '/') {
          inBlockComment = false;
          i++; // skip '/'
        }
        continue;
      }
      if (ch === '/' && next === '/') {
        inLineComment = true;
        i++;
        continue;
      }
      if (ch === '/' && next === '*') {
        inBlockComment = true;
        i++;
        continue;
      }
    }

    // Handle string boundaries
    if (!inLineComment && !inBlockComment) {
      if (inString) {
        if (ch === '\\') {
          i++; // skip escaped char
          continue;
        }
        if (ch === inString) {
          inString = null;
        }
        continue;
      }
      if (ch === '"' || ch === "'") {
        inString = ch;
        continue;
      }
    }

    // Count braces outside strings and comments
    switch (ch) {
      case '{':
        curlyDepth++;
        break;
      case '}':
        curlyDepth--;
        break;
      case '[':
        squareDepth++;
        break;
      case ']':
        squareDepth--;
        break;
      case '(':
        parenDepth++;
        break;
      case ')':
        parenDepth--;
        break;
    }

    if (curlyDepth < 0) {
      errors.push('Unmatched closing brace "}" found');
      return errors;
    }
    if (squareDepth < 0) {
      errors.push('Unmatched closing bracket "]" found');
      return errors;
    }
    if (parenDepth < 0) {
      errors.push('Unmatched closing parenthesis ")" found');
      return errors;
    }
  }

  if (curlyDepth !== 0) {
    errors.push(
      curlyDepth > 0
        ? `${curlyDepth} unclosed curly brace(s) "{"`
        : `${Math.abs(curlyDepth)} extra closing curly brace(s) "}"`,
    );
  }
  if (squareDepth !== 0) {
    errors.push(
      squareDepth > 0
        ? `${squareDepth} unclosed square bracket(s) "["`
        : `${Math.abs(squareDepth)} extra closing square bracket(s) "]"`,
    );
  }
  if (parenDepth !== 0) {
    errors.push(
      parenDepth > 0
        ? `${parenDepth} unclosed parenthesis(es) "("`
        : `${Math.abs(parenDepth)} extra closing parenthesis(es) ")"`,
    );
  }

  return errors;
}

function detectTopLevelBlocks(code: string): boolean {
  // Strip comments first for cleaner detection
  const lines = code.split('\n');
  for (const line of lines) {
    const stripped = line.replace(/\/\/.*$/, '').trim();
    // Match: `blockType "Name" {` or `blockType "Name" @trait {` or `blockType {`
    const firstWord = stripped.split(/[\s{"@]/)[0].toLowerCase();
    if (VALID_BLOCK_TYPES.has(firstWord)) {
      return true;
    }
  }
  return false;
}

function checkTraitSyntax(code: string): string[] {
  const warnings: string[] = [];
  const lines = code.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Skip comments
    const stripped = line.replace(/\/\/.*$/, '').trim();
    if (!stripped) continue;

    // Look for trait-like words that are NOT using @ prefix
    // Common mistake: LLMs write `physics(mass: 1.0)` instead of `@physics(mass: 1.0)`
    // Only flag if the word is on its own line (indented, inside a block) and matches known trait names
    const knownTraitPattern =
      /^\s+(physics|collidable|grabbable|throwable|hoverable|clickable|glowing|animated|pointable|scalable|rotatable|ai_npc|pathfinding|behavior_tree|inventory_sync|x402_paywall|multiplayer|state_sync|weather_sync|geo_anchor|quest_hub|crdt|wallet|model|tool_use|memory)(?:\(|\s*\{|\s*$)/;
    if (knownTraitPattern.test(line) && !TRAIT_INLINE_RE.test(line)) {
      warnings.push(
        `Line ${i + 1}: Trait-like keyword without "@" prefix. Did you mean "@${stripped.split(/[(\s{]/)[0]}"?`,
      );
    }
  }

  return warnings;
}

function checkPropertyFormat(code: string): string[] {
  const warnings: string[] = [];
  const lines = code.split('\n');
  let insideBlock = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const stripped = line.replace(/\/\/.*$/, '').trim();
    if (!stripped) continue;

    if (stripped.includes('{')) insideBlock = true;
    if (stripped.includes('}')) insideBlock = false;

    // Inside blocks, lines that look like assignments but use = instead of :
    if (insideBlock && /^\s+[\w]+\s*=\s*.+/.test(line) && !line.includes('=>')) {
      warnings.push(
        `Line ${i + 1}: Property uses "=" instead of ":". HoloScript uses "key: value" syntax.`,
      );
    }
  }

  return warnings;
}

/**
 * Strip markdown fences from LLM output if present.
 * Returns the cleaned code string.
 */
export function stripMarkdownFences(code: string): string {
  let cleaned = code.trim();
  // Remove opening fence: ```holoscript, ```holo, ```hs, or bare ```
  cleaned = cleaned.replace(/^```(?:holoscript|holo|hs|holosc)?\s*\n?/, '');
  // Remove closing fence
  cleaned = cleaned.replace(/\n?```\s*$/, '');
  return cleaned.trim();
}
