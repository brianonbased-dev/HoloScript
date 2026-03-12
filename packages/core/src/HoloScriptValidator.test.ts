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
});
