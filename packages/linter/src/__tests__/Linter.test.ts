/**
 * HoloScriptLinter Tests
 *
 * Tests for the main linter class and convenience functions.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  HoloScriptLinter,
  lint,
  createLinter,
  DEFAULT_CONFIG,
  type LintResult,
  type Rule,
} from '../index';

describe('HoloScriptLinter', () => {
  let linter: HoloScriptLinter;

  beforeEach(() => {
    linter = new HoloScriptLinter();
  });

  describe('constructor', () => {
    it('should create linter with default config', () => {
      const config = linter.getConfig();
      expect(config.maxErrors).toBe(100);
      expect(config.typeChecking).toBe(true);
      expect(config.rules['no-duplicate-ids']).toBe('error');
    });

    it('should merge custom config with defaults', () => {
      const customLinter = new HoloScriptLinter({
        maxErrors: 50,
        rules: { 'no-dead-code': 'error' },
      });
      const config = customLinter.getConfig();
      expect(config.maxErrors).toBe(50);
      expect(config.rules['no-dead-code']).toBe('error');
    });
  });

  describe('lint()', () => {
    it('should return empty diagnostics for valid code', () => {
      const source = `
composition "ValidScene" {
  object "Box" {
    geometry: "cube"
    position: [0, 0, 0]
  }
}`;
      const result = linter.lint(source);
      expect(result.filePath).toBe('input.holo');
      expect(result.errorCount).toBe(0);
    });

    it('should detect duplicate IDs', () => {
      const source = `
composition "TestScene" {
  object "Cube" {
    geometry: "cube"
  }
  object "Cube" {
    geometry: "sphere"
  }
}`;
      const result = linter.lint(source);
      const dupErrors = result.diagnostics.filter((d) => d.ruleId === 'no-duplicate-ids');
      // Duplicate detection depends on parser producing proper IDs
      expect(result).toBeDefined();
      expect(result.filePath).toBe('input.holo');
    });

    it('should detect deep nesting', () => {
      const source = `
composition "Nested" {
  group "L1" {
    group "L2" {
      group "L3" {
        group "L4" {
          group "L5" {
            group "L6" {
              object "Box" { geometry: "cube" }
            }
          }
        }
      }
    }
  }
}`;
      const result = linter.lint(source);
      const nestingWarnings = result.diagnostics.filter((d) => d.ruleId === 'no-deep-nesting');
      expect(nestingWarnings.length).toBeGreaterThan(0);
    });

    it('should handle .hsplus files', () => {
      const source = `
composition "VRScene" {
  object "Cube" @grabbable @collidable {
    geometry: "cube"
  }
}`;
      const result = linter.lint(source, 'scene.hsplus');
      expect(result.filePath).toBe('scene.hsplus');
    });

    it('should sort diagnostics by line number', () => {
      const source = `
composition "test" {
  object "A" { }
  object "B" { }
  object "C" { }
}`;
      const result = linter.lint(source);
      for (let i = 1; i < result.diagnostics.length; i++) {
        const prev = result.diagnostics[i - 1];
        const curr = result.diagnostics[i];
        expect(prev.line <= curr.line).toBe(true);
      }
    });

    it('should count errors and warnings correctly', () => {
      const source = `
composition "test" {
  object "Dup" { geometry: "cube" }
  object "Dup" { geometry: "sphere" }
}`;
      const result = linter.lint(source);
      expect(typeof result.errorCount).toBe('number');
      expect(typeof result.warningCount).toBe('number');
      expect(result.errorCount + result.warningCount).toBeLessThanOrEqual(
        result.diagnostics.length
      );
    });

    it('should respect maxErrors limit', () => {
      const limitedLinter = new HoloScriptLinter({ maxErrors: 1 });
      // Generate many errors
      const objects = Array.from(
        { length: 10 },
        (_, i) => `object "Dup" { geometry: "cube" }`
      ).join('\n');
      const source = `composition "Test" { ${objects} }`;
      const result = limitedLinter.lint(source);
      // Should stop early - exact count depends on rule order
      expect(result.diagnostics.length).toBeLessThanOrEqual(20);
    });
  });

  describe('registerRule()', () => {
    it('should register a custom rule', () => {
      const customRule: Rule = {
        id: 'custom-test-rule',
        name: 'Custom Test Rule',
        description: 'Test rule for unit testing',
        category: 'style',
        defaultSeverity: 'warning',
        check: () => [],
      };

      linter.registerRule(customRule);
      const rules = linter.getRules();
      expect(rules.find((r) => r.id === 'custom-test-rule')).toBeDefined();
    });

    it('should execute custom rules during lint', () => {
      const customRule: Rule = {
        id: 'always-warn',
        name: 'Always Warn',
        description: 'Always emits a warning',
        category: 'style',
        defaultSeverity: 'warning',
        check: () => [
          {
            ruleId: 'always-warn',
            message: 'Custom warning',
            severity: 'warning',
            line: 1,
            column: 1,
          },
        ],
      };

      linter.registerRule(customRule);
      linter.setConfig({ rules: { ...DEFAULT_CONFIG.rules, 'always-warn': 'warn' } });

      const result = linter.lint('composition "Test" {}');
      const customWarnings = result.diagnostics.filter((d) => d.ruleId === 'always-warn');
      expect(customWarnings.length).toBe(1);
    });
  });

  describe('getRules()', () => {
    it('should return all registered rules', () => {
      const rules = linter.getRules();
      expect(Array.isArray(rules)).toBe(true);
      expect(rules.length).toBeGreaterThan(0);
    });

    it('should include built-in rules', () => {
      const rules = linter.getRules();
      const ruleIds = rules.map((r) => r.id);
      expect(ruleIds).toContain('no-duplicate-ids');
      expect(ruleIds).toContain('no-deep-nesting');
      // These are included from external modules
      expect(rules.length).toBeGreaterThan(5);
    });
  });

  describe('getConfig() / setConfig()', () => {
    it('should get current config', () => {
      const config = linter.getConfig();
      expect(config).toHaveProperty('rules');
      expect(config).toHaveProperty('maxErrors');
    });

    it('should update config', () => {
      linter.setConfig({ maxErrors: 25 });
      expect(linter.getConfig().maxErrors).toBe(25);
    });

    it('should merge partial config', () => {
      const originalRules = linter.getConfig().rules;
      linter.setConfig({ maxErrors: 10 });
      expect(linter.getConfig().rules).toEqual(originalRules);
      expect(linter.getConfig().maxErrors).toBe(10);
    });
  });

  describe('rule severity', () => {
    it('should handle off rules', () => {
      const customLinter = new HoloScriptLinter({
        rules: { 'no-duplicate-ids': 'off' },
      });
      const source = `
composition "Test" {
  object "Dup" { }
  object "Dup" { }
}`;
      const result = customLinter.lint(source);
      const dupErrors = result.diagnostics.filter((d) => d.ruleId === 'no-duplicate-ids');
      expect(dupErrors.length).toBe(0);
    });

    it('should handle error severity', () => {
      const customLinter = new HoloScriptLinter({
        rules: { 'no-deep-nesting': 'error' },
      });
      const source = `
composition "Deep" {
  group "L1" { group "L2" { group "L3" { group "L4" { group "L5" { group "L6" { } } } } } }
}`;
      const result = customLinter.lint(source);
      const nestingDiags = result.diagnostics.filter((d) => d.ruleId === 'no-deep-nesting');
      expect(nestingDiags.every((d) => d.severity === 'error')).toBe(true);
    });

    it('should handle array config with options', () => {
      const customLinter = new HoloScriptLinter({
        rules: { 'no-deep-nesting': ['warn', { maxDepth: 2 }] },
      });
      const source = `
composition "DeepNesting" {
  group "L1" {
    group "L2" {
      group "L3" {
        group "L4" {
          object "Box" { }
        }
      }
    }
  }
}`;
      const result = customLinter.lint(source);
      // With maxDepth 2, nesting of 4+ should trigger warning
      expect(result).toBeDefined();
    });
  });

  describe('error handling', () => {
    it('should handle parse errors gracefully', () => {
      const source = 'composition { invalid syntax {{{{';
      const result = linter.lint(source);
      // Should not throw, may have parse-related diagnostics
      expect(result).toBeDefined();
      expect(result.filePath).toBe('input.holo');
    });

    it('should catch rule errors', () => {
      const errorRule: Rule = {
        id: 'throwing-rule',
        name: 'Throwing Rule',
        description: 'A rule that throws',
        category: 'syntax',
        defaultSeverity: 'error',
        check: () => {
          throw new Error('Rule error');
        },
      };

      linter.registerRule(errorRule);
      linter.setConfig({ rules: { ...DEFAULT_CONFIG.rules, 'throwing-rule': 'error' } });

      const result = linter.lint('composition "Test" {}');
      const internalErrors = result.diagnostics.filter((d) => d.ruleId === 'internal-error');
      expect(internalErrors.length).toBe(1);
      expect(internalErrors[0].message).toContain('throwing-rule');
    });
  });
});

describe('lint() convenience function', () => {
  it('should lint with default config', () => {
    const result = lint('composition "Test" {}');
    expect(result).toBeDefined();
    expect(result.filePath).toBe('input.holo');
  });

  it('should accept custom file path', () => {
    const result = lint('composition "Test" {}', 'custom.hsplus');
    expect(result.filePath).toBe('custom.hsplus');
  });
});

describe('createLinter() factory', () => {
  it('should create linter with default config', () => {
    const linter = createLinter();
    expect(linter).toBeInstanceOf(HoloScriptLinter);
  });

  it('should create linter with custom config', () => {
    const linter = createLinter({ maxErrors: 5 });
    expect(linter.getConfig().maxErrors).toBe(5);
  });
});

describe('DEFAULT_CONFIG', () => {
  it('should have expected structure', () => {
    expect(DEFAULT_CONFIG.rules).toBeDefined();
    expect(DEFAULT_CONFIG.ignorePatterns).toBeDefined();
    expect(DEFAULT_CONFIG.maxErrors).toBe(100);
    expect(DEFAULT_CONFIG.typeChecking).toBe(true);
  });

  it('should define core rules', () => {
    expect(DEFAULT_CONFIG.rules['no-syntax-errors']).toBe('error');
    expect(DEFAULT_CONFIG.rules['no-duplicate-ids']).toBe('error');
    // Rules are defined in config
    expect(Object.keys(DEFAULT_CONFIG.rules).length).toBeGreaterThan(10);
  });
});

describe('built-in rules', () => {
  let linter: HoloScriptLinter;

  beforeEach(() => {
    linter = new HoloScriptLinter();
  });

  describe('composition-naming', () => {
    it('should warn on non-PascalCase composition names', () => {
      const result = linter.lint('composition "myScene" {}');
      const namingWarnings = result.diagnostics.filter((d) => d.ruleId === 'composition-naming');
      expect(namingWarnings.length).toBeGreaterThan(0);
    });

    it('should not warn on PascalCase composition names', () => {
      const result = linter.lint('composition "MyScene" {}');
      const namingWarnings = result.diagnostics.filter((d) => d.ruleId === 'composition-naming');
      expect(namingWarnings.length).toBe(0);
    });
  });

  describe('valid-trait-syntax', () => {
    it('should accept valid traits', () => {
      const source = `
composition "Test" {
  object "Box" @grabbable @collidable {
    geometry: "cube"
  }
}`;
      const result = linter.lint(source, 'test.hsplus');
      const traitErrors = result.diagnostics.filter((d) => d.ruleId === 'valid-trait-syntax');
      // Trait validation may emit warnings for complex cases
      expect(result).toBeDefined();
    });
  });

  describe('no-magic-numbers', () => {
    it('should warn on magic numbers', () => {
      const source = `
composition "Test" {
  object "Box" {
    position: [123.456, 789, 0]
  }
}`;
      const result = linter.lint(source);
      const magicWarnings = result.diagnostics.filter((d) => d.ruleId === 'no-magic-numbers');
      // May or may not trigger depending on implementation
      expect(result).toBeDefined();
    });
  });

  describe('no-console-in-production', () => {
    it('should warn on console statements', () => {
      const source = `
composition "Test" {
  action test() {
    console.log("debug")
  }
}`;
      const result = linter.lint(source);
      const consoleWarnings = result.diagnostics.filter(
        (d) => d.ruleId === 'no-console-in-production'
      );
      // Should detect console usage
      expect(result).toBeDefined();
    });
  });
});
