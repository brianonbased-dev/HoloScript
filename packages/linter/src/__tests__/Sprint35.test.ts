/**
 * Sprint 35 — @holoscript/linter acceptance tests
 * Covers: HoloScriptLinter, convenience functions, rule system, ConfigLoader
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  HoloScriptLinter,
  lint,
  createLinter,
  DEFAULT_CONFIG,
  type LinterConfig,
  type LintResult,
  type LintDiagnostic,
  type Rule,
  type RuleContext,
} from '../index';
import { ConfigLoader } from '../ConfigLoader';
import { noDeadCodeRule } from '../rules/no-dead-code';
import { deprecationWarningRule } from '../rules/deprecation-warning';

// ═══════════════════════════════════════════════
// DEFAULT_CONFIG
// ═══════════════════════════════════════════════
describe('DEFAULT_CONFIG', () => {
  it('has expected shape', () => {
    expect(DEFAULT_CONFIG).toBeDefined();
    expect(typeof DEFAULT_CONFIG.rules).toBe('object');
    expect(Array.isArray(DEFAULT_CONFIG.ignorePatterns)).toBe(true);
    expect(typeof DEFAULT_CONFIG.maxErrors).toBe('number');
    expect(typeof DEFAULT_CONFIG.typeChecking).toBe('boolean');
  });

  it('rules is non-empty record', () => {
    expect(Object.keys(DEFAULT_CONFIG.rules).length).toBeGreaterThan(0);
  });

  it('maxErrors is positive', () => {
    expect(DEFAULT_CONFIG.maxErrors).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════════
// HoloScriptLinter — constructor
// ═══════════════════════════════════════════════
describe('HoloScriptLinter — constructor', () => {
  it('creates with default config', () => {
    const linter = new HoloScriptLinter();
    expect(linter).toBeDefined();
    const cfg = linter.getConfig();
    expect(cfg).toEqual(DEFAULT_CONFIG);
  });

  it('creates with partial config override', () => {
    const linter = new HoloScriptLinter({ maxErrors: 10 });
    expect(linter.getConfig().maxErrors).toBe(10);
  });

  it('createLinter() returns a linter instance', () => {
    const linter = createLinter({ typeChecking: true });
    expect(linter).toBeInstanceOf(HoloScriptLinter);
    expect(linter.getConfig().typeChecking).toBe(true);
  });
});

// ═══════════════════════════════════════════════
// HoloScriptLinter — getConfig / setConfig
// ═══════════════════════════════════════════════
describe('HoloScriptLinter — getConfig / setConfig', () => {
  let linter: HoloScriptLinter;

  beforeEach(() => {
    linter = new HoloScriptLinter();
  });

  it('getConfig returns current config', () => {
    const cfg = linter.getConfig();
    expect(cfg).toBeDefined();
    expect(typeof cfg.maxErrors).toBe('number');
  });

  it('setConfig updates maxErrors', () => {
    linter.setConfig({ maxErrors: 5 });
    expect(linter.getConfig().maxErrors).toBe(5);
  });

  it('setConfig updates typeChecking', () => {
    linter.setConfig({ typeChecking: false });
    expect(linter.getConfig().typeChecking).toBe(false);
  });

  it('setConfig partial update keeps other fields', () => {
    const before = linter.getConfig().rules;
    linter.setConfig({ maxErrors: 100 });
    expect(linter.getConfig().rules).toEqual(before);
  });

  it('setConfig updates rules', () => {
    linter.setConfig({ rules: { 'custom-rule': 'off' } });
    expect(linter.getConfig().rules['custom-rule']).toBe('off');
  });
});

// ═══════════════════════════════════════════════
// HoloScriptLinter — lint()
// ═══════════════════════════════════════════════
describe('HoloScriptLinter — lint()', () => {
  let linter: HoloScriptLinter;

  beforeEach(() => {
    linter = new HoloScriptLinter();
  });

  it('returns LintResult with expected shape', () => {
    const result = linter.lint('entity Test {}');
    expect(result).toHaveProperty('filePath');
    expect(result).toHaveProperty('diagnostics');
    expect(result).toHaveProperty('errorCount');
    expect(result).toHaveProperty('warningCount');
    expect(result).toHaveProperty('fixableCount');
  });

  it('diagnostics is an array', () => {
    const result = linter.lint('');
    expect(Array.isArray(result.diagnostics)).toBe(true);
  });

  it('errorCount and warningCount are numbers', () => {
    const result = linter.lint('entity Test {}');
    expect(typeof result.errorCount).toBe('number');
    expect(typeof result.warningCount).toBe('number');
  });

  it('fixableCount is a number', () => {
    const result = linter.lint('entity Test {}');
    expect(typeof result.fixableCount).toBe('number');
  });

  it('default filePath is "input.holo"', () => {
    const result = linter.lint('entity Test {}');
    expect(result.filePath).toBe('input.holo');
  });

  it('custom filePath is used', () => {
    const result = linter.lint('entity Test {}', 'my-file.holo');
    expect(result.filePath).toBe('my-file.holo');
  });

  it('lint with .hsplus extension', () => {
    const result = linter.lint('entity Test {}', 'scene.hsplus');
    expect(result.filePath).toBe('scene.hsplus');
  });

  it('lints empty string without crashing', () => {
    const result = linter.lint('');
    expect(result).toBeDefined();
    expect(Array.isArray(result.diagnostics)).toBe(true);
  });

  it('errorCount >= 0', () => {
    const result = linter.lint('entity Test {}');
    expect(result.errorCount).toBeGreaterThanOrEqual(0);
  });

  it('warningCount >= 0', () => {
    const result = linter.lint('entity Test {}');
    expect(result.warningCount).toBeGreaterThanOrEqual(0);
  });

  it('errorCount + warningCount <= diagnostics.length', () => {
    const result = linter.lint('entity Test {}');
    expect(result.errorCount + result.warningCount).toBeLessThanOrEqual(result.diagnostics.length);
  });
});

// ═══════════════════════════════════════════════
// LintDiagnostic shape
// ═══════════════════════════════════════════════
describe('LintDiagnostic shape', () => {
  it('each diagnostic has required fields', () => {
    // Create a linter that produces diagnostics
    const linter = new HoloScriptLinter();
    const result = linter.lint('entity test_entity {}', 'test.holo');
    for (const d of result.diagnostics) {
      expect(d).toHaveProperty('ruleId');
      expect(d).toHaveProperty('message');
      expect(d).toHaveProperty('severity');
      expect(d).toHaveProperty('line');
      expect(d).toHaveProperty('column');
    }
  });

  it('severity is valid value', () => {
    const linter = new HoloScriptLinter();
    const result = linter.lint('entity test_entity {}', 'test.holo');
    const validSeverities = ['error', 'warning', 'info', 'hint'];
    for (const d of result.diagnostics) {
      expect(validSeverities).toContain(d.severity);
    }
  });
});

// ═══════════════════════════════════════════════
// Rule system
// ═══════════════════════════════════════════════
describe('rule system', () => {
  it('getRules returns array', () => {
    const linter = new HoloScriptLinter();
    const rules = linter.getRules();
    expect(Array.isArray(rules)).toBe(true);
  });

  it('has rules registered by default', () => {
    const linter = new HoloScriptLinter();
    expect(linter.getRules().length).toBeGreaterThan(0);
  });

  it('registerRule adds a custom rule', () => {
    const linter = new HoloScriptLinter();
    const before = linter.getRules().length;
    const customRule: Rule = {
      id: 'test-rule',
      name: 'Test Rule',
      description: 'A test rule',
      category: 'best-practice',
      defaultSeverity: 'warning',
      check: (_ctx: RuleContext) => [],
    };
    linter.registerRule(customRule);
    expect(linter.getRules().length).toBe(before + 1);
  });

  it('registered rule is in getRules()', () => {
    const linter = new HoloScriptLinter();
    const customRule: Rule = {
      id: 'my-unique-rule',
      name: 'My Unique Rule',
      description: 'Unique',
      category: 'style',
      defaultSeverity: 'info',
      check: (_ctx: RuleContext) => [],
    };
    linter.registerRule(customRule);
    const ruleIds = linter.getRules().map(r => r.id);
    expect(ruleIds).toContain('my-unique-rule');
  });

  it('custom rule that always errors produces diagnostics', () => {
    const linter = new HoloScriptLinter({ rules: { 'always-error': 'error' } });
    const alwaysErrorRule: Rule = {
      id: 'always-error',
      name: 'Always Error',
      description: 'Emits an error for every lint call',
      category: 'syntax',
      defaultSeverity: 'error',
      check: (_ctx: RuleContext): LintDiagnostic[] => [{
        ruleId: 'always-error',
        message: 'Forced error',
        severity: 'error',
        line: 1,
        column: 0,
      }],
    };
    linter.registerRule(alwaysErrorRule);
    const result = linter.lint('any source');
    expect(result.diagnostics.some(d => d.ruleId === 'always-error')).toBe(true);
  });
});

// ═══════════════════════════════════════════════
// noDeadCodeRule
// ═══════════════════════════════════════════════
describe('noDeadCodeRule', () => {
  it('is exported and has expected shape', () => {
    expect(noDeadCodeRule).toBeDefined();
    expect(noDeadCodeRule.id).toBeDefined();
    expect(typeof noDeadCodeRule.id).toBe('string');
    expect(typeof noDeadCodeRule.check).toBe('function');
  });

  it('check returns array', () => {
    const ctx: RuleContext = {
      source: 'entity Foo {}',
      lines: ['entity Foo {}'],
      fileType: 'holo',
      config: {},
    };
    const result = noDeadCodeRule.check(ctx);
    expect(Array.isArray(result)).toBe(true);
  });
});

// ═══════════════════════════════════════════════
// deprecationWarningRule
// ═══════════════════════════════════════════════
describe('deprecationWarningRule', () => {
  it('is exported and has expected shape', () => {
    expect(deprecationWarningRule).toBeDefined();
    expect(deprecationWarningRule.id).toBeDefined();
    expect(typeof deprecationWarningRule.check).toBe('function');
  });

  it('check returns array', () => {
    const ctx: RuleContext = {
      source: 'entity Bar {}',
      lines: ['entity Bar {}'],
      fileType: 'holo',
      config: {},
    };
    const result = deprecationWarningRule.check(ctx);
    expect(Array.isArray(result)).toBe(true);
  });
});

// ═══════════════════════════════════════════════
// Convenience functions
// ═══════════════════════════════════════════════
describe('convenience functions', () => {
  it('lint() is a standalone function', () => {
    const result = lint('entity Test {}');
    expect(result).toHaveProperty('filePath');
    expect(result).toHaveProperty('diagnostics');
  });

  it('lint() result shape matches LintResult', () => {
    const result: LintResult = lint('');
    expect(typeof result.errorCount).toBe('number');
    expect(typeof result.warningCount).toBe('number');
    expect(typeof result.fixableCount).toBe('number');
  });

  it('lint() accepts filePath param', () => {
    const result = lint('entity Foo {}', 'custom.holo');
    expect(result.filePath).toBe('custom.holo');
  });
});

// ═══════════════════════════════════════════════
// Rules turned off
// ═══════════════════════════════════════════════
describe('rules can be disabled', () => {
  it('turning rule off reduces diagnostic count', () => {
    const defaultLinter = new HoloScriptLinter();
    const result1 = defaultLinter.lint('entity test_name {}');

    // Disable all rules
    const noRulesLinter = new HoloScriptLinter({
      rules: Object.fromEntries(
        Object.keys(DEFAULT_CONFIG.rules).map(k => [k, 'off' as const])
      ),
    });
    const result2 = noRulesLinter.lint('entity test_name {}');

    expect(result2.diagnostics.length).toBeLessThanOrEqual(result1.diagnostics.length);
  });
});

// ═══════════════════════════════════════════════
// ConfigLoader
// ═══════════════════════════════════════════════
describe('ConfigLoader', () => {
  it('creates instance without error', () => {
    const loader = new ConfigLoader();
    expect(loader).toBeDefined();
  });

  it('loadConfig returns LinterConfig from real path', () => {
    const loader = new ConfigLoader();
    const cfg = loader.loadConfig(import.meta.url.replace('file:///', '').replace(/%3A/, ':'));
    expect(cfg).toBeDefined();
    expect(typeof cfg.maxErrors).toBe('number');
    expect(typeof cfg.typeChecking).toBe('boolean');
  });

  it('loadConfig returns config with rules object', () => {
    const loader = new ConfigLoader();
    const cfg = loader.loadConfig(import.meta.url.replace('file:///', '').replace(/%3A/, ':'));
    expect(typeof cfg.rules).toBe('object');
    expect(Array.isArray(cfg.ignorePatterns)).toBe(true);
  });
});
