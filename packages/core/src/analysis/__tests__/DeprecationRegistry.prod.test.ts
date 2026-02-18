/**
 * DeprecationRegistry + NoDeprecatedRule Production Tests
 *
 * Register/scan/parse annotations/format, lint rule check/report.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { DeprecationRegistry, NoDeprecatedRule, type DeprecationEntry } from '../DeprecationRegistry';

describe('DeprecationRegistry — Production', () => {
  let reg: DeprecationRegistry;

  beforeEach(() => {
    reg = new DeprecationRegistry();
  });

  describe('register / has / get / getAll / clear', () => {
    const entry: DeprecationEntry = { name: 'clickable', kind: 'trait', message: 'Use @interactive' };

    it('register and has', () => {
      reg.register(entry);
      expect(reg.has('clickable')).toBe(true);
    });

    it('get returns entry', () => {
      reg.register(entry);
      expect(reg.get('clickable')?.message).toBe('Use @interactive');
    });

    it('getAll', () => {
      reg.register(entry);
      expect(reg.getAll()).toHaveLength(1);
    });

    it('clear', () => {
      reg.register(entry);
      reg.clear();
      expect(reg.has('clickable')).toBe(false);
    });
  });

  describe('scanForUsages', () => {
    it('finds @symbol in source', () => {
      reg.register({ name: 'clickable', kind: 'trait', message: 'Deprecated' });
      const source = 'entity Player {\n  @clickable\n  @physics\n}';
      const warnings = reg.scanForUsages(source, 'test.holo');
      expect(warnings).toHaveLength(1);
      expect(warnings[0].line).toBe(2);
      expect(warnings[0].entry.name).toBe('clickable');
    });

    it('no warnings for clean source', () => {
      reg.register({ name: 'clickable', kind: 'trait', message: 'Deprecated' });
      expect(reg.scanForUsages('@physics\n@mesh', 'test.holo')).toHaveLength(0);
    });
  });

  describe('parseAnnotations', () => {
    it('parses @deprecated annotation', () => {
      const source = '@deprecated("Use @interactive instead")\ntrait clickable {}';
      const entries = DeprecationRegistry.parseAnnotations(source);
      expect(entries).toHaveLength(1);
      expect(entries[0].name).toBe('clickable');
      expect(entries[0].replacement).toBe('@interactive');
    });

    it('parses since/until', () => {
      const source = '@deprecated("Old", since: "2.0", until: "3.0")\ntrait oldThing {}';
      const entries = DeprecationRegistry.parseAnnotations(source);
      expect(entries[0].deprecatedIn).toBe('2.0');
      expect(entries[0].removedIn).toBe('3.0');
    });
  });

  describe('formatWarning', () => {
    it('formats with context', () => {
      reg.register({ name: 'clickable', kind: 'trait', message: 'Deprecated', replacement: '@interactive', deprecatedIn: '2.0', removedIn: '3.0' });
      const warnings = reg.scanForUsages('  @clickable', 'test.holo');
      const formatted = reg.formatWarning(warnings[0]);
      expect(formatted).toContain('[DEPRECATED]');
      expect(formatted).toContain('@interactive');
      expect(formatted).toContain('since 2.0');
    });
  });
});

describe('NoDeprecatedRule — Production', () => {
  let rule: NoDeprecatedRule;

  beforeEach(() => {
    rule = new NoDeprecatedRule();
  });

  describe('registerBuiltins', () => {
    it('registers built-in deprecated items', () => {
      rule.registerBuiltins();
      const files = new Map([['test.holo', '@clickable\n@talkable\n@collidable\n@legacyTemplate']]);
      const warnings = rule.check(files);
      expect(warnings.length).toBe(4);
    });
  });

  describe('check', () => {
    it('scans multiple files', () => {
      rule.registerBuiltins();
      const files = new Map([
        ['a.holo', '@clickable'],
        ['b.holo', '@talkable'],
      ]);
      const warnings = rule.check(files);
      expect(warnings).toHaveLength(2);
    });
  });

  describe('formatReport', () => {
    it('no warnings', () => {
      expect(rule.formatReport([])).toContain('No deprecation warnings');
    });

    it('with warnings', () => {
      rule.registerBuiltins();
      const warnings = rule.check(new Map([['t.holo', '@clickable']]));
      const report = rule.formatReport(warnings);
      expect(report).toContain('1 deprecation warning');
    });
  });
});
