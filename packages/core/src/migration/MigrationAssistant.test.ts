/**
 * Migration Assistant Tests
 *
 * Sprint 5 Priority 3: Migration Assistant
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  MigrationAssistant,
  createMigrationAssistant,
  analyzeMigrations,
  autoFixMigrations,
  type MigrationRule,
} from './MigrationAssistant';

describe('MigrationAssistant', () => {
  let assistant: MigrationAssistant;

  beforeEach(() => {
    assistant = createMigrationAssistant();
  });

  describe('Built-in Rules', () => {
    it('should have built-in migration rules', () => {
      const rules = assistant.getRules();
      expect(rules.length).toBeGreaterThan(0);
    });

    it('should include trait migration rules', () => {
      const rule = assistant.getRule('migrate-talkable-to-voice');
      expect(rule).toBeDefined();
      expect(rule?.autoFix).toBe(true);
    });

    it('should include property migration rules', () => {
      const rule = assistant.getRule('migrate-pos-to-position');
      expect(rule).toBeDefined();
      expect(rule?.replacement).toBe('position:');
    });

    it('should include function migration rules', () => {
      const rule = assistant.getRule('migrate-spawn-to-create');
      expect(rule).toBeDefined();
    });

    it('should include syntax migration rules', () => {
      const rule = assistant.getRule('migrate-var-to-let');
      expect(rule).toBeDefined();
      expect(rule?.severity).toBe('required');
    });
  });

  describe('analyze()', () => {
    it('should detect deprecated traits', () => {
      const source = `
        orb "Test" {
          @talkable
          @collidable
        }
      `;

      const result = assistant.analyze(source);
      expect(result.totalSuggestions).toBeGreaterThanOrEqual(2);

      const talkable = result.suggestions.find((s) => s.rule.id === 'migrate-talkable-to-voice');
      expect(talkable).toBeDefined();
      expect(talkable?.suggested).toBe('@voice');
    });

    it('should detect deprecated properties', () => {
      const source = `
        orb "Thing" {
          pos: [0, 0, 0]
          rot: [0, 90, 0]
          scl: [1, 1, 1]
        }
      `;

      const result = assistant.analyze(source);

      const pos = result.suggestions.find((s) => s.rule.id === 'migrate-pos-to-position');
      expect(pos).toBeDefined();
      expect(pos?.suggested).toBe('position:');
    });

    it('should detect deprecated functions', () => {
      const source = `
        @on_click {
          spawn("Object")
          destroy(this)
        }
      `;

      const result = assistant.analyze(source);

      const spawn = result.suggestions.find((s) => s.rule.id === 'migrate-spawn-to-create');
      expect(spawn).toBeDefined();
      expect(spawn?.suggested).toBe('create(');
    });

    it('should detect deprecated syntax', () => {
      const source = `
        var x = 1;
        object "Test" {
          color: "red"
        }
      `;

      const result = assistant.analyze(source);

      const varSuggestion = result.suggestions.find((s) => s.rule.id === 'migrate-var-to-let');
      expect(varSuggestion).toBeDefined();

      const objectSuggestion = result.suggestions.find(
        (s) => s.rule.id === 'migrate-object-to-orb'
      );
      expect(objectSuggestion).toBeDefined();
    });

    it('should include correct line numbers', () => {
      const source = `line 1
line 2
var x = 1;
line 4`;

      const result = assistant.analyze(source);
      const varSuggestion = result.suggestions.find((s) => s.rule.id === 'migrate-var-to-let');

      expect(varSuggestion?.line).toBe(3);
    });

    it('should categorize by severity', () => {
      const source = `
        var x = 1;
        @talkable
        let MAX_VALUE = 100;
      `;

      const result = assistant.analyze(source);

      expect(result.bySeverity.required.length).toBeGreaterThan(0);
    });

    it('should return empty for clean code', () => {
      const source = `
        orb "Clean" {
          @grabbable
          position: [0, 0, 0]
        }

        const x = 1;
        create("New")
      `;

      const result = assistant.analyze(source);
      expect(result.totalSuggestions).toBe(0);
    });
  });

  describe('applyAutoFixes()', () => {
    it('should apply auto-fixable migrations', () => {
      const source = `
        orb "Test" {
          @talkable
          pos: [0, 0, 0]
        }
      `;

      const result = assistant.applyAutoFixes(source);

      expect(result.changesApplied).toBeGreaterThan(0);
      expect(result.source).toContain('@voice');
      expect(result.source).toContain('position:');
      expect(result.source).not.toContain('@talkable');
      expect(result.source).not.toContain('pos:');
    });

    it('should apply var to let migration', () => {
      const source = 'var x = 1;';
      const result = assistant.applyAutoFixes(source);

      expect(result.source).toBe('let x = 1;');
      expect(result.changesApplied).toBe(1);
    });

    it('should apply object to orb migration', () => {
      const source = 'object "Test" { }';
      const result = assistant.applyAutoFixes(source);

      expect(result.source).toBe('orb "Test" { }');
    });

    it('should apply spawn to create migration', () => {
      const source = 'spawn("Object")';
      const result = assistant.applyAutoFixes(source);

      expect(result.source).toBe('create("Object")');
    });

    it('should apply destroy to remove migration', () => {
      const source = 'destroy(this)';
      const result = assistant.applyAutoFixes(source);

      expect(result.source).toBe('remove(this)');
    });

    it('should apply multiple migrations', () => {
      const source = `var x = 1;
pos: [0, 0, 0]
@talkable`;

      const result = assistant.applyAutoFixes(source);

      expect(result.source).toContain('let x = 1;');
      expect(result.source).toContain('position:');
      expect(result.source).toContain('@voice');
    });

    it('should only apply required migrations when option set', () => {
      const source = `
        var x = 1;
        let MAX_VALUE = 100;
      `;

      const result = assistant.applyAutoFixes(source, { onlyRequired: true });

      // var -> let is required, MAX_VALUE -> const is recommended
      expect(result.source).toContain('let x = 1;');
    });

    it('should track applied changes', () => {
      const source = '@talkable\npos: [0, 0, 0]';
      const result = assistant.applyAutoFixes(source);

      expect(result.applied.length).toBe(2);
      expect(result.applied[0].rule.id).toBeDefined();
      expect(result.applied[0].original).toBeDefined();
    });

    it('should not change code without deprecated patterns', () => {
      const source = `
        orb "Clean" {
          @grabbable
          position: [0, 0, 0]
        }
      `;

      const result = assistant.applyAutoFixes(source);

      expect(result.changesApplied).toBe(0);
      expect(result.source).toBe(source);
    });
  });

  describe('applyRules()', () => {
    it('should apply specific rules by ID', () => {
      const source = '@talkable\n@collidable';
      const result = assistant.applyRules(source, ['migrate-talkable-to-voice']);

      expect(result.source).toContain('@voice');
      expect(result.source).toContain('@collidable'); // Should not change
    });

    it('should apply multiple specific rules', () => {
      const source = '@talkable\npos: [0, 0, 0]';
      const result = assistant.applyRules(source, [
        'migrate-talkable-to-voice',
        'migrate-pos-to-position',
      ]);

      expect(result.source).toContain('@voice');
      expect(result.source).toContain('position:');
    });

    it('should ignore unknown rule IDs', () => {
      const source = '@talkable';
      const result = assistant.applyRules(source, ['nonexistent-rule']);

      expect(result.source).toBe(source);
      expect(result.changesApplied).toBe(0);
    });
  });

  describe('Custom Rules', () => {
    it('should register custom migration rules', () => {
      const customRule: MigrationRule = {
        id: 'custom-migration',
        name: 'Custom Migration',
        description: 'Test custom rule',
        pattern: /@legacy/g,
        replacement: '@modern',
        autoFix: true,
        severity: 'required',
      };

      assistant.registerRule(customRule);

      const rule = assistant.getRule('custom-migration');
      expect(rule).toBeDefined();
      expect(rule?.replacement).toBe('@modern');
    });

    it('should apply custom migration rules', () => {
      assistant.registerRule({
        id: 'custom-test',
        name: 'Custom Test',
        description: 'Test',
        pattern: /oldFunc\(/g,
        replacement: 'newFunc(',
        autoFix: true,
        severity: 'required',
      });

      const source = 'oldFunc(123)';
      const result = assistant.applyAutoFixes(source);

      expect(result.source).toBe('newFunc(123)');
    });

    it('should unregister rules', () => {
      assistant.registerRule({
        id: 'temp-rule',
        name: 'Temp',
        description: 'Temp',
        pattern: /temp/g,
        replacement: 'permanent',
        autoFix: true,
        severity: 'optional',
      });

      expect(assistant.getRule('temp-rule')).toBeDefined();

      const removed = assistant.unregisterRule('temp-rule');
      expect(removed).toBe(true);
      expect(assistant.getRule('temp-rule')).toBeUndefined();
    });
  });

  describe('generateReport()', () => {
    it('should generate a readable report', () => {
      const source = `
        var x = 1;
        @talkable
        pos: [0, 0, 0]
      `;

      const result = assistant.analyze(source, 'test.holo');
      const report = assistant.generateReport(result);

      expect(report).toContain('Migration Report for test.holo');
      expect(report).toContain('Total suggestions:');
      expect(report).toContain('Auto-fixable:');
    });

    it('should categorize report by severity', () => {
      const source = '@talkable';
      const result = assistant.analyze(source);
      const report = assistant.generateReport(result);

      expect(report).toContain('Required Migrations');
    });

    it('should report no migrations for clean code', () => {
      const source = '@grabbable';
      const result = assistant.analyze(source);
      const report = assistant.generateReport(result);

      expect(report).toContain('No migrations needed');
    });
  });

  describe('Helper Methods', () => {
    it('needsMigration() should return true for deprecated code', () => {
      const source = '@talkable';
      expect(assistant.needsMigration(source)).toBe(true);
    });

    it('needsMigration() should return false for clean code', () => {
      const source = '@grabbable';
      expect(assistant.needsMigration(source)).toBe(false);
    });

    it('getSummary() should return accurate counts', () => {
      const source = `
        var x = 1;
        @talkable
        @collidable
      `;

      const summary = assistant.getSummary(source);

      expect(summary.needsMigration).toBe(true);
      expect(summary.requiredCount).toBeGreaterThanOrEqual(3);
      expect(summary.autoFixableCount).toBeGreaterThanOrEqual(3);
    });
  });

  describe('Non-AutoFix Rules', () => {
    it('should not auto-apply non-autoFix rules', () => {
      const source = '@collision';
      const result = assistant.applyAutoFixes(source);

      // @collision -> @physics is not auto-fixable
      expect(result.source).toBe(source);
    });

    it('should still detect non-autoFix patterns in analysis', () => {
      const source = '@collision';
      const result = assistant.analyze(source);

      const collisionSuggestion = result.suggestions.find(
        (s) => s.rule.id === 'migrate-collision-to-physics'
      );
      expect(collisionSuggestion).toBeDefined();
      expect(collisionSuggestion?.canAutoFix).toBe(false);
    });
  });
});

describe('Factory Functions', () => {
  it('createMigrationAssistant() should create instance', () => {
    const assistant = createMigrationAssistant();
    expect(assistant).toBeInstanceOf(MigrationAssistant);
    expect(assistant.getRules().length).toBeGreaterThan(0);
  });

  it('createMigrationAssistant({ includeBuiltIn: false }) should create empty instance', () => {
    const assistant = createMigrationAssistant({ includeBuiltIn: false });
    expect(assistant.getRules().length).toBe(0);
  });

  it('analyzeMigrations() helper should work', () => {
    const result = analyzeMigrations('@talkable');
    expect(result.totalSuggestions).toBeGreaterThan(0);
  });

  it('autoFixMigrations() helper should work', () => {
    const result = autoFixMigrations('@talkable');
    expect(result.source).toBe('@voice');
  });
});

describe('Edge Cases', () => {
  let assistant: MigrationAssistant;

  beforeEach(() => {
    assistant = createMigrationAssistant();
  });

  it('should handle empty source', () => {
    const result = assistant.analyze('');
    expect(result.totalSuggestions).toBe(0);
  });

  it('should handle source with only whitespace', () => {
    const result = assistant.analyze('   \n\n   ');
    expect(result.totalSuggestions).toBe(0);
  });

  it('should handle multiple occurrences on same line', () => {
    const source = '@talkable @collidable @talkable';
    const result = assistant.analyze(source);

    const talkableCount = result.suggestions.filter(
      (s) => s.rule.id === 'migrate-talkable-to-voice'
    ).length;

    expect(talkableCount).toBeGreaterThanOrEqual(2);
  });

  it('should preserve indentation', () => {
    const source = '    @talkable';
    const result = assistant.applyAutoFixes(source);

    expect(result.source).toBe('    @voice');
  });

  it('should handle patterns in strings (limitation)', () => {
    // This is a known limitation - we don't parse the code
    const source = '"@talkable is deprecated"';
    const result = assistant.analyze(source);

    // Will still detect pattern in string
    expect(result.totalSuggestions).toBeGreaterThan(0);
  });
});
