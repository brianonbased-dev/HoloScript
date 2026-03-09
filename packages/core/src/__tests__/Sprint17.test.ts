/**
 * Sprint 17: AI Validator + Security Sandbox
 *
 * Tests cover:
 *   - Feature 1:  AIValidator class -- instantiation, getStats(), default config
 *   - Feature 2:  AIValidator.validate() -- result shape, error types, hallucination detection
 *   - Feature 3:  validateAICode() convenience function + ValidationResultSchema
 *   - Feature 4:  HoloScriptSandbox -- instantiation, executeHoloScript(), audit logging
 *   - Feature 5:  executeSafely() convenience function
 */

import { describe, it, expect, beforeEach } from 'vitest';

// ============================================================================
// Feature 1-3: AI Validator
// ============================================================================

import {
  AIValidator,
  validateAICode,
  ValidationResultSchema,
  type ValidationResult,
  type ValidationError,
  type ValidationWarning,
  type ValidatorConfig,
} from '../../../ai-validator/src/index.js';

// ============================================================================
// Feature 4-5: Security Sandbox
// ============================================================================

import {
  HoloScriptSandbox,
  executeSafely,
  type SandboxOptions,
  type SandboxResult,
  type SecurityAuditLog,
} from '../../../security-sandbox/src/index.js';

// ============================================================================
// Feature 1A: AIValidator -- instantiation
// ============================================================================

describe('Feature 1A: AIValidator -- instantiation', () => {
  it('AIValidator is a class (function)', () => {
    expect(typeof AIValidator).toBe('function');
  });

  it('new AIValidator() creates an instance', () => {
    const validator = new AIValidator();
    expect(validator).toBeDefined();
    expect(validator).toBeInstanceOf(AIValidator);
  });

  it('instance has validate method', () => {
    const validator = new AIValidator();
    expect(typeof validator.validate).toBe('function');
  });

  it('instance has getStats method', () => {
    const validator = new AIValidator();
    expect(typeof validator.getStats).toBe('function');
  });

  it('accepts empty config object', () => {
    expect(() => new AIValidator({})).not.toThrow();
  });

  it('accepts strict config', () => {
    expect(() => new AIValidator({ strict: true })).not.toThrow();
  });

  it('accepts custom hallucinationThreshold', () => {
    expect(() => new AIValidator({ hallucinationThreshold: 75 })).not.toThrow();
  });

  it('accepts provider hint', () => {
    expect(() => new AIValidator({ provider: 'anthropic' })).not.toThrow();
  });
});

// ============================================================================
// Feature 1B: AIValidator -- getStats() defaults
// ============================================================================

describe('Feature 1B: AIValidator -- getStats() defaults', () => {
  let validator: AIValidator;
  beforeEach(() => {
    validator = new AIValidator();
  });

  it('getStats returns an object', () => {
    const stats = validator.getStats();
    expect(typeof stats).toBe('object');
    expect(stats).not.toBeNull();
  });

  it('knownTraits count is at least 50', () => {
    const stats = validator.getStats();
    expect(stats.knownTraits).toBeGreaterThanOrEqual(50);
  });

  it('hallucinationPatterns count is at least 5', () => {
    const stats = validator.getStats();
    expect(stats.hallucinationPatterns).toBeGreaterThanOrEqual(5);
  });

  it('default threshold is 50', () => {
    const stats = validator.getStats();
    expect(stats.threshold).toBe(50);
  });

  it('custom threshold is reflected in getStats', () => {
    const v = new AIValidator({ hallucinationThreshold: 80 });
    expect(v.getStats().threshold).toBe(80);
  });

  it('custom knownTraits are reflected in getStats', () => {
    const v = new AIValidator({ knownTraits: ['@foo', '@bar', '@baz'] });
    expect(v.getStats().knownTraits).toBe(3);
  });
});

// ============================================================================
// Feature 2A: AIValidator.validate() -- result shape
// ============================================================================

describe('Feature 2A: AIValidator.validate() -- result shape', () => {
  let validator: AIValidator;
  beforeEach(() => {
    validator = new AIValidator();
  });

  it('validate() returns a Promise', () => {
    const result = validator.validate('composition "T" {}');
    expect(result).toBeInstanceOf(Promise);
  });

  it('resolved result has valid boolean', async () => {
    const result = await validator.validate('composition "T" {\n}');
    expect(typeof result.valid).toBe('boolean');
  });

  it('resolved result has errors array', async () => {
    const result = await validator.validate('composition "T" {\n}');
    expect(Array.isArray(result.errors)).toBe(true);
  });

  it('resolved result has warnings array', async () => {
    const result = await validator.validate('composition "T" {\n}');
    expect(Array.isArray(result.warnings)).toBe(true);
  });

  it('resolved result has metadata object', async () => {
    const result = await validator.validate('composition "T" {\n}');
    expect(typeof result.metadata).toBe('object');
    expect(result.metadata).not.toBeNull();
  });

  it('metadata has hallucinationScore in range 0-100', async () => {
    const result = await validator.validate('composition "T" {\n}');
    expect(typeof result.metadata.hallucinationScore).toBe('number');
    expect(result.metadata.hallucinationScore).toBeGreaterThanOrEqual(0);
    expect(result.metadata.hallucinationScore).toBeLessThanOrEqual(100);
  });

  it('metadata has validatedAt timestamp', async () => {
    const result = await validator.validate('composition "T" {\n}');
    expect(typeof result.metadata.validatedAt).toBe('number');
    expect(result.metadata.validatedAt).toBeGreaterThan(0);
  });

  it('metadata has validationTime number', async () => {
    const result = await validator.validate('composition "T" {\n}');
    expect(typeof result.metadata.validationTime).toBe('number');
    expect(result.metadata.validationTime).toBeGreaterThanOrEqual(0);
  });

  it('metadata provider defaults to "unknown"', async () => {
    const result = await validator.validate('composition "T" {\n}');
    expect(result.metadata.provider).toBe('unknown');
  });

  it('provider config is reflected in metadata', async () => {
    const v = new AIValidator({ provider: 'anthropic' });
    const result = await v.validate('composition "T" {\n}');
    expect(result.metadata.provider).toBe('anthropic');
  });
});

// ============================================================================
// Feature 2B: AIValidator.validate() -- error detection
// ============================================================================

describe('Feature 2B: AIValidator.validate() -- error detection', () => {
  let validator: AIValidator;
  beforeEach(() => {
    validator = new AIValidator();
  });

  it('unbalanced opening brace produces structural error', async () => {
    const result = await validator.validate('composition "T" { unclosed');
    const structuralErr = result.errors.find((e) => e.type === 'structural');
    expect(structuralErr).toBeDefined();
  });

  it('unbalanced closing brace produces structural error', async () => {
    const result = await validator.validate('} extra close');
    const structuralErr = result.errors.find((e) => e.type === 'structural');
    expect(structuralErr).toBeDefined();
  });

  it('unknown trait produces trait error', async () => {
    const result = await validator.validate('@unknowntrait_xyz_not_real');
    const traitErr = result.errors.find((e) => e.type === 'trait');
    expect(traitErr).toBeDefined();
  });

  it('trait error message mentions the trait name', async () => {
    const result = await validator.validate('@fake_trait_abc');
    const traitErr = result.errors.find((e) => e.type === 'trait');
    expect(traitErr!.message).toContain('@fake_trait_abc');
  });

  it('trait error has a suggestion with similar traits', async () => {
    const result = await validator.validate('@grabbabel');
    const traitErr = result.errors.find((e) => e.type === 'trait');
    expect(typeof traitErr!.suggestion).toBe('string');
  });

  it('errors have type and message fields', async () => {
    const result = await validator.validate('@fake_trait_xyz');
    for (const err of result.errors) {
      expect(typeof err.type).toBe('string');
      expect(typeof err.message).toBe('string');
      expect(typeof err.severity).toBe('string');
    }
  });

  it('"class" keyword triggers pattern hallucination detection', async () => {
    const result = await validator.validate('class Foo extends Bar {}');
    const isDetected =
      result.metadata.hallucinationScore > 0 ||
      result.errors.some((e) => e.type === 'pattern') ||
      result.warnings.some((w) => w.type === 'unusual');
    expect(isDetected).toBe(true);
  });

  it('result.valid is false when errors are present', async () => {
    const result = await validator.validate('@totallyfaketrait');
    if (result.errors.length > 0) {
      expect(result.valid).toBe(false);
    }
  });

  it('warnings are non-blocking in non-strict mode', async () => {
    const v = new AIValidator({ strict: false });
    const result = await v.validate('composition "T" {\n}');
    // If only warnings (no errors), should be valid
    if (result.errors.length === 0) {
      expect(result.valid).toBe(true);
    }
  });
});

// ============================================================================
// Feature 2C: AIValidator.validate() -- known traits are accepted
// ============================================================================

describe('Feature 2C: AIValidator.validate() -- known traits pass', () => {
  let validator: AIValidator;
  beforeEach(() => {
    validator = new AIValidator();
  });

  it('@grabbable is a known trait (no trait error)', async () => {
    const result = await validator.validate('@grabbable');
    const traitErr = result.errors.find((e) => e.type === 'trait');
    expect(traitErr).toBeUndefined();
  });

  it('@networked is a known trait (no trait error)', async () => {
    const result = await validator.validate('@networked');
    const traitErr = result.errors.find((e) => e.type === 'trait');
    expect(traitErr).toBeUndefined();
  });

  it('@physics is a known trait (no trait error)', async () => {
    const result = await validator.validate('@physics');
    const traitErr = result.errors.find((e) => e.type === 'trait');
    expect(traitErr).toBeUndefined();
  });
});

// ============================================================================
// Feature 3A: validateAICode() convenience function
// ============================================================================

describe('Feature 3A: validateAICode() convenience function', () => {
  it('is a function', () => {
    expect(typeof validateAICode).toBe('function');
  });

  it('returns a Promise', () => {
    const result = validateAICode('composition "T" {\n}');
    expect(result).toBeInstanceOf(Promise);
    result.catch(() => {});
  });

  it('resolves to ValidationResult shape', async () => {
    const result = await validateAICode('composition "T" {\n}');
    expect(typeof result.valid).toBe('boolean');
    expect(Array.isArray(result.errors)).toBe(true);
    expect(Array.isArray(result.warnings)).toBe(true);
    expect(typeof result.metadata).toBe('object');
  });

  it('accepts config as second argument', async () => {
    const result = await validateAICode('@grabbable', { provider: 'openai' });
    expect(result.metadata.provider).toBe('openai');
  });
});

// ============================================================================
// Feature 3B: ValidationResultSchema (Zod)
// ============================================================================

describe('Feature 3B: ValidationResultSchema', () => {
  it('ValidationResultSchema is defined', () => {
    expect(ValidationResultSchema).toBeDefined();
  });

  it('has a parse method (zod schema)', () => {
    expect(typeof ValidationResultSchema.parse).toBe('function');
  });

  it('parses a valid ValidationResult', async () => {
    const result = await validateAICode('composition "T" {\n}');
    const parsed = ValidationResultSchema.parse(result);
    expect(parsed.valid).toBe(result.valid);
  });

  it('throws on invalid data', () => {
    expect(() => ValidationResultSchema.parse({ valid: 'not-a-boolean' })).toThrow();
  });
});

// ============================================================================
// Feature 4A: HoloScriptSandbox -- instantiation
// ============================================================================

describe('Feature 4A: HoloScriptSandbox -- instantiation', () => {
  it('HoloScriptSandbox is a class (function)', () => {
    expect(typeof HoloScriptSandbox).toBe('function');
  });

  it('new HoloScriptSandbox() creates an instance', () => {
    const sandbox = new HoloScriptSandbox();
    expect(sandbox).toBeDefined();
    expect(sandbox).toBeInstanceOf(HoloScriptSandbox);
  });

  it('instance has executeHoloScript method', () => {
    const sandbox = new HoloScriptSandbox();
    expect(typeof sandbox.executeHoloScript).toBe('function');
  });

  it('instance has getAuditLogs method', () => {
    const sandbox = new HoloScriptSandbox();
    expect(typeof sandbox.getAuditLogs).toBe('function');
  });

  it('instance has clearAuditLogs method', () => {
    const sandbox = new HoloScriptSandbox();
    expect(typeof sandbox.clearAuditLogs).toBe('function');
  });

  it('instance has getSecurityStats method', () => {
    const sandbox = new HoloScriptSandbox();
    expect(typeof sandbox.getSecurityStats).toBe('function');
  });

  it('accepts custom timeout option', () => {
    expect(() => new HoloScriptSandbox({ timeout: 3000 })).not.toThrow();
  });

  it('accepts memoryLimit option', () => {
    expect(() => new HoloScriptSandbox({ memoryLimit: 64 })).not.toThrow();
  });
});

// ============================================================================
// Feature 4B: HoloScriptSandbox -- initial state
// ============================================================================

describe('Feature 4B: HoloScriptSandbox -- initial state', () => {
  let sandbox: HoloScriptSandbox;
  beforeEach(() => {
    sandbox = new HoloScriptSandbox();
  });

  it('getAuditLogs() returns an array initially', () => {
    expect(Array.isArray(sandbox.getAuditLogs())).toBe(true);
  });

  it('audit log is empty before any execution', () => {
    expect(sandbox.getAuditLogs().length).toBe(0);
  });

  it('getSecurityStats() returns an object', () => {
    const stats = sandbox.getSecurityStats();
    expect(typeof stats).toBe('object');
    expect(stats).not.toBeNull();
  });

  it('initial stats have zero total', () => {
    const stats = sandbox.getSecurityStats();
    expect(stats.total).toBe(0);
  });

  it('initial stats have zero validated', () => {
    expect(sandbox.getSecurityStats().validated).toBe(0);
  });

  it('initial stats have zero rejected', () => {
    expect(sandbox.getSecurityStats().rejected).toBe(0);
  });

  it('initial stats have zero executed', () => {
    expect(sandbox.getSecurityStats().executed).toBe(0);
  });

  it('initial stats.bySource is an object', () => {
    expect(typeof sandbox.getSecurityStats().bySource).toBe('object');
  });
});

// ============================================================================
// Feature 4C: HoloScriptSandbox -- executeHoloScript() with invalid code
// ============================================================================

describe('Feature 4C: HoloScriptSandbox -- executeHoloScript() invalid code', () => {
  let sandbox: HoloScriptSandbox;
  beforeEach(() => {
    sandbox = new HoloScriptSandbox();
  });

  it('executeHoloScript returns a Promise', () => {
    const result = sandbox.executeHoloScript('invalid code !!!');
    expect(result).toBeInstanceOf(Promise);
  });

  it('invalid code returns success:false', async () => {
    const result = await sandbox.executeHoloScript('this is not valid holoscript !!!');
    expect(result.success).toBe(false);
  });

  it('invalid code returns an error type string', async () => {
    const result = await sandbox.executeHoloScript('!!not valid!!');
    expect(typeof result.error?.type).toBe('string');
  });

  it('result has metadata object', async () => {
    const result = await sandbox.executeHoloScript('invalid');
    expect(typeof result.metadata).toBe('object');
    expect(result.metadata).not.toBeNull();
  });

  it('metadata has executionTime number', async () => {
    const result = await sandbox.executeHoloScript('invalid');
    expect(typeof result.metadata.executionTime).toBe('number');
    expect(result.metadata.executionTime).toBeGreaterThanOrEqual(0);
  });

  it('metadata validated is a boolean', async () => {
    const result = await sandbox.executeHoloScript('invalid code');
    expect(typeof result.metadata.validated).toBe('boolean');
  });

  it('metadata source defaults to "user"', async () => {
    const result = await sandbox.executeHoloScript('invalid');
    expect(result.metadata.source).toBe('user');
  });

  it('meta source "ai-generated" is reflected in metadata', async () => {
    const result = await sandbox.executeHoloScript('invalid', { source: 'ai-generated' });
    expect(result.metadata.source).toBe('ai-generated');
  });
});

// ============================================================================
// Feature 4D: HoloScriptSandbox -- audit logging
// ============================================================================

describe('Feature 4D: HoloScriptSandbox -- audit logging', () => {
  let sandbox: HoloScriptSandbox;
  beforeEach(() => {
    sandbox = new HoloScriptSandbox({ enableLogging: true });
  });

  it('after failed execution, audit log has entries', async () => {
    await sandbox.executeHoloScript('invalid code');
    expect(sandbox.getAuditLogs().length).toBeGreaterThan(0);
  });

  it('audit log entry has timestamp', async () => {
    await sandbox.executeHoloScript('invalid code');
    const logs = sandbox.getAuditLogs();
    expect(typeof logs[0].timestamp).toBe('number');
    expect(logs[0].timestamp).toBeGreaterThan(0);
  });

  it('audit log entry has action field', async () => {
    await sandbox.executeHoloScript('invalid code');
    const logs = sandbox.getAuditLogs();
    expect(typeof logs[0].action).toBe('string');
  });

  it('audit log entry has success boolean', async () => {
    await sandbox.executeHoloScript('invalid code');
    const logs = sandbox.getAuditLogs();
    expect(typeof logs[0].success).toBe('boolean');
  });

  it('audit log entry has codeHash string', async () => {
    await sandbox.executeHoloScript('invalid code');
    const logs = sandbox.getAuditLogs();
    expect(typeof logs[0].codeHash).toBe('string');
  });

  it('rejected execution has action "reject"', async () => {
    await sandbox.executeHoloScript('invalid code');
    const logs = sandbox.getAuditLogs();
    const rejectEntry = logs.find((l) => l.action === 'reject');
    expect(rejectEntry).toBeDefined();
  });

  it('clearAuditLogs() empties the log', async () => {
    await sandbox.executeHoloScript('invalid code');
    expect(sandbox.getAuditLogs().length).toBeGreaterThan(0);
    sandbox.clearAuditLogs();
    expect(sandbox.getAuditLogs().length).toBe(0);
  });

  it('getAuditLogs() with source filter works', async () => {
    await sandbox.executeHoloScript('invalid', { source: 'ai-generated' });
    const aiLogs = sandbox.getAuditLogs({ source: 'ai-generated' });
    expect(aiLogs.length).toBeGreaterThan(0);
    for (const log of aiLogs) {
      expect(log.source).toBe('ai-generated');
    }
  });

  it('getAuditLogs() with success:false filter returns only failures', async () => {
    await sandbox.executeHoloScript('invalid code');
    const failedLogs = sandbox.getAuditLogs({ success: false });
    for (const log of failedLogs) {
      expect(log.success).toBe(false);
    }
  });

  it('stats.rejected increments after failed execution', async () => {
    await sandbox.executeHoloScript('invalid code');
    const stats = sandbox.getSecurityStats();
    expect(stats.rejected).toBeGreaterThan(0);
  });

  it('logging disabled: no audit entries', async () => {
    const noLogSandbox = new HoloScriptSandbox({ enableLogging: false });
    await noLogSandbox.executeHoloScript('invalid code');
    expect(noLogSandbox.getAuditLogs().length).toBe(0);
  });
});

// ============================================================================
// Feature 5: executeSafely() convenience function
// ============================================================================

describe('Feature 5: executeSafely() convenience function', () => {
  it('is a function', () => {
    expect(typeof executeSafely).toBe('function');
  });

  it('returns a Promise', () => {
    const result = executeSafely('invalid code');
    expect(result).toBeInstanceOf(Promise);
  });

  it('resolves to SandboxResult shape', async () => {
    const result = await executeSafely('invalid holoscript code');
    expect(typeof result.success).toBe('boolean');
    expect(typeof result.metadata).toBe('object');
  });

  it('invalid code returns success:false', async () => {
    const result = await executeSafely('not valid code !!!');
    expect(result.success).toBe(false);
  });

  it('accepts source option', async () => {
    const result = await executeSafely('invalid', { source: 'ai-generated' });
    expect(result.metadata.source).toBe('ai-generated');
  });
});
