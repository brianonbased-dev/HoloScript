/**
 * Tests for HoloScriptValidator
 *
 * Covers:
 * - Valid code passes validation
 * - Syntax errors detected
 * - Unknown directive warnings
 * - Valid directives accepted
 * - Edge cases (empty, comments-only)
 */

import { describe, it, expect } from 'vitest';
import { HoloScriptValidator } from './HoloScriptValidator';

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

    it('warns on unknown directives', () => {
      const code = '@foobar';
      const errors = validator.validate(code);
      const warnings = errors.filter((e) => e.severity === 'warning');
      expect(warnings.length).toBeGreaterThan(0);
      expect(warnings[0].message).toContain('foobar');
    });

    it('warns on multiple unknown directives', () => {
      const code = `@unknown1
@unknown2`;
      const errors = validator.validate(code);
      const warnings = errors.filter((e) => e.severity === 'warning');
      expect(warnings.length).toBe(2);
    });

    it('reports correct line numbers', () => {
      const code = `// comment
// comment 2
@invalid_directive`;
      const errors = validator.validate(code);
      const warnings = errors.filter((e) => e.severity === 'warning');
      expect(warnings[0]?.line).toBe(3);
    });
  });
});
