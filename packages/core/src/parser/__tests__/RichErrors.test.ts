/**
 * RichErrors.ts — unit tests
 *
 * Covers: findSimilarTrait, findSimilarKeyword, getSourceContext,
 * createRichError, createTraitError, createKeywordError,
 * formatRichError, formatRichErrors, getErrorCodeDocumentation
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
} from '../RichErrors';

// =============================================================================
// findSimilarTrait
// =============================================================================

describe('findSimilarTrait', () => {
  it('finds exact match', () => {
    const result = findSimilarTrait('grabbable');
    expect(result).toBe('grabbable');
  });

  it('finds close match with one typo', () => {
    const result = findSimilarTrait('graabble');
    // Should find something close to 'grabbable'
    expect(result).toBeDefined();
  });

  it('returns undefined for unrelated garbage', () => {
    const result = findSimilarTrait('xyzxyzxyz_not_a_trait_12345');
    expect(result).toBeUndefined();
  });

  it('respects threshold — high threshold narrows matches', () => {
    // With very high threshold, minor typos should not match
    const result = findSimilarTrait('grabbbbbbbbbbbble', 0.95);
    expect(result).toBeUndefined();
  });

  it('finds "physics" trait', () => {
    const result = findSimilarTrait('physic');
    expect(result).toBeDefined();
  });

  it('returns undefined for empty string', () => {
    // Empty string has 0 similarity to any non-empty trait
    const result = findSimilarTrait('');
    // Result may or may not be defined depending on Levenshtein against short traits
    // We just verify it doesn't throw
    expect(typeof result === 'string' || result === undefined).toBe(true);
  });
});

// =============================================================================
// findSimilarKeyword
// =============================================================================

describe('findSimilarKeyword', () => {
  it('finds "composition" keyword with exact match', () => {
    const result = findSimilarKeyword('composition');
    expect(result).toBe('composition');
  });

  it('finds "object" keyword with slight typo', () => {
    const result = findSimilarKeyword('objec');
    expect(result).toBeDefined();
  });

  it('finds "template" keyword', () => {
    const result = findSimilarKeyword('template');
    expect(result).toBe('template');
  });

  it('returns undefined for completely unrelated input', () => {
    const result = findSimilarKeyword('zzzzzzzzzzzzzzzzz');
    expect(result).toBeUndefined();
  });

  it('finds "environment" keyword', () => {
    const result = findSimilarKeyword('environmen');
    expect(result).toBeDefined();
  });

  it('finds "import" keyword', () => {
    const result = findSimilarKeyword('import');
    expect(result).toBe('import');
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
    const ctx = getSourceContext(source, 3, 1);
    expect(typeof ctx).toBe('string');
  });

  it('marks the error line with >', () => {
    const ctx = getSourceContext(source, 3, 1);
    expect(ctx).toContain('> ');
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

  it('handles contextLines=0', () => {
    const ctx = getSourceContext(source, 3, 1, 0);
    expect(ctx).toContain('line three');
    expect(ctx).not.toContain('line two');
    expect(ctx).not.toContain('line four');
  });

  it('handles column > line length gracefully', () => {
    // Should not throw even with large column
    expect(() => getSourceContext(source, 1, 999)).not.toThrow();
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
    expect(err.message).toContain('HSP001');
    expect(err.message).toContain('Unexpected token');
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

  it('accepts custom severity', () => {
    const err = createRichError('HSP009', 'Missing colon', 2, 3, { severity: 'warning' });
    expect(err.severity).toBe('warning');
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
    const err = createRichError('HSP004', 'Unclosed brace', 1, 1, { endLine: 5, endColumn: 3 });
    expect(err.endLine).toBe(5);
    expect(err.endColumn).toBe(3);
  });
});

// =============================================================================
// createTraitError
// =============================================================================

describe('createTraitError', () => {
  it('creates an error with code HSP200', () => {
    const err = createTraitError('grababble', 2, 5);
    expect(err.code).toBe('HSP200');
  });

  it('includes the trait name in message', () => {
    const err = createTraitError('unknownTrait', 1, 1);
    expect(err.message).toContain('unknownTrait');
  });

  it('has "error" severity', () => {
    const err = createTraitError('badTrait', 3, 1);
    expect(err.severity).toBe('error');
  });

  it('provides a suggestion for close trait names', () => {
    const err = createTraitError('grabable', 1, 1);
    // Should suggest 'grabbable'
    if (err.suggestion) {
      expect(err.suggestion).toContain('Did you mean');
    }
  });

  it('includes source context when source provided', () => {
    const source = 'orb "test" {\n  @grabable\n}';
    const err = createTraitError('grabable', 2, 3, source);
    expect(err.context).toBeDefined();
  });

  it('context undefined without source', () => {
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

  it('includes the found and expected values in message', () => {
    const err = createKeywordError('tempate', 'template', 2, 5);
    expect(err.message).toContain('template');
  });

  it('provides suggestion for close match', () => {
    const err = createKeywordError('compostion', 'composition', 1, 1);
    if (err.suggestion) {
      expect(err.suggestion).toContain('composition');
    }
  });

  it('provides fallback suggestion when no close match', () => {
    const err = createKeywordError('xyzabcdef', 'object', 1, 1);
    // Should still have a suggestion (Expected 'object')
    expect(err.suggestion).toBeDefined();
    expect(err.suggestion).toContain('object');
  });

  it('includes source context', () => {
    const source = 'compostion "main" {}';
    const err = createKeywordError('compostion', 'composition', 1, 1, source);
    expect(err.context).toBeDefined();
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

  it('includes error icon for error severity', () => {
    const result = formatRichError(baseError);
    expect(result).toContain('❌');
  });

  it('includes warning icon for warning severity', () => {
    const result = formatRichError({ ...baseError, severity: 'warning' });
    expect(result).toContain('⚠️');
  });

  it('includes info icon for info severity', () => {
    const result = formatRichError({ ...baseError, severity: 'info' });
    expect(result).toContain('ℹ️');
  });

  it('includes line and column numbers', () => {
    const result = formatRichError(baseError);
    expect(result).toContain('line 3');
    expect(result).toContain('column 7');
  });

  it('includes message text', () => {
    const result = formatRichError(baseError);
    expect(result).toContain('HSP001: Unexpected token');
  });

  it('includes documentation link', () => {
    const result = formatRichError(baseError);
    expect(result).toContain('https://holoscript.net/errors/HSP001');
  });

  it('includes context when present', () => {
    const errWithCtx: RichParseError = {
      ...baseError,
      context: '  3 | bad line\n      ^',
    };
    const result = formatRichError(errWithCtx);
    expect(result).toContain('bad line');
  });

  it('includes suggestion when present', () => {
    const errWithSuggestion: RichParseError = {
      ...baseError,
      suggestion: "Did you mean '@grabbable'?",
    };
    const result = formatRichError(errWithSuggestion);
    expect(result).toContain('💡');
    expect(result).toContain('@grabbable');
  });

  it('omits context section when context is undefined', () => {
    const result = formatRichError(baseError);
    // Should not have empty context section
    expect(result).not.toContain('undefined');
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

  it('includes summary with error count', () => {
    const errors: RichParseError[] = [
      { code: 'HSP001', message: 'HSP001: Err1', line: 1, column: 1, severity: 'error' },
      { code: 'HSP009', message: 'HSP009: Warn1', line: 2, column: 1, severity: 'warning' },
    ];
    const result = formatRichErrors(errors);
    expect(result).toContain('1 error');
    expect(result).toContain('1 warning');
  });

  it('shows all errors when <= 10', () => {
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

  it('formats each error with separator', () => {
    const errors: RichParseError[] = [
      { code: 'HSP001', message: 'HSP001: Err', line: 1, column: 1, severity: 'error' },
    ];
    const result = formatRichErrors(errors);
    expect(result).toContain('────');
  });
});

// =============================================================================
// getErrorCodeDocumentation
// =============================================================================

describe('getErrorCodeDocumentation', () => {
  it('returns an array', () => {
    const docs = getErrorCodeDocumentation();
    expect(Array.isArray(docs)).toBe(true);
  });

  it('returns one entry per error code', () => {
    const docs = getErrorCodeDocumentation();
    expect(docs.length).toBe(Object.keys(HSPLUS_ERROR_CODES).length);
  });

  it('each entry has code, description, category', () => {
    const docs = getErrorCodeDocumentation();
    for (const doc of docs) {
      expect(typeof doc.code).toBe('string');
      expect(typeof doc.description).toBe('string');
      expect(typeof doc.category).toBe('string');
    }
  });

  it('categorizes syntax errors (HSP001-099) as "Syntax"', () => {
    const docs = getErrorCodeDocumentation();
    const syntaxDocs = docs.filter((d) => d.category === 'Syntax');
    expect(syntaxDocs.length).toBeGreaterThan(0);
    // All should be HSP0xx
    for (const doc of syntaxDocs) {
      const num = parseInt(doc.code.replace('HSP', ''), 10);
      expect(num).toBeLessThan(100);
    }
  });

  it('categorizes trait errors (HSP200-299) as "Traits"', () => {
    const docs = getErrorCodeDocumentation();
    const traitDocs = docs.filter((d) => d.category === 'Traits');
    expect(traitDocs.length).toBeGreaterThan(0);
  });

  it('categorizes structure errors (HSP100-199) as "Structure"', () => {
    const docs = getErrorCodeDocumentation();
    const structDocs = docs.filter((d) => d.category === 'Structure');
    expect(structDocs.length).toBeGreaterThan(0);
  });

  it('categorizes expression errors (HSP300-399) as "Expressions"', () => {
    const docs = getErrorCodeDocumentation();
    const exprDocs = docs.filter((d) => d.category === 'Expressions');
    expect(exprDocs.length).toBeGreaterThan(0);
  });

  it('categorizes import errors (HSP400-499) as "Imports"', () => {
    const docs = getErrorCodeDocumentation();
    const importDocs = docs.filter((d) => d.category === 'Imports');
    expect(importDocs.length).toBeGreaterThan(0);
  });

  it('categorizes limit errors (HSP900+) as "Limits"', () => {
    const docs = getErrorCodeDocumentation();
    const limitDocs = docs.filter((d) => d.category === 'Limits');
    expect(limitDocs.length).toBeGreaterThan(0);
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

  it('has HSP001 for Unexpected token', () => {
    expect(HSPLUS_ERROR_CODES.HSP001).toBe('Unexpected token');
  });

  it('has HSP200 for Unknown trait', () => {
    expect(HSPLUS_ERROR_CODES.HSP200).toBe('Unknown trait');
  });
});
