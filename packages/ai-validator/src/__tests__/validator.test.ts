/**
 * AI Validator Tests
 *
 * Validates that the AI validator correctly detects hallucinations and
 * prevents invalid AI-generated code from breaking workflows.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { AIValidator, validateAICode } from '../index';

describe('AIValidator', () => {
  let validator: AIValidator;

  beforeEach(() => {
    validator = new AIValidator({
      strict: false,
      hallucinationThreshold: 50,
      detectHallucinations: true,
    });
  });

  describe('Valid Code', () => {
    it('should validate correct HoloScript code', async () => {
      const validCode = `
        cube {
          @color(red)
          @position(0, 1, 0)
          @grabbable
        }
      `;

      const result = await validator.validate(validCode);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.metadata.hallucinationScore).toBeLessThan(50);
    });

    it('should allow complex valid scenes', async () => {
      const complexScene = `
        sphere {
          @color(blue)
          @position(0, 2, 0)
          @physics
          @grabbable
          @throwable

          cube {
            @color(red)
            @position(0, 0.5, 0)
            @scale(0.5, 0.5, 0.5)
          }
        }
      `;

      const result = await validator.validate(complexScene);
      expect(result.valid).toBe(true);
    });
  });

  describe('Syntax Validation', () => {
    it('should reject invalid syntax', async () => {
      const invalidCode = `
        cube {{{
          @color(red)
        }
      `;

      const result = await validator.validate(invalidCode);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.type === 'syntax')).toBe(true);
    });

    it('should detect triple brace hallucinations', async () => {
      const hallucinatedCode = `
        cube {{{
          @color(red)
        }}}
      `;

      const result = await validator.validate(hallucinatedCode);

      expect(result.valid).toBe(false);
      expect(result.metadata.hallucinationScore).toBeGreaterThan(0);
    });
  });

  describe('Structural Validation', () => {
    it('should detect unbalanced braces', async () => {
      const unbalanced = `
        cube {
          @color(red)
      `;

      const result = await validator.validate(unbalanced);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.type === 'structural')).toBe(true);
      expect(result.errors.some((e) => e.message.includes('unclosed'))).toBe(true);
    });

    it('should detect extra closing braces', async () => {
      const extraBrace = `
        cube {
          @color(red)
        }}
      `;

      const result = await validator.validate(extraBrace);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.type === 'structural')).toBe(true);
    });
  });

  describe('Trait Validation', () => {
    it('should reject unknown traits', async () => {
      const unknownTrait = `
        cube {
          @magic_flying
          @ai_powered
        }
      `;

      const result = await validator.validate(unknownTrait);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.type === 'trait')).toBe(true);
      expect(result.errors.some((e) => e.message.includes('@magic_flying'))).toBe(true);
    });

    it('should suggest similar valid traits', async () => {
      const typoTrait = `
        cube {
          @grabable
        }
      `;

      const result = await validator.validate(typoTrait);

      expect(result.valid).toBe(false);
      const traitError = result.errors.find((e) => e.type === 'trait');
      expect(traitError?.suggestion).toContain('@grabbable');
    });

    it('should allow all known traits', async () => {
      const allTraits = `
        cube {
          @grabbable
          @physics
          @color(red)
          @position(0, 0, 0)
        }
      `;

      const result = await validator.validate(allTraits);
      expect(result.valid).toBe(true);
    });
  });

  describe('Hallucination Detection', () => {
    it('should detect AI-like trait names', async () => {
      const aiTrait = `
        cube {
          @ai_powered
          @smart_detection
        }
      `;

      const result = await validator.validate(aiTrait);

      expect(result.metadata.hallucinationScore).toBeGreaterThan(0);
      expect(result.warnings.some((w) => w.message.includes('AI-like'))).toBe(true);
    });

    it('should detect placeholder text', async () => {
      const placeholderCode = `
        cube {
          @color([YOUR_COLOR_HERE])
          @position([PLACEHOLDER])
        }
      `;

      const result = await validator.validate(placeholderCode);

      expect(result.metadata.hallucinationScore).toBeGreaterThan(50);
      expect(result.warnings.some((w) => w.message.includes('Placeholder'))).toBe(true);
    });

    it('should detect mixed language syntax', async () => {
      const mixedSyntax = `
        <cube>
          @color(red)
        </cube>
      `;

      const result = await validator.validate(mixedSyntax);

      expect(result.metadata.hallucinationScore).toBeGreaterThan(0);
      expect(result.warnings.some((w) => w.message.includes('HTML'))).toBe(true);
    });

    it('should detect JavaScript syntax hallucinations', async () => {
      const jsSyntax = `
        function createCube() {
          return cube { @color(red) }
        }
      `;

      const result = await validator.validate(jsSyntax);

      expect(result.metadata.hallucinationScore).toBeGreaterThan(0);
      expect(result.warnings.some((w) => w.message.includes('JavaScript'))).toBe(true);
    });

    it('should detect TODO comments', async () => {
      const todoCode = `
        cube {
          @color(red)
          // TODO: Add more properties
        }
      `;

      const result = await validator.validate(todoCode);

      expect(result.warnings.some((w) => w.message.includes('Incomplete'))).toBe(true);
    });

    it('should detect OOP syntax hallucinations', async () => {
      const oopSyntax = `
        class MyCube extends cube {
          @color(red)
        }
      `;

      const result = await validator.validate(oopSyntax);

      expect(result.metadata.hallucinationScore).toBeGreaterThan(0);
      expect(result.warnings.some((w) => w.message.includes('OOP'))).toBe(true);
    });

    it('should detect excessive trait repetition', async () => {
      const repetitive = `
        cube {
          @color(red)
          @color(blue)
          @color(green)
          @color(yellow)
          @color(orange)
          @color(purple)
        }
      `;

      const result = await validator.validate(repetitive);

      expect(result.warnings.some((w) => w.message.includes('repetition'))).toBe(true);
    });
  });

  describe('Semantic Validation', () => {
    it('should warn about empty objects', async () => {
      const emptyObject = `
        cube {
        }
      `;

      const result = await validator.validate(emptyObject);

      expect(result.warnings.some((w) => w.message.includes('Empty'))).toBe(true);
    });

    it('should warn about very long lines', async () => {
      const longLine = `cube { @position(${Array(50).fill('0').join(', ')}) }`;

      const result = await validator.validate(longLine);

      expect(result.warnings.some((w) => w.message.includes('120 characters'))).toBe(true);
    });
  });

  describe('Provider-Specific Validation', () => {
    it('should detect OpenAI markdown fences', async () => {
      const openaiValidator = new AIValidator({ provider: 'openai' });
      const fencedCode = `
        \`\`\`holoscript
        cube { @color(red) }
        \`\`\`
      `;

      const result = await openaiValidator.validate(fencedCode);

      expect(result.errors.some((e) => e.message.includes('markdown fence'))).toBe(true);
    });

    it('should handle Anthropic provider', async () => {
      const claudeValidator = new AIValidator({ provider: 'anthropic' });
      const result = await claudeValidator.validate('cube { @color(red) }');

      expect(result.metadata.provider).toBe('anthropic');
    });
  });

  describe('Configuration Options', () => {
    it('should respect strict mode', async () => {
      const strictValidator = new AIValidator({ strict: true });
      const codeWithWarnings = `
        cube {
        }
      `;

      const result = await strictValidator.validate(codeWithWarnings);

      // In strict mode, warnings become errors
      expect(result.valid).toBe(false);
    });

    it('should respect custom hallucination threshold', async () => {
      const lenientValidator = new AIValidator({ hallucinationThreshold: 90 });
      const suspiciousCode = `
        cube {
          @color([PLACEHOLDER])
        }
      `;

      const result = await lenientValidator.validate(suspiciousCode);

      // High threshold allows suspicious code
      expect(result.metadata.hallucinationScore).toBeLessThan(90);
    });

    it('should allow custom known traits', async () => {
      const customValidator = new AIValidator({
        knownTraits: ['@custom_trait', '@special'],
      });

      const result = await customValidator.validate('cube { @custom_trait }');
      expect(result.valid).toBe(true);
    });

    it('should disable hallucination detection when configured', async () => {
      const noDetectionValidator = new AIValidator({ detectHallucinations: false });
      const suspiciousCode = `
        cube {
          @ai_powered
          [PLACEHOLDER]
        }
      `;

      const result = await noDetectionValidator.validate(suspiciousCode);

      // Score should be 0 when detection is disabled
      expect(result.metadata.hallucinationScore).toBe(0);
    });
  });

  describe('Error Details', () => {
    it('should provide line numbers for errors', async () => {
      const multiLineInvalid = `
        cube {
          @color(red)
          @invalid_trait
        }
      `;

      const result = await validator.validate(multiLineInvalid);

      const traitError = result.errors.find((e) => e.type === 'trait');
      expect(traitError?.line).toBeGreaterThan(0);
    });

    it('should provide helpful suggestions', async () => {
      const typo = `
        cube {
          @grababl
        }
      `;

      const result = await validator.validate(typo);

      const error = result.errors.find((e) => e.type === 'trait');
      expect(error?.suggestion).toBeDefined();
      expect(error?.suggestion).toContain('@grabbable');
    });
  });

  describe('Convenience Functions', () => {
    it('should work with validateAICode helper', async () => {
      const result = await validateAICode('cube { @color(red) }');

      expect(result.valid).toBe(true);
      expect(result.metadata).toBeDefined();
    });

    it('should accept config in validateAICode', async () => {
      const result = await validateAICode('cube { @invalid }', {
        strict: true,
        hallucinationThreshold: 30,
      });

      expect(result.valid).toBe(false);
    });
  });

  describe('Statistics', () => {
    it('should return validator stats', () => {
      const stats = validator.getStats();

      expect(stats.knownTraits).toBeGreaterThan(0);
      expect(stats.hallucinationPatterns).toBeGreaterThan(0);
      expect(stats.threshold).toBe(50);
    });
  });

  describe('Metadata', () => {
    it('should include validation metadata', async () => {
      const result = await validator.validate('cube { @color(red) }');

      expect(result.metadata.validatedAt).toBeGreaterThan(0);
      expect(result.metadata.validationTime).toBeGreaterThan(0);
      expect(result.metadata.hallucinationScore).toBeGreaterThanOrEqual(0);
    });

    it('should track validation time', async () => {
      const start = Date.now();
      const result = await validator.validate('cube { @color(red) }');
      const end = Date.now();

      expect(result.metadata.validationTime).toBeLessThanOrEqual(end - start);
    });
  });
});
