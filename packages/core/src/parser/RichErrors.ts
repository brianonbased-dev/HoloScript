/**
 * Rich Error System for HoloScript Parser
 *
 * Provides enhanced error messages with:
 * - Error codes for documentation reference
 * - Source context (surrounding lines)
 * - "Did you mean?" suggestions
 * - Severity levels
 */

import { VR_TRAITS } from '../constants';

// ============================================================================
// Error Interface
// ============================================================================

export interface RichParseError {
  /** Error code for documentation (e.g., HSP001) */
  code: string;
  /** Human-readable error message */
  message: string;
  /** Line number (1-indexed) */
  line: number;
  /** Column number (1-indexed) */
  column: number;
  /** End line for range highlighting */
  endLine?: number;
  /** End column for range highlighting */
  endColumn?: number;
  /** Source context showing surrounding lines */
  context?: string;
  /** Suggested fix */
  suggestion?: string;
  /** Error severity */
  severity: 'error' | 'warning' | 'info';
}

// ============================================================================
// Error Codes
// ============================================================================

export const HSPLUS_ERROR_CODES = {
  // Syntax Errors (HSP001-HSP099)
  HSP001: 'Unexpected token',
  HSP002: 'Expected identifier',
  HSP003: 'Expected keyword',
  HSP004: 'Unclosed brace - missing }',
  HSP005: 'Unclosed bracket - missing ]',
  HSP006: 'Unclosed parenthesis - missing )',
  HSP007: 'Unclosed string literal',
  HSP008: 'Invalid number format',
  HSP009: 'Missing colon after property name',
  HSP010: 'Missing value after colon',

  // Structure Errors (HSP100-HSP199)
  HSP100: 'Invalid composition structure',
  HSP101: 'Invalid object definition',
  HSP102: 'Invalid template definition',
  HSP103: 'Invalid spatial_group definition',
  HSP104: 'Invalid environment block',
  HSP105: 'Invalid state block',
  HSP106: 'Invalid logic block',
  HSP107: 'Duplicate identifier',
  HSP108: 'Missing required property',

  // Trait Errors (HSP200-HSP299)
  HSP200: 'Unknown trait',
  HSP201: 'Invalid trait syntax',
  HSP202: 'Missing trait argument',
  HSP203: 'Invalid trait argument type',
  HSP204: 'Trait not allowed in this context',
  HSP205: 'Duplicate trait',

  // Expression Errors (HSP300-HSP399)
  HSP300: 'Invalid expression',
  HSP301: 'Undefined variable',
  HSP302: 'Invalid operator',
  HSP303: 'Type mismatch',
  HSP304: 'Invalid function call',
  HSP305: 'Missing function argument',

  // Import/Module Errors (HSP400-HSP499)
  HSP400: 'Invalid import statement',
  HSP401: 'Module not found',
  HSP402: 'Circular import detected',

  // Limit Errors (HSP900-HSP999)
  HSP900: 'Maximum nesting depth exceeded',
  HSP901: 'Maximum array length exceeded',
  HSP902: 'Maximum string length exceeded',
} as const;

export type ErrorCode = keyof typeof HSPLUS_ERROR_CODES;

// ============================================================================
// Similarity Functions for Suggestions
// ============================================================================

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

/**
 * Calculate similarity score between two strings (0-1)
 */
function similarity(a: string, b: string): number {
  const aLower = a.toLowerCase();
  const bLower = b.toLowerCase();

  // Exact match
  if (aLower === bLower) return 1;

  // Prefix match bonus
  if (bLower.startsWith(aLower) || aLower.startsWith(bLower)) {
    return 0.9;
  }

  // Levenshtein-based similarity
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;

  const distance = levenshteinDistance(aLower, bLower);
  return 1 - distance / maxLen;
}

/**
 * Find similar trait names for suggestions
 */
export function findSimilarTrait(input: string, threshold = 0.5): string | undefined {
  let bestMatch: string | undefined;
  let bestScore = threshold;

  for (const trait of VR_TRAITS) {
    const score = similarity(input, trait);
    if (score > bestScore) {
      bestScore = score;
      bestMatch = trait;
    }
  }

  return bestMatch;
}

/**
 * Find similar keyword for suggestions
 */
export function findSimilarKeyword(input: string, threshold = 0.5): string | undefined {
  const keywords = [
    'composition',
    'object',
    'template',
    'spatial_group',
    'environment',
    'state',
    'logic',
    'on_click',
    'on_hover',
    'on_enter',
    'on_exit',
    'position',
    'rotation',
    'scale',
    'color',
    'model',
    'geometry',
    'visible',
    'opacity',
    'material',
    'physics',
    'audio',
    'animation',
    'true',
    'false',
    'null',
    'if',
    'else',
    'for',
    'while',
    'function',
    'let',
    'const',
    'return',
    'import',
    'from',
    'using',
    'spawn',
    'emit',
  ];

  let bestMatch: string | undefined;
  let bestScore = threshold;

  for (const keyword of keywords) {
    const score = similarity(input, keyword);
    if (score > bestScore) {
      bestScore = score;
      bestMatch = keyword;
    }
  }

  return bestMatch;
}

// ============================================================================
// Context Extraction
// ============================================================================

/**
 * Extract source context around an error location
 */
export function getSourceContext(
  source: string,
  line: number,
  column: number,
  contextLines = 2
): string {
  const lines = source.split('\n');
  const result: string[] = [];

  const startLine = Math.max(1, line - contextLines);
  const endLine = Math.min(lines.length, line + contextLines);

  // Calculate line number padding
  const maxLineNum = endLine;
  const padding = String(maxLineNum).length;

  for (let i = startLine; i <= endLine; i++) {
    const lineContent = lines[i - 1] || '';
    const lineNum = String(i).padStart(padding, ' ');
    const prefix = i === line ? '>' : ' ';

    result.push(`${prefix} ${lineNum} | ${lineContent}`);

    // Add error indicator on the error line
    if (i === line) {
      const indicator = ' '.repeat(padding + 4 + Math.max(0, column - 1)) + '^';
      result.push(indicator);
    }
  }

  return result.join('\n');
}

// ============================================================================
// Error Creation Helpers
// ============================================================================

/**
 * Create a rich parse error
 */
export function createRichError(
  code: ErrorCode,
  message: string,
  line: number,
  column: number,
  options: {
    source?: string;
    suggestion?: string;
    severity?: 'error' | 'warning' | 'info';
    endLine?: number;
    endColumn?: number;
  } = {}
): RichParseError {
  const { source, suggestion, severity = 'error', endLine, endColumn } = options;

  return {
    code,
    message: `${code}: ${message}`,
    line,
    column,
    endLine,
    endColumn,
    context: source ? getSourceContext(source, line, column) : undefined,
    suggestion,
    severity,
  };
}

/**
 * Create a trait error with automatic suggestion
 */
export function createTraitError(
  traitName: string,
  line: number,
  column: number,
  source?: string
): RichParseError {
  const similar = findSimilarTrait(traitName);
  const suggestion = similar ? `Did you mean '@${similar}'?` : undefined;

  return createRichError('HSP200', `Unknown trait '@${traitName}'`, line, column, {
    source,
    suggestion,
  });
}

/**
 * Create a keyword error with automatic suggestion
 */
export function createKeywordError(
  found: string,
  expected: string,
  line: number,
  column: number,
  source?: string
): RichParseError {
  const similar = findSimilarKeyword(found);
  const suggestion = similar ? `Did you mean '${similar}'?` : `Expected '${expected}'`;

  return createRichError('HSP003', `Expected '${expected}' but found '${found}'`, line, column, {
    source,
    suggestion,
  });
}

// ============================================================================
// Error Formatting
// ============================================================================

/**
 * Format a single error for display
 */
export function formatRichError(error: RichParseError): string {
  const lines: string[] = [];

  // Error header with code
  const icon = error.severity === 'error' ? '❌' : error.severity === 'warning' ? '⚠️' : 'ℹ️';
  lines.push(`${icon} ${error.message}`);
  lines.push(`   at line ${error.line}, column ${error.column}`);

  // Source context
  if (error.context) {
    lines.push('');
    lines.push(error.context);
  }

  // Suggestion
  if (error.suggestion) {
    lines.push('');
    lines.push(`💡 ${error.suggestion}`);
  }

  // Documentation link
  lines.push('');
  lines.push(`📖 See: https://holoscript.net/errors/${error.code}`);

  return lines.join('\n');
}

/**
 * Format multiple errors for display
 */
export function formatRichErrors(errors: RichParseError[]): string {
  if (errors.length === 0) {
    return '✅ No errors found';
  }

  const lines: string[] = [];
  const errorCount = errors.filter((e) => e.severity === 'error').length;
  const warningCount = errors.filter((e) => e.severity === 'warning').length;

  // Summary header
  lines.push(`Found ${errorCount} error(s) and ${warningCount} warning(s):`);
  lines.push('');

  // Show first 10 errors
  const displayErrors = errors.slice(0, 10);
  for (let i = 0; i < displayErrors.length; i++) {
    lines.push(`[${i + 1}/${errors.length}] ────────────────────────────────`);
    lines.push(formatRichError(displayErrors[i]));
    lines.push('');
  }

  if (errors.length > 10) {
    lines.push(`... and ${errors.length - 10} more errors`);
  }

  return lines.join('\n');
}

// ============================================================================
// Export All Error Codes for Documentation
// ============================================================================

export function getErrorCodeDocumentation(): Array<{
  code: string;
  description: string;
  category: string;
}> {
  const docs: Array<{ code: string; description: string; category: string }> = [];

  for (const [code, description] of Object.entries(HSPLUS_ERROR_CODES)) {
    let category = 'General';
    const num = parseInt(code.replace('HSP', ''), 10);

    if (num < 100) category = 'Syntax';
    else if (num < 200) category = 'Structure';
    else if (num < 300) category = 'Traits';
    else if (num < 400) category = 'Expressions';
    else if (num < 500) category = 'Imports';
    else if (num >= 900) category = 'Limits';

    docs.push({ code, description, category });
  }

  return docs;
}
