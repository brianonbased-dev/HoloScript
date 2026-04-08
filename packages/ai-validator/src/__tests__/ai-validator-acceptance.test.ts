/**
 * @holoscript/ai-validator acceptance tests
 * Covers: AIValidator constructor/config, validate, getStats,
 *         validateAICode convenience function, ValidationResultSchema
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  AIValidator,
  validateAICode,
  ValidationResultSchema,
  type ValidationResult,
  type ValidatorConfig,
} from '../index';

const VALID_SCENE = `
  cube {
    @color(red)
    @position(0, 1, 0)
    @grabbable
  }
`;

const COMPLEX_SCENE = `
  sphere {
    @color(blue)
    @position(0, 2, 0)
    @physics
    @grabbable

    cube {
      @color(red)
      @position(0, 0.5, 0)
      @scale(0.5, 0.5, 0.5)
    }
  }
`;

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// Constructor & config
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
describe('AIValidator â€” constructor', () => {
  it('creates with default config', () => {
    const validator = new AIValidator();
    expect(validator).toBeDefined();
  });

  it('creates with strict mode', () => {
    const validator = new AIValidator({ strict: true });
    expect(validator).toBeDefined();
  });

  it('creates with custom hallucinationThreshold', () => {
    const validator = new AIValidator({ hallucinationThreshold: 30 });
    expect(validator).toBeDefined();
  });

  it('creates with provider hint', () => {
    const validator = new AIValidator({ provider: 'anthropic' });
    expect(validator).toBeDefined();
  });

  it('creates with custom knownTraits', () => {
    const validator = new AIValidator({ knownTraits: ['@grabbable', '@physics'] });
    expect(validator).toBeDefined();
  });

  it('creates with detectHallucinations: false', () => {
    const validator = new AIValidator({ detectHallucinations: false });
    expect(validator).toBeDefined();
  });
});

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// validate â€” result shape
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
describe('AIValidator â€” validate() result shape', () => {
  let validator: AIValidator;

  beforeEach(() => {
    validator = new AIValidator();
  });

  it('returns ValidationResult with valid field', async () => {
    const result = await validator.validate(VALID_SCENE);
    expect(result).toHaveProperty('valid');
    expect(typeof result.valid).toBe('boolean');
  });

  it('returns errors array', async () => {
    const result = await validator.validate(VALID_SCENE);
    expect(Array.isArray(result.errors)).toBe(true);
  });

  it('returns warnings array', async () => {
    const result = await validator.validate(VALID_SCENE);
    expect(Array.isArray(result.warnings)).toBe(true);
  });

  it('returns metadata object', async () => {
    const result = await validator.validate(VALID_SCENE);
    expect(result).toHaveProperty('metadata');
    expect(typeof result.metadata.validatedAt).toBe('number');
    expect(typeof result.metadata.validationTime).toBe('number');
    expect(typeof result.metadata.hallucinationScore).toBe('number');
  });

  it('validatedAt is a recent timestamp', async () => {
    const before = Date.now();
    const result = await validator.validate(VALID_SCENE);
    const after = Date.now();
    expect(result.metadata.validatedAt).toBeGreaterThanOrEqual(before);
    expect(result.metadata.validatedAt).toBeLessThanOrEqual(after);
  });

  it('validationTime is non-negative', async () => {
    const result = await validator.validate(VALID_SCENE);
    expect(result.metadata.validationTime).toBeGreaterThanOrEqual(0);
  });

  it('hallucinationScore is in 0-100 range', async () => {
    const result = await validator.validate(VALID_SCENE);
    expect(result.metadata.hallucinationScore).toBeGreaterThanOrEqual(0);
    expect(result.metadata.hallucinationScore).toBeLessThanOrEqual(100);
  });
});

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// validate â€” valid code
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
describe('AIValidator â€” valid code', () => {
  let validator: AIValidator;

  beforeEach(() => {
    validator = new AIValidator({ hallucinationThreshold: 50 });
  });

  it('valid=true for valid HoloScript scene', async () => {
    const result = await validator.validate(VALID_SCENE);
    expect(result.valid).toBe(true);
  });

  it('errors=[] for valid code', async () => {
    const result = await validator.validate(VALID_SCENE);
    expect(result.errors).toHaveLength(0);
  });

  it('hallucinationScore is low for valid known traits', async () => {
    const result = await validator.validate(VALID_SCENE);
    expect(result.metadata.hallucinationScore).toBeLessThan(50);
  });

  it('valid=true for complex valid scene', async () => {
    const result = await validator.validate(COMPLEX_SCENE);
    expect(result.valid).toBe(true);
  });
});

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// validate â€” invalid code
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
describe('AIValidator â€” invalid code', () => {
  let validator: AIValidator;

  beforeEach(() => {
    validator = new AIValidator();
  });

  it('valid=false for broken syntax', async () => {
    const result = await validator.validate('cube {{{ @bad***trait');
    expect(result.valid).toBe(false);
  });

  it('errors array non-empty for invalid code', async () => {
    const result = await validator.validate('cube {{{ @bad***trait');
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('error has type field', async () => {
    const result = await validator.validate('cube {{{ @bad***trait');
    if (result.errors.length > 0) {
      expect(result.errors[0]).toHaveProperty('type');
      expect(result.errors[0]).toHaveProperty('message');
      expect(result.errors[0]).toHaveProperty('severity');
    }
  });
});

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// getStats
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
describe('AIValidator â€” getStats', () => {
  it('returns stats with expected fields', () => {
    const validator = new AIValidator();
    const stats = validator.getStats();
    expect(stats).toHaveProperty('knownTraits');
    expect(stats).toHaveProperty('hallucinationPatterns');
    expect(stats).toHaveProperty('threshold');
  });

  it('knownTraits count is positive', () => {
    const validator = new AIValidator();
    expect(validator.getStats().knownTraits).toBeGreaterThan(0);
  });

  it('hallucinationPatterns count is positive', () => {
    const validator = new AIValidator();
    expect(validator.getStats().hallucinationPatterns).toBeGreaterThan(0);
  });

  it('threshold reflects config', () => {
    const validator = new AIValidator({ hallucinationThreshold: 30 });
    expect(validator.getStats().threshold).toBe(30);
  });

  it('custom knownTraits changes count', () => {
    const validator = new AIValidator({ knownTraits: ['@grabbable'] });
    expect(validator.getStats().knownTraits).toBe(1);
  });
});

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// validateAICode convenience function
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
describe('validateAICode', () => {
  it('is a function', () => {
    expect(typeof validateAICode).toBe('function');
  });

  it('returns ValidationResult for valid code', async () => {
    const result = await validateAICode(VALID_SCENE);
    expect(result).toHaveProperty('valid');
    expect(result).toHaveProperty('errors');
    expect(result).toHaveProperty('warnings');
    expect(result).toHaveProperty('metadata');
  });

  it('valid=true for valid code', async () => {
    const result = await validateAICode(VALID_SCENE);
    expect(result.valid).toBe(true);
  });

  it('accepts config parameter', async () => {
    const result = await validateAICode(VALID_SCENE, { provider: 'openai' });
    expect(result).toHaveProperty('valid');
  });

  it('invalid code returns valid=false', async () => {
    const result = await validateAICode('cube {{{ @bad***trait');
    expect(result.valid).toBe(false);
  });
});

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// ValidationResultSchema (Zod schema)
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
describe('ValidationResultSchema', () => {
  it('is defined', () => {
    expect(ValidationResultSchema).toBeDefined();
  });

  it('parse succeeds on valid result shape', async () => {
    const result = await validateAICode(VALID_SCENE);
    expect(() => ValidationResultSchema.parse(result)).not.toThrow();
  });

  it('parse fails on invalid shape', () => {
    expect(() => ValidationResultSchema.parse({ not: 'valid' })).toThrow();
  });

  it('schema has a parse method', () => {
    expect(typeof ValidationResultSchema.parse).toBe('function');
  });

  it('schema has a safeParse method', () => {
    expect(typeof ValidationResultSchema.safeParse).toBe('function');
  });
});
