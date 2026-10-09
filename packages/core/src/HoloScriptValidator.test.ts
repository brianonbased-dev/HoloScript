/**
 * Tests for HoloScriptValidator
 *
 * Covers:
 * - Valid code passes validation
 * - Syntax errors detected
 * - Unknown directive warnings
 * - Valid directives accepted
 * - Edge cases (empty, comments-only)
 * - Parser errors and warnings reach the caller with 1-based positions
 */

import { describe, it, expect, vi } from 'vitest';
import { HoloScriptValidator } from './HoloScriptValidator';
import { HoloScriptCodeParser } from './HoloScriptCodeParser';

describe('HoloScriptValidator', () => {
  const validator = new HoloScriptValidator();

  describe('validate', () => {
    it('returns empty errors for valid code', () => {
      const code = `world myWorld {
  scene main {
    object cube {
    }
  }
}`;
      const errors = validator.validate(code);
      expect(errors.filter((e) => e.severity === 'error')).toEqual([]);
    });

    it('returns empty errors for empty code', () => {
      const errors = validator.validate('');
      expect(errors).toEqual([]);
    });

    it('returns empty errors for comment-only code', () => {
      const errors = validator.validate('// just a comment\n// another one');
      expect(errors).toEqual([]);
    });

    it('accepts valid directives', () => {
      const code = `@trait
@state
@on_enter
@lifecycle`;
      const errors = validator.validate(code);
      expect(errors.filter((e) => e.severity === 'error')).toEqual([]);
    });

    it('does not warn on unknown directives (deferred to HoloScriptPlusParser)', () => {
      // HoloScript has 1800+ traits; directive whitelist validation was removed from
      // this legacy validator to prevent false positives on all valid VR traits.
      const code = '@foobar';
      const errors = validator.validate(code);
      const warnings = errors.filter((e) => e.severity === 'warning');
      expect(warnings.length).toBe(0);
    });

    it('does not warn on multiple directives regardless of name', () => {
      const code = `@unknown1
@unknown2`;
      const errors = validator.validate(code);
      const warnings = errors.filter((e) => e.severity === 'warning');
      expect(warnings.length).toBe(0);
    });

    it('returns empty errors for directive-only code', () => {
      const code = `// comment
// comment 2
@invalid_directive`;
      const errors = validator.validate(code);
      expect(errors.filter((e) => e.severity === 'error')).toEqual([]);
    });
  });

  // validate() used to call parse() and throw the ParseResult away, so it
  // returned [] for everything — including input the parser itself rejected.
  describe('reports what the parser reports', () => {
    it('an unclosed brace is one error, positioned at line >= 1', () => {
      // The parser reports this end-of-input error at line 0 / column 0.
      const errors = validator.validate('object Cube {');
      expect(errors).toHaveLength(1);
      expect(errors[0].severity).toBe('error');
      expect(errors[0].message).toBe("Expected punctuation '}', got EOF ''");
      expect(errors[0].line).toBeGreaterThanOrEqual(1);
      expect(errors[0].column).toBeGreaterThanOrEqual(1);
    });

    it('keeps the line and column the parser gives', () => {
      // Unclosed array: the parser points at the newline after `2` (line 2, column 18).
      const errors = validator.validate('orb x {\n  position: [1, 2\n}');
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.every((e) => e.severity === 'error')).toBe(true);
      expect(errors[0]).toEqual({
        line: 2,
        column: 18,
        message: 'Unexpected token in array: newline',
        severity: 'error',
      });
    });

    it('surfaces a parser warning as severity warning', () => {
      // No path in HoloScriptCodeParser pushes to `warnings` today, so the
      // mapping is exercised with a ParseResult that carries one.
      vi.spyOn(HoloScriptCodeParser.prototype, 'parse').mockReturnValueOnce({
        success: true,
        ast: [],
        errors: [],
        warnings: ['deprecated keyword'],
      });
      expect(validator.validate('orb a {}')).toEqual([
        { line: 1, column: 1, message: 'deprecated keyword', severity: 'warning' },
      ]);
    });

    it('a failed parse that names no error still yields an error', () => {
      vi.spyOn(HoloScriptCodeParser.prototype, 'parse').mockReturnValueOnce({
        success: false,
        ast: [],
        errors: [],
        warnings: [],
      });
      const errors = validator.validate('orb a {}');
      expect(errors).toHaveLength(1);
      expect(errors[0].severity).toBe('error');
    });

    it('still reports a thrown exception, clamped to line 1', () => {
      const errors = validator.validate(undefined as unknown as string);
      expect(errors).toHaveLength(1);
      expect(errors[0].severity).toBe('error');
      expect(errors[0].line).toBe(1);
      expect(errors[0].column).toBe(1);
    });
  });
});
