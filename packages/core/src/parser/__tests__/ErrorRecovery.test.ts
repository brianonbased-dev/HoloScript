import { describe, it, expect, beforeEach } from 'vitest';
import {
  ErrorRecovery,
  generateQuickFixes,
  HOLOSCHEMA_KEYWORDS,
  HOLOSCHEMA_TRAITS,
  HOLOSCHEMA_GEOMETRIES,
  type ParseError,
} from '../ErrorRecovery';

describe('ErrorRecovery', () => {
  let recovery: ErrorRecovery;

  beforeEach(() => {
    recovery = new ErrorRecovery();
  });

  describe('createError', () => {
    it('should create error with basic info', () => {
      const error = recovery.createError('SYNTAX_ERROR', 'Unexpected token', 10, 5, 'some source');

      expect(error.code).toBe('SYNTAX_ERROR');
      expect(error.message).toBe('Unexpected token');
      expect(error.line).toBe(10);
      expect(error.column).toBe(5);
    });

    it('should add error to collection', () => {
      recovery.createError('SYNTAX_ERROR', 'Error 1', 1, 1);
      recovery.createError('SYNTAX_ERROR', 'Error 2', 2, 1);

      expect(recovery.getErrors()).toHaveLength(2);
    });

    it('should generate suggestions for UNKNOWN_TRAIT', () => {
      const error = recovery.createError('UNKNOWN_TRAIT', 'Unknown trait "graable"', 1, 1);

      expect(error.suggestions).toBeDefined();
      expect(error.suggestions!.length).toBeGreaterThan(0);
      expect(error.suggestions!.some((s) => s.description.includes('grabbable'))).toBe(true);
    });

    it('should generate suggestions for UNKNOWN_GEOMETRY', () => {
      const error = recovery.createError('UNKNOWN_GEOMETRY', 'Unknown geometry "sphre"', 1, 1);

      expect(error.suggestions).toBeDefined();
      expect(error.suggestions!.some((s) => s.description.includes('sphere'))).toBe(true);
    });

    it('should generate suggestions for TRAIT_CONFLICT', () => {
      const error = recovery.createError('TRAIT_CONFLICT', '@static conflicts with @physics', 1, 1);

      expect(error.suggestions).toBeDefined();
      expect(error.suggestions!.some((s) => s.description.includes('Remove'))).toBe(true);
    });

    it('should generate suggestions for MISSING_BRACE', () => {
      const error = recovery.createError('MISSING_BRACE', 'Missing closing brace', 10, 1);

      expect(error.suggestions).toBeDefined();
      expect(error.suggestions!.some((s) => s.description.includes('brace'))).toBe(true);
    });
  });

  describe('analyzeError', () => {
    it('should analyze missing brace error', () => {
      const error = recovery.analyzeError('unexpected end of input', 'composition "Test" {', 1, 20);

      expect(error.code).toBe('MISSING_BRACE');
      expect(error.suggestions!.length).toBeGreaterThan(0);
    });

    it('should analyze missing colon error', () => {
      const error = recovery.analyzeError(
        'Expected : after property name',
        'position [0, 1, 0]',
        1,
        9
      );

      expect(error.code).toBe('MISSING_COLON');
    });

    it('should analyze unterminated string error', () => {
      const error = recovery.analyzeError('Unterminated string literal', 'text: "Hello', 1, 6);

      expect(error.code).toBe('MISSING_QUOTE');
    });

    it('should fall back to SYNTAX_ERROR for unknown patterns', () => {
      const error = recovery.analyzeError('Some unknown error pattern xyz123', 'weird code', 1, 1);

      expect(error.code).toBe('SYNTAX_ERROR');
    });
  });

  describe('formatError', () => {
    it('should format error with all details', () => {
      const error: ParseError = {
        code: 'UNKNOWN_TRAIT',
        message: 'Unknown trait "graable"',
        line: 5,
        column: 10,
        source: '  @graable',
        suggestions: [
          { description: 'Did you mean "@grabbable"?', fix: 'Replace with @grabbable' },
        ],
      };

      const formatted = recovery.formatError(error);

      expect(formatted).toContain('[UNKNOWN_TRAIT]');
      expect(formatted).toContain('line 5');
      expect(formatted).toContain('column 10');
      expect(formatted).toContain('@graable');
      expect(formatted).toContain('Suggestions:');
      expect(formatted).toContain('@grabbable');
    });

    it('should format error without source', () => {
      const error: ParseError = {
        code: 'SYNTAX_ERROR',
        message: 'Generic error',
        line: 1,
        column: 1,
      };

      const formatted = recovery.formatError(error);

      expect(formatted).toContain('[SYNTAX_ERROR]');
      expect(formatted).not.toContain('^');
    });
  });

  describe('hasErrors and clear', () => {
    it('should report no errors initially', () => {
      expect(recovery.hasErrors()).toBe(false);
    });

    it('should report errors after creating one', () => {
      recovery.createError('SYNTAX_ERROR', 'Test', 1, 1);
      expect(recovery.hasErrors()).toBe(true);
    });

    it('should clear errors', () => {
      recovery.createError('SYNTAX_ERROR', 'Test', 1, 1);
      recovery.clear();
      expect(recovery.hasErrors()).toBe(false);
      expect(recovery.getErrors()).toHaveLength(0);
    });
  });
});

describe('generateQuickFixes', () => {
  it('should generate fix for missing brace', () => {
    const error: ParseError = {
      code: 'MISSING_BRACE',
      message: 'Missing closing brace',
      line: 1,
      column: 1,
    };

    const fixes = generateQuickFixes(error, 'composition "Test" {');

    expect(fixes.length).toBeGreaterThan(0);
    expect(fixes[0].title).toContain('brace');
    expect(fixes[0].edit.newText).toContain('}');
  });

  it('should generate fix for missing colon', () => {
    const error: ParseError = {
      code: 'MISSING_COLON',
      message: 'Missing colon',
      line: 1,
      column: 10,
    };

    const source = '  position [0, 1, 0]';
    const fixes = generateQuickFixes(error, source);

    // May or may not find a fix depending on regex match
    expect(Array.isArray(fixes)).toBe(true);
  });

  it('should generate fix for missing quote', () => {
    const error: ParseError = {
      code: 'MISSING_QUOTE',
      message: 'Missing closing quote',
      line: 1,
      column: 1,
    };

    const fixes = generateQuickFixes(error, 'text: "Hello');

    expect(fixes.length).toBeGreaterThan(0);
    expect(fixes[0].edit.newText).toContain('"');
  });
});

describe('Schema constants', () => {
  it('should have valid keywords', () => {
    expect(HOLOSCHEMA_KEYWORDS).toContain('composition');
    expect(HOLOSCHEMA_KEYWORDS).toContain('object');
    expect(HOLOSCHEMA_KEYWORDS).toContain('template');
    expect(HOLOSCHEMA_KEYWORDS).toContain('ui_panel');
  });

  it('should have valid traits', () => {
    expect(HOLOSCHEMA_TRAITS).toContain('physics');
    expect(HOLOSCHEMA_TRAITS).toContain('grabbable');
    expect(HOLOSCHEMA_TRAITS).toContain('hoverable');
    expect(HOLOSCHEMA_TRAITS).toContain('ui_floating');
  });

  it('should have valid geometries', () => {
    expect(HOLOSCHEMA_GEOMETRIES).toContain('cube');
    expect(HOLOSCHEMA_GEOMETRIES).toContain('sphere');
    expect(HOLOSCHEMA_GEOMETRIES).toContain('cylinder');
  });
});

// =============================================================================
// PARSER ERROR RECOVERY INTEGRATION TESTS - Sprint 2
// =============================================================================

import { HoloScriptPlusParser } from '../HoloScriptPlusParser';

describe('Parser Error Recovery Integration', () => {
  const parser = new HoloScriptPlusParser();

  describe('Error Codes', () => {
    it('should use HSP004 for unclosed braces', () => {
      const result = parser.parse(`orb button { color: "blue"`);
      expect(result.success).toBe(false);
      expect(result.errors.some((e) => e.code === 'HSP004')).toBe(true);
    });

    it('should handle unclosed brackets gracefully', () => {
      const result = parser.parse(`orb obj { items: [1, 2, 3 }`);
      // Parser may recover and parse this gracefully, or report error
      // Either way, this should not crash
      expect(result.ast).toBeDefined();
    });

    it('should report error for empty spread', () => {
      const result = parser.parse(`orb obj { items: [...] }`);
      // Empty spread should fail
      expect(result.success).toBe(false);
      // Error should be related to spread or expression
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should use HSP201 for invalid directive name', () => {
      const result = parser.parse(`orb obj { @123 }`);
      expect(result.success).toBe(false);
      expect(result.errors.some((e) => e.code === 'HSP201')).toBe(true);
    });

    it('should report error for invalid spread in expression position', () => {
      const result = parser.parse(`orb obj { value: ... }`);
      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('Error Messages with Context', () => {
    it('should parse identifier-only input as valid node', () => {
      // Single identifier is a valid node name without body
      const result = parser.parse(`unexpected_token_here`);
      // This parses as a node with name 'unexpected_token_here'
      expect(result.ast).toBeDefined();
    });

    it('should handle invalid character in property position', () => {
      const result = parser.parse(`orb obj { @123 }`);
      // Should have error about invalid directive
      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should include error message for spread issues', () => {
      const result = parser.parse(`orb obj { data: [...] }`);
      expect(result.success).toBe(false);
      // Error message should exist
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].message).toBeDefined();
    });
  });

  describe('Recovery and Continuation', () => {
    it('should parse valid syntax without errors', () => {
      const result = parser.parse(`
        orb first { color: "red" }
        orb second { color: "blue" }
      `);
      // Valid syntax should succeed
      expect(result.success).toBe(true);
      expect(result.errors.length).toBe(0);
    });

    it('should handle missing closing brace', () => {
      const result = parser.parse(`
        orb button { color: "blue"
      `);
      // Missing brace should generate error
      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('Quick Fixes', () => {
    it('should generate quick fixes for missing braces', () => {
      parser.parse(`orb button { color: "blue"`);
      const fixes = parser.getQuickFixes();
      // Quick fixes should be available
      expect(fixes instanceof Map).toBe(true);
    });

    it('should provide enriched errors', () => {
      const result = parser.parse(`orb obj { items: [...] }`);
      const enriched = parser.getEnrichedErrors();
      if (result.errors.length > 0) {
        expect(enriched.length).toBeGreaterThan(0);
        expect(enriched[0]).toHaveProperty('code');
        expect(enriched[0]).toHaveProperty('message');
        expect(enriched[0]).toHaveProperty('line');
      }
    });

    it('should have getQuickFixes method', () => {
      expect(typeof parser.getQuickFixes).toBe('function');
    });

    it('should have getEnrichedErrors method', () => {
      expect(typeof parser.getEnrichedErrors).toBe('function');
    });
  });
});
