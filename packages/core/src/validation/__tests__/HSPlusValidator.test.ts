import { describe, it, expect } from 'vitest';
import { validateHSPlus, type HSPlusValidationResult } from '../HSPlusValidator';

describe('validateHSPlus', () => {
  // --------------------------------------------------------------------------
  // Valid inputs
  // --------------------------------------------------------------------------
  describe('valid HSPlus code', () => {
    it('validates well-formed code with @trait decorator and property types', () => {
      const code = `
        @trait {
          intensity :number = 1.0
          color :color = "#ffffff"
          enabled :boolean = true
        }
      `;
      const result: HSPlusValidationResult = validateHSPlus(code);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('validates code with @material decorator', () => {
      const code = `
        @material {
          roughness :number = 0.5
          metallic :number = 1.0
        }
      `;
      const result = validateHSPlus(code);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('validates code with @shader decorator', () => {
      const code = `
        @shader {
          vertex :string = "main_vs"
          fragment :string = "main_fs"
        }
      `;
      const result = validateHSPlus(code);
      expect(result.valid).toBe(true);
    });

    it('validates code with @animation decorator', () => {
      const code = `
        @animation {
          duration :number = 2.5
          loop :boolean = true
        }
      `;
      const result = validateHSPlus(code);
      expect(result.valid).toBe(true);
    });

    it('validates code with @interaction decorator', () => {
      const code = `
        @interaction {
          range :number = 5.0
          highlight :color = "#00ff00"
        }
      `;
      const result = validateHSPlus(code);
      expect(result.valid).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // Syntax errors
  // --------------------------------------------------------------------------
  describe('syntax errors', () => {
    it('reports error when missing decorator and braces', () => {
      const code = 'just plain text without any structure';
      const result = validateHSPlus(code);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.type === 'syntax')).toBe(true);
      expect(
        result.errors.some((e) => e.message.includes('missing trait decorator or braces'))
      ).toBe(true);
    });

    it('reports error for unbalanced braces', () => {
      const code = `
        @trait {
          value :number = 1.0
      `;
      const result = validateHSPlus(code);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.message.includes('Unbalanced braces'))).toBe(true);
    });

    it('reports error when extra closing braces', () => {
      const code = `
        @trait {
          value :number = 1.0
        }}
      `;
      const result = validateHSPlus(code);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.message.includes('Unbalanced braces'))).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // Semantic errors
  // --------------------------------------------------------------------------
  describe('semantic errors', () => {
    it('reports error for undefined/null references in code', () => {
      const code = `
        @trait {
          value :number = undefined
        }
      `;
      const result = validateHSPlus(code);
      expect(result.valid).toBe(false);
      expect(
        result.errors.some((e) => e.type === 'semantic' && e.message.includes('undefined or null'))
      ).toBe(true);
    });

    it('reports error for null references', () => {
      const code = `
        @trait {
          value :number = null
        }
      `;
      const result = validateHSPlus(code);
      expect(result.valid).toBe(false);
      expect(
        result.errors.some((e) => e.type === 'semantic' && e.message.includes('undefined or null'))
      ).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // Warnings
  // --------------------------------------------------------------------------
  describe('warnings', () => {
    it('warns when no recognized trait decorator found', () => {
      const code = `
        @custom_unknown {
          value :number = 1.0
        }
      `;
      const result = validateHSPlus(code);
      // Code is valid (has @ and braces), but triggers a warning
      expect(result.valid).toBe(true);
      expect(result.warnings.some((w) => w.message.includes('No recognized trait decorator'))).toBe(
        true
      );
    });

    it('warns when no recognized property types found', () => {
      const code = `
        @trait {
          value = 1.0
        }
      `;
      const result = validateHSPlus(code);
      expect(result.warnings.some((w) => w.message.includes('No recognized property types'))).toBe(
        true
      );
    });

    it('warns about reserved keywords', () => {
      const code = `
        @trait {
          override :number = 1.0
          value :string = "test"
        }
      `;
      const result = validateHSPlus(code);
      expect(result.warnings.some((w) => w.message.includes('reserved keyword: override'))).toBe(
        true
      );
    });

    it('warns about code exceeding size limit', () => {
      // Generate code over 100KB
      const largeLine = 'x :number = 1.0\n';
      const largeCode = `@trait {\n${'  ' + largeLine.repeat(7000)}\n}`;
      const result = validateHSPlus(largeCode);
      expect(result.warnings.some((w) => w.message.includes('exceeds'))).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // Edge cases
  // --------------------------------------------------------------------------
  describe('edge cases', () => {
    it('handles code with both valid decorator and property types (no warnings)', () => {
      const code = `
        @material {
          roughness :number = 0.5
        }
      `;
      const result = validateHSPlus(code);
      expect(result.valid).toBe(true);
      // Should have no decorator or property type warnings
      expect(
        result.warnings.filter(
          (w) =>
            w.message.includes('No recognized trait') ||
            w.message.includes('No recognized property')
        )
      ).toHaveLength(0);
    });

    it('all errors have recoverable flag set', () => {
      const code = 'broken code without any structure';
      const result = validateHSPlus(code);
      for (const error of result.errors) {
        expect(typeof error.recoverable).toBe('boolean');
      }
    });
  });
});
