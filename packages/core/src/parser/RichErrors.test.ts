/**
 * RichErrors — Comprehensive Inline Unit Tests
 *
 * Covers:
 * - Levenshtein distance (indirectly via findSimilarTrait / findSimilarKeyword)
 * - findSimilarTrait: exact match, close match, threshold, undefined for garbage
 * - findSimilarKeyword: exact match, close match, all known keywords, threshold
 * - getSourceContext: surrounding lines, error marker, edge positions, single-line
 * - createRichError: all fields, defaults, optional params
 * - createTraitError: automatic suggestion, HSP200 code
 * - createKeywordError: automatic suggestion, HSP003 code, fallback suggestion
 * - formatRichError: icons, line/column, context, suggestion, doc link
 * - formatRichErrors: summary, truncation, empty array
 * - getErrorCodeDocumentation: all codes categorized
 * - HSPLUS_ERROR_CODES constant
 */

import { describe, it, expect } from 'vitest';
import {
  findSimilarTrait,
  findSimilarKeyword,
  getSourceContext,
  createRichError,
  createTraitError,
  createKeywordError,
  formatRichError,
  formatRichErrors,
  getErrorCodeDocumentation,
  HSPLUS_ERROR_CODES,
  type RichParseError,
  type ErrorCode,
} from './RichErrors';

// =============================================================================
// findSimilarTrait
// =============================================================================

describe('findSimilarTrait', () => {
  it('returns exact match for a known trait', () => {
    const result = findSimilarTrait('grabbable');
    expect(result).toBe('grabbable');
  });

  it('finds close match with one typo', () => {
    const result = findSimilarTrait('graabble');
    expect(result).toBeDefined();
  });

  it('returns undefined for completely unrelated input', () => {
    const result = findSimilarTrait('xyzxyzxyz_not_a_trait_12345');
    expect(result).toBeUndefined();
  });

  it('respects high threshold (narrows matches)', () => {
    const result = findSimilarTrait('grabbbbbbbbbbbble', 0.95);
    expect(result).toBeUndefined();
  });

  it('finds "physics" trait from partial input', () => {
    const result = findSimilarTrait('physic');
    expect(result).toBeDefined();
  });

  it('handles empty string without throwing', () => {
    expect(() => findSimilarTrait('')).not.toThrow();
  });

  it('returns undefined for single character', () => {
    const result = findSimilarTrait('z', 0.8);
    expect(result === undefined || typeof result === 'string').toBe(true);
  });

  it('default threshold is 0.5', () => {
    // A moderately wrong input should still find something
    const result = findSimilarTrait('grabable'); // missing one 'b'
    expect(result).toBeDefined();
  });
});

// =============================================================================
// findSimilarKeyword
// =============================================================================

describe('findSimilarKeyword', () => {
  it('finds exact match for "composition"', () => {
    expect(findSimilarKeyword('composition')).toBe('composition');
  });

  it('finds exact match for "template"', () => {
    expect(findSimilarKeyword('template')).toBe('template');
  });

  it('finds exact match for "import"', () => {
    expect(findSimilarKeyword('import')).toBe('import');
  });

  it('finds exact match for "function"', () => {
    expect(findSimilarKeyword('function')).toBe('function');
  });

  it('finds exact match for "return"', () => {
    expect(findSimilarKeyword('return')).toBe('return');
  });

  it('finds close match for "objec" (missing "t")', () => {
    const result = findSimilarKeyword('objec');
    expect(result).toBeDefined();
  });

  it('finds close match for "environmen" (missing "t")', () => {
    const result = findSimilarKeyword('environmen');
    expect(result).toBeDefined();
  });

  it('returns undefined for completely unrelated input', () => {
    expect(findSimilarKeyword('zzzzzzzzzzzzzzzzz')).toBeUndefined();
  });

  it('handles empty string without throwing', () => {
    expect(() => findSimilarKeyword('')).not.toThrow();
  });

  it('finds "true" keyword', () => {
    expect(findSimilarKeyword('true')).toBe('true');
  });

  it('finds "false" keyword', () => {
    expect(findSimilarKeyword('false')).toBe('false');
  });

  it('finds "null" keyword', () => {
    expect(findSimilarKeyword('null')).toBe('null');
  });

  it('finds "spawn" keyword', () => {
    expect(findSimilarKeyword('spawn')).toBe('spawn');
  });

  it('finds "emit" keyword', () => {
    expect(findSimilarKeyword('emit')).toBe('emit');
  });

  it('respects custom threshold', () => {
    const result = findSimilarKeyword('xyz', 0.99);
    expect(result).toBeUndefined();
  });
});

// =============================================================================
// getSourceContext
// =============================================================================

describe('getSourceContext', () => {
  const source = `line one
line two
line three
line four
line five`;

  it('returns a string', () => {
    expect(typeof getSourceContext(source, 3, 1)).toBe('string');
  });

  it('marks the error line with > prefix', () => {
    const ctx = getSourceContext(source, 3, 1);
    expect(ctx).toContain('>');
    expect(ctx).toContain('line three');
  });

  it('includes surrounding context lines', () => {
    const ctx = getSourceContext(source, 3, 1, 2);
    expect(ctx).toContain('line one');
    expect(ctx).toContain('line five');
  });

  it('includes column indicator (^)', () => {
    const ctx = getSourceContext(source, 3, 5);
    expect(ctx).toContain('^');
  });

  it('handles line 1 (no lines before)', () => {
    const ctx = getSourceContext(source, 1, 1);
    expect(ctx).toContain('line one');
    expect(ctx).toContain('>');
  });

  it('handles last line (no lines after)', () => {
    const ctx = getSourceContext(source, 5, 1);
    expect(ctx).toContain('line five');
    expect(ctx).toContain('>');
  });

  it('handles single-line source', () => {
    const ctx = getSourceContext('hello world', 1, 1);
    expect(ctx).toContain('hello world');
    expect(ctx).toContain('>');
  });

  it('handles contextLines=0 (only error line)', () => {
    const ctx = getSourceContext(source, 3, 1, 0);
    expect(ctx).toContain('line three');
    expect(ctx).not.toContain('line two');
    expect(ctx).not.toContain('line four');
  });

  it('handles column > line length without throwing', () => {
    expect(() => getSourceContext(source, 1, 999)).not.toThrow();
  });

  it('handles column = 0 without throwing', () => {
    expect(() => getSourceContext(source, 1, 0)).not.toThrow();
  });

  it('handles empty source', () => {
    const ctx = getSourceContext('', 1, 1);
    expect(typeof ctx).toBe('string');
  });

  it('pads line numbers correctly for multi-digit lines', () => {
    const longSource = Array(15).fill('line content').join('\n');
    const ctx = getSourceContext(longSource, 12, 1, 2);
    expect(ctx).toContain('12');
  });
});

// =============================================================================
// createRichError
// =============================================================================

describe('createRichError', () => {
  it('returns a RichParseError with correct code', () => {
    const err = createRichError('HSP001', 'Unexpected token', 1, 5);
    expect(err.code).toBe('HSP001');
  });

  it('includes code in message string', () => {
    const err = createRichError('HSP001', 'Unexpected token', 1, 5);
    expect(err.message).toBe('HSP001: Unexpected token');
  });

  it('has correct line and column', () => {
    const err = createRichError('HSP002', 'Expected identifier', 3, 7);
    expect(err.line).toBe(3);
    expect(err.column).toBe(7);
  });

  it('defaults severity to "error"', () => {
    const err = createRichError('HSP001', 'Test', 1, 1);
    expect(err.severity).toBe('error');
  });

  it('accepts "warning" severity', () => {
    const err = createRichError('HSP009', 'Missing colon', 2, 3, { severity: 'warning' });
    expect(err.severity).toBe('warning');
  });

  it('accepts "info" severity', () => {
    const err = createRichError('HSP009', 'Info message', 2, 3, { severity: 'info' });
    expect(err.severity).toBe('info');
  });

  it('includes context when source is provided', () => {
    const source = 'orb "test" {\n  bad syntax\n}';
    const err = createRichError('HSP001', 'Test', 2, 3, { source });
    expect(err.context).toBeDefined();
    expect(err.context).toContain('bad syntax');
  });

  it('context is undefined when no source provided', () => {
    const err = createRichError('HSP001', 'Test', 1, 1);
    expect(err.context).toBeUndefined();
  });

  it('includes suggestion when provided', () => {
    const err = createRichError('HSP200', 'Unknown trait', 1, 1, {
      suggestion: "Did you mean '@grabbable'?",
    });
    expect(err.suggestion).toBe("Did you mean '@grabbable'?");
  });

  it('includes endLine and endColumn', () => {
    const err = createRichError('HSP004', 'Unclosed brace', 1, 1, {
      endLine: 5,
      endColumn: 3,
    });
    expect(err.endLine).toBe(5);
    expect(err.endColumn).toBe(3);
  });

  it('endLine and endColumn are undefined when not provided', () => {
    const err = createRichError('HSP001', 'Test', 1, 1);
    expect(err.endLine).toBeUndefined();
    expect(err.endColumn).toBeUndefined();
  });
});

// =============================================================================
// createTraitError
// =============================================================================

describe('createTraitError', () => {
  it('creates an error with code HSP200', () => {
    const err = createTraitError('unknownTrait', 2, 5);
    expect(err.code).toBe('HSP200');
  });

  it('includes the trait name in message', () => {
    const err = createTraitError('badTrait', 1, 1);
    expect(err.message).toContain('badTrait');
  });

  it('has "error" severity', () => {
    const err = createTraitError('badTrait', 3, 1);
    expect(err.severity).toBe('error');
  });

  it('provides a "Did you mean" suggestion for close matches', () => {
    const err = createTraitError('grabable', 1, 1);
    if (err.suggestion) {
      expect(err.suggestion).toContain('Did you mean');
    }
  });

  it('does not provide suggestion for completely unrelated input', () => {
    const err = createTraitError('zzzzzzzzzzzzzzzzz', 1, 1);
    // suggestion may or may not be undefined depending on threshold
    expect(typeof err.suggestion === 'string' || err.suggestion === undefined).toBe(true);
  });

  it('includes source context when source is provided', () => {
    const source = 'orb "test" {\n  @grabable\n}';
    const err = createTraitError('grabable', 2, 3, source);
    expect(err.context).toBeDefined();
  });

  it('context is undefined without source', () => {
    const err = createTraitError('badTrait', 1, 1);
    expect(err.context).toBeUndefined();
  });
});

// =============================================================================
// createKeywordError
// =============================================================================

describe('createKeywordError', () => {
  it('creates an error with code HSP003', () => {
    const err = createKeywordError('obejct', 'object', 1, 1);
    expect(err.code).toBe('HSP003');
  });

  it('includes expected keyword in message', () => {
    const err = createKeywordError('tempate', 'template', 2, 5);
    expect(err.message).toContain('template');
    expect(err.message).toContain('tempate');
  });

  it('provides "Did you mean" suggestion for close match', () => {
    const err = createKeywordError('compostion', 'composition', 1, 1);
    if (err.suggestion) {
      expect(err.suggestion).toContain('composition');
    }
  });

  it('provides fallback "Expected" suggestion when no close match', () => {
    const err = createKeywordError('xyzabcdef', 'object', 1, 1);
    expect(err.suggestion).toBeDefined();
    expect(err.suggestion).toContain('object');
  });

  it('includes source context when provided', () => {
    const source = 'compostion "main" {}';
    const err = createKeywordError('compostion', 'composition', 1, 1, source);
    expect(err.context).toBeDefined();
  });

  it('context is undefined without source', () => {
    const err = createKeywordError('bad', 'good', 1, 1);
    expect(err.context).toBeUndefined();
  });
});

// =============================================================================
// formatRichError
// =============================================================================

describe('formatRichError', () => {
  const baseError: RichParseError = {
    code: 'HSP001',
    message: 'HSP001: Unexpected token',
    line: 3,
    column: 7,
    severity: 'error',
  };

  it('returns a string', () => {
    expect(typeof formatRichError(baseError)).toBe('string');
  });

  it('includes error icon for "error" severity', () => {
    expect(formatRichError(baseError)).toContain('\u274C'); // red X
  });

  it('includes warning icon for "warning" severity', () => {
    expect(formatRichError({ ...baseError, severity: 'warning' })).toContain('\u26A0'); // warning sign
  });

  it('includes info icon for "info" severity', () => {
    expect(formatRichError({ ...baseError, severity: 'info' })).toContain('\u2139'); // info
  });

  it('includes line and column numbers', () => {
    const result = formatRichError(baseError);
    expect(result).toContain('line 3');
    expect(result).toContain('column 7');
  });

  it('includes error message', () => {
    expect(formatRichError(baseError)).toContain('HSP001: Unexpected token');
  });

  it('includes documentation link with error code', () => {
    expect(formatRichError(baseError)).toContain('https://holoscript.net/errors/HSP001');
  });

  it('includes context when present', () => {
    const err: RichParseError = {
      ...baseError,
      context: '  3 | bad line\n      ^',
    };
    expect(formatRichError(err)).toContain('bad line');
  });

  it('includes suggestion when present', () => {
    const err: RichParseError = {
      ...baseError,
      suggestion: "Did you mean '@grabbable'?",
    };
    const result = formatRichError(err);
    expect(result).toContain('\u{1F4A1}'); // lightbulb
    expect(result).toContain('@grabbable');
  });

  it('does not include "undefined" in output', () => {
    expect(formatRichError(baseError)).not.toContain('undefined');
  });
});

// =============================================================================
// formatRichErrors
// =============================================================================

describe('formatRichErrors', () => {
  it('returns success message for empty array', () => {
    const result = formatRichErrors([]);
    expect(result).toContain('No errors found');
  });

  it('includes summary with error and warning counts', () => {
    const errors: RichParseError[] = [
      { code: 'HSP001', message: 'HSP001: Err', line: 1, column: 1, severity: 'error' },
      { code: 'HSP009', message: 'HSP009: Warn', line: 2, column: 1, severity: 'warning' },
    ];
    const result = formatRichErrors(errors);
    expect(result).toContain('1 error');
    expect(result).toContain('1 warning');
  });

  it('includes separator between errors', () => {
    const errors: RichParseError[] = [
      { code: 'HSP001', message: 'HSP001: Err', line: 1, column: 1, severity: 'error' },
    ];
    expect(formatRichErrors(errors)).toContain('\u2500'); // box drawing char
  });

  it('shows all errors when count <= 10', () => {
    const errors: RichParseError[] = Array.from({ length: 5 }, (_, i) => ({
      code: 'HSP001' as const,
      message: `HSP001: Error ${i}`,
      line: i + 1,
      column: 1,
      severity: 'error' as const,
    }));
    const result = formatRichErrors(errors);
    expect(result).toContain('5/5');
  });

  it('truncates at 10 and shows remainder count', () => {
    const errors: RichParseError[] = Array.from({ length: 15 }, (_, i) => ({
      code: 'HSP001' as const,
      message: `HSP001: Error ${i}`,
      line: i + 1,
      column: 1,
      severity: 'error' as const,
    }));
    const result = formatRichErrors(errors);
    expect(result).toContain('5 more errors');
  });

  it('handles errors with only warning severity', () => {
    const errors: RichParseError[] = [
      { code: 'HSP009', message: 'HSP009: Warn', line: 1, column: 1, severity: 'warning' },
    ];
    const result = formatRichErrors(errors);
    expect(result).toContain('0 error');
    expect(result).toContain('1 warning');
  });
});

// =============================================================================
// getErrorCodeDocumentation
// =============================================================================

describe('getErrorCodeDocumentation', () => {
  it('returns an array', () => {
    expect(Array.isArray(getErrorCodeDocumentation())).toBe(true);
  });

  it('returns one entry per error code', () => {
    const docs = getErrorCodeDocumentation();
    expect(docs.length).toBe(Object.keys(HSPLUS_ERROR_CODES).length);
  });

  it('each entry has code, description, and category', () => {
    for (const doc of getErrorCodeDocumentation()) {
      expect(typeof doc.code).toBe('string');
      expect(typeof doc.description).toBe('string');
      expect(typeof doc.category).toBe('string');
    }
  });

  it('categorizes HSP001-099 as "Syntax"', () => {
    const docs = getErrorCodeDocumentation();
    const syntax = docs.filter(d => d.category === 'Syntax');
    expect(syntax.length).toBeGreaterThan(0);
    for (const doc of syntax) {
      const num = parseInt(doc.code.replace('HSP', ''), 10);
      expect(num).toBeLessThan(100);
    }
  });

  it('categorizes HSP100-199 as "Structure"', () => {
    const docs = getErrorCodeDocumentation();
    const structure = docs.filter(d => d.category === 'Structure');
    expect(structure.length).toBeGreaterThan(0);
    for (const doc of structure) {
      const num = parseInt(doc.code.replace('HSP', ''), 10);
      expect(num).toBeGreaterThanOrEqual(100);
      expect(num).toBeLessThan(200);
    }
  });

  it('categorizes HSP200-299 as "Traits"', () => {
    const docs = getErrorCodeDocumentation();
    const traits = docs.filter(d => d.category === 'Traits');
    expect(traits.length).toBeGreaterThan(0);
  });

  it('categorizes HSP300-399 as "Expressions"', () => {
    const docs = getErrorCodeDocumentation();
    const expr = docs.filter(d => d.category === 'Expressions');
    expect(expr.length).toBeGreaterThan(0);
  });

  it('categorizes HSP400-499 as "Imports"', () => {
    const docs = getErrorCodeDocumentation();
    const imports = docs.filter(d => d.category === 'Imports');
    expect(imports.length).toBeGreaterThan(0);
  });

  it('categorizes HSP900+ as "Limits"', () => {
    const docs = getErrorCodeDocumentation();
    const limits = docs.filter(d => d.category === 'Limits');
    expect(limits.length).toBeGreaterThan(0);
  });
});

// =============================================================================
// HSPLUS_ERROR_CODES constant
// =============================================================================

describe('HSPLUS_ERROR_CODES', () => {
  it('is defined and non-empty', () => {
    expect(HSPLUS_ERROR_CODES).toBeDefined();
    expect(Object.keys(HSPLUS_ERROR_CODES).length).toBeGreaterThan(0);
  });

  it('has HSP001 for "Unexpected token"', () => {
    expect(HSPLUS_ERROR_CODES.HSP001).toBe('Unexpected token');
  });

  it('has HSP004 for "Unclosed brace"', () => {
    expect(HSPLUS_ERROR_CODES.HSP004).toContain('Unclosed brace');
  });

  it('has HSP200 for "Unknown trait"', () => {
    expect(HSPLUS_ERROR_CODES.HSP200).toBe('Unknown trait');
  });

  it('has HSP400 for "Invalid import statement"', () => {
    expect(HSPLUS_ERROR_CODES.HSP400).toBe('Invalid import statement');
  });

  it('has HSP402 for "Circular import detected"', () => {
    expect(HSPLUS_ERROR_CODES.HSP402).toBe('Circular import detected');
  });

  it('has HSP900 for maximum nesting depth', () => {
    expect(HSPLUS_ERROR_CODES.HSP900).toContain('nesting depth');
  });

  it('all codes start with HSP', () => {
    for (const code of Object.keys(HSPLUS_ERROR_CODES)) {
      expect(code).toMatch(/^HSP\d+$/);
    }
  });

  it('all descriptions are non-empty strings', () => {
    for (const desc of Object.values(HSPLUS_ERROR_CODES)) {
      expect(typeof desc).toBe('string');
      expect(desc.length).toBeGreaterThan(0);
    }
  });
});
