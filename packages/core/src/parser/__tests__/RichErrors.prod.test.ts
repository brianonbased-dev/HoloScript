/**
 * RichErrors Production Tests
 *
 * Tests similarity functions, error creation helpers, error formatting,
 * and error code documentation generation.
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
} from '../../parser/RichErrors';

// ─── Similarity Functions ────────────────────────────────────────────────

describe('findSimilarTrait — Production', () => {
  it('finds exact trait match', () => {
    expect(findSimilarTrait('grabbable')).toBe('grabbable');
  });

  it('finds close typo', () => {
    const result = findSimilarTrait('graabable');
    expect(result).toBe('grabbable');
  });

  it('returns undefined for nonsense', () => {
    expect(findSimilarTrait('xyzxyzxyz')).toBeUndefined();
  });
});

describe('findSimilarKeyword — Production', () => {
  it('finds exact keyword', () => {
    expect(findSimilarKeyword('composition')).toBe('composition');
  });

  it('finds close keyword typo', () => {
    expect(findSimilarKeyword('positon')).toBe('position');
  });

  it('returns undefined for nonsense', () => {
    expect(findSimilarKeyword('xyzxyzxyz')).toBeUndefined();
  });
});

// ─── Source Context ──────────────────────────────────────────────────────

describe('getSourceContext — Production', () => {
  const source = `line1
line2
line3
line4
line5`;

  it('highlights error line with >', () => {
    const ctx = getSourceContext(source, 3, 1);
    expect(ctx).toContain('>');
    expect(ctx).toContain('line3');
  });

  it('shows surrounding lines', () => {
    const ctx = getSourceContext(source, 3, 1, 1);
    expect(ctx).toContain('line2');
    expect(ctx).toContain('line4');
  });

  it('includes caret indicator', () => {
    const ctx = getSourceContext(source, 3, 3);
    expect(ctx).toContain('^');
  });
});

// ─── Error Creation ──────────────────────────────────────────────────────

describe('createRichError — Production', () => {
  it('creates error with code prefix', () => {
    const err = createRichError('HSP001', 'bad token', 1, 5);
    expect(err.message).toContain('HSP001');
    expect(err.line).toBe(1);
    expect(err.column).toBe(5);
    expect(err.severity).toBe('error');
  });

  it('includes source context when provided', () => {
    const err = createRichError('HSP004', 'missing brace', 1, 1, {
      source: 'composition "test" {',
    });
    expect(err.context).toBeDefined();
    expect(err.context).toContain('composition');
  });

  it('respects custom severity', () => {
    const err = createRichError('HSP200', 'unknown trait', 1, 1, { severity: 'warning' });
    expect(err.severity).toBe('warning');
  });
});

describe('createTraitError — Production', () => {
  it('creates trait error with suggestion', () => {
    const err = createTraitError('graabable', 5, 3);
    expect(err.code).toBe('HSP200');
    expect(err.suggestion).toContain('grabbable');
  });

  it('handles completely unknown trait', () => {
    const err = createTraitError('xyzxyzxyz', 1, 1);
    expect(err.code).toBe('HSP200');
  });
});

describe('createKeywordError — Production', () => {
  it('creates keyword error with suggestion', () => {
    const err = createKeywordError('positon', 'position', 3, 5);
    expect(err.code).toBe('HSP003');
    expect(err.suggestion).toContain('position');
  });
});

// ─── Formatting ──────────────────────────────────────────────────────────

describe('formatRichError — Production', () => {
  it('includes icon, message, and line', () => {
    const err = createRichError('HSP001', 'bad token', 3, 5);
    const formatted = formatRichError(err);
    expect(formatted).toContain('❌');
    expect(formatted).toContain('line 3');
    expect(formatted).toContain('HSP001');
  });

  it('includes suggestion when present', () => {
    const err = createRichError('HSP001', 'bad', 1, 1, { suggestion: 'try this' });
    const formatted = formatRichError(err);
    expect(formatted).toContain('💡 try this');
  });

  it('includes doc link', () => {
    const err = createRichError('HSP001', 'bad', 1, 1);
    expect(formatRichError(err)).toContain('holoscript.net/errors/HSP001');
  });
});

describe('formatRichErrors — Production', () => {
  it('returns success message for empty array', () => {
    expect(formatRichErrors([])).toContain('No errors found');
  });

  it('shows error and warning counts', () => {
    const errors = [
      createRichError('HSP001', 'err1', 1, 1),
      createRichError('HSP200', 'warn1', 2, 1, { severity: 'warning' }),
    ];
    const output = formatRichErrors(errors);
    expect(output).toContain('1 error(s)');
    expect(output).toContain('1 warning(s)');
  });
});

// ─── Error Code Documentation ────────────────────────────────────────────

describe('getErrorCodeDocumentation — Production', () => {
  it('returns all error codes', () => {
    const docs = getErrorCodeDocumentation();
    expect(docs.length).toBe(Object.keys(HSPLUS_ERROR_CODES).length);
  });

  it('categorizes codes correctly', () => {
    const docs = getErrorCodeDocumentation();
    const syntax = docs.filter(d => d.category === 'Syntax');
    const traits = docs.filter(d => d.category === 'Traits');
    expect(syntax.length).toBeGreaterThan(0);
    expect(traits.length).toBeGreaterThan(0);
  });

  it('each entry has code, description, category', () => {
    const docs = getErrorCodeDocumentation();
    for (const doc of docs) {
      expect(doc.code).toBeDefined();
      expect(doc.description).toBeDefined();
      expect(doc.category).toBeDefined();
    }
  });
});
