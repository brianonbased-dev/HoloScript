/**
 * HoloScript Error Recovery System
 *
 * Provides enhanced error messages with suggestions for common mistakes.
 * Helps users fix errors quickly by offering context-aware fixes.
 *
 * @version 3.0.0 - VR_TRAITS modularized into 61 category files under traits/constants/
 */

import { VR_TRAITS } from '../constants';

// =============================================================================
// TYPES
// =============================================================================

export interface ParseError {
  code: ErrorCode;
  message: string;
  line: number;
  column: number;
  source?: string;
  suggestions?: ErrorSuggestion[];
  relatedInfo?: RelatedInfo[];
}

export interface ErrorSuggestion {
  description: string;
  fix?: string;
  replacement?: {
    start: number;
    end: number;
    text: string;
  };
}

export interface RelatedInfo {
  message: string;
  line?: number;
  column?: number;
}

export type ErrorCode =
  | 'UNEXPECTED_TOKEN'
  | 'MISSING_BRACE'
  | 'MISSING_COLON'
  | 'MISSING_QUOTE'
  | 'INVALID_PROPERTY'
  | 'UNKNOWN_KEYWORD'
  | 'UNKNOWN_TRAIT'
  | 'UNKNOWN_GEOMETRY'
  | 'TRAIT_CONFLICT'
  | 'TRAIT_REQUIRES'
  | 'INVALID_VALUE'
  | 'DUPLICATE_NAME'
  | 'MISSING_REQUIRED'
  | 'SYNTAX_ERROR';

export type ErrorSeverity = 'error' | 'warning' | 'info' | 'hint';

// =============================================================================
// KNOWN PATTERNS
// =============================================================================

const VALID_KEYWORDS = [
  'composition',
  'object',
  'group',
  'template',
  'state',
  'logic',
  'environment',
  'timeline',
  'zone',
  'audio',
  'ui_panel',
  'ui_button',
  'ui_text',
  'ui_slider',
  'ui_input',
  'ui_image',
  'ui_chart',
  'import',
  'using',
  'action',
  'on',
  'if',
  'else',
  'for',
  'while',
  'animate',
  'emit',
  'spawn',
  'transition',
];

const VALID_GEOMETRIES = [
  'cube',
  'box',
  'sphere',
  'cylinder',
  'cone',
  'torus',
  'plane',
  'text',
  'model',
  'sparkles',
  'particles',
];

// VALID_TRAITS is derived from VR_TRAITS (1,525+ traits across 61 category modules).
// Source: traits/constants/index.ts barrel → re-exported via constants.ts.
// All traits are parser-accepted; no UNKNOWN_TRAIT errors for any VR_TRAITS entry.
const VALID_TRAITS: string[] = [...VR_TRAITS];

const COMMON_PROPERTIES = [
  'position',
  'rotation',
  'scale',
  'color',
  'material',
  'geometry',
  'mesh',
  'model',
  'src',
  'text',
  'content',
  'width',
  'height',
  'radius',
  'size',
  'opacity',
  'visible',
  'name',
  'id',
];

// =============================================================================
// ERROR PATTERNS
// =============================================================================

interface ErrorPattern {
  pattern: RegExp;
  code: ErrorCode;
  message: (match: RegExpMatchArray) => string;
  suggestions: (match: RegExpMatchArray, context: ErrorContext) => ErrorSuggestion[];
}

interface ErrorContext {
  source: string;
  line: number;
  column: number;
  previousToken?: string;
  nextToken?: string;
}

const ERROR_PATTERNS: ErrorPattern[] = [
  // Missing closing brace
  {
    pattern: /unexpected end of input/i,
    code: 'MISSING_BRACE',
    message: () => 'Missing closing brace. Check that all { have matching }.',
    suggestions: () => [
      {
        description: 'Add closing brace at the end',
        fix: 'Add } to close the block',
      },
      {
        description: 'Check for unclosed nested blocks',
        fix: 'Ensure each { has a corresponding }',
      },
    ],
  },

  // Missing colon in property
  {
    pattern: /expected.*:/i,
    code: 'MISSING_COLON',
    message: () => 'Missing colon after property name.',
    suggestions: () => [
      {
        description: 'Add colon after property name',
        fix: 'propertyName: value',
      },
    ],
  },

  // Unclosed string
  {
    pattern: /unterminated string|unexpected newline in string/i,
    code: 'MISSING_QUOTE',
    message: () => 'Unclosed string literal. Make sure strings have closing quotes.',
    suggestions: () => [
      {
        description: 'Add closing quote',
        fix: 'Ensure string ends with matching " or \'',
      },
      {
        description: 'For multi-line strings, use template literals',
        fix: 'Use backticks ` for multi-line strings',
      },
    ],
  },

  // Unknown keyword
  {
    pattern: /unexpected identifier ["']?(\w+)["']?/i,
    code: 'UNKNOWN_KEYWORD',
    message: (match) => `Unknown keyword: ${match[1]}`,
    suggestions: (match) => {
      const word = match[1];
      const similar = findSimilar(word, VALID_KEYWORDS);
      return similar.map((s) => ({
        description: `Did you mean '${s}'?`,
        fix: `Replace '${word}' with '${s}'`,
      }));
    },
  },
];

// =============================================================================
// ERROR RECOVERY CLASS
// =============================================================================

export class ErrorRecovery {
  private errors: ParseError[] = [];

  /**
   * Create an enhanced error with suggestions
   */
  createError(
    code: ErrorCode,
    message: string,
    line: number,
    column: number,
    source?: string
  ): ParseError {
    const error: ParseError = {
      code,
      message,
      line,
      column,
      source,
      suggestions: this.getSuggestions(code, message, source),
    };

    this.errors.push(error);
    return error;
  }

  /**
   * Get suggestions based on error type
   */
  private getSuggestions(code: ErrorCode, message: string, _source?: string): ErrorSuggestion[] {
    const suggestions: ErrorSuggestion[] = [];

    switch (code) {
      case 'UNKNOWN_TRAIT':
        const traitMatch = message.match(/trait.*["'](\w+)["']/i);
        if (traitMatch) {
          const similar = findSimilar(traitMatch[1], VALID_TRAITS);
          suggestions.push(
            ...similar.map((s) => ({
              description: `Did you mean '@${s}'?`,
              fix: `Replace with @${s}`,
            }))
          );
        }
        break;

      case 'UNKNOWN_GEOMETRY':
        const geoMatch = message.match(/geometry.*["'](\w+)["']/i);
        if (geoMatch) {
          const similar = findSimilar(geoMatch[1], VALID_GEOMETRIES);
          suggestions.push(
            ...similar.map((s) => ({
              description: `Did you mean '${s}'?`,
              fix: `geometry: "${s}"`,
            }))
          );
        }
        break;

      case 'INVALID_PROPERTY':
        const propMatch = message.match(/property.*["'](\w+)["']/i);
        if (propMatch) {
          const similar = findSimilar(propMatch[1], COMMON_PROPERTIES);
          suggestions.push(
            ...similar.map((s) => ({
              description: `Did you mean '${s}'?`,
              fix: `${s}: value`,
            }))
          );
        }
        break;

      case 'TRAIT_CONFLICT':
        suggestions.push({
          description: 'Remove one of the conflicting traits',
          fix: 'Check trait documentation for compatibility',
        });
        break;

      case 'TRAIT_REQUIRES':
        suggestions.push({
          description: 'Add the required trait',
          fix: 'Some traits depend on others (e.g., @throwable requires @grabbable)',
        });
        break;

      case 'MISSING_BRACE':
        suggestions.push({
          description: 'Check for matching braces',
          fix: 'Every { must have a corresponding }',
        });
        break;

      case 'MISSING_COLON':
        suggestions.push({
          description: 'Add colon after property name',
          fix: 'Format: propertyName: value',
        });
        break;

      case 'MISSING_QUOTE':
        suggestions.push({
          description: 'Close the string with matching quote',
          fix: 'Strings must end with the same quote they started with',
        });
        break;

      case 'INVALID_VALUE':
        suggestions.push({
          description: 'Check value type',
          fix: 'position expects [x, y, z], color expects "#rrggbb"',
        });
        break;

      case 'DUPLICATE_NAME':
        suggestions.push({
          description: 'Use unique names for objects',
          fix: 'Each object in a composition must have a unique name',
        });
        break;

      case 'MISSING_REQUIRED':
        suggestions.push({
          description: 'Add required properties',
          fix: 'Some blocks require certain properties to be defined',
        });
        break;

      case 'UNKNOWN_KEYWORD': {
        const kwMatch = message.match(/keyword.*[:"']?\s*(\w+)/i);
        if (kwMatch) {
          const similar = findSimilar(kwMatch[1], VALID_KEYWORDS);
          suggestions.push(
            ...similar.map((s) => ({
              description: `Did you mean '${s}'?`,
              fix: `Replace with ${s}`,
            }))
          );
        }
        if (suggestions.length === 0) {
          suggestions.push({
            description: 'Check available keywords',
            fix: 'Valid keywords: composition, object, group, template, etc.',
          });
        }
        break;
      }

      case 'SYNTAX_ERROR':
        suggestions.push({
          description: 'Check syntax around this location',
          fix: 'Verify braces, quotes, and property format',
        });
        break;
    }

    return suggestions;
  }

  /**
   * Analyze raw error message and enhance it
   */
  analyzeError(rawMessage: string, source: string, line: number, column: number): ParseError {
    // Try to match against known patterns
    for (const pattern of ERROR_PATTERNS) {
      const match = rawMessage.match(pattern.pattern);
      if (match) {
        const context: ErrorContext = { source, line, column };
        return {
          code: pattern.code,
          message: pattern.message(match),
          line,
          column,
          source,
          suggestions: pattern.suggestions(match, context),
        };
      }
    }

    // Default error
    return {
      code: 'SYNTAX_ERROR',
      message: rawMessage,
      line,
      column,
      source,
      suggestions: [
        {
          description: 'Check syntax around this location',
          fix: 'Verify braces, quotes, and property format',
        },
      ],
    };
  }

  /**
   * Format error for display
   */
  formatError(error: ParseError): string {
    const lines: string[] = [];

    lines.push(`[${error.code}] ${error.message}`);
    lines.push(`  at line ${error.line}, column ${error.column}`);

    if (error.source) {
      lines.push('');
      lines.push(`  ${error.source}`);
      lines.push(`  ${' '.repeat(error.column - 1)}^`);
    }

    if (error.suggestions && error.suggestions.length > 0) {
      lines.push('');
      lines.push('Suggestions:');
      for (const suggestion of error.suggestions) {
        lines.push(`  • ${suggestion.description}`);
        if (suggestion.fix) {
          lines.push(`    Fix: ${suggestion.fix}`);
        }
      }
    }

    return lines.join('\n');
  }

  /**
   * Get all collected errors
   */
  getErrors(): ParseError[] {
    return [...this.errors];
  }

  /**
   * Clear collected errors
   */
  clear(): void {
    this.errors = [];
  }

  /**
   * Check if there are any errors
   */
  hasErrors(): boolean {
    return this.errors.length > 0;
  }
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Find similar strings using Levenshtein distance
 */
function findSimilar(input: string, candidates: string[], maxDistance: number = 3): string[] {
  const results: Array<{ word: string; distance: number }> = [];

  for (const candidate of candidates) {
    const distance = levenshteinDistance(input.toLowerCase(), candidate.toLowerCase());
    if (distance <= maxDistance) {
      results.push({ word: candidate, distance });
    }
  }

  return results
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 3)
    .map((r) => r.word);
}

/**
 * Calculate Levenshtein distance between two strings
 */
function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1, // insertion
          matrix[i - 1][j] + 1 // deletion
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

// =============================================================================
// ERROR ENRICHMENT
// =============================================================================

/**
 * Enrich error with context-aware suggestions
 */
export function enrichErrorWithSuggestions(error: ParseError, source: string): ParseError {
  // If error already has suggestions, preserve them
  if (error.suggestions && error.suggestions.length > 0) {
    return error;
  }

  const suggestions: ErrorSuggestion[] = [];

  // Add code-specific suggestions
  switch (error.code) {
    case 'UNKNOWN_TRAIT':
      const traitMatch = error.message.match(/trait.*["'](\w+)["']/i);
      if (traitMatch) {
        const similar = findSimilar(traitMatch[1], VALID_TRAITS);
        suggestions.push(
          ...similar.map((s) => ({
            description: `Did you mean '@${s}'?`,
            fix: `Replace with @${s}`,
          }))
        );
      }
      break;

    case 'UNKNOWN_KEYWORD':
      const keywordMatch = error.message.match(/keyword.*["'](\w+)["']/i);
      if (keywordMatch) {
        const similar = findSimilar(keywordMatch[1], VALID_KEYWORDS);
        suggestions.push(
          ...similar.map((s) => ({
            description: `Did you mean '${s}'?`,
            fix: `Replace with ${s}`,
          }))
        );
      }
      break;

    case 'UNKNOWN_GEOMETRY':
      const geomMatch = error.message.match(/geometry.*["'](\w+)["']/i);
      if (geomMatch) {
        const similar = findSimilar(geomMatch[1], VALID_GEOMETRIES);
        suggestions.push(
          ...similar.map((s) => ({
            description: `Did you mean '${s}'?`,
            fix: `Replace with ${s}`,
          }))
        );
      }
      break;

    case 'MISSING_BRACE':
      suggestions.push({
        description: 'Add closing brace at the end',
        fix: 'Add } to close the block',
      });
      break;

    case 'MISSING_COLON':
      suggestions.push({
        description: 'Add colon after property name',
        fix: 'propertyName: value',
      });
      break;

    case 'MISSING_QUOTE':
      suggestions.push({
        description: 'Add closing quote',
        fix: 'Ensure string ends with matching " or \'',
      });
      break;
  }

  // Check error message patterns for additional suggestions
  for (const pattern of ERROR_PATTERNS) {
    const match = error.message.match(pattern.pattern);
    if (match) {
      const context: ErrorContext = {
        source,
        line: error.line,
        column: error.column,
      };
      suggestions.push(...pattern.suggestions(match, context));
      break;
    }
  }

  return {
    ...error,
    suggestions: suggestions.length > 0 ? suggestions : error.suggestions,
  };
}

// =============================================================================
// QUICK FIX HELPERS
// =============================================================================

export interface QuickFix {
  title: string;
  edit: {
    range: { start: number; end: number };
    newText: string;
  };
}

/**
 * Generate quick fixes for common errors
 */
export function generateQuickFixes(error: ParseError, source: string): QuickFix[] {
  const fixes: QuickFix[] = [];

  switch (error.code) {
    case 'MISSING_BRACE':
      fixes.push({
        title: 'Add closing brace',
        edit: {
          range: { start: source.length, end: source.length },
          newText: '\n}',
        },
      });
      break;

    case 'MISSING_COLON':
      // Find the property name and add colon after it
      const lineStart = getLineStart(source, error.line);
      const lineEnd = source.indexOf('\n', lineStart);
      const line = source.substring(lineStart, lineEnd === -1 ? undefined : lineEnd);
      const match = line.match(/^\s*(\w+)\s+/);
      if (match) {
        fixes.push({
          title: 'Add colon after property',
          edit: {
            range: { start: lineStart + match[0].length - 1, end: lineStart + match[0].length - 1 },
            newText: ':',
          },
        });
      }
      break;

    case 'MISSING_QUOTE':
      fixes.push({
        title: 'Add closing quote',
        edit: {
          range: { start: source.length, end: source.length },
          newText: '"',
        },
      });
      break;
  }

  return fixes;
}

function getLineStart(source: string, lineNumber: number): number {
  let line = 1;
  let pos = 0;

  while (line < lineNumber && pos < source.length) {
    if (source[pos] === '\n') {
      line++;
    }
    pos++;
  }

  return pos;
}

// =============================================================================
// EXPORTS
// =============================================================================

export const HOLOSCHEMA_KEYWORDS = VALID_KEYWORDS;
export const HOLOSCHEMA_GEOMETRIES = VALID_GEOMETRIES;
export const HOLOSCHEMA_TRAITS = VALID_TRAITS;
export const HOLOSCHEMA_PROPERTIES = COMMON_PROPERTIES;
